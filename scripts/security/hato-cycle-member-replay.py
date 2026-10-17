#!/usr/bin/env python3
"""Per-event cycle-member correction compatibility, local private metadata only."""
import argparse
import concurrent.futures
import importlib.util
import json
import subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior',Path(__file__).with_name('hato-cycle-birth-undo-replay.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
c,r,lit,js,u=t.c,t.r,t.lit,t.js,t.u
install=t.install

def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];query=t.state_query(sql);state=lambda:sql(query)
 sql('UPDATE usuarios SET activo=true WHERE id='+u(c.OTHER)+";INSERT INTO hato_config(clave,valor) VALUES('meses_gestacion_default','9'::jsonb) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;")
 cases=0
 for mark in ('preñada','confirmada'):
  for anchor in ('fecha_conocida','meses_prenez'):
   for member in ('servicio','confirmacion_prenez'):
    for mode in ('edit','delete'):
     animal,birth_key,key=c.uid(),c.uid(),c.uid()
     sql('INSERT INTO hato_animales(id,numero,nombre,etapa,estado) VALUES('+u(animal)+",NULL,'Synthetic cycle member','vaca','activa');")
     observed=json.loads(sql('SELECT to_jsonb(x) FROM hato_animales x WHERE id='+u(animal)+';'))
     intent=dict(version=1,animalId=animal,observedAnimal=observed,input=dict(marca=mark,fecha='2026-08-15',fechaConfianza='exacta',criaDestino=None,nota='Original cycle note',ancla=dict(modo=anchor,fechaServicio='2026-01-15' if anchor=='fecha_conocida' else None,mesesPrenez=3 if anchor=='meses_prenez' else None)))
     def cycle(action,payload=None):return call('fn_hato_cycle_web',[lit(action),u(birth_key),js(payload) if payload else 'NULL::jsonb',u(c.OTHER)],actor=c.OTHER)
     cycle('prepare',intent);created=cycle('post');events=created['receipt']['after']['events'];target=next(e for e in events if e['tipo']==member);partner=next(e for e in events if e['id']!=target['id'])
     changes=dict(fecha=sql('SELECT ('+lit(target['fecha'])+'::date+1)::text;'),fecha_confianza='aproximada',tipo_servicio=target['tipo_servicio'],toro_id=target['toro_id'],cria_destino=target['cria_destino'],nota='Reviewed individual member',motivo='Observed correction')
     correction_intent=dict(version=1,eventId=target['id'],mode=mode,observedEvent=target,changes=changes if mode=='edit' else None)
     def correction(action,ok=True):return call('fn_hato_event_correction_web',[lit(action),u(key),js(correction_intent) if action=='prepare' else 'NULL::jsonb',u(c.OTHER)],actor=c.OTHER,ok=ok)
     prepared=correction('prepare');check(prepared['state']=='pending' and prepared['original']['graph']['events']==sorted(events,key=lambda e:e['id']),mark+'/'+anchor+'/'+member+'/'+mode+' captures complete two-member graph without posting')
     def refuse(ddl,label,marker):
      before=state();failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+lit(c.OTHER)+";SELECT fn_hato_event_correction_web('post',"+u(key)+',NULL::jsonb,'+u(c.OTHER)+');COMMIT;',False)
      if failed.returncode==0 or marker.lower() not in failed.stderr.lower() or state()!=before:
       p=Path('/tmp/escocia-cycle-member-unexpected-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(failed.stderr);raise AssertionError(label+' refusal/rollback; private diagnostics saved')
      check(True,label+' refuses with full-state rollback')
     if cases<2:
      refuse('UPDATE hato_eventos SET fecha=fecha+1 WHERE id='+u(partner['id'])+';','competing paired member revision','graph changed')
      refuse('UPDATE hato_eventos SET fecha=fecha+1 WHERE id='+u(target['id'])+';','competing selected member revision','graph changed')
      refuse('ALTER TABLE hato_eventos DISABLE TRIGGER trg_hato_correccion;','suppressed selected source trace','trusted event correction trace')
      event_op='UPDATE' if mode=='edit' else 'DELETE'
      refuse('CREATE FUNCTION public.synthetic_cycle_suppression() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL;END $$;CREATE TRIGGER synthetic_cycle_suppression BEFORE '+event_op+' ON public.hato_eventos FOR EACH ROW EXECUTE FUNCTION public.synthetic_cycle_suppression();','suppressed selected '+mode,'target suppressed' if mode=='edit' else 'delete suppressed')
     before=json.loads(state())
     if cases==0:
      with concurrent.futures.ThreadPoolExecutor(2) as pool:
       a=pool.submit(correction,'post');b=pool.submit(correction,'post');posted=a.result();check(posted==b.result(),'concurrent member correction posts original once')
     else:posted=correction('post')
     after=json.loads(state());allowed={'public.hato_eventos','public.hato_correcciones','hato_event_correction.requests','hato_event_correction.audit'}
     check(all(v==after[k] for k,v in before.items() if k not in allowed),'cycle member '+str(cases)+' preserves all other domain/backup/financial/creation-private rows')
     row=json.loads(sql('SELECT to_jsonb(x) FROM hato_eventos x WHERE id='+u(partner['id'])+';'));check(row==partner and posted['receipt']['after']['event']==prepared['plan']['event'],'selected '+mode+' preserves exact counterpart, source and actor; no batch deletion/invented anchor')
     check(len(after['public.hato_correcciones'])==len(before['public.hato_correcciones'])+1 and posted['receipt']['correction']['corregido_por']==c.OTHER,'one selected event produces exactly one real current actor trace')
     before=state();check(correction('status')==posted and correction('post')==posted and cycle('status')==created and cycle('post')==created and state()==before,'original correction and creation recovery never recreates deleted members or rewrites immutable creation proof')
     cases+=1
 data=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=c.OTHER,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-cycle-member-native.mjs'))],input=json.dumps(data),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  p=Path('/tmp/escocia-cycle-member-sdk-private.log');p.touch(mode=0o600,exist_ok=True);p.write_text(proc.stderr);raise AssertionError('Cycle member SDK failed; private diagnostics saved')
 exercise.sdk=json.loads(proc.stdout);exercise.cases=cases;check(exercise.sdk['assertions']>=40,'actual durable editor adapter/installed SDK member proofs equal independent native rows/audit')
def main():
 a=argparse.ArgumentParser();a.add_argument('--evidence-dir',type=Path,required=True)
 for name in ('runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 args=a.parse_args();exercise.client=args.client.resolve();files=[*sorted((r.ROOT/'src/sql/security-candidates').glob('*.sql')),Path(__file__),Path(__file__).with_name('hato-cycle-member-native.mjs'),Path(__file__).with_name('hato-cycle-birth-undo-replay.py')]
 files.extend(r.ROOT/name for name in ('src/utils/hato/hatoCycleProtocol.ts','src/utils/hato/hatoDeathProtocol.ts','src/utils/hato/criaAutomatica.ts','src/utils/hato/alertResponseProtocol.ts','src/utils/hatoCicloManual.ts','src/utils/calculosHato.ts','src/utils/hato/hatoEventCorrectionProtocol.ts','src/utils/hato/hatoEventCorrectionBrowserAttempt.ts','src/components/hato/hooks/useEventCorrection.ts','src/components/hato/components/EditarEventoDialog.tsx','src/components/hato/HojaDeVida.tsx','src/__tests__/hatoEventCorrectionBrowser.test.tsx','src/__tests__/fixtures/hatoCycle.ts','src/__tests__/fixtures/hatoEventCorrection.ts'))
 sources={p:p.read_bytes() for p in files};catalog,rls,hashes=r.load(args.evidence_dir.resolve())
 if args.output.resolve().is_relative_to(args.evidence_dir.resolve()) or args.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(args.runtime.resolve(),args.client.resolve(),args.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(p.read_bytes()!=b for p,b in sources.items()):raise ValueError('Changing cycle-member source cannot be certified')
 result.update(coordinated_candidate_count=35,admission_rollback_probes=4,cycle_member_cases=exercise.cases,sdk_proof=exercise.sdk,source_hashes={str(p.relative_to(r.ROOT)):r.p.digest(b) for p,b in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four private local metadata exports and synthetic private socket/Auth only; never production.','Existing per-event correction contract only; no automatic whole-batch undo, counterpart recomputation, financial/usage/calf correction or historical adoption. Hosted/deployed/global writer/recovery gates remain open.'])
 args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
