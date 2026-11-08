/**
 * Lógica pura del tablero analítico de Producción (issue #463).
 *
 * Unidad de agrupación = cosecha (`Principal 2027`), nunca el año calendario.
 *
 * - Identidad de cosecha = `{tipo, ano}` → etiqueta "Principal 2027".
 * - Año de movimiento = filtro opcional (cuándo cayó el movimiento). No es el
 *   eje de KPIs, series ni comparación.
 *
 * Sin fecha de movimiento en `produccion`, el filtro de años solo acota qué
 * cosechas se listan (regla finanzas: en Y → Principal Y, Traviesa Y,
 * Principal Y+1). No inventa kilos ni fechas, ni reagrupa por calendario.
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

/**
 * Cosechas que, por regla de producto, pueden tener movimientos en el año
 * calendario Y. Misma familia que `opcionesCosecha` en finanzas.
 */
export function cosechasAsociadasAAnoMovimiento(anoMovimiento: number): CosechaIdentidad[] {
  return [
    identidadFromParts('Principal', anoMovimiento),
    identidadFromParts('Traviesa', anoMovimiento),
    identidadFromParts('Principal', anoMovimiento + 1),
  ];
}

/**
 * Años de movimiento sugeridos a partir de cosechas existentes.
 * Para Principal N incluye N-1 (movimientos previos al año de campaña).
 */
export function derivarAnosMovimiento(
  registros: RegistroCosechaBase[],
): number[] {
  const anos = new Set<number>();
  for (const r of registros) {
    anos.add(r.ano);
    if (r.cosecha_tipo === 'Principal') {
      anos.add(r.ano - 1);
    }
  }
  return Array.from(anos).filter((a) => a >= 2020).sort((a, b) => a - b);
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
 * Cosechas disponibles restringidas a las compatibles con los años de
 * movimiento seleccionados. Si no hay años, devuelve todas.
 */
export function cosechasCompatiblesConAnos(
  disponibles: CosechaIdentidad[],
  anosMovimiento: number[],
): CosechaIdentidad[] {
  if (anosMovimiento.length === 0) return disponibles;
  const permitidas = new Set<string>();
  for (const ano of anosMovimiento) {
    for (const c of cosechasAsociadasAAnoMovimiento(ano)) {
      permitidas.add(c.key);
    }
  }
  return disponibles.filter((c) => permitidas.has(c.key));
}

/**
 * Resuelve la selección efectiva de cosechas (siempre identidades de campaña).
 * - Vista "una": una sola cosecha; si hay varias keys, toma la más reciente.
 * - Vista "varias": N cosechas; si ninguna key, todas las visibles.
 * - `anos_movimiento` solo acota el catálogo visible; no reagrupa resultados.
 * - Selección fuera del acote de año → incompatible (explícito, sin ocultar).
 */
export function resolverSeleccionCosechas(
  disponibles: CosechaIdentidad[],
  filtros: Pick<EstadoFiltroProduccion, 'vista' | 'anos_movimiento' | 'cosecha_keys'>,
): EstadoSeleccionCosecha {
  const visibles = cosechasCompatiblesConAnos(disponibles, filtros.anos_movimiento);

  if (visibles.length === 0) {
    return {
      estado: 'vacio',
      cosechas: [],
      mensaje:
        filtros.anos_movimiento.length > 0
          ? `Ninguna cosecha registrada queda visible con el filtro de año de movimiento ${filtros.anos_movimiento.join(', ')}. Quita el año o elige otra cosecha.`
          : 'No hay cosechas registradas en producción.',
    };
  }

  const seleccionadas = filtros.cosecha_keys
    .map((k) => disponibles.find((c) => c.key === k))
    .filter((c): c is CosechaIdentidad => Boolean(c));

  const interseccion = seleccionadas.filter((c) =>
    visibles.some((x) => x.key === c.key),
  );

  if (seleccionadas.length > 0 && interseccion.length === 0) {
    return {
      estado: 'incompatible',
      cosechas: [],
      sugeridas: visibles,
      mensaje:
        'La cosecha elegida queda fuera del filtro opcional de año de movimiento. El análisis se agrupa por cosecha: ajusta el año o cambia la cosecha.',
    };
  }

  let efectivas = interseccion.length > 0 ? interseccion : visibles;

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
  const arboles = delGrupo.reduce((s, r) => {
    const a = r.arboles_registrados;
    return s + (a != null && a > 0 ? a : 0);
  }, 0);
  const tieneArboles = delGrupo.some(
    (r) => r.arboles_registrados != null && r.arboles_registrados > 0,
  );

  const areaPorLote = new Map<string, number>();
  for (const r of delGrupo) {
    if (r.lote_id && r.area_hectareas != null && r.area_hectareas > 0) {
      areaPorLote.set(r.lote_id, Number(r.area_hectareas));
    }
  }
  const areaTotal = Array.from(areaPorLote.values()).reduce((s, a) => s + a, 0);
  const lotesConArea = areaPorLote.size;
  const lotesConDato = new Set(delGrupo.map((r) => r.lote_id)).size;

  return {
    cosecha,
    produccion_kg: Math.round(produccion_kg),
    kg_por_arbol: tieneArboles ? calcularKgPorArbol(produccion_kg, arboles) : null,
    ton_por_ha: lotesConArea > 0 ? calcularTonPorHa(produccion_kg, areaTotal) : null,
    lotes_con_dato: lotesConDato,
    rendimientos_parciales:
      !tieneArboles || lotesConArea < lotesConDato || lotesConDato === 0,
  };
}

export interface ComparacionLoteCosecha {
  lote_id: string;
  lote_nombre: string;
  /** kg por cosecha key; ausente = sin dato (no cero). */
  por_cosecha: Record<string, number | null>;
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
      for (const c of cosechas) {
        const reg = porLoteCosecha.get(`${lote_id}__${c.key}`);
        if (!reg) {
          por_cosecha[c.key] = null;
          continue;
        }
        por_cosecha[c.key] = valorMetrica(
          metrica,
          Number(reg.kg_totales) || 0,
          reg.arboles_registrados,
          reg.area_hectareas,
        );
      }
      return { lote_id, lote_nombre, por_cosecha };
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

/**
 * Gaps de datos del issue #463 que el schema actual no cubre.
 * Se exponen en UI como estados honestos, no como ceros.
 */
export const GAPS_PRODUCCION_ANALISIS = {
  fecha_movimiento:
    'La tabla produccion no tiene fecha de movimiento; el año de movimiento se asocia por regla de campaña (Principal Y+1 visible en Y), sin inventar fechas diarias.',
  entrada_semanal:
    'No existen registros de entrada por canastilla ni series semanales ISO en el schema. La evolución semanal y el acumulado por semana quedan pendientes de fuente fechada.',
  clasificacion_detalle:
    'Solo hay kg_exportacion / kg_nacional opcionales. No hay categorías de calibre ni comprador por línea.',
  despachos:
    'No hay tabla de despachos. La conciliación entrada/clasificación/despacho no puede calcularse sin inventar relaciones.',
  produccion_proxy:
    'Producción mostrada = kg_totales registrados en produccion (proxy de entrada neta). No se suman etapas como producción adicional.',
} as const;
