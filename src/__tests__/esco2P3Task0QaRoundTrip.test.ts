// In-process client -> real HTTP handler -> SQL/RLS -> client round trip.
// No browser or live credentials: both the authenticated identity and planner are synthetic.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { ENDPOINT_PRUEBA_ESCO2, ejecutarPruebaEsco2 } from '../utils/esco2ClientePrueba';
import { jwtSintetico, USUARIOS } from './esco2ArnesRls.ts';
import { ID, dependencies, p2Db, p2Seed, plan, tool } from './esco2P2Harness.ts';

const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../utils/supabase/client', () => ({ getSupabase: () => ({ auth }) }));
let db: PGlite;
beforeAll(async () => { db = await p2Db(); }, 30000);
beforeEach(async () => {
  await p2Seed(db);
  await db.query("update tipos_tareas set nombre='Cosecha',categoria='Cosecha' where id=$1", [ID.ty]);
  await db.query("update tareas set nombre=case when id=$1 then 'Cosecha puntual' else 'Otra labor' end", [ID.t1]);
  auth.getSession.mockReset();
  auth.getSession.mockResolvedValue({ data: { session: { user: { id: USUARIOS.gerencia }, access_token: jwtSintetico(USUARIOS.gerencia) } }, error: null });
});
afterAll(async () => { vi.unstubAllGlobals(); await db?.close(); });
function connect() {
  const h = dependencies(db, [tool(plan({ categorias: ['Cosecha'] }))]);
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (url !== ENDPOINT_PRUEBA_ESCO2) throw new Error('Unexpected network destination');
    return manejar(new Request(String(url), init), h.deps);
  });
  vi.stubGlobal('fetch', transport);
  return { ...h, transport };
}

describe('Task 0 QA: diagnostic client and actual handler clarification round trip', () => {
  it.each(['tarea', 'categoria'])('preserves the pending token through free text, then sends exact %s option to resolve the SQL population', async optionId => {
    const h = connect();
    const first = await ejecutarPruebaEsco2('Cosecha del período sintético', USUARIOS.gerencia);
    expect(first.valida).toBe(true);
    expect(first.origen).toBe('aclaracion');
    expect(typeof first.estadoToken).toBe('string');
    expect(first.opcionesAclaracion).toHaveLength(2);
    const repeat = await ejecutarPruebaEsco2('quiero toda la categoría', USUARIOS.gerencia, undefined, { estadoToken: first.estadoToken });
    expect(repeat.origen).toBe('aclaracion');
    expect(repeat.opcionesAclaracion).toEqual(first.opcionesAclaracion);
    const option = repeat.opcionesAclaracion!.find(o => o.id === optionId)!;
    const selected = await ejecutarPruebaEsco2(option.etiqueta, USUARIOS.gerencia, undefined, { estadoToken: repeat.estadoToken, respuestaAclaracion: option.id });
    expect(selected.valida).toBe(true);
    expect(selected.origen).toBe('determinista');
    expect(selected.opcionesAclaracion ?? []).toEqual([]);
    const posted = h.transport.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(posted[0]).not.toHaveProperty('estadoToken');
    expect(posted[1]).toMatchObject({ estadoToken: first.estadoToken });
    expect(posted[1]).not.toHaveProperty('respuestaAclaracion');
    expect(posted[2]).toMatchObject({ estadoToken: repeat.estadoToken, respuestaAclaracion: option.id });
    expect(h.solicitudes).toHaveLength(1);
    expect(selected.respuesta).toContain(optionId === 'tarea' ? 'Se registraron 1,25 jornales;' : 'Se registraron 2,5 jornales;');
  });

  it('rechecks client identity before sending a previously offered choice', async () => {
    const h = connect();
    const first = await ejecutarPruebaEsco2('Cosecha del período sintético', USUARIOS.gerencia);
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: ID.other }, access_token: jwtSintetico(ID.other) } }, error: null });
    await expect(ejecutarPruebaEsco2('Categoría completa', USUARIOS.gerencia, undefined, { estadoToken: first.estadoToken, respuestaAclaracion: 'categoria' })).rejects.toThrow('La sesión cambió');
    expect(h.transport).toHaveBeenCalledTimes(1);
    expect(h.solicitudes).toHaveLength(1);
  });
});
