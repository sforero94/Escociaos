// Resumen, informe en Markdown, comparación con una corrida base y calibración
// del arnés contra el veredicto del dueño.

import type { ResultadoCaso } from './tipos';

export interface FilaCaso {
  caso_id: string;
  clave: string;
  dominio: string;
  corridas: number;
  pasan: number;
  fallan: number;
  inconclusas: number;
  estado: 'estable_pasa' | 'estable_falla' | 'inestable' | 'inconcluso';
  razones: string[];
}

export interface ConteoGrupo { total: number; pasa: number; falla: number; inconcluso: number }

export interface ResumenEval {
  total: number;
  pasa: number;
  falla: number;
  inconcluso: number;
  /** pasa / (pasa + falla); las corridas inconclusas no cuentan. */
  tasa_pasa: number | null;
  /** true si ninguna corrida tuvo juez: el puntaje es solo de la capa determinista. */
  solo_determinista: boolean;
  por_dominio: Record<string, ConteoGrupo>;
  por_tipo: Record<string, ConteoGrupo>;
  por_etiqueta: Record<string, ConteoGrupo>;
  casos: FilaCaso[];
  motivos: { motivo: string; n: number }[];
  tokens: { entrada: number; salida: number };
}

function vacio(): ConteoGrupo { return { total: 0, pasa: 0, falla: 0, inconcluso: 0 }; }

function sumar(grupo: Record<string, ConteoGrupo>, clave: string, estado: ResultadoCaso['estado']): void {
  const g = (grupo[clave] ??= vacio());
  g.total += 1;
  g[estado] += 1;
}

/** Motivos estructurados por los que falló una corrida (para agrupar). */
export function motivosDeFalla(r: ResultadoCaso): string[] {
  const motivos: string[] = [];
  for (const c of r.determinista?.chequeos ?? []) {
    if (c.duro && c.ok === false) motivos.push(c.id.startsWith('ancla:') ? 'ancla_numerica' : c.id);
  }
  if (r.juez) {
    if (r.juez.criterios.some((c) => c.veredicto === 'no_cumple')) motivos.push('juez:no_cumple');
    if (r.juez.criterios.some((c) => c.veredicto === 'viola')) motivos.push('juez:viola');
    if (r.juez.contradice_referencia) motivos.push('juez:contradice_referencia');
    if (r.juez.oculto_fallo_herramienta === true) motivos.push('juez:oculto_fallo_herramienta');
  }
  return motivos;
}

export function resumir(resultados: ResultadoCaso[]): ResumenEval {
  const resumen: ResumenEval = {
    total: resultados.length, pasa: 0, falla: 0, inconcluso: 0, tasa_pasa: null,
    solo_determinista: resultados.length > 0 && resultados.every((r) => r.juez_estado === 'omitido'),
    por_dominio: {}, por_tipo: {}, por_etiqueta: {}, casos: [], motivos: [], tokens: { entrada: 0, salida: 0 },
  };
  const motivos = new Map<string, number>();
  const porCaso = new Map<string, ResultadoCaso[]>();

  for (const r of resultados) {
    resumen[r.estado] += 1;
    sumar(resumen.por_dominio, r.dominio, r.estado);
    sumar(resumen.por_tipo, r.tipo, r.estado);
    for (const t of r.etiquetas) sumar(resumen.por_etiqueta, t, r.estado);
    if (r.estado === 'falla') for (const m of motivosDeFalla(r)) motivos.set(m, (motivos.get(m) ?? 0) + 1);
    resumen.tokens.entrada += r.corrida.tokens?.entrada ?? 0;
    resumen.tokens.salida += r.corrida.tokens?.salida ?? 0;
    const lista = porCaso.get(r.caso_id) ?? [];
    lista.push(r);
    porCaso.set(r.caso_id, lista);
  }

  const concluyentes = resumen.pasa + resumen.falla;
  resumen.tasa_pasa = concluyentes > 0 ? resumen.pasa / concluyentes : null;
  resumen.motivos = [...motivos.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);

  for (const [id, lista] of porCaso) {
    const pasan = lista.filter((x) => x.estado === 'pasa').length;
    const fallan = lista.filter((x) => x.estado === 'falla').length;
    const inconclusas = lista.length - pasan - fallan;
    let estado: FilaCaso['estado'];
    if (pasan + fallan === 0) estado = 'inconcluso';
    else if (fallan === 0) estado = 'estable_pasa';
    else if (pasan === 0) estado = 'estable_falla';
    else estado = 'inestable';
    resumen.casos.push({
      caso_id: id, clave: lista[0].clave, dominio: lista[0].dominio, corridas: lista.length,
      pasan, fallan, inconclusas, estado,
      razones: [...new Set(lista.filter((x) => x.estado === 'falla').flatMap((x) => x.razones))].slice(0, 6),
    });
  }
  resumen.casos.sort((a, b) => a.caso_id.localeCompare(b.caso_id));
  return resumen;
}

// ---------------------------------------------------------------------------
// Comparación con una corrida base
// ---------------------------------------------------------------------------

export interface Comparacion {
  regresiones: string[];
  mejoras: string[];
  nuevos: string[];
  faltantes: string[];
}

const pasaTodo = (f: FilaCaso): boolean => f.estado === 'estable_pasa';

export function compararConBase(base: ResumenEval, actual: ResumenEval): Comparacion {
  const b = new Map(base.casos.map((c) => [c.caso_id, c]));
  const a = new Map(actual.casos.map((c) => [c.caso_id, c]));
  const cmp: Comparacion = { regresiones: [], mejoras: [], nuevos: [], faltantes: [] };
  for (const [id, fila] of a) {
    const previa = b.get(id);
    if (!previa) { cmp.nuevos.push(id); continue; }
    if (fila.estado === 'inconcluso' || previa.estado === 'inconcluso') continue;
    if (pasaTodo(previa) && !pasaTodo(fila)) cmp.regresiones.push(id);
    if (!pasaTodo(previa) && pasaTodo(fila)) cmp.mejoras.push(id);
  }
  for (const id of b.keys()) if (!a.has(id)) cmp.faltantes.push(id);
  return cmp;
}

// ---------------------------------------------------------------------------
// Calibración contra el veredicto del dueño (modo «originales»)
// ---------------------------------------------------------------------------

export interface Calibracion {
  /** Casos con veredicto humano limpio (correcta / incorrecta) y corrida concluyente. */
  n: number;
  /** El arnés dice «falla» y el dueño dijo incorrecta. */
  verdaderos_positivos: number;
  /** El arnés dice «falla» y el dueño dijo correcta. */
  falsos_positivos: number;
  /** El arnés dice «pasa» y el dueño dijo incorrecta. */
  falsos_negativos: number;
  verdaderos_negativos: number;
  acuerdo: number | null;
  /** De las respuestas que el dueño marcó incorrectas, cuántas detecta el arnés. */
  recall_fallas: number | null;
  /** De las que el arnés marca como falla, cuántas son realmente incorrectas. */
  precision_fallas: number | null;
  omitidos: number;
  discrepancias: { caso_id: string; humano: string; arnes: string; razones: string[] }[];
}

export function calibrar(resultados: ResultadoCaso[]): Calibracion {
  const cal: Calibracion = {
    n: 0, verdaderos_positivos: 0, falsos_positivos: 0, falsos_negativos: 0, verdaderos_negativos: 0,
    acuerdo: null, recall_fallas: null, precision_fallas: null, omitidos: 0, discrepancias: [],
  };
  for (const r of resultados) {
    const h = r.veredicto_humano_original;
    if ((h !== 'correcta' && h !== 'incorrecta') || r.estado === 'inconcluso' || r.repeticion !== 1 || r.variante !== 'principal') {
      cal.omitidos += 1;
      continue;
    }
    cal.n += 1;
    const arnesFalla = r.estado === 'falla';
    const humanoFalla = h === 'incorrecta';
    if (arnesFalla && humanoFalla) cal.verdaderos_positivos += 1;
    else if (arnesFalla && !humanoFalla) cal.falsos_positivos += 1;
    else if (!arnesFalla && humanoFalla) cal.falsos_negativos += 1;
    else cal.verdaderos_negativos += 1;
    if (arnesFalla !== humanoFalla) cal.discrepancias.push({ caso_id: r.caso_id, humano: h, arnes: r.estado, razones: r.razones });
  }
  if (cal.n > 0) cal.acuerdo = (cal.verdaderos_positivos + cal.verdaderos_negativos) / cal.n;
  const humanosIncorrectos = cal.verdaderos_positivos + cal.falsos_negativos;
  const arnesFallas = cal.verdaderos_positivos + cal.falsos_positivos;
  if (humanosIncorrectos > 0) cal.recall_fallas = cal.verdaderos_positivos / humanosIncorrectos;
  if (arnesFallas > 0) cal.precision_fallas = cal.verdaderos_positivos / arnesFallas;
  return cal;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

export interface MetaInforme {
  fecha: string;
  modo: string;
  conjunto: string;
  modelo_juez: string | null;
  modo_fecha: string;
  repeticiones: number;
}

const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toFixed(0)} %`);

function tabla(titulo: string, grupo: Record<string, ConteoGrupo>): string {
  const filas = Object.entries(grupo).sort((a, b) => a[0].localeCompare(b[0]));
  if (filas.length === 0) return '';
  const lineas = filas.map(([k, g]) => {
    const concl = g.pasa + g.falla;
    return `| ${k} | ${g.total} | ${g.pasa} | ${g.falla} | ${g.inconcluso} | ${pct(concl > 0 ? g.pasa / concl : null)} |`;
  });
  return `### ${titulo}\n\n| ${titulo.split(' ').pop()} | Corridas | Pasan | Fallan | Inconclusas | % |\n|---|---:|---:|---:|---:|---:|\n${lineas.join('\n')}\n`;
}

export function aMarkdown(resumen: ResumenEval, meta: MetaInforme, comparacion?: Comparacion | null, calibracion?: Calibracion | null): string {
  const partes: string[] = [];
  partes.push(`# Evaluación de Esco — ${meta.fecha}\n`);
  partes.push(`- Modo: **${meta.modo}** · fecha de las corridas: ${meta.modo_fecha} · repeticiones: ${meta.repeticiones}`);
  partes.push(`- Conjunto: \`${meta.conjunto}\``);
  partes.push(`- Juez: ${meta.modelo_juez ?? '**ninguno (solo capa determinista)**'}`);
  partes.push(`- Tokens: ${resumen.tokens.entrada.toLocaleString('es-CO')} entrada / ${resumen.tokens.salida.toLocaleString('es-CO')} salida (Esco + juez)\n`);
  partes.push(`## Resultado\n\n**${resumen.pasa} pasan · ${resumen.falla} fallan · ${resumen.inconcluso} inconclusas** de ${resumen.total} corridas — ${pct(resumen.tasa_pasa)} sobre las concluyentes.\n`);
  if (resumen.solo_determinista) partes.push('> Sin juez: «pasa» solo significa que la capa determinista no encontró fallas. Los criterios «debe / no debe incluir» no se evaluaron.\n');

  const inestables = resumen.casos.filter((c) => c.estado === 'inestable');
  if (inestables.length > 0) {
    partes.push(`## Casos inestables (pasan y fallan con la misma entrada)\n\n${inestables.map((c) => `- ${c.caso_id} (${c.clave}): ${c.pasan}/${c.corridas} pasan`).join('\n')}\n`);
  }
  if (resumen.motivos.length > 0) {
    partes.push(`## Por qué fallan\n\n| Motivo | Corridas |\n|---|---:|\n${resumen.motivos.map((m) => `| ${m.motivo} | ${m.n} |`).join('\n')}\n`);
  }
  partes.push(tabla('Por dominio', resumen.por_dominio));
  partes.push(tabla('Por tipo', resumen.por_tipo));
  partes.push(tabla('Por etiqueta', resumen.por_etiqueta));

  const fallan = resumen.casos.filter((c) => c.estado === 'estable_falla' || c.estado === 'inestable');
  if (fallan.length > 0) {
    partes.push(`## Casos que fallan\n\n${fallan.map((c) => `### ${c.caso_id} (${c.clave}) — ${c.pasan}/${c.corridas} pasan\n${c.razones.map((r) => `- ${r}`).join('\n')}`).join('\n\n')}\n`);
  }

  if (comparacion) {
    partes.push(`## Contra la corrida base\n\n- Regresiones (${comparacion.regresiones.length}): ${comparacion.regresiones.join(', ') || '—'}\n- Mejoras (${comparacion.mejoras.length}): ${comparacion.mejoras.join(', ') || '—'}\n- Casos nuevos: ${comparacion.nuevos.join(', ') || '—'}\n- Casos que faltan: ${comparacion.faltantes.join(', ') || '—'}\n`);
  }
  if (calibracion) {
    partes.push(`## Calibración contra el veredicto del dueño (respuestas originales)\n\n- Casos comparables: ${calibracion.n} (omitidos: ${calibracion.omitidos})\n- Acuerdo: ${pct(calibracion.acuerdo)} · detecta ${pct(calibracion.recall_fallas)} de las respuestas incorrectas · ${pct(calibracion.precision_fallas)} de sus fallas son reales\n- Falsos negativos (el arnés deja pasar algo que el dueño marcó incorrecto): ${calibracion.falsos_negativos}\n- Falsos positivos (el arnés reprueba algo que el dueño marcó correcto): ${calibracion.falsos_positivos}\n${calibracion.discrepancias.length > 0 ? `\n| Caso | Dueño | Arnés | Razones |\n|---|---|---|---|\n${calibracion.discrepancias.map((d) => `| ${d.caso_id} | ${d.humano} | ${d.arnes} | ${d.razones.slice(0, 2).join('; ').replace(/\|/g, '/')} |`).join('\n')}\n` : ''}`);
  }
  return partes.filter(Boolean).join('\n');
}
