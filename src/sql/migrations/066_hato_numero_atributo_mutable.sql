-- =====================================================================
-- 066: Hato Lechero — `numero` deja de ser identidad permanente y pasa a
--      ser un atributo MUTABLE ("chapeta actual").
-- Fecha: 2026-07-23
--
-- Contexto (decisión del dueño, 2026-07-23):
--   Las chapetas duplicadas del histórico NO son errores de digitación:
--   son vacas COMPRADAS que llegaron con una caravana que ya usaba otro
--   animal del hato. Martha va a comprar caravanas nuevas y RENUMERAR el
--   hato completo. Es decir, hoy las chapetas están duplicadas Y además
--   están por cambiar en bloque. La chapeta física resultó ser un atributo
--   mutable, nunca la identidad.
--
--   La identidad del animal SIEMPRE fue `hato_animales.id` (uuid). TODA
--   relación cuelga de `id`, nunca de `numero`: hato_chequeo_vacas.animal_id,
--   hato_eventos.animal_id, madre_id/padre_id, hato_pesajes_leche.animal_id,
--   y la vista v_hato_estado_actual. Renumerar es un UPDATE de un atributo,
--   no un cambio de identidad — no se pierde una sola fila de historia.
--
-- Qué cambia:
--   1. Se ELIMINA el UNIQUE global sobre `numero` (constraint
--      `hato_animales_numero_key`, creado inline por `numero INTEGER UNIQUE`
--      en la migración 053). Ese UNIQUE codificaba el invariante falso
--      "una caravana = un animal para siempre", y rechazaba dos hechos
--      reales: (a) dos animales activos con la misma caravana durante el
--      período provisional previo al retag (ESMERALDA/VITROLA en #162,
--      MONA/MARGARITA en #175 — se cargan con números de trabajo 900-999,
--      ver overridesChapeta.ts), y (b) el reciclaje legítimo de una
--      caravana: un animal vendido/muerto pudo llevar un número que hoy
--      lleva otra vaca.
--
--   2. Se AGREGA el invariante que el sistema sí necesita: dos animales
--      ACTIVOS nunca comparten caravana. Índice único PARCIAL sobre
--      `numero WHERE estado = 'activa'`. Esto mantiene sin ambigüedad el
--      match por `numero` del import recurrente de chequeos (B0,
--      diffChequeo.ts: `Map<number, Animal>` sobre el hato vivo) sin
--      prohibir el reciclaje histórico ni bloquear la carga provisional.
--
--   `estado` es la columna de ciclo de vida (CHECK: activa|vendida|muerta|
--   descartada). Una vaca HORRA (seca) conserva estado='activa' — "seca" es
--   un estado reproductivo DERIVADO (calculosHato.ts), no el `estado` del
--   animal — así que el índice parcial cubre a todo animal vivo, como debe.
--
-- Precedente del índice único parcial: migraciones 044/059
-- (`transaccion_ganado_id`).
--
-- Camino de corrección tras el retag (NO es un re-Load): cuando entren las
-- caravanas nuevas, se renumera con un UPDATE en bloque, en UNA transacción,
-- indexado por `id` (VALUES (:id,:nuevo)...). El índice parcial se valida al
-- final de la sentencia, así que un par transitorio viejo↔nuevo no rompe.
-- NUNCA se corre Load de nuevo sobre datos vivos: load.ts borra
-- origen='importacion_historica' y hato_chequeo_vacas/hato_eventos NO tienen
-- ON DELETE CASCADE (053) — un re-Load con chequeos web ya capturados
-- fallaría por FK o dejaría historia huérfana. Load es SOLO el backfill
-- histórico de una única vez.
--
-- Seguridad de esta migración: `hato_animales` está vacía en producción
-- (Load nunca corrió), así que crear el índice parcial no puede fallar por
-- datos preexistentes. Si en algún entorno la tabla no estuviera vacía,
-- deduplicar los `numero` entre animales activos ANTES de aplicar.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- 1. numero deja de ser UNIQUE global (identidad permanente).
ALTER TABLE hato_animales DROP CONSTRAINT IF EXISTS hato_animales_numero_key;

-- 2. Invariante real: dos animales ACTIVOS nunca comparten caravana.
CREATE UNIQUE INDEX IF NOT EXISTS hato_animales_numero_activa_unique
  ON hato_animales (numero)
  WHERE estado = 'activa' AND numero IS NOT NULL;

COMMENT ON INDEX hato_animales_numero_activa_unique IS
  'numero es "chapeta actual" (atributo mutable, migración 066), no identidad. '
  'La identidad es hato_animales.id. Único solo entre animales activos: permite '
  'reciclar una caravana de un animal vendido/muerto y tolera números de trabajo '
  'provisionales (900-999, overridesChapeta.ts) mientras Martha renumera el hato.';
