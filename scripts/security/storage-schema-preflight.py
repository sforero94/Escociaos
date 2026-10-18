#!/usr/bin/env python3
"""Reconcile private Storage structure and refuse unknown local-replay dependencies."""
import argparse,hashlib,importlib.util,json,re
from pathlib import Path
spec=importlib.util.spec_from_file_location('storage_prior',Path(__file__).with_name('schema-replay.py'));r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
SOURCE_NAME='live-catalog-storage-supplement-private.json'
def canonical_acl(x):return sorted(x) if isinstance(x,list) else x
def assess(catalog,rls,storage):
 errors=[]
 def compare(label,left,right):
  if left!=right:errors.append(label)
 relations={x['table']:x for x in storage['relations']}
 compare('relation identities',set(relations),{x['table'] for x in catalog['relations'] if x['schema']=='storage'})
 for x in catalog['relations']:
  if x['schema']=='storage' and x['table'] in relations:
   y=relations[x['table']];compare('relation flags '+x['table'],(x['kind'],x['rls'],x['force_rls']),(y['relkind'],y['relrowsecurity'],y['relforcerowsecurity']))
 compare('trigger bindings',sorted((x['table'],x['name'],x['def'],x['enabled']) for x in catalog['triggers'] if x['schema']=='storage'),sorted((x['table'],x['name'],x['def'],x['enabled']) for x in storage['triggers']))
 for x in catalog['grants']['table_grants']:
  if x['schema']=='storage' and x['table'] in relations:
   y=relations[x['table']];compare('table authority '+x['table'],(x['owner'],canonical_acl(x['acl'])),(y['owner'],canonical_acl(y['relacl'])))
 original_schema=[x for x in catalog['grants']['schema_acl'] if x['schema']=='storage']
 compare('schema authority',[(x['owner'],canonical_acl(x['acl'])) for x in original_schema],[(storage['schema_acl']['owner'],canonical_acl(storage['schema_acl']['nspacl']))])
 original_defaults={(x['role'],x['objtype']):canonical_acl(x['acl']) for x in catalog['grants']['default_acl'] if x['schema']=='storage'}
 compare('default authority',original_defaults,{(x['role'],x['objtype']):canonical_acl(x['acl']) for x in storage['default_acls']})
 compare('no rewrite rules',storage['rewrite_rules'],[]);compare('no inheritance',storage['inheritance'],[])
 for section,identity in [('relations',('table',)),('columns',('table','column')),('constraints',('table','name')),('indexes',('table','name')),('triggers',('table','name')),('functions',('schema','name','identity_args'))]:
  rows=storage[section]
  if len(rows)!=len({tuple(x[k] for k in identity) for x in rows}):errors.append('duplicate '+section)
 if any(x['relkind']!='r' or x['relispartition'] or x['relhasrules'] for x in storage['relations']):errors.append('unsupported relation kind/partition/rules')
 # Types must be evidenced, never guessed from a familiar platform name/default.
 known_types={x['schema']+'.'+x['type'] for x in catalog['enums']}
 known_types.update(x['schema']+'.'+x['type'] for x in storage.get('enums',[]) if all(k in x for k in ['schema','type','labels','owner','acl']))
 dependencies={x['formatted_type'].removesuffix('[]') for x in storage['columns'] if re.match(r'^[a-z_][a-z_0-9]*\.',x['formatted_type'])}
 missing=sorted(dependencies-known_types)
 unknown=[{'type':t,'dependent_columns':[{'table':x['table'],'column':x['column']} for x in storage['columns'] if x['formatted_type'].removesuffix('[]')==t],'required_metadata':['actual pg_type kind/definition','ordered enum labels if enum','owner and ACL']} for t in missing]
 if any('nextval(' in (x['default_expr'] or '') for x in storage['columns']):errors.append('sequence dependency requires sequence structure')
 return {'reconciliation_passed':not errors,'reconciliation_mismatches':errors,'storage_counts':{k:len(storage[k]) for k in ['relations','columns','constraints','indexes','triggers','functions','rewrite_rules','inheritance','default_acls']},'storage_policy_count':sum(x['schema']=='storage' for x in rls['policies']),'missing_type_dependencies':unknown,'exact_replay_admission_passed':not errors and not missing,'limits':['This is structural dependency admission, not a reconstructed native Storage baseline or protected caller cutover.','Existing public/respaldos reconstruction, hosted Auth/Storage API/object bytes, ordinary-role/global/runtime/capacity/recovery are not newly certified.','Legacy capture/row/object provenance stays unknown; no production query or history repair.']}
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--evidence-dir',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);a=parser.parse_args();evidence=a.evidence_dir.resolve()
 if a.output.name.endswith('-private.json') or a.output.resolve().is_relative_to(evidence):raise ValueError('Private output boundary')
 catalog,rls,hashes=r.load(evidence);raw=(evidence/SOURCE_NAME).read_bytes();hashes[SOURCE_NAME]=hashlib.sha256(raw).hexdigest();storage=json.loads(raw)
 paths=[Path(__file__),r.ROOT/'scripts/security/schema-replay.py',r.ROOT/'scripts/security/tests/test_storage_schema_preflight.py'];sources={p:p.read_bytes() for p in paths};result=assess(catalog,rls,storage)
 if not result['reconciliation_passed']:raise ValueError('Storage reconciliation failed: '+','.join(result['reconciliation_mismatches']))
 if any(p.read_bytes()!=v for p,v in sources.items()):raise ValueError('Changing preflight sources cannot be certified')
 result.update(snapshot_hashes=hashes,source_hashes={str(p.relative_to(r.ROOT)):hashlib.sha256(v).hexdigest() for p,v in sources.items()},database_connection_attempted=False,coordinated_candidate_count=46)
 a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'reconciled':result['reconciliation_passed'],'exact_replay_admission':result['exact_replay_admission_passed'],'missing_types':[x['type'] for x in result['missing_type_dependencies']],'counts':result['storage_counts'],'snapshot_count':len(hashes)}))
if __name__=='__main__':main()
