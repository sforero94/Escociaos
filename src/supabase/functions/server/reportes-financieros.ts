// reportes-financieros.ts — port del motor de P&G y Flujo de Caja para Esco.
//
// ¿Por qué una copia y no un import? `chat.tsx` corre en Deno y no puede
// importar a través de la frontera del árbol de despliegue: `src/utils/` no
// existe dentro del bundle de la edge function. Mismo motivo y mismo patrón
// que `priorizacion-scouting.ts`.
//
// CONTRA-DERIVA: `src/__tests__/reportesFinancierosParidad.test.ts` alimenta
// ESTE módulo y el del frontend (`src/utils/calculosPyG.ts`,
// `calculosFlujoCaja.ts`) con los mismos datos y exige que los totales
// coincidan. Si tocas la lógica de un lado sin el otro, ese test falla.
//
// Se porta solo lo que Esco necesita — los NÚMEROS. El array plano de líneas,
// el contrato del PDF y el expandir/colapsar se quedan en el frontend.
//
// Reglas contables (aprobadas por el dueño, ver docs/plan_reportes_finanzas.md):
//   • Solo gastos con estado 'Confirmado'.
//   • Comprar ganado NO es gasto: es inventario. Solo el costo de las cabezas
//     vendidas entra al P&G, a promedio ponderado móvil POR CABEZA.
//   • Cosecha: Traviesa N ← egresos ene–jun de N; Principal N ← jul–dic de N−1.
//   • Sin prorrateo entre negocios.

export type VistaReporte = 'global' | 'aguacate' | 'ganado' | 'hato';
export type ModoReporte = 'trimestres' | 'cosecha';
export type TipoCosto = 'directo' | 'indirecto';

export const NEGOCIO_AGUACATE = 'Aguacate Hass';
export const NEGOCIO_GANADO = 'Ganado';
export const NEGOCIO_HATO = 'Hato Lechero';

/** Ver `DESFASE_ANIO_PRINCIPAL` en src/utils/periodosReporte.ts. */
export const DESFASE_ANIO_PRINCIPAL = -1;

export const MESES_LABEL = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

// ── Entrada ─────────────────────────────────────────────────────────────────

export interface NegocioRow {
  id: string;
  nombre: string;
}

export interface IngresoRow {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number;
  categoria_id: string | null;
  categoria_nombre: string | null;
  cosecha: string | null;
  cantidad: number | null;
}

export interface GastoRow {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number;
  estado: string | null;
  categoria_id: string | null;
  categoria_nombre: string | null;
  categoria_tipo_costo: TipoCosto | null;
  concepto_tipo_costo: TipoCosto | null;
}

export interface GanadoRow {
  id: string;
  fecha: string;
  tipo: 'compra' | 'venta';
  cantidad_cabezas: number;
  kilos_pagados: number | null;
  valor_total: number;
}

export interface DatosReportes {
  anio: number;
  negocios: NegocioRow[];
  ingresos: IngresoRow[];
  gastos: GastoRow[];
  /** Histórico COMPLETO: el costo promedio móvil es path-dependent. */
  ganado: GanadoRow[];
  parametros: { clave: string; anio: number | null; valor: number }[];
}

export interface PeriodoDef {
  key: string;
  label: string;
  egresos: { desde: string; hasta: string };
  ingresos: { modo: 'fecha' | 'cosecha'; desde?: string; hasta?: string; etiqueta?: string };
  descripcion: string;
}

// ── Fechas (corte de string, nunca new Date()) ──────────────────────────────

export function mesDeFecha(fecha: string): number {
  return parseInt(fecha.substring(5, 7), 10);
}

export function anioDeFecha(fecha: string): number {
  return parseInt(fecha.substring(0, 4), 10);
}

export function fechaEnRango(fecha: string, desde: string, hasta: string): boolean {
  return fecha >= desde && fecha <= hasta;
}

function ultimoDia(anio: number, mes: number): string {
  return String(new Date(anio, mes, 0).getDate()).padStart(2, '0');
}

export function periodosTrimestrales(anio: number): PeriodoDef[] {
  const defs = [
    { key: 'Q1', label: 'Q1', mesFinal: 3 },
    { key: 'Q1-Q2', label: 'Q1-Q2', mesFinal: 6 },
    { key: 'Q1-Q3', label: 'Q1-Q3', mesFinal: 9 },
    { key: 'ANIO', label: `Año ${anio}`, mesFinal: 12 },
  ];
  return defs.map(({ key, label, mesFinal }) => {
    const rango = {
      desde: `${anio}-01-01`,
      hasta: `${anio}-${String(mesFinal).padStart(2, '0')}-${ultimoDia(anio, mesFinal)}`,
    };
    return {
      key,
      label,
      egresos: rango,
      ingresos: { modo: 'fecha' as const, desde: rango.desde, hasta: rango.hasta },
      descripcion: `Acumulado enero–${MESES_LABEL[mesFinal - 1].toLowerCase()} ${anio}`,
    };
  });
}

export function periodosCosecha(anio: number): PeriodoDef[] {
  const anioPrincipal = anio + DESFASE_ANIO_PRINCIPAL;
  return [
    {
      key: `Principal ${anio}`,
      label: `Principal ${anio}`,
      egresos: { desde: `${anioPrincipal}-07-01`, hasta: `${anioPrincipal}-12-31` },
      ingresos: { modo: 'cosecha', etiqueta: `Principal ${anio}` },
      descripcion: `Ventas «Principal ${anio}» · egresos jul–dic ${anioPrincipal}`,
    },
    {
      key: `Traviesa ${anio}`,
      label: `Traviesa ${anio}`,
      egresos: { desde: `${anio}-01-01`, hasta: `${anio}-06-30` },
      ingresos: { modo: 'cosecha', etiqueta: `Traviesa ${anio}` },
      descripcion: `Ventas «Traviesa ${anio}» · egresos ene–jun ${anio}`,
    },
  ];
}

export function construirPeriodos(anio: number, modo: ModoReporte): PeriodoDef[] {
  return modo === 'cosecha' ? periodosCosecha(anio) : periodosTrimestrales(anio);
}

// ── Clasificación de costos ─────────────────────────────────────────────────

export function resolverTipoCosto(g: Pick<GastoRow, 'categoria_tipo_costo' | 'concepto_tipo_costo'>): TipoCosto {
  return g.concepto_tipo_costo ?? g.categoria_tipo_costo ?? 'indirecto';
}

export function esConfirmado(g: Pick<GastoRow, 'estado'>): boolean {
  return g.estado === 'Confirmado';
}

// ── Costo de venta del ganado ───────────────────────────────────────────────

export interface InventarioInicialGanado {
  cabezas: number;
  costoPorCabeza: number;
}

export interface ResultadoCosteoGanado {
  ventas: { fecha: string; cabezas: number; cogs: number }[];
  historial: { fecha: string; cabezas: number; valorInventario: number }[];
  cabezasFinales: number;
  valorInventarioFinal: number;
  cabezasSinRespaldo: number;
  promedioCompras: number;
  advertencias: string[];
}

export function promedioPonderadoCompras(transacciones: GanadoRow[]): number {
  let cabezas = 0;
  let valor = 0;
  for (const t of transacciones) {
    if (t.tipo !== 'compra') continue;
    cabezas += t.cantidad_cabezas;
    valor += t.valor_total;
  }
  return cabezas > 0 ? valor / cabezas : 0;
}

export function leerInventarioInicial(
  parametros: { clave: string; valor: number }[]
): InventarioInicialGanado | null {
  const cabezas = parametros.find((p) => p.clave === 'cabezas_inventario_inicial')?.valor;
  const costo = parametros.find((p) => p.clave === 'costo_cabeza_inventario_inicial')?.valor;
  if (cabezas == null || costo == null || cabezas <= 0) return null;
  return { cabezas, costoPorCabeza: costo };
}

export function costearVentasGanado(
  transacciones: GanadoRow[],
  inventarioInicial: InventarioInicialGanado | null
): ResultadoCosteoGanado {
  const promedioCompras = promedioPonderadoCompras(transacciones);
  const advertencias: string[] = [];

  let cabezas = inventarioInicial?.cabezas ?? 0;
  let valorInventario = (inventarioInicial?.cabezas ?? 0) * (inventarioInicial?.costoPorCabeza ?? 0);

  const ventas: ResultadoCosteoGanado['ventas'] = [];
  const historial: ResultadoCosteoGanado['historial'] = [];
  let cabezasSinRespaldo = 0;

  const ordenadas = [...transacciones].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  for (const t of ordenadas) {
    if (t.tipo === 'compra') {
      cabezas += t.cantidad_cabezas;
      valorInventario += t.valor_total;
    } else {
      const costoUnitario = cabezas > 0 ? valorInventario / cabezas : promedioCompras;
      const conRespaldo = Math.min(t.cantidad_cabezas, cabezas);
      const faltante = t.cantidad_cabezas - conRespaldo;
      const cogs = conRespaldo * costoUnitario + faltante * promedioCompras;

      cabezas -= conRespaldo;
      valorInventario = Math.max(0, valorInventario - conRespaldo * costoUnitario);
      cabezasSinRespaldo += faltante;

      ventas.push({ fecha: t.fecha, cabezas: t.cantidad_cabezas, cogs });
    }
    historial.push({ fecha: t.fecha, cabezas, valorInventario });
  }

  if (cabezasSinRespaldo > 0) {
    advertencias.push(
      inventarioInicial
        ? `Se vendieron ${cabezasSinRespaldo} cabezas mas de las que el inventario registrado respalda; se costearon al promedio de compras.`
        : `No hay inventario inicial de ganado cargado: ${cabezasSinRespaldo} cabezas vendidas se costearon al promedio de las compras registradas (${Math.round(promedioCompras)} por cabeza). El costo de venta es aproximado.`
    );
  }

  return {
    ventas,
    historial,
    cabezasFinales: cabezas,
    valorInventarioFinal: valorInventario,
    cabezasSinRespaldo,
    promedioCompras,
    advertencias,
  };
}

export function valorInventarioAFecha(
  resultado: ResultadoCosteoGanado,
  hasta: string,
  inventarioInicial: InventarioInicialGanado | null
): { cabezas: number; valor: number } {
  let ultimo: { fecha: string; cabezas: number; valorInventario: number } | null = null;
  for (const s of resultado.historial) {
    if (s.fecha > hasta) break;
    ultimo = s;
  }
  if (!ultimo) {
    return {
      cabezas: inventarioInicial?.cabezas ?? 0,
      valor: (inventarioInicial?.cabezas ?? 0) * (inventarioInicial?.costoPorCabeza ?? 0),
    };
  }
  return { cabezas: ultimo.cabezas, valor: ultimo.valorInventario };
}

// ── Alcance ─────────────────────────────────────────────────────────────────

export interface Alcance {
  negocioIds: Set<string>;
  incluyeGanado: boolean;
  nombreVista: string;
  nombrePorNegocio: Map<string, string>;
}

export function resolverAlcance(datos: DatosReportes, vista: VistaReporte): Alcance {
  const nombrePorNegocio = new Map(datos.negocios.map((n) => [n.id, n.nombre]));
  const idPorNombre = new Map(datos.negocios.map((n) => [n.nombre, n.id]));

  if (vista === 'global') {
    return {
      negocioIds: new Set(datos.negocios.map((n) => n.id)),
      incluyeGanado: true,
      nombreVista: 'Global (todos los negocios)',
      nombrePorNegocio,
    };
  }

  const nombre =
    vista === 'aguacate' ? NEGOCIO_AGUACATE : vista === 'ganado' ? NEGOCIO_GANADO : NEGOCIO_HATO;
  const id = idPorNombre.get(nombre);

  return {
    negocioIds: new Set(id ? [id] : []),
    incluyeGanado: vista === 'ganado',
    nombreVista: nombre,
    nombrePorNegocio,
  };
}

/**
 * Defensa contra el ganado contabilizado dos veces (una en
 * `fin_transacciones_ganado` y otra como fila espejo en fin_ingresos/fin_gastos).
 */
function detectarDuplicadosGanado(datos: DatosReportes): {
  ingresosExcluidos: Set<string>;
  gastosExcluidos: Set<string>;
} {
  const ingresosExcluidos = new Set<string>();
  const gastosExcluidos = new Set<string>();

  for (const t of datos.ganado) {
    if (t.tipo === 'venta') {
      for (const i of datos.ingresos) {
        if (i.fecha === t.fecha && Math.abs(i.valor - t.valor_total) < 1 && !ingresosExcluidos.has(i.id)) {
          ingresosExcluidos.add(i.id);
          break;
        }
      }
    } else {
      for (const g of datos.gastos) {
        if (g.fecha === t.fecha && Math.abs(g.valor - t.valor_total) < 1 && !gastosExcluidos.has(g.id)) {
          gastosExcluidos.add(g.id);
          break;
        }
      }
    }
  }
  return { ingresosExcluidos, gastosExcluidos };
}

// ── P&G ─────────────────────────────────────────────────────────────────────

export interface LineaResumen {
  etiqueta: string;
  valores: number[];
}

export interface ResumenPyG {
  vista: VistaReporte;
  vista_nombre: string;
  anio: number;
  modo: ModoReporte;
  periodos: { key: string; label: string; descripcion: string }[];
  totales: {
    ingresos: number[];
    costos_directos: number[];
    margen_contribucion: number[];
    gastos_indirectos: number[];
    utilidad_operativa: number[];
    margen_contribucion_pct: (number | null)[];
    utilidad_operativa_pct: (number | null)[];
  };
  ingresos_por_linea: LineaResumen[];
  costos_directos_por_categoria: LineaResumen[];
  gastos_indirectos_por_categoria: LineaResumen[];
  indicadores: LineaResumen[];
  advertencias: string[];
}

function ordenarPorTotal(mapa: Map<string, number[]>): LineaResumen[] {
  return [...mapa.entries()]
    .map(([etiqueta, valores]) => ({ etiqueta, valores }))
    .sort((a, b) => b.valores.reduce((s, v) => s + v, 0) - a.valores.reduce((s, v) => s + v, 0));
}

function acumular(mapa: Map<string, number[]>, clave: string, idx: number, n: number, valor: number): void {
  let arr = mapa.get(clave);
  if (!arr) {
    arr = new Array(n).fill(0);
    mapa.set(clave, arr);
  }
  arr[idx] += valor;
}

export function construirResumenPyG(
  datos: DatosReportes,
  periodos: PeriodoDef[],
  vista: VistaReporte,
  modo: ModoReporte
): ResumenPyG {
  const n = periodos.length;
  const alcance = resolverAlcance(datos, vista);
  const advertencias: string[] = [];
  const dup = detectarDuplicadosGanado(datos);

  const ingresosVista = datos.ingresos.filter(
    (i) => alcance.negocioIds.has(i.negocio_id) && !dup.ingresosExcluidos.has(i.id)
  );
  const gastosVista = datos.gastos.filter(
    (g) => alcance.negocioIds.has(g.negocio_id) && !dup.gastosExcluidos.has(g.id)
  );
  const gastosConfirmados = gastosVista.filter(esConfirmado);

  const inventarioInicial = leerInventarioInicial(datos.parametros);
  const costeo = alcance.incluyeGanado ? costearVentasGanado(datos.ganado, inventarioInicial) : null;
  if (costeo) advertencias.push(...costeo.advertencias);

  const totales = {
    ingresos: new Array(n).fill(0),
    costos_directos: new Array(n).fill(0),
    margen_contribucion: new Array(n).fill(0),
    gastos_indirectos: new Array(n).fill(0),
    utilidad_operativa: new Array(n).fill(0),
    margen_contribucion_pct: new Array(n).fill(null) as (number | null)[],
    utilidad_operativa_pct: new Array(n).fill(null) as (number | null)[],
  };

  const mapaIngresos = new Map<string, number[]>();
  const mapaDirectos = new Map<string, number[]>();
  const mapaIndirectos = new Map<string, number[]>();
  const unidades = new Array(n).fill(0);
  const kilosGanado = new Array(n).fill(0);
  const cabezasVendidas = new Array(n).fill(0);

  periodos.forEach((periodo, idx) => {
    // INGRESOS
    const ingresosPeriodo =
      periodo.ingresos.modo === 'cosecha'
        ? ingresosVista.filter((i) => i.cosecha === periodo.ingresos.etiqueta)
        : ingresosVista.filter((i) =>
            fechaEnRango(i.fecha, periodo.ingresos.desde ?? '', periodo.ingresos.hasta ?? '')
          );

    for (const ing of ingresosPeriodo) {
      const etiqueta =
        vista === 'global'
          ? alcance.nombrePorNegocio.get(ing.negocio_id) ?? 'Sin negocio'
          : ing.categoria_nombre ?? 'Sin categoria';
      acumular(mapaIngresos, etiqueta, idx, n, ing.valor);
      totales.ingresos[idx] += ing.valor;

      if (vista === 'aguacate') unidades[idx] += ing.cantidad ?? 0;
      if (vista === 'hato' && /leche/i.test(ing.categoria_nombre ?? '')) {
        unidades[idx] += ing.cantidad ?? 0;
      }
    }

    // Venta de ganado: fuente propia, nunca fin_ingresos
    if (alcance.incluyeGanado) {
      let ventaGanado = 0;
      for (const t of datos.ganado) {
        if (t.tipo !== 'venta') continue;
        if (!fechaEnRango(t.fecha, periodo.egresos.desde, periodo.egresos.hasta)) continue;
        ventaGanado += t.valor_total;
        cabezasVendidas[idx] += t.cantidad_cabezas;
        kilosGanado[idx] += t.kilos_pagados ?? 0;
      }
      if (ventaGanado > 0) {
        acumular(
          mapaIngresos,
          vista === 'global' ? 'Ganado - venta de animales' : 'Venta de ganado',
          idx,
          n,
          ventaGanado
        );
        totales.ingresos[idx] += ventaGanado;
      }
      if (vista === 'ganado') unidades[idx] += cabezasVendidas[idx];
    }

    // GASTOS
    for (const g of gastosConfirmados) {
      if (!fechaEnRango(g.fecha, periodo.egresos.desde, periodo.egresos.hasta)) continue;
      const etiqueta = g.categoria_nombre ?? 'Sin categoria';
      if (resolverTipoCosto(g) === 'directo') {
        acumular(mapaDirectos, etiqueta, idx, n, g.valor);
        totales.costos_directos[idx] += g.valor;
      } else {
        acumular(mapaIndirectos, etiqueta, idx, n, g.valor);
        totales.gastos_indirectos[idx] += g.valor;
      }
    }

    // Costo de venta del ganado
    if (costeo) {
      let cogs = 0;
      for (const v of costeo.ventas) {
        if (fechaEnRango(v.fecha, periodo.egresos.desde, periodo.egresos.hasta)) cogs += v.cogs;
      }
      if (cogs > 0) {
        acumular(mapaDirectos, 'Costo de venta de ganado', idx, n, cogs);
        totales.costos_directos[idx] += cogs;
      }
    }

    totales.margen_contribucion[idx] = totales.ingresos[idx] - totales.costos_directos[idx];
    totales.utilidad_operativa[idx] = totales.margen_contribucion[idx] - totales.gastos_indirectos[idx];

    if (totales.ingresos[idx] > 0) {
      totales.margen_contribucion_pct[idx] = (totales.margen_contribucion[idx] / totales.ingresos[idx]) * 100;
      totales.utilidad_operativa_pct[idx] = (totales.utilidad_operativa[idx] / totales.ingresos[idx]) * 100;
    }
  });

  // Advertencias de datos
  const pendientes = gastosVista.filter((g) => !esConfirmado(g));
  if (pendientes.length > 0) {
    const total = pendientes.reduce((s, g) => s + g.valor, 0);
    advertencias.push(
      `${pendientes.length} gastos pendientes por confirmar (${Math.round(total)}) NO estan incluidos.`
    );
  }
  if (modo === 'cosecha' && vista === 'aguacate') {
    const huerfanos = ingresosVista.filter((i) => !i.cosecha || !/^(Principal|Traviesa) \d{4}$/.test(i.cosecha));
    if (huerfanos.length > 0) {
      const total = huerfanos.reduce((s, i) => s + i.valor, 0);
      advertencias.push(
        `${huerfanos.length} ingresos de aguacate sin etiqueta de cosecha valida (${Math.round(total)}) quedan fuera de esta vista.`
      );
    }
  }

  // Indicadores unitarios
  const indicadores: LineaResumen[] = [];
  const seguro = (num: number, den: number) => (den > 0 ? Math.round(num / den) : 0);

  if (vista === 'aguacate' || vista === 'hato') {
    const unidad = vista === 'aguacate' ? 'Kilos vendidos' : 'Litros vendidos';
    const precio = vista === 'aguacate' ? 'Precio promedio por kilo' : 'Precio promedio por litro';
    const costo = vista === 'aguacate' ? 'Costo por kilo vendido' : 'Costo por litro';
    indicadores.push({ etiqueta: unidad, valores: unidades.map((u) => Math.round(u)) });
    indicadores.push({ etiqueta: precio, valores: periodos.map((_, i) => seguro(totales.ingresos[i], unidades[i])) });
    indicadores.push({
      etiqueta: costo,
      valores: periodos.map((_, i) => seguro(totales.costos_directos[i] + totales.gastos_indirectos[i], unidades[i])),
    });
  } else if (vista === 'ganado') {
    indicadores.push({ etiqueta: 'Cabezas vendidas', valores: cabezasVendidas.map((c) => Math.round(c)) });
    indicadores.push({
      etiqueta: 'Precio promedio por kilo',
      valores: periodos.map((_, i) => seguro(totales.ingresos[i], kilosGanado[i])),
    });
    indicadores.push({
      etiqueta: 'Margen por cabeza vendida',
      valores: periodos.map((_, i) => seguro(totales.margen_contribucion[i], cabezasVendidas[i])),
    });
    if (costeo) {
      indicadores.push({
        etiqueta: 'Inventario de semovientes al cierre',
        valores: periodos.map((p) =>
          Math.round(valorInventarioAFecha(costeo, p.egresos.hasta, inventarioInicial).valor)
        ),
      });
    }
  }

  return {
    vista,
    vista_nombre: alcance.nombreVista,
    anio: datos.anio,
    modo,
    periodos: periodos.map((p) => ({ key: p.key, label: p.label, descripcion: p.descripcion })),
    totales,
    ingresos_por_linea: ordenarPorTotal(mapaIngresos),
    costos_directos_por_categoria: ordenarPorTotal(mapaDirectos),
    gastos_indirectos_por_categoria: ordenarPorTotal(mapaIndirectos),
    indicadores,
    advertencias,
  };
}

// ── Flujo de caja ───────────────────────────────────────────────────────────

export interface ResumenFlujoCaja {
  vista: VistaReporte;
  vista_nombre: string;
  anio: number;
  meses: string[];
  entradas: number[];
  salidas: number[];
  flujo_neto: number[];
  flujo_acumulado: number[];
  saldo_inicial: number;
  saldo_inicial_es_supuesto: boolean;
  entradas_por_linea: LineaResumen[];
  salidas_por_linea: LineaResumen[];
  advertencias: string[];
}

export function construirResumenFlujoCaja(
  datos: DatosReportes,
  vista: VistaReporte
): ResumenFlujoCaja {
  const anio = datos.anio;
  const alcance = resolverAlcance(datos, vista);
  const dup = detectarDuplicadosGanado(datos);
  const advertencias: string[] = [];

  const entradas = new Array(12).fill(0);
  const salidas = new Array(12).fill(0);
  const mapaEntradas = new Map<string, number[]>();
  const mapaSalidas = new Map<string, number[]>();

  const enElAnio = (f: string) => anioDeFecha(f) === anio;

  for (const ing of datos.ingresos) {
    if (!enElAnio(ing.fecha)) continue;
    if (!alcance.negocioIds.has(ing.negocio_id)) continue;
    if (dup.ingresosExcluidos.has(ing.id)) continue;
    const mes = mesDeFecha(ing.fecha) - 1;
    const etiqueta =
      vista === 'global'
        ? alcance.nombrePorNegocio.get(ing.negocio_id) ?? 'Sin negocio'
        : ing.categoria_nombre ?? 'Sin categoria';
    acumular(mapaEntradas, etiqueta, mes, 12, ing.valor);
    entradas[mes] += ing.valor;
  }

  const gastosVista = datos.gastos.filter(
    (g) => alcance.negocioIds.has(g.negocio_id) && !dup.gastosExcluidos.has(g.id)
  );

  for (const g of gastosVista) {
    if (!enElAnio(g.fecha) || !esConfirmado(g)) continue;
    const mes = mesDeFecha(g.fecha) - 1;
    acumular(mapaSalidas, g.categoria_nombre ?? 'Sin categoria', mes, 12, g.valor);
    salidas[mes] += g.valor;
  }

  if (alcance.incluyeGanado) {
    for (const t of datos.ganado) {
      if (!enElAnio(t.fecha)) continue;
      const mes = mesDeFecha(t.fecha) - 1;
      if (t.tipo === 'venta') {
        acumular(mapaEntradas, 'Venta de ganado', mes, 12, t.valor_total);
        entradas[mes] += t.valor_total;
      } else {
        acumular(mapaSalidas, 'Compra de ganado (inversion en inventario)', mes, 12, t.valor_total);
        salidas[mes] += t.valor_total;
      }
    }
  }

  const param =
    datos.parametros.find((p) => p.clave === 'saldo_inicial_caja' && p.anio === anio) ??
    datos.parametros.find((p) => p.clave === 'saldo_inicial_caja' && p.anio == null);
  const saldoInicial = param ? param.valor : 0;

  const flujoNeto = entradas.map((e, i) => e - salidas[i]);
  const flujoAcumulado: number[] = [];
  let corrido = saldoInicial;
  for (const neto of flujoNeto) {
    corrido += neto;
    flujoAcumulado.push(corrido);
  }

  const pendientes = gastosVista.filter((g) => enElAnio(g.fecha) && !esConfirmado(g));
  if (pendientes.length > 0) {
    const total = pendientes.reduce((s, g) => s + g.valor, 0);
    advertencias.push(`${pendientes.length} gastos pendientes (${Math.round(total)}) NO estan incluidos.`);
  }
  advertencias.push(
    'Movimientos por fecha de registro; el sistema no almacena fecha de pago. No es una conciliacion bancaria.'
  );
  if (alcance.incluyeGanado) {
    advertencias.push(
      'La compra de ganado aparece como salida de caja pero NO es gasto en el P&G: es inversion en inventario.'
    );
  }

  return {
    vista,
    vista_nombre: alcance.nombreVista,
    anio,
    meses: MESES_LABEL,
    entradas,
    salidas,
    flujo_neto: flujoNeto,
    flujo_acumulado: flujoAcumulado,
    saldo_inicial: saldoInicial,
    saldo_inicial_es_supuesto: !param,
    entradas_por_linea: ordenarPorTotal(mapaEntradas),
    salidas_por_linea: ordenarPorTotal(mapaSalidas),
    advertencias,
  };
}
