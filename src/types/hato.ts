// ARCHIVO: types/hato.ts
// DESCRIPCIÓN: Formas de fila (Supabase) del módulo Hato Lechero (S4,
// frontend). Espejo 1:1 de las columnas creadas en las migraciones
// 053-062 (docs/plan_hato_lechero_module.md §7.1) -- NO redefine tipos de
// negocio que ya viven en `src/utils/calculosHato.ts` (HatoConfig,
// EstadoReproductivo, TipoEventoHato, TipoEstado, etc.), solo los reexporta
// donde hace falta para que los componentes tengan un único punto de import.

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
 * vaca por chequeo, capa normalizada. Las columnas `*_raw` existen en la
 * tabla pero no se listan aquí -- este módulo no las consume todavía (ver
 * limitación documentada en el reporte de S4 sobre el endpoint B0). */
export interface HatoChequeoVacaRow {
  id: string;
  chequeo_id: string;
  animal_id: string;
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
