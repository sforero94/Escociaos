import { describe, expect, it } from 'vitest';
import { herramientasPlanificador, validarPlan } from '../utils/esco2/registro.ts';
import { ejecutarConsulta } from '../utils/esco2/ejecutor.ts';
import { resolverSeleccionAnimalesHato } from '../utils/esco2/hato.ts';
import type { ConsultaLabores, DatosLabores } from '../utils/esco2/tipos.ts';
const id = (n:number) => `aa000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const consulta = (patch:Partial<ConsultaLabores> = {}):ConsultaLabores => ({proposito:'Prueba sintética',desde:'2026-10-01',hasta:'2026-10-31',lotes:[],tareas:[],categorias:[],sin_lote:'incluir',agrupar_por:['lote'],metricas:['jornales','costo'],incluir_estado_tarea:false,limite:null,...patch});
const datos = ():DatosLabores => ({tareas:[{id:id(10),nombre:'Tarea',estado:'En proceso',tipo_tarea_id:null,jornales_estimados:null}],tiposTareas:[],lotes:[{id:id(1),nombre:'A',activo:true}],registros:[{id:id(20),tarea_id:id(10),lote_id:id(1),fecha_trabajo:'2026-10-01',fraccion_jornal:1,costo_jornal:1.25},{id:id(21),tarea_id:id(10),lote_id:null,fecha_trabajo:'2026-10-02',fraccion_jornal:.5,costo_jornal:2.25}]});
describe('M6 contratos estructurales backend', () => {
  it('solo anuncia métricas numéricas válidas para ranking', () => {
    const tool = herramientasPlanificador().find(t => (t as {function:{name:string}}).function.name === 'consultar_labores') as {function:{parameters:{properties:{ranking:{properties:{metrica:{enum:string[]}}}}}}};
    const metricas = tool.function.parameters.properties.ranking.properties.metrica.enum;
    expect(metricas).not.toContain('primer_registro'); expect(metricas).not.toContain('ultimo_registro');
    for (const metrica of metricas) expect(() => validarPlan([{nombre:'consultar_labores',argumentos:JSON.stringify(consulta({metricas:[metrica as 'jornales'],ranking:{metrica:metrica as 'jornales',direccion:'desc',n:1,empates:'incluir'}}))}])).not.toThrow();
  });
  it('la partición excluida no presenta cero observado del universo', () => {
    const r = ejecutarConsulta(consulta({lote_ids:[id(1)]}),datos(),'2026-11-06','p1');
    expect(r).toHaveProperty('poblacion.sin_lote.estado','excluido');
    expect(r).toHaveProperty('poblacion.sin_lote.registros',null);
    expect(r).toHaveProperty('poblacion.universo','seleccion_efectiva');
    expect(r.particiones?.sin_lote.jornales).toBeUndefined();
    expect(r.total.jornales).toBe(1);
  });
  it('el costo conserva la precisión de fuente, sin redondear cada grupo', () => {
    const r = ejecutarConsulta(consulta(),datos(),'2026-11-06','p1');
    expect(r.total.costo).toBe(3.5); expect(r.filas.map(f=>f.costo).sort()).toEqual([1.25,2.25]);
  });
  it('selecciona población visible por estado e IDs, aunque los nombres coincidan', () => {
    const animales = [{id:id(1),nombre:'Igual',estado:'activa',etapa:'vaca'}, {id:id(2),nombre:'Igual',estado:'vendida',etapa:'vaca'}];
    const r = resolverSeleccionAnimalesHato({animal_ids:[],nombres:[],chapetas:[],poblacion:{estados:['activa']}} as never, animales);
    expect(r).toEqual({estado:'ok',animales:[animales[0]]});
    expect(resolverSeleccionAnimalesHato({animal_ids:[],nombres:['Igual'],chapetas:[]},animales).estado).toBe('no_resuelto');
  });
  it('la población con campo no leído no se vuelve vacía verificada', () => {
    const r = resolverSeleccionAnimalesHato({animal_ids:[],nombres:[],chapetas:[],poblacion:{estados:['activa']}} as never,[{id:id(1)}]);
    expect(r.estado).toBe('no_disponible');
  });
  it('un selector reproductivo no se evalúa sin el motor ni se vuelve selección global',()=>{
    const r=resolverSeleccionAnimalesHato({animal_ids:[],nombres:[],chapetas:[],poblacion:{estados_reproductivos:['preñada']}},[{id:id(1),estado:'activa'}]);
    expect(r.estado).toBe('no_disponible');
  });

});
