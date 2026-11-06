// Motor CE puro compartido por la captura y el lector edge.
export interface LecturaCE { arbol: number; alta: number | null; baja: number | null }

// CE thresholds (dS/m)
export const CE_UMBRAL_BAJO = 0.5;
export const CE_UMBRAL_ALTO = 1.5;

export interface CEDistribucion {
  pctBajo: number;
  pctEnRango: number;
  pctAlto: number;
  totalArboles: number;
  promedio: number;
}

export function calcularDistribucionCE(lecturas: LecturaCE[]): CEDistribucion {
  if (lecturas.length === 0) return { pctBajo: 0, pctEnRango: 0, pctAlto: 0, totalArboles: 0, promedio: 0 };

  let bajo = 0, enRango = 0, alto = 0;
  let suma = 0;
  let count = 0;

  for (const l of lecturas) {
    if (l.alta == null && l.baja == null) continue;
    const partes = (l.alta != null ? 1 : 0) + (l.baja != null ? 1 : 0);
    const prom = ((l.alta ?? 0) + (l.baja ?? 0)) / partes;
    suma += prom;
    count++;
    if (prom < CE_UMBRAL_BAJO) bajo++;
    else if (prom > CE_UMBRAL_ALTO) alto++;
    else enRango++;
  }

  if (count === 0) return { pctBajo: 0, pctEnRango: 0, pctAlto: 0, totalArboles: 0, promedio: 0 };

  return {
    pctBajo: Math.round((bajo / count) * 100),
    pctEnRango: Math.round((enRango / count) * 100),
    pctAlto: Math.round((alto / count) * 100),
    totalArboles: count,
    promedio: +(suma / count).toFixed(2),
  };
}

