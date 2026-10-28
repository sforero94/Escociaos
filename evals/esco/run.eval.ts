// Punto de entrada de la evaluación de Esco. Se corre con Vitest (ver README.md):
//
//   EVAL_MODO=plan|live|originales  npm run eval:esco
//
// Cada corrida es un `it`; el puntaje NO hace fallar el `it` (solo un error de
// infraestructura lo hace). El umbral global se controla con EVAL_MIN_PASA.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluarDeterminista } from '../../src/utils/escoEvals/deterministico';
import { parsearGolden, seleccionarCasos, variantesDelCaso } from '../../src/utils/escoEvals/golden';
import { construirMensajesJuez, criteriosDelCaso, llamarJuez, parsearRespuestaJuez } from '../../src/utils/escoEvals/juez';
import { aMarkdown, calibrar, compararConBase, resumir, type ResumenEval } from '../../src/utils/escoEvals/reporte';
import type { CasoDorado, CorridaEjecutada, ResultadoCaso, ResultadoJuez } from '../../src/utils/escoEvals/tipos';
import { combinarVeredicto } from '../../src/utils/escoEvals/veredicto';
import { faltantes, leerConfig } from './lib/entorno';
import { corridaDesdeOriginal, correrCaso, instalarGuardas, type GuardasInstaladas } from './lib/ejecutor';

const cfg = leerConfig();
const casos: CasoDorado[] = existsSync(cfg.golden) ? seleccionarCasos(parsearGolden(readFileSync(cfg.golden, 'utf8')), {
  ids: cfg.filtros.ids, dominios: cfg.filtros.dominios, etiquetas: cfg.filtros.etiquetas, tipos: cfg.filtros.tipos, limite: cfg.filtros.limite,
}) : [];

const resultados: ResultadoCaso[] = [];
let guardas: GuardasInstaladas | null = null;

/** Corre al juez (con un reintento si devuelve JSON inválido). */
async function juzgar(caso: CasoDorado, corrida: CorridaEjecutada): Promise<{ juez: ResultadoJuez | null; estado: 'ok' | 'omitido' | 'error'; tokens: { entrada: number; salida: number } }> {
  const tokens = { entrada: 0, salida: 0 };
  if (!cfg.juez) return { juez: null, estado: 'omitido', tokens };
  const mensajes = construirMensajesJuez(caso, corrida);
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await llamarJuez(mensajes, { ...cfg.juez, criterios: criteriosDelCaso(caso) });
      tokens.entrada += r.tokens.entrada;
      tokens.salida += r.tokens.salida;
      return { juez: parsearRespuestaJuez(r.texto, criteriosDelCaso(caso)), estado: 'ok', tokens };
    } catch (err) {
      if (intento === 0) mensajes.push({
        role: 'user',
        content: `La respuesta anterior no superó la validación: ${err instanceof Error ? err.message : String(err)}. Devuelve el JSON completo con exactamente estos IDs, una vez cada uno: ${criteriosDelCaso(caso).map((c) => c.id).join(', ')}. No agregues criterios.`,
      });
      if (intento === 1) {
        console.warn(`[juez] ${caso.id}: ${err instanceof Error ? err.message : String(err)}`);
        return { juez: null, estado: 'error', tokens };
      }
    }
  }
  return { juez: null, estado: 'error', tokens };
}

function escribirSalida(): ResumenEval {
  mkdirSync(cfg.salida, { recursive: true });
  writeFileSync(path.join(cfg.salida, 'resultados.jsonl'), resultados.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const resumen = resumir(resultados);
  let comparacion = null;
  if (cfg.base && existsSync(cfg.base)) {
    const base = JSON.parse(readFileSync(cfg.base, 'utf8')) as { resumen: ResumenEval };
    comparacion = compararConBase(base.resumen, resumen);
  }
  const calibracion = cfg.modo === 'originales' ? calibrar(resultados) : null;
  const meta = {
    fecha: new Date().toISOString(), modo: cfg.modo, conjunto: path.relative(process.cwd(), cfg.golden),
    modelo_juez: cfg.juez?.modelo ?? null, modo_fecha: cfg.fecha === 'caso' ? 'hora de la pregunta original' : 'hora real',
    repeticiones: cfg.repeticiones,
    conjunto_sha256: createHash('sha256').update(readFileSync(cfg.golden)).digest('hex'),
    git_commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    git_dirty: execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim().length > 0,
    datos: cfg.modo === 'live' ? 'base actual; fijar Date no restaura datos históricos' : 'respuestas originales guardadas',
  };
  writeFileSync(path.join(cfg.salida, 'resumen.json'), JSON.stringify({ meta, resumen, comparacion, calibracion }, null, 2));
  writeFileSync(path.join(cfg.salida, 'informe.md'), aMarkdown(resumen, meta, comparacion, calibracion));
  console.info(`\n[eval] resultados en ${path.relative(process.cwd(), cfg.salida)}  —  ${resumen.pasa} pasan / ${resumen.falla} fallan / ${resumen.inconcluso} inconclusas`);
  return resumen;
}

describe(`Esco — conjunto dorado (${cfg.modo})`, () => {
  beforeAll(() => {
    expect(existsSync(cfg.golden), `No existe el conjunto dorado: ${cfg.golden}`).toBe(true);
    expect(casos.length, 'Ningún caso coincide con los filtros').toBeGreaterThan(0);
    if (cfg.base && !existsSync(cfg.base)) throw new Error(`No existe la corrida base: ${cfg.base}`);
    const falta = faltantes(cfg);
    if (falta.length > 0) throw new Error(`Faltan variables de entorno para el modo ${cfg.modo}: ${falta.join(', ')}`);
    if (cfg.modo === 'live') {
      guardas = instalarGuardas({ supabaseUrl: cfg.esco.supabaseUrl, verboso: cfg.verboso });
      console.info(`[eval] Esco leerá de ${new URL(cfg.esco.supabaseUrl).host} en solo lectura. Juez: ${cfg.juez?.modelo ?? 'ninguno (solo capa determinista)'}`);
      console.warn('[eval] Se consulta la base actual: fijar la hora NO restaura una instantánea histórica. Revisa replay_note en los casos con cambios de datos.');
    }
  });

  if (cfg.modo === 'plan') {
    it('plan: lista las corridas sin llamar a nadie', () => {
      const filas = casos.flatMap((c) => variantesDelCaso(c, cfg.conParafrasis).map((v) => `${c.id}  ${c.key.padEnd(4)} ${c.channel.padEnd(8)} ${c.as_of_bogota}  ${v.nombre}  ${c.title}`));
      console.info(`\n[eval] ${casos.length} casos · ${filas.length} variantes · ${cfg.repeticiones} repetición(es) = ${filas.length * cfg.repeticiones} corridas\n${filas.join('\n')}\n`);
      console.info(`[eval] juez: ${cfg.juez ? cfg.juez.modelo : 'no configurado'} · fecha: ${cfg.fecha} · para correr: EVAL_MODO=live (o originales)`);
      expect(casos.length).toBeGreaterThan(0);
    });
  } else {
    // Vitest does not execute hooks for a suite without tests.
    if (casos.length === 0) it('requiere casos seleccionados', () => { throw new Error('No hay casos: revisa EVAL_GOLDEN y los filtros'); });
    for (const caso of casos) {
      // En «originales» solo existe la respuesta principal y no hay repeticiones.
      const variantes = cfg.modo === 'originales' ? [{ nombre: 'principal', pregunta: caso.question }] : variantesDelCaso(caso, cfg.conParafrasis);
      const repeticiones = cfg.modo === 'originales' ? 1 : cfg.repeticiones;
      for (const v of variantes) {
        for (let rep = 1; rep <= repeticiones; rep++) {
          it(`${caso.id} ${caso.key} [${v.nombre} #${rep}] ${caso.title}`, async () => {
            let corrida: CorridaEjecutada;
            let nombreVariante = v.nombre;
            if (cfg.modo === 'originales') {
              corrida = corridaDesdeOriginal(caso);
              // Con varias corridas originales, el veredicto del dueño no corresponde a una sola respuesta.
              if (caso.original.runs.length > 1) nombreVariante = 'origen_multiple';
            } else {
              corrida = await correrCaso(caso, v.pregunta, true, { fijarHora: cfg.fecha === 'caso', guardas: guardas! });
            }
            const determinista = evaluarDeterminista(caso, corrida);
            const juzgado = corrida.error ? { juez: null, estado: 'omitido' as const, tokens: { entrada: 0, salida: 0 } } : await juzgar(caso, corrida);
            corrida.tokens = {
              entrada: (corrida.tokens?.entrada ?? 0) + juzgado.tokens.entrada,
              salida: (corrida.tokens?.salida ?? 0) + juzgado.tokens.salida,
            };
            resultados.push(combinarVeredicto({
              caso, corrida, repeticion: rep, variante: nombreVariante, determinista, juez: juzgado.juez, juezEstado: juzgado.estado,
            }));
          });
        }
      }
    }
  }

  afterAll(() => {
    guardas?.restaurar();
    if (resultados.length === 0) return;
    const resumen = escribirSalida();
    const errores = resultados.filter((r) => r.corrida.error || r.juez_estado === 'error').length;
    if (errores > 0) throw new Error(`${errores} corrida(s) con errores de infraestructura; revisa resultados.jsonl`);
    if (cfg.minimoPasa !== null && resumen.tasa_pasa !== null && resumen.tasa_pasa < cfg.minimoPasa) {
      throw new Error(`Tasa de aprobación ${(resumen.tasa_pasa * 100).toFixed(0)} % < mínimo ${(cfg.minimoPasa * 100).toFixed(0)} % (EVAL_MIN_PASA)`);
    }
  });
});
