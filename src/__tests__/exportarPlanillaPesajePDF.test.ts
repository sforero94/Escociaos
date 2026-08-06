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
//      horizontal, paginación con el universo real (68 vacas activas al
//      2026-08-06), encabezado y pie en cada página.

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
  ANCHO_UTIL_CARTA_HORIZONTAL_PESAJE_PDF_MM,
  construirDocumentoPlanillaPesajePDF,
  construirEncabezadoPlanillaPesajePDF,
  construirFilasPlanillaPesajePDF,
  NOTA_OPERATIVA_PLANILLA_PESAJE,
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
  it('la fila de semanas tiene 6 celdas (Nombre + 5 semanas con colSpan 3)', () => {
    const [filaSemanas] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 7, 3));
    expect(filaSemanas).toHaveLength(6);
    expect(filaSemanas[1]).toEqual({ content: 'Sem 1 (1/7)', colSpan: 3 });
    expect(filaSemanas[0]).toEqual({ content: 'Nombre', colSpan: 1 });
  });

  it('una semana sin fecha ese mes muestra el rótulo SIN fecha', () => {
    const [filaSemanas] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 8, 3));
    expect(filaSemanas[5]).toEqual({ content: 'Sem 5', colSpan: 3 });
  });

  it('la fila de sub-columnas tiene 16 celdas: blanco + (AM,PM,Total) × 5', () => {
    const [, filaSub] = construirEncabezadoPlanillaPesajePDF(fechasPorSemanaDelMes(2026, 7, 3));
    expect(filaSub).toHaveLength(16);
    expect(filaSub.slice(1, 4)).toEqual([{ content: 'AM' }, { content: 'PM' }, { content: 'Total' }]);
  });
});

describe('construirFilasPlanillaPesajePDF', () => {
  it('cada fila tiene 16 celdas: nombre + 15 vacías -- SIEMPRE en blanco', () => {
    const animales: AnimalPlanillaPesaje[] = [{ id: '1', nombre: 'ALINA' }];
    const filas = construirFilasPlanillaPesajePDF(animales);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveLength(16);
    expect(filas[0][0]).toBe('ALINA');
    expect(filas[0].slice(1).every((c) => c === '')).toBe(true);
  });

  it('respeta el orden alfabético del roster', () => {
    const animales: AnimalPlanillaPesaje[] = [{ id: '1', nombre: 'ZULEMA' }, { id: '2', nombre: 'ALINA' }];
    const filas = construirFilasPlanillaPesajePDF(animales);
    expect(filas.map((f) => f[0])).toEqual(['ALINA', 'ZULEMA']);
  });
});

describe('presupuesto de ancho: la tabla no desborda la carta horizontal', () => {
  it('el ancho total de columnas cabe dentro del ancho útil', () => {
    expect(ANCHO_TABLA_PESAJE_PDF_MM).toBeLessThanOrEqual(ANCHO_UTIL_CARTA_HORIZONTAL_PESAJE_PDF_MM);
  });
});

describe('construirDocumentoPlanillaPesajePDF -- documento real con jspdf + jspdf-autotable', () => {
  const fechas = fechasPorSemanaDelMes(2026, 7, 3);

  function animales(n: number): AnimalPlanillaPesaje[] {
    return Array.from({ length: n }, (_, i) => ({ id: String(i), nombre: `VACA${String(i).padStart(3, '0')}` }));
  }

  it('carta HORIZONTAL: el ancho de página es mayor que el alto', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(1) },
    );
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    expect(ancho).toBeGreaterThan(alto);
    expect(Math.round(ancho)).toBe(279);
    expect(Math.round(alto)).toBe(216);
  });

  it('una sola vaca cabe en una sola página', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(1) },
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('el universo real del hato (68 vacas activas, 2026-08-06) cabe en 4 páginas a 11pt', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(68) },
    );
    expect(doc.getNumberOfPages()).toBe(4);
  });

  it('el título y el pie de página aparecen en TODAS las páginas', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(68) },
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
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(68) },
    );
    const total = doc.getNumberOfPages();
    const contenido = doc.output();
    expect(contenido.split('Sem 1').length - 1).toBeGreaterThanOrEqual(total);
  });

  it('ninguna fila de vaca se corta entre dos páginas -- cada nombre aparece exactamente una vez', () => {
    const doc = construirDocumentoPlanillaPesajePDF(
      { jsPDF, autoTable },
      { anio: 2026, mes: 7, fechasPorSemana: fechas, animales: animales(68) },
    );
    const contenido = doc.output();
    expect(contenido.split('VACA000').length - 1).toBe(1);
    expect(contenido.split('VACA067').length - 1).toBe(1);
  });
});
