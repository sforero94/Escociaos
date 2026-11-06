// Proyecciones cerradas, paginación exacta y cliente JWT del solicitante.
import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { CatalogoMonitoreo, FuenteMonitoreo, ObservacionMonitoreo } from './monitoreoTipos.ts';

export const COLUMNAS_MONITOREO = {
  rondas_monitoreo: 'id,nombre,fecha_inicio,fecha_fin',
  lotes: 'id,nombre',
  sublotes: 'id,lote_id,nombre',
  plagas_enfermedades_catalogo: 'id,nombre',
  monitoreos: 'id,ronda_id,fecha_monitoreo,lote_id,sublote_id,plaga_enfermedad_id,arboles_monitoreados,arboles_afectados',
} as const;
const texto = (v: unknown): string | null | undefined => v === null ? null : typeof v === 'string' ? v : undefined;
const fecha = (v: unknown): string | null | undefined => v === null ? null : esFechaCalendario(v) ? v : undefined;
const referencia = (v: unknown): string | null | undefined => v === null ? null : esUuid(v) ? v : undefined;
const numero = (v: unknown): number | null | undefined => v === null ? null : typeof v === 'number' ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined;
function validarIds(rows: Record<string, unknown>[]): void {
  if (rows.some(r => !r || !esUuid(r.id)) || new Set(rows.map(r => (r.id as string).toLowerCase())).size !== rows.length) throw new Error('identidades_monitoreo_no_disponibles');
}
export function fuenteMonitoreoSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteMonitoreo {
  const leer = async (tabla: keyof typeof COLUMNAS_MONITOREO) => {
    const rows = await leerFilasFijas(cliente, tabla, COLUMNAS_MONITOREO[tabla], undefined, opciones.tamanoPagina);
    validarIds(rows);
    return rows;
  };
  return {
    async catalogo() {
      const catalogo: CatalogoMonitoreo = {};
      // Una relación no leída no se transforma en catálogo vacío.
      const resultados = await Promise.allSettled([
        leer('rondas_monitoreo'), leer('lotes'), leer('sublotes'), leer('plagas_enfermedades_catalogo'),
      ]);
      const [rondas, lotes, sublotes, plagas] = resultados;
      if (rondas.status === 'fulfilled') catalogo.rondas = rondas.value.map(r => ({ id: r.id as string, nombre: texto(r.nombre), fecha_inicio: fecha(r.fecha_inicio), fecha_fin: fecha(r.fecha_fin) }));
      if (lotes.status === 'fulfilled') catalogo.lotes = lotes.value.map(r => ({ id: r.id as string, nombre: texto(r.nombre) }));
      if (sublotes.status === 'fulfilled') catalogo.sublotes = sublotes.value.map(r => ({ id: r.id as string, nombre: texto(r.nombre), lote_id: referencia(r.lote_id) }));
      if (plagas.status === 'fulfilled') catalogo.plagas = plagas.value.map(r => ({ id: r.id as string, nombre: texto(r.nombre) }));
      return catalogo;
    },
    async leerObservaciones() {
      return (await leer('monitoreos')).map((r): ObservacionMonitoreo => ({
        id: r.id as string, ronda_id: referencia(r.ronda_id), lote_id: referencia(r.lote_id), sublote_id: referencia(r.sublote_id),
        plaga_enfermedad_id: referencia(r.plaga_enfermedad_id), fecha_monitoreo: fecha(r.fecha_monitoreo),
        arboles_afectados: numero(r.arboles_afectados), arboles_monitoreados: numero(r.arboles_monitoreados),
      }));
    },
  };
}
