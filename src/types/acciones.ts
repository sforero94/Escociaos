/**
 * Formas de fila persistidas por el motor de acciones recomendadas (bloque 4
 * del Centro de Control) -- `src/sql/migrations/101_acciones_recomendadas.sql`.
 *
 * Estas tablas NO están en `src/types/database.ts` todavía (los tipos
 * generados no se han vuelto a correr desde que se aplicó la 097) -- mismo
 * caso que `hato_config`/`hato_alertas` (`getSupabase() as any` en
 * `src/components/hato/hooks/*`). Este archivo es la forma escrita a mano
 * mientras tanto; si algún día se regeneran los tipos, este archivo se
 * revisa contra ellos, no se borra a ciegas (los nombres de campo en
 * snake_case son intencionales -- son la fila cruda de PostgREST).
 *
 * Fuente de verdad de las columnas: `docs/brief_tecnico_motor_acciones.md`
 * §5.3 (el SQL de la 097).
 */

import type { Hecho, NegocioAccion } from '@/utils/accionesTipos';

/** `acciones_corridas` -- sólo las columnas que la app necesita leer (§5.3:
 *  "la app SÓLO para el chip de procedencia y el estado del motor"). Nunca
 *  se selecciona `paquete`/`salida_cruda` desde el navegador -- son forense. */
export interface FilaAccionCorrida {
  id: string;
  generado_at: string; // ISO
  estado: 'ok' | 'parcial' | 'fallo';
}

/** `acciones_recomendadas` -- una fila por acción publicada. */
export interface FilaAccionRecomendada {
  id: string;
  corrida_id: string;
  negocio: NegocioAccion;
  clave: string;
  origen: string; // 'O1_senal' | 'O2_hueco' | 'O8_revision' -- sin CHECK en SQL a propósito (§5.3)
  visibilidad: 'todos' | 'gerencia';
  orden: number; // 1..3, calculado por `ordenarAcciones` -- la UI nunca reordena
  plantilla: string;
  ranuras: Record<string, { hecho_id: string; campo: string }>;
  hecho_ids: string[];
  /** Copia congelada de los `Hecho` citados -- la evidencia se pinta DESDE
   *  AQUÍ, nunca del texto del modelo (§5.2). */
  hechos_snapshot: Hecho[];
  destino_id: string;
  destino_ruta: string;
  destino_etiqueta: string;
  /** Marcada por el cotejo al pintar (§6.4) -- nunca por el descarte, que
   *  vive en `acciones_silencios`. */
  caducada_at: string | null;
}

/** `acciones_silencios` -- lo que escribe "No es útil" (§5.2/§5.3). */
export interface FilaAccionSilencio {
  clave: string;
  negocio: NegocioAccion;
  descartada_por: string | null;
  descartada_at: string;
  vigente_hasta: string;
  frase_al_descartar: string | null;
  motivo: string | null;
}

/** Vista lista para pintar -- ya renderizada (`renderizarAccion`), ya
 *  cotejada. Lo que consume `AccionCard`. */
export interface AccionParaMostrar {
  id: string;
  clave: string;
  negocio: NegocioAccion;
  frase: string;
  evidencia: string[];
  boton: { etiqueta: string; ruta: string };
}
