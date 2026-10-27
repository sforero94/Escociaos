// Stub deliberado: el PDF de producción sigue siendo una captura sin texto.
// Las pruebas de src/__tests__/reporteSemanalPdf.test.ts describen el
// documento que la descarga tiene que producir. Este archivo existe para
// que esas pruebas compilen y fallen; el arreglo lo reemplaza.

import type { DatosReporteSemanal } from '@/types/reporteSemanal';

export type JsPDFConstructor = typeof import('jspdf').default;
export type AutoTableFn = typeof import('jspdf-autotable').default;

export interface LibreriasPdfReporte {
  jsPDF: JsPDFConstructor;
  autoTable: AutoTableFn;
}

type DocumentoPDF = InstanceType<JsPDFConstructor>;

export interface AnalisisReportePdf {
  resumen_ejecutivo: string;
  titulares: {
    personal?: string;
    labores?: string;
    jornales?: string;
    monitoreo?: string;
    aplicaciones?: string;
    clima?: string;
    floracion?: string;
    conductividad_electrica?: string;
    colmenas?: string;
  };
  conclusiones: Array<{
    texto: string;
    prioridad: string;
    contexto?: string;
  }>;
  interpretacion_monitoreo?: string;
  interpretacion_tendencias_monitoreo?: string;
  interpretacion_clima?: string;
  interpretacion_floracion?: string;
  interpretacion_ce?: string;
  interpretacion_colmenas?: string;
}

export interface PayloadReportePdf {
  v: 1;
  datos: DatosReporteSemanal;
  analisis: AnalisisReportePdf;
}

function paginaVacia(libs: LibreriasPdfReporte): DocumentoPDF {
  return new libs.jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [960, 540],
    compress: false,
  });
}

export function incrustarPayloadReporte(
  html: string,
  _datos: DatosReporteSemanal,
  _analisis: AnalisisReportePdf,
): string {
  return html;
}

export function extraerPayloadReporte(_html: string): PayloadReportePdf | null {
  return null;
}

export function armarPdfReporteDesdeHtml(libs: LibreriasPdfReporte, _html: string): DocumentoPDF {
  return paginaVacia(libs);
}

export function construirDocumentoReporteSemanal(
  libs: LibreriasPdfReporte,
  _datos: DatosReporteSemanal,
  _analisis: AnalisisReportePdf,
): DocumentoPDF {
  return paginaVacia(libs);
}
