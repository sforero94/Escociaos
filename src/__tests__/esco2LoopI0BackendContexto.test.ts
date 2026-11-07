import {describe,it,expect} from 'vitest';
import {poblacionesDesdeResultados,resolverReferenciaPoblacion,verificarReferenciaPoblacion} from '../utils/esco2/contextoPoblaciones.ts';
import type {ResultadoAplicaciones} from '../utils/esco2/aplicacionesTipos.ts';
const id=(n:number)=>`b2000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids=[id(1),id(2),id(3)];
const resultado=():ResultadoAplicaciones=>({tipo:'aplicaciones',id:'p1',estado:'ok',consulta:{desde:'2026-11-01',hasta:'2026-11-03',base_fecha:'fecha_inicio_planeada',aplicacion_ids:ids,aplicaciones:[],estados:[]},filas:ids.map(id=>({id,estado:'Cerrada',fechas_seleccion:['2026-11-01']})),conteo:3,excluidos:{sin_fecha:0,sin_estado:0,sin_cierre:0},fuente:'lecturas_independientes'});
describe('Loop I0 F5 contexto poblacional verificable',()=>{
 it('conserva los miembros realmente seleccionados, no solo los IDs pedidos',()=>{
  const r=resultado();r.filas.pop();r.conteo=2;r.excluidos.sin_fecha=1;
  expect(poblacionesDesdeResultados([r])[0]).toMatchObject({estado:'parcial',ids:ids.slice(0,2)});
 });
 it('sin contexto válido no reconstruye las tres desde prosa assistant',()=>{
  expect(resolverReferenciaPoblacion('¿Cuáles son esas tres?',[{rol:'assistant',texto:ids.join(',')}],undefined,{aplicaciones:ids.map(id=>({id}))}).tipo).toBe('aclaracion');
 });
 it('conserva tres miembros completos aunque el catálogo actual contenga un cuarto',()=>{
  const ref=resolverReferenciaPoblacion('¿Cuáles son esas tres?',[],{poblacionesPrevias:poblacionesDesdeResultados([resultado()])},{aplicaciones:[...ids,id(4)].map(id=>({id}))});
  expect(ref).toMatchObject({tipo:'resuelta',ids});
 });
 it('no envia un ID que perdió visibilidad después del token',()=>{
  const ref=resolverReferenciaPoblacion('¿Cuáles son esas tres?',[],{poblacionesPrevias:poblacionesDesdeResultados([resultado()])},{aplicaciones:ids.slice(0,2).map(id=>({id}))});
  expect(ref.tipo).toBe('aclaracion');
 });
 it('rechaza ampliar una referencia de tres a cuatro aunque intención y plan coincidan',()=>{
  const ref=resolverReferenciaPoblacion('¿Cuáles son esas tres?',[],{poblacionesPrevias:poblacionesDesdeResultados([resultado()])},{aplicaciones:ids.map(id=>({id}))});
  expect(verificarReferenciaPoblacion(ref,{version:1,obligaciones:[{capacidad:'aplicaciones',poblacion:{tipo:'explicita',entidad:'aplicaciones',ids:[...ids,id(4)]}}],residuales:[]} as never)).toBe(false);
 });
 it('UUIDs en un antecedente USER negado no prueban una selección afirmativa sin token',()=>{
  const ref=resolverReferenciaPoblacion('¿Cuáles son esas tres?',[{rol:'user',texto:`No consultes estas aplicaciones ${ids.join(', ')}`}],undefined,{aplicaciones:ids.map(id=>({id}))});
  expect(ref.tipo).toBe('aclaracion');
 });

 it('una referencia a fechas no exige población previa, pero continúa buscando miembros',()=>{
  expect(resolverReferenciaPoblacion('Usa las mismas fechas para todas las aplicaciones',[],undefined,{}).tipo).toBe('no_deictica');
  expect(resolverReferenciaPoblacion('Usa las mismas fechas para esas tres',[],undefined,{}).tipo).toBe('aclaracion');
 });
});
