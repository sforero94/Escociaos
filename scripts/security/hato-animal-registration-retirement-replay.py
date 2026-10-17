#!/usr/bin/env python3
"""Narrow direct registration INSERT retirement; local private metadata only."""
import argparse
import importlib.util
import json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-animal-registration-browser-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-animal-registration-retirement.sql'
def acl(sql):return sql("SELECT jsonb_build_object('table',relacl::text,'columns',(SELECT jsonb_agg(jsonb_build_array(attname,attacl::text) ORDER BY attnum) FROM pg_attribute WHERE attrelid=c.oid AND attnum>0 AND NOT attisdropped)) FROM pg_class c WHERE oid='hato_animales'::regclass;")
def matrix(sql):return json.loads(sql("SELECT jsonb_object_agg(role,rights) FROM(SELECT r.role,(SELECT jsonb_object_agg(p,has_table_privilege(r.role,'public.hato_animales',p)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'])p) rights FROM(VALUES('anon'),('authenticated'),('service_role'))r(role))x;"))
def install(sql):
 t.install(sql);before=sql(t.t.state_query(sql));prior=matrix(sql)
 for ddl,marker in [("GRANT INSERT(nombre) ON hato_animales TO authenticated;",'source graph'),("ALTER FUNCTION fn_hato_animal_registration_web(text,uuid,jsonb,uuid) SET search_path=public;",'entry function')]:
  before_acl=acl(sql);failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or acl(sql)!=before_acl or sql(t.t.state_query(sql))!=before:raise AssertionError('Retirement admission/ACL rollback '+marker)
 sql(SOURCE.read_text());after=matrix(sql)
 for role,rights in prior.items():
  for op,value in rights.items():
   if after[role][op]!=(False if role in('anon','authenticated') and op=='INSERT' else value):raise AssertionError('Unexpected privilege scope')
 if sql(t.t.state_query(sql))!=before:raise AssertionError('Retirement changed existing rows')
 install.matrix=after

def exercise(sql,ctx):
 t.exercise.client=exercise.client;t.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];query=t.t.state_query(sql);state=lambda:sql(query)
 check(not install.matrix['authenticated']['INSERT'] and install.matrix['service_role']['INSERT'],'table privilege matrix removes only ordinary INSERT; service lane remains explicit')
 check(sql("SELECT NOT EXISTS(SELECT 1 FROM pg_attribute a CROSS JOIN(VALUES('anon'),('authenticated'))r(role) WHERE a.attrelid='hato_animales'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.role,a.attrelid,a.attnum,'INSERT'));")=='t','every effective ordinary-role column INSERT privilege is absent')
 def refuse(label,statements,actor=c.OWNER,role='authenticated',marker=None):
  before=state();before_acl=acl(sql);failed=sql('BEGIN;SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor)+';'+statements+'COMMIT;',False)
  if failed.returncode==0 or (marker and marker.lower() not in failed.stderr.lower()) or state()!=before or acl(sql)!=before_acl:
   p=Path('/tmp/escocia-registration-retirement-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with full-state/ACL rollback')
 for actor in(c.OWNER,c.OTHER):
  for statement in ["INSERT INTO hato_animales(nombre,etapa) VALUES('Synthetic bypass','ternera');","INSERT INTO hato_animales DEFAULT VALUES;","INSERT INTO hato_animales(id,nombre,etapa) VALUES(gen_random_uuid(),'Synthetic upsert','ternera') ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre;"]:
   refuse('ordinary '+actor+' direct INSERT/upsert',statement,actor=actor,marker='permission denied')
 refuse('anonymous direct INSERT',"INSERT INTO hato_animales(nombre,etapa) VALUES('Synthetic anon','ternera');",role='anon',marker='permission denied')
 intent=dict(version=1,input=dict(numero=None,nombre='Retirement drift probe',etapa='ternera',raza=None,fecha_nacimiento=None,origen='compra'));key=c.uid()
 def action(mode,payload=None):return call('fn_hato_animal_registration_web',[lit(mode),u(key),js(payload) if payload else 'NULL::jsonb',u(c.OWNER)],actor=c.OWNER)
 action('prepare',intent)
 for label,ddl in [('restored table INSERT','GRANT INSERT ON hato_animales TO authenticated;'),('restored column-only INSERT','GRANT INSERT(nombre) ON hato_animales TO authenticated;'),('restored PUBLIC column INSERT','GRANT INSERT(nombre) ON hato_animales TO PUBLIC;'),('restored inherited INSERT','CREATE ROLE synthetic_registration_writer NOLOGIN INHERIT;GRANT INSERT ON hato_animales TO synthetic_registration_writer;GRANT synthetic_registration_writer TO authenticated;')]:
  before=state();before_acl=acl(sql);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_animal_registration_web('post',"+u(key)+',NULL,'+u(c.OWNER)+');COMMIT;',False)
  if failed.returncode==0 or 'privilege restored' not in failed.stderr or state()!=before or acl(sql)!=before_acl:raise AssertionError(label+' guard/rollback')
  check(True,label+' refuses original prepared post without mutation')
 before=state();before_acl=acl(sql);failed=sql("BEGIN;CREATE FUNCTION public.synthetic_registration_regrant() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN GRANT INSERT ON public.hato_animales TO authenticated;RETURN NEW;END $$;CREATE TRIGGER synthetic_registration_regrant AFTER INSERT ON hato_animal_registration.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_registration_regrant();SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub="+lit(c.OWNER)+";SELECT fn_hato_animal_registration_web('post',"+u(key)+',NULL,'+u(c.OWNER)+');COMMIT;',False)
 if failed.returncode==0 or 'privilege restored' not in failed.stderr or state()!=before or acl(sql)!=before_acl:raise AssertionError('Late restored INSERT failed atomic guard')
 check(True,'late audit-trigger grant restoration rolls back created animal/audit/control/ACL together')
 posted=action('post');check(posted['state']=='committed' and posted['receipt']['after']['created_by']==c.OWNER,'protected registration still creates exact trusted original after direct INSERT retirement');action('acknowledge')
 exercise.sdk=t.exercise.sdk

def main():
 p=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):p.add_argument('--'+name,type=Path,required=True)
 a=p.parse_args();exercise.client=a.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-animal-registration-browser-replay.py'),Path(__file__).with_name('hato-animal-registration-browser-native.mjs')]
 files.extend(r.ROOT/f for f in ['src/utils/hato/hatoAnimalRegistrationProtocol.ts','src/utils/hato/hatoAnimalRegistrationBrowserAttempt.ts','src/components/hato/components/CrearAnimalDialog.tsx','src/components/hato/hooks/useAnimalRegistration.ts','src/components/hato/hooks/useCrearHatoAnimal.ts','src/__tests__/hatoAnimalRegistrationBrowser.test.tsx']);sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing retirement source cannot be certified')
 result.update(coordinated_candidate_count=37,admission_rollback_probes=2,sdk_proof=exercise.sdk,ordinary_table_privileges=install.matrix,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports and synthetic private Auth/socket only; never production.','Only ordinary direct animal INSERT retired. Service lane and global/ordinary-role/runtime/hosted stale-writer/capacity/recovery gates remain open.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
