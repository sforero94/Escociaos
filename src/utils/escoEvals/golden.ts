// Lectura y selección del conjunto dorado (JSONL). Valida la forma mínima que
// usa el arnés; no reescribe el contenido.

import type { CasoDorado } from './tipos';

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

export function validarCaso(caso: unknown, linea: number): CasoDorado {
  const c = caso as Partial<CasoDorado>;
  const donde = `línea ${linea}${c?.id ? ` (${c.id})` : ''}`;
  exigir(typeof c === 'object' && c !== null, `${donde}: no es un objeto`);
  exigir(typeof c.id === 'string' && /^ESCO-GS-\d+$/.test(c.id), `${donde}: id inválido`);
  exigir(typeof c.question === 'string' && c.question.length > 0, `${donde}: falta la pregunta`);
  exigir(c.channel === 'Web' || c.channel === 'Telegram', `${donde}: canal inválido`);
  exigir(typeof c.as_of_bogota === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(c.as_of_bogota), `${donde}: as_of_bogota inválido`);
  exigir(!!c.expected_behavior && Array.isArray(c.expected_behavior.tools_must_include), `${donde}: falta expected_behavior`);
  exigir(Array.isArray(c.must) && Array.isArray(c.must_not), `${donde}: faltan must / must_not`);
  exigir(Array.isArray(c.numeric_anchors), `${donde}: faltan numeric_anchors`);
  exigir(!!c.reference && typeof c.reference.sql === 'string', `${donde}: falta la referencia`);
  exigir(!!c.original && Array.isArray(c.original.runs), `${donde}: falta original.runs`);
  exigir(!!c.human_review && typeof c.human_review.verdict === 'string', `${donde}: falta human_review`);
  exigir(Array.isArray(c.prior_context) && Array.isArray(c.paraphrases) && Array.isArray(c.followup_turns), `${donde}: faltan contexto o variantes`);
  return c as CasoDorado;
}

export function parsearGolden(texto: string): CasoDorado[] {
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
  let sel = f.incluirExcluidos ? casos : casos.filter((c) => c.include_in_golden);
  if (f.ids?.length) {
    const pedidos = new Set(f.ids.map((x) => x.toUpperCase()));
    sel = sel.filter((c) => pedidos.has(c.id.toUpperCase()) || pedidos.has(c.key.toUpperCase()));
  }
  if (f.dominios?.length) sel = sel.filter((c) => f.dominios!.includes(c.domain));
  if (f.tipos?.length) sel = sel.filter((c) => f.tipos!.includes(c.kind));
  if (f.etiquetas?.length) sel = sel.filter((c) => c.tags.some((t) => f.etiquetas!.includes(t)));
  if (f.limite && f.limite > 0) sel = sel.slice(0, f.limite);
  return sel;
}

/** Las variantes de un caso: la pregunta principal y, si se piden, sus paráfrasis. */
export function variantesDelCaso(caso: CasoDorado, conParafrasis: boolean): { nombre: string; pregunta: string }[] {
  const variantes = [{ nombre: 'principal', pregunta: caso.question }];
  if (conParafrasis) {
    caso.paraphrases.forEach((p, i) => variantes.push({ nombre: `parafrasis_${i + 1}`, pregunta: p.replace(/^≈\s*/, '') }));
  }
  return variantes;
}
