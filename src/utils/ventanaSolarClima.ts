import type { LecturaClimaAgregada } from '@/types/clima';
import {
  calcularAmanecerAtardecer,
  formatearHoraFraccion,
  type AmanecerAtardecer,
} from '@/utils/amanecerAtardecer';

export interface RecorteVentanaDiurna {
  puntos: LecturaClimaAgregada[];
  ventana: AmanecerAtardecer | null;
  fecha: string | null;
  horaInicio: number | null;
  horaFin: number | null;
  subtitulo: string | null;
}

const HORA_KEY = /^(\d{4}-\d{2}-\d{2}) (\d{2}):00$/;

export function parsearHoraKey(fecha: string): { dia: string; hora: number } | null {
  const m = HORA_KEY.exec(fecha);
  if (!m) return null;
  return { dia: m[1], hora: Number(m[2]) };
}

/** Hour bucket that contains `frac` (5.87 → 5). Clamped to 0–23. */
export function horaQueContiene(frac: number): number {
  if (!Number.isFinite(frac)) return 0;
  return Math.max(0, Math.min(23, Math.floor(frac)));
}

/**
 * Pick the Bogotá calendar day to clip to.
 * Use the most recent day in the series, unless that day has not yet
 * reached sunrise — then use the previous day (closest complete daylight).
 */
export function elegirDiaVentana(
  puntos: LecturaClimaAgregada[],
  amanecerDe: (fecha: string) => Pick<AmanecerAtardecer, 'amanecerHora'>,
): string | null {
  const dias = [
    ...new Set(
      puntos
        .map((p) => parsearHoraKey(p.fecha)?.dia)
        .filter((d): d is string => Boolean(d)),
    ),
  ].sort();
  if (dias.length === 0) return null;

  const ultimo = dias[dias.length - 1];
  const horasUltimo = puntos
    .map((p) => parsearHoraKey(p.fecha))
    .filter((p): p is { dia: string; hora: number } => p != null && p.dia === ultimo)
    .map((p) => p.hora);
  if (horasUltimo.length === 0) return ultimo;

  const maxHora = Math.max(...horasUltimo);
  const pisoAmanecer = horaQueContiene(amanecerDe(ultimo).amanecerHora);
  if (maxHora < pisoAmanecer && dias.length > 1) {
    return dias[dias.length - 2];
  }
  return ultimo;
}

/**
 * Clip an hourly 24h series to civil daylight of the chosen day, intersected
 * with the hours that actually have readings ("closest").
 *
 * Does not mutate `puntos`. Does not invent missing interior hours.
 * `ventanaFija` lets tests inject sunrise/sunset without calling NOAA.
 */
export function recortarVentanaDiurna(
  puntos: LecturaClimaAgregada[],
  ventanaFija?: Pick<AmanecerAtardecer, 'amanecerHora' | 'atardecerHora'>,
): RecorteVentanaDiurna {
  const vacio: RecorteVentanaDiurna = {
    puntos: [],
    ventana: null,
    fecha: null,
    horaInicio: null,
    horaFin: null,
    subtitulo: null,
  };
  if (puntos.length === 0) return vacio;

  const amanecerDe = (fecha: string): AmanecerAtardecer => {
    if (ventanaFija) {
      return {
        fecha,
        amanecerHora: ventanaFija.amanecerHora,
        atardecerHora: ventanaFija.atardecerHora,
        amanecerLabel: formatearHoraFraccion(ventanaFija.amanecerHora),
        atardecerLabel: formatearHoraFraccion(ventanaFija.atardecerHora),
      };
    }
    return calcularAmanecerAtardecer(fecha);
  };

  const fecha = elegirDiaVentana(puntos, amanecerDe);
  if (!fecha) return vacio;

  const ventana = amanecerDe(fecha);
  const delDia = puntos
    .map((p) => ({ p, key: parsearHoraKey(p.fecha) }))
    .filter((x): x is { p: LecturaClimaAgregada; key: { dia: string; hora: number } } =>
      x.key != null && x.key.dia === fecha,
    );

  if (delDia.length === 0) return { ...vacio, ventana, fecha };

  const horasConDato = delDia.map((x) => x.key.hora);
  const horaInicio = Math.max(horaQueContiene(ventana.amanecerHora), Math.min(...horasConDato));
  const horaFin = Math.min(horaQueContiene(ventana.atardecerHora), Math.max(...horasConDato));
  if (horaInicio > horaFin) {
    return { ...vacio, ventana, fecha, horaInicio, horaFin };
  }

  const recortados = delDia
    .filter((x) => x.key.hora >= horaInicio && x.key.hora <= horaFin)
    .map((x) => x.p)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    puntos: recortados,
    ventana,
    fecha,
    horaInicio,
    horaFin,
    subtitulo: `Amanecer ${ventana.amanecerLabel} · Atardecer ${ventana.atardecerLabel}`,
  };
}

/**
 * Running sum of sunshine duration. A null hour adds 0 so the line stays
 * continuous. Does not mutate the input.
 */
export function acumularTiempoSol(puntos: LecturaClimaAgregada[]): LecturaClimaAgregada[] {
  let acc = 0;
  return puntos.map((p) => {
    acc += p.tiempo_sol_horas ?? 0;
    return { ...p, tiempo_sol_horas: Math.round(acc * 10) / 10 };
  });
}
