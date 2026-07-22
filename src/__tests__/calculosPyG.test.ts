import { describe, it, expect } from 'vitest';
import { construirPyG } from '@/utils/calculosPyG';
import { construirPeriodos } from '@/utils/periodosReporte';
import { resolverTipoCosto, TIPO_COSTO_POR_DEFECTO } from '@/utils/clasificacionCostos';
import type {
  DatosCrudosReportes,
  GastoCrudo,
  IngresoCrudo,
  TipoCosto,
  TransaccionGanadoCruda,
} from '@/types/reportesFinancieros';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ID_AGUACATE = 'neg-agua';
const ID_GANADO = 'neg-gana';
const ID_HATO = 'neg-hato';
const ID_OFICINA = 'neg-ofi';

function gasto(over: Partial<GastoCrudo> & { fecha: string; valor: number }): GastoCrudo {
  return {
    id: `g-${over.fecha}-${over.valor}-${over.concepto_id ?? 'x'}`,
    negocio_id: ID_AGUACATE,
    estado: 'Confirmado',
    categoria_id: 'cat-mo',
    categoria_nombre: 'Mano de Obra y Asistencia Técnica',
    categoria_tipo_costo: 'directo',
    concepto_id: 'con-jornales',
    concepto_nombre: 'Jornales',
    concepto_tipo_costo: null,
    ...over,
  } as GastoCrudo;
}

function ingreso(over: Partial<IngresoCrudo> & { fecha: string; valor: number }): IngresoCrudo {
  return {
    id: `i-${over.fecha}-${over.valor}`,
    negocio_id: ID_AGUACATE,
    categoria_id: 'cati-exp',
    categoria_nombre: 'Exportación',
    cosecha: null,
    cantidad: null,
    ...over,
  } as IngresoCrudo;
}

function datos(over: Partial<DatosCrudosReportes> = {}): DatosCrudosReportes {
  return {
    anio: 2026,
    negocios: [
      { id: ID_AGUACATE, nombre: 'Aguacate Hass' },
      { id: ID_GANADO, nombre: 'Ganado' },
      { id: ID_HATO, nombre: 'Hato Lechero' },
      { id: ID_OFICINA, nombre: 'Oficina Central' },
    ],
    ingresos: [],
    gastos: [],
    ganado: [],
    parametros: [],
    truncado: false,
    ...over,
  };
}

const PERIODOS = construirPeriodos(2026, 'trimestres');

// ── Invariantes estructurales ───────────────────────────────────────────────

describe('contrato del reporte', () => {
  const reporte = construirPyG(
    datos({
      ingresos: [ingreso({ fecha: '2026-02-10', valor: 100_000_000 })],
      gastos: [
        gasto({ fecha: '2026-02-15', valor: 30_000_000 }),
        gasto({
          fecha: '2026-05-15',
          valor: 20_000_000,
          categoria_id: 'cat-adm',
          categoria_nombre: 'Gastos Generales',
          categoria_tipo_costo: 'indirecto',
          concepto_id: 'con-adm',
          concepto_nombre: 'Administración',
        }),
      ],
    }),
    PERIODOS,
    { vista: 'aguacate', modo: 'trimestres' }
  );

  it('toda línea tiene tantos valores como períodos', () => {
    for (const linea of reporte.lineas) {
      expect(linea.valores).toHaveLength(PERIODOS.length);
    }
  });

  it('todos los valores monetarios son positivos: el signo lo lleva esResta', () => {
    for (const linea of reporte.lineas) {
      if (linea.formato !== 'moneda' || linea.tipo === 'resultado') continue;
      expect(linea.valores.every((v) => v >= 0)).toBe(true);
    }
  });

  it('los totales cuadran en todos los períodos', () => {
    PERIODOS.forEach((_, i) => {
      expect(reporte.totales.margen_contribucion[i]).toBe(
        reporte.totales.ingresos[i] - reporte.totales.costos_directos[i]
      );
      expect(reporte.totales.utilidad_operativa[i]).toBe(
        reporte.totales.margen_contribucion[i] - reporte.totales.gastos_indirectos[i]
      );
    });
  });

  it('los acumulados crecen: Q1 ⊆ Q1–Q2 ⊆ Q1–Q3 ⊆ Año', () => {
    const ing = reporte.totales.ingresos;
    expect(ing[0]).toBeLessThanOrEqual(ing[1]);
    expect(ing[1]).toBeLessThanOrEqual(ing[2]);
    expect(ing[2]).toBeLessThanOrEqual(ing[3]);
  });

  it('la suma de los conceptos iguala a su categoría', () => {
    const categorias = reporte.lineas.filter((l) => l.nivel === 1 && l.id.startsWith('dir_cat_'));
    for (const cat of categorias) {
      const hijos = reporte.lineas.filter((l) => l.padre_id === cat.id);
      PERIODOS.forEach((_, i) => {
        const suma = hijos.reduce((s, h) => s + h.valores[i], 0);
        expect(suma).toBeCloseTo(cat.valores[i], 6);
      });
    }
  });
});

// ── La regla que más importa ────────────────────────────────────────────────

describe('reclasificar un gasto', () => {
  function reporteCon(tipo: TipoCosto) {
    return construirPyG(
      datos({
        ingresos: [ingreso({ fecha: '2026-02-10', valor: 100_000_000 })],
        gastos: [
          gasto({
            fecha: '2026-02-15',
            valor: 40_000_000,
            categoria_id: 'cat-equipos',
            categoria_nombre: 'Equipos y Herramientas',
            categoria_tipo_costo: tipo,
          }),
        ],
      }),
      PERIODOS,
      { vista: 'aguacate', modo: 'trimestres' }
    );
  }

  it('mueve el margen de contribución pero NUNCA la utilidad operativa', () => {
    const comoDirecto = reporteCon('directo');
    const comoIndirecto = reporteCon('indirecto');

    expect(comoDirecto.totales.margen_contribucion[0]).toBe(60_000_000);
    expect(comoIndirecto.totales.margen_contribucion[0]).toBe(100_000_000);

    // Ésta es la propiedad que hace seguro estrenar con defaults imperfectos.
    expect(comoDirecto.totales.utilidad_operativa[0]).toBe(
      comoIndirecto.totales.utilidad_operativa[0]
    );
    expect(comoDirecto.totales.utilidad_operativa[0]).toBe(60_000_000);
  });
});

describe('resolución del tipo de costo', () => {
  it('el concepto gana sobre la categoría', () => {
    expect(
      resolverTipoCosto({ categoria_tipo_costo: 'indirecto', concepto_tipo_costo: 'directo' })
    ).toBe('directo');
  });

  it('sin nada definido, indirecto: lo no revisado no infla el margen', () => {
    expect(resolverTipoCosto({ categoria_tipo_costo: null, concepto_tipo_costo: null })).toBe(
      TIPO_COSTO_POR_DEFECTO
    );
    expect(TIPO_COSTO_POR_DEFECTO).toBe('indirecto');
  });
});

// ── Filtros y advertencias ──────────────────────────────────────────────────

describe('gastos pendientes', () => {
  const reporte = construirPyG(
    datos({
      ingresos: [ingreso({ fecha: '2026-02-10', valor: 50_000_000 })],
      gastos: [
        gasto({ fecha: '2026-02-15', valor: 10_000_000 }),
        gasto({ fecha: '2026-02-20', valor: 7_000_000, estado: 'Pendiente' }),
      ],
    }),
    PERIODOS,
    { vista: 'aguacate', modo: 'trimestres' }
  );

  it('no se suman en ninguna línea', () => {
    expect(reporte.totales.costos_directos[0]).toBe(10_000_000);
  });

  it('se reportan con su monto para que no parezca que la plata no se gastó', () => {
    const adv = reporte.advertencias.find((a) => a.codigo === 'gastos_pendientes');
    expect(adv).toBeDefined();
    expect(adv!.valor).toBe(7_000_000);
  });
});

describe('período sin ingresos', () => {
  const reporte = construirPyG(
    datos({ gastos: [gasto({ fecha: '2026-02-15', valor: 10_000_000 })] }),
    PERIODOS,
    { vista: 'aguacate', modo: 'trimestres' }
  );

  it('el porcentaje es null, nunca 0% por división por cero', () => {
    expect(reporte.totales.margen_contribucion_pct[0]).toBeNull();
    expect(reporte.totales.utilidad_operativa_pct[0]).toBeNull();
  });

  it('muestra la pérdida real en vez de una pantalla vacía', () => {
    expect(reporte.totales.utilidad_operativa[0]).toBe(-10_000_000);
  });
});

// ── Ganado ──────────────────────────────────────────────────────────────────

describe('P&G de Ganado', () => {
  const ganado: TransaccionGanadoCruda[] = [
    { id: 't1', fecha: '2026-01-10', tipo: 'compra', cantidad_cabezas: 20, kilos_pagados: 8000, valor_total: 60_000_000 },
    { id: 't2', fecha: '2026-02-10', tipo: 'venta', cantidad_cabezas: 10, kilos_pagados: 5000, valor_total: 50_000_000 },
  ];

  const reporte = construirPyG(datos({ ganado }), PERIODOS, {
    vista: 'ganado',
    modo: 'trimestres',
  });

  it('la venta es ingreso y sale de fin_transacciones_ganado', () => {
    expect(reporte.totales.ingresos[0]).toBe(50_000_000);
    const linea = reporte.lineas.find((l) => l.id === 'ing_ganado');
    expect(linea?.origen?.fuente).toBe('fin_transacciones_ganado');
  });

  it('la COMPRA no aparece en ninguna línea del P&G: es inventario', () => {
    const montos = reporte.lineas.flatMap((l) => l.valores);
    expect(montos).not.toContain(60_000_000);
    expect(reporte.totales.costos_directos[0]).toBe(30_000_000); // 10 cabezas × 3M
  });

  it('el costo de venta entra en costos directos', () => {
    const cogs = reporte.lineas.find((l) => l.id === 'dir_cogs_ganado');
    expect(cogs).toBeDefined();
    expect(cogs!.valores[0]).toBe(30_000_000);
    expect(cogs!.esResta).toBe(true);
  });

  it('reporta el margen por cabeza vendida', () => {
    const indicador = reporte.lineas.find((l) => l.id === 'ind_costo');
    expect(indicador?.etiqueta).toBe('Margen por cabeza vendida');
    expect(indicador?.valores[0]).toBe(2_000_000); // (50M − 30M) / 10
  });

  it('valoriza el inventario que queda caminando', () => {
    const inventario = reporte.lineas.find((l) => l.id === 'ind_inventario_ganado');
    expect(inventario?.valores[0]).toBe(30_000_000); // 10 cabezas × 3M
  });

  it('un período sin ventas da margen negativo, y eso es correcto', () => {
    const soloCompra = construirPyG(datos({ ganado: [ganado[0]] }), PERIODOS, {
      vista: 'ganado',
      modo: 'trimestres',
    });
    expect(soloCompra.totales.ingresos[0]).toBe(0);
    expect(soloCompra.totales.costos_directos[0]).toBe(0); // sin ventas no hay costo de venta
    expect(soloCompra.totales.utilidad_operativa[0]).toBe(0);
  });
});

// ── Alcance de las vistas ───────────────────────────────────────────────────

describe('alcance por vista', () => {
  const base = datos({
    ingresos: [
      ingreso({ fecha: '2026-02-10', valor: 100_000_000 }),
      ingreso({ fecha: '2026-02-11', valor: 40_000_000, negocio_id: ID_HATO, categoria_id: 'cati-leche', categoria_nombre: 'Venta Leche' }),
    ],
    gastos: [
      gasto({ fecha: '2026-02-15', valor: 30_000_000 }),
      gasto({ fecha: '2026-02-16', valor: 25_000_000, negocio_id: ID_OFICINA }),
    ],
  });

  it('la vista de un negocio solo ve lo suyo', () => {
    const r = construirPyG(base, PERIODOS, { vista: 'aguacate', modo: 'trimestres' });
    expect(r.totales.ingresos[0]).toBe(100_000_000);
    expect(r.totales.costos_directos[0]).toBe(30_000_000);
  });

  it('Global incluye los negocios sin vista propia, como Oficina Central', () => {
    const r = construirPyG(base, PERIODOS, { vista: 'global', modo: 'trimestres' });
    expect(r.totales.ingresos[0]).toBe(140_000_000);
    expect(r.totales.costos_directos[0]).toBe(55_000_000);
  });

  it('Global desglosa los ingresos por negocio', () => {
    const r = construirPyG(base, PERIODOS, { vista: 'global', modo: 'trimestres' });
    const etiquetas = r.lineas.filter((l) => l.id.startsWith('ing_')).map((l) => l.etiqueta);
    expect(etiquetas).toContain('Aguacate Hass');
    expect(etiquetas).toContain('Hato Lechero');
  });

  it('sin prorrateo: el gasto de Oficina Central no toca al aguacate', () => {
    const r = construirPyG(base, PERIODOS, { vista: 'aguacate', modo: 'trimestres' });
    expect(r.totales.gastos_indirectos[0]).toBe(0);
  });
});

// ── Modo cosecha ────────────────────────────────────────────────────────────

describe('P&G por cosecha (aguacate)', () => {
  const periodosCosecha = construirPeriodos(2026, 'cosecha');

  const base = datos({
    ingresos: [
      ingreso({ fecha: '2025-11-20', valor: 80_000_000, cosecha: 'Principal 2026' }),
      ingreso({ fecha: '2026-05-20', valor: 60_000_000, cosecha: 'Traviesa 2026' }),
    ],
    gastos: [
      gasto({ fecha: '2025-09-15', valor: 30_000_000 }), // 2º semestre 2025 → Principal 2026
      gasto({ fecha: '2026-03-15', valor: 20_000_000 }), // 1er semestre 2026 → Traviesa 2026
      gasto({ fecha: '2026-09-15', valor: 99_000_000 }), // 2º semestre 2026 → ninguna de las dos
    ],
  });

  const reporte = construirPyG(base, periodosCosecha, { vista: 'aguacate', modo: 'cosecha' });

  it('selecciona los ingresos por etiqueta de cosecha, no por fecha', () => {
    expect(reporte.totales.ingresos[0]).toBe(80_000_000); // Principal 2026
    expect(reporte.totales.ingresos[1]).toBe(60_000_000); // Traviesa 2026
  });

  it('la Principal carga los egresos del segundo semestre del año anterior', () => {
    expect(reporte.totales.costos_directos[0]).toBe(30_000_000);
  });

  it('la Traviesa carga los egresos de su primer semestre', () => {
    expect(reporte.totales.costos_directos[1]).toBe(20_000_000);
  });

  it('ningún gasto se cuenta en dos cosechas', () => {
    const total = reporte.totales.costos_directos.reduce((s, v) => s + v, 0);
    expect(total).toBe(50_000_000); // los 99M de sep-2026 quedan fuera de ambas
  });

  it('advierte sobre ingresos sin etiqueta de cosecha válida', () => {
    const conHuerfano = construirPyG(
      datos({
        ingresos: [
          ingreso({ fecha: '2026-05-20', valor: 60_000_000, cosecha: 'Traviesa 2026' }),
          ingreso({ fecha: '2026-05-21', valor: 5_000_000, cosecha: null }),
          ingreso({ fecha: '2026-05-22', valor: 3_000_000, cosecha: 'cosecha vieja' }),
        ],
      }),
      periodosCosecha,
      { vista: 'aguacate', modo: 'cosecha' }
    );
    const adv = conHuerfano.advertencias.find((a) => a.codigo === 'cosecha_sin_etiqueta');
    expect(adv).toBeDefined();
    expect(adv!.valor).toBe(8_000_000);
  });
});

// ── Defensa contra doble conteo ─────────────────────────────────────────────

describe('duplicados de ganado', () => {
  it('excluye el ingreso espejo y lo advierte', () => {
    const reporte = construirPyG(
      datos({
        ingresos: [
          ingreso({
            fecha: '2026-02-10',
            valor: 50_000_000,
            negocio_id: ID_GANADO,
            categoria_id: 'cati-ceba',
            categoria_nombre: 'Ganado de Ceba',
          }),
        ],
        ganado: [
          { id: 't1', fecha: '2026-02-10', tipo: 'venta', cantidad_cabezas: 10, kilos_pagados: 5000, valor_total: 50_000_000 },
        ],
      }),
      PERIODOS,
      { vista: 'ganado', modo: 'trimestres' }
    );

    // Se cuenta una vez, no dos.
    expect(reporte.totales.ingresos[0]).toBe(50_000_000);
    expect(reporte.advertencias.map((a) => a.codigo)).toContain('ganado_posible_duplicado');
  });
});
