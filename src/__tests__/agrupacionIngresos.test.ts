import { describe, it, expect } from 'vitest';
import { agruparPorCosecha, agruparPorQuincena, quincenaDe } from '@/utils/agrupacionIngresos';
import type { IngresoDetalleRow } from '@/types/finanzas';

function row(overrides: Partial<IngresoDetalleRow>): IngresoDetalleRow {
  return {
    fecha: '2025-06-01',
    tipo_ingreso: 'Venta',
    cantidad: null,
    precio_unitario: null,
    valor: 0,
    cosecha: null,
    alianza: null,
    cliente: null,
    finca: null,
    comprador: null,
    ...overrides,
  };
}

describe('quincenaDe', () => {
  it('day 1 → primera quincena', () => {
    expect(quincenaDe('2025-01-01').key).toBe('2025-01-1');
    expect(quincenaDe('2025-01-01').label).toBe('1-15 ene 2025');
  });
  it('day 15 → primera quincena (frontera)', () => {
    expect(quincenaDe('2025-03-15').key).toBe('2025-03-1');
  });
  it('day 16 → segunda quincena (frontera)', () => {
    expect(quincenaDe('2025-03-16').key).toBe('2025-03-2');
    expect(quincenaDe('2025-03-16').label).toBe('16-fin mar 2025');
  });
  it('day 31 → segunda quincena', () => {
    expect(quincenaDe('2025-01-31').key).toBe('2025-01-2');
  });
});

describe('agruparPorCosecha', () => {
  it('agrupa por cosecha y ordena por fecha más reciente desc', () => {
    const rows = [
      row({ cosecha: 'Principal 2025', fecha: '2025-03-01', valor: 100, cantidad: 1000 }),
      row({ cosecha: 'Traviesa 2025', fecha: '2025-09-01', valor: 200, cantidad: 2000 }),
      row({ cosecha: 'Principal 2025', fecha: '2025-04-01', valor: 150, cantidad: 1500 }),
    ];
    const grupos = agruparPorCosecha(rows);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].key).toBe('Traviesa 2025'); // más reciente
    expect(grupos[1].key).toBe('Principal 2025');
    expect(grupos[1].valorTotal).toBe(250);
    expect(grupos[1].cantidad).toBe(2500);
  });

  it('cosecha nula → grupo Sin cosecha', () => {
    const grupos = agruparPorCosecha([row({ cosecha: null, valor: 500 })]);
    expect(grupos[0].key).toBe('Sin cosecha');
    expect(grupos[0].valorTotal).toBe(500);
  });

  it('fila sin cantidad: valorTotal incluye la fila, precioPromedio excluye', () => {
    const rows = [
      row({ cosecha: 'A', valor: 300, cantidad: 100 }),
      row({ cosecha: 'A', valor: 100, cantidad: null }), // sin cantidad
    ];
    const [g] = agruparPorCosecha(rows);
    expect(g.valorTotal).toBe(400);           // incluye ambas
    expect(g.valorConCantidad).toBe(300);     // solo la que tiene cantidad
    expect(g.cantidad).toBe(100);
    expect(g.precioPromedio).toBe(3);         // 300 / 100
  });

  it('sin ninguna cantidad: precioPromedio es 0', () => {
    const [g] = agruparPorCosecha([row({ cosecha: 'A', valor: 500, cantidad: null })]);
    expect(g.precioPromedio).toBe(0);
    expect(g.cantidad).toBe(0);
    expect(g.valorTotal).toBe(500);
  });

  it('cantidad 0 no cuenta para precio', () => {
    const [g] = agruparPorCosecha([row({ cosecha: 'A', valor: 500, cantidad: 0 })]);
    expect(g.cantidad).toBe(0);
    expect(g.precioPromedio).toBe(0);
  });

  it('devuelve arreglo vacío cuando no hay filas', () => {
    expect(agruparPorCosecha([])).toEqual([]);
  });
});

describe('agruparPorQuincena', () => {
  it('agrupa correctamente por quincena y ordena desc', () => {
    const rows = [
      row({ fecha: '2025-01-10', valor: 100, cantidad: 500 }),
      row({ fecha: '2025-01-20', valor: 200, cantidad: 1000 }),
      row({ fecha: '2025-02-05', valor: 300, cantidad: 1500 }),
    ];
    const grupos = agruparPorQuincena(rows);
    expect(grupos).toHaveLength(3);
    expect(grupos[0].key).toBe('2025-02-1'); // más reciente
    expect(grupos[1].key).toBe('2025-01-2');
    expect(grupos[2].key).toBe('2025-01-1');
  });

  it('calcula precioPromedio correctamente (litros)', () => {
    const rows = [
      row({ fecha: '2025-05-03', valor: 1000, cantidad: 200 }),
      row({ fecha: '2025-05-08', valor: 2000, cantidad: 400 }),
    ];
    const [g] = agruparPorQuincena(rows);
    expect(g.cantidad).toBe(600);
    expect(g.valorConCantidad).toBe(3000);
    expect(g.precioPromedio).toBeCloseTo(5); // 3000 / 600
  });

  it('fila sin cantidad incluida en valorTotal pero no en precio', () => {
    const rows = [
      row({ fecha: '2025-05-03', valor: 500, cantidad: null }),
      row({ fecha: '2025-05-10', valor: 1000, cantidad: 200 }),
    ];
    const [g] = agruparPorQuincena(rows);
    expect(g.valorTotal).toBe(1500);
    expect(g.cantidad).toBe(200);
    expect(g.precioPromedio).toBe(5); // 1000 / 200
  });
});
