// Extra independent calendar-scope controls, frozen before narrowing the guard.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll,beforeAll,beforeEach,describe,expect,it,vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { dependencies,forbidNetwork,request } from './esco2P2Harness.ts';
import { CORRECTION_QA as C,correctionQaDb,correctionQaSeed } from './esco2M5Correction1QaHarness.ts';
let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await correctionQaDb();},30000);
beforeEach(async()=>{await correctionQaSeed(db);});
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
async function execute(question:string,desde:string,hasta:string) {
  const args={desde,hasta,station_id:C.station,variables:['temp_c_avg'],parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:question,capacidad:'clima',disposicion:'consultar'}]}};
  const h=dependencies(db,[{nombre:'consultar_clima',argumentos:JSON.stringify(args)}],{modoCobertura:'obligatoria'});
  const response=await manejar(request({pregunta:question,historial:[{rol:'user',texto:`Temperatura de ${C.station} desde 2025-02-01 hasta 2025-02-03`},{rol:'assistant',texto:'Intervalo anterior sintético confirmado.'}]}),h.deps);
  return {body:await response.json(),response};
}
describe('M5 correction1 QA: explicit interval syntax differs from two descriptive dates',()=>{
  it('does not turn two note-review dates into a new weather interval',async()=>{
    const question='Esta nota se revisó el 2025-05-01 y el 2025-05-09; repite la temperatura con el intervalo anterior';
    const h=await execute(question,'2025-02-01','2025-02-03');
    expect(h.response.status).toBe(200);expect(h.body.origen).toBe('determinista');
    expect(h.body.resultados[0].alcance).toMatchObject({desde:'2025-02-01',hasta:'2025-02-03'});
    expect(h.body.resultados[0].resumen[0].variables.temp_c_avg.promedio).toBeCloseTo(52/3,10);
  });

  it.each(['desde 2025-02-02 hasta 2025-02-03','del 2025-02-02 al 2025-02-03','período entre 2025-02-02 y 2025-02-03'])('preserves the explicit current interval %j and rejects a stale broader argument range',async interval=>{
    const question=`Ahora limita la temperatura de ${C.station} al ${interval}`;
    const good=await execute(question,'2025-02-02','2025-02-03');
    expect(good.body.origen).toBe('determinista');expect(good.body.resultados[0].resumen[0].variables.temp_c_avg.promedio).toBe(24);
    const stale=await execute(question,'2025-02-01','2025-02-03');
    expect(stale.body.resultados).toEqual([]);expect(stale.body.origen).toMatch(/error_plan|aclaracion/);
  });
});
