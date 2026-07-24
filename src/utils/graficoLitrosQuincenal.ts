// ARCHIVO: utils/graficoLitrosQuincenal.ts
// DESCRIPCIÓN: Preparación pura de datos para el gráfico de barras "Litros
// por quincena al camión" de `/hato-lechero/produccion` (Figma alignment
// spec Wave 2b, §6 -- look & feel de "Litros diarios al camión" del mock,
// adaptado a la granularidad real del dato: QUINCENAL, no diaria, decisión
// del dueño ya vigente desde S5). `useProduccionHato.fetchHistorialQuincenal`
// devuelve las quincenas más reciente primero (para las KPIs/tabla) -- este
// módulo las reordena ascendente para el eje X del gráfico y marca la
// última (la más reciente) para que el componente la pinte con el verde
// oscuro (`--primary`) mientras el resto queda en verde pálido
// (`--secondary`), igual que el mock.

import type { HatoProduccionQuincenal } from '@/types/hato';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface PuntoLitrosQuincenal {
  /** `id` del registro -- clave estable para `key`/`Cell` de Recharts. */
  clave: string;
  /** p. ej. "Jul Q1" -- corto a propósito, es un tick de eje X. */
  label: string;
  litros: number;
  /** `true` SOLO para la quincena cronológicamente más reciente del
   * conjunto -- la que el mock resalta en verde oscuro. */
  esActual: boolean;
}

/** Reordena el historial (que llega más-reciente-primero) a orden
 * cronológico ascendente y arma los puntos del gráfico. Un historial vacío
 * produce un arreglo vacío -- el componente decide el estado "Sin
 * registros aún", esta función nunca inventa un punto en 0. */
export function prepararPuntosLitrosQuincenal(historial: HatoProduccionQuincenal[]): PuntoLitrosQuincenal[] {
  const ascendente = [...historial].sort((a, b) => {
    if (a.anio !== b.anio) return a.anio - b.anio;
    if (a.mes !== b.mes) return a.mes - b.mes;
    return a.quincena - b.quincena;
  });

  return ascendente.map((h, i) => ({
    clave: h.id,
    label: `${MESES_CORTOS[h.mes - 1]} Q${h.quincena}`,
    litros: h.litros_total,
    esActual: i === ascendente.length - 1,
  }));
}

/** Promedio simple de litros sobre los puntos visibles del gráfico, o
 * `null` si no hay ninguno -- nunca `0` cuando no hay datos (regla "sin
 * dato, nunca 0", spec §0b). */
export function promedioLitrosQuincenal(puntos: PuntoLitrosQuincenal[]): number | null {
  if (puntos.length === 0) return null;
  return puntos.reduce((s, p) => s + p.litros, 0) / puntos.length;
}
