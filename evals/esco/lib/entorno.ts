// Lectura de la configuración de una corrida de evaluación desde variables de entorno.

import path from 'node:path';

export type ModoEval = 'plan' | 'live' | 'originales';

export interface ConfigEval {
  modo: ModoEval;
  golden: string;
  salida: string;
  filtros: { ids: string[]; dominios: string[]; etiquetas: string[]; tipos: string[]; limite?: number };
  repeticiones: number;
  conParafrasis: boolean;
  /** 'caso' fija la fecha de cada pregunta original; 'ahora' usa la hora real. */
  fecha: 'caso' | 'ahora';
  base: string | null;
  minimoPasa: number | null;
  verboso: boolean;
  juez: { baseUrl: string; apiKey: string; modelo: string } | null;
  exigirJuez: boolean;
  esco: { supabaseUrl: string; serviceKey: string; openrouterKey: string };
}

const lista = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function numero(env: NodeJS.ProcessEnv, clave: string, defecto: number, minimo: number, maximo: number, entero = false): number {
  const raw = env[clave];
  const valor = raw === undefined ? defecto : raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(valor) || valor < minimo || valor > maximo || (entero && !Number.isInteger(valor))) {
    throw new Error(`${clave}: valor inválido (${minimo}–${maximo}${entero ? ', entero' : ''})`);
  }
  return valor;
}

function urlHttp(valor: string, clave: string): string {
  const url = new URL(valor);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${clave}: usa una URL HTTP(S) sin credenciales, parámetros ni fragmento`);
  }
  return valor.replace(/\/+$/, '');
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigEval {
  const modo = (env.EVAL_MODO ?? 'plan') as ModoEval;
  if (!['plan', 'live', 'originales'].includes(modo)) {
    throw new Error(`EVAL_MODO inválido: «${modo}». Usa plan, live u originales.`);
  }
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const juezModelo = env.JUEZ_MODELO?.trim();
  const juezKey = env.JUEZ_API_KEY?.trim() || env.OPENROUTER_API_KEY?.trim();
  const sinJuez = env.EVAL_SIN_JUEZ === '1';
  if (sinJuez && env.EVAL_EXIGIR_JUEZ === '1') throw new Error('EVAL_SIN_JUEZ y EVAL_EXIGIR_JUEZ son incompatibles');
  if (env.EVAL_FECHA && !['caso', 'ahora'].includes(env.EVAL_FECHA)) throw new Error('EVAL_FECHA: usa caso o ahora');

  return {
    modo,
    golden: path.resolve(env.EVAL_GOLDEN ?? 'evals/esco/golden/esco_golden_set_v2.jsonl'),
    salida: path.resolve(env.EVAL_SALIDA ?? `evals/esco/runs/${marca}-${modo}`),
    filtros: {
      ids: lista(env.EVAL_CASOS),
      dominios: lista(env.EVAL_DOMINIOS),
      etiquetas: lista(env.EVAL_ETIQUETAS),
      tipos: lista(env.EVAL_TIPOS),
      limite: env.EVAL_LIMITE !== undefined ? numero(env, 'EVAL_LIMITE', 1, 1, Number.MAX_SAFE_INTEGER, true) : undefined,
    },
    repeticiones: numero(env, 'EVAL_REPETICIONES', 1, 1, Number.MAX_SAFE_INTEGER, true),
    conParafrasis: env.EVAL_PARAFRASIS === '1',
    fecha: env.EVAL_FECHA === 'ahora' ? 'ahora' : 'caso',
    base: env.EVAL_BASE ? path.resolve(env.EVAL_BASE) : null,
    minimoPasa: env.EVAL_MIN_PASA !== undefined ? numero(env, 'EVAL_MIN_PASA', 0, 0, 1) : null,
    verboso: env.EVAL_VERBOSO === '1',
    juez: !sinJuez && juezModelo && juezKey
      ? { baseUrl: urlHttp(env.JUEZ_BASE_URL ?? 'https://openrouter.ai/api/v1', 'JUEZ_BASE_URL'), apiKey: juezKey, modelo: juezModelo }
      : null,
    // A score without semantic checks must always be an explicit choice.
    exigirJuez: !sinJuez && (modo !== 'plan' || env.EVAL_EXIGIR_JUEZ === '1'),
    esco: {
      supabaseUrl: env.SUPABASE_URL?.trim() ? urlHttp(env.SUPABASE_URL.trim(), 'SUPABASE_URL') : '',
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
      openrouterKey: env.OPENROUTER_API_KEY?.trim() ?? '',
    },
  };
}

/** Variables que faltan para el modo pedido. Lista vacía = listo. */
export function faltantes(cfg: ConfigEval): string[] {
  const falta: string[] = [];
  if (cfg.modo === 'live') {
    if (!cfg.esco.supabaseUrl) falta.push('SUPABASE_URL');
    if (!cfg.esco.serviceKey) falta.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!cfg.esco.openrouterKey) falta.push('OPENROUTER_API_KEY');
  }
  if (cfg.exigirJuez && !cfg.juez) falta.push('JUEZ_MODELO (y JUEZ_API_KEY u OPENROUTER_API_KEY)');
  return falta;
}
