// ARCHIVO: utils/hatoAlertas.ts
// DESCRIPCIÓN: Motor de lógica pura del motor de alertas del Hato Lechero
// (S6 del plan docs/plan_hato_lechero_module.md — ver §6 Épica C, §7.3).
//
// Módulo PURO: no importa el cliente de Supabase, Deno, ni nada de
// React/navegador. Toda función que depende de "hoy"/"ahora" recibe la fecha
// (u hora) de referencia como parámetro — mismo contrato que
// `calculosHato.ts` (S2) y `priorizacionMonitoreo.ts`. Esto permite que el
// endpoint del tick (`hato-alertas-tick.ts`) y los tests unitarios usen
// exactamente esta misma lógica sin reimplementarla.
//
// Este archivo SÍ importa `@/utils/calculosHato` (reutiliza
// `derivarEstadoReproductivo` — las 4 de las 5 reglas de alerta reproductivas
// ya están derivadas ahí, este motor no las vuelve a calcular) y
// `@/utils/importHato/overridesChapeta` (para saber cuándo una chapeta es un
// número de trabajo provisional, nunca un dato real). Por eso NO es una copia
// byte-idéntica en el servidor (a diferencia de `calculosHato.ts`) — el
// mirror Deno-side reescribe esos dos especificadores de import, mismo
// patrón que `docs/hato/regenerar-copias-importhato.py` usa para
// `src/utils/importHato/*.ts`. Ver `docs/hato/regenerar-copias-hato-alertas.py`.
//
// Las 5 reglas y el formato EXACTO de `regla_clave` (idempotencia,
// `UNIQUE` en `hato_alertas.regla_clave`, migración 056) vienen del plan §7.3:
//
//   secado_due                 -> `secado:{animal_id}:{fecha_servicio}`
//   tratamiento_paso            -> `ttto:{paso_id}`
//   rechequeo_due               -> `rechq:{animal_id}:{ultimo_chequeo_fecha}`
//   servicio_sin_confirmacion   -> `servconf:{animal_id}:{fecha_servicio}`
//   parto_proximo               -> `parto:{animal_id}:{fecha_servicio}`
//
// `{animal_id}` es el UUID de `hato_animales.id`, NUNCA `numero` — la
// migración 066 (CLAUDE.md, "Identity model & renumeración") degradó
// `numero` a un atributo mutable ("chapeta actual"); la identidad real
// siempre fue `hato_animales.id`. Usar `numero` en la clave de idempotencia
// rompería la idempotencia el día que Martha re-numere el hato completo.
//
// Regla dura del dueño (cuarta ronda de decisiones, ver CLAUDE.md
// "Provisional-period guardrails"): un mensaje de alerta SIEMPRE lidera con
// el NOMBRE, nunca con un número provisional (800-999) ni con la ausencia de
// número — Fernando lee la chapeta FÍSICA en el corral, y un número de
// trabajo no le sirve para identificar al animal. Ver `nombrePresentacionAnimal`.
//
// Umbrales de negocio (ventanas, días) SIEMPRE vienen de `HatoConfig`/
// `hato_alertas_config` — cero constantes de negocio hardcodeadas aquí. Las
// únicas tres constantes de este archivo (`HORAS_MINIMAS_REENVIO`,
// `INTENTOS_MAXIMOS_REENVIO`, `DIAS_EXPIRACION_ALERTA`) son mecanismos
// TÉCNICOS anti-spam del propio diseño del motor (plan §7.3: "reenvío solo
// si pasaron ≥48h y `intentos < 3`"; el límite de 14 días de expiración
// también es texto plano del plan, no una fila de `hato_config` sembrada por
// ninguna migración existente) — no son un parámetro de negocio editable por
// Gerencia como sí lo es `hato_alertas_config.horas_escalamiento`.

import { derivarEstadoReproductivo, type EstadoActualHatoRow, type HatoConfig } from '@/utils/calculosHato';
import { esNumeroProvisional } from '@/utils/importHato/overridesChapeta';

// ============================================================================
// Tipos compartidos
// ============================================================================

export type TipoAlertaHato =
  | 'secado_due'
  | 'tratamiento_paso'
  | 'rechequeo_due'
  | 'servicio_sin_confirmacion'
  | 'parto_proximo';

/** Espejo del CHECK de `hato_alertas.estado` (migración 056). */
export type EstadoAlertaHato =
  | 'pendiente'
  | 'enviada'
  | 'respondida'
  | 'confirmada'
  | 'descartada'
  | 'escalada'
  | 'expirada';

/** Fila de `v_hato_estado_actual` que este motor consume, más los campos de
 * identidad (`animal_id`, `numero`, `nombre`) que la vista también expone
 * pero que `EstadoActualHatoRow` (consumido por `derivarEstadoReproductivo`)
 * no necesita. */
export interface AnimalHatoParaAlertas extends EstadoActualHatoRow {
  animal_id: string;
  numero: number | null;
  nombre: string | null;
}

/** Un paso de tratamiento aún sin ejecutar (`hato_tratamiento_pasos.fecha_ejecutada
 * IS NULL`, migración 055), con la identidad del animal ya resuelta por el
 * caller (join con `hato_tratamientos` + `hato_animales`) — este motor no
 * hace joins, solo consume filas ya planas. */
export interface PasoTratamientoPendienteInput {
  paso_id: string;
  animal_id: string;
  numero: number | null;
  nombre: string | null;
  fecha_programada: string;
  descripcion: string | null;
}

/** Forma insertable en `hato_alertas` (sin `id`/`estado`/`created_at`, que
 * decide el caller con acceso a la base — este motor solo decide QUÉ alertas
 * corresponde generar y con qué `regla_clave`/mensaje). */
export interface AlertaGenerada {
  tipo: TipoAlertaHato;
  animal_id: string;
  regla_clave: string;
  fecha_programada: string;
  datos: Record<string, unknown>;
  mensaje: string;
}

// ============================================================================
// BLOQUE 1 — Presentación del animal en los mensajes (regla del dueño, V14+)
// ============================================================================

/**
 * Texto de presentación de un animal para los mensajes de Telegram.
 *
 * Regla dura (cuarta ronda de decisiones del dueño, ver CLAUDE.md
 * "Provisional-period guardrails"): cuando la chapeta es un número de
 * trabajo provisional (800-999, `esNumeroProvisional`) o directamente no
 * existe, el mensaje SIEMPRE lidera con el NOMBRE — nunca con el número.
 * Fernando identifica al animal por la chapeta física que lleva puesta en la
 * oreja; un número provisional no corresponde a ninguna chapeta real y
 * mandarlo como si lo fuera lo mandaría a buscar una vaca que no existe.
 *
 * Cuando el número SÍ es una chapeta real, número y nombre van siempre
 * juntos (plan §7.3, "anti-fatiga... número + nombre siempre juntos").
 */
export function nombrePresentacionAnimal(nombre: string | null, numero: number | null): string {
  const numeroEsReal = numero !== null && !esNumeroProvisional(numero);
  if (numeroEsReal) {
    return nombre ? `Vaca ${numero} (${nombre})` : `Vaca ${numero}`;
  }
  // Chapeta provisional o ausente -- el nombre lidera, nunca el número.
  if (nombre) return nombre;
  if (numero !== null) {
    return `el animal de chapeta provisional ${numero} (sin nombre registrado en la ficha)`;
  }
  return 'un animal sin identificar en su ficha (revisar hato_animales)';
}

// ============================================================================
// BLOQUE 2 — Constructor de mensajes
// ============================================================================

/** Datos de contexto que el mensaje de cada tipo de alerta necesita. Todos
 * los campos de fecha/descripción son opcionales porque cada `tipo` solo usa
 * un subconjunto -- `construirMensajeAlerta` documenta cuál. */
export interface ContextoMensajeAlerta {
  tipo: TipoAlertaHato;
  nombre: string | null;
  numero: number | null;
  fecha_secar?: string | null;
  fecha_probable_parto?: string | null;
  fecha_servicio?: string | null;
  ultimo_chequeo_fecha?: string | null;
  descripcion_paso?: string | null;
  fecha_programada?: string | null;
}

/**
 * Construye el texto del mensaje de Telegram para una alerta, según su
 * `tipo` (plan §6 Épica C, C1-C3/C5). El caller (bot) agrega el
 * `InlineKeyboard` [Sí / Todavía no / Otra cosa] -- este motor solo produce
 * el texto, nunca decide botones ni destinatarios.
 */
export function construirMensajeAlerta(ctx: ContextoMensajeAlerta): string {
  const presentacion = nombrePresentacionAnimal(ctx.nombre, ctx.numero);
  switch (ctx.tipo) {
    case 'secado_due':
      return `${presentacion} se debe secar hoy (fecha programada: ${ctx.fecha_secar ?? 'sin fecha registrada'}). ¿Ya se secó?`;
    case 'tratamiento_paso':
      return (
        `Recordatorio: ${presentacion} tiene un paso de tratamiento programado para hoy` +
        ` (${ctx.fecha_programada ?? 'sin fecha registrada'})` +
        `${ctx.descripcion_paso ? `: "${ctx.descripcion_paso}"` : ''}. ¿Ya se hizo?`
      );
    case 'rechequeo_due':
      return `${presentacion} necesita rechequeo veterinario (último chequeo: ${ctx.ultimo_chequeo_fecha ?? 'sin registro'}). ¿Ya se hizo el rechequeo?`;
    case 'servicio_sin_confirmacion':
      return `${presentacion} fue servida el ${ctx.fecha_servicio ?? 'fecha desconocida'} y no hay confirmación de preñez. ¿Ya se confirmó o hay alguna novedad?`;
    case 'parto_proximo':
      return `${presentacion} tiene parto probable el ${ctx.fecha_probable_parto ?? 'fecha desconocida'} (próximo). ¿Alguna novedad?`;
    default: {
      const _exhaustivo: never = ctx.tipo;
      return _exhaustivo;
    }
  }
}

// ============================================================================
// BLOQUE 3 — Generación de alertas (fase "generar" del tick, plan §7.3)
// ============================================================================

function agregarSiNueva(
  acumulado: AlertaGenerada[],
  reglasExistentes: ReadonlySet<string>,
  candidata: AlertaGenerada,
): void {
  // `reglasExistentes` refleja tanto el UNIQUE(regla_clave) de la tabla (el
  // INSERT real usa ON CONFLICT DO NOTHING como red de seguridad última)
  // como una regeneración: si la condición que dispara la alerta sigue
  // vigente día tras día (ej. servicio_sin_confirmacion, mientras no haya
  // confirmación), la MISMA regla_clave se recalcularía cada tick -- filtrar
  // aquí evita reintentar un INSERT que la base rechazaría de todas formas y
  // mantiene el conteo de "generadas" fiel a lo que de verdad es nuevo.
  if (reglasExistentes.has(candidata.regla_clave)) return;
  acumulado.push(candidata);
}

/**
 * Fase "generar" del tick diario (plan §7.3): recorre el hato + los pasos de
 * tratamiento pendientes y produce la lista de alertas NUEVAS a insertar.
 *
 * Reutiliza `derivarEstadoReproductivo` (S2) para las 4 reglas reproductivas
 * (`secado_due`, `rechequeo_due`, `servicio_sin_confirmacion`,
 * `parto_proximo`) -- este motor NO vuelve a calcular esos umbrales, serían
 * dos fuentes de verdad sobre la misma pregunta. La quinta regla
 * (`tratamiento_paso`) no tiene equivalente en `calculosHato.ts` porque no
 * depende del ciclo reproductivo -- se evalúa directo sobre los pasos
 * pendientes que trae el caller.
 */
export function generarAlertasPendientes(
  animales: AnimalHatoParaAlertas[],
  pasosPendientes: PasoTratamientoPendienteInput[],
  config: HatoConfig,
  reglasExistentes: ReadonlySet<string>,
  fechaReferencia: string,
): AlertaGenerada[] {
  const alertas: AlertaGenerada[] = [];

  for (const fila of animales) {
    const derivado = derivarEstadoReproductivo(fila, config, fechaReferencia);

    if (derivado.alertas.secado_due && fila.ultimo_servicio_fecha && derivado.fecha_secar) {
      agregarSiNueva(alertas, reglasExistentes, {
        tipo: 'secado_due',
        animal_id: fila.animal_id,
        regla_clave: `secado:${fila.animal_id}:${fila.ultimo_servicio_fecha}`,
        fecha_programada: derivado.fecha_secar,
        datos: {
          numero: fila.numero,
          nombre: fila.nombre,
          fecha_secar: derivado.fecha_secar,
          fecha_servicio: fila.ultimo_servicio_fecha,
        },
        mensaje: construirMensajeAlerta({
          tipo: 'secado_due',
          nombre: fila.nombre,
          numero: fila.numero,
          fecha_secar: derivado.fecha_secar,
        }),
      });
    }

    if (derivado.alertas.rechequeo_due && fila.ultimo_chequeo_fecha) {
      agregarSiNueva(alertas, reglasExistentes, {
        tipo: 'rechequeo_due',
        animal_id: fila.animal_id,
        regla_clave: `rechq:${fila.animal_id}:${fila.ultimo_chequeo_fecha}`,
        fecha_programada: fechaReferencia,
        datos: { numero: fila.numero, nombre: fila.nombre, ultimo_chequeo_fecha: fila.ultimo_chequeo_fecha },
        mensaje: construirMensajeAlerta({
          tipo: 'rechequeo_due',
          nombre: fila.nombre,
          numero: fila.numero,
          ultimo_chequeo_fecha: fila.ultimo_chequeo_fecha,
        }),
      });
    }

    if (derivado.alertas.servicio_sin_confirmacion && fila.ultimo_servicio_fecha) {
      agregarSiNueva(alertas, reglasExistentes, {
        tipo: 'servicio_sin_confirmacion',
        animal_id: fila.animal_id,
        regla_clave: `servconf:${fila.animal_id}:${fila.ultimo_servicio_fecha}`,
        fecha_programada: fechaReferencia,
        datos: { numero: fila.numero, nombre: fila.nombre, fecha_servicio: fila.ultimo_servicio_fecha },
        mensaje: construirMensajeAlerta({
          tipo: 'servicio_sin_confirmacion',
          nombre: fila.nombre,
          numero: fila.numero,
          fecha_servicio: fila.ultimo_servicio_fecha,
        }),
      });
    }

    if (derivado.alertas.parto_proximo && fila.ultimo_servicio_fecha && derivado.fecha_probable_parto) {
      agregarSiNueva(alertas, reglasExistentes, {
        tipo: 'parto_proximo',
        animal_id: fila.animal_id,
        regla_clave: `parto:${fila.animal_id}:${fila.ultimo_servicio_fecha}`,
        fecha_programada: derivado.fecha_probable_parto,
        datos: {
          numero: fila.numero,
          nombre: fila.nombre,
          fecha_probable_parto: derivado.fecha_probable_parto,
          fecha_servicio: fila.ultimo_servicio_fecha,
        },
        mensaje: construirMensajeAlerta({
          tipo: 'parto_proximo',
          nombre: fila.nombre,
          numero: fila.numero,
          fecha_probable_parto: derivado.fecha_probable_parto,
        }),
      });
    }
  }

  for (const paso of pasosPendientes) {
    // Un paso programado para el futuro no está due todavía -- el caller ya
    // filtra por `fecha_ejecutada IS NULL` en la consulta, pero no por fecha;
    // ese filtro de "¿ya toca?" es lógica de negocio y vive aquí.
    if (paso.fecha_programada > fechaReferencia) continue;

    agregarSiNueva(alertas, reglasExistentes, {
      tipo: 'tratamiento_paso',
      animal_id: paso.animal_id,
      regla_clave: `ttto:${paso.paso_id}`,
      fecha_programada: paso.fecha_programada,
      datos: { paso_id: paso.paso_id, numero: paso.numero, nombre: paso.nombre, descripcion: paso.descripcion },
      mensaje: construirMensajeAlerta({
        tipo: 'tratamiento_paso',
        nombre: paso.nombre,
        numero: paso.numero,
        descripcion_paso: paso.descripcion,
        fecha_programada: paso.fecha_programada,
      }),
    });
  }

  return alertas;
}

// ============================================================================
// BLOQUE 4 — Utilidades de fecha/hora (independientes de las de calculosHato.ts
// -- esas trabajan solo con fechas ISO sin hora; este motor también necesita
// comparar instantes con hora, para el reenvío/escalamiento).
// ============================================================================

/** Diferencia en horas (hasta - desde) entre dos instantes ISO 8601
 * (`yyyy-mm-ddTHH:mm:ss.sssZ` o cualquier formato que `Date` parsee sin
 * ambigüedad -- siempre lo que devuelve Postgres/Supabase en una columna
 * `timestamptz`). No usa `Date.now()`: ambos extremos son parámetros. */
function diferenciaHoras(desdeIso: string, hastaIso: string): number {
  const desde = new Date(desdeIso).getTime();
  const hasta = new Date(hastaIso).getTime();
  return (hasta - desde) / 3_600_000;
}

/** Diferencia en días de calendario (UTC) entre una fecha ISO (`yyyy-mm-dd`,
 * o el prefijo de un `timestamptz`) y un instante de referencia (también
 * ISO, se toma solo su parte de fecha). */
function diferenciaDiasIso(fechaIso: string, fechaHoraReferenciaIso: string): number {
  const [a1, m1, d1] = fechaIso.slice(0, 10).split('-').map(Number);
  const [a2, m2, d2] = fechaHoraReferenciaIso.slice(0, 10).split('-').map(Number);
  const t1 = Date.UTC(a1, m1 - 1, d1);
  const t2 = Date.UTC(a2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86_400_000);
}

// ============================================================================
// BLOQUE 5 — Política de reenvío (fase "despachar" del tick, plan §7.3
// "anti-spam")
// ============================================================================

/** Horas mínimas entre un envío y el siguiente reintento de la MISMA alerta
 * (plan §7.3: "reenvío solo si pasaron ≥48h"). Constante técnica anti-spam
 * del propio diseño del motor -- no vive en `hato_config`/`hato_alertas_config`
 * (esas tablas no siembran ninguna clave para esto), a diferencia de los
 * umbrales de negocio reproductivos que sí gobierna `HatoConfig`. */
export const HORAS_MINIMAS_REENVIO = 48;

/** Reintentos máximos antes de dejar de reenviar (plan §7.3: "`intentos < 3`"). */
export const INTENTOS_MAXIMOS_REENVIO = 3;

/** Días desde `fecha_programada` tras los cuales una alerta sin resolver se
 * considera irrelevante y se marca `expirada` (plan §7.3, mencionado en
 * prosa junto al escalamiento de 48h; no es una clave de `hato_config`). */
export const DIAS_EXPIRACION_ALERTA = 14;

/** Subconjunto de columnas de `hato_alertas` que la política de
 * reenvío/escalamiento necesita. */
export interface AlertaEnCola {
  estado: EstadoAlertaHato;
  intentos: number;
  /** `hato_alertas.fecha_programada` (ISO `yyyy-mm-dd`). */
  fecha_programada: string;
  /** Instante (ISO datetime) del último intento de envío/reenvío. `null` si
   * nunca se intentó. */
  ultimo_intento_en: string | null;
}

/**
 * Decide si una alerta YA `enviada` debe reenviarse en este tick. Solo
 * aplica a alertas `enviada` -- el primer envío de una `pendiente` no pasa
 * por esta función (es incondicional en cuanto hay destinatario
 * configurado, ver fase "despachar" del endpoint).
 */
export function debeReenviar(
  alerta: Pick<AlertaEnCola, 'estado' | 'intentos' | 'ultimo_intento_en'>,
  fechaHoraReferencia: string,
): boolean {
  if (alerta.estado !== 'enviada') return false;
  if (alerta.intentos >= INTENTOS_MAXIMOS_REENVIO) return false;
  if (!alerta.ultimo_intento_en) return true; // se envió una vez pero nunca se reintentó -- puede reintentar ya
  return diferenciaHoras(alerta.ultimo_intento_en, fechaHoraReferencia) >= HORAS_MINIMAS_REENVIO;
}

// ============================================================================
// BLOQUE 6 — Escalamiento / expiración (fase "escalar/expirar" del tick)
// ============================================================================

export type AccionEscalamiento = 'ninguna' | 'escalar' | 'expirar';

/**
 * Decide si una alerta debe escalarse a Martha o expirarse (plan §7.3: "48h
 * sin respuesta -> escalamiento a Martha"; ">14 días -> expirada"; C4).
 * "Sin respuesta" cuenta desde el ENVÍO, no desde la fecha programada de la
 * alerta -- por eso el instante de envío (`anchorEnvio`) es un parámetro
 * explícito y no un campo leído de `AlertaEnCola`: `hato_alertas` (migración
 * 056) no tiene una columna dedicada para "cuándo se envió por primera vez",
 * así que ese instante vive en `datos.enviada_en` (ver `hato-alertas-tick.ts`)
 * y es responsabilidad del caller resolverlo antes de llamar a esta función.
 *
 * Solo las alertas en un estado activo (`pendiente`/`enviada`) pueden
 * escalar o expirar -- cualquier estado terminal (`respondida`, `confirmada`,
 * `descartada`, ya `escalada` o ya `expirada`) devuelve `'ninguna'`: no se
 * re-escala ni se re-expira algo que ya se resolvió o que ya recibió su
 * escalamiento.
 *
 * La expiración (`>14 días` desde `fecha_programada`) SÍ se ancla a la fecha
 * programada, no al envío -- es una pregunta distinta ("¿esta alerta sigue
 * siendo relevante?", no "¿cuánto tardó Fernando en responder?"). Aplica
 * tanto a `pendiente` (nunca se pudo enviar -- ej. sin destinatario
 * configurado, modo sombra) como a `enviada`: una alerta pendiente eterna
 * sin destinatario igual necesita limpiarse de la cola activa tarde o
 * temprano, y nunca tuvo un envío del cual medir "sin respuesta".
 *
 * El escalamiento, en cambio, SOLO aplica a `enviada` con un `anchorEnvio`
 * no nulo -- una `pendiente` (nunca despachada, ej. sin destinatario
 * configurado) nunca escala: no hay nadie que "no haya respondido" todavía.
 * La revisión semanal de Martha (C4/V11) es lo que atiende esas mientras
 * tanto, no el mecanismo de escalamiento.
 */
export function decidirAccionEscalamiento(
  alerta: Pick<AlertaEnCola, 'estado' | 'fecha_programada'>,
  anchorEnvio: string | null,
  horasEscalamiento: number,
  fechaHoraReferencia: string,
): AccionEscalamiento {
  if (alerta.estado !== 'pendiente' && alerta.estado !== 'enviada') return 'ninguna';

  const diasDesdeProgramada = diferenciaDiasIso(alerta.fecha_programada, fechaHoraReferencia);
  if (diasDesdeProgramada > DIAS_EXPIRACION_ALERTA) return 'expirar';

  if (alerta.estado === 'enviada' && anchorEnvio) {
    const horasDesdeEnvio = diferenciaHoras(anchorEnvio, fechaHoraReferencia);
    if (horasDesdeEnvio >= horasEscalamiento) return 'escalar';
  }

  return 'ninguna';
}
