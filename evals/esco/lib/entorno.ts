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

export function leerConfig(env: NodeJS.ProcessEnv = process.env): ConfigEval {
  const modo = (env.EVAL_MODO ?? 'plan') as ModoEval;
  if (!['plan', 'live', 'originales'].includes(modo)) {
    throw new Error(`EVAL_MODO inválido: «${modo}». Usa plan, live u originales.`);
  }
  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const juezModelo = env.JUEZ_MODELO?.trim();
  const juezKey = (env.JUEZ_API_KEY ?? env.OPENROUTER_API_KEY)?.trim();
  const sinJuez = env.EVAL_SIN_JUEZ === '1';

  return {
    modo,
    golden: path.resolve(env.EVAL_GOLDEN ?? 'evals/esco/golden/esco_golden_set_v2.jsonl'),
    salida: path.resolve(env.EVAL_SALIDA ?? `evals/esco/runs/${marca}-${modo}`),
    filtros: {
      ids: lista(env.EVAL_CASOS),
      dominios: lista(env.EVAL_DOMINIOS),
      etiquetas: lista(env.EVAL_ETIQUETAS),
      tipos: lista(env.EVAL_TIPOS),
      limite: env.EVAL_LIMITE ? Number(env.EVAL_LIMITE) : undefined,
    },
    repeticiones: Math.max(1, Number(env.EVAL_REPETICIONES ?? 1)),
    conParafrasis: env.EVAL_PARAFRASIS === '1',
    fecha: env.EVAL_FECHA === 'ahora' ? 'ahora' : 'caso',
    base: env.EVAL_BASE ? path.resolve(env.EVAL_BASE) : null,
    minimoPasa: env.EVAL_MIN_PASA ? Number(env.EVAL_MIN_PASA) : null,
    verboso: env.EVAL_VERBOSO === '1',
    juez: !sinJuez && juezModelo && juezKey
      ? { baseUrl: env.JUEZ_BASE_URL ?? 'https://openrouter.ai/api/v1', apiKey: juezKey, modelo: juezModelo }
      : null,
    exigirJuez: env.EVAL_EXIGIR_JUEZ === '1',
    esco: {
      supabaseUrl: env.SUPABASE_URL ?? '',
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      openrouterKey: env.OPENROUTER_API_KEY ?? '',
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
