#!/usr/bin/env python3
"""Protected measured quincena-income on exact six-export local replay only."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prior_quincena_integrity',Path(__file__).with_name('hato-quincena-admission-replay.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
c,r,u,lit,js=p.c,p.r,p.u,p.lit,p.js
SOURCE=r.ROOT/'src/sql/security-candidates/hato-quincena-integrity.sql'
def whole(sql):return sql("SELECT jsonb_build_object('domain',hato_birth_undo.capture_domain(),'foreign',hato_quincena.foreign_controls(),'controls',hato_quincena.controls());")
def install(sql):
 p.p.install(sql);existing_query=p.p.p.query(sql);before=sql(existing_query)
 for ddl in ['GRANT UPDATE(notas) ON hato_produccion_quincenal TO anon;','ALTER FUNCTION fn_hato_guardar_quincena_venta(jsonb) SET search_path=public;']:
  failed=sql('BEGIN;'+ddl+SOURCE.read_text(),False)
  if failed.returncode==0 or sql(existing_query)!=before or sql("SELECT to_regnamespace('hato_quincena') IS NULL;")!='t':raise AssertionError('Quincena admission rollback')
 sql(SOURCE.read_text())
 if sql(existing_query)!=before:raise AssertionError('Quincena foundation installation changed existing rows')
 if sql('SELECT(SELECT count(*) FROM hato_quincena.requests)+(SELECT count(*) FROM hato_quincena.audit);')!='0':raise AssertionError('Nonempty installed quincena controls')
def exercise(sql,ctx):
 check,call=ctx['check'],ctx['call'];owner,other,region,medium,category,business=[c.uid() for _ in range(6)]
 for actor,name in [(owner,'owner'),(other,'other')]:sql('INSERT INTO auth.users VALUES('+u(actor)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+u(actor)+",'quincena-"+name+"@synthetic.invalid','Gerencia',true);")
 sql('INSERT INTO fin_negocios(id,nombre) VALUES('+u(business)+",'Hato Lechero') ON CONFLICT(nombre) DO NOTHING;");business=sql("SELECT id FROM fin_negocios WHERE nombre='Hato Lechero';")
 sql('INSERT INTO fin_categorias_ingresos(id,nombre,negocio_id,activo) VALUES('+u(category)+",'Synthetic protected leche',"+u(business)+",true);INSERT INTO fin_regiones(id,nombre) VALUES("+u(region)+",'Synthetic protected region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+u(medium)+",'Synthetic protected medium');INSERT INTO hato_config(clave,valor) VALUES('retencion_ica_leche','0.0225') ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor;")
 fields=dict(year=2026,month=10,quincena=1,liters=100,pomar=100,cows=1,notes='Synthetic reviewed quincena',incomeDate='2026-10-15',gross=1000,regionId=region,mediumId=medium,buyerId=None,name=None)
 def draft(target=None,f=fields,kind='save'):return dict(version=1,kind=kind,targetId=target,fields=f if kind=='save' else None)
 def prepare(d,k=None,actor=owner):
  source=call('fn_hato_quincena_source_web',[js(d),u(actor)],actor=actor);intent=dict(d,observed=source['source']);key=k or c.uid();return key,call('fn_hato_quincena_web',[lit('prepare'),u(key),js(intent),u(actor)],actor=actor)
 def action(mode,key,actor=owner,ok=True):return call('fn_hato_quincena_web',[lit(mode),u(key),'NULL::jsonb',u(actor)],actor=actor,ok=ok)
 def refuse(label,ddl='',fn=None,key=None,args=None,actor=owner,role='authenticated'):
  before=whole(sql);statement='SELECT '+(fn or 'fn_hato_quincena_web')+'('+','.join(args or [lit('post'),u(key),'NULL::jsonb',u(actor)])+');';failed=sql('BEGIN;SET LOCAL request.jwt.claim.sub='+lit(actor or '')+';'+ddl+'SET LOCAL ROLE '+role+';SET LOCAL request.jwt.claim.sub='+lit(actor or '')+';'+statement+'COMMIT;',False)
  check(failed.returncode!=0 and whole(sql)==before,label+' refuses with exact whole-state rollback')
  if any(x in failed.stderr for x in ['syntax error','ambiguous','does not exist','is not assigned']):
   Path('/tmp/escocia-quincena-refusal-private.log').write_text(failed.stderr);raise AssertionError('Unexpected SQL defect in refusal: '+label+'; '+failed.stderr.splitlines()[0])
 missing=c.uid();sql('INSERT INTO auth.users VALUES('+u(missing)+');')
 refuse('missing active profile',fn='fn_hato_quincena_source_web',args=[js(draft()),u(missing)],actor=missing)
 refuse('forged source snapshot',fn='fn_hato_quincena_web',args=[lit('prepare'),u(c.uid()),js(dict(draft(),observed={})),u(owner)])
 refuse('invalid typed period',fn='fn_hato_quincena_source_web',args=[js(draft(f=dict(fields,year='2026'))),u(owner)])
 key,prepared=prepare(draft());check(prepared['state']=='pending' and prepared['plan']['tax']['net']==977.5,'create preparation captures exact ICA/gross/net pair without mutation')
 for role in ['anon','service_role']:refuse(role+' denied web entry',key=key,role=role)
 for label,ddl in [('inactive Gerencia','UPDATE public.usuarios SET activo=false WHERE id='+u(owner)+';'),('changed ICA',"UPDATE hato_config SET valor='0.03' WHERE clave='retencion_ica_leche';"),('changed category','UPDATE fin_categorias_ingresos SET activo=false WHERE id='+u(category)+';'),('suppressed income',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_quincena_fault BEFORE INSERT ON fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();"),('suppressed audit',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_quincena_fault BEFORE INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();"),('late actor revocation',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.usuarios SET activo=false WHERE id="+u(owner)+";RETURN NEW;END$$;CREATE TRIGGER synthetic_quincena_fault AFTER INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();")]:refuse(label,ddl,key=key)
 committed=action('post',key);check(committed['state']=='committed' and committed['receipt']['after']['income']['valor']==977.5,'create commits exact paired rows and trusted audit')
 before=whole(sql);check(action('post',key)==committed and whole(sql)==before,'lost committed response retry preserves exact whole database')
 recovered=call('fn_hato_quincena_recover_web',[u(owner)],actor=owner);check(recovered==committed,'independent original recovery needs no browser key')
 refuse('cross-owner original',key=key,actor=other);refuse('replacement before acknowledgment',fn='fn_hato_quincena_web',args=[lit('prepare'),u(c.uid()),js(committed['intent']),u(owner)])
 action('acknowledge',key);qid=committed['receipt']['after']['production']['id'];income=committed['receipt']['after']['income']['id']
 editkey,edit=prepare(draft(qid,dict(fields,gross=2000)));check(edit['plan']['tax']['net']==1955,'edit preview retains exact original pair and revised financial net')
 for label,ddl in [('competing financial edit','UPDATE public.fin_ingresos SET observaciones=\'Competing source\' WHERE id='+u(income)+';'),('competing quincena edit','UPDATE public.hato_produccion_quincenal SET notas=\'Competing source\' WHERE id='+u(qid)+';'),('suppressed control',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_quincena_fault BEFORE UPDATE ON hato_quincena.requests FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();"),('late extra financial mutation',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN UPDATE public.fin_ingresos SET observaciones='Unexpected effect' WHERE id="+u(income)+";RETURN NEW;END$$;CREATE TRIGGER synthetic_quincena_fault AFTER INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();")]:refuse(label,ddl,key=editkey)
 edited=action('post',editkey);check(edited['receipt']['after']['income']['valor']==1955 and len(edited['receipt']['corrections'])==1,'edit commits exact whole source and trusted quincena correction')
 action('acknowledge',editkey)
 def refuse_prepare(label,ddl,d):
  before=whole(sql);failed=sql('BEGIN;SET LOCAL request.jwt.claim.sub='+lit(owner)+';'+ddl+'SET LOCAL ROLE authenticated;DO $probe$ DECLARE d jsonb='+js(d)+';s jsonb;BEGIN s=fn_hato_quincena_source_web(d,'+u(owner)+");PERFORM fn_hato_quincena_web('prepare',"+u(c.uid())+",d||jsonb_build_object('observed',s->'source'),"+u(owner)+');END $probe$;COMMIT;',False);check(failed.returncode!=0 and whole(sql)==before,label+' refuses freshly observed source with full rollback')
  if 'Exclusive measured pair required' not in failed.stderr:raise AssertionError('Unexpected ownership refusal: '+label)
 alias=c.uid()
 refuse_prepare('shared monthly alias',"INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,fin_ingreso_id,created_by) VALUES("+u(alias)+",2035,1,1,50,'derivado_mensual',"+u(income)+','+u(owner)+');',draft(qid,kind='delete'))
 refuse_prepare('read-only derived source',"UPDATE public.hato_produccion_quincenal SET origen_dato='derivado_mensual',litros_total=100 WHERE id="+u(qid)+';',draft(qid))
 unknown=c.uid();refuse_prepare('other protected lifecycle claim','INSERT INTO hato_sale.requests(request_key,owner_id,state,intent,original,plan) VALUES('+u(unknown)+','+u(owner)+",'pending',"+js(dict(incomeId=income))+",'{}','{}');",draft(qid))
 deletekey,deletedraft=prepare(draft(qid,kind='delete'));refuse('suppressed outer delete audit',"CREATE FUNCTION public.synthetic_quincena_fault() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NULL;END$$;CREATE TRIGGER synthetic_quincena_fault BEFORE INSERT ON hato_quincena.audit FOR EACH ROW EXECUTE FUNCTION public.synthetic_quincena_fault();",key=deletekey)
 removed=action('post',deletekey);check(removed['receipt']['after']==dict(production=None,income=None) and len(removed['receipt']['corrections'])==1,'explicit reviewed exclusive pair deletion commits trusted retained before/audit')
 before=whole(sql);check(action('post',deletekey)==removed and whole(sql)==before,'delete original repeats receipt without deleting twice');action('acknowledge',deletekey)
 tomb=c.uid();check(action('resolve',tomb)['state']=='canceled','unknown cancellation records original tombstone');action('acknowledge',tomb)
 # Before the July2026 boundary, tax remains zero; changing a prepared original is refused.
 oldkey,old=prepare(draft(f=dict(fields,month=6,incomeDate='2026-06-15')));check(old['plan']['tax']['ica']==0 and old['plan']['tax']['net']==1000,'pre-July2026 captured tax contract preserved');action('resolve',oldkey);action('acknowledge',oldkey)
 for label,ddl in [('private control grant','GRANT UPDATE ON hato_quincena.requests TO service_role;'),('immutable binding loss','ALTER TABLE hato_quincena.audit DISABLE TRIGGER immutable_quincena_audit;'),('public entry search path','ALTER FUNCTION fn_hato_quincena_web(text,uuid,jsonb,uuid) SET search_path=public;')]:refuse(label,ddl,key=oldkey)
 # Two owners prepare the same vacant period; concurrent posting must yield one winner.
 owners=[owner,other];keys=[]
 for actor in owners:keys.append(prepare(draft(f=dict(fields,month=8,incomeDate='2026-08-15')),actor=actor)[0])
 def race(i):return action('post',keys[i],actor=owners[i],ok=False)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:attempts=list(pool.map(race,range(2)))
 winners=[i for i,v in enumerate(attempts) if v.returncode==0];check(len(winners)==1 and all(v.returncode==0 or 'source/day changed' in v.stderr for v in attempts),'two Gerencia owners competing on vacant period produce one winner and one stale original')
 before=whole(sql);winner=winners[0];check(action('post',keys[winner],actor=owners[winner])['state']=='committed' and whole(sql)==before,'winning concurrent original recovers without repeated pair creation')
 for i in range(2):
  if i!=winner:action('resolve',keys[i],actor=owners[i])
  action('acknowledge',keys[i],actor=owners[i])
 exercise.proof=dict(create_edit_delete=True,independent_original_recovery=True,whole_state_suppression_rollback=True,legacy_callers_grants_unchanged=True)
def main():
 a=argparse.ArgumentParser()
 for name in ('evidence-dir','runtime','client','output','private-diagnostics'):a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();files=list(dict.fromkeys([Path(__file__),SOURCE,*[r.ROOT/k for k in json.loads((r.ROOT/'docs/security-integrity/hato-quincena-admission-replay.json').read_text())['source_hashes']]]));sources={f:f.read_bytes() for f in files};catalog,rls,storage,t,hashes,admission=p.p.p.p.p.p.p.p.s.load(x.evidence_dir.resolve());p.p.p.p.p.p.p.p.install.inputs=(storage,t,rls,catalog)
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing quincena foundation sources cannot be certified')
 result.update(coordinated_candidate_count=54,admission_rollback_probes=2,proof=exercise.proof,source_hashes={str(f.relative_to(r.ROOT)):r.p.digest(v) for f,v in sources.items()},temporary_database_stopped_and_removed=True,limits=['Six local private structure snapshots and synthetic contained PG only; never production.','SQL foundation only; actual browser/finance callers, legacy RPC/direct grants and service/import/capture lanes unchanged. Hosted/runtime/global/capacity/coherent recovery remain gates.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
