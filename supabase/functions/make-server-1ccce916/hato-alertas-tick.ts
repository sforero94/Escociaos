// hato-alertas-tick.ts — endpoint del motor de alertas del Hato Lechero
// (S6, plan §7.3): `POST /make-server-1ccce916/hato/alertas/tick`.
//
// Disparado a diario por el pg_cron de la migración 060 (05:45 Bogotá),
// aunque nada le impide llamarse a mano para pruebas -- el propio diseño es
// idempotente (`regla_clave UNIQUE` + `ON CONFLICT DO NOTHING`, plan §7.3
// "anti-spam... tick seguro de correr dos veces").
//
// Auth: header compartido `x-hato-tick-secret`, NO un JWT de usuario -- el
// llamador es un cron de Postgres, no una sesión humana (mismo patrón que
// 030/036 para clima, pero clima no envía nada saliente así que no necesita
// secreto; este endpoint sí dispara mensajes de Telegram, de ahí el secreto
// compartido, ver migración 060). El secreto vive en Supabase Vault y se
// inyecta como header en tiempo de disparo -- este handler solo lo compara
// contra `Deno.env.get('HATO_ALERTAS_TICK_SECRET')` (secreto de edge
// function, configurado por fuera de este código). Si esa variable de
// entorno está vacía o ausente, el endpoint responde 503 y NO HACE NADA --
// nunca corre "abierto" ni cae a ningún valor por defecto.
//
// Tres fases (plan §7.3), en este orden estricto -- cada una alimenta el
// estado que la siguiente necesita:
//   (a) Generar   -- motor puro `generarAlertasPendientes` (hatoAlertas.ts)
//                    sobre `v_hato_estado_actual` + pasos de tratamiento
//                    pendientes + `HatoConfig` (058/062, vía
//                    `construirHatoConfigDesdeFilas` -- explota si falta una
//                    clave, nunca un default inventado) + las `regla_clave`
//                    ya existentes (CUALQUIER estado, no solo activas: el
//                    UNIQUE de la tabla no distingue). INSERT vía
//                    `.upsert(..., { onConflict: 'regla_clave', ignoreDuplicates: true })`
//                    -- el `ON CONFLICT ... DO NOTHING` real, PostgREST no
//                    tiene otra forma de expresarlo.
//   (b) Despachar -- para cada alerta activa (`pendiente`/`enviada`) cuyo
//                    `tipo` está `activo` en `hato_alertas_config` Y tiene
//                    `destinatario_telegram_id` configurado: primer envío
//                    incondicional si `pendiente`; reenvío solo si
//                    `debeReenviar(...)` (≥48h desde el último intento,
//                    <3 intentos) si ya estaba `enviada`. Sin destinatario
//                    configurado -> se deja `pendiente`, CERO mensajes
//                    salientes -- este es el default "modo sombra" (el seed
//                    de 056 no trae ningún destinatario): desplegar este
//                    endpoint no dispara nada hasta que alguien configure
//                    `hato_alertas_config` a mano.
//   (c) Escalar/expirar -- `decidirAccionEscalamiento` sobre las alertas que
//                    siguen activas tras (b). Telegram no permite
//                    `editMessageText` pasadas 48h -- el escalamiento SIEMPRE
//                    manda un mensaje NUEVO (nunca edita el original).
//
// Nota de diseño (I/O, no cambia el motor puro): `hato_alertas` (migración
// 056) no tiene una columna dedicada para "cuándo se envió por primera vez"
// -- solo `created_at`/`updated_at` (que se pisan en cada UPDATE, incluidos
// los reenvíos) y `escalada_at` (dedicada a la transición de escalamiento,
// no a la de envío). Usar `updated_at` como proxy de "primer envío" para el
// umbral de escalamiento sería incorrecto: cada reenvío correría el reloj de
// escalamiento hacia adelante, retrasándolo exactamente cuando más urge (una
// alerta que ya se reenvió varias veces sin respuesta). En vez de agregar
// una columna nueva (fuera del alcance de esta sesión -- "no new migrations
// needed"), el instante del primer envío se guarda dentro de la columna
// `datos JSONB` ya existente (`datos.enviada_en`), que SÍ sobrevive
// intacta a los reenvíos porque este handler nunca la sobreescribe una vez
// puesta. `updated_at` sigue siendo la fuente correcta para "último intento"
// (resend policy), porque ese valor SÍ debe correrse con cada intento -- es
// exactamente lo que esa política mide.
//
// Recipiente de escalamiento: `hato_alertas_config` (migración 056) solo
// declara UN destinatario por tipo -- no hay una columna separada para "a
// quién escalar" (Martha) vs. "a quién se le manda primero" (Fernando,
// habilitado por tipo tras el segundo checkpoint de confianza del plan §8).
// Agregar esa columna sería un cambio de esquema fuera del alcance de esta
// sesión. Solución sin migración: variable de entorno opcional
// `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID` (secreto de edge function, mismo
// mecanismo que `HATO_ALERTAS_TICK_SECRET`). Si no está configurada, el
// contrato explícito del plan aplica ("si no hay destinatario configurado,
// solo se marca escalada"): se marca `escalada` sin enviar nada. Contar como
// hallazgo a validar con el dueño -- ver el reporte de la sesión.
//
// I/O puro en este archivo: parseo/auth, consultas a Supabase, llamadas a
// Telegram. Toda la lógica de negocio vive en el módulo puro `hatoAlertas.ts`
// -- copia GENERADA en este árbol por `docs/hato/regenerar-copias-hato-alertas.py`.

import { Context } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  generarAlertasPendientes,
  debeReenviar,
  decidirAccionEscalamiento,
  type AnimalHatoParaAlertas,
  type PasoTratamientoPendienteInput,
  type AlertaGenerada,
  type TipoAlertaHato,
  type EstadoAlertaHato,
} from './hato-alertas.ts';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from './hato-config-desde-tabla.ts';
import { enviarMensajeTelegram } from './telegram/enviar.ts';

function respuestaError(c: Context, status: 400 | 500 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth: secreto compartido, no JWT de usuario -- ver cabecera del archivo.
// ---------------------------------------------------------------------------
function verificarSecretoTick(c: Context): Response | null {
  const secretoConfigurado = Deno.env.get('HATO_ALERTAS_TICK_SECRET');
  if (!secretoConfigurado) {
    // Nunca correr "abierto": si el secreto no está configurado en este
    // entorno, el endpoint no hace nada, ni siquiera leer la BD.
    return respuestaError(
      c,
      503,
      'HATO_ALERTAS_TICK_SECRET no está configurado en este entorno -- el tick de alertas está deshabilitado hasta que se configure el secreto (ver migración 060).',
    );
  }
  const recibido = c.req.header('x-hato-tick-secret');
  if (!recibido || recibido !== secretoConfigurado) {
    return respuestaError(c, 401, 'Secreto de tick inválido o ausente.');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filas crudas de Supabase -- formas mínimas, solo lo que este handler usa.
// ---------------------------------------------------------------------------

interface FilaAlertaConfig {
  tipo: TipoAlertaHato;
  destinatario_telegram_id: string | null;
  horas_escalamiento: number;
  activo: boolean;
}

interface FilaAlertaActiva {
  id: string;
  tipo: TipoAlertaHato;
  animal_id: string | null;
  regla_clave: string;
  fecha_programada: string;
  estado: EstadoAlertaHato;
  intentos: number;
  destinatario_telegram_id: string | null;
  datos: Record<string, unknown> | null;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export async function handleHatoAlertasTick(c: Context): Promise<Response> {
  const authError = verificarSecretoTick(c);
  if (authError) return authError;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const ahora = new Date();
  const fechaHoraReferencia = ahora.toISOString();
  const fechaReferencia = fechaHoraReferencia.slice(0, 10);

  // --- hato_config -- explota si falta una clave (058/062), nunca un
  //     default inventado en este handler. -----------------------------
  const { data: filasConfig, error: errorConfig } = await supabase.from('hato_config').select('clave, valor');
  if (errorConfig) {
    return respuestaError(c, 500, `No se pudo leer hato_config: ${errorConfig.message}`);
  }
  let hatoConfig;
  try {
    hatoConfig = construirHatoConfigDesdeFilas((filasConfig ?? []) as FilaHatoConfig[]);
  } catch (err) {
    return respuestaError(c, 500, err instanceof Error ? err.message : String(err));
  }

  // --- hato_alertas_config -- destinatario/activo/horas por tipo ------
  const { data: filasAlertasConfig, error: errorAlertasConfig } = await supabase
    .from('hato_alertas_config')
    .select('tipo, destinatario_telegram_id, horas_escalamiento, activo');
  if (errorAlertasConfig) {
    return respuestaError(c, 500, `No se pudo leer hato_alertas_config: ${errorAlertasConfig.message}`);
  }
  const configPorTipo = new Map<TipoAlertaHato, FilaAlertaConfig>(
    ((filasAlertasConfig ?? []) as FilaAlertaConfig[]).map((f) => [f.tipo, f]),
  );

  // =========================================================================
  // (a) GENERAR
  // =========================================================================

  const { data: filasEstado, error: errorEstado } = await supabase
    .from('v_hato_estado_actual')
    .select(
      'animal_id, numero, nombre, etapa, raza, estado, num_partos, ultimo_chequeo_fecha, ultimo_servicio_fecha, ultimo_parto_fecha, ultimo_secado_real_fecha, ultima_confirmacion_prenez_fecha, ultimo_evento_fecha, ultimo_estado_chequeo',
    );
  if (errorEstado) {
    return respuestaError(c, 500, `No se pudo leer v_hato_estado_actual: ${errorEstado.message}`);
  }
  const animales = (filasEstado ?? []) as AnimalHatoParaAlertas[];

  const { data: filasPasos, error: errorPasos } = await supabase
    .from('hato_tratamiento_pasos')
    .select('id, fecha_programada, descripcion, hato_tratamientos(animal_id, hato_animales(numero, nombre))')
    .is('fecha_ejecutada', null);
  if (errorPasos) {
    return respuestaError(c, 500, `No se pudo leer hato_tratamiento_pasos: ${errorPasos.message}`);
  }
  const pasosPendientes: PasoTratamientoPendienteInput[] = ((filasPasos ?? []) as Array<Record<string, unknown>>)
    .map((fila) => {
      const tratamiento = fila.hato_tratamientos as
        | { animal_id: string; hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null }
        | { animal_id: string; hato_animales: { numero: number | null; nombre: string | null } | { numero: number | null; nombre: string | null }[] | null }[]
        | null;
      const t = Array.isArray(tratamiento) ? tratamiento[0] : tratamiento;
      const animalEmbebido = t?.hato_animales;
      const animal = Array.isArray(animalEmbebido) ? animalEmbebido[0] : animalEmbebido;
      if (!t) return null;
      return {
        paso_id: fila.id as string,
        animal_id: t.animal_id,
        numero: animal?.numero ?? null,
        nombre: animal?.nombre ?? null,
        fecha_programada: fila.fecha_programada as string,
        descripcion: (fila.descripcion as string | null) ?? null,
      };
    })
    .filter((p): p is PasoTratamientoPendienteInput => p !== null);

  const { data: filasReglas, error: errorReglas } = await supabase.from('hato_alertas').select('regla_clave');
  if (errorReglas) {
    return respuestaError(c, 500, `No se pudo leer hato_alertas: ${errorReglas.message}`);
  }
  const reglasExistentes = new Set<string>((filasReglas ?? []).map((f: { regla_clave: string }) => f.regla_clave));

  const alertasNuevas: AlertaGenerada[] = generarAlertasPendientes(
    animales,
    pasosPendientes,
    hatoConfig,
    reglasExistentes,
    fechaReferencia,
  );

  if (alertasNuevas.length > 0) {
    const filasInsertar = alertasNuevas.map((a) => ({
      tipo: a.tipo,
      animal_id: a.animal_id,
      regla_clave: a.regla_clave,
      fecha_programada: a.fecha_programada,
      // paso_id es una columna real (FK) además de vivir en datos.paso_id --
      // el motor de tratamiento_paso lo necesita como columna propia para que
      // el resto del sistema (ej. marcar el paso ejecutado desde el callback
      // 'si') pueda hacer JOIN sin parsear el jsonb.
      paso_id: a.tipo === 'tratamiento_paso' ? (a.datos.paso_id as string) : null,
      // El mensaje no tiene columna dedicada en hato_alertas (056) -- vive en
      // datos, igual que enviada_en (ver cabecera del archivo).
      datos: { ...a.datos, mensaje: a.mensaje },
    }));
    const { error: errorInsert } = await supabase
      .from('hato_alertas')
      .upsert(filasInsertar, { onConflict: 'regla_clave', ignoreDuplicates: true });
    if (errorInsert) {
      return respuestaError(c, 500, `No se pudieron insertar las alertas generadas: ${errorInsert.message}`);
    }
  }

  // =========================================================================
  // (b) DESPACHAR
  // =========================================================================

  const { data: filasActivas, error: errorActivas } = await supabase
    .from('hato_alertas')
    .select('id, tipo, animal_id, regla_clave, fecha_programada, estado, intentos, destinatario_telegram_id, datos, updated_at')
    .in('estado', ['pendiente', 'enviada']);
  if (errorActivas) {
    return respuestaError(c, 500, `No se pudieron leer las alertas activas: ${errorActivas.message}`);
  }
  const activas = (filasActivas ?? []) as FilaAlertaActiva[];

  let enviadas = 0;
  let saltadasSinDestinatario = 0;

  for (const alerta of activas) {
    const config = configPorTipo.get(alerta.tipo);
    if (!config || !config.activo || !config.destinatario_telegram_id) {
      saltadasSinDestinatario += 1;
      continue;
    }

    const debeEnviar =
      alerta.estado === 'pendiente' ||
      debeReenviar(
        { estado: alerta.estado, intentos: alerta.intentos, ultimo_intento_en: alerta.updated_at },
        fechaHoraReferencia,
      );
    if (!debeEnviar) continue;

    const mensaje = (alerta.datos?.mensaje as string | undefined) ?? 'Alerta del hato lechero (sin mensaje generado).';
    const resultado = await enviarMensajeTelegram(supabase, {
      telegramId: config.destinatario_telegram_id,
      texto: mensaje,
      tipoMensaje: 'alerta_hato',
      flujo: alerta.tipo,
      botones: [
        { texto: 'Sí', callbackData: `hato_alerta:${alerta.id}:si` },
        { texto: 'Todavía no', callbackData: `hato_alerta:${alerta.id}:no` },
        { texto: 'Otra cosa', callbackData: `hato_alerta:${alerta.id}:otro` },
      ],
    });

    const datosActualizados = resultado.ok && !alerta.datos?.enviada_en
      ? { ...alerta.datos, enviada_en: fechaHoraReferencia }
      : alerta.datos;

    const { error: errorUpdate } = await supabase
      .from('hato_alertas')
      .update({
        estado: resultado.ok ? 'enviada' : alerta.estado,
        intentos: alerta.intentos + 1,
        destinatario_telegram_id: config.destinatario_telegram_id,
        datos: datosActualizados,
      })
      .eq('id', alerta.id);
    if (errorUpdate) {
      console.error(`[hato-alertas-tick] no se pudo actualizar la alerta ${alerta.id} tras el envío:`, errorUpdate.message);
      continue;
    }

    // Reflejar el cambio en memoria para que la fase (c) vea el estado
    // post-despacho sin una segunda consulta a la base.
    alerta.estado = resultado.ok ? 'enviada' : alerta.estado;
    alerta.intentos += 1;
    alerta.datos = datosActualizados;
    alerta.updated_at = fechaHoraReferencia;

    if (resultado.ok) enviadas += 1;
  }

  // =========================================================================
  // (c) ESCALAR / EXPIRAR
  // =========================================================================

  const telegramIdEscalamiento = Deno.env.get('HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID') || null;

  let escaladas = 0;
  let expiradas = 0;

  for (const alerta of activas) {
    const config = configPorTipo.get(alerta.tipo);
    const horasEscalamiento = config?.horas_escalamiento ?? 48;
    // Instante del primer envío exitoso, guardado en `datos.enviada_en` en la
    // fase (b) (nunca sobreescrito por un reenvío -- ver cabecera del
    // archivo). El fallback a `fecha_programada` es solo para filas
    // `enviada` que hayan quedado de ANTES de que este handler empezara a
    // escribir `enviada_en` (no debería ocurrir en filas nuevas, ya que se
    // fija en el mismo tick del primer envío exitoso) -- nunca se usa para
    // una `pendiente` (decidirAccionEscalamiento ignora este valor salvo
    // cuando `estado === 'enviada'`).
    const anchorEnvio = (alerta.datos?.enviada_en as string | undefined) ?? alerta.fecha_programada;
    const accion = decidirAccionEscalamiento(
      { estado: alerta.estado, fecha_programada: alerta.fecha_programada },
      anchorEnvio,
      horasEscalamiento,
      fechaHoraReferencia,
    );
    if (accion === 'ninguna') continue;

    if (accion === 'expirar') {
      const { error } = await supabase.from('hato_alertas').update({ estado: 'expirada' }).eq('id', alerta.id);
      if (!error) expiradas += 1;
      else console.error(`[hato-alertas-tick] no se pudo expirar la alerta ${alerta.id}:`, error.message);
      continue;
    }

    // accion === 'escalar' -- Telegram no permite editar un mensaje pasadas
    // 48h: se manda uno NUEVO, nunca se edita el original.
    if (telegramIdEscalamiento) {
      const mensajeBase = (alerta.datos?.mensaje as string | undefined) ?? 'Alerta del hato lechero (sin mensaje generado).';
      await enviarMensajeTelegram(supabase, {
        telegramId: telegramIdEscalamiento,
        texto: `⏰ Sin respuesta hace más de ${horasEscalamiento}h -- ${mensajeBase}`,
        tipoMensaje: 'alerta_hato_escalamiento',
        flujo: alerta.tipo,
      });
    }
    const { error } = await supabase
      .from('hato_alertas')
      .update({ estado: 'escalada', escalada_at: fechaHoraReferencia })
      .eq('id', alerta.id);
    if (!error) escaladas += 1;
    else console.error(`[hato-alertas-tick] no se pudo escalar la alerta ${alerta.id}:`, error.message);
  }

  return c.json({
    success: true,
    fechaReferencia,
    generadas: alertasNuevas.length,
    enviadas,
    saltadas_sin_destinatario: saltadasSinDestinatario,
    escaladas,
    expiradas,
  });
}
