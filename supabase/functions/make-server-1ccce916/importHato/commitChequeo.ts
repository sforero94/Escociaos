// ARCHIVO: supabase/functions/make-server-1ccce916/importHato/commitChequeo.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/commitChequeo.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

// ARCHIVO: utils/importHato/commitChequeo.ts
// DESCRIPCIÓN: Lógica pura del COMMIT del chequeo (B0/V10, el paso "Aprobar"
// que sigue al diff de `diffChequeo.ts`). Consume las filas ya aprobadas por
// un humano (`sin_cambio`/`cambio` en un diff RECIÉN recalculado contra el
// estado actual, nunca el diff viejo que vio la pantalla) y produce:
//
//   1. `validarFilasCommit`     -- aplica la regla dura de alcance: SOLO
//      filas que siguen siendo `sin_cambio`/`cambio` en el estado fresco se
//      aceptan. `nuevo`, `no_reconocido` (incluye número provisional y
//      colisión de chapeta, ver `diffChequeo.ts`) se rechazan SIEMPRE --
//      nunca se escriben. Esto es lo que hace el commit ATÓMICAMENTE seguro:
//      si el hato cambió entre que Martha vio el diff y aprobó, la fila que
//      dejó de matchear se rechaza en vez de escribirse con datos viejos.
//   2. `construirFilasVacas`    -- fila aprobada -> forma insertable de
//      `hato_chequeo_vacas` (capa cruda VERBATIM + capa normalizada, mismo
//      mapeo de columnas que `scripts/import-hato/load.ts` Paso 4).
//   3. `derivarEventosDeChequeo` -- reusa el MISMO `descomponerSX` del motor
//      (`calculosHato.ts`) que ya usa Load y la captura en vivo -- nunca un
//      segundo decompositor. Cada evento sale con `vacaIndice`: la posición
//      (0-based) de su fila padre dentro del arreglo de filas aprobadas, que
//      es EXACTAMENTE el mismo orden en que `construirFilasVacas` emite las
//      filas -- así el caller (handler I/O) puede alinear "evento N ->
//      vaca[vacaIndice]" sin ningún ID todavía, porque las filas de
//      `hato_chequeo_vacas` ni siquiera existen hasta que la RPC
//      (`fn_hato_commit_chequeo`, migración 065) las inserta dentro de la
//      misma transacción.
//   4. `construirPayloadCommit` -- ensambla el JSON determinístico que viaja
//      como `payload` a la RPC. El único dato resuelto por I/O que entra
//      aquí ya resuelto es `toroIdPorNombre` (SELECT-o-INSERT en
//      `hato_toros`, responsabilidad del handler -- este módulo no toca
//      Supabase).
//
// Puro, cero I/O -- mismo contrato que el resto de `importHato/*.ts` y de
// `calculosHato.ts`: nada se descarta en silencio, toda fila no interpretable
// sigue viajando con su crudo intacto (los `raw.*` se copian VERBATIM, nunca
// se reinterpretan aquí).

import { descomponerSX, parseUltimaCria, type EventoDerivado, type ParseIssue } from '../calculos-hato.ts';
import type { FilaChequeoNormalizada } from './tipos.ts';
import type { ClasificacionFilaDiff, ResultadoDiffChequeo } from './diffChequeo.ts';

// ============================================================================
// 1. Validación de alcance -- regla dura, ver cabecera del archivo.
// ============================================================================

/** Clasificaciones que SÍ se pueden escribir. Nunca `nuevo` (no hay ficha
 * `hato_animales` para esa chapeta -- el usuario debe crearla primero, ver
 * la nota "crear ficha primero" del wiring de UI) ni `no_reconocido`
 * (incluye número provisional 900-999 y colisión de chapeta dentro de la
 * hoja, `diffChequeo.ts`). */
const CLASIFICACIONES_ESCRIBIBLES: ReadonlySet<ClasificacionFilaDiff> = new Set(['sin_cambio', 'cambio']);

export interface FilaChequeoAprobada {
  fila: FilaChequeoNormalizada;
  animalId: string;
}

export interface FilaRechazadaCommit {
  fila: number;
  numero: number | null;
  motivo: string;
}

export interface ResultadoValidacionCommit {
  aceptadas: FilaChequeoAprobada[];
  rechazadas: FilaRechazadaCommit[];
}

/**
 * Revalida cada fila ENVIADA por el cliente contra un diff RECIÉN calculado
 * (`diffFresco`, construido por el handler llamando de nuevo a
 * `construirDiffChequeo` con el estado actual de `hato_animales`/
 * `hato_chequeo_vacas` -- nunca reutiliza el diff que generó la vista
 * previa). Si el hato cambió entre tanto (alguien más aprobó otro chequeo
 * que tocó al mismo animal, o la ficha fue editada) y una fila que ERA
 * `sin_cambio`/`cambio` degradó a otra clasificación, esa fila se rechaza --
 * el commit nunca escribe con un `animal_id` que ya no es válido en el
 * momento de escribir.
 */
export function validarFilasCommit(
  filasEnviadas: FilaChequeoNormalizada[],
  diffFresco: ResultadoDiffChequeo,
): ResultadoValidacionCommit {
  const diffPorFila = new Map(diffFresco.filas.map((f) => [f.fila, f]));
  const aceptadas: FilaChequeoAprobada[] = [];
  const rechazadas: FilaRechazadaCommit[] = [];

  for (const fila of filasEnviadas) {
    const diffFila = diffPorFila.get(fila.fila);
    if (!diffFila) {
      rechazadas.push({
        fila: fila.fila,
        numero: fila.numero,
        motivo: 'La fila no aparece en el diff recalculado contra el estado actual del hato -- vuelve a generar la vista previa antes de aprobar.',
      });
      continue;
    }
    if (!CLASIFICACIONES_ESCRIBIBLES.has(diffFila.clasificacion)) {
      rechazadas.push({
        fila: fila.fila,
        numero: fila.numero,
        motivo:
          `La fila pasó a clasificarse como '${diffFila.clasificacion}' desde que se generó la vista previa` +
          (diffFila.motivoNoReconocido ? ` (${diffFila.motivoNoReconocido})` : '') +
          ' -- el hato cambió entre la vista previa y la aprobación; vuelve a generar el diff y revisa de nuevo.',
      });
      continue;
    }
    if (!diffFila.animalId) {
      // Defensivo -- no debería ocurrir para `sin_cambio`/`cambio` (siempre
      // traen `animalId`, ver `diffChequeo.ts`), pero un commit nunca debe
      // escribir `animal_id: null` en una tabla que lo exige NOT NULL.
      rechazadas.push({
        fila: fila.fila,
        numero: fila.numero,
        motivo: 'La fila no resolvió a un animal_id en el estado fresco del hato.',
      });
      continue;
    }
    aceptadas.push({ fila, animalId: diffFila.animalId });
  }

  return { aceptadas, rechazadas };
}

// ============================================================================
// 2. Fila aprobada -> forma insertable de `hato_chequeo_vacas` (migración 053
//    + capa `estado` de la migración 062).
// ============================================================================

export type EstadoChequeoInsertable = 'vacia_apta' | 'vacia_problema' | 'fecha_heredada' | 'desconocido' | null;

export interface FilaVacaInsertable {
  animal_id: string;
  pl_raw: string | null;
  np_raw: string | null;
  ultima_cria_raw: string | null;
  sx_raw: string | null;
  fecha_servicio_raw: string | null;
  toro_raw: string | null;
  tp_raw: string | null;
  estado_raw: string | null;
  secar_raw: string | null;
  pp_raw: string | null;
  ttto_raw: string | null;
  pl: number | null;
  num_partos: number | null;
  fecha_servicio: string | null;
  toro: string | null;
  tipo_servicio: 'monta' | 'inseminacion' | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  estado: EstadoChequeoInsertable;
  normalizacion_issues: ParseIssue[] | null;
}

/**
 * Fila aprobada -> forma insertable de `hato_chequeo_vacas`. La capa cruda
 * (`*_raw`) se copia VERBATIM desde `fila.raw` -- nunca se reinterpreta ni
 * se descarta, incluso si el valor es `#VALUE!` o una celda vacía (`null`).
 * `fecha_servicio` es la ÚLTIMA fecha de servicio de la lista (V7: la fila
 * puede traer 2-3 intentos, el vigente es siempre el más reciente -- mismo
 * criterio que `scripts/import-hato/load.ts` y `diffChequeo.ts`). `estado`
 * traduce el `'vacio'` del motor (celda sin dato) a `NULL` de la BD -- el
 * CHECK de la migración 062 ni siquiera acepta `'vacio'` como valor, y "sin
 * dato" nunca se confunde con "vacía apta" (regla dura del módulo).
 */
export function construirFilasVacas(aprobadas: FilaChequeoAprobada[]): FilaVacaInsertable[] {
  return aprobadas.map(({ fila, animalId }) => ({
    animal_id: animalId,
    pl_raw: fila.raw.pl,
    np_raw: fila.raw.np,
    ultima_cria_raw: fila.raw.ultimaCria,
    sx_raw: fila.raw.sx,
    fecha_servicio_raw: fila.raw.fechaServicio,
    toro_raw: fila.raw.toro,
    tp_raw: fila.raw.tp,
    estado_raw: fila.raw.estado,
    secar_raw: fila.raw.secar,
    pp_raw: fila.raw.pp,
    ttto_raw: fila.raw.ttto,
    pl: fila.pl,
    num_partos: fila.numPartos,
    fecha_servicio: fila.fechasServicio.at(-1) ?? null,
    toro: fila.toroNombre,
    tipo_servicio: fila.tipoServicio,
    fecha_secar: fila.fechaSecar,
    fecha_probable_parto: fila.fechaProbableParto,
    estado: fila.estado === null || fila.estado === 'vacio' ? null : fila.estado,
    normalizacion_issues: fila.issues.length > 0 ? fila.issues : null,
  }));
}

// ============================================================================
// 3. Filas aprobadas -> eventos derivados (`hato_eventos`), vía el motor
//    compartido `descomponerSX` -- NUNCA un segundo decompositor.
// ============================================================================

export interface EventoConIndice extends EventoDerivado {
  /** Posición (0-based) de la fila padre dentro del MISMO arreglo de
   * `aprobadas` que recibió `construirFilasVacas` -- el handler alinea este
   * índice con `vacas[vacaIndice]` para que la RPC pueda wirear
   * `chequeo_vaca_id` una vez inserte esa fila (las filas de
   * `hato_chequeo_vacas` no existen todavía cuando este módulo corre). */
  vacaIndice: number;
}

export interface ResultadoDerivacionEventos {
  eventos: EventoConIndice[];
  issues: ParseIssue[];
}

/** Una fila histórica de `hato_chequeo_vacas` -- solo lo que
 * `seleccionarUltimaCriaAnteriorPorAnimal` necesita (identidad + fecha del
 * chequeo al que pertenece + su `ultima_cria_raw` VERBATIM). El handler I/O
 * (`hato-chequeo-commit.ts`) arma este arreglo con una consulta a
 * `hato_chequeo_vacas` unida a `hato_chequeos`, la misma fuente que ya usa
 * para el diff -- este módulo sigue sin tocar Supabase. */
export interface FilaUltimaCriaHistorico {
  animalId: string;
  chequeoFecha: string;
  ultimaCriaRaw: string | null;
}

/**
 * Reduce el historial de `hato_chequeo_vacas` de varios animales al último
 * `ultima_cria_raw` CONOCIDO estrictamente ANTES de `chequeoNuevoFecha`, ya
 * parseado con `parseUltimaCria` -- lo que `descomponerSX` necesita como
 * `ultimaCriaAnterior` para decidir si un parto ya fue registrado en un
 * chequeo previo (ver `decidirEventoParto` en `calculosHato.ts`). Un animal
 * sin ningún chequeo anterior a esa fecha no aparece en el mapa resultante
 * (equivalente a `undefined` -- "no hay Última Cría anterior conocida",
 * nunca se inventa un valor).
 */
export function seleccionarUltimaCriaAnteriorPorAnimal(
  historico: FilaUltimaCriaHistorico[],
  chequeoNuevoFecha: string,
): Map<string, string | null> {
  const masRecientePorAnimal = new Map<string, FilaUltimaCriaHistorico>();
  for (const fila of historico) {
    if (fila.chequeoFecha >= chequeoNuevoFecha) continue; // solo estrictamente ANTERIOR
    const actual = masRecientePorAnimal.get(fila.animalId);
    if (!actual || fila.chequeoFecha > actual.chequeoFecha) {
      masRecientePorAnimal.set(fila.animalId, fila);
    }
  }
  const resultado = new Map<string, string | null>();
  for (const [animalId, fila] of masRecientePorAnimal) {
    resultado.set(animalId, parseUltimaCria(fila.ultimaCriaRaw).fecha);
  }
  return resultado;
}

/**
 * Deriva los eventos de `hato_eventos` de cada fila aprobada, reusando
 * `descomponerSX` (mismo motor que `Load` y la captura en vivo). Una fila
 * sin `sx` interpretable (`fila.sx === null`, celda vacía) o sin
 * `chequeoFecha` resuelta no puede anclar temporalmente un evento -- se
 * omite sin generar un evento inventado, mismo criterio que
 * `scripts/import-hato/load.ts` Paso 5.
 *
 * `ultimaCriaAnteriorPorAnimal` (default vacío -- compatible con llamadas
 * existentes que no lo traen) es el mapa que arma el handler con
 * `seleccionarUltimaCriaAnteriorPorAnimal`; la Última Cría de ESTA fila se
 * parsea aquí mismo desde `fila.raw.ultimaCria` (capa cruda), nunca se le
 * pide al caller que la parsee dos veces.
 *
 * Colapso de partos CERCANOS (decisión del dueño, 2026-07-23, ver
 * `calculosHato.ts::agruparPartosPorProximidad`/`decidirEventoParto`): como
 * este commit procesa UN chequeo nuevo a la vez, `descomponerSX` ya decide
 * -- comparando la Última Cría de esta fila contra `ultimaCriaAnteriorPorAnimal`
 * con un umbral de proximidad, no solo igualdad exacta -- si esta lectura es
 * el MISMO nacimiento que la última conocida y, de serlo, suprime el evento
 * y deja un issue de revisión. Lo que este commit NO puede hacer es corregir
 * retroactivamente la FECHA de un evento `parto` que un chequeo ANTERIOR ya
 * insertó: `fn_hato_commit_chequeo` (migración 065) solo limpia/inserta
 * filas del chequeo que se está aprobando, nunca toca eventos de otros
 * chequeos. Así que, para una vaca cuya Última Cría oscila en visitas
 * sucesivas, el evento sobreviviente queda fechado a la lectura del PRIMER
 * chequeo del cluster (no a la más reciente/refinada) hasta que alguien
 * corrija esa fecha a mano o se vuelva a correr el recompute batch
 * (`scripts/import-hato/recompute-partos-cercanos.ts`) contra el estado
 * fresco de producción -- el issue que deja `descomponerSX` es precisamente
 * la señal para eso. Cerrar esa brecha con una escritura automática exigiría
 * que el commit pudiera actualizar un evento de un chequeo distinto al que
 * se está aprobando -- un cambio de contrato de `fn_hato_commit_chequeo`,
 * decisión de CTO, fuera del alcance de este fix.
 */
export function derivarEventosDeChequeo(
  aprobadas: FilaChequeoAprobada[],
  ultimaCriaAnteriorPorAnimal: Map<string, string | null> = new Map(),
): ResultadoDerivacionEventos {
  const eventos: EventoConIndice[] = [];
  const issues: ParseIssue[] = [];

  aprobadas.forEach(({ fila, animalId }, vacaIndice) => {
    if (fila.sx === null || fila.chequeoFecha === null) return;

    const { eventos: eventosFila, issues: issuesFila } = descomponerSX({
      chequeoFecha: fila.chequeoFecha,
      sx: fila.sx,
      fechasServicio: fila.fechasServicio,
      toroNombre: fila.toroNombre ?? undefined,
      tipoServicio: fila.tipoServicio ?? undefined,
      ultimaCria: parseUltimaCria(fila.raw.ultimaCria).fecha,
      ultimaCriaAnterior: ultimaCriaAnteriorPorAnimal.get(animalId),
      // `huboPartoConfirmado` deliberadamente undefined -- el diff de B0/V10
      // no tiene forma de saberlo (mismo motivo que Load); `descomponerSX`
      // ya deja un issue explícito para el caso ambiguo `o_mas`.
    });

    for (const evento of eventosFila) eventos.push({ ...evento, vacaIndice });
    issues.push(...issuesFila);
  });

  return { eventos, issues };
}

// ============================================================================
// 4. Ensamblado del payload determinístico para `fn_hato_commit_chequeo`
//    (migración 065).
// ============================================================================

export interface EventoInsertablePayload {
  vaca_index: number;
  tipo: string;
  fecha: string;
  fecha_confianza: string;
  tipo_servicio: string | null;
  toro_id: string | null;
  cria_destino: string | null;
  sx_raw: string | null;
  datos: Record<string, unknown> | null;
}

export interface PayloadCommitChequeo {
  chequeo: { fecha: string; veterinario: string | null };
  vacas: FilaVacaInsertable[];
  eventos: EventoInsertablePayload[];
}

/** Normaliza un nombre de toro a la misma clave que usa `toroIdPorNombre`
 * (case-insensitive, sin espacios sobrantes) -- el handler resuelve esos IDs
 * contra `hato_toros` (índice único `lower(nombre)`, migración 053). */
function claveToro(nombre: string): string {
  return nombre.trim().toLowerCase();
}

/**
 * Ensambla el JSON determinístico que viaja como `payload` a la RPC
 * `fn_hato_commit_chequeo`. `toroIdPorNombre` ya viene resuelto por el
 * handler (SELECT-o-INSERT en `hato_toros`, I/O) -- este módulo solo hace el
 * lookup, nunca toca Supabase. Determinístico: la misma entrada produce
 * siempre el mismo payload (mismo orden de `vacas`/`eventos`, ningún
 * `Date.now()`/aleatoriedad).
 */
export function construirPayloadCommit(
  chequeo: { fecha: string; veterinario?: string | null },
  vacas: FilaVacaInsertable[],
  eventos: EventoConIndice[],
  toroIdPorNombre: Map<string, string>,
): PayloadCommitChequeo {
  return {
    chequeo: { fecha: chequeo.fecha, veterinario: chequeo.veterinario ?? null },
    vacas,
    eventos: eventos.map((evento) => ({
      vaca_index: evento.vacaIndice,
      tipo: evento.tipo,
      fecha: evento.fecha,
      fecha_confianza: evento.fecha_confianza,
      tipo_servicio: evento.tipo_servicio ?? null,
      toro_id: evento.toro_nombre ? toroIdPorNombre.get(claveToro(evento.toro_nombre)) ?? null : null,
      cria_destino: evento.cria_destino ?? null,
      sx_raw: evento.sx_raw ?? null,
      datos: evento.datos ?? null,
    })),
  };
}
