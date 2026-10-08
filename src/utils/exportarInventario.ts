// Reporte de existencias del inventario (issue #317).
//
// Solo lectura: arma el archivo en el navegador con los productos que la
// pantalla ya cargó. No escribe en la base.
//
// El modelo real tiene dos niveles, no uno: `grupo` (Agroinsumos,
// Herramientas, Maquinaria y equipo) y `categoria` (Fertilizante, Fungicida,
// …). El reporte agrupa por categoría. Un producto sin categoría cae en
// «Sin categoría».

export const SIN_CATEGORIA = 'Sin categoría';

export const COLUMNAS_INVENTARIO = [
  'Producto',
  'Cantidad en bodega',
  'Unidad',
  'Categoría',
] as const;

/** Fila 0-based de los títulos de columna en la hoja de Excel. */
export const FILA_TITULOS_EXCEL = 5;

const SEP_CLAVE = '\u001f';

export interface ProductoExportable {
  nombre: string;
  categoria: string | null;
  grupo: string | null;
  cantidad_actual: number | null;
  unidad_medida: string | null;
  permitido_gerencia?: boolean | null;
}

export type FormatoExportacionInventario = 'pdf' | 'xlsx';

export interface SeleccionExportacion {
  modo: 'todo' | 'seleccion';
  /** Grupos enteros. Incluye cada producto de ese grupo. */
  grupos: string[];
  /**
   * Categorías sueltas, clave `grupo + SEP + categoria`.
   * Si el grupo ya está en `grupos`, la clave no agrega nada.
   */
  categorias: string[];
  incluirCeros: boolean;
}

export interface NodoCategoria {
  categoria: string;
  productos: number;
}

export interface NodoGrupo {
  grupo: string;
  categorias: NodoCategoria[];
  productos: number;
}

export interface FilaInventario {
  producto: string;
  cantidad: number;
  unidad: string;
  categoria: string;
  grupo: string;
}

export interface GrupoReporte {
  categoria: string;
  filas: FilaInventario[];
}

export interface ReporteInventario {
  filas: FilaInventario[];
  grupos: GrupoReporte[];
  filtro: string;
  incluirCeros: boolean;
}

export type ResultadoEntrega = 'descargado' | 'compartido' | 'cancelado';

export function etiquetaCategoria(categoria: string | null | undefined): string {
  const texto = (categoria ?? '').trim();
  return texto.length === 0 ? SIN_CATEGORIA : texto;
}

export function etiquetaGrupo(grupo: string | null | undefined): string {
  const texto = (grupo ?? '').trim();
  return texto.length === 0 ? SIN_CATEGORIA : texto;
}

export function claveCategoria(grupo: string, categoria: string): string {
  return `${grupo}${SEP_CLAVE}${categoria}`;
}

export function partirClaveCategoria(clave: string): { grupo: string; categoria: string } {
  const corte = clave.indexOf(SEP_CLAVE);
  if (corte < 0) return { grupo: clave, categoria: clave };
  return { grupo: clave.slice(0, corte), categoria: clave.slice(corte + SEP_CLAVE.length) };
}

/** Unidad corta del reporte: kg, L, und. Lo demás se deja como está. */
export function unidadReporte(unidad: string | null | undefined): string {
  const texto = (unidad ?? '').trim();
  switch (texto.toLowerCase()) {
    case 'kilos':
    case 'kilo':
    case 'kg':
    case 'kilogramos':
      return 'kg';
    case 'litros':
    case 'litro':
    case 'l':
      return 'L';
    case 'unidades':
    case 'unidad':
    case 'und':
      return 'und';
    default:
      return texto;
  }
}

export function cantidadEnBodega(cantidad: number | null | undefined): number {
  if (cantidad == null || Number.isNaN(cantidad)) return 0;
  return cantidad;
}

export function estaEnCero(cantidad: number | null | undefined): boolean {
  return cantidadEnBodega(cantidad) <= 0;
}

export function formatearCantidad(cantidad: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
    useGrouping: true,
  }).format(cantidad);
}

function compararEtiqueta(a: string, b: string): number {
  if (a === SIN_CATEGORIA && b !== SIN_CATEGORIA) return 1;
  if (b === SIN_CATEGORIA && a !== SIN_CATEGORIA) return -1;
  return a.localeCompare(b, 'es', { sensitivity: 'base' });
}

/**
 * Misma regla que la lista: con modo seguro se ocultan los productos que
 * Gerencia marcó como no permitidos (`permitido_gerencia === false`).
 * `null` y `true` siguen visibles.
 */
export function productosVisiblesParaExportar(
  productos: ProductoExportable[],
  ocultarNoPermitidos: boolean,
): ProductoExportable[] {
  if (!ocultarNoPermitidos) return productos;
  return productos.filter((p) => p.permitido_gerencia !== false);
}

export function arbolClasificacion(productos: ProductoExportable[]): NodoGrupo[] {
  const porGrupo = new Map<string, Map<string, number>>();
  for (const producto of productos) {
    const grupo = etiquetaGrupo(producto.grupo);
    const categoria = etiquetaCategoria(producto.categoria);
    let categorias = porGrupo.get(grupo);
    if (!categorias) {
      categorias = new Map();
      porGrupo.set(grupo, categorias);
    }
    categorias.set(categoria, (categorias.get(categoria) ?? 0) + 1);
  }

  return [...porGrupo.entries()]
    .map(([grupo, categorias]) => {
      const nodos = [...categorias.entries()]
        .map(([categoria, cuenta]) => ({ categoria, productos: cuenta }))
        .sort((a, b) => compararEtiqueta(a.categoria, b.categoria));
      const total = nodos.reduce((suma, nodo) => suma + nodo.productos, 0);
      return { grupo, categorias: nodos, productos: total };
    })
    .sort((a, b) => compararEtiqueta(a.grupo, b.grupo));
}

export function productoEntra(
  producto: ProductoExportable,
  seleccion: SeleccionExportacion,
): boolean {
  if (!seleccion.incluirCeros && estaEnCero(producto.cantidad_actual)) return false;
  if (seleccion.modo === 'todo') return true;

  const grupo = etiquetaGrupo(producto.grupo);
  const categoria = etiquetaCategoria(producto.categoria);
  if (seleccion.grupos.includes(grupo)) return true;
  return seleccion.categorias.includes(claveCategoria(grupo, categoria));
}

export function textoFiltro(seleccion: SeleccionExportacion): string {
  if (seleccion.modo === 'todo') return 'Todo el inventario';

  const partes: string[] = [];
  const grupos = [...seleccion.grupos].sort(compararEtiqueta);
  for (const grupo of grupos) partes.push(grupo);

  const categorias = seleccion.categorias
    .filter((clave) => !seleccion.grupos.includes(partirClaveCategoria(clave).grupo))
    .map((clave) => partirClaveCategoria(clave).categoria);
  const unicas = [...new Set(categorias)].sort(compararEtiqueta);
  for (const categoria of unicas) partes.push(categoria);

  return partes.join(', ');
}

export function lineaFiltro(seleccion: SeleccionExportacion): string {
  const base = textoFiltro(seleccion);
  const ceros = seleccion.incluirCeros
    ? 'incluye productos en cero'
    : 'sin productos en cero';
  return base.length === 0 ? ceros : `${base} (${ceros})`;
}

export function slugArchivo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function segmentoArchivo(seleccion: SeleccionExportacion): string {
  if (seleccion.modo === 'todo') return 'todo';
  const filtro = textoFiltro(seleccion);
  const slug = slugArchivo(filtro);
  if (slug.length === 0) return 'seleccion';
  if (slug.length > 80) return 'seleccion';
  return slug;
}

export function nombreArchivoInventario(
  seleccion: SeleccionExportacion,
  formato: FormatoExportacionInventario,
  fecha: string,
): string {
  const extension = formato === 'pdf' ? 'pdf' : 'xlsx';
  return `inventario-${segmentoArchivo(seleccion)}-${fecha}.${extension}`;
}

export function construirReporte(
  productos: ProductoExportable[],
  seleccion: SeleccionExportacion,
): ReporteInventario {
  const filas: FilaInventario[] = productos
    .filter((producto) => productoEntra(producto, seleccion))
    .map((producto) => ({
      producto: producto.nombre.trim(),
      cantidad: cantidadEnBodega(producto.cantidad_actual),
      unidad: unidadReporte(producto.unidad_medida),
      categoria: etiquetaCategoria(producto.categoria),
      grupo: etiquetaGrupo(producto.grupo),
    }))
    .sort((a, b) => {
      const porCategoria = compararEtiqueta(a.categoria, b.categoria);
      if (porCategoria !== 0) return porCategoria;
      return a.producto.localeCompare(b.producto, 'es', { sensitivity: 'base' });
    });

  const grupos: GrupoReporte[] = [];
  for (const fila of filas) {
    const ultimo = grupos[grupos.length - 1];
    if (!ultimo || ultimo.categoria !== fila.categoria) {
      grupos.push({ categoria: fila.categoria, filas: [fila] });
    } else {
      ultimo.filas.push(fila);
    }
  }

  return {
    filas,
    grupos,
    filtro: lineaFiltro(seleccion),
    incluirCeros: seleccion.incluirCeros,
  };
}

export function estadoGrupo(
  seleccion: SeleccionExportacion,
  nodo: NodoGrupo,
): boolean | 'indeterminate' {
  if (seleccion.grupos.includes(nodo.grupo)) return true;
  const marcadas = nodo.categorias.filter((categoria) =>
    seleccion.categorias.includes(claveCategoria(nodo.grupo, categoria.categoria)),
  );
  if (marcadas.length === 0) return false;
  if (marcadas.length === nodo.categorias.length) return true;
  return 'indeterminate';
}

export function categoriaMarcada(
  seleccion: SeleccionExportacion,
  grupo: string,
  categoria: string,
): boolean {
  if (seleccion.grupos.includes(grupo)) return true;
  return seleccion.categorias.includes(claveCategoria(grupo, categoria));
}

function sinClavesDelGrupo(seleccion: SeleccionExportacion, grupo: string): string[] {
  return seleccion.categorias.filter((clave) => partirClaveCategoria(clave).grupo !== grupo);
}

export function alternarGrupo(
  seleccion: SeleccionExportacion,
  nodo: NodoGrupo,
): SeleccionExportacion {
  const estado = estadoGrupo(seleccion, nodo);
  const categorias = sinClavesDelGrupo(seleccion, nodo.grupo);
  if (estado === true) {
    return {
      ...seleccion,
      grupos: seleccion.grupos.filter((grupo) => grupo !== nodo.grupo),
      categorias,
    };
  }
  return {
    ...seleccion,
    grupos: [...seleccion.grupos.filter((grupo) => grupo !== nodo.grupo), nodo.grupo],
    categorias,
  };
}

export function alternarCategoria(
  seleccion: SeleccionExportacion,
  nodo: NodoGrupo,
  categoria: string,
): SeleccionExportacion {
  const clave = claveCategoria(nodo.grupo, categoria);
  const resto = sinClavesDelGrupo(seleccion, nodo.grupo);

  if (seleccion.grupos.includes(nodo.grupo)) {
    const hermanas = nodo.categorias
      .filter((item) => item.categoria !== categoria)
      .map((item) => claveCategoria(nodo.grupo, item.categoria));
    return {
      ...seleccion,
      grupos: seleccion.grupos.filter((grupo) => grupo !== nodo.grupo),
      categorias: [...resto, ...hermanas],
    };
  }

  const yaEsta = seleccion.categorias.includes(clave);
  if (yaEsta) {
    return {
      ...seleccion,
      categorias: seleccion.categorias.filter((item) => item !== clave),
    };
  }

  // No se colapsa al grupo: el usuario pidió la categoría, y el nombre del
  // archivo y el filtro tienen que decir «Fertilizante», no «Agroinsumos».
  return { ...seleccion, categorias: [...seleccion.categorias, clave] };
}

export function filasHojaInventario(
  reporte: ReporteInventario,
  corte: string,
): (string | number | null)[][] {
  const filas: (string | number | null)[][] = [
    ['Escocia Hass'],
    ['Inventario de insumos'],
    [`Corte: ${corte}`],
    [`Filtro: ${reporte.filtro}`],
    [],
    [...COLUMNAS_INVENTARIO],
  ];
  for (const fila of reporte.filas) {
    filas.push([fila.producto, fila.cantidad, fila.unidad, fila.categoria]);
  }
  return filas;
}

const FORMATO_CANTIDAD_EXCEL = '#,##0.####';

export async function blobExcelInventario(
  reporte: ReporteInventario,
  corte: string,
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const aoa = filasHojaInventario(reporte, corte);
  const hoja = XLSX.utils.aoa_to_sheet(aoa);

  for (let i = 0; i < reporte.filas.length; i++) {
    const direccion = XLSX.utils.encode_cell({ r: FILA_TITULOS_EXCEL + 1 + i, c: 1 });
    const celda = hoja[direccion];
    if (celda && celda.t === 'n') celda.z = FORMATO_CANTIDAD_EXCEL;
  }

  hoja['!cols'] = [{ wch: 36 }, { wch: 22 }, { wch: 12 }, { wch: 28 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Inventario');
  const buffer = XLSX.write(libro, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const COLOR_OLIVO: [number, number, number] = [115, 153, 28];
const COLOR_TINTA: [number, number, number] = [45, 36, 24];
const MARGEN_PDF = 12;

export async function blobPdfInventario(
  reporte: ReporteInventario,
  corte: string,
): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const ancho = doc.internal.pageSize.getWidth() - MARGEN_PDF * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_OLIVO);
  doc.text('Escocia Hass', MARGEN_PDF, 16);

  doc.setFontSize(16);
  doc.setTextColor(...COLOR_TINTA);
  doc.text('Inventario de insumos', MARGEN_PDF, 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 70, 45);
  doc.text(`Corte: ${corte}`, MARGEN_PDF, 30);
  const lineasFiltro = doc.splitTextToSize(`Filtro: ${reporte.filtro}`, ancho);
  doc.text(lineasFiltro, MARGEN_PDF, 35);
  const inicioTabla = 35 + lineasFiltro.length * 4.4 + 3;

  const cuerpo: unknown[] = [];
  for (const grupo of reporte.grupos) {
    cuerpo.push([
      {
        content: `${grupo.categoria}  ·  ${grupo.filas.length}`,
        colSpan: 4,
        styles: {
          fillColor: COLOR_OLIVO,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
          halign: 'left',
        },
      },
    ]);
    for (const fila of grupo.filas) {
      cuerpo.push([
        fila.producto,
        formatearCantidad(fila.cantidad),
        fila.unidad,
        fila.categoria,
      ]);
    }
  }

  // Anchos que suman el ancho útil de A4 vertical. Si se pasan, autoTable
  // parte la tabla en horizontal y en el celular se corta una columna.
  const anchoProducto = 86;
  const anchoCantidad = 38;
  const anchoUnidad = 18;
  const anchoCategoria = ancho - anchoProducto - anchoCantidad - anchoUnidad;

  autoTable(doc, {
    startY: inicioTabla,
    margin: { top: 16, right: MARGEN_PDF, bottom: 14, left: MARGEN_PDF },
    tableWidth: ancho,
    head: [COLUMNAS_INVENTARIO.slice()],
    body: cuerpo as string[][],
    theme: 'grid',
    showHead: 'everyPage',
    horizontalPageBreak: false,
    rowPageBreak: 'avoid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: COLOR_TINTA,
      cellPadding: 1.8,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [214, 219, 200],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: COLOR_OLIVO,
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: anchoProducto },
      1: { cellWidth: anchoCantidad, halign: 'right' },
      2: { cellWidth: anchoUnidad, halign: 'center' },
      3: { cellWidth: anchoCategoria },
    },
    didDrawPage: (hook) => {
      const alto = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 100, 75);
      doc.text('Escocia Hass · Inventario de insumos', MARGEN_PDF, alto - 7);
      doc.text(String(hook.pageNumber), doc.internal.pageSize.getWidth() - MARGEN_PDF, alto - 7, {
        align: 'right',
      });
    },
  });

  const buffer = doc.output('arraybuffer');
  return new Blob([buffer], { type: 'application/pdf' });
}

function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function entregarArchivo(blob: Blob, nombre: string): Promise<ResultadoEntrega> {
  const archivo = new File([blob], nombre, { type: blob.type });
  const tactil = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (tactil && nav?.canShare?.({ files: [archivo] }) && nav.share) {
    try {
      await nav.share({ files: [archivo], title: nombre });
      return 'compartido';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelado';
    }
  }
  descargarBlob(blob, nombre);
  return 'descargado';
}

export async function descargarReporteInventario(args: {
  productos: ProductoExportable[];
  seleccion: SeleccionExportacion;
  formato: FormatoExportacionInventario;
  corte: string;
  fechaArchivo: string;
}): Promise<ResultadoEntrega> {
  const reporte = construirReporte(args.productos, args.seleccion);
  if (reporte.filas.length === 0) {
    throw new Error('No hay productos para exportar con este filtro.');
  }
  const blob =
    args.formato === 'xlsx'
      ? await blobExcelInventario(reporte, args.corte)
      : await blobPdfInventario(reporte, args.corte);
  const nombre = nombreArchivoInventario(args.seleccion, args.formato, args.fechaArchivo);
  return entregarArchivo(blob, nombre);
}
