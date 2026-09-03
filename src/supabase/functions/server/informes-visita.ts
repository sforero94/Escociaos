// GENERATED COPY of src/utils/informesVisita/esco.ts — keep byte-identical
// below this header. chat.tsx cannot import across the Vite/Deno boundary.
/**
 * Formato de respuesta de Esco para informes de visita.
 * Fuente distinta de rondas_monitoreo / monitoreos. Cita informe y snippet.
 * Los insumos salen de chips o del texto del snippet: nunca se inventan.
 * No hay embeddings: FTS español + ventana de visitas.
 */

export const FUENTE_INFORME_VISITA = 'informe_visita_agronomica';
export const ADVERTENCIA_FUENTE =
  'Fuente: informe de visita agronómica (Word / nota de visita). No es ronda_monitoreo ni monitoreos de la app.';

export interface InformeEsco {
  id: string;
  fecha_visita: string;
  agronoma: string | null;
  finca: string | null;
  especie: string | null;
  fenologia: string | null;
  materia_seca: string | null;
  proyeccion_cosecha: string | null;
  sin_texto: boolean;
  texto_extraido: string | null;
}

export interface SnippetEsco {
  id: string;
  informe_id: string;
  texto: string;
  cita_word: string | null;
  origen: string;
  tipo: string | null;
  insumo: string | null;
  plaga: string | null;
  foto_id: string | null;
  temas: string[];
}

export interface FotoEsco {
  id: string;
  informe_id: string;
  pie_de_foto: string | null;
  orden: number;
}

export interface RespuestaEscoInformes {
  fuente: typeof FUENTE_INFORME_VISITA;
  advertencia: typeof ADVERTENCIA_FUENTE;
  total_informes: number;
  total_snippets: number;
  insumos_en_fuente: string[];
  ventana_completa: boolean;
  informes: Array<{
    id: string;
    fecha_visita: string;
    agronoma: string | null;
    finca: string | null;
    especie: string | null;
    fenologia: string | null;
    materia_seca: string | null;
    proyeccion_cosecha: string | null;
    sin_texto: boolean;
    cita: { informe_id: string };
    extracto_texto: string | null;
  }>;
  snippets: Array<SnippetEsco & { cita: { informe_id: string; snippet_id: string } }>;
  pies_de_foto: Array<{ informe_id: string; foto_id: string; pie_de_foto: string; cita: { informe_id: string; foto_id: string } }>;
}

function extracto(texto: string | null, limite = 400): string | null {
  if (!texto) return null;
  const t = texto.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length <= limite ? t : `${t.slice(0, limite)}…`;
}

export function formatearRespuestaEsco(opts: {
  informes: InformeEsco[];
  snippets: SnippetEsco[];
  fotos: FotoEsco[];
  ventana_completa?: boolean;
}): RespuestaEscoInformes {
  const insumos = [...new Set(
    opts.snippets
      .map((s) => s.insumo?.trim())
      .filter((s): s is string => Boolean(s)),
  )].sort();

  return {
    fuente: FUENTE_INFORME_VISITA,
    advertencia: ADVERTENCIA_FUENTE,
    total_informes: opts.informes.length,
    total_snippets: opts.snippets.length,
    insumos_en_fuente: insumos,
    ventana_completa: Boolean(opts.ventana_completa),
    informes: opts.informes.map((i) => ({
      id: i.id,
      fecha_visita: i.fecha_visita,
      agronoma: i.agronoma,
      finca: i.finca,
      especie: i.especie,
      fenologia: i.fenologia,
      materia_seca: i.materia_seca,
      proyeccion_cosecha: i.proyeccion_cosecha,
      sin_texto: i.sin_texto,
      cita: { informe_id: i.id },
      extracto_texto: extracto(i.texto_extraido),
    })),
    snippets: opts.snippets.map((s) => ({
      ...s,
      cita: { informe_id: s.informe_id, snippet_id: s.id },
    })),
    pies_de_foto: opts.fotos
      .filter((f) => Boolean(f.pie_de_foto?.trim()))
      .map((f) => ({
        informe_id: f.informe_id,
        foto_id: f.id,
        pie_de_foto: f.pie_de_foto as string,
        cita: { informe_id: f.informe_id, foto_id: f.id },
      })),
  };
}

/** Un insumo solo se afirma si está en chips o en el texto del snippet. */
export function insumoEstaEnFuente(
  nombre: string,
  respuesta: RespuestaEscoInformes,
  textos: string[],
): boolean {
  const n = nombre.trim().toLowerCase();
  if (!n) return false;
  if (respuesta.insumos_en_fuente.some((i) => i.toLowerCase() === n)) return true;
  if (respuesta.snippets.some((s) => s.texto.toLowerCase().includes(n))) return true;
  return textos.some((t) => t.toLowerCase().includes(n));
}
