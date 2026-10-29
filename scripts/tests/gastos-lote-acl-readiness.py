"""Local-only readiness checks for exact187 under Supabase-shaped default ACLs.

Uses the existing disposable network-none PostgreSQL fixture; never accepts a
remote database URL or credentials. Does not modify source187 or any live system.
"""
import importlib.util,pathlib
path=pathlib.Path(__file__).with_name('gastos-lote-postgres.py')
spec=importlib.util.spec_from_file_location('expense_acl_readiness',path)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
original=m.sql
migration=(m.ROOT/'src/sql/migrations/187_fin_gastos_lote_reintentable.sql').read_text()
def checked_sql(q,success=True,error_code=None):
 if q==migration:
  original("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;")
 return original(q,success,error_code)
m.sql=checked_sql
def cases():
 expected={'anon':['f','f','f','f'],'authenticated':['t','t','f','f'],'service_role':['t','t','t','t']}
 for role,want in expected.items():
  got=original("SELECT "+",".join(f"has_table_privilege('{role}','public.fin_gastos_lotes','{p}')" for p in ['SELECT','INSERT','UPDATE','DELETE'])).split('|')
  assert got==want,(role,got,want)
 m.check('production-shaped default ACL: anon denied, authenticated SELECT/INSERT only, service_role remains privileged')
 got=original("SELECT "+",".join(f"has_function_privilege('{r}','public.fn_fin_gastos_guardar_lote(uuid,uuid,jsonb)','EXECUTE')" for r in ['anon','authenticated','service_role'])).split('|')
 assert got==['f','t','t'],got
 m.check('RPC ACL: anon denied, authenticated and inherited service_role execute')
 assert original("SELECT prosecdef,proconfig::text FROM pg_proc WHERE proname='fn_fin_gastos_guardar_lote'")=='f|{"search_path=public, pg_temp"}'
 m.check('INVOKER and pinned path retained under production-shaped defaults')
 original(migration,False,'P0001')
 assert original('SELECT count(*) FROM fin_gastos_lotes')=='0'
 m.check('second apply aborts before overwrite; receipt table remains intact')
 print('4 additional ACL/preflight groups OK; synthetic local only',flush=True)
m.run_cases=cases
m.run_local()
