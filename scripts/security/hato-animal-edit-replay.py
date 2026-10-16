#!/usr/bin/env python3
"""Atomic general animal edit, on the four-export local schema only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('retirement',Path(__file__).with_name('hato-sale-retirement-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-animal-edit.sql'
def install(sql):
 t.install(sql)
 baseline=sql(Path(__file__).with_name('hato-animal-edit-baseline-query.sql').read_text());Path('/tmp/escocia-animal-edit-baseline-hash.txt').write_text(baseline)
 source=SOURCE.read_text().replace('ANIMAL_EDIT_BASELINE_PENDING',baseline)
 existing_query=t.state_query(sql);before=sql(existing_query)
 for drift,marker in (("ALTER TABLE public.hato_toros ADD COLUMN synthetic_unreviewed boolean;","Unreviewed animal edit source graph"),("ALTER TABLE public.hato_eventos FORCE ROW LEVEL SECURITY;","Unreviewed animal edit source graph"),("ALTER FUNCTION hato_death.snapshot(uuid) SET search_path=public;","Unreviewed animal edit snapshot helper")):
  failed=sql('BEGIN;'+drift+source,False)
  if failed.returncode==0 or marker not in failed.stderr or sql("SELECT to_regnamespace('hato_animal_edit') IS NULL;")!='t' or sql(existing_query)!=before:raise AssertionError('Animal edit admission rollback')
 sql(source)
 if sql(existing_query)!=before:raise AssertionError('Installation changed existing rows')

def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId']
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 base="SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot'
 query="SELECT jsonb_build_object('base',("+base+"),'source',alert_cron.source(),'requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_animal_edit.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_animal_edit.audit x));"
 state=lambda:sql(query)
 def animal_edit(mode,key,intent=None,owner=c.OWNER,expected=None,ok=True):return call('fn_hato_animal_edit_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or owner)],actor=owner,ok=ok)
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'))
 day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 mother,toro=c.uid(),c.uid()
 sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(mother)+",796,'Synthetic mother','vaca','activa');INSERT INTO hato_toros(id,nombre) VALUES("+u(toro)+",'Synthetic father');")
 changes={k:animal[k] for k in ('numero','nombre','etapa','raza','fecha_nacimiento','etapa_forzada','madre_id','padre_toro_id')};changes.update(numero=794,nombre='Reviewed synthetic edit',madre_id=mother,padre_toro_id=toro)
 intent=dict(version=1,animalId=target,observedAnimal=animal,changes=changes)
 key=c.uid();prepared=animal_edit('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['original']['animal']==animal,'original observed animal and related graph reserved without domain mutation')
 before=state();check(animal_edit('prepare',key,intent)==prepared and state()==before,'same-key preparation preserves original graph/effective day')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   Path('/tmp/escocia-animal-edit-unexpected-private.log').touch(mode=0o600,exist_ok=True);Path('/tmp/escocia-animal-edit-unexpected-private.log').write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+';SELECT fn_hato_animal_edit_web('+lit('post')+','+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 refuse('cross owner',lambda:animal_edit('status',key,owner=c.OTHER,expected=c.OWNER,ok=False),'owner')
 refuse('late source change',lambda:raw('UPDATE hato_animales SET notas=\'Synthetic competing edit\' WHERE id='+u(target)+';'),'graph changed')
 intruder=c.uid();collision='INSERT INTO hato_animales SELECT (jsonb_populate_record(NULL::hato_animales,'+js(dict(animal,id=intruder,numero=794,estado='activa'))+')).*;'
 refuse('competing active tag',lambda:raw(collision),'hato_animales_numero_activa_unique')
 refuse('elapsed prepared day',lambda:raw('ALTER TABLE hato_animal_edit.requests DISABLE TRIGGER immutable_animal_edit_request;UPDATE hato_animal_edit.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';ALTER TABLE hato_animal_edit.requests ENABLE TRIGGER immutable_animal_edit_request;'),'day elapsed')
 refuse('missing profile',lambda:animal_edit('status',key,owner=c.uid(),ok=False),'active')
 for table,event,body,marker in [('public.hato_animales','BEFORE UPDATE','RETURN NULL;','state suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','correction audit'),('hato_animal_edit.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_animal_edit.requests','BEFORE UPDATE','RETURN NULL;','control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_animal_edit_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_animal_edit_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_animal_edit_fault();'
  refuse(table+' suppression',lambda ddl=ddl:raw(ddl),marker)
 # A distinct reviewed key competes for exactly the same still-original source.
 competing=c.uid();animal_edit('prepare',competing,intent)
 for label,ddl,marker in [('animal identity mutation',"CREATE FUNCTION public.synthetic_animal_edit_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.nombre='Unexpected identity';RETURN NEW;END $f$;CREATE TRIGGER synthetic_animal_edit_mutate BEFORE UPDATE ON hato_animales FOR EACH ROW EXECUTE FUNCTION synthetic_animal_edit_mutate();",'state suppressed'),('late unrelated profile edit',"CREATE FUNCTION public.synthetic_animal_edit_mutate() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.usuarios SET activo=NOT activo WHERE id="+u(c.OTHER)+";RETURN NEW;END $f$;CREATE TRIGGER synthetic_animal_edit_mutate AFTER UPDATE ON hato_animales FOR EACH ROW EXECUTE FUNCTION synthetic_animal_edit_mutate();",'source mismatch')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 before_post=json.loads(state())['base']
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  x=pool.submit(animal_edit,'post',key);y=pool.submit(animal_edit,'post',key);posted=x.result();other=y.result()
 refuse('competing prepared animal_edit',lambda:animal_edit('post',competing,ok=False),'graph changed')
 after_post=json.loads(state())['base'];allowed={'public.hato_animales','public.hato_correcciones','hato_animal_edit.requests','hato_animal_edit.audit'}
 check(all(v==after_post[k] for k,v in before_post.items() if k not in allowed),'all other public/backup/financial/clinical/private evidence remains byte-identical')
 check(posted==other and posted['state']=='committed','concurrent original post produces one edit/correction/trusted receipt')
 before=state();check(animal_edit('status',key)==posted and animal_edit('post',key)==posted and state()==before,'lost response recovers original receipt without repeat mutation')
 check(posted['receipt']['after']['animal']==dict(animal,**changes),'only eight permitted fields change; state/date/notes/identity/attribution stay exact')
 check(json.loads(sql('SELECT receipt FROM hato_animal_edit.audit WHERE request_key='+u(key)+';'))==posted['receipt'],'independent trusted audit equals returned proof')
 fencekey=c.uid();fence=animal_edit('resolve',fencekey);check(fence['state']=='canceled' and animal_edit('prepare',fencekey,intent)==fence,'cancel before prepare permanently fences original key')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_animal_edit.requests;COMMIT;',False),'permission denied')
 sql('UPDATE usuarios SET activo=false WHERE id='+u(c.OWNER)+';');refuse('revoked status',lambda:animal_edit('status',key,ok=False),'active');sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OWNER)+';')
 # Selected genealogy references are exact CAS inputs, even when target is unchanged.
 current=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'));new_intent=dict(intent,observedAnimal=current,changes=dict(changes,nombre='Second edit'))
 k2=c.uid();animal_edit('prepare',k2,new_intent)
 for table,ref in [('hato_animales',mother),('hato_toros',toro)]:
  ddl='BEGIN;UPDATE '+table+" SET nombre='Competing genealogy' WHERE id="+u(ref)+";SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub="+lit(c.OWNER)+";SELECT fn_hato_animal_edit_web('post',"+u(k2)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;'
  refuse('selected '+table+' source change',lambda ddl=ddl:sql(ddl,False),'graph changed')
 # Intent cannot carry lifecycle or unexpected values.
 for extra in ({'estado':'muerta'},{'fecha_estado':day},{'notas':'unreviewed'}):
  bad=dict(new_intent,changes=dict(new_intent['changes'],**extra));refuse('unreviewed editable field',lambda bad=bad:animal_edit('prepare',c.uid(),bad,ok=False),'Exact bounded')
 # Existing picker restrictions apply to new links, without changing retained historical links.
 bad_mother,bad_toro=c.uid(),c.uid()
 sql('INSERT INTO hato_animales(id,numero,etapa,estado) VALUES('+u(bad_mother)+",793,'toro','activa');INSERT INTO hato_toros(id,nombre,activo) VALUES("+u(bad_toro)+",'Inactive synthetic father',false);")
 for field,value,marker in [('madre_id',target,'missing or self'),('madre_id',bad_mother,'picker contract'),('padre_toro_id',bad_toro,'active picker contract')]:
  bad=dict(new_intent,changes=dict(new_intent['changes'],**{field:value}));refuse('invalid new genealogy '+field,lambda bad=bad:animal_edit('prepare',c.uid(),bad,ok=False),marker)
 for role in ('anon','service_role'):
  refuse(role+' public RPC execution',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+";SELECT fn_hato_animal_edit_web('status',"+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False),'permission denied')
 sdk_animal=c.uid();sql('INSERT INTO hato_animales SELECT (jsonb_populate_record(NULL::hato_animales,'+js(dict(animal,id=sdk_animal,numero=799,nombre='Synthetic SDK animal edit'))+')).*;')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,animal=sdk_animal,day=day)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-animal-edit-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  path=Path('/tmp/escocia-animal-edit-sdk-private.log');path.touch(mode=0o600,exist_ok=True);path.write_text(proc.stderr);raise ValueError('Actual animal_edit SDK replay failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual installed SDK/browser proves original recovery and independent native audit')
 exercise.result=dict(asserted_atomic_animal_edit=True)
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();evidence=args.evidence_dir.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-animal-edit-native.mjs'),Path(__file__).with_name('hato-animal-edit-baseline-query.sql'),Path(__file__).with_name('hato-sale-retirement-replay.py'),*[r.ROOT/'src/utils/hato'/n for n in ('hatoAnimalEditProtocol.ts','hatoAnimalEditBrowserAttempt.ts')],r.ROOT/'src/components/hato/components/EditarAnimalDialog.tsx',r.ROOT/'src/components/hato/hooks/useAnimalEdit.ts',r.ROOT/'src/components/hato/hooks/useActualizarHatoAnimal.ts'];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(evidence)
 if args.output.resolve().is_relative_to(evidence) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()) or 'ANIMAL_EDIT_BASELINE_PENDING' in SOURCE.read_text():raise ValueError('Animal edit sources changed during replay')
 result.update(exercise.result,coordinated_candidate_count=27,admission_rollback_probes=3,limits=['Local synthetic Auth/private Unix socket only; never production.','Remaining lifecycle writers, direct grants, deployed JWT/runtime parity and coherent restore are not certified.'],sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True)
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
