-- NONNUMBERED candidate62; Santiago Option2. Local-only foundation, no caller/grant retirement.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_income_metadata.assert_baseline();
CREATE SCHEMA financial_sale_correction;
REVOKE ALL ON SCHEMA financial_sale_correction FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE financial_sale_correction.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_unresolved_correction ON financial_sale_correction.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE financial_sale_correction.audit(request_key uuid PRIMARY KEY REFERENCES financial_sale_correction.requests,receipt jsonb NOT NULL);
ALTER TABLE financial_sale_correction.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE financial_sale_correction.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA financial_sale_correction FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION financial_sale_correction.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable quincena original/audit';END IF;
 IF(OLD.state='pending' AND NEW.state IN('committed','canceled') AND(to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt'))
 OR(OLD.state IN('committed','canceled') AND NOT OLD.acknowledged AND NEW.acknowledged AND(to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original quincena';
END $$;
CREATE TRIGGER immutable_correction_request BEFORE UPDATE OR DELETE ON financial_sale_correction.requests FOR EACH ROW EXECUTE FUNCTION financial_sale_correction.immutable();
CREATE TRIGGER immutable_correction_audit BEFORE UPDATE OR DELETE ON financial_sale_correction.audit FOR EACH ROW EXECUTE FUNCTION financial_sale_correction.immutable();
CREATE TRIGGER no_truncate_correction_request BEFORE TRUNCATE ON financial_sale_correction.requests FOR EACH STATEMENT EXECUTE FUNCTION financial_sale_correction.immutable();
CREATE TRIGGER no_truncate_correction_audit BEFORE TRUNCATE ON financial_sale_correction.audit FOR EACH STATEMENT EXECUTE FUNCTION financial_sale_correction.immutable();
CREATE FUNCTION financial_sale_correction.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM financial_sale_correction.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM financial_sale_correction.audit x));
$$;
CREATE FUNCTION financial_sale_correction.foreign_controls() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;rows jsonb;result jsonb='{}';BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','information_schema','financial_sale_correction') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM %I.%I x',t.nspname,t.relname) INTO rows;result=result||jsonb_build_object(t.nspname||'.'||t.relname,rows);END LOOP;RETURN result;
END $$;
CREATE FUNCTION financial_sale_correction.lock_source() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM hato_income_metadata.lock_source();LOCK TABLE financial_sale_correction.requests,financial_sale_correction.audit IN SHARE ROW EXCLUSIVE MODE;END $$;
CREATE FUNCTION financial_sale_correction.actor() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RETURN hato_income_metadata.actor();END $$;
CREATE FUNCTION financial_sale_correction.result(r financial_sale_correction.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION financial_sale_correction.validate(p jsonb,observed boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v jsonb;key text;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM(CASE WHEN observed THEN ARRAY['fields','kind','observed','targetId','version'] ELSE ARRAY['fields','kind','targetId','version'] END) OR p->'version' IS DISTINCT FROM '1'::jsonb OR p->>'kind' IS DISTINCT FROM 'saleFinancial' OR jsonb_typeof(p->'targetId') IS DISTINCT FROM 'string' OR(p->>'targetId')::uuid::text IS DISTINCT FROM p->>'targetId' OR(observed AND jsonb_typeof(p->'observed') IS DISTINCT FROM 'object') OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Exact bounded sale financial intent required';END IF;
 IF jsonb_typeof(p->'fields') IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'fields')k) IS DISTINCT FROM ARRAY['businessId','buyerId','categoryId','date','mediumId','name','regionId','value'] THEN RAISE EXCEPTION 'Only reviewed financial fields allowed';END IF;
 FOR key IN SELECT unnest(ARRAY['businessId','categoryId','mediumId','regionId']) LOOP v=p->'fields'->key;IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR(v#>>'{}')::uuid::text IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Canonical financial references required';END IF;END LOOP;
 v=p->'fields'->'buyerId';IF jsonb_typeof(v) NOT IN('null','string') OR(v<>'null'::jsonb AND(v#>>'{}')::uuid::text IS DISTINCT FROM v#>>'{}') THEN RAISE EXCEPTION 'Canonical optional buyer required';END IF;
 v=p->'fields'->'name';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 4000 OR btrim(v#>>'{}') IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Bounded financial description required';END IF;
 v=p->'fields'->'date';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR NOT isfinite((v#>>'{}')::date) OR to_char((v#>>'{}')::date,'YYYY-MM-DD') IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Canonical financial date required';END IF;
 v=p->'fields'->'value';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}' !~ '^(0|[1-9][0-9]{0,12})([.][0-9]{1,2})?$' OR(v#>>'{}')::numeric<=0 THEN RAISE EXCEPTION 'Exact positive bounded financial money required';END IF;
END $$;
CREATE FUNCTION financial_sale_correction.source(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE income jsonb;sale hato_sale.requests;proof hato_sale.audit;item jsonb;event jsonb;original_event jsonb;animal jsonb;links jsonb='[]';refs jsonb;f jsonb=p->'fields';BEGIN
 SELECT to_jsonb(x) INTO income FROM public.fin_ingresos x WHERE id=(p->>'targetId')::uuid;IF income IS NULL THEN RAISE EXCEPTION 'Original financial income missing';END IF;
 IF EXISTS(SELECT 1 FROM public.hato_produccion_quincenal WHERE fin_ingreso_id=(income->>'id')::uuid) OR EXISTS(SELECT 1 FROM hato_quincena.audit WHERE receipt->'before'->'income'->>'id'=income->>'id' OR receipt->'after'->'income'->>'id'=income->>'id') THEN RAISE EXCEPTION 'Milk/shared financial claim requires its dedicated reviewed route';END IF;
 IF(SELECT count(*) FROM hato_sale.requests WHERE state='committed' AND plan->>'incomeId'=income->>'id')<>1 THEN RAISE EXCEPTION 'Unambiguous protected sale financial original required';END IF;
 SELECT * INTO STRICT sale FROM hato_sale.requests WHERE state='committed' AND plan->>'incomeId'=income->>'id';SELECT * INTO proof FROM hato_sale.audit WHERE request_key=sale.request_key;
 IF proof.receipt IS DISTINCT FROM sale.receipt OR sale.receipt->'income'->>'id' IS DISTINCT FROM income->>'id' OR sale.receipt->'plan' IS DISTINCT FROM sale.plan OR sale.receipt->>'requestKey' IS DISTINCT FROM sale.request_key::text OR jsonb_array_length(sale.plan->'events')<1 THEN RAISE EXCEPTION 'Original linked sale proof required';END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(sale.plan->'events')x ORDER BY x->>'eventId' LOOP
  SELECT to_jsonb(e) INTO event FROM public.hato_eventos e WHERE id=(item->>'eventId')::uuid;
  SELECT e INTO original_event FROM jsonb_array_elements(sale.receipt->'after'->'animals')a CROSS JOIN LATERAL jsonb_array_elements(a->'events')e WHERE e->>'id'=item->>'eventId';
  IF event IS NULL OR original_event IS NULL OR event IS DISTINCT FROM original_event OR event->>'tipo'<>'venta' OR event->>'animal_id' IS DISTINCT FROM item->>'animalId' OR event->>'fin_ingreso_id' IS DISTINCT FROM income->>'id' THEN RAISE EXCEPTION 'Retained sale event missing/changed; separate review required';END IF;
  SELECT to_jsonb(a) INTO animal FROM public.hato_animales a WHERE id=(item->>'animalId')::uuid;IF animal IS NULL THEN RAISE EXCEPTION 'Retained sale animal missing';END IF;
  links=links||jsonb_build_array(jsonb_build_object('event',event,'animal',animal));
 END LOOP;
 IF(SELECT count(*) FROM public.hato_eventos WHERE fin_ingreso_id=(income->>'id')::uuid)<>jsonb_array_length(links) THEN RAISE EXCEPTION 'Ambiguous financial event associations';END IF;
 SELECT jsonb_build_object('business',(SELECT to_jsonb(x) FROM public.fin_negocios x WHERE id=(f->>'businessId')::uuid AND activo IS TRUE),'category',(SELECT to_jsonb(x) FROM public.fin_categorias_ingresos x WHERE id=(f->>'categoryId')::uuid AND negocio_id=(f->>'businessId')::uuid AND activo IS TRUE),'region',(SELECT to_jsonb(x) FROM public.fin_regiones x WHERE id=(f->>'regionId')::uuid AND activo IS TRUE),'medium',(SELECT to_jsonb(x) FROM public.fin_medios_pago x WHERE id=(f->>'mediumId')::uuid AND activo IS TRUE),'buyer',(SELECT to_jsonb(x) FROM public.fin_compradores x WHERE id=(f->>'buyerId')::uuid AND activo IS TRUE)) INTO refs;
 IF EXISTS(SELECT 1 FROM jsonb_each(refs)e WHERE e.value='null'::jsonb AND(e.key<>'buyer' OR f->'buyerId'<>'null'::jsonb)) THEN RAISE EXCEPTION 'Current active matching financial references required';END IF;
 RETURN jsonb_build_object('production',NULL,'income',income,'beforeRefs',jsonb_build_object('business',(SELECT to_jsonb(x) FROM public.fin_negocios x WHERE id=(income->>'negocio_id')::uuid),'category',(SELECT to_jsonb(x) FROM public.fin_categorias_ingresos x WHERE id=(income->>'categoria_id')::uuid),'region',(SELECT to_jsonb(x) FROM public.fin_regiones x WHERE id=(income->>'region_id')::uuid),'medium',(SELECT to_jsonb(x) FROM public.fin_medios_pago x WHERE id=(income->>'medio_pago_id')::uuid),'buyer',(SELECT to_jsonb(x) FROM public.fin_compradores x WHERE id=(income->>'comprador_id')::uuid)),'sale',jsonb_build_object('request',to_jsonb(sale),'audit',to_jsonb(proof),'links',links),'refs',refs);
END $$;
CREATE FUNCTION financial_sale_correction.plan(p jsonb,s jsonb,p_owner uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('kind','saleFinancial','beforeProduction',NULL,'afterProduction',NULL,'beforeIncome',s->'income','afterIncome',(s->'income')||jsonb_build_object('fecha',p->'fields'->'date','negocio_id',p->'fields'->'businessId','categoria_id',p->'fields'->'categoryId','nombre',p->'fields'->'name','region_id',p->'fields'->'regionId','medio_pago_id',p->'fields'->'mediumId','comprador_id',p->'fields'->'buyerId','valor',(p->'fields'->>'value')::numeric,'updated_at',NULL,'updated_by',p_owner),'tax',NULL);
$$;
CREATE FUNCTION public.fn_financial_sale_correction_source_web(p_draft jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;s jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current quincena source owner required' USING ERRCODE='42501';END IF;
 actor=financial_sale_correction.actor();PERFORM financial_sale_correction.validate(p_draft,false);PERFORM financial_sale_correction.lock_source();PERFORM hato_income_metadata.assert_baseline();PERFORM financial_sale_correction.assert_baseline();s=financial_sale_correction.source(p_draft);
 IF octet_length(s::text)>2097152 THEN RAISE EXCEPTION 'Bounded quincena source exceeded';END IF;
 IF actor IS DISTINCT FROM financial_sale_correction.actor() THEN RAISE EXCEPTION 'Quincena source actor changed';END IF;
 RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'source',s,'effectiveDate',(now() AT TIME ZONE 'America/Bogota')::date);
END $$;
CREATE FUNCTION public.fn_financial_sale_correction_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r financial_sale_correction.requests;expected financial_sale_correction.requests;before_domain jsonb;expected_domain jsonb;before_foreign jsonb;before_controls jsonb;expected_controls jsonb;s jsonb;old_q jsonb;old_income jsonb;new_q jsonb;new_income jsonb;written jsonb;qrow public.hato_produccion_quincenal;irow public.fin_ingresos;traces jsonb;receipt_value jsonb;a financial_sale_correction.audit;wa financial_sale_correction.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original quincena owner/key required' USING ERRCODE='42501';END IF;
 actor=financial_sale_correction.actor();PERFORM hato_income_metadata.assert_baseline();PERFORM financial_sale_correction.assert_baseline();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR(p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original quincena action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('financial-sale-correction-owner:'||p_expected_owner::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('financial-sale-correction-key:'||p_request_key::text,0));
 PERFORM financial_sale_correction.lock_source();SELECT * INTO r FROM financial_sale_correction.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original quincena belongs to another owner' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM financial_sale_correction.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original quincena audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN financial_sale_correction.result(r);END IF;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_foreign=financial_sale_correction.foreign_controls();before_controls=financial_sale_correction.controls();expected_controls=before_controls;
 IF p_action='prepare' THEN
 PERFORM financial_sale_correction.validate(p_intent,true);
 IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original quincena intent changed';END IF;RETURN financial_sale_correction.result(r);END IF;
 IF EXISTS(SELECT 1 FROM financial_sale_correction.requests WHERE owner_id=p_expected_owner AND NOT acknowledged AND state IN('pending','committed')) THEN RAISE EXCEPTION 'Recover original quincena before replacement';END IF;
 s=financial_sale_correction.source(p_intent);IF s IS DISTINCT FROM p_intent->'observed' THEN RAISE EXCEPTION 'Displayed quincena financial source changed';END IF;
 r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=s;r.plan=financial_sale_correction.plan(p_intent,s,p_expected_owner);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
 INSERT INTO financial_sale_correction.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena preparation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO financial_sale_correction.requests SELECT expected.* RETURNING * INTO r;
 ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE financial_sale_correction.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;ELSE RETURN financial_sale_correction.result(r);END IF;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
 IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Terminal original quincena required';END IF;IF r.acknowledged THEN RETURN financial_sale_correction.result(r);END IF;
 expected=r;expected.acknowledged=true;UPDATE financial_sale_correction.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
 IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared quincena required';END IF;IF r.state='committed' THEN RETURN financial_sale_correction.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled quincena cannot post';END IF;
 s=financial_sale_correction.source(r.intent);IF s IS DISTINCT FROM r.original OR r.effective_date IS DISTINCT FROM(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Original quincena source/day changed; resolve original';END IF;
 old_q=r.plan->'beforeProduction';old_income=r.plan->'beforeIncome';new_q=r.plan->'afterProduction';new_income=r.plan->'afterIncome';
 new_income=new_income||jsonb_build_object('updated_at',now());
 UPDATE public.fin_ingresos SET fecha=(new_income->>'fecha')::date,negocio_id=(new_income->>'negocio_id')::uuid,categoria_id=(new_income->>'categoria_id')::uuid,nombre=new_income->>'nombre',region_id=(new_income->>'region_id')::uuid,medio_pago_id=(new_income->>'medio_pago_id')::uuid,comprador_id=(new_income->>'comprador_id')::uuid,valor=(new_income->>'valor')::numeric,updated_by=p_expected_owner WHERE id=(old_income->>'id')::uuid RETURNING to_jsonb(fin_ingresos.*) INTO written;
 IF NOT FOUND OR written IS DISTINCT FROM new_income THEN RAISE EXCEPTION 'Income metadata write suppressed/mutated';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
 IF jsonb_array_length(traces)<>(CASE WHEN old_q<>'null'::jsonb AND old_q IS DISTINCT FROM new_q THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Exact quincena correction count required';END IF;
 IF jsonb_array_length(traces)=1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_produccion_quincenal' AND t->>'operacion'=CASE WHEN new_q='null'::jsonb THEN 'delete' ELSE 'update' END AND t->'datos_anteriores'=old_q AND t->'datos_nuevos'=new_q AND t->>'fila_id'=old_q->>'id' AND t->'animal_id'='null'::jsonb AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->'motivo'='null'::jsonb) THEN RAISE EXCEPTION 'Exact trusted quincena correction required';END IF;
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_produccion_quincenal',CASE WHEN old_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_q) END,CASE WHEN new_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_q) END);
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'fin_ingresos',CASE WHEN old_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_income) END,CASE WHEN new_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_income) END);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
 receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_expected_owner,'actor',actor,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'recordedAt',now(),'before',jsonb_build_object('production',old_q,'income',old_income),'after',jsonb_build_object('production',new_q,'income',new_income),'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
 a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO financial_sale_correction.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Quincena trusted audit suppressed/mutated';END IF;
 expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE financial_sale_correction.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena committed control suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_income_metadata.assert_baseline();PERFORM financial_sale_correction.assert_baseline();
 IF financial_sale_correction.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR financial_sale_correction.foreign_controls() IS DISTINCT FROM before_foreign OR financial_sale_correction.actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Quincena final authority/domain/foreign-control mismatch';END IF;
 RETURN financial_sale_correction.result(r);
END $$;
CREATE FUNCTION public.fn_financial_sale_correction_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r financial_sale_correction.requests;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current quincena recovery owner required' USING ERRCODE='42501';END IF;
 PERFORM financial_sale_correction.actor();PERFORM pg_advisory_xact_lock(hashtextextended('financial-sale-correction-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM financial_sale_correction.requests WHERE owner_id=p_expected_owner AND NOT acknowledged AND state IN('pending','committed');IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_financial_sale_correction_web('status',r.request_key,NULL,p_expected_owner);
END $$;
CREATE FUNCTION financial_sale_correction.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM hato_income_metadata.assert_baseline();PERFORM hato_sale.assert_retired();PERFORM financial_sale_correction.assert_controls();END $$;
CREATE FUNCTION financial_sale_correction.metadata() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $meta$
 WITH targets AS(SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='financial_sale_correction' AND c.relkind IN('r','p'))
 SELECT md5(jsonb_build_object('schema',(SELECT jsonb_build_array(pg_get_userbyid(nspowner),nspacl) FROM pg_namespace WHERE nspname='financial_sale_correction'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',pg_get_userbyid(relowner),'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl,a.attcollation::regcollation::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) ORDER BY conname) FROM pg_constraint WHERE conrelid=t.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(indexrelid),indisvalid,indisready,indislive,indimmediate,indisunique,indisprimary,indnullsnotdistinct) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=t.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(g.oid),g.tgenabled,g.tgdeferrable,g.tginitdeferred) ORDER BY g.tgname) FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid) ORDER BY rulename),'[]') FROM pg_rewrite WHERE ev_class=t.oid),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check) ORDER BY policyname),'[]') FROM pg_policies WHERE schemaname='financial_sale_correction' AND tablename=t.relname)) ORDER BY relname) FROM targets t))::text);
$meta$;
CREATE FUNCTION financial_sale_correction.sale_metadata() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $meta$
 WITH targets AS(SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='hato_sale' AND c.relkind IN('r','p'))
 SELECT md5(jsonb_build_object('schema',(SELECT jsonb_build_array(pg_get_userbyid(nspowner),nspacl) FROM pg_namespace WHERE nspname='hato_sale'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',pg_get_userbyid(relowner),'acl',relacl,'rls',relrowsecurity,'force',relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attacl,a.attcollation::regcollation::text,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) ORDER BY conname) FROM pg_constraint WHERE conrelid=t.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(indexrelid),indisvalid,indisready,indislive,indimmediate,indisunique,indisprimary,indnullsnotdistinct) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=t.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(g.oid),g.tgenabled,g.tgdeferrable,g.tginitdeferred) ORDER BY g.tgname) FROM pg_trigger g WHERE g.tgrelid=t.oid AND NOT g.tgisinternal),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid) ORDER BY rulename),'[]') FROM pg_rewrite WHERE ev_class=t.oid),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check) ORDER BY policyname),'[]') FROM pg_policies WHERE schemaname='hato_sale' AND tablename=t.relname)) ORDER BY relname) FROM targets t))::text);
$meta$;
CREATE FUNCTION financial_sale_correction.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF financial_sale_correction.sale_metadata() IS DISTINCT FROM 'b618fa852099e40a32cc150c3e2a37e8' THEN RAISE EXCEPTION 'Retained sale proof metadata drift';END IF;
 IF financial_sale_correction.metadata() IS DISTINCT FROM '98a83f73528eb664286f89b6964dbadc' THEN RAISE EXCEPTION 'Sale correction private metadata drift';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('financial_sale_correction.requests'::regclass),('financial_sale_correction.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('financial_sale_correction.requests'::regclass,'financial_sale_correction.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Sale correction private authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES ('financial_sale_correction.immutable()','f1071b1c13456df84eea7e1655b57f78',false),('financial_sale_correction.controls()','6704d15b794e8f401b55af67d95cd0a6',false),('financial_sale_correction.foreign_controls()','89d4e2294a181ae391263d91ee9afae5',false),('financial_sale_correction.lock_source()','f9981399abc43c2988178347e9112dfc',false),('financial_sale_correction.actor()','59091f508eca5108b0891536e037a3e5',false),('financial_sale_correction.result(financial_sale_correction.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),('financial_sale_correction.validate(jsonb,boolean)','89dc02d54930035865aca26451876cfd',false),('financial_sale_correction.source(jsonb)','da86219af941e49b864aa7836833d061',false),('financial_sale_correction.plan(jsonb,jsonb,uuid)','dc23b6146925077744c438647846e0cc',false),('public.fn_financial_sale_correction_source_web(jsonb,uuid)','cd0f5972bf4a02a7e62ddb8c3450b4d5',true),('public.fn_financial_sale_correction_web(text,uuid,jsonb,uuid)','3420fd11eef712f8e52f2fefe2400533',true),('public.fn_financial_sale_correction_recover_web(uuid)','cd6a4348dec12bbbbeffa0db8d713144',true),('financial_sale_correction.assert_baseline()','66900a6d5f9826da0f9e3df02426bce0',false),('financial_sale_correction.metadata()','383cea92785c37b16d0a14b4c5718574',false),('financial_sale_correction.sale_metadata()','2182d68afda98f7bc2bd3de0d7251381',false),('hato_sale.actor()','4ce1a5e0c7feacdbfdfd97f26ac23726',false),('hato_sale.assert_retired()','ada0f86e5fd40d503f7274e3d4977cba',false),('hato_sale.finance()','faaf8458321604398f8f75a1cdb398af',false),('hato_sale.immutable()','0709b8df795367042a0bea61d8528ea6',false),('hato_sale.lock_source()','35bd07189be4bbf2dc0c964109c064bf',false),('hato_sale.result(hato_sale.requests)','be6a9f1b1687f4c3848fca9e63fbf025',false),('hato_sale.snapshot(jsonb)','4b521b3d1a958e7642597443f733ad00',false),('public.fn_hato_sale_web(text,uuid,jsonb,uuid)','cab938886c3462b9f497b1f415d53429',true))pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f' AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Sale correction function binding drift: %',f.signature;END IF;
 IF (SELECT count(*) FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=to_regprocedure(f.signature)),acldefault('f','postgres'::regrole))))<>(CASE WHEN f.secdef THEN 2 ELSE 1 END) OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=to_regprocedure(f.signature)),acldefault('f','postgres'::regrole)))a WHERE a.grantee NOT IN('postgres'::regrole,CASE WHEN f.secdef THEN 'authenticated'::regrole ELSE 'postgres'::regrole END) OR a.grantor<>'postgres'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable) THEN RAISE EXCEPTION 'Sale correction function authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_correction_request',27),('audit','immutable_correction_audit',27),('requests','no_truncate_correction_request',34),('audit','no_truncate_correction_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('financial_sale_correction.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='financial_sale_correction.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Sale correction immutable binding drift';END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_sale_correction FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_financial_sale_correction_source_web(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.fn_financial_sale_correction_source_web(jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_financial_sale_correction_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.fn_financial_sale_correction_web(text,uuid,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_financial_sale_correction_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION public.fn_financial_sale_correction_recover_web(uuid) TO authenticated;
DO $admission$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_controls()') AND md5(prosrc)='3f09cf29b4341b6036fffc3b757c868a' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed sale correction shared dependency';END IF;END $admission$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('financial_sale_correction.assert_controls()') AND md5(prosrc)='f9a5d7cb8bac695a5182259f1cb76c83' AND NOT prosecdef AND NOT proisstrict AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'financial_sale_correction.assert_controls()','EXECUTE')) THEN RAISE EXCEPTION 'Sale correction guard binding drift';END IF;
 PERFORM financial_sale_correction.assert_controls();

 PERFORM hato_income_metadata.assert_invoice_origins();
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_income_metadata.requests'::regclass),('hato_income_metadata.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_income_metadata.requests'::regclass,'hato_income_metadata.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.source(jsonb)','7b26364778fd4514d31338d6b15adfcb',false),
('hato_quincena.assert_controls()','4bd7ea1704f18a3ede3c788b4c8445ed',false),
('hato_income_metadata.capture_attachment(jsonb,uuid)','d358a56454fed478285661c726bddae9',false),
('hato_income_metadata.invoice_release_preview(uuid,uuid)','199bf1b02133f2a6ecb2ef42a6a74a8f',false),
('hato_income_metadata.assert_invoice_releases()','c6187fbf6752d997a1beb6e788b6a152',false),
('public.fn_hato_income_invoice_release_web(text,uuid,uuid,jsonb,uuid)','ac7921aa540401dd542285ab5f1159cb',true),
('hato_income_metadata.immutable_invoice_origin()','e6f5d14395531109d99160195d7ef02b',false),
('hato_income_metadata.assert_invoice_origins()','d6ee616ab0f25cc5acd874059ab83056',false),
('public.fn_hato_income_invoice_origin_web(text,uuid,uuid,jsonb,jsonb,uuid)','b6077948cf92ac02fbe4b59b152c1a36',true),
('hato_income_metadata.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_income_metadata.controls()','7b9600b73ecdc15fe454ae8d3ed047d8',false),
('hato_income_metadata.foreign_controls()','806a48677f4a224ba533f5e3c94594e1',false),
('hato_income_metadata.lock_source()','bd55361232101caf3d3f555157dca2ee',false),
('hato_income_metadata.actor()','385f4c9c1d309b0a5df0f70ecd58d907',false),
('hato_income_metadata.result(hato_income_metadata.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),
('hato_income_metadata.validate(jsonb,boolean)','f1176b3ad0c46a1e27d073ba52077a33',false),
('hato_income_metadata.source(jsonb)','234b1ad7248bc4d6891947243ea9fbb2',false),
('hato_income_metadata.plan(jsonb,jsonb,uuid)','2e7acd023aa14b80fd78094574c29248',false),
('public.fn_hato_income_metadata_source_web(jsonb,uuid)','4b37cd095547da518aab7bc3c85629f8',true),
('public.fn_hato_income_metadata_web(text,uuid,jsonb,uuid)','c30c67d3b644eeab1f43f7586daa22f6',true),
('public.fn_hato_income_metadata_recover_web(uuid)','a922f160af4c3a636b9b99e055b0d826',true),
('public.fn_hato_income_metadata_classify_web(uuid,uuid)','5118af86ac1a959bbf90d831e475d8d6',true),
('hato_income_metadata.baseline()','cc1ef953a4213ec1a4d3b2b405fa8222',false))pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(f.signature) AND md5(prosrc)=f.body AND prosecdef=f.secdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quincena core: %',f.signature;END IF;
 IF NOT f.secdef AND EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Private quincena core grant drift';END IF;
 IF f.secdef AND(has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Quincena web entry authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_quincena_request',27),('audit','immutable_quincena_audit',27),('requests','no_truncate_quincena_request',34),('audit','no_truncate_quincena_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('hato_income_metadata.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_income_metadata.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Quincena immutable control binding drift';END IF;
END $$;
SELECT financial_sale_correction.assert_baseline();
COMMIT;
