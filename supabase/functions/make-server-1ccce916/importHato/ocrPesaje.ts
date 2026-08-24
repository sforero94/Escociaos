// ARCHIVO: supabase/functions/make-server-1ccce916/importHato/ocrPesaje.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/ocrPesaje.ts` y volvé a correr el script.
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

// ARCHIVO: utils/importHato/ocrPesaje.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- la ruta "carga
// de la planilla MENSUAL de pesaje por FOTO". Gemelo, adaptado, de
// `ocrChequeo.ts` (Fase 3b del chequeo veterinario):
//
//   - El chequeo ancla cada fila por DOS anclas impresas (`#` + `Nombre`)
//     porque `hato_animales.numero` es la chapeta física. La planilla de
//     pesaje NUNCA llevó chapeta -- ni en el papel real (2019-2026, ver
//     docs/hato/sesiones-b5-d7-e3.md, "columna A = NOMBRE de la vaca, sin
//     número de chapeta") ni en el `.xlsx` que ya se diligencia hoy --
//     porque D-1 (2026-08-06) estableció que la identidad del hato es el
//     NOMBRE, no la caravana. Acá hay UNA sola ancla: el nombre impreso.
//   - La grilla es distinta: 5 columnas de SEMANA (D-9), cada una con dos
//     sub-celdas AM/PM, en vez de las 10 columnas reproductivas del chequeo.
//
// LA MISMA REGLA ARQUITECTÓNICA que `ocrChequeo.ts` (CLAUDE.md, contrato del
// endpoint `/hato/chequeo/foto`):
//
//     El OCR reemplaza ÚNICAMENTE la lectura de la grilla, nunca decide nada
//     de negocio.
//
// Acá "decidir" sería escribir en `hato_pesajes_leche` -- este módulo NUNCA
// lo hace, ni siquiera arma el payload final con la fecha resuelta (eso lo
// hace el handler I/O, que es quien conoce `hato_config.dia_pesaje_semanal`
// y las filas YA existentes en la BD). Los litros se interpretan con
// `parseValorNumerico` (`calculosHato.ts`), el ÚNICO parser numérico del
// repo -- nunca un segundo `parseFloat` local. El cotejo de nombre reusa
// `distanciaEdicionAcotada` de `ocrChequeo.ts` -- nunca un segundo
// Levenshtein.
//
// LAS DOS DEFENSAS QUE SÍ SON RESPONSABILIDAD DE ESTE ARCHIVO:
//
// 1. ANTI-ROW-DRIFT POR NOMBRE. El servidor conoce el roster impreso
//    (`esCandidataRosterPesaje`, sección 1.b). El modelo dice, por fila, qué
//    NOMBRE lee impreso;
//    acá se coteja contra ese roster. Si no calza -- o calza con MÁS de una
//    vaca activa homónima -- la fila entera se marca NO LEÍDA, nunca se
//    adivina ni se desplaza. El roster NO se le pasa al modelo, por el mismo
//    motivo que en el chequeo: evitar que el cotejo se vuelva circular (el
//    modelo copiaría la lista en vez de leer el papel).
// 2. "SIN DATO, NUNCA 0" EN LA LECTURA. Una celda `baja`/`ilegible` entra
//    vacía + marca, nunca litros adivinados. Ausencia total en una semana
//    (ni AM ni PM legibles) significa "esa vaca no se pesó esa semana" --
//    nunca se escribe `litros_total = 0` (regla D del módulo).
//
// Puro, cero I/O, cero Date.now().

import { parseValorNumerico } from '../calculos-hato.ts';
import { distanciaEdicionAcotada } from './ocrChequeo.ts';

// ---------------------------------------------------------------------------
// 1. El vocabulario de columnas: 5 semanas × (AM, PM). `litros_total` se
//    deriva SIEMPRE de AM+PM, nunca se transcribe ni se lee del papel (una
//    sola fuente de verdad). El PDF llegó a imprimir una tercera columna
//    `Total` de referencia (grisada, no diligenciada); se retiró a pedido del
//    dueño (2026-08-11), pero el prompt sigue advirtiendo que puede haberla
//    porque las planillas ya impresas con ese formato siguen circulando.
// ---------------------------------------------------------------------------

export const SEMANAS_PESAJE = [1, 2, 3, 4, 5] as const;
export type SemanaPesaje = (typeof SEMANAS_PESAJE)[number];
export type SubceldaPesaje = 'am' | 'pm';
export type ColumnaPesajeOcr = `s${SemanaPesaje}_${SubceldaPesaje}`;

export function claveColumnaPesaje(semana: SemanaPesaje, sub: SubceldaPesaje): ColumnaPesajeOcr {
  return `s${semana}_${sub}` as ColumnaPesajeOcr;
}

/** Las 10 columnas de datos, en el orden impreso: semana 1 AM, 1 PM, 2 AM… */
export const COLUMNAS_PESAJE_OCR: readonly ColumnaPesajeOcr[] = SEMANAS_PESAJE.flatMap((s) => [
  claveColumnaPesaje(s, 'am'),
  claveColumnaPesaje(s, 'pm'),
]);

// ---------------------------------------------------------------------------
// 1.b Quién va en el roster de la planilla. UNA sola definición, acá, porque
//     la misma regla se aplica en TRES puntos que no se pueden importar entre
//     sí (frontend + los dos handlers Deno) y que tienen que coincidir o el
//     flujo se rompe en silencio: si el PDF imprime una fila que el roster
//     del OCR no reconoce, esa vaca sale "no leída"; si la reconoce pero el
//     commit la rechaza, los litros se pierden después de que Martha aprobó.
//     Este archivo ya se espeja a los dos árboles de servidor
//     (`docs/hato/regenerar-copias-importhato.py`), así que es el único lugar
//     donde la regla puede vivir una sola vez.
// ---------------------------------------------------------------------------

/** Etapas que pueden llegar a estar en el roster. Sirve como filtro ANCHO
 * para la consulta (`.in('etapa', …)`); el criterio fino es
 * `esCandidataRosterPesaje`, que es quien decide de verdad. */
export const ETAPAS_ROSTER_PESAJE: readonly string[] = ['vaca', 'novilla'];

/** Lo mínimo que hay que saber de un animal para decidir si entra al roster.
 * Campos crudos de `hato_animales` -- nada derivado. */
export interface CandidataRosterPesaje {
  etapa: string | null;
  estado: string | null;
}

/**
 * Regla del roster: **UN SOLO TEMPLATE con todo el hato ordeñable** --
 * vacas en ordeño, horras y novillas, todas las activas. Terneras nunca.
 *
 * Decisión del dueño (2026-08-11, segunda ronda). La primera versión de esta
 * regla pedía servicio registrado para que una novilla entrara, con la idea
 * de imprimir solo las "próximas a parir"; se revirtió al comprobar el costo
 * real de afinar: ninguna de las 27 novillas activas tiene servicio en
 * `hato_eventos`, así que el filtro imprimía CERO novillas, y una vaca que
 * falta en el papel es un dato que se pierde en la finca -- donde no hay
 * internet ni forma de reimprimir.
 *
 * El mismo razonamiento explica por qué las horras no se filtran, aunque el
 * sistema pudiera distinguirlas (hoy no puede: no existe un solo evento
 * `secado_real`): Martha deja un paquete de planillas en la finca y llena
 * solo las que estén activas. Una fila de más es una casilla en blanco; una
 * de menos no tiene arreglo hasta el otro mes.
 */
export function esCandidataRosterPesaje(animal: CandidataRosterPesaje): boolean {
  if (animal.estado !== 'activa') return false;
  return animal.etapa === 'vaca' || animal.etapa === 'novilla';
}

// ---------------------------------------------------------------------------
// 2. Lo que el modelo devuelve
// ---------------------------------------------------------------------------

export type ConfianzaCeldaOcrPesaje = 'alta' | 'baja' | 'ilegible';

export interface CeldaOcrPesaje {
  /** Transcripción VERBATIM de lo que el modelo ve. Nunca interpretada acá. */
  texto: string;
  confianza: ConfianzaCeldaOcrPesaje;
}

export interface FilaOcrPesaje {
  /** 1-based: cuál de las fotos subidas. Lo pone el servidor, no el modelo. */
  pagina: number;
  /** 1-based: posición de la fila dentro de esa foto, de arriba hacia abajo. */
  orden: number;
  /** El nombre IMPRESO que el modelo lee en esa fila. Ancla ÚNICA (no hay
   * chapeta en esta planilla, ver cabecera del archivo). */
  nombreImpreso: string;
  celdas: Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
}

export interface LecturaOcrPesajePagina {
  pagina: number;
  filas: FilaOcrPesaje[];
  /** Notas de forma detectadas al parsear la respuesta (fila mal formada,
   * confianza inválida). Nunca se corrigen en silencio. */
  avisos: string[];
}

function celdaIlegible(): CeldaOcrPesaje {
  return { texto: '', confianza: 'ilegible' };
}

function celdasVaciasPesaje(): Record<ColumnaPesajeOcr, CeldaOcrPesaje> {
  const salida = {} as Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
  for (const col of COLUMNAS_PESAJE_OCR) salida[col] = celdaIlegible();
  return salida;
}

function textoPlano(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  return '';
}

function normalizarConfianzaPesaje(valor: unknown, avisos: string[], contexto: string): ConfianzaCeldaOcrPesaje {
  if (valor === 'alta' || valor === 'baja' || valor === 'ilegible') return valor;
  // Degradar SIEMPRE hacia lo cauteloso: una confianza que no entendemos no
  // puede convertirse en un valor que entra al pipeline como si fuera bueno.
  avisos.push(`${contexto}: confianza '${String(valor)}' no reconocida -- se degradó a 'ilegible'`);
  return 'ilegible';
}

/**
 * Convierte el JSON crudo que devolvió el modelo (ya des-serializado) en una
 * `LecturaOcrPesajePagina`. Tolerante por diseño: una fila mal formada NUNCA
 * aborta la página entera -- se conserva con lo que se pueda leer y el resto
 * queda `ilegible`. Solo `filas` ausente/no-arreglo es fatal: ahí no hay
 * nada que rescatar y devolver "0 filas" en silencio se leería como "la foto
 * no tenía vacas".
 */
export function parsearRespuestaModeloOcrPesaje(bruto: unknown, pagina: number): LecturaOcrPesajePagina {
  const avisos: string[] = [];
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error(`La respuesta del modelo para la foto ${pagina} no es un objeto JSON.`);
  }
  const raiz = bruto as Record<string, unknown>;
  const filasBrutas = raiz.filas;
  if (!Array.isArray(filasBrutas)) {
    throw new Error(`La respuesta del modelo para la foto ${pagina} no trae el arreglo 'filas'.`);
  }

  const filas: FilaOcrPesaje[] = filasBrutas.map((filaBruta, i) => {
    const orden = i + 1;
    const contextoFila = `foto ${pagina}, fila ${orden}`;
    if (filaBruta === null || typeof filaBruta !== 'object') {
      avisos.push(`${contextoFila}: la fila no es un objeto -- se descarta su contenido, queda como no leída`);
      return { pagina, orden, nombreImpreso: '', celdas: celdasVaciasPesaje() };
    }
    const fila = filaBruta as Record<string, unknown>;
    const celdasBrutas = (fila.celdas ?? {}) as Record<string, unknown>;
    const celdas = {} as Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
    for (const col of COLUMNAS_PESAJE_OCR) {
      const celdaBruta = celdasBrutas[col];
      if (celdaBruta === null || celdaBruta === undefined || typeof celdaBruta !== 'object') {
        // Columna ausente en la respuesta: el modelo no reportó nada -- se
        // marca ilegible para que el humano decida, nunca se asume en blanco.
        celdas[col] = celdaIlegible();
        continue;
      }
      const objeto = celdaBruta as Record<string, unknown>;
      celdas[col] = {
        texto: textoPlano(objeto.texto),
        confianza: normalizarConfianzaPesaje(objeto.confianza, avisos, `${contextoFila}, columna '${col}'`),
      };
    }
    return { pagina, orden, nombreImpreso: textoPlano(fila.nombre_impreso), celdas };
  });

  return { pagina, filas, avisos };
}

// ---------------------------------------------------------------------------
// 3. El roster esperado -- lo que el servidor SABE que imprimió
// ---------------------------------------------------------------------------

/** Una vaca en ordeño activa, tal como la exporta la planilla (misma
 * consulta que `fetchVacasActivas`: `etapa='vaca' AND estado='activa'`). */
export interface AnimalRosterPesaje {
  id: string;
  nombre: string;
}

export interface EntradaRosterPesaje {
  id: string;
  nombre: string;
  nombreNormalizado: string;
}

export interface RosterPesaje {
  /** Índice por nombre normalizado -- un arreglo, no un valor único: dos
   * vacas activas pueden compartir nombre (el corpus histórico ya lo
   * demostró con VALENCIANA/MONZA), y sin chapeta no hay forma de
   * desempatar. Más de una entrada = ese nombre NUNCA se adjudica solo. */
  porNombre: Map<string, EntradaRosterPesaje[]>;
  entradas: EntradaRosterPesaje[];
}

/** Normaliza un nombre para comparar: sin tildes, sin puntuación, sin
 * espacios repetidos, en mayúsculas. NO se usa para escribir nada -- lo que
 * se escribe en cualquier resultado es siempre el nombre canónico del
 * roster. Misma forma que `normalizarNombreParaCotejo` de `ocrChequeo.ts`;
 * se re-declara en vez de importarse porque ese símbolo no está exportado
 * pensando en un segundo consumidor -- si algún día se comparte, expórtese
 * desde allá y bórrese esta copia. */
function normalizarNombrePesaje(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export function construirRosterPesaje(animales: readonly AnimalRosterPesaje[]): RosterPesaje {
  const porNombre = new Map<string, EntradaRosterPesaje[]>();
  const entradas: EntradaRosterPesaje[] = [];

  for (const animal of animales) {
    const nombre = (animal.nombre ?? '').trim();
    if (nombre === '') continue; // sin nombre no hay ancla que cotejar
    const entrada: EntradaRosterPesaje = { id: animal.id, nombre, nombreNormalizado: normalizarNombrePesaje(nombre) };
    entradas.push(entrada);
    const lista = porNombre.get(entrada.nombreNormalizado);
    if (lista) lista.push(entrada);
    else porNombre.set(entrada.nombreNormalizado, [entrada]);
  }

  return { porNombre, entradas };
}

// ---------------------------------------------------------------------------
// 4. Validación del ancla (anti-row-drift, una sola ancla: el nombre)
// ---------------------------------------------------------------------------

export type MotivoNoLeidaPesaje =
  | 'nombre_ilegible'
  | 'nombre_fuera_del_roster'
  | 'nombre_ambiguo_en_roster'
  | 'lectura_repetida_divergente';

export type ResultadoAnclaPesaje =
  | { ok: true; entrada: EntradaRosterPesaje; avisos: string[] }
  | { ok: false; motivo: MotivoNoLeidaPesaje; detalle: string };

/** Tolerancia de UNA letra de diferencia (mismo criterio que `ocrChequeo.ts`,
 * `distanciaEdicionAcotada` importada de allá). Sin chapeta que desempate,
 * la tolerancia se cancela por completo si más de una vaca del roster queda
 * a esa distancia -- ahí ya no es "OCR imperfecto de un nombre", es
 * ambigüedad real. */
const TOLERANCIA_EDICION_NOMBRE = 1;

/**
 * Cotejo de un nombre contra el roster de la planilla -- el corazón del
 * anti-row-drift. Nace del ancla de la ruta FOTO (`validarAnclaFilaPesaje`,
 * abajo, que solo le pasa `fila.nombreImpreso`), pero es la MISMA regla que
 * necesita `ocrPesajeCorreccion.ts` para resolver el nombre que Fernando
 * escribe en una corrección de texto libre (D-C): exacto único -> resuelto;
 * exacto ambiguo -> nunca se adjudica; a una letra único -> resuelto con
 * aviso; a una letra ambiguo -> nunca se adjudica; nada -> fuera del roster.
 * Cotejar el nombre de una corrección con un algoritmo DISTINTO al que
 * cotejó la foto original sería inconsistente sin motivo -- por eso una sola
 * función, no dos parecidas.
 */
export function resolverNombreEnRosterPesaje(nombreCrudo: string, roster: RosterPesaje): ResultadoAnclaPesaje {
  const leido = normalizarNombrePesaje(nombreCrudo);
  if (leido === '') {
    return {
      ok: false,
      motivo: 'nombre_ilegible',
      detalle: `'${nombreCrudo}' no es un nombre -- no se puede anclar`,
    };
  }

  const exactos = roster.porNombre.get(leido) ?? [];
  if (exactos.length === 1) return { ok: true, entrada: exactos[0], avisos: [] };
  if (exactos.length > 1) {
    return {
      ok: false,
      motivo: 'nombre_ambiguo_en_roster',
      detalle: `${exactos.length} vacas en ordeño se llaman '${nombreCrudo}' -- no se adjudica sola (regla del módulo), queda para revisión humana`,
    };
  }

  const cercanos = roster.entradas.filter(
    (e) => distanciaEdicionAcotada(leido, e.nombreNormalizado, TOLERANCIA_EDICION_NOMBRE) <= TOLERANCIA_EDICION_NOMBRE,
  );
  if (cercanos.length === 1) {
    return {
      ok: true,
      entrada: cercanos[0],
      avisos: [`'${nombreCrudo}' y el roster dice '${cercanos[0].nombre}' (una letra de diferencia) -- revisar`],
    };
  }
  if (cercanos.length > 1) {
    return {
      ok: false,
      motivo: 'nombre_ambiguo_en_roster',
      detalle: `'${nombreCrudo}' está a una letra de ${cercanos.length} vacas en ordeño distintas -- no se adjudica sola`,
    };
  }

  return {
    ok: false,
    motivo: 'nombre_fuera_del_roster',
    detalle: `ninguna vaca en ordeño activa se llama '${nombreCrudo}' -- puede ser una vaca vendida, una novilla anotada a mano, o un nombre mal escrito/leído`,
  };
}

export function validarAnclaFilaPesaje(fila: FilaOcrPesaje, roster: RosterPesaje): ResultadoAnclaPesaje {
  return resolverNombreEnRosterPesaje(fila.nombreImpreso, roster);
}

// ---------------------------------------------------------------------------
// 5. Orquestador: de las lecturas por foto a las filas confirmadas
// ---------------------------------------------------------------------------

export interface FilaPesajeConfirmada {
  pagina: number;
  orden: number;
  animalId: string;
  nombre: string;
  nombreImpreso: string;
  celdas: Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
  /** Columnas cuyo texto NO pasó al pipeline por confianza `baja`/`ilegible`. */
  celdasNoConfiables: ColumnaPesajeOcr[];
  avisos: string[];
}

export interface FilaPesajeNoLeida {
  pagina: number;
  orden: number;
  nombreImpreso: string;
  motivo: MotivoNoLeidaPesaje;
  detalle: string;
  celdas: Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
}

export interface VacaPesajeSinLeer {
  id: string;
  nombre: string;
}

export interface ResultadoOcrPesaje {
  filasConfirmadas: FilaPesajeConfirmada[];
  filasNoLeidas: FilaPesajeNoLeida[];
  /** Vacas del roster que no aparecieron en ninguna foto -- detector de
   * "faltó una página" o "la foto salió cortada". */
  vacasSinLeer: VacaPesajeSinLeer[];
  advertencias: string[];
}

/** Clave de identidad de una lectura, para detectar la misma vaca leída dos
 * veces (fotos superpuestas). */
function firmaLecturaPesaje(fila: FilaOcrPesaje): string {
  return COLUMNAS_PESAJE_OCR.map((c) => `${c}=${fila.celdas[c].confianza}:${fila.celdas[c].texto}`).join('|');
}

/**
 * Orquestador puro de la ruta foto: valida el ancla (nombre) de cada fila
 * leída y reporta lo que quedó afuera. A diferencia de `procesarLecturaOcr`
 * (chequeo), NO arma una matriz cruda para un normalizador genérico -- acá
 * no hay pipeline compartido con una ruta `.xlsx` (la planilla de pesaje
 * nunca tuvo una); el handler I/O consume `filasConfirmadas` directamente
 * para construir el diff contra `hato_pesajes_leche` (`construirDiffPesaje`).
 */
export function procesarLecturaOcrPesaje(
  paginas: readonly LecturaOcrPesajePagina[],
  roster: RosterPesaje,
): ResultadoOcrPesaje {
  const filasConfirmadas: FilaPesajeConfirmada[] = [];
  const filasNoLeidas: FilaPesajeNoLeida[] = [];
  const advertencias: string[] = [];

  // animalId -> lectura ya confirmada, para detectar la misma vaca en dos fotos.
  const yaConfirmada = new Map<string, { firma: string; fila: FilaOcrPesaje }>();
  const rechazadasPorDuplicado = new Set<string>();

  const paginasOrdenadas = [...paginas].sort((a, b) => a.pagina - b.pagina);

  for (const pagina of paginasOrdenadas) {
    advertencias.push(...pagina.avisos.map((a) => `lectura: ${a}`));

    for (const fila of [...pagina.filas].sort((a, b) => a.orden - b.orden)) {
      const ancla = validarAnclaFilaPesaje(fila, roster);
      if (!ancla.ok) {
        filasNoLeidas.push({
          pagina: fila.pagina,
          orden: fila.orden,
          nombreImpreso: fila.nombreImpreso,
          motivo: ancla.motivo,
          detalle: ancla.detalle,
          celdas: fila.celdas,
        });
        continue;
      }

      const animalId = ancla.entrada.id;
      const firma = firmaLecturaPesaje(fila);
      const previa = yaConfirmada.get(animalId);
      if (previa) {
        if (previa.firma === firma) {
          // Dos fotos superpuestas que dicen EXACTAMENTE lo mismo: se
          // conserva una sola lectura, no hay nada que adjudicar.
          advertencias.push(`la vaca '${ancla.entrada.nombre}' aparece en dos fotos con la MISMA lectura -- se conservó una sola`);
          continue;
        }
        // Dos lecturas distintas de la misma vaca: no se elige ninguna.
        rechazadasPorDuplicado.add(animalId);
        filasNoLeidas.push({
          pagina: fila.pagina,
          orden: fila.orden,
          nombreImpreso: fila.nombreImpreso,
          motivo: 'lectura_repetida_divergente',
          detalle: `la vaca '${ancla.entrada.nombre}' se leyó en dos fotos con datos distintos -- no se adjudica sola, revisar cuál foto corresponde`,
          celdas: fila.celdas,
        });
        continue;
      }

      const celdasNoConfiables = COLUMNAS_PESAJE_OCR.filter((c) => fila.celdas[c].confianza !== 'alta');

      yaConfirmada.set(animalId, { firma, fila });
      filasConfirmadas.push({
        pagina: fila.pagina,
        orden: fila.orden,
        animalId,
        nombre: ancla.entrada.nombre,
        nombreImpreso: fila.nombreImpreso,
        celdas: fila.celdas,
        celdasNoConfiables,
        avisos: ancla.avisos.map((a) => `[ancla] ${a}`),
      });
    }
  }

  // Una vaca cuya SEGUNDA lectura divergió también pierde la primera: si dos
  // fotos se contradicen, ninguna de las dos es "la buena" por haber llegado antes.
  const confirmadasFinales = filasConfirmadas.filter((f) => !rechazadasPorDuplicado.has(f.animalId));
  for (const animalId of rechazadasPorDuplicado) {
    const primera = filasConfirmadas.find((f) => f.animalId === animalId);
    if (!primera) continue;
    filasNoLeidas.push({
      pagina: primera.pagina,
      orden: primera.orden,
      nombreImpreso: primera.nombreImpreso,
      motivo: 'lectura_repetida_divergente',
      detalle: `primera lectura de '${primera.nombre}'; otra foto la reporta distinta, así que ninguna se procesa`,
      celdas: primera.celdas,
    });
  }

  const leidas = new Set(confirmadasFinales.map((f) => f.animalId));
  const vacasSinLeer: VacaPesajeSinLeer[] = roster.entradas
    .filter((e) => !leidas.has(e.id))
    .map((e) => ({ id: e.id, nombre: e.nombre }));

  return { filasConfirmadas: confirmadasFinales, filasNoLeidas, vacasSinLeer, advertencias };
}

// ---------------------------------------------------------------------------
// 6. Lectura de litros AM/PM + diff contra lo ya existente en la BD
// ---------------------------------------------------------------------------

export interface LecturaLitrosSemana {
  litrosAm: number | null;
  litrosPm: number | null;
}

/** Solo la confianza `alta` pasa al pipeline. `baja`/`ilegible` se tratan
 * como ausentes -- "sin dato, nunca 0" aplicado a la lectura. Interpreta con
 * `parseValorNumerico` (`calculosHato.ts`), el único parser numérico.
 *
 * `fracciones: true` porque la celda de litros es escrita a mano y trae
 * medios y cuartos verbatim ("6 1/2", "6½", ".5"). Sin esa llave el regex
 * estricto los descarta ENTEROS -- ni siquiera conserva el 6 -- y la celda
 * desaparece como si la vaca no se hubiera pesado. La llave NO se abre en los
 * demás llamadores del parser (`numero`, `#P2`), donde una fracción sigue
 * siendo un error legítimo. */
export function leerLitrosSemana(fila: FilaPesajeConfirmada, semana: SemanaPesaje): LecturaLitrosSemana {
  const am = fila.celdas[claveColumnaPesaje(semana, 'am')];
  const pm = fila.celdas[claveColumnaPesaje(semana, 'pm')];
  return {
    litrosAm: am.confianza === 'alta' ? parseValorNumerico(am.texto, { fracciones: true }).valor : null,
    litrosPm: pm.confianza === 'alta' ? parseValorNumerico(pm.texto, { fracciones: true }).valor : null,
  };
}

export type ClasificacionCeldaPesaje = 'nuevo' | 'sin_cambio' | 'cambio' | 'sin_dato';

/** Fila existente de `hato_pesajes_leche` para (animal, fecha) -- lo mínimo
 * que el handler necesita para comparar contra lo leído. */
export interface PesajeExistente {
  id: string;
  litrosAm: number | null;
  litrosPm: number | null;
  litrosTotal: number;
}

export interface CeldaDiffPesaje {
  animalId: string;
  nombre: string;
  semana: SemanaPesaje;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
  /** `null` cuando NINGÚN ordeño tiene valor -- no hay total que escribir
   * (ausencia de pesaje, nunca 0). */
  litrosTotal: number | null;
  /** `true` cuando solo UNO de los dos ordeños tiene valor -- el total es
   * ese único valor, y hay que avisar que puede faltar transcribir el otro
   * (mismo criterio que `pesajesLeche.ts`, el backfill histórico). */
  soloUnOrdeno: boolean;
  existenteId: string | null;
  clasificacion: ClasificacionCeldaPesaje;
  /** `true` cuando AM o PM de esta semana se leyeron con confianza
   * `baja`/`ilegible` (`fila.celdasNoConfiables`). Distingue "Martha dejó la
   * celda en blanco" de "el modelo no pudo leer la letra" -- ambas llegan
   * con `litros = null`, pero solo la segunda necesita que alguien mire el
   * papel de nuevo antes de confiar en el blanco. */
  noConfiable: boolean;
}

/**
 * Compara lo leído contra lo YA guardado en `hato_pesajes_leche` para cada
 * (vaca, semana) y clasifica cada celda -- el diff que ve Martha antes de
 * aprobar. `fechasPorSemana` viene del handler (`fechasPesajeMensuales`,
 * `calculosHato.ts`, sobre el `anio`/`mes` que el usuario eligió al subir
 * la foto -- esta planilla nunca deriva la fecha de un título leído, ver
 * cabecera del archivo). Una semana sin ocurrencia real ese mes (`fecha ===
 * null`, p. ej. la 5ª semana en un mes de 4 miércoles) no genera ninguna
 * celda de diff -- no hay columna que escribir.
 */
export function construirDiffPesaje(
  filas: readonly FilaPesajeConfirmada[],
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>,
  existentes: ReadonlyMap<string, ReadonlyMap<string, PesajeExistente>>,
): CeldaDiffPesaje[] {
  const celdas: CeldaDiffPesaje[] = [];

  for (const fila of filas) {
    for (const semana of SEMANAS_PESAJE) {
      const fecha = fechasPorSemana[semana];
      if (fecha === null) continue;

      const { litrosAm, litrosPm } = leerLitrosSemana(fila, semana);
      const litrosTotal = litrosAm === null && litrosPm === null ? null : (litrosAm ?? 0) + (litrosPm ?? 0);
      const existente = existentes.get(fila.animalId)?.get(fecha) ?? null;
      const noConfiable =
        fila.celdasNoConfiables.includes(claveColumnaPesaje(semana, 'am')) ||
        fila.celdasNoConfiables.includes(claveColumnaPesaje(semana, 'pm'));

      let clasificacion: ClasificacionCeldaPesaje;
      if (litrosTotal === null) {
        clasificacion = 'sin_dato';
      } else if (!existente) {
        clasificacion = 'nuevo';
      } else if (existente.litrosTotal === litrosTotal && existente.litrosAm === litrosAm && existente.litrosPm === litrosPm) {
        clasificacion = 'sin_cambio';
      } else {
        clasificacion = 'cambio';
      }

      celdas.push({
        animalId: fila.animalId,
        nombre: fila.nombre,
        semana,
        fecha,
        litrosAm,
        litrosPm,
        litrosTotal,
        soloUnOrdeno: (litrosAm === null) !== (litrosPm === null),
        existenteId: existente?.id ?? null,
        clasificacion,
        noConfiable,
      });
    }
  }

  return celdas;
}

/** Clasificaciones que SÍ se pueden escribir. `sin_dato` nunca -- no hay
 * litros que guardar (ausencia = no pesada, nunca 0). `sin_cambio` se
 * re-escribe con el mismo valor (idempotente); incluirla evita que el
 * commit necesite una tercera rama solo para "no hacer nada". */
export const CLASIFICACIONES_PESAJE_ESCRIBIBLES: ReadonlySet<ClasificacionCeldaPesaje> = new Set([
  'nuevo',
  'cambio',
  'sin_cambio',
]);

export interface FilaPesajeInsertable {
  animal_id: string;
  fecha: string;
  litros_am: number | null;
  litros_pm: number | null;
  litros_total: number;
  /** `null` = INSERT; presente = UPDATE por id (mismo patrón que
   * `guardarPesajes`, `useProduccionHato.ts` -- nunca upsert de PostgREST). */
  existenteId: string | null;
}

/** Diff -> filas insertables/actualizables. Puro: el handler decide CUÁNDO
 * llamarla (siempre sobre un diff RECIÉN calculado contra el estado fresco
 * de la BD, nunca el diff que vio la vista previa -- mismo contrato que
 * `validarFilasCommit` en `commitChequeo.ts`). */
export function construirFilasPesajeInsertables(diff: readonly CeldaDiffPesaje[]): FilaPesajeInsertable[] {
  return diff
    .filter((c): c is CeldaDiffPesaje & { litrosTotal: number } =>
      CLASIFICACIONES_PESAJE_ESCRIBIBLES.has(c.clasificacion) && c.litrosTotal !== null,
    )
    .map((c) => ({
      animal_id: c.animalId,
      fecha: c.fecha,
      litros_am: c.litrosAm,
      litros_pm: c.litrosPm,
      litros_total: c.litrosTotal,
      existenteId: c.existenteId,
    }));
}

// ---------------------------------------------------------------------------
// 7. Prompt y esquema de salida del modelo de visión
// ---------------------------------------------------------------------------

/** Esquema JSON estricto de la respuesta del modelo -- mismo criterio que
 * `esquemaJsonOcr` (chequeo): sin uniones de tipo, todas las propiedades
 * requeridas (los conversores `json_schema` de los proveedores son
 * quisquillosos con tipos opcionales), ausencia = string vacío + confianza
 * `ilegible`. */
export function esquemaJsonOcrPesaje(): Record<string, unknown> {
  const celda = {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description:
          "Transcripción literal de la celda (número de litros). Puede ser entero ('7'), decimal ('7,5', '.5') o fracción manuscrita ('6 1/2', '6½'); cópiala tal cual, sin convertirla. Cadena vacía si está en blanco o no se puede leer.",
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
  for (const col of COLUMNAS_PESAJE_OCR) {
    const [, semana, sub] = col.match(/^s(\d)_(am|pm)$/) ?? [];
    propiedadesCeldas[col] = {
      ...celda,
      description: `Semana ${semana}, ordeño ${sub === 'am' ? 'de la mañana (AM)' : 'de la tarde (PM)'}.`,
    };
  }

  return {
    type: 'object',
    properties: {
      filas: {
        type: 'array',
        description: 'Una entrada por cada fila de vaca visible, de arriba hacia abajo, sin saltarse ninguna.',
        items: {
          type: 'object',
          properties: {
            nombre_impreso: {
              type: 'string',
              description: 'El nombre de la vaca IMPRESO en esa fila (columna Nombre). Esta planilla NO lleva número de chapeta.',
            },
            celdas: {
              type: 'object',
              properties: propiedadesCeldas,
              required: [...COLUMNAS_PESAJE_OCR],
              additionalProperties: false,
            },
          },
          required: ['nombre_impreso', 'celdas'],
          additionalProperties: false,
        },
      },
    },
    required: ['filas'],
    additionalProperties: false,
  };
}

/**
 * Prompt de transcripción. Deliberadamente NO incluye la lista de vacas
 * esperadas (ver cabecera del archivo): dársela volvería el cotejo
 * anti-row-drift un espejo de sí mismo. El modelo lee papel; el servidor
 * conoce la verdad. Tampoco pide leer la columna `Total`: se deriva
 * siempre de AM+PM, nunca se transcribe (una sola fuente de verdad).
 */
export function construirPromptOcrPesaje(): string {
  return [
    'Eres un transcriptor de planillas de pesaje de leche de un hato lechero en Colombia. Tu único trabajo es TRANSCRIBIR lo que ves, no interpretarlo.',
    '',
    'La foto es una planilla mensual de pesaje, con una fila por vaca (columna "Nombre", SIN número de chapeta) y 5 bloques de columnas "Semana 1".."Semana 5", cada bloque con dos sub-columnas escritas a mano: AM (ordeño de la mañana) y PM (ordeño de la tarde). Puede haber una tercera columna "Total" por semana -- esa columna es de REFERENCIA y NO debes transcribirla, solo AM y PM.',
    '',
    'LA FOTO PUEDE SER UNA PARTE DE LA PLANILLA, NO TODA. La planilla se fotografía por franjas horizontales (la mitad de arriba y la de abajo) para que la letra se lea bien, así que es normal que veas solo un grupo de filas y que la fila de encabezados ("Nombre", "Sem 1", "AM/PM") NO aparezca. Eso no cambia nada: las columnas de datos son SIEMPRE las mismas 10, en el mismo orden de izquierda a derecha (Semana 1 AM, Semana 1 PM, Semana 2 AM, ... Semana 5 PM). Ubica cada valor por su POSICIÓN horizontal, y transcribe solo las filas que ves. No inventes las filas que quedaron fuera del encuadre: de esas simplemente no devuelves entrada.',
    '',
    'Si en la foto NO alcanzas a ver las 10 columnas de datos completas (por ejemplo porque el encuadre cortó el lado derecho), marca como "ilegible" las columnas que no ves. NUNCA corras los valores hacia la izquierda para rellenar: un número en la semana equivocada es peor que una celda vacía.',
    '',
    'REGLAS DURAS:',
    "1. Devuelve UNA entrada por cada fila de vaca visible, de arriba hacia abajo, sin saltarte ninguna y sin inventar filas que no estén.",
    "2. En cada fila, 'nombre_impreso' debe salir de LA MISMA fila física que las celdas que reportas. Si no puedes leer con seguridad a qué fila pertenece un número, marca esa celda como 'ilegible'; NUNCA lo pongas en la fila vecina.",
    "3. Los valores son números de litros. Pueden venir como entero ('7'), con coma o punto decimal ('7,5', y también sin parte entera: '.5'), o como FRACCIÓN escrita a mano ('6 1/2', '6-1/2', '1/2', '6½'). Transcribe EXACTAMENTE lo escrito: no redondees, no corrijas, y NO conviertas la fracción a decimal -- de eso se encarga el sistema.",
    "3.b Una fracción es un valor perfectamente normal en esta planilla, no una rareza: si la lees con seguridad va con confianza 'alta', igual que un entero. Lo que NUNCA debes hacer es transcribir solo la parte entera y descartar el medio ('6 1/2' NO es '6').",
    "4. Confianza obligatoria por celda: 'alta' solo si estás seguro de cada carácter; 'baja' si dudas; 'ilegible' si no se lee. En 'baja' e 'ilegible' deja el texto vacío o lo poco que veas, pero NUNCA adivines un número plausible. Un número mal adivinado es peor que una celda vacía.",
    "5. Una celda genuinamente en blanco (esa vaca no se pesó esa semana, o solo se pesó AM y no PM) es texto vacío con confianza 'alta'. Eso significa 'no hay nada escrito', y es un dato válido -- no es lo mismo que 'no puedo leer la letra'.",
    '',
    "Responde ÚNICAMENTE con el JSON del esquema pedido. Sin explicaciones, sin markdown.",
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 8. Rechazo cuando NINGUNA fila de la carga ancló contra el roster
// ---------------------------------------------------------------------------

export interface RechazoLecturaPesaje {
  /** Mensaje completo, listo para mostrar al usuario o para viajar en el
   * `error` de la respuesta HTTP. */
  detalle: string;
  /** Nombres impresos leídos (si el modelo alcanzó a leer alguno) que no
   * coincidieron con ninguna vaca del roster -- hasta 5, sin duplicados.
   * Útil para que el humano confirme si el documento es otra cosa (p. ej.
   * la liquidación de El Pomar, que no trae nombres de vaca en absoluto). */
  nombresNoReconocidos: string[];
}

/**
 * Finding #40 (mantenimiento 2026-08-24): antes de este chequeo, una carga
 * cuyas fotos NO eran de la planilla de pesaje (p. ej. la liquidación
 * quincenal de El Pomar, subida por error a esta ruta) se "aceptaba" --
 * `success: true`, diff vacío -- sin ninguna señal que el usuario pudiera
 * accionar. La foto (3,2 MB en el incidente real) quedaba guardada como
 * capa cruda sin que del otro lado saliera ningún pesaje, y nada en la
 * respuesta decía "esto no parece lo que buscabas".
 *
 * Regla: si NINGUNA fila de NINGUNA foto de la carga ancló contra el
 * roster (cero `filasConfirmadas`, agregado sobre TODAS las fotos juntas --
 * `procesarLecturaOcrPesaje` ya las combina), la lectura se RECHAZA en vez
 * de aceptarse. No importa si la causa real es "esta no es la planilla de
 * pesaje" o "la foto salió ilegible/mal encuadrada": en los dos casos
 * aceptar en silencio produce el mismo daño (cero pesajes, cero
 * explicación), así que el mensaje cubre ambas sin afirmar cuál es.
 *
 * Un roster VACÍO (nadie activo en ordeño/novilla, `esCandidataRosterPesaje`)
 * es un problema de DATOS, no de la foto, y se rechaza ANTES de llegar
 * acá, con su propio mensaje (`ejecutarPipelinePesajeFoto`) -- esta función
 * nunca ve ese caso.
 */
export function detectarRechazoLecturaPesaje(ocr: ResultadoOcrPesaje): RechazoLecturaPesaje | null {
  if (ocr.filasConfirmadas.length > 0) return null;

  const nombresNoReconocidos = [
    ...new Set(ocr.filasNoLeidas.map((f) => f.nombreImpreso.trim()).filter((n) => n !== '')),
  ].slice(0, 5);

  const muestra =
    nombresNoReconocidos.length > 0
      ? ` Se alcanzó a leer: ${nombresNoReconocidos.join(', ')} -- ninguno coincide con una vaca activa del hato.`
      : '';

  return {
    nombresNoReconocidos,
    detalle:
      `No se reconoció ninguna vaca del hato en la(s) foto(s) subida(s).${muestra} ` +
      'Puede que la foto no sea de la planilla de pesaje -- ¿era la liquidación de El Pomar? -- o que la letra no se alcance a leer. Revisa la foto y vuelve a intentar.',
  };
}
