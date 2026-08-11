// ARCHIVO: __tests__/exportarPlanillaPesajePDF.test.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md`, punto 1 -- PDF
// IMPRIMIBLE de la planilla mensual de pesaje en blanco. Cubre:
//
//   1. Título, fecha corta y orden alfabético del roster (helpers puros de
//      `exportarPlanillaPesaje.ts`).
//   2. `fechasPorSemanaDelMes` -- 5 fechas en un mes de 5 miércoles, 4 en uno
//      de 4 (nunca inventa la 5ª), sobre `fechasPesajeMensuales`
//      (`calculosHato.ts`).
//   3. El armado de encabezado (2 filas, colSpan por semana) y de filas de
//      datos (SIEMPRE en blanco -- esta planilla nunca arrastra litros).
//   4. El documento REAL armado con jspdf + jspdf-autotable (inyectadas,
//      mismo patrón que `exportarPlanillaChequeoPDF.test.ts`): carta
//      VERTICAL, encabezado y pie en cada página.
//   5. EL TOPE DE 2 PÁGINAS (requisito del dueño, 2026-08-11). Se verifica
//      contra el documento real, no contra el modelo de
//      `calcularMetricasFilaPesaje` -- si el cálculo de alto de fila se
//      desalinea de lo que jspdf-autotable hace de verdad, estos tests son
//      los que se caen.

import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  construirTituloPlanillaPesaje,
  fechaCortaColumna,
  fechasPorSemanaDelMes,
  ordenarRosterPesaje,
  type AnimalPlanillaPesaje,
} from '@/utils/hato/exportarPlanillaPesaje';
import {
  ANCHO_TABLA_PESAJE_PDF_MM,
  ANCHO_UTIL_CARTA_VERTICAL_PESAJE_PDF_MM,
  ALTO_MINIMO_COMODO_FILA_PESAJE_MM,
  calcularMetricasFilaPesaje,
  construirDocumentoPlanillaPesajePDF,
  construirEncabezadoPlanillaPesajePDF,
  construirFilasPlanillaPesajePDF,
  FUENTE_DATOS_PESAJE_PT,
  FUENTE_MINIMA_PESAJE_PT,
  NOTA_OPERATIVA_PLANILLA_PESAJE,
  PAGINAS_MAXIMAS_PLANILLA_PESAJE,
} from '@/utils/hato/exportarPlanillaPesajePDF';

describe('construirTituloPlanillaPesaje', () => {
  it('arma "PLANILLA DE PESAJE <MES> <AÑO>"', () => {
    expect(construirTituloPlanillaPesaje(2026, 7)).toBe('PLANILLA DE PESAJE JULIO 2026');
    expect(construirTituloPlanillaPesaje(2026, 12)).toBe('PLANILLA DE PESAJE DICIEMBRE 2026');
  });
});

describe('fechaCortaColumna', () => {
  it('convierte AAAA-MM-DD a D/M corto', () => {
    expect(fechaCortaColumna('2026-07-05')).toBe('5/7');
    expect(fechaCortaColumna('2026-12-30')).toBe('30/12');
  });

  it('null -> null, nunca una fecha inventada', () => {
    expect(fechaCortaColumna(null)).toBeNull();
  });
});

describe('ordenarRosterPesaje', () => {
  it('ordena alfabéticamente, insensible a acento/mayúscula (T2)', () => {
    const animales: AnimalPlanillaPesaje[] = [
      { id: '3', nombre: 'Zulema' },
      { id: '1', nombre: 'ÁGUEDA' },
      { id: '2', nombre: 'brillantina' },
    ];
    expect(ordenarRosterPesaje(animales).map((a) => a.nombre)).toEqual(['ÁGUEDA', 'brillantina', 'Zulema']);
  });
});

describe('fechasPorSemanaDelMes', () => {
  it('julio 2026 (5 miércoles) -> 5 fechas', () => {
    const fechas = fechasPorSemanaDelMes(2026, 7, 3);
    expect(fechas).toEqual({
      1: '2026-07-01',
      2: '2026-07-08',
      3: '2026-07-15',
      4: '2026-07-22',
      5: '2026-07-29',
    });
  });

  it('agosto 2026 (4 miércoles) -> la 5ª queda null, nunca inventada', () => {
    const fechas = fechasPorSemanaDelMes(2026, 8, 3);
    expect(fechas[5]).toBeNull();
    expect(fechas[4]).toBe('2026-08-26');
  });
});

describe('construirEncabezadoPlanillaPesajePDF', () => {
  it('la fila de semanas tiene 6 celdas (Nombre + 5 semanas con colSpan 2)', () => {
    const [filaSemanas] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 7, 3));
    expect(filaSemanas).toHaveLength(6);
    expect(filaSemanas[1]).toEqual({ content: 'Sem 1 (1/7)', colSpan: 2 });
    expect(filaSemanas[0]).toEqual({ content: 'Nombre', colSpan: 1 });
  });

  it('una semana sin fecha ese mes muestra el rótulo SIN fecha', () => {
    const [filaSemanas] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 8, 3));
    expect(filaSemanas[5]).toEqual({ content: 'Sem 5', colSpan: 2 });
  });

  it('la fila de sub-columnas tiene 11 celdas: blanco + (AM,PM) × 5 -- SIN Total', () => {
    const [, filaSub] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 7, 3));
    expect(filaSub).toHaveLength(11);
    expect(filaSub.slice(1, 3)).toEqual([{ content: 'AM' }, { content: 'PM' }]);
    expect(filaSub.some((c) => c.content === 'Total')).toBe(false);
  });
});

describe('construirFilasPlanillaPesajePDF', () => {
  it('cada fila tiene 11 celdas: nombre + 10 vacías -- SIEMPRE en blanco', () => {
    const animales: AnimalPlanillaPesaje[] = [{ id: '1', nombre: 'ALINA' }];
    const filas = construirFilasPlanillaPesajePDF(animales);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveLength(11);
    expect(filas[0][0]).toBe('ALINA');
    expect(filas[0].slice(1).every((c) => c === '')).toBe(true);
  });

  it('respeta el orden alfabético del roster', () => {
    const animales: AnimalPlanillaPesaje[] = [{ id: '1', nombre: 'ZULEMA' }, { id: '2', nombre: 'ALINA' }];
    const filas = construirFilasPlanillaPesajePDF(animales);
    expect(filas.map((f) => f[0])).toEqual(['ALINA', 'ZULEMA']);
  });
});

describe('presupuesto de ancho: la tabla no desborda la carta vertical', () => {
  it('el ancho total de columnas cabe dentro del ancho útil', () => {
    expect(ANCHO_TABLA_PESAJE_PDF_MM).toBeLessThanOrEqual(ANCHO_UTIL_CARTA_VERTICAL_PESAJE_PDF_MM);
  });
});

describe('calcularMetricasFilaPesaje', () => {
  it('el roster de hoy (35) apunta a UNA sola página, a 11pt', () => {
    const m = calcularMetricasFilaPesaje(35);
    expect(m.paginasObjetivo).toBe(1);
    expect(m.filasPorPagina).toBe(35);
    expect(m.fuentePt).toBe(FUENTE_DATOS_PESAJE_PT);
    expect(m.altoFila).toBeGreaterThanOrEqual(ALTO_MINIMO_COMODO_FILA_PESAJE_MM);
    expect(m.cabeEnPaginasMaximas).toBe(true);
  });

  it('con muy pocas filas no estira más allá del tope de comodidad', () => {
    const m = calcularMetricasFilaPesaje(5);
    expect(m.paginasObjetivo).toBe(1);
    expect(m.altoFila).toBe(12);
  });

  it('cuando apretar en una hoja dejaría filas no escribibles, gasta la segunda', () => {
    // 62 = las 35 vacas + las 27 novillas. En una hoja daría filas de ~3,8mm.
    const m = calcularMetricasFilaPesaje(62);
    expect(m.paginasObjetivo).toBe(2);
    expect(m.altoFila).toBeGreaterThanOrEqual(ALTO_MINIMO_COMODO_FILA_PESAJE_MM);
    expect(m.fuentePt).toBe(FUENTE_DATOS_PESAJE_PT);
    expect(m.cabeEnPaginasMaximas).toBe(true);
  });

  it('el salto a 2 páginas ocurre en el límite de comodidad, no antes', () => {
    expect(calcularMetricasFilaPesaje(39).paginasObjetivo).toBe(1);
    expect(calcularMetricasFilaPesaje(40).paginasObjetivo).toBe(2);
  });

  it('entre el límite cómodo y el techo físico aprieta el alto ANTES que la letra', () => {
    const m = calcularMetricasFilaPesaje(90);
    expect(m.altoFila).toBeLessThan(ALTO_MINIMO_COMODO_FILA_PESAJE_MM);
    expect(m.fuentePt).toBeGreaterThanOrEqual(FUENTE_MINIMA_PESAJE_PT);
    expect(m.cabeEnPaginasMaximas).toBe(true);
  });

  it('nunca baja de la letra mínima, y lo reporta en vez de comprimir a lo ilegible', () => {
    const m = calcularMetricasFilaPesaje(400);
    expect(m.fuentePt).toBe(FUENTE_MINIMA_PESAJE_PT);
    expect(m.cabeEnPaginasMaximas).toBe(false);
  });

  it('roster vacío no revienta', () => {
    expect(calcularMetricasFilaPesaje(0).cabeEnPaginasMaximas).toBe(true);
  });
});

describe('construirDocumentoPlanillaPesajePDF -- documento real con jspdf + jspdf-autotable', () => {
  const fechas = fechasPorSemanaDelMes(2026, 7, 3);

  function animales(n: number): AnimalPlanillaPesaje[] {
    return Array.from({ length: n }, (_, i) => ({ id: String(i), nombre: `VACA${String(i).padStart(3, '0')}` }));
  }

  it('carta VERTICAL: el alto de página es mayor que el ancho', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(1) },
    );
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    expect(alto).toBeGreaterThan(ancho);
    expect(Math.round(ancho)).toBe(216);
    expect(Math.round(alto)).toBe(279);
  });

  it('una sola vaca cabe en una sola página', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(1) },
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  // El requisito del dueño (2026-08-11) verificado contra el documento REAL,
  // en todo el rango que el hato puede alcanzar de forma realista: 35 es el
  // roster de hoy (solo vacas), 62 sería con las 27 novillas dentro, y 100 es
  // el techo físico del formato (ver el test siguiente).
  it.each([1, 20, 35, 50, 62, 80, 100])('%i filas caben en 2 páginas o menos', (n) => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(n) },
    );
    expect(doc.getNumberOfPages()).toBeLessThanOrEqual(PAGINAS_MAXIMAS_PLANILLA_PESAJE);
  });

  // Pasado el techo, el contrato es DECIR la verdad, no comprimir hasta lo
  // ilegible: `cabeEnPaginasMaximas` queda en false y el documento se
  // desborda a 3 páginas con la letra mínima intacta.
  it('por encima del techo físico se desborda honestamente, no se comprime', () => {
    expect(calcularMetricasFilaPesaje(102).cabeEnPaginasMaximas).toBe(false);
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(102) },
    );
    expect(doc.getNumberOfPages()).toBeGreaterThan(PAGINAS_MAXIMAS_PLANILLA_PESAJE);
  });

  it('el roster de hoy (35 vacas) sale en UNA sola página', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(35) },
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it.each([1, 20, 35, 39])('%i filas caben en UNA sola página', (n) => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(n) },
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('el título y el pie de página aparecen en TODAS las páginas', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(62) },
    );
    const total = doc.getNumberOfPages();
    const contenido = doc.output();
    expect(contenido.split('PLANILLA DE PESAJE JULIO 2026').length - 1).toBe(total);
    for (let i = 1; i <= total; i++) {
      expect(contenido).toContain(`Página ${i} de ${total}`);
    }
    expect(contenido).toContain(NOTA_OPERATIVA_PLANILLA_PESAJE.slice(0, 30));
  });

  it('el encabezado de columnas (Sem 1) se repite en cada página (showHead: everyPage)', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(62) },
    );
    const total = doc.getNumberOfPages();
    const contenido = doc.output();
    expect(contenido.split('Sem 1').length - 1).toBeGreaterThanOrEqual(total);
  });

  it('ninguna fila de vaca se corta entre dos páginas -- cada nombre aparece exactamente una vez', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(62) },
    );
    const contenido = doc.output();
    expect(contenido.split('VACA000').length - 1).toBe(1);
    expect(contenido.split('VACA061').length - 1).toBe(1);
  });
});
