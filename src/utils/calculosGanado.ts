// Lógica pura del inventario de ganado (issue #51).
// Sin dependencias de Supabase para que sea testeable desde Vitest.

import type {
  EtapaBucket,
  EtapaProductiva,
  GanMovimiento,
  InventarioPotreroRow,
  KPIsInventarioGanado,
  MovimientoAgrupado,
  MovimientoConContexto,
  NodoFinca,
  NodoLote,
  NodoUbicacion,
  PuntaMovimiento,
  ResumenEtapas,
  VariacionInventario,
} from '@/types/ganado';

const ETAPA_VACIA = (): ResumenEtapas => ({
  terneros: 0,
  levante: 0,
  ceba: 0,
  repele: 0,
  sin_clasificar: 0,
});

/**
 * KPIs del inventario actual. Las hectáreas se cuentan una sola vez por
 * finca (las filas vienen por potrero, varias por finca).
 *
 * `rows` ya viene filtrada a potreros activos de fincas activas (B-δ) — de
 * ahí que `cabezasFueraDeFincaActiva` necesite su propio residual
 * (`rowsFincasInactivas`, alimentado por `fetchInventarioFincasInactivas`,
 * §6.3): no se puede derivar de `rows` porque `rows` ya las excluyó.
 */
export function calcularKPIsInventario(
  rows: InventarioPotreroRow[],
  rowsFincasInactivas: Pick<InventarioPotreroRow, 'finca' | 'novillos' | 'toros'>[] = []
): KPIsInventarioGanado {
  let totalNovillos = 0;
  let totalToros = 0;
  const fincasVistas = new Map<string, number>(); // finca_id -> hectareas
  const ubicaciones = new Map<string, { cabezas: number; fincas: Map<string, number> }>();

  rows.forEach((r) => {
    totalNovillos += r.novillos;
    totalToros += r.toros;
    fincasVistas.set(r.finca_id, r.hectareas);

    const key = r.ubicacion || 'Sin ubicación';
    if (!ubicaciones.has(key)) {
      ubicaciones.set(key, { cabezas: 0, fincas: new Map() });
    }
    const u = ubicaciones.get(key)!;
    u.cabezas += r.novillos + r.toros;
    u.fincas.set(r.finca_id, r.hectareas);
  });

  const hectareasTotales = Array.from(fincasVistas.values()).reduce((s, h) => s + h, 0);
  const totalCabezas = totalNovillos + totalToros;

  const sinEtapa = rows.filter((r) => r.etapa == null);

  return {
    totalCabezas,
    totalNovillos,
    totalToros,
    hectareasTotales,
    cabezasPorHa: hectareasTotales > 0 ? totalCabezas / hectareasTotales : null,
    porUbicacion: Array.from(ubicaciones.entries())
      .map(([ubicacion, u]) => {
        const ha = Array.from(u.fincas.values()).reduce((s, h) => s + h, 0);
        return {
          ubicacion,
          cabezas: u.cabezas,
          hectareas: ha,
          cabezasPorHa: ha > 0 ? u.cabezas / ha : null,
        };
      })
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, 'es')),
    porEtapa: resumirEtapas(rows),
    potrerosSinEtapa: {
      potreros: sinEtapa.length,
      cabezas: sinEtapa.reduce((s, r) => s + r.novillos + r.toros, 0),
    },
    cabezasFueraDeFincaActiva: cabezasFueraDeFincaActiva(rowsFincasInactivas).cabezas,
  };
}

/**
 * Cabezas/ha de una finca: total de cabezas de sus potreros / hectáreas.
 */
export function cabezasPorHaFinca(rows: InventarioPotreroRow[], fincaId: string): number | null {
  const deFinca = rows.filter((r) => r.finca_id === fincaId);
  if (deFinca.length === 0) return null;
  const cabezas = deFinca.reduce((s, r) => s + r.novillos + r.toros, 0);
  const ha = deFinca[0].hectareas;
  return ha > 0 ? cabezas / ha : null;
}

/**
 * Los únicos tipos que representan un cambio REAL del hato de ceba: un animal
 * que llegó a la empresa o que se fue. Todo lo demás mueve el número sin que
 * haya entrado o salido un animal, y por eso no cuenta acá.
 *
 * - `traslado_*` es interno entre potreros: no cruzó una portera, y contarlo
 *   infla los dos lados del KPI a la vez.
 * - `ajuste` es corrección de datos, no biología. Contarlo hacía que el KPI
 *   dijera "+214" en agosto de 2026 solo porque la carga inicial (+238) y el
 *   conteo físico de Emiliano cayeron dentro de la ventana de 30 días. El
 *   hato no creció 214 cabezas: creció el registro.
 *
 * Ojo — esto es SOLO ganado de ceba (`gan_*`). El Hato Lechero es otro
 * negocio y vive en `hato_*`; la única tabla compartida es
 * `fin_transacciones_ganado`, que se filtra por `es_hato = false`.
 */
const TIPOS_CAMBIO_REAL = new Set<GanMovimiento['tipo']>(['compra', 'venta', 'muerte']);

/**
 * Variación del hato en la ventana: cuántas cabezas entraron y salieron de
 * verdad. Ver TIPOS_CAMBIO_REAL para qué cuenta y por qué.
 */
export function calcularVariacion(
  movimientos: Pick<GanMovimiento, 'tipo' | 'estado' | 'fecha' | 'novillos_delta' | 'toros_delta'>[],
  fechaDesde: string
): VariacionInventario {
  let entradas = 0;
  let salidas = 0;
  movimientos.forEach((m) => {
    if (m.estado !== 'confirmado' || m.fecha < fechaDesde) return;
    if (!TIPOS_CAMBIO_REAL.has(m.tipo)) return;
    const delta = m.novillos_delta + m.toros_delta;
    if (delta > 0) entradas += delta;
    else salidas += -delta;
  });
  return { entradas, salidas, neto: entradas - salidas };
}

// ---------------------------------------------------------------------------
// Reparto de cabezas entre varios potreros. Una compra/venta rara vez cae en
// un solo potrero: el lote llega repartido y sale repartido. Cada fila es un
// potrero con su propio split novillos/toros; el total es lo que tiene que
// cerrar contra la transacción de finanzas.
// ---------------------------------------------------------------------------

export interface RepartoFila {
  potrero_id: string;
  novillos: number;
  toros: number;
}

/** Filas que aportan cabezas — las vacías se ignoran, no son un error. */
export function filasConCabezas(filas: RepartoFila[]): RepartoFila[] {
  return filas.filter((f) => f.novillos + f.toros > 0);
}

export function totalCabezasReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.novillos + f.toros, 0);
}

export function totalNovillosReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.novillos, 0);
}

export function totalTorosReparto(filas: RepartoFila[]): number {
  return filas.reduce((s, f) => s + f.toros, 0);
}

/**
 * Validación común a cualquier reparto: enteros no negativos, potrero
 * seleccionado en toda fila con cabezas, sin potreros repetidos y al menos
 * una fila con cabezas. No mira totales — eso lo hace cada validador.
 */
function validarFilasReparto(filas: RepartoFila[], etiqueta: string): string | null {
  const conCabezas = filasConCabezas(filas);
  if (conCabezas.length === 0) return `Ingresa al menos una cabeza en ${etiqueta}`;
  for (const f of filas) {
    if (!Number.isInteger(f.novillos) || !Number.isInteger(f.toros) || f.novillos < 0 || f.toros < 0) {
      return 'Novillos y toros deben ser enteros no negativos';
    }
  }
  if (conCabezas.some((f) => !f.potrero_id)) {
    return `Selecciona el potrero de cada fila con cabezas en ${etiqueta}`;
  }
  const ids = conCabezas.map((f) => f.potrero_id);
  if (new Set(ids).size !== ids.length) return `Hay un potrero repetido en ${etiqueta}`;
  return null;
}

/**
 * Valida el reparto al confirmar un movimiento pendiente de compra/venta.
 * El total debe igualar exactamente las cabezas de la transacción original.
 */
export function validarRepartoConfirmacion(
  filas: RepartoFila[],
  cabezasTransaccion: number
): string | null {
  const base = validarFilasReparto(filas, 'el reparto');
  if (base) return base;
  const total = totalCabezasReparto(filasConCabezas(filas));
  if (total !== cabezasTransaccion) {
    return `La suma debe ser ${cabezasTransaccion} cabezas (hay ${total})`;
  }
  return null;
}

/**
 * Valida que cada potrero de origen tenga las cabezas que se le quieren
 * sacar. El CHECK de gan_inventario es la red de seguridad real; esto
 * evita que el usuario descubra el problema como un error de base.
 */
export function validarExistencias(
  filas: RepartoFila[],
  inventarioPorPotrero: Record<string, { novillos: number; toros: number }>,
  nombrePotrero: (potreroId: string) => string
): string | null {
  for (const f of filasConCabezas(filas)) {
    const inv = inventarioPorPotrero[f.potrero_id] || { novillos: 0, toros: 0 };
    if (f.novillos > inv.novillos) {
      return `${nombrePotrero(f.potrero_id)} tiene ${inv.novillos} novillos y estás sacando ${f.novillos}`;
    }
    if (f.toros > inv.toros) {
      return `${nombrePotrero(f.potrero_id)} tiene ${inv.toros} toros y estás sacando ${f.toros}`;
    }
  }
  return null;
}

export interface TrasladoMultiParams {
  fecha: string;
  origenes: RepartoFila[];
  destinos: RepartoFila[];
  pesoPromedioKg?: number | null;
  notas?: string | null;
}

/**
 * Valida un traslado repartido: los totales de novillos y de toros deben
 * coincidir por separado entre ambos lados (no se puede sacar novillos y
 * meter toros), y un mismo potrero no puede estar en los dos lados.
 */
export function validarTrasladoMulti(params: TrasladoMultiParams): string | null {
  const errorOrigen = validarFilasReparto(params.origenes, 'el origen');
  if (errorOrigen) return errorOrigen;
  const errorDestino = validarFilasReparto(params.destinos, 'el destino');
  if (errorDestino) return errorDestino;

  const origenes = filasConCabezas(params.origenes);
  const destinos = filasConCabezas(params.destinos);

  const idsOrigen = new Set(origenes.map((f) => f.potrero_id));
  if (destinos.some((f) => idsOrigen.has(f.potrero_id))) {
    return 'Un mismo potrero no puede ser origen y destino del traslado';
  }

  const novillosOrigen = totalNovillosReparto(origenes);
  const novillosDestino = totalNovillosReparto(destinos);
  const torosOrigen = totalTorosReparto(origenes);
  const torosDestino = totalTorosReparto(destinos);

  if (novillosOrigen !== novillosDestino) {
    return `Salen ${novillosOrigen} novillos y entran ${novillosDestino}`;
  }
  if (torosOrigen !== torosDestino) {
    return `Salen ${torosOrigen} toros y entran ${torosDestino}`;
  }
  return null;
}

// Las filas del traslado se envían tal cual al RPC
// fn_ganado_registrar_traslado_multi (migración 097), que construye ahí las
// N salidas y las M entradas en una sola transacción. La construcción vive
// solo en el RPC para no tener dos implementaciones del mismo reparto.

/**
 * Cabezas absolutas de un movimiento pendiente (el trigger precarga el
 * total con signo en novillos_delta).
 */
export function cabezasDePendiente(m: Pick<GanMovimiento, 'novillos_delta' | 'toros_delta'>): number {
  return Math.abs(m.novillos_delta + m.toros_delta);
}

export interface AjusteMasivoFila {
  potrero_id: string;
  novillosActual: number;
  torosActual: number;
  novillosNuevo: number;
  torosNuevo: number;
}

/**
 * Genera movimientos de tipo `ajuste` solo para las filas que cambiaron.
 *
 * `grupoId` es INYECTADO, nunca generado adentro — la función tiene que
 * seguir siendo pura y determinista. Es el cliente (`useGanadoInventario`)
 * el que construye estas filas, así que es el cliente quien estampa el
 * `grupo_id` compartido que las agrupa como un solo "conteo físico"
 * desplegable (§3.3/§6.3 del plan) — a diferencia del traslado, cuyo
 * `grupo_id` lo genera el RPC porque es el RPC quien construye esas filas.
 */
export function construirAjustesMasivos(
  filas: AjusteMasivoFila[],
  fecha: string,
  nota: string,
  grupoId: string
): {
  tipo: 'ajuste';
  fecha: string;
  potrero_destino_id: string;
  novillos_delta: number;
  toros_delta: number;
  notas: string;
  grupo_id: string;
}[] {
  return filas
    .filter((f) => f.novillosNuevo !== f.novillosActual || f.torosNuevo !== f.torosActual)
    .map((f) => ({
      tipo: 'ajuste' as const,
      fecha,
      potrero_destino_id: f.potrero_id,
      novillos_delta: f.novillosNuevo - f.novillosActual,
      toros_delta: f.torosNuevo - f.torosActual,
      notas: nota,
      grupo_id: grupoId,
    }));
}

// ---------------------------------------------------------------------------
// Carga de inventario inicial por finca: las cabezas entran como `ajuste`
// al potrero "General" de cada finca (creado automáticamente si no existe).
// ---------------------------------------------------------------------------

export interface CargaInicialFila {
  finca_id: string;
  novillos: number;
  toros: number;
}

/**
 * Valida la carga inicial: nota obligatoria, enteros no negativos y al
 * menos una finca con cabezas.
 */
export function validarCargaInicial(filas: CargaInicialFila[], nota: string): string | null {
  if (!nota.trim()) return 'La nota de la carga inicial es obligatoria';
  for (const f of filas) {
    if (!Number.isInteger(f.novillos) || !Number.isInteger(f.toros) || f.novillos < 0 || f.toros < 0) {
      return 'Novillos y toros deben ser enteros no negativos';
    }
  }
  if (!filas.some((f) => f.novillos > 0 || f.toros > 0)) {
    return 'Ingresa al menos una cabeza en alguna finca';
  }
  return null;
}

/**
 * Convierte las filas por finca en movimientos `ajuste` confirmados sobre
 * el potrero asignado a cada finca (mapa finca_id → potrero_id). Las
 * fincas en 0 se omiten. `grupoId` inyectado, mismo criterio que
 * `construirAjustesMasivos`.
 */
export function construirMovimientosCargaInicial(
  filas: CargaInicialFila[],
  potreroPorFinca: Record<string, string>,
  fecha: string,
  nota: string,
  grupoId: string
): {
  tipo: 'ajuste';
  estado: 'confirmado';
  fecha: string;
  potrero_destino_id: string;
  novillos_delta: number;
  toros_delta: number;
  notas: string;
  grupo_id: string;
}[] {
  return filas
    .filter((f) => (f.novillos > 0 || f.toros > 0) && potreroPorFinca[f.finca_id])
    .map((f) => ({
      tipo: 'ajuste' as const,
      estado: 'confirmado' as const,
      fecha,
      potrero_destino_id: potreroPorFinca[f.finca_id],
      novillos_delta: f.novillos,
      toros_delta: f.toros,
      notas: nota,
      grupo_id: grupoId,
    }));
}

// ---------------------------------------------------------------------------
// Lote y etapa (§6.2 del plan). `derivarLoteEtapaDeNombre` sugiere lote y
// etapa a partir del nombre del potrero — nunca conoce las excepciones del
// dueño (p.ej. "Peña Blanca" pertenece al lote Carrizal): esas viven en el
// Apéndice A de la migración 099 y en la revisión humana de la UI (§6.7).
// ---------------------------------------------------------------------------

const ETAPAS_VALIDAS: readonly EtapaProductiva[] = ['terneros', 'levante', 'ceba', 'repele'];

/** Pliega acentos y pasa a minúsculas — SOLO para comparar, nunca para mostrar. */
function normalizarToken(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function comoEtapa(token: string): EtapaProductiva | null {
  const normalizado = normalizarToken(token);
  return (ETAPAS_VALIDAS as readonly string[]).includes(normalizado) ? (normalizado as EtapaProductiva) : null;
}

/**
 * Sugiere `{ lote, etapa }` a partir del nombre de un potrero, siguiendo el
 * patrón `<Lote> <Etapa>` / `<Etapa> <Lote>` que ya usa la finca. El `lote`
 * devuelto conserva el casing y los acentos originales — el plegado es solo
 * para reconocer la palabra de etapa.
 *
 * No conoce ninguna excepción del dueño (p.ej. "Peña Blanca" → lote
 * Carrizal): esas se aplican encima, en el Apéndice A de la 099 y en la UI.
 */
export function derivarLoteEtapaDeNombre(nombre: string): { lote: string | null; etapa: EtapaProductiva | null } {
  const tokens = nombre.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { lote: null, etapa: null };

  if (tokens.length === 1) {
    const etapaUnica = comoEtapa(tokens[0]);
    return etapaUnica ? { lote: null, etapa: etapaUnica } : { lote: tokens[0], etapa: null };
  }

  const etapaFinal = comoEtapa(tokens[tokens.length - 1]);
  if (etapaFinal) {
    return { lote: tokens.slice(0, -1).join(' '), etapa: etapaFinal };
  }

  const etapaInicial = comoEtapa(tokens[0]);
  if (etapaInicial) {
    return { lote: tokens.slice(1).join(' '), etapa: etapaInicial };
  }

  return { lote: tokens.join(' '), etapa: null };
}

/**
 * Resume cabezas por bucket de etapa. Σ buckets = total SIEMPRE — los NULL
 * van a `sin_clasificar`, nunca se reparten ni se infieren (A-2 del brief).
 */
export function resumirEtapas(rows: Pick<InventarioPotreroRow, 'etapa' | 'novillos' | 'toros'>[]): ResumenEtapas {
  const resumen = ETAPA_VACIA();
  rows.forEach((r) => {
    const bucket: EtapaBucket = r.etapa ?? 'sin_clasificar';
    resumen[bucket] += r.novillos + r.toros;
  });
  return resumen;
}

export interface FiltrosArbolInventario {
  fincaId?: string;
  /** `null` explícito = filtrar solo los potreros "Sin lote". */
  loteId?: string | null;
  etapa?: EtapaBucket;
}

/**
 * Árbol ubicación → finca → lote → potrero con totales por nivel (A-1).
 * Cada finca presente en `rows` aparece aunque tenga 0 cabezas — `rows` ya
 * trae todos los potreros activos de fincas activas (incluidos los de 0),
 * así que no hace falta una lista de fincas aparte. Los potreros sin lote
 * caen en un nodo `{ lote_id: null, lote: 'Sin lote' }` al final de su
 * finca. `cabezasPorHa` solo se calcula en finca y ubicación (decisión 7
 * del CPO); las hectáreas se cuentan una sola vez por finca.
 */
export function construirArbolInventario(
  rows: InventarioPotreroRow[],
  filtros?: FiltrosArbolInventario
): NodoUbicacion[] {
  const filtradas = rows.filter((r) => {
    if (filtros?.fincaId && r.finca_id !== filtros.fincaId) return false;
    if (filtros?.loteId !== undefined && r.lote_id !== filtros.loteId) return false;
    if (filtros?.etapa && (r.etapa ?? 'sin_clasificar') !== filtros.etapa) return false;
    return true;
  });

  interface AccUbicacion {
    ubicacion_id: string | null;
    ubicacion: string;
    fincas: Map<string, AccFinca>;
  }
  interface AccFinca {
    finca: string;
    hectareas: number;
    lotes: Map<string, NodoLote>;
  }

  const ubicaciones = new Map<string, AccUbicacion>();

  filtradas.forEach((r) => {
    const ubicKey = r.ubicacion_id ?? r.ubicacion;
    if (!ubicaciones.has(ubicKey)) {
      ubicaciones.set(ubicKey, { ubicacion_id: r.ubicacion_id, ubicacion: r.ubicacion, fincas: new Map() });
    }
    const u = ubicaciones.get(ubicKey)!;
    if (!u.fincas.has(r.finca_id)) {
      u.fincas.set(r.finca_id, { finca: r.finca, hectareas: r.hectareas, lotes: new Map() });
    }
    const f = u.fincas.get(r.finca_id)!;
    const loteKey = r.lote_id ?? '__sin_lote__';
    if (!f.lotes.has(loteKey)) {
      f.lotes.set(loteKey, {
        lote_id: r.lote_id,
        lote: r.lote ?? 'Sin lote',
        cabezas: 0,
        novillos: 0,
        toros: 0,
        porEtapa: ETAPA_VACIA(),
        potreros: [],
      });
    }
    f.lotes.get(loteKey)!.potreros.push({
      potrero_id: r.potrero_id,
      potrero: r.potrero,
      lote: r.lote,
      etapa: r.etapa,
      novillos: r.novillos,
      toros: r.toros,
      cabezas: r.novillos + r.toros,
      ultimoPesoKg: r.ultimo_peso_kg,
      ultimoPesoFecha: r.ultimo_peso_fecha,
    });
  });

  const ordenarSinLoteAlFinal = (a: { lote_id: string | null }, b: { lote_id: string | null }, nombreA: string, nombreB: string) => {
    if (a.lote_id === null && b.lote_id !== null) return 1;
    if (b.lote_id === null && a.lote_id !== null) return -1;
    return nombreA.localeCompare(nombreB, 'es');
  };

  const nodosUbicacion: NodoUbicacion[] = Array.from(ubicaciones.values())
    .map((u): NodoUbicacion => {
      const nodosFinca: NodoFinca[] = Array.from(u.fincas.entries())
        .map(([fincaId, f]): NodoFinca => {
          const lotes = Array.from(f.lotes.values())
            .map((l): NodoLote => {
              const novillos = l.potreros.reduce((s, p) => s + p.novillos, 0);
              const toros = l.potreros.reduce((s, p) => s + p.toros, 0);
              return {
                ...l,
                novillos,
                toros,
                cabezas: novillos + toros,
                porEtapa: resumirEtapas(l.potreros),
              };
            })
            .sort((a, b) => ordenarSinLoteAlFinal(a, b, a.lote, b.lote));

          const novillos = lotes.reduce((s, l) => s + l.novillos, 0);
          const toros = lotes.reduce((s, l) => s + l.toros, 0);
          const cabezas = novillos + toros;
          const potrerosFinca = lotes.flatMap((l) => l.potreros);
          return {
            finca_id: fincaId,
            finca: f.finca,
            hectareas: f.hectareas,
            cabezas,
            novillos,
            toros,
            cabezasPorHa: f.hectareas > 0 ? cabezas / f.hectareas : null,
            porEtapa: resumirEtapas(potrerosFinca),
            lotes,
          };
        })
        .sort((a, b) => a.finca.localeCompare(b.finca, 'es'));

      const cabezas = nodosFinca.reduce((s, f) => s + f.cabezas, 0);
      const hectareas = nodosFinca.reduce((s, f) => s + f.hectareas, 0);
      const potrerosUbicacion = nodosFinca.flatMap((f) => f.lotes.flatMap((l) => l.potreros));
      return {
        ubicacion_id: u.ubicacion_id,
        ubicacion: u.ubicacion,
        cabezas,
        hectareas,
        cabezasPorHa: hectareas > 0 ? cabezas / hectareas : null,
        porEtapa: resumirEtapas(potrerosUbicacion),
        fincas: nodosFinca,
      };
    })
    .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, 'es'));

  return nodosUbicacion;
}

/**
 * Cabezas que viven en potreros de finca INACTIVA (§7.1). `rows` es el
 * residual de `fetchInventarioFincasInactivas` — ya viene restringido a
 * potreros de `finca.activa = false`, así que esta función solo suma y
 * agrupa, no vuelve a filtrar.
 */
export function cabezasFueraDeFincaActiva(
  rows: Pick<InventarioPotreroRow, 'finca' | 'novillos' | 'toros'>[]
): { cabezas: number; fincas: { finca: string; cabezas: number }[] } {
  const porFinca = new Map<string, number>();
  rows.forEach((r) => {
    porFinca.set(r.finca, (porFinca.get(r.finca) || 0) + r.novillos + r.toros);
  });
  return {
    cabezas: rows.reduce((s, r) => s + r.novillos + r.toros, 0),
    fincas: Array.from(porFinca.entries())
      .map(([finca, cabezas]) => ({ finca, cabezas }))
      .sort((a, b) => b.cabezas - a.cabezas),
  };
}

/**
 * Antigüedad en días de una fecha (B-5). `hoyISO` se INYECTA — la función
 * pura no lee el reloj; el llamador pasa `obtenerFechaHoy()`.
 */
export function antiguedadEnDias(fechaISO: string, hoyISO: string): number {
  const msPorDia = 1000 * 60 * 60 * 24;
  const fecha = new Date(`${fechaISO}T00:00:00`).getTime();
  const hoy = new Date(`${hoyISO}T00:00:00`).getTime();
  return Math.round((hoy - fecha) / msPorDia);
}

// ---------------------------------------------------------------------------
// Saldo del potrero después de cada evento (B-4/R-6) y agrupamiento del log
// (§3.3). El saldo se calcula HACIA ATRÁS desde el snapshot de
// `gan_inventario`, no hacia adelante desde cero: así la última fila de
// cada potrero siempre coincide con lo que muestra Inventario. Si
// Σ deltas ≠ snapshot para un potrero, TODOS sus saldos son `null` — la UI
// renderiza `—`, nunca un saldo aproximado.
// ---------------------------------------------------------------------------

export type MovimientoParaSaldo = Pick<
  GanMovimiento,
  'id' | 'estado' | 'fecha' | 'created_at' | 'potrero_origen_id' | 'potrero_destino_id' | 'novillos_delta' | 'toros_delta'
>;

/**
 * `snapshot`: cabezas actuales por potrero (novillos + toros), tal como las
 * muestra Inventario — `potrero_id -> cabezas`.
 *
 * Devuelve, por potrero, un mapa `movimiento_id -> saldo` (el saldo del
 * potrero INMEDIATAMENTE DESPUÉS de aplicar ese movimiento), o `null` si la
 * historia de ese potrero no cierra contra el snapshot.
 *
 * El resultado NO depende de filtros (R-6): se calcula sobre la historia
 * confirmada completa que trae el hook; el filtrado ocurre después, sobre
 * el arreglo ya anotado.
 */
export function calcularSaldosPorPotrero(
  movimientos: MovimientoParaSaldo[],
  snapshot: Record<string, number>
): Map<string, Map<string, number> | null> {
  const porPotrero = new Map<string, MovimientoParaSaldo[]>();
  movimientos.forEach((m) => {
    if (m.estado !== 'confirmado') return;
    const potreroId = m.potrero_destino_id ?? m.potrero_origen_id;
    if (!potreroId) return;
    if (!porPotrero.has(potreroId)) porPotrero.set(potreroId, []);
    porPotrero.get(potreroId)!.push(m);
  });

  const resultado = new Map<string, Map<string, number> | null>();

  porPotrero.forEach((movs, potreroId) => {
    // Orden determinista: (fecha, created_at, id). Empates de created_at se
    // rompen por id — arbitrario pero estable, no afecta el saldo final.
    const ordenados = [...movs].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    const sumaDeltas = ordenados.reduce((s, m) => s + m.novillos_delta + m.toros_delta, 0);
    const actual = snapshot[potreroId] ?? 0;

    if (sumaDeltas !== actual) {
      resultado.set(potreroId, null);
      return;
    }

    const saldos = new Map<string, number>();
    let saldoRestante = actual;
    for (let i = ordenados.length - 1; i >= 0; i -= 1) {
      saldos.set(ordenados[i].id, saldoRestante);
      saldoRestante -= ordenados[i].novillos_delta + ordenados[i].toros_delta;
    }
    resultado.set(potreroId, saldos);
  });

  return resultado;
}

function cierraPorCategoria(origenes: MovimientoConContexto[], destinos: MovimientoConContexto[]): boolean {
  const suma = (arr: MovimientoConContexto[], campo: 'novillos_delta' | 'toros_delta') =>
    arr.reduce((s, m) => s + Math.abs(m[campo]), 0);
  return suma(origenes, 'novillos_delta') === suma(destinos, 'novillos_delta')
    && suma(origenes, 'toros_delta') === suma(destinos, 'toros_delta');
}

/** Construye la `PuntaMovimiento` de un movimiento a partir del lado que tenga potrero. */
function puntaDeMovimiento(
  m: MovimientoConContexto,
  saldos: Map<string, Map<string, number> | null>
): PuntaMovimiento {
  const esOrigen = m.potrero_origen_id != null;
  const potreroId = (esOrigen ? m.potrero_origen_id : m.potrero_destino_id) ?? '';
  const potrero = (esOrigen ? m.potrero_origen : m.potrero_destino) ?? 'Potrero';
  const finca = (esOrigen ? m.finca_origen : m.finca_destino) ?? 'Sin finca';
  const lote = esOrigen ? m.lote_origen : m.lote_destino;
  const saldoPotrero = potreroId ? saldos.get(potreroId) : undefined;
  return {
    movimiento_id: m.id,
    potrero_id: potreroId,
    potrero,
    lote: lote ?? null,
    finca,
    novillos: Math.abs(m.novillos_delta),
    toros: Math.abs(m.toros_delta),
    saldo: saldoPotrero ? saldoPotrero.get(m.id) ?? null : null,
  };
}

function totalAbsCabezas(movs: MovimientoConContexto[]): number {
  return movs.reduce((s, m) => s + Math.abs(m.novillos_delta) + Math.abs(m.toros_delta), 0);
}

/**
 * Agrupa el log de movimientos según el contrato de §3.3 — es la
 * implementación de R-2 ("un traslado se lee como un evento, no como N+M
 * filas"). Ante CUALQUIER forma inesperada degrada a filas sueltas: nunca
 * inventa un agrupamiento (regla del CPO).
 *
 * El orden de salida no es el de entrada: los eventos (agrupados o sueltos)
 * se devuelven ordenados por fecha descendente — el llamador no necesita
 * volver a ordenar para mostrar "lo más reciente primero".
 */
export function agruparMovimientos(
  movs: MovimientoConContexto[],
  saldos: Map<string, Map<string, number> | null>
): MovimientoAgrupado[] {
  const resultado: MovimientoAgrupado[] = [];
  const usados = new Set<string>();

  // 1. Traslados N→M y conteos físicos, ambos por grupo_id.
  const porGrupo = new Map<string, MovimientoConContexto[]>();
  movs.forEach((m) => {
    if (!m.grupo_id) return;
    if (!porGrupo.has(m.grupo_id)) porGrupo.set(m.grupo_id, []);
    porGrupo.get(m.grupo_id)!.push(m);
  });

  porGrupo.forEach((miembros, grupoId) => {
    const esTraslado = miembros.every((m) => m.tipo === 'traslado_salida' || m.tipo === 'traslado_entrada');
    const esAjuste = miembros.every((m) => m.tipo === 'ajuste');

    if (esTraslado) {
      const origenes = miembros.filter((m) => m.tipo === 'traslado_salida');
      const destinos = miembros.filter((m) => m.tipo === 'traslado_entrada');
      const cierra = origenes.length > 0 && destinos.length > 0 && cierraPorCategoria(origenes, destinos);
      if (!cierra) return; // no cierra o falta un lado → cae como sueltas más abajo

      miembros.forEach((m) => usados.add(m.id));
      resultado.push({
        clase: 'traslado',
        grupo_id: grupoId,
        fecha: miembros[0].fecha,
        origenes: origenes.map((m) => puntaDeMovimiento(m, saldos)),
        destinos: destinos.map((m) => puntaDeMovimiento(m, saldos)),
        cabezas: totalAbsCabezas(destinos),
        notas: miembros[0].notas ?? null,
      });
    } else if (esAjuste && miembros.length >= 2) {
      miembros.forEach((m) => usados.add(m.id));
      const potrerosAfectados = new Set(miembros.map((m) => m.potrero_destino_id ?? m.potrero_origen_id));
      resultado.push({
        clase: 'conteo_fisico',
        grupo_id: grupoId,
        fecha: miembros[0].fecha,
        miembros,
        puntas: miembros.map((m) => puntaDeMovimiento(m, saldos)),
        potrerosAfectados: potrerosAfectados.size,
        deltaNeto: miembros.reduce((s, m) => s + m.novillos_delta + m.toros_delta, 0),
        notas: miembros[0].notas ?? null,
      });
    }
    // grupo_id compartido por tipos mezclados (ni todo-traslado ni todo-ajuste):
    // no se marca ningún miembro como usado → cae como filas sueltas.
  });

  // 2. Compra/venta repartida, por transaccion_ganado_id (NO por grupo_id).
  const porTransaccion = new Map<string, MovimientoConContexto[]>();
  movs.forEach((m) => {
    if (usados.has(m.id)) return;
    if (!m.transaccion_ganado_id) return;
    if (m.tipo !== 'compra' && m.tipo !== 'venta') return;
    if (!porTransaccion.has(m.transaccion_ganado_id)) porTransaccion.set(m.transaccion_ganado_id, []);
    porTransaccion.get(m.transaccion_ganado_id)!.push(m);
  });

  porTransaccion.forEach((miembros, transaccionId) => {
    if (miembros.length < 2) return; // grupo de 1: se emite suelto abajo
    const tipos = new Set(miembros.map((m) => m.tipo));
    if (tipos.size > 1) return; // compra y venta bajo la misma transacción: imposible → sueltas

    miembros.forEach((m) => usados.add(m.id));
    resultado.push({
      clase: 'compra_venta',
      transaccion_ganado_id: transaccionId,
      tipo: miembros[0].tipo as 'compra' | 'venta',
      fecha: miembros[0].fecha,
      puntas: miembros.map((m) => puntaDeMovimiento(m, saldos)),
      cabezas: totalAbsCabezas(miembros),
      valor_total: miembros[0].valor_total ?? null,
      kilos_pagados: miembros[0].kilos_pagados ?? null,
    });
  });

  // 3. Todo lo que no quedó agrupado: filas sueltas, tal cual son.
  movs.forEach((m) => {
    if (usados.has(m.id)) return;
    resultado.push({
      clase: 'simple',
      movimiento: m,
      saldo: puntaDeMovimiento(m, saldos).saldo,
    });
  });

  return resultado.sort((a, b) => {
    const fechaA = a.clase === 'simple' ? a.movimiento.fecha : a.fecha;
    const fechaB = b.clase === 'simple' ? b.movimiento.fecha : b.fecha;
    return fechaA < fechaB ? 1 : fechaA > fechaB ? -1 : 0;
  });
}
