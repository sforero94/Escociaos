CREATE FUNCTION public.fn_financial_income_route_web(p_income_id uuid,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;milk boolean;sale boolean;BEGIN
 IF p_income_id IS NULL OR p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current financial routing owner/target required' USING ERRCODE='42501';END IF;
 actor=financial_sale_correction.actor();PERFORM financial_sale_correction.assert_baseline();PERFORM financial_sale_correction.lock_source();
 IF NOT EXISTS(SELECT 1 FROM public.fin_ingresos WHERE id=p_income_id) THEN RAISE EXCEPTION 'Original financial target missing';END IF;
 milk=EXISTS(SELECT 1 FROM public.hato_produccion_quincenal WHERE fin_ingreso_id=p_income_id AND origen_dato='medido') OR EXISTS(SELECT 1 FROM hato_quincena.audit WHERE(receipt->'before'->'income'->>'id'=p_income_id::text AND receipt->'before'->'production'->>'origen_dato'='medido') OR(receipt->'after'->'income'->>'id'=p_income_id::text AND receipt->'after'->'production'->>'origen_dato'='medido'));
 sale=EXISTS(SELECT 1 FROM hato_sale.requests WHERE plan->>'incomeId'=p_income_id::text OR receipt->'income'->>'id'=p_income_id::text) OR EXISTS(SELECT 1 FROM hato_sale.audit WHERE receipt->'income'->>'id'=p_income_id::text) OR EXISTS(SELECT 1 FROM public.hato_eventos WHERE fin_ingreso_id=p_income_id AND tipo='venta');
 PERFORM financial_sale_correction.assert_baseline();IF actor IS DISTINCT FROM financial_sale_correction.actor() THEN RAISE EXCEPTION 'Financial routing actor changed';END IF;
 RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'targetId',p_income_id,'kind',CASE WHEN milk AND sale THEN 'blocked' WHEN milk THEN 'measured' WHEN sale THEN 'sale' ELSE 'general' END);
END $$;
