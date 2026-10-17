#!/usr/bin/env python3
"""Pajilla lot/new bull creation on four local metadata exports; never production."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-animal-registration-retirement-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-catalog-creation.sql'
def query(sql):return t.t.t.state_query(sql)
def install(sql):
 t.install(sql);existing=query(sql);before=sql(existing)
 source=SOURCE.read_text();baseline=source[source.index(' SELECT baseline INTO fingerprint'):source.index(' IF fingerprint IS DISTINCT')].replace('SELECT baseline INTO fingerprint','SELECT baseline')
 current=sql(baseline);before_acl=t.acl(sql);original=sql('BEGIN;GRANT INSERT ON public.hato_animales TO anon,authenticated;'+baseline+'ROLLBACK;').splitlines()[-1]
 if current!='7e357e3178db5a801e60189e511c5880' or original!='5ae11977b7a8e2f574bd41bb07f76ddc' or t.acl(sql)!=before_acl or sql(baseline)!=current or sql(existing)!=before:raise AssertionError('Exact retired-INSERT-only graph provenance not reproduced')
 install.baseline=dict(current=current,prior=original,only_rolled_back_change='Restore INSERT to anon/authenticated on local public.hato_animales')
 for ddl,marker in [("ALTER FUNCTION hato_pajilla_use.inventory() SET search_path=public;",'inventory snapshot helper'),("ALTER TABLE hato_toros FORCE ROW LEVEL SECURITY;",'source graph'),("ALTER TABLE hato_pajillas ADD COLUMN synthetic_unreviewed text;",'inventory graph'),("CREATE TABLE public.synthetic_catalog_ref(id uuid);",'domain inventory'),("ALTER FUNCTION hato_birth_undo.capture_domain() SET search_path=public;",'capture_domain helper')]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or marker not in failed.stderr or sql(existing)!=before or sql("SELECT to_regnamespace('hato_catalog_creation') IS NULL;")!='t':
   p=Path('/tmp/escocia-catalog-admission-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failed.stderr);raise AssertionError('Catalog creation admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Catalog creation install changed existing rows')

def exercise(sql,ctx):
 t.exercise.client=exercise.client;t.exercise(sql,ctx);exercise.parent_sdk=t.exercise.sdk;check,call=ctx['check'],ctx['call'];state=lambda:sql(query(sql))
 bull=c.uid();sql('INSERT INTO hato_toros(id,nombre,activo) VALUES('+u(bull)+",'Synthetic catalog selected bull',true);")
 def test(kind,values,probes=False):
  key=c.uid();intent=dict(version=1,kind=kind,input=values)
  def action(mode,payload=None,owner=c.OWNER,k=key,ok=True):return call('fn_hato_catalog_creation_web',[lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(owner)],actor=owner,ok=ok)
  before=state();check(action('status')['state']=='unknown' and state()==before,kind+' unknown status is read only')
  before=json.loads(state());prepared=action('prepare',intent);after=json.loads(state());check(prepared['state']=='pending' and prepared['plan']['row']['created_by']==c.OWNER and all(v==after[k] for k,v in before.items() if k!='hato_catalog_creation.requests'),kind+' prepare reserves exact full row and trusted actor without domain mutation')
  check(action('prepare',intent)==prepared,kind+' original prepare repeats reserved UUID')
  check(call('fn_hato_catalog_creation_recover_web',[u(c.OWNER)],actor=c.OWNER)==prepared,kind+' pending original survives browser key loss')
  def refuse(label,ddl,mode='post',payload=None,k=key,marker=None):
   before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_catalog_creation_web("+lit(mode)+','+u(k)+','+(js(payload) if payload is not None else 'NULL::jsonb')+','+u(c.OWNER)+');COMMIT;',False)
   if failed.returncode==0 or (marker and marker.lower() not in failed.stderr.lower()) or state()!=before:
    p=Path('/tmp/escocia-catalog-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
   check(True,kind+' '+label+' refuses with full-state rollback')
  if probes:
   refuse('competing selected bull edit','UPDATE hato_toros SET activo=false WHERE id='+u(bull)+';',marker='source/day changed')
   refuse('competing lot writer',"INSERT INTO hato_pajillas(toro_id,cantidad_inicial) VALUES("+u(bull)+',0);',marker='source/day changed')
   refuse('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';',marker='active')
   refuse('demoted actor',"UPDATE usuarios SET rol='Verificador' WHERE id="+u(c.OWNER)+';',marker='active')
   refuse('expired review','ALTER TABLE hato_catalog_creation.requests DISABLE TRIGGER immutable_registration_request;UPDATE hato_catalog_creation.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';',marker='source/day changed')
   for table,op,body,marker in [('public.hato_pajillas','BEFORE INSERT','RETURN NULL;','lot suppressed'),('public.hato_pajillas','BEFORE INSERT','NEW.cantidad_inicial=NEW.cantidad_inicial+1;RETURN NEW;','lot suppressed'),('hato_catalog_creation.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_catalog_creation.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('hato_catalog_creation.audit','AFTER INSERT',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'readback mismatch'),('hato_catalog_creation.requests','AFTER UPDATE','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OWNER)+';RETURN NEW;','readback mismatch')]:
    refuse(table+' '+op,'CREATE FUNCTION public.synthetic_catalog_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN '+body+' END $$;CREATE TRIGGER synthetic_catalog_fault '+op+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_catalog_fault();',marker=marker)
  if kind=='toro':refuse('suppressed bull INSERT','CREATE FUNCTION public.synthetic_catalog_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL;END $$;CREATE TRIGGER synthetic_catalog_fault BEFORE INSERT ON hato_toros FOR EACH ROW EXECUTE FUNCTION public.synthetic_catalog_fault();',marker='bull suppressed')
  refuse('replacement while pending','',mode='prepare',payload=intent,k=c.uid(),marker='Recover original')
  before=state();other=action('status',owner=c.OTHER,ok=False);check(other.returncode!=0 and state()==before,kind+' another genuine owner cannot recover original')
  before=json.loads(state())
  with concurrent.futures.ThreadPoolExecutor(2) as pool:
   a=pool.submit(action,'post');b=pool.submit(action,'post');posted=a.result();check(posted==b.result(),kind+' same-key concurrent posts create exactly one row')
  after=json.loads(state());table=posted['plan']['table'];allowed={'public.'+table,'hato_catalog_creation.requests','hato_catalog_creation.audit'}
  check(all(v==after[k] for k,v in before.items() if k not in allowed),kind+' preserves every unrelated domain/backup/financial/private row')
  row=json.loads(sql('SELECT to_jsonb(x) FROM '+table+' x WHERE id='+u(posted['plan']['row']['id'])+';'));audit=json.loads(sql('SELECT receipt FROM hato_catalog_creation.audit WHERE request_key='+u(key)+';'))
  check(row==posted['receipt']['after']==dict(prepared['plan']['row'],created_at=posted['receipt']['recordedAt']) and audit==posted['receipt'] and audit['before'] is None,kind+' independent exact row/audit/current actor reconstruct strict original receipt')
  if kind=='lot':check(sql('SELECT cantidad_inicial=0 AND usos=0 AND cantidad_actual=0 FROM v_hato_pajillas_stock WHERE pajilla_id='+u(row['id'])+';')=='t','zero-quantity lot remains valid with exact zero-stock view')
  before=state();check(action('status')==posted and action('post')==posted and state()==before,kind+' immutable original retry never duplicates creation')
  refuse('replacement after uncertain commit','',mode='prepare',payload=intent,k=c.uid(),marker='Recover original')
  check(call('fn_hato_catalog_creation_recover_web',[u(c.OWNER)],actor=c.OWNER)==posted,kind+' independent owner recovery returns committed original')
  acknowledged=action('acknowledge');check(acknowledged['acknowledged'] and acknowledged['receipt']==posted['receipt'],kind+' explicit acknowledgment releases slot while preserving original evidence')
  if kind=='toro':sql('UPDATE hato_toros SET activo=NOT activo WHERE id='+u(row['id'])+';')
  else:sql('UPDATE hato_pajillas SET activa=false WHERE id='+u(row['id'])+';')
  before=state();check(action('post')==acknowledged and state()==before,kind+' original retry never overwrites later catalog/lifecycle edits')
  newkey=c.uid();action('resolve',k=newkey);check(action('prepare',intent,k=newkey)['state']=='canceled',kind+' cancellation-before-prepare fences delayed reservation')
  return row,action,refuse
 lot,_,_=test('lot',dict(toro_id=bull,cantidad_inicial=0),True)
 toro,action,refuse=test('toro',dict(nombre='Synthetic new inactive bull',tipo=None,raza=None,activo=False))
 for bad in [dict(version=1,kind='lot',input=dict(toro_id=bull,cantidad_inicial=-1)),dict(version=1,kind='lot',input=dict(toro_id=bull,cantidad_inicial=1.5)),dict(version=1,kind='lot',input=dict(toro_id=bull,cantidad_inicial=2147483648)),dict(version=1,kind='lot',input=dict(toro_id=bull,cantidad_inicial=1,costo=100)),dict(version=1,kind='toro',input=dict(nombre=' Name ',tipo=None,raza=None,activo=True)),dict(version=1,kind='toro',input=dict(nombre='Synthetic new inactive bull'.upper(),tipo=None,raza=None,activo=True))]:refuse('invalid/injected/duplicate creation','',mode='prepare',payload=bad,k=c.uid())
 refuse('inactive selected bull','UPDATE hato_toros SET activo=false WHERE id='+u(toro['id'])+';',mode='prepare',payload=dict(version=1,kind='lot',input=dict(toro_id=toro['id'],cantidad_inicial=1)),k=c.uid(),marker='active bull')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-catalog-creation-browser-native.mjs'))],input=json.dumps(dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,bull=bull,stateQuery=query(sql))),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-catalog-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise AssertionError('Catalog creation SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual strict installed SDK lot/bull original recovery equals independent native row/audit')

def main():
 p=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):p.add_argument('--'+name,type=Path,required=True)
 a=p.parse_args();exercise.client=a.client.resolve();files=[r.ROOT/'src/utils/hato/hatoCatalogCreationBrowserAttempt.ts',r.ROOT/'src/components/hato/hooks/useCatalogCreation.ts',r.ROOT/'src/components/hato/components/CatalogCreationDialog.tsx',r.ROOT/'src/components/hato/components/PajillaCompraDialog.tsx',r.ROOT/'src/components/hato/components/ToroFormDialog.tsx',r.ROOT/'src/components/hato/hooks/useHatoPajillas.ts',r.ROOT/'src/components/hato/hooks/useHatoToros.ts',r.ROOT/'src/components/hato/PajillasView.tsx',r.ROOT/'src/hooks/useFormDraft.ts',r.ROOT/'src/utils/draftStorage.ts',r.ROOT/'src/__tests__/hatoCatalogCreationBrowser.test.tsx',r.ROOT/'src/__tests__/fixtures/hatoCatalogCreation.ts',*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-catalog-creation-browser-native.mjs'),Path(__file__).with_name('hato-animal-registration-retirement-replay.py'),r.ROOT/'src/utils/hato/hatoCatalogCreationProtocol.ts',r.ROOT/'src/utils/hato/alertResponseProtocol.ts',r.ROOT/'src/__tests__/hatoCatalogCreation.test.ts'];sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing catalog creation source cannot be certified')
 result.update(coordinated_candidate_count=38,baseline_provenance=install.baseline,admission_rollback_probes=5,sdk_proof=exercise.sdk,registration_sdk_proof=exercise.parent_sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four private local metadata exports, synthetic Auth/private socket only; never production.','Actual lot/new-bull durable browser adapter/source and mounted callers; catalog edits/direct grants unchanged. Synthetic Web Locks stub, not hosted browser certification. No financial purchase/event/history inferred. Hosted/global/ordinary-role/capacity/recovery gates remain open.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
