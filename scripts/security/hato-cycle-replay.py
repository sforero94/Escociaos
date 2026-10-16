#!/usr/bin/env python3
"""Atomic browser cycle/birth candidate, four private local exports only."""
from datetime import date, timedelta
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('edit',Path(__file__).with_name('hato-animal-edit-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-cycle.sql'
def install(sql):
 t.install(sql);existing_query=t.t.state_query(sql);before=sql(existing_query)
 for ddl,marker in (("ALTER TABLE hato_toros ADD COLUMN synthetic_unreviewed boolean;",'Unreviewed cycle source graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'Unreviewed cycle source graph'),("ALTER FUNCTION hato_death.snapshot(uuid) SET search_path=public;",'Unreviewed cycle snapshot helper')):
  failure=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failure.returncode==0 or marker not in failure.stderr or sql(existing_query)!=before or sql("SELECT to_regnamespace('hato_cycle') IS NULL;")!='t':raise AssertionError('Cycle admission rollback')
 sql(SOURCE.read_text())
 if sql(existing_query)!=before:raise AssertionError('Installation changed preexisting domain/private rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];target=ctx['treated']['payload']['animalId'];sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';')
 query=t.t.state_query(sql);state=lambda:sql(query)
 def cycle(mode,key,intent=None,owner=c.OWNER,expected=None,ok=True):return call('fn_hato_cycle_web',[lit(mode),u(key),js(intent) if intent is not None else 'NULL::jsonb',u(expected or owner)],actor=owner,ok=ok)
 animal=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(target)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 inp=dict(marca='parida',fecha=day,fechaConfianza='exacta',criaDestino='retenida',nota='Synthetic retained birth',ancla=dict(modo='ninguna',fechaServicio=None,mesesPrenez=None))
 intent=dict(version=1,animalId=target,observedAnimal=animal,input=inp);key=c.uid();prepared=cycle('prepare',key,intent)
 check(prepared['state']=='pending' and prepared['original']['graph']['animal']==animal and prepared['plan']['calf']['madre_id']==target,'captured mother/herd/config/reference graph reserves exact calf and birth without posting')
 before=state();check(cycle('prepare',key,intent)==prepared and state()==before,'same-key preparation never replaces reserved event/calf identity or source')
 def refuse(label,fn,marker):
  before=state();failure=fn()
  if failure.returncode==0 or marker.lower() not in failure.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-cycle-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failure.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
  check(True,label+' refuses with complete rollback')
 def raw(ddl,k=key):return sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OWNER)+";SELECT fn_hato_cycle_web('post',"+u(k)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False)
 refuse('cross owner',lambda:cycle('status',key,owner=c.OTHER,expected=c.OWNER,ok=False),'owner')
 refuse('stale mother',lambda:raw("UPDATE hato_animales SET notas='Competing edit' WHERE id="+u(target)+';'),'graph changed')
 refuse('competing reserved calf tag',lambda:raw('INSERT INTO hato_animales(id,numero,etapa,estado) VALUES('+u(c.uid())+','+str(prepared['plan']['calf']['numero'])+",'ternera','activa');"),'graph changed')
 refuse('changed config',lambda:raw("INSERT INTO hato_config(clave,valor) VALUES('synthetic_unreviewed','1'::jsonb);"),'graph changed')
 refuse('elapsed day',lambda:raw('ALTER TABLE hato_cycle.requests DISABLE TRIGGER immutable_cycle_request;UPDATE hato_cycle.requests SET effective_date=effective_date-1 WHERE request_key='+u(key)+';ALTER TABLE hato_cycle.requests ENABLE TRIGGER immutable_cycle_request;'),'day elapsed')
 refuse('missing profile',lambda:cycle('status',key,owner=c.uid(),ok=False),'active')
 for table,event,body,marker in [('public.hato_animales','BEFORE INSERT','RETURN NULL;','calf suppressed'),('public.hato_eventos','BEFORE INSERT','RETURN NULL;','event suppressed'),('hato_cycle.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_cycle.requests','BEFORE UPDATE','RETURN NULL;','control suppressed')]:
  ddl='CREATE FUNCTION public.synthetic_cycle_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_cycle_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_cycle_fault();';refuse(table+' suppression',lambda ddl=ddl:raw(ddl),marker)
 for label,ddl,marker in [('calf corruption',"CREATE FUNCTION public.synthetic_cycle_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN NEW.nombre='Wrong calf';RETURN NEW;END $f$;CREATE TRIGGER synthetic_cycle_fault BEFORE INSERT ON hato_animales FOR EACH ROW EXECUTE FUNCTION synthetic_cycle_fault();",'calf suppressed'),('late actor revocation',"CREATE FUNCTION public.synthetic_cycle_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN UPDATE public.usuarios SET activo=false WHERE id="+u(c.OWNER)+";RETURN NEW;END $f$;CREATE TRIGGER synthetic_cycle_fault AFTER INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_cycle_fault();",'active')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 competing=c.uid();cycle('prepare',competing,intent);before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(cycle,'post',key);b=pool.submit(cycle,'post',key);posted=a.result();other=b.result()
 after=json.loads(state());allowed={'public.hato_animales','public.hato_eventos','hato_cycle.requests','hato_cycle.audit'}
 check(all(v==after[k] for k,v in before.items() if k not in allowed),'successful birth preserves all unrelated financial/backup/clinical/correction/private rows')
 check(posted==other and posted['state']=='committed' and posted['receipt']['after']['animal']==animal,'concurrent original birth creates one exact calf/event/receipt while preserving mother')
 refuse('competing prepared birth',lambda:cycle('post',competing,ok=False),'graph changed')
 before=state();check(cycle('status',key)==posted and cycle('post',key)==posted and state()==before,'lost response recovers original calf/event IDs and receipt without reposting')
 check(json.loads(sql('SELECT receipt FROM hato_cycle.audit WHERE request_key='+u(key)+';'))==posted['receipt'],'returned birth proof equals independent immutable native audit')
 fence=c.uid();terminal=cycle('resolve',fence);check(cycle('prepare',fence,intent)==terminal and terminal['state']=='canceled','cancellation before preparation permanently fences original key')
 for role in ('anon','authenticated','service_role'):refuse(role+' private proof',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_cycle.audit;COMMIT;',False),'permission denied')
 for role in ('anon','service_role'):refuse(role+' RPC execute',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+";SELECT fn_hato_cycle_web('status',"+u(key)+',NULL::jsonb,'+u(c.OWNER)+');COMMIT;',False),'permission denied')
 sql("UPDATE usuarios SET rol='Administrador' WHERE id="+u(c.OWNER)+';');refuse('non-Gerencia original recovery',lambda:cycle('status',key,ok=False),'Gerencia');sql("UPDATE usuarios SET rol='Gerencia' WHERE id="+u(c.OWNER)+';')
 # All marks, explicit/derived/absent anchors, and no-calf destination preserve the pure caller contract.
 for ix,(mark,mode) in enumerate([('seca','ninguna'),('preñada','ninguna'),('confirmada','fecha_conocida'),('preñada','meses_prenez'),('parida','ninguna')],1):
  i=dict(inp,marca=mark,fecha=(date.fromisoformat(day)-timedelta(days=ix)).isoformat(),criaDestino='macho_vendido' if mark=='parida' else None,nota='Synthetic '+mark+mode,ancla=dict(modo=mode,fechaServicio='2026-01-02' if mode=='fecha_conocida' else None,mesesPrenez=3.2 if mode=='meses_prenez' else None))
  k=c.uid();p=cycle('prepare',k,dict(intent,input=i));q=cycle('post',k)
  check(q['receipt']['calf'] is None and len(q['receipt']['after']['events'])==len(p['original']['graph']['events'])+len(p['plan']['events']),'exact '+mark+'/'+mode+' batch commits without inventing calf or income')
  if len(p['plan']['events'])==2:
   # A late second INSERT fault must roll back the first event too.
   k2=c.uid();p2=cycle('prepare',k2,dict(intent,input=dict(i,fecha='2026-10-01',ancla=dict(i['ancla'],fechaServicio='2026-01-03' if mode=='fecha_conocida' else None))))
   refuse('late second batch event',lambda:raw("CREATE FUNCTION public.synthetic_cycle_second() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.tipo='confirmacion_prenez' THEN RETURN NULL;END IF;RETURN NEW;END $f$;CREATE TRIGGER synthetic_cycle_second BEFORE INSERT ON hato_eventos FOR EACH ROW EXECUTE FUNCTION synthetic_cycle_second();",k2),'event suppressed')
 # No partial birth is allowed when the physical tag series is exhausted.
 exhausted='BEGIN;INSERT INTO hato_animales(id,numero,etapa,estado) VALUES('+u(c.uid())+",799,'vaca','activa');SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub="+lit(c.OWNER)+";SELECT fn_hato_cycle_web('prepare',"+u(c.uid())+','+js(intent)+','+u(c.OWNER)+');COMMIT;'
 refuse('exhausted calf series',lambda:sql(exhausted,False),'No nonprovisional calf tag')
 sdk_animal=c.uid();sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(sdk_animal)+",77,'Synthetic SDK cycle','vaca','activa');")
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OWNER,other=c.OTHER,animal=sdk_animal,day=day)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-cycle-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-cycle-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise ValueError('Actual cycle SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=12,'actual installed SDK/browser recovers original birth proof and independent calf/event/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for n in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+n,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-cycle-native.mjs'),Path(__file__).with_name('hato-animal-edit-replay.py'),*[r.ROOT/'src/utils/hato'/n for n in ('hatoCycleProtocol.ts','hatoCycleBrowserAttempt.ts','criaAutomatica.ts','hatoDeathProtocol.ts','alertResponseProtocol.ts')],r.ROOT/'src/utils/hatoCicloManual.ts',r.ROOT/'src/utils/calculosHato.ts',r.ROOT/'src/components/hato/hooks/useCycle.ts',r.ROOT/'src/components/hato/hooks/useMarcarCicloHato.ts',r.ROOT/'src/components/hato/components/MarcarCicloDialog.tsx'];sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing cycle sources cannot be certified')
 result.update(coordinated_candidate_count=28,admission_rollback_probes=3,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local exports/private Unix socket/synthetic Auth only; never production.','Telegram event creation, event correction, generic direct grants, hosted drain, readers/runtime/global/capacity/coherent recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
