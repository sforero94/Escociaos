// esco-consultas (M3): manejador HTTP sobre Postgres real con las políticas RLS de
// producción (PGlite). Datos sintéticos. Ver src/__tests__/esco2ArnesRls.ts.

import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fuenteSupabase } from '../utils/esco2/fuente.ts';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { fechaBogota, manejar, validarSolicitud, type Dependencias } from '../../supabase/functions/esco-consultas/manejador.ts';
import { clienteRls, crearBaseRls, jwtSintetico, N_REGISTROS, USUARIOS, type Traza } from './esco2ArnesRls.ts';

let db: PGlite;
beforeAll(async () => {
  db = await crearBaseRls();
}, 30_000);
afterAll(async () => {
  await db?.close();
});

function llmFalso(): ClienteLLM & { solicitudes: SolicitudLLM[] } {
  const solicitudes: SolicitudLLM[] = [];
  const r = (p: Partial<RespuestaLLM>, modelo: string): RespuestaLLM => ({
    texto: '',
    llamadas: [],
    uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 },
    ms: 1,
    modelo,
    finishReason: 'stop',
    ...p,
  });
  return {
    solicitudes,
    async completar(s) {
      solicitudes.push(s);
      if (s.herramientas) {
        return r(
          {
            llamadas: [
              {
                nombre: 'consultar_labores',
                argumentos: JSON.stringify({ proposito: 'mayo', desde: '2026-05-01', hasta: '2026-05-31', agrupar_por: ['lote'], metricas: ['jornales', 'costo'] }),
              },
            ],
          },
          s.modelo,
        );
      }
      return r({ texto: 'Listo.' }, s.modelo);
    },
  };
}

const ENV: Record<string, string> = { OPENROUTER_API_KEY: 'sk-prueba', SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'anon-prueba' };

function deps(over: Partial<Dependencias> & { traza?: Traza; llm?: ClienteLLM } = {}): Dependencias & { eventos: Record<string, unknown>[] } {
  const eventos: Record<string, unknown>[] = [];
  const llm = over.llm ?? llmFalso();
  return {
    eventos,
    env: (n) => ENV[n],
    crearClienteUsuario: (jwt) => clienteRls(db, jwt, over.traza),
    crearLLM: () => llm,
    ahora: () => new Date('2026-06-02T15:00:00Z'),
    registrar: (e) => eventos.push(e),
    ...over,
  };
}

function post(cuerpo: unknown, jwt?: string): Request {
  return new Request('http://local/functions/v1/esco-consultas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(cuerpo),
  });
}

describe('esco-consultas: acceso', () => {
  it('Gerencia activa: 200 con resultados iguales a la suma de la base, leída en varias páginas', async () => {
    const traza: Traza = { consultas: [] };
    const llm = llmFalso();
    const res = await manejar(post({ pregunta: '¿jornales de mayo por lote?' }, jwtSintetico(USUARIOS.gerencia)), deps({ traza, llm }));
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.origen).toBe('compositor');
    expect(cuerpo.hoy).toBe('2026-06-02');

    // Oráculo: la misma suma, calculada por Postgres como superusuario.
    const o = await db.query<{ j: string; n: number; sin_lote: number }>(
      `select sum(fraccion_jornal::text::numeric)::text j, count(*)::int n, count(*) filter (where lote_id is null)::int sin_lote
       from registros_trabajo where fecha_trabajo between '2026-05-01' and '2026-05-31'`,
    );
    expect(o.rows[0].n).toBe(N_REGISTROS);
    expect(cuerpo.resultados[0].total.jornales).toBe(Number(o.rows[0].j));
    expect(cuerpo.resultados[0].cobertura.registros).toBe(N_REGISTROS);
    expect(cuerpo.resultados[0].cobertura.registros_sin_lote).toBe(o.rows[0].sin_lote);
    // Un registro sin costo: el costo total es "sin dato", no una suma parcial.
    expect(cuerpo.resultados[0].total.costo).toBeNull();
    // Paginación real: 2.300 filas con tope de 1.000 por respuesta.
    expect(traza.consultas.filter((c) => c.tabla === 'registros_trabajo').map((c) => c.filas)).toEqual([1000, 1000, 300]);
    expect(traza.consultas.every((c) => c.rol === 'authenticated')).toBe(true);
    expect(llm.solicitudes.map((s) => s.modelo)).toEqual(['openai/gpt-6-luna', 'openai/gpt-6-luna']);
  });

  it.each([
    ['Administrador', USUARIOS.administrador],
    ['Verificador', USUARIOS.verificador],
    ['Gerencia desactivada', USUARIOS.gerenciaDesactivada],
    ['sesión sin perfil en usuarios', USUARIOS.sinPerfil],
  ])('%s: 403 y el modelo nunca se llama', async (_n, id) => {
    const llm = llmFalso();
    const traza: Traza = { consultas: [] };
    const d = deps({ llm, traza });
    const res = await manejar(post({ pregunta: 'jornales de mayo' }, jwtSintetico(id)), d);
    expect(res.status).toBe(403);
    expect(llm.solicitudes).toHaveLength(0);
    // Solo se leyó la fila propia de usuarios; ninguna tabla de labores.
    expect(traza.consultas.map((c) => c.tabla)).toEqual(['usuarios']);
    expect(d.eventos[0]).toMatchObject({ evento: 'acceso_denegado', estado: 403 });
  });

  it('por qué el chequeo de Gerencia es obligatorio: la RLS deja leer registros a una sesión sin perfil', async () => {
    const fuente = fuenteSupabase(clienteRls(db, jwtSintetico(USUARIOS.sinPerfil)));
    // Hallazgo de docs/esco2/m3-rls.md reproducido: registros y lotes visibles...
    expect(await fuente.registros('2026-05-01', '2026-05-31')).toHaveLength(N_REGISTROS);
    // ...pero tareas y tipos filtran por perfil activo.
    const cat = await fuente.catalogo();
    expect(cat.tareas).toHaveLength(0);
    expect(cat.lotes).toHaveLength(2);
  });

  it('la RLS sí aplica a cada lectura: anon no ve nada', async () => {
    const fuente = fuenteSupabase(clienteRls(db, jwtSintetico(USUARIOS.gerencia, 'falsa')));
    expect(await fuente.registros('2026-05-01', '2026-05-31')).toHaveLength(0);
  });

  it('sin token: 401; token inválido: 401', async () => {
    expect((await manejar(post({ pregunta: 'x' }), deps())).status).toBe(401);
    expect((await manejar(post({ pregunta: 'x' }, jwtSintetico(USUARIOS.gerencia, 'falsa')), deps())).status).toBe(401);
  });

  it('sin OPENROUTER_API_KEY: 503 antes de leer nada', async () => {
    const traza: Traza = { consultas: [] };
    const d = deps({ traza, env: (n) => (n === 'OPENROUTER_API_KEY' ? undefined : ENV[n]) });
    const res = await manejar(post({ pregunta: 'x' }, jwtSintetico(USUARIOS.gerencia)), d);
    expect(res.status).toBe(503);
    expect(traza.consultas).toHaveLength(0);
  });

  it('cuerpo con campos no admitidos: 400; GET /health: 200; OPTIONS: CORS', async () => {
    expect((await manejar(post({ pregunta: 'x', conversacion_id: 'otra' }, jwtSintetico(USUARIOS.gerencia)), deps())).status).toBe(400);
    expect((await manejar(new Request('http://local/functions/v1/esco-consultas/health'), deps())).status).toBe(200);
    const pre = await manejar(new Request('http://local/functions/v1/esco-consultas', { method: 'OPTIONS' }), deps());
    expect(pre.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('la traza de registro no lleva la pregunta ni la respuesta', async () => {
    const d = deps();
    await manejar(post({ pregunta: 'pregunta privada de mayo' }, jwtSintetico(USUARIOS.gerencia)), d);
    expect(JSON.stringify(d.eventos)).not.toContain('pregunta privada');
    expect(d.eventos[0]).toMatchObject({ evento: 'turno', origen: 'compositor', ruta: 'habitual', partes: 1 });
  });
});

describe('esco-consultas: utilidades', () => {
  it('fecha de Bogotá, no el día UTC', () => {
    expect(fechaBogota(new Date('2026-11-04T03:30:00Z'))).toBe('2026-11-03');
    expect(fechaBogota(new Date('2026-11-04T05:00:00Z'))).toBe('2026-11-04');
  });

  it('valida el historial', () => {
    expect(validarSolicitud({ pregunta: ' hola ', historial: [{ rol: 'user', texto: 'a' }] })).toEqual({ pregunta: 'hola', historial: [{ rol: 'user', texto: 'a' }] });
    expect(() => validarSolicitud({ pregunta: 'x', historial: [{ rol: 'system', texto: 'a' }] })).toThrow();
    expect(() => validarSolicitud({ pregunta: '' })).toThrow();
  });
});

describe('esco-consultas: aislamiento (D27)', () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const archivos = (dir: string): string[] =>
    readdirSync(path.join(raiz, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name))
      .map((e) => path.join(e.parentPath, e.name));
  const importaciones = (f: string) => [...readFileSync(f, 'utf8').matchAll(/(?:import|from)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

  it('la función nueva y el núcleo no importan chat.tsx, el árbol viejo ni Telegram', () => {
    const prohibido = /chat\.tsx|src\/supabase\/functions|make-server-1ccce916|telegram|grammy/;
    for (const f of [...archivos('supabase/functions/esco-consultas'), ...archivos('src/utils/esco2')]) {
      for (const i of importaciones(f)) expect(`${path.relative(raiz, f)} → ${i}`).not.toMatch(prohibido);
    }
  });

  it('la función existente (bot de Telegram incluido) no importa Esco 2.0', () => {
    for (const f of [...archivos('supabase/functions/make-server-1ccce916'), ...archivos('src/supabase/functions/server')]) {
      // Ojo: el árbol viejo tiene su propio módulo local `./esco-consultas.ts` (motor #311).
      // Es otra cosa con un nombre parecido; lo prohibido es la carpeta de la función nueva.
      for (const i of importaciones(f)) expect(`${path.relative(raiz, f)} → ${i}`).not.toMatch(/utils\/esco2\/|functions\/esco-consultas\/|\.\.\/esco-consultas\//);
    }
  });
});
