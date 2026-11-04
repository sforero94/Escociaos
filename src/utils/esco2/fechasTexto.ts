// Extracción de fechas de un texto en español, para el scorer. Devuelve fechas ISO.
// Se usa para detectar fechas de MÁS en una respuesta (una fecha afirmada que no está en la
// referencia), así que prefiere no extraer a extraer mal: un falso positivo castiga una
// respuesta buena. Formas reconocidas:
//   AAAA-MM-DD · «18 de mayo (de 2026)» · «22-may» · «27 abr» · «del 18 al 31 de mayo» · d/m/aaaa
// No se reconocen «mayo 22» ni «d-m» sin año: «10-12 jornales» no es una fecha.

import { esFechaCalendario } from './fechaCalendario.ts';

const MESES: Array<[string, number]> = [
  ['septiembre', 9], ['setiembre', 9], ['noviembre', 11], ['diciembre', 12], ['febrero', 2], ['octubre', 10],
  ['agosto', 8], ['enero', 1], ['marzo', 3], ['abril', 4], ['junio', 6], ['julio', 7], ['mayo', 5],
  ['sept', 9], ['ene', 1], ['feb', 2], ['mar', 3], ['abr', 4], ['may', 5], ['jun', 6], ['jul', 7], ['ago', 8], ['sep', 9], ['oct', 10], ['nov', 11], ['dic', 12],
];
const MES_RE = MESES.map(([n]) => n).join('|');
const MES_NUM = new Map(MESES);

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function iso(anio: number, mes: number, dia: number): string | null {
  const s = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return esFechaCalendario(s) ? s : null;
}

export function extraerFechas(texto: string, anioPorDefecto: number): Set<string> {
  const fechas = new Set<string>();
  const t = sinTildes(texto);
  const agregar = (f: string | null) => {
    if (f) fechas.add(f);
  };

  for (const m of t.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) agregar(iso(Number(m[1]), Number(m[2]), Number(m[3])));
  const sinIso = t.replace(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g, ' ');

  // d/m/aaaa o d/m/aa, d-m-aaaa
  for (const m of sinIso.matchAll(/(?<!\d)(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?!\d)/g)) {
    const a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    agregar(iso(a, Number(m[2]), Number(m[1])));
  }
  // d/m sin año (solo con barra)
  for (const m of sinIso.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) agregar(iso(anioPorDefecto, Number(m[2]), Number(m[1])));

  // «18 de mayo», «18 al 31 de mayo», «22-may», «27 abr», con año opcional.
  const re = new RegExp(
    `(?<!\\d)(\\d{1,2})(?:\\s*(?:al|a|y|[-–—])\\s*(\\d{1,2}))?\\s*(?:de\\s+|-|/)?\\s*(${MES_RE})\\b\\.?(?:\\s*(?:de(?:l)?\\s+|,\\s*|-)?\\s*(\\d{4})(?!\\d))?`,
    'g',
  );
  for (const m of sinIso.matchAll(re)) {
    const mes = MES_NUM.get(m[3]);
    if (!mes) continue;
    const anio = m[4] ? Number(m[4]) : anioPorDefecto;
    agregar(iso(anio, mes, Number(m[1])));
    if (m[2]) agregar(iso(anio, mes, Number(m[2])));
  }
  return fechas;
}
