// ARCHIVO: utils/hato/litrosPesados.ts
// DESCRIPCIÓN: ventana, agregación y comparación de los litros PESADOS
// (pesaje semanal AM+PM), más el armado de la serie que la pantalla dibuja.
// Puro. La proyección de 2 semanas no se reimplementa: se llama a
// `proyeccionVacasCongeladas` / `litrosProyectadosVaca` (`hatoProduccion.ts`),
// que es el mismo método del tracker (hato congelado + tendencia de 4
// semanas). Los puntos proyectados viajan en la serie para dibujarse, y
// `totalLitrosMedidos` los deja fuera.

import {
  litrosProyectadosVaca,
  type ProyeccionVacaCongelada,
} from '@/utils/hatoProduccion';

/** Ventanas fijas, ancladas al último pesaje (no a "hoy"): el largo es
 * inclusivo y exacto para que el período anterior tenga el mismo número de
 * días. Quincena = 15 días (~2 pesajes de miércoles). */
export type PeriodoLitrosPesados = 'quincena' | 'mes' | 'trimestre' | 'semestre' | 'anio' | 'personalizado';

export type PeriodoLitrosFijo = Exclude<PeriodoLitrosPesados, 'personalizado'>;

export const DIAS_PERIODO_LITROS: Record<PeriodoLitrosFijo, number> = {
  quincena: 15,
  mes: 30,
  trimestre: 90,
  semestre: 180,
  anio: 365,
};

export const HORIZONTE_PROYECCION_SEMANAS = 2;
export const SEMANAS_TENDENCIA_PROYECCION = 4;
export const MAX_VACAS_COMPARADAS = 8;

export interface RangoFecha {
  /** Inclusivo. */
  desde: string;
  /** Inclusivo. */
  hasta: string;
}

export interface PesajeLitros {
  animal_id: string;
  fecha: string;
  litros_total: number;
  /** `null` en los dos = jornada histórica (migración 061): un solo número
   * del día, y SÍ cuenta. Exactamente uno de los dos con valor = turno
   * incompleto, y NO cuenta. */
  litros_am?: number | null;
  litros_pm?: number | null;
}

export interface PuntoFechaPesada {
  fecha: string;
  litros: number;
  vacas: string[];
  litrosPorVaca: number;
}

export interface ResumenLitrosPesados {
  puntos: PuntoFechaPesada[];
  /** `null` cuando no hay ningún pesaje completo en el rango -- nunca 0. */
  totalLitros: number | null;
  /** Vacas distintas con al menos un pesaje completo. */
  vacasPesadas: number;
  /** Total / pesajes completos (una fila = una vaca en una fecha). `null`
   * sin pesajes completos. */
  litrosPorVaca: number | null;
  nPesajes: number;
  /** Filas con un solo turno (AM o PM). No entran en `totalLitros`. */
  nIncompletos: number;
}

export interface CambioPeriodo {
  /** `(actual - anterior) / anterior`. `null` si falta un lado o el
   * anterior es 0 -- no se fabrica un −100% ni un 0. */
  variacion: number | null;
  diferencia: number | null;
}

export interface PuntoSerie {
  fecha: string;
  tipo: 'medido' | 'proyectado';
  litros: number | null;
  litrosPorVaca: number | null;
  nVacas: number;
}

export interface FilaGraficoVacas {
  fecha: string;
  tipo: 'medido' | 'proyectado';
  medidos: Record<string, number>;
  proyectados: Record<string, number>;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function parsearIso(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return { anio, mes, dia };
}

function diferenciaDias(desde: string, hasta: string): number {
  const a = parsearIso(desde);
  const b = parsearIso(hasta);
  const ta = Date.UTC(a.anio, a.mes - 1, a.dia);
  const tb = Date.UTC(b.anio, b.mes - 1, b.dia);
  return Math.round((tb - ta) / 86400000);
}

function sumarDias(fechaIso: string, dias: number): string {
  const { anio, mes, dia } = parsearIso(fechaIso);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function largoInclusivo(rango: RangoFecha): number {
  return diferenciaDias(rango.desde, rango.hasta) + 1;
}

/** `true` solo cuando hay exactamente un turno. Los dos vacíos (jornada
 * histórica) o los dos presentes cuentan como pesaje completo. */
export function turnoIncompleto(pesaje: Pick<PesajeLitros, 'litros_am' | 'litros_pm'>): boolean {
  const am = pesaje.litros_am != null;
  const pm = pesaje.litros_pm != null;
  return am !== pm;
}

export function rangoPeriodoLitrosPesados(
  periodo: PeriodoLitrosPesados,
  fechaReferencia: string,
  personalizado?: { desde: string; hasta: string } | null,
): RangoFecha | null {
  if (periodo === 'personalizado') {
    const desde = personalizado?.desde ?? '';
    const hasta = personalizado?.hasta ?? '';
    if (!ISO.test(desde) || !ISO.test(hasta) || desde > hasta) return null;
    return { desde, hasta };
  }
  const dias = DIAS_PERIODO_LITROS[periodo];
  return { desde: sumarDias(fechaReferencia, -(dias - 1)), hasta: fechaReferencia };
}

/** Período inmediatamente anterior, mismo número de días, sin solaparse. */
export function periodoAnteriorIgual(rango: RangoFecha): RangoFecha {
  const largo = largoInclusivo(rango);
  const hasta = sumarDias(rango.desde, -1);
  const desde = sumarDias(hasta, -(largo - 1));
  return { desde, hasta };
}

export function cambioContraPeriodoAnterior(actual: number | null, anterior: number | null): CambioPeriodo {
  if (actual == null || anterior == null) return { variacion: null, diferencia: null };
  const diferencia = actual - anterior;
  if (anterior === 0) return { variacion: null, diferencia };
  return { variacion: diferencia / anterior, diferencia };
}

function dentro(fecha: string, rango: RangoFecha): boolean {
  return fecha >= rango.desde && fecha <= rango.hasta;
}

/**
 * Un punto por fecha de pesaje. Un turno incompleto no suma litros y sí
 * cuenta en `nIncompletos`. Dos filas de la misma vaca el mismo día se
 * promedian (no se suman): `UNIQUE(animal_id, fecha)` lo impide en la base,
 * y sumarlas diría el doble.
 */
export function resumirLitrosPesados(pesajes: readonly PesajeLitros[], rango: RangoFecha): ResumenLitrosPesados {
  const porClave = new Map<string, { animalId: string; fecha: string; suma: number; n: number }>();
  let nIncompletos = 0;

  for (const pesaje of pesajes) {
    if (!dentro(pesaje.fecha, rango)) continue;
    if (turnoIncompleto(pesaje)) {
      nIncompletos += 1;
      continue;
    }
    const clave = `${pesaje.animal_id}|${pesaje.fecha}`;
    const actual = porClave.get(clave);
    if (actual) {
      actual.suma += pesaje.litros_total;
      actual.n += 1;
    } else {
      porClave.set(clave, { animalId: pesaje.animal_id, fecha: pesaje.fecha, suma: pesaje.litros_total, n: 1 });
    }
  }

  const porFecha = new Map<string, { litros: number; vacas: Set<string> }>();
  const vacas = new Set<string>();
  let nPesajes = 0;
  for (const fila of porClave.values()) {
    const litros = fila.suma / fila.n;
    nPesajes += 1;
    vacas.add(fila.animalId);
    const grupo = porFecha.get(fila.fecha);
    if (grupo) {
      grupo.litros += litros;
      grupo.vacas.add(fila.animalId);
    } else {
      porFecha.set(fila.fecha, { litros, vacas: new Set([fila.animalId]) });
    }
  }

  const puntos: PuntoFechaPesada[] = [...porFecha.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([fecha, grupo]) => ({
      fecha,
      litros: grupo.litros,
      vacas: [...grupo.vacas],
      litrosPorVaca: grupo.litros / grupo.vacas.size,
    }));

  const totalLitros = nPesajes === 0 ? null : puntos.reduce((acc, p) => acc + p.litros, 0);
  return {
    puntos,
    totalLitros,
    vacasPesadas: vacas.size,
    litrosPorVaca: totalLitros == null ? null : totalLitros / nPesajes,
    nPesajes,
    nIncompletos,
  };
}

/** Suma solo los puntos `medido`. Un proyectado, aunque tenga litros, no entra. */
export function totalLitrosMedidos(puntos: readonly { tipo: 'medido' | 'proyectado'; litros: number | null }[]): number | null {
  let total = 0;
  let alguno = false;
  for (const punto of puntos) {
    if (punto.tipo !== 'medido' || punto.litros == null) continue;
    total += punto.litros;
    alguno = true;
  }
  return alguno ? total : null;
}

export function fechaProyeccion(fechaReferencia: string, k: number): string {
  return sumarDias(fechaReferencia, k * 7);
}

/** Offset de semana que usa el detalle AM/PM (`rangoSemanaMedida`): 0 es la
 * semana que termina en el ancla. */
export function offsetSemanaDesdeAncla(fechaReferencia: string, fecha: string): number {
  // `-(0)` es `-0` en JS; el detalle compara la semana como número.
  return -Math.floor(diferenciaDias(fecha, fechaReferencia) / 7) || 0;
}

export function serieHato(
  resumen: ResumenLitrosPesados,
  proyecciones: readonly ProyeccionVacaCongelada[],
  fechaReferencia: string,
  incluirProyeccion: boolean,
): PuntoSerie[] {
  const puntos: PuntoSerie[] = resumen.puntos.map((p) => ({
    fecha: p.fecha,
    tipo: 'medido',
    litros: p.litros,
    litrosPorVaca: p.litrosPorVaca,
    nVacas: p.vacas.length,
  }));
  if (!incluirProyeccion || proyecciones.length === 0) return puntos;

  for (let k = 1; k <= HORIZONTE_PROYECCION_SEMANAS; k++) {
    const litros = proyecciones.reduce((acc, vaca) => acc + litrosProyectadosVaca(vaca, k), 0);
    puntos.push({
      fecha: fechaProyeccion(fechaReferencia, k),
      tipo: 'proyectado',
      litros,
      litrosPorVaca: litros / proyecciones.length,
      nVacas: proyecciones.length,
    });
  }
  return puntos;
}

export function filasGraficoVacas(
  pesajes: readonly PesajeLitros[],
  animalIds: readonly string[],
  rango: RangoFecha,
  proyecciones: readonly ProyeccionVacaCongelada[],
  fechaReferencia: string,
  incluirProyeccion: boolean,
): FilaGraficoVacas[] {
  const elegidas = new Set(animalIds);
  const resumen = resumirLitrosPesados(
    pesajes.filter((p) => elegidas.has(p.animal_id)),
    rango,
  );

  const filas: FilaGraficoVacas[] = resumen.puntos.map((punto) => {
    const acum = new Map<string, { suma: number; n: number }>();
    for (const pesaje of pesajes) {
      if (!elegidas.has(pesaje.animal_id) || pesaje.fecha !== punto.fecha || turnoIncompleto(pesaje)) continue;
      const actual = acum.get(pesaje.animal_id);
      if (actual) {
        actual.suma += pesaje.litros_total;
        actual.n += 1;
      } else {
        acum.set(pesaje.animal_id, { suma: pesaje.litros_total, n: 1 });
      }
    }
    const medidos: Record<string, number> = {};
    for (const [animalId, valor] of acum) medidos[animalId] = valor.suma / valor.n;
    return { fecha: punto.fecha, tipo: 'medido' as const, medidos, proyectados: {} };
  });

  if (!incluirProyeccion) return filas;

  const porId = new Map(proyecciones.map((v) => [v.animalId, v]));
  for (const animalId of animalIds) {
    if (!porId.has(animalId)) continue;
    for (let i = filas.length - 1; i >= 0; i--) {
      const litros = filas[i].medidos[animalId];
      if (litros == null) continue;
      filas[i].proyectados[animalId] = litros;
      break;
    }
  }

  for (let k = 1; k <= HORIZONTE_PROYECCION_SEMANAS; k++) {
    const proyectados: Record<string, number> = {};
    for (const animalId of animalIds) {
      const proy = porId.get(animalId);
      if (!proy) continue;
      proyectados[animalId] = litrosProyectadosVaca(proy, k);
    }
    if (Object.keys(proyectados).length === 0) continue;
    filas.push({
      fecha: fechaProyeccion(fechaReferencia, k),
      tipo: 'proyectado',
      medidos: {},
      proyectados,
    });
  }
  return filas;
}

/** Suma los litros medidos de las vacas en filas `medido`. La semilla de la
 * línea punteada (`proyectados` en una fila medida) y las filas proyectadas
 * no entran. */
export function totalMedidoVacas(filas: readonly FilaGraficoVacas[]): number | null {
  let total = 0;
  let alguno = false;
  for (const fila of filas) {
    if (fila.tipo !== 'medido') continue;
    for (const litros of Object.values(fila.medidos)) {
      total += litros;
      alguno = true;
    }
  }
  return alguno ? total : null;
}

export function alternarVacaSeleccionada(
  seleccion: readonly string[],
  animalId: string,
  max = MAX_VACAS_COMPARADAS,
): string[] {
  if (seleccion.includes(animalId)) return seleccion.filter((id) => id !== animalId);
  if (seleccion.length >= max) return [...seleccion];
  return [...seleccion, animalId];
}

export function coincideBusquedaVaca(nombre: string | null, numero: number | null, texto: string): boolean {
  const q = texto.trim().toLowerCase();
  if (!q) return true;
  if ((nombre ?? '').toLowerCase().includes(q)) return true;
  return numero != null && String(numero).includes(q);
}
