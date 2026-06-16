import { useMemo } from 'react';
import { formatNumber } from '@/utils/format';
import { agruparPorCosecha } from '@/utils/agrupacionIngresos';
import { GrupoIngresosTable } from './GrupoIngresosTable';
import type { GrupoIngresosTableConfig } from './GrupoIngresosTable';
import type { IngresoDetalleRow } from '@/types/finanzas';

interface CosechaTableProps {
  rows: IngresoDetalleRow[];
  emptyMessage?: string;
}

const CONFIG: GrupoIngresosTableConfig = {
  cantidadHeader: 'Toneladas',
  formatCantidad: (kg) => `${formatNumber(kg / 1000, 1)} ton`,
  precioHeader: 'Precio Prom. $/kg',
  detalleCol2Header: 'Comprador',
  detalleCol2Value: (r) => r.comprador || '',
  detalleCantidadFormat: (kg) => `${formatNumber(kg / 1000, 1)} ton`,
};

export function CosechaTable({ rows, emptyMessage }: CosechaTableProps) {
  const grupos = useMemo(() => agruparPorCosecha(rows), [rows]);
  return <GrupoIngresosTable grupos={grupos} config={CONFIG} emptyMessage={emptyMessage} />;
}
