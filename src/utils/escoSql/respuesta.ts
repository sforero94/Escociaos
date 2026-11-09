// El JSON final contiene solo prosa y opciones; los visuales salen de mostrar_visual.
export interface Aclaracion { pregunta: string; opciones: string[] }
export interface RespuestaFinal { texto: string; sugerencias: string[]; aclaracion?: Aclaracion }
const limpiarTexto = (texto: string) => texto.replace(/```(?:chart|json)\b[\s\S]*?(?:```|$)/gi, '').trim();
function opciones(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 100 && !/[\p{N}$€£\n`{}<>]/u.test(s)))].slice(0, 3);
}
export function leerRespuestaFinal(bruto: string): RespuestaFinal {
  const contenido = bruto.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  try {
    const valor: unknown = JSON.parse(contenido);
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return { texto: '', sugerencias: [] };
    const r = valor as Record<string, unknown>;
    const salida: RespuestaFinal = { texto: typeof r.texto === 'string' ? limpiarTexto(r.texto) : '', sugerencias: opciones(r.sugerencias) };
    if (typeof r.aclaracion === 'object' && r.aclaracion !== null && !Array.isArray(r.aclaracion)) {
      const a = r.aclaracion as Record<string, unknown>;
      if (typeof a.pregunta === 'string' && a.pregunta.trim().length > 0 && a.pregunta.length <= 160) salida.aclaracion = { pregunta: a.pregunta.trim(), opciones: opciones(a.opciones) };
    }
    return salida;
  } catch {
    // Un JSON roto no se muestra como prosa. El texto plano anterior a v1 sigue permitido.
    return { texto: /^[{[]/.test(contenido) ? '' : limpiarTexto(bruto), sugerencias: [] };
  }
}
