#!/usr/bin/env python3
"""Emit source-pinned ordinary measured-income boundary; no private input/runtime baseline."""
import importlib.util,hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('retirement_build',Path(__file__).with_name('build-hato-quincena-retirement.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
FINGERPRINT='6ec7585498da87fc1f979b1f341319b5'
INVOICE_FINGERPRINT='e99ad6e933e03cbe419896411c40ee27'
md5=b.md5
helper="""
BEGIN
 -- Every ordinary invocation gets a fresh command snapshot after the association lock.
 -- RR/serializable snapshots could predate a newly committed association and are refused.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Measured income boundary requires a fresh read committed snapshot' USING ERRCODE='42501';END IF;
 PERFORM hato_quincena.actor();
 LOCK TABLE public.hato_produccion_quincenal IN SHARE MODE;
 PERFORM hato_income_metadata.assert_baseline();
 IF p_truncate OR EXISTS(SELECT 1 FROM public.hato_produccion_quincenal WHERE origen_dato='medido' AND fin_ingreso_id IN(p_old,p_new)) THEN RAISE EXCEPTION 'Measured income requires prepared Produccion or protected Finanzas metadata' USING ERRCODE='42501';END IF;
END """
binding=""" IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure('public.fn_hato_check_income_boundary(uuid,uuid,boolean)') AND md5(f.prosrc)='HELPER_HASH' AND f.prosecdef AND NOT f.proisstrict AND NOT f.proleakproof AND NOT f.proretset AND f.provolatile='v' AND f.proparallel='u' AND f.prokind='f' AND f.pronargdefaults=0 AND f.proargnames=ARRAY['p_old','p_new','p_truncate'] AND f.prorettype='pg_catalog.void'::regtype AND f.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(f.proowner)='postgres' AND (SELECT count(*) FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))))=2 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner)))a WHERE a.grantee NOT IN(f.proowner,'authenticated'::regrole) OR a.grantor<>f.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable)) THEN RAISE EXCEPTION 'Measured income helper binding drift' USING ERRCODE='42501';END IF;
""".replace('HELPER_HASH',md5(helper))
trigger="""
BEGIN
 IF TG_RELID<>'public.fin_ingresos'::regclass THEN RAISE EXCEPTION 'Income boundary target mismatch';END IF;
 -- Deliberately invoker: SECURITY DEFINER prepared operations execute as their pinned owner.
 -- Neither JWT claims, request headers, a custom GUC nor a caller argument grants exemption.
 IF current_user NOT IN('postgres','service_role') THEN
BINDING  IF TG_LEVEL='STATEMENT' THEN PERFORM public.fn_hato_check_income_boundary(NULL,NULL,TG_OP='TRUNCATE');
  ELSE PERFORM public.fn_hato_check_income_boundary(CASE WHEN TG_OP<>'INSERT' THEN OLD.id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.id END,false);END IF;
 END IF;
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL;ELSIF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END """.replace('BINDING',binding)
creation='''CREATE FUNCTION public.fn_hato_check_income_boundary(p_old uuid,p_new uuid,p_truncate boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$'''+helper+'''$$;
REVOKE ALL ON FUNCTION public.fn_hato_check_income_boundary(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_check_income_boundary(uuid,uuid,boolean) TO authenticated;
CREATE FUNCTION public.fn_hato_income_boundary_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$'''+trigger+'''$$;
REVOKE ALL ON FUNCTION public.fn_hato_income_boundary_trigger() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER measured_income_statement_boundary BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.fin_ingresos FOR EACH STATEMENT EXECUTE FUNCTION public.fn_hato_income_boundary_trigger();
CREATE TRIGGER zz_measured_income_row_boundary BEFORE INSERT OR UPDATE OR DELETE ON public.fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.fn_hato_income_boundary_trigger();
'''
q,qb=b.function('hato-quincena-retirement.sql','hato_quincena.assert_baseline')
m,mb=b.function('hato-quincena-retirement.sql','hato_income_metadata.assert_baseline')
c,cb=b.function('hato-quincena-retirement.sql','hato_quincena.assert_controls')
mc,mcb=b.function('hato-quincena-retirement.sql','hato_income_metadata.assert_controls')
i,ib=b.function('hato-quincena-retirement.sql','invoice_upload.assert_controls')
qb2=qb.replace(b.FINGERPRINT,FINGERPRINT);mb2=mb.replace(b.FINGERPRINT,FINGERPRINT);ib2=ib.replace(b.INVOICE_FINGERPRINT,INVOICE_FINGERPRINT)
cb2=cb.replace("FOR f IN SELECT * FROM(VALUES", "FOR f IN SELECT * FROM(VALUES\n"+','.join("('%s','%s',%s)"%(name,md5(body),str(sec).lower()) for name,body,sec in [('public.fn_hato_check_income_boundary(uuid,uuid,boolean)',helper,True),('public.fn_hato_income_boundary_trigger()',trigger,False)])+',')
for before,after in [(qb,qb2),(mb,mb2),(ib,ib2)]:cb2=cb2.replace(md5(before),md5(after))
cb2=cb2.replace('BEGIN','BEGIN\n'+binding.replace('pg_proc f ','pg_proc boundary_proc ').replace('f.','boundary_proc.'),1)
mcb2=mcb.replace(md5(cb),md5(cb2))
sql='''-- NONNUMBERED candidate61. Exact offline replay only; never production installation.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed measured-income boundary owner required';END IF;
'''
for name,body in [('hato_quincena.assert_baseline()',qb),('hato_income_metadata.assert_baseline()',mb),('hato_quincena.assert_controls()',cb),('hato_income_metadata.assert_controls()',mcb),('invoice_upload.assert_controls()',ib)]:
 sql+=" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('%s') AND md5(prosrc)='%s' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed financial boundary dependency';END IF;\n"%(name,md5(body))
sql+=' PERFORM hato_income_metadata.assert_baseline();PERFORM invoice_upload.assert_controls();\nEND $admit$;\n'+creation+'-- END NEW BOUNDARY\n'
for old,body,new in [(q,qb,qb2),(m,mb,mb2),(c,cb,cb2),(mc,mcb,mcb2),(i,ib,ib2)]:sql+=old.replace(body,new)+'\n'
sql+='SELECT hato_income_metadata.assert_baseline();SELECT invoice_upload.assert_controls();\nCOMMIT;\n'
if __name__=='__main__':
 (ROOT/'src/sql/security-candidates/measured-income-boundary.sql').write_text(sql)
