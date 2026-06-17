import type { IngresoDetalleRow } from '@/types/finanzas';

export interface GrupoIngresos {
  key: string;
  label: string;
  rows: IngresoDetalleRow[];
  cantidad: number;          // suma de cantidad para filas CON cantidad (kg o litros)
  valorTotal: number;        // suma de TODAS las filas
  valorConCantidad: number;  // suma de valor solo para filas con cantidad (para precio prom.)
  precioPromedio: number;    // valorConCantidad / cantidad, 0 si no hay cantidad
  maxFecha: string;          // fecha más reciente del grupo (para ordenar cosechas)
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function quincenaDe(fecha: string): { key: string; label: string } {
  const year = fecha.substring(0, 4);
  const monthIdx = parseInt(fecha.substring(5, 7), 10) - 1;
  const day = parseInt(fecha.substring(8, 10), 10);
  const q = day <= 15 ? 1 : 2;
  const mes = MESES[monthIdx] ?? '';
  return {
    key: `${fecha.substring(0, 7)}-${q}`,
    label: q === 1 ? `1-15 ${mes} ${year}` : `16-fin ${mes} ${year}`,
  };
}

function acumular(g: GrupoIngresos, r: IngresoDetalleRow) {
  g.rows.push(r);
  g.valorTotal += r.valor || 0;
  if (r.cantidad != null && r.cantidad > 0) {
    g.cantidad += r.cantidad;
    g.valorConCantidad += r.valor || 0;
  }
  if (r.fecha > g.maxFecha) g.maxFecha = r.fecha;
}

function nuevaGrupo(key: string, label: string): GrupoIngresos {
  return { key, label, rows: [], cantidad: 0, valorTotal: 0, valorConCantidad: 0, precioPromedio: 0, maxFecha: '' };
}

function conPrecio(grupos: GrupoIngresos[]): GrupoIngresos[] {
  return grupos.map((g) => ({
    ...g,
    precioPromedio: g.cantidad > 0 ? g.valorConCantidad / g.cantidad : 0,
  }));
}

export function agruparPorCosecha(rows: IngresoDetalleRow[]): GrupoIngresos[] {
  const map = new Map<string, GrupoIngresos>();
  rows.forEach((r) => {
    const key = r.cosecha || 'Sin cosecha';
    if (!map.has(key)) map.set(key, nuevaGrupo(key, key));
    acumular(map.get(key)!, r);
  });
  return conPrecio(
    Array.from(map.values()).sort((a, b) => b.maxFecha.localeCompare(a.maxFecha))
  );
}

export function agruparPorQuincena(rows: IngresoDetalleRow[]): GrupoIngresos[] {
  const map = new Map<string, GrupoIngresos>();
  rows.forEach((r) => {
    const { key, label } = quincenaDe(r.fecha);
    if (!map.has(key)) map.set(key, nuevaGrupo(key, label));
    acumular(map.get(key)!, r);
  });
  return conPrecio(
    Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key))
  );
}
