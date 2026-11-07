import { describe,expect,it } from 'vitest';
import { resolverDependencia, validarDependencias, seleccionarAplicacionesCompuestas } from '../utils/esco2/composicion.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
import type { ResultadoConsulta, OperacionConsulta } from '../utils/esco2/tipos.ts';
const id=(n:number)=>`ab000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const selected=(ids:string[]):ResultadoConsulta=>({tipo:'aplicaciones',id:'p1',estado:ids.length?'ok':'vacio_verificado',consulta:{desde:'2026-01-01',hasta:'2026-12-31',base_fecha:'fecha_inicio_planeada',aplicacion_ids:[],aplicaciones:[],estados:[]},filas:ids.map(id=>({id,estado:'Cerrada' as const,fechas_seleccion:[]})),conteo:ids.length,excluidos:{sin_fecha:0,sin_cierre:0,sin_estado:0},fuente:'lecturas_independientes'});
describe('M6 dependencias tipadas por IDs',()=>{
 it('obtiene exactamente los IDs visibles elegidos por la selección anterior',()=>expect(resolverDependencia('p1',[selected([id(2),id(1)])],'aplicaciones')).toMatchObject({estado:'ok',ids:[id(1),id(2)]}));
 it('conserva vacío verificado, sin reemplazarlo por selección global',()=>expect(resolverDependencia('p1',[selected([])],'aplicaciones')).toMatchObject({estado:'vacio_verificado',ids:[]}));
 it('no convierte selección desconocida o truncada en población vacía',()=>{
  const r=selected([id(1)]);r.estado='no_disponible';expect(resolverDependencia('p1',[r],'aplicaciones').estado).toBe('no_disponible');
  const large=selected(Array.from({length:51},(_,i)=>id(i)));expect(resolverDependencia('p1',[large],'aplicaciones')).toMatchObject({estado:'no_disponible',ids:[]});
 });
 it('valida referencias hacia atrás y tipos antes de lecturas',()=>{
  expect(()=>validarDependencias([{tipo:'costos_aplicacion',consulta:{seleccion_de:'p1'}}] as OperacionConsulta[])).toThrow();
  expect(()=>validarDependencias([{tipo:'aplicaciones',consulta:{}},{tipo:'costos_aplicacion',consulta:{seleccion_de:'p1'}}] as OperacionConsulta[])).not.toThrow();
  expect(()=>validarDependencias([{tipo:'clima',consulta:{}},{tipo:'costos_aplicacion',consulta:{seleccion_de:'p1'}}] as OperacionConsulta[])).toThrow();
 });
 it('acepta selección dependiente y plural en el mismo registro cerrado',()=>{
  const app={nombre:'consultar_aplicaciones',argumentos:JSON.stringify({desde:'2026-10-01',hasta:'2026-10-31',base_fecha:'fecha_inicio_planeada'})};
  const plan=validarPlan([app,{nombre:'consultar_costos_aplicacion',argumentos:JSON.stringify({seleccion_de:'p1'})}]);expect(plan.tipo).toBe('operaciones');
  expect(()=>validarPlan([{nombre:'consultar_cantidades_aplicacion',argumentos:JSON.stringify({aplicacion_ids:[id(1),id(2)]})}])).not.toThrow();
 });
 it('no convierte un catálogo no leído en población vacía ni lanza un error de transporte',()=>expect(seleccionarAplicacionesCompuestas({aplicacion_ids:[id(1)]},[],undefined)).toMatchObject({estado:'no_disponible',ids:[]}));

});
