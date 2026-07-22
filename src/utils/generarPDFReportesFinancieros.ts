// PDF del P&G y del Flujo de Caja.
//
// Usa jspdf-autotable (mismo precedente que `generarPDFReporteCierre.ts`) y no
// html2canvas: rasterizar una tabla ancha produce un PDF pesado e ilegible.
//
// CRÍTICO: formatea con las MISMAS funciones que la pantalla
// (`formatearCelda` / `formatearCeldaFlujo`). Los otros generadores del repo
// usan `formatearMoneda`, que imprime el símbolo COP y produce cifras que se
// ven distintas a la tabla. Un PDF que no coincide con la pantalla destruye la
// confianza en ambos.

import { formatearCelda } from '@/components/finanzas/reportes/TablaPyG';
import { formatearCeldaFlujo } from '@/components/finanzas/reportes/TablaFlujoCaja';
import type { ReporteFlujoCaja, ReportePyG } from '@/types/reportesFinancieros';

const COLOR_PRIMARIO: [number, number, number] = [115, 153, 28];
const COLOR_TEXTO: [number, number, number] = [77, 36, 15];
const COLOR_RESULTADO: [number, number, number] = [238, 244, 228];
const COLOR_SUBTOTAL: [number, number, number] = [249, 250, 251];

interface Args {
  pyg?: ReportePyG;
  flujo?: ReporteFlujoCaja;
}

export async function generarPDFReportesFinancieros({ pyg, flujo }: Args): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const esFlujo = Boolean(flujo);
  const doc = new jsPDF({ orientation: esFlujo ? 'landscape' : 'portrait' });

  const titulo = esFlujo ? 'FLUJO DE CAJA' : 'ESTADO DE RESULTADOS (P&G)';
  const nombre = (pyg ?? flujo)!.vista_nombre;
  const anio = (pyg ?? flujo)!.anio;

  doc.setFontSize(18);
  doc.setTextColor(...COLOR_PRIMARIO);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'normal');
  doc.text(`${nombre} · ${anio}`, 14, 25);

  if (pyg) {
    generarTablaPyG(doc, autoTable, pyg);
  } else if (flujo) {
    generarTablaFlujo(doc, autoTable, flujo);
  }

  const archivo = `${esFlujo ? 'flujo-caja' : 'pyg'}-${nombre.toLowerCase().replace(/\s+/g, '-')}-${anio}.pdf`;
  doc.save(archivo);
}

type AutoTable = typeof import('jspdf-autotable').default;
type Doc = InstanceType<Awaited<typeof import('jspdf')>['default']>;

function generarTablaPyG(doc: Doc, autoTable: AutoTable, pyg: ReportePyG): void {
  // Los conceptos (nivel 2) se omiten: el PDF es el resumen que se imprime y
  // se discute, no el detalle navegable.
  const lineas = pyg.lineas.filter((l) => l.nivel !== 2);

  const cuerpo = lineas.map((linea) => [
    `${linea.nivel === 1 ? '    ' : ''}${linea.etiqueta}`,
    ...pyg.periodos.map((_, i) => (linea.tipo === 'seccion' ? '' : formatearCelda(linea, i).texto)),
  ]);

  autoTable(doc, {
    startY: 32,
    head: [['Concepto', ...pyg.periodos.map((p) => p.label)]],
    body: cuerpo,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: COLOR_TEXTO },
    headStyles: { fillColor: COLOR_PRIMARIO, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 62, halign: 'left' },
    },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      if (data.column.index > 0) data.cell.styles.halign = 'right';

      const linea = lineas[data.row.index];
      if (!linea) return;

      if (linea.tipo === 'resultado') {
        data.cell.styles.fillColor = COLOR_RESULTADO;
        data.cell.styles.fontStyle = 'bold';
      } else if (linea.tipo === 'subtotal' || linea.tipo === 'seccion') {
        data.cell.styles.fillColor = COLOR_SUBTOTAL;
        data.cell.styles.fontStyle = 'bold';
      } else if (linea.tipo === 'indicador') {
        data.cell.styles.fontStyle = 'italic';
      }
    },
  });

  agregarNotas(doc, [
    pyg.modo === 'cosecha'
      ? 'Cada cosecha carga los gastos del semestre en que se trabajo esa fruta.'
      : 'Columnas acumuladas desde enero.',
    'Solo incluye gastos confirmados. La compra de ganado no es gasto: es inversion en inventario.',
    ...pyg.advertencias.map((a) => `! ${a.mensaje}`),
  ]);
}

function generarTablaFlujo(doc: Doc, autoTable: AutoTable, flujo: ReporteFlujoCaja): void {
  const cuerpo = flujo.lineas.map((linea) => [
    `${linea.nivel === 1 ? '    ' : ''}${linea.etiqueta}`,
    ...linea.meses.map((v) => formatearCeldaFlujo(linea, v).texto),
    formatearCeldaFlujo(linea, linea.total).texto,
  ]);

  autoTable(doc, {
    startY: 32,
    head: [['Concepto', ...flujo.meses_label, 'Total']],
    body: cuerpo,
    theme: 'grid',
    styles: { fontSize: 6.5, cellPadding: 1.5, textColor: COLOR_TEXTO },
    headStyles: { fillColor: COLOR_PRIMARIO, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 46, halign: 'left' } },
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      if (data.column.index > 0) data.cell.styles.halign = 'right';

      const linea = flujo.lineas[data.row.index];
      if (!linea) return;

      if (linea.tipo === 'resultado') {
        data.cell.styles.fillColor = COLOR_RESULTADO;
        data.cell.styles.fontStyle = 'bold';
      } else if (linea.tipo === 'subtotal') {
        data.cell.styles.fillColor = COLOR_SUBTOTAL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  agregarNotas(doc, [
    'Movimientos por fecha de registro. No es una conciliacion bancaria.',
    'La compra de ganado es salida de caja pero no es gasto en el P&G.',
    ...flujo.advertencias.map((a) => `! ${a.mensaje}`),
  ]);
}

function agregarNotas(doc: Doc, notas: string[]): void {
  const y = ((doc as any).lastAutoTable?.finalY ?? 32) + 8;
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.setFont('helvetica', 'normal');

  const ancho = doc.internal.pageSize.getWidth() - 28;
  let cursor = y;

  for (const nota of notas) {
    const lineas = doc.splitTextToSize(nota, ancho) as string[];
    for (const l of lineas) {
      if (cursor > doc.internal.pageSize.getHeight() - 12) {
        doc.addPage();
        cursor = 20;
      }
      doc.text(l, 14, cursor);
      cursor += 4;
    }
  }
}
