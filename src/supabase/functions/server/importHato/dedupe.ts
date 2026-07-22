// ARCHIVO: src/supabase/functions/server/importHato/dedupe.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/dedupe.ts` y volvé a correr el script.
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

import type { CrudoFilaChequeo, FilaChequeoNormalizada, FilaSubtablaNormalizada, ManifiestoHoja } from './tipos.ts';

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
 * -- más seguro conservar ambas que asumir alineación). */
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
    const diferencias = compararHojas(survivor.filas, p.filas);

    if (diferencias.length === 0) {
      // Duplicado real (contenido idéntico ignorando TP): sus filas NO se
      // emiten -- ya viven bajo `survivor`, emitirlas de nuevo doblaría el
      // conteo aguas abajo (Resolve/Load).
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

    // Misma fecha resuelta, contenido DIFERENTE: nunca se elige un ganador
    // por regla (ver cabecera del archivo) -- se conservan las filas de
    // AMBAS hojas con su procedencia completa, y el issue documenta
    // exactamente qué difiere para el checkpoint humano.
    hojas.push({
      ...p.manifest,
      duplicadaDe: claveSurvivor,
      issues: [
        ...p.manifest.issues,
        {
          crudo: '',
          motivo: `hoja resuelve a la MISMA fecha (${fecha}) que '${claveSurvivor}' pero el contenido DIFIERE en ${diferencias.length} punto(s) -- se conservan las filas de ambas hojas, ninguna se descarta ni se elige como ganadora. Diferencias: ${diferencias.join(' | ')}`,
        },
      ],
    });
    chequeos.push(...p.filas);
    subtablas.push(...p.subtablas);
  }

  return { hojas, chequeos, subtablas };
}
