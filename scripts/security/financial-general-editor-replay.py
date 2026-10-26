#!/usr/bin/env python3
"""One contained proof of compatible editor fields and old original recovery."""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('editor_prior',Path(__file__).with_name('financial-general-correction-sdk-replay.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
r,p,c,ROOT=b.r,b.p,b.c,b.ROOT
SOURCE=ROOT/'src/sql/security-candidates/financial-general-editor.sql'
REPORT=ROOT/'docs/security-integrity/financial-general-correction-sdk-replay.json'
FILES=['scripts/security/build-financial-general-editor.py','scripts/security/financial-general-editor-replay.py','src/sql/security-candidates/financial-general-editor.sql']
def metadata(sql):
 query=b.b.b.SCHEMA.read_text().replace("'hato_quincena','hato_income_metadata','invoice_upload','hato_sale'","'hato_quincena','hato_income_metadata','invoice_upload','hato_sale','financial_general_correction'").replace("p.proname~'quincena|income_invoice|income_metadata'","p.proname~'quincena|income_invoice|income_metadata|^fn_financial_general_correction_'")
 return sql(query)
def exercise(sql,ctx):
 b.exercise.client=exercise.client;b.exercise(sql,ctx)
 check=ctx['check'];query=p.query(sql);owner,target=[c.uid() for _ in range(2)]
 sql('INSERT INTO auth.users VALUES('+p.u(owner)+');INSERT INTO usuarios(id,email,rol,activo) VALUES('+p.u(owner)+','+p.lit(owner+'@synthetic.invalid')+",'Gerencia',true);")
 income=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i ORDER BY id LIMIT 1;'));income.update(id=target,created_by=owner,updated_by=owner,nombre='Synthetic editor source',cantidad=2,precio_unitario=12.5,observaciones='Retained original observations',url_factura='legacy/synthetic-retained.pdf')
 sql('INSERT INTO fin_ingresos SELECT x.* FROM jsonb_populate_record(NULL::fin_ingresos,'+p.js(income)+')x;')
 fields=dict(date=income['fecha'],businessId=income['negocio_id'],categoryId=income['categoria_id'],name='Synthetic editor reviewed',regionId=income['region_id'],mediumId=income['medio_pago_id'],buyerId=income['comprador_id'],value='100.01')
 draft=dict(version=1,kind='generalFinancial',targetId=target,fields=fields)
 def capture(d):return ctx['call']('fn_financial_general_correction_source_web',[p.js(d),p.u(owner)],actor=owner)['source']
 def call(action,key,intent=None):return ctx['call']('fn_financial_general_correction_web',[p.lit(action),p.u(key),p.js(intent) if intent is not None else 'NULL::jsonb',p.u(owner)],actor=owner)
 committed_key=c.uid();committed_intent=dict(draft,observed=capture(draft));call('prepare',committed_key,committed_intent);original_receipt=call('post',committed_key);call('acknowledge',committed_key)
 key=c.uid();intent=dict(draft,observed=capture(draft));prepared=call('prepare',key,intent)
 before=sql(query);authority=json.loads(metadata(sql));sql(SOURCE.read_text());after=json.loads(metadata(sql))
 check(sql(query)==before,'candidate65 installation preserves all existing domain/private rows including version1 pending original')
 changed={'financial_general_correction.validate(jsonb,boolean)','financial_general_correction.source(jsonb)','financial_general_correction.plan(jsonb,jsonb,uuid)','fn_financial_general_correction_web(text,uuid,jsonb,uuid)','financial_general_correction.assert_controls()','hato_income_metadata.assert_controls()'}
 old={f['identity']:f for f in authority['functions']};new={f['identity']:f for f in after['functions']}
 check(set(old)==set(new),'editor adds/removes no public or private financial function')
 actual=set()
 for k,v in old.items():
  if v!=new[k]:
   actual.add(k);expected=dict(v,body_md5=new[k]['body_md5']);check(expected==new[k],'only reviewed body changes for '+k)
 check(actual==changed,'exact six reviewed function body replacements and no others')
 check(all(authority[k]==after[k] for k in authority if k!='functions'),'table/column ACLs,triggers,FKs,policies and other financial authority unchanged')
 check(call('post',committed_key)==dict(original_receipt,acknowledged=True),'pre-install version1 committed original recovers unchanged after extension')
 check(call('prepare',key,intent)==prepared,'pre-install version1 pending preparation recovers unchanged')
 posted=call('post',key);check(posted['plan']==prepared['plan'] and all(posted['receipt']['after']['income'][k]==income[k] for k in ['cantidad','precio_unitario','observaciones','url_factura']),'pre-install version1 post preserves all nonfinancial fields and original plan')
 check(call('post',key)==posted,'pre-install version1 original duplicate remains stable');call('acknowledge',key)
 alias_ids=[c.uid(),c.uid()]
 for n,qid in enumerate(alias_ids):sql('INSERT INTO hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES('+p.u(qid)+',2096,'+str(n+1)+",1,4,'derivado_mensual',"+p.u(owner)+','+p.u(target)+');')
 draft=dict(draft,version=2,fields=dict(fields,quantity='3',observations='Explicit reviewed observation',invoice=income['url_factura']))
 authority=metadata(sql)
 def deny(d,label,reason):
  before=sql(query);out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_financial_general_correction_source_web('+p.js(d)+','+p.u(owner)+');COMMIT;',False)
  if out.returncode==0 or reason not in out.stderr or sql(query)!=before or metadata(sql)!=authority:
   dest=Path('/tmp/escocia-general-editor-denial-private.log');dest.touch(mode=0o600,exist_ok=True);dest.write_text(out.stderr);raise AssertionError('Unexpected editor refusal: '+label)
  check(True,label+' refuses with whole-domain/control/catalog preservation')
 for qty,price in [('3',33.34),('0',None),(None,None),('0.000001',100010000),('2',50.01)]:
  d=dict(draft,fields=dict(draft['fields'],quantity=qty));source=capture(d);intent=dict(d,observed=source);key=c.uid();pending=call('prepare',key,intent)
  check(pending['plan']['afterIncome']['cantidad']==(float(qty) if qty is not None else None) and pending['plan']['afterIncome']['precio_unitario']==price,'exact numeric quantity and rounded unit price in preview '+str(qty))
  result=call('post',key);row=json.loads(sql('SELECT to_jsonb(i) FROM fin_ingresos i WHERE id='+p.u(target)+';'))
  check(row==dict(pending['plan']['afterIncome'],updated_at=result['receipt']['recordedAt']) and row==result['receipt']['after']['income'],'complete editor row/receipt matches captured plan '+str(qty))
  check(row['observaciones']==d['fields']['observations'] and row['url_factura']==income['url_factura'] and capture(d)['aliases']==source['aliases'],'observations change explicitly;invoice and every shared monthly alias stay intact')
  check(call('post',key)==result and ctx['call']('fn_financial_general_correction_recover_web',[p.u(owner)],actor=owner)==result,'version2 duplicate and private recovery retain same receipt')
  check(json.loads(sql('SELECT receipt FROM financial_general_correction.audit WHERE request_key='+p.u(key)+';'))==result['receipt'],'version2 immutable audit matches complete trusted result');call('acknowledge',key)
 d=dict(draft,fields=dict(draft['fields'],invoice=None,observations=None));intent=dict(d,observed=capture(d));key=c.uid();call('prepare',key,intent);result=call('post',key)
 check(result['receipt']['after']['income']['url_factura'] is None and result['receipt']['after']['income']['observaciones'] is None,'explicit nullable metadata removal keeps immutable before invoice/history')
 call('acknowledge',key)
 for quantity in ['-1','NaN','1e2','1.0000001','10000000000000',3]:deny(dict(draft,fields=dict(draft['fields'],quantity=quantity)),'invalid quantity '+str(quantity),'Exact nonnegative bounded quantity')
 deny(dict(draft,fields=dict(draft['fields'],value='9999999999999.99',quantity='0.000001')),'unit price overflow','Calculated unit price exceeds stored precision')
 deny(dict(draft,fields=dict(draft['fields'],observations='x'*8001)),'oversized observations','Bounded nullable observations')
 deny(dict(draft,fields=dict(draft['fields'],invoice='verified/forged.pdf')),'unproven new invoice','New general invoice requires protected original attachment')
 deny(dict(draft,fields=dict(draft['fields'],unitPrice='0.01')),'client-supplied unit price','Only reviewed financial fields')
 # A trigger that suppresses only the newly authorized quantity cannot pass readback.
 d=dict(draft,fields=dict(draft['fields'],quantity='6',invoice=None));intent=dict(d,observed=capture(d));key=c.uid();call('prepare',key,intent)
 before=sql(query)
 out=sql('BEGIN;CREATE FUNCTION public.synthetic_editor_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.cantidad=OLD.cantidad;RETURN NEW;END $$;CREATE TRIGGER synthetic_editor_suppress BEFORE UPDATE ON public.fin_ingresos FOR EACH ROW EXECUTE FUNCTION public.synthetic_editor_suppress();SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_financial_general_correction_web(\'post\','+p.u(key)+',NULL,'+p.u(owner)+');COMMIT;',False)
 check(out.returncode!=0 and 'Unreviewed quincena financial source baseline' in out.stderr and sql(query)==before and metadata(sql)==authority,'unreviewed quantity-suppression trigger refuses before mutation with whole rollback')
 call('resolve',key);call('acknowledge',key)
 # Current original CAS includes unchanged quantity,observations and invoice too.
 d=dict(draft,fields=dict(draft['fields'],invoice=None));intent=dict(d,observed=capture(d));key=c.uid();call('prepare',key,intent)
 sql('BEGIN;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+";UPDATE fin_ingresos SET observaciones='Synthetic competing observation' WHERE id="+p.u(target)+';COMMIT;')
 before=sql(query);out=sql('BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='+p.lit(owner)+';SELECT fn_financial_general_correction_web(\'post\','+p.u(key)+',NULL,'+p.u(owner)+');COMMIT;',False)
 check(out.returncode!=0 and 'Original quincena source/day changed' in out.stderr and sql(query)==before,'concurrent metadata edit refuses stale original without partial financial mutation')
 call('resolve',key);call('acknowledge',key)
 check(metadata(sql)==authority,'all editor mutations preserve exact financial catalog/authority')
def main():
 a=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:a.add_argument('--'+name,type=Path,required=True)
 x=a.parse_args();exercise.client=x.client.resolve();prior=json.loads(REPORT.read_text())
 if any(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v for k,v in prior['source_hashes'].items()):raise ValueError('Published SDK sources changed')
 files=list(dict.fromkeys([REPORT,*[ROOT/k for k in prior['source_hashes']],*[ROOT/k for k in FILES]]));frozen={f:f.read_bytes() for f in files}
 boundary=b.b.b.b.b.b;base=boundary.b.b.b.b.b.m.b.p.p
 while not hasattr(base,'s'):base=base.p
 catalog,rls,storage,t,hashes,_=base.s.load(x.evidence_dir.resolve());base.install.inputs=(storage,t,rls,catalog)
 if hashes!=prior['snapshot_hashes']:raise ValueError('Private snapshot provenance mismatch')
 if x.output.resolve().is_relative_to(x.evidence_dir.resolve()) or x.output.name.endswith('-private.json'):raise ValueError('Private output boundary')
 with r.database(x.runtime.resolve(),x.client.resolve(),x.private_diagnostics.resolve()) as sql:result=c.run(catalog,rls,hashes,sql,followup=exercise,installation=b.b.install)
 if any(f.read_bytes()!=v for f,v in frozen.items()):raise ValueError('Changing editor sources cannot be certified')
 result.update(coordinated_candidate_count=65,installed_sdk=dict(sale=b.b.b.exercise.sdk,general=b.exercise.sdk),native_general_races=b.b.exercise.races,source_hashes={str(f.relative_to(ROOT)):hashlib.sha256(v).hexdigest() for f,v in frozen.items()},temporary_database_stopped_and_removed=True,limits=['Six approved local structure snapshots and synthetic local PG only;never production.','Version2 quantity/rounded unit price and observations,invoice retain/remove foundation only;new invoice target-bound origin and actual full form cutover remain separate. Version1 original contract preserved.','No inferred or repartitioned monthly history;no grant/import/service change. Actual callers,creation/deletion,ganado,retirement,readers/runtime/recovery remain open.'])
 x.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
