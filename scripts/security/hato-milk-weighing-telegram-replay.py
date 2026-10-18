#!/usr/bin/env python3
"""Native private milk replay, local metadata and synthetic fixtures only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('milk_browser',Path(__file__).with_name('hato-milk-weighing-browser-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-milk-weighing-telegram.sql'
def query(sql):return 'SELECT ('+p.p.query(sql).removesuffix(';')+")||jsonb_build_object('hato_milk_telegram.requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_telegram.requests x),'hato_milk_telegram.audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_telegram.audit x),'hato_milk_telegram.actions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') FROM hato_milk_telegram.actions x));"
def install(sql):
 p.install(sql);existing=p.p.query(sql);before=sql(existing)
 for ddl in ['ALTER FUNCTION fn_hato_milk_weighing_web(text,uuid,jsonb,uuid) SET search_path=public;']:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or sql(existing)!=before:raise AssertionError('Native milk admission rollback')
 sql(SOURCE.read_text())
 if sql(existing)!=before:raise AssertionError('Native milk installation changed existing rows')
 if sql("SELECT (SELECT count(*) FROM hato_milk_telegram.requests)+(SELECT count(*) FROM hato_milk_telegram.audit)+(SELECT count(*) FROM hato_milk_telegram.actions);")!='0':raise AssertionError('Native milk installed nonempty controls')
def exercise(sql,ctx):
 p.exercise.client=exercise.client;p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];state=lambda:sql(query(sql));owner=c.OWNER;animal,reg,capture=[c.uid() for _ in range(3)];sender=889977
 sql('INSERT INTO telegram_usuarios(id,telegram_id,nombre_display,activo,modulos_permitidos,usuario_id) VALUES('+u(reg)+','+str(sender)+",'Synthetic milk Admin',true,ARRAY['hato_produccion'],"+u(owner)+');INSERT INTO hato_animales(id,nombre,numero,sexo,etapa,estado,origen,created_by) VALUES('+u(animal)+",'Synthetic native milk cow',88992,'hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_pesajes_leche(animal_id,fecha,litros_am,litros_pm,litros_total,fuente,created_by) VALUES('+u(animal)+",'2026-10-07',1,1,2,'historico',"+u(owner)+');INSERT INTO hato_capturas_foto(id,tipo,origen,desenlace,anio,mes,created_by,fotos_recibidas,storage_bucket,storage_prefijo) VALUES('+u(capture)+",'pesaje','telegram','pendiente',2026,10,"+u(owner)+",1,'hato-pesajes-fotos','synthetic-native');")
 intent=dict(version=1,year=2026,month=10,captureId=capture,cells=[dict(animalId=animal,date='2026-10-21',am=1,pm=2,observed=None)])
 def action(mode,msg=801,payload=None,ok=True):return call('fn_hato_milk_weighing_telegram',[lit(mode),str(sender)+'::bigint',str(sender)+'::bigint',str(msg)+'::bigint',js(payload) if payload else 'NULL::jsonb'],actor=None,role='service_role',ok=ok)
 def refuse(label,ddl='',mode='post',msg=801,payload=None,role='service_role'):
  before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SELECT fn_hato_milk_weighing_telegram('+','.join([lit(mode),str(sender)+'::bigint',str(sender)+'::bigint',str(msg)+'::bigint',js(payload) if payload else 'NULL::jsonb'])+');COMMIT;',False);check(failed.returncode!=0 and state()==before,label+' fully rolls back native domain/control/action')
 before=state();check(action('status')['result'] is None and state()==before,'unknown native action status is read only')
 for role in ['anon','authenticated']:refuse(role+' denied native entry',mode='prepare',payload=intent,role=role)
 for label,ddl in [('unlinked registration','UPDATE telegram_usuarios SET usuario_id=NULL WHERE id='+u(reg)+';'),('revoked profile','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';'),('ordinary linked role',"UPDATE usuarios SET rol='Verificador' WHERE id="+u(owner)+';'),('module loss','UPDATE telegram_usuarios SET modulos_permitidos=ARRAY[]::text[] WHERE id='+u(reg)+';')]:refuse(label,ddl,mode='prepare',payload=intent)
 prepared=action('prepare',payload=intent);check(prepared['result']['state']=='pending' and prepared['actor']['profileId']==owner,'native preparation captures linked Admin owner and original photo')
 for label,ddl in [('source drift','UPDATE hato_animales SET notas=\'Changed\' WHERE id='+u(animal)+';'),('revoked registration','UPDATE telegram_usuarios SET activo=false WHERE id='+u(reg)+';'),('rebound profile','UPDATE telegram_usuarios SET usuario_id='+u(c.OTHER)+' WHERE id='+u(reg)+';'),('photo drift','UPDATE hato_capturas_foto SET detalle=\'Changed\' WHERE id='+u(capture)+';')]:refuse(label,ddl)
 for label,table,event,body in [('suppressed row','public.hato_pesajes_leche','BEFORE INSERT','RETURN NULL;'),('mutated row','public.hato_pesajes_leche','BEFORE INSERT','NEW.litros_total=999;RETURN NEW;'),('suppressed audit','hato_milk_telegram.audit','BEFORE INSERT','RETURN NULL;'),('suppressed control','hato_milk_telegram.requests','BEFORE UPDATE','RETURN NULL;'),('late actor revocation','hato_milk_telegram.audit','AFTER INSERT','UPDATE public.telegram_usuarios SET activo=false WHERE id='+u(reg)+';RETURN NEW;')]:refuse(label,'CREATE FUNCTION public.synthetic_native_milk_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN '+body+'END$$;CREATE TRIGGER synthetic_native_milk_fault '+event+' ON '+table+' FOR EACH ROW EXECUTE FUNCTION public.synthetic_native_milk_fault();')
 action('resolve');action('acknowledge');before=state();check(action('prepare',payload=intent)['result']['state']=='canceled' and state()==before,'canceled original fence cannot be replaced or revived')
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,animal=animal,capture=capture,sender=sender,stateQuery=query(sql).removesuffix(';')+' AS jsonb_object_agg;')
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-milk-weighing-telegram-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-milk-telegram-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Native milk SDK failed; private diagnostic saved')
 proof=json.loads(proc.stdout);exercise.sdk=proof;check(proof['assertions']>=15,'actual installed SDK original private milk caller recovery independently matches native proof')
def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();exercise.client=a.client.resolve();files=[Path(__file__),SOURCE,Path(__file__).with_name('hato-milk-weighing-telegram-native.mjs'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-milk-weighing-browser-replay.json').read_text())['source_hashes']],r.ROOT/'src/utils/hato/hatoMilkWeighingProtocol.ts',*sorted((r.ROOT/'src/__tests__').glob('hatoMilkWeighingTelegram*.test.ts'))]
 for base in ['src/supabase/functions/server/telegram','supabase/functions/make-server-1ccce916/telegram']:
  files.extend(r.ROOT/base/k for k in ['milkWeighing.ts','hatoMilkWeighingProtocol.ts','bot.ts','types.ts','conversations/pesajeLeche.ts'])
 files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing native milk sources cannot be certified')
 result.update(coordinated_candidate_count=45,admission_rollback_probes=1,sdk_proof=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local metadata exports/synthetic Auth/private socket only; no hosted Telegram/Storage/runtime certification.','Week edit/discard/financial/backfill writers and grants unchanged. No production.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
