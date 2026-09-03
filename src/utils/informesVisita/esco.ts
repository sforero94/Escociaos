/**
 * Formato de respuesta de Esco para informes de visita.
 * Fuente distinta de rondas_monitoreo / monitoreos. Cita informe y fila.
 * Los insumos salen de las filas o del texto: nunca se inventan.
 */

export const FUENTE_INFORME_VISITA = 'informe_visita_agronomica';
export const ADVERTENCIA_FUENTE =
  'Fuente: informe de visita agronómica (Word). No es ronda_monitoreo ni monitoreos de la app.';

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

export interface ObservacionEsco {
  id: string;
  informe_id: string;
  fecha: string;
  fecha_contexto: string | null;
  tipo: string;
  lote: string | null;
  plaga_enfermedad: string | null;
  accion: string | null;
  insumo: string | null;
  dosis: number | null;
  unidad: string | null;
  periodo_carencia_dias: number | null;
  via: string | null;
  incidencia: string | null;
  severidad: string | null;
  notas: string | null;
  foto_id: string | null;
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
  total_observaciones: number;
  insumos_en_fuente: string[];
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
  observaciones: Array<ObservacionEsco & { cita: { informe_id: string; observacion_id: string } }>;
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
  observaciones: ObservacionEsco[];
  fotos: FotoEsco[];
}): RespuestaEscoInformes {
  const insumos = [...new Set(
    opts.observaciones
      .map((o) => o.insumo?.trim())
      .filter((s): s is string => Boolean(s)),
  )].sort();

  return {
    fuente: FUENTE_INFORME_VISITA,
    advertencia: ADVERTENCIA_FUENTE,
    total_informes: opts.informes.length,
    total_observaciones: opts.observaciones.length,
    insumos_en_fuente: insumos,
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
    observaciones: opts.observaciones.map((o) => ({
      ...o,
      cita: { informe_id: o.informe_id, observacion_id: o.id },
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

/** Un insumo solo se afirma si está en filas o en el texto extraído. */
export function insumoEstaEnFuente(
  nombre: string,
  respuesta: RespuestaEscoInformes,
  textos: string[],
): boolean {
  const n = nombre.trim().toLowerCase();
  if (!n) return false;
  if (respuesta.insumos_en_fuente.some((i) => i.toLowerCase() === n)) return true;
  return textos.some((t) => t.toLowerCase().includes(n));
}
