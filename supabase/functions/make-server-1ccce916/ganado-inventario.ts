// ganado-inventario.ts — agregación pura del inventario vivo de ganado
// (issue #51) para el tool get_ganado_inventory de Esco.
// Sin imports de Deno para que sea testeable desde Vitest.

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

export interface GanPotreroRow {
  id: string;
  nombre: string;
  finca_id: string;
  activo: boolean;
}

export interface GanInventarioRow {
  potrero_id: string;
  novillos: number;
  toros: number;
  peso_promedio_kg: number | string | null;
  updated_at?: string;
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
}

export interface GanadoInventorySummary {
  total: {
    cabezas: number;
    novillos: number;
    toros: number;
    hectareas: number;
    cabezas_por_ha: number | null;
  };
  por_ubicacion: {
    ubicacion: string;
    cabezas: number;
    novillos: number;
    toros: number;
    hectareas: number;
    cabezas_por_ha: number | null;
  }[];
  por_finca: {
    finca: string;
    ubicacion: string;
    hectareas: number;
    cabezas: number;
    novillos: number;
    toros: number;
    cabezas_por_ha: number | null;
    potreros: {
      potrero: string;
      novillos: number;
      toros: number;
      peso_promedio_kg: number | null;
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
  inventario: GanInventarioRow[];
  movimientos30d: GanMovimientoRow[];
  pendientes: GanMovimientoRow[];
  filtroUbicacion?: string;
  filtroFinca?: string;
}): GanadoInventorySummary {
  const { ubicaciones, fincas, potreros, inventario, movimientos30d, pendientes, filtroUbicacion, filtroFinca } = params;

  const ubicacionDe = (f: GanFincaRow): string =>
    ubicaciones.find((u) => u.id === f.ubicacion_id)?.nombre || 'Sin ubicación';

  const fincasFiltradas = fincas.filter(
    (f) => f.activa && matches(f.nombre, filtroFinca) && matches(ubicacionDe(f), filtroUbicacion)
  );

  const invPorPotrero = new Map(inventario.map((i) => [i.potrero_id, i]));

  const porFinca = fincasFiltradas
    .map((f) => {
      const ps = potreros.filter((p) => p.activo && p.finca_id === f.id);
      const detalle = ps.map((p) => {
        const inv = invPorPotrero.get(p.id);
        return {
          potrero: p.nombre,
          novillos: inv?.novillos || 0,
          toros: inv?.toros || 0,
          peso_promedio_kg: inv?.peso_promedio_kg != null ? num(inv.peso_promedio_kg) : null,
        };
      });
      const novillos = detalle.reduce((s, d) => s + d.novillos, 0);
      const toros = detalle.reduce((s, d) => s + d.toros, 0);
      const hectareas = num(f.hectareas);
      return {
        finca: f.nombre,
        ubicacion: ubicacionDe(f),
        hectareas,
        cabezas: novillos + toros,
        novillos,
        toros,
        cabezas_por_ha: hectareas > 0 ? Math.round(((novillos + toros) / hectareas) * 10) / 10 : null,
        potreros: detalle,
      };
    })
    .sort((a, b) => b.cabezas - a.cabezas);

  const porUbicacionMap = new Map<string, { cabezas: number; novillos: number; toros: number; hectareas: number }>();
  porFinca.forEach((f) => {
    const u = porUbicacionMap.get(f.ubicacion) || { cabezas: 0, novillos: 0, toros: 0, hectareas: 0 };
    u.cabezas += f.cabezas;
    u.novillos += f.novillos;
    u.toros += f.toros;
    u.hectareas += f.hectareas;
    porUbicacionMap.set(f.ubicacion, u);
  });

  const totalNovillos = porFinca.reduce((s, f) => s + f.novillos, 0);
  const totalToros = porFinca.reduce((s, f) => s + f.toros, 0);
  const totalHa = porFinca.reduce((s, f) => s + f.hectareas, 0);
  const totalCabezas = totalNovillos + totalToros;

  let entradas = 0;
  let salidas = 0;
  movimientos30d.forEach((m) => {
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

/**
 * Da forma legible a los movimientos recientes para el LLM, resolviendo
 * nombres de potrero/finca.
 */
export function renderMovimientosRecientes(
  movimientos: GanMovimientoRow[],
  potreros: GanPotreroRow[],
  fincas: GanFincaRow[],
  limit = 30
): {
  fecha: string;
  tipo: string;
  novillos: number;
  toros: number;
  potrero: string | null;
  finca: string | null;
  notas: string | null;
}[] {
  const potreroDe = (id?: string | null) => potreros.find((p) => p.id === id) || null;
  return movimientos.slice(0, limit).map((m) => {
    const p = potreroDe(m.potrero_destino_id) || potreroDe(m.potrero_origen_id);
    const f = p ? fincas.find((x) => x.id === p.finca_id) : null;
    return {
      fecha: m.fecha,
      tipo: m.tipo,
      novillos: m.novillos_delta || 0,
      toros: m.toros_delta || 0,
      potrero: p?.nombre || null,
      finca: f?.nombre || null,
      notas: m.notas || null,
    };
  });
}
