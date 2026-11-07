import { describe, expect, it } from 'vitest';
import { validarIntencion, verificarIntencionPlan } from '../utils/esco2/intencion.ts';
import { ejecutarConsulta } from '../utils/esco2/ejecutor.ts';
import { construirCoberturaFinal } from '../utils/esco2/cobertura.ts';
import { operacionesDelPlan } from '../utils/esco2/tipos.ts';
import { validarPlan } from '../utils/esco2/registro.ts';
const pregunta='Jornales y costo por lote del 2026-10-01 al 2026-10-31, incluye sin lote.';
const contrato=()=>({version:1,obligaciones:[{id:'o1',evidencias:[{mensaje:'actual',inicio:0,fin:pregunta.length}],capacidad:'labores',poblacion:{tipo:'todas_visibles',entidad:'labores',sin_lote:'incluir'},periodo:{tipo:'intervalo',desde:'2026-10-01',hasta:'2026-10-31',base_fecha:'fecha_trabajo'},metricas:['jornales','costo'],agrupaciones:['lote'],condiciones:[],detalle:'resumen'}],residuales:[]});
const consulta=()=>({proposito:'Consulta',desde:'2026-10-01',hasta:'2026-10-31',sin_lote:'incluir',agrupar_por:['lote'],metricas:['jornales','costo']});
const plan=(c=consulta())=>validarPlan([{nombre:'consultar_labores',argumentos:JSON.stringify({...c,parte_ids:['s1'],cobertura:{version:1,partes:[{id:'s1',texto:pregunta,capacidad:'labores',disposicion:'consultar'}]}})}],{pregunta,exigirCobertura:true});
describe('M6 intención independiente backend',()=>{
 it('acepta intención válida y plan sustantivo con las condiciones conservadas',()=>{
  const i=validarIntencion(contrato(),pregunta,[]); expect(()=>verificarIntencionPlan(i,plan())).not.toThrow();
 });
 it.each(['metrica','periodo','base','poblacion','agrupacion'])('rechaza mutación de %s aunque el plan sea formalmente válido',campo=>{
  const i=validarIntencion(contrato(),pregunta,[]);const c=consulta();
  if(campo==='metrica')c.metricas=['jornales'];if(campo==='periodo')c.desde='2026-09-01';if(campo==='base')Object.assign(c,{cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',metricas:[],agrupar_por:['tarea']});if(campo==='poblacion')c.sin_lote='excluir';if(campo==='agrupacion')c.agrupar_por=[];
  expect(()=>verificarIntencionPlan(i,plan(c))).toThrow(/intencion/);
 });
 it('no permite que el plan omita una obligación independiente',()=>{
  const raw=contrato();raw.obligaciones.push({...raw.obligaciones[0],id:'o2'});const i=validarIntencion(raw,pregunta,[]);
  expect(()=>verificarIntencionPlan(i,plan())).toThrow(/intencion/);
 });
 it('conserva residuales como pendientes en vez de certificar una pregunta completa',()=>{
  const raw=contrato();raw.residuales=[{inicio:0,fin:8,motivo:'no_interpretado'}] as never;
  const i=validarIntencion(raw,pregunta,[]);expect(i.residuales).toHaveLength(1);
 });
 it('rechaza evidencia procedente de respuestas del asistente',()=>{
  const raw=contrato();Object.assign(raw.obligaciones[0].evidencias[0],{mensaje:'historial_usuario',indice:0});
  expect(()=>validarIntencion(raw,pregunta,[{rol:'assistant',texto:pregunta}])).toThrow();
 });
 it('requiere ancla actual incluso con contexto anterior válido',()=>{
  const raw=contrato();Object.assign(raw.obligaciones[0].evidencias[0],{mensaje:'historial_usuario',indice:0});
  expect(()=>validarIntencion(raw,pregunta,[{rol:'user',texto:pregunta}])).toThrow();
 });
 it('no admite campos ejecutables ni referencias circulares',()=>{
  const raw=contrato();Object.assign(raw.obligaciones[0].poblacion,{tipo:'derivada',de:'o1'});
  expect(()=>validarIntencion(raw,pregunta,[])).toThrow();
  expect(()=>validarIntencion({...contrato(),sql:'select *'},pregunta,[])).toThrow();
 });
 it('no pierde el ranking solicitado ni añade un top no pedido',()=>{
  const raw=contrato();const ranking={metrica:'jornales',direccion:'desc',n:1,empates:'incluir'};
  Object.assign(raw.obligaciones[0],{ranking});
  const i=validarIntencion(raw,pregunta,[]);
  expect(()=>verificarIntencionPlan(i,plan())).toThrow(/intencion/);
  expect(()=>verificarIntencionPlan(i,plan({...consulta(),ranking} as never))).not.toThrow();
  expect(()=>verificarIntencionPlan(validarIntencion(contrato(),pregunta,[]),plan({...consulta(),ranking} as never))).toThrow(/intencion/);
 });

 it('no acepta comparación de fechas ni unidad arbitraria en un umbral numérico',()=>{
  const fechas=contrato();fechas.obligaciones[0].metricas=['primer_registro'];Object.assign(fechas.obligaciones[0],{comparacion:{metrica:'primer_registro',izquierda:'id1',derecha:'id2'}});
  expect(()=>validarIntencion(fechas,pregunta,[])).toThrow();
  const unidad=contrato();unidad.obligaciones[0].condiciones=[{metrica:'jornales',operador:'gt',valor:1,unidad:'kg'}] as never;
  expect(()=>validarIntencion(unidad,pregunta,[])).toThrow();
 });
 it('un ranking solicitado conserva detalle exhaustivo de su selección, sin pedir el universo descartado',()=>{
  const raw=contrato();Object.assign(raw.obligaciones[0],{detalle:'exhaustivo',ranking:{metrica:'jornales',direccion:'desc',n:1,empates:'incluir'}});
  const i=validarIntencion(raw,pregunta,[]);const p=plan({...consulta(),ranking:raw.obligaciones[0]['ranking' as never]} as never);p.intencion=i;
  if(p.tipo!=='consultas'&&p.tipo!=='operaciones')throw Error('plan no ejecutable');
  const c=operacionesDelPlan(p)[0];if(c.tipo!=='labores')throw Error('dominio');
  const r=ejecutarConsulta(c.consulta,{tareas:[{id:'t',nombre:'Tarea',tipo_tarea_id:null,estado:null,jornales_estimados:null}],tiposTareas:[],lotes:[{id:'a',nombre:'A',activo:true},{id:'b',nombre:'B',activo:true}],registros:[{id:'r1',tarea_id:'t',lote_id:'a',fecha_trabajo:'2026-10-01',fraccion_jornal:1,costo_jornal:1},{id:'r2',tarea_id:'t',lote_id:'b',fecha_trabajo:'2026-10-02',fraccion_jornal:.5,costo_jornal:2}]},'2026-11-06','p1');
  expect(r.cobertura).toMatchObject({grupos_totales:2,grupos_mostrados:1});
  expect(construirCoberturaFinal(p,[r],'2026-11-06').partes[0].disposicion).toBe('respondida');
 });

});
