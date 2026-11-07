import {describe,it,expect} from 'vitest';
import { normalizarIdentidadIntencionPlan } from '../utils/esco2/identidadIntencion.ts';
import { validarIntencion, verificarIntencionPlan } from '../utils/esco2/intencion.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
const id=(n:number)=>`b1000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q='Jornales del lote sintético durante octubre';
const intent=(selector:Record<string,unknown>)=>validarIntencion({version:1,obligaciones:[{id:'o1',evidencias:[{mensaje:'actual',inicio:0,fin:q.length}],capacidad:'labores',poblacion:{tipo:'explicita',entidad:'lotes',...selector},periodo:{tipo:'intervalo',desde:'2026-10-01',hasta:'2026-10-31',base_fecha:'fecha_trabajo'},metricas:['jornales'],agrupaciones:[],condiciones:[],detalle:'resumen'}],residuales:[]},q,[]);
const plan=(selector:Record<string,unknown>)=>validarPlan([{nombre:'consultar_labores',argumentos:JSON.stringify({proposito:'Consulta',desde:'2026-10-01',hasta:'2026-10-31',agrupar_por:[],metricas:['jornales'],...selector,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:q,capacidad:'labores',disposicion:'consultar'}]}})}],{pregunta:q,exigirCobertura:true});
const cat={labores:{lotes:[{id:id(1),nombre:'Lote único',activo:true}],tareas:[],tiposTareas:[]}};
describe('Loop I0 F1 normalización local de identidad',()=>{
 it.each([true,false])('reconcilia nombre e ID en ambos sentidos (%s)',inverse=>{
  const i=intent(inverse?{ids:[id(1)]}:{nombres:['Lote único']});const p=plan(inverse?{lotes:['Lote único']}:{lote_ids:[id(1)]});
  const n=normalizarIdentidadIntencionPlan(i,p,cat);expect(n.tipo).toBe('ok');if(n.tipo!=='ok')throw Error('normalizacion');
  expect(()=>verificarIntencionPlan(n.intencionCanonica,n.planCanonico)).not.toThrow();
  expect(i.obligaciones[0].poblacion).toEqual(inverse?{tipo:'explicita',entidad:'lotes',ids:[id(1)]}:{tipo:'explicita',entidad:'lotes',nombres:['Lote único']});
 });
 it('un homónimo no acepta el ID único escogido por el plan',()=>{
  const n=normalizarIdentidadIntencionPlan(intent({nombres:['Lote único']}),plan({lote_ids:[id(1)]}),{labores:{...cat.labores,lotes:[...cat.labores.lotes,{id:id(2),nombre:'Lote único',activo:true}]}});
  expect(n).toMatchObject({tipo:'aclaracion',motivo:'nombre_ambiguo',obligacion_ids:['o1']});
 });
 it('un catálogo no leído no se convierte en vacío',()=>expect(normalizarIdentidadIntencionPlan(intent({nombres:['Lote único']}),plan({lote_ids:[id(1)]}),{})).toMatchObject({tipo:'no_disponible'}));
 it('un nombre ausente pide aclaración sin aceptar otro ID visible',()=>expect(normalizarIdentidadIntencionPlan(intent({nombres:['Ausente']}),plan({lote_ids:[id(1)]}),cat)).toMatchObject({tipo:'aclaracion',motivo:'nombre_sin_coincidencia'}));
 it('no normaliza dos poblaciones distintas para hacerlas coincidir',()=>{
  const n=normalizarIdentidadIntencionPlan(intent({nombres:['Lote único']}),plan({lote_ids:[id(2)]}),{labores:{...cat.labores,lotes:[...cat.labores.lotes,{id:id(2),nombre:'Otro',activo:true}]}});
  expect(n.tipo).toBe('ok');if(n.tipo==='ok')expect(()=>verificarIntencionPlan(n.intencionCanonica,n.planCanonico)).toThrow(/poblacion/);
 });
 it('un campo repetido en filtro y selector primario conserva la intersección, no el último valor',()=>{
  const catalogo={labores:{...cat.labores,lotes:[...cat.labores.lotes,{id:id(2),nombre:'Otro',activo:true}]}};
  const n=normalizarIdentidadIntencionPlan(intent({nombres:['Otro'],filtros:[{campo:'lotes',valores:['Lote único']}]}),plan({lote_ids:[id(2)]}),catalogo);
  expect(n.tipo).toBe('aclaracion');
 });
 it('acepta el mismo campo repetido si ambas representaciones acreditan la misma identidad',()=>{
  const n=normalizarIdentidadIntencionPlan(intent({nombres:['Lote único'],filtros:[{campo:'lotes',valores:['lote único']}]}),plan({lote_ids:[id(1)]}),cat);
  expect(n.tipo).toBe('ok');if(n.tipo==='ok')expect(()=>verificarIntencionPlan(n.intencionCanonica,n.planCanonico)).not.toThrow();
 });

 it('resuelve filtro de chapeta decimal textual a la identidad visible',()=>{
  const i=intent({ids:[id(1)]});i.obligaciones[0].capacidad='hato';i.obligaciones[0].poblacion={tipo:'todas_visibles',entidad:'animales',filtros:[{campo:'chapetas',valores:['22']}]};
  const p=plan({});if(p.tipo!=='operaciones')throw Error('fixture');
  p.operaciones[0]={...p.operaciones[0],tipo:'hato',consulta:{animal_ids:[id(1)],nombres:[],chapetas:[]}} as never;
  const n=normalizarIdentidadIntencionPlan(i,p,{hato:{animales:[{id:id(1),nombre:'Beta',numero:22}]}} as never);
  expect(n.tipo).toBe('ok');if(n.tipo==='ok')expect(n.intencionCanonica.obligaciones[0].poblacion.filtros).toEqual([{campo:'animal_ids',valores:[id(1)]}]);
 });
});
