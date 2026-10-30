import { describe, expect, it } from 'vitest';
import { argumentosRespuestaAplicacion, planRespuestaAplicacion, respuestaDeterministaAplicacion } from '../utils/escoConsultas';
import { hechosEjecucionAplicacion } from '../utils/escoAplicacionHechos';
const today='2026-10-30';
const q='Cómo va la aplicación sintética del 2032-04-01 al 2032-04-02';
function fixture(question=q, options: {partial?:boolean;shared?:boolean;tamper?:boolean}={}) {
  const plan=planRespuestaAplicacion(question,today);
  const args=argumentosRespuestaAplicacion(plan,{});
  const movements=[{id:'m1',aplicacion_id:'app',fecha_movimiento:'2032-04-01',lote_id:'l1',consumos:[
    {id:'c1',producto_id:'p1',producto_nombre:'Repetido',unidad:'L',cantidad_utilizada:'0.1'},
    {id:'c2',producto_id:'p1',producto_nombre:'Repetido',unidad:'L',cantidad_utilizada:options.partial?null:'0.2'},
    {id:'c3',producto_id:'p2',producto_nombre:'Repetido',unidad:'cc',cantidad_utilizada:'40'},
  ]}];
  const work=[{id:'w1',tarea_id:'task',fecha_trabajo:'2032-04-01',lote_id:'l1',fraccion_jornal:'0.25',costo_jornal:'11000'}];
  const facts=hechosEjecucionAplicacion(movements,work,{aplicacionId:'app',tareaId:'task',tareaExclusiva:!options.shared,desde:(args.date_from as string)??null,hasta:(args.date_to as string)??null,loteIds:null,consultaCompleta:true,baseSeleccion:args.date_basis as 'actual'|'planned'});
  if(options.tamper) facts.consumos.productos[0].cantidad_total='999';
  const app={id:'app',nombre_aplicacion:'Aplicación [no enlace](https://invalid)',estado:'En ejecución',tarea_id:'task',movimientos:movements,registros_trabajo:work,hechos_ejecucion:facts,
    fecha_inicio_planeada:'2032-03-01',fecha_inicio_ejecucion:null,fechas_inconsistentes:['inicio']};
  const result={seleccion:{estado:'verificada',version:'aplicacion_selector_v1',aplicacion_ids:plan.tipo==='aplicacion'&&plan.plural?null:['app'],lote_ids:null,referencia:'actual'},_evidencia:{herramienta:'get_aplicaciones_ejecucion',consulta_completa:true,detalle_completo:true,total_hechos:1,rango:{desde:args.date_from??null,hasta:args.date_to??null}},resumen:{date_basis:args.date_basis},detalle:[app]};
  const render=(value:unknown=result)=>respuestaDeterministaAplicacion(plan,JSON.stringify(value),args);
  const text=(value:unknown=result)=>{const answer=render(value);expect(answer.tipo).toBe('texto');return answer.tipo==='texto'?answer.texto:'';};
  return {plan,args,result,app,render,text};
}
describe('closed application fact response',()=>{
  it.each(['Cómo va la aplicación y cómo estará la lluvia','Estado de la aplicación móvil','Por qué falló la fumigación','Consumo de la aplicación y quién la capturó','Costo total de la aplicación','Estima la dosis para 4 canecas de la aplicación','Cómo va la aplicación y cuántos empleados trabajaron','Estado de la aplicación y saldo del banco','Consumo de las aplicaciones en noviembre de 2026 y diciembre de 2026','Jornales de la aplicación hoy y ayer','Consumo de las aplicaciones de plaga Z','Estado de la aplicación; saldo del banco','Consumo de la aplicación del 2032-04-01 al 2032-04-02 hoy','Consumo de la aplicación en 2032-04-01'])('does not hijack an unsupported request: %s',question=>{
    expect(planRespuestaAplicacion(question,today).tipo).toBe('fuera');
  });
  it('binds the exact planned interrogative to November and accepts complete zero',()=>{
    for(const prefix of ['', 'Consulta de solo lectura: ']) {
      const f=fixture(prefix+'¿Qué aplicaciones están planeadas para noviembre de 2026?');
      expect(f.args).toEqual({date_basis:'planned',alcance:'periodo',date_from:'2026-11-01',date_to:'2026-11-30'});
      const empty={...f.result,detalle:[],_evidencia:{...f.result._evidencia,total_hechos:0}};
      expect(f.text(empty)).toContain('No encontré registros');
      expect(f.text(empty)).toContain('inicio planeado: 2026-11-01 a 2026-11-30');
      expect(f.text(empty)).toContain('no demuestra ausencia de actividad física');
      expect(f.text({...empty,_evidencia:{...empty._evidencia,total_hechos:1,detalle_completo:false}})).toContain('No pude verificar');
    }
  });
  it('uses exact entity/unit attribution and escapes source labels',()=>{
    const text=fixture().text();
    expect(text).toContain('Repetido (p1) | L | 0.3');
    expect(text).toContain('Repetido (p2) | cc | 40');
    expect(text).toContain('0.25 jornales'); expect(text).toContain('11000 COP');
    expect(text).toContain('\\[no enlace\\]\\(');
    expect(text).toContain('Fechas reales: no registrada');
    expect(text).toContain('fechas contradictorias');
  });
  it('keeps known subtotals without closing an incomplete total',()=>{
    const text=fixture(q,{partial:true}).text();
    expect(text).toContain('0.1 (subtotal verificado; total desconocido)');
    expect(text).toContain('11000 COP'); expect(text).toContain('Cobertura de consumo incompleta');
  });
  it('never attributes a shared task cost to the application',()=>{
    const text=fixture(q,{shared:true}).text();
    expect(text).toContain('Subtotal de la tarea compartida task: 0.25 jornales, 11000 COP');
    expect(text).not.toContain('Costo laboral registrado:');
    expect(text).toContain('no lo atribuí a la aplicación');
  });
  it('rejects altered facts even if their envelope claims completeness',()=>expect(fixture(q,{tamper:true}).text()).toContain('consistencia de los hechos'));
  it.each([false,null,0,''])('rejects falsy error properties: %s',error=>{
    const f=fixture();expect(f.text({...f.result,error})).toContain('No pude verificar');
  });
  it('rejects mismatched ranges, malformed input and saved truncated evidence',()=>{
    const f=fixture();expect(f.text({...f.result,contexto_recortado:true})).toContain('No pude verificar');
    expect(f.text({...f.result,_evidencia:{...f.result._evidencia,rango:{desde:'2032-01-01',hasta:'2032-04-02'}}})).toContain('alcance solicitado');
    expect(respuestaDeterministaAplicacion(f.plan,'[',f.args)).toMatchObject({tipo:'texto',texto:expect.stringContaining('No pude verificar')});
  });
  it('does not invent unasked date, state or lot filters',()=>{
    const p=planRespuestaAplicacion('Cómo va la aplicación sintética',today);
    expect(argumentosRespuestaAplicacion(p,{date_from:'2026-10-26',date_to:today,estado:'En ejecución',lote_name:'inventado',application_id:'app'})).toEqual({date_basis:'actual',alcance:'actual',application_id:'app'});
  });
  it('does not let actual plural cohorts inherit unrequested model identity filters',()=>{
    const p=planRespuestaAplicacion('Consumo de las aplicaciones en noviembre de 2026',today);
    expect(argumentosRespuestaAplicacion(p,{application_id:'inventado',application_name:'Inventado'})).toEqual({date_basis:'actual',alcance:'periodo',date_from:'2026-11-01',date_to:'2026-11-30'});
  });
  it('supports requested fields without exposing unrequested financial facts',()=>{
    expect(fixture('Estado de la aplicación sintética').text()).not.toContain('11000');
    expect(fixture(q+' sin costos').text()).not.toContain('11000');
  });
  it('rejects details outside the verified identity instead of choosing a candidate',()=>{
    const f=fixture();expect(f.text({...f.result,detalle:[f.app,{...f.app,id:'other',nombre_aplicacion:'Otra'}],_evidencia:{...f.result._evidencia,total_hechos:2}})).toContain('No pude verificar la identidad solicitada');
  });
  it('bounds the displayed response and requests narrower scope instead of silently truncating',()=>{
    const f=fixture(); const answer=f.text({...f.result,detalle:[{...f.app,nombre_aplicacion:'X'.repeat(24001)}]});
    expect(new TextEncoder().encode(answer).length).toBeLessThanOrEqual(24000);
    expect(answer).toContain('Precisa una aplicación, producto o lote');
    expect(answer).not.toContain('X'.repeat(100));
  });
  it('requires verified, unique mix/lot/product inputs for labelled theoretical calculation',()=>{
    const f=fixture('Estima la dosis de la aplicación con canecas planeadas');
    const a={...f.app,plan_por_lote:[{id:'lp',mezcla_id:'mix',lote_id:'l1',numero_canecas:'3'}],productos_planeados:[{id:'rp',mezcla_id:'mix',producto_id:'p1',producto_nombre:'Sintético',unidad_dosis:'cc',dosis_por_caneca:'40'}]};
    expect(f.text({...f.result,detalle:[a]})).toContain('40 cc/caneca × 3 canecas planeadas = 120 cc estimados');
    const partial=f.text({...f.result,detalle:[{...a,productos_planeados:[...a.productos_planeados,{...a.productos_planeados[0],id:'rp2',producto_id:'p2',unidad_dosis:null}]}]});
    expect(partial).toContain('120 cc estimados'); expect(partial).toContain('Estimación parcial'); expect(partial).not.toContain('plan completo');
    expect(f.text({...f.result,detalle:[{...a,productos_planeados:[...a.productos_planeados,...a.productos_planeados]}]})).toContain('no calculé la estimación');
    expect(f.text({...f.result,detalle:[{...a,productos_planeados:[{...a.productos_planeados[0],unidad_dosis:null}]}]})).toContain('no calculé la estimación');
  });
});
