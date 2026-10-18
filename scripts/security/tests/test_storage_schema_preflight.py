import copy,importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('storage_preflight',Path(__file__).parents[1]/'storage-schema-preflight.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
def fixture():
 c={'relations':[dict(schema='storage',table='objects',kind='r',rls=True,force_rls=False)],'triggers':[],'enums':[],'grants':{'table_grants':[dict(schema='storage',table='objects',owner='synthetic_storage',acl=['synthetic'])],'schema_acl':[dict(schema='storage',owner='synthetic_storage',acl=['schema'])],'default_acl':[]}}
 s={'relations':[dict(table='objects',relkind='r',relrowsecurity=True,relforcerowsecurity=False,owner='synthetic_storage',relacl=['synthetic'],relispartition=False,relhasrules=False)],'columns':[dict(table='objects',column='type',formatted_type='storage.synthetic_kind',default_expr=None)],'constraints':[],'indexes':[],'triggers':[],'functions':[],'rewrite_rules':[],'inheritance':[],'schema_acl':dict(owner='synthetic_storage',nspacl=['schema']),'default_acls':[]}
 return c,{'policies':[]},s
class StoragePreflight(unittest.TestCase):
 def test_missing_type_fails_without_guessing_labels(self):
  c,l,s=fixture();a=p.assess(c,l,s);self.assertTrue(a['reconciliation_passed']);self.assertFalse(a['exact_replay_admission_passed']);self.assertEqual(a['missing_type_dependencies'][0]['type'],'storage.synthetic_kind')
 def test_type_name_and_labels_without_authority_are_insufficient(self):
  c,l,s=fixture();s['enums']=[dict(schema='storage',type='synthetic_kind',labels=['example'])];self.assertFalse(p.assess(c,l,s)['exact_replay_admission_passed'])
 def test_complete_synthetic_type_resolves_dependency_only(self):
  c,l,s=fixture();s['enums']=[dict(schema='storage',type='synthetic_kind',labels=['example'],owner='synthetic_storage',acl=None)];self.assertTrue(p.assess(c,l,s)['exact_replay_admission_passed'])
 def test_reconciliation_rejects_authority_drift(self):
  c,l,s=fixture();s['relations'][0]['relacl']=['unexpected'];self.assertFalse(p.assess(c,l,s)['reconciliation_passed'])
 def test_reconciliation_rejects_missing_relation(self):
  c,l,s=fixture();s['relations']=[];self.assertFalse(p.assess(c,l,s)['reconciliation_passed'])
 def test_unreviewed_partition_fails(self):
  c,l,s=fixture();s['relations'][0]['relispartition']=True;self.assertFalse(p.assess(c,l,s)['reconciliation_passed'])
 def test_duplicate_column_fails(self):
  c,l,s=fixture();s['columns'].append(copy.deepcopy(s['columns'][0]));self.assertFalse(p.assess(c,l,s)['reconciliation_passed'])
 def test_unprovided_sequence_cannot_be_assumed(self):
  c,l,s=fixture();s['columns'][0]['default_expr']="nextval('storage.synthetic_sequence')";self.assertFalse(p.assess(c,l,s)['reconciliation_passed'])
if __name__=='__main__':unittest.main()
