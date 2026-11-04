// Prueba de punta a punta local de esco-consultas (M3), sin Docker y sin producción.
// Uso: node scripts/esco2/e2e-local.ts
//
// Recorre el manejador real (manejador.ts) con:
//  - Postgres real (PGlite) con las políticas RLS de producción y datos sintéticos
//    (src/__tests__/esco2ArnesRls.ts): cada lectura corre como `authenticated` con los
//    claims del JWT sintético, igual que PostgREST;
//  - los modelos reales de OpenRouter (Luna; Sol solo por la regla D25).
// No lee producción, no escribe nada fuera de memoria. Costo esperado: centavos.

import { crearClienteOpenRouter } from '../../src/utils/esco2/llm.ts';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { clienteRls, crearBaseRls, jwtSintetico, USUARIOS } from '../../src/__tests__/esco2ArnesRls.ts';
import { leerClaveOpenRouter } from './clave.ts';

const clave = leerClaveOpenRouter();
const db = await crearBaseRls();
let gasto = 0;

async function turno(nombre: string, usuario: string, pregunta: string, historial: Array<{ rol: 'user' | 'assistant'; texto: string }> = []) {
  const res = await manejar(
    new Request('http://local/functions/v1/esco-consultas', {
      method: 'POST',
      headers: { authorization: `Bearer ${jwtSintetico(usuario)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ pregunta, historial }),
    }),
    {
      env: (n) => ({ OPENROUTER_API_KEY: clave, SUPABASE_URL: 'http://local', SUPABASE_ANON_KEY: 'local' })[n],
      crearClienteUsuario: (jwt) => clienteRls(db, jwt),
      crearLLM: (k) => crearClienteOpenRouter(k, fetch, 'Esco 2.0 M3 e2e local'),
      ahora: () => new Date('2026-06-02T15:00:00Z'),
    },
  );
  const c = (await res.json()) as Record<string, unknown> & { llamadas?: Array<{ modelo: string; costoUsd: number | null }> };
  const costo = (c.llamadas ?? []).reduce((s, l) => s + (l.costoUsd ?? 0), 0);
  gasto += costo;
  console.log(`\n=== ${nombre} → HTTP ${res.status}`);
  console.log(`origen=${String(c.origen ?? '-')} ruta=${String(c.ruta ?? '-')} modelos=${(c.llamadas ?? []).map((l) => l.modelo).join(',') || '-'} usd=${costo.toFixed(5)}`);
  console.log(`ajustes=${JSON.stringify(c.ajustes ?? [])}`);
  console.log(String(c.respuesta ?? c.error));
  return c;
}

await turno('Administrador (debe ser 403)', USUARIOS.administrador, '¿Cuántos jornales hubo en mayo de 2026?');
await turno('Gerencia desactivada (debe ser 403)', USUARIOS.gerenciaDesactivada, '¿Cuántos jornales hubo en mayo de 2026?');
const g = await turno('Una parte (Luna)', USUARIOS.gerencia, '¿Cuántos jornales de guadaña hubo en mayo de 2026?');
// Oráculo: la misma suma calculada por Postgres como superusuario.
const o = await db.query<{ j: string }>(
  `select sum(r.fraccion_jornal::text::numeric)::text j from registros_trabajo r join tareas t on t.id = r.tarea_id
   where t.nombre ilike '%guadaña%' and r.fecha_trabajo between '2026-05-01' and '2026-05-31'`,
);
const total = (g.resultados as Array<{ total: { jornales: number } }>)[0]?.total.jornales;
console.log(`oráculo: ${o.rows[0].j} · núcleo: ${total} · ${Number(o.rows[0].j) === total ? 'COINCIDE' : 'NO COINCIDE'}`);
await turno('Resumen (dos consultas por regla del planificador → D25: compositor Sol)', USUARIOS.gerencia, 'Dame un resumen de las labores de mayo de 2026.');
await turno('Dos lotes (Luna suele agrupar por lote: una parte, ruta habitual)', USUARIOS.gerencia, 'En mayo de 2026, ¿cuántos jornales hubo en el Lote Norte y cuántos en el Lote Sur?');
const p1 = '¿Cuántos jornales de cosecha hubo en mayo de 2026?';
const a = await turno('Cosecha sola (D26: aclaración)', USUARIOS.gerencia, p1);
await turno('Respuesta a la aclaración (D26: respeta la elección)', USUARIOS.gerencia, 'La categoría', [
  { rol: 'user', texto: p1 },
  { rol: 'assistant', texto: String(a.respuesta) },
]);
await turno('Cosecha junto a otra tarea (D26: tarea)', USUARIOS.gerencia, '¿Cuántos jornales de cosecha y de guadaña hubo en mayo de 2026?');

console.log(`\nGasto total: USD ${gasto.toFixed(4)}`);
await db.close();
