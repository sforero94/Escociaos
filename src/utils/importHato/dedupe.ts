// ARCHIVO: utils/importHato/dedupe.ts
// DESCRIPCIÓN: Deduplicación entre hojas que resuelven a la MISMA
// `chequeoFecha` (las 9 hojas 2019-2020 repetidas entre
// `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` y `chequeo 21 y 22.xlsx`, más los
// casos de `CHEO VETE 2026.xlsx` con título duplicado).
//
// CORRECCIÓN DE DISEÑO (nota del coordinador, sesión S3): el supuesto
// original de "las 9 hojas son duplicados byte-a-byte" es FALSO -- un
// barrido independiente encontró que `CHEQUEO JUNIO 9 2020` difiere en
// EXACTAMENTE una fila (COQUETA #99: PL y última cría distintos) entre los
// dos archivos, y que el archivo "ACTUALIZADO" trae una fecha de última
// cría POSTERIOR a la fecha del propio chequeo -- evidencia de una edición
// tardía, no un error de digitación menor. Por eso el dedupe NUNCA elige un
// ganador por regla cuando el contenido difiere (comparado ignorando TP,
// que varía entre archivos por motivos ajenos al chequeo -- ver
// calculosHato.ts): si dos hojas resuelven a la misma fecha y su contenido
// es funcionalmente idéntico, se conserva solo una (duplicado real); si
// difiere, se conservan las filas de AMBAS con su procedencia completa y un
// issue que documenta EXACTAMENTE qué difiere, para que el checkpoint
// humano (Martha) decida -- nunca en silencio.

import type { CrudoFilaChequeo, FilaChequeoNormalizada, FilaSubtablaNormalizada, ManifiestoHoja } from './tipos';

export interface ProcesadaChequeo {
  archivo: string;
  hoja: string;
  manifest: ManifiestoHoja;
  filas: FilaChequeoNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

const CAMPOS_RAW_COMPARABLES: Array<keyof CrudoFilaChequeo> = [
  'pl',
  'np',
  'ultimaCria',
  'sx',
  'fechaServicio',
  'toro',
  'estado',
  'secar',
  'pp',
  'ttto',
  // 'tp' EXCLUIDO a propósito: es una fórmula TODAY() congelada en el
  // guardado del ARCHIVO, no del chequeo -- comparar TP entre dos copias
  // guardadas en momentos distintos generaría "diferencias" falsas en
  // TODAS las filas de cualquier par, sin relación con el chequeo real
  // (regla dura heredada de calculosHato.ts: TP nunca se lee, tampoco aquí).
];

function claveHoja(p: { archivo: string; hoja: string }): string {
  return `${p.archivo}::${p.hoja}`;
}

/** Firma estable del contenido de una hoja, para deduplicar hojas que NO se
 * pudieron fechar. Usa solo los campos de identidad y de dato, nunca la
 * procedencia (`archivo`/`hoja`/`fila`), que por definición difieren entre dos
 * copias del mismo chequeo en archivos distintos. `tp` queda fuera por la
 * misma razón que en `compararHojas`: es una fórmula `TODAY()` congelada y
 * cambia con el último guardado del archivo, no con el chequeo. */
function firmaContenido(filas: FilaChequeoNormalizada[]): string {
  return JSON.stringify(
    filas.map((f) => [
      f.numero,
      f.nombre,
      f.pl,
      f.numPartos,
      f.fechasServicio,
      f.sx?.crudo ?? null,
      f.estado,
      f.raw.ultimaCria,
      f.raw.secar,
      f.raw.pp,
      f.raw.toro,
      f.raw.ttto,
    ]),
  );
}

function compararFilas(a: FilaChequeoNormalizada, b: FilaChequeoNormalizada): string[] {
  const diferencias: string[] = [];
  if (a.numero !== b.numero) diferencias.push(`numero difiere (${a.numero} vs ${b.numero})`);
  if ((a.nombre ?? '') !== (b.nombre ?? '')) diferencias.push(`nombre difiere ('${a.nombre}' vs '${b.nombre}')`);
  for (const campo of CAMPOS_RAW_COMPARABLES) {
    const va = a.raw[campo];
    const vb = b.raw[campo];
    if ((va ?? '') !== (vb ?? '')) diferencias.push(`campo '${campo}' difiere ('${va}' vs '${vb}')`);
  }
  return diferencias;
}

/** Compara dos hojas fila a fila POR POSICIÓN (mismo orden físico) -- válido
 * porque un duplicado real es literalmente la misma planilla copiada entre
 * archivos, nunca reordenada. Si el número de filas difiere, se considera
 * "no comparable" (tratado como diferencia, nunca como duplicado silencioso
 * -- más seguro conservar ambas que asumir alineación). SOLO se usa hoy como
 * FALLBACK conservador (ver `reconciliarFilasPorAnimal` más abajo) cuando
 * alguna de las dos hojas tiene un (numero, nombre) repetido dentro de sí
 * misma -- ahí no se puede alinear con confianza por identidad de animal. */
function compararHojas(a: FilaChequeoNormalizada[], b: FilaChequeoNormalizada[]): string[] {
  if (a.length !== b.length) {
    return [`distinto número de filas (${a.length} vs ${b.length}) -- no se pudo alinear automáticamente para comparar`];
  }
  const diferencias: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const difFila = compararFilas(a[i], b[i]);
    if (difFila.length > 0) {
      diferencias.push(`fila #${a[i].numero ?? '?'} ${a[i].nombre ?? ''}: ${difFila.join(', ')}`);
    }
  }
  return diferencias;
}

// ============================================================================
// F/U 5 (CLAUDE.md "Known follow-ups" #1 / docs/hato/runbook-load-historico.md
// "Seguimiento pendiente") -- reconciliación POR ANIMAL, no por hoja completa.
//
// Bug real que esto corrige: `chequeo 21 y 22.xlsx` y
// `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` traen cada uno una hoja "CHEQUEO
// JUNIO 9 2020" que resuelve a la MISMA fecha -- casi idéntica, salvo UNA
// fila (COQUETA #99: PL y última cría distintos). Con la comparación
// POR HOJA de arriba, `diferencias.length > 0` (1 fila distinta) hacía que
// se conservaran las filas de AMBAS hojas COMPLETAS -- duplicando ~44
// animales que en realidad eran idénticos, no solo el que difería. Ese
// duplicado masivo fue lo que reventó `UNIQUE(chequeo_id, animal_id)` en
// `hato_chequeo_vacas` durante el primer intento de `Load`, y tuvo que
// limpiarse ahí con `deduplicarPorChequeoYAnimal` (ver `load.ts` y
// CLAUDE.md) -- un segundo dedupe, más tosco (por más-campos-no-nulos, sin
// ver cuál versión es la "correcta"), corriendo DESPUÉS de que el daño ya
// estaba hecho en la salida de Extract.
//
// La reconciliación por animal identifica cada fila por (numero, nombre) --
// la misma identidad que usa `compararFilas` -- y decide POR FILA, nunca por
// hoja completa:
//   - Fila con la MISMA identidad en ambas hojas y contenido idéntico ->
//     duplicado real, no se emite de nuevo (ya vive en la hoja survivor).
//   - Fila con la MISMA identidad pero contenido DISTINTO -> se conservan
//     AMBAS versiones (nunca se elige una "ganadora"), con un issue que
//     documenta exactamente qué difiere -- mismo espíritu que el resto de
//     este archivo.
//   - Fila que solo existe en la hoja candidata (identidad no vista en la
//     survivor) -> no es un duplicado, se agrega igual.
//
// Solo aplica cuando NINGUNA de las dos hojas tiene una identidad
// (numero, nombre) repetida dentro de sí misma -- si la tuviera (ej. una
// colisión de chapeta ya presente en la propia hoja, un caso distinto y
// legítimo), alinear por identidad dejaría de ser confiable, y se cae al
// comportamiento anterior (`compararHojas`, conservador: si difiere en
// cualquier punto, se conservan las filas de ambas hojas completas).

function claveAnimalFila(f: FilaChequeoNormalizada): string {
  return `${f.numero ?? 'SIN_NUMERO'}::${(f.nombre ?? '').trim().toUpperCase()}`;
}

/** `true` si algún (numero, nombre) se repite dentro de las mismas filas --
 * en ese caso no se puede alinear por identidad con confianza (ver cabecera
 * de esta sección). */
function tieneIdentidadesRepetidas(filas: FilaChequeoNormalizada[]): boolean {
  const vistas = new Set<string>();
  for (const f of filas) {
    const clave = claveAnimalFila(f);
    if (vistas.has(clave)) return true;
    vistas.add(clave);
  }
  return false;
}

interface ResultadoReconciliacionFilas {
  /** Filas de la hoja CANDIDATA que sí deben emitirse: nuevas (identidad no
   * vista en la survivor) o divergentes (misma identidad, contenido
   * distinto). Nunca incluye un duplicado exacto de una fila que la hoja
   * survivor ya aporta. */
  filasAEmitir: FilaChequeoNormalizada[];
  /** Una nota legible por cada fila de `filasAEmitir`, para el issue del
   * manifiesto -- nunca se agrega contenido nuevo en silencio. */
  notas: string[];
}

/**
 * Reconcilia dos hojas que resuelven a la MISMA fecha, animal por animal
 * (nunca hoja completa) -- ver la nota grande de cabecera de esta sección.
 * Precondición: ni `filasSurvivor` ni `filasCandidata` tienen una identidad
 * repetida dentro de sí mismas (verificarlo con `tieneIdentidadesRepetidas`
 * ANTES de llamar esta función; si no se cumple, usar el fallback
 * `compararHojas` en su lugar).
 */
function reconciliarFilasPorAnimal(
  filasSurvivor: FilaChequeoNormalizada[],
  filasCandidata: FilaChequeoNormalizada[],
): ResultadoReconciliacionFilas {
  const porClaveSurvivor = new Map<string, FilaChequeoNormalizada>();
  for (const f of filasSurvivor) porClaveSurvivor.set(claveAnimalFila(f), f);

  const filasAEmitir: FilaChequeoNormalizada[] = [];
  const notas: string[] = [];

  for (const candidata of filasCandidata) {
    const clave = claveAnimalFila(candidata);
    const survivorFila = porClaveSurvivor.get(clave);

    if (!survivorFila) {
      filasAEmitir.push(candidata);
      notas.push(`fila #${candidata.numero ?? '?'} ${candidata.nombre ?? ''}: solo presente en esta hoja -- se agrega, no es un duplicado`);
      continue;
    }

    const diferencias = compararFilas(survivorFila, candidata);
    if (diferencias.length === 0) continue; // duplicado real de ESTA fila -- ya vive en la survivor, no se emite de nuevo

    filasAEmitir.push(candidata);
    notas.push(`fila #${candidata.numero ?? '?'} ${candidata.nombre ?? ''}: ${diferencias.join(', ')} -- se conservan AMBAS versiones`);
  }

  return { filasAEmitir, notas };
}

export interface ResultadoDedupe {
  hojas: ManifiestoHoja[];
  chequeos: FilaChequeoNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

/**
 * Agrupa las hojas ya procesadas por `chequeoFecha` resuelta, en el ORDEN de
 * entrada (el runner lee archivos y hojas en orden determinístico -- ver
 * `scripts/import-hato/extract.ts`), y aplica la regla de arriba.
 *
 * Una hoja SIN fecha resuelta cae a una segunda llave: la FIRMA DE CONTENIDO.
 * Evidencia de por qué hace falta (corrida real, 2026-07-22): las dos copias
 * de `CHEQUEO_MARZO_2019` son byte-idénticas entre
 * `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` y `chequeo 21 y 22.xlsx`, pero su
 * título ("CHEQUEO MARZO 2019") no trae día, así que ninguna resuelve fecha
 * y agrupar solo por fecha las dejaba pasar a las dos -- cargando el chequeo
 * de marzo 2019 DOS VECES. Sin fecha no se puede afirmar que dos hojas
 * distintas sean el mismo chequeo, pero sí se puede afirmar que dos hojas
 * con exactamente el mismo contenido lo son.
 */
export function aplicarDedupe(procesadas: ProcesadaChequeo[]): ResultadoDedupe {
  const survivorPorFecha = new Map<string, ProcesadaChequeo>();
  const survivorPorContenido = new Map<string, ProcesadaChequeo>();

  const hojas: ManifiestoHoja[] = [];
  const chequeos: FilaChequeoNormalizada[] = [];
  const subtablas: FilaSubtablaNormalizada[] = [];

  for (const p of procesadas) {
    const fecha = p.manifest.chequeoFecha;
    if (fecha === null) {
      const firma = firmaContenido(p.filas);
      const gemela = survivorPorContenido.get(firma);
      if (!gemela) {
        survivorPorContenido.set(firma, p);
        hojas.push(p.manifest);
        chequeos.push(...p.filas);
        subtablas.push(...p.subtablas);
        continue;
      }
      const claveGemela = claveHoja(gemela);
      hojas.push({
        ...p.manifest,
        duplicadaDe: claveGemela,
        issues: [
          ...p.manifest.issues,
          {
            crudo: `${p.archivo}::${p.hoja}`,
            motivo: `hoja SIN fecha resuelta con contenido idéntico a '${claveGemela}' -- se trata como duplicada por firma de contenido y sus ${p.filas.length} filas no se emiten, para no cargar dos veces el mismo chequeo. Sigue sin poder fecharse: ambas necesitan que alguien confirme el día.`,
          },
        ],
      });
      continue;
    }

    const survivor = survivorPorFecha.get(fecha);
    if (!survivor) {
      survivorPorFecha.set(fecha, p);
      hojas.push(p.manifest);
      chequeos.push(...p.filas);
      subtablas.push(...p.subtablas);
      continue;
    }

    const claveSurvivor = claveHoja(survivor);

    // F/U 5: si CUALQUIERA de las dos hojas tiene una identidad (numero,
    // nombre) repetida dentro de sí misma, alinear por identidad no es
    // confiable -- se cae al comportamiento conservador anterior (comparar
    // la hoja COMPLETA por posición; si difiere en cualquier punto, se
    // conservan las filas de AMBAS hojas enteras). Este es el único camino
    // que queda para ese caso raro; el caso común (el que motivó F/U 5) usa
    // la reconciliación por animal de abajo.
    if (tieneIdentidadesRepetidas(survivor.filas) || tieneIdentidadesRepetidas(p.filas)) {
      const diferencias = compararHojas(survivor.filas, p.filas);

      if (diferencias.length === 0) {
        hojas.push({
          ...p.manifest,
          duplicadaDe: claveSurvivor,
          issues: [
            ...p.manifest.issues,
            {
              crudo: '',
              motivo: `hoja duplicada de '${claveSurvivor}' (contenido idéntico ignorando TP) -- sus ${p.filas.length} filas no se emiten a chequeos[] para evitar doble conteo`,
            },
          ],
        });
        continue;
      }

      hojas.push({
        ...p.manifest,
        duplicadaDe: claveSurvivor,
        issues: [
          ...p.manifest.issues,
          {
            crudo: '',
            motivo: `hoja resuelve a la MISMA fecha (${fecha}) que '${claveSurvivor}' pero el contenido DIFIERE en ${diferencias.length} punto(s) -- alguna de las dos hojas tiene una identidad (numero, nombre) repetida dentro de sí misma, así que no se pudo reconciliar fila a fila con confianza: se conservan las filas de AMBAS hojas completas, ninguna se descarta ni se elige como ganadora. Diferencias: ${diferencias.join(' | ')}`,
          },
        ],
      });
      chequeos.push(...p.filas);
      subtablas.push(...p.subtablas);
      continue;
    }

    // Camino normal: reconciliación POR ANIMAL (ver cabecera de la sección
    // "F/U 5" más arriba) -- nunca hoja completa. Una fila duplicada exacta
    // en ambas hojas no se emite dos veces; una fila que difiere o que solo
    // existe en esta hoja SÍ se emite, con procedencia de ESTA hoja.
    const { filasAEmitir, notas } = reconciliarFilasPorAnimal(survivor.filas, p.filas);

    if (filasAEmitir.length === 0) {
      // Duplicado real, animal por animal -- cubre tanto el caso histórico
      // "contenido idéntico" como el caso nuevo "mismo contenido por animal,
      // pero en distinto orden o cantidad de filas" (que `compararHojas`,
      // por posición, habría marcado como 'distinto número de filas').
      hojas.push({
        ...p.manifest,
        duplicadaDe: claveSurvivor,
        issues: [
          ...p.manifest.issues,
          {
            crudo: '',
            motivo: `hoja duplicada de '${claveSurvivor}' (mismo contenido animal por animal, comparado por numero+nombre) -- sus ${p.filas.length} filas no se emiten a chequeos[] para evitar doble conteo`,
          },
        ],
      });
      continue;
    }

    // Duplicado PARCIAL: solo se emiten las filas que realmente aportan
    // contenido nuevo o divergente -- nunca la hoja completa (ese era
    // exactamente el bug de F/U 5: 1 fila distinta duplicaba ~44 animales
    // idénticos, forzando un segundo dedupe más tosco en `load.ts`).
    hojas.push({
      ...p.manifest,
      duplicadaDe: claveSurvivor,
      issues: [
        ...p.manifest.issues,
        {
          crudo: '',
          motivo: `hoja resuelve a la MISMA fecha (${fecha}) que '${claveSurvivor}' -- ${p.filas.length - filasAEmitir.length} fila(s) son duplicado exacto de la hoja survivor (no se emiten de nuevo) y ${filasAEmitir.length} fila(s) difieren o son exclusivas de esta hoja (SÍ se emiten, con procedencia de esta hoja). Detalle: ${notas.join(' | ')}`,
        },
      ],
    });
    chequeos.push(...filasAEmitir);
    subtablas.push(...p.subtablas);
  }

  return { hojas, chequeos, subtablas };
}
