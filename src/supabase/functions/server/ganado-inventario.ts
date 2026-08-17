// ganado-inventario.ts — agregación pura del inventario vivo de ganado
// (issue #51) para el tool get_ganado_inventory de Esco.
// Sin imports de Deno para que sea testeable desde Vitest.
//
// v2 (docs/plan_ganado_inventario_v2_implementacion.md §7.2): agrega lote y
// etapa, excluye traslados de variacion_30_dias (B-γ, mismo criterio que
// calculosGanado.ts), lee el último peso de gan_pesos_historico (nunca de
// gan_inventario.peso_promedio_kg — §3.4 del plan) y agrupa los movimientos
// recientes con el MISMO contrato que la UI (§3.3): traslados N→M y
// conteos físicos por grupo_id, compras/ventas repartidas por
// transaccion_ganado_id. Este archivo NO importa de calculosGanado.ts (los
// dos árboles de edge function no cruzan esa frontera — mismo motivo que
// reportes-financieros.ts es un port a mano, no un import).

export interface GanUbicacionRow {
  id: string;
  nombre: string;
}

export interface GanFincaRow {
  id: string;
  nombre: string;
  ubicacion_id: string | null;
  hectareas: number | string | null;
  activa: boolean;
}

export interface GanLoteRow {
  id: string;
  finca_id: string;
  nombre: string;
  activo: boolean;
}

export interface GanPotreroRow {
  id: string;
  nombre: string;
  finca_id: string;
  activo: boolean;
  lote_id: string | null;
  /** terneros | levante | ceba | repele | null (sin clasificar). */
  etapa: string | null;
}

export interface GanInventarioRow {
  potrero_id: string;
  novillos: number;
  toros: number;
  peso_promedio_kg: number | string | null;
  updated_at?: string;
}

/** Fila de gan_pesos_historico — fuente real del "último peso" (§3.4 del plan). */
export interface GanPesoHistoricoRow {
  potrero_id: string;
  fecha: string;
  peso_promedio_kg: number | string;
}

export interface GanMovimientoRow {
  id?: string;
  tipo: string;
  estado?: string;
  fecha: string;
  novillos_delta: number;
  toros_delta: number;
  potrero_origen_id?: string | null;
  potrero_destino_id?: string | null;
  peso_promedio_kg?: number | string | null;
  notas?: string | null;
  transaccion_ganado_id?: string | null;
  /** Agrupa traslados N→M y conteos físicos (migración 098). NULL = fila suelta. */
  grupo_id?: string | null;
}

export type EtapaBucketRow = 'terneros' | 'levante' | 'ceba' | 'repele' | 'sin_clasificar';

const ORDEN_ETAPAS: EtapaBucketRow[] = ['terneros', 'levante', 'ceba', 'repele', 'sin_clasificar'];

function etapaVacia(): Record<EtapaBucketRow, number> {
  return { terneros: 0, levante: 0, ceba: 0, repele: 0, sin_clasificar: 0 };
}

function bucketDe(etapa: string | null | undefined): EtapaBucketRow {
  return etapa === 'terneros' || etapa === 'levante' || etapa === 'ceba' || etapa === 'repele' ? etapa : 'sin_clasificar';
}

export interface GanadoInventorySummary {
  total: {
    cabezas: number;
    novillos: number;
    toros: number;
    hectareas: number;
    cabezas_por_ha: number | null;
    por_etapa: Record<EtapaBucketRow, number>;
  };
  por_ubicacion: {
    ubicacion: string;
    cabezas: number;
    novillos: number;
    toros: number;
    hectareas: number;
    cabezas_por_ha: number | null;
    por_etapa: Record<EtapaBucketRow, number>;
  }[];
  por_finca: {
    finca: string;
    ubicacion: string;
    hectareas: number;
    cabezas: number;
    novillos: number;
    toros: number;
    cabezas_por_ha: number | null;
    por_etapa: Record<EtapaBucketRow, number>;
    por_lote: {
      /** "Sin lote" cuando el potrero no tiene lote_id asignado. */
      lote: string;
      cabezas: number;
      novillos: number;
      toros: number;
      potreros: {
        potrero: string;
        etapa: EtapaBucketRow;
        novillos: number;
        toros: number;
        ultimo_peso_kg: number | null;
        ultimo_peso_fecha: string | null;
      }[];
    }[];
  }[];
  variacion_30_dias: { entradas: number; salidas: number; neto: number };
  pendientes_confirmacion: {
    total: number;
    detalle: {
      tipo: string;
      fecha: string;
      cabezas: number;
      peso_promedio_kg: number | null;
      notas: string | null;
    }[];
  };
  filtro_aplicado?: string;
}

const num = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const matches = (nombre: string, filtro?: string): boolean =>
  !filtro || nombre.toLowerCase().includes(filtro.toLowerCase());

/**
 * Construye el resumen del inventario vivo a partir de las tablas gan_*.
 * `filtroUbicacion`/`filtroFinca` son matches parciales case-insensitive;
 * los pendientes no se filtran (aún no tienen potrero asignado).
 */
export function buildGanadoInventorySummary(params: {
  ubicaciones: GanUbicacionRow[];
  fincas: GanFincaRow[];
  potreros: GanPotreroRow[];
  lotes: GanLoteRow[];
  inventario: GanInventarioRow[];
  pesos: GanPesoHistoricoRow[];
  movimientos30d: GanMovimientoRow[];
  pendientes: GanMovimientoRow[];
  filtroUbicacion?: string;
  filtroFinca?: string;
}): GanadoInventorySummary {
  const { ubicaciones, fincas, potreros, lotes, inventario, pesos, movimientos30d, pendientes, filtroUbicacion, filtroFinca } = params;

  const ubicacionDe = (f: GanFincaRow): string =>
    ubicaciones.find((u) => u.id === f.ubicacion_id)?.nombre || 'Sin ubicación';

  const fincasFiltradas = fincas.filter(
    (f) => f.activa && matches(f.nombre, filtroFinca) && matches(ubicacionDe(f), filtroUbicacion)
  );

  const invPorPotrero = new Map(inventario.map((i) => [i.potrero_id, i]));

  // Último peso por potrero: gan_inventario.peso_promedio_kg es el peso del
  // ÚLTIMO MOVIMIENTO que trajo peso (migración 045, COALESCE), NO un
  // promedio de los animales — se lee de gan_pesos_historico, la MISMA
  // fuente que usa la UI, para que no puedan discrepar (§3.4 del plan).
  const ultimoPesoPorPotrero = new Map<string, { peso: number; fecha: string }>();
  [...pesos]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .forEach((p) => {
      if (!ultimoPesoPorPotrero.has(p.potrero_id)) {
        ultimoPesoPorPotrero.set(p.potrero_id, { peso: num(p.peso_promedio_kg), fecha: p.fecha });
      }
    });

  const loteNombre = (loteId: string | null): string =>
    (loteId ? lotes.find((l) => l.id === loteId)?.nombre : undefined) || 'Sin lote';

  const porFinca = fincasFiltradas
    .map((f) => {
      const ps = potreros.filter((p) => p.activo && p.finca_id === f.id);
      const detalle = ps.map((p) => {
        const inv = invPorPotrero.get(p.id);
        const ultimoPeso = ultimoPesoPorPotrero.get(p.id);
        return {
          potrero: p.nombre,
          lote_id: p.lote_id,
          etapa: bucketDe(p.etapa),
          novillos: inv?.novillos || 0,
          toros: inv?.toros || 0,
          ultimo_peso_kg: ultimoPeso?.peso ?? null,
          ultimo_peso_fecha: ultimoPeso?.fecha ?? null,
        };
      });
      const novillos = detalle.reduce((s, d) => s + d.novillos, 0);
      const toros = detalle.reduce((s, d) => s + d.toros, 0);
      const hectareas = num(f.hectareas);

      const porLoteMap = new Map<string, typeof detalle>();
      detalle.forEach((d) => {
        const clave = d.lote_id || '__sin_lote__';
        if (!porLoteMap.has(clave)) porLoteMap.set(clave, []);
        porLoteMap.get(clave)!.push(d);
      });
      const porLote = Array.from(porLoteMap.entries())
        .map(([clave, items]) => ({
          lote: clave === '__sin_lote__' ? 'Sin lote' : loteNombre(clave),
          cabezas: items.reduce((s, d) => s + d.novillos + d.toros, 0),
          novillos: items.reduce((s, d) => s + d.novillos, 0),
          toros: items.reduce((s, d) => s + d.toros, 0),
          potreros: items.map(({ potrero, etapa, novillos: n, toros: t, ultimo_peso_kg, ultimo_peso_fecha }) => ({
            potrero,
            etapa,
            novillos: n,
            toros: t,
            ultimo_peso_kg,
            ultimo_peso_fecha,
          })),
        }))
        .sort((a, b) => (a.lote === 'Sin lote' ? 1 : b.lote === 'Sin lote' ? -1 : a.lote.localeCompare(b.lote, 'es')));

      return {
        finca: f.nombre,
        ubicacion: ubicacionDe(f),
        hectareas,
        cabezas: novillos + toros,
        novillos,
        toros,
        cabezas_por_ha: hectareas > 0 ? Math.round(((novillos + toros) / hectareas) * 10) / 10 : null,
        por_etapa: sumarPorEtapa(detalle),
        por_lote: porLote,
      };
    })
    .sort((a, b) => b.cabezas - a.cabezas);

  const porUbicacionMap = new Map<
    string,
    { cabezas: number; novillos: number; toros: number; hectareas: number; por_etapa: Record<EtapaBucketRow, number> }
  >();
  porFinca.forEach((f) => {
    const u = porUbicacionMap.get(f.ubicacion) || { cabezas: 0, novillos: 0, toros: 0, hectareas: 0, por_etapa: etapaVacia() };
    u.cabezas += f.cabezas;
    u.novillos += f.novillos;
    u.toros += f.toros;
    u.hectareas += f.hectareas;
    ORDEN_ETAPAS.forEach((e) => {
      u.por_etapa[e] += f.por_etapa[e];
    });
    porUbicacionMap.set(f.ubicacion, u);
  });

  const totalNovillos = porFinca.reduce((s, f) => s + f.novillos, 0);
  const totalToros = porFinca.reduce((s, f) => s + f.toros, 0);
  const totalHa = porFinca.reduce((s, f) => s + f.hectareas, 0);
  const totalCabezas = totalNovillos + totalToros;
  const totalPorEtapa = etapaVacia();
  porFinca.forEach((f) => {
    ORDEN_ETAPAS.forEach((e) => {
      totalPorEtapa[e] += f.por_etapa[e];
    });
  });

  // variacion_30_dias EXCLUYE traslados (B-γ): un traslado no es una
  // entrada ni una salida de la empresa, es un movimiento interno entre
  // potreros — mismo criterio que calcularVariacion en calculosGanado.ts.
  let entradas = 0;
  let salidas = 0;
  movimientos30d.forEach((m) => {
    if (m.tipo === 'traslado_entrada' || m.tipo === 'traslado_salida') return;
    const delta = (m.novillos_delta || 0) + (m.toros_delta || 0);
    if (delta > 0) entradas += delta;
    else salidas += -delta;
  });

  return {
    total: {
      cabezas: totalCabezas,
      novillos: totalNovillos,
      toros: totalToros,
      hectareas: totalHa,
      cabezas_por_ha: totalHa > 0 ? Math.round((totalCabezas / totalHa) * 10) / 10 : null,
      por_etapa: totalPorEtapa,
    },
    por_ubicacion: Array.from(porUbicacionMap.entries()).map(([ubicacion, u]) => ({
      ubicacion,
      ...u,
      cabezas_por_ha: u.hectareas > 0 ? Math.round((u.cabezas / u.hectareas) * 10) / 10 : null,
    })),
    por_finca: porFinca,
    variacion_30_dias: { entradas, salidas, neto: entradas - salidas },
    pendientes_confirmacion: {
      total: pendientes.length,
      detalle: pendientes.slice(0, 20).map((p) => ({
        tipo: p.tipo,
        fecha: p.fecha,
        cabezas: Math.abs((p.novillos_delta || 0) + (p.toros_delta || 0)),
        peso_promedio_kg: p.peso_promedio_kg != null ? num(p.peso_promedio_kg) : null,
        notas: p.notas || null,
      })),
    },
    ...(filtroUbicacion || filtroFinca
      ? { filtro_aplicado: [filtroUbicacion && `ubicación~"${filtroUbicacion}"`, filtroFinca && `finca~"${filtroFinca}"`].filter(Boolean).join(', ') }
      : {}),
  };
}

function sumarPorEtapa(items: { etapa: EtapaBucketRow; novillos: number; toros: number }[]): Record<EtapaBucketRow, number> {
  const resumen = etapaVacia();
  items.forEach((it) => {
    resumen[it.etapa] += it.novillos + it.toros;
  });
  return resumen;
}

export interface MovimientoRecienteRow {
  fecha: string;
  /** 'traslado' | 'conteo_fisico' | tipo original (compra/venta/muerte/ajuste) para eventos sueltos o repartidos. */
  tipo: string;
  novillos: number;
  toros: number;
  cabezas: number;
  potrero: string | null;
  finca: string | null;
  notas: string | null;
  grupo_id?: string | null;
  transaccion_ganado_id?: string | null;
  /** Solo en 'conteo_fisico': cuántos potreros distintos corrigió la sesión. */
  potreros_involucrados?: number;
  /** Solo en 'traslado': puntas de salida. */
  origenes?: { potrero: string | null; finca: string | null; novillos: number; toros: number }[];
  /** Solo en 'traslado' o compra/venta repartida: puntas de entrada / reparto. */
  destinos?: { potrero: string | null; finca: string | null; novillos: number; toros: number }[];
}

function cierraPorCategoria(origenes: GanMovimientoRow[], destinos: GanMovimientoRow[]): boolean {
  const suma = (arr: GanMovimientoRow[], campo: 'novillos_delta' | 'toros_delta') =>
    arr.reduce((s, m) => s + Math.abs(m[campo] || 0), 0);
  return suma(origenes, 'novillos_delta') === suma(destinos, 'novillos_delta')
    && suma(origenes, 'toros_delta') === suma(destinos, 'toros_delta');
}

/**
 * Da forma legible a los movimientos recientes para el LLM, agrupando con
 * el MISMO contrato que la UI (§3.3): traslados N→M y conteos físicos por
 * `grupo_id`, compras/ventas repartidas por `transaccion_ganado_id`. Ante
 * cualquier forma inesperada (grupo que no cierra, mezcla de tipos) degrada
 * a filas sueltas — nunca inventa un agrupamiento. Sin esto, la compra
 * repartida del 17-ago llegaba al modelo como DOS compras de 13 y 11
 * cabezas en vez de UNA de 24 (§7.2 del plan).
 */
export function renderMovimientosRecientes(
  movimientos: GanMovimientoRow[],
  potreros: GanPotreroRow[],
  fincas: GanFincaRow[],
  limit = 30
): MovimientoRecienteRow[] {
  const potreroDe = (id?: string | null) => potreros.find((p) => p.id === id) || null;
  const fincaDe = (p: GanPotreroRow | null) => (p ? fincas.find((x) => x.id === p.finca_id) || null : null);
  const puntoDe = (m: GanMovimientoRow) => {
    const p = potreroDe(m.potrero_destino_id) || potreroDe(m.potrero_origen_id);
    const f = fincaDe(p);
    return {
      potrero: p?.nombre || null,
      finca: f?.nombre || null,
      novillos: Math.abs(m.novillos_delta || 0),
      toros: Math.abs(m.toros_delta || 0),
    };
  };

  const usados = new Set<number>();
  const eventos: MovimientoRecienteRow[] = [];

  // 1. Traslados N→M y conteos físicos por grupo_id (en orden de primera aparición).
  const gruposVistos = new Set<string>();
  movimientos.forEach((m) => {
    if (!m.grupo_id || gruposVistos.has(m.grupo_id)) return;
    gruposVistos.add(m.grupo_id);
    const miembros = movimientos
      .map((mm, idx) => ({ mm, idx }))
      .filter(({ mm }) => mm.grupo_id === m.grupo_id);

    const esTraslado = miembros.every(({ mm }) => mm.tipo === 'traslado_salida' || mm.tipo === 'traslado_entrada');
    const esAjuste = miembros.every(({ mm }) => mm.tipo === 'ajuste');

    if (esTraslado) {
      const origenes = miembros.filter(({ mm }) => mm.tipo === 'traslado_salida');
      const destinos = miembros.filter(({ mm }) => mm.tipo === 'traslado_entrada');
      const cierra = origenes.length > 0 && destinos.length > 0
        && cierraPorCategoria(origenes.map((o) => o.mm), destinos.map((d) => d.mm));
      if (!cierra) return; // no cierra o falta un lado -> cae como sueltas más abajo

      miembros.forEach(({ idx }) => usados.add(idx));
      eventos.push({
        fecha: m.fecha,
        tipo: 'traslado',
        novillos: destinos.reduce((s, { mm }) => s + Math.abs(mm.novillos_delta || 0), 0),
        toros: destinos.reduce((s, { mm }) => s + Math.abs(mm.toros_delta || 0), 0),
        cabezas: destinos.reduce((s, { mm }) => s + Math.abs((mm.novillos_delta || 0) + (mm.toros_delta || 0)), 0),
        potrero: null,
        finca: null,
        notas: m.notas || null,
        grupo_id: m.grupo_id,
        origenes: origenes.map(({ mm }) => puntoDe(mm)),
        destinos: destinos.map(({ mm }) => puntoDe(mm)),
      });
    } else if (esAjuste && miembros.length >= 2) {
      miembros.forEach(({ idx }) => usados.add(idx));
      const potrerosSet = new Set(miembros.map(({ mm }) => mm.potrero_destino_id || mm.potrero_origen_id || ''));
      eventos.push({
        fecha: m.fecha,
        tipo: 'conteo_fisico',
        novillos: miembros.reduce((s, { mm }) => s + (mm.novillos_delta || 0), 0),
        toros: miembros.reduce((s, { mm }) => s + (mm.toros_delta || 0), 0),
        cabezas: miembros.reduce((s, { mm }) => s + Math.abs((mm.novillos_delta || 0) + (mm.toros_delta || 0)), 0),
        potrero: null,
        finca: null,
        notas: m.notas || null,
        grupo_id: m.grupo_id,
        potreros_involucrados: potrerosSet.size,
      });
    }
    // grupo_id compartido por tipos mezclados: ningún miembro se marca usado -> filas sueltas.
  });

  // 2. Compra/venta repartida por transaccion_ganado_id (NO por grupo_id).
  const transaccionesVistas = new Set<string>();
  movimientos.forEach((m, i) => {
    if (usados.has(i)) return;
    if (!m.transaccion_ganado_id || (m.tipo !== 'compra' && m.tipo !== 'venta')) return;
    if (transaccionesVistas.has(m.transaccion_ganado_id)) return;
    transaccionesVistas.add(m.transaccion_ganado_id);
    const miembros = movimientos
      .map((mm, idx) => ({ mm, idx }))
      .filter(({ mm, idx }) => !usados.has(idx) && mm.transaccion_ganado_id === m.transaccion_ganado_id);
    if (miembros.length < 2) return; // grupo de 1: se emite suelto abajo
    const tipos = new Set(miembros.map(({ mm }) => mm.tipo));
    if (tipos.size > 1) return; // compra y venta bajo la misma transacción: imposible -> sueltas

    miembros.forEach(({ idx }) => usados.add(idx));
    eventos.push({
      fecha: m.fecha,
      tipo: m.tipo,
      novillos: miembros.reduce((s, { mm }) => s + Math.abs(mm.novillos_delta || 0), 0),
      toros: miembros.reduce((s, { mm }) => s + Math.abs(mm.toros_delta || 0), 0),
      cabezas: miembros.reduce((s, { mm }) => s + Math.abs((mm.novillos_delta || 0) + (mm.toros_delta || 0)), 0),
      potrero: null,
      finca: null,
      notas: m.notas || null,
      transaccion_ganado_id: m.transaccion_ganado_id,
      destinos: miembros.map(({ mm }) => puntoDe(mm)),
    });
  });

  // 3. El resto: filas sueltas, tal cual eran antes de la 097/098.
  movimientos.forEach((m, i) => {
    if (usados.has(i)) return;
    const punto = puntoDe(m);
    eventos.push({
      fecha: m.fecha,
      tipo: m.tipo,
      novillos: m.novillos_delta || 0,
      toros: m.toros_delta || 0,
      cabezas: Math.abs((m.novillos_delta || 0) + (m.toros_delta || 0)),
      potrero: punto.potrero,
      finca: punto.finca,
      notas: m.notas || null,
    });
  });

  // Se agrupó fuera de orden cronológico (grupos primero) — se reordena por
  // fecha descendente antes de aplicar el límite, para no cortar a mitad
  // de la ventana "más reciente" que pide el nombre de la función.
  return eventos
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, limit);
}
