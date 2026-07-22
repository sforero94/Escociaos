import { describe, it, expect } from 'vitest';
import { construirFlujoCaja } from '@/utils/calculosFlujoCaja';
import { construirPyG } from '@/utils/calculosPyG';
import { construirPeriodos } from '@/utils/periodosReporte';
import type {
  DatosCrudosReportes,
  GastoCrudo,
  IngresoCrudo,
  TransaccionGanadoCruda,
} from '@/types/reportesFinancieros';

const ID_AGUACATE = 'neg-agua';
const ID_GANADO = 'neg-gana';

function gasto(fecha: string, valor: number, over: Partial<GastoCrudo> = {}): GastoCrudo {
  return {
    id: `g-${fecha}-${valor}`,
    fecha,
    negocio_id: ID_AGUACATE,
    valor,
    estado: 'Confirmado',
    categoria_id: 'cat-mo',
    categoria_nombre: 'Mano de Obra y Asistencia Técnica',
    categoria_tipo_costo: 'directo',
    concepto_id: 'con-jor',
    concepto_nombre: 'Jornales',
    concepto_tipo_costo: null,
    ...over,
  };
}

function ingreso(fecha: string, valor: number, over: Partial<IngresoCrudo> = {}): IngresoCrudo {
  return {
    id: `i-${fecha}-${valor}`,
    fecha,
    negocio_id: ID_AGUACATE,
    valor,
    categoria_id: 'cati-exp',
    categoria_nombre: 'Exportación',
    cosecha: null,
    cantidad: null,
    ...over,
  };
}

function datos(over: Partial<DatosCrudosReportes> = {}): DatosCrudosReportes {
  return {
    anio: 2026,
    negocios: [
      { id: ID_AGUACATE, nombre: 'Aguacate Hass' },
      { id: ID_GANADO, nombre: 'Ganado' },
    ],
    ingresos: [],
    gastos: [],
    ganado: [],
    parametros: [],
    truncado: false,
    ...over,
  };
}

describe('estructura de 12 meses', () => {
  const reporte = construirFlujoCaja(
    datos({
      ingresos: [ingreso('2026-03-10', 90_000_000)],
      gastos: [gasto('2026-03-15', 30_000_000), gasto('2026-07-15', 10_000_000)],
    }),
    'aguacate'
  );

  it('toda línea tiene exactamente 12 posiciones', () => {
    for (const linea of reporte.lineas) {
      expect(linea.meses).toHaveLength(12);
    }
    expect(reporte.totales.flujo_neto).toHaveLength(12);
  });

  it('los meses sin movimiento son 0, no huecos', () => {
    const entradas = reporte.totales.entradas;
    expect(entradas[0]).toBe(0);
    expect(entradas[2]).toBe(90_000_000); // marzo, índice 2
    expect(entradas.every((v) => typeof v === 'number')).toBe(true);
  });

  it('ubica cada movimiento en su mes por corte de string', () => {
    expect(reporte.totales.salidas[2]).toBe(30_000_000); // marzo
    expect(reporte.totales.salidas[6]).toBe(10_000_000); // julio
  });

  it('el total de una línea es la suma de sus 12 meses', () => {
    const detalle = reporte.lineas.filter((l) => l.nivel === 1);
    for (const linea of detalle) {
      expect(linea.total).toBe(linea.meses.reduce((s, v) => s + v, 0));
    }
  });
});

describe('flujo neto y acumulado', () => {
  const reporte = construirFlujoCaja(
    datos({
      ingresos: [ingreso('2026-01-10', 100_000_000), ingreso('2026-02-10', 50_000_000)],
      gastos: [gasto('2026-01-15', 40_000_000), gasto('2026-03-15', 30_000_000)],
    }),
    'aguacate'
  );

  it('flujo neto = entradas − salidas, mes a mes', () => {
    reporte.totales.flujo_neto.forEach((neto, i) => {
      expect(neto).toBe(reporte.totales.entradas[i] - reporte.totales.salidas[i]);
    });
  });

  it('el acumulado es la suma prefija del neto', () => {
    expect(reporte.totales.flujo_acumulado[0]).toBe(60_000_000);
    expect(reporte.totales.flujo_acumulado[1]).toBe(110_000_000);
    expect(reporte.totales.flujo_acumulado[2]).toBe(80_000_000);
  });

  it('el cierre de diciembre iguala la suma de los 12 netos', () => {
    const suma = reporte.totales.flujo_neto.reduce((s, v) => s + v, 0);
    expect(reporte.totales.flujo_acumulado[11]).toBe(reporte.saldo_inicial + suma);
  });
});

describe('saldo inicial de caja', () => {
  it('sin parámetro, la fila se rotula como flujo acumulado, no como saldo', () => {
    const reporte = construirFlujoCaja(datos(), 'global');
    expect(reporte.saldo_inicial).toBe(0);
    expect(reporte.saldo_inicial_es_supuesto).toBe(true);
    expect(reporte.lineas.find((l) => l.id === 'flujo_acumulado')?.etiqueta).toBe(
      'FLUJO ACUMULADO DEL PERÍODO'
    );
  });

  it('con parámetro cargado pasa a llamarse saldo de caja y arranca desde ahí', () => {
    const reporte = construirFlujoCaja(
      datos({
        parametros: [{ clave: 'saldo_inicial_caja', anio: 2026, negocio_id: null, valor: 25_000_000 }],
        ingresos: [ingreso('2026-01-10', 10_000_000)],
      }),
      'global'
    );
    expect(reporte.saldo_inicial_es_supuesto).toBe(false);
    expect(reporte.lineas.find((l) => l.id === 'flujo_acumulado')?.etiqueta).toBe('SALDO DE CAJA');
    expect(reporte.totales.flujo_acumulado[0]).toBe(35_000_000);
  });

  it('un parámetro sin año aplica como respaldo', () => {
    const reporte = construirFlujoCaja(
      datos({ parametros: [{ clave: 'saldo_inicial_caja', anio: null, negocio_id: null, valor: 7_000_000 }] }),
      'global'
    );
    expect(reporte.saldo_inicial).toBe(7_000_000);
  });
});

describe('ganado: la asimetría con el P&G', () => {
  const ganado: TransaccionGanadoCruda[] = [
    { id: 't1', fecha: '2026-01-10', tipo: 'compra', cantidad_cabezas: 20, kilos_pagados: 8000, valor_total: 60_000_000 },
    { id: 't2', fecha: '2026-04-10', tipo: 'venta', cantidad_cabezas: 10, kilos_pagados: 5000, valor_total: 50_000_000 },
  ];

  const flujo = construirFlujoCaja(datos({ ganado }), 'ganado');
  const pyg = construirPyG(datos({ ganado }), construirPeriodos(2026, 'trimestres'), {
    vista: 'ganado',
    modo: 'trimestres',
  });

  it('la compra SÍ es salida de caja', () => {
    expect(flujo.totales.salidas[0]).toBe(60_000_000);
    const linea = flujo.lineas.find((l) => l.id === 'sal_ganado');
    expect(linea?.etiqueta).toBe('Compra de ganado (inversión en inventario)');
  });

  it('la misma compra NO existe en ninguna línea que sume en el P&G', () => {
    // Ésta es la asimetría que más se malinterpreta al leer los dos reportes.
    expect(pyg.totales.costos_directos[0]).toBe(0);

    // Se excluyen los indicadores: "Inventario de semovientes al cierre" vale
    // legítimamente 60M en Q1 (las 20 cabezas compradas siguen en el potrero).
    // Esa línea informa, no suma.
    const lineasQueSuman = pyg.lineas.filter((l) => l.tipo !== 'indicador' && l.tipo !== 'seccion');
    expect(lineasQueSuman.flatMap((l) => l.valores)).not.toContain(60_000_000);
  });

  it('el inventario al cierre recuerda que la plata está caminando', () => {
    const inventario = pyg.lineas.find((l) => l.id === 'ind_inventario_ganado');
    expect(inventario?.tipo).toBe('indicador');
    expect(inventario?.valores[0]).toBe(60_000_000); // Q1: aún no se ha vendido nada
    expect(inventario?.valores[1]).toBe(30_000_000); // Q1–Q2: quedan 10 cabezas
  });

  it('la venta es entrada de caja y también ingreso del P&G', () => {
    expect(flujo.totales.entradas[3]).toBe(50_000_000); // abril
    expect(pyg.totales.ingresos[1]).toBe(50_000_000); // Q1–Q2
  });

  it('la compra va en su propia línea, separada de los gastos', () => {
    const salidasGasto = flujo.lineas.filter((l) => l.id.startsWith('sal_') && l.id !== 'sal_ganado');
    expect(salidasGasto.every((l) => l.total !== 60_000_000)).toBe(true);
  });
});

describe('filtros', () => {
  it('excluye los gastos pendientes y los reporta', () => {
    const reporte = construirFlujoCaja(
      datos({
        gastos: [gasto('2026-02-15', 10_000_000), gasto('2026-02-20', 4_000_000, { estado: 'Pendiente' })],
      }),
      'aguacate'
    );
    expect(reporte.totales.salidas[1]).toBe(10_000_000);
    expect(reporte.advertencias.find((a) => a.codigo === 'gastos_pendientes')?.valor).toBe(4_000_000);
  });

  it('ignora los movimientos de otros años', () => {
    const reporte = construirFlujoCaja(
      datos({ gastos: [gasto('2025-02-15', 99_000_000), gasto('2026-02-15', 10_000_000)] }),
      'aguacate'
    );
    expect(reporte.totales.salidas.reduce((s, v) => s + v, 0)).toBe(10_000_000);
  });

  it('la vista de un negocio no ve el ganado de otro', () => {
    const reporte = construirFlujoCaja(
      datos({
        ganado: [
          { id: 't1', fecha: '2026-01-10', tipo: 'compra', cantidad_cabezas: 5, kilos_pagados: null, valor_total: 15_000_000 },
        ],
      }),
      'aguacate'
    );
    expect(reporte.totales.salidas.reduce((s, v) => s + v, 0)).toBe(0);
  });
});
