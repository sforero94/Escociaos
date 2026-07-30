// ARCHIVO: supabase/functions/make-server-1ccce916/importHato/ocrChequeo.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/ocrChequeo.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/ocrChequeo.ts
// DESCRIPCIÓN: Fase 3b de `docs/plan_chequeo_captura_foto.md` -- la ruta
// "carga del chequeo por FOTO". Toda la lógica PURA de esa ruta vive acá; el
// I/O (multipart, Storage, llamada al modelo de visión, consultas a Supabase)
// vive en `hato-chequeo-foto.ts`, en los dos árboles de edge function.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO (plan §5, no negociable):
//
//     El OCR reemplaza ÚNICAMENTE la lectura de la grilla, no el pipeline.
//
// `grilla.ts` convierte un `.xlsx` en una matriz de strings crudos por celda.
// Este módulo hace EXACTAMENTE lo mismo a partir de lo que el modelo de
// visión transcribe, y entrega esa matriz (`HojaCruda`) al MISMO camino de
// normalización (`chequeos.ts` vía `normalizar.ts`) y al MISMO
// `construirDiffChequeo`. Acá NO se interpreta ninguna celda: si el modelo
// lee `"A 206"`, eso viaja como el string `"A 206"` y lo interpreta `parseSX`,
// igual que si viniera del Excel. `parseSX`/`parseToro`/`parseEstado`/
// `parseFechasServicio`/`parseUltimaCria` siguen siendo los únicos intérpretes
// del repo (regla dura del módulo, CLAUDE.md "Hato Lechero").
//
// LAS DOS DEFENSAS QUE SÍ SON RESPONSABILIDAD DE ESTE ARCHIVO:
//
// 1. ANTI-ROW-DRIFT (plan §7, "el fallo más peligroso: el dato de una vaca en
//    la fila de otra"). El servidor SABE qué imprimió: el roster de vacas
//    activas que exportó la planilla. El modelo devuelve, por fila, el `#` y
//    el `Nombre` que lee IMPRESOS; acá se cotejan contra ese roster. Si no
//    cuadran, la fila se marca NO LEÍDA y nunca se desplaza ni se adivina.
//    Deliberadamente el roster NO se le pasa al modelo: si el modelo tuviera
//    la lista de vacas, podría copiarla en vez de leerla y el cotejo se
//    volvería circular (se validaría a sí mismo). El modelo lee papel; el
//    servidor valida contra la verdad.
//
// 2. "SIN DATO, NUNCA 0" APLICADO A LA LECTURA. Una celda que el modelo marca
//    `baja` o `ilegible` entra al pipeline como celda VACÍA + una marca
//    explícita, jamás como un valor adivinado. Es la misma regla que ya rige
//    monitoreo, pesajes y lluvia en este repo.
//
// Puro, cero I/O, cero `Date.now()`: todo lo que depende del reloj o de la red
// lo inyecta el llamador.

import { parseFechaChequeo, type ParseIssue } from '../calculos-hato.ts';
import type { ConfianzaFecha, FilaChequeoNormalizada, HojaCruda } from './tipos.ts';

// ---------------------------------------------------------------------------
// 1. El vocabulario de columnas: la MISMA planilla que se imprime
// ---------------------------------------------------------------------------

/** Confianza que el modelo declara por celda. `ilegible` y `baja` significan
 * lo mismo para el pipeline (la celda no entra), pero se conservan distintas
 * porque le dicen cosas distintas al humano que corrige: `baja` = "leí algo,
 * no me fío"; `ilegible` = "no hay nada legible ahí". */
export type ConfianzaCeldaOcr = 'alta' | 'baja' | 'ilegible';

/** Las 10 columnas de datos de la planilla (las 12 del template menos las dos
 * ANCLAS `#`/`Nombre`, que van impresas y se resuelven contra el roster, no
 * contra lo que el modelo lea). Claves en snake_case: son las que viajan en
 * el JSON del modelo. */
export const COLUMNAS_OCR = [
  'pl',
  'num_partos',
  'ultima_cria',
  'sexo_cria',
  'fecha_servicio',
  'toro',
  'estado',
  'secar',
  'parto_probable',
  'tratamiento',
] as const;

export type ColumnaOcr = (typeof COLUMNAS_OCR)[number];

export const ENCABEZADO_OCR_NUMERO = '#';
export const ENCABEZADO_OCR_NOMBRE = 'Nombre';

/** Encabezado impreso EXACTO de cada columna. Debe coincidir carácter por
 * carácter con `ENCABEZADOS_PLANILLA_CHEQUEO`
 * (`src/utils/hato/exportarPlanillaChequeo.ts`) -- de ahí salen los alias
 * B5.3 que `grilla.ts` reconoce, así que un desfase silencioso dejaría el
 * colmap a medias y perdería columnas enteras sin error.
 *
 * Por qué se re-declara en vez de importarse: este archivo se ESPEJA a los
 * dos árboles de edge function (`docs/hato/regenerar-copias-importhato.py`) y
 * el generador solo sabe reescribir imports de `@/utils/calculosHato` y
 * relativos `./xxx`. Importar `@/utils/hato/exportarPlanillaChequeo` rompería
 * el espejo. El desfase lo atrapa un test que compara ambas listas
 * (`importHatoOcrChequeo.test.ts`), no la buena fe. */
export const ENCABEZADO_POR_COLUMNA_OCR: Record<ColumnaOcr, string> = {
  pl: 'PL',
  num_partos: '# Partos',
  ultima_cria: 'Última Cría',
  sexo_cria: 'Sexo cría',
  fecha_servicio: 'Fecha Servicio',
  toro: 'Toro',
  estado: 'Estado',
  secar: 'Secar',
  parto_probable: 'Parto Probable',
  tratamiento: 'Tratamiento',
};

/** La fila de encabezado que se escribe en la matriz cruda, en el mismo orden
 * que la planilla impresa. */
export const ENCABEZADOS_HOJA_OCR: readonly string[] = [
  ENCABEZADO_OCR_NUMERO,
  ENCABEZADO_OCR_NOMBRE,
  ...COLUMNAS_OCR.map((c) => ENCABEZADO_POR_COLUMNA_OCR[c]),
];

/** Índice 0-based de la fila de encabezado dentro de la matriz que arma
 * `procesarLecturaOcr`: fila 0 = título, fila 1 = encabezado, fila 2+ = datos.
 * Misma estructura que el `.xlsx` que exporta la app, para que
 * `localizarFilaEncabezado` la encuentre sin ninguna regla nueva. */
export const FILA_ENCABEZADO_HOJA_OCR = 1;

// ---------------------------------------------------------------------------
// 2. Lo que el modelo devuelve
// ---------------------------------------------------------------------------

export interface CeldaOcr {
  /** Transcripción VERBATIM de lo que el modelo ve. Nunca interpretada acá. */
  texto: string;
  confianza: ConfianzaCeldaOcr;
}

export interface FilaOcr {
  /** 1-based: cuál de las fotos subidas. Lo pone el servidor, no el modelo
   * (una llamada por foto), así que no puede confundirse. */
  pagina: number;
  /** 1-based: posición de la fila dentro de esa foto, de arriba hacia abajo. */
  orden: number;
  /** El `#` IMPRESO que el modelo lee en esa fila. Ancla, no dato. */
  numeroImpreso: string;
  /** El `Nombre` IMPRESO que el modelo lee en esa fila. Segunda ancla. */
  nombreImpreso: string;
  celdas: Record<ColumnaOcr, CeldaOcr>;
}

export interface LecturaOcrPagina {
  pagina: number;
  /** Título manuscrito/impreso que el modelo alcance a leer en la hoja (p. ej.
   * "CHEQUEO 12 AGOSTO 2026"). SUGERENCIA, nunca la fecha del chequeo: ver
   * `sugerirFechaChequeo`. */
  tituloLeido: string | null;
  filas: FilaOcr[];
  /** Notas de forma detectadas al parsear la respuesta (campos faltantes,
   * confianzas inválidas). Nunca se corrigen en silencio. */
  avisos: string[];
}

function celdaIlegible(): CeldaOcr {
  return { texto: '', confianza: 'ilegible' };
}

function celdasVacias(): Record<ColumnaOcr, CeldaOcr> {
  const salida = {} as Record<ColumnaOcr, CeldaOcr>;
  for (const col of COLUMNAS_OCR) salida[col] = celdaIlegible();
  return salida;
}

function textoPlano(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

function normalizarConfianza(valor: unknown, avisos: string[], contexto: string): ConfianzaCeldaOcr {
  if (valor === 'alta' || valor === 'baja' || valor === 'ilegible') return valor;
  // Degradar SIEMPRE hacia lo cauteloso: una confianza que no entendemos no
  // puede convertirse en un valor que entra al pipeline como si fuera bueno.
  avisos.push(`${contexto}: confianza '${String(valor)}' no reconocida -- se degradó a 'ilegible'`);
  return 'ilegible';
}

/**
 * Convierte el JSON crudo que devolvió el modelo (ya des-serializado) en una
 * `LecturaOcrPagina`. Tolerante por diseño: una fila mal formada NUNCA aborta
 * la página entera -- se conserva con lo que se pueda leer y el resto queda
 * `ilegible`, que es exactamente lo que el flujo de corrección espera ver.
 * Lo único que sí es fatal es que `filas` no sea un arreglo: ahí no hay nada
 * que rescatar y devolver "0 filas" en silencio se leería como "la foto no
 * tenía vacas".
 */
export function parsearRespuestaModeloOcr(bruto: unknown, pagina: number): LecturaOcrPagina {
  const avisos: string[] = [];
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error(`La respuesta del modelo para la foto ${pagina} no es un objeto JSON.`);
  }
  const raiz = bruto as Record<string, unknown>;
  const filasBrutas = raiz.filas;
  if (!Array.isArray(filasBrutas)) {
    throw new Error(`La respuesta del modelo para la foto ${pagina} no trae el arreglo 'filas'.`);
  }

  const tituloLeido = textoPlano(raiz.titulo_leido) || null;

  const filas: FilaOcr[] = filasBrutas.map((filaBruta, i) => {
    const orden = i + 1;
    const contextoFila = `foto ${pagina}, fila ${orden}`;
    if (filaBruta === null || typeof filaBruta !== 'object') {
      avisos.push(`${contextoFila}: la fila no es un objeto -- se descarta su contenido, queda como no leída`);
      return {
        pagina,
        orden,
        numeroImpreso: '',
        nombreImpreso: '',
        celdas: celdasVacias(),
      };
    }
    const fila = filaBruta as Record<string, unknown>;
    const celdasBrutas = (fila.celdas ?? {}) as Record<string, unknown>;
    const celdas = {} as Record<ColumnaOcr, CeldaOcr>;
    for (const col of COLUMNAS_OCR) {
      const celdaBruta = celdasBrutas[col];
      if (celdaBruta === null || celdaBruta === undefined || typeof celdaBruta !== 'object') {
        // Columna ausente en la respuesta: NO es "celda vacía en el papel",
        // es "el modelo no reportó nada". Se marca ilegible para que el
        // humano decida, nunca se asume en blanco.
        celdas[col] = celdaIlegible();
        continue;
      }
      const objeto = celdaBruta as Record<string, unknown>;
      celdas[col] = {
        texto: textoPlano(objeto.texto),
        confianza: normalizarConfianza(objeto.confianza, avisos, `${contextoFila}, columna '${col}'`),
      };
    }
    return {
      pagina,
      orden,
      numeroImpreso: textoPlano(fila.numero_impreso),
      nombreImpreso: textoPlano(fila.nombre_impreso),
      celdas,
    };
  });

  return { pagina, tituloLeido, filas, avisos };
}

// ---------------------------------------------------------------------------
// 3. El roster esperado -- lo que el servidor SABE que imprimió
// ---------------------------------------------------------------------------

/** Un animal tal como lo entrega `v_hato_estado_actual` filtrada a
 * `etapa='vaca' AND estado='activa'` -- el MISMO universo que exporta la
 * planilla (D-A del plan). */
export interface AnimalRosterPlanilla {
  id: string;
  numero: number | null;
  nombre: string | null;
}

export interface EntradaRoster {
  id: string;
  numero: number;
  nombre: string;
  nombreNormalizado: string;
}

export interface RosterPlanilla {
  /** Índice de ancla. Solo animales con chapeta Y nombre: sin las dos cosas
   * no hay ancla que cotejar. */
  porNumero: Map<number, EntradaRoster>;
  /** Chapetas compartidas por más de una vaca activa. La migración 066 las
   * hace imposibles en la BD, pero si aparecieran NO se adjudican solas
   * (regla dura del módulo): cualquier fila con esa chapeta queda no leída. */
  numerosAmbiguos: Set<number>;
  /** Animales del universo impreso que NO pueden anclar una fila (sin chapeta
   * o sin nombre). Se reportan para que nadie los dé por leídos. */
  sinAncla: AnimalRosterPlanilla[];
  /** Todas las entradas anclables, en el orden recibido. */
  entradas: EntradaRoster[];
}

/** Normaliza un nombre para comparar: sin tildes, sin puntuación, sin espacios
 * repetidos, en mayúsculas. NO se usa para escribir nada -- lo que se escribe
 * en la matriz es siempre el nombre canónico del roster. */
export function normalizarNombreParaCotejo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function construirRosterPlanilla(animales: readonly AnimalRosterPlanilla[]): RosterPlanilla {
  const porNumero = new Map<number, EntradaRoster>();
  const numerosAmbiguos = new Set<number>();
  const sinAncla: AnimalRosterPlanilla[] = [];
  const entradas: EntradaRoster[] = [];

  for (const animal of animales) {
    const nombre = (animal.nombre ?? '').trim();
    if (animal.numero === null || animal.numero === undefined || nombre === '') {
      sinAncla.push(animal);
      continue;
    }
    const entrada: EntradaRoster = {
      id: animal.id,
      numero: animal.numero,
      nombre,
      nombreNormalizado: normalizarNombreParaCotejo(nombre),
    };
    entradas.push(entrada);
    if (porNumero.has(animal.numero)) {
      numerosAmbiguos.add(animal.numero);
      continue;
    }
    porNumero.set(animal.numero, entrada);
  }

  return { porNumero, numerosAmbiguos, sinAncla, entradas };
}

// ---------------------------------------------------------------------------
// 4. Validación del ancla (anti-row-drift)
// ---------------------------------------------------------------------------

export type MotivoNoLeida =
  | 'numero_ilegible'
  | 'numero_fuera_del_roster'
  | 'chapeta_ambigua_en_roster'
  | 'nombre_no_corresponde'
  | 'lectura_repetida_divergente';

export interface FilaOcrNoLeida {
  pagina: number;
  orden: number;
  numeroImpreso: string;
  nombreImpreso: string;
  motivo: MotivoNoLeida;
  detalle: string;
  /** Lo que el modelo alcanzó a leer en esa fila. Se devuelve ÍNTEGRO aunque
   * la fila no entre al pipeline: nada se descarta en silencio en este
   * módulo, y el humano puede necesitarlo para decidir. */
  celdas: Record<ColumnaOcr, CeldaOcr>;
}

export type ResultadoAncla =
  | { ok: true; entrada: EntradaRoster; avisos: ParseIssue[] }
  | { ok: false; motivo: MotivoNoLeida; detalle: string };

/** Distancia de edición acotada: si supera `maximo` devuelve `maximo + 1` sin
 * seguir calculando. Solo se usa para tolerar UN carácter de diferencia en un
 * nombre IMPRESO (una `O`/`0`, una `I`/`1`), nunca para emparejar nombres
 * parecidos entre sí. */
export function distanciaEdicionAcotada(a: string, b: string, maximo: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i, ...new Array<number>(b.length).fill(0)];
    let mejorDeLaFila = actual[0];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + costo);
      if (actual[j] < mejorDeLaFila) mejorDeLaFila = actual[j];
    }
    if (mejorDeLaFila > maximo) return maximo + 1;
    anterior = actual;
  }
  return anterior[b.length];
}

/**
 * Cotejo del ancla de UNA fila contra el roster. Este es el corazón del
 * anti-row-drift: el `#` y el `Nombre` que el modelo dice leer IMPRESOS tienen
 * que corresponder al mismo animal del roster. Si no, la fila entera se marca
 * no leída -- nunca se desplaza a la fila de al lado, nunca se adivina.
 *
 * Se tolera UNA diferencia de carácter en el nombre (el nombre va impreso, así
 * que una discrepancia grande no es "OCR imperfecto", es otra vaca), y aun esa
 * tolerancia se cancela si el nombre leído coincide EXACTAMENTE con el de otra
 * vaca del roster: eso ya no es ruido de lectura, es la firma exacta del row
 * drift que estamos cazando.
 */
export function validarAnclaFila(fila: FilaOcr, roster: RosterPlanilla): ResultadoAncla {
  const numeroTexto = fila.numeroImpreso.trim();
  if (!/^\d{1,4}$/.test(numeroTexto)) {
    return {
      ok: false,
      motivo: 'numero_ilegible',
      detalle: `el '#' impreso se leyó como '${fila.numeroImpreso}', que no es una chapeta -- la fila no se puede anclar`,
    };
  }
  const numero = parseInt(numeroTexto, 10);

  if (roster.numerosAmbiguos.has(numero)) {
    return {
      ok: false,
      motivo: 'chapeta_ambigua_en_roster',
      detalle: `la chapeta ${numero} la llevan dos vacas activas -- no se adjudica sola (regla del módulo), la fila queda para revisión humana`,
    };
  }

  const entrada = roster.porNumero.get(numero);
  if (!entrada) {
    return {
      ok: false,
      motivo: 'numero_fuera_del_roster',
      detalle: `la chapeta ${numero} no está entre las vacas activas que se imprimieron -- puede ser una novilla anotada a mano o un número mal leído`,
    };
  }

  const leido = normalizarNombreParaCotejo(fila.nombreImpreso);
  if (leido === '') {
    return {
      ok: false,
      motivo: 'nombre_no_corresponde',
      detalle: `la chapeta ${numero} corresponde a ${entrada.nombre}, pero no se leyó ningún nombre impreso en esa fila -- sin la segunda ancla no se puede descartar que el dato sea de otra vaca`,
    };
  }

  if (leido === entrada.nombreNormalizado) {
    return { ok: true, entrada, avisos: [] };
  }

  // Firma exacta del row drift: el nombre leído es, literalmente, el de OTRA
  // vaca del roster.
  const otra = roster.entradas.find((e) => e.nombreNormalizado === leido && e.numero !== numero);
  if (otra) {
    return {
      ok: false,
      motivo: 'nombre_no_corresponde',
      detalle: `la fila trae la chapeta ${numero} (${entrada.nombre}) pero el nombre leído es '${fila.nombreImpreso}', que es el de la vaca #${otra.numero} -- posible corrimiento de fila, no se procesa`,
    };
  }

  if (distanciaEdicionAcotada(leido, entrada.nombreNormalizado, 1) <= 1) {
    return {
      ok: true,
      entrada,
      avisos: [
        {
          crudo: fila.nombreImpreso,
          motivo: `[ancla] el nombre impreso se leyó como '${fila.nombreImpreso}' y el roster dice '${entrada.nombre}' (una letra de diferencia) -- se ancló a la chapeta ${numero}, revisar`,
        },
      ],
    };
  }

  return {
    ok: false,
    motivo: 'nombre_no_corresponde',
    detalle: `la chapeta ${numero} corresponde a ${entrada.nombre}, pero el nombre impreso se leyó como '${fila.nombreImpreso}' -- no coinciden, la fila no se procesa`,
  };
}

// ---------------------------------------------------------------------------
// 5. De la lectura OCR a la matriz cruda (el reemplazo de `grilla.ts`)
// ---------------------------------------------------------------------------

export interface LecturaFilaConfirmada {
  /** Número de fila 1-based dentro de la matriz -- el MISMO valor que
   * `FilaChequeoNormalizada.fila` tendrá después de `normalizarHojas`, para
   * que la UI pueda unir confianza ↔ fila normalizada sin heurísticas. */
  filaExcel: number;
  pagina: number;
  orden: number;
  animalId: string;
  numero: number;
  nombre: string;
  numeroImpreso: string;
  nombreImpreso: string;
  celdas: Record<ColumnaOcr, CeldaOcr>;
  /** Columnas cuyo texto NO se pasó al pipeline por confianza `baja`/
   * `ilegible`. Entraron como celda vacía y hay que revisarlas a mano. */
  celdasNoConfiables: ColumnaOcr[];
  avisos: ParseIssue[];
}

export interface VacaSinLeer {
  id: string;
  numero: number | null;
  nombre: string | null;
  motivo: 'no_aparecio_en_ninguna_foto' | 'sin_ancla_en_el_roster';
}

export interface OpcionesHojaOcr {
  /** Nombre lógico del "archivo" -- se propaga a la procedencia de cada fila
   * normalizada. NUNCA puede contener 'LECHE': `clasificarHoja` mandaría la
   * hoja entera a 'fuera_de_alcance'. */
  archivo: string;
  /** Nombre lógico de la "hoja". Mismo cuidado que `archivo`, y además NO
   * debe contener mes/año interpretables si no se quiere que
   * `parseFechaChequeo` derive una fecha por su cuenta. */
  hoja: string;
  /** Título de la fila 0. Vacío por defecto: la fecha del chequeo NO se
   * inventa desde la foto (ver `sugerirFechaChequeo` y `aplicarFechaChequeo`). */
  titulo?: string;
}

export interface ResultadoOcrChequeo {
  /** La matriz cruda, lista para `normalizarHojas` -- exactamente la misma
   * forma que produce el lector de `.xlsx`. */
  hoja: HojaCruda;
  filasConfirmadas: LecturaFilaConfirmada[];
  filasNoLeidas: FilaOcrNoLeida[];
  /** Vacas del roster que no aparecieron en ninguna foto. Es el detector de
   * "faltó una página" o "la foto salió cortada": no depende de que un código
   * de página salga legible, sino de la ausencia del dato mismo. */
  vacasSinLeer: VacaSinLeer[];
  /** Títulos que el modelo alcanzó a leer, por foto. Sugerencia, nada más. */
  titulosLeidos: string[];
  advertencias: string[];
}

/** Solo la confianza `alta` pasa al pipeline. `baja` e `ilegible` entran como
 * celda VACÍA + marca: "sin dato, nunca 0" aplicado a la lectura (plan §6.2). */
function textoParaPipeline(celda: CeldaOcr): string {
  return celda.confianza === 'alta' ? celda.texto : '';
}

/** Clave de identidad de una lectura, para detectar la misma vaca leída dos
 * veces (fotos superpuestas). */
function firmaLectura(fila: FilaOcr): string {
  return COLUMNAS_OCR.map((c) => `${c}=${fila.celdas[c].confianza}:${fila.celdas[c].texto}`).join('|');
}

/**
 * Orquestador puro de la ruta foto: valida el ancla de cada fila leída, arma
 * la matriz cruda con las filas confirmadas y reporta lo que quedó afuera.
 *
 * Orden de las filas en la matriz: el de las fotos (página, luego posición).
 * NO se reordena contra el roster -- reordenar sería, precisamente, mover el
 * dato de una vaca a otra posición, que es la clase de error que este archivo
 * existe para evitar. Si el orden leído no coincide con el impreso se emite
 * una advertencia, no una corrección.
 */
export function procesarLecturaOcr(
  paginas: readonly LecturaOcrPagina[],
  roster: RosterPlanilla,
  opciones: OpcionesHojaOcr,
): ResultadoOcrChequeo {
  const filasConfirmadas: LecturaFilaConfirmada[] = [];
  const filasNoLeidas: FilaOcrNoLeida[] = [];
  const advertencias: string[] = [];
  const titulosLeidos: string[] = [];

  // numero -> índice en `filasConfirmadas`, para detectar la misma vaca leída
  // en dos fotos.
  const yaConfirmada = new Map<number, { indice: number; firma: string; fila: FilaOcr }>();
  const rechazadasPorDuplicado = new Set<number>();

  const paginasOrdenadas = [...paginas].sort((a, b) => a.pagina - b.pagina);

  for (const pagina of paginasOrdenadas) {
    if (pagina.tituloLeido) titulosLeidos.push(pagina.tituloLeido);
    advertencias.push(...pagina.avisos.map((a) => `lectura: ${a}`));

    let ultimoNumeroConfirmado: number | null = null;
    let ordenInconsistente = false;

    for (const fila of [...pagina.filas].sort((a, b) => a.orden - b.orden)) {
      const ancla = validarAnclaFila(fila, roster);
      if (!ancla.ok) {
        filasNoLeidas.push({
          pagina: fila.pagina,
          orden: fila.orden,
          numeroImpreso: fila.numeroImpreso,
          nombreImpreso: fila.nombreImpreso,
          motivo: ancla.motivo,
          detalle: ancla.detalle,
          celdas: fila.celdas,
        });
        continue;
      }

      const numero = ancla.entrada.numero;
      const firma = firmaLectura(fila);
      const previa = yaConfirmada.get(numero);
      if (previa) {
        if (previa.firma === firma) {
          // Dos fotos superpuestas que dicen EXACTAMENTE lo mismo: no hay nada
          // que adjudicar, se conserva una sola lectura. (Distinto de decidir
          // entre dos lecturas distintas, que este módulo nunca hace.)
          advertencias.push(
            `la vaca #${numero} (${ancla.entrada.nombre}) aparece en dos fotos con la MISMA lectura -- se conservó una sola`,
          );
          continue;
        }
        // Dos lecturas distintas de la misma vaca: no se elige ninguna.
        rechazadasPorDuplicado.add(numero);
        filasNoLeidas.push({
          pagina: fila.pagina,
          orden: fila.orden,
          numeroImpreso: fila.numeroImpreso,
          nombreImpreso: fila.nombreImpreso,
          motivo: 'lectura_repetida_divergente',
          detalle: `la vaca #${numero} (${ancla.entrada.nombre}) se leyó en dos fotos con datos distintos -- no se adjudica sola, revisar cuál foto corresponde a este chequeo`,
          celdas: fila.celdas,
        });
        continue;
      }

      if (ultimoNumeroConfirmado !== null && numero < ultimoNumeroConfirmado) {
        ordenInconsistente = true;
      }
      ultimoNumeroConfirmado = numero;

      const celdasNoConfiables = COLUMNAS_OCR.filter((c) => fila.celdas[c].confianza !== 'alta');

      yaConfirmada.set(numero, { indice: filasConfirmadas.length, firma, fila });
      filasConfirmadas.push({
        // fila 0 = título, fila 1 = encabezado -> la primera fila de datos es
        // el índice 2 de la matriz, es decir la fila 3 en numeración 1-based
        // (la misma que usa `procesarHojaChequeo`).
        filaExcel: filasConfirmadas.length + FILA_ENCABEZADO_HOJA_OCR + 2,
        pagina: fila.pagina,
        orden: fila.orden,
        animalId: ancla.entrada.id,
        numero,
        nombre: ancla.entrada.nombre,
        numeroImpreso: fila.numeroImpreso,
        nombreImpreso: fila.nombreImpreso,
        celdas: fila.celdas,
        celdasNoConfiables,
        avisos: ancla.avisos,
      });
    }

    if (ordenInconsistente) {
      advertencias.push(
        `en la foto ${pagina.pagina} las chapetas no vienen en orden ascendente como se imprimieron -- puede ser una foto rotada o filas leídas fuera de orden, revisar`,
      );
    }
  }

  // Una vaca cuya SEGUNDA lectura divergió también pierde la primera: si dos
  // fotos se contradicen, ninguna de las dos es "la buena" por haber llegado
  // antes.
  const confirmadasFinales = filasConfirmadas.filter((f) => !rechazadasPorDuplicado.has(f.numero));
  for (const numero of rechazadasPorDuplicado) {
    const primera = filasConfirmadas.find((f) => f.numero === numero);
    if (!primera) continue;
    filasNoLeidas.push({
      pagina: primera.pagina,
      orden: primera.orden,
      numeroImpreso: primera.numeroImpreso,
      nombreImpreso: primera.nombreImpreso,
      motivo: 'lectura_repetida_divergente',
      detalle: `primera lectura de la vaca #${numero} (${primera.nombre}); otra foto la reporta distinta, así que ninguna se procesa`,
      celdas: primera.celdas,
    });
  }
  // Renumerar tras el filtro: la matriz solo lleva las filas que sobreviven,
  // así que `filaExcel` tiene que reflejar la posición REAL o el join
  // confianza ↔ fila normalizada apuntaría a otra vaca.
  confirmadasFinales.forEach((fila, i) => {
    fila.filaExcel = i + FILA_ENCABEZADO_HOJA_OCR + 2;
  });

  const leidas = new Set(confirmadasFinales.map((f) => f.numero));
  const vacasSinLeer: VacaSinLeer[] = [
    ...roster.entradas
      .filter((e) => !leidas.has(e.numero))
      .map((e) => ({
        id: e.id,
        numero: e.numero,
        nombre: e.nombre,
        motivo: 'no_aparecio_en_ninguna_foto' as const,
      })),
    ...roster.sinAncla.map((a) => ({
      id: a.id,
      numero: a.numero,
      nombre: a.nombre,
      motivo: 'sin_ancla_en_el_roster' as const,
    })),
  ];

  const filas: unknown[][] = [
    [opciones.titulo ?? ''],
    [...ENCABEZADOS_HOJA_OCR],
    ...confirmadasFinales.map((fila) => [
      // Las dos anclas se escriben con el valor CANÓNICO del roster, no con lo
      // que el modelo leyó: el cotejo ya demostró que son el mismo animal, y
      // el roster es la fuente de verdad de la identidad. Así ningún ruido de
      // lectura llega a la columna que decide de qué vaca es la fila.
      String(fila.numero),
      fila.nombre,
      ...COLUMNAS_OCR.map((c) => textoParaPipeline(fila.celdas[c])),
    ]),
  ];

  return {
    hoja: { archivo: opciones.archivo, hoja: opciones.hoja, filas },
    filasConfirmadas: confirmadasFinales,
    filasNoLeidas,
    vacasSinLeer,
    titulosLeidos,
    advertencias,
  };
}

// ---------------------------------------------------------------------------
// 6. Fecha del chequeo -- sugerida, nunca inventada
// ---------------------------------------------------------------------------

export interface FechaChequeoSugerida {
  /** Texto crudo del título que el modelo leyó en la foto. */
  textoLeido: string;
  /** Fecha ISO derivada de ese texto, o `null` si no se pudo. */
  fechaIso: string | null;
  confianza: 'alta' | 'media' | 'baja';
  issues: ParseIssue[];
}

/**
 * La ruta foto NO tiene título de hoja confiable: la fecha del chequeo se fija
 * en la ventana de corrección (Fase 3a). Esta función solo devuelve una
 * SUGERENCIA cuando el modelo alcanzó a leer un título escrito en el papel --
 * usando `parseFechaChequeo`, el mismo parser de la ruta `.xlsx`, nunca uno
 * nuevo. El endpoint la devuelve claramente marcada como sugerencia y deja
 * `chequeoFecha` en `null`: "hoy" en silencio sería exactamente el tipo de
 * dato inventado que este módulo prohíbe.
 */
export function sugerirFechaChequeo(titulosLeidos: readonly string[]): FechaChequeoSugerida | null {
  for (const titulo of titulosLeidos) {
    const texto = titulo.trim();
    if (texto === '') continue;
    const resultado = parseFechaChequeo(texto, '');
    if (resultado.fecha !== null) {
      return {
        textoLeido: texto,
        fechaIso: resultado.fecha,
        confianza: resultado.confianza,
        issues: resultado.issues,
      };
    }
  }
  return null;
}

/**
 * Estampa una fecha de chequeo DECIDIDA POR UN HUMANO sobre las filas ya
 * normalizadas. No es un parseo: es la fecha que el usuario fijó en la ventana
 * de corrección, así que la confianza es `exacta` por definición.
 *
 * Por qué existe: `commitChequeo.ts` no deriva eventos `parto`/`servicio` de
 * una fila cuyo `chequeoFecha` es `null` (no habría con qué anclarlos en el
 * tiempo). Sin este paso, aprobar una carga por foto escribiría los chequeos
 * pero no los eventos. Devuelve filas NUEVAS -- nunca muta la entrada.
 */
export function aplicarFechaChequeo(
  filas: readonly FilaChequeoNormalizada[],
  fechaIso: string,
  confianza: ConfianzaFecha = 'exacta',
): FilaChequeoNormalizada[] {
  return filas.map((fila) => ({ ...fila, chequeoFecha: fechaIso, chequeoFechaConfianza: confianza }));
}

// ---------------------------------------------------------------------------
// 7. Prompt y esquema de salida del modelo de visión
// ---------------------------------------------------------------------------

/** Códigos SX que el motor sabe interpretar (`parseSX`, `calculosHato.ts`).
 * Van en el prompt como VOCABULARIO CERRADO para orientar la transcripción --
 * el modelo igual debe devolver lo que ve aunque no esté en la lista, porque
 * quien decide qué significa un código es `parseSX`, no el modelo. */
export const VOCABULARIO_SX: readonly string[] = [
  'OV', 'AV', 'A+', 'O+', 'A 206', 'gem+', 'abort', 'Mv', 'vacia', 'vendida', '0',
];

/** Códigos de la columna Estado que `parseEstado` reconoce. */
export const VOCABULARIO_ESTADO: readonly string[] = ['ok', 'rech'];

export interface VocabularioOcr {
  /** Nombres de toro reales, de `hato_toros`. */
  toros: readonly string[];
}

/** Esquema JSON estricto de la respuesta del modelo. Sin uniones de tipo y con
 * todas las propiedades requeridas: los conversores de `json_schema` de los
 * proveedores son quisquillosos con `type: ["string","null"]`, así que la
 * ausencia se expresa con string vacío + `confianza: 'ilegible'`, que además
 * es justo lo que el pipeline necesita. */
export function esquemaJsonOcr(): Record<string, unknown> {
  const celda = {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Transcripción literal de la celda. Cadena vacía si está en blanco o no se puede leer.',
      },
      confianza: {
        type: 'string',
        enum: ['alta', 'baja', 'ilegible'],
        description:
          "'alta' solo si estás seguro de cada carácter. Si dudas usa 'baja'. Si no se puede leer usa 'ilegible' y deja texto vacío.",
      },
    },
    required: ['texto', 'confianza'],
    additionalProperties: false,
  };

  const propiedadesCeldas: Record<string, unknown> = {};
  for (const col of COLUMNAS_OCR) {
    propiedadesCeldas[col] = { ...celda, description: `Columna '${ENCABEZADO_POR_COLUMNA_OCR[col]}'.` };
  }

  return {
    type: 'object',
    properties: {
      titulo_leido: {
        type: 'string',
        description: 'Título escrito en la parte superior de la hoja, literal. Cadena vacía si no hay o no se lee.',
      },
      filas: {
        type: 'array',
        description: 'Una entrada por cada fila de vaca visible, de arriba hacia abajo, sin saltarse ninguna.',
        items: {
          type: 'object',
          properties: {
            numero_impreso: {
              type: 'string',
              description: "El número de chapeta IMPRESO en la columna '#' de esa fila. Solo dígitos.",
            },
            nombre_impreso: {
              type: 'string',
              description: "El nombre IMPRESO en la columna 'Nombre' de esa fila.",
            },
            celdas: {
              type: 'object',
              properties: propiedadesCeldas,
              required: [...COLUMNAS_OCR],
              additionalProperties: false,
            },
          },
          required: ['numero_impreso', 'nombre_impreso', 'celdas'],
          additionalProperties: false,
        },
      },
    },
    required: ['titulo_leido', 'filas'],
    additionalProperties: false,
  };
}

/**
 * Prompt de transcripción. Tres cosas lo hacen tratable (plan §5): la planilla
 * va pre-llenada, `#`/`Nombre` van impresos, y el vocabulario es cerrado.
 *
 * Lo que este prompt deliberadamente NO incluye: la lista de vacas esperadas.
 * Dársela convertiría el cotejo anti-row-drift en un espejo (el modelo copiaría
 * la lista y el servidor la validaría contra sí misma). El modelo lee papel; el
 * servidor conoce la verdad.
 */
export function construirPromptOcr(vocabulario: VocabularioOcr): string {
  const toros = vocabulario.toros.length > 0 ? vocabulario.toros.join(', ') : '(catálogo vacío)';
  return [
    'Eres un transcriptor de planillas veterinarias de un hato lechero en Colombia. Tu único trabajo es TRANSCRIBIR lo que ves, no interpretarlo.',
    '',
    'La foto es una planilla impresa de chequeo reproductivo, con una fila por vaca y estas columnas, en este orden de izquierda a derecha:',
    ENCABEZADOS_HOJA_OCR.map((h, i) => `${i + 1}. ${h}`).join('\n'),
    '',
    "Las columnas '#' y 'Nombre' vienen IMPRESAS (letra de imprenta). Algunas otras celdas también vienen impresas en gris (el sistema las pre-llenó) y otras están escritas a mano por la encargada del hato. Transcribe ambas por igual: el valor que está en la celda al momento de la foto.",
    '',
    'REGLAS DURAS:',
    "1. Devuelve UNA entrada por cada fila de vaca visible, de arriba hacia abajo, sin saltarte ninguna y sin inventar filas que no estén.",
    "2. En cada fila, 'numero_impreso' y 'nombre_impreso' deben salir de LA MISMA fila física que las celdas que reportas. Si no puedes leer con seguridad a qué fila pertenece un dato, marca esa celda como 'ilegible'; NUNCA lo pongas en la fila vecina.",
    "3. NO interpretes, NO corrijas y NO completes: si la celda dice 'A 206', devuelve exactamente 'A 206'. Si dice algo que parece un código inválido, devuélvelo igual tal cual lo ves.",
    "4. Confianza obligatoria por celda: 'alta' solo si estás seguro de cada carácter; 'baja' si dudas; 'ilegible' si no se lee. En 'baja' e 'ilegible' deja el texto vacío o lo poco que veas, pero NUNCA adivines un valor plausible. Una celda mal adivinada es peor que una celda vacía.",
    "5. Una celda genuinamente en blanco es texto vacío con confianza 'alta'. Eso significa 'no hay nada escrito', y es un dato válido.",
    '',
    'VOCABULARIO ESPERADO (úsalo para leer mejor la letra, NO para reemplazar lo que ves):',
    `- Fechas: formato día/mes/año, por ejemplo 5/11/2026. Transcríbelas tal cual estén escritas.`,
    `- Columna 'Sexo cría' (código SX): ${VOCABULARIO_SX.join(', ')}. La letra A es hembra, la O es macho, el signo + significa que la cría murió, y un número después de la letra es la chapeta de la cría.`,
    `- Columna 'Estado': ${VOCABULARIO_ESTADO.join(', ')}.`,
    `- Columna 'Toro': nombres del catálogo real: ${toros}. A veces va precedido de 'Toro ' o 'Ins '. Si el nombre escrito no está en el catálogo, transcríbelo igual tal cual.`,
    `- Columnas 'PL' y '# Partos': números.`,
    `- Columna 'Tratamiento': texto libre en español.`,
    '',
    "Responde ÚNICAMENTE con el JSON del esquema pedido. Sin explicaciones, sin markdown.",
  ].join('\n');
}
