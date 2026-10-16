#!/usr/bin/env python3
"""Exact protected prospective quick-event/usage undo, four private local exports only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('foundation',Path(__file__).with_name('hato-event-correction-browser-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
SOURCE=r.ROOT/'src/sql/security-candidates/hato-quick-undo.sql'
def state_query(sql):return t.state_query(sql)
def install(sql):
 t.install(sql);query=state_query(sql);before=sql(query)
 for ddl,marker in [("ALTER TABLE hato_pajillas ADD COLUMN synthetic_unreviewed boolean;",'inventory graph'),("ALTER TABLE hato_eventos FORCE ROW LEVEL SECURITY;",'source graph'),("ALTER FUNCTION hato_undo.authorize(bigint) SET search_path=public;",'authorize helper'),("CREATE TABLE public.synthetic_usage_ref(id uuid REFERENCES hato_pajillas_uso(id));",'incoming')]:
  # Event FK guard is inherited; this unit also rejects usage incoming references.
  fail=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if fail.returncode==0 or marker not in fail.stderr or sql(query)!=before or sql("SELECT to_regnamespace('hato_quick_undo') IS NULL;")!='t':raise AssertionError('Coupled undo admission rollback '+marker)
 sql(SOURCE.read_text())
 if sql(query)!=before:raise AssertionError('Coupled undo installation changed existing rows')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];query=state_query(sql);state=lambda:sql(query);sender=456789;reg=c.uid();animal=c.uid();bull=c.uid();lot=c.uid()
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+';INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(reg)+','+str(sender)+",'Synthetic undo Gerencia',true,ARRAY['hato_produccion'],"+u(c.OTHER)+');INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(animal)+",777,'Synthetic coupled undo animal','vaca','activa');INSERT INTO hato_toros(id,nombre,tipo,activo) VALUES("+u(bull)+",'Synthetic undo bull','inseminacion',true);INSERT INTO hato_pajillas(id,toro_id,cantidad_inicial) VALUES("+u(lot)+','+u(bull)+',0);')
 observed=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(animal)+';'));day=sql("SELECT to_char((now() AT TIME ZONE 'America/Bogota')::date,'YYYY-MM-DD');")
 intent=dict(version=1,animalId=animal,fecha=day,kind='inseminacion',toroId=bull,pajillaId=lot,observedAnimal=observed)
 def quick(mode,msg=101,p=None):return call('fn_hato_quick_telegram',[lit(mode),str(sender),str(sender),str(msg),js(p) if p else 'NULL::jsonb'],actor=None,role='service_role')
 quick('prepare',p=intent);created=quick('post');event=created['plan']['events'][0]['id'];usage=created['receipt']['usage']['id']
 def undo(mode,msg=201,target=None,who=sender,chat=None,ok=True,role='service_role',actor=None):return call('fn_hato_quick_undo',[lit(mode),str(who),str(chat if chat is not None else who),str(msg),u(target) if target else 'NULL::uuid'],actor=actor,role=role,ok=ok)
 prepared=undo('prepare',target=event);check(prepared['state']=='pending' and prepared['original']['creation']==created,'exact protected creation receipt and event/usage captured without historical adoption')
 before=state();check(undo('prepare',target=event)==prepared and state()==before,'original native action retains exact key/source; prepare never deletes')
 def refuse(label,fn,marker):
  before=state();f=fn()
  if f.returncode==0 or marker.lower() not in f.stderr.lower() or state()!=before:
   p=Path('/tmp/escocia-quick-undo-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(f.stderr);raise AssertionError(label+' rollback/refusal; private diagnostics saved')
  check(True,label+' refuses with full state rollback')
 def raw(ddl,msg=201,mode='post',target=None):return sql('BEGIN;'+ddl+'SET LOCAL ROLE service_role;SELECT fn_hato_quick_undo('+lit(mode)+','+str(sender)+','+str(sender)+','+str(msg)+','+(u(target) if target else 'NULL::uuid')+');COMMIT;',False)
 other_bull=c.uid();refuse('retargeted lot catalog association',lambda:raw('INSERT INTO hato_toros(id,nombre,tipo,activo) VALUES('+u(other_bull)+",'Synthetic replacement bull','inseminacion',true);UPDATE hato_pajillas SET toro_id="+u(other_bull)+' WHERE id='+u(lot)+';'),'linked catalog reference')
 refuse('replacement before original resolves',lambda:undo('prepare',202,event,ok=False),'original protected undo')
 refuse('group callback identity',lambda:undo('status',chat=789,ok=False),'private')
 refuse('fabricated Auth identity',lambda:undo('status',actor=c.OTHER,ok=False),'trusted native')
 for label,ddl,marker in [('changed event',"UPDATE hato_eventos SET fecha=fecha-1 WHERE id="+u(event)+';','dependents'),('changed usage',"UPDATE hato_pajillas_uso SET fecha_uso=fecha_uso-1 WHERE id="+u(usage)+';','dependents'),('related animal',"UPDATE hato_animales SET notas='Competing edit' WHERE id="+u(animal)+';','clinical graph'),('lot source',"UPDATE hato_pajillas SET cantidad_inicial=1 WHERE id="+u(lot)+';','source changed'),('revoked Gerencia',"UPDATE usuarios SET activo=false WHERE id="+u(c.OTHER)+';','Gerencia'),('demoted Gerencia',"UPDATE usuarios SET rol='Administrador' WHERE id="+u(c.OTHER)+';','Gerencia'),('new usage incoming cascade','CREATE TABLE public.synthetic_usage_ref(id uuid REFERENCES hato_pajillas_uso(id) ON DELETE CASCADE);','incoming FK')]:refuse(label,lambda ddl=ddl:raw(ddl),marker)
 for table,operation,body,marker in [('public.hato_eventos','BEFORE DELETE','RETURN NULL;','event delete suppressed'),('public.hato_pajillas_uso','BEFORE DELETE','RETURN NULL;','usage delete suppressed'),('public.hato_correcciones','BEFORE INSERT','RETURN NULL;','protection boundary drift'),('hato_quick_undo.audit','BEFORE INSERT','RETURN NULL;','audit suppressed'),('hato_quick_undo.requests','BEFORE UPDATE','RETURN NULL;','control suppressed'),('public.hato_eventos','AFTER DELETE','UPDATE public.usuarios SET activo=false WHERE id='+u(c.OTHER)+';RETURN OLD;','Gerencia'),('hato_quick_undo.requests','AFTER UPDATE',"UPDATE public.hato_pajillas SET cantidad_inicial=3 WHERE id="+u(lot)+';RETURN NEW;','source/inventory'),('hato_quick_undo.requests','AFTER UPDATE',"UPDATE public.fin_gastos SET estado='Pendiente';RETURN NEW;",'financial preservation'),('hato_quick_undo.audit','AFTER INSERT',"UPDATE public.hato_animales SET notas='Late mutation' WHERE id="+u(animal)+';RETURN NEW;','source/inventory')]:
  ddl='CREATE FUNCTION public.synthetic_undo_fault() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN '+body+' END $f$;CREATE TRIGGER synthetic_undo_fault '+operation+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_undo_fault();';refuse(table+' '+body[:20],lambda ddl=ddl:raw(ddl),marker)
 refuse('suppressed nested trace',lambda:raw('CREATE OR REPLACE FUNCTION hato_quick_undo.write_trace() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $f$ BEGIN RETURN NEW;END $f$;'),'source/inventory')
 legacy=c.uid()
 refuse('legacy marker cannot establish provenance',lambda:raw('INSERT INTO hato_eventos SELECT (jsonb_populate_record(NULL::hato_eventos,(SELECT to_jsonb(e) FROM hato_eventos e WHERE id='+u(event)+")||jsonb_build_object('id',"+u(legacy)+",'fecha','2026-08-01'))).*;",208,'prepare',legacy),'provenance')
 refuse('another clinical event refuses guessing later consequences',lambda:raw('INSERT INTO hato_eventos(animal_id,tipo,fecha,fecha_confianza,fuente) VALUES('+u(animal)+",'rechequeo',current_date,'exacta','telegram');"),'clinical graph')
 refuse('protected original creation audit cannot be rewritten',lambda:raw("UPDATE hato_quick_telegram.audit SET receipt=receipt||'{\"forged\":true}'::jsonb;"),'immutable original quick')
 before=json.loads(state())
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  a=pool.submit(undo,'post');b=pool.submit(undo,'post');posted=a.result();duplicate=b.result()
 after=json.loads(state());allowed={'public.hato_eventos','public.hato_pajillas_uso','public.hato_correcciones','hato_quick_undo.requests','hato_quick_undo.audit'}
 check(posted==duplicate and posted['state']=='committed','concurrent original post deletes exact event/usage once with one trusted human/operation trace')
 check(all(after[k]==v for k,v in before.items() if k not in allowed),'coupled undo preserves every unrelated financial/backup/animal/clinical/private record and original creation proof')
 check(sql('SELECT count(*) FROM hato_eventos WHERE id='+u(event)+';')=='0' and sql('SELECT count(*) FROM hato_pajillas_uso WHERE id='+u(usage)+';')=='0','both original public dependents removed atomically')
 check(sql('SELECT cantidad_actual FROM v_hato_pajillas_stock WHERE pajilla_id='+u(lot)+';')=='0','derived stock returns from negative one to zero without inventing stock mutation')
 check(posted['receipt']['correction']['corregido_por']==c.OTHER and posted['receipt']['correction']['datos_anteriores']==prepared['original']['event'],'trusted trace records genuine current linked Gerencia without fabricated Auth UID')
 before=state();check(undo('status')==posted and undo('post')==posted and state()==before,'lost response recovers original immutable receipt after both targets disappear')
 check(quick('post')==created and quick('status')==created,'original creation receipt remains recoverable and cannot recreate removed targets')
 refuse('revoked receipt recovery',lambda:raw('UPDATE usuarios SET activo=false WHERE id='+u(c.OTHER)+';',mode='status'),'Gerencia')
 refuse('replacement after committed undo',lambda:undo('prepare',202,event,ok=False),'original protected undo')
 fence=undo('resolve',203);check(undo('prepare',203,event)==fence,'cancel-before-prepare fences original private action after target disappearance')
 before=state();unknown=undo('status',204);check(unknown['state']=='unknown' and unknown['requestKey'] is None and state()==before,'unknown status is read-only and never allocates a replacement')
 for role in ('anon','authenticated','service_role'):refuse(role+' private controls',lambda role=role:sql('BEGIN;SET LOCAL ROLE '+role+';SELECT * FROM hato_quick_undo.requests;COMMIT;',False),'permission denied')
 for role in ('anon','authenticated'):refuse(role+' native impersonation',lambda role=role:undo('status',role=role,ok=False),'permission denied')
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),sender=sender,animal=animal,bull=bull,lot=lot,day='2026-09-20',owner=c.OTHER,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-quick-undo-telegram-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-quick-undo-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise AssertionError('Quick undo SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);check(exercise.sdk['assertions']>=8,'strict installed SDK coupled undo proof equals independent native rows/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-quick-undo-telegram-native.mjs'),Path(__file__).with_name('hato-event-correction-browser-replay.py')]
 files.extend(r.ROOT/'src/utils/hato'/name for name in ('hatoQuickUndoProtocol.ts','hatoQuickTelegramProtocol.ts','alertResponseProtocol.ts'));
 for base in ('src/supabase/functions/server','supabase/functions/make-server-1ccce916'):
  files.extend(r.ROOT/base/name for name in ('telegram/bot.ts','telegram/quickUndo.ts','telegram/quickUndoProtocol.ts','telegram/quickCreation.ts','telegram/quickCreationProtocol.ts','telegram/alertResponseProtocol.ts','telegram/fechaDDMM.ts','calculos-hato.ts','hato-config-desde-tabla.ts'))
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing coupled undo source cannot be certified')
 result.update(coordinated_candidate_count=33,admission_rollback_probes=4,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four private local metadata exports and synthetic private socket only; never production.','Actual mirrored protected-pair Telegram caller only; no hosted Telegram/JWT/deployed certification. Retained-offspring/other coupled lifecycle/readers/writers/hosted/recovery remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
