// ARCHIVO: src/supabase/functions/server/importHato/diffChequeo.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/diffChequeo.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/diffChequeo.ts
// DESCRIPCIÓN: Lógica pura del diff que revisa Martha antes de aprobar la
// carga de un chequeo nuevo (B0/V10, plan docs/plan_hato_lechero_module.md
// §7.4 "Import recurrente por chequeo"). Compara cada fila ya resuelta por
// Extract+Normalize (`normalizarHojas`, ver `normalizar.ts`) contra el
// estado ACTUAL de la base -- `hato_animales` (por `numero`) y la fila MÁS
// RECIENTE de `hato_chequeo_vacas` de ese animal -- y clasifica cada fila:
// `nuevo` (chapeta que no existe en el hato) / `sin_cambio` / `cambio` (con
// diferencia campo a campo) / `no_reconocido` (fila que no se puede resolver
// a un animal con confianza).
//
// Puro, cero I/O: el handler del endpoint (`POST
// .../hato/chequeo/preview`, Deno) hace las dos consultas a Supabase, les da
// esta forma plana y le pasa el resultado a `construirDiffChequeo`. Este
// módulo nunca ve un cliente de Supabase, nunca escribe nada -- el diff es
// SOLO para aprobar, el endpoint nunca comete un `INSERT`/`UPDATE` (plan
// §7.4: "nunca commit directo").
//
// Contrato de identidad (plan §7.4): a diferencia del pipeline histórico
// (`resolver.ts`, que reconcilia 45 hojas de 7 años), acá la resolución es
// TRIVIAL porque el hato ya está poblado -- se matchea por `numero`, alta
// confianza, SIN heurística de nombre. Un número que cae en el rango
// reservado a chapetas provisionales de la importación histórica (900-999,
// `overridesChapeta.ts`) NUNCA se presenta como una chapeta física real --
// se marca `no_reconocido` con el motivo explícito (`esNumeroProvisional`).
//
// Regla dura heredada de todo el pipeline: nada ambiguo se resuelve en
// silencio. `issues[]` de la fila normalizada sobrevive intacto en el diff
// sin importar la clasificación, y una colisión de chapeta DENTRO de la
// misma hoja subida (mismo número, nombres distintos) nunca se le adjudica
// a ninguna de las dos filas -- ambas quedan `no_reconocido` para que un
// humano decida, mismo criterio que `detectarColisionesChapeta` en
// `calculosHato.ts`.

import type { AnimalEnChequeo } from '../calculos-hato.ts';
import { detectarColisionesChapeta } from '../calculos-hato.ts';
import { esNumeroProvisional } from './overridesChapeta.ts';
import type { FilaChequeoNormalizada, ParseIssue, TipoEstado } from './tipos.ts';

/** Snapshot de `hato_animales` para UN animal -- lo mínimo que el diff
 * necesita para matchear por número y comparar nombre. El handler decide
 * qué columnas pedirle a Supabase; este tipo es el contrato de forma. */
export interface AnimalHatoActual {
  id: string;
  numero: number;
  nombre: string | null;
  etapa: 'ternera' | 'novilla' | 'vaca' | 'toro';
  estado: 'activa' | 'vendida' | 'muerta' | 'descartada';
}

/** Una fila histórica de `hato_chequeo_vacas` (una por `hato_chequeos`),
 * ya aplanada con la fecha del chequeo al que pertenece -- lo que necesita
 * `seleccionarUltimoChequeoPorAnimal` para elegir la más reciente por
 * animal. `createdAt` es el desempate cuando dos filas resuelven a la MISMA
 * `chequeoFecha` (no debería pasar en datos limpios, pero un chequeo
 * `borrador` reeditado sí podría producirlo). */
export interface FilaChequeoVacaHistorico {
  animalId: string;
  chequeoFecha: string;
  createdAt: string;
  pl: number | null;
  numPartos: number | null;
  fechaServicio: string | null;
  toro: string | null;
  tipoServicio: 'monta' | 'inseminacion' | null;
  fechaSecar: string | null;
  fechaProbableParto: string | null;
  estado: TipoEstado | null;
}

/** La fila de `hato_chequeo_vacas` MÁS RECIENTE de un animal -- lo que el
 * diff compara contra la fila recién subida. Sin `chequeoFecha`/`createdAt`
 * de desempate: eso ya se resolvió al construir este valor. */
export interface UltimoChequeoVacaActual {
  animalId: string;
  chequeoFecha: string | null;
  pl: number | null;
  numPartos: number | null;
  fechaServicio: string | null;
  toro: string | null;
  tipoServicio: 'monta' | 'inseminacion' | null;
  fechaSecar: string | null;
  fechaProbableParto: string | null;
  estado: TipoEstado | null;
}

/** Reduce el historial completo de `hato_chequeo_vacas` de varios animales a
 * UNA fila por `animalId`: la de fecha de chequeo más reciente (desempatada
 * por `createdAt` cuando dos filas comparten fecha). Puro -- no ordena la
 * entrada, no asume que ya viene ordenada. */
export function seleccionarUltimoChequeoPorAnimal(filas: FilaChequeoVacaHistorico[]): UltimoChequeoVacaActual[] {
  const masReciente = new Map<string, FilaChequeoVacaHistorico>();
  for (const fila of filas) {
    const actual = masReciente.get(fila.animalId);
    if (!actual || esMasReciente(fila, actual)) {
      masReciente.set(fila.animalId, fila);
    }
  }
  return [...masReciente.values()].map((f) => ({
    animalId: f.animalId,
    chequeoFecha: f.chequeoFecha,
    pl: f.pl,
    numPartos: f.numPartos,
    fechaServicio: f.fechaServicio,
    toro: f.toro,
    tipoServicio: f.tipoServicio,
    fechaSecar: f.fechaSecar,
    fechaProbableParto: f.fechaProbableParto,
    estado: f.estado,
  }));
}

function esMasReciente(candidata: FilaChequeoVacaHistorico, actual: FilaChequeoVacaHistorico): boolean {
  if (candidata.chequeoFecha !== actual.chequeoFecha) return candidata.chequeoFecha > actual.chequeoFecha;
  return candidata.createdAt > actual.createdAt;
}

export type ClasificacionFilaDiff = 'nuevo' | 'sin_cambio' | 'cambio' | 'no_reconocido';

export interface CampoDiffChequeo {
  campo: string;
  anterior: unknown;
  nuevo: unknown;
}

export interface FilaDiffChequeo {
  fila: number;
  numero: number | null;
  nombre: string | null;
  clasificacion: ClasificacionFilaDiff;
  /** `null` salvo cuando la fila matcheó un animal existente (`sin_cambio`/`cambio`). */
  animalId: string | null;
  /** `true` si `numero` cae en el rango 900-999 -- NUNCA se muestra como
   * chapeta física, sea porque la fila lo trae así o porque el animal que
   * matcheó quedó cargado con un número de trabajo pendiente de desempate. */
  numeroEsProvisional: boolean;
  /** Fecha del último chequeo conocido de este animal ANTES de esta subida,
   * para que la revisión sepa qué tan viejo es el "antes" de cada campo.
   * `null` si el animal no tenía chequeo previo o es `nuevo`. */
  ultimoChequeoFecha: string | null;
  diferencias: CampoDiffChequeo[];
  motivoNoReconocido: string | null;
  issues: ParseIssue[];
}

export interface ResumenDiffChequeo {
  totalFilas: number;
  nuevos: number;
  sinCambio: number;
  cambios: number;
  noReconocidos: number;
  /** Filas con al menos un `issue` de normalización, sea cual sea su
   * clasificación -- independiente de `noReconocidos` (una fila puede tener
   * issues y aun así resolverse a un animal). */
  conIssues: number;
}

export interface ResultadoDiffChequeo {
  filas: FilaDiffChequeo[];
  resumen: ResumenDiffChequeo;
  /** Chapetas repetidas DENTRO de la hoja subida con nombres distintos --
   * ninguna de las filas involucradas se adjudica sola, ver cabecera. */
  colisionesEnHoja: ReturnType<typeof detectarColisionesChapeta>;
}

/** `TipoEstado` incluye `'vacio'` para "celda sin dato" (nunca `null` en el
 * tipo del motor, S2), pero la columna normalizada de la BD (migración 062)
 * usa `NULL` para lo mismo. Normaliza ambos vocabularios al de la BD antes
 * de comparar, para que "esta vez no se llenó ESTADO" nunca se confunda con
 * un cambio de valor real. */
function normalizarEstadoParaDiff(estado: TipoEstado | null): TipoEstado | null {
  if (estado === null || estado === 'vacio') return null;
  return estado;
}

function campoDiff(campo: string, anterior: unknown, nuevo: unknown): CampoDiffChequeo | null {
  const a = anterior ?? null;
  const n = nuevo ?? null;
  if (a === n) return null;
  return { campo, anterior: a, nuevo: n };
}

function compararFila(
  fila: FilaChequeoNormalizada,
  animal: AnimalHatoActual,
  ultimo: UltimoChequeoVacaActual | undefined,
): CampoDiffChequeo[] {
  const fechaServicioVigente = fila.fechasServicio.at(-1) ?? null;
  const estadoAnterior = normalizarEstadoParaDiff(ultimo?.estado ?? null);
  const estadoNuevo = normalizarEstadoParaDiff(fila.estado);

  const campos: Array<[string, unknown, unknown]> = [
    ['nombre (planilla vs. sistema)', animal.nombre, fila.nombre],
    ['PL', ultimo?.pl ?? null, fila.pl],
    ['número de partos', ultimo?.numPartos ?? null, fila.numPartos],
    ['fecha de servicio', ultimo?.fechaServicio ?? null, fechaServicioVigente],
    ['toro', ultimo?.toro ?? null, fila.toroNombre],
    ['tipo de servicio', ultimo?.tipoServicio ?? null, fila.tipoServicio],
    ['fecha de secado (derivada)', ultimo?.fechaSecar ?? null, fila.fechaSecar],
    ['fecha probable de parto (derivada)', ultimo?.fechaProbableParto ?? null, fila.fechaProbableParto],
    ['estado', estadoAnterior, estadoNuevo],
  ];

  const diferencias: CampoDiffChequeo[] = [];
  for (const [campo, anterior, nuevo] of campos) {
    const d = campoDiff(campo, anterior, nuevo);
    if (d) diferencias.push(d);
  }
  return diferencias;
}

function filaNoReconocida(fila: FilaChequeoNormalizada, numeroEsProvisional: boolean, motivo: string): FilaDiffChequeo {
  return {
    fila: fila.fila,
    numero: fila.numero,
    nombre: fila.nombre,
    clasificacion: 'no_reconocido',
    animalId: null,
    numeroEsProvisional,
    ultimoChequeoFecha: null,
    diferencias: [],
    motivoNoReconocido: motivo,
    issues: fila.issues,
  };
}

/**
 * Construye el diff de una hoja de chequeo ya normalizada contra el estado
 * actual del hato. `animales`/`ultimosChequeos` son la forma plana que el
 * handler del endpoint arma con dos consultas a Supabase (`hato_animales` +
 * `hato_chequeo_vacas` reducida vía `seleccionarUltimoChequeoPorAnimal`).
 */
export function construirDiffChequeo(
  filas: FilaChequeoNormalizada[],
  animales: AnimalHatoActual[],
  ultimosChequeos: UltimoChequeoVacaActual[],
): ResultadoDiffChequeo {
  const animalesPorNumero = new Map<number, AnimalHatoActual>();
  for (const a of animales) animalesPorNumero.set(a.numero, a);

  const ultimoPorAnimalId = new Map<string, UltimoChequeoVacaActual>();
  for (const u of ultimosChequeos) ultimoPorAnimalId.set(u.animalId, u);

  // Colisión DENTRO de la hoja subida (mismo número, nombres distintos) --
  // mismo motor que ya protege el pipeline histórico. `nombre` nunca es
  // `null` para `AnimalEnChequeo` (la función misma tolera '' y la ignora).
  const colisionesEnHoja = detectarColisionesChapeta(
    filas
      .filter((f): f is FilaChequeoNormalizada & { numero: number } => f.numero !== null)
      .map((f): AnimalEnChequeo => ({ numero: f.numero, nombre: f.nombre ?? '' })),
  );
  const numerosColisionados = new Set(colisionesEnHoja.map((c) => c.numero));

  const filasDiff: FilaDiffChequeo[] = filas.map((fila) => {
    if (fila.numero === null) {
      return filaNoReconocida(
        fila,
        false,
        'La fila no trae número de chapeta -- sin número no se puede resolver la identidad del animal (contrato §7.4: se matchea solo por número, alta confianza).',
      );
    }

    if (esNumeroProvisional(fila.numero)) {
      return filaNoReconocida(
        fila,
        true,
        `El número ${fila.numero} cae en el rango reservado a chapetas provisionales de la importación histórica (900-999, overridesChapeta.ts) -- nunca es una chapeta física. Revisar manualmente a qué animal corresponde.`,
      );
    }

    if (numerosColisionados.has(fila.numero)) {
      return filaNoReconocida(
        fila,
        false,
        `La chapeta ${fila.numero} aparece más de una vez en esta hoja con nombres distintos -- no se puede saber a cuál animal corresponde sin que alguien lo adjudique.`,
      );
    }

    const animal = animalesPorNumero.get(fila.numero);
    if (!animal) {
      return {
        fila: fila.fila,
        numero: fila.numero,
        nombre: fila.nombre,
        clasificacion: 'nuevo',
        animalId: null,
        numeroEsProvisional: false,
        ultimoChequeoFecha: null,
        diferencias: [],
        motivoNoReconocido: null,
        issues: fila.issues,
      };
    }

    const ultimo = ultimoPorAnimalId.get(animal.id);
    const diferencias = compararFila(fila, animal, ultimo);

    return {
      fila: fila.fila,
      numero: fila.numero,
      nombre: fila.nombre,
      clasificacion: diferencias.length > 0 ? 'cambio' : 'sin_cambio',
      animalId: animal.id,
      numeroEsProvisional: esNumeroProvisional(animal.numero),
      ultimoChequeoFecha: ultimo?.chequeoFecha ?? null,
      diferencias,
      motivoNoReconocido: null,
      issues: fila.issues,
    };
  });

  const resumen: ResumenDiffChequeo = {
    totalFilas: filasDiff.length,
    nuevos: filasDiff.filter((f) => f.clasificacion === 'nuevo').length,
    sinCambio: filasDiff.filter((f) => f.clasificacion === 'sin_cambio').length,
    cambios: filasDiff.filter((f) => f.clasificacion === 'cambio').length,
    noReconocidos: filasDiff.filter((f) => f.clasificacion === 'no_reconocido').length,
    conIssues: filasDiff.filter((f) => f.issues.length > 0).length,
  };

  return { filas: filasDiff, resumen, colisionesEnHoja };
}
