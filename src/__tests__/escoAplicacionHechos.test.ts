import { describe, expect, it } from 'vitest';
import { hechosEjecucionAplicacion, type AlcanceHechosAplicacion } from '../utils/escoAplicacionHechos';
const scope: AlcanceHechosAplicacion = { aplicacionId: 'app', tareaId: 'task', tareaExclusiva: true,
  desde: '2032-04-01', hasta: '2032-04-02', loteIds: null, consultaCompleta: true, baseSeleccion: 'actual' };
const c = (id: string, value: unknown = '1.25', producto_id: unknown = 'p1', unidad: unknown = 'L') =>
  ({ id, producto_id, unidad, producto_nombre: 'Etiqueta sintética repetida', cantidad_utilizada: value });
const m = (id: string, consumos = [c('c-'+id)], fecha_movimiento: unknown = '2032-04-01', lote_id: unknown = 'l1') =>
  ({ id, aplicacion_id: 'app', lote_id, fecha_movimiento, consumos });
const w = (id: string, fraccion_jornal: unknown = '0.25', costo_jornal: unknown = '11000', fecha_trabajo: unknown = '2032-04-01', lote_id: unknown = 'l1') =>
  ({ id, tarea_id: 'task', lote_id, fecha_trabajo, fraccion_jornal, costo_jornal });
describe('authoritative registered application facts', () => {
  it('sums exact decimals while preserving product identity and incompatible units', () => {
    const r = hechosEjecucionAplicacion([m('m1',[c('c1','0.1'),c('c2','0.2'),c('c3',40,'p1','cc'),c('c4',5,'p2')])],[],scope);
    expect(r.consumos.productos.map(p=>[p.producto_id,p.unidad,p.cantidad_total])).toEqual([
      ['p1','L','0.3'],['p1','cc','40'],['p2','L','5'],
    ]);
  });
  it('scopes actual movement and labor dates/lot independently of application planned dates', () => {
    const r = hechosEjecucionAplicacion([m('a'),m('b',[c('b',99)],'2032-03-31'),m('c',[c('c',20)],'2032-04-02','l2')],
      [w('a'),w('b',1,99000,'2032-03-31'),w('c',1,44000,'2032-04-02','l2')],{...scope,loteIds:['l1'],baseSeleccion:'planned'});
    expect(r.consumos.productos[0].cantidad_total).toBe('1.25');
    expect(r.trabajo).toMatchObject({jornales_total:'0.25',costo_total_cop:'11000',registros_fuera_alcance:2});
    expect(r.alcance).toMatchObject({base_seleccion_aplicacion:'planned',fecha_consumos:'fecha_movimiento',fecha_trabajo:'fecha_trabajo'});
  });
  it('adds stored labor costs once instead of multiplying by fractions again', () => {
    const r = hechosEjecucionAplicacion([], [w('a'),w('b','0.5','22000')],scope);
    expect(r.trabajo).toMatchObject({jornales_total:'0.75',costo_total_cop:'33000'});
  });
  it('keeps missing cost independent from verified labor fractions', () => {
    const r = hechosEjecucionAplicacion([], [w('a'),w('b','0.5',null)],scope);
    expect(r.trabajo).toMatchObject({jornales_total:'0.75',costo_total_cop:null,costo_verificado_cop:'11000',registros_costos_invalidos:1});
  });
  it('does not impute zero from empty capture, and preserves an actual registered zero', () => {
    const empty=hechosEjecucionAplicacion([],[],scope);
    expect(empty.consumos.productos).toEqual([]);
    expect(empty.trabajo).toMatchObject({jornales_total:null,costo_total_cop:null,registros_en_alcance:0});
    expect(hechosEjecucionAplicacion([m('a',[c('a',0)])],[],scope).consumos.productos[0].cantidad_total).toBe('0');
  });
  it('keeps known subtotals but never closes totals after incomplete source coverage', () => {
    const r=hechosEjecucionAplicacion([m('a')],[w('a')],{...scope,consultaCompleta:false});
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:null,cantidad_verificada:'1.25'});
    expect(r.trabajo).toMatchObject({jornales_total:null,jornales_verificados:'0.25',costo_total_cop:null,costo_verificado_cop:'11000'});
  });
  it('a movement without consumption detail prevents a closed consumption total', () => {
    const r=hechosEjecucionAplicacion([m('a'),m('b',[])],[],scope);
    expect(r.consumos.movimientos_sin_detalle).toBe(1);
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:null,cantidad_verificada:'1.25'});
  });
  it.each([null,undefined,'',NaN,Infinity,true,'0x10','1,25','1_000',Number.MAX_SAFE_INTEGER+1])('does not turn an unverifiable quantity into zero: %s',value=>{
    const r=hechosEjecucionAplicacion([m('a',[{...c('a'),cantidad_utilizada:value},c('b',2.5)])],[],scope);
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:null,cantidad_verificada:'2.5',registros_invalidos:1});
  });
  it('does not count duplicated consumption identity twice or choose a conflicting version', () => {
    const r=hechosEjecucionAplicacion([m('a',[c('same',1),c('same',99),c('unique',2)])],[],scope);
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:null,cantidad_verificada:'2',registros_invalidos:2});
  });
  it('duplicate movement or labor identity stays unassigned, not silently deduplicated', () => {
    const r=hechosEjecucionAplicacion([m('same'),m('same')],[w('same'),w('same')],scope);
    expect(r.consumos).toMatchObject({movimientos_no_atribuibles:2,cobertura_cerrada:false});
    expect(r.trabajo).toMatchObject({registros_no_atribuibles:2,jornales_total:null,costo_total_cop:null});
  });
  it('never merges a missing product identity by display name', () => {
    const r=hechosEjecucionAplicacion([m('a',[c('a'),c('b',99,null)])],[],scope);
    expect(r.consumos.filas_sin_producto).toBe(1);
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:null,cantidad_verificada:'1.25'});
  });
  it('unknown unit prevents closure for that product, leaving unrelated products useful', () => {
    const r=hechosEjecucionAplicacion([m('a',[c('a'),c('b',99,'p1',null),c('c',7,'p2')])],[],scope);
    expect(r.consumos.productos[0].cantidad_total).toBeNull();
    expect(r.consumos.productos[1].cantidad_total).toBe('7');
    expect(r.consumos.cobertura_cerrada).toBe(false);
  });
  it('does not assign missing dates or lots to the requested scope', () => {
    const r=hechosEjecucionAplicacion([m('a'),m('b',[c('b',99)],null)],[w('a'),w('b',1,99,'2032-02-30'),w('c',1,99,'2032-04-01',null)],{...scope,loteIds:['l1']});
    expect(r.consumos).toMatchObject({movimientos_no_atribuibles:1,cobertura_cerrada:false});
    expect(r.trabajo).toMatchObject({registros_no_atribuibles:2,jornales_total:null,jornales_verificados:'0.25'});
  });
  it('does not claim application labor from a shared or absent task link', () => {
    const shared=hechosEjecucionAplicacion([],[w('a')],{...scope,tareaExclusiva:false});
    expect(shared.trabajo).toMatchObject({atribucion:'tarea_compartida',jornales_total:null,jornales_verificados:'0.25'});
    expect(hechosEjecucionAplicacion([],[],{...scope,tareaId:null}).trabajo.jornales_total).toBeNull();
  });
  it('preserves signed corrections and scientific notation as registered decimals', () => {
    const r=hechosEjecucionAplicacion([m('a',[c('a','1.25'),c('b','-0.25'),c('c','1e-3')])],[],scope);
    expect(r.consumos.productos[0].cantidad_total).toBe('1.001');
  });
  it('preserves large exact decimal strings instead of passing through a floating-point conversion', () => {
    const r=hechosEjecucionAplicacion([m('a',[c('a','9007199254740993.25'),c('b','0.75')])],[],scope);
    expect(r.consumos.productos[0].cantidad_total).toBe('9007199254740994');
  });
  it('excludes known other applications and tasks without contaminating this scoped total', () => {
    const r=hechosEjecucionAplicacion([m('a'),{...m('other'),aplicacion_id:'other'}],[w('a'),{...w('other'),tarea_id:'other'}],scope);
    expect(r.consumos.productos[0].cantidad_total).toBe('1.25');
    expect(r.trabajo.costo_total_cop).toBe('11000');
  });
  it('bounds exposed group detail with explicit omissions after aggregating every source row', () => {
    const r=hechosEjecucionAplicacion([m('a',Array.from({length:101},(_,i)=>c('c'+i,i,'p'+i)))],[],scope);
    expect(r.consumos).toMatchObject({grupos_total:101,grupos_omitidos:1,detalle_productos_completo:false});
    expect(r.consumos.productos).toHaveLength(100);
  });
  it('includes late observations instead of limiting the arithmetic to a sample', () => {
    const r=hechosEjecucionAplicacion([m('a',Array.from({length:20000},(_,i)=>c('c'+i,'0.1')))],[],scope);
    expect(r.consumos.productos[0]).toMatchObject({cantidad_total:'2000',registros_verificados:20000});
  });
  it('rejects inputs above the existing 20000-row budget instead of publishing partial arithmetic', () => {
    expect(()=>hechosEjecucionAplicacion([m('a',Array.from({length:20001},(_,i)=>c('c'+i)))],[],scope)).toThrow('límite');
  });
  it('marks display-label shortening without changing permanent identity', () => {
    const row={...c('a'),producto_nombre:'ñ'.repeat(100)};
    const r=hechosEjecucionAplicacion([m('a',[row])],[],scope).consumos.productos[0];
    expect(r).toMatchObject({producto_id:'p1',nombre_recortado:true});expect(r.producto_nombre).toHaveLength(80);
  });
});
