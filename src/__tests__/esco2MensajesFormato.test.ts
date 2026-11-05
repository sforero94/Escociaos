import type {PGlite} from '@electric-sql/pglite';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {manejar} from '../../supabase/functions/esco-consultas/manejador.ts';
import {formatMillonesCOP} from '../utils/format.ts';
import {renderMensaje,validarMensajeFinal} from '../utils/esco2/mensajes.ts';
import {conocido,resultadoMensaje} from './esco2MensajesFixtures.ts';
import {ID,dependencies,forbidNetwork,p2Db,p2Seed,plan,request,run,tool} from './esco2P2Harness.ts';

// Literal final-output expectations. No expected value calls a production formatter.
describe('Mensajes-v1: regla monetaria de Esco y cantidades es-CO',()=>{
  it.each([
    {value:0,expected:'$0',approx:false},
    {value:1234,expected:'$1,234',approx:false},
    {value:999999,expected:'$999,999',approx:false},
    {value:1000000,expected:'$1.0M',approx:false},
    {value:1500000,expected:'$1.5M',approx:false},
    {value:1449000,expected:'aprox. $1.4M',approx:true},
    {value:9600000,expected:'$9.6M',approx:false},
    {value:9960000,expected:'aprox. $10.0M',approx:true},
    {value:95000000,expected:'$95.0M',approx:false},
    {value:95499999,expected:'aprox. $95.5M',approx:true},
    {value:2000000000,expected:'$2,000M',approx:false},
  ])('costo$value se muestra como$expected',({value,expected,approx})=>{
    const r=resultadoMensaje({total:{jornales:1,costo:value}});const text=renderMensaje([r]);expect(text).toContain(expected);
    // One decimal in [1M,100M); integer amounts outside that band. No COP or billions.
    expect(text).not.toMatch(/\bCOP\b|\$[\d,]+\.\d\d|\dB\b|bill[oó]n/i);
    if(value>=1000000&&value<100000000)expect(text).toMatch(/\$[\d,]+\.\dM/);
    else expect(text).not.toMatch(/\$[\d,]+\.\d/);
    if(approx)expect(text).toMatch(/aprox\.|aproximad/i);else expect(text).not.toMatch(/aprox\.|aproximad/i);
  });
  it.each([
    {value:1,expected:'1 jornal'},
    {value:2,expected:'2 jornales'},
    {value:2.5,expected:'2,5 jornales'},
    {value:1234.25,expected:'1.234,25 jornales'},
  ])('jornales$value conservan solo los decimales del dato',({value,expected})=>{
    const text=renderMensaje([resultadoMensaje({total:{jornales:value}})]);expect(text).toContain(expected);expect(text).not.toMatch(/(?:1|2),00 jornales/);
  });
  it('el formateador compartido conserva el comportamiento previo de otros consumidores',()=>{
    expect(formatMillonesCOP(66529769)).toBe('$66,5M');expect(formatMillonesCOP(2000000000)).toBe('$2.000M');
  });
  it('las fechas de tarea y las métricas de fecha usan el día calendario español sin desplazamiento',()=>{
    const r=resultadoMensaje({total:{jornales:4.5,primer_registro:'2026-10-26',ultimo_registro:'2026-11-01',dias_con_registro:2},filas:[{grupo:{tarea:'Cosecha'},grupo_ids:{tarea:'task-cosecha'},jornales:4.5,fechas_tarea:{estimada_inicio:'2026-10-26',estimada_fin:'2026-11-01',real_inicio:null}}]});
    const text=renderMensaje([r]);expect(text).toContain('26 de octubre de 2026');expect(text).toContain('1 de noviembre de 2026');expect(text).not.toMatch(/2026-10-26|2026-11-01|fecha_inicio_real|primer_registro|estimada_inicio/);
    expect(text).toMatch(/primer registro/i);expect(text).toMatch(/último registro/i);expect(text).toMatch(/días con registro: 2/);
  });
  it('un intervalo bisiesto mantiene ambas fechas incluidas en español',()=>{
    const r=resultadoMensaje({alcance:{...conocido.alcance,desde:'2028-02-29',hasta:'2028-03-01'},filas:[{grupo:{mes:'2028-02'},grupo_ids:{mes:'2028-02'},jornales:4.5}]});const text=renderMensaje([r]);
    expect(text).toContain('Del 29 de febrero de 2028 al 1 de marzo de 2028, ambas fechas incluidas.');expect(text).toContain('- febrero de 2028: 4,5 jornales registrados.');
  });
  it('razones y metadatos ausentes aparecen en español sin nombres de campo',()=>{
    const r=resultadoMensaje({total:{jornales:4.5,jornales_por_arbol:null},notas:['jornales_por_arbol (total): sin lotes de referencia'],filas:[{grupo:{tarea:'Cosecha'},jornales:4.5,campos_no_disponibles:['jornales_estimados','fechas_tarea','estado_actual']}]});
    const text=renderMensaje([r]);expect(text).not.toMatch(/jornales_por_arbol|jornales_estimados|fechas_tarea|estado_actual/);expect(text).toMatch(/árbol/);expect(text).toMatch(/no.*(?:disponible|leer|calcular)|sin dato/i);
  });
});

let db:PGlite;
beforeAll(async()=>{forbidNetwork();db=await p2Db();},30000);
afterAll(async()=>{expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();await db?.close();});
describe('Mensajes-v1: integración HTTP sin modelo real y hoy Bogotá',()=>{
  it('D26 muestra los nombres reales de tareas coincidentes y una sola pregunta concreta',async()=>{
    await p2Seed(db);await db.query(`update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1`,[ID.ty]);
    await db.query(`update tareas set nombre=case when id=$1 then 'Cosecha puntual' when id=$2 then 'Clasificación cosecha' else 'Otra actividad' end`,[ID.t1,ID.t2]);
    const r=await run(db,plan({categorias:['Cosecha']}),{pregunta:'Cosecha'});expect(r.body.origen).toBe('aclaracion');
    expect(r.body.respuesta).toContain('¿Quieres consultar las tareas «Cosecha puntual» y «Clasificación cosecha» o toda la categoría «Cosecha»?');expect(r.body.respuesta.match(/\?/g)).toHaveLength(1);
    expect(r.body.respuesta).not.toContain('llamadas «Cosecha»');expect(r.solicitudes).toHaveLength(1);
    await p2Seed(db);
  });
  it('el texto HTTP de estado demasiado grande se valida completo con su aviso cerrado',async()=>{
    await p2Seed(db);await db.query(`update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1`,[ID.ty]);
    await db.query(`update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra actividad' end`,[ID.t1]);
    const r=await run(db,[plan({categorias:['Cosecha'],proposito:'x'.repeat(65536)}),plan()],{pregunta:'Cosecha y total'});
    expect(r.body.resultados[1].total.jornales).toBe(2.5);expect(r.body.estadoToken).toBeUndefined();
    expect(validarMensajeFinal(r.body.respuesta,r.body.resultados,'contexto_demasiado_amplio')).toBe(true);
    const notice='La selección es demasiado amplia para conservarla. Reduce las tareas seleccionadas y repite la consulta.';expect(r.body.respuesta).toContain(notice);
    expect(validarMensajeFinal(r.body.respuesta.replace(notice,''),r.body.resultados,'contexto_demasiado_amplio')).toBe(false);
    expect(validarMensajeFinal(r.body.respuesta.replace(notice,'Se gastaron 777 millones.'),r.body.resultados,'contexto_demasiado_amplio')).toBe(false);
    await p2Seed(db);
  });
  it('el texto HTTP de contexto expirado se valida completo y no agrega hechos ni planificador',async()=>{
    await p2Seed(db);await db.query(`update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1`,[ID.ty]);
    await db.query(`update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra actividad' end`,[ID.t1]);
    const h=dependencies(db,[tool(plan({categorias:['Cosecha']}))]);const first=await manejar(request({pregunta:'Cosecha'}),h.deps);const a=await first.json();expect(typeof a.estadoToken).toBe('string');
    h.deps.ahora=()=>new Date('2026-11-05T04:46:00Z');const second=await manejar(request({pregunta:'categoría',estadoToken:a.estadoToken,respuestaAclaracion:'categoria'}),h.deps);const b=await second.json();
    expect(b.resultados).toEqual([]);expect(h.solicitudes).toHaveLength(1);expect(b.respuesta).toBe('No pude recuperar el contexto anterior. Repite tu consulta completa.');
    expect(validarMensajeFinal(b.respuesta,b.resultados,'contexto_no_disponible')).toBe(true);expect(validarMensajeFinal('Se gastaron 777 millones.',b.resultados,'contexto_no_disponible')).toBe(false);
    await p2Seed(db);
  });
  it('un contexto perdido conserva la explicación de capacidad y el aviso sin prosa del modelo',async()=>{
    await p2Seed(db);const h=dependencies(db,[{nombre:'fuera_de_alcance',argumentos:JSON.stringify({motivo:'Se gastaron 777 millones.'})}]);
    const response=await manejar(request({pregunta:'inventario',estadoToken:'77777777-7777-4777-8777-777777777777'}),h.deps);const b=await response.json();
    expect(b.resultados).toEqual([]);expect(b.respuesta).toBe('Hoy puedo ayudarte con labores: jornales, costos de mano de obra y tareas programadas. ¿Qué labor quieres consultar?\n\nNo pude recuperar el contexto anterior. Repite tu consulta completa.');
    expect(b.respuesta).not.toContain('777');expect(h.solicitudes).toHaveLength(1);
  });
  it('cerca de medianoche UTC dice4 de noviembre y recorta solo el trabajo registrado',async()=>{
    const r=await run(db,plan({hasta:'2026-11-10'}),{pregunta:'labores hasta hoy'},{ahora:()=>new Date('2026-11-05T04:59:59Z')});
    expect(r.response.status).toBe(200);expect(r.body.hoy).toBe('2026-11-04');expect(r.body.respuesta).toContain('al 4 de noviembre de 2026, ambas fechas incluidas.');expect(r.body.respuesta).not.toContain('5 de noviembre de 2026');expect(r.solicitudes).toHaveLength(1);
  });
});
