-- =============================================================================
-- 075_limpieza_monitoreo_beneficos_y_duplicados.sql
--
-- Dos limpiezas de datos en `monitoreos`, encontradas y verificadas en la
-- corrida de mantenimiento 2026-07-31-dryrun-lunes. Aprobadas por Santiago.
--
-- ESTA MIGRACION BORRA FILAS. Ambas partes guardan copia de seguridad en tablas
-- persistentes ANTES de tocar nada, y el rollback esta al pie del archivo.
--
-- Reporte: escociaos-po/reports/2026-07-31-dryrun-lunes.md (hallazgos #8 y #9)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PARTE 1 -- unificar el duplicado `Beneficos ` (espacio final) del catalogo
-- -----------------------------------------------------------------------------
-- El catalogo tiene DOS filas activas para el mismo concepto:
--     'Beneficos'   (len 9,  id b17570ec-...)  149 obs, 2025-11 -> 2026-07
--     'Beneficos '  (len 10, id dc6f93bd-...)  314 obs, 2025-01 -> 2026-04
--
-- En el mapa de calor salen como dos plagas distintas y la tendencia se ve rota
-- en el limite 2026-04/05, donde la captura cambio de un id al otro: las 314
-- observaciones viejas parecen una plaga que desaparecio, y la serie actual
-- parece tener solo 11 meses.
--
-- La migracion 032_unify_beneficos.sql del repo apunta a la variante ACENTUADA
-- ('Benéficos'), que no existe en produccion -- seria un no-op -- y ademas nunca
-- se aplico (no figura en supabase_migrations). Esta la reemplaza en la
-- practica; 032 se deja intacta segun la regla de no editar migraciones.
--
-- Verificado antes de escribir esto:
--   * el id duplicado NO tiene filas en `pest_umbral_economico` (0) ni en
--     `pest_seasonal_profile` (0), asi que borrarlo no deja huerfanos;
--   * las unicas 3 FK contra el catalogo son monitoreos.plaga_enfermedad_id,
--     pest_umbral_economico.pest_id y pest_seasonal_profile.pest_id;
--   * `Beneficos ` es la UNICA fila del catalogo con espacios sobrantes y el
--     UNICO duplicado por btrim(nombre) -- por eso el indice unico de abajo
--     puede crearse sin conflictos.
--
-- Filas afectadas: UPDATE 314, DELETE 1.

CREATE TABLE IF NOT EXISTS public.backup_075_beneficos_merge AS
SELECT id AS monitoreo_id, plaga_enfermedad_id AS plaga_id_original
FROM public.monitoreos
WHERE plaga_enfermedad_id = 'dc6f93bd-658d-4504-8ecc-fc4c4f13b13e';

UPDATE public.monitoreos
   SET plaga_enfermedad_id = 'b17570ec-607c-4fcc-a26c-12b15899bcb0'
 WHERE plaga_enfermedad_id = 'dc6f93bd-658d-4504-8ecc-fc4c4f13b13e';

DELETE FROM public.plagas_enfermedades_catalogo
 WHERE id = 'dc6f93bd-658d-4504-8ecc-fc4c4f13b13e';

-- Que no vuelva a pasar: dos nombres que solo difieren en espacios son el mismo
-- concepto. Indice sobre btrim(nombre), no sobre nombre.
CREATE UNIQUE INDEX IF NOT EXISTS plagas_catalogo_nombre_btrim_unique
  ON public.plagas_enfermedades_catalogo (btrim(nombre));


-- -----------------------------------------------------------------------------
-- PARTE 2 -- eliminar 136 observaciones duplicadas por re-importacion de CSV
-- -----------------------------------------------------------------------------
-- 132 grupos / 268 filas duplicadas, repartidas en 17 rondas entre 2025-01-21 y
-- 2026-04-24. Un grupo = misma (ronda, ubicacion, plaga, fecha, monitor).
--
-- Tienen forma de importacion, no de captura: los pares se crearon con minutos
-- o dias de diferencia en sesiones distintas. Ejemplo real: ronda 0035acd9,
-- sublote 1d4907db, 'Beneficos ', 2026-04-24, con incidencias 2,86% y 34,29%,
-- creadas el 2026-04-25 15:13 y el 2026-04-27 12:46 -- la misma ronda importada
-- dos dias despues.
--
-- Las 2 rondas posteriores al 2026-04-26 estan limpias, o sea el camino de
-- captura en vivo NO produce duplicados: esto es historia, no una fuga abierta.
--
-- REGLA DE DESEMPATE, decidida por Santiago: gana la fila con `created_at` mas
-- reciente, es decir la importacion corregida. Es la misma regla que la limpieza
-- del hato (2026-07-24) aplico a los partos. IMPORTANTE: en 71 de los 132 grupos
-- las dos copias traen incidencias distintas, asi que esta regla ELIGE un
-- numero. Por eso la copia de seguridad guarda la fila completa, no solo el id.
--
-- La priorizacion de scouting NO se ve afectada (solo lee la ronda mas reciente,
-- que esta limpia). Lo que se corrige es la vista historica: el mapa de calor y
-- las tendencias dejan de doble-contar arboles monitoreados/afectados.
--
-- ALCANCE REAL DE ESTA PARTE: 64 filas, no 136.
--
-- El predicado `created_at < MAX(created_at)` solo discrimina cuando las copias
-- de un grupo tienen instantes distintos. Al aplicarla se descubrio que 72 de
-- los 132 grupos tienen `created_at` IDENTICO entre sus copias -- vinieron en la
-- misma transaccion de importacion -- asi que para ellos no existe "la mas
-- reciente" y el DELETE no los toco. Es el comportamiento correcto: la regla
-- aprobada por Santiago no aplica ahi, y adivinar habria sido peor.
--
-- Esos 72 grupos se resolvieron asi:
--   * 14 son duplicados EXACTOS (misma incidencia, mismos arboles afectados y
--     monitoreados): se colapsan en la migracion 076, donde el desempate por
--     `id` no elige ningun numero porque ambas filas dicen lo mismo.
--   * 58 tienen VALORES DIVERGENTES con instante identico. No hay regla
--     defendible: elegir una copia seria inventar el dato. Quedan intactos,
--     pendientes de cotejo contra las planillas de papel. Ver el issue de
--     seguimiento enlazado en el PR.

CREATE TABLE IF NOT EXISTS public.backup_075_monitoreos_duplicados AS
SELECT m.*
FROM public.monitoreos m
JOIN (
  SELECT ronda_id,
         COALESCE(sublote_id::text, lote_id::text) AS ubic,
         plaga_enfermedad_id, fecha_monitoreo, monitor,
         MAX(created_at) AS keep_c
    FROM public.monitoreos
   WHERE ronda_id IS NOT NULL
   GROUP BY 1,2,3,4,5
  HAVING COUNT(*) > 1
) d
  ON  m.ronda_id            = d.ronda_id
  AND COALESCE(m.sublote_id::text, m.lote_id::text) = d.ubic
  AND m.plaga_enfermedad_id = d.plaga_enfermedad_id
  AND m.fecha_monitoreo     = d.fecha_monitoreo
  AND m.monitor             = d.monitor
  AND m.created_at          < d.keep_c;

DELETE FROM public.monitoreos
 WHERE id IN (SELECT id FROM public.backup_075_monitoreos_duplicados);


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Parte 2 (revertir primero, por las FK):
--   INSERT INTO public.monitoreos
--   SELECT * FROM public.backup_075_monitoreos_duplicados;
--
-- Parte 1:
--   DROP INDEX IF EXISTS public.plagas_catalogo_nombre_btrim_unique;
--   INSERT INTO public.plagas_enfermedades_catalogo (id, nombre, activo)
--     VALUES ('dc6f93bd-658d-4504-8ecc-fc4c4f13b13e', 'Beneficos ', true);
--   UPDATE public.monitoreos m
--      SET plaga_enfermedad_id = b.plaga_id_original
--     FROM public.backup_075_beneficos_merge b
--    WHERE m.id = b.monitoreo_id;
--
-- Las dos tablas backup_075_* se dejan en la base a proposito. Borrarlas cuando
-- Santiago confirme que las vistas de monitoreo se ven correctas.
-- =============================================================================
