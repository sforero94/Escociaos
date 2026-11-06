import { describe,expect,it } from 'vitest';
import { ejecutarClima } from '../utils/esco2/clima.ts';
import { fuenteClimaSupabase } from '../utils/esco2/climaFuente.ts';
import type { ConsultaClima, ResumenDiarioClima } from '../utils/esco2/climaTipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';
const consulta:ConsultaClima={desde:'2026-10-01',hasta:'2026-10-01',station_id:'BACKEND-A',variables:['temp_c_avg']};
const fila=(station_id:string):ResumenDiarioClima=>({fecha:consulta.desde,station_id,temp_c_min:null,temp_c_max:null,temp_c_avg:12,humedad_pct_min:null,humedad_pct_max:null,humedad_pct_avg:null,viento_kmh_avg:null,rafaga_kmh_max:null,viento_dir_predominante:null,lluvia_total_mm:null,lluvia_confianza:'ok',lluvia_mm_evento:null,radiacion_wm2_avg:null,radiacion_wm2_max:null,uv_index_max:null,horas_sol_duracion:null,lecturas_count:48,cobertura_hueco_max_min:30});
describe('P4-3 backend identidad literal de estación',()=>{
  it('resuelve whitespace solo si existe una identidad raw inequívoca y la conserva',()=>{
    const r=ejecutarClima(consulta,[fila('BACKEND-A ')],'p1','2026-11-06');
    expect(r.resumen).toHaveLength(1);
    expect(r.resumen[0]).toMatchObject({station_id:'BACKEND-A ',variables:{temp_c_avg:{promedio:12}}});
    expect(r.filas[0].station_id).toBe('BACKEND-A ');
  });
  it('pide precisar toda colisión trim incluso cuando una raw coincide exactamente',()=>{
    const r=ejecutarClima(consulta,[fila('BACKEND-A'),fila('BACKEND-A ')],'p1','2026-11-06');
    expect(r.estado).toBe('aclaracion');expect(r.resumen).toHaveLength(0);
  });
  it('lee la ventana completa antes de resolver la estación y conserva sus raw IDs',async()=>{
    const cliente=clientePostgrestFalso({clima_resumen_diario:[fila('BACKEND-A '),fila('OTRA')]});
    const leidas=await fuenteClimaSupabase(cliente).leerResumen(consulta);
    expect(leidas.map(f=>f.station_id)).toEqual(['BACKEND-A ','OTRA']);
  });
});
