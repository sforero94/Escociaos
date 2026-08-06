// ARCHIVO: utils/hato/exportarPlanillaPesajePDF.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md`, punto 1 -- arma
// el PDF IMPRIMIBLE de la planilla mensual de pesaje en blanco, mismo split
// PURO/IO y mismas librerías (`jspdf` + `jspdf-autotable`, YA dependencias
// del repo, ninguna nueva) que `exportarPlanillaChequeoPDF.ts`.
//
// Layout: `Nombre` + 5 bloques de semana, cada bloque con 3 sub-columnas
// (AM | PM | Total). AM/PM son las que Martha diligencia a mano (fondo
// blanco, borde marcado); Total es de REFERENCIA -- el sistema la imprime
// ya calculada como guía visual, pero NUNCA se lee del papel (`ocrPesaje.ts`
// deriva siempre de AM+PM). El sub-encabezado de cada bloque lleva la fecha
// real de esa semana (`fechasPorSemanaDelMes`, `exportarPlanillaPesaje.ts`)
// -- nunca "Semana N" a secas, para que Martha ubique el miércoles exacto.
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
// 1. Layout de columnas: Nombre + 5 × (AM, PM, Total).
// ----------------------------------------------------------------------------

type SubcolumnaPesajePDF = 'AM' | 'PM' | 'Total';
const SUBCOLUMNAS: readonly SubcolumnaPesajePDF[] = ['AM', 'PM', 'Total'];

/** Ancho de página disponible: carta HORIZONTAL, mismo presupuesto que
 * `exportarPlanillaChequeoPDF.ts` (279,4mm − 10mm de margen a cada lado =
 * 259,4mm útiles). A diferencia de esa planilla, los valores de esta son
 * números de 1-2 dígitos (litros por ordeño) -- no hay un corpus real de
 * planillas de pesaje del que medir el ancho máximo de contenido como se
 * hizo allá, así que los anchos de abajo son un presupuesto GENÉRICO
 * (columnas angostas, suficientes para "99,5") en vez de una medición contra
 * datos reales. Si en producción algún valor se ve apretado, es el primer
 * lugar a ajustar. */
export const ANCHO_COLUMNA_NOMBRE_PDF_MM = 30;
export const ANCHO_SUBCOLUMNA_PDF_MM = 12;

export const ANCHOS_COLUMNAS_PESAJE_PDF_MM: readonly number[] = [
  ANCHO_COLUMNA_NOMBRE_PDF_MM,
  ...SEMANAS_PESAJE.flatMap(() => SUBCOLUMNAS.map(() => ANCHO_SUBCOLUMNA_PDF_MM)),
];

export const ANCHO_TABLA_PESAJE_PDF_MM = ANCHOS_COLUMNAS_PESAJE_PDF_MM.reduce((a, b) => a + b, 0);

export const MARGENES_PESAJE_PDF_MM = { top: 20, right: 10, bottom: 12, left: 10 } as const;
export const ANCHO_UTIL_CARTA_HORIZONTAL_PESAJE_PDF_MM = 279.4 - MARGENES_PESAJE_PDF_MM.left - MARGENES_PESAJE_PDF_MM.right;

export const FUENTE_DATOS_PESAJE_PT = 11; // mismo requisito duro del dueño que la planilla de chequeo: ≥11pt.
export const FUENTE_ENCABEZADO_PESAJE_PT = 8;
export const ALTO_MINIMO_FILA_PESAJE_MM = 9;

const COLOR_PRIMARIO: [number, number, number] = [115, 153, 28]; // #73991C
const COLOR_GRIS_REFERENCIA: [number, number, number] = [240, 240, 240];
const COLOR_BLANCO: [number, number, number] = [255, 255, 255];
const COLOR_BORDE: [number, number, number] = [90, 90, 90];
const COLOR_TEXTO: [number, number, number] = [30, 30, 30];
const COLOR_TEXTO_TENUE: [number, number, number] = [110, 110, 110];

export const NOTA_OPERATIVA_PLANILLA_PESAJE =
  'Escriba AM y PM de cada semana. La columna Total es de referencia -- no la diligencie, el sistema la calcula.';

// ----------------------------------------------------------------------------
// 2. Encabezados de dos filas: fila 1 = "Sem N (fecha)" (una sola vez, texto
//    centrado sobre el bloque de 3 columnas vía celdas vacías en las otras
//    dos); fila 2 = AM / PM / Total. `jspdf-autotable` soporta `colSpan` en
//    celdas de `head` para fusionar visualmente el rótulo de la semana.
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
    filaSemanas.push({ content: fecha ? `Sem ${semana} (${fecha})` : `Sem ${semana}`, colSpan: 3 });
    for (const sub of SUBCOLUMNAS) filaSub.push({ content: sub });
  }

  return [filaSemanas, filaSub];
}

// ----------------------------------------------------------------------------
// 3. Filas de datos -- roster EN BLANCO (nunca arrastra valores: no hay
//    pesaje que arrastrar de un mes a otro).
// ----------------------------------------------------------------------------

/** Una fila por vaca del roster: nombre + 15 celdas vacías (AM/PM/Total ×
 * 5 semanas). Siempre vacío -- esta planilla es un formulario en blanco, no
 * una planilla incremental como la de chequeo. */
export function construirFilasPlanillaPesajePDF(animales: readonly AnimalPlanillaPesaje[]): string[][] {
  const totalCeldasDatos = SEMANAS_PESAJE.length * SUBCOLUMNAS.length;
  return ordenarRosterPesaje(animales).map((a) => [a.nombre, ...new Array(totalCeldasDatos).fill('')]);
}

// ----------------------------------------------------------------------------
// 4. Construcción del documento.
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
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_TEXTO_TENUE);
    doc.text(NOTA_OPERATIVA_PLANILLA_PESAJE, MARGENES_PESAJE_PDF_MM.left, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, anchoPagina - MARGENES_PESAJE_PDF_MM.right, y, { align: 'right' });
  }
}

/**
 * Arma el documento completo y lo devuelve SIN guardarlo. Decisiones de
 * layout (mismo criterio que la planilla de chequeo):
 * - Carta HORIZONTAL: 16 columnas (Nombre + 15) necesitan más ancho del que
 *   ofrece una carta vertical.
 * - `theme: 'grid'`: recuadro visible en todas las celdas -- ancla la celda
 *   para el OCR de la Fase 2 (S5, punto 2).
 * - `showHead: 'everyPage'` + `rowPageBreak: 'avoid'`: el hato completo
 *   (68 vacas activas al 2026-08-06) no cabe en una sola página; ninguna
 *   fila de vaca se corta entre dos páginas y el encabezado se repite.
 * - AM/PM en blanco con borde marcado (se diligencian); Total en gris tenue
 *   con borde fino (referencia, el sistema la calcula).
 */
export function construirDocumentoPlanillaPesajePDF(
  libs: LibreriasPDFPlanillaPesaje,
  opciones: OpcionesPlanillaPesajePDF,
): DocumentoPDF {
  const doc = new libs.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });

  const [filaSemanas, filaSub] = construirEncabezadoPlanillaPesajePDF(opciones.fechasPorSemana);
  const titulo = construirTituloPlanillaPesaje(opciones.anio, opciones.mes);
  const subtitulo = `${opciones.animales.length} vaca(s) en ordeño · escriba AM y PM; Total es de referencia (columnas grises)`;

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
    for (const sub of SUBCOLUMNAS) {
      const esReferencia = sub === 'Total';
      estilosPorColumna[String(indiceColumna)] = {
        cellWidth: ANCHOS_COLUMNAS_PESAJE_PDF_MM[indiceColumna],
        fillColor: esReferencia ? COLOR_GRIS_REFERENCIA : COLOR_BLANCO,
        lineWidth: esReferencia ? 0.2 : 0.45,
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
      fontSize: FUENTE_DATOS_PESAJE_PT,
      textColor: COLOR_TEXTO,
      lineColor: COLOR_BORDE,
      lineWidth: 0.2,
      cellPadding: { top: 1.2, right: 1, bottom: 1.2, left: 1 },
      minCellHeight: ALTO_MINIMO_FILA_PESAJE_MM,
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
      minCellHeight: 7,
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
