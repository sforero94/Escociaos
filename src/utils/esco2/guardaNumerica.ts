// Guarda de trazabilidad numérica: cada número de la respuesta tiene que existir en
// la evidencia estructurada (resultados del ejecutor, fechas del alcance, la fecha de
// hoy o la propia pregunta). Un número que no aparece ahí no se publica.
// Reutiliza el parser de `escoEvals/numeros.ts` (formato colombiano y ambigüedades).

import { extraerTokensNumericos } from '../escoEvals/numeros.ts';
import type { ResultadoParte } from './tipos.ts';

const ISO_GLOBAL = /\b\d{4}-\d{2}-\d{2}\b/g;

function recolectar(valor: unknown, numeros: Set<number>, fechas: Set<string>): void {
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    numeros.add(Math.abs(valor));
    return;
  }
  if (typeof valor === 'string') {
    for (const iso of valor.match(ISO_GLOBAL) ?? []) {
      fechas.add(iso);
      const [a, m, d] = iso.split('-').map(Number);
      numeros.add(a);
      numeros.add(m);
      numeros.add(d);
    }
    for (const t of extraerTokensNumericos(valor.replace(ISO_GLOBAL, ' '))) for (const v of t.valores) numeros.add(Math.abs(v));
    return;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) recolectar(v, numeros, fechas);
    return;
  }
  if (valor && typeof valor === 'object') for (const v of Object.values(valor)) recolectar(v, numeros, fechas);
}

export interface EvidenciaNumerica {
  numeros: number[];
  fechas: Set<string>;
}

export function evidenciaNumerica(resultados: ResultadoParte[], hoy: string, pregunta: string): EvidenciaNumerica {
  const numeros = new Set<number>();
  const fechas = new Set<string>();
  recolectar(resultados, numeros, fechas);
  recolectar(hoy, numeros, fechas);
  recolectar(pregunta, numeros, fechas);
  return { numeros: [...numeros], fechas };
}

function soportado(valor: number, evidencia: number[]): boolean {
  const v = Math.abs(valor);
  return evidencia.some((e) => Math.abs(v - e) <= Math.max(0.051, 0.006 * Math.abs(e)));
}

export interface ResultadoGuarda {
  ok: boolean;
  noSoportados: string[];
}

export function verificarNumeros(texto: string, evidencia: EvidenciaNumerica): ResultadoGuarda {
  const noSoportados: string[] = [];
  for (const iso of texto.match(ISO_GLOBAL) ?? []) if (!evidencia.fechas.has(iso)) noSoportados.push(iso);
  const limpio = texto
    .replace(ISO_GLOBAL, ' ')
    // Marcadores de lista numerada ("1. ", "2) ") no son cifras afirmadas.
    .replace(/^(\s*)\d{1,2}[.)]\s+/gm, '$1');
  for (const t of extraerTokensNumericos(limpio)) {
    if (t.valores.length === 0) continue;
    if (!t.valores.some((v) => soportado(v, evidencia.numeros))) noSoportados.push(t.texto.trim());
  }
  return { ok: noSoportados.length === 0, noSoportados };
}
