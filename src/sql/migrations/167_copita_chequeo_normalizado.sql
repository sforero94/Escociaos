-- 167_copita_chequeo_normalizado.sql
--
-- ESCO-128. Corrige las columnas NORMALIZADAS de la fila de chequeo de COPITA #166
-- que la migracion 163 no toco.
--
-- POR QUE HACE FALTA UNA SEGUNDA MIGRACION. La 163 borro el evento `servicio`
-- falso del 2026-08-12 (el OCR leyo en la fila de COPITA la fecha manuscrita que
-- Martha escribio en la fila de COMETA, justo encima). Pero `v_hato_estado_actual`
-- NO deriva la prenez de `hato_eventos`: su primer CTE copia `meses_prenez`,
-- `fecha_secar` y `fecha_probable_parto` del ULTIMO `hato_chequeo_vacas`
-- (verificado en `pg_get_viewdef`). Esa fila quedo con los valores derivados del
-- servicio borrado, asi que la Hoja de Vida y el motor de alertas siguen leyendo
-- una fecha probable de parto seis meses tarde.
--
-- La aritmetica prueba el linaje y por eso no hay ambiguedad sobre el origen:
--   2026-08-12 + 9 meses = 2027-05-12  (exacto, = fecha_probable_parto actual)
--   2027-05-12 - 2 meses = 2027-03-12  (exacto, = fecha_secar actual)
-- Mientras que la capa cruda, que es lo que escribio el veterinario, dice:
--   pp_raw    = '13/11/2026'
--   secar_raw = '13/9/2026'
--
-- CONSECUENCIA OPERATIVA de no corregirlo: la regla `parto_proximo` dispara 14
-- dias antes de `fecha_probable_parto`. Con 2027-05-12 almacenado, COPITA no
-- recibe alerta de parto cerca de su fecha real de ~2026-11-13, o sea un parto
-- desatendido dentro de unas siete semanas.
--
-- ES UN CASO UNICO, NO UN DEFECTO DEL NORMALIZADOR. Barrido sobre los diez
-- chequeos con `pp_raw` en formato dd/mm/yyyy:
--   abs(fecha_probable_parto - to_date(pp_raw,'FMDD/FMMM/YYYY')) > 20 dias
--   -> 1 fila divergente de 24 comparables el 2026-09-08
--   -> 0 de 222 en los nueve chequeos anteriores
--
-- UNA CELDA DE LA CAPA CRUDA SI SE TOCA, por decision de Santiago (2026-09-25).
-- `fecha_servicio_raw` dice '12/08/26', pero esa fecha la escribio Martha en la
-- fila de COMETA; en la fila de COPITA la celda estaba VACIA en el papel. O sea
-- que el crudo no es "lo que dice la planilla", es una lectura corrida del OCR.
-- Dejarlo vivo es una mina: RE-COMITEAR ese chequeo regeneraria el servicio
-- falso que la 163 borro. Se pone en NULL (celda vacia), que es lo que dice el
-- papel. Es la UNICA celda cruda que cambia: `pp_raw` y `secar_raw` son la fuente
-- de los valores nuevos y las post-condiciones exigen que sigan intactos.
--
-- TRAZA: `hato_correcciones` (084) no deja fila aca -- su trigger retorna
-- temprano cuando `auth.uid()` es NULL, que es el caso de una migracion. Por eso
-- el respaldo en `respaldos` es el UNICO registro de lo que habia antes.
--
-- Filas de dominio afectadas: 1 UPDATE (4 columnas normalizadas + 1 celda cruda).
-- NO trae BEGIN;/COMMIT; -- `apply_migration` ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081: esquema `respaldos`, jamas `public`)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_167_copita_chequeo AS
SELECT * FROM public.hato_chequeo_vacas
WHERE id = '7cba844d-412f-4644-bd91-9e9881f9c769';

ALTER TABLE respaldos.backup_167_copita_chequeo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_167_copita_chequeo FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones -- abortan la transaccion entera si el estado cambio
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v RECORD;
  v_backup int;
BEGIN
  SELECT cv.fecha_servicio, cv.fecha_probable_parto, cv.fecha_secar,
         cv.meses_prenez, cv.pp_raw, cv.secar_raw, cv.fecha_servicio_raw,
         a.numero, a.nombre, c.fecha AS chequeo_fecha
    INTO v
    FROM public.hato_chequeo_vacas cv
    JOIN public.hato_animales  a ON a.id = cv.animal_id
    JOIN public.hato_chequeos  c ON c.id = cv.chequeo_id
   WHERE cv.id = '7cba844d-412f-4644-bd91-9e9881f9c769';

  IF v IS NULL THEN
    RAISE EXCEPTION '167: la fila de chequeo objetivo no existe';
  END IF;

  -- La fila tiene que seguir siendo la de COPITA en el chequeo del 2026-09-08
  IF v.numero IS DISTINCT FROM 166 OR v.nombre IS DISTINCT FROM 'COPITA' THEN
    RAISE EXCEPTION '167: la fila no es la de COPITA #166 (es % #%)', v.nombre, v.numero;
  END IF;
  IF v.chequeo_fecha IS DISTINCT FROM DATE '2026-09-08' THEN
    RAISE EXCEPTION '167: el chequeo no es el del 2026-09-08 (es %)', v.chequeo_fecha;
  END IF;

  -- Los valores malos tienen que seguir exactamente como se diagnosticaron
  IF v.fecha_probable_parto IS DISTINCT FROM DATE '2027-05-12' THEN
    RAISE EXCEPTION '167: fecha_probable_parto ya no es 2027-05-12 (es %) -- alguien la toco', v.fecha_probable_parto;
  END IF;
  IF v.fecha_secar IS DISTINCT FROM DATE '2027-03-12' THEN
    RAISE EXCEPTION '167: fecha_secar ya no es 2027-03-12 (es %)', v.fecha_secar;
  END IF;
  IF v.fecha_servicio IS DISTINCT FROM DATE '2026-08-12' THEN
    RAISE EXCEPTION '167: fecha_servicio ya no es 2026-08-12 (es %)', v.fecha_servicio;
  END IF;
  IF v.meses_prenez IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION '167: meses_prenez ya no es 0 (es %)', v.meses_prenez;
  END IF;

  -- La capa cruda tiene que seguir diciendo lo que escribio el veterinario,
  -- porque los valores nuevos se derivan de ELLA y de ningun otro sitio
  IF v.pp_raw IS DISTINCT FROM '13/11/2026' THEN
    RAISE EXCEPTION '167: pp_raw no es 13/11/2026 (es %) -- la fuente del valor nuevo cambio', v.pp_raw;
  END IF;
  IF v.secar_raw IS DISTINCT FROM '13/9/2026' THEN
    RAISE EXCEPTION '167: secar_raw no es 13/9/2026 (es %)', v.secar_raw;
  END IF;
  IF v.fecha_servicio_raw IS DISTINCT FROM '12/08/26' THEN
    RAISE EXCEPTION '167: fecha_servicio_raw no es 12/08/26 (es %)', v.fecha_servicio_raw;
  END IF;

  -- El respaldo tiene que haber capturado exactamente una fila
  SELECT count(*) INTO v_backup FROM respaldos.backup_167_copita_chequeo;
  IF v_backup <> 1 THEN
    RAISE EXCEPTION '167: el respaldo tiene % filas, se esperaba 1', v_backup;
  END IF;

  RAISE NOTICE '167: pre-condiciones OK -- COPITA #166, chequeo 2026-09-08, valores malos confirmados';
END $$;

-- ---------------------------------------------------------------------------
-- 2. La correccion -- columnas normalizadas + la celda cruda del servicio
-- ---------------------------------------------------------------------------
UPDATE public.hato_chequeo_vacas
   SET fecha_probable_parto = DATE '2026-11-13',  -- de pp_raw    '13/11/2026'
       fecha_secar          = DATE '2026-09-13',  -- de secar_raw '13/9/2026'
       fecha_servicio       = NULL,               -- el 12/08 es de COMETA, no de COPITA
       meses_prenez         = NULL,               -- 0 afirma "vacia" y es falso; NULL = sin dato
       fecha_servicio_raw   = NULL                -- celda vacia en el papel; el '12/08/26' es de COMETA
 WHERE id = '7cba844d-412f-4644-bd91-9e9881f9c769';

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v RECORD;
  v_vista RECORD;
  v_otros int;
BEGIN
  SELECT fecha_servicio, fecha_probable_parto, fecha_secar, meses_prenez,
         pp_raw, secar_raw, fecha_servicio_raw
    INTO v
    FROM public.hato_chequeo_vacas
   WHERE id = '7cba844d-412f-4644-bd91-9e9881f9c769';

  IF v.fecha_probable_parto IS DISTINCT FROM DATE '2026-11-13' THEN
    RAISE EXCEPTION '167 post: fecha_probable_parto quedo en %', v.fecha_probable_parto;
  END IF;
  IF v.fecha_secar IS DISTINCT FROM DATE '2026-09-13' THEN
    RAISE EXCEPTION '167 post: fecha_secar quedo en %', v.fecha_secar;
  END IF;
  IF v.fecha_servicio IS NOT NULL THEN
    RAISE EXCEPTION '167 post: fecha_servicio quedo en % y debia quedar NULL', v.fecha_servicio;
  END IF;
  IF v.meses_prenez IS NOT NULL THEN
    RAISE EXCEPTION '167 post: meses_prenez quedo en % y debia quedar NULL', v.meses_prenez;
  END IF;

  -- Las celdas crudas que son FUENTE del valor nuevo no se tocaron
  IF v.pp_raw IS DISTINCT FROM '13/11/2026'
     OR v.secar_raw IS DISTINCT FROM '13/9/2026' THEN
    RAISE EXCEPTION '167 post: pp_raw o secar_raw cambiaron -- solo debia cambiar fecha_servicio_raw';
  END IF;
  -- Y la celda cruda del servicio quedo vacia, como en el papel
  IF v.fecha_servicio_raw IS NOT NULL THEN
    RAISE EXCEPTION '167 post: fecha_servicio_raw quedo en % y debia quedar NULL', v.fecha_servicio_raw;
  END IF;

  -- Ninguna otra fila del mismo chequeo se movio
  SELECT count(*) INTO v_otros
    FROM public.hato_chequeo_vacas cv
    JOIN public.hato_chequeos c ON c.id = cv.chequeo_id
   WHERE c.fecha = DATE '2026-09-08'
     AND cv.id <> '7cba844d-412f-4644-bd91-9e9881f9c769'
     AND cv.fecha_probable_parto = DATE '2027-05-12';
  IF v_otros <> 0 THEN
    RAISE EXCEPTION '167 post: % filas mas del chequeo quedaron con la fecha mala', v_otros;
  END IF;

  -- LA PRUEBA QUE DE VERDAD IMPORTA: lo que ve la pantalla
  -- Alias `ve`, NO `v`: `v` es la variable RECORD de este bloque y PL/pgSQL
  -- la resuelve antes que el alias (42703 en el primer intento de aplicarla).
  SELECT ve.fecha_probable_parto, ve.fecha_secar, ve.meses_prenez, ve.ultimo_servicio_fecha
    INTO v_vista
    FROM public.v_hato_estado_actual ve
    JOIN public.hato_animales a ON a.id = ve.animal_id
   WHERE a.nombre = 'COPITA' AND a.numero = 166;

  IF v_vista.fecha_probable_parto IS DISTINCT FROM DATE '2026-11-13' THEN
    RAISE EXCEPTION '167 post: la VISTA sigue sirviendo % -- el arreglo no llego al consumidor', v_vista.fecha_probable_parto;
  END IF;

  RAISE NOTICE '167 OK: vista COPITA -> parto %, secar %, meses_prenez %, ultimo servicio %',
    v_vista.fecha_probable_parto, v_vista.fecha_secar,
    coalesce(v_vista.meses_prenez::text,'sin dato'), v_vista.ultimo_servicio_fecha;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente)
-- ---------------------------------------------------------------------------
-- UPDATE public.hato_chequeo_vacas cv
--    SET fecha_probable_parto = b.fecha_probable_parto,
--        fecha_secar          = b.fecha_secar,
--        fecha_servicio       = b.fecha_servicio,
--        meses_prenez         = b.meses_prenez,
--        fecha_servicio_raw   = b.fecha_servicio_raw
--   FROM respaldos.backup_167_copita_chequeo b
--  WHERE cv.id = b.id;
