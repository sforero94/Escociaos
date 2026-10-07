-- Rollback MANUAL de 178; no ejecutar como parte de la aplicacion.
-- Abortara si PACHA cambio despues o reaparecio alguna ficha conflictiva.
-- Deja los respaldos intactos; no elimina ni altera el ledger de 178.
BEGIN;
LOCK TABLE public.hato_animales IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE v_n bigint;
BEGIN
  IF (SELECT count(*) FROM respaldos.backup_178_pacha_morocha) <> 2
     OR NOT EXISTS (SELECT 1 FROM respaldos.backup_178_pacha_morocha b
                    WHERE id = '43a6b514-17a3-405c-ba59-65727fb11a36'
                      AND md5(to_jsonb(b)::text) = '3876531edf89dd50df3dcc79abfaf84c')
     OR NOT EXISTS (SELECT 1 FROM respaldos.backup_178_pacha_morocha b
                    WHERE id = '79701784-be8f-4c33-8da0-c3aadbea9239'
                      AND md5(to_jsonb(b)::text) = '0c02e8f63a5d6431a1013f30f78f4427') THEN
    RAISE EXCEPTION '178 rollback: respaldo no coincide';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    JOIN respaldos.backup_178_pacha_morocha b USING (id)
    WHERE a.id = '43a6b514-17a3-405c-ba59-65727fb11a36'
      AND to_jsonb(a) = jsonb_set(to_jsonb(b), '{numero}', '202'::jsonb)
  ) OR EXISTS (SELECT 1 FROM public.hato_animales
               WHERE id <> '43a6b514-17a3-405c-ba59-65727fb11a36'
                 AND (id = '79701784-be8f-4c33-8da0-c3aadbea9239'
                      OR numero IN (202, 5202) OR upper(nombre) IN ('PACHA', 'MOROCHA'))) THEN
    RAISE EXCEPTION '178 rollback: cambiaron las fichas; no sobrescribir';
  END IF;
  UPDATE public.hato_animales SET numero = 5202
  WHERE id = '43a6b514-17a3-405c-ba59-65727fb11a36' AND numero = 202;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '178 rollback: UPDATE no fue una fila'; END IF;
  INSERT INTO public.hato_animales
  SELECT * FROM respaldos.backup_178_pacha_morocha
  WHERE id = '79701784-be8f-4c33-8da0-c3aadbea9239';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '178 rollback: INSERT no fue una fila'; END IF;
  IF (SELECT count(*) FROM respaldos.backup_178_pacha_morocha b
       JOIN public.hato_animales a USING (id) WHERE to_jsonb(a) = to_jsonb(b)) <> 2 THEN
    RAISE EXCEPTION '178 rollback: restauracion incompleta';
  END IF;
END $$;
COMMIT;
