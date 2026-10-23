#!/usr/bin/env python3
"""Build Option2 sale financial correction from reviewed tracked sources only."""
import hashlib,re,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OLD=ROOT/'src/sql/security-candidates/hato-income-metadata.sql'
NEW=ROOT/'src/sql/security-candidates/financial-sale-correction.sql'
s=OLD.read_text();s=s[:s.index('CREATE FUNCTION public.fn_hato_income_metadata_classify_web')]
s=s[s.index('CREATE TABLE hato_income_metadata.requests'):]
s=s.replace('hato_income_metadata','financial_sale_correction').replace('fn_financial_sale_correction','fn_financial_sale_correction').replace('hato-quincena-owner:','financial-sale-correction-owner:').replace('hato-quincena-key:','financial-sale-correction-key:')
s=s.replace('immutable_quincena_', 'immutable_correction_').replace('no_truncate_quincena_', 'no_truncate_correction_').replace('one_unresolved_quincena','one_unresolved_correction')
def body(name,new):
 global s
 pattern=r'(CREATE FUNCTION '+re.escape(name)+r'\([^;]*?AS )(\$[a-z_]*\$)[\s\S]*?\2;'
 s,n=re.subn(pattern,lambda m:m[1]+m[2]+new+m[2]+';',s);assert n==1,name
body('financial_sale_correction.actor',"\nBEGIN RETURN hato_income_metadata.actor();END ")
body('financial_sale_correction.lock_source',"\nBEGIN PERFORM hato_income_metadata.lock_source();LOCK TABLE financial_sale_correction.requests,financial_sale_correction.audit IN SHARE ROW EXCLUSIVE MODE;END ")
body('financial_sale_correction.validate',r'''
DECLARE v jsonb;key text;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM(CASE WHEN observed THEN ARRAY['fields','kind','observed','targetId','version'] ELSE ARRAY['fields','kind','targetId','version'] END) OR p->'version' IS DISTINCT FROM '1'::jsonb OR p->>'kind' IS DISTINCT FROM 'saleFinancial' OR jsonb_typeof(p->'targetId') IS DISTINCT FROM 'string' OR(p->>'targetId')::uuid::text IS DISTINCT FROM p->>'targetId' OR(observed AND jsonb_typeof(p->'observed') IS DISTINCT FROM 'object') OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Exact bounded sale financial intent required';END IF;
 IF jsonb_typeof(p->'fields') IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'fields')k) IS DISTINCT FROM ARRAY['businessId','buyerId','categoryId','date','mediumId','name','regionId','value'] THEN RAISE EXCEPTION 'Only reviewed financial fields allowed';END IF;
 FOR key IN SELECT unnest(ARRAY['businessId','categoryId','mediumId','regionId']) LOOP v=p->'fields'->key;IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR(v#>>'{}')::uuid::text IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Canonical financial references required';END IF;END LOOP;
 v=p->'fields'->'buyerId';IF jsonb_typeof(v) NOT IN('null','string') OR(v<>'null'::jsonb AND(v#>>'{}')::uuid::text IS DISTINCT FROM v#>>'{}') THEN RAISE EXCEPTION 'Canonical optional buyer required';END IF;
 v=p->'fields'->'name';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}') NOT BETWEEN 1 AND 4000 OR btrim(v#>>'{}') IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Bounded financial description required';END IF;
 v=p->'fields'->'date';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR NOT isfinite((v#>>'{}')::date) OR to_char((v#>>'{}')::date,'YYYY-MM-DD') IS DISTINCT FROM v#>>'{}' THEN RAISE EXCEPTION 'Canonical financial date required';END IF;
 v=p->'fields'->'value';IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}' !~ '^(0|[1-9][0-9]{0,12})([.][0-9]{1,2})?$' OR(v#>>'{}')::numeric<=0 THEN RAISE EXCEPTION 'Exact positive bounded financial money required';END IF;
END ''')
body('financial_sale_correction.source',r'''
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
END ''')
body('financial_sale_correction.plan',r'''
 SELECT jsonb_build_object('kind','saleFinancial','beforeProduction',NULL,'afterProduction',NULL,'beforeIncome',s->'income','afterIncome',(s->'income')||jsonb_build_object('fecha',p->'fields'->'date','negocio_id',p->'fields'->'businessId','categoria_id',p->'fields'->'categoryId','nombre',p->'fields'->'name','region_id',p->'fields'->'regionId','medio_pago_id',p->'fields'->'mediumId','comprador_id',p->'fields'->'buyerId','valor',(p->'fields'->>'value')::numeric,'updated_at',NULL,'updated_by',p_owner),'tax',NULL);
''')
start=s.index(" IF r.intent->'fields'->'invoice'");end=s.index('\n IF NOT FOUND OR written',start)
s=s[:start]+''' new_income=new_income||jsonb_build_object('updated_at',now());
 UPDATE public.fin_ingresos SET fecha=(new_income->>'fecha')::date,negocio_id=(new_income->>'negocio_id')::uuid,categoria_id=(new_income->>'categoria_id')::uuid,nombre=new_income->>'nombre',region_id=(new_income->>'region_id')::uuid,medio_pago_id=(new_income->>'medio_pago_id')::uuid,comprador_id=(new_income->>'comprador_id')::uuid,valor=(new_income->>'valor')::numeric,updated_by=p_expected_owner WHERE id=(old_income->>'id')::uuid RETURNING to_jsonb(fin_ingresos.*) INTO written;'''+s[end:]
# Broad original domain/foreign snapshots plus exact controls enforce a financial-only footprint.
# Public entrypoints are authenticated-only; private helpers have no direct role grants.
# Every public entry checks the existing shared guard independently of new private guards.
s=s.replace('PERFORM financial_sale_correction.assert_baseline();','PERFORM hato_income_metadata.assert_baseline();PERFORM financial_sale_correction.assert_baseline();')
s='''-- NONNUMBERED candidate62; Santiago Option2. Local-only foundation, no caller/grant retirement.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_income_metadata.assert_baseline();
CREATE SCHEMA financial_sale_correction;
REVOKE ALL ON SCHEMA financial_sale_correction FROM PUBLIC,anon,authenticated,service_role;
'''+s
# Guard old shared dependencies first; no baseline changes or runtime-learned pins.
s+='''CREATE FUNCTION financial_sale_correction.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN PERFORM hato_income_metadata.assert_baseline();PERFORM hato_sale.assert_retired();PERFORM financial_sale_correction.assert_controls();END $$;
'''
s+='''CREATE FUNCTION financial_sale_correction.metadata() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $meta$
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
'''
metadata_function=re.search(r'CREATE FUNCTION financial_sale_correction.metadata\(\)[\s\S]*?\$meta\$;',s)[0]
s+=metadata_function.replace('financial_sale_correction.metadata()', 'financial_sale_correction.sale_metadata()').replace("'financial_sale_correction'","'hato_sale'")+'\n'
# Source-pinned function bodies and explicit role/config/shape/immutable trigger constraints.
funcs=[]
for m in re.finditer(r'CREATE FUNCTION ([\w.]+)\(([^;]*?)\) RETURNS ([^;]*?)AS (\$[a-z_]*\$)([\s\S]*?)\4;',s):
 name,args,header,_,code=m.groups();types=[]
 for arg in args.split(',') if args else []: types.append(arg.strip().split()[-1])
 funcs.append((name+'('+','.join(types)+')',hashlib.md5(code.encode()).hexdigest(),'SECURITY DEFINER' in header))
prior_metadata=json.loads((ROOT/'docs/security-integrity/financial-lifecycle-admission.json').read_text())['schema_admission']['functions']
for row in prior_metadata:
 if row['identity'].startswith('hato_sale.') or row['identity'].startswith('fn_hato_sale_web('):funcs.append((('public.' if row['identity'].startswith('fn_') else '')+row['identity'],row['body_md5'],row['security_definer']))
values=','.join("('%s','%s',%s)"%(name,sha,str(sec).lower()) for name,sha,sec in funcs)
s+='''CREATE FUNCTION financial_sale_correction.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 IF financial_sale_correction.sale_metadata() IS DISTINCT FROM 'b618fa852099e40a32cc150c3e2a37e8' THEN RAISE EXCEPTION 'Retained sale proof metadata drift';END IF;
 IF financial_sale_correction.metadata() IS DISTINCT FROM '98a83f73528eb664286f89b6964dbadc' THEN RAISE EXCEPTION 'Sale correction private metadata drift';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN(VALUES('financial_sale_correction.requests'::regclass),('financial_sale_correction.audit'::regclass))t(target) WHERE has_table_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR has_any_column_privilege(r.role,t.target,'SELECT,INSERT,UPDATE,REFERENCES')) OR EXISTS(SELECT 1 FROM pg_class WHERE oid IN('financial_sale_correction.requests'::regclass,'financial_sale_correction.audit'::regclass) AND(NOT relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres')) THEN RAISE EXCEPTION 'Sale correction private authority drift';END IF;
 FOR f IN SELECT * FROM(VALUES '''+values+''')pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND NOT p.proisstrict AND NOT p.proleakproof AND NOT p.proretset AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f' AND p.pronargdefaults=0 AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Sale correction function binding drift: %',f.signature;END IF;
 IF (SELECT count(*) FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=to_regprocedure(f.signature)),acldefault('f','postgres'::regrole))))<>(CASE WHEN f.secdef THEN 2 ELSE 1 END) OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=to_regprocedure(f.signature)),acldefault('f','postgres'::regrole)))a WHERE a.grantee NOT IN('postgres'::regrole,CASE WHEN f.secdef THEN 'authenticated'::regrole ELSE 'postgres'::regrole END) OR a.grantor<>'postgres'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable) THEN RAISE EXCEPTION 'Sale correction function authority drift';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('requests','immutable_correction_request',27),('audit','immutable_correction_audit',27),('requests','no_truncate_correction_request',34),('audit','no_truncate_correction_audit',34))e(relation,name,kind) WHERE NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('financial_sale_correction.'||e.relation)::regclass AND tgname=e.name AND tgtype=e.kind AND tgenabled='O' AND tgfoid='financial_sale_correction.immutable()'::regprocedure AND NOT tgdeferrable AND NOT tginitdeferred AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)) THEN RAISE EXCEPTION 'Sale correction immutable binding drift';END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial_sale_correction FROM PUBLIC,anon,authenticated,service_role;
'''
for name,_,sec in funcs:
 if sec and name.startswith('public.fn_financial_sale_correction'):s+='REVOKE ALL ON FUNCTION '+name+' FROM PUBLIC,anon,authenticated,service_role;GRANT EXECUTE ON FUNCTION '+name+' TO authenticated;\n'
prior=(ROOT/'src/sql/security-candidates/measured-income-boundary.sql').read_text()
match=re.search(r'CREATE OR REPLACE FUNCTION hato_income_metadata.assert_controls\(\)[^;]*?AS (\$[a-z_]*\$)([\s\S]*?)\1;',prior);assert match
old_body=match[2]
control=re.search(r'CREATE FUNCTION financial_sale_correction.assert_controls\(\)[^;]*?AS (\$[a-z_]*\$)([\s\S]*?)\1;',s);assert control
pin=hashlib.md5(control[2].encode()).hexdigest()
guard=""" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('financial_sale_correction.assert_controls()') AND md5(prosrc)='PIN' AND NOT prosecdef AND NOT proisstrict AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'financial_sale_correction.assert_controls()','EXECUTE')) THEN RAISE EXCEPTION 'Sale correction guard binding drift';END IF;
 PERFORM financial_sale_correction.assert_controls();
""".replace('PIN',pin)
s+="DO $admission$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_income_metadata.assert_controls()') AND md5(prosrc)='%s' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed sale correction shared dependency';END IF;END $admission$;\n"%hashlib.md5(old_body.encode()).hexdigest()
s+=match[0].replace(old_body,old_body.replace('BEGIN','BEGIN\n'+guard,1))+'\n'
s+='SELECT financial_sale_correction.assert_baseline();\nCOMMIT;\n'
NEW.write_text(s)
