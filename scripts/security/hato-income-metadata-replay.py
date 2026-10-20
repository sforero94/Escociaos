#!/usr/bin/env python3
"""Option1 measured income metadata, contained six-export replay only."""
import argparse,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_income_metadata',Path(__file__).with_name('hato-quincena-integrity-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-income-metadata.sql'
def query(sql):
 tables=json.loads(sql("SELECT jsonb_agg(jsonb_build_array(schemaname,tablename) ORDER BY schemaname,tablename) FROM pg_tables WHERE schemaname<>'information_schema' AND schemaname NOT LIKE 'pg_%';"))
 return "SELECT jsonb_object_agg(name,rows) FROM ("+' UNION ALL '.join('SELECT '+lit(a+'.'+b)+" name,(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM "+r.q(a)+'.'+r.q(b)+' x) rows' for a,b in tables)+') snapshot;'
def install(sql):
 p.install(sql);q=query(sql);before=sql(q)
 failed=sql('BEGIN;ALTER FUNCTION hato_quincena.actor() SET search_path=public;'+SOURCE.read_text(),False)
 if failed.returncode==0 or sql(q)!=before:raise AssertionError('Metadata admission must refuse underlying actor drift without retained catalog/rows')
 sql(SOURCE.read_text())
 if sql(q)!=before or sql('SELECT(SELECT count(*) FROM hato_income_metadata.requests)+(SELECT count(*) FROM hato_income_metadata.audit);')!='0':raise AssertionError('Metadata install changed pre-existing rows or seeded controls')
def exercise(sql,ctx):
 p.exercise(sql,ctx);check,call=ctx['check'],ctx['call'];owner,other=c.uid(),c.uid()
 for uid,label in [(owner,'owner'),(other,'other')]:sql('INSERT INTO auth.users VALUES('+u(uid)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(uid)+",'metadata-"+label+"@synthetic.invalid','Gerencia',true);")
 business=sql("SELECT id FROM fin_negocios WHERE nombre='Hato Lechero';");category=sql("SELECT id FROM fin_categorias_ingresos WHERE nombre='Synthetic protected leche';");region=sql("SELECT id FROM fin_regiones WHERE nombre='Synthetic protected region';");medium=sql("SELECT id FROM fin_medios_pago WHERE nombre='Synthetic protected medium';")
 fields=dict(year=2032,month=4,quincena=1,liters=100,pomar=100,cows=1,notes='Synthetic metadata production',incomeDate='2032-04-15',gross=1000,regionId=region,mediumId=medium,buyerId=None,name='Synthetic metadata milk')
 draft=dict(version=1,kind='save',targetId=None,fields=fields);s=call('fn_hato_quincena_source_web',[js(draft),u(owner)],actor=owner);qkey=c.uid();call('fn_hato_quincena_web',[lit('prepare'),u(qkey),js(dict(draft,observed=s['source'])),u(owner)],actor=owner);created=call('fn_hato_quincena_web',[lit('post'),u(qkey),'NULL::jsonb',u(owner)],actor=owner);call('fn_hato_quincena_web',[lit('acknowledge'),u(qkey),'NULL::jsonb',u(owner)],actor=owner);income=created['receipt']['after']['income']['id'];qid=created['receipt']['after']['production']['id']
 monthly=c.uid();monthly_row=dict(created['receipt']['after']['income'],id=monthly,nombre='Synthetic retained monthly reference');sql('INSERT INTO fin_ingresos SELECT(jsonb_populate_record(NULL::fin_ingresos,'+js(monthly_row)+')).*;')
 for half in [1,2]:sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,fin_ingreso_id,created_by) VALUES('+','.join([u(c.uid()),'2033','5',str(half),'50',lit('derivado_mensual'),u(monthly),u(owner)])+');')
 check(not call('fn_hato_income_metadata_classify_web',[u(monthly),u(owner)],actor=owner)['measured'],'shared derived monthly income stays outside measured-only routing')
 history=sql('SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM hato_produccion_quincenal x WHERE fin_ingreso_id='+u(monthly)+';');sql('BEGIN;SET LOCAL ROLE service_role;UPDATE fin_ingresos SET observaciones=\'Synthetic preserved service lane\' WHERE id='+u(monthly)+';COMMIT;');check(sql('SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM hato_produccion_quincenal x WHERE fin_ingreso_id='+u(monthly)+';')==history,'service/import metadata lane preserves both monthly rows and original shared IDs')
 d=dict(version=1,kind='metadata',targetId=income,fields=dict(observations='Reviewed metadata',invoice=None));s=call('fn_hato_income_metadata_source_web',[js(d),u(owner)],actor=owner);intent=dict(d,observed=s['source']);key=c.uid()
 check(call('fn_hato_income_metadata_classify_web',[u(income),u(owner)],actor=owner)['measured'],'trusted classification recognizes actual protected measured pair')
 pending=call('fn_hato_income_metadata_web',[lit('prepare'),u(key),js(intent),u(owner)],actor=owner);check(pending['plan']['afterIncome']['valor']==977.5 and pending['plan']['afterProduction']==pending['plan']['beforeProduction'],'metadata preview preserves exact financial/production fields')
 whole=query(sql)
 def action(mode,k=key,actor=owner):return call('fn_hato_income_metadata_web',[lit(mode),u(k),'NULL::jsonb',u(actor)],actor=actor)
 def refuse(label,ddl='',mode='post',payload=None,role='authenticated',actor=owner,k=key):
  before=sql(whole);failed=sql('BEGIN;'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor)+';SELECT fn_hato_income_metadata_web('+','.join([lit(mode),u(k),js(payload) if payload is not None else 'NULL::jsonb',u(actor)])+');COMMIT;',False)
  if failed.returncode==0 or sql(whole)!=before:raise AssertionError(label+' must refuse with exact whole-state rollback')
  if any(w in failed.stderr for w in ['syntax error','does not exist','ambiguous','is not assigned']):raise AssertionError('Unexpected refusal SQL defect: '+failed.stderr)
  check(True,label+' refuses with complete state rollback')
 for label,ddl in [('stale financial source','UPDATE fin_ingresos SET valor=valor+1 WHERE id='+u(income)+';'),('inactive actor','UPDATE usuarios SET activo=false WHERE id='+u(owner)+';'),('suppressed income',"CREATE FUNCTION synthetic_metadata_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_metadata_fault BEFORE UPDATE ON fin_ingresos FOR EACH ROW EXECUTE FUNCTION synthetic_metadata_fault();"),('suppressed audit',"CREATE FUNCTION synthetic_metadata_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_metadata_fault BEFORE INSERT ON hato_income_metadata.audit FOR EACH ROW EXECUTE FUNCTION synthetic_metadata_fault();"),('late actor revocation',"CREATE FUNCTION synthetic_metadata_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.usuarios SET activo=false WHERE id="+u(owner)+";RETURN NEW;END$$;CREATE TRIGGER synthetic_metadata_fault AFTER INSERT ON hato_income_metadata.audit FOR EACH ROW EXECUTE FUNCTION synthetic_metadata_fault();"),('unexpected financial mutation',"CREATE FUNCTION synthetic_metadata_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.fin_ingresos SET valor=valor+1 WHERE id="+u(income)+";RETURN NEW;END$$;CREATE TRIGGER synthetic_metadata_fault AFTER INSERT ON hato_income_metadata.audit FOR EACH ROW EXECUTE FUNCTION synthetic_metadata_fault();")]:refuse(label,ddl)
 refuse('cross-owner request',actor=other)
 for role in ['anon','service_role']:refuse(role+' web denial',role=role)
 for name in ['valor','cantidad','fecha','negocio_id','categoria_id','nombre','region_id','medio_pago_id','comprador_id']:
  bad=dict(intent,fields=dict(intent['fields'],**{name:'forged'}));refuse('financial field '+name+' injection',mode='prepare',payload=bad,k=c.uid())
 posted=action('post');check(posted['receipt']['after']['income']['observaciones']=='Reviewed metadata' and posted['receipt']['after']['income']['valor']==977.5 and posted['receipt']['after']['production']==created['receipt']['after']['production'],'exact metadata/current actor audit commits without any financial/production change')
 before=sql(whole);check(action('post')==posted and sql(whole)==before,'lost post repeats original receipt with no repeated write');check(call('fn_hato_income_metadata_recover_web',[u(owner)],actor=owner)==posted,'independent owner recovery returns committed original')
 action('acknowledge')
 before=sql(whole);failed=sql('BEGIN;GRANT UPDATE ON hato_income_metadata.requests TO service_role;SELECT hato_quincena.assert_baseline();COMMIT;',False);check(failed.returncode!=0 and sql(whole)==before,'Production validates exact private metadata authority before exempting non-owning receipts')
 metadata_history=sql('SELECT hato_income_metadata.controls();');corrected_fields=dict(fields,gross=1100);correction=dict(draft,targetId=qid,fields=corrected_fields);fresh=call('fn_hato_quincena_source_web',[js(correction),u(owner)],actor=owner);next_key=c.uid();call('fn_hato_quincena_web',[lit('prepare'),u(next_key),js(dict(correction,observed=fresh['source'])),u(owner)],actor=owner);corrected=call('fn_hato_quincena_web',[lit('post'),u(next_key),'NULL::jsonb',u(owner)],actor=owner);check(corrected['receipt']['after']['income']['observaciones']=='Reviewed metadata' and corrected['receipt']['after']['income']['valor']==1075.25 and sql('SELECT hato_income_metadata.controls();')==metadata_history,'later prepared Production financial correction preserves non-owning metadata history and observations');call('fn_hato_quincena_web',[lit('acknowledge'),u(next_key),'NULL::jsonb',u(owner)],actor=owner)
 # Restore the original monetary input through another explicit protected correction for SDK fixture consistency.
 restoration=dict(draft,targetId=qid);fresh=call('fn_hato_quincena_source_web',[js(restoration),u(owner)],actor=owner);restore_key=c.uid();call('fn_hato_quincena_web',[lit('prepare'),u(restore_key),js(dict(restoration,observed=fresh['source'])),u(owner)],actor=owner);call('fn_hato_quincena_web',[lit('post'),u(restore_key),'NULL::jsonb',u(owner)],actor=owner);call('fn_hato_quincena_web',[lit('acknowledge'),u(restore_key),'NULL::jsonb',u(owner)],actor=owner)
 unknown=c.uid();check(action('resolve',unknown)['state']=='canceled','unknown original cancellation is permanent tombstone');action('acknowledge',unknown)
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,income=income,qid=qid,original=posted)
 proc=subprocess.run(['node',str(Path(__file__).with_name('hato-income-metadata-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=r.ROOT,timeout=90)
 if proc.returncode:
  f=Path('/tmp/escocia-income-metadata-sdk-private.log');f.touch(mode=0o600,exist_ok=True);f.write_text(proc.stderr);raise AssertionError('Metadata SDK caller failed; private diagnostics '+str(f))
 data=json.loads(proc.stdout);exercise.sdk={k:v for k,v in data.items() if k!='fixture'};(r.ROOT/'src/__tests__/fixtures/hatoIncomeMetadata.json').write_text(json.dumps(data['fixture'],indent=2)+'\n')
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();extra=[SOURCE,Path(__file__),Path(__file__).with_name('hato-income-metadata-native.mjs'),*[r.ROOT/k for k in ['src/__tests__/hatoIncomeMetadata.test.tsx','src/utils/hato/hatoIncomeMetadataProtocol.ts','src/utils/hato/hatoIncomeMetadataBrowserAttempt.ts','src/components/hato/hooks/useIncomeMetadataConfirmation.ts','src/components/hato/hooks/useIncomeMetadataRoute.ts','src/components/hato/components/IncomeMetadataConfirmationPanel.tsx']]];files=list(dict.fromkeys([*extra,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/financial-income-admission-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};base=p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,admission=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing metadata sources cannot be certified')
 sources[r.ROOT/'src/__tests__/fixtures/hatoIncomeMetadata.json']=(r.ROOT/'src/__tests__/fixtures/hatoIncomeMetadata.json').read_bytes();result.update(coordinated_candidate_count=55,installed_sdk=exercise.sdk,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private snapshots/synthetic contained PG only; never production.','Option1 metadata RPC and actual finance routing; direct/legacy writer retirement remains open. New invoice attachments refuse until compatible verified-byte reference admission; unchanged references/removal remain allowed. Hosted/global/runtime/capacity/coherent recovery remain gates.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
