// ARCHIVO: types/hato.ts
// DESCRIPCIÓN: Formas de fila (Supabase) del módulo Hato Lechero. Espejo
// 1:1 de las columnas creadas en las migraciones 053-062
// (docs/plan_hato_lechero_module.md §7.1) -- NO redefine tipos de negocio
// que ya viven en `src/utils/calculosHato.ts` (HatoConfig,
// EstadoReproductivo, TipoEventoHato, TipoEstado, etc.), solo los reexporta
// donde hace falta para que los componentes tengan un único punto de import.
//
// Secciones: fichas/chequeos/eventos (S4) y producción (S5 — pesaje
// semanal + quincenal). Otras sesiones (S6, S10) añaden aquí sus propios
// tipos según lo necesiten.

import type { TipoEventoHato, CriaDestino, TipoEstado } from '@/utils/calculosHato';

export type { TipoEventoHato, CriaDestino, TipoEstado };

export type EtapaHato = 'ternera' | 'novilla' | 'vaca' | 'toro';
export type EstadoAnimalHato = 'activa' | 'vendida' | 'muerta' | 'descartada';
export type SexoHato = 'hembra' | 'macho';
export type ConfianzaFecha = 'exacta' | 'aproximada' | 'desconocida';
export type ConfianzaIdentidad = 'alta' | 'media' | 'baja';
export type TipoServicioHato = 'monta' | 'inseminacion';
export type OrigenAnimalHato = 'nacimiento' | 'compra' | 'importacion_historica';

/** `hato_animales` (migración 053). */
export interface HatoAnimalRow {
  id: string;
  numero: number | null;
  nombre: string | null;
  sexo: SexoHato;
  etapa: EtapaHato;
  raza: string | null;
  estado: EstadoAnimalHato;
  fecha_estado: string | null;
  fecha_nacimiento: string | null;
  fecha_nacimiento_confianza: ConfianzaFecha;
  madre_id: string | null;
  padre_toro_id: string | null;
  padre_id: string | null;
  finca_id: string | null;
  origen: OrigenAnimalHato | null;
  confianza: ConfianzaIdentidad;
  notas: string | null;
  created_at: string;
}

/** `hato_toros` (migración 053, catálogo V12). */
export interface HatoToroRow {
  id: string;
  nombre: string;
  tipo: TipoServicioHato | null;
  raza: string | null;
  activo: boolean;
}

/** `hato_eventos` (migración 053) -- capa append-only, fuente de verdad
 * del ciclo reproductivo/de vida (A3/V7). */
export interface HatoEventoRow {
  id: string;
  animal_id: string;
  tipo: TipoEventoHato;
  fecha: string;
  fecha_confianza: ConfianzaFecha;
  toro_id: string | null;
  tipo_servicio: TipoServicioHato | null;
  cria_id: string | null;
  cria_destino: CriaDestino | null;
  sx_raw: string | null;
  datos: Record<string, unknown> | null;
  fuente: 'web' | 'telegram' | 'importacion' | 'alerta' | 'chequeo' | null;
  created_at: string;
}

/** `hato_chequeos` (migración 053) -- cabecera de ronda. */
export interface HatoChequeoRow {
  id: string;
  fecha: string;
  veterinario: string | null;
  estado: 'borrador' | 'cerrado';
  fuente: 'web' | 'importacion';
  sheet_ref: string | null;
  created_at: string;
}

/** `hato_chequeo_vacas` (migración 053 + `estado` de 062) -- una fila por
 * vaca por chequeo. Capa cruda (`*_raw`, texto verbatim de la planilla,
 * nunca se descarta un valor no interpretable) + capa normalizada
 * (nullable). Consumida por `useHatoAnimal.ts` (historial de la ficha) y
 * `useHatoChequeoDetalle.ts` (detalle de chequeo, §5 del Figma spec) --
 * algunas columnas (`sx_raw`, `tp_raw`, `ultima_cria_raw`) NO tienen
 * contraparte normalizada (nunca la tendrán: `sx_raw` se descompone en
 * eventos vía `descomponerSX`, `tp_raw` es una fórmula congelada que el
 * motor nunca lee -- ver nota "Pure engine" en CLAUDE.md), así que esas
 * celdas siempre muestran el dato crudo. */
export interface HatoChequeoVacaRow {
  id: string;
  chequeo_id: string;
  animal_id: string;
  // Capa cruda
  pl_raw: string | null;
  np_raw: string | null;
  ultima_cria_raw: string | null;
  sx_raw: string | null;
  fecha_servicio_raw: string | null;
  toro_raw: string | null;
  tp_raw: string | null;
  estado_raw: string | null;
  secar_raw: string | null;
  pp_raw: string | null;
  ttto_raw: string | null;
  // Capa normalizada
  pl: number | null;
  num_partos: number | null;
  fecha_servicio: string | null;
  toro: string | null;
  tipo_servicio: TipoServicioHato | null;
  meses_prenez: number | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  estado: TipoEstado | null;
  created_at: string;
}

/** Fila de `v_hato_estado_actual` (migración 056, extendida por 062) tal
 * como llega de Supabase (snake_case) -- ver `EstadoActualHatoRow` en
 * calculosHato.ts para el subconjunto que el motor puro consume. Esta forma
 * agrega `animal_id`/`numero`/`nombre`, que la vista sí expone pero el motor
 * no necesita. */
export interface EstadoActualHatoViewRow {
  animal_id: string;
  numero: number | null;
  nombre: string | null;
  etapa: EtapaHato;
  raza: string | null;
  estado: EstadoAnimalHato;
  ultimo_chequeo_vaca_id: string | null;
  ultimo_chequeo_fecha: string | null;
  pl: number | null;
  meses_prenez: number | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  ultimo_servicio_fecha: string | null;
  ultimo_servicio_toro_id: string | null;
  ultimo_tipo_servicio: TipoServicioHato | null;
  ultimo_parto_fecha: string | null;
  num_partos: number;
  ultimo_secado_real_fecha: string | null;
  ultima_confirmacion_prenez_fecha: string | null;
  ultimo_evento_fecha: string | null;
  ultimo_estado_chequeo: TipoEstado | null;
}

// ============================================================================
// Producción (S5 — V2/V3/V4)
// ============================================================================

/** Vaca activa candidata a la grilla de pesaje semanal (D1/V2). Solo el
 * subconjunto de `hato_animales` que necesita esa grilla. */
export interface HatoVacaActiva {
  id: string;
  numero: number | null;
  nombre: string | null;
}

/** Fila de `hato_pesajes_leche` (migración 054, corregida por 061:
 * `litros_total` es el dato canónico -- una sola lectura por vaca por
 * jornada de pesaje, am+pm ya sumados). Ausencia de fila = "no pesada",
 * nunca 0 (regla D del plan §6). */
export interface HatoPesajeLeche {
  id: string;
  animal_id: string;
  fecha: string;
  litros_total: number;
  litros_am: number | null;
  litros_pm: number | null;
  fuente: string | null;
}

/** Fila de `hato_produccion_quincenal` (migración 054): litros al camión
 * por quincena (V3/D2) — dato distinto y sin atribución cruzada con el
 * pesaje semanal por vaca (decisión del dueño, segunda ronda 2026-07-22:
 * "litros al camión mide producción del hato (venta); el pesaje por vaca
 * mide productividad individual"). */
export interface HatoProduccionQuincenal {
  id: string;
  anio: number;
  mes: number;
  quincena: 1 | 2;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  litros_total: number;
  litros_pomar_confirmado: number | null;
  num_vacas_ordeno: number | null;
  notas: string | null;
  fuente: string | null;
}

/** Payload editable del formulario de producción quincenal — subconjunto
 * de `HatoProduccionQuincenal` sin campos derivados/de sistema (`id`,
 * `fuente`). */
export interface ProduccionQuincenalFormData {
  anio: number;
  mes: number;
  quincena: 1 | 2;
  litros_total: number | undefined;
  litros_pomar_confirmado: number | undefined;
  num_vacas_ordeno: number | undefined;
  notas: string;
}

// ============================================================================
// Pajillas de inseminación (S10 — Épica G, `hato_toros`/`hato_pajillas`/
// `hato_pajillas_uso`, migraciones 053 + 057)
// ============================================================================

/** Fila de `v_hato_pajillas_stock` (migración 057) — una fila por lote de
 * pajillas (`hato_pajillas`), NUNCA agregada por toro: un mismo toro puede
 * tener varios lotes/compras. `cantidad_actual` puede ir a 0 o negativo —
 * la UI advierte, nunca bloquea registrar un uso (G3). */
export interface HatoPajillaStockRow {
  pajilla_id: string;
  toro_id: string;
  cantidad_inicial: number;
  usos: number;
  cantidad_actual: number;
}

/** Fila de `hato_pajillas_uso` (migración 057) — log append-only, `animal_id`
 * es opcional (G2: mejor registrar el uso sin la vaca que no registrarlo). */
export interface HatoPajillaUsoRow {
  id: string;
  pajilla_id: string;
  fecha_uso: string;
  animal_id: string | null;
  created_at: string;
}

/** Animal activo candidato al selector opcional de "vaca servida" (G2) —
 * mismo subconjunto mínimo que `HatoVacaActiva`, pero sin restringir por
 * etapa: una novilla también puede recibir un servicio. */
export interface HatoAnimalActivoPicker {
  id: string;
  numero: number | null;
  nombre: string | null;
}
