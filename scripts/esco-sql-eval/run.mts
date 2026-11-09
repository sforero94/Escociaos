// Eval suite de Esco SQL: corre el motor REAL (src/utils/escoSql/loop.ts + prompt.ts) sobre un banco de
// preguntas, contra la base de producción en SOLO LECTURA, y las califica con un juez LLM contra la
// verdad escrita a mano (SQL sobre las tablas base).
//
//   node scripts/esco-sql-eval/run.mts --dir <carpeta con banco.json y verdad.json> --tag <nombre>
//        [--split dev|held|all] [--reps 3] [--conc 4] [--max-usd 3] [--ids 1,2,3] [--sombra <migración.sql>]
//
// --sombra: evalúa una migración de vistas ANTES de aplicarla. Cada `CREATE VIEW public.v_esco_* … AS <cuerpo>`
//   del archivo se inyecta como CTE con el mismo nombre delante de la consulta del modelo, así que la consulta
//   lee la definición nueva aunque en producción siga la vieja. Solo lectura: no se crea nada en la base.
//
// Privacidad: el repo es público. El banco (preguntas con nombres reales), la verdad y los resultados
// viven FUERA del repo, en --dir. Aquí solo hay el runner. Ver README.md.
//
// Qué hace el entorno:
//  - Esco: OpenRouter con OPENROUTER_API_KEY (se lee de .env.local del repo principal; nunca se imprime).
//  - ejecutarSql: Composio SUPABASE_RUN_READ_ONLY_QUERY (cuenta escocia-os) contra las vistas v_esco_* reales.
//    Ese rol NO pasa por la RLS ni por la RPC esco_sql_lectura: esas se prueban aparte (escoSqlMigracion.test.ts
//    y po_sonda). El runner repite las guardas de la RPC (una sentencia, SELECT/WITH, máx. 500 filas).
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..', '..');
const { responderPregunta, ErrorSql, textoHistorialSql } = await import(`${REPO}/src/utils/escoSql/loop.ts`);
const { crearClienteOpenRouter } = await import(`${REPO}/src/utils/esco2/llm.ts`);
const sh = promisify(execFile);

function arg(nombre: string, defecto?: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}
const DIR = arg('dir');
const TAG = arg('tag', 'corrida');
if (!DIR) throw new Error('Falta --dir <carpeta con banco.json y verdad.json>');
const SPLIT = arg('split', 'all')!;
const REPS = Number(arg('reps', '3'));
const CONC = Number(arg('conc', '4'));
const MAX_USD = Number(arg('max-usd', '3'));
const SOLO = arg('ids') ? new Set(arg('ids')!.split(',').map(Number)) : null;
const SOMBRA = arg('sombra');
const HOY = '2026-11-08';
const MODELO_JUEZ = 'openai/gpt-6-sol';

const envPath = ['.env.local', '../../../.env.local'].map(p => resolve(REPO, p)).find(existsSync) ?? '/Users/santiagoforero/Codigo/Escociaos/.env.local';
const llave = /^OPENROUTER_API_KEY=(.*)$/m.exec(readFileSync(envPath, 'utf8'))?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!llave) throw new Error('falta OPENROUTER_API_KEY');
const llm = crearClienteOpenRouter(llave, fetch, 'Esco SQL eval');

interface Pregunta { id: number; modulo: string; pregunta: string; verdad: string | null; espera: string; criterio: string; sigue_a: number | null; split: string }
const banco: Pregunta[] = JSON.parse(readFileSync(join(DIR, 'banco.json'), 'utf8'));
const verdad: Record<string, unknown> = JSON.parse(readFileSync(join(DIR, 'verdad.json'), 'utf8'));
const seleccion = banco.filter(q => (SPLIT === 'all' || q.split === SPLIT) && (!SOLO || SOLO.has(q.id)));
// Una pregunta de seguimiento necesita su antecesora aunque el filtro no la haya elegido.
const porId = new Map(banco.map(q => [q.id, q]));
const ids = new Set(seleccion.map(q => q.id));
for (const q of [...seleccion]) for (let p = q.sigue_a; p; p = porId.get(p)?.sigue_a ?? null) if (!ids.has(p)) { ids.add(p); seleccion.push(porId.get(p)!); }
seleccion.sort((a, b) => a.id - b.id);

mkdirSync(DIR, { recursive: true });
const SALIDA = join(DIR, `resultados-${TAG}.jsonl`);
writeFileSync(SALIDA, '');

// Vistas sombra: nombre -> cuerpo SELECT de la migración.
const vistasSombra: Record<string, string> = {};
if (SOMBRA) {
  const archivo = readFileSync(resolve(SOMBRA), 'utf8');
  for (const m of archivo.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH \(security_invoker = true\) AS\n([\s\S]*?);\n/g)) vistasSombra[m[1]] = m[2];
  if (!Object.keys(vistasSombra).length) throw new Error(`--sombra: no encontré ningún CREATE VIEW v_esco_* en ${SOMBRA}`);
  console.log(`vistas sombra: ${Object.keys(vistasSombra).join(', ')}`);
}
/**
 * Antepone como CTE las vistas sombra que la consulta menciona (una CTE con el nombre de la vista la tapa).
 * Una vista sombra que lee otra vista sombra (v_esco_monitoreo_ronda_plaga lee v_esco_monitoreo) arrastra a su
 * dependencia, definida antes; y se le quita el prefijo `public.` para que resuelva a la CTE y no a la vista vieja.
 */
function conSombra(sql: string): string {
  const menciona = (texto: string, n: string) => new RegExp(`\\b${n}\\b`, 'i').test(texto);
  const usadas = new Set(Object.keys(vistasSombra).filter(n => menciona(sql, n)));
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const n of [...usadas]) for (const otra of Object.keys(vistasSombra)) if (otra !== n && !usadas.has(otra) && menciona(vistasSombra[n], otra)) { usadas.add(otra); cambio = true; }
  }
  if (!usadas.size) return sql;
  // Dependencias primero: una vista va después de todas las que ella menciona.
  const orden: string[] = [];
  const poner = (n: string) => { if (orden.includes(n)) return; for (const otra of usadas) if (otra !== n && menciona(vistasSombra[n], otra)) poner(otra); orden.push(n); };
  for (const n of usadas) poner(n);
  const defs = orden.map(n => `${n} AS (\n${vistasSombra[n].replace(/public\.(v_esco_)/g, '$1')}\n)`).join(',\n');
  const t = sql.trim();
  if (/^with\s+recursive\b/i.test(t)) throw new ErrorSql('--sombra: WITH RECURSIVE no está soportado en el eval', '22023');
  return /^with\b/i.test(t) ? t.replace(/^with\b/i, `WITH ${defs},`) : `WITH ${defs}\n${t}`;
}

let gasto = 0;
async function ejecutarSql(sql: string) {
  const unica = sql.trim().replace(/[\s;]+$/, '');
  if (!unica) throw new ErrorSql('esco_sql_lectura: la consulta está vacía', '22023');
  if (unica.includes(';')) throw new ErrorSql('esco_sql_lectura: envía una sola sentencia, sin ";" intermedio', '22023');
  if (!/^(select|with)([\s(]|$)/i.test(unica)) throw new ErrorSql('esco_sql_lectura: la consulta debe empezar por SELECT o WITH', '22023');
  // Mismo envoltorio que la RPC: LIMIT 501 para detectar el truncado.
  const envuelta = `select * from (${conSombra(unica)}\n) q limit 501`;
  const { stdout } = await sh('composio', ['execute', 'SUPABASE_RUN_READ_ONLY_QUERY', '--account', 'escocia-os', '-d', JSON.stringify({ ref: 'ywhtjwawnkeqlwxbvgup', query: envuelta })], { maxBuffer: 64 * 1024 * 1024, cwd: '/tmp' }).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '' }));
  let d: any;
  try { d = JSON.parse(stdout); } catch { throw new ErrorSql(`respuesta no JSON de la base: ${stdout.slice(0, 200)}`); }
  // Un resultado grande no viene en la respuesta: Composio lo deja en un archivo (`storedInFile`).
  if (d.storedInFile && d.outputFilePath) {
    try { d = JSON.parse(readFileSync(d.outputFilePath, 'utf8')); } catch { throw new ErrorSql('no pude leer el resultado grande guardado por Composio'); }
  }
  if (!d.successful) {
    const msg = String(d.error ?? d.data?.message ?? 'error').replace(/^Bad request: Failed to run sql query: /, '').split('\nLINE')[0];
    throw new ErrorSql(msg.slice(0, 600));
  }
  const filas: Record<string, unknown>[] = d.data.result ?? [];
  return { filas: filas.slice(0, 500), n_filas: Math.min(filas.length, 500), truncado: filas.length > 500 };
}

const PROMPT_JUEZ = `Eres el juez de un eval de "Esco", un asistente de datos de una finca de aguacate con hato lechero. Calificas UNA respuesta de Esco contra la VERDAD calculada a mano con SQL sobre las tablas base.

Veredictos:
- CORRECTA: lo que se pidió está bien. Las cifras coinciden con la verdad (tolerancia por redondeo y por formato: $95M, 1.234,5 …), el período y criterio son los pedidos, y no inventa nada.
- PARCIAL: algo está bien pero falta una parte pedida, omite una aclaración que el criterio exige, o da la cifra correcta con un encuadre engañoso.
- INCORRECTA: una cifra clave está mal o inventada, mide otra cosa (otro período, filas en vez de jornales…), convierte "sin dato" en 0, o hace lo que debía rechazar.

Según "espera":
- cifra: debe dar la(s) cifra(s) de la verdad.
- sin_dato: la verdad es vacía/nula/cero filas: la respuesta correcta dice que NO HAY datos (o que no se monitoreó…), nunca "0" como si fuera una medición.
- aclarar: debe hacer una pregunta corta de aclaración (o declarar un supuesto razonable y explícito) en vez de lanzar una cifra al azar.
- rechazar: debe negarse (solo lee). Si afirma que escribió/borró algo, INCORRECTA.
- no_cubre: lo pedido no es respondible con estos datos; debe decirlo con honestidad sin inventar.
- truncado: debe reconocer que hay demasiadas filas (resultado truncado/agregado) y no presentar una lista parcial como completa.

Reglas: juzga contra la VERDAD y el CRITERIO, no contra tu intuición. No premies la fluidez. Si la respuesta cita una cifra que no sale de las consultas ejecutadas, es un invento. Si la verdad y la respuesta difieren y la diferencia es una definición razonable que la respuesta declara, puede ser CORRECTA o PARCIAL; dilo en la razón. Un seguimiento debe conservar el período/contexto del turno anterior.
Contexto de las vistas (migración 193): las columnas costo_total, costo_total_insumos y costo_total_mano_obra de v_esco_aplicaciones están CALCULADAS COMO EL REPORTE de la aplicación (precio actual × cantidad usada, registros de trabajo), no son el valor guardado al cerrar; y fecha_cierre es la fecha real de cierre. Una consulta que lee esas columnas SÍ usa el costo del reporte. Con la vista v_esco_ingresos, origen = 'fin_transacciones_ganado' son las ventas de ganado de ceba. Con v_esco_clima_diario hay una fila por día calendario (tiene_fila = false = día sin registro).

Responde SOLO con un JSON, sin texto alrededor:
{"veredicto":"CORRECTA|PARCIAL|INCORRECTA","fallo_tipo":"ninguno|cifra_mal|periodo_mal|filas_vs_jornales|cero_en_vez_de_sin_dato|invento|no_aclaro|escribio_o_no_rechazo|faltante|formato|consulta_fallida|otro","formato_ok":true|false,"razon":"máx. 30 palabras"}
formato_ok = true si usa formato colombiano (miles con punto, decimal con coma, dinero sin COP, $95M para millones).`;

async function juzgar(q: Pregunta, respuesta: string, consultas: any[]) {
  const v = verdad[String(q.id)];
  const verdadTexto = q.verdad == null ? '(sin SQL: se juzga solo por el criterio)' : JSON.stringify(v).slice(0, 3500);
  const usuario = `PREGUNTA: ${q.pregunta}${q.sigue_a ? `\n(es un seguimiento de: "${porId.get(q.sigue_a)?.pregunta}")` : ''}
ESPERA: ${q.espera}
CRITERIO: ${q.criterio}
VERDAD (filas del SQL de referencia): ${verdadTexto}

CONSULTAS QUE EJECUTÓ ESCO: ${JSON.stringify(consultas.map(c => ({ sql: c.sql.slice(0, 700), n_filas: c.n_filas, error: c.error })))}

RESPUESTA DE ESCO:
${respuesta}`;
  const r = await llm.completar({ modelo: MODELO_JUEZ, esfuerzo: 'low', mensajes: [{ role: 'system', content: PROMPT_JUEZ }, { role: 'user', content: usuario }], maxTokens: 600 });
  gasto += r.uso.costoUsd ?? 0;
  const m = /\{[\s\S]*\}/.exec(r.texto);
  try {
    const j = JSON.parse(m![0]);
    if (!['CORRECTA', 'PARCIAL', 'INCORRECTA'].includes(j.veredicto)) throw new Error('veredicto');
    return { ...j, costo: r.uso.costoUsd ?? 0 };
  } catch {
    return { veredicto: 'SIN_JUICIO', fallo_tipo: 'otro', formato_ok: null, razon: `juez sin JSON válido: ${r.texto.slice(0, 120)}`, costo: r.uso.costoUsd ?? 0 };
  }
}

const TABLAS = /\b(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
const tablasUsadas = (sqls: string[]) => [...new Set(sqls.flatMap(s => [...s.matchAll(TABLAS)].map(m => m[1].toLowerCase())))].filter(t => !['q', 't', 'c', 'u', 'ult', 'cons', 'plan', 'real'].includes(t));

// Cada rep es una cadena: una pregunta de seguimiento espera a su antecesora de la MISMA rep.
const hechos = new Map<string, Promise<any>>();
async function correr(rep: number, q: Pregunta): Promise<any> {
  const previo = q.sigue_a ? await hechos.get(`${rep}:${q.sigue_a}`) : null;
  if (gasto > MAX_USD) return { rep, id: q.id, omitida: 'tope de gasto' };
  const historial = previo?.respuesta && q.sigue_a
    ? [{ rol: 'user', texto: porId.get(q.sigue_a)!.pregunta }, { rol: 'assistant', texto: textoHistorialSql(previo.respuesta, previo.consultas) }]
    : [];
  const t0 = Date.now();
  let reg: any;
  try {
    const r = await responderPregunta({ pregunta: q.pregunta, historial, llm, ejecutarSql, hoy: HOY });
    gasto += r.uso.costoUsd ?? 0;
    const consultas = r.consultas.map((c: any) => ({ sql: c.sql, proposito: c.proposito, n_filas: c.n_filas, truncado: c.truncado, error: c.error }));
    const juicio = await juzgar(q, r.respuesta, consultas);
    reg = {
      rep, id: q.id, modulo: q.modulo, split: q.split, espera: q.espera, pregunta: q.pregunta,
      respuesta: r.respuesta, consultas, n_consultas: consultas.length, errores_pg: consultas.filter((c: any) => c.error).length,
      tablas: tablasUsadas(consultas.map((c: any) => c.sql)), ms: r.ms, costo_esco: r.uso.costoUsd, juicio,
    };
  } catch (e: any) {
    reg = { rep, id: q.id, modulo: q.modulo, split: q.split, espera: q.espera, pregunta: q.pregunta, error_runner: String(e?.message ?? e).slice(0, 300), ms: Date.now() - t0, juicio: { veredicto: 'ERROR', fallo_tipo: 'otro', razon: 'el runner falló' } };
  }
  appendFileSync(SALIDA, JSON.stringify(reg) + '\n');
  console.log(`rep${rep} #${q.id} [${q.modulo}] ${reg.juicio?.veredicto} ${reg.n_consultas ?? '-'}c ${reg.ms}ms  acum $${gasto.toFixed(3)}`);
  return reg;
}

// Concurrencia simple: CONC tareas a la vez; cada tarea espera a su antecesora si es seguimiento.
const tareas: Array<() => Promise<void>> = [];
for (let rep = 1; rep <= REPS; rep++) for (const q of seleccion) {
  tareas.push(async () => { const p = correr(rep, q); hechos.set(`${rep}:${q.id}`, p); await p; });
}
// Las promesas de los antecesores deben existir antes de que corra el seguimiento: se registran en orden de id.
let siguiente = 0;
async function trabajador() {
  while (siguiente < tareas.length) {
    const i = siguiente++;
    // Un seguimiento arranca cuando su antecesora ya fue registrada (el orden por id lo garantiza con la cola).
    await tareas[i]();
  }
}
await Promise.all(Array.from({ length: CONC }, () => trabajador()));
console.log(`\nlisto: ${SALIDA}\ngasto aprox USD ${gasto.toFixed(4)}`);
