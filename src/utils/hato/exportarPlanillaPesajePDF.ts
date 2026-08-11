// ARCHIVO: utils/hato/exportarPlanillaPesajePDF.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md`, punto 1 -- arma
// el PDF IMPRIMIBLE de la planilla mensual de pesaje en blanco, mismo split
// PURO/IO y mismas librerías (`jspdf` + `jspdf-autotable`, YA dependencias
// del repo, ninguna nueva) que `exportarPlanillaChequeoPDF.ts`.
//
// Layout: `Nombre` + 5 bloques de semana, cada bloque con 2 sub-columnas
// (AM | PM), ambas diligenciadas a mano. El sub-encabezado de cada bloque
// lleva la fecha real de esa semana (`fechasPorSemanaDelMes`,
// `exportarPlanillaPesaje.ts`) -- nunca "Semana N" a secas, para que Martha
// ubique el miércoles exacto.
//
// TRES CAMBIOS DE FORMATO PEDIDOS POR EL DUEÑO (2026-08-11), que se explican
// mejor juntos porque uno habilita al otro:
//
//   1. SIN COLUMNA `Total`. Antes cada semana imprimía una tercera columna
//      gris "de referencia". Nunca se leyó del papel -- `litros_total` se
//      deriva SIEMPRE de AM+PM, y el prompt del OCR tiene prohibido
//      transcribirla -- así que solo ocupaba espacio y daba pie a que alguien
//      la diligenciara. Quedan 10 columnas de datos en vez de 15.
//   2. CARTA VERTICAL, no horizontal. Con 5 columnas menos la tabla ya no
//      necesita el ancho de una hoja acostada, y el formato vertical da 63mm
//      MÁS de alto útil -- que es lo escaso acá, porque lo que empuja páginas
//      son las filas de vacas, no las columnas.
//   3. UNA SOLA PÁGINA siempre que quepa; 2 como tope duro. Ver
//      `calcularMetricasFilaPesaje`: el alto de fila y el tamaño de letra se
//      DERIVAN de cuántas filas hay, en vez de ser constantes que envejecen.
//      Un tope fijo medido contra el hato de hoy se rompe solo con que entre
//      una novilla más. Con las 35 vacas de hoy cabe todo en una hoja.
//
// A diferencia de la planilla de chequeo (que arrastra valores conocidos:
// "planilla incremental"), esta planilla siempre sale EN BLANCO -- no hay
// litros que arrastrar de un mes a otro.
//
// Arquitectura PURO/IO: todo puro salvo `descargarPlanillaPesajePDF`, que
// hace el `await import()` dinámico de las dos librerías (nunca en el bundle
// inicial, mismo patrón que el archivo hermano) y dispara `doc.save`.

import {
  construirTituloPlanillaPesaje,
  fechaCortaColumna,
  ordenarRosterPesaje,
  type AnimalPlanillaPesaje,
} from './exportarPlanillaPesaje';
import { SEMANAS_PESAJE, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';

// ----------------------------------------------------------------------------
// 1. Layout de columnas: Nombre + 5 × (AM, PM).
// ----------------------------------------------------------------------------

type SubcolumnaPesajePDF = 'AM' | 'PM';
const SUBCOLUMNAS: readonly SubcolumnaPesajePDF[] = ['AM', 'PM'];

/** Ancho de página disponible: carta VERTICAL (215,9mm − 10mm de margen a
 * cada lado = 195,9mm útiles). Al soltar la columna `Total` sobran 5
 * columnas, así que las que quedan pueden ser MÁS anchas que en la versión
 * horizontal (16mm vs 12mm): más espacio para escribir a mano, que además es
 * lo que el OCR necesita para leer sin ambigüedad. */
export const ANCHO_COLUMNA_NOMBRE_PDF_MM = 34;
export const ANCHO_SUBCOLUMNA_PDF_MM = 16;

export const ANCHOS_COLUMNAS_PESAJE_PDF_MM: readonly number[] = [
  ANCHO_COLUMNA_NOMBRE_PDF_MM,
  ...SEMANAS_PESAJE.flatMap(() => SUBCOLUMNAS.map(() => ANCHO_SUBCOLUMNA_PDF_MM)),
];

export const ANCHO_TABLA_PESAJE_PDF_MM = ANCHOS_COLUMNAS_PESAJE_PDF_MM.reduce((a, b) => a + b, 0);

export const MARGENES_PESAJE_PDF_MM = { top: 18, right: 10, bottom: 12, left: 10 } as const;
export const ANCHO_UTIL_CARTA_VERTICAL_PESAJE_PDF_MM = 215.9 - MARGENES_PESAJE_PDF_MM.left - MARGENES_PESAJE_PDF_MM.right;

// ----------------------------------------------------------------------------
// 2. Presupuesto vertical -- de cuántas filas salen el alto de fila y la letra.
// ----------------------------------------------------------------------------

export const ALTO_PAGINA_CARTA_VERTICAL_MM = 279.4;
/** Alto del encabezado de la tabla: 2 filas × `minCellHeight` 7mm. */
export const ALTO_ENCABEZADO_TABLA_PESAJE_MM = 14;
/** Colchón contra el redondeo interno de jspdf-autotable. MEDIDO, no
 * estimado: buscando el mayor alto de fila que todavía deja 31 filas por
 * página, el alto útil real resultó ser 235,29mm contra los 235,4 que da la
 * resta de arriba. Sin este milímetro, el caso de 62 filas -- justo el
 * roster completo con novillas -- se pasaba a 3 páginas por 0,11mm. */
const MARGEN_SEGURIDAD_ALTO_PESAJE_MM = 1;

/** Alto disponible para filas de vaca en CADA página. */
export const ALTO_UTIL_CUERPO_PESAJE_PDF_MM =
  ALTO_PAGINA_CARTA_VERTICAL_MM -
  MARGENES_PESAJE_PDF_MM.top -
  MARGENES_PESAJE_PDF_MM.bottom -
  ALTO_ENCABEZADO_TABLA_PESAJE_MM -
  MARGEN_SEGURIDAD_ALTO_PESAJE_MM;

/** El requisito del dueño (2026-08-11): la planilla no puede pasar de aquí. */
export const PAGINAS_MAXIMAS_PLANILLA_PESAJE = 2;

/** Preferencia del dueño (2026-08-11, segunda ronda): UNA sola hoja siempre
 * que quepa. Martha deja un paquete de planillas en la finca, así que cada
 * página de más se multiplica por todos los meses del paquete. */
export const PAGINAS_PREFERIDAS_PLANILLA_PESAJE = 1;

/** Tope de comodidad: con el hato de hoy sobra alto, y una fila de 20mm sería
 * absurda. Por encima de esto no se estira más -- se deja el aire abajo. */
export const ALTO_MAXIMO_FILA_PESAJE_MM = 12;

/** Piso para apretar en una sola hoja. Por DEBAJO de esto, meter todo en una
 * página deja de ser un favor: son casillas donde hay que escribir a mano un
 * número de dos dígitos, en un corral. Cuando el roster no alcanza a caber
 * con al menos este alto, se gasta la segunda hoja -- que es exactamente el
 * criterio inverso al de `ALTO_MAXIMO`, y por eso los dos viven juntos. */
export const ALTO_MINIMO_COMODO_FILA_PESAJE_MM = 6;

/** Requisito duro del dueño, heredado de la planilla de chequeo. Es el tamaño
 * PREFERIDO, no un mínimo inviolable: si el hato creciera tanto que a 11pt no
 * cupiera en 2 páginas, baja hasta `FUENTE_MINIMA_PESAJE_PT` antes que
 * romper el tope de páginas. Acá el único texto impreso es el NOMBRE de la
 * vaca (las casillas van vacías), así que un punto menos no le quita
 * legibilidad a nada que Martha tenga que leer en el corral. */
export const FUENTE_DATOS_PESAJE_PT = 11;
export const FUENTE_MINIMA_PESAJE_PT = 9;
export const FUENTE_ENCABEZADO_PESAJE_PT = 8;

const MM_POR_PUNTO = 25.4 / 72;
/** `lineHeightFactor` por defecto de jsPDF. */
const FACTOR_INTERLINEADO_JSPDF = 1.15;
/** `cellPadding` vertical (arriba + abajo se cuentan por separado). */
export const PADDING_VERTICAL_CELDA_PESAJE_MM = 0.5;

/** Alto que ocupa una fila por su propio contenido, sin `minCellHeight`. */
function altoNaturalFila(fuentePt: number): number {
  return fuentePt * MM_POR_PUNTO * FACTOR_INTERLINEADO_JSPDF + 2 * PADDING_VERTICAL_CELDA_PESAJE_MM;
}

/** La letra más grande cuya fila natural todavía cabe en `alto`. */
function fuenteMaximaParaAlto(alto: number): number {
  return (alto - 2 * PADDING_VERTICAL_CELDA_PESAJE_MM) / (MM_POR_PUNTO * FACTOR_INTERLINEADO_JSPDF);
}

export interface MetricasFilaPesaje {
  /** `minCellHeight` de las filas de datos. */
  altoFila: number;
  /** `fontSize` de las filas de datos. */
  fuentePt: number;
  /** Cuántas filas hay que meter por página para lograr `paginasObjetivo`. */
  filasPorPagina: number;
  /** En cuántas páginas se está apuntando a repartir el roster. */
  paginasObjetivo: number;
  /** `false` = ni con la letra mínima cabe en `PAGINAS_MAXIMAS_PLANILLA_PESAJE`.
   * No se falsea el resultado: se imprime legible y se desborda, en vez de
   * comprimir hasta lo ilegible por cumplir un número. */
  cabeEnPaginasMaximas: boolean;
}

/** Alto de fila que resulta de repartir el roster en `paginas`, sin topes. */
function altoPorFilaEn(numFilas: number, paginas: number): number {
  return ALTO_UTIL_CUERPO_PESAJE_PDF_MM / Math.ceil(numFilas / paginas);
}

/**
 * Deriva alto de fila y tamaño de letra del NÚMERO REAL de filas, para que el
 * conteo de páginas sea un invariante y no una medición que envejece.
 *
 * Busca el MENOR número de páginas en que el roster quepa con filas todavía
 * escribibles (`ALTO_MINIMO_COMODO_FILA_PESAJE_MM`), empezando por una sola
 * hoja. Ese piso es lo que impide que "una página" degenere en 60 rayas de
 * 3mm: cuando apretar deja de ser un favor, se gasta la segunda hoja. Con el
 * roster de hoy (35) cabe todo en UNA página con filas de ~6,7mm a 11pt.
 *
 * Techos del formato, en filas (carta vertical, cuerpo útil de 234,4mm):
 *   - 1 página: ~39 con filas cómodas · 42 a 11pt · 50 en el piso físico de 9pt
 *   - 2 páginas: ~78 cómodas · 100 en el piso físico
 *
 * Pasado eso devuelve `cabeEnPaginasMaximas: false` y se desborda: nunca se
 * comprime por debajo de `FUENTE_MINIMA_PESAJE_PT` para cumplir un número.
 */
export function calcularMetricasFilaPesaje(numFilas: number): MetricasFilaPesaje {
  if (numFilas <= 0) {
    return {
      altoFila: ALTO_MAXIMO_FILA_PESAJE_MM,
      fuentePt: FUENTE_DATOS_PESAJE_PT,
      filasPorPagina: 0,
      paginasObjetivo: PAGINAS_PREFERIDAS_PLANILLA_PESAJE,
      cabeEnPaginasMaximas: true,
    };
  }

  const metricasPara = (paginas: number, altoDisponible: number): MetricasFilaPesaje => {
    const altoFila = Math.min(ALTO_MAXIMO_FILA_PESAJE_MM, altoDisponible);
    return {
      altoFila,
      fuentePt: Math.max(
        FUENTE_MINIMA_PESAJE_PT,
        Math.min(FUENTE_DATOS_PESAJE_PT, Math.floor(fuenteMaximaParaAlto(altoFila))),
      ),
      filasPorPagina: Math.ceil(numFilas / paginas),
      paginasObjetivo: paginas,
      cabeEnPaginasMaximas: true,
    };
  };

  for (let paginas = PAGINAS_PREFERIDAS_PLANILLA_PESAJE; paginas <= PAGINAS_MAXIMAS_PLANILLA_PESAJE; paginas++) {
    const altoDisponible = altoPorFilaEn(numFilas, paginas);
    if (altoDisponible >= ALTO_MINIMO_COMODO_FILA_PESAJE_MM) return metricasPara(paginas, altoDisponible);
  }

  // Ninguna cantidad de páginas dentro del tope da filas CÓMODAS. Se estira lo
  // que se pueda dentro del tope: mientras la fila siga por encima del piso
  // FÍSICO (la altura que la letra mínima ocupa de todas formas), el tope de
  // páginas se cumple aunque las filas queden apretadas.
  const altoEnElTope = altoPorFilaEn(numFilas, PAGINAS_MAXIMAS_PLANILLA_PESAJE);
  const pisoFisico = altoNaturalFila(FUENTE_MINIMA_PESAJE_PT);
  if (altoEnElTope >= pisoFisico) return metricasPara(PAGINAS_MAXIMAS_PLANILLA_PESAJE, altoEnElTope);

  return {
    altoFila: pisoFisico,
    fuentePt: FUENTE_MINIMA_PESAJE_PT,
    filasPorPagina: Math.ceil(numFilas / PAGINAS_MAXIMAS_PLANILLA_PESAJE),
    paginasObjetivo: PAGINAS_MAXIMAS_PLANILLA_PESAJE,
    cabeEnPaginasMaximas: false,
  };
}

const COLOR_PRIMARIO: [number, number, number] = [115, 153, 28]; // #73991C
const COLOR_GRIS_REFERENCIA: [number, number, number] = [240, 240, 240];
const COLOR_BLANCO: [number, number, number] = [255, 255, 255];
const COLOR_BORDE: [number, number, number] = [90, 90, 90];
const COLOR_TEXTO: [number, number, number] = [30, 30, 30];
const COLOR_TEXTO_TENUE: [number, number, number] = [110, 110, 110];

export const NOTA_OPERATIVA_PLANILLA_PESAJE =
  'Escriba los litros de AM y PM de cada semana. Puede anotar medios (6 1/2 o 6.5). Casilla en blanco = no se pesó.';

// ----------------------------------------------------------------------------
// 3. Encabezados de dos filas: fila 1 = "Sem N (fecha)" (una sola vez, texto
//    centrado sobre el bloque de 2 columnas vía `colSpan`); fila 2 = AM / PM.
// ----------------------------------------------------------------------------

interface CeldaEncabezado {
  content: string;
  colSpan?: number;
}

/**
 * Construye las DOS filas de encabezado de `autoTable`. `fechasPorSemana`
 * es la salida de `fechasPorSemanaDelMes` (`exportarPlanillaPesaje.ts`) --
 * una semana sin ocurrencia real ese mes muestra el rótulo igual ("Sem 5")
 * pero SIN fecha, nunca una fecha inventada.
 */
export function construirEncabezadoPlanillaPesajePDF(
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>,
): [CeldaEncabezado[], CeldaEncabezado[]] {
  // "Nombre" va en la fila de arriba (junto a los rótulos "Sem N"); la fila
  // de abajo deja su celda en blanco -- evita depender de `rowSpan` (soporte
  // más frágil de verificar sin renderizar de verdad) para un caso tan
  // simple como una sola columna de ancla.
  const filaSemanas: CeldaEncabezado[] = [{ content: 'Nombre', colSpan: 1 }];
  const filaSub: CeldaEncabezado[] = [{ content: '' }];

  for (const semana of SEMANAS_PESAJE) {
    const fecha = fechaCortaColumna(fechasPorSemana[semana]);
    filaSemanas.push({ content: fecha ? `Sem ${semana} (${fecha})` : `Sem ${semana}`, colSpan: SUBCOLUMNAS.length });
    for (const sub of SUBCOLUMNAS) filaSub.push({ content: sub });
  }

  return [filaSemanas, filaSub];
}

// ----------------------------------------------------------------------------
// 4. Filas de datos -- roster EN BLANCO (nunca arrastra valores: no hay
//    pesaje que arrastrar de un mes a otro).
// ----------------------------------------------------------------------------

/** Una fila por vaca del roster: nombre + 10 celdas vacías (AM/PM × 5
 * semanas). Siempre vacío -- esta planilla es un formulario en blanco, no
 * una planilla incremental como la de chequeo. */
export function construirFilasPlanillaPesajePDF(animales: readonly AnimalPlanillaPesaje[]): string[][] {
  const totalCeldasDatos = SEMANAS_PESAJE.length * SUBCOLUMNAS.length;
  return ordenarRosterPesaje(animales).map((a) => [a.nombre, ...new Array(totalCeldasDatos).fill('')]);
}

// ----------------------------------------------------------------------------
// 5. Construcción del documento.
// ----------------------------------------------------------------------------

export type JsPDFConstructor = typeof import('jspdf').default;
export type AutoTableFn = typeof import('jspdf-autotable').default;

export interface LibreriasPDFPlanillaPesaje {
  jsPDF: JsPDFConstructor;
  autoTable: AutoTableFn;
}

export interface OpcionesPlanillaPesajePDF {
  anio: number;
  mes: number;
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>;
  animales: readonly AnimalPlanillaPesaje[];
}

type DocumentoPDF = InstanceType<JsPDFConstructor>;

function dibujarEncabezadoPagina(doc: DocumentoPDF, titulo: string, subtitulo: string): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.text(titulo, MARGENES_PESAJE_PDF_MM.left, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_TEXTO_TENUE);
  doc.text(subtitulo, MARGENES_PESAJE_PDF_MM.left, 15.5);
}

function estamparPiesDePagina(doc: DocumentoPDF): void {
  const total = doc.getNumberOfPages();
  const altoPagina = doc.internal.pageSize.getHeight();
  const anchoPagina = doc.internal.pageSize.getWidth();
  const y = altoPagina - 5;

  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text(NOTA_OPERATIVA_PLANILLA_PESAJE, MARGENES_PESAJE_PDF_MM.left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, anchoPagina - MARGENES_PESAJE_PDF_MM.right, y, { align: 'right' });
  }
}

/**
 * Arma el documento completo y lo devuelve SIN guardarlo. Decisiones de
 * layout:
 * - Carta VERTICAL: con 11 columnas (Nombre + 10) la tabla cabe de sobra a
 *   lo ancho, y el alto -- que es lo escaso -- gana 63mm frente a la
 *   horizontal.
 * - `theme: 'grid'`: recuadro visible en todas las celdas -- ancla la celda
 *   para el OCR (`ocrPesaje.ts`).
 * - `showHead: 'everyPage'` + `rowPageBreak: 'avoid'`: ninguna fila de vaca
 *   se corta entre dos páginas y el encabezado se repite.
 * - Alto de fila y letra salen de `calcularMetricasFilaPesaje`, nunca de una
 *   constante fija -- es lo que sostiene el tope de 2 páginas.
 */
export function construirDocumentoPlanillaPesajePDF(
  libs: LibreriasPDFPlanillaPesaje,
  opciones: OpcionesPlanillaPesajePDF,
): DocumentoPDF {
  const doc = new libs.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const [filaSemanas, filaSub] = construirEncabezadoPlanillaPesajePDF(opciones.fechasPorSemana);
  const titulo = construirTituloPlanillaPesaje(opciones.anio, opciones.mes);
  const subtitulo = `${opciones.animales.length} animal(es) en la planilla · escriba AM y PM de cada semana`;
  const metricas = calcularMetricasFilaPesaje(opciones.animales.length);

  // `columnStyles` de autoTable SOLO aplica a celdas del cuerpo (sección
  // 'body') -- la cabecera siempre usa `headStyles` (verificado contra el
  // código fuente de jspdf-autotable, `cellStyles()`: `colStyles =
  // sectionName === 'body' ? columnStyles : {}`). Así que fillColor/
  // lineWidth acá nunca pisan el verde de `headStyles` -- mismo criterio que
  // `exportarPlanillaChequeoPDF.ts`.
  interface EstiloColumna {
    cellWidth: number;
    fillColor: [number, number, number];
    lineWidth: number;
    halign?: 'left' | 'center';
  }
  const estilosPorColumna: Record<string, EstiloColumna> = {
    '0': { cellWidth: ANCHOS_COLUMNAS_PESAJE_PDF_MM[0], fillColor: COLOR_GRIS_REFERENCIA, lineWidth: 0.2, halign: 'left' },
  };
  let indiceColumna = 1;
  for (const _semana of SEMANAS_PESAJE) {
    for (const _sub of SUBCOLUMNAS) {
      // Todas las columnas de datos son diligenciables: fondo blanco y borde
      // marcado. Ya no hay columna de referencia grisada -- se retiró.
      estilosPorColumna[String(indiceColumna)] = {
        cellWidth: ANCHOS_COLUMNAS_PESAJE_PDF_MM[indiceColumna],
        fillColor: COLOR_BLANCO,
        lineWidth: 0.45,
      };
      indiceColumna += 1;
    }
  }

  libs.autoTable(doc, {
    head: [filaSemanas, filaSub],
    body: construirFilasPlanillaPesajePDF(opciones.animales),
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    margin: MARGENES_PESAJE_PDF_MM,
    tableWidth: ANCHO_TABLA_PESAJE_PDF_MM,
    styles: {
      font: 'helvetica',
      fontSize: metricas.fuentePt,
      textColor: COLOR_TEXTO,
      lineColor: COLOR_BORDE,
      lineWidth: 0.2,
      cellPadding: {
        top: PADDING_VERTICAL_CELDA_PESAJE_MM,
        right: 1,
        bottom: PADDING_VERTICAL_CELDA_PESAJE_MM,
        left: 1,
      },
      minCellHeight: metricas.altoFila,
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: estilosPorColumna,
    headStyles: {
      fillColor: COLOR_PRIMARIO,
      textColor: COLOR_BLANCO,
      fontStyle: 'bold',
      fontSize: FUENTE_ENCABEZADO_PESAJE_PT,
      halign: 'center',
      valign: 'middle',
      minCellHeight: ALTO_ENCABEZADO_TABLA_PESAJE_MM / 2,
      lineWidth: 0.2,
    },
    didDrawPage: () => dibujarEncabezadoPagina(doc, titulo, subtitulo),
  });

  estamparPiesDePagina(doc);
  return doc;
}

/**
 * Construye el PDF y dispara la descarga. Única función de este archivo que
 * hace I/O: `await import()` dinámico de las dos librerías (nunca en el
 * bundle inicial) y `doc.save`.
 */
export async function descargarPlanillaPesajePDF(
  opciones: OpcionesPlanillaPesajePDF,
  nombreArchivo: string,
): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = construirDocumentoPlanillaPesajePDF({ jsPDF, autoTable }, opciones);
  doc.save(nombreArchivo);
}
