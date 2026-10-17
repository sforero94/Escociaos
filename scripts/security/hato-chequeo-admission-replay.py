#!/usr/bin/env python3
"""Chequeo replacement contract preflight on local metadata only; no production."""
import argparse,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_chequeo',Path(__file__).with_name('hato-catalog-edit-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js

def exercise(sql,ctx):
 check=ctx['check'];owner=c.OWNER;mother,calf,header,vaca,event,manual=[c.uid() for _ in range(6)];day='2026-10-10'
 sql('INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,created_by) VALUES('+u(mother)+",'Synthetic chequeo mother','hembra','vaca','activa','compra',"+u(owner)+');INSERT INTO hato_animales(id,nombre,sexo,etapa,estado,origen,madre_id,fecha_nacimiento,created_by) VALUES('+u(calf)+",'Synthetic already-linked calf','hembra','ternera','activa','nacimiento',"+u(mother)+",'2026-10-01',"+u(owner)+');INSERT INTO hato_chequeos(id,fecha,estado,fuente,created_by) VALUES('+u(header)+','+lit(day)+",'cerrado','web',"+u(owner)+');INSERT INTO hato_chequeo_vacas(id,chequeo_id,animal_id) VALUES('+u(vaca)+','+u(header)+','+u(mother)+');INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,cria_destino,cria_id,chequeo_vaca_id,fuente,created_by) VALUES('+u(event)+','+u(mother)+",'parto','2026-10-01','exacta','retenida',"+u(calf)+','+u(vaca)+",'chequeo',"+u(owner)+');INSERT INTO hato_eventos(id,animal_id,tipo,fecha,fecha_confianza,fuente,created_by) VALUES('+u(manual)+','+u(mother)+",'celo','2026-10-02','exacta','web',"+u(owner)+');')
 before=sql(p.p.query(sql));original_calf=sql('SELECT to_jsonb(t) FROM hato_animales t WHERE id='+u(calf)+';');original_manual=sql('SELECT to_jsonb(t) FROM hato_eventos t WHERE id='+u(manual)+';')
 payload=dict(chequeo=dict(fecha=day,veterinario=None),vacas=[dict(animal_id=mother,normalizacion_issues=[])],eventos=[dict(vaca_index=0,tipo='parto',fecha='2026-10-01',fecha_confianza='exacta',cria_destino='retenida',datos=None)])
 # Roll back the complete synthetic replacement while observing the real installed legacy body.
 observed=sql('BEGIN;SET LOCAL ROLE service_role;SELECT set_config(\'request.jwt.claim.sub\','+lit(owner)+',true);SELECT fn_hato_commit_chequeo('+js(payload)+','+u(owner)+');RESET ROLE;SELECT jsonb_build_object(\'old_event_absent\',NOT EXISTS(SELECT 1 FROM hato_eventos WHERE id='+u(event)+'),\'old_detail_absent\',NOT EXISTS(SELECT 1 FROM hato_chequeo_vacas WHERE id='+u(vaca)+'),\'new_births\',(SELECT count(*) FROM hato_eventos WHERE animal_id='+u(mother)+" AND fuente='chequeo' AND tipo='parto'),\'new_birth_link_null\',(SELECT bool_and(cria_id IS NULL) FROM hato_eventos WHERE animal_id="+u(mother)+" AND fuente='chequeo' AND tipo='parto'),\'calf\',(SELECT to_jsonb(t) FROM hato_animales t WHERE id="+u(calf)+'),\'manual\',(SELECT to_jsonb(t) FROM hato_eventos t WHERE id='+u(manual)+'));ROLLBACK;').splitlines()[-1]
 got=json.loads(observed)
 check(got['old_event_absent'] and got['old_detail_absent'] and got['new_births']==1 and got['new_birth_link_null'],'legacy whole-date reapproval recreates identical birth with null calf link')
 check(got['calf']==json.loads(original_calf),'existing calf row remains unchanged while original birth relationship is lost')
 check(got['manual']==json.loads(original_manual),'unrelated manual event remains unchanged')
 check(sql(p.p.query(sql))==before,'entire synthetic replacement/domain/audit is rolled back')
 exercise.observation=dict(same_birth_reapproval_replaces_event_uuid=True,existing_calf_preserved=True,recreated_birth_cria_id_is_null=True,manual_history_preserved=True,whole_probe_rolled_back=True)
 # A pre-RPC bull INSERT is a distinct transaction and survives a later RPC rejection.
 bull=c.uid();sql('INSERT INTO hato_toros(id,nombre,created_by) VALUES('+u(bull)+",'Synthetic pre-RPC chequeo bull',"+u(owner)+');');before=sql(p.p.query(sql))
 invalid=dict(payload,eventos=[dict(payload['eventos'][0],vaca_index=99)])
 failed=sql('BEGIN;SET LOCAL ROLE service_role;SELECT set_config(\'request.jwt.claim.sub\','+lit(owner)+',true);SELECT fn_hato_commit_chequeo('+js(invalid)+','+u(owner)+');COMMIT;',False)
 check(failed.returncode!=0 and 'fuera de rango' in failed.stderr and sql(p.p.query(sql))==before,'known chequeo RPC failure rolls back chequeo but cannot undo prior separate bull creation')
 check(sql('SELECT count(*)=1 FROM hato_toros WHERE id='+u(bull)+';')=='t','pre-RPC bull remains after known whole-chequeo rejection')
 exercise.observation['pre_rpc_bull_survives_known_chequeo_rejection']=True

def main():
 parser=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();files=[Path(__file__),Path(__file__).with_name('hato-catalog-edit-replay.py'),*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-catalog-edit-replay.json').read_text())['source_hashes']],r.ROOT/'src/supabase/functions/server/hato-chequeo-commit.ts',r.ROOT/'src/utils/importHato/commitChequeo.ts',r.ROOT/'src/components/hato/hooks/useSubirChequeoExcel.ts',r.ROOT/'src/components/hato/components/SubirChequeoExcel.tsx',r.ROOT/'src/utils/hato/reemplazoChequeo.ts'];files=list(dict.fromkeys(files));sources={f:f.read_bytes() for f in files};catalog,rls,hashes=r.load(a.evidence_dir.resolve())
 if a.output.resolve().is_relative_to(a.evidence_dir.resolve()) or a.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=p.install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing chequeo preflight sources cannot be certified')
 result.update(coordinated_candidate_count=39,observations=exercise.observation,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Four local private metadata exports only; synthetic local fixtures and service-role/private socket, never production.','Contract preflight reproduces legacy behavior; no protected chequeo implementation or actual caller cutover claimed. Existing linked-calf replacement policy needs owner clarification.'])
 a.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
