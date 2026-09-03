import type {
  FilaPropuesta,
  FotoExtraida,
  InformeVisitaCabecera,
  PropuestaInforme,
  TipoObservacionAgronomica,
} from '@/types/informesVisita';
import { parsearFechaInforme } from './fechasInforme';
import { resolverLoteId, type LoteCatalogo } from './lotes';

interface Seccion {
  re: RegExp;
  tipo: TipoObservacionAgronomica;
}

const SECCIONES: Seccion[] = [
  { re: /^\s*monitoreo(\s+de\s+plagas?)?\s*$/i, tipo: 'monitoreo' },
  { re: /fertilizaci[oó]n\s+ed[aá]fica/i, tipo: 'rec_edafica' },
  { re: /^\s*ed[aá]fica\s*$/i, tipo: 'rec_edafica' },
  { re: /^\s*foliar\s*$/i, tipo: 'rec_foliar' },
  { re: /fertilizaci[oó]n\s+foliar/i, tipo: 'rec_foliar' },
  { re: /^\s*drench\s*$/i, tipo: 'rec_drench' },
  { re: /situaci[oó]n\s+encontrada/i, tipo: 'observacion' },
  { re: /^\s*labores?\s*(realizadas?)?\s*$/i, tipo: 'labor' },
];

function campo(texto: string, etiqueta: RegExp): string | null {
  const m = etiqueta.exec(texto);
  if (!m) return null;
  const v = (m[1] ?? '').trim();
  return v.length > 0 ? v : null;
}

function extraerCabecera(texto: string, fechaFallback: string): InformeVisitaCabecera {
  const fechaCruda = campo(texto, /fecha(?:\s+de\s+visita)?\s*:\s*([^\n]+)/i);
  return {
    fecha_visita: parsearFechaInforme(fechaCruda) ?? fechaFallback,
    agronoma: campo(texto, /agr[oó]nom[ao]\s*:\s*([^\n]+)/i),
    finca: campo(texto, /finca\s*:\s*([^\n]+)/i),
    especie: campo(texto, /especie\s*:\s*([^\n]+)/i),
    fenologia: campo(texto, /fenolog[ií]a\s*:\s*([^\n]+)/i),
    materia_seca: campo(texto, /materia\s+seca\s*:\s*([^\n]+)/i),
    proyeccion_cosecha: campo(texto, /proyecci[oó]n(?:\s+de\s+cosecha)?\s*:\s*([^\n]+)/i),
  };
}

function parsearDosis(linea: string): { dosis: number | null; unidad: string | null } {
  const m = /(\d+(?:[.,]\d+)?)\s*(cc\/l|cm3\/l|ml\/l|g\/(?:árbol|arbol)|kg\/ha|l\/ha|g\/l|cc\/árbol|cc\/arbol)\b/i.exec(linea);
  if (!m) return { dosis: null, unidad: null };
  return {
    dosis: Number(m[1].replace(',', '.')),
    unidad: m[2].replace(/arbol/i, 'árbol'),
  };
}

function parsearCarencia(linea: string): number | null {
  const m = /carencia\s*(?:de\s*)?(\d+)\s*d[ií]as/i.exec(linea);
  return m ? Number(m[1]) : null;
}

function parsearVia(linea: string): string | null {
  const m = /v[ií]a\s*:?\s*(suelo|foliar|drench|al\s+suelo)/i.exec(linea);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return v === 'al suelo' ? 'suelo' : v;
}

function parsearPlaga(linea: string): string | null {
  const blanco = /blanco\s*:?\s*([^.\n]+)/i.exec(linea);
  if (blanco) return blanco[1].trim();
  return null;
}

function parsearIncidencia(linea: string): string | null {
  const m = /incidencia\s*:?\s*(\d+(?:[.,]\d+)?\s*%?)/i.exec(linea);
  return m ? m[1].replace(',', '.').trim() : null;
}

function parsearSeveridad(linea: string): string | null {
  const m = /severidad\s*:?\s*([a-záéíóú]+)/i.exec(linea);
  return m ? m[1].trim() : null;
}

function parsearInsumo(linea: string): string | null {
  const recortada = linea
    .replace(/dosis\s*:?\s*\d+(?:[.,]\d+)?\s*\S+/ig, '')
    .replace(/\d+(?:[.,]\d+)?\s*(cc\/l|cm3\/l|ml\/l|g\/(?:árbol|arbol)|kg\/ha|l\/ha|g\/l)\b/ig, '')
    .replace(/periodo\s+de\s+carencia[^.\n]*/ig, '')
    .replace(/carencia\s*(?:de\s*)?\d+\s*d[ií]as/ig, '')
    .replace(/blanco\s*:?\s*[^.\n]*/ig, '')
    .replace(/v[ií]a\s*:?\s*\S+/ig, '')
    .replace(/incidencia\s*:?\s*[^.\n]*/ig, '')
    .replace(/severidad\s*:?\s*[^.\n]*/ig, '')
    .replace(/fecha(?:\s+de\s+monitoreo)?\s*:?\s*[^.\n]*/ig, '')
    .replace(/[.|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!recortada) return null;
  if (recortada.length > 80) return recortada.slice(0, 80);
  return recortada;
}

function esEncabezadoTabla(linea: string): boolean {
  const n = linea.toLowerCase();
  return n.includes('insumo') && (n.includes('dosis') || n.includes('carencia'));
}

function lineaEsRuido(linea: string): boolean {
  if (linea.length < 3) return true;
  if (/^informe\s+t[eé]cnico/i.test(linea)) return true;
  // "Fecha de monitoreo:" is a section date, not a header field.
  if (/^fecha\s+de\s+monitoreo\s*:/i.test(linea)) return false;
  if (/^(finca|fecha|agr[oó]nom|especie|fenolog|materia\s+seca|proyecci)/i.test(linea) && linea.includes(':')) {
    return true;
  }
  return false;
}

function tipoDeSeccion(linea: string): TipoObservacionAgronomica | null {
  for (const s of SECCIONES) {
    if (s.re.test(linea.trim())) return s.tipo;
  }
  return null;
}

function filaBase(
  clave: string,
  fecha: string,
  tipo: TipoObservacionAgronomica,
): FilaPropuesta {
  return {
    clave,
    fecha,
    fecha_contexto: null,
    tipo,
    lote: null,
    lote_id: null,
    plaga_enfermedad: null,
    accion: null,
    insumo: null,
    dosis: null,
    unidad: null,
    periodo_carencia_dias: null,
    via: null,
    incidencia: null,
    severidad: null,
    notas: null,
    foto_indice: null,
  };
}

function lineaAFila(
  clave: string,
  linea: string,
  fechaVisita: string,
  tipo: TipoObservacionAgronomica,
  fechaContexto: string | null,
  lotes: LoteCatalogo[],
): FilaPropuesta {
  const { dosis, unidad } = parsearDosis(linea);
  const fila = filaBase(clave, fechaVisita, tipo);
  fila.fecha_contexto = fechaContexto;
  fila.dosis = dosis;
  fila.unidad = unidad;
  fila.periodo_carencia_dias = parsearCarencia(linea);
  fila.via = parsearVia(linea) ?? (tipo === 'rec_foliar' ? 'foliar' : tipo === 'rec_drench' ? 'drench' : tipo === 'rec_edafica' ? 'suelo' : null);
  fila.plaga_enfermedad = parsearPlaga(linea);
  fila.incidencia = parsearIncidencia(linea);
  fila.severidad = parsearSeveridad(linea);
  fila.insumo = tipo === 'monitoreo' || tipo === 'observacion' || tipo === 'labor'
    ? null
    : parsearInsumo(linea);
  if (tipo === 'monitoreo' && !fila.plaga_enfermedad) {
    const primero = linea.split('.')[0]?.trim() ?? '';
    const sinFecha = primero.replace(/^fecha(?:\s+de\s+monitoreo)?\s*:?\s*/i, '').trim();
    if (sinFecha && !/^\d/.test(sinFecha) && sinFecha.length < 60) {
      fila.plaga_enfermedad = sinFecha;
    }
  }
  if (tipo === 'observacion' || tipo === 'labor') {
    fila.notas = linea;
    fila.lote = /sector|lote|este tipo/i.test(linea) ? linea : null;
    fila.lote_id = resolverLoteId(fila.lote, lotes);
  } else {
    fila.notas = linea;
  }
  if (tipo === 'rec_edafica' || tipo === 'rec_foliar' || tipo === 'rec_drench') {
    fila.accion = tipo === 'rec_edafica' ? 'fertilización edáfica' : tipo === 'rec_foliar' ? 'foliar' : 'drench';
  }
  return fila;
}

/**
 * Propone cabecera y filas a partir del texto extraído. Nunca persiste.
 * Si no hay texto, no inventa filas.
 */
export function proponerInforme(opts: {
  texto: string;
  sinTexto: boolean;
  fotos: FotoExtraida[];
  fechaFallback: string;
  lotes?: LoteCatalogo[];
}): PropuestaInforme {
  const lotes = opts.lotes ?? [];
  const cabecera = extraerCabecera(opts.texto, opts.fechaFallback);
  const filas: FilaPropuesta[] = [];

  if (opts.sinTexto || !opts.texto.trim()) {
    return { cabecera, filas, texto: opts.texto, sinTexto: true, fotos: opts.fotos };
  }

  const lineas = opts.texto.split('\n').map((l) => l.trim()).filter(Boolean);
  let tipoActual: TipoObservacionAgronomica = 'observacion';
  let fechaContexto: string | null = null;
  let n = 0;

  for (const linea of lineas) {
    const seccion = tipoDeSeccion(linea);
    if (seccion) {
      tipoActual = seccion;
      fechaContexto = null;
      continue;
    }
    if (esEncabezadoTabla(linea)) continue;
    if (lineaEsRuido(linea)) continue;

    const fechaMon = /fecha(?:\s+de\s+monitoreo)?\s*:\s*(.+)$/i.exec(linea);
    if (fechaMon && tipoActual === 'monitoreo') {
      fechaContexto = parsearFechaInforme(fechaMon[1]);
      if (linea.replace(fechaMon[0], '').trim().length < 3) continue;
    }

    const fila = lineaAFila(
      `p-${n}`,
      linea,
      cabecera.fecha_visita,
      tipoActual,
      fechaContexto,
      lotes,
    );
    n += 1;
    filas.push(fila);
  }

  for (const foto of opts.fotos) {
    if (!foto.pieDeFoto) continue;
    const ya = filas.some((f) => f.notas === foto.pieDeFoto);
    if (ya) {
      const existente = filas.find((f) => f.notas === foto.pieDeFoto);
      if (existente && existente.foto_indice === null) existente.foto_indice = foto.orden;
      continue;
    }
    const fila = filaBase(`p-${n}`, cabecera.fecha_visita, 'observacion');
    fila.notas = foto.pieDeFoto;
    fila.foto_indice = foto.orden;
    fila.lote = /sector|lote|este tipo/i.test(foto.pieDeFoto) ? foto.pieDeFoto : null;
    fila.lote_id = resolverLoteId(fila.lote, lotes);
    filas.push(fila);
    n += 1;
  }

  return { cabecera, filas, texto: opts.texto, sinTexto: false, fotos: opts.fotos };
}
