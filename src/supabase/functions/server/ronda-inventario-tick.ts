// ronda-inventario-tick.ts — Fase 5 (recordatorio, alerta del día 15,
// reporte de cierre) de docs/brief_tecnico_verificacion_inventario.md
// §8/§13: `POST /make-server-1ccce916/inventario/ronda/tick`.
//
// Calcado de `hato-alertas-tick.ts` (secreto compartido + tres/cuatro
// trabajos independientes con su propia idempotencia) y de `acciones-tick.ts`
// (doble puerta de auth: secreto para el cron, JWT+Gerencia para un disparo
// manual) -- literal del §8.1 del brief técnico: "Segunda puerta: JWT +
// Gerencia, para corridas manuales (precedente /acciones/tick)".
//
// CUATRO trabajos, en una sola corrida diaria, cada uno con su propia clave
// idempotente en `rondas_avisos` (migración 125) -- ver §8.1:
//   1. Recordatorio (A-1/A-4/CA-3) -- a Uriel.
//   2+3. El mensaje del día 15 (R-11/CA-23/CA-24 + P-2, §8.4) -- a Santiago.
//        Dos condiciones INDEPENDIENTES (mes omitido / excepciones vencidas),
//        cada una con su propia clave, compuestas en UN mensaje cuando las
//        dos aplican en la misma corrida -- §8.1, literal: "el bloque de
//        excepciones vencidas NO cuelga del de mes omitido".
//   4. Reporte de cierre (C-1/CA-19) -- a Santiago. Único por ronda (la PK
//      de `rondas_reportes` es la idempotencia de CONTENIDO, R-10); la
//      CONFIRMACIÓN DE ENVÍO usa una clave propia en `rondas_avisos`
//      (`reporte_cierre:<ronda_id>`), reclamada DESPUÉS de un envío exitoso
//      -- ver la nota de diseño en `procesarReporteCierreDeUnaRonda` más
//      abajo, es una desviación deliberada del orden "reclamar antes de
//      enviar" que sí siguen los otros tres trabajos.
//
// Auth: header `x-inventario-tick-secret` comparado contra
// `Deno.env.get('INVENTARIO_TICK_SECRET')`. Sin la variable -> 503, nunca
// corre "abierto" -- mismo contrato que HATO_ALERTAS_TICK_SECRET/
// ACCIONES_TICK_SECRET/CLIMA_SYNC_SECRET/TELEGRAM_WEBHOOK_SECRET (CLAUDE.md).
//
// I/O puro en este archivo: parseo/auth, consultas a Supabase, llamadas a
// Telegram. La lógica de negocio (claves, condiciones de envío, la
// clasificación de movimientos, el cálculo de valoración, el texto del
// mensaje del día 15) vive en el módulo puro `rondaInventario/tick.ts` --
// copia GENERADA en este árbol por
// `docs/inventario/regenerar-copias-ronda-inventario.py`.

import { Context } from 'npm:hono';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  ESTADOS_TERMINALES,
  fechaBogotaDe,
  hoyBogota,
  nombrePeriodoRonda,
  primerDiaMesBogota,
  resolverNombreActor,
  obtenerAlcanceRonda,
  type EstadoExcepcionInventario,
} from './telegram/ronda-helpers.ts';
import { enviarMensajeTelegram } from './telegram/enviar.ts';
import { buscarCausaRaiz } from './rondaInventario/causasRaiz.ts';
import {
  construirReporteCierre,
  renderReporteCierreTelegram,
  type InputReporteCierre,
  type ExcepcionReporteCierre,
  type MovimientoReporteCierre,
  type EstadoExcepcionRonda,
} from './rondaInventario/reporteCierre.ts';
import type { ViaExcepcion } from './rondaInventario/causasRaiz.ts';
import {
  DIAS_UMBRAL_EXCEPCION_VENCIDA,
  claveRecordatorioBase,
  clasificarMovimientoRondaAbierta,
  calcularValorInventario,
  construirMensajeRecordatorio,
  construirMensajeRevisionDia15,
  decidirExcepcionesVencidas,
  decidirMesOmitido,
  decidirRecordatorio,
  etiquetaEstadoPendienteExcepcion,
  type ExcepcionVencidaResumen,
  type ProductoParaValoracion,
} from './rondaInventario/tick.ts';

const ROLES_DISPARO_MANUAL = new Set(['Gerencia']);

function respuestaError(c: Context, status: 401 | 403 | 500 | 503, error: string) {
  return c.json({ success: false, error }, status);
}

// ---------------------------------------------------------------------------
// Auth -- DOBLE PUERTA, calcada de `acciones-tick.ts` (ver cabecera).
// ---------------------------------------------------------------------------

async function verificarAuth(
  c: Context,
  supabase: SupabaseClient,
): Promise<{ disparo: 'cron' | 'manual' } | Response> {
  const secretoConfigurado = Deno.env.get('INVENTARIO_TICK_SECRET');
  const secretoRecibido = c.req.header('x-inventario-tick-secret');
  if (secretoConfigurado && secretoRecibido && secretoRecibido === secretoConfigurado) {
    return { disparo: 'cron' };
  }

  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return respuestaError(c, 401, 'Token inválido o expirado.');
    }
    const { data: usuario, error: usuarioError } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (usuarioError) {
      return respuestaError(c, 500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
    }
    if (!usuario || !ROLES_DISPARO_MANUAL.has(usuario.rol as string)) {
      return respuestaError(c, 403, 'El disparo manual está restringido a Gerencia.');
    }
    return { disparo: 'manual' };
  }

  if (!secretoConfigurado) {
    return respuestaError(
      c,
      503,
      'INVENTARIO_TICK_SECRET no está configurado en este entorno -- el tick de la ronda de inventario está deshabilitado hasta que se configure el secreto (ver migración 127), y no llegó ningún JWT de Gerencia como alternativa.',
    );
  }
  return respuestaError(c, 401, 'Secreto de tick inválido/ausente y no hay JWT de Gerencia -- ninguna de las dos puertas de auth se cumplió.');
}

// ---------------------------------------------------------------------------
// Destinatarios -- `alertas_catalogo` + `telegram_alertas_suscripciones`
// (migración 096), UNA clave a la vez (a diferencia de `hato-alertas-tick.ts`,
// que agrupa muchas claves de una sola consulta porque despacha decenas de
// alertas por corrida -- acá son tres claves fijas, tres consultas chicas es
// más simple que reimplementar el agrupamiento genérico de `hato-alertas.ts`
// para un caso que no lo necesita). Sólo suscritos ACTIVOS reciben, mismo
// criterio que el hato.
//
// `moduloExigido`, cuando se pasa, es la DOBLE CONDICIÓN de §3.4 del brief
// técnico para los mensajes con cifras de valoración: estar suscrito NO
// alcanza, además hace falta el módulo `inventario_aprobacion` en
// `modulos_permitidos` -- así una casilla mal marcada en la pantalla de
// configuración de Telegram no puede mandarle el valor del inventario a
// alguien sin ese módulo (hoy sólo aplica a `inventario.reporte_cierre`).
// ---------------------------------------------------------------------------

interface FilaSuscripcionCruda {
  recibe: boolean;
  telegram_usuarios: { telegram_id: number; modulos_permitidos: string[] | null } | { telegram_id: number; modulos_permitidos: string[] | null }[] | null;
}

async function resolverDestinatarios(sb: SupabaseClient, claveAlerta: string, moduloExigido?: string): Promise<string[]> {
  const { data, error } = await sb
    .from('telegram_alertas_suscripciones')
    .select('recibe, telegram_usuarios!inner(telegram_id, modulos_permitidos, activo)')
    .eq('alerta_clave', claveAlerta)
    .eq('recibe', true)
    .eq('telegram_usuarios.activo', true);
  if (error) {
    console.error(`[ronda-tick] no se pudieron leer las suscripciones de "${claveAlerta}": ${error.message}`);
    return [];
  }
  const destinatarios: string[] = [];
  for (const fila of (data ?? []) as FilaSuscripcionCruda[]) {
    const usuario = Array.isArray(fila.telegram_usuarios) ? fila.telegram_usuarios[0] : fila.telegram_usuarios;
    if (!usuario) continue;
    // Un suscrito ACTIVO pero todavia SIN VINCULAR tiene `telegram_id` en NULL:
    // `String(null)` es la cadena "null", que se cuela como destinatario
    // fantasma. Eso derrota el guardia `destinatarios.length === 0` de los tres
    // trabajos que reclaman su clave en `rondas_avisos` ANTES de enviar, asi
    // que el aviso queda marcado como enviado y no se reintenta nunca. Mismo
    // criterio que `obtenerDestinatariosModuloRonda` en telegram/ronda-helpers.ts,
    // que ya filtra con `.not('telegram_id', 'is', null)`.
    if (usuario.telegram_id === null || usuario.telegram_id === undefined) continue;
    if (moduloExigido && !(usuario.modulos_permitidos ?? []).includes(moduloExigido)) continue;
    destinatarios.push(String(usuario.telegram_id));
  }
  return destinatarios;
}

/** Envía el mismo texto a varios destinatarios, sin que un fallo puntual
 * (chat bloqueado, etc.) tumbe el resto -- mismo criterio que
 * `hato-alertas-tick.ts`. Devuelve `true` si AL MENOS un envío tuvo éxito. */
async function enviarATodos(
  sb: SupabaseClient,
  destinatarios: readonly string[],
  texto: string,
  tipoMensaje: string,
  botones?: Array<{ texto: string; callbackData: string }>,
): Promise<boolean> {
  let algunoOk = false;
  for (const telegramId of destinatarios) {
    const resultado = await enviarMensajeTelegram(sb, { telegramId, texto, tipoMensaje, flujo: 'ronda_inventario', botones });
    if (resultado.ok) algunoOk = true;
    else console.error(`[ronda-tick] fallo al enviar "${tipoMensaje}" a ${telegramId}: ${resultado.error}`);
  }
  return algunoOk;
}

/** Telegram rechaza un `sendMessage` de más de 4096 caracteres (la Bot API
 * responde error, `enviarMensajeTelegram` lo captura como `{ok:false}` sin
 * lanzar). El reporte de cierre puede crecer con la ronda -- se recorta SÓLO
 * lo que se manda por Telegram; `rondas_reportes.texto_telegram`/`contenido`
 * (R-10) guardan el reporte COMPLETO sin tocar, siempre. Riesgo conocido, no
 * resuelto acá: sin una pantalla de historial (Fase 6, todavía sin
 * construir) un reporte recortado no tiene dónde consultarse completo hoy
 * mismo -- ver el resumen de esta sesión. */
const LIMITE_TELEGRAM_TEXTO = 4096;
const AVISO_RECORTE = '\n\n… (reporte recortado por longitud -- el contenido completo quedó guardado en el sistema)';

function truncarParaTelegram(texto: string): string {
  if (texto.length <= LIMITE_TELEGRAM_TEXTO) return texto;
  return texto.slice(0, LIMITE_TELEGRAM_TEXTO - AVISO_RECORTE.length) + AVISO_RECORTE;
}

/** `INSERT` puro sobre `rondas_avisos` -- `true` si la fila se insertó DE
 * VERDAD en esta llamada (código `23505` = ya existía, de una corrida
 * anterior o de una carrera con otra corrida concurrente). Este es el
 * "verificando si se insertó de verdad antes de mandar el mensaje" que pide
 * §8.1 -- el I/O SIEMPRE llama esto antes de un envío de los tres primeros
 * trabajos (recordatorio, mes omitido, excepciones vencidas); el cuarto
 * (reporte de cierre) usa el orden inverso a propósito, ver su función. */
async function reclamarAviso(sb: SupabaseClient, clave: string, rondaId: string | null, detalle: unknown = null): Promise<boolean> {
  const { error } = await sb.from('rondas_avisos').insert({ clave, ronda_id: rondaId, detalle });
  if (!error) return true;
  if (error.code !== '23505') {
    console.error(`[ronda-tick] no se pudo reclamar el aviso "${clave}": ${error.message}`);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Trabajo 1 -- Recordatorio (A-1/A-4/CA-3, §8.1)
// ---------------------------------------------------------------------------

async function procesarRecordatorio(sb: SupabaseClient, hoy: string, periodo: string): Promise<Record<string, unknown>> {
  const { data: rondaCerrada } = await sb
    .from('rondas_inventario')
    .select('id')
    .eq('periodo', periodo)
    .eq('estado', 'cerrada')
    .maybeSingle();

  const claveBase = claveRecordatorioBase(periodo);
  const { data: avisoBase } = await sb.from('rondas_avisos').select('detalle').eq('clave', claveBase).maybeSingle();
  const posponerHasta = ((avisoBase?.detalle as { posponer_hasta?: string } | null)?.posponer_hasta as string | undefined) ?? null;

  const decision = decidirRecordatorio({ hoy, periodo, rondaCerradaDelPeriodo: !!rondaCerrada, posponerHasta });
  if (!decision.enviar) return { enviado: false, motivo: 'condicion_no_cumplida' };

  const reclamado = await reclamarAviso(sb, decision.clave, null, null);
  if (!reclamado) return { enviado: false, motivo: 'ya_enviado', clave: decision.clave };

  const destinatarios = await resolverDestinatarios(sb, 'inventario.ronda_recordatorio');
  if (destinatarios.length === 0) {
    // La clave YA quedó reclamada -- riesgo declarado (§8.1 pide reclamar
    // antes de enviar): si nadie está suscrito hoy, este recordatorio en
    // particular se pierde y no se reintenta. Es el mismo trade-off que el
    // resto de este archivo documenta para los tres trabajos "reclamar
    // antes de enviar".
    return { enviado: false, motivo: 'sin_destinatarios', clave: decision.clave };
  }

  const texto = construirMensajeRecordatorio(nombrePeriodoRonda(periodo));
  const botones = [
    { texto: 'Empezar', callbackData: 'ronda_recordatorio_empezar' },
    { texto: 'Posponer', callbackData: 'ronda_recordatorio_posponer' },
  ];
  const algunoOk = await enviarATodos(sb, destinatarios, texto, 'ronda_recordatorio', botones);
  return { enviado: algunoOk, clave: decision.clave, destinatarios: destinatarios.length };
}

// ---------------------------------------------------------------------------
// Trabajos 2+3 -- El mensaje del día 15 (R-11/CA-23/CA-24 + P-2, §8.4)
// ---------------------------------------------------------------------------

async function obtenerExcepcionesVencidas(sb: SupabaseClient, ahoraIso: string, diasUmbral: number): Promise<ExcepcionVencidaResumen[]> {
  const limite = new Date(ahoraIso);
  limite.setUTCDate(limite.getUTCDate() - diasUmbral);

  const { data, error } = await sb
    .from('rondas_excepciones')
    .select('estado, reportada_en, producto:productos(nombre)')
    .lt('reportada_en', limite.toISOString())
    .order('reportada_en', { ascending: true });
  if (error) {
    console.error(`[ronda-tick] no se pudieron leer las excepciones vencidas: ${error.message}`);
    return [];
  }

  const ahoraMs = Date.parse(ahoraIso);
  const resultado: ExcepcionVencidaResumen[] = [];
  for (const fila of (data ?? []) as Array<{ estado: EstadoExcepcionInventario; reportada_en: string; producto: { nombre: string } | { nombre: string }[] | null }>) {
    // Filtrado en TypeScript, no en SQL -- evita componer a mano un
    // `NOT IN (...)` de PostgREST (sin precedente en el repo) sobre una
    // tabla que en la práctica tiene decenas de filas, nunca miles.
    if (ESTADOS_TERMINALES.includes(fila.estado)) continue;
    const producto = Array.isArray(fila.producto) ? fila.producto[0] : fila.producto;
    const dias = Math.floor((ahoraMs - Date.parse(fila.reportada_en)) / 86_400_000);
    resultado.push({
      productoNombre: producto?.nombre ?? '(producto)',
      reportadaEn: fechaBogotaDe(fila.reportada_en),
      estadoEtiqueta: etiquetaEstadoPendienteExcepcion(fila.estado),
      dias,
    });
  }
  return resultado;
}

async function obtenerNombreUltimaRondaCerrada(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb
    .from('rondas_inventario')
    .select('periodo')
    .eq('estado', 'cerrada')
    .order('periodo', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? nombrePeriodoRonda(data.periodo as string) : null;
}

async function procesarRevisionDia15(sb: SupabaseClient, hoy: string, periodo: string): Promise<Record<string, unknown>> {
  const { data: rondaCerrada } = await sb
    .from('rondas_inventario')
    .select('id')
    .eq('periodo', periodo)
    .eq('estado', 'cerrada')
    .maybeSingle();

  const excepcionesVencidas = await obtenerExcepcionesVencidas(sb, new Date().toISOString(), DIAS_UMBRAL_EXCEPCION_VENCIDA);

  const decisionMesOmitido = decidirMesOmitido({ hoy, periodo, rondaCerradaDelPeriodo: !!rondaCerrada });
  const decisionExcepciones = decidirExcepcionesVencidas({ hoy, periodo, hayExcepcionesVencidas: excepcionesVencidas.length > 0 });

  if (!decisionMesOmitido.enviar && !decisionExcepciones.enviar) {
    return { enviado: false, motivo: 'condicion_no_cumplida' };
  }

  // Cada bloque reclama SU clave por separado -- §8.1: "el bloque de
  // excepciones vencidas NO cuelga del de mes omitido". Un bloque cuya clave
  // ya se reclamó un día anterior NO entra al mensaje de hoy, aunque el otro
  // sí se envíe.
  const incluirMesOmitido = decisionMesOmitido.enviar && (await reclamarAviso(sb, decisionMesOmitido.clave, null, null));
  const incluirExcepciones =
    decisionExcepciones.enviar &&
    (await reclamarAviso(
      sb,
      decisionExcepciones.clave,
      null,
      { excepciones_reportadas_en: excepcionesVencidas.map((e) => e.reportadaEn) },
    ));

  if (!incluirMesOmitido && !incluirExcepciones) {
    return { enviado: false, motivo: 'ambas_claves_ya_reclamadas' };
  }

  const texto = construirMensajeRevisionDia15({
    bloqueMesOmitido: incluirMesOmitido
      ? { mesActualNombre: nombrePeriodoRonda(periodo), ultimaRondaCerradaNombre: await obtenerNombreUltimaRondaCerrada(sb) }
      : null,
    excepcionesVencidas: incluirExcepciones ? excepcionesVencidas : [],
  });
  if (!texto) {
    // No debería poder pasar (una de las dos claves se reclamó de verdad),
    // pero `construirMensajeRevisionDia15` es la única autoridad sobre "hay
    // algo que decir" -- si dice que no, no se manda nada.
    return { enviado: false, motivo: 'mensaje_vacio' };
  }

  const destinatarios = await resolverDestinatarios(sb, 'inventario.revision_dia_15');
  if (destinatarios.length === 0) {
    return { enviado: false, motivo: 'sin_destinatarios', bloque_mes_omitido: incluirMesOmitido, bloque_excepciones: incluirExcepciones };
  }

  const algunoOk = await enviarATodos(sb, destinatarios, texto, 'ronda_revision_dia_15');
  return {
    enviado: algunoOk,
    bloque_mes_omitido: incluirMesOmitido,
    bloque_excepciones: incluirExcepciones,
    excepciones_vencidas: excepcionesVencidas.length,
    destinatarios: destinatarios.length,
  };
}

// ---------------------------------------------------------------------------
// Trabajo 4 -- Reporte de cierre (C-1/CA-19, §8.3)
// ---------------------------------------------------------------------------

interface RondaCerradaRow {
  id: string;
  periodo: string;
  es_linea_base: boolean;
  abierta_en: string | null;
  cerrada_en: string | null;
  cerrada_por_usuario: string | null;
  cerrada_por_telegram: string | null;
  alcance_declarado: 'completo' | 'parcial' | null;
  alcance_nota: string | null;
}

async function obtenerExcepcionesParaReporte(sb: SupabaseClient, rondaId: string): Promise<ExcepcionReporteCierre[]> {
  const [{ data: excepciones, error: errorExcepciones }, alcance] = await Promise.all([
    sb
      .from('rondas_excepciones')
      .select('producto_id, estado, cantidad_fisica, teorico_conteo, via_propuesta, decision_causa, propuesta_causa')
      .eq('ronda_id', rondaId)
      .order('reportada_en', { ascending: true }),
    obtenerAlcanceRonda(sb, rondaId),
  ]);
  if (errorExcepciones) {
    console.error(`[ronda-tick] no se pudieron leer las excepciones de la ronda ${rondaId}: ${errorExcepciones.message}`);
    return [];
  }
  // Nombre del producto: SNAPSHOT del alcance congelado (R-5), nunca un JOIN
  // vivo a `productos` -- un rename posterior no debe reescribir lo que
  // Uriel vio en campo (mismo criterio que `rondas_inventario_alcance` ya
  // documenta).
  const nombresPorProducto = new Map(alcance.map((a) => [a.producto_id, a.nombre_producto]));

  return ((excepciones ?? []) as Array<{
    producto_id: string;
    estado: EstadoExcepcionInventario;
    cantidad_fisica: number;
    teorico_conteo: number;
    via_propuesta: ViaExcepcion;
    decision_causa: string | null;
    propuesta_causa: string | null;
  }>).map((fila) => {
    // CA-11: "la de Santiago manda" -- si hay decisión, esa etiqueta gana
    // sobre la propuesta de David/Uriel, aunque ambas existan.
    const causaClave = fila.decision_causa ?? fila.propuesta_causa ?? null;
    const causaEtiqueta = causaClave ? (buscarCausaRaiz(causaClave)?.etiqueta ?? causaClave) : null;
    return {
      productoNombre: nombresPorProducto.get(fila.producto_id) ?? '(producto fuera del alcance congelado)',
      estado: fila.estado as EstadoExcepcionRonda,
      fisico: fila.cantidad_fisica,
      teorico: fila.teorico_conteo,
      causaEtiqueta,
      via: fila.via_propuesta,
    };
  });
}

type FilaMovimientoInventario = {
  id: string;
  producto_id: string;
  tipo_movimiento: string;
  cantidad: number;
  responsable: string | null;
  producto: { nombre: string } | { nombre: string }[] | null;
};

/**
 * R-9/CA-19 (§8.3 punto 4): "todo movimiento de inventario OCURRIDO con la
 * ronda abierta" -- corregido tras revisión del orquestador (2026-08-28,
 * junto con la Fase 5). La primera versión filtraba TODO por
 * `fecha_movimiento` dentro de [abierta_en, cerrada_en], pero Fase 4
 * (`excepcionDavid.ts`, CA-8 literal) le pide a David la fecha REAL del
 * movimiento -- "nunca 'hoy' por defecto" -- así que una captura hecha HOY
 * con `fecha_movimiento` de hace semanas quedaba fuera de la consulta antes
 * de llegar siquiera a cruzarse contra `captura_movimiento_id`/
 * `aplicacion_movimiento_id`, y desaparecía del reporte pese a estar ligada
 * por FK a una excepción de ESTA ronda -- exactamente el caso que R-9 existe
 * para hacer visible.
 *
 * Dos consultas con criterios DISTINTOS, a propósito:
 *   1. Movimientos LIGADOS a una excepción de esta ronda (por
 *      `captura_movimiento_id`/`aplicacion_movimiento_id`) -- por ID directo,
 *      SIN filtro de fecha. El vínculo por FK ya es la prueba de pertenencia;
 *      cualquier fecha real del movimiento, pasada o futura respecto a la
 *      ventana, no cambia que nació de esta ronda.
 *   2. Movimientos NO ligados a ninguna excepción -- acá SÍ aplica una
 *      ventana, pero por `created_at` (cuándo se ESCRIBIÓ la fila), nunca por
 *      `fecha_movimiento` (que el humano puede fechar a su criterio, vía el
 *      camino (b) de §5.1 o una compra cualquiera). El propósito de R-9 para
 *      este bucket es la transparencia contra el atajo -- "¿se escribió algo
 *      en el sistema mientras la ronda estaba abierta, sin pasar por
 *      Santiago?" -- y esa pregunta la contesta `created_at`, no la fecha que
 *      el movimiento dice representar.
 */
async function obtenerMovimientosRondaAbierta(sb: SupabaseClient, ronda: RondaCerradaRow): Promise<MovimientoReporteCierre[]> {
  if (!ronda.abierta_en || !ronda.cerrada_en) return [];

  const { data: excepciones, error: errorExcepciones } = await sb
    .from('rondas_excepciones')
    .select('captura_movimiento_id, aplicacion_movimiento_id')
    .eq('ronda_id', ronda.id);
  if (errorExcepciones) {
    console.error(`[ronda-tick] no se pudieron leer los ids de movimiento de las excepciones de la ronda ${ronda.id}: ${errorExcepciones.message}`);
  }
  const movimientoIdsDeExcepcion = new Set<string>();
  for (const fila of (excepciones ?? []) as Array<{ captura_movimiento_id: string | null; aplicacion_movimiento_id: string | null }>) {
    if (fila.captura_movimiento_id) movimientoIdsDeExcepcion.add(fila.captura_movimiento_id);
    if (fila.aplicacion_movimiento_id) movimientoIdsDeExcepcion.add(fila.aplicacion_movimiento_id);
  }

  const SELECT_MOVIMIENTO = 'id, producto_id, tipo_movimiento, cantidad, responsable, producto:productos(nombre)';
  const [{ data: movimientosLigados, error: errorLigados }, { data: movimientosVentana, error: errorVentana }, alcance] = await Promise.all([
    movimientoIdsDeExcepcion.size > 0
      ? sb.from('movimientos_inventario').select(SELECT_MOVIMIENTO).in('id', [...movimientoIdsDeExcepcion])
      : Promise.resolve({ data: [] as FilaMovimientoInventario[], error: null }),
    sb
      .from('movimientos_inventario')
      .select(SELECT_MOVIMIENTO)
      .gte('created_at', ronda.abierta_en)
      .lte('created_at', ronda.cerrada_en),
    obtenerAlcanceRonda(sb, ronda.id),
  ]);
  if (errorLigados) {
    console.error(`[ronda-tick] no se pudieron leer los movimientos ligados a excepciones de la ronda ${ronda.id}: ${errorLigados.message}`);
  }
  if (errorVentana) {
    console.error(`[ronda-tick] no se pudieron leer los movimientos de la ventana de la ronda ${ronda.id}: ${errorVentana.message}`);
  }

  // Unión por id -- un movimiento ligado que TAMBIÉN cayó en la ventana de
  // creación no debe aparecer dos veces.
  const movimientosPorId = new Map<string, FilaMovimientoInventario>();
  for (const m of (movimientosLigados ?? []) as FilaMovimientoInventario[]) movimientosPorId.set(m.id, m);
  for (const m of (movimientosVentana ?? []) as FilaMovimientoInventario[]) movimientosPorId.set(m.id, m);

  const productoIdsEnAlcance = new Set(alcance.map((a) => a.producto_id));

  return [...movimientosPorId.values()].map((m) => {
    const producto = Array.isArray(m.producto) ? m.producto[0] : m.producto;
    const origen = clasificarMovimientoRondaAbierta({
      movimientoId: m.id,
      productoId: m.producto_id,
      movimientoIdsDeExcepcion,
      productoIdsEnAlcance,
    });
    return {
      productoNombre: producto?.nombre ?? '(producto)',
      tipoMovimiento: m.tipo_movimiento,
      cantidad: Math.abs(m.cantidad),
      origen,
      responsable: m.responsable,
    };
  });
}

/** A-7/R-16/CA-14: lo ÚNICO que hoy se guarda bajo el concepto
 * "observación libre" es `rondas_transcritos.preview.observacionesLibres`
 * (comentarios generales que el intérprete NO ligó a un producto -- ver
 * `interpretarNota.ts`, punto 8 de su prompt). `rondas_inventario.observaciones_libres`
 * (columna de cabecera, migración 125) existe pero NADA la escribe hoy --
 * deliberadamente no se lee acá para no fingir una fuente que está muerta;
 * ver el resumen de esta sesión para el hallazgo completo, incluida la parte
 * que CA-14 promete y que el pipeline de voz no puede cumplir todavía
 * (producto no catalogado -- ver el mismo resumen). Sólo transcritos
 * `confirmado`/`sin_confirmar` -- un `descartado` es una nota que Uriel
 * mismo invalidó, sus comentarios no deben resucitar en el reporte. */
async function obtenerObservacionesLibres(sb: SupabaseClient, rondaId: string): Promise<string[]> {
  const { data, error } = await sb
    .from('rondas_transcritos')
    .select('preview')
    .eq('ronda_id', rondaId)
    .in('estado', ['confirmado', 'sin_confirmar']);
  if (error) {
    console.error(`[ronda-tick] no se pudieron leer los transcritos de la ronda ${rondaId}: ${error.message}`);
    return [];
  }
  const resultado: string[] = [];
  for (const fila of (data ?? []) as Array<{ preview: { observacionesLibres?: string[] } | null }>) {
    if (fila.preview?.observacionesLibres) resultado.push(...fila.preview.observacionesLibres);
  }
  return resultado;
}

async function obtenerValorTotalMesAnterior(sb: SupabaseClient, periodoActual: string): Promise<number | null> {
  const { data: rondaAnterior } = await sb
    .from('rondas_inventario')
    .select('id')
    .eq('estado', 'cerrada')
    .lt('periodo', periodoActual)
    .order('periodo', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rondaAnterior) return null; // primera ronda o sin cerradas previas -- CA-21: "—", nunca 0.

  const { data: reporteAnterior } = await sb.from('rondas_reportes').select('contenido').eq('ronda_id', rondaAnterior.id).maybeSingle();
  const contenido = reporteAnterior?.contenido as { valoracion?: { valorTotalActual?: number | null } } | null | undefined;
  return contenido?.valoracion?.valorTotalActual ?? null;
}

/**
 * Arma `InputReporteCierre` (Fase 1, `reporteCierre.ts`) leyendo TODO lo que
 * ese módulo puro necesita -- este es el "cómo se lee la base" que la tarea
 * de esta sesión pide, la pieza con más superficie de la fase entera.
 */
async function construirInputReporteCierre(sb: SupabaseClient, ronda: RondaCerradaRow): Promise<InputReporteCierre> {
  const cerradoPorNombre = await resolverNombreActor(sb, ronda.cerrada_por_usuario, ronda.cerrada_por_telegram);

  const { data: parametro } = await sb.from('inventario_parametros').select('valor').eq('clave', 'valoracion_publicable').maybeSingle();
  const valoracionPublicable = parametro?.valor === true;

  let valoracion: InputReporteCierre['valoracion'];
  if (valoracionPublicable) {
    const { data: productos, error: errorProductos } = await sb.from('productos').select('cantidad_actual, precio_unitario, activo');
    if (errorProductos) console.error(`[ronda-tick] no se pudo leer productos para la valoración: ${errorProductos.message}`);
    const valorTotalActual = calcularValorInventario(
      ((productos ?? []) as Array<{ cantidad_actual: number | null; precio_unitario: number | null; activo: boolean | null }>).map(
        (p): ProductoParaValoracion => ({ cantidadActual: p.cantidad_actual, precioUnitario: p.precio_unitario, activo: p.activo }),
      ),
    );
    const valorTotalMesAnterior = await obtenerValorTotalMesAnterior(sb, ronda.periodo);
    valoracion = { incluyeValoracion: true, valorTotalActual, valorTotalMesAnterior };
  } else {
    valoracion = { incluyeValoracion: false, valorTotalActual: null, valorTotalMesAnterior: null };
  }

  const [excepciones, movimientosRondaAbierta, observacionesLibres, { count: hallazgosNarradosSinConfirmar }] = await Promise.all([
    obtenerExcepcionesParaReporte(sb, ronda.id),
    obtenerMovimientosRondaAbierta(sb, ronda),
    obtenerObservacionesLibres(sb, ronda.id),
    sb.from('rondas_transcritos').select('id', { count: 'exact', head: true }).eq('ronda_id', ronda.id).eq('estado', 'sin_confirmar'),
  ]);

  // `rondas_cierre_declara_alcance` (migración 125) garantiza NOT NULL en
  // toda ronda 'cerrada' -- esta rama no debería ser alcanzable nunca. Si lo
  // fuera, "completo" sería una afirmación falsa sobre una ronda de la que
  // no se sabe qué se recorrió; se deja el valor y se grita en el log en vez
  // de fallar la corrida entera por una fila que el CHECK ya debería impedir.
  if (ronda.alcance_declarado === null) {
    console.error(`[ronda-tick] ronda ${ronda.id} está cerrada sin alcance_declarado -- no debería ser posible (CHECK rondas_cierre_declara_alcance, 125). Se reporta como "completo" por defecto.`);
  }

  return {
    cabecera: {
      periodo: ronda.periodo,
      cerradaEn: ronda.cerrada_en ? fechaBogotaDe(ronda.cerrada_en) : hoyBogota(),
      cerradoPorNombre,
      alcanceDeclarado: ronda.alcance_declarado ?? 'completo',
      alcanceNota: ronda.alcance_nota,
      esLineaBase: ronda.es_linea_base,
    },
    valoracion,
    excepciones,
    movimientosRondaAbierta,
    observacionesLibres,
    hallazgosNarradosSinConfirmar: hallazgosNarradosSinConfirmar ?? 0,
  };
}

/**
 * Emite (si hace falta) y envía el reporte de cierre de UNA ronda cerrada.
 *
 * Dos idempotencias DISTINTAS, a propósito:
 *  - `rondas_reportes` (PK `ronda_id`) congela el CONTENIDO -- una vez
 *    emitido, nunca se recalcula (R-10/CA-18). `fn_ronda_emitir_reporte`
 *    hace el `ON CONFLICT (ronda_id) DO NOTHING`.
 *  - `rondas_avisos` clave `reporte_cierre:<ronda_id>` confirma el ENVÍO a
 *    Santiago, y se reclama DESPUÉS de un envío exitoso (orden INVERSO al de
 *    los otros tres trabajos, que reclaman ANTES de enviar). Es deliberado:
 *    CA-19 dice "siempre" y una ronda cerrada no tiene un "próximo mes" que
 *    reintente por ella -- si el envío de Telegram falla para todos los
 *    destinatarios, NO se reclama la clave, y la corrida de mañana vuelve a
 *    intentarlo con el MISMO texto ya congelado (nunca se reconstruye). El
 *    residuo aceptado es el opuesto al de los otros tres: una ventana muy
 *    angosta de doble envío si dos corridas coincidieran exactamente en el
 *    instante entre "leer que no está confirmado" y "confirmar" -- un cron
 *    diario secuencial no la alcanza en la práctica.
 */
async function procesarReporteCierreDeUnaRonda(sb: SupabaseClient, ronda: RondaCerradaRow): Promise<Record<string, unknown>> {
  const { data: reporteExistente } = await sb.from('rondas_reportes').select('texto_telegram').eq('ronda_id', ronda.id).maybeSingle();

  let textoTelegram: string;
  if (!reporteExistente) {
    const input = await construirInputReporteCierre(sb, ronda);
    const reporte = construirReporteCierre(input);
    textoTelegram = renderReporteCierreTelegram(reporte);

    const { error: errorEmitir } = await sb.rpc('fn_ronda_emitir_reporte', {
      payload: {
        ronda_id: ronda.id,
        contenido: reporte,
        texto_telegram: textoTelegram,
        incluye_valoracion: input.valoracion.incluyeValoracion,
      },
    });
    if (errorEmitir) {
      console.error(`[ronda-tick] no se pudo emitir el reporte de la ronda ${ronda.id}: ${errorEmitir.message}`);
      return { ronda_id: ronda.id, emitido: false, motivo: 'error_rpc' };
    }
  } else {
    // R-10/CA-18: nunca se recalcula -- se usa el texto YA congelado.
    textoTelegram = reporteExistente.texto_telegram as string;
  }

  const claveEnvio = `reporte_cierre:${ronda.id}`;
  const { data: avisoEnvio } = await sb.from('rondas_avisos').select('clave').eq('clave', claveEnvio).maybeSingle();
  if (avisoEnvio) {
    return { ronda_id: ronda.id, emitido: true, enviado: 'ya_confirmado' };
  }

  const destinatarios = await resolverDestinatarios(sb, 'inventario.reporte_cierre', 'inventario_aprobacion');
  if (destinatarios.length === 0) {
    return { ronda_id: ronda.id, emitido: true, enviado: false, motivo: 'sin_destinatarios_reintenta_manana' };
  }

  const algunoOk = await enviarATodos(sb, destinatarios, truncarParaTelegram(textoTelegram), 'ronda_reporte_cierre');
  if (algunoOk) {
    await reclamarAviso(sb, claveEnvio, ronda.id, null);
  }
  return { ronda_id: ronda.id, emitido: true, enviado: algunoOk, destinatarios: destinatarios.length };
}

async function procesarReporteCierre(sb: SupabaseClient): Promise<Record<string, unknown>[]> {
  const { data: rondasCerradas, error } = await sb
    .from('rondas_inventario')
    .select('id, periodo, es_linea_base, abierta_en, cerrada_en, cerrada_por_usuario, cerrada_por_telegram, alcance_declarado, alcance_nota')
    .eq('estado', 'cerrada');
  if (error) {
    console.error(`[ronda-tick] no se pudieron leer las rondas cerradas: ${error.message}`);
    return [];
  }
  const resultados: Record<string, unknown>[] = [];
  for (const ronda of (rondasCerradas ?? []) as RondaCerradaRow[]) {
    resultados.push(await procesarReporteCierreDeUnaRonda(sb, ronda));
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

export async function handleRondaInventarioTick(c: Context): Promise<Response> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const auth = await verificarAuth(c, supabase);
  if (auth instanceof Response) return auth;

  const hoy = hoyBogota();
  const periodo = primerDiaMesBogota();

  const recordatorio = await procesarRecordatorio(supabase, hoy, periodo);
  const revisionDia15 = await procesarRevisionDia15(supabase, hoy, periodo);
  const reporteCierre = await procesarReporteCierre(supabase);

  return c.json({
    success: true,
    disparo: auth.disparo,
    fecha_referencia: hoy,
    periodo,
    recordatorio,
    revision_dia_15: revisionDia15,
    reporte_cierre: reporteCierre,
  });
}
