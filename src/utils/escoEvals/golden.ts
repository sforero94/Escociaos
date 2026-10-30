// Lectura y selección del conjunto dorado (JSONL). Valida la forma mínima que
// usa el arnés; no reescribe el contenido.

import type { CasoDorado } from './tipos';
import { asOfUtc } from './fechas';

export interface FiltrosCasos {
  /** IDs («ESCO-GS-012») o claves («A01»). */
  ids?: string[];
  dominios?: string[];
  etiquetas?: string[];
  tipos?: string[];
  limite?: number;
  /** Incluir también los casos excluidos del conjunto dorado. Por defecto no. */
  incluirExcluidos?: boolean;
}

function exigir(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(mensaje);
}

const textoValido = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const cadenas = (v: unknown): v is string[] => Array.isArray(v) && v.every(textoValido);
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const opcionalTexto = (v: unknown): boolean => v == null || typeof v === 'string';

function fechaValida(v: unknown): boolean {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  try { asOfUtc(v + ' 00:00'); return true; } catch { return false; }
}

/** Valida el contrato tipado; null explícito no se convierte en evidencia válida. */
export function validarCaso(caso: unknown, linea: number): CasoDorado {
  const donde = `línea ${linea}`;
  exigir(objeto(caso), `${donde}: no es un objeto`);
  const c = caso as Partial<CasoDorado>;
  exigir(typeof c.id === 'string' && /^ESCO-GS-\d+$/.test(c.id), `${donde}: id inválido`);
  for (const clave of ['key', 'title', 'domain', 'question', 'golden_status'] as const) {
    exigir(textoValido(c[clave]), `${donde}: falta ${clave}`);
  }
  exigir(c.channel === 'Web' || c.channel === 'Telegram', `${donde}: canal inválido`);
  exigir(cadenas(c.channels_observed), `${donde}: channels_observed inválido`);
  exigir(typeof c.as_of_bogota === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c.as_of_bogota), `${donde}: as_of_bogota inválido`);
  try { asOfUtc(c.as_of_bogota!); } catch { throw new Error(`${donde}: fecha imposible`); }
  exigir(['factual_sql', 'behavior', 'rubric_analysis'].includes(c.kind!), `${donde}: kind inválido`);
  exigir(typeof c.include_in_golden === 'boolean', `${donde}: include_in_golden inválido`);
  exigir(!c.include_in_golden || c.golden_status === 'aprobado', `${donde}: caso incluido sin aprobación`);
  for (const clave of ['must', 'must_not', 'tags', 'paraphrases'] as const) {
    exigir(cadenas(c[clave]), `${donde}: ${clave} debe contener texto`);
  }
  exigir(c.paraphrases!.every((p) => textoValido(p.replace(/^≈\s*/, ''))), `${donde}: paráfrasis vacía`);

  exigir(objeto(c.expected_behavior), `${donde}: falta expected_behavior`);
  const esp = c.expected_behavior!;
  for (const clave of ['tools_must_include', 'tools_any_of', 'tools_forbidden'] as const) {
    exigir(cadenas(esp[clave]), `${donde}: ${clave} inválido`);
  }
  exigir(esp.max_tool_calls === null || entero(esp.max_tool_calls), `${donde}: max_tool_calls inválido`);
  exigir(esp.should_clarify === undefined || typeof esp.should_clarify === 'boolean', `${donde}: should_clarify inválido`);
  exigir(opcionalTexto(esp.note), `${donde}: note inválido`);

  exigir(objeto(c.reference), `${donde}: falta la referencia`);
  const ref = c.reference!;
  exigir(ref.type === 'sql' || ref.type === 'rubric', `${donde}: reference.type inválido`);
  exigir(typeof ref.sql === 'string', `${donde}: falta reference.sql`);
  exigir(Object.prototype.hasOwnProperty.call(ref, 'frozen_result') && ref.frozen_result !== undefined, `${donde}: falta frozen_result`);
  exigir(fechaValida(ref.frozen_on), `${donde}: frozen_on inválido`);
  exigir(ref.replayable_as_of === null || typeof ref.replayable_as_of === 'boolean', `${donde}: replayable_as_of inválido`);
  exigir(opcionalTexto(ref.replay_note) && opcionalTexto(ref.tolerance), `${donde}: nota o tolerancia de referencia inválida`);
  exigir(Array.isArray(c.numeric_anchors), `${donde}: faltan numeric_anchors`);
  exigir(c.numeric_anchors!.every((a) => objeto(a) && textoValido(a.claim) &&
    ((typeof a.value === 'number' && Number.isFinite(a.value)) || fechaValida(a.value)) &&
    (a.tol == null || (typeof a.tol === 'number' && Number.isFinite(a.tol) && a.tol >= 0))), `${donde}: ancla numérica inválida`);

  exigir(Array.isArray(c.prior_context) && c.prior_context.every((p) => objeto(p) && entero(p.rn) &&
    typeof p.user === 'string' && typeof p.assistant_original === 'string'), `${donde}: prior_context inválido`);
  exigir(Array.isArray(c.followup_turns) && c.followup_turns.every((p) => objeto(p) && entero(p.rn) &&
    textoValido(p.user)), `${donde}: followup_turns inválido`);
  exigir(objeto(c.original), `${donde}: falta original`);
  const original = c.original!;
  exigir(typeof original.verdict === 'string' && cadenas(original.issues) && typeof original.answer_primary === 'string', `${donde}: original inválido`);
  exigir(Array.isArray(original.runs) && original.runs.every((r) => objeto(r) && entero(r.rn) && textoValido(r.ts_bogota) &&
    textoValido(r.canal) && typeof r.question === 'string' && textoValido(r.status) && Array.isArray(r.tools) &&
    r.tools.every((h: unknown) => objeto(h) && textoValido(h.tool) &&
      (h.args === undefined || objeto(h.args)) && (h.result_summary === undefined || typeof h.result_summary === 'string') &&
      (h.error === undefined || typeof h.error === 'boolean') &&
      (h.ms === undefined || (typeof h.ms === 'number' && Number.isFinite(h.ms) && h.ms >= 0)))), `${donde}: original.runs inválido`);
  exigir(objeto(c.human_review), `${donde}: falta human_review`);
  exigir(['correcta', 'incorrecta', 'mixta', 'parcial', 'no_verificable'].includes(c.human_review!.verdict), `${donde}: veredicto humano inválido`);
  exigir(typeof c.human_review!.verdict_raw === 'string' &&
    (c.human_review!.inferred === undefined || typeof c.human_review!.inferred === 'boolean'), `${donde}: human_review inválido`);
  return c as CasoDorado;
}

export function parsearGolden(texto: string): CasoDorado[] {
  exigir(typeof texto === 'string', 'JSONL: se esperaba texto');
  const casos: CasoDorado[] = [];
  const ids = new Set<string>();
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    let bruto: unknown;
    try {
      bruto = JSON.parse(linea);
    } catch {
      throw new Error(`línea ${i + 1}: JSON inválido`);
    }
    const caso = validarCaso(bruto, i + 1);
    exigir(!ids.has(caso.id), `id repetido: ${caso.id}`);
    ids.add(caso.id);
    casos.push(caso);
  });
  exigir(casos.length > 0, 'el conjunto dorado está vacío');
  return casos;
}

export function seleccionarCasos(casos: CasoDorado[], f: FiltrosCasos = {}): CasoDorado[] {
  exigir(objeto(f), 'filtros: se esperaba un objeto');
  const conocidas = ['ids', 'dominios', 'etiquetas', 'tipos', 'limite', 'incluirExcluidos'];
  exigir(Object.keys(f).every((k) => conocidas.includes(k)), 'filtros: campo desconocido');
  for (const clave of ['ids', 'dominios', 'etiquetas', 'tipos'] as const) {
    exigir(f[clave] === undefined || cadenas(f[clave]), `filtros: ${clave} inválido`);
  }
  exigir(f.incluirExcluidos === undefined || typeof f.incluirExcluidos === 'boolean', 'filtros: incluirExcluidos inválido');
  exigir(f.limite === undefined || (entero(f.limite) && f.limite > 0), 'filtros: limite inválido');
  exigir(Array.isArray(casos), 'casos: se esperaba una lista');
  const vistos = new Set<string>();
  casos.forEach((c, i) => {
    validarCaso(c, i + 1);
    exigir(!vistos.has(c.id), `id repetido: ${c.id}`);
    vistos.add(c.id);
  });
  let sel = f.incluirExcluidos ? casos : casos.filter((c) => c.include_in_golden);
  if (f.ids?.length) {
    const pedidos = new Set(f.ids.map((x) => x.toUpperCase()));
    sel = sel.filter((c) => pedidos.has(c.id.toUpperCase()) || pedidos.has(c.key.toUpperCase()));
  }
  if (f.dominios?.length) sel = sel.filter((c) => f.dominios!.includes(c.domain));
  if (f.tipos?.length) sel = sel.filter((c) => f.tipos!.includes(c.kind));
  if (f.etiquetas?.length) sel = sel.filter((c) => c.tags.some((t) => f.etiquetas!.includes(t)));
  if (f.limite !== undefined) sel = sel.slice(0, f.limite);
  return sel;
}

/** Las variantes de un caso: la pregunta principal y, si se piden, sus paráfrasis. */
export function variantesDelCaso(caso: CasoDorado, conParafrasis: boolean): { nombre: string; pregunta: string }[] {
  validarCaso(caso, 1);
  exigir(typeof conParafrasis === 'boolean', 'conParafrasis inválido');
  const variantes = [{ nombre: 'principal', pregunta: caso.question }];
  if (conParafrasis) {
    caso.paraphrases.forEach((p, i) => variantes.push({ nombre: `parafrasis_${i + 1}`, pregunta: p.replace(/^≈\s*/, '') }));
  }
  return variantes;
}
