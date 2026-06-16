import { useMemo } from 'react';
import { formatNumber } from '@/utils/format';
import { agruparPorQuincena } from '@/utils/agrupacionIngresos';
import { GrupoIngresosTable } from './GrupoIngresosTable';
import type { GrupoIngresosTableConfig } from './GrupoIngresosTable';
import type { IngresoDetalleRow } from '@/types/finanzas';

interface QuincenaTableProps {
  rows: IngresoDetalleRow[];
  emptyMessage?: string;
}

const CONFIG: GrupoIngresosTableConfig = {
  cantidadHeader: 'Litros',
  formatCantidad: (l) => `${formatNumber(l)} L`,
  precioHeader: 'Precio Prom. $/L',
  detalleCol2Header: 'Tipo ingreso',
  detalleCol2Value: (r) => r.tipo_ingreso || '',
  detalleCantidadFormat: (l) => `${formatNumber(l)} L`,
};

export function QuincenaTable({ rows, emptyMessage }: QuincenaTableProps) {
  const grupos = useMemo(() => agruparPorQuincena(rows), [rows]);
  return <GrupoIngresosTable grupos={grupos} config={CONFIG} emptyMessage={emptyMessage} />;
}
