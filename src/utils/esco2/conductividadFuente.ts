import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { CatalogoConductividad, FuenteConductividad, RegistroConductividad } from './conductividadTipos.ts';
export const COLUMNAS_CONDUCTIVIDAD = {
  mon_conductividad: 'id,lote_id,ronda_id,fecha_monitoreo,valor_ce,lecturas,num_arboles,ph',
  lotes: 'id,nombre', rondas_monitoreo: 'id',
} as const;
const referencia = (v: unknown): string | null | undefined => v === null ? null : esUuid(v) ? v.toLowerCase() : undefined;
const numero = (v: unknown): number | null | undefined => v === null ? null : typeof v === 'number' ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
export function fuenteConductividadSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteConductividad {
  const leer = async (tabla: keyof typeof COLUMNAS_CONDUCTIVIDAD) => {
    const rows = await leerFilasFijas(cliente, tabla, COLUMNAS_CONDUCTIVIDAD[tabla], undefined, opciones.tamanoPagina);
    if (rows.some(r => !r || !esUuid(r.id)) || new Set(rows.map(r => (r.id as string).toLowerCase())).size !== rows.length) throw new Error('identidades_conductividad_no_disponibles');
    return rows;
  };
  return {
    async catalogo() {
      const catalogo: CatalogoConductividad = {};
      const [lotes, rondas] = await Promise.allSettled([leer('lotes'), leer('rondas_monitoreo')]);
      if (lotes.status === 'fulfilled') catalogo.lotes = lotes.value.map(r => ({ id: (r.id as string).toLowerCase(), nombre: r.nombre === null ? null : typeof r.nombre === 'string' ? r.nombre : undefined }));
      if (rondas.status === 'fulfilled') catalogo.rondas = rondas.value.map(r => ({ id: (r.id as string).toLowerCase() }));
      return catalogo;
    },
    async leerRegistros() {
      return (await leer('mon_conductividad')).map((r): RegistroConductividad => ({
        id: (r.id as string).toLowerCase(), lote_id: referencia(r.lote_id), ronda_id: referencia(r.ronda_id),
        fecha_monitoreo: r.fecha_monitoreo === null ? null : esFechaCalendario(r.fecha_monitoreo) ? r.fecha_monitoreo : undefined,
        valor_ce: numero(r.valor_ce), ph: numero(r.ph), num_arboles: numero(r.num_arboles), lecturas: r.lecturas,
      }));
    },
  };
}
