// Capa 2 del puntaje: juez LLM. Califica cada criterio «debe incluir» / «no debe
// incluir» del caso, contra la REFERENCIA aprobada (SQL + resultado congelado),
// nunca contra la respuesta original de Esco.

import { herramientasDeLaCorrida } from './deterministico';
import type {
  CasoDorado,
  CorridaEjecutada,
  Criterio,
  ResultadoCriterio,
  ResultadoJuez,
  VeredictoCriterio,
} from './tipos';

export interface ConfigJuez {
  baseUrl: string;
  apiKey: string;
  modelo: string;
  fetchImpl?: typeof fetch;
}

export interface MensajeJuez {
  role: 'system' | 'user';
  content: string;
}

export function criteriosDelCaso(caso: CasoDorado): Criterio[] {
  return [
    ...caso.must.map((texto, i) => ({ id: `debe_${i + 1}`, tipo: 'debe' as const, texto })),
    ...caso.must_not.map((texto, i) => ({ id: `no_debe_${i + 1}`, tipo: 'no_debe' as const, texto })),
  ];
}

const INSTRUCCIONES = `Eres un evaluador estricto de un asistente de datos agrícolas llamado Esco.
Recibes: la pregunta del usuario, la respuesta de Esco, las herramientas que usó (con un resumen recortado de lo que devolvieron) y la REFERENCIA aprobada por el dueño (consulta SQL y su resultado).

REGLAS
1. La verdad es SOLO la referencia. La respuesta de Esco no prueba nada por sí misma. Si una cifra o un hecho de la respuesta no coincide con la referencia, es un error aunque suene razonable.
2. Si la referencia trae una nota de que cambió después de la fecha de la pregunta, tolera diferencias pequeñas y explícalo en la evidencia; no toleres diferencias de orden de magnitud ni conclusiones contrarias.
3. Califica cada criterio por separado. Para los criterios «debe»: "cumple" | "no_cumple" | "no_aplica". Para los criterios «no_debe»: "viola" | "no_viola" | "no_aplica".
4. Usa "no_aplica" solo cuando el criterio no se puede evaluar por la forma de la respuesta. Ejemplo: el caso exige aclarar y Esco aclaró en lugar de responder; entonces los criterios que piden el resultado final son "no_aplica".
5. La evidencia es una cita corta y literal de la respuesta (máx. 25 palabras), o "(ausente)".
6. "contradice_referencia" es true si CUALQUIER afirmación factual de la respuesta contradice la referencia, aunque no esté en ningún criterio.
7. "oculto_fallo_herramienta": si alguna herramienta devolvió error, true si la respuesta lo omite o presenta datos como si la consulta hubiera funcionado; false si lo declara. Si ninguna falló, null.
8. No premies la longitud ni el tono. No supongas intención.

Responde SOLO con JSON válido, sin texto antes ni después:
{"criterios":[{"id":"debe_1","veredicto":"cumple","evidencia":"..."}],"contradice_referencia":false,"oculto_fallo_herramienta":null,"comentario":"una frase"}`;

function recortar(texto: string, max: number): string {
  return texto.length <= max ? texto : `${texto.slice(0, max)} …[recortado]`;
}

function describirTurnos(corrida: CorridaEjecutada): string {
  return corrida.turnos
    .map((t, i) => {
      const herramientas = t.herramientas.length === 0
        ? '(ninguna)'
        : t.herramientas
          .map((h) => `- ${h.tool}(${recortar(JSON.stringify(h.args ?? {}), 300)})${h.error ? ' [ERROR]' : ''}: ${h.result_summary ? recortar(h.result_summary, 500) : '(resultado no disponible)'}`)
          .join('\n');
      return `### Turno ${i + 1}\nPregunta: ${t.pregunta}\nHerramientas:\n${herramientas}\nRespuesta de Esco:\n${recortar(t.respuesta, 6000)}`;
    })
    .join('\n\n');
}

export function construirMensajesJuez(caso: CasoDorado, corrida: CorridaEjecutada): MensajeJuez[] {
  const criterios = criteriosDelCaso(caso);
  const lista = criterios.map((c) => `- ${c.id} (${c.tipo === 'debe' ? 'DEBE' : 'NO DEBE'}): ${c.texto}`).join('\n');
  const ref = caso.reference;
  const referencia = [
    `Fecha de la pregunta (Bogotá): ${caso.as_of_bogota}`,
    `Resultado congelado el ${ref.frozen_on}: ${JSON.stringify(ref.frozen_result ?? null)}`,
    ref.sql && !ref.sql.trim().startsWith('--') ? `SQL de referencia:\n${ref.sql}` : null,
    ref.replayable_as_of === false && ref.replay_note ? `Nota (la base cambió después de la pregunta): ${ref.replay_note}` : null,
    ref.tolerance ? `Tolerancia: ${ref.tolerance}` : null,
    caso.expected_behavior.note ? `Nota del caso: ${caso.expected_behavior.note}` : null,
    caso.expected_behavior.should_clarify ? 'Este caso EXIGE que Esco aclare con el usuario antes de consultar.' : null,
  ].filter(Boolean).join('\n');

  const contenido = `## Caso ${caso.id}: ${caso.title}
Canal: ${corrida.turnos.length > 0 ? caso.channel : '-'}  ·  Herramientas usadas: ${herramientasDeLaCorrida(corrida).join(', ') || '(ninguna)'}

## Referencia aprobada
${referencia}

## Criterios a calificar
${lista || '(sin criterios)'}

## Conversación evaluada
${describirTurnos(corrida)}`;

  return [
    { role: 'system', content: INSTRUCCIONES },
    { role: 'user', content: contenido },
  ];
}

const VEREDICTOS_DEBE: VeredictoCriterio[] = ['cumple', 'no_cumple', 'no_aplica'];
const VEREDICTOS_NO_DEBE: VeredictoCriterio[] = ['viola', 'no_viola', 'no_aplica'];

function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(limpio);
  } catch {
    const ini = limpio.indexOf('{');
    const fin = limpio.lastIndexOf('}');
    if (ini >= 0 && fin > ini) return JSON.parse(limpio.slice(ini, fin + 1));
    throw new Error('El juez no devolvió JSON');
  }
}

/** Valida la respuesta del juez contra los criterios del caso; lanza si está malformada. */
export function parsearRespuestaJuez(texto: string, criterios: Criterio[]): ResultadoJuez {
  const bruto = extraerJson(texto) as Record<string, unknown>;
  const lista = Array.isArray(bruto.criterios) ? (bruto.criterios as Record<string, unknown>[]) : [];
  const resultados: ResultadoCriterio[] = criterios.map((c) => {
    const hallado = lista.find((x) => x.id === c.id);
    if (!hallado) throw new Error(`El juez no calificó el criterio ${c.id}`);
    const veredicto = String(hallado.veredicto) as VeredictoCriterio;
    const validos = c.tipo === 'debe' ? VEREDICTOS_DEBE : VEREDICTOS_NO_DEBE;
    if (!validos.includes(veredicto)) throw new Error(`Veredicto inválido para ${c.id}: ${veredicto}`);
    return { id: c.id, veredicto, evidencia: String(hallado.evidencia ?? '') };
  });
  const oculto = bruto.oculto_fallo_herramienta;
  return {
    criterios: resultados,
    contradice_referencia: bruto.contradice_referencia === true,
    oculto_fallo_herramienta: typeof oculto === 'boolean' ? oculto : null,
    comentario: String(bruto.comentario ?? ''),
  };
}

/** Razones por las que el juez hace fallar el caso (lista vacía = el juez aprueba). */
export function razonesDelJuez(juez: ResultadoJuez, criterios: Criterio[]): string[] {
  const razones: string[] = [];
  for (const r of juez.criterios) {
    const c = criterios.find((x) => x.id === r.id);
    if (!c) continue;
    if (r.veredicto === 'no_cumple') razones.push(`no cumple «${c.texto}»${r.evidencia ? ` — ${r.evidencia}` : ''}`);
    if (r.veredicto === 'viola') razones.push(`viola «${c.texto}»${r.evidencia ? ` — ${r.evidencia}` : ''}`);
  }
  if (juez.contradice_referencia) razones.push(`contradice la referencia${juez.comentario ? ` — ${juez.comentario}` : ''}`);
  if (juez.oculto_fallo_herramienta === true) razones.push('ocultó el fallo de una herramienta');
  return razones;
}

export async function llamarJuez(
  mensajes: MensajeJuez[],
  cfg: ConfigJuez,
): Promise<{ texto: string; tokens: { entrada: number; salida: number } }> {
  const f = cfg.fetchImpl ?? fetch;
  const res = await f(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.modelo,
      messages: mensajes,
      temperature: 0,
      max_tokens: 2500,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`Juez: HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const cuerpo = await res.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const texto = cuerpo.choices?.[0]?.message?.content;
  if (!texto) throw new Error('Juez: respuesta vacía');
  return { texto, tokens: { entrada: cuerpo.usage?.prompt_tokens ?? 0, salida: cuerpo.usage?.completion_tokens ?? 0 } };
}
