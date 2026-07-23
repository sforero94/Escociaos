// ARCHIVO: types/hato.ts
// DESCRIPCIÓN: Tipos de dominio del módulo Hato Lechero consumidos por el
// frontend (S5 — Producción: V2/V3/V4, docs/plan_hato_lechero_module.md
// §7.1). Espejo 1:1 de las tablas `hato_animales`, `hato_pesajes_leche` y
// `hato_produccion_quincenal` (migraciones 053/054/061).
//
// Solo cubre lo que necesita `/hato-lechero/produccion`. Otras sesiones
// (S4, S6, S10) añaden aquí sus propios tipos según lo necesiten —
// intencionalmente no se modela el resto del esquema del hato en este
// archivo.

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
