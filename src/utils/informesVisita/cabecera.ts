import type { InformeVisitaCabecera } from '@/types/informesVisita';
import { parsearFechaInforme } from './fechasInforme';

function campo(texto: string, etiqueta: RegExp): string | null {
  const m = etiqueta.exec(texto);
  if (!m) return null;
  const v = (m[1] ?? '').trim();
  return v.length > 0 ? v : null;
}

/** Cabecera barata desde etiquetas del Word. El modelo puede completar huecos. */
export function extraerCabecera(texto: string, fechaFallback: string): InformeVisitaCabecera {
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
