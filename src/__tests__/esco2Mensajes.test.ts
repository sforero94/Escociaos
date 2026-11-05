// QA mensajes-v1: independently specified Spanish output/meaning, not numeric membership.
import {describe,expect,it} from 'vitest';
import {renderMensaje,validarMensajeFinal} from '../utils/esco2/mensajes.ts';
import {ALCANCE_VISIBLE,ACLARACION_COSECHA,PERIODO_OCT,PERIODO_NOV,casosMensajes,conocido,cruzado,conciliado,otroPeriodo,ranking,resultadoMensaje,tabla} from './esco2MensajesFixtures.ts';

function exactLine(text:string,line:string){expect(text.split('\n')).toContain(line);}
const forbidden=/task-cosecha|task-poda|record-a|record-b|application-a|application-b|CODE-00|grupo_ids|fecha_trabajo|jornales_estimados|campo_registro_no_disponible|lecturas_sin|sin_lote|vacio_verificado|fuente_no_disponible|snapshot|\bCOP\b/;

describe('Mensajes-v1: estados y texto español fijado antes de ejecutar el renderer',()=>{
  for(const c of casosMensajes)it(`${c.id}: ${c.criterio}`,()=>{
    const text=renderMensaje(c.resultados);for(const line of c.lineas)exactLine(text,line);
    for(const v of c.vinculos){const part=c.resultados.find(r=>r.alcance.desde===v.desde&&r.alcance.hasta===v.hasta)!;expect(part).toBeDefined();const values=v.entidad==='total'?part.total:part.filas.find(f=>Object.values(f.grupo_ids??{}).includes(v.entidad))!;expect(values[v.metrica as keyof typeof values]).toBe(v.valor);exactLine(text,v.fragmento);}
    expect(text).not.toMatch(forbidden);expect(text).not.toContain('777');expect(validarMensajeFinal(text,c.resultados)).toBe(true);
    if(c.id==='costo-null'||c.id==='fuente-no-disponible')expect(text).not.toContain('$0');
    if(c.id==='aclaracion'){expect(text.match(/\?/g)).toHaveLength(1);expect(text).toContain(ACLARACION_COSECHA);}
  });
  it('abre con la respuesta y después fija el período inclusivo, sin encabezado técnico',()=>{
    const text=renderMensaje([conocido]);expect(text.startsWith('Se registraron 4,5 jornales; costo de mano de obra: $95,0M.')).toBe(true);
    expect(text.indexOf(PERIODO_OCT)).toBeGreaterThan(text.indexOf('$95,0M'));expect(text).toContain(ALCANCE_VISIBLE);
  });
});

describe('Mensajes-v1: cada cifra queda ligada a entidad, métrica y período',()=>{
  it('comprueba las parejas entidad/métrica completas, no una bolsa de números presentes',()=>{
    const text=renderMensaje([cruzado]);
    // Deliberate crossed magnitudes: 95 appears as labor for one task and money for another.
    exactLine(text,'Se registraron 97 jornales; costo de mano de obra: $97,0M.');exactLine(text,PERIODO_OCT);
    exactLine(text,'- Cosecha: 95 jornales registrados; costo de mano de obra: $2,0M.');
    exactLine(text,'- Poda: 2 jornales registrados; costo de mano de obra: $95,0M.');
    expect(cruzado.filas[0].grupo_ids?.tarea).toBe('task-cosecha');expect(cruzado.filas[0].jornales).toBe(95);expect(cruzado.filas[0].costo).toBe(2000000);
    expect(cruzado.filas[1].grupo_ids?.tarea).toBe('task-poda');expect(cruzado.filas[1].jornales).toBe(2);expect(cruzado.filas[1].costo).toBe(95000000);
    expect(text).not.toContain('- Cosecha: 2 jornales registrados; costo de mano de obra: $95,0M.');
  });
  it('conserva el orden multipartes y no toma un costo de otro período con los mismos jornales',()=>{
    const text=renderMensaje([conocido,otroPeriodo]);
    const a=text.indexOf('Se registraron 4,5 jornales; costo de mano de obra: $95,0M.');const b=text.indexOf('Se registraron 4,5 jornales; costo de mano de obra: $2,0M.');
    const oct=text.indexOf(PERIODO_OCT);const nov=text.indexOf(PERIODO_NOV);
    const h1=text.indexOf('**Parte 1: Labores registradas**'),h2=text.indexOf('**Parte 2: Labores registradas**');expect(h1).toBe(0);expect(h1).toBeLessThan(a);expect(a).toBeLessThan(oct);expect(oct).toBeLessThan(h2);expect(h2).toBeLessThan(b);expect(b).toBeLessThan(nov);
    expect(conocido.total.costo).toBe(95000000);expect(otroPeriodo.total.costo).toBe(2000000);expect(otroPeriodo.alcance.desde).toBe('2026-11-02');
  });
  it('verifica literalmente cada fila y su cifra en una tabla de más de cinco grupos',()=>{
    const text=renderMensaje([tabla]);
    exactLine(text,'Se registraron 21 jornales; costo de mano de obra: $6,0M.');exactLine(text,PERIODO_OCT);
    exactLine(text,'| Grupo | Jornales registrados | Costo de mano de obra |');
    for(const row of ['| Norte | 1 | $1,0M |','| Sur | 2 | $1,0M |','| Centro | 3 | $1,0M |','| Alto | 4 | $1,0M |','| Bajo | 5 | $1,0M |','| Sin lote | 6 | $1,0M |'])exactLine(text,row);
    expect(text).not.toMatch(/lot-norte|lot-sur|sin_lote/);
  });
  it('ranking declara métrica, orden, empates, población y total completo',()=>{
    const text=renderMensaje([ranking]);exactLine(text,'Se muestran 2 de 4 grupos. El total incluye también los grupos no mostrados.');
    exactLine(text,'Ordenados por costo de mano de obra, de mayor a menor. Se incluyen los empates en el corte.');
    exactLine(text,'- Norte: 2 jornales registrados; costo de mano de obra: $40,0M.');exactLine(text,'- Sur: 1 jornal registrado; costo de mano de obra: $40,0M.');
    expect(text).toContain('costo de mano de obra: $95,0M.');
  });
  it('un ranking sin truncamiento también declara mostrados, elegibles y cero omitidos',()=>{
    const all=structuredClone(ranking);all.total={jornales:3,costo:80000000};all.cobertura.grupos_totales=2;all.cobertura.grupos_mostrados=2;all.semantica!.calificadores=all.semantica!.calificadores.filter(x=>!x.startsWith('grupos:')).concat('grupos:2:mostrados:2');
    const text=renderMensaje([all]);expect(text).toContain('Se muestran 2 de 2 grupos.');expect(text).toContain('Quedan 0 grupos fuera de la lista.');
    expect(text).toContain('Se registraron 3 jornales; costo de mano de obra: $80,0M.');
  });
  it('cierra solo una partición correcta del mismo conjunto de registros',()=>{
    const text=renderMensaje([conciliado]);
    exactLine(text,'Con lote: 4 jornales; sin lote: 0,5 jornales. Suman los 4,5 jornales del total.');
    exactLine(text,'Con lote: $90,0M; sin lote: $5,0M. Suman los $95,0M de costo total.');
    const bad=structuredClone(conciliado);bad.particiones!.con_lote.jornales=4.5;
    expect(renderMensaje([bad])).not.toContain('Suman los 4,5 jornales del total.');
  });
  it('no convierte un costo nulo de una partición en conciliación de costo cero',()=>{
    const partial=structuredClone(conciliado);partial.total.costo=null;partial.particiones!.sin_lote.costo=null;
    const text=renderMensaje([partial]);expect(text).not.toContain('Suman los $');expect(text).not.toContain('sin lote: $0');expect(text).toMatch(/costo.*no.*completo|no.*conciliar.*costo/i);
  });
  it('las asociaciones de tareas con el mismo nombre permanecen ligadas a su fila humana',()=>{
    const duplicate=resultadoMensaje({filas:[
      {grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-a'},jornales:2,costo:40000000,estado_tarea:'Programada',asociaciones:{estado:'conocido',aplicaciones:[{id:'app-a',codigo:'CODE-A',nombre:'Abono',estado:'Cerrada'}]}},
      {grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-b'},jornales:2.5,costo:55000000,estado_tarea:'Completada',asociaciones:{estado:'conocido',aplicaciones:[{id:'app-b',codigo:'CODE-B',nombre:'Riego',estado:'Abierta'}]}},
    ]});
    const text=renderMensaje([duplicate]);const lines=text.split('\n');
    const first=lines.find(l=>l.includes('2 jornales registrados; costo de mano de obra: $40,0M'))!;const second=lines.find(l=>l.includes('2,5 jornales registrados; costo de mano de obra: $55,0M'))!;
    const firstLabel=first.slice(2,first.indexOf(': 2 jornales'));const secondLabel=second.slice(2,second.indexOf(': 2,5 jornales'));
    expect(firstLabel).not.toBe(secondLabel);exactLine(text,`Aplicaciones asociadas a ${firstLabel}: Abono.`);exactLine(text,`Aplicaciones asociadas a ${secondLabel}: Riego.`);
    expect(text).not.toMatch(/task-a|task-b|app-a|app-b|CODE-A|CODE-B/);
  });
  it('una cohorte programada no puede cerrar una conciliación de registros de trabajo',()=>{
    const scheduled=structuredClone(conciliado);scheduled.semantica!.cohorte='tarea_programada';scheduled.semantica!.base_fecha='fecha_estimada_inicio';
    const text=renderMensaje([scheduled]);expect(text).not.toMatch(/Suman los .*del total|También cuadra el costo|separación.*cuadra/);
  });
  it('vacío programado visible se distingue de un cero conocido en métricas de trabajo',()=>{
    const empty=resultadoMensaje({estado:'sin_registros',total:{},filas:[],semantica:{...conocido.semantica!,cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',miembros:[],fuentes:[]}});
    const text=renderMensaje([empty]);exactLine(text,'No hay tareas programadas registradas con inicio planeado en el período consultado entre las que puedes ver.');expect(text).not.toMatch(/0 tareas|0 jornales/);
    const zero=renderMensaje([resultadoMensaje({total:{jornales:0,costo:0}})]);expect(zero).toContain('Se registraron 0 jornales; costo de mano de obra: $0.');expect(zero).not.toContain('No hay registros');
  });
  it('conserva los nombres legítimos con guiones bajos y marcado escapado',()=>{
    const label='Poda_A [sector]*Norte* | control';const r=resultadoMensaje({filas:[{grupo:{tarea:label},grupo_ids:{tarea:'task-a'},jornales:4.5,costo:95000000}]});
    const text=renderMensaje([r]);const visible=text.replace(/\\(.)/g,'$1');expect(visible).toContain(label);
  });
  it('la selección programada dice inicio planeado y estado actual, nunca trabajo ni estado histórico',()=>{
    const scheduled=resultadoMensaje({total:{},semantica:{...conocido.semantica!,cohorte:'tarea_programada',base_fecha:'fecha_estimada_inicio',miembros:['task-cosecha']},alcance:{...conocido.alcance,desde:'2026-11-10',hasta:'2026-11-10'},filas:[{grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},estado_tarea:'Programada'}]});
    const text=renderMensaje([scheduled]);expect(text).toContain('10 de noviembre de 2026');expect(text).toMatch(/inicio.*(?:planeado|estimado)/i);expect(text).toMatch(/estado actual/i);expect(text).not.toMatch(/0 jornales|estado al 10|fecha_estimada_inicio/);
  });
});

// Complete independent expected book: extra statements also fail, not only missing lines.
const cierreVisible='Se consultaron las labores que puedes ver.\nSe incluyen registros sin lote.\nNo verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.';
const summary='Se registraron 4,5 jornales; costo de mano de obra: $95,0M.';
const rowAssociation='- Cosecha: 4,5 jornales registrados; costo de mano de obra: $95,0M.';
const libroCompleto:Record<string,string>={
 'no-resuelto':'No pude identificar el lote que quieres consultar. ¿Te refieres a Norte o Sur?',
 'cero-conocido':['Se registró 1 jornal; costo de mano de obra: $0.',PERIODO_OCT,cierreVisible].join('\n'),
 'vacio-programado':['No hay tareas programadas registradas con inicio planeado en el período consultado entre las que puedes ver.',PERIODO_OCT,ALCANCE_VISIBLE,'Se incluyen tareas sin lote asignado.','Los estados y las asignaciones son los que están registrados ahora; no describen cómo estaban en una fecha pasada.','No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.'].join('\n'),
 conocido:[summary,PERIODO_OCT,'- Cosecha: 2 jornales registrados; costo de mano de obra: $40,0M.','- Poda: 2,5 jornales registrados; costo de mano de obra: $55,0M.',cierreVisible].join('\n'),
 'vacio-visible':['No hay registros de trabajo en el período consultado.','Se registraron 0 jornales; costo de mano de obra: $0.',PERIODO_OCT,cierreVisible].join('\n'),
 'costo-null':['Se registraron 4,5 jornales.',PERIODO_OCT,'El costo no está completo: hay registros sin costo registrado.',cierreVisible].join('\n'),
 'fuente-no-disponible':['No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.',PERIODO_OCT].join('\n'),
 'no-soportado':'Esa consulta todavía no está disponible. Por ahora puedo responder sobre labores registradas y tareas programadas.',
 aclaracion:ACLARACION_COSECHA,
 'estimados-parciales':[summary,PERIODO_OCT,'Jornales estimados para el plan completo de esas tareas: 5.','Es un subtotal conocido: 1 tarea no tiene estimado y el estimado de 1 tarea no se pudo leer.','Es el plan completo de las tareas; no corresponde solo al período consultado.',cierreVisible].join('\n'),
 asociaciones:[summary,PERIODO_OCT,rowAssociation,'Aplicaciones asociadas a Cosecha: Abono y Riego.','Estados actuales registrados de esas aplicaciones: Abono: Cerrada; Riego: Abierta.',cierreVisible].join('\n'),
 'asociacion-desconocida':[summary,PERIODO_OCT,rowAssociation,'No pude comprobar las aplicaciones asociadas a Cosecha porque esos datos no están disponibles.',cierreVisible].join('\n'),
 'asociacion-vacia':[summary,PERIODO_OCT,rowAssociation,'Cosecha no tiene aplicaciones asociadas entre las que puedes ver.',cierreVisible].join('\n'),
};
describe('Mensajes-v1.2: libro literal completo por disposición',()=>{
 for(const c of casosMensajes)it(`${c.id}: no admite texto adicional ni una afirmación omitida`,()=>{expect(renderMensaje(c.resultados)).toBe(libroCompleto[c.id]);});
});

// Test-only bounded numeric audit. Every numeric span of these complete outputs
// has an explicit literal token, exact sentence, source entity/field and period.
// No production formatter, renderer helper or numeric membership is its oracle.
type NumericBinding={token:string;linea:string;parte:number;desde:string;hasta:string;entidad:string;campo:string;valor:unknown;ambito:'periodo_consultado'|'plan_completo_tareas';origen:'total'|'fila'|'fecha'|'estimado'|'cobertura'|'omitidos'|'ordinal'};
const bind=(linea:string,token:string,origen:NumericBinding['origen'],campo:string,valor:unknown,entidad='total',parte=0,desde='2026-10-26',hasta='2026-11-01'):NumericBinding=>({linea,token,origen,campo,valor,entidad:origen==='estimado'?'cohorte_tareas_categoria':entidad,ambito:origen==='estimado'?'plan_completo_tareas':'periodo_consultado',parte,desde,hasta});
function periodBindings(parte=0,nov=false):NumericBinding[]{
 const line=nov?PERIODO_NOV:PERIODO_OCT;const desde=nov?'2026-11-02':'2026-10-26',hasta=nov?'2026-11-08':'2026-11-01';
 return [bind(line,nov?'2':'26','fecha','desde',desde,'total',parte,desde,hasta),bind(line,'2026','fecha','desde',desde,'total',parte,desde,hasta),bind(line,nov?'8':'1','fecha','hasta',hasta,'total',parte,desde,hasta),bind(line,'2026','fecha','hasta',hasta,'total',parte,desde,hasta)];
}
function auditarCadaNumero(text:string,results:typeof conocido[],expected:NumericBinding[]):void{
 const actual=text.split('\n').flatMap(linea=>[...linea.matchAll(/\$?\d+(?:[.,]\d+)*(?:M)?/g)].map(m=>({linea,token:m[0]})));
 expect(actual).toHaveLength(expected.length);
 for(let i=0;i<expected.length;i++){
  const e=expected[i];expect(actual[i],`numeric span ${i}: ${e.entidad}/${e.campo}`).toEqual({linea:e.linea,token:e.token});
  const part=results[e.parte];if(e.ambito==='plan_completo_tareas'){expect(e.entidad).toBe('cohorte_tareas_categoria');expect(part.estimados?.base).toBe('toda_la_categoria');expect(text).toContain('Es el plan completo de las tareas; no corresponde solo al período consultado.');}expect(part.alcance.desde).toBe(e.desde);expect(part.alcance.hasta).toBe(e.hasta);
  let value:unknown;
  if(e.origen==='total')value=part.total[e.campo as keyof typeof part.total];
  else if(e.origen==='fila'){
   const row=part.filas.find(f=>Object.values(f.grupo_ids??{}).includes(e.entidad));expect(row).toBeDefined();value=row![e.campo as keyof typeof row];
  }else if(e.origen==='fecha')value=part.alcance[e.campo as 'desde'|'hasta'];
  else if(e.origen==='estimado')value=part.estimados?.[e.campo as keyof NonNullable<typeof part.estimados>];
  else if(e.origen==='cobertura')value=part.cobertura[e.campo as keyof typeof part.cobertura];
  else if(e.origen==='omitidos')value=part.cobertura.grupos_totales-part.cobertura.grupos_mostrados;
  else value=e.parte+1;
  expect(value,`${e.entidad}/${e.campo}/${e.desde}..${e.hasta}`).toBe(e.valor);
 }
}
const knownNumbers:NumericBinding[]=[
 bind(summary,'4,5','total','jornales',4.5),bind(summary,'$95,0M','total','costo',95000000),...periodBindings(),
 bind('- Cosecha: 2 jornales registrados; costo de mano de obra: $40,0M.','2','fila','jornales',2,'task-cosecha'),bind('- Cosecha: 2 jornales registrados; costo de mano de obra: $40,0M.','$40,0M','fila','costo',40000000,'task-cosecha'),
 bind('- Poda: 2,5 jornales registrados; costo de mano de obra: $55,0M.','2,5','fila','jornales',2.5,'task-poda'),bind('- Poda: 2,5 jornales registrados; costo de mano de obra: $55,0M.','$55,0M','fila','costo',55000000,'task-poda'),
];
describe('Mensajes-v1.2: auditoría exhaustiva de todos los números en salidas representativas',()=>{
 it('cada número del resultado conocido tiene campo, entidad y período; una cifra adicional falla',()=>{
  const text=renderMensaje([conocido]);auditarCadaNumero(text,[conocido],knownNumbers);expect(()=>auditarCadaNumero(text+'\nOtra cifra: 777.',[conocido],knownNumbers)).toThrow();
 });
 it('cada número de la tabla pertenece a la fila correcta aunque todos los costos sean iguales',()=>{
  const numbers=[bind('Se registraron 21 jornales; costo de mano de obra: $6,0M.','21','total','jornales',21),bind('Se registraron 21 jornales; costo de mano de obra: $6,0M.','$6,0M','total','costo',6000000),...periodBindings(),
   bind('| Norte | 1 | $1,0M |','1','fila','jornales',1,'lot-norte'),bind('| Norte | 1 | $1,0M |','$1,0M','fila','costo',1000000,'lot-norte'),
   bind('| Sur | 2 | $1,0M |','2','fila','jornales',2,'lot-sur'),bind('| Sur | 2 | $1,0M |','$1,0M','fila','costo',1000000,'lot-sur'),
   bind('| Centro | 3 | $1,0M |','3','fila','jornales',3,'lot-centro'),bind('| Centro | 3 | $1,0M |','$1,0M','fila','costo',1000000,'lot-centro'),
   bind('| Alto | 4 | $1,0M |','4','fila','jornales',4,'lot-alto'),bind('| Alto | 4 | $1,0M |','$1,0M','fila','costo',1000000,'lot-alto'),
   bind('| Bajo | 5 | $1,0M |','5','fila','jornales',5,'lot-bajo'),bind('| Bajo | 5 | $1,0M |','$1,0M','fila','costo',1000000,'lot-bajo'),
   bind('| Sin lote | 6 | $1,0M |','6','fila','jornales',6,'sin_lote'),bind('| Sin lote | 6 | $1,0M |','$1,0M','fila','costo',1000000,'sin_lote')];
  auditarCadaNumero(renderMensaje([tabla]),[tabla],numbers);
 });
 it('incluye fechas, filas empatadas, mostrados/elegibles y omitidos del ranking',()=>{
  const shown='Se muestran 2 de 4 grupos. El total incluye también los grupos no mostrados.';
  const numbers=[bind(summary,'4,5','total','jornales',4.5),bind(summary,'$95,0M','total','costo',95000000),...periodBindings(),
   bind('- Norte: 2 jornales registrados; costo de mano de obra: $40,0M.','2','fila','jornales',2,'lot-norte'),bind('- Norte: 2 jornales registrados; costo de mano de obra: $40,0M.','$40,0M','fila','costo',40000000,'lot-norte'),
   bind('- Sur: 1 jornal registrado; costo de mano de obra: $40,0M.','1','fila','jornales',1,'lot-sur'),bind('- Sur: 1 jornal registrado; costo de mano de obra: $40,0M.','$40,0M','fila','costo',40000000,'lot-sur'),
   bind(shown,'2','cobertura','grupos_mostrados',2),bind(shown,'4','cobertura','grupos_totales',4),bind('Quedan 2 grupos fuera de la lista.','2','omitidos','grupos_omitidos',2)];
  auditarCadaNumero(renderMensaje([ranking]),[ranking],numbers);
 });
 it('incluye el subtotal y cada contador D30, sin confundir NULL con no leído',()=>{
  const c=casosMensajes.find(c=>c.id==='estimados-parciales')!.resultados[0];
  const partial='Es un subtotal conocido: 1 tarea no tiene estimado y el estimado de 1 tarea no se pudo leer.';
  const numbers=[bind(summary,'4,5','total','jornales',4.5),bind(summary,'$95,0M','total','costo',95000000),...periodBindings(),
   bind('Jornales estimados para el plan completo de esas tareas: 5.','5','estimado','jornales_estimados',5),bind(partial,'1','estimado','tareas_sin_estimado',1),bind(partial,'1','estimado','tareas_estimado_no_disponible',1)];
  auditarCadaNumero(renderMensaje([c]),[c],numbers);
 });
 it('cubre los ordinales y todos los valores/fechas de multipartes; copiar otro período falla',()=>{
  const heading='**Parte 1: Labores registradas**';
  const secondSummary='Se registraron 4,5 jornales; costo de mano de obra: $2,0M.';
  const numbers=[bind(heading,'1','ordinal','parte',1),...knownNumbers,bind('**Parte 2: Labores registradas**','2','ordinal','parte',2,'total',1,'2026-11-02','2026-11-08'),bind(secondSummary,'4,5','total','jornales',4.5,'total',1,'2026-11-02','2026-11-08'),bind(secondSummary,'$2,0M','total','costo',2000000,'total',1,'2026-11-02','2026-11-08'),...periodBindings(1,true)];
  const results=[conocido,otroPeriodo],text=renderMensaje(results);auditarCadaNumero(text,results,numbers);
  expect(()=>auditarCadaNumero(text.replace('$95,0M','$2,0M'),results,numbers)).toThrow();
 });
 it('el validador de números también rechaza cruces de entidades y unidades con cifras ya presentes',()=>{
  const text=renderMensaje([conocido]);const swapped=text.replace('- Cosecha:','- Temporal:').replace('- Poda:','- Cosecha:').replace('- Temporal:','- Poda:');
  expect(()=>auditarCadaNumero(swapped,[conocido],knownNumbers)).toThrow();expect(()=>auditarCadaNumero(text.replace('2 jornales registrados','$2,0M'),[conocido],knownNumbers)).toThrow();
 });
});
