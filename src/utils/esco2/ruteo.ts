// Regla D25 (decisión de Santiago, 2026-11-03): Luna sin razonamiento es la ruta
// habitual. Sol entra solo por una regla determinista: el plan validado tiene varias
// partes o toca varios dominios. El modelo nunca elige su propio modelo.
//
// El planificador siempre es la ruta habitual: el número de partes solo se conoce
// después de planear. La regla decide el compositor, que es quien tiene que redactar
// varias cifras de varias partes sin mezclarlas. El tope de tres llamadas no cambia.

import type { Esfuerzo } from './llm.ts';
import type { Plan } from './tipos.ts';

export interface ModeloEtapa {
  modelo: string;
  esfuerzo: Esfuerzo;
}

export type Ruta = 'habitual' | 'reforzada';

/** Dominio de cada operación registrada. Hoy solo existe labores (M3). */
export const DOMINIO_CONSULTA = 'labores';

export const MIN_PARTES_REFORZADA = 2;
export const MIN_DOMINIOS_REFORZADA = 2;

export function medirPlan(plan: Plan): { partes: number; dominios: number } {
  if (plan.tipo !== 'consultas') return { partes: 0, dominios: 0 };
  return { partes: plan.consultas.length, dominios: new Set(plan.consultas.map(() => DOMINIO_CONSULTA)).size };
}

export function elegirRuta(plan: Plan): Ruta {
  const { partes, dominios } = medirPlan(plan);
  return partes >= MIN_PARTES_REFORZADA || dominios >= MIN_DOMINIOS_REFORZADA ? 'reforzada' : 'habitual';
}

export function modeloCompositor(ruta: Ruta, habitual: ModeloEtapa, reforzado: ModeloEtapa | undefined): ModeloEtapa {
  return ruta === 'reforzada' && reforzado ? reforzado : habitual;
}
