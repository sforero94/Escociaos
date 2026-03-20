import type {
  EstadoSemaforo,
  EstadoFloracion,
  EstadoCE,
  EstadoColmenas,
  RondaMonitoreo,
  LecturaCE,
} from '@/types/monitoreo';
import type { SupabaseClient } from '@supabase/supabase-js';

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

const GAP_DIAS_NUEVA_RONDA = 5;

export async function asignarRonda(supabase: SupabaseClient, fecha: string): Promise<string> {
  // Get the most recent ronda
  const { data: ultimaRonda } = await supabase
    .from('rondas_monitoreo')
    .select('id, fecha_inicio, fecha_fin')
    .order('fecha_inicio', { ascending: false })
    .limit(1)
    .single();

  if (ultimaRonda) {
    // Check if fecha is within GAP_DIAS_NUEVA_RONDA of the last activity in this ronda
    // Use fecha_fin if closed, otherwise check the latest monitoring date in that ronda
    const fechaRef = ultimaRonda.fecha_fin || ultimaRonda.fecha_inicio;
    const diffDays = Math.abs(
      (new Date(fecha).getTime() - new Date(fechaRef).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays <= GAP_DIAS_NUEVA_RONDA && !ultimaRonda.fecha_fin) {
      return ultimaRonda.id;
    }

    // Also check the actual latest record date in the ronda
    if (!ultimaRonda.fecha_fin) {
      const { data: ultimoRegistro } = await supabase
        .from('monitoreos')
        .select('fecha_monitoreo')
        .eq('ronda_id', ultimaRonda.id)
        .order('fecha_monitoreo', { ascending: false })
        .limit(1)
        .single();

      if (ultimoRegistro) {
        const diffFromLast = Math.abs(
          (new Date(fecha).getTime() - new Date(ultimoRegistro.fecha_monitoreo).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffFromLast <= GAP_DIAS_NUEVA_RONDA) {
          return ultimaRonda.id;
        }
      }
    }
  }

  // Create new ronda
  const rondaNum = ultimaRonda ? (await supabase.from('rondas_monitoreo').select('id', { count: 'exact', head: true })).count || 0 : 0;
  const { data: nuevaRonda, error } = await supabase
    .from('rondas_monitoreo')
    .insert({ fecha_inicio: fecha, nombre: `Ronda ${rondaNum + 1}` })
    .select('id')
    .single();

  if (error || !nuevaRonda) throw new Error('Error al crear ronda');
  return nuevaRonda.id;
}

export const PLAGAS_INTERES = ['Monalonion', 'Ácaro', 'Cucarron marceño', 'Phytophtora', 'Thrips'];

interface RegistroConFloracion {
  floracion_brotes?: number | null;
  floracion_flor_madura?: number | null;
  floracion_cuaje?: number | null;
}

export function calcularEstadoFloracion(registros: RegistroConFloracion[]): EstadoFloracion {
  let brotes = 0;
  let florMadura = 0;
  let cuaje = 0;

  for (const r of registros) {
    brotes += r.floracion_brotes ?? 0;
    florMadura += r.floracion_flor_madura ?? 0;
    cuaje += r.floracion_cuaje ?? 0;
  }

  const totalArboles = brotes + florMadura + cuaje;

  return {
    totalArboles,
    brotes,
    florMadura,
    cuaje,
    pctBrotes: totalArboles > 0 ? Math.round((brotes / totalArboles) * 100) : 0,
    pctFlorMadura: totalArboles > 0 ? Math.round((florMadura / totalArboles) * 100) : 0,
    pctCuaje: totalArboles > 0 ? Math.round((cuaje / totalArboles) * 100) : 0,
  };
}

interface RegistroConCE {
  valor_ce: number;
  lecturas?: LecturaCE[] | null;
}

export function calcularEstadoCE(registros: RegistroConCE[]): EstadoCE {
  if (registros.length === 0) {
    return { estado: 'sin_datos', promedio: 0, min: 0, max: 0 };
  }

  const valores = registros.map(r => r.valor_ce);
  const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
  const min = Math.min(...valores);
  const max = Math.max(...valores);

  // If we have lecturas, use distribution-based semaphore
  const todasLecturas = registros.flatMap(r => r.lecturas || []);
  if (todasLecturas.length > 0) {
    const dist = calcularDistribucionCE(todasLecturas);
    let estado: EstadoSemaforo;
    if (dist.pctEnRango > 80) estado = 'verde';
    else if (dist.pctEnRango >= 50) estado = 'amarillo';
    else estado = 'rojo';
    return { estado, promedio, min, max };
  }

  // Fallback: threshold-based on promedio
  let estado: EstadoSemaforo;
  if (promedio > CE_UMBRAL_ALTO) {
    estado = 'rojo';
  } else if (promedio < CE_UMBRAL_BAJO) {
    estado = 'amarillo';
  } else {
    estado = 'verde';
  }

  return { estado, promedio, min, max };
}

interface RegistroConColmenas {
  colmenas_fuertes: number;
  colmenas_debiles: number;
  colmenas_muertas: number;
}

export function calcularEstadoColmenas(registros: RegistroConColmenas[]): EstadoColmenas {
  if (registros.length === 0) {
    return { estado: 'sin_datos', totalFuertes: 0, totalDebiles: 0, totalMuertas: 0, total: 0, pctFuertes: 0 };
  }

  let totalFuertes = 0;
  let totalDebiles = 0;
  let totalMuertas = 0;

  for (const r of registros) {
    totalFuertes += r.colmenas_fuertes;
    totalDebiles += r.colmenas_debiles;
    totalMuertas += r.colmenas_muertas;
  }

  const total = totalFuertes + totalDebiles + totalMuertas;
  const pctFuertes = total > 0 ? Math.round((totalFuertes / total) * 100) : 0;

  let estado: EstadoSemaforo;
  if (pctFuertes > 80) {
    estado = 'verde';
  } else if (pctFuertes >= 50) {
    estado = 'amarillo';
  } else {
    estado = 'rojo';
  }

  return { estado, totalFuertes, totalDebiles, totalMuertas, total, pctFuertes };
}

export function obtenerRondaActiva(rondas: RondaMonitoreo[]): RondaMonitoreo | null {
  return rondas.find(r => r.fecha_fin == null) ?? null;
}

interface RegistroConRonda {
  ronda_id?: string | null;
  [key: string]: unknown;
}

export function agruparPorRonda<T extends RegistroConRonda>(registros: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();

  for (const r of registros) {
    const key = r.ronda_id ?? 'sin_ronda';
    const grupo = mapa.get(key);
    if (grupo) {
      grupo.push(r);
    } else {
      mapa.set(key, [r]);
    }
  }

  return mapa;
}
