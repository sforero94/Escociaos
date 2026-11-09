// P2: contrato público por el manejador real, loop y constructor, sin proveedor pagado.
import { describe, expect, it, vi } from 'vitest';
import { manejar, type ClienteUsuario } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';

const USO = { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 };
const respuesta = (texto = '', llamadas: RespuestaLLM['llamadas'] = []): RespuestaLLM => ({ texto, llamadas, uso: USO, ms: 1, modelo: 'sintetico', finishReason: llamadas.length ? 'tool_calls' : 'stop' });
const sql = (n = 1) => ({ nombre: 'consultar_sql', argumentos: JSON.stringify({ sql: `select ${n} as total`, proposito: 'Comprobar dato sintético' }) });
const visual = (spec: Record<string, unknown>) => ({ nombre: 'mostrar_visual', argumentos: JSON.stringify(spec) });
const tabla = (consulta = 1) => ({ tipo: 'tabla', titulo: 'Serie sintética', consulta, columnas: [{ columna: 'mes', etiqueta: 'Mes', formato: 'texto' }, { columna: 'total', etiqueta: 'Total', formato: 'numero' }] });
const grafica = (consulta = 1) => ({ tipo: 'grafica', titulo: 'Serie sintética', consulta, forma: 'bar', x: 'mes', y: ['total'], formato: 'numero' });

function escenario(filas: Record<string, unknown>[], respuestas: RespuestaLLM[], truncado = false) {
  const solicitudes: SolicitudLLM[] = [];
  const pendientes = [...respuestas];
  const llm: ClienteLLM = { completar: async (s) => {
    solicitudes.push(structuredClone(s));
    const r = pendientes.shift();
    if (!r) throw new Error('Fixture LLM agotada');
    return r;
  } };
  const rpc = vi.fn<() => Promise<{ data: unknown; error: { code: string; message: string } | null }>>(async () => ({ data: { filas, n_filas: filas.length, truncado }, error: null }));
  const registrar = vi.fn();
  const id = '11111111-1111-4111-8111-111111111111';
  const cliente = {
    rpc,
    auth: { getUser: async () => ({ data: { user: { id } }, error: null }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ id, rol: 'Gerencia', activo: true }], error: null }) }) }),
  } as unknown as ClienteUsuario;
  return {
    solicitudes, rpc, registrar,
    ejecutar: async () => {
      const req = new Request('http://local/esco-consultas', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer sintetico' }, body: JSON.stringify({ pregunta: 'Consulta sintética', motor: 'sql' }) });
      const res = await manejar(req, {
        env: (nombre) => ({ OPENROUTER_API_KEY: 'sintetico', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'sintetico' } as Record<string, string>)[nombre],
        crearClienteUsuario: () => cliente, crearLLM: () => llm,
        ahora: () => new Date('2026-11-08T17:00:00Z'), registrar,
      });
      return { estado: res.status, cuerpo: await res.json() as Record<string, unknown> };
    },
  };
}

const serie = (n: number) => Array.from({ length: n }, (_, i) => ({ mes: `m${i}`, total: i + 0.125, secreto_no_seleccionado: `interno-${i}` }));

describe('P2 — contrato HTTP → loop → visual', () => {
  it('conserva respuesta para clientes anteriores y expone contrato v1 sin filas en la traza', async () => {
    const s = escenario([{ total: 0 }], [respuesta('', [sql()]), respuesta('Listo')]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ respuesta: 'Listo', texto: 'Listo', bloques: [], sugerencias: [] });
    const consultas = r.cuerpo.consultas as Record<string, unknown>[];
    expect(consultas).toHaveLength(1);
    expect(consultas[0]).not.toHaveProperty('filas');
    expect(consultas[0]).not.toHaveProperty('filas_muestra');
    expect(consultas[0]).toHaveProperty('ms');
  });

  it('crea una gráfica desde todas las filas incluso después de la muestra veinte y proyecta solo las columnas elegidas', async () => {
    const filas = serie(60);
    const s = escenario(filas, [respuesta('', [sql()]), respuesta('', [visual(grafica())]), respuesta('Serie preparada')]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    const bloques = r.cuerpo.bloques as { datos: Record<string, unknown>[] }[];
    expect(bloques).toHaveLength(1);
    expect(bloques[0].datos).toEqual(filas.map(({ mes, total }) => ({ mes, total })));
    expect(bloques[0].datos[59]).toEqual({ mes: 'm59', total: 59.125 });
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto_no_seleccionado');
    const tool = s.solicitudes[1].mensajes.filter((m) => m.role === 'tool').at(-1)!.content;
    const muestra = JSON.parse(tool.slice(tool.indexOf('\n') + 1));
    expect(muestra).toHaveLength(20);
  });

  it.each([
    ['consulta inexistente', { ...grafica(), consulta: 2 }, serie(2)],
    ['columna inexistente', { ...grafica(), y: ['inventado'] }, serie(2)],
    ['valores inyectados por el modelo', { ...grafica(), datos: [{ mes: 'inventado', total: 999 }] }, serie(2)],
    ['eje no numérico', grafica(), [{ mes: 'a', total: '999' }]],
    ['más de sesenta puntos', grafica(), serie(61)],
    ['tipo no admitido', { ...grafica(), tipo: 'imagen' }, serie(2)],
  ])('descarta %s en el recorrido real y registra solo diagnóstico agregado', async (_nombre, spec, filas) => {
    const s = escenario(filas, [respuesta('', [sql()]), respuesta('', [visual(spec)]), respuesta('Texto disponible')]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.bloques).toEqual([]);
    expect(r.cuerpo.texto).toBe('Texto disponible');
    expect(s.registrar).toHaveBeenCalledWith(expect.objectContaining({ evento: 'visual_descartado', motivo: expect.any(String) }));
    const log = JSON.stringify(s.registrar.mock.calls);
    expect(log).not.toContain('interno-');
    expect(log).not.toContain('select ');
    expect(log).not.toContain('Consulta sintética');
  });

  it('conserva quinientas filas proyectadas para exportar y hace explícito el truncado de origen', async () => {
    const filas = serie(500);
    const s = escenario(filas, [respuesta('', [sql()]), respuesta('', [visual(tabla())]), respuesta('Detalle preparado')], true);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    const bloques = r.cuerpo.bloques as { filas: Record<string, unknown>[]; total_filas: number; truncado: boolean; aviso?: string }[];
    expect(bloques).toHaveLength(1);
    expect(bloques[0].filas).toEqual(filas.map(({ mes, total }) => ({ mes, total })));
    expect(bloques[0].total_filas).toBe(500);
    expect(bloques[0].truncado).toBe(true);
    expect(bloques[0].aviso).toMatch(/truncad/i);
    expect(JSON.stringify(r.cuerpo)).not.toContain('secreto_no_seleccionado');
  });

  it('no construye visuales sobre una consulta que falló aunque el modelo los pida', async () => {
    const s = escenario([], [respuesta('', [sql()]), respuesta('', [visual(tabla())]), respuesta('No se pudo leer')]);
    s.rpc.mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'columna sintética ausente' } });
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.bloques).toEqual([]);
    expect(r.cuerpo.texto).toBe('No se pudo leer');
    expect(s.rpc).toHaveBeenCalledTimes(1);
  });

  it('no gasta el presupuesto de consultas al pedir visuales y aún visualiza la cuarta consulta', async () => {
    const s = escenario(serie(1), [
      respuesta('', [sql(1), visual(tabla(1)), sql(2), visual(tabla(2))]),
      respuesta('', [sql(3), sql(4)]),
      respuesta('', [visual(grafica(4))]),
      respuesta('Final'),
    ]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(s.rpc).toHaveBeenCalledTimes(4);
    const bloques = r.cuerpo.bloques as { consulta: number }[];
    expect(bloques.map((b) => b.consulta)).toEqual([1, 2, 4]);
    expect(s.solicitudes[2].herramientas).toEqual(expect.arrayContaining([expect.objectContaining({ function: expect.objectContaining({ name: 'mostrar_visual' }) })]));
  });

  it('limita a cuatro bloques aunque el modelo pida cinco juntos', async () => {
    const s = escenario(serie(1), [respuesta('', [sql()]), respuesta('', Array.from({ length: 5 }, () => visual(tabla()))), respuesta('Final')]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.bloques).toHaveLength(4);
  });

  it.each([
    ['contrato JSON incompleto', '{"texto":"Privado","bloques":[{"valor":999}'],
    ['JSON cercado incompleto', '```json\n{"texto":"Privado","bloques":[{"valor":999}'],
    ['chart cercado incompleto', 'Texto disponible\n```chart\n{"datos":[{"valor":999}]'],
  ])('no deja pasar %s al texto visible', async (_nombre, bruto) => {
    const s = escenario([], [respuesta(bruto)]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.bloques).toEqual([]);
    expect(r.cuerpo.texto).not.toContain('999');
    expect(r.cuerpo.texto).not.toContain('```chart');
  });

  it('acota rondas si el proveedor insiste en herramientas inválidas sin ejecutar SQL', async () => {
    const s = escenario([], [...Array.from({ length: 10 }, () => respuesta('', [visual({ tipo: 'inventado', consulta: 1 })])), respuesta('No pude preparar el visual')]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.texto).toBe('No pude preparar el visual');
    expect(s.solicitudes).toHaveLength(11);
    expect(s.solicitudes.at(-1)?.herramientas).toBeUndefined();
    expect(s.rpc).not.toHaveBeenCalled();
    const mensajes = s.solicitudes.at(-1)!.mensajes;
    const ids = mensajes.flatMap((m) => m.tool_calls?.map((c) => c.id) ?? []);
    expect(new Set(ids).size).toBe(ids.length);
    expect(mensajes.filter((m) => m.role === 'tool').map((m) => m.tool_call_id)).toEqual(ids);
  });

  it('ignora bloques y trazas que el modelo intente escribir en el contenido final', async () => {
    const s = escenario([], [respuesta(JSON.stringify({ texto: 'Texto disponible', sugerencias: [], bloques: [{ tipo: 'tarjeta', items: [{ valor: 999 }] }], consultas: [{ sql: 'select inventado', filas: [{ total: 999 }] }] }))]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo.texto).toBe('Texto disponible');
    expect(r.cuerpo.bloques).toEqual([]);
    expect(r.cuerpo.consultas).toEqual([]);
    expect(JSON.stringify(r.cuerpo)).not.toContain('999');
  });

  it('extrae sugerencias y aclaración del contenido final sin exponer el JSON en texto', async () => {
    const s = escenario([], [respuesta(JSON.stringify({ texto: '¿Qué período quieres?', sugerencias: ['Ver detalle', 'Comparar períodos'], aclaracion: { pregunta: '¿Qué período quieres?', opciones: ['Este mes', 'El mes pasado'] } }))]);
    const r = await s.ejecutar();
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatchObject({ texto: '¿Qué período quieres?', respuesta: '¿Qué período quieres?', bloques: [], sugerencias: ['Ver detalle', 'Comparar períodos'], aclaracion: { pregunta: '¿Qué período quieres?', opciones: ['Este mes', 'El mes pasado'] } });
  });

  it('descarta cifras de sugerencias y opciones, limita las sugerencias y no fabrica datos visuales', async () => {
    const s = escenario([], [respuesta(JSON.stringify({ texto: 'Aclara el alcance', sugerencias: ['Ver $99M', 'Ver detalle', 'Comparar períodos', 'Ver tendencia', 'Otra opción'], aclaracion: { pregunta: '¿Qué período?', opciones: ['En 2026', 'Este mes'] } }))]);
    const r = await s.ejecutar();
    const sugerencias = r.cuerpo.sugerencias as string[];
    expect(sugerencias.length).toBeLessThanOrEqual(3);
    expect(sugerencias).not.toContain('Ver $99M');
    expect(JSON.stringify(r.cuerpo.aclaracion)).not.toContain('2026');
    expect(r.cuerpo.bloques).toEqual([]);
  });
});
