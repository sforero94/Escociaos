#!/usr/bin/env python3
"""Protected milk weighing SQL foundation; local four-export synthetic replay only."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_weighing',Path(__file__).with_name('hato-catalog-retirement-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-milk-weighing.sql'
def query(sql):
 base=p.state_query(sql).removesuffix(';')
 return "SELECT ("+base+")||jsonb_build_object('hato_milk_weighing.requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_weighing.requests x),'hato_milk_weighing.audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_weighing.audit x));"
def install(sql):
 p.install(sql);existing_query=p.state_query(sql);before=sql(existing_query)
 for ddl in ['ALTER TABLE hato_pesajes_leche FORCE ROW LEVEL SECURITY;','ALTER TABLE hato_pesajes_leche ADD COLUMN synthetic_drift text;','ALTER TABLE hato_pesajes_leche DROP CONSTRAINT hato_pesajes_leche_animal_id_fecha_key;',"UPDATE pg_index SET indisvalid=false WHERE indexrelid='hato_pesajes_leche_animal_id_fecha_key'::regclass;"]:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or sql(existing_query)!=before or sql("SELECT to_regnamespace('hato_milk_weighing') IS NULL;")!='t':raise AssertionError('Milk foundation installation drift not rolled back')
 sql(SOURCE.read_text())
 if sql(existing_query)!=before:raise AssertionError('Milk foundation installation changed existing rows')
 if sql("SELECT (SELECT count(*) FROM hato_milk_weighing.requests)+(SELECT count(*) FROM hato_milk_weighing.audit);")!='0':raise AssertionError('Milk foundation installed nonempty new controls')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];state=lambda:sql(query(sql));owner=c.OWNER;animal,existing,key=[c.uid() for _ in range(3)]
 sql("INSERT INTO hato_config(clave,valor) VALUES('dia_pesaje_semanal','{\"iso\":3}') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,created_by) VALUES("+u(animal)+",'Synthetic protected milk cow','hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_pesajes_leche(id,animal_id,fecha,litros_am,litros_pm,litros_total,fuente,created_by) VALUES('+u(existing)+','+u(animal)+",'2026-10-07',1,1,2,'historico',"+u(owner)+');')
 observed=json.loads(sql('SELECT to_jsonb(x) FROM hato_pesajes_leche x WHERE id='+u(existing)+';'));intent=dict(version=1,year=2026,month=10,cells=[dict(animalId=animal,date='2026-10-07',am=8,pm=2,observed=observed),dict(animalId=animal,date='2026-10-14',am=9,pm=None,observed=None),dict(animalId=animal,date='2026-10-15',am=3,pm=1,observed=None)])
 def action(mode,payload=None,k=key,actor=owner,ok=True):return call('fn_hato_milk_weighing_web',[lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(actor)],actor=actor,ok=ok)
 def refuse(label,ddl='',mode='post',payload=None,k=key):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(owner)+';SELECT fn_hato_milk_weighing_web('+','.join([lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(owner)])+');COMMIT;',False)
  if failed.returncode==0 or state()!=before:raise AssertionError(label+' did not fully roll back')
  check(True,label+' refuses with complete domain/control rollback')
 before=state();check(action('status')['state']=='unknown' and state()==before,'unknown milk original status is read only')
 refuse('stale displayed cell','UPDATE hato_pesajes_leche SET litros_total=4 WHERE id='+u(existing)+';',mode='prepare',payload=intent)
 refuse('string weekday config',"UPDATE hato_config SET valor='{\"iso\":\"3\"}' WHERE clave='dia_pesaje_semanal';",mode='prepare',payload=intent)
 refuse('injected actor',mode='prepare',payload=dict(intent,created_by=owner))
 refuse('duplicate cell',mode='prepare',payload=dict(intent,cells=[intent['cells'][0],intent['cells'][0]]))
 refuse('blank is not zero',mode='prepare',payload=dict(intent,cells=[dict(intent['cells'][0],am=None,pm=None)]))
 prepared=action('prepare',intent);check(prepared['state']=='pending' and len(prepared['plan']['accepted'])==2 and len(prepared['plan']['rejected'])==1,'captured accepted/rejected milk review precedes atomic posting')
 before=state();failed=sql('BEGIN;UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OTHER)+";SELECT fn_hato_milk_weighing_web('status',"+u(key)+',NULL,'+u(c.OTHER)+');COMMIT;',False);check(failed.returncode!=0 and state()==before,'different active genuine owner cannot recover another milk original')
 check(set(prepared['original'])=={'rows','animals','config'},'milk original excludes unrelated financial/profile domains')
 check(action('prepare',intent)==prepared,'same original milk preparation returns same reserved identities')
 refuse('replacement while original pending',mode='prepare',payload=intent,k=c.uid())
 for label,ddl in [('competing cell','UPDATE hato_pesajes_leche SET litros_total=6 WHERE id='+u(existing)+';'),('competing config',"UPDATE hato_config SET valor='{\"iso\":4}' WHERE clave='dia_pesaje_semanal';"),('competing animal','UPDATE hato_animales SET estado=\'vendida\' WHERE id='+u(animal)+';'),('revoked actor','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';'),('expired review','ALTER TABLE hato_milk_weighing.requests DISABLE TRIGGER immutable_registration_request;UPDATE hato_milk_weighing.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';')]:refuse(label,ddl)
 for table,event,body in [('public.hato_pesajes_leche','BEFORE UPDATE','RETURN NULL;'),('public.hato_pesajes_leche','BEFORE INSERT','RETURN NULL;'),('public.hato_pesajes_leche','BEFORE UPDATE','NEW.litros_total=500;RETURN NEW;'),('hato_milk_weighing.audit','BEFORE INSERT','RETURN NULL;'),('hato_milk_weighing.requests','BEFORE UPDATE','RETURN NULL;'),('hato_milk_weighing.audit','AFTER INSERT',"UPDATE public.usuarios SET activo=false WHERE id="+u(owner)+';RETURN NEW;')]:
  refuse(table+' '+event,'CREATE FUNCTION public.synthetic_weighing_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN '+body+'END $$;CREATE TRIGGER synthetic_weighing_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_weighing_fault();')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(action,'post');b=pool.submit(action,'post');posted=a.result();check(posted==b.result(),'simultaneous same-original milk posts produce one proof')
 after=json.loads(state());allowed={'public.hato_pesajes_leche','public.hato_correcciones','hato_milk_weighing.requests','hato_milk_weighing.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'protected milk preserves every unrelated domain/backup/financial/control row')
 rows=json.loads(sql('SELECT jsonb_agg(to_jsonb(x) ORDER BY fecha) FROM hato_pesajes_leche x WHERE animal_id='+u(animal)+';'));audit=json.loads(sql('SELECT receipt FROM hato_milk_weighing.audit WHERE request_key='+u(key)+';'))
 check(rows==posted['receipt']['after'] and audit==posted['receipt'] and len(rows)==2 and rows[0]['id']==existing and rows[0]['created_by']==observed['created_by'] and rows[0]['created_at']==observed['created_at'],'independent exact milk rows/creation identity/audit equal original receipt')
 check(rows[0]['litros_am']==8 and rows[0]['litros_pm']==2 and rows[0]['litros_total']==10 and rows[1]['litros_am']==9 and rows[1]['litros_pm'] is None and rows[1]['litros_total']==9 and rows[1]['created_by']==owner,'independent expected AM/PM totals and current creation actor match selected cells')
 check(len(posted['receipt']['corrections'])==1 and posted['receipt']['corrections'][0]['corregido_por']==owner,'one exact trusted current-actor correction accompanies the existing cell edit')
 before=state();check(action('post')==posted and action('status')==posted and state()==before,'lost-response original milk retry never duplicates/overwrites')
 check(call('fn_hato_milk_weighing_recover_web',[u(owner)],actor=owner)==posted,'independent owner recovery returns original milk proof')
 refuse('replacement after uncertain commit',mode='prepare',payload=intent,k=c.uid())
 ack=action('acknowledge');check(ack['acknowledged'] and ack['receipt']==posted['receipt'],'milk terminal acknowledgment preserves immutable proof')
 canceled=c.uid();action('resolve',k=canceled);check(action('prepare',intent,k=canceled)['state']=='canceled','cancellation-before-prepare fences delayed milk reservation')
 for role in ['anon','authenticated','service_role']:
  before=state();failed=sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_milk_weighing.requests;COMMIT;',False);check(failed.returncode!=0 and state()==before,role+' private milk controls denied')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();files=list(dict.fromkeys([Path(__file__),SOURCE,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-milk-admission-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing milk foundation sources cannot be certified')
 result.update(coordinated_candidate_count=43,admission_rollback_probes=4,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports/synthetic Auth/private socket only; never production.','Web SQL foundation only. Browser/Telegram/week-edit/discard/capture/Storage/finance/backfill callers and grants unchanged; hosted/ordinary-role/global/capacity/recovery remain open.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
