-- NONNUMBERED protected measured quincena-income foundation after53candidates.
-- OFFLINE ONLY. No old caller/grant/RPC retirement or historical repair.
BEGIN;
SELECT hato_birth_undo.lock_domain();
CREATE SCHEMA hato_quincena;
REVOKE ALL ON SCHEMA hato_quincena FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_quincena.baseline() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $baseline$
WITH targets AS(SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN('hato_produccion_quincenal','fin_ingresos','fin_negocios','fin_categorias_ingresos','fin_regiones','fin_medios_pago','fin_compradores','hato_config','hato_eventos','hato_correcciones','usuarios')),
sections AS(
 SELECT 'relations' label,jsonb_agg(jsonb_build_array(relname,pg_get_userbyid(relowner),relacl,relrowsecurity,relforcerowsecurity,relkind) ORDER BY relname) value FROM targets
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(t.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),a.attacl,a.attcollation::regcollation::text) ORDER BY t.relname,a.attnum) FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(t.relname,c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY t.relname,c.conname) FROM targets t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(t.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct) ORDER BY t.relname,i.indexrelid::regclass::text) FROM targets t JOIN pg_index i ON i.indrelid=t.oid
 UNION ALL SELECT 'triggers',jsonb_agg(jsonb_build_array(t.relname,g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) ORDER BY t.relname,g.tgname) FROM targets t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
 UNION ALL SELECT 'policies',jsonb_agg(jsonb_build_array(p.tablename,p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) ORDER BY p.tablename,p.policyname) FROM pg_policies p JOIN targets t ON t.relname=p.tablename AND p.schemaname='public'
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,f.proacl,md5(f.prosrc),f.provolatile,f.prokind) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE (n.nspname='public' AND f.proname IN('fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta')) OR f.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM targets) AND NOT tgisinternal)
 UNION ALL SELECT 'incoming_fk',jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY n.nspname,c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND k.confrelid IN(SELECT oid FROM targets)
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(t.relname,r.rulename,md5(pg_get_ruledef(r.oid))) ORDER BY t.relname,r.rulename),'[]') FROM pg_rewrite r JOIN targets t ON t.oid=r.ev_class
)
SELECT md5((SELECT jsonb_object_agg(label,value)::text FROM sections));
$baseline$;
CREATE FUNCTION hato_quincena.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_upload_discard.assert_history_baseline();
 IF hato_quincena.baseline() IS DISTINCT FROM 'b95d6032027f578f8c119d4190089e06' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $$;
SELECT hato_quincena.assert_baseline();
CREATE TABLE hato_quincena.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_unresolved_quincena ON hato_quincena.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_quincena.audit(request_key uuid PRIMARY KEY REFERENCES hato_quincena.requests,receipt jsonb NOT NULL);
ALTER TABLE hato_quincena.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_quincena.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_quincena FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_quincena.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable quincena original/audit';END IF;
 IF(OLD.state='pending' AND NEW.state IN('committed','canceled') AND(to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt'))
 OR(OLD.state IN('committed','canceled') AND NOT OLD.acknowledged AND NEW.acknowledged AND(to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original quincena';
END $$;
CREATE TRIGGER immutable_quincena_request BEFORE UPDATE OR DELETE ON hato_quincena.requests FOR EACH ROW EXECUTE FUNCTION hato_quincena.immutable();
CREATE TRIGGER immutable_quincena_audit BEFORE UPDATE OR DELETE ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION hato_quincena.immutable();
CREATE TRIGGER no_truncate_quincena_request BEFORE TRUNCATE ON hato_quincena.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_quincena.immutable();
CREATE TRIGGER no_truncate_quincena_audit BEFORE TRUNCATE ON hato_quincena.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_quincena.immutable();
CREATE FUNCTION hato_quincena.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_quincena.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_quincena.audit x));
$$;
CREATE FUNCTION hato_quincena.foreign_controls() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;rows jsonb;result jsonb='{}';BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','information_schema','hato_quincena') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM %I.%I x',t.nspname,t.relname) INTO rows;result=result||jsonb_build_object(t.nspname||'.'||t.relname,rows);END LOOP;RETURN result;
END $$;
CREATE FUNCTION hato_quincena.lock_source() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;BEGIN
 PERFORM hato_birth_undo.lock_domain();
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','auth','information_schema','hato_quincena') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE',t.nspname,t.relname);END LOOP;
 LOCK TABLE storage.buckets,storage.objects IN SHARE MODE;
 LOCK TABLE hato_quincena.requests,hato_quincena.audit IN SHARE ROW EXCLUSIVE MODE;
END $$;
CREATE FUNCTION hato_quincena.actor() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM 1 FROM public.usuarios WHERE id=auth.uid() AND activo IS TRUE AND rol::text='Gerencia' FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Fresh active Gerencia quincena owner required' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('origin','web','profileId',auth.uid());END $$;
CREATE FUNCTION hato_quincena.result(r hato_quincena.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION hato_quincena.validate(p jsonb,observed boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f jsonb;v jsonb;first_day date;last_day date;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM (CASE WHEN observed THEN ARRAY['fields','kind','observed','targetId','version'] ELSE ARRAY['fields','kind','targetId','version'] END) OR p->'version' IS DISTINCT FROM '1'::jsonb OR p->>'kind' NOT IN('save','delete') OR jsonb_typeof(p->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'targetId') NOT IN('null','string') OR(p->'targetId'<>'null'::jsonb AND(p->>'targetId')::uuid::text IS DISTINCT FROM p->>'targetId') OR(observed AND jsonb_typeof(p->'observed') IS DISTINCT FROM 'object') OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Exact bounded quincena intent/source required';END IF;
 IF p->>'kind'='delete' THEN IF p->'targetId'='null'::jsonb OR p->'fields' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Explicit existing measured pair deletion required';END IF;RETURN;END IF;
 f=p->'fields';IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(f)k) IS DISTINCT FROM ARRAY['buyerId','cows','gross','incomeDate','liters','mediumId','month','name','notes','pomar','quincena','regionId','year'] THEN RAISE EXCEPTION 'Exact measured quincena fields required';END IF;
 FOR v IN SELECT f->'year' UNION ALL SELECT f->'month' UNION ALL SELECT f->'quincena' LOOP IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR(v::text)::numeric<>trunc((v::text)::numeric) THEN RAISE EXCEPTION 'Integer quincena period required';END IF;END LOOP;
 IF(f->>'year')::int NOT BETWEEN 2020 AND 2100 OR(f->>'month')::int NOT BETWEEN 1 AND 12 OR(f->>'quincena')::int NOT IN(1,2) THEN RAISE EXCEPTION 'Bounded quincena period required';END IF;
 FOR v IN SELECT f->'liters' UNION ALL SELECT f->'gross' LOOP IF jsonb_typeof(v) IS DISTINCT FROM 'number' OR(v::text)::numeric<0 OR(v::text)::numeric>9999999999 THEN RAISE EXCEPTION 'Bounded nonnegative measured amount required';END IF;END LOOP;IF(f->>'gross')::numeric<=0 THEN RAISE EXCEPTION 'Confirmed positive gross required';END IF;
 FOR v IN SELECT f->'pomar' UNION ALL SELECT f->'cows' LOOP IF jsonb_typeof(v) NOT IN('null','number') OR(jsonb_typeof(v)='number' AND((v::text)::numeric<0 OR(v::text)::numeric>9999999)) THEN RAISE EXCEPTION 'Bounded optional measured amount required';END IF;END LOOP;
 IF f->'cows'<>'null'::jsonb AND(f->>'cows')::numeric<>trunc((f->>'cows')::numeric) THEN RAISE EXCEPTION 'Whole measured cow count required';END IF;
 FOR v IN SELECT f->'regionId' UNION ALL SELECT f->'mediumId' LOOP IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR(v#>>'{}')::uuid::text IS DISTINCT FROM(v#>>'{}') THEN RAISE EXCEPTION 'Canonical current catalog UUID required';END IF;END LOOP;
 IF jsonb_typeof(f->'buyerId') NOT IN('null','string') OR(f->'buyerId'<>'null'::jsonb AND(f->>'buyerId')::uuid::text IS DISTINCT FROM f->>'buyerId') THEN RAISE EXCEPTION 'Canonical optional buyer required';END IF;
 FOR v IN SELECT f->'notes' UNION ALL SELECT f->'name' LOOP IF jsonb_typeof(v) NOT IN('null','string') OR(jsonb_typeof(v)='string' AND length(v#>>'{}')>2000) THEN RAISE EXCEPTION 'Bounded optional quincena text required';END IF;END LOOP;
 IF jsonb_typeof(f->'incomeDate') IS DISTINCT FROM 'string' OR(f->>'incomeDate')::date::text IS DISTINCT FROM f->>'incomeDate' OR(f->>'incomeDate')::date NOT BETWEEN '2020-01-01'::date AND '2100-12-31'::date THEN RAISE EXCEPTION 'Canonical bounded income date required';END IF;
END $$;
CREATE FUNCTION hato_quincena.source(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE q jsonb;income jsonb;f jsonb=p->'fields';yr int;mo int;half int;claims jsonb='[]';t record;claimed bigint;BEGIN
 SELECT to_jsonb(x) INTO q FROM public.hato_produccion_quincenal x WHERE id=(p->>'targetId')::uuid;
 IF p->'targetId'<>'null'::jsonb AND q IS NULL THEN RAISE EXCEPTION 'Original measured quincena missing';END IF;
 SELECT to_jsonb(x) INTO income FROM public.fin_ingresos x WHERE id=(q->>'fin_ingreso_id')::uuid;
 yr=CASE WHEN p->>'kind'='save' THEN(f->>'year')::int ELSE(q->>'anio')::int END;mo=CASE WHEN p->>'kind'='save' THEN(f->>'month')::int ELSE(q->>'mes')::int END;half=CASE WHEN p->>'kind'='save' THEN(f->>'quincena')::int ELSE(q->>'quincena')::int END;
 IF income IS NOT NULL THEN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','auth','information_schema','hato_quincena') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP
 EXECUTE format('SELECT count(*) FROM %I.%I x WHERE position($1 in lower(to_jsonb(x)::text))>0 OR position($2 in lower(to_jsonb(x)::text))>0',t.nspname,t.relname) INTO claimed USING income->>'id',replace(income->>'id','-','');IF claimed>0 THEN claims=claims||jsonb_build_array(jsonb_build_object('table',t.nspname||'.'||t.relname,'count',claimed));END IF;END LOOP;END IF;
 RETURN jsonb_build_object('production',q,'income',income,'periodRows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_produccion_quincenal x WHERE anio=yr AND mes=mo AND quincena=half),
 'aliases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_produccion_quincenal x WHERE fin_ingreso_id=(income->>'id')::uuid),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_eventos x WHERE fin_ingreso_id=(income->>'id')::uuid),'protectedClaims',claims,
 'businesses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.fin_negocios x WHERE nombre='Hato Lechero' OR id=(income->>'negocio_id')::uuid),
 'categories',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.fin_categorias_ingresos x WHERE negocio_id IN(SELECT id FROM public.fin_negocios WHERE nombre='Hato Lechero') OR id=(income->>'categoria_id')::uuid),
 'region',(SELECT to_jsonb(x) FROM public.fin_regiones x WHERE id=coalesce((f->>'regionId')::uuid,(income->>'region_id')::uuid)),
 'medium',(SELECT to_jsonb(x) FROM public.fin_medios_pago x WHERE id=coalesce((f->>'mediumId')::uuid,(income->>'medio_pago_id')::uuid)),
 'buyer',(SELECT to_jsonb(x) FROM public.fin_compradores x WHERE id=coalesce((f->>'buyerId')::uuid,(income->>'comprador_id')::uuid)),
 'icaConfig',(SELECT to_jsonb(x) FROM public.hato_config x WHERE clave='retencion_ica_leche'));
END $$;
CREATE FUNCTION hato_quincena.plan(p jsonb,s jsonb,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE q jsonb=s->'production';income jsonb=s->'income';f jsonb=p->'fields';after_q jsonb;after_income jsonb;business jsonb;category jsonb;rate numeric=0;ica numeric;net numeric;liters numeric;gross numeric;applies boolean;first_day date;last_day date;BEGIN
 IF q<>'null'::jsonb THEN
 IF q->>'origen_dato'<>'medido' OR income='null'::jsonb OR jsonb_array_length(s->'aliases')<>1 OR(s->'aliases'->0->>'id') IS DISTINCT FROM q->>'id' OR s->'events'<>'[]'::jsonb OR s->'protectedClaims'<>'[]'::jsonb THEN RAISE EXCEPTION 'Exclusive measured pair required; preserve shared/derived/event/protected history';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'businesses')b WHERE b->>'id'=income->>'negocio_id' AND b->>'nombre'='Hato Lechero') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'categories')c WHERE c->>'id'=income->>'categoria_id' AND c->>'negocio_id'=income->>'negocio_id' AND c->>'nombre' ILIKE '%leche%') THEN RAISE EXCEPTION 'Reviewed measured milk income ownership required';END IF;
 END IF;
 IF p->>'kind'='delete' THEN RETURN jsonb_build_object('kind','delete','beforeProduction',q,'beforeIncome',income,'afterProduction',NULL,'afterIncome',NULL,'tax',NULL);END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'periodRows')x WHERE x->>'id' IS DISTINCT FROM q->>'id') THEN RAISE EXCEPTION 'Reviewed destination quincena occupied';END IF;
 IF(SELECT count(*) FROM jsonb_array_elements(s->'businesses')b WHERE b->>'nombre'='Hato Lechero' AND b->'activo'='true'::jsonb)<>1 THEN RAISE EXCEPTION 'One current active Hato business required';END IF;
 SELECT b INTO business FROM jsonb_array_elements(s->'businesses')b WHERE b->>'nombre'='Hato Lechero' AND b->'activo'='true'::jsonb;
 SELECT c INTO category FROM jsonb_array_elements(s->'categories')c WHERE c->>'negocio_id'=business->>'id' AND c->>'nombre' ILIKE '%leche%' AND c->'activo'='true'::jsonb ORDER BY c->>'nombre',c->>'id' LIMIT 1;
 IF category IS NULL OR(SELECT count(*) FROM jsonb_array_elements(s->'categories')c WHERE c->>'negocio_id'=business->>'id' AND c->>'nombre'=category->>'nombre' AND c->'activo'='true'::jsonb)<>1 THEN RAISE EXCEPTION 'Unambiguous current milk category required';END IF;
 IF s->'region'='null'::jsonb OR s->'medium'='null'::jsonb OR s->'region'->'activo' IS DISTINCT FROM 'true'::jsonb OR s->'medium'->'activo' IS DISTINCT FROM 'true'::jsonb OR(f->'buyerId'<>'null'::jsonb AND(s->'buyer'='null'::jsonb OR s->'buyer'->'activo' IS DISTINCT FROM 'true'::jsonb)) THEN RAISE EXCEPTION 'Current active financial catalog selections required';END IF;
 gross=(f->>'gross')::numeric;liters=(f->>'liters')::numeric;applies=((f->>'year')::int>2026 OR((f->>'year')::int=2026 AND(f->>'month')::int>=7));
 IF applies THEN IF jsonb_typeof(s->'icaConfig'->'valor') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Current numeric ICA config required';END IF;rate=(s->'icaConfig'->>'valor')::numeric;IF rate<0 OR rate>=1 THEN RAISE EXCEPTION 'ICA rate out of range';END IF;END IF;
 ica=round(gross*rate,2);net=round(gross-ica,2);first_day=make_date((f->>'year')::int,(f->>'month')::int,1);last_day=(first_day+interval '1 month'-interval '1 day')::date;
 after_income=CASE WHEN income='null'::jsonb THEN to_jsonb(jsonb_populate_record(NULL::public.fin_ingresos,jsonb_build_object('id',gen_random_uuid(),'created_by',p_owner))) ELSE income END;
 after_income=after_income||jsonb_build_object('fecha',f->'incomeDate','negocio_id',business->'id','categoria_id',category->'id','region_id',f->'regionId','medio_pago_id',f->'mediumId','comprador_id',f->'buyerId','nombre',coalesce(nullif(f->>'name',''),liters::text||' L'),'valor',net,'cantidad',liters,'precio_unitario',CASE WHEN liters>0 THEN round(net/liters,2) END,'updated_at',NULL);
 after_q=CASE WHEN q='null'::jsonb THEN to_jsonb(jsonb_populate_record(NULL::public.hato_produccion_quincenal,jsonb_build_object('id',gen_random_uuid(),'created_by',p_owner,'fuente','web','origen_dato','medido','fin_ingreso_id',after_income->'id'))) ELSE q END;
 after_q=after_q||jsonb_build_object('anio',f->'year','mes',f->'month','quincena',f->'quincena','fecha_inicio',CASE WHEN(f->>'quincena')::int=1 THEN first_day ELSE first_day+15 END,'fecha_fin',CASE WHEN(f->>'quincena')::int=1 THEN first_day+14 ELSE last_day END,'litros_total',NULL,'litros_pomar_confirmado',f->'pomar','num_vacas_ordeno',f->'cows','num_vacas_ordeno_origen',CASE WHEN f->'cows'<>'null'::jsonb THEN 'medido' END,'precio_bruto_litro',CASE WHEN liters>0 THEN round(gross/liters,2) END,'notas',f->'notes','updated_at',NULL,'updated_by',p_owner);
 -- Normalize through exact column types before the owner reviews the plan.
 after_income=to_jsonb(jsonb_populate_record(NULL::public.fin_ingresos,after_income));after_q=to_jsonb(jsonb_populate_record(NULL::public.hato_produccion_quincenal,after_q));
 RETURN jsonb_build_object('kind','save','beforeProduction',q,'beforeIncome',income,'afterProduction',after_q,'afterIncome',after_income,'tax',jsonb_build_object('applies',applies,'rate',rate,'gross',gross,'ica',ica,'net',net,'liters',liters,'grossUnit',CASE WHEN liters>0 THEN round(gross/liters,2) END,'netUnit',CASE WHEN liters>0 THEN round(net/liters,2) END));
END $$;
CREATE FUNCTION public.fn_hato_quincena_source_web(p_draft jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;s jsonb;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current quincena source owner required' USING ERRCODE='42501';END IF;
 actor=hato_quincena.actor();PERFORM hato_quincena.validate(p_draft,false);PERFORM hato_quincena.lock_source();PERFORM hato_quincena.assert_baseline();s=hato_quincena.source(p_draft);
 IF octet_length(s::text)>2097152 THEN RAISE EXCEPTION 'Bounded quincena source exceeded';END IF;
 IF actor IS DISTINCT FROM hato_quincena.actor() THEN RAISE EXCEPTION 'Quincena source actor changed';END IF;
 RETURN jsonb_build_object('version',1,'owner',p_expected_owner,'source',s,'effectiveDate',(now() AT TIME ZONE 'America/Bogota')::date);
END $$;
CREATE FUNCTION public.fn_hato_quincena_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_quincena.requests;expected hato_quincena.requests;before_domain jsonb;expected_domain jsonb;before_foreign jsonb;before_controls jsonb;expected_controls jsonb;s jsonb;old_q jsonb;old_income jsonb;new_q jsonb;new_income jsonb;written jsonb;qrow public.hato_produccion_quincenal;irow public.fin_ingresos;traces jsonb;receipt_value jsonb;a hato_quincena.audit;wa hato_quincena.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original quincena owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_quincena.actor();PERFORM hato_quincena.assert_baseline();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR(p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original quincena action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-key:'||p_request_key::text,0));
 PERFORM hato_quincena.lock_source();SELECT * INTO r FROM hato_quincena.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original quincena belongs to another owner' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_quincena.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original quincena audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_quincena.result(r);END IF;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_foreign=hato_quincena.foreign_controls();before_controls=hato_quincena.controls();expected_controls=before_controls;
 IF p_action='prepare' THEN
 PERFORM hato_quincena.validate(p_intent,true);
 IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original quincena intent changed';END IF;RETURN hato_quincena.result(r);END IF;
 IF EXISTS(SELECT 1 FROM hato_quincena.requests WHERE owner_id=p_expected_owner AND NOT acknowledged AND state IN('pending','committed')) THEN RAISE EXCEPTION 'Recover original quincena before replacement';END IF;
 s=hato_quincena.source(p_intent);IF s IS DISTINCT FROM p_intent->'observed' THEN RAISE EXCEPTION 'Displayed quincena financial source changed';END IF;
 r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=s;r.plan=hato_quincena.plan(p_intent,s,p_expected_owner);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
 INSERT INTO hato_quincena.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena preparation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_quincena.requests SELECT expected.* RETURNING * INTO r;
 ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_quincena.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;ELSE RETURN hato_quincena.result(r);END IF;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
 IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Terminal original quincena required';END IF;IF r.acknowledged THEN RETURN hato_quincena.result(r);END IF;
 expected=r;expected.acknowledged=true;UPDATE hato_quincena.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
 IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared quincena required';END IF;IF r.state='committed' THEN RETURN hato_quincena.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled quincena cannot post';END IF;
 s=hato_quincena.source(r.intent);IF s IS DISTINCT FROM r.original OR r.effective_date IS DISTINCT FROM(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Original quincena source/day changed; resolve original';END IF;
 old_q=r.plan->'beforeProduction';old_income=r.plan->'beforeIncome';new_q=r.plan->'afterProduction';new_income=r.plan->'afterIncome';
 IF r.intent->>'kind'='delete' THEN
 DELETE FROM public.hato_produccion_quincenal WHERE id=(old_q->>'id')::uuid RETURNING to_jsonb(hato_produccion_quincenal.*) INTO written;IF NOT FOUND OR written IS DISTINCT FROM old_q THEN RAISE EXCEPTION 'Quincena deletion suppressed/mutated';END IF;
 DELETE FROM public.fin_ingresos WHERE id=(old_income->>'id')::uuid RETURNING to_jsonb(fin_ingresos.*) INTO written;IF NOT FOUND OR written IS DISTINCT FROM old_income THEN RAISE EXCEPTION 'Quincena income deletion suppressed/mutated';END IF;
 ELSE
 new_income=new_income||jsonb_build_object('updated_at',now());new_q=new_q||jsonb_build_object('updated_at',now());
 IF old_q='null'::jsonb THEN new_income=new_income||jsonb_build_object('created_at',now());new_q=new_q||jsonb_build_object('created_at',now());END IF;
 irow=jsonb_populate_record(NULL::public.fin_ingresos,new_income);qrow=jsonb_populate_record(NULL::public.hato_produccion_quincenal,new_q);
 IF old_q='null'::jsonb THEN INSERT INTO public.fin_ingresos SELECT irow.* RETURNING to_jsonb(fin_ingresos.*) INTO written;
 ELSE UPDATE public.fin_ingresos SET fecha=irow.fecha,negocio_id=irow.negocio_id,region_id=irow.region_id,categoria_id=irow.categoria_id,nombre=irow.nombre,comprador_id=irow.comprador_id,valor=irow.valor,medio_pago_id=irow.medio_pago_id,cantidad=irow.cantidad,precio_unitario=irow.precio_unitario WHERE id=irow.id RETURNING to_jsonb(fin_ingresos.*) INTO written;END IF;
 IF NOT FOUND OR written IS DISTINCT FROM new_income THEN RAISE EXCEPTION 'Quincena income write suppressed/mutated';END IF;
 IF old_q='null'::jsonb THEN INSERT INTO public.hato_produccion_quincenal SELECT qrow.* RETURNING to_jsonb(hato_produccion_quincenal.*) INTO written;
 ELSE UPDATE public.hato_produccion_quincenal SET anio=qrow.anio,mes=qrow.mes,quincena=qrow.quincena,fecha_inicio=qrow.fecha_inicio,fecha_fin=qrow.fecha_fin,litros_pomar_confirmado=qrow.litros_pomar_confirmado,num_vacas_ordeno=qrow.num_vacas_ordeno,num_vacas_ordeno_origen=qrow.num_vacas_ordeno_origen,precio_bruto_litro=qrow.precio_bruto_litro,notas=qrow.notas,updated_at=qrow.updated_at,updated_by=qrow.updated_by WHERE id=qrow.id RETURNING to_jsonb(hato_produccion_quincenal.*) INTO written;END IF;
 IF NOT FOUND OR written IS DISTINCT FROM new_q THEN RAISE EXCEPTION 'Quincena production write suppressed/mutated';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
 IF jsonb_array_length(traces)<>(CASE WHEN old_q<>'null'::jsonb AND old_q IS DISTINCT FROM new_q THEN 1 ELSE 0 END) THEN RAISE EXCEPTION 'Exact quincena correction count required';END IF;
 IF jsonb_array_length(traces)=1 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_produccion_quincenal' AND t->>'operacion'=CASE WHEN new_q='null'::jsonb THEN 'delete' ELSE 'update' END AND t->'datos_anteriores'=old_q AND t->'datos_nuevos'=new_q AND t->>'fila_id'=old_q->>'id' AND t->'animal_id'='null'::jsonb AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->'motivo'='null'::jsonb) THEN RAISE EXCEPTION 'Exact trusted quincena correction required';END IF;
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_produccion_quincenal',CASE WHEN old_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_q) END,CASE WHEN new_q='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_q) END);
 expected_domain=hato_chequeo_integrity.patch(expected_domain,'fin_ingresos',CASE WHEN old_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(old_income) END,CASE WHEN new_income='null'::jsonb THEN '[]'::jsonb ELSE jsonb_build_array(new_income) END);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
 receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_expected_owner,'actor',actor,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'recordedAt',now(),'before',jsonb_build_object('production',old_q,'income',old_income),'after',jsonb_build_object('production',new_q,'income',new_income),'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
 a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO hato_quincena.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Quincena trusted audit suppressed/mutated';END IF;
 expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_quincena.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quincena committed control suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_quincena.assert_baseline();
 IF hato_quincena.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_quincena.foreign_controls() IS DISTINCT FROM before_foreign OR hato_quincena.actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Quincena final authority/domain/foreign-control mismatch';END IF;
 RETURN hato_quincena.result(r);
END $$;
CREATE FUNCTION public.fn_hato_quincena_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_quincena.requests;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current quincena recovery owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_quincena.actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-quincena-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_quincena.requests WHERE owner_id=p_expected_owner AND NOT acknowledged AND state IN('pending','committed');IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_hato_quincena_web('status',r.request_key,NULL,p_expected_owner);
END $$;
CREATE FUNCTION hato_quincena.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('hato_quincena.requests'::regclass),('hato_quincena.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('hato_quincena.requests'::regclass,'hato_quincena.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Private quincena control authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES
('hato_quincena.immutable()','f1071b1c13456df84eea7e1655b57f78',false),
('hato_quincena.controls()','6241844ce6d339af0a282e7cd7d1d865',false),
('hato_quincena.foreign_controls()','faaeb2d8c8ffd24a6f29d4095bc24f7f',false),
('hato_quincena.lock_source()','ccd46d04571598cf2ea982a385db4a35',false),
('hato_quincena.actor()','385f4c9c1d309b0a5df0f70ecd58d907',false),
('hato_quincena.result(hato_quincena.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),
('hato_quincena.validate(jsonb,boolean)','62c000fdf74ffe8982c54606d10ed78a',false),
('hato_quincena.source(jsonb)','3306bd312fd7356dd82b39d0c6519606',false),
('hato_quincena.plan(jsonb,jsonb,uuid)','76264aa015b9f8f66b69e62ff01b90bc',false),
('public.fn_hato_quincena_source_web(jsonb,uuid)','982468a5b18742beec5fc0c0929c2e94',true),
('public.fn_hato_quincena_web(text,uuid,jsonb,uuid)','58fd2dd83e5f48ee4d72f3a3a1c44a50',true),
('public.fn_hato_quincena_recover_web(uuid)','da453030de673b9e9232ae40fdfcb0e4',true),
('hato_quincena.baseline()','cc1ef953a4213ec1a4d3b2b405fa8222',false))pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(f.signature) AND md5(prosrc)=f.body AND prosecdef=f.secdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quincena core: %',f.signature;END IF;
 IF NOT f.secdef AND EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Private quincena core grant drift';END IF;
 IF f.secdef AND(has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') OR NOT has_function_privilege('authenticated',f.signature,'EXECUTE')) THEN RAISE EXCEPTION 'Quincena web entry authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_quincena_request',27),('audit','immutable_quincena_audit',27),('requests','no_truncate_quincena_request',34),('audit','no_truncate_quincena_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('hato_quincena.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='hato_quincena.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Quincena immutable control binding drift';END IF;
END $$;
CREATE OR REPLACE FUNCTION hato_quincena.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_upload_discard.assert_history_baseline();PERFORM hato_quincena.assert_controls();
 IF hato_quincena.baseline() IS DISTINCT FROM 'b95d6032027f578f8c119d4190089e06' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_quincena FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_quincena_web(text,uuid,jsonb,uuid),public.fn_hato_quincena_recover_web(uuid),public.fn_hato_quincena_source_web(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_quincena_web(text,uuid,jsonb,uuid),public.fn_hato_quincena_recover_web(uuid),public.fn_hato_quincena_source_web(jsonb,uuid) TO authenticated;
SELECT hato_quincena.assert_baseline();
COMMIT;
