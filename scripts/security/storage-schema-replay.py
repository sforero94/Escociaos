#!/usr/bin/env python3
"""Exact private Storage structure on contained local PG17 only; no bucket/object data."""
import argparse,hashlib,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('storage_preflight_replay',Path(__file__).with_name('storage-schema-preflight.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
r,q,lit=p.r,p.r.q,p.r.lit
STORAGE='live-catalog-storage-supplement-private.json';TYPE='live-catalog-storage-buckettype-private.json'
def load(evidence):
 catalog,rls,hashes=r.load(evidence);items=[]
 for name in [STORAGE,TYPE]:
  raw=(evidence/name).read_bytes();hashes[name]=hashlib.sha256(raw).hexdigest();items.append(json.loads(raw))
 storage,addendum=items;augmented,t=p.with_type_addendum(storage,addendum);admission=p.assess(catalog,rls,augmented)
 if not admission['exact_replay_admission_passed']:raise ValueError('Storage preflight refused')
 return catalog,rls,storage,t,hashes,admission

def install(storage,t,rls,catalog,sql):
 names=[x['rolname'] for x in catalog['roles']];owner=storage['schema_acl']['owner'];lines=['CREATE SCHEMA storage AUTHORIZATION '+q(owner)+';','SET ROLE '+q(owner)+';','SET check_function_bodies=off;','CREATE TYPE storage.'+q(t['typname'])+' AS ENUM('+','.join(lit(x['label']) for x in t['enum_labels'])+');']
 if t['owner']!=owner:lines.append('ALTER TYPE storage.'+q(t['typname'])+' OWNER TO '+q(t['owner'])+';')
 for f in storage['functions']:lines.append(f['definition']+';')
 for table in storage['relations']:
  columns=sorted((c for c in storage['columns'] if c['table']==table['table']),key=lambda c:c['attnum']);defs=[];gaps=[];pos=1
  for c in columns:
   while pos<c['attnum']:
    gap='__storage_replay_dropped_'+str(pos);defs.append(q(gap)+' integer');gaps.append(gap);pos+=1
   d=q(c['column'])+' '+c['formatted_type']
   if c['collation'] is not None:d+=' COLLATE '+q(c['collation'])
   if c['identity']:raise ValueError('Storage identity sequence not supplied')
   if c['generated']:
    if c['generated']!='s' or c['default_expr'] is None:raise ValueError('Unsupported generated Storage column')
    d+=' GENERATED ALWAYS AS ('+c['default_expr']+') STORED'
   elif c['default_expr'] is not None:d+=' DEFAULT '+c['default_expr']
   if c['not_null']:d+=' NOT NULL'
   defs.append(d);pos+=1
  target='storage.'+q(table['table']);lines.append('CREATE TABLE '+target+'('+','.join(defs)+');')
  lines.extend('ALTER TABLE '+target+' DROP COLUMN '+q(g)+';' for g in gaps)
 lines.append('RESET ROLE;');sql('\n'.join(lines),bootstrap=True)
 for kind in ['p','u','c','f','x']:
  lines=['ALTER TABLE storage.'+q(c['table'])+' ADD CONSTRAINT '+q(c['name'])+' '+c['def']+';' for c in storage['constraints'] if c['contype']==kind]
  if lines:sql('SET ROLE '+q(owner)+';'+ '\n'.join(lines)+'RESET ROLE;',bootstrap=True)
 existing=set(json.loads(sql("SELECT coalesce(json_agg(indexname),'[]') FROM pg_indexes WHERE schemaname='storage';")))
 lines=[x['indexdef']+';' for x in storage['indexes'] if x['name'] not in existing]
 for x in storage['triggers']:lines.append(x['def']+';ALTER TABLE storage.'+q(x['table'])+' '+{'O':'ENABLE','D':'DISABLE','A':'ENABLE ALWAYS','R':'ENABLE REPLICA'}[x['enabled']]+' TRIGGER '+q(x['name'])+';')
 for table in storage['relations']:
  target='storage.'+q(table['table'])
  lines.append('ALTER TABLE '+target+' OWNER TO '+q(table['owner'])+';')
  if table['relrowsecurity']:lines.append('ALTER TABLE '+target+' ENABLE ROW LEVEL SECURITY;')
  if table['relforcerowsecurity']:lines.append('ALTER TABLE '+target+' FORCE ROW LEVEL SECURITY;')
 for x in rls['policies']:
  if x['schema']!='storage':continue
  d='CREATE POLICY '+q(x['policy'])+' ON storage.'+q(x['table'])+' AS '+x['permissive']+' FOR '+x['cmd']+' TO '+','.join('PUBLIC' if n=='public' else q(n) for n in x['roles'])
  if x['using'] is not None:d+=' USING ('+x['using']+')'
  if x['with_check'] is not None:d+=' WITH CHECK ('+x['with_check']+')'
  lines.append(d+';')
 sql('SET ROLE '+q(owner)+';'+'\n'.join(lines)+'RESET ROLE;',bootstrap=True)
 lines=[r.acl(storage['schema_acl']['nspacl'],'storage','n',names)]
 for f in storage['functions']:
  target=q(f['schema'])+'.'+q(f['name'])+'('+f['identity_args']+')';lines.append('ALTER FUNCTION '+target+' OWNER TO '+q(f['owner'])+';');lines.append(r.acl(f['proacl'],target,'f',names))
 for x in storage['relations']:lines.append(r.acl(x['relacl'],'storage.'+q(x['table']),'r',names))
 for x in storage['columns']:
  if x['attacl'] is not None:lines.append(r.acl(x['attacl'],'storage.'+q(x['table']),'r',names,column=x['column']))
 lines.append(r.acl(t['typacl'],'storage.'+q(t['typname']),'T',names))
 for x in storage['default_acls']:lines.append(r.acl(x['acl'],'',x['objtype'],names,defaults='ALTER DEFAULT PRIVILEGES FOR ROLE '+q(x['role'])+' IN SCHEMA storage '))
 sql('\n'.join(lines),bootstrap=True)

def rows(sql,query):return json.loads(sql("SELECT coalesce(json_agg(x),'[]') FROM ("+query+') x;'))
def verify(storage,t,rls,sql):
 mismatches=[];counts={}
 def compare(section,expected,actual,keys):
  left={tuple(x[k] for k in keys):x for x in expected};right={tuple(x[k] for k in keys):x for x in actual};counts[section]=len(left)
  if len(left)!=len(expected) or len(right)!=len(actual):mismatches.append({'section':section,'fields':['duplicate identity']})
  for key in sorted(left.keys()|right.keys()):
   if key not in left or key not in right:mismatches.append({'section':section,'identity':key,'fields':['identity']})
   else:
    fields=[k for k in left[key] if left[key][k]!=right[key].get(k)]
    if fields:mismatches.append({'section':section,'identity':key,'fields':fields})
 # ACL normalization preserves grantee/grantor/options while ignoring entry order.
 def acl(expression,kind,owner):return "(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.grantor,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce("+expression+",acldefault('"+kind+"',"+owner+')))a)'
 def acl_equal(actual,expected,kind,owner):return acl(actual,kind,owner)+' IS NOT DISTINCT FROM '+acl('NULL::aclitem[]' if expected is None else lit(expected)+'::aclitem[]',kind,owner)
 rel_fields=['table','owner','relrowsecurity','relforcerowsecurity','relkind','relispartition','relhasrules']
 compare('relations',[{k:x[k] for k in rel_fields} for x in storage['relations']],rows(sql,"SELECT c.relname AS table,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity,c.relkind,c.relispartition,c.relhasrules FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relkind IN('r','p')"),('table',))
 compare('columns',storage['columns'],rows(sql,"""SELECT c.relname AS table,a.attname AS column,a.attnum,format_type(a.atttypid,a.atttypmod) formatted_type,a.atttypmod typmod,a.attnotnull not_null,a.attidentity identity,a.attgenerated generated,pg_get_expr(d.adbin,d.adrelid) default_expr,col.collname collation,a.attacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum LEFT JOIN pg_collation col ON col.oid=a.attcollation WHERE n.nspname='storage' AND c.relkind='r'"""),('table','column'))
 compare('constraints',storage['constraints'],rows(sql,"SELECT r.relname AS table,c.conname AS name,c.contype,pg_get_constraintdef(c.oid) AS def,c.convalidated,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='storage'"),('table','name'))
 compare('indexes',storage['indexes'],rows(sql,"SELECT t.relname AS table,c.relname AS name,pg_get_indexdef(i.indexrelid) indexdef,i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct,i.indnkeyatts,i.indnatts,pg_get_expr(i.indpred,i.indrelid) predicate FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='storage'"),('table','name'))
 compare('triggers',storage['triggers'],rows(sql,"SELECT c.relname AS table,t.tgname AS name,pg_get_triggerdef(t.oid) AS def,t.tgenabled AS enabled,t.tgfoid::regproc::text AS function FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND NOT t.tgisinternal"),('table','name'))
 fields=['schema','name','identity_args','result','owner','kind','volatility','security_definer','proconfig']
 expected=[dict({k:f[k] for k in fields},body_md5=hashlib.md5(r.p.function_body(f['definition']).encode()).hexdigest()) for f in storage['functions']]
 compare('functions',expected,rows(sql,"SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_result(p.oid) result,pg_get_userbyid(p.proowner) owner,p.prokind kind,p.provolatile volatility,p.prosecdef security_definer,p.proconfig,md5(p.prosrc) body_md5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='storage'"),('schema','name','identity_args'))
 compare('policies',[x for x in rls['policies'] if x['schema']=='storage'],rows(sql,"SELECT schemaname schema,tablename AS table,policyname policy,permissive,roles,cmd,qual AS using,with_check FROM pg_policies WHERE schemaname='storage'"),('schema','table','policy'))
 checks=[]
 for x in storage['relations']:checks.append('SELECT '+acl_equal('c.relacl',x['relacl'],'r','c.relowner')+' matches FROM pg_class c WHERE c.oid='+lit('storage.'+x['table'])+'::regclass')
 for f in storage['functions']:checks.append('SELECT '+acl_equal('p.proacl',f['proacl'],'f','p.proowner')+' matches FROM pg_proc p WHERE p.pronamespace='+lit(f['schema'])+'::regnamespace AND p.proname='+lit(f['name'])+' AND pg_get_function_identity_arguments(p.oid)='+lit(f['identity_args']))
 checks.append('SELECT '+acl_equal('n.nspacl',storage['schema_acl']['nspacl'],'n','n.nspowner')+" matches FROM pg_namespace n WHERE n.nspname='storage'")
 checks.append('SELECT '+acl_equal('t.typacl',t['typacl'],'T','t.typowner')+" matches FROM pg_type t WHERE t.oid='storage.buckettype'::regtype")
 results=rows(sql,' UNION ALL '.join(checks));counts['acl_checks']=len(checks)
 if len(results)!=len(checks) or not all(x['matches'] for x in results):mismatches.append({'section':'ACLs','fields':['owner/grantee/grantor/options']})
 default_expected=storage['default_acls'];default_checks=[]
 for x in default_expected:
  default_checks.append('SELECT '+acl_equal('d.defaclacl',x['acl'],x['objtype'],'d.defaclrole')+" matches FROM pg_default_acl d WHERE d.defaclnamespace='storage'::regnamespace AND d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname="+lit(x['role'])+') AND d.defaclobjtype='+lit(x['objtype']))
 default_results=rows(sql,' UNION ALL '.join(default_checks))
 if len(default_results)!=len(default_expected) or not all(x['matches'] for x in default_results) or sql("SELECT count(*) FROM pg_default_acl WHERE defaclnamespace='storage'::regnamespace;")!=str(len(default_expected)):mismatches.append({'section':'default ACLs','fields':['identity/grantor/options']})
 counts['default_acl_checks']=len(default_checks)
 native_type=rows(sql,"SELECT n.nspname schema,t.typname,t.typtype,pg_get_userbyid(t.typowner) owner,t.typbasetype::regtype::text base_type,t.typcategory,t.typlen,t.typbyval,t.typnotnull,t.typdefault,EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e') extension_owned FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.oid='storage.buckettype'::regtype")
 type_fields=['schema','typname','typtype','owner','base_type','typcategory','typlen','typbyval','typnotnull','typdefault','extension_owned']
 compare('type authority',[{k:t[k] for k in type_fields}],native_type,('schema','typname'))
 array=rows(sql,"SELECT a.typname array_type,pg_get_userbyid(a.typowner) owner,a.typacl FROM pg_type t JOIN pg_type a ON a.oid=t.typarray WHERE t.oid='storage.buckettype'::regtype")
 if array!=t['array_type']:mismatches.append({'section':'array type authority','fields':['identity/owner/ACL']})
 schema_owner=sql("SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='storage';")
 if schema_owner!=storage['schema_acl']['owner']:mismatches.append({'section':'schema authority','fields':['owner']})
 enum=rows(sql,"SELECT e.enumlabel label,e.enumsortorder sortorder FROM pg_enum e WHERE e.enumtypid='storage.buckettype'::regtype ORDER BY e.enumsortorder")
 if enum!=t['enum_labels']:mismatches.append({'section':'enum','fields':['labels/order']})
 counts['enum_labels']=len(enum)
 if sql("SELECT count(*) FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage';")!='0' or sql("SELECT count(*) FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage';")!='0':mismatches.append({'section':'rules/inheritance','fields':['identity']})
 return {'passed':not mismatches,'counts':counts,'mismatches':mismatches}

def main():
 parser=argparse.ArgumentParser()
 for name in ['evidence-dir','runtime','client','output','private-diagnostics']:parser.add_argument('--'+name,type=Path,required=True)
 a=parser.parse_args();catalog,rls,storage,t,hashes,admission=load(a.evidence_dir.resolve());files=[Path(__file__),Path(p.__file__),Path(r.__file__)];sources={f:f.read_bytes() for f in files}
 if a.output.name.endswith('-private.json') or a.output.resolve().is_relative_to(a.evidence_dir.resolve()):raise ValueError('Private output boundary')
 with r.database(a.runtime.resolve(),a.client.resolve(),a.private_diagnostics.resolve()) as sql:
  keys,cons,idx,excluded=r.recreate(catalog,rls,sql);domain=r.verify(catalog,rls,keys,cons,idx,sql,a.private_diagnostics.resolve())
  if not domain['exported_property_parity_passed']:raise ValueError('Domain baseline refused')
  install(storage,t,rls,catalog,sql);queries=[]
  def capture(source):queries.append(source);return sql(source)
  baseline=verify(storage,t,rls,capture)
  if not baseline['passed']:raise ValueError('Storage baseline mismatch: '+json.dumps(baseline['mismatches']))
  # Execute all metadata queries in the same mutation transaction, then
  # replay their actual result values through the independent comparisons.
  probes=[]
  for label,ddl in [('column nullability','ALTER TABLE storage.buckets ALTER COLUMN name DROP NOT NULL;'),('owner drift','ALTER TABLE storage.objects OWNER TO postgres;'),('enum order',"ALTER TYPE storage.buckettype ADD VALUE 'SYNTHETIC_DRIFT';")]:
   source='BEGIN;'+ddl+'SELECT jsonb_build_array('+','.join('('+x.rstrip(';')+')' for x in queries)+');ROLLBACK;'
   values=json.loads(sql(source,bootstrap=True));position=[0]
   def replay(source):
    i=position[0];position[0]+=1
    if source!=queries[i]:raise ValueError('Drift query order changed')
    return values[i] if isinstance(values[i],str) else json.dumps(values[i])
   drift=verify(storage,t,rls,replay)
   required={'column nullability':'columns','owner drift':'relations','enum order':'enum'}[label]
   if drift['passed'] or required not in {x['section'] for x in drift['mismatches']}:raise ValueError('Storage drift not detected: '+label)
   probes.append({'label':label,'detected_sections':sorted({x['section'] for x in drift['mismatches']})})
  if not verify(storage,t,rls,sql)['passed']:raise ValueError('Storage rollback did not restore baseline')
  domain_after=r.verify(catalog,rls,keys,cons,idx,sql,a.private_diagnostics.resolve())
  if not domain_after['exported_property_parity_passed']:raise ValueError('Storage replay changed original domain metadata')
  if any(sql('SELECT count(*) FROM storage.'+q(table['table'])+';')!='0' for table in storage['relations']):raise ValueError('Storage baseline must contain no domain rows')
 if any(f.read_bytes()!=v for f,v in sources.items()):raise ValueError('Changing Storage replay sources cannot be certified')
 a.output.write_text(json.dumps({'snapshot_hashes':hashes,'source_hashes':{str(f.relative_to(r.ROOT)):hashlib.sha256(v).hexdigest() for f,v in sources.items()},'storage_baseline':baseline,'domain_baseline':domain,'metadata_admission':admission,'temporary_database_stopped_and_removed':True,'local_ddl_roundtrip_probes':probes,'limits':['Exact metadata replay only; hosted Auth/Storage API/objects/bytes/runtime not certified.','No product/caller/SQL candidate/grant cutover or production query. Legacy provenance remains unknown.']},indent=2)+'\n')
if __name__=='__main__':main()
