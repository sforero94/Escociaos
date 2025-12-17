import jsPDF from 'jspdf';
import type { ReportePyG, FiltrosFinanzas } from '../types/finanzas';
import { formatNumber } from './format';

interface GenerarPDFPyGOptions {
  reporte: ReportePyG;
  filtros: FiltrosFinanzas;
  titulo?: string;
  empresa?: string;
}

/**
 * Genera un PDF del reporte P&L (Pérdidas y Ganancias)
 */
export function generarPDFPyG({
  reporte,
  filtros,
  titulo = 'Reporte P&L',
  empresa = 'Escocia Hass'
}: GenerarPDFPyGOptions): void {
  const doc = new jsPDF();

  // Configuración inicial
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;
  let currentY = margin;

  // Función auxiliar para agregar texto centrado
  const addCenteredText = (text: string, y: number, size = 12, color: [number, number, number] = [0, 0, 0]) => {
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFontSize(size);
    const textWidth = doc.getTextWidth(text);
    const x = (pageWidth - textWidth) / 2;
    doc.text(text, x, y);
  };

  // Función auxiliar para formatear moneda
  const formatCurrency = (value: number): string => {
    return `$${formatNumber(Math.abs(value))}`;
  };

  // Función auxiliar para verificar si necesitamos nueva página
  const checkNewPage = (neededSpace: number) => {
    if (currentY + neededSpace > pageHeight - margin) {
      doc.addPage();
      currentY = margin;
      return true;
    }
    return false;
  };

  // Header
  doc.setFontSize(20);
  doc.setTextColor(115, 153, 28); // Verde primario
  doc.text(empresa, margin, currentY);
  currentY += 10;

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.text(titulo, margin, currentY);
  currentY += 10;

  // Fecha del reporte
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const fechaActual = new Date().toLocaleDateString('es-CO');
  doc.text(`Generado el: ${fechaActual}`, margin, currentY);
  currentY += 15;

  // Filtros aplicados
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Filtros aplicados:', margin, currentY);
  currentY += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);

  let filtrosTexto = '';
  switch (filtros.periodo) {
    case 'mes_actual': filtrosTexto = 'Mes Actual'; break;
    case 'trimestre': filtrosTexto = 'Trimestre'; break;
    case 'ytd': filtrosTexto = 'Año hasta la Fecha'; break;
    case 'ano_anterior': filtrosTexto = 'Año Anterior'; break;
    case 'rango_personalizado':
      filtrosTexto = `Rango: ${filtros.fecha_desde || ''} - ${filtros.fecha_hasta || ''}`;
      break;
    default: filtrosTexto = 'Mes Actual';
  }

  doc.text(`Período: ${filtrosTexto}`, margin + 10, currentY);
  currentY += 6;

  if (filtros.negocio_id) {
    doc.text(`Negocio: Específico`, margin + 10, currentY);
    currentY += 6;
  }

  if (filtros.region_id) {
    doc.text(`Región: Específica`, margin + 10, currentY);
    currentY += 6;
  }

  currentY += 10;

  // INGRESOS
  checkNewPage(60);
  doc.setFontSize(14);
  doc.setTextColor(34, 197, 94); // Verde
  doc.text('INGRESOS', margin, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);

  reporte.ingresos.por_negocio.forEach((negocio) => {
    checkNewPage(40);

    // Nombre del negocio
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(negocio.negocio, margin + 10, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(negocio.total), pageWidth - margin - 40, currentY);
    currentY += 8;

    // Categorías
    negocio.categorias.forEach((categoria) => {
      checkNewPage(15);
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`  ${categoria.categoria}`, margin + 20, currentY);
      doc.text(formatCurrency(categoria.total), pageWidth - margin - 40, currentY);
      currentY += 6;
    });

    currentY += 4;
  });

  // Total Ingresos
  checkNewPage(20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 197, 94);
  doc.text('TOTAL INGRESOS', margin, currentY);
  doc.text(formatCurrency(reporte.ingresos.total), pageWidth - margin - 40, currentY);
  currentY += 15;

  // GASTOS
  checkNewPage(60);
  doc.setFontSize(14);
  doc.setTextColor(239, 68, 68); // Rojo
  doc.text('GASTOS', margin, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);

  reporte.gastos.por_categoria.forEach((categoria) => {
    checkNewPage(15);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(categoria.categoria, margin + 10, currentY);
    doc.setTextColor(239, 68, 68);
    doc.text(`-${formatCurrency(categoria.total)}`, pageWidth - margin - 40, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += 8;
  });

  // Total Gastos
  checkNewPage(20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(239, 68, 68);
  doc.text('TOTAL GASTOS', margin, currentY);
  doc.text(`-${formatCurrency(reporte.gastos.total)}`, pageWidth - margin - 40, currentY);
  currentY += 15;

  // UTILIDAD OPERATIVA
  checkNewPage(30);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246); // Azul
  doc.setFont('helvetica', 'bold');
  doc.text('UTILIDAD OPERATIVA', margin, currentY);

  const utilidadColor: [number, number, number] = reporte.utilidad_operativa >= 0
    ? [34, 197, 94] // Verde
    : [239, 68, 68]; // Rojo

  doc.setTextColor(utilidadColor[0], utilidadColor[1], utilidadColor[2]);
  const utilidadTexto = reporte.utilidad_operativa >= 0
    ? `+${formatCurrency(reporte.utilidad_operativa)}`
    : `-${formatCurrency(reporte.utilidad_operativa)}`;
  doc.text(utilidadTexto, pageWidth - margin - 60, currentY);
  currentY += 15;

  // COMPARATIVO (si existe)
  if (reporte.comparativo) {
    checkNewPage(60);

    doc.setFontSize(14);
    doc.setTextColor(147, 51, 234); // Púrpura
    doc.setFont('helvetica', 'bold');
    doc.text('COMPARATIVO CON PERÍODO ANTERIOR', margin, currentY);
    currentY += 12;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Headers
    const headers = ['Concepto', 'Anterior', 'Actual', 'Variación $', 'Variación %'];
    const colWidths = [60, 35, 35, 35, 35];
    let colX = margin;

    headers.forEach((header, index) => {
      doc.text(header, colX, currentY);
      colX += colWidths[index];
    });

    currentY += 8;

    // Línea separadora
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 6;

    // Datos
    const rows = [
      [
        'Ingresos',
        formatCurrency(reporte.comparativo.periodo_anterior.ingresos),
        formatCurrency(reporte.ingresos.total),
        (reporte.comparativo.variacion_valor.ingresos >= 0 ? '+' : '') + formatCurrency(reporte.comparativo.variacion_valor.ingresos),
        formatPercentage(reporte.comparativo.variacion_porcentaje.ingresos)
      ],
      [
        'Gastos',
        formatCurrency(reporte.comparativo.periodo_anterior.gastos),
        formatCurrency(reporte.gastos.total),
        (reporte.comparativo.variacion_valor.gastos >= 0 ? '+' : '') + formatCurrency(reporte.comparativo.variacion_valor.gastos),
        formatPercentage(-reporte.comparativo.variacion_porcentaje.gastos)
      ],
      [
        'Utilidad',
        reporte.comparativo.periodo_anterior.utilidad >= 0
          ? formatCurrency(reporte.comparativo.periodo_anterior.utilidad)
          : `-${formatCurrency(reporte.comparativo.periodo_anterior.utilidad)}`,
        reporte.utilidad_operativa >= 0
          ? formatCurrency(reporte.utilidad_operativa)
          : `-${formatCurrency(reporte.utilidad_operativa)}`,
        (reporte.comparativo.variacion_valor.utilidad >= 0 ? '+' : '') + formatCurrency(reporte.comparativo.variacion_valor.utilidad),
        formatPercentage(reporte.comparativo.variacion_porcentaje.utilidad)
      ]
    ];

    rows.forEach((row) => {
      checkNewPage(12);
      colX = margin;

      row.forEach((cell, index) => {
        // Colorear variaciones
        if (index >= 3) {
          const valor = parseFloat(cell.replace(/[+$%]/g, ''));
          if (valor >= 0) {
            doc.setTextColor(34, 197, 94); // Verde
          } else {
            doc.setTextColor(239, 68, 68); // Rojo
          }
        } else {
          doc.setTextColor(0, 0, 0);
        }

        doc.text(cell, colX, currentY);
        colX += colWidths[index];
      });

      currentY += 8;
    });
  }

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - margin - 30,
      pageHeight - 10
    );
  }

  // Descargar el PDF
  const fileName = `reporte_pyg_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

/**
 * Función auxiliar para formatear porcentajes
 */
function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}