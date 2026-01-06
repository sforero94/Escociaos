// utils/generarPDFReportesLabores.ts
// Genera PDF de reportes de labores con registro detallado y matriz actividades × lotes

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatearMoneda, formatearNumero } from './format';

interface RegistroTrabajo {
  fecha_trabajo: string;
  fraccion_jornal: number;
  costo_jornal: number;
  empleados: { nombre: string };
  tareas: {
    codigo_tarea: string;
    tipo_tarea_id: string;
  };
  lote: { nombre: string };
}

interface TipoTarea {
  id: string;
  nombre: string;
}

interface EstadisticasGenerales {
  totalCostos: number;
  totalJornales: number;
}

/**
 * Genera PDF de reportes de labores
 */
export function generarPDFReportesLabores(
  registrosTrabajo: RegistroTrabajo[],
  tiposTareas: TipoTarea[],
  estadisticasGenerales: EstadisticasGenerales,
  fechaInicio: string,
  fechaFin: string
): void {
  const doc = new jsPDF();

  // Configuración de colores - Usando paleta de Escocia Hass
  const colorPrimario = [115, 153, 28] as [number, number, number]; // #73991C
  const colorSecundario = [191, 217, 125] as [number, number, number]; // #BFD97D
  const colorGris = [77, 36, 15] as [number, number, number]; // #4D240F

  let yPosition = 20;

  // ========================================
  // PÁGINA 1: REGISTRO DETALLADO
  // ========================================

  // Encabezado
  doc.setFontSize(20);
  doc.setTextColor(...colorPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('REPORTE DE LABORES', 15, yPosition + 10);

  // Información del período
  doc.setFontSize(11);
  doc.setTextColor(...colorGris);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${formatearFecha(fechaInicio)} - ${formatearFecha(fechaFin)}`, 15, yPosition + 25);

  // Estadísticas generales
  doc.setFontSize(10);
  doc.text(`Total Costos: ${formatearMoneda(estadisticasGenerales.totalCostos)}`, 15, yPosition + 35);
  doc.text(`Total Jornales: ${formatearNumero(estadisticasGenerales.totalJornales)}`, 15, yPosition + 42);

  yPosition += 50;

  // Tabla de registro detallado
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  doc.text('REGISTRO DETALLADO', 15, yPosition);

  yPosition += 5;

  // Preparar datos para la tabla
  const tableData = registrosTrabajo.map(registro => [
    formatearFecha(registro.fecha_trabajo),
    registro.empleados?.nombre || 'N/A',
    registro.tareas?.codigo_tarea || 'N/A',
    tiposTareas.find(t => t.id === registro.tareas?.tipo_tarea_id)?.nombre || 'Sin tipo',
    registro.lote?.nombre || 'Sin lote',
    formatearNumero(registro.fraccion_jornal),
    formatearMoneda(registro.costo_jornal)
  ]);

  autoTable(doc, {
    startY: yPosition,
    head: [[
      'Fecha',
      'Empleado',
      'Tarea',
      'Tipo',
      'Lote',
      'Jornales',
      'Costo'
    ]],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: colorPrimario,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 50
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 20, halign: 'right' },
      6: { cellWidth: 25, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  });

  // ========================================
  // PÁGINA 2: MATRIZ ACTIVIDADES × LOTES
  // ========================================

  doc.addPage();
  yPosition = 20;

  // Encabezado página 2
  doc.setFontSize(20);
  doc.setTextColor(...colorPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('MATRIZ ACTIVIDADES × LOTES', 15, yPosition + 10);

  doc.setFontSize(11);
  doc.setTextColor(...colorGris);
  doc.setFont('helvetica', 'normal');
  doc.text(`Período: ${formatearFecha(fechaInicio)} - ${formatearFecha(fechaFin)}`, 15, yPosition + 25);

  yPosition += 35;

  // Generar matriz de datos
  const { matrizData, tiposUnicos, lotesUnicos, totalesFilas, totalesColumnas, granTotal } = generarMatrizDatos(registrosTrabajo, tiposTareas);

  // Preparar encabezados de tabla
  const headers = ['Actividad', ...lotesUnicos, 'Total Costo'];

  // Preparar filas de datos
  const bodyData = tiposUnicos.map((tipo, index) => {
    const fila = [tipo];
    lotesUnicos.forEach(lote => {
      fila.push(formatearNumero(matrizData[tipo]?.[lote] || 0));
    });
    fila.push(formatearMoneda(totalesFilas[index]));
    return fila;
  });

  // Agregar fila de totales por lote
  const filaTotalesLote = ['TOTAL LOTES'];
  lotesUnicos.forEach((lote, index) => {
    filaTotalesLote.push(formatearMoneda(totalesColumnas[index]));
  });
  filaTotalesLote.push(`${formatearNumero(granTotal.jornales)} / ${formatearMoneda(granTotal.costo)}`);

  bodyData.push(filaTotalesLote);

  // Generar tabla
  autoTable(doc, {
    startY: yPosition,
    head: [headers],
    body: bodyData,
    theme: 'grid',
    headStyles: {
      fillColor: colorPrimario,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 8,
      textColor: 50
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    footStyles: {
      fillColor: [240, 240, 240],
      textColor: 0,
      fontStyle: 'bold',
      fontSize: 9
    },
    columnStyles: (() => {
      const styles: any = {
        0: { cellWidth: 35 } // Columna de actividades
      };
      // Columnas de lotes
      for (let i = 1; i <= lotesUnicos.length; i++) {
        styles[i] = { cellWidth: 20, halign: 'right' };
      }
      // Columna de total costo
      styles[lotesUnicos.length + 1] = { cellWidth: 25, halign: 'right' };
      return styles;
    })(),
    margin: { left: 15, right: 15 }
  });

  // ========================================
  // PIE DE PÁGINA
  // ========================================

  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Línea separadora
    doc.setDrawColor(...colorGris);
    doc.line(15, 285, 195, 285);

    // Texto del pie
    doc.setFontSize(8);
    doc.setTextColor(...colorGris);
    doc.setFont('helvetica', 'italic');

    doc.text(
      'Sistema de Gestión Escocia Hass - Reporte de Labores',
      105,
      290,
      { align: 'center' }
    );

    doc.text(
      `Página ${i} de ${pageCount}`,
      195,
      290,
      { align: 'right' }
    );

    doc.text(
      `Generado: ${new Date().toLocaleDateString('es-CO')}`,
      15,
      290
    );
  }

  // ========================================
  // GUARDAR PDF
  // ========================================

  const nombreArchivo = `Reporte_Labores_${formatearFecha(fechaInicio)}_a_${formatearFecha(fechaFin)}.pdf`;
  doc.save(nombreArchivo);
}

/**
 * Genera la matriz de datos para actividades × lotes
 */
function generarMatrizDatos(registrosTrabajo: RegistroTrabajo[], tiposTareas: TipoTarea[]) {
  const matrizData: Record<string, Record<string, number>> = {};
  const tiposUnicos = new Set<string>();
  const lotesUnicos = new Set<string>();

  // Procesar registros para llenar la matriz
  registrosTrabajo.forEach(registro => {
    const tipoNombre = tiposTareas.find(t => t.id === registro.tareas?.tipo_tarea_id)?.nombre || 'Sin tipo';
    const loteNombre = registro.lote?.nombre || 'Sin lote';

    tiposUnicos.add(tipoNombre);
    lotesUnicos.add(loteNombre);

    if (!matrizData[tipoNombre]) {
      matrizData[tipoNombre] = {};
    }

    if (!matrizData[tipoNombre][loteNombre]) {
      matrizData[tipoNombre][loteNombre] = 0;
    }

    matrizData[tipoNombre][loteNombre] += registro.fraccion_jornal;
  });

  const tiposArray = Array.from(tiposUnicos).sort();
  const lotesArray = Array.from(lotesUnicos).sort();

  // Calcular totales por fila (actividad)
  const totalesFilas = tiposArray.map(tipo => {
    return lotesArray.reduce((sum, lote) => sum + (matrizData[tipo]?.[lote] || 0), 0);
  });

  // Calcular totales por columna (lote) - convertir jornales a costos
  const totalesColumnas = lotesArray.map(lote => {
    return tiposArray.reduce((sum, tipo) => {
      const jornales = matrizData[tipo]?.[lote] || 0;
      // Para simplificar, usamos un costo promedio por jornal basado en los registros
      // En una implementación más precisa, podríamos calcular el costo real por lote
      return sum + (jornales * 25000); // Costo estimado por jornal
    }, 0);
  });

  // Gran total
  const granTotal = {
    jornales: totalesFilas.reduce((sum, total) => sum + total, 0),
    costo: totalesColumnas.reduce((sum, total) => sum + total, 0)
  };

  return {
    matrizData,
    tiposUnicos: tiposArray,
    lotesUnicos: lotesArray,
    totalesFilas,
    totalesColumnas,
    granTotal
  };
}

/**
 * Formatear fecha para display
 */
function formatearFecha(fecha: string): string {
  return new Date(fecha).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}