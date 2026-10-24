#!/usr/bin/env python3
"""Exact64-candidate independent/shared correction foundation, synthetic local data only."""
import argparse,hashlib,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('general_finance_prior',Path(__file__).with_name('financial-sale-correction-browser-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p,c,ROOT=b.r,b.p,b.c,b.ROOT
SOURCE=ROOT/'src/sql/security-candidates/financial-general-correction.sql';REPORT=ROOT/'docs/security-integrity/financial-sale-correction-browser-replay.json'
FILES=['scripts/security/build-financial-general-correction.py','scripts/security/financial-general-correction-source.sql','scripts/security/financial-general-correction-replay.py','scripts/security/financial-general-correction-native.mjs','src/sql/security-candidates/financial-general-correction.sql']
def metadata(sql):
 # The prior finance query selects by body/name; the new recover entry delegates
 # to its private core and has no old measured-income keyword. Include the whole
 # new public family so the unchanged exact-three-entry set assertion covers it.
 query=b.SCHEMA.read_text().replace("p.proname~'quincena|income_invoice|income_metadata'","p.proname~'quincena|income_invoice|income_metadata|^fn_financial_general_correction_'")
 return sql(query)
def install(sql):
 b.install(sql);original_query=p.query(sql);before=sql(original_query);authority=json.loads(metadata(sql));sql(SOURCE.read_text());after=json.loads(metadata(sql))
 if sql(original_query)!=before or sql('SELECT(SELECT count(*) FROM financial_general_correction.requests)+(SELECT count(*) FROM financial_general_correction.audit);')!='0':raise AssertionError('General financial installation changed existing rows or seeded controls')
 for section in authority:
  if section!='functions' and authority[section]!=after[section]:raise AssertionError('Changed preserved financial authority: '+section)
 old={f['identity']:f for f in authority['functions']};new={f['identity']:f for f in after['functions']}
 expected={'fn_financial_general_correction_source_web(jsonb,uuid)','fn_financial_general_correction_web(text,uuid,jsonb,uuid)','fn_financial_general_correction_recover_web(uuid)'}
 if set(new)-set(old)!=expected or set(old)-set(new):
  dest=Path('/tmp/escocia-general-financial-functions-private.json');dest.touch(mode=0o600,exist_ok=True);dest.write_text(json.dumps(dict(expected=sorted(expected),added=sorted(set(new)-set(old)),removed=sorted(set(old)-set(new)),before=authority,after=after),indent=2));raise AssertionError('Unexpected financial function set change; external catalog diagnostic retained')
 for name,item in old.items():
  if name=='hato_income_metadata.assert_controls()':item=dict(item,body_md5=new[name]['body_md5'])
  if item!=new[name]:raise AssertionError('Unexpected existing function change: '+name)
 print('PASS candidate64 installed with existing rows,table/column ACLs,policies,FKs,triggers preserved',flush=True)
def exercise(sql,ctx):
 b.exercise.client=exercise.client;b.exercise(sql,ctx);check=ctx['check'];authority=metadata(sql);query=p.query(sql);owner=c.uid();target=c.uid()
 sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 income=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i ORDER BY id LIMIT 1;'));income.update(id=target,created_by=owner,updated_by=owner,nombre='Synthetic independent original',observaciones='Synthetic retained observation')
 sql('INSERT INTO fin_ingresos SELECT x.* FROM jsonb_populate_record(NULL::fin_ingresos,'+p.js(income)+')x;')
 income=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i WHERE id='+p.u(target)+';'))
 business,category,region,medium,buyer=[c.uid() for _ in range(5)]
 sql('INSERT INTO fin_negocios(id,nombre) VALUES('+p.u(business)+",'Synthetic general correction business');INSERT INTO fin_categorias_ingresos(id,negocio_id,nombre) VALUES("+p.u(category)+','+p.u(business)+",'Synthetic general correction category');INSERT INTO fin_regiones(id,nombre) VALUES("+p.u(region)+",'Synthetic general correction region');INSERT INTO fin_medios_pago(id,nombre) VALUES("+p.u(medium)+",'Synthetic general correction medium');INSERT INTO fin_compradores(id,nombre) VALUES("+p.u(buyer)+",'Synthetic general correction buyer');")
 fields=dict(date='2053-04-05',businessId=business,categoryId=category,name='Synthetic reviewed general correction',regionId=region,mediumId=medium,buyerId=buyer,value='887.50');draft=dict(version=1,kind='generalFinancial',targetId=target,fields=fields)
 def call(action,key,intent=None,actor=owner):return ctx['call']('fn_financial_general_correction_web',[p.lit(action),p.u(key),p.js(intent) if intent is not None else 'NULL::jsonb',p.u(actor)],actor=actor)
 def capture(d=None):return ctx['call']('fn_financial_general_correction_source_web',[p.js(draft if d is None else d),p.u(owner)],actor=owner)
 def deny(statement,label,required,prefix='',actor=owner):
  before=sql(query);out=sql('BEGIN;'+prefix+'SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(actor)+';'+statement+'COMMIT;',False)
  if out.returncode==0 or required not in out.stderr or sql(query)!=before or metadata(sql)!=authority:
   dest=Path('/tmp/escocia-general-financial-denial-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(out.stderr);raise AssertionError('Unexpected general financial refusal: '+label)
  check(True,label+' refuses with complete row/catalog rollback')
 captured=capture();check(captured['source']['aliases']==[],'independent source has no invented production alias');intent=dict(draft,observed=captured['source']);key=c.uid();before=sql('SELECT to_jsonb(i) FROM fin_ingresos i WHERE id='+p.u(target)+';')
 prepared=call('prepare',key,intent);check(prepared['state']=='pending' and sql('SELECT to_jsonb(i) FROM fin_ingresos i WHERE id='+p.u(target)+';')==before,'prepare captures source/plan without income mutation')
 check(call('prepare',key,intent)==prepared,'same original prepare is stable')
 wrong=dict(intent,fields=dict(fields,value='888.50'));deny('SELECT fn_financial_general_correction_web(\'prepare\','+p.u(key)+','+p.js(wrong)+','+p.u(owner)+');','changed original intent','Original quincena intent changed')
 posted=call('post',key);row=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i WHERE id='+p.u(target)+';'));expected=dict(prepared['plan']['afterIncome'],updated_at=posted['receipt']['recordedAt'])
 mapped=dict(fecha=fields['date'],negocio_id=business,categoria_id=category,nombre=fields['name'],region_id=region,medio_pago_id=medium,comprador_id=buyer,valor=float(fields['value']))
 check(all(row[k]==v and income[k]!=v for k,v in mapped.items()),'independent literal readback verifies all eight authorized fields actually changed')
 check(posted['state']=='committed' and row==expected and posted['receipt']['after']['income']==row,'all eight exact planned financial fields independently match row/receipt')
 retained=['cantidad','precio_unitario','observaciones','url_factura','created_by','created_at','cosecha','alianza','cliente','finca','cabezas']
 check(all(row[k]==income[k] for k in retained),'quantity/invoice/observations/creator and all other nonfinancial fields preserved')
 check(call('post',key)==posted,'duplicate post returns original committed result')
 recovered=ctx['call']('fn_financial_general_correction_recover_web',[p.u(owner)],actor=owner);check(recovered==posted,'owner recovery returns original after lost response')
 audit=json.loads(sql('SELECT receipt FROM financial_general_correction.audit WHERE request_key='+p.u(key)+';'));check(audit==posted['receipt'] and audit['actor']==dict(origin='web',profileId=owner),'immutable trusted audit exactly matches actor/receipt')
 check(audit['corrections']==[] and audit['before']['income']==income and audit['original']['aliases']==[],'financial-only receipt retains complete before source without invented clinical audit')
 call('acknowledge',key)
 alias_ids=[c.uid(),c.uid()]
 for n,qid in enumerate(alias_ids):sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES('+p.u(qid)+',2093,'+str(n+1)+",1,4,'derivado_mensual',"+p.u(owner)+','+p.u(target)+');')
 draft=dict(draft,fields=dict(fields,value='888.50',name='Synthetic shared monthly correction'));aliases=capture()['source']['aliases'];check(len(aliases)==2 and {q['id'] for q in aliases}==set(alias_ids),'shared monthly source captures every complete retained alias')
 intent=dict(draft,observed=capture()['source']);key=c.uid();call('prepare',key,intent);posted=call('post',key)
 check(capture()['source']['aliases']==aliases and posted['receipt']['original']['aliases']==aliases and posted['receipt']['after']['income']['valor']==888.5,'shared correction preserves every alias,link and historical production value')
 call('acknowledge',key);intent=dict(draft,observed=capture()['source']);key=c.uid();call('prepare',key,intent)
 sql('BEGIN;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";UPDATE hato_produccion_quincenal SET notas='Synthetic competing alias writer' WHERE id="+p.u(alias_ids[0])+';COMMIT;')
 deny('SELECT fn_financial_general_correction_web(\'post\','+p.u(key)+',NULL,'+p.u(owner)+');','changed alias CAS','Original quincena source/day changed')
 check(call('resolve',key)['state']=='canceled','stale alias original explicitly canceled without posting');call('acknowledge',key)
 for value in ['1.001','0','-1','NaN']:
  bad=dict(draft,fields=dict(fields,value=value));deny('SELECT fn_financial_general_correction_source_web('+p.js(bad)+','+p.u(owner)+');','invalid exact money '+value,'Exact positive bounded financial money required')
 sale=sql('SELECT fin_ingreso_id FROM hato_eventos WHERE fin_ingreso_id IS NOT NULL ORDER BY id LIMIT 1;');bad=dict(draft,targetId=sale)
 deny('SELECT fn_financial_general_correction_source_web('+p.js(bad)+','+p.u(owner)+');','retained protected sale/event','Retained sale/event claim')
 deny('SELECT fn_financial_general_correction_source_web('+p.js(draft)+','+p.u(owner)+');','measured alias claim','Protected measured/unknown milk claim',prefix='SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';UPDATE hato_produccion_quincenal SET origen_dato=\'medido\',litros_total=NULL WHERE id='+p.u(alias_ids[0])+';')
 for ddl,label in [('ALTER FUNCTION fn_financial_general_correction_source_web(jsonb,uuid) SET search_path=public;','source search_path drift'),('GRANT EXECUTE ON FUNCTION fn_financial_general_correction_web(text,uuid,jsonb,uuid) TO anon;','anonymous execute drift'),('ALTER TABLE financial_general_correction.audit DISABLE TRIGGER immutable_correction_audit;','immutable audit trigger drift')]:
  deny('SELECT fn_financial_general_correction_source_web('+p.js(draft)+','+p.u(owner)+');',label,'drift',prefix=ddl)
 for role,active,label in [('Gerencia',False,'inactive'),('Administrador',True,'other role'),(None,None,'missing profile')]:
  actor=c.uid();sql('INSERT INTO auth.users VALUES('+p.u(actor)+');')
  if role:sql('INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(actor)+','+p.lit(actor+'@synthetic.invalid')+','+p.lit(role)+','+str(active).lower()+');')
  deny('SELECT fn_financial_general_correction_source_web('+p.js(draft)+','+p.u(actor)+');',label,'Fresh active Gerencia',actor=actor)
 args=dict(socket=sql('SHOW unix_socket_directories;'),client=str(exercise.client),owner=owner,income=target,stateQuery=query)
 proc=subprocess.run(['node',str(Path(__file__).with_name('financial-general-correction-native.mjs'))],input=json.dumps(args),text=True,capture_output=True,cwd=ROOT,timeout=60)
 if proc.returncode:
  dest=Path('/tmp/escocia-general-financial-races-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(proc.stderr);raise AssertionError('General financial native race failed; inspect external diagnostics')
 exercise.races=json.loads(proc.stdout)
 for label in exercise.races['checks']:check(True,'general finance race: '+label)
 check(metadata(sql)==authority,'general proof preserves all original financial authority')
def main():
 a=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();prior=json.loads(REPORT.read_text())
 if any(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v for k,v in prior['source_hashes'].items()):raise ValueError('Published caller sources changed')
 files=list(dict.fromkeys([REPORT,*[ROOT/k for k in prior['source_hashes']],*[ROOT/k for k in FILES]]));frozen={f:f.read_bytes() for f in files}
 boundary=b.b.b.b;base=boundary.b.b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if hashes!=prior['snapshot_hashes']:raise ValueError('Private snapshot provenance mismatch')
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing general financial sources cannot be certified')
 result.update(coordinated_candidate_count=64,installed_sdk=b.exercise.sdk,native_general_races=exercise.races,source_hashes={str(f.relative_to(ROOT)):hashlib.sha256(v).hexdigest() for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local structure snapshots and synthetic contained PostgreSQL only;never production.','General/shared-monthly eight-field financial correction foundation only. Quantity/observations/invoice/creation/deletion and actual general callers are separate compatible gates;shared links/history remain intact.','No ordinary grant retirement or import/service/backfill change. Coordinated ganado,remaining financial lifecycle,readers/runtime/global/recovery/release remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
