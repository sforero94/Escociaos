import type { InformeVisitaCabecera } from '@/types/informesVisita';
import { extraerPrimeraFechaDelTexto, parsearFechaInforme } from './fechasInforme';

/**
 * Valor a la derecha de una etiqueta. Acepta `:`, `|` (tablas Word) o un
 * salto de línea (etiqueta y valor en celdas/párrafos distintos).
 */
function campo(texto: string, etiqueta: RegExp): string | null {
  const mismaLinea = new RegExp(`(?:${etiqueta.source})\\s*[:|–-]\\s*([^\\n]+)`, etiqueta.flags);
  const m1 = mismaLinea.exec(texto);
  if (m1) {
    const v = (m1[1] ?? '').trim();
    if (v.length > 0) return v;
  }
  const dosLineas = new RegExp(`(?:${etiqueta.source})\\s*\\n\\s*([^\\n]+)`, etiqueta.flags);
  const m2 = dosLineas.exec(texto);
  if (!m2) return null;
  const v = (m2[1] ?? '').trim();
  return v.length > 0 ? v : null;
}

/** Cabecera barata desde etiquetas del Word. El modelo puede completar huecos. */
export function extraerCabecera(texto: string, fechaFallback: string): InformeVisitaCabecera {
  const fechaCruda = campo(texto, /fecha(?:\s+de\s+(?:la\s+)?visita)?/i);
  return {
    fecha_visita: parsearFechaInforme(fechaCruda) ?? extraerPrimeraFechaDelTexto(texto) ?? fechaFallback,
    agronoma: campo(texto, /agr[oó]nom[ao]|elaborad[oa]\s+por/i),
    finca: campo(texto, /finca/i),
    especie: campo(texto, /especie/i),
    fenologia: campo(texto, /fenolog[ií]a/i),
    materia_seca: campo(texto, /materia\s+seca/i),
    proyeccion_cosecha: campo(texto, /proyecci[oó]n(?:\s+de\s+cosecha)?/i),
  };
}

export function fusionarCabecera(
  base: InformeVisitaCabecera,
  overlay: Partial<InformeVisitaCabecera>,
): InformeVisitaCabecera {
  return {
    fecha_visita: overlay.fecha_visita || base.fecha_visita,
    agronoma: overlay.agronoma || base.agronoma,
    finca: overlay.finca || base.finca,
    especie: overlay.especie || base.especie,
    fenologia: overlay.fenologia || base.fenologia,
    materia_seca: overlay.materia_seca || base.materia_seca,
    proyeccion_cosecha: overlay.proyeccion_cosecha || base.proyeccion_cosecha,
  };
}
