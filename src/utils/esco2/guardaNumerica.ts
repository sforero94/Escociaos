// Guarda de trazabilidad numérica: cada número de la respuesta tiene que existir en
// la evidencia estructurada (resultados del ejecutor, fechas del alcance, la fecha de
// hoy o la propia pregunta). Un número que no aparece ahí no se publica.
// Reutiliza el parser de `escoEvals/numeros.ts` (formato colombiano y ambigüedades).

import { extraerTokensNumericos, fechaPresente } from '../escoEvals/numeros.ts';
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

// --- Cifras obligatorias ---------------------------------------------------------------
// La guarda de arriba solo atrapa cifras de más. Una respuesta que omite el total de una
// parte, o los jornales estimados de una categoría (D30), no inventa nada y pasaba. Aquí se
// lista, desde los resultados, lo que la respuesta tiene que decir como mínimo:
//   - de cada parte con estado ok: el total de jornales y cada métrica pedida del total que
//     tenga valor (costo, razones, días, primer y último registro);
//   - de una consulta por categoría: los jornales estimados, incluso sin registros.
// Un valor null no se exige (no hay cifra que decir; la razón va en `notas`). Un 0 tampoco:
// "0" y "ninguno" son formas equivalentes de decirlo y no se pueden distinguir con fiabilidad.

export interface CifraObligatoria {
  parte: string;
  etiqueta: string;
  tipo: 'numero' | 'fecha';
  valor: number | string;
}

export function cifrasObligatorias(resultados: ResultadoParte[]): CifraObligatoria[] {
  const cifras: CifraObligatoria[] = [];
  for (const r of resultados) {
    if (r.estado === 'no_resuelto') continue;
    const total = (r.estado === 'ok' ? r.total : {}) as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(total)) {
      if (clave === 'porcentaje_jornales') continue;
      if (typeof valor === 'number' && Number.isFinite(valor) && valor !== 0) cifras.push({ parte: r.id, etiqueta: `${clave} del total`, tipo: 'numero', valor });
      if ((clave === 'primer_registro' || clave === 'ultimo_registro') && typeof valor === 'string') cifras.push({ parte: r.id, etiqueta: `${clave} del total`, tipo: 'fecha', valor });
    }
    if (r.estimados && r.estimados.jornales_estimados !== 0) {
      cifras.push({ parte: r.id, etiqueta: 'jornales estimados', tipo: 'numero', valor: r.estimados.jornales_estimados });
    }
  }
  return cifras;
}

/** Cifras obligatorias que la respuesta no dice. Vacío = no falta ninguna. */
export function verificarCifrasObligatorias(texto: string, resultados: ResultadoParte[]): string[] {
  const limpio = texto.replace(ISO_GLOBAL, ' ').replace(/^(\s*)\d{1,2}[.)]\s+/gm, '$1');
  const dichos = extraerTokensNumericos(limpio).flatMap((t) => t.valores.map((v) => Math.abs(v)));
  const faltan: string[] = [];
  for (const c of cifrasObligatorias(resultados)) {
    const dicho = c.tipo === 'fecha' ? fechaPresente(String(c.valor), texto) : soportado(Number(c.valor), dichos);
    if (!dicho) faltan.push(`${c.etiqueta} (${c.parte}): ${c.valor}`);
  }
  return faltan;
}
