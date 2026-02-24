// utils/generarPDFListaCompras.ts
// Genera PDF de lista de compras para enviar a proveedores

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ListaCompras, ConfiguracionAplicacion } from '../types/aplicaciones';
import { formatearMoneda, formatearNumero } from './format';

interface DatosEmpresa {
  nombre: string;
  nit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  logo?: string; // URL o base64
}

/**
 * Genera PDF de lista de compras
 */
export function generarPDFListaCompras(
  listaCompras: ListaCompras,
  configuracion: ConfiguracionAplicacion,
  datosEmpresa?: DatosEmpresa
): void {
  const doc = new jsPDF();
  
  // Configuración de colores - Usando paleta de Escocia Hass
  const colorPrimario = [115, 153, 28] as [number, number, number]; // #73991C
  const colorSecundario = [191, 217, 125] as [number, number, number]; // #BFD97D
  const colorGris = [77, 36, 15] as [number, number, number]; // #4D240F
  
  let yPosition = 20;

  // ========================================
  // ENCABEZADO
  // ========================================
  
  // Logo (si existe)
  if (datosEmpresa?.logo) {
    try {
      doc.addImage(datosEmpresa.logo, 'PNG', 15, yPosition, 30, 30);
    } catch (error) {
      console.error('Error agregando logo:', error);
    }
  }

  // Título del documento
  doc.setFontSize(20);
  doc.setTextColor(...colorPrimario);
  doc.setFont('helvetica', 'bold');
  doc.text('LISTA DE COMPRAS', datosEmpresa?.logo ? 50 : 15, yPosition + 10);

  // Información de la empresa
  doc.setFontSize(9);
  doc.setTextColor(...colorGris);
  doc.setFont('helvetica', 'normal');
  
  if (datosEmpresa) {
    const infoEmpresa: string[] = [];
    if (datosEmpresa.nombre) infoEmpresa.push(datosEmpresa.nombre);
    if (datosEmpresa.nit) infoEmpresa.push(`NIT: ${datosEmpresa.nit}`);
    if (datosEmpresa.direccion) infoEmpresa.push(datosEmpresa.direccion);
    if (datosEmpresa.telefono) infoEmpresa.push(`Tel: ${datosEmpresa.telefono}`);
    if (datosEmpresa.email) infoEmpresa.push(datosEmpresa.email);
    
    infoEmpresa.forEach((linea, index) => {
      doc.text(linea, datosEmpresa?.logo ? 50 : 15, yPosition + 15 + (index * 4));
    });
  }

  // Fecha de generación
  doc.setFontSize(9);
  doc.text(
    `Fecha de generación: ${new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}`,
    15,
    yPosition + 40
  );

  yPosition += 50;

  // ========================================
  // INFORMACIÓN DE LA APLICACIÓN
  // ========================================
  
  doc.setFillColor(...colorSecundario);
  doc.rect(15, yPosition, 180, 25, 'F');
  
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  
  // Tipo de aplicación
  const tipoTexto = configuracion.tipo_aplicacion === 'Fumigación'
    ? 'Fumigación'
    : configuracion.tipo_aplicacion === 'Fertilización'
    ? 'Fertilización'
    : 'Drench';
  
  // Datos de la aplicación en dos columnas
  const aplicacionInfo = [
    { label: 'Aplicación:', value: configuracion.nombre },
    { label: 'Tipo:', value: tipoTexto },
    { label: 'Fecha inicio:', value: new Date(configuracion.fecha_inicio).toLocaleDateString('es-CO') },
    { label: 'Lotes:', value: configuracion.lotes_seleccionados.map(l => l.nombre).join(', ') }
  ];

  aplicacionInfo.forEach((info, index) => {
    const x = index % 2 === 0 ? 20 : 110;
    const y = yPosition + 6 + Math.floor(index / 2) * 6;
    
    doc.setFont('helvetica', 'bold');
    doc.text(info.label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(info.value, x + 30, y);
  });

  yPosition += 35;

  // ========================================
  // RESUMEN EJECUTIVO
  // ========================================
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...colorPrimario);
  doc.text('RESUMEN', 15, yPosition);
  
  yPosition += 7;

  // Cajas de resumen
  const boxWidth = 55;
  const boxHeight = 20;
  const boxSpacing = 7;

  const resumenData = [
    {
      label: 'Productos a Comprar',
      value: listaCompras.items.filter(i => i.cantidad_faltante > 0).length.toString(),
      color: [239, 68, 68] as [number, number, number] // Rojo
    },
    {
      label: 'Disponibles en Stock',
      value: listaCompras.items.filter(i => i.cantidad_faltante === 0).length.toString(),
      color: [34, 197, 94] as [number, number, number] // Verde
    },
    {
      label: 'Costo Total Estimado',
      value: formatearMoneda(listaCompras.costo_total_estimado),
      color: [234, 179, 8] as [number, number, number] // Amarillo
    }
  ];

  resumenData.forEach((item, index) => {
    const x = 15 + (index * (boxWidth + boxSpacing));
    
    // Fondo de la caja
    doc.setFillColor(...item.color);
    doc.setDrawColor(...item.color);
    doc.roundedRect(x, yPosition, boxWidth, boxHeight, 3, 3, 'FD');
    
    // Texto
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.text(item.label, x + boxWidth / 2, yPosition + 7, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, x + boxWidth / 2, yPosition + 15, { align: 'center' });
  });

  yPosition += 30;

  // ========================================
  // TABLA DE PRODUCTOS A COMPRAR
  // ========================================
  
  const productosAComprar = listaCompras.items.filter(item => item.cantidad_faltante > 0);

  if (productosAComprar.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorPrimario);
    doc.text('PRODUCTOS A COMPRAR', 15, yPosition);
    
    yPosition += 5;

    // Preparar datos para la tabla
    const tableData = productosAComprar.map(item => [
      item.producto_nombre,
      item.producto_categoria,
      `${formatearNumero(item.inventario_actual)} ${item.unidad}`,
      `${formatearNumero(item.cantidad_necesaria)} ${item.unidad}`,
      `${formatearNumero(item.cantidad_faltante)} ${item.unidad}`,
      `${item.unidades_a_comprar} × ${item.presentacion_comercial}`,
      item.ultimo_precio_unitario 
        ? formatearMoneda(item.costo_estimado || 0)
        : 'Sin precio'
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [[
        'Producto',
        'Categoría',
        'En Stock',
        'Necesario',
        'Faltante',
        'A Comprar',
        'Costo Est.'
      ]],
      body: tableData,
      foot: [[
        '',
        '',
        '',
        '',
        '',
        'TOTAL:',
        formatearMoneda(
          productosAComprar.reduce((sum, item) => sum + (item.costo_estimado || 0), 0)
        )
      ]],
      theme: 'grid',
      headStyles: {
        fillColor: colorPrimario,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9
      },
      footStyles: {
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: 'bold',
        fontSize: 10
      },
      bodyStyles: {
        fontSize: 8,
        textColor: 50
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 30, halign: 'center' },
        6: { cellWidth: 25, halign: 'right' }
      },
      margin: { left: 15, right: 15 }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

  // ========================================
  // ALERTAS (si existen)
  // ========================================
  
  if (listaCompras.productos_sin_precio > 0 || listaCompras.productos_sin_stock > 0) {
    // Verificar si hay espacio, sino agregar página
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(234, 179, 8); // Amarillo
    doc.text('⚠ ALERTAS', 15, yPosition);
    
    yPosition += 7;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    if (listaCompras.productos_sin_precio > 0) {
      doc.text(
        `• ${listaCompras.productos_sin_precio} producto(s) no tienen precio registrado. El costo puede variar.`,
        20,
        yPosition
      );
      yPosition += 5;
    }

    if (listaCompras.productos_sin_stock > 0) {
      doc.text(
        `• ${listaCompras.productos_sin_stock} producto(s) no tienen stock disponible.`,
        20,
        yPosition
      );
      yPosition += 5;
    }

    yPosition += 5;
  }

  // ========================================
  // TABLA DE PRODUCTOS DISPONIBLES (opcional)
  // ========================================
  
  const productosDisponibles = listaCompras.items.filter(item => item.cantidad_faltante === 0);

  if (productosDisponibles.length > 0) {
    // Verificar si hay espacio, sino agregar página
    if (yPosition > 240) {
      doc.addPage();
      yPosition = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...colorPrimario);
    doc.text('PRODUCTOS DISPONIBLES EN STOCK', 15, yPosition);
    
    yPosition += 5;

    const tableDataDisponibles = productosDisponibles.map(item => [
      item.producto_nombre,
      item.producto_categoria,
      `${formatearNumero(item.inventario_actual)} ${item.unidad}`,
      `${formatearNumero(item.cantidad_necesaria)} ${item.unidad}`,
      `${formatearNumero(item.inventario_actual - item.cantidad_necesaria)} ${item.unidad}`
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [[
        'Producto',
        'Categoría',
        'En Stock',
        'Necesario',
        'Sobrante'
      ]],
      body: tableDataDisponibles,
      theme: 'grid',
      headStyles: {
        fillColor: [34, 197, 94], // Verde
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
        0: { cellWidth: 50 },
        1: { cellWidth: 35 },
        2: { cellWidth: 30, halign: 'right' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 15, right: 15 }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }

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
      'Este documento es una estimación. Los precios pueden variar según disponibilidad del proveedor.',
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
      'Escocia Hass - Sistema de Gestión',
      15,
      290
    );
  }

  // ========================================
  // GUARDAR PDF
  // ========================================
  
  const nombreArchivo = `Lista_Compras_${configuracion.nombre.replace(/\s+/g, '_')}_${
    new Date().toISOString().split('T')[0]
  }.pdf`;
  
  doc.save(nombreArchivo);
}
