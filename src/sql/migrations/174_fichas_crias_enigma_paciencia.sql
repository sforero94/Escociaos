-- 174_fichas_crias_enigma_paciencia.sql
--
-- ESCO-135. Decision de Santiago (2026-10-02): un parto con cria retenida
-- debe crear la ficha de la ternera con nombre "SIN NOMBRE" y la chapeta
-- siguiente en secuencia. El codigo nuevo (mismo PR) lo hace desde ahora;
-- esta migracion crea las dos fichas que ya faltan:
--   - cria de ENIGMA #119, parto 2026-09-20 (Telegram, cria_destino retenida)
--   - cria de PACIENCIA #101, parto 2026-09-26 (Telegram, cria_destino retenida)
--
-- CHAPETA. Santiago dijo «215, 216, etc». La 215 YA EXISTE: es VIKINGA,
-- ternera activa nacida 2026-06-26. La regla que implementa el codigo es
--   siguiente = max(numero) de las ACTIVAS con numero < 800, + 1
-- (800-999 son numeros provisionales, migracion 066; 5182/5202 son atipicos;
-- las vendidas con 239/251/442 no cuentan). Hoy da 216 y 217. La migracion
-- calcula el numero en vivo con la misma regla y ademas exige que salga 216,
-- para que una ternera registrada entre tanto no se lleve el numero en
-- silencio.
--
-- ORDEN: por fecha de parto. ENIGMA (09-20) -> 216, PACIENCIA (09-26) -> 217.
--
-- QUE ESCRIBE (por cria): 1 INSERT en hato_animales + 1 UPDATE de
-- hato_eventos.cria_id en su parto. Total: 2 INSERT + 2 UPDATE.
--   sexo hembra, etapa ternera, estado activa, origen nacimiento,
--   fecha_nacimiento = fecha del parto, fecha_nacimiento_confianza = la del
--   evento ('exacta' en los dos), madre_id = la madre, finca_id = el de la
--   madre (NULL en las dos), padre_toro_id NULL (el servicio que origino
--   el parto no tiene toro registrado en ninguna de las dos -- no se adivina),
--   confianza 'media' (igual que las terneras creadas a mano en agosto),
--   created_by = quien registro el parto, notas con el origen.
--
-- TRAZA: hato_correcciones (084) no traza INSERT ni corre con auth.uid() NULL.
-- El respaldo guarda el estado previo de los dos partos.
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_174_partos_cria AS
SELECT * FROM public.hato_eventos
WHERE id IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f',   -- ENIGMA
             'aa24f711-a237-4815-8014-7f6370086bec');  -- PACIENCIA

ALTER TABLE respaldos.backup_174_partos_cria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_174_partos_cria FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ok int;
  v_sig int;
  v_backup int;
BEGIN
  -- Los dos partos siguen como se diagnosticaron: retenida y sin cria_id
  SELECT count(*) INTO v_ok
    FROM public.hato_eventos e
    JOIN public.hato_animales a ON a.id = e.animal_id
   WHERE (e.id = '5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f' AND a.numero = 119 AND a.nombre = 'ENIGMA'
          AND e.fecha = DATE '2026-09-20')
      OR (e.id = 'aa24f711-a237-4815-8014-7f6370086bec' AND a.numero = 101 AND a.nombre = 'PACIENCIA'
          AND e.fecha = DATE '2026-09-26');
  IF v_ok <> 2 THEN
    RAISE EXCEPTION '174: los dos partos no coinciden con lo diagnosticado (% de 2)', v_ok;
  END IF;

  SELECT count(*) INTO v_ok
    FROM public.hato_eventos
   WHERE id IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f', 'aa24f711-a237-4815-8014-7f6370086bec')
     AND tipo = 'parto' AND cria_destino = 'retenida' AND cria_id IS NULL;
  IF v_ok <> 2 THEN
    RAISE EXCEPTION '174: algun parto ya tiene cria_id o no es retenida (% de 2 sin cria) -- ya se creo la ficha?', v_ok;
  END IF;

  -- Ninguna ternera con esa madre y fecha de nacimiento cercana (no duplicar a mano)
  IF EXISTS (
    SELECT 1 FROM public.hato_animales c
     WHERE c.madre_id IN (SELECT animal_id FROM public.hato_eventos
                           WHERE id IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f',
                                        'aa24f711-a237-4815-8014-7f6370086bec'))
       AND c.fecha_nacimiento >= DATE '2026-09-05') THEN
    RAISE EXCEPTION '174: ya existe una cria de ENIGMA o PACIENCIA nacida en septiembre -- alguien la creo a mano';
  END IF;

  -- La siguiente chapeta tiene que ser 216 (215 = VIKINGA)
  SELECT max(numero) + 1 INTO v_sig
    FROM public.hato_animales
   WHERE estado = 'activa' AND numero < 800;
  IF v_sig IS DISTINCT FROM 216 THEN
    RAISE EXCEPTION '174: la siguiente chapeta es %, no 216 -- se registro otra ternera, revisar', v_sig;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hato_animales
              WHERE estado = 'activa' AND numero IN (216, 217)) THEN
    RAISE EXCEPTION '174: 216 o 217 ya los lleva un animal activo';
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_174_partos_cria;
  IF v_backup <> 2 THEN
    RAISE EXCEPTION '174: el respaldo tiene % filas, se esperaban 2', v_backup;
  END IF;

  RAISE NOTICE '174: pre-condiciones OK -- chapetas 216 y 217 libres';
END $$;

-- ---------------------------------------------------------------------------
-- 2. Crear las dos fichas y enlazarlas al parto (una CTE por cria, en orden)
-- ---------------------------------------------------------------------------
WITH parto AS (
  SELECT e.id AS evento_id, e.fecha, e.fecha_confianza, e.created_by, m.id AS madre_id, m.finca_id,
         m.nombre AS madre_nombre, m.numero AS madre_numero
    FROM public.hato_eventos e
    JOIN public.hato_animales m ON m.id = e.animal_id
   WHERE e.id = '5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f'
), cria AS (
  INSERT INTO public.hato_animales
         (numero, nombre, sexo, etapa, estado, fecha_nacimiento, fecha_nacimiento_confianza,
          madre_id, padre_toro_id, finca_id, origen, confianza, notas, created_by)
  SELECT 216, 'SIN NOMBRE', 'hembra', 'ternera', 'activa', p.fecha, p.fecha_confianza,
         p.madre_id, NULL, p.finca_id, 'nacimiento', 'media',
         'Ficha creada por la migracion 174 (ESCO-135): cria retenida del parto de '
           || p.madre_nombre || ' #' || p.madre_numero || ' del ' || p.fecha || ', registrado por Telegram.',
         p.created_by
    FROM parto p
  RETURNING id
)
UPDATE public.hato_eventos e
   SET cria_id = (SELECT id FROM cria)
  FROM parto p
 WHERE e.id = p.evento_id;

WITH parto AS (
  SELECT e.id AS evento_id, e.fecha, e.fecha_confianza, e.created_by, m.id AS madre_id, m.finca_id,
         m.nombre AS madre_nombre, m.numero AS madre_numero
    FROM public.hato_eventos e
    JOIN public.hato_animales m ON m.id = e.animal_id
   WHERE e.id = 'aa24f711-a237-4815-8014-7f6370086bec'
), cria AS (
  INSERT INTO public.hato_animales
         (numero, nombre, sexo, etapa, estado, fecha_nacimiento, fecha_nacimiento_confianza,
          madre_id, padre_toro_id, finca_id, origen, confianza, notas, created_by)
  SELECT 217, 'SIN NOMBRE', 'hembra', 'ternera', 'activa', p.fecha, p.fecha_confianza,
         p.madre_id, NULL, p.finca_id, 'nacimiento', 'media',
         'Ficha creada por la migracion 174 (ESCO-135): cria retenida del parto de '
           || p.madre_nombre || ' #' || p.madre_numero || ' del ' || p.fecha || ', registrado por Telegram.',
         p.created_by
    FROM parto p
  RETURNING id
)
UPDATE public.hato_eventos e
   SET cria_id = (SELECT id FROM cria)
  FROM parto p
 WHERE e.id = p.evento_id;

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ok int;
  v_otros int;
BEGIN
  -- Cada parto apunta a su cria, y la cria apunta a su madre con la fecha del parto
  SELECT count(*) INTO v_ok
    FROM public.hato_eventos e
    JOIN public.hato_animales c ON c.id = e.cria_id
   WHERE e.id IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f', 'aa24f711-a237-4815-8014-7f6370086bec')
     AND c.madre_id = e.animal_id
     AND c.fecha_nacimiento = e.fecha
     AND c.nombre = 'SIN NOMBRE' AND c.estado = 'activa' AND c.etapa = 'ternera'
     AND ((e.id = '5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f' AND c.numero = 216)
       OR (e.id = 'aa24f711-a237-4815-8014-7f6370086bec' AND c.numero = 217));
  IF v_ok <> 2 THEN
    RAISE EXCEPTION '174 post: % de 2 crias quedaron bien enlazadas', v_ok;
  END IF;

  -- Ningun otro parto recibio cria_id
  SELECT count(*) INTO v_otros
    FROM public.hato_eventos
   WHERE cria_id IS NOT NULL
     AND id NOT IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f', 'aa24f711-a237-4815-8014-7f6370086bec');
  IF v_otros <> 0 THEN
    RAISE EXCEPTION '174 post: % eventos ajenos tienen cria_id', v_otros;
  END IF;

  -- Las chapetas activas 216/217 no estan duplicadas
  IF (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa' AND numero IN (216, 217)) <> 2 THEN
    RAISE EXCEPTION '174 post: 216/217 activas no son exactamente 2';
  END IF;

  RAISE NOTICE '174 OK: 216 (cria de ENIGMA) y 217 (cria de PACIENCIA) creadas y enlazadas';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente)
-- ---------------------------------------------------------------------------
-- UPDATE public.hato_eventos e SET cria_id = NULL
--  WHERE e.id IN ('5a47fe7c-c74b-4c12-98b4-ec5e994a6f6f', 'aa24f711-a237-4815-8014-7f6370086bec');
-- DELETE FROM public.hato_animales
--  WHERE nombre = 'SIN NOMBRE' AND numero IN (216, 217)
--    AND notas LIKE 'Ficha creada por la migracion 174%';
