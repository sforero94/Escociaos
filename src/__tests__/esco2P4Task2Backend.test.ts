import { describe, expect, it } from 'vitest';
import { ejecutarConductividad } from '../utils/esco2/conductividad.ts';
import { fuenteConductividadSupabase } from '../utils/esco2/conductividadFuente.ts';
import { calcularDistribucionCE as extraida } from '../utils/calculosConductividad.ts';
import { calcularDistribucionCE as original } from '../utils/calculosMonitoreoV2.ts';
import type { ConsultaConductividad, DatosConductividad } from '../utils/esco2/conductividadTipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';
const id = (n: number) => `ce000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const consulta: ConsultaConductividad = { desde:'2026-10-01',hasta:'2026-10-03',lote_ids:[id(1)],lotes:[] };
const datos = (): DatosConductividad => ({ lotes:[{id:id(1),nombre:'Lote sintético'}],rondas:[{id:id(2)}],registros:[{id:id(3),lote_id:id(1),ronda_id:null,fecha_monitoreo:'2026-10-03',valor_ce:9,ph:0,num_arboles:99,lecturas:[{arbol:1,alta:0,baja:null},{arbol:2,alta:1,baja:3},{arbol:3,alta:null,baja:null}]}] });
describe('P4-2 CE backend',()=>{
  it('reexporta exactamente el motor puro y mantiene guardado separado del promedio por árbol',()=>{
    expect(extraida).toBe(original);
    const r=ejecutarConductividad(consulta,datos(),'p1','2026-11-05');
    expect(r.filas[0]).toMatchObject({valor_ce:9,ph:0,ronda_id:null,ronda_estado:'sin_vinculo',num_arboles:99,distribucion:{promedio:1,totalArboles:2,pctBajo:50,pctAlto:50,pctEnRango:0}});
  });
  it.each([[],null,{},[{arbol:1,alta:0,baja:null},{arbol:1,alta:2,baja:2}],[{arbol:1,alta:'1',baja:null}],[{arbol:1,alta:null,baja:null}]].map(value=>[value]))('no publica distribución cero ante JSON no calculable %#',lecturas=>{
    const d=datos();d.registros![0].lecturas=lecturas;
    const r=ejecutarConductividad(consulta,d,'p1','2026-11-05');
    expect(r.estado).toBe('parcial');expect(r.filas[0].distribucion).toBeNull();expect(r.filas[0].valor_ce).toBe(9);
  });
  it('conserva medición cuando el vínculo opcional no es legible',()=>{
    const d=datos();d.registros![0].ronda_id=id(4);
    expect(ejecutarConductividad(consulta,d,'p1','2026-11-05').filas[0]).toMatchObject({valor_ce:9,ronda_estado:'no_legible'});
  });
  it('IDs repetidos y lectura faltante nunca acreditan población vacía',()=>{
    const d=datos();d.registros!.push({...d.registros![0]});
    expect(ejecutarConductividad(consulta,d,'p1','2026-11-05').estado).toBe('no_disponible');
    delete d.registros;
    expect(ejecutarConductividad(consulta,d,'p1','2026-11-05').estado).toBe('no_disponible');
  });
  it.each(['lote_id','fecha_monitoreo'] as const)('un campo obligatorio %s NULL no acredita una población vacía',campo=>{
    const d=datos();d.registros![0][campo]=null;
    const r=ejecutarConductividad(consulta,d,'p1','2026-11-05');
    expect(r.estado).toBe('no_disponible');
  });
  it('pagina con conteo exacto y proyecciones mínimas, sin leer notas ni captura',async()=>{
    const d=datos(),cliente=clientePostgrestFalso({lotes:d.lotes!,rondas_monitoreo:d.rondas!,mon_conductividad:d.registros!.map(r=>({...r}))},{maxFilas:1});
    const fuente=fuenteConductividadSupabase(cliente);
    expect(await fuente.catalogo()).toMatchObject({lotes:d.lotes,rondas:d.rondas});
    expect(await fuente.leerRegistros()).toHaveLength(1);
    expect(cliente.llamadas.every(c=>!c.columnas.includes('*')&&!c.columnas.includes('observaciones'))).toBe(true);
  });
});
