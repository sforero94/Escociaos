import type { Gasto, GastoFormData } from '@/types/finanzas';
import { obtenerFechaHoy } from '@/utils/fechas';

export interface GastoOriginal { id: string; updated_at: string; valor: number; }
/** Metadata travels with the edited values; it never belongs in a database payload. */
export type GastoDraft<T> = T & { __gastoOriginal: GastoOriginal | null };
export type CompletarGastoData = Pick<GastoFormData, 'negocio_id' | 'region_id' | 'categoria_id' | 'concepto_id' | 'proveedor_id' | 'medio_pago_id' | 'observaciones'>;
const original = (gasto?: Gasto | null): GastoOriginal | null => gasto ? {
  id: gasto.id, updated_at: gasto.updated_at, valor: gasto.valor,
} : null;
export function crearGastoDraft(gasto?: Gasto | null): GastoDraft<GastoFormData> {
  return {
    fecha: gasto?.fecha ?? obtenerFechaHoy(), negocio_id: gasto?.negocio_id ?? '',
    region_id: gasto?.region_id ?? '', categoria_id: gasto?.categoria_id ?? '',
    concepto_id: gasto?.concepto_id ?? '', nombre: gasto?.nombre ?? '',
    proveedor_id: gasto?.proveedor_id ?? '', valor: gasto?.valor ?? 0,
    medio_pago_id: gasto?.medio_pago_id ?? '', observaciones: gasto?.observaciones ?? '',
    url_factura: gasto?.url_factura ?? '', __gastoOriginal: original(gasto),
  };
}
export function crearCompletarGastoDraft(gasto: Gasto | null): GastoDraft<CompletarGastoData> {
  const full = crearGastoDraft(gasto);
  return { negocio_id: full.negocio_id, region_id: full.region_id, categoria_id: full.categoria_id,
    concepto_id: full.concepto_id, proveedor_id: full.proveedor_id, medio_pago_id: full.medio_pago_id,
    observaciones: full.observaciones, __gastoOriginal: full.__gastoOriginal };
}
