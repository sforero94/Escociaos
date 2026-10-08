import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  COLUMNAS_INVENTARIO,
  FILA_TITULOS_EXCEL,
  SIN_CATEGORIA,
  alternarCategoria,
  alternarGrupo,
  arbolClasificacion,
  blobExcelInventario,
  blobPdfInventario,
  construirReporte,
  estaEnCero,
  filasHojaInventario,
  nombreArchivoInventario,
  productoEntra,
  productosVisiblesParaExportar,
  unidadReporte,
  type ProductoExportable,
  type SeleccionExportacion,
} from '@/utils/exportarInventario';

const CORTE = '08/10/2026 15:04';
const FECHA = '2026-10-08';

function producto(parcial: Partial<ProductoExportable> & Pick<ProductoExportable, 'nombre'>): ProductoExportable {
  return {
    categoria: 'Fertilizante',
    grupo: 'Agroinsumos',
    cantidad_actual: 10,
    unidad_medida: 'Kilos',
    ...parcial,
  };
}

const CATALOGO: ProductoExportable[] = [
  producto({ nombre: 'Hidrocomplex', cantidad_actual: 1103, unidad_medida: 'Kilos' }),
  producto({ nombre: 'Borozinco', cantidad_actual: 198, unidad_medida: 'Kilos' }),
  producto({ nombre: 'Campofos', cantidad_actual: 0, unidad_medida: 'Kilos' }),
  producto({ nombre: 'Yara sam 21-0-0', cantidad_actual: 57, unidad_medida: 'Litros' }),
  producto({ nombre: 'Amistar', categoria: 'Fungicida', cantidad_actual: 4, unidad_medida: 'Litros' }),
  producto({ nombre: 'Bomba de espalda', categoria: 'Equipo', grupo: 'Maquinaria y equipo', cantidad_actual: 2, unidad_medida: 'Unidades' }),
  producto({ nombre: 'Sin ficha', categoria: '  ', grupo: null, cantidad_actual: 3, unidad_medida: 'Unidades' }),
  producto({ nombre: 'Oculto', cantidad_actual: 9, permitido_gerencia: false }),
  producto({ nombre: 'Vacío', cantidad_actual: null, unidad_medida: 'Kilos' }),
];

const TODO: SeleccionExportacion = {
  modo: 'todo',
  grupos: [],
  categorias: [],
  incluirCeros: false,
};

describe('unidad y ceros', () => {
  it('traduce las unidades del módulo a kg, L y und', () => {
    expect(unidadReporte('Kilos')).toBe('kg');
    expect(unidadReporte('Litros')).toBe('L');
    expect(unidadReporte('Unidades')).toBe('und');
    expect(unidadReporte('cajas')).toBe('cajas');
    expect(unidadReporte(null)).toBe('');
  });

  it('trata null y negativo como existencia en cero', () => {
    expect(estaEnCero(null)).toBe(true);
    expect(estaEnCero(0)).toBe(true);
    expect(estaEnCero(-1)).toBe(true);
    expect(estaEnCero(0.4)).toBe(false);
  });
});

describe('filtro del reporte', () => {
  it('deja fuera los productos en cero cuando el interruptor está apagado', () => {
    const reporte = construirReporte(CATALOGO, TODO);
    const nombres = reporte.filas.map((fila) => fila.producto);
    expect(nombres).not.toContain('Campofos');
    expect(nombres).not.toContain('Vacío');
    expect(nombres).toContain('Borozinco');
  });

  it('incluye los productos en cero cuando el interruptor está prendido', () => {
    const reporte = construirReporte(CATALOGO, { ...TODO, incluirCeros: true });
    const campofos = reporte.filas.find((fila) => fila.producto === 'Campofos');
    const vacio = reporte.filas.find((fila) => fila.producto === 'Vacío');
    expect(campofos?.cantidad).toBe(0);
    expect(vacio?.cantidad).toBe(0);
  });

  it('agrupa por categoría, alfabético, y manda el vacío a Sin categoría al final', () => {
    const reporte = construirReporte(CATALOGO, TODO);
    expect(reporte.grupos.map((grupo) => grupo.categoria)).toEqual([
      'Equipo',
      'Fertilizante',
      'Fungicida',
      SIN_CATEGORIA,
    ]);
    const fertilizantes = reporte.grupos.find((grupo) => grupo.categoria === 'Fertilizante');
    expect(fertilizantes?.filas.map((fila) => fila.producto)).toEqual([
      'Borozinco',
      'Hidrocomplex',
      'Oculto',
      'Yara sam 21-0-0',
    ]);
    expect(reporte.filas.find((fila) => fila.producto === 'Sin ficha')?.categoria).toBe(SIN_CATEGORIA);
  });

  it('exporta una categoría sin llevarse las otras', () => {
    const arbol = arbolClasificacion(CATALOGO.filter((item) => !estaEnCero(item.cantidad_actual)));
    const agro = arbol.find((nodo) => nodo.grupo === 'Agroinsumos');
    expect(agro).toBeDefined();
    let seleccion: SeleccionExportacion = { ...TODO, modo: 'seleccion' };
    seleccion = alternarCategoria(seleccion, agro!, 'Fertilizante');
    const reporte = construirReporte(CATALOGO, seleccion);
    expect(reporte.filas.every((fila) => fila.categoria === 'Fertilizante')).toBe(true);
    expect(reporte.filas.map((fila) => fila.producto)).toEqual([
      'Borozinco',
      'Hidrocomplex',
      'Oculto',
      'Yara sam 21-0-0',
    ]);
    expect(reporte.filtro).toBe('Fertilizante (sin productos en cero)');
  });

  it('un grupo entero incluye todas sus categorías', () => {
    const arbol = arbolClasificacion(CATALOGO);
    const agro = arbol.find((nodo) => nodo.grupo === 'Agroinsumos')!;
    const seleccion = alternarGrupo({ ...TODO, modo: 'seleccion', incluirCeros: true }, agro);
    const reporte = construirReporte(CATALOGO, seleccion);
    expect(reporte.filas.map((fila) => fila.producto).sort()).toEqual(
      ['Amistar', 'Borozinco', 'Campofos', 'Hidrocomplex', 'Oculto', 'Vacío', 'Yara sam 21-0-0'].sort(),
    );
    expect(reporte.filtro.startsWith('Agroinsumos')).toBe(true);
  });

  it('permite varias categorías a la vez', () => {
    const arbol = arbolClasificacion(CATALOGO);
    const agro = arbol.find((nodo) => nodo.grupo === 'Agroinsumos')!;
    let seleccion: SeleccionExportacion = { ...TODO, modo: 'seleccion' };
    seleccion = alternarCategoria(seleccion, agro, 'Fertilizante');
    seleccion = alternarCategoria(seleccion, agro, 'Fungicida');
    const reporte = construirReporte(CATALOGO, seleccion);
    expect(new Set(reporte.filas.map((fila) => fila.categoria))).toEqual(
      new Set(['Fertilizante', 'Fungicida']),
    );
  });

  it('con modo seguro oculta lo que la lista oculta', () => {
    const visibles = productosVisiblesParaExportar(CATALOGO, true);
    expect(visibles.map((item) => item.nombre)).not.toContain('Oculto');
    expect(productoEntra(producto({ nombre: 'Oculto', permitido_gerencia: false }), TODO)).toBe(true);
  });
});

describe('nombre del archivo', () => {
  it('usa la categoría y la fecha local', () => {
    const arbol = arbolClasificacion(CATALOGO);
    const agro = arbol.find((nodo) => nodo.grupo === 'Agroinsumos')!;
    const seleccion = alternarCategoria({ ...TODO, modo: 'seleccion' }, agro, 'Fertilizante');
    expect(nombreArchivoInventario(seleccion, 'pdf', FECHA)).toBe(
      'inventario-fertilizante-2026-10-08.pdf',
    );
    expect(nombreArchivoInventario(TODO, 'xlsx', FECHA)).toBe('inventario-todo-2026-10-08.xlsx');
  });

  it('quita tildes del nombre', () => {
    const arbol = arbolClasificacion([
      producto({ nombre: 'Cal', categoria: 'Enmienda', cantidad_actual: 1 }),
    ]);
    const agro = arbol[0];
    const seleccion = alternarCategoria({ ...TODO, modo: 'seleccion' }, agro, 'Enmienda');
    expect(nombreArchivoInventario(seleccion, 'pdf', FECHA)).toBe(
      'inventario-enmienda-2026-10-08.pdf',
    );
  });
});

describe('excel', () => {
  it('escribe una fila por producto, cuatro columnas y la cantidad como número', async () => {
    const reporte = construirReporte(CATALOGO, TODO);
    const aoa = filasHojaInventario(reporte, CORTE);
    expect(aoa[0]).toEqual(['Escocia Hass']);
    expect(aoa[1]).toEqual(['Inventario de insumos']);
    expect(aoa[2]?.[0]).toBe(`Corte: ${CORTE}`);
    expect(String(aoa[3]?.[0])).toContain('Todo el inventario');
    expect(aoa[FILA_TITULOS_EXCEL]).toEqual([...COLUMNAS_INVENTARIO]);
    expect(COLUMNAS_INVENTARIO).toHaveLength(4);

    const blob = await blobExcelInventario(reporte, CORTE);
    const libro = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const ref = XLSX.utils.decode_range(hoja['!ref'] ?? 'A1');
    const cantidades: { v: unknown; t: string }[] = [];
    for (let fila = FILA_TITULOS_EXCEL + 1; fila <= ref.e.r; fila++) {
      const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: 1 })];
      cantidades.push({ v: celda?.v, t: celda?.t });
      const productoCelda = hoja[XLSX.utils.encode_cell({ r: fila, c: 0 })];
      expect(typeof productoCelda?.v).toBe('string');
    }
    expect(cantidades.length).toBe(reporte.filas.length);
    expect(cantidades.every((celda) => celda.t === 'n' && typeof celda.v === 'number')).toBe(true);
    const boro = cantidades.find((celda) => celda.v === 198);
    expect(boro).toBeDefined();
    const texto = XLSX.utils.sheet_to_csv(hoja);
    expect(texto).not.toMatch(/precio|valor/i);
  });
});

describe('pdf', () => {
  it('trae el encabezado, el filtro y los productos', async () => {
    const arbol = arbolClasificacion(CATALOGO);
    const agro = arbol.find((nodo) => nodo.grupo === 'Agroinsumos')!;
    const seleccion = alternarCategoria({ ...TODO, modo: 'seleccion' }, agro, 'Fertilizante');
    const reporte = construirReporte(CATALOGO, seleccion);
    const blob = await blobPdfInventario(reporte, CORTE);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const texto = new TextDecoder('latin1').decode(bytes);
    expect(texto).toContain('Escocia Hass');
    expect(texto).toContain('Inventario de insumos');
    expect(texto).toContain('Borozinco');
    expect(texto).toContain('Hidrocomplex');
    expect(texto).not.toContain('Amistar');
    expect(texto).not.toContain('Campofos');
  });
});
