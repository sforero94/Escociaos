// Motor del P&G (Pérdidas y Ganancias) por negocio. Lógica pura, sin Supabase.
//
// Estructura (nivel intermedio, decisión del dueño):
//
//   INGRESOS
//   COSTOS DIRECTOS            (incluye el costo de venta del ganado)
//   MARGEN DE CONTRIBUCIÓN     = Ingresos − Costos Directos
//   GASTOS INDIRECTOS
//   UTILIDAD OPERATIVA         = Margen − Indirectos
//   INDICADORES                (unitarios; no suman)
//
// Reglas que este archivo hace cumplir:
//   • Solo gastos con estado 'Confirmado'.
//   • La COMPRA de ganado nunca aparece: es inventario, no gasto.
//   • Sin prorrateo entre negocios — cada gasto ya trae su negocio.

import type {
  AdvertenciaReporte,
  DatosCrudosReportes,
  GastoCrudo,
  IngresoCrudo,
  LineaPyG,
  ModoReporte,
  PeriodoDef,
  ReportePyG,
  TipoCosto,
  VistaReporte,
} from '@/types/reportesFinancieros';
import { fechaEnRango } from '@/utils/periodosReporte';
import { esConfirmado, gastosSinCategoria, resolverTipoCosto } from '@/utils/clasificacionCostos';
import {
  costearVentasGanado,
  leerInventarioInicial,
  valorInventarioAFecha,
} from '@/utils/costoVentaGanado';
import {
  advertenciaPendientes,
  detectarDuplicadosGanado,
  redondearPesos,
  resolverAlcance,
} from '@/utils/reportesFinancierosComun';

const ETIQUETA_COSECHA = /^(Principal|Traviesa) \d{4}$/;

// ── Acumulador de líneas ────────────────────────────────────────────────────

type EspecificacionLinea = Omit<LineaPyG, 'valores'>;

class Acumulador {
  private readonly mapa = new Map<string, LineaPyG>();

  constructor(private readonly nPeriodos: number) {}

  sumar(spec: EspecificacionLinea, indicePeriodo: number, valor: number): void {
    let linea = this.mapa.get(spec.id);
    if (!linea) {
      linea = { ...spec, valores: new Array(this.nPeriodos).fill(0) };
      this.mapa.set(spec.id, linea);
    }
    linea.valores[indicePeriodo] += valor;
  }

  fijar(spec: EspecificacionLinea, valores: number[]): void {
    this.mapa.set(spec.id, { ...spec, valores });
  }

  obtener(id: string): LineaPyG | undefined {
    return this.mapa.get(id);
  }

  /** Líneas de detalle ordenadas: nivel 1 por total descendente, con sus hijos debajo. */
  detalleOrdenado(prefijo: string): LineaPyG[] {
    const todas = [...this.mapa.values()].filter((l) => l.id.startsWith(prefijo));
    const total = (l: LineaPyG) => l.valores.reduce((s, v) => s + v, 0);

    const padres = todas.filter((l) => l.nivel === 1).sort((a, b) => total(b) - total(a));
    const salida: LineaPyG[] = [];

    for (const padre of padres) {
      salida.push(padre);
      const hijos = todas
        .filter((l) => l.nivel === 2 && l.padre_id === padre.id)
        .sort((a, b) => total(b) - total(a));
      salida.push(...hijos);
    }
    return salida;
  }
}

// ── Selección de filas por período ──────────────────────────────────────────

function seleccionarIngresos(ingresos: IngresoCrudo[], periodo: PeriodoDef): IngresoCrudo[] {
  if (periodo.ingresos.modo === 'cosecha') {
    return ingresos.filter((i) => i.cosecha === periodo.ingresos.etiqueta);
  }
  const { desde = '', hasta = '' } = periodo.ingresos;
  return ingresos.filter((i) => fechaEnRango(i.fecha, desde, hasta));
}

function seleccionarGastos(gastos: GastoCrudo[], periodo: PeriodoDef): GastoCrudo[] {
  return gastos.filter((g) => fechaEnRango(g.fecha, periodo.egresos.desde, periodo.egresos.hasta));
}

// ── Motor ───────────────────────────────────────────────────────────────────

export interface OpcionesPyG {
  vista: VistaReporte;
  modo: ModoReporte;
}

export function construirPyG(
  datos: DatosCrudosReportes,
  periodos: PeriodoDef[],
  opciones: OpcionesPyG
): ReportePyG {
  const { vista, modo } = opciones;
  const n = periodos.length;
  const alcance = resolverAlcance(datos, vista);
  const advertencias: AdvertenciaReporte[] = [];

  const duplicados = detectarDuplicadosGanado(datos);
  advertencias.push(...duplicados.advertencias);

  // Universo de filas del alcance, ya depurado de duplicados de ganado.
  const ingresosVista = datos.ingresos.filter(
    (i) => alcance.negocioIds.has(i.negocio_id) && !duplicados.ingresosExcluidos.has(i.id)
  );
  const gastosVista = datos.gastos.filter(
    (g) => alcance.negocioIds.has(g.negocio_id) && !duplicados.gastosExcluidos.has(g.id)
  );
  const gastosConfirmados = gastosVista.filter(esConfirmado);

  // ── Costeo del ganado (una sola pasada sobre el histórico completo) ───────
  const inventarioInicial = leerInventarioInicial(datos.parametros);
  const costeo = alcance.incluyeGanado
    ? costearVentasGanado(datos.ganado, inventarioInicial)
    : null;
  if (costeo) advertencias.push(...costeo.advertencias);

  const acumulador = new Acumulador(n);

  const totales = {
    ingresos: new Array(n).fill(0),
    costos_directos: new Array(n).fill(0),
    margen_contribucion: new Array(n).fill(0),
    gastos_indirectos: new Array(n).fill(0),
    utilidad_operativa: new Array(n).fill(0),
    margen_contribucion_pct: new Array(n).fill(null) as (number | null)[],
    utilidad_operativa_pct: new Array(n).fill(null) as (number | null)[],
  };

  // Indicadores unitarios, acumulados aparte porque no son sumas de líneas.
  const unidades = new Array(n).fill(0); // kilos / litros / cabezas
  const kilosGanado = new Array(n).fill(0);

  periodos.forEach((periodo, idx) => {
    // ── INGRESOS ──────────────────────────────────────────────────────────
    for (const ing of seleccionarIngresos(ingresosVista, periodo)) {
      const etiqueta =
        vista === 'global'
          ? alcance.nombrePorNegocio.get(ing.negocio_id) ?? 'Sin negocio'
          : ing.categoria_nombre ?? 'Sin categoría';
      const id = `ing_${vista === 'global' ? ing.negocio_id : ing.categoria_id ?? 'sin'}`;

      acumulador.sumar(
        {
          id,
          nivel: 1,
          tipo: 'detalle',
          etiqueta,
          esResta: false,
          formato: 'moneda',
          origen: {
            fuente: 'fin_ingresos',
            categoria_id: ing.categoria_id ?? undefined,
            negocio_id: ing.negocio_id,
          },
        },
        idx,
        ing.valor
      );
      totales.ingresos[idx] += ing.valor;

      if (vista === 'aguacate') unidades[idx] += ing.cantidad ?? 0;
      // En Hato solo la leche se mide en litros: las ventas de terneros y
      // "Otro" traen `cantidad` con otra unidad y contaminarían el $/litro.
      if (vista === 'hato' && /leche/i.test(ing.categoria_nombre ?? '')) {
        unidades[idx] += ing.cantidad ?? 0;
      }
    }

    // Venta de ganado: fuente propia, nunca `fin_ingresos`.
    if (alcance.incluyeGanado) {
      let ventaGanado = 0;
      let cabezas = 0;
      for (const t of datos.ganado) {
        if (t.tipo !== 'venta') continue;
        if (!fechaEnRango(t.fecha, periodo.egresos.desde, periodo.egresos.hasta)) continue;
        ventaGanado += t.valor_total;
        cabezas += t.cantidad_cabezas;
        kilosGanado[idx] += t.kilos_pagados ?? 0;
      }
      if (ventaGanado > 0) {
        acumulador.sumar(
          {
            id: 'ing_ganado',
            nivel: 1,
            tipo: 'detalle',
            etiqueta: vista === 'global' ? 'Ganado — venta de animales' : 'Venta de ganado',
            esResta: false,
            formato: 'moneda',
            origen: { fuente: 'fin_transacciones_ganado' },
          },
          idx,
          ventaGanado
        );
        totales.ingresos[idx] += ventaGanado;
      }
      if (vista === 'ganado') unidades[idx] += cabezas;
    }

    // ── GASTOS: directos e indirectos ─────────────────────────────────────
    for (const gasto of seleccionarGastos(gastosConfirmados, periodo)) {
      const tipo: TipoCosto = resolverTipoCosto(gasto);
      const prefijo = tipo === 'directo' ? 'dir' : 'ind';
      const idCategoria = `${prefijo}_cat_${gasto.categoria_id ?? 'sin'}`;

      acumulador.sumar(
        {
          id: idCategoria,
          nivel: 1,
          tipo: 'detalle',
          etiqueta: gasto.categoria_nombre ?? 'Sin categoría',
          esResta: true,
          formato: 'moneda',
          origen: { fuente: 'fin_gastos', categoria_id: gasto.categoria_id ?? undefined },
        },
        idx,
        gasto.valor
      );

      acumulador.sumar(
        {
          id: `${prefijo}_con_${gasto.concepto_id ?? 'sin'}`,
          padre_id: idCategoria,
          nivel: 2,
          tipo: 'detalle',
          etiqueta: gasto.concepto_nombre ?? 'Sin concepto',
          esResta: true,
          formato: 'moneda',
          origen: {
            fuente: 'fin_gastos',
            categoria_id: gasto.categoria_id ?? undefined,
            concepto_id: gasto.concepto_id ?? undefined,
          },
        },
        idx,
        gasto.valor
      );

      if (tipo === 'directo') totales.costos_directos[idx] += gasto.valor;
      else totales.gastos_indirectos[idx] += gasto.valor;
    }

    // ── Costo de venta del ganado (dentro de costos directos) ─────────────
    if (costeo) {
      let cogs = 0;
      for (const venta of costeo.ventas) {
        if (fechaEnRango(venta.fecha, periodo.egresos.desde, periodo.egresos.hasta)) {
          cogs += venta.cogs;
        }
      }
      if (cogs > 0) {
        acumulador.sumar(
          {
            id: 'dir_cogs_ganado',
            nivel: 1,
            tipo: 'detalle',
            etiqueta: 'Costo de venta de ganado',
            esResta: true,
            formato: 'moneda',
            origen: { fuente: 'derivado' },
          },
          idx,
          cogs
        );
        totales.costos_directos[idx] += cogs;
      }
    }

    // ── Resultados ────────────────────────────────────────────────────────
    totales.margen_contribucion[idx] = totales.ingresos[idx] - totales.costos_directos[idx];
    totales.utilidad_operativa[idx] =
      totales.margen_contribucion[idx] - totales.gastos_indirectos[idx];

    // Sin ingresos no hay porcentaje: null, nunca 0% por división por cero.
    if (totales.ingresos[idx] > 0) {
      totales.margen_contribucion_pct[idx] =
        (totales.margen_contribucion[idx] / totales.ingresos[idx]) * 100;
      totales.utilidad_operativa_pct[idx] =
        (totales.utilidad_operativa[idx] / totales.ingresos[idx]) * 100;
    }
  });

  // ── Advertencias de datos ───────────────────────────────────────────────
  const pendientes = gastosVista.filter((g) => !esConfirmado(g));
  const advPendientes = advertenciaPendientes(
    pendientes.reduce((s, g) => s + g.valor, 0),
    pendientes.length
  );
  if (advPendientes) advertencias.push(advPendientes);

  const sinCategoria = gastosSinCategoria(gastosConfirmados);
  if (sinCategoria.cantidad > 0) {
    advertencias.push({
      codigo: 'gastos_sin_categoria',
      severidad: 'warning',
      mensaje: `${sinCategoria.cantidad} gastos confirmados no tienen categoría y aparecen agrupados como «Sin categoría».`,
      valor: sinCategoria.total,
    });
  }

  if (modo === 'cosecha' && alcance.incluyeAguacate) {
    const huerfanos = ingresosVista.filter((i) => !i.cosecha || !ETIQUETA_COSECHA.test(i.cosecha));
    if (huerfanos.length > 0) {
      advertencias.push({
        codigo: 'cosecha_sin_etiqueta',
        severidad: 'warning',
        mensaje:
          `${huerfanos.length} ingresos de aguacate no tienen una etiqueta de cosecha válida y quedan ` +
          `fuera de esta vista. Revísalos en Finanzas → Ingresos.`,
        valor: huerfanos.reduce((s, i) => s + i.valor, 0),
      });
    }
  }

  if (datos.truncado) {
    advertencias.push({
      codigo: 'datos_truncados',
      severidad: 'warning',
      mensaje: 'La consulta alcanzó el límite de filas y el reporte puede estar incompleto.',
    });
  }

  // ── Ensamblaje del array plano de líneas ────────────────────────────────
  const lineas: LineaPyG[] = [];

  lineas.push({
    id: 'total_ingresos',
    nivel: 0,
    tipo: 'subtotal',
    etiqueta: 'INGRESOS',
    valores: totales.ingresos.map(redondearPesos),
    esResta: false,
    formato: 'moneda',
  });
  lineas.push(...acumulador.detalleOrdenado('ing_'));

  lineas.push({
    id: 'total_directos',
    nivel: 0,
    tipo: 'subtotal',
    etiqueta: 'COSTOS DIRECTOS',
    valores: totales.costos_directos.map(redondearPesos),
    esResta: true,
    formato: 'moneda',
  });
  lineas.push(...acumulador.detalleOrdenado('dir_'));

  lineas.push({
    id: 'margen_contribucion',
    nivel: 0,
    tipo: 'resultado',
    etiqueta: 'MARGEN DE CONTRIBUCIÓN',
    valores: totales.margen_contribucion.map(redondearPesos),
    esResta: false,
    formato: 'moneda',
  });
  lineas.push({
    id: 'margen_contribucion_pct',
    nivel: 1,
    tipo: 'indicador',
    etiqueta: '% sobre ingresos',
    valores: totales.margen_contribucion_pct.map((v) => v ?? 0),
    sinDato: totales.margen_contribucion_pct.map((v) => v == null),
    esResta: false,
    formato: 'porcentaje',
  });

  lineas.push({
    id: 'total_indirectos',
    nivel: 0,
    tipo: 'subtotal',
    etiqueta: 'GASTOS INDIRECTOS',
    valores: totales.gastos_indirectos.map(redondearPesos),
    esResta: true,
    formato: 'moneda',
  });
  lineas.push(...acumulador.detalleOrdenado('ind_'));

  lineas.push({
    id: 'utilidad_operativa',
    nivel: 0,
    tipo: 'resultado',
    etiqueta: 'UTILIDAD OPERATIVA',
    valores: totales.utilidad_operativa.map(redondearPesos),
    esResta: false,
    formato: 'moneda',
  });
  lineas.push({
    id: 'utilidad_operativa_pct',
    nivel: 1,
    tipo: 'indicador',
    etiqueta: '% sobre ingresos',
    valores: totales.utilidad_operativa_pct.map((v) => v ?? 0),
    sinDato: totales.utilidad_operativa_pct.map((v) => v == null),
    esResta: false,
    formato: 'porcentaje',
  });

  lineas.push(...construirIndicadores(vista, periodos, totales, unidades, kilosGanado, costeo, inventarioInicial));

  return {
    version: 2,
    modo,
    vista,
    vista_nombre: alcance.nombreVista,
    anio: datos.anio,
    periodos,
    lineas,
    totales,
    advertencias,
  };
}

// ── Indicadores unitarios por vista ─────────────────────────────────────────

function construirIndicadores(
  vista: VistaReporte,
  periodos: PeriodoDef[],
  totales: ReportePyG['totales'],
  unidades: number[],
  kilosGanado: number[],
  costeo: ReturnType<typeof costearVentasGanado> | null,
  inventarioInicial: ReturnType<typeof leerInventarioInicial>
): LineaPyG[] {
  if (vista === 'global') return [];

  const n = periodos.length;
  const lineas: LineaPyG[] = [];
  const seguro = (num: number, den: number) => (den > 0 ? num / den : 0);

  const etiquetas: Record<Exclude<VistaReporte, 'global'>, { unidad: string; precio: string; costo: string }> = {
    aguacate: {
      unidad: 'Kilos vendidos',
      precio: 'Precio promedio por kilo',
      costo: 'Costo por kilo vendido',
    },
    hato: {
      unidad: 'Litros vendidos',
      precio: 'Precio promedio por litro',
      costo: 'Costo por litro',
    },
    ganado: {
      unidad: 'Cabezas vendidas',
      precio: 'Precio promedio por kilo',
      costo: 'Margen por cabeza vendida',
    },
  };
  const et = etiquetas[vista];

  lineas.push({
    id: 'ind_seccion',
    nivel: 0,
    tipo: 'seccion',
    etiqueta: 'INDICADORES',
    valores: new Array(n).fill(0),
    esResta: false,
    formato: 'unidades',
  });

  lineas.push({
    id: 'ind_unidades',
    padre_id: 'ind_seccion',
    nivel: 1,
    tipo: 'indicador',
    etiqueta: et.unidad,
    valores: unidades.map((u) => Math.round(u)),
    esResta: false,
    formato: 'unidades',
  });

  // El precio del ganado se mide por kilo pagado; el de aguacate y hato, por
  // la unidad vendida (kilos / litros).
  const denominadorPrecio = vista === 'ganado' ? kilosGanado : unidades;

  lineas.push({
    id: 'ind_precio',
    padre_id: 'ind_seccion',
    nivel: 1,
    tipo: 'indicador',
    etiqueta: et.precio,
    valores: periodos.map((_, i) => Math.round(seguro(totales.ingresos[i], denominadorPrecio[i]))),
    sinDato: periodos.map((_, i) => denominadorPrecio[i] <= 0),
    esResta: false,
    formato: 'moneda',
  });

  lineas.push({
    id: 'ind_costo',
    padre_id: 'ind_seccion',
    nivel: 1,
    tipo: 'indicador',
    etiqueta: et.costo,
    valores: periodos.map((_, i) =>
      vista === 'ganado'
        ? Math.round(seguro(totales.margen_contribucion[i], unidades[i]))
        : Math.round(
            seguro(totales.costos_directos[i] + totales.gastos_indirectos[i], unidades[i])
          )
    ),
    // Sin unidades vendidas no hay costo unitario que reportar.
    sinDato: periodos.map((_, i) => unidades[i] <= 0),
    esResta: false,
    formato: 'moneda',
  });

  // Recordatorio de que la plata del ganado no desapareció: está caminando.
  if (vista === 'ganado' && costeo) {
    lineas.push({
      id: 'ind_inventario_ganado',
      padre_id: 'ind_seccion',
      nivel: 1,
      tipo: 'indicador',
      etiqueta: 'Inventario de semovientes al cierre',
      valores: periodos.map((p) =>
        Math.round(valorInventarioAFecha(costeo, p.egresos.hasta, inventarioInicial).valor)
      ),
      esResta: false,
      formato: 'moneda',
    });
  }

  return lineas;
}
