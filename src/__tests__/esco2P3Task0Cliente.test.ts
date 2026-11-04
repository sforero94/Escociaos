import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ejecutarPruebaEsco2 } from '../utils/esco2ClientePrueba';

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../utils/supabase/client', () => ({ getSupabase: () => ({ auth }) }));
const TOKEN = '11111111-1111-4111-8111-111111111111';
const opciones = [{ id: 'tarea', etiqueta: 'La tarea Cosecha' }, { id: 'categoria', etiqueta: 'La categoría Cosecha' }];
const cuerpo = { respuesta: 'Elige una opción.', origen: 'aclaracion', hoy: '2026-11-04', ruta: null, ajustes: [], plan: null, resultados: [], llamadas: [], ms: 1, estadoToken: TOKEN, opcionesAclaracion: opciones };
let http: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user' }, access_token: 'synthetic-jwt' } }, error: null });
  http = vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 }));
  vi.stubGlobal('fetch', http);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('diagnóstico: transporte de aclaraciones', () => {
  it('conserva las opciones y el token opaco del servidor', async () => {
    const result = await ejecutarPruebaEsco2('Cosecha', 'user');
    expect(result).toMatchObject({ valida: true, estadoToken: TOKEN, opcionesAclaracion: opciones });
  });
  it('envía el ID elegido y su token sin convertir la etiqueta en alcance', async () => {
    await ejecutarPruebaEsco2('La categoría Cosecha', 'user', undefined, { estadoToken: TOKEN, respuestaAclaracion: 'categoria' });
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({ pregunta: 'La categoría Cosecha', historial: [], estadoToken: TOKEN, respuestaAclaracion: 'categoria' });
    expect(http).toHaveBeenCalledTimes(1);
  });
  it('conserva el token para texto libre pendiente sin fabricar una elección', async () => {
    await ejecutarPruebaEsco2('la categoría por favor', 'user', undefined, { estadoToken: TOKEN });
    expect(JSON.parse(http.mock.calls[0][1].body)).toEqual({ pregunta: 'la categoría por favor', historial: [], estadoToken: TOKEN });
  });
  it('rechaza una elección sin token antes de contactar al servidor', async () => {
    await expect(ejecutarPruebaEsco2('Categoría', 'user', undefined, { respuestaAclaracion: 'categoria' })).rejects.toThrow();
    expect(http).not.toHaveBeenCalled();
  });
  it.each([
    { estadoToken: 'invalid' },
    { opcionesAclaracion: 'tarea' },
    { opcionesAclaracion: [{ id: 'tarea' }] },
    { opcionesAclaracion: [{ id: '', etiqueta: 'Tarea' }] },
    { opcionesAclaracion: [{ id: 'tarea', etiqueta: 'Tarea' }, { id: 'tarea', etiqueta: 'Otra' }] },
    { estadoToken: undefined },
  ])('no expone opciones con transporte inválido: %j', async patch => {
    http.mockResolvedValue(new Response(JSON.stringify({ ...cuerpo, ...patch }), { status: 200 }));
    const result = await ejecutarPruebaEsco2('Cosecha', 'user');
    expect(result.valida).toBe(false);
    expect(result).not.toHaveProperty('estadoToken');
    expect(result).not.toHaveProperty('opcionesAclaracion');
  });
  it('acepta un reinicio explícito del servidor sin token y con opciones vacías', async () => {
    http.mockResolvedValue(new Response(JSON.stringify({ ...cuerpo, estadoToken: undefined, opcionesAclaracion: [] }), { status: 200 }));
    const result = await ejecutarPruebaEsco2('Categoría', 'user', undefined, { estadoToken: TOKEN, respuestaAclaracion: 'categoria' });
    expect(result.valida).toBe(true);
    expect(result.estadoToken).toBeUndefined();
    expect(result.opcionesAclaracion).toEqual([]);
  });
});
