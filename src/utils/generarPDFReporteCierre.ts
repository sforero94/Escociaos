// utils/generarPDFReporteCierre.ts
// Genera PDF del reporte de cierre de una aplicación

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatearMoneda, formatearNumero } from './format';

export interface DatosReporteCierre {
  nombre: string;
  tipo_aplicacion: string;
  proposito?: string;

  fecha_inicio_planeada?: string;
  fecha_fin_planeada?: string;
  fecha_inicio_ejecucion?: string;
  fecha_cierre?: string;
  dias_aplicacion: number;

  lotes: Array<{ nombre: string; arboles: number }>;
  total_arboles: number;

  costo_total_insumos: number;
  costo_total_mano_obra: number;
  costo_total: number;
  costo_por_arbol: number;
  jornales_utilizados: number;
  valor_jornal: number;
  arboles_por_jornal: number;

  comparacion_productos: Array<{
    producto_nombre: string;
    producto_unidad: string;
    cantidad_planeada: number;
    cantidad_real: number;
    diferencia: number;
    porcentaje_desviacion: number;
    costo_total: number;
  }>;

  observaciones_cierre?: string;
  cerrado_por?: string;
}

function formatearFechaCorta(fecha?: string): string {
  if (!fecha) return '-';
  const [year, month, day] = fecha.split('T')[0].split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${meses[parseInt(month) - 1]} ${year}`;
}

export function generarPDFReporteCierre(datos: DatosReporteCierre): void {
  const doc = new jsPDF();

  const colorPrimario = [115, 153, 28] as [number, number, number];
  const colorSecundario = [191, 217, 125] as [number, number, number];
  const colorGris = [77, 36, 15] as [number, number, number];

  let yPosition = 20;

  // ========================================
  // ENCABEZADO
  // ========================================

  doc.setFontSize(20);
  doc.setTextColor(...colorPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE CIERRE', 15, yPosition + 10);

  doc.setFontSize(12);
  doc.setTextColor(...colorGris);
  doc.setFont('helvetica', 'normal');
  doc.text('Aplicación Fitosanitaria', 15, yPosition + 17);

  doc.setFontSize(9);
  doc.text('Escocia Hass - Sistema de Gestión', 15, yPosition + 24);

  // Fecha de generación (derecha)
  doc.setFontSize(9);
  doc.setTextColor(...colorGris);
  doc.text(
    `Generado: ${new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`,
    195,
    yPosition + 10,
    { align: 'right' }
  );

  if (datos.cerrado_por) {
    doc.text(`Cerrado por: ${datos.cerrado_por}`, 195, yPosition + 15, { align: 'right' });
  }

  yPosition += 35;

  // ========================================
  // INFORMACIÓN DE LA APLICACIÓN
  // ========================================

  doc.setFillColor(...colorSecundario);
  doc.rect(15, yPosition, 180, 30, 'F');

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  const tipoTexto =
    datos.tipo_aplicacion === 'Fumigación' || datos.tipo_aplicacion === 'fumigacion'
      ? 'Fumigación'
      : datos.tipo_aplicacion === 'Fertilización' || datos.tipo_aplicacion === 'fertilizacion'
        ? 'Fertilización'
        : 'Drench';

  const infoAplicacion = [
    { label: 'Aplicación:', value: datos.nombre },
    { label: 'Tipo:', value: tipoTexto },
    { label: 'Inicio real:', value: formatearFechaCorta(datos.fecha_inicio_ejecucion) },
    { label: 'Cierre:', value: formatearFechaCorta(datos.fecha_cierre) },
    { label: 'Días ejecución:', value: `${datos.dias_aplicacion}` },
    { label: 'Lotes:', value: datos.lotes.map((l) => l.nombre).join(', ') },
  ];

  infoAplicacion.forEach((info, index) => {
    const x = index % 2 === 0 ? 20 : 110;
    const y = yPosition + 7 + Math.floor(index / 2) * 7;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(info.label, x, y);
    doc.setFont('helvetica', 'normal');
    const valueText = info.value.length > 40 ? info.value.substring(0, 40) + '...' : info.value;
    doc.text(valueText, x + 28, y);
  });

  yPosition += 40;

  // ========================================
  // RESUMEN DE COSTOS (cajas coloreadas)
  // ========================================

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  doc.text('RESUMEN DE COSTOS', 15, yPosition);
  yPosition += 7;

  const boxWidth = 34;
  const boxHeight = 22;
  const boxSpacing = 3;

  const costBoxes = [
    { label: 'Insumos', value: formatearMoneda(datos.costo_total_insumos), color: [59, 130, 246] as [number, number, number] },
    { label: 'Mano de Obra', value: formatearMoneda(datos.costo_total_mano_obra), color: [168, 85, 247] as [number, number, number] },
    { label: 'Costo Total', value: formatearMoneda(datos.costo_total), color: colorPrimario },
    { label: 'Costo/Árbol', value: formatearMoneda(datos.costo_por_arbol), color: [234, 88, 12] as [number, number, number] },
    { label: 'Árb/Jornal', value: formatearNumero(datos.arboles_por_jornal, 1), color: [20, 184, 166] as [number, number, number] },
  ];

  costBoxes.forEach((box, index) => {
    const x = 15 + index * (boxWidth + boxSpacing);

    doc.setFillColor(...box.color);
    doc.roundedRect(x, yPosition, boxWidth, boxHeight, 2, 2, 'F');

    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text(box.label, x + boxWidth / 2, yPosition + 7, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + boxWidth / 2, yPosition + 15, { align: 'center' });
  });

  yPosition += 30;

  // Info adicional de ejecución
  doc.setFontSize(9);
  doc.setTextColor(...colorGris);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Total árboles tratados: ${datos.total_arboles.toLocaleString('es-CO')}  |  Jornales: ${formatearNumero(datos.jornales_utilizados, 1)}  |  Valor jornal prom: ${formatearMoneda(datos.valor_jornal)}`,
    15,
    yPosition
  );

  yPosition += 10;

  // ========================================
  // TABLA DE COMPARACIÓN DE PRODUCTOS
  // ========================================

  if (datos.comparacion_productos.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorPrimario);
    doc.text('COMPARACIÓN DE PRODUCTOS', 15, yPosition);
    yPosition += 5;

    const tableData = datos.comparacion_productos.map((prod) => {
      const desv = prod.porcentaje_desviacion;
      return [
        prod.producto_nombre,
        prod.producto_unidad,
        formatearNumero(prod.cantidad_planeada),
        formatearNumero(prod.cantidad_real),
        `${prod.diferencia > 0 ? '+' : ''}${formatearNumero(prod.diferencia)}`,
        `${desv > 0 ? '+' : ''}${formatearNumero(desv, 1)}%`,
        formatearMoneda(prod.costo_total),
      ];
    });

    // Totals row
    const totalPlaneado = datos.comparacion_productos.reduce((s, p) => s + p.cantidad_planeada, 0);
    const totalReal = datos.comparacion_productos.reduce((s, p) => s + p.cantidad_real, 0);
    const totalCosto = datos.comparacion_productos.reduce((s, p) => s + p.costo_total, 0);

    autoTable(doc, {
      startY: yPosition,
      head: [['Producto', 'Unidad', 'Planeado', 'Real', 'Diferencia', '% Desv.', 'Costo']],
      body: tableData,
      foot: [['', '', formatearNumero(totalPlaneado), formatearNumero(totalReal), '', '', formatearMoneda(totalCosto)]],
      theme: 'grid',
      headStyles: {
        fillColor: colorPrimario,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 50,
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 18 },
        2: { cellWidth: 22, halign: 'right' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 28, halign: 'right' },
      },
      didParseCell: (data) => {
        // Highlight rows with >20% deviation in red
        if (data.section === 'body' && data.column.index === 5) {
          const prod = datos.comparacion_productos[data.row.index];
          if (prod && Math.abs(prod.porcentaje_desviacion) > 20) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      margin: { left: 15, right: 15 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // ========================================
  // ALERTAS DE DESVIACIÓN
  // ========================================

  const desviacionesAltas = datos.comparacion_productos.filter(
    (p) => Math.abs(p.porcentaje_desviacion) > 20
  );

  if (desviacionesAltas.length > 0) {
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('PRODUCTOS CON DESVIACIÓN > 20%', 15, yPosition);
    yPosition += 6;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    desviacionesAltas.forEach((prod) => {
      doc.text(
        `• ${prod.producto_nombre}: planeado ${formatearNumero(prod.cantidad_planeada)} ${prod.producto_unidad} → real ${formatearNumero(prod.cantidad_real)} ${prod.producto_unidad} (${prod.porcentaje_desviacion > 0 ? '+' : ''}${formatearNumero(prod.porcentaje_desviacion, 1)}%)`,
        20,
        yPosition
      );
      yPosition += 5;
    });

    yPosition += 5;
  }

  // ========================================
  // DETALLE POR LOTE
  // ========================================

  if (datos.lotes.length > 0) {
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorPrimario);
    doc.text('DETALLE POR LOTE', 15, yPosition);
    yPosition += 5;

    const lotesTableData = datos.lotes.map((lote) => [
      lote.nombre,
      lote.arboles.toLocaleString('es-CO'),
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [['Lote', 'Árboles']],
      body: lotesTableData,
      foot: [['TOTAL', datos.total_arboles.toLocaleString('es-CO')]],
      theme: 'grid',
      headStyles: {
        fillColor: colorPrimario,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: 50 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 40, halign: 'right' },
      },
      margin: { left: 15, right: 15 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // ========================================
  // OBSERVACIONES
  // ========================================

  if (datos.observaciones_cierre) {
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorPrimario);
    doc.text('OBSERVACIONES', 15, yPosition);
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    const lines = doc.splitTextToSize(datos.observaciones_cierre, 170);
    doc.text(lines, 15, yPosition);
    yPosition += lines.length * 4 + 5;
  }

  // ========================================
  // PROPÓSITO
  // ========================================

  if (datos.proposito) {
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorGris);
    doc.text('Propósito:', 15, yPosition);
    doc.setFont('helvetica', 'normal');
    const propLines = doc.splitTextToSize(datos.proposito, 170);
    doc.text(propLines, 15, yPosition + 5);
  }

  // ========================================
  // PIE DE PÁGINA
  // ========================================

  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(...colorGris);
    doc.line(15, 285, 195, 285);

    doc.setFontSize(8);
    doc.setTextColor(...colorGris);
    doc.setFont('helvetica', 'italic');

    doc.text(
      'Documento generado automáticamente. Los datos reflejan el estado al momento del cierre.',
      105,
      290,
      { align: 'center' }
    );

    doc.text(`Página ${i} de ${pageCount}`, 195, 290, { align: 'right' });
    doc.text('Escocia Hass - Sistema de Gestión', 15, 290);
  }

  // ========================================
  // GUARDAR PDF
  // ========================================

  const nombreArchivo = `Reporte_Cierre_${datos.nombre.replace(/\s+/g, '_')}_${
    new Date().toISOString().split('T')[0]
  }.pdf`;

  doc.save(nombreArchivo);
}
