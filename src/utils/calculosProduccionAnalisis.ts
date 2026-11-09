/**
 * Lógica pura del tablero analítico de Producción (issue #463).
 *
 * - Identidad de cosecha = `{tipo, ano}` → "Principal 2027". Es independiente
 *   del año calendario.
 * - Año del movimiento = año de `fecha` (YYYY-MM-DD). No es `produccion.ano`.
 *   Un registro de Principal 2027 con fecha en 2026 aparece al filtrar 2026.
 * - Si el registro no trae fecha, el año no recorta kilos ni esconde la cosecha:
 *   el corte se declara explícito.
 * - Producción = kg de entrada (`kg_totales`). No se suman etapas.
 * - kg/árbol y t/ha exigen denominador válido en todo el corte; si falta, null.
 * - La evolución no rellena semanas futuras ni huecos con cero.
 */

import type {
  CosechaIdentidad,
  CosechaTipo,
  MetricaProduccion,
  VistaProduccion,
} from '@/types/produccion';

export type { CosechaIdentidad, VistaProduccion };

export interface RegistroCosechaBase {
  ano: number;
  cosecha_tipo: CosechaTipo;
}

export interface RegistroProduccionAgregable extends RegistroCosechaBase {
  lote_id: string;
  lote_nombre?: string | null;
  sublote_id?: string | null;
  kg_totales: number;
  arboles_registrados: number | null;
  area_hectareas?: number | null;
  kg_exportacion?: number | null;
  kg_nacional?: number | null;
  /** Fecha del movimiento (YYYY-MM-DD). `produccion` no la tiene. */
  fecha?: string | null;
}

export interface EstadoFiltroProduccion {
  vista: VistaProduccion;
  anos_movimiento: number[];
  cosecha_keys: string[];
  lote_ids: string[];
  metrica: MetricaProduccion;
}

export type EstadoSeleccionCosecha =
  | { estado: 'ok'; cosechas: CosechaIdentidad[] }
  | {
      estado: 'incompatible';
      cosechas: CosechaIdentidad[];
      mensaje: string;
      sugeridas: CosechaIdentidad[];
    }
  | { estado: 'vacio'; cosechas: []; mensaje: string };

export function cosechaKey(tipo: CosechaTipo, ano: number): string {
  return `${tipo}:${ano}`;
}

export function formatCosechaCode(ano: number, tipo: CosechaTipo): string {
  return `${tipo === 'Principal' ? 'P' : 'T'}${String(ano).slice(-2)}`;
}

/** Etiqueta canónica alineada con finanzas: "Principal 2027". */
export function formatCosechaLabel(ano: number, tipo: CosechaTipo): string {
  return `${tipo} ${ano}`;
}

export function parseCosechaKey(key: string): { tipo: CosechaTipo; ano: number } | null {
  const match = /^(Principal|Traviesa):(\d{4})$/.exec(key);
  if (!match) return null;
  return { tipo: match[1] as CosechaTipo, ano: Number(match[2]) };
}

export function identidadFromParts(tipo: CosechaTipo, ano: number): CosechaIdentidad {
  return {
    key: cosechaKey(tipo, ano),
    tipo,
    ano,
    label: formatCosechaLabel(ano, tipo),
    code: formatCosechaCode(ano, tipo),
  };
}

/**
 * Orden cronológico de campañas: Principal N → Traviesa N → Principal N+1…
 * (Principal del año siguiente empieza a circular en el segundo semestre).
 */
export function ordenCosechaScore(tipo: CosechaTipo, ano: number): number {
  return ano * 2 + (tipo === 'Traviesa' ? 1 : 0);
}

export function ordenarCosechas(cosechas: CosechaIdentidad[]): CosechaIdentidad[] {
  return [...cosechas].sort(
    (a, b) => ordenCosechaScore(a.tipo, a.ano) - ordenCosechaScore(b.tipo, b.ano),
  );
}

/** Año calendario de una fecha de movimiento. Null si la fecha no es válida. */
export function anioDeFechaMovimiento(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return year;
}

/**
 * Años de movimiento presentes en las fechas. No usa el año del nombre de
 * campaña y no inventa el año anterior de una Principal.
 */
export function derivarAnosMovimiento(
  registros: Array<{ fecha?: string | null }>,
): number[] {
  const anos = new Set<number>();
  for (const r of registros) {
    const year = anioDeFechaMovimiento(r.fecha);
    if (year != null) anos.add(year);
  }
  return Array.from(anos).sort((a, b) => a - b);
}

/** Identidades distintas presentes en los registros, ordenadas. */
export function derivarCosechasDisponibles(
  registros: RegistroCosechaBase[],
): CosechaIdentidad[] {
  const map = new Map<string, CosechaIdentidad>();
  for (const r of registros) {
    const id = identidadFromParts(r.cosecha_tipo, r.ano);
    map.set(id.key, id);
  }
  return ordenarCosechas(Array.from(map.values()));
}

/**
 * Resuelve la cosecha que se analiza. El año del movimiento no entra aquí:
 * no esconde campañas ni sustituye una identidad por otra.
 * - Vista "una": la cosecha elegida, o la más reciente si no hay elección.
 * - Vista "varias": las elegidas, o todas si no hay elección.
 * - Una key que no existe en los datos es incompatible y se nombra.
 */
export function resolverSeleccionCosechas(
  disponibles: CosechaIdentidad[],
  filtros: Pick<EstadoFiltroProduccion, 'vista' | 'cosecha_keys'>,
): EstadoSeleccionCosecha {
  if (disponibles.length === 0) {
    return {
      estado: 'vacio',
      cosechas: [],
      mensaje: 'No hay cosechas registradas en producción.',
    };
  }

  const seleccionadas = filtros.cosecha_keys
    .map((k) => disponibles.find((c) => c.key === k))
    .filter((c): c is CosechaIdentidad => Boolean(c));

  if (filtros.cosecha_keys.length > 0 && seleccionadas.length === 0) {
    return {
      estado: 'incompatible',
      cosechas: [],
      sugeridas: ordenarCosechas(disponibles),
      mensaje:
        'La cosecha elegida no está en los registros de producción. El tablero no la sustituye por otra campaña.',
    };
  }

  let efectivas = seleccionadas.length > 0 ? seleccionadas : disponibles;
  if (filtros.vista === 'una') {
    efectivas = [efectivas[efectivas.length - 1]];
  }

  return { estado: 'ok', cosechas: ordenarCosechas(efectivas) };
}

/**
 * Años de campaña a consultar en `produccion.ano` a partir de las cosechas
 * efectivas (nunca del año de movimiento directamente).
 */
export function anosCampanaDeCosechas(cosechas: CosechaIdentidad[]): number[] {
  return Array.from(new Set(cosechas.map((c) => c.ano))).sort((a, b) => a - b);
}

/** Consolida lote vs sublote evitando doble conteo. */
export function consolidarRegistrosProduccion<T extends RegistroProduccionAgregable>(
  records: T[],
): T[] {
  const grupos: Record<string, T[]> = {};
  for (const r of records) {
    const key = `${r.lote_id}__${r.ano}__${r.cosecha_tipo}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(r);
  }

  return Object.values(grupos).map((grupo) => {
    const nivelLote = grupo.find((r) => r.sublote_id == null);
    if (nivelLote) return nivelLote;

    const base = grupo[0];
    const kgTotales = grupo.reduce((sum, r) => sum + (Number(r.kg_totales) || 0), 0);
    const arbolesRaw = grupo.reduce((sum, r) => {
      const a = r.arboles_registrados;
      return sum + (a != null && a > 0 ? a : 0);
    }, 0);
    const tieneArboles = grupo.some((r) => r.arboles_registrados != null && r.arboles_registrados > 0);
    const kgExpo = grupo.reduce((sum, r) => sum + (Number(r.kg_exportacion) || 0), 0);
    const kgNac = grupo.reduce((sum, r) => sum + (Number(r.kg_nacional) || 0), 0);

    return {
      ...base,
      sublote_id: null,
      kg_totales: kgTotales,
      arboles_registrados: tieneArboles ? arbolesRaw : null,
      kg_exportacion: kgExpo > 0 ? kgExpo : null,
      kg_nacional: kgNac > 0 ? kgNac : null,
    };
  });
}

/**
 * kg/árbol: null si no hay denominador válido (nunca 0 inventado).
 */
export function calcularKgPorArbol(
  kg: number,
  arboles: number | null | undefined,
): number | null {
  if (arboles == null || arboles <= 0) return null;
  return kg / arboles;
}

/**
 * t/ha: null si no hay área válida.
 */
export function calcularTonPorHa(
  kg: number,
  areaHa: number | null | undefined,
): number | null {
  if (areaHa == null || areaHa <= 0) return null;
  return kg / 1000 / areaHa;
}

export function valorMetrica(
  metrica: MetricaProduccion,
  kg: number,
  arboles: number | null | undefined,
  areaHa: number | null | undefined,
): number | null {
  switch (metrica) {
    case 'kg_totales':
      return kg;
    case 'kg_por_arbol':
      return calcularKgPorArbol(kg, arboles);
    case 'ton_por_ha':
      return calcularTonPorHa(kg, areaHa);
    default:
      return null;
  }
}

export interface ResumenProduccionCosecha {
  cosecha: CosechaIdentidad;
  /** kg_totales consolidados — proxy de producción registrada (entrada neta aún no existe en schema). */
  produccion_kg: number;
  kg_por_arbol: number | null;
  ton_por_ha: number | null;
  lotes_con_dato: number;
  /** true cuando algún denominador falta: no se debe mostrar 0. */
  rendimientos_parciales: boolean;
  /** false cuando la cosecha no tiene filas en el corte. 0 kg sería un cero inventado. */
  tiene_registros: boolean;
}

export function resumirCosecha(
  registros: RegistroProduccionAgregable[],
  cosecha: CosechaIdentidad,
): ResumenProduccionCosecha {
  const delGrupo = consolidarRegistrosProduccion(
    registros.filter(
      (r) => r.ano === cosecha.ano && r.cosecha_tipo === cosecha.tipo,
    ),
  );
  const produccion_kg = delGrupo.reduce((s, r) => s + (Number(r.kg_totales) || 0), 0);
  const conKg = delGrupo.filter((r) => (Number(r.kg_totales) || 0) > 0);
  const arbolesOk =
    conKg.length > 0 &&
    conKg.every((r) => r.arboles_registrados != null && r.arboles_registrados > 0);
  const arboles = conKg.reduce((s, r) => s + (r.arboles_registrados ?? 0), 0);
  const areaOk =
    conKg.length > 0 &&
    conKg.every((r) => r.area_hectareas != null && r.area_hectareas > 0);
  const areaTotal = conKg.reduce((s, r) => s + Number(r.area_hectareas || 0), 0);
  const lotesConDato = new Set(delGrupo.map((r) => r.lote_id)).size;

  return {
    cosecha,
    produccion_kg,
    kg_por_arbol: arbolesOk ? calcularKgPorArbol(produccion_kg, arboles) : null,
    ton_por_ha: areaOk ? calcularTonPorHa(produccion_kg, areaTotal) : null,
    lotes_con_dato: lotesConDato,
    rendimientos_parciales: !arbolesOk || !areaOk,
    tiene_registros: delGrupo.length > 0,
  };
}

export interface ComparacionLoteCosecha {
  lote_id: string;
  lote_nombre: string;
  /** Valor de la métrica pedida; ausente = sin dato (no cero). */
  por_cosecha: Record<string, number | null>;
  /** Entrada neta (kg_totales), independiente de la métrica del gráfico. */
  kg_por_cosecha: Record<string, number | null>;
}

/**
 * Comparación por lote entre una o varias cosechas.
 * Si un lote no tiene registro en una campaña, el valor es null (no 0).
 */
export function compararProduccionPorLote(
  registros: RegistroProduccionAgregable[],
  cosechas: CosechaIdentidad[],
  metrica: MetricaProduccion = 'kg_totales',
): ComparacionLoteCosecha[] {
  const consolidados = consolidarRegistrosProduccion(registros);
  const lotes = new Map<string, string>();
  for (const r of consolidados) {
    lotes.set(r.lote_id, r.lote_nombre || r.lote_id);
  }

  const porLoteCosecha = new Map<string, RegistroProduccionAgregable>();
  for (const r of consolidados) {
    porLoteCosecha.set(`${r.lote_id}__${cosechaKey(r.cosecha_tipo, r.ano)}`, r);
  }

  return Array.from(lotes.entries())
    .map(([lote_id, lote_nombre]) => {
      const por_cosecha: Record<string, number | null> = {};
      const kg_por_cosecha: Record<string, number | null> = {};
      for (const c of cosechas) {
        const reg = porLoteCosecha.get(`${lote_id}__${c.key}`);
        if (!reg) {
          por_cosecha[c.key] = null;
          kg_por_cosecha[c.key] = null;
          continue;
        }
        const kg = Number(reg.kg_totales) || 0;
        kg_por_cosecha[c.key] = kg;
        por_cosecha[c.key] = valorMetrica(
          metrica,
          kg,
          reg.arboles_registrados,
          reg.area_hectareas,
        );
      }
      return { lote_id, lote_nombre, por_cosecha, kg_por_cosecha };
    })
    .filter((row) => Object.values(row.por_cosecha).some((v) => v != null))
    .sort((a, b) => a.lote_nombre.localeCompare(b.lote_nombre, 'es'));
}

export interface PuntoCalidadCosecha {
  cosecha: CosechaIdentidad;
  kg_exportacion: number;
  kg_nacional: number;
  kg_sin_desglose: number;
  /** Denominador explícito para % = kg con desglose. */
  kg_con_desglose: number;
  pct_exportacion: number | null;
  pct_nacional: number | null;
}

export function agregarCalidadPorCosecha(
  registros: RegistroProduccionAgregable[],
  cosechas: CosechaIdentidad[],
): PuntoCalidadCosecha[] {
  const consolidados = consolidarRegistrosProduccion(registros);
  return cosechas.map((cosecha) => {
    const delGrupo = consolidados.filter(
      (r) => r.ano === cosecha.ano && r.cosecha_tipo === cosecha.tipo,
    );
    let kg_exportacion = 0;
    let kg_nacional = 0;
    let kg_sin_desglose = 0;
    for (const r of delGrupo) {
      const expo = r.kg_exportacion != null ? Number(r.kg_exportacion) : 0;
      const nac = r.kg_nacional != null ? Number(r.kg_nacional) : 0;
      const total = Number(r.kg_totales) || 0;
      if ((r.kg_exportacion != null && r.kg_exportacion > 0) || (r.kg_nacional != null && r.kg_nacional > 0)) {
        kg_exportacion += expo;
        kg_nacional += nac;
      } else {
        kg_sin_desglose += total;
      }
    }
    const kg_con_desglose = kg_exportacion + kg_nacional;
    return {
      cosecha,
      kg_exportacion,
      kg_nacional,
      kg_sin_desglose,
      kg_con_desglose,
      pct_exportacion: kg_con_desglose > 0 ? (kg_exportacion / kg_con_desglose) * 100 : null,
      pct_nacional: kg_con_desglose > 0 ? (kg_nacional / kg_con_desglose) * 100 : null,
    };
  });
}

export interface CorteMovimiento {
  estado: 'sin_filtro' | 'aplicado' | 'sin_fecha' | 'incompatible';
  mensaje: string;
  /**
   * Filas del corte. En `sin_fecha` se conservan: el año no las esconde.
   * En `incompatible` quedan vacías y no se sustituyen por otra cosecha.
   */
  registros: RegistroProduccionAgregable[];
  corte: string | null;
  anos: number[];
}

function registrosDeCosechas(
  registros: RegistroProduccionAgregable[],
  cosechas: CosechaIdentidad[],
): RegistroProduccionAgregable[] {
  const keys = new Set(cosechas.map((c) => c.key));
  return registros.filter((r) => keys.has(cosechaKey(r.cosecha_tipo, r.ano)));
}

function fechaMaxima(registros: Array<{ fecha?: string | null }>): string | null {
  let max: string | null = null;
  for (const r of registros) {
    if (anioDeFechaMovimiento(r.fecha) == null || !r.fecha) continue;
    if (max == null || r.fecha > max) max = r.fecha;
  }
  return max;
}

/**
 * Aplica el año del movimiento (año de la fecha) sin confundirlo con la
 * identidad de campaña.
 */
export function evaluarCorteMovimiento(
  registros: RegistroProduccionAgregable[],
  cosechas: CosechaIdentidad[],
  anosMovimiento: number[],
): CorteMovimiento {
  const anos = [...anosMovimiento].sort((a, b) => a - b);

  if (anos.length === 0) {
    const delGrupo = registrosDeCosechas(registros, cosechas);
    return {
      estado: 'sin_filtro',
      mensaje: 'Sin filtro de año. El corte es el total registrado de la cosecha.',
      registros: delGrupo,
      corte: fechaMaxima(delGrupo),
      anos,
    };
  }

  const partes = cosechas.map((cosecha) => {
    const delGrupo = registrosDeCosechas(registros, [cosecha]);
    const conFecha = delGrupo.filter((r) => anioDeFechaMovimiento(r.fecha) != null);
    const coinciden = conFecha.filter((r) =>
      anos.includes(anioDeFechaMovimiento(r.fecha) as number),
    );
    return { cosecha, delGrupo, conFecha, coinciden };
  });

  if (partes.every((p) => p.conFecha.length === 0)) {
    const delGrupo = partes.flatMap((p) => p.delGrupo);
    const etiquetas = cosechas.map((c) => c.label).join(', ') || 'la cosecha elegida';
    return {
      estado: 'sin_fecha',
      mensaje: `Hay un año de movimiento (${anos.join(', ')}) y ${etiquetas} no trae fecha. Los kilos se muestran completos: el año no los recorta ni esconde la cosecha.`,
      registros: delGrupo,
      corte: null,
      anos,
    };
  }

  const coinciden = partes.flatMap((p) => p.coinciden);
  const fuera = partes.filter((p) => p.conFecha.length > 0 && p.coinciden.length === 0);
  const sinFecha = partes.reduce((s, p) => s + (p.delGrupo.length - p.conFecha.length), 0);

  if (coinciden.length === 0) {
    const etiquetas = cosechas.map((c) => c.label).join(', ') || 'la cosecha elegida';
    return {
      estado: 'incompatible',
      mensaje: `${etiquetas} no tiene movimientos con fecha en ${anos.join(', ')}. La selección queda explícita y no se cambia por otra campaña.`,
      registros: [],
      corte: null,
      anos,
    };
  }

  const avisoFuera =
    fuera.length > 0
      ? ` ${fuera.map((p) => p.cosecha.label).join(', ')} no tiene movimientos en ${anos.join(', ')}: queda fuera de este corte y no se rellena con cero.`
      : '';
  const avisoSinFecha =
    sinFecha > 0
      ? ` ${sinFecha} registro(s) sin fecha quedan fuera de este corte y no se cuentan como cero.`
      : '';
  return {
    estado: 'aplicado',
    mensaje: `Corte por fecha de movimiento en ${anos.join(', ')}. El acumulado llega hasta ese corte, no hasta el total de la campaña.${avisoFuera}${avisoSinFecha}`,
    registros: coinciden,
    corte: fechaMaxima(coinciden),
    anos,
  };
}

export interface PuntoEvolucion {
  iso: string;
  etiqueta_calendario: string;
  semana_desde_inicio: number;
  /** Null = semana del tramo sin movimiento. No es cero. */
  kg: number | null;
  acumulado: number;
}

export interface SerieEvolucion {
  cosecha: CosechaIdentidad;
  /** No hay columna abierta/cerrada. No se infiere del calendario. */
  estado: 'no_registrado';
  inicio: string | null;
  corte: string | null;
  semanas_con_dato: number;
  puntos: PuntoEvolucion[];
}

export type EjeEvolucion = 'desde_inicio' | 'calendario';

export interface EvolucionSemanal {
  estado: 'sin_fecha' | 'ok';
  eje: EjeEvolucion;
  mensaje: string;
  series: SerieEvolucion[];
  avance_comun: number | null;
  comparable_totales: false;
  motivo: string;
}

interface IsoSemana {
  year: number;
  week: number;
  clave: string;
}

/** Semana ISO de una fecha YYYY-MM-DD, en UTC para que el resultado no dependa del huso. */
export function semanaIsoDeFecha(fecha: string): IsoSemana | null {
  if (anioDeFechaMovimiento(fecha) == null) return null;
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return {
    year: isoYear,
    week,
    clave: `${isoYear}-W${String(week).padStart(2, '0')}`,
  };
}

function lunesDeSemanaIso(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (week - 1) * 7);
  return monday;
}

function listarSemanas(desde: IsoSemana, hasta: IsoSemana): IsoSemana[] {
  const out: IsoSemana[] = [];
  let cursor = lunesDeSemanaIso(desde.year, desde.week);
  const fin = lunesDeSemanaIso(hasta.year, hasta.week).getTime();
  for (let i = 0; i < 120 && cursor.getTime() <= fin; i += 1) {
    const iso = semanaIsoDeFecha(cursor.toISOString().slice(0, 10));
    if (iso) out.push(iso);
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

function serieDeCosecha(
  cosecha: CosechaIdentidad,
  registros: RegistroProduccionAgregable[],
): SerieEvolucion {
  const propios = registros.filter(
    (r) =>
      r.cosecha_tipo === cosecha.tipo &&
      r.ano === cosecha.ano &&
      semanaIsoDeFecha(r.fecha ?? '') != null,
  );
  if (propios.length === 0) {
    return {
      cosecha,
      estado: 'no_registrado',
      inicio: null,
      corte: null,
      semanas_con_dato: 0,
      puntos: [],
    };
  }

  const porSemana = new Map<string, number>();
  let inicio = propios[0].fecha as string;
  let corte = propios[0].fecha as string;
  for (const r of propios) {
    const fecha = r.fecha as string;
    if (fecha < inicio) inicio = fecha;
    if (fecha > corte) corte = fecha;
    const iso = semanaIsoDeFecha(fecha);
    if (!iso) continue;
    porSemana.set(iso.clave, (porSemana.get(iso.clave) ?? 0) + (Number(r.kg_totales) || 0));
  }

  const desde = semanaIsoDeFecha(inicio);
  const hasta = semanaIsoDeFecha(corte);
  const tramo = desde && hasta ? listarSemanas(desde, hasta) : [];
  let acumulado = 0;
  let conDato = 0;
  const puntos = tramo.map((iso, index) => {
    const kg = porSemana.has(iso.clave) ? (porSemana.get(iso.clave) as number) : null;
    if (kg != null) {
      acumulado += kg;
      conDato += 1;
    }
    return {
      iso: iso.clave,
      etiqueta_calendario: `S${iso.week}`,
      semana_desde_inicio: index + 1,
      kg,
      acumulado,
    };
  });

  return {
    cosecha,
    estado: 'no_registrado',
    inicio,
    corte,
    semanas_con_dato: conDato,
    puntos,
  };
}

/**
 * Serie semanal por campaña. El eje recomendado es la semana desde el inicio
 * de cada una. No agrega semanas posteriores al último movimiento ni escribe
 * cero en un hueco o en el futuro.
 */
export function construirEvolucionSemanal(
  registros: RegistroProduccionAgregable[],
  cosechas: CosechaIdentidad[],
  eje: EjeEvolucion = 'desde_inicio',
): EvolucionSemanal {
  const series = cosechas.map((c) => serieDeCosecha(c, registros));
  const conPuntos = series.filter((s) => s.puntos.length > 0);
  const algunaFecha = registros.some((r) => anioDeFechaMovimiento(r.fecha) != null);

  if (!algunaFecha || conPuntos.length === 0) {
    const sinFechaEnFuente = !algunaFecha;
    return {
      estado: 'sin_fecha',
      eje,
      mensaje: sinFechaEnFuente
        ? eje === 'desde_inicio'
          ? 'La evolución usa la semana desde el inicio de cada campaña. Los registros de producción no tienen fecha de movimiento, así que no hay serie y las semanas futuras quedan en blanco.'
          : 'El eje calendario usa la semana ISO de la fecha del movimiento. Sin esa fecha no hay serie.'
        : 'Las cosechas elegidas no tienen fecha de movimiento. No se dibuja una serie ni se rellena con ceros.',
      series,
      avance_comun: null,
      comparable_totales: false,
      motivo:
        'Sin fecha no se puede alinear el avance. Un total registrado no equivale a una campaña en curso.',
    };
  }

  const largos = conPuntos.map((s) => s.puntos.length);
  const avance = largos.length >= 2 ? Math.min(...largos) : null;
  const distintos = new Set(largos).size > 1 || series.some((s) => s.puntos.length === 0);
  return {
    estado: 'ok',
    eje,
    mensaje:
      eje === 'desde_inicio'
        ? 'Semana 1 es la primera semana con movimiento de esa campaña. El acumulado llega hasta su último movimiento.'
        : 'Eje calendario (semana ISO). Cada campaña empieza en su fecha; las semanas previas quedan en blanco.',
    series,
    avance_comun: avance,
    comparable_totales: false,
    motivo: distintos
      ? `El tramo común llega a la semana ${avance ?? 0} desde el inicio. Después, la campaña más corta queda en blanco y su total no equivale al de una campaña más larga. Abierta o cerrada no está en el registro.`
      : 'Las series cubren el mismo número de semanas desde su inicio. Abierta o cerrada no está en el registro, así que los totales no se presentan como equivalentes.',
  };
}

export type EtapaLote = 'clasificado' | 'despachado';

export interface RegistroEtapaLote {
  ano: number;
  cosecha_tipo: CosechaTipo;
  lote_id: string;
  etapa: EtapaLote;
  kg: number;
  /** YYYY-MM-DD. Corte propio de la etapa. */
  fecha_corte: string;
}

export interface EntradaLoteCosecha {
  cosechaKey: string;
  lote_id: string;
  kg: number | null;
}

export interface EtapaAgregada {
  kg: number | null;
  /** Fechas distintas presentes. Vacío si no hay filas. */
  fechas_corte: string[];
}

export interface ResumenEtapasCosecha {
  cosecha: CosechaIdentidad;
  clasificado: EtapaAgregada;
  despachado: EtapaAgregada;
  diferencia_entrada_clasificacion_kg: number | null;
  diferencia_sin_despacho_kg: number | null;
  lotes_sin_clasificado: number;
  lotes_sin_despachado: number;
}

export interface DetalleEtapaLote {
  cosechaKey: string;
  lote_id: string;
  clasificado_kg: number | null;
  despachado_kg: number | null;
  fecha_clasificado: string | null;
  fecha_despachado: string | null;
  diferencia_entrada_clasificacion_kg: number | null;
  diferencia_sin_despacho_kg: number | null;
}

const MESES_CORTE = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

export function formatoFechaCorte(fecha: string | null | undefined): string | null {
  if (!fecha || anioDeFechaMovimiento(fecha) == null) return null;
  const [, month, day] = fecha.split('-').map(Number);
  return `${day} ${MESES_CORTE[month - 1]} ${fecha.slice(0, 4)}`;
}

export function formatoKgEtapa(valor: number | null): string {
  if (valor == null) return 'Sin dato';
  const redondo = Math.round(valor * 100) / 100;
  const conDecimales = Math.abs(redondo - Math.round(redondo)) > 0.001;
  return `${redondo.toLocaleString('es-CO', {
    minimumFractionDigits: conDecimales ? 2 : 0,
    maximumFractionDigits: 2,
  })} kg`;
}

/**
 * Cambio neto = despachado / entrada − 1.
 * Null si falta un lado o la entrada es 0. No usa el clasificado.
 */
export function cambioNetoPorcentaje(
  despachadoKg: number | null | undefined,
  entradaKg: number | null | undefined,
): number | null {
  if (despachadoKg == null || entradaKg == null || entradaKg === 0) return null;
  if (!Number.isFinite(despachadoKg) || !Number.isFinite(entradaKg)) return null;
  return despachadoKg / entradaKg - 1;
}

/** Porcentaje con un decimal y signo. Ej. 1.932 / 2.057,95 → −6,1 %. */
export function formatoCambioNeto(
  despachadoKg: number | null | undefined,
  entradaKg: number | null | undefined,
): string {
  const ratio = cambioNetoPorcentaje(despachadoKg, entradaKg);
  if (ratio == null) return 'Sin dato';
  const pct = Math.round(ratio * 1000) / 10;
  const texto = Math.abs(pct).toLocaleString('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (pct > 0) return `+${texto} %`;
  if (pct < 0) return `−${texto} %`;
  return `${texto} %`;
}

export const NOTA_CAMBIO_NETO = 'despachado / entrada − 1; cortes distintos';

/** Las dos diferencias se nombran aparte. No se suman entre sí ni con las etapas. */
export function textoDiferenciaEtapas(
  entradaClasificado: number | null,
  clasificadoDespacho: number | null,
): string {
  const partes: string[] = [];
  if (entradaClasificado != null) {
    partes.push(`${formatoKgEtapa(entradaClasificado)} entre entrada y clasificado`);
  }
  if (clasificadoDespacho != null) {
    partes.push(`${formatoKgEtapa(clasificadoDespacho)} entre clasificado y despacho`);
  }
  return partes.length > 0 ? partes.join(' · ') : 'Sin dato';
}

function fechasDe(rows: RegistroEtapaLote[]): string[] {
  return Array.from(new Set(rows.map((r) => r.fecha_corte))).sort();
}

function sumaEtapa(rows: RegistroEtapaLote[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (Number(r.kg) || 0), 0);
}

/**
 * Junta la entrada por lote con las filas de etapa.
 * Una cosecha sin filas queda en null, nunca en cero.
 * Cortes distintos de la misma etapa se conservan todos.
 */
export function construirVistaEtapas(
  etapas: RegistroEtapaLote[],
  cosechas: CosechaIdentidad[],
  entradas: EntradaLoteCosecha[],
): { porCosecha: ResumenEtapasCosecha[]; porLote: DetalleEtapaLote[] } {
  const porCosecha: ResumenEtapasCosecha[] = [];
  const porLote: DetalleEtapaLote[] = [];

  for (const cosecha of cosechas) {
    const deCosecha = etapas.filter(
      (e) => e.ano === cosecha.ano && e.cosecha_tipo === cosecha.tipo,
    );
    const entradasCosecha = entradas.filter((e) => e.cosechaKey === cosecha.key);
    const loteIds = new Set<string>([
      ...entradasCosecha.map((e) => e.lote_id),
      ...deCosecha.map((e) => e.lote_id),
    ]);

    let sumaEntrada: number | null = null;
    let lotesConEntrada = 0;
    let sinClasificado = 0;
    let sinDespachado = 0;

    for (const loteId of loteIds) {
      const entrada = entradasCosecha.find((e) => e.lote_id === loteId)?.kg ?? null;
      const clasRows = deCosecha.filter((e) => e.lote_id === loteId && e.etapa === 'clasificado');
      const despRows = deCosecha.filter((e) => e.lote_id === loteId && e.etapa === 'despachado');
      const clasificado = sumaEtapa(clasRows);
      const despachado = sumaEtapa(despRows);
      if (entrada != null) {
        sumaEntrada = (sumaEntrada ?? 0) + entrada;
        lotesConEntrada += 1;
      }
      if (clasificado == null) sinClasificado += 1;
      if (despachado == null) sinDespachado += 1;
      porLote.push({
        cosechaKey: cosecha.key,
        lote_id: loteId,
        clasificado_kg: clasificado,
        despachado_kg: despachado,
        fecha_clasificado: fechasDe(clasRows)[0] ?? null,
        fecha_despachado: fechasDe(despRows)[0] ?? null,
        diferencia_entrada_clasificacion_kg:
          entrada != null && clasificado != null ? entrada - clasificado : null,
        diferencia_sin_despacho_kg:
          clasificado != null && despachado != null ? clasificado - despachado : null,
      });
    }

    const clasRows = deCosecha.filter((e) => e.etapa === 'clasificado');
    const despRows = deCosecha.filter((e) => e.etapa === 'despachado');
    const clasificadoKg = sumaEtapa(clasRows);
    const despachadoKg = sumaEtapa(despRows);
    porCosecha.push({
      cosecha,
      clasificado: { kg: clasificadoKg, fechas_corte: fechasDe(clasRows) },
      despachado: { kg: despachadoKg, fechas_corte: fechasDe(despRows) },
      diferencia_entrada_clasificacion_kg:
        sumaEntrada != null && clasificadoKg != null && lotesConEntrada > 0
          ? sumaEntrada - clasificadoKg
          : null,
      diferencia_sin_despacho_kg:
        clasificadoKg != null && despachadoKg != null ? clasificadoKg - despachadoKg : null,
      lotes_sin_clasificado: sinClasificado,
      lotes_sin_despachado: sinDespachado,
    });
  }

  return { porCosecha, porLote };
}

export interface ConciliacionEtapas {
  entrada_kg: number | null;
  clasificado_kg: number | null;
  despachado_kg: number | null;
  diferencia_entrada_clasificacion_kg: number | null;
  diferencia_sin_despacho_kg: number | null;
  es_merma: false;
  nota: string;
}

/**
 * Presenta las tres etapas sin sumarlas y sin inventar la que falta.
 * La diferencia solo existe cuando los dos lados existen.
 */
export function conciliarEtapas(
  entradaKg: number | null,
  clasificadoKg: number | null,
  despachadoKg: number | null,
): ConciliacionEtapas {
  const difClas =
    entradaKg != null && clasificadoKg != null ? entradaKg - clasificadoKg : null;
  const difDesp =
    clasificadoKg != null && despachadoKg != null ? clasificadoKg - despachadoKg : null;
  const faltan: string[] = [];
  if (clasificadoKg == null) faltan.push('clasificación');
  if (despachadoKg == null) faltan.push('despacho');
  const base =
    faltan.length > 0
      ? `Diferencia no calculable: falta ${faltan.join(' y ')}. Lo que falta queda en blanco y no es merma.`
      : 'Diferencia por revisar entre etapas. Una diferencia no es necesariamente merma.';
  const nota =
    clasificadoKg != null
      ? `${base} El clasificado son canastas × 20 kg.`
      : base;
  return {
    entrada_kg: entradaKg,
    clasificado_kg: clasificadoKg,
    despachado_kg: despachadoKg,
    diferencia_entrada_clasificacion_kg: difClas,
    diferencia_sin_despacho_kg: difDesp,
    es_merma: false,
    nota,
  };
}

/**
 * Límites verificados contra el esquema y una lectura de producción (2026-11-09).
 * La UI los muestra; no los rellena con cifras de ejemplo.
 */
export const GAPS_PRODUCCION_ANALISIS = {
  fecha_movimiento:
    'produccion no tiene fecha de movimiento. El año del filtro sale de la fecha cuando existe; sin ella no recorta kilos ni esconde la cosecha. produccion.ano es la identidad de campaña.',
  entrada_semanal:
    'No hay serie semanal en produccion. La tabla cosechas tiene fecha, pero no identidad de campaña y no tiene filas: no se le asigna una cosecha por la fecha.',
  clasificacion_detalle:
    'La calidad disponible es kg_exportacion y kg_nacional, opcionales. No hay calibres. Lo no clasificado se muestra aparte, con el denominador a la vista.',
  despachos:
    'No hay despachos ni clasificación por línea ligados a produccion. La diferencia que falta no se llama merma.',
  produccion_proxy:
    'Producción = kg_totales de produccion. No se suman clasificación ni despacho.',
  principal_2027:
    'Principal 2027 no tiene filas en produccion. Aparece en el catálogo cuando exista un registro, sin cambiar una lista fija.',
} as const;
