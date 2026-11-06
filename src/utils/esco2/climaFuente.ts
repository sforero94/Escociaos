import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { VARIABLES_CLIMA, type ConsultaClima, type FuenteClima, type ResumenDiarioClima } from './climaTipos.ts';
export const COLUMNAS_CLIMA = 'fecha,station_id,temp_c_min,temp_c_max,temp_c_avg,humedad_pct_min,humedad_pct_max,humedad_pct_avg,viento_kmh_avg,rafaga_kmh_max,viento_dir_predominante,lluvia_total_mm,lluvia_confianza,lluvia_mm_evento,radiacion_wm2_avg,radiacion_wm2_max,uv_index_max,horas_sol_duracion,lecturas_count,cobertura_hueco_max_min';
const numericas = [...VARIABLES_CLIMA.filter(k => k !== 'energia_kwh_m2'), 'lluvia_mm_evento', 'lecturas_count', 'cobertura_hueco_max_min'];
export function validarFilasClima(filas: ResumenDiarioClima[]): void {
  const claves = new Set<string>();
  for (const fila of filas) {
    if (!fila || !esFechaCalendario(fila.fecha) || typeof fila.station_id !== 'string' || !fila.station_id.trim() || typeof fila.lluvia_confianza !== 'string' || !fila.lluvia_confianza.trim()) throw new Error('clima_campos_no_leidos');
    const clave = JSON.stringify([fila.fecha, fila.station_id]);
    if (claves.has(clave)) throw new Error('clima_pk_repetida');
    claves.add(clave);
    for (const campo of numericas) {
      const valor = (fila as unknown as Record<string, unknown>)[campo];
      if (valor !== null && (typeof valor !== 'number' || !Number.isFinite(valor))) throw new Error('clima_numero_no_leido');
    }
    if (!Number.isInteger(fila.lecturas_count) || fila.lecturas_count < 0 || fila.cobertura_hueco_max_min !== null && fila.cobertura_hueco_max_min < 0) throw new Error('clima_metadatos_no_leidos');
  }
}
export function fuenteClimaSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteClima {
  return {    
async leerResumen(consulta: ConsultaClima) {
      const filas = await leerFilasFijas(cliente, 'clima_resumen_diario', COLUMNAS_CLIMA, q => {
        const periodo = q.gte('fecha', consulta.desde).lte('fecha', consulta.hasta);
        return consulta.station_id ? periodo.eq('station_id', consulta.station_id) : periodo;
      }, opciones.tamanoPagina, ['fecha', 'station_id']);
      const salida = filas.map(f => {
        const copia = { ...f };
        for (const campo of numericas) if (typeof copia[campo] === 'string' && (copia[campo] as string).trim() && Number.isFinite(Number(copia[campo]))) copia[campo] = Number(copia[campo]);
        return copia as unknown as ResumenDiarioClima;
      });
      validarFilasClima(salida);
      return salida;
    }  
};
}
