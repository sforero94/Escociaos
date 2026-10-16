// ARCHIVO: utils/hato/produccionV2.ts
// DESCRIPCIÓN: motor puro de Producción v2 y Cargas (`/hato-lechero/produccion`
// y `/hato-lechero/cargas`). Decisiones del dueño, 2026-10-16 (lienzo
// "Producción Hato v2", D1–D20):
//   - Un solo selector de período: quincena, mes, trimestre y año. Quincena,
//     mes y trimestre son el último período CERRADO (la liquidación de El
//     Pomar llega después del cierre, así que el período en curso casi
//     siempre se vería vacío). Año = 1 de enero a hoy, nunca 12 meses.
//   - Cada cifra se compara contra el período anterior del mismo tipo. El
//     año se compara contra el mismo tramo del año pasado.
//   - Ventas (dato real) y producción pesada (aproximado) se calculan por
//     separado y nunca se mezclan: el pesaje es una muestra semanal.
//   - Top 5 / bottom 5 por vaca con las semanas desde el último parto.
// Cero I/O. Nunca devuelve 0 donde no hay dato: devuelve `null`.

import { resumirLitrosPesados, turnoIncompleto, type PesajeLitros, type RangoFecha } from './litrosPesados';
import { repartoVentasHato, type IngresoHatoParaReparto, type RepartoVentasHato } from '@/utils/hatoProduccion';

export type PeriodoProduccion = 'quincena' | 'mes' | 'trimestre' | 'anio';

export const PERIODOS_PRODUCCION: Array<{ id: PeriodoProduccion; label: string; etiquetaAnterior: string }> = [
  { id: 'quincena', label: 'Quincena', etiquetaAnterior: 'la quincena anterior' },
  { id: 'mes', label: 'Mes', etiquetaAnterior: 'el mes anterior' },
  { id: 'trimestre', label: 'Trimestre', etiquetaAnterior: 'el trimestre anterior' },
  { id: 'anio', label: 'Año', etiquetaAnterior: 'el mismo tramo del año pasado' },
];

export const MAX_VACAS_COMPARAR = 6;
export const TAMANO_TOP_VACAS = 5;

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

function partes(fechaIso: string): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  return { anio, mes, dia };
}

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

function sumarDias(fechaIso: string, dias: number): string {
  const { anio, mes, dia } = partes(fechaIso);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function diasEntre(desde: string, hasta: string): number {
  const a = partes(desde);
  const b = partes(hasta);
  return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86400000);
}

function rangoQuincena(anio: number, mes: number, quincena: 1 | 2): RangoFecha {
  return quincena === 1
    ? { desde: iso(anio, mes, 1), hasta: iso(anio, mes, 15) }
    : { desde: iso(anio, mes, 16), hasta: iso(anio, mes, ultimoDiaMes(anio, mes)) };
}

function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

/** Rango del período elegido, con `hoy` en hora local (`obtenerFechaHoy`). */
export function rangoPeriodoProduccion(periodo: PeriodoProduccion, hoy: string): RangoFecha {
  const { anio, mes, dia } = partes(hoy);
  switch (periodo) {
    case 'quincena': {
      // Última quincena cerrada: si hoy es del 16 en adelante, la 1ª de
      // este mes; si no, la 2ª del mes anterior.
      if (dia >= 16) return rangoQuincena(anio, mes, 1);
      const ant = mesAnterior(anio, mes);
      return rangoQuincena(ant.anio, ant.mes, 2);
    }
    case 'mes': {
      const ant = mesAnterior(anio, mes);
      return { desde: iso(ant.anio, ant.mes, 1), hasta: iso(ant.anio, ant.mes, ultimoDiaMes(ant.anio, ant.mes)) };
    }
    case 'trimestre': {
      const trimestreActual = Math.floor((mes - 1) / 3);
      const anioT = trimestreActual === 0 ? anio - 1 : anio;
      const t = trimestreActual === 0 ? 3 : trimestreActual - 1;
      const mesInicio = t * 3 + 1;
      return { desde: iso(anioT, mesInicio, 1), hasta: iso(anioT, mesInicio + 2, ultimoDiaMes(anioT, mesInicio + 2)) };
    }
    case 'anio':
      return { desde: iso(anio, 1, 1), hasta: hoy };
  }
}

/** Período anterior del mismo tipo. El año compara el mismo tramo (1 ene →
 * mismo día) del año pasado; un 29 de febrero cae al 28. */
export function rangoAnteriorProduccion(periodo: PeriodoProduccion, rango: RangoFecha): RangoFecha {
  const d = partes(rango.desde);
  switch (periodo) {
    case 'quincena':
      if (d.dia === 16) return rangoQuincena(d.anio, d.mes, 1);
      {
        const ant = mesAnterior(d.anio, d.mes);
        return rangoQuincena(ant.anio, ant.mes, 2);
      }
    case 'mes': {
      const ant = mesAnterior(d.anio, d.mes);
      return { desde: iso(ant.anio, ant.mes, 1), hasta: iso(ant.anio, ant.mes, ultimoDiaMes(ant.anio, ant.mes)) };
    }
    case 'trimestre': {
      let mesInicio = d.mes - 3;
      let anioT = d.anio;
      if (mesInicio < 1) {
        mesInicio += 12;
        anioT -= 1;
      }
      return { desde: iso(anioT, mesInicio, 1), hasta: iso(anioT, mesInicio + 2, ultimoDiaMes(anioT, mesInicio + 2)) };
    }
    case 'anio': {
      const h = partes(rango.hasta);
      const anioAnt = h.anio - 1;
      const dia = Math.min(h.dia, ultimoDiaMes(anioAnt, h.mes));
      return { desde: iso(anioAnt, 1, 1), hasta: iso(anioAnt, h.mes, dia) };
    }
  }
}

export interface Variacion {
  /** `(actual − anterior) / anterior`. `null` si falta un lado o el
   * anterior es 0: nunca se fabrica un −100% ni un 0%. */
  variacion: number | null;
}

export function variacionContraAnterior(actual: number | null, anterior: number | null): Variacion {
  if (actual == null || anterior == null || anterior === 0) return { variacion: null };
  return { variacion: (actual - anterior) / anterior };
}

// ---------------------------------------------------------------------------
// Ventas (dato real)
// ---------------------------------------------------------------------------

export interface QuincenaVenta {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  /** YA resuelto con `resolverLitrosQuincenal`. */
  litros_total: number | null;
  num_vacas_ordeno: number | null;
}

export interface BarraQuincena {
  clave: string;
  etiqueta: string;
  litros: number | null;
}

export interface ResumenVentas {
  /** `null` si ninguna quincena del período trae litros. */
  litrosVendidos: number | null;
  /** Σ (litros de la quincena ÷ vacas en ordeño de esa quincena). `null` si
   * alguna quincena con litros no trae el número de vacas: una suma parcial
   * fabricaría una caída (un mes con una sola quincena contada daría la
   * mitad). */
  litrosPorVaca: number | null;
  /** Quincenas con litros y sin número de vacas (la razón del `null`). */
  quincenasSinVacas: number;
  /** `null` cuando no hay ingresos visibles (sin permiso o sin ventas). */
  ingreso: number | null;
  reparto: RepartoVentasHato | null;
  barras: BarraQuincena[];
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaQuincena(q: Pick<QuincenaVenta, 'anio' | 'mes' | 'quincena' | 'fecha_inicio' | 'fecha_fin'>): string {
  return q.fecha_fin ?? q.fecha_inicio ?? rangoQuincena(q.anio, q.mes, q.quincena).hasta;
}

function quincenasDelRango(rango: RangoFecha): Array<{ anio: number; mes: number; quincena: 1 | 2 }> {
  const salida: Array<{ anio: number; mes: number; quincena: 1 | 2 }> = [];
  let { anio, mes } = partes(rango.desde);
  const fin = partes(rango.hasta);
  while (anio < fin.anio || (anio === fin.anio && mes <= fin.mes)) {
    for (const quincena of [1, 2] as const) {
      const r = rangoQuincena(anio, mes, quincena);
      if (r.hasta >= rango.desde && r.hasta <= rango.hasta) salida.push({ anio, mes, quincena });
    }
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return salida;
}

export function resumirVentasPeriodo(
  historial: readonly QuincenaVenta[],
  ingresos: readonly IngresoHatoParaReparto[] | null,
  rango: RangoFecha,
): ResumenVentas {
  const dentro = historial.filter((q) => {
    const f = fechaQuincena(q);
    return f >= rango.desde && f <= rango.hasta;
  });

  let litros = 0;
  let conLitros = 0;
  let porVaca = 0;
  let conVacas = 0;
  for (const q of dentro) {
    if (q.litros_total == null) continue;
    litros += q.litros_total;
    conLitros += 1;
    if (q.num_vacas_ordeno != null && q.num_vacas_ordeno > 0) {
      porVaca += q.litros_total / q.num_vacas_ordeno;
      conVacas += 1;
    }
  }

  const porClave = new Map(dentro.map((q) => [`${q.anio}-${q.mes}-${q.quincena}`, q]));
  const barras: BarraQuincena[] = quincenasDelRango(rango).map((q) => {
    const clave = `${q.anio}-${q.mes}-${q.quincena}`;
    return {
      clave,
      etiqueta: `${q.quincena}ª ${MESES_CORTOS[q.mes - 1]}`,
      litros: porClave.get(clave)?.litros_total ?? null,
    };
  });

  let reparto: RepartoVentasHato | null = null;
  let ingreso: number | null = null;
  if (ingresos) {
    const delRango = ingresos.filter((i) => i.fecha >= rango.desde && i.fecha <= rango.hasta);
    if (delRango.length > 0) {
      reparto = repartoVentasHato(delRango);
      ingreso = reparto.total;
    }
  }

  return {
    litrosVendidos: conLitros === 0 ? null : litros,
    litrosPorVaca: conVacas === 0 || conVacas < conLitros ? null : porVaca,
    quincenasSinVacas: conLitros - conVacas,
    ingreso,
    reparto,
    barras,
  };
}

// ---------------------------------------------------------------------------
// Producción pesada (aproximado)
// ---------------------------------------------------------------------------

export interface ResumenPesado {
  /** Promedio de los litros del hato en cada fecha de pesaje. */
  litrosHatoDia: number | null;
  /** Litros por vaca en un día de pesaje. */
  litrosPorVaca: number | null;
  vacasPesadas: number;
  /** Fechas de pesaje en el período. */
  nPesajes: number;
  /** `litrosPorVaca` = litros del hato ese día ÷ vacas pesadas ese día;
   * `null` sin vacas (nunca 0). */
  barras: Array<{ fecha: string; litros: number; nVacas: number; litrosPorVaca: number | null }>;
}

export function resumirPesadoPeriodo(pesajes: readonly PesajeLitros[], rango: RangoFecha): ResumenPesado {
  const resumen = resumirLitrosPesados(pesajes, rango);
  const n = resumen.puntos.length;
  return {
    litrosHatoDia: n === 0 || resumen.totalLitros == null ? null : resumen.totalLitros / n,
    litrosPorVaca: resumen.litrosPorVaca,
    vacasPesadas: resumen.vacasPesadas,
    nPesajes: n,
    barras: resumen.puntos.map((p) => ({
      fecha: p.fecha,
      litros: p.litros,
      nVacas: p.vacas.length,
      litrosPorVaca: p.vacas.length === 0 ? null : p.litros / p.vacas.length,
    })),
  };
}

export interface VacaRanking {
  animalId: string;
  /** Promedio de litros por día de pesaje en el período. */
  litros: number;
  /** Semanas desde el último parto anterior a su último pesaje del
   * período. `null` sin parto registrado: nunca se inventa. */
  semanasDesdeParto: number | null;
}

/** Último parto con fecha ≤ `fecha`. `partos` puede venir desordenado. */
export function ultimoPartoAntesDe(partos: readonly string[] | undefined, fecha: string): string | null {
  if (!partos) return null;
  let mejor: string | null = null;
  for (const p of partos) {
    if (p <= fecha && (mejor == null || p > mejor)) mejor = p;
  }
  return mejor;
}

export function rankingVacasPeriodo(
  pesajes: readonly PesajeLitros[],
  rango: RangoFecha,
  partosPorAnimal: ReadonlyMap<string, readonly string[]>,
): VacaRanking[] {
  const porVaca = new Map<string, { suma: number; n: number; ultima: string }>();
  for (const p of pesajes) {
    if (p.fecha < rango.desde || p.fecha > rango.hasta || turnoIncompleto(p)) continue;
    const actual = porVaca.get(p.animal_id);
    if (actual) {
      actual.suma += p.litros_total;
      actual.n += 1;
      if (p.fecha > actual.ultima) actual.ultima = p.fecha;
    } else {
      porVaca.set(p.animal_id, { suma: p.litros_total, n: 1, ultima: p.fecha });
    }
  }
  return [...porVaca.entries()]
    .map(([animalId, v]) => {
      const parto = ultimoPartoAntesDe(partosPorAnimal.get(animalId), v.ultima);
      return {
        animalId,
        litros: v.suma / v.n,
        semanasDesdeParto: parto == null ? null : Math.floor(diasEntre(parto, v.ultima) / 7),
      };
    })
    .sort((a, b) => b.litros - a.litros || a.animalId.localeCompare(b.animalId));
}

/** Top y bottom sin repetir vaca: con menos de 10 vacas, el bottom toma
 * solo las que no están en el top. El bottom va de menor a mayor. */
export function topYBottom(ranking: readonly VacaRanking[], n = TAMANO_TOP_VACAS): { top: VacaRanking[]; bottom: VacaRanking[] } {
  const top = ranking.slice(0, n);
  const resto = ranking.slice(top.length);
  const bottom = resto.slice(Math.max(0, resto.length - n)).reverse();
  return { top, bottom };
}

/** Una fila por fecha de pesaje con los litros de cada vaca elegida. Una
 * vaca sin pesaje esa fecha no tiene clave: la línea deja un hueco. */
export function filasCompararVacas(
  pesajes: readonly PesajeLitros[],
  animalIds: readonly string[],
  rango: RangoFecha,
): Array<{ fecha: string } & Record<string, number | string>> {
  const elegidas = new Set(animalIds);
  const porFecha = new Map<string, Map<string, { suma: number; n: number }>>();
  for (const p of pesajes) {
    if (!elegidas.has(p.animal_id) || p.fecha < rango.desde || p.fecha > rango.hasta || turnoIncompleto(p)) continue;
    let fila = porFecha.get(p.fecha);
    if (!fila) {
      fila = new Map();
      porFecha.set(p.fecha, fila);
    }
    const actual = fila.get(p.animal_id);
    if (actual) {
      actual.suma += p.litros_total;
      actual.n += 1;
    } else {
      fila.set(p.animal_id, { suma: p.litros_total, n: 1 });
    }
  }
  return [...porFecha.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([fecha, vacas]) => {
      const fila: { fecha: string } & Record<string, number | string> = { fecha };
      for (const [id, v] of vacas) fila[id] = v.suma / v.n;
      return fila;
    });
}

export function agregarVacas(seleccion: readonly string[], nuevas: readonly string[], max = MAX_VACAS_COMPARAR): string[] {
  const salida = [...seleccion];
  for (const id of nuevas) {
    if (salida.length >= max) break;
    if (!salida.includes(id)) salida.push(id);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Cargas: lo que falta y el estado de cada miércoles
// ---------------------------------------------------------------------------

export interface QuincenaClave {
  anio: number;
  mes: number;
  quincena: 1 | 2;
}

/** Las 2 últimas quincenas cerradas, de la más reciente a la más vieja. */
export function ultimasQuincenasCerradas(hoy: string, n = 2): QuincenaClave[] {
  const salida: QuincenaClave[] = [];
  const { anio, mes, dia } = partes(hoy);
  let q: QuincenaClave = dia >= 16 ? { anio, mes, quincena: 1 } : { ...mesAnterior(anio, mes), quincena: 2 };
  while (salida.length < n) {
    salida.push(q);
    q = q.quincena === 2 ? { anio: q.anio, mes: q.mes, quincena: 1 } : { ...mesAnterior(q.anio, q.mes), quincena: 2 };
  }
  return salida;
}

export function etiquetaQuincena(q: QuincenaClave, larga = false): string {
  const meses = larga
    ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
    : MESES_CORTOS;
  return `${q.quincena}ª quincena ${meses[q.mes - 1]}`;
}

export type EstadoSemanaPesaje = 'cargado' | 'falta' | 'proximo';

export interface SemanaPesajeCarga {
  fecha: string;
  estado: EstadoSemanaPesaje;
  nVacas: number;
  /** Origen dominante de las filas: 'telegram' | 'foto' | 'web' | null. */
  fuente: string | null;
}

/** Estado de cada día de pesaje del mes. `fechas` sale de
 * `fechasPesajeMensuales` (calculosHato.ts). Un día de hoy sin pesaje
 * todavía es "falta": el pesaje se hace en la mañana. */
export function semanasPesajeDelMes(
  fechas: readonly string[],
  pesajes: readonly { animal_id: string; fecha: string; fuente?: string | null }[],
  hoy: string,
): SemanaPesajeCarga[] {
  const porFecha = new Map<string, { vacas: Set<string>; fuentes: Map<string, number> }>();
  const fijas = new Set(fechas);
  for (const p of pesajes) {
    if (!fijas.has(p.fecha)) continue;
    let g = porFecha.get(p.fecha);
    if (!g) {
      g = { vacas: new Set(), fuentes: new Map() };
      porFecha.set(p.fecha, g);
    }
    g.vacas.add(p.animal_id);
    const f = p.fuente ?? 'web';
    g.fuentes.set(f, (g.fuentes.get(f) ?? 0) + 1);
  }
  return fechas.map((fecha) => {
    const g = porFecha.get(fecha);
    if (g && g.vacas.size > 0) {
      const fuente = [...g.fuentes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { fecha, estado: 'cargado' as const, nVacas: g.vacas.size, fuente };
    }
    return { fecha, estado: fecha <= hoy ? ('falta' as const) : ('proximo' as const), nVacas: 0, fuente: null };
  });
}

export type TipoPendienteCarga =
  | 'liquidacion'
  | 'pesaje'
  /** La quincena se guardó sin el número de vacas en ordeño. */
  | 'vacas'
  /** Foto de liquidación subida y leída, pero la quincena nunca se guardó. */
  | 'liquidacion_a_medias'
  /** Foto de planilla subida, pero ningún litro entró. */
  | 'pesaje_a_medias';

export interface PendienteCarga {
  tipo: TipoPendienteCarga;
  clave: string;
  texto: string;
  /** Quincena que abre «Continuar» (tipos `liquidacion` y `vacas`). */
  quincena?: QuincenaClave;
  /** Foto ya subida (tipos `*_a_medias`): se puede volver a ver. */
  foto?: FotoSubida;
  /** Mes de la planilla (tipo `pesaje_a_medias`). */
  anio?: number;
  mes?: number;
}

/** Quincenas cerradas que miran "Falta cargar" y "Falta vacas". */
const QUINCENAS_REVISADAS = 3;

/** Lo que falta cargar: las 2 últimas quincenas cerradas sin liquidación,
 * las 3 últimas cargadas sin vacas en ordeño, y los días de pesaje del mes
 * (y del anterior, si hoy es antes del 8) que ya pasaron sin un solo
 * pesaje. Solo mira hacia atrás un mes: lo más viejo vive en el historial. */
export function pendientesCarga(input: {
  hoy: string;
  quincenasCargadas: ReadonlyArray<QuincenaClave & { num_vacas_ordeno?: number | null }>;
  fechasPesajeMesActual: readonly string[];
  fechasPesajeMesAnterior: readonly string[];
  fechasConPesaje: ReadonlySet<string>;
}): PendienteCarga[] {
  const cargadas = new Map(input.quincenasCargadas.map((q) => [`${q.anio}-${q.mes}-${q.quincena}`, q]));
  const salida: PendienteCarga[] = [];
  ultimasQuincenasCerradas(input.hoy, QUINCENAS_REVISADAS).forEach((q, i) => {
    const clave = `${q.anio}-${q.mes}-${q.quincena}`;
    const cargada = cargadas.get(clave);
    if (!cargada) {
      // Solo las 2 más recientes: la 3ª sin liquidación ya es historia.
      if (i < 2) salida.push({ tipo: 'liquidacion', clave, texto: `Liquidación · ${etiquetaQuincena(q)}`, quincena: q });
    } else if (cargada.num_vacas_ordeno == null) {
      salida.push({ tipo: 'vacas', clave: `vacas-${clave}`, texto: `Vacas en ordeño · ${etiquetaQuincena(q)}`, quincena: q });
    }
  });
  const { dia } = partes(input.hoy);
  const fechas = [...(dia < 8 ? input.fechasPesajeMesAnterior : []), ...input.fechasPesajeMesActual];
  // Solo los días de pesaje de los últimos 35 días que ya pasaron.
  const limite = sumarDias(input.hoy, -35);
  for (const fecha of fechas) {
    if (fecha > input.hoy || fecha < limite) continue;
    if (!input.fechasConPesaje.has(fecha)) salida.push({ tipo: 'pesaje', clave: fecha, texto: `Pesaje · ${diaSemanaCorto(fecha)} ${partes(fecha).dia} ${MESES_CORTOS[partes(fecha).mes - 1]}` });
  }
  return salida;
}

/** Días hacia atrás que miran las cargas a medias. */
export const DIAS_CARGAS_A_MEDIAS = 35;

/**
 * Cargas que quedaron a medias (mensaje de Martha, 2026-10-16: «tuve que
 * dejar ahí mientras tenía el dato y ahora no puedo seguir»):
 *   - una foto de liquidación sin ninguna quincena guardada en las 36 h
 *     siguientes (la inversa de `fotoDeQuincena`);
 *   - una foto de pesaje que no dejó ni un litro.
 * Solo los últimos 35 días: una foto más vieja ya no es una tarea abierta.
 */
export function cargasAMedias(input: {
  hoy: string;
  fotosLiquidacion: readonly FotoSubida[];
  guardadosQuincena: ReadonlyArray<string | null>;
  pesajesSinFilas: ReadonlyArray<FotoSubida & { anio: number; mes: number }>;
}): PendienteCarga[] {
  const limite = Date.parse(`${sumarDias(input.hoy, -DIAS_CARGAS_A_MEDIAS)}T00:00:00`);
  const guardados = input.guardadosQuincena.map((g) => (g ? Date.parse(g) : NaN)).filter((t) => !Number.isNaN(t));
  const salida: PendienteCarga[] = [];
  for (const foto of input.fotosLiquidacion) {
    const t = Date.parse(foto.creadoEn);
    if (Number.isNaN(t) || t < limite) continue;
    const guardada = guardados.some((g) => g >= t && g - t <= VENTANA_LIGA_LIQUIDACION_MS);
    if (!guardada) {
      salida.push({ tipo: 'liquidacion_a_medias', clave: foto.capturaId, texto: `Liquidación subida el ${etiquetaInstante(foto.creadoEn)}, sin guardar`, foto });
    }
  }
  for (const foto of input.pesajesSinFilas) {
    const t = Date.parse(foto.creadoEn);
    if (Number.isNaN(t) || t < limite) continue;
    salida.push({
      tipo: 'pesaje_a_medias',
      clave: foto.capturaId,
      texto: `Planilla de pesaje de ${MESES_CORTOS[foto.mes - 1]} subida el ${etiquetaInstante(foto.creadoEn)}, sin litros`,
      foto,
      anio: foto.anio,
      mes: foto.mes,
    });
  }
  return salida.sort((a, b) => ((a.foto?.creadoEn ?? '') < (b.foto?.creadoEn ?? '') ? 1 : -1));
}

/** "3 oct" en hora local, a partir de un instante ISO. */
function etiquetaInstante(instante: string): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function diaSemanaCorto(fechaIso: string): string {
  const { anio, mes, dia } = partes(fechaIso);
  return DIAS_SEMANA[new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()];
}

/** "Mié 8 oct". */
export function etiquetaDiaPesaje(fechaIso: string): string {
  const { mes, dia } = partes(fechaIso);
  const d = diaSemanaCorto(fechaIso);
  return `${d.charAt(0).toUpperCase()}${d.slice(1)} ${dia} ${MESES_CORTOS[mes - 1]}`;
}

export function etiquetaRango(rango: RangoFecha): string {
  const a = partes(rango.desde);
  const b = partes(rango.hasta);
  const ma = MESES_CORTOS[a.mes - 1];
  const mb = MESES_CORTOS[b.mes - 1];
  if (a.anio === b.anio) return `${a.dia} ${ma} – ${b.dia} ${mb} ${b.anio}`;
  return `${a.dia} ${ma} ${a.anio} – ${b.dia} ${mb} ${b.anio}`;
}

export function etiquetaMesAnio(anio: number, mes: number): string {
  return `${MESES_CORTOS[mes - 1]} ${anio}`;
}

// ---------------------------------------------------------------------------
// Cargas: historial de subidas (quincenas al camión + pesajes)
// ---------------------------------------------------------------------------

/** Ventana para ligar una foto de liquidación con su quincena: misma que
 * usa el pesaje para ligar filas con su subida (36 h). */
export const VENTANA_LIGA_LIQUIDACION_MS = 36 * 60 * 60 * 1000;

export interface FotoSubida {
  capturaId: string;
  bucket: string;
  ruta: string;
  creadoEn: string;
}

/** La foto de liquidación más cercana ANTES del guardado de la quincena
 * (la carga lee la foto y después se guarda). Sin una dentro de 36 h, no hay
 * foto: nunca se liga una foto de otra quincena. */
export function fotoDeQuincena(guardadoEn: string | null, fotos: readonly FotoSubida[]): FotoSubida | null {
  if (!guardadoEn) return null;
  const t = Date.parse(guardadoEn);
  if (Number.isNaN(t)) return null;
  let mejor: FotoSubida | null = null;
  let distMejor = Infinity;
  for (const f of fotos) {
    const tf = Date.parse(f.creadoEn);
    if (Number.isNaN(tf)) continue;
    const dist = t - tf;
    if (dist < 0 || dist > VENTANA_LIGA_LIQUIDACION_MS) continue;
    if (dist < distMejor) {
      mejor = f;
      distMejor = dist;
    }
  }
  return mejor;
}

export type TipoSubida = 'quincena' | 'pesaje';

export interface FilaHistorialSubida {
  tipo: TipoSubida;
  clave: string;
  /** Fecha para ordenar: fin de la quincena o día del pesaje. */
  fecha: string;
  etiqueta: string;
  mes: string;
  litros: number | null;
  /** Solo quincenas. `null` sin permiso de Finanzas o sin ingreso. */
  valor: number | null;
  foto: FotoSubida | null;
  /** Solo pesajes: fuente dominante de las filas. */
  fuente: string | null;
}

export function filasHistorialSubidas(input: {
  quincenas: ReadonlyArray<QuincenaVenta & { id: string; updated_at: string | null; valor: number | null }>;
  pesajes: ReadonlyArray<PesajeLitros & { fuente?: string | null }>;
  fotosLiquidacion: readonly FotoSubida[];
  fotoPesajePorFecha: ReadonlyMap<string, FotoSubida>;
  desde: string;
}): FilaHistorialSubida[] {
  const filas: FilaHistorialSubida[] = [];
  for (const q of input.quincenas) {
    const fecha = fechaQuincena(q);
    if (fecha < input.desde) continue;
    filas.push({
      tipo: 'quincena',
      clave: q.id,
      fecha,
      etiqueta: `${q.quincena}ª quincena`,
      mes: etiquetaMesAnio(q.anio, q.mes),
      litros: q.litros_total,
      valor: q.valor,
      foto: fotoDeQuincena(q.updated_at, input.fotosLiquidacion),
      fuente: null,
    });
  }
  const porFecha = new Map<string, { litros: number; n: number; fuentes: Map<string, number> }>();
  for (const p of input.pesajes) {
    if (p.fecha < input.desde) continue;
    let g = porFecha.get(p.fecha);
    if (!g) {
      g = { litros: 0, n: 0, fuentes: new Map() };
      porFecha.set(p.fecha, g);
    }
    g.litros += p.litros_total;
    g.n += 1;
    const f = p.fuente ?? 'web';
    g.fuentes.set(f, (g.fuentes.get(f) ?? 0) + 1);
  }
  for (const [fecha, g] of porFecha) {
    const { anio, mes } = partes(fecha);
    filas.push({
      tipo: 'pesaje',
      clave: fecha,
      fecha,
      etiqueta: `Pesaje ${diaSemanaCorto(fecha)} ${partes(fecha).dia}`,
      mes: etiquetaMesAnio(anio, mes),
      litros: g.litros,
      valor: null,
      foto: input.fotoPesajePorFecha.get(fecha) ?? null,
      fuente: [...g.fuentes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    });
  }
  return filas.sort((a, b) => (a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.tipo.localeCompare(b.tipo)));
}

/** Primer día del mes que queda `meses` meses atrás de `hoy`. */
export function inicioMesesAtras(hoy: string, meses: number): string {
  let { anio, mes } = partes(hoy);
  for (let i = 1; i < meses; i++) {
    const ant = mesAnterior(anio, mes);
    anio = ant.anio;
    mes = ant.mes;
  }
  return iso(anio, mes, 1);
}

// ---------------------------------------------------------------------------
// Borrador de la venta quincenal (ProduccionQuincenalDialog)
// ---------------------------------------------------------------------------

export interface BorradorQuincenaVenta {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  litrosTotal: number | null;
  litrosPomar: number | null;
  numVacasOrdeno: number | null;
  notas: string;
  fechaIngreso: string;
  valorBruto: number | null;
  regionId: string;
  medioPagoId: string;
  compradorId: string;
}

/** El borrador solo existe si hay algo que perder: litros, valor, vacas o
 * notas. Los valores por defecto del formulario (fecha de hoy, región y
 * medio de pago) solos no son un borrador: mostrar «tienes datos sin
 * guardar» por ellos sería un falso aviso cada vez que se abre el diálogo. */
export function borradorQuincenaConDatos(input: {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  litrosTotal: number | undefined;
  litrosPomar: number | undefined;
  numVacasOrdeno: number | undefined;
  notas: string;
  fechaIngreso: string;
  valorBruto: number | undefined;
  regionId: string;
  medioPagoId: string;
  compradorId: string;
}): BorradorQuincenaVenta | null {
  const conDatos =
    input.litrosTotal != null || input.valorBruto != null || input.numVacasOrdeno != null || input.notas.trim() !== '';
  if (!conDatos) return null;
  return {
    anio: input.anio,
    mes: input.mes,
    quincena: input.quincena,
    litrosTotal: input.litrosTotal ?? null,
    litrosPomar: input.litrosPomar ?? null,
    numVacasOrdeno: input.numVacasOrdeno ?? null,
    notas: input.notas,
    fechaIngreso: input.fechaIngreso,
    valorBruto: input.valorBruto ?? null,
    regionId: input.regionId,
    medioPagoId: input.medioPagoId,
    compradorId: input.compradorId,
  };
}
