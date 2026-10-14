#!/usr/bin/env python3
"""Replay owner-provided catalog structure in a disposable local PG17.6 only.

No data/production clients. Private SQL stays in memory or explicit external
diagnostics. Auth helpers/users are synthetic and no jobs are scheduled.
"""
import argparse
from contextlib import contextmanager
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('gates', Path(__file__).with_name('combined-schema-gate-rehearsal.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)
p = g.p
q, lit = g.quote, g.literal
SCHEMAS = ('public', 'respaldos')


def load(evidence):
    if evidence.is_relative_to(ROOT):
        raise ValueError('Private evidence must be external')
    items, hashes = [], {}
    for name in ('live-catalog-private.json', 'live-rls-private.json',
                 'live-catalog-supplement-private.json', 'live-catalog-addendum-private.json'):
        raw = (evidence / name).read_bytes()
        hashes[name] = p.digest(raw)
        items.append(json.loads(raw))
    original, rls, supplement, addendum = items
    catalog = p.with_addendum(p.with_supplement(original, supplement), supplement, addendum)
    if not p.assess(catalog, rls, hashes)['minimum_metadata_admission_passed']:
        raise ValueError('Metadata admission must pass')
    return catalog, rls, hashes


@contextmanager
def database(runtime, client, diagnostics):
    if not runtime.is_relative_to('/tmp') or not client.is_relative_to('/tmp') or not diagnostics.is_relative_to('/tmp'):
        raise ValueError('Temporary runtime/client and external private diagnostics required')
    env = os.environ.copy()
    env['LD_LIBRARY_PATH'] = str(runtime / 'lib')
    version = subprocess.check_output([str(runtime / 'bin/postgres'), '--version'], env=env, text=True).strip()
    if version != 'postgres (PostgreSQL) 17.6':
        raise ValueError('Exact cached PG17.6 required')
    local = Path(tempfile.mkdtemp(prefix='escocia-treatment-pg-', dir='/tmp'))
    (local / 'socket').mkdir(mode=0o700)
    started = False
    def sql(source, ok=True, bootstrap=False):
        result = subprocess.run(['node', str(ROOT / 'scripts/security/local-postgres-query.mjs'),
                                 str(local / 'socket'), str(client), 'supabase_admin' if bootstrap else 'postgres'], input=source, text=True,
                                capture_output=True, timeout=60)
        if result.returncode and ok:
            # Private diagnostics are deliberately outside the repository.
            fd = os.open(diagnostics, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
            os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'w') as stream:
                stream.write(result.stderr + '\n' + source)
            raise ValueError('Local replay failed; inspect external private diagnostics')
        return result if not ok else result.stdout.strip()
    try:
        # PG17 records superuser membership grants under its bootstrap identity.
        # Match the exported grantor name instead of rewriting the grant graph.
        subprocess.run([str(runtime / 'bin/initdb'), '-D', str(local / 'data'), '-U', 'supabase_admin',
                        '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--locale=C'],
                       env=env, check=True, capture_output=True, timeout=60)
        subprocess.run([str(runtime / 'bin/pg_ctl'), '-D', str(local / 'data'), '-l', str(local / 'server.log'),
                        '-o', f"-c listen_addresses='' -c unix_socket_directories={local}/socket -c unix_socket_permissions=0700 -p 55439",
                        '-w', 'start'], env=env, check=True, capture_output=True, timeout=60)
        started = True
        sql('CREATE ROLE postgres SUPERUSER LOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS; ALTER DATABASE postgres OWNER TO postgres;', bootstrap=True)
        if sql('SHOW listen_addresses;') or (local / 'socket').stat().st_mode & 0o777 != 0o700:
            raise ValueError('Local socket containment refused')
        yield sql
    finally:
        if started or (local / 'data/postmaster.pid').exists():
            result = subprocess.run([str(runtime / 'bin/pg_ctl'), '-D', str(local / 'data'), '-w', '-m', 'immediate', 'stop'],
                                    env=env, capture_output=True, timeout=60)
            if result.returncode or (local / 'data/postmaster.pid').exists():
                raise ValueError('Local server stop unverified; retained private directory')
        shutil.rmtree(local)
        if local.exists():
            raise ValueError('Temporary directory cleanup unverified')


def acl(source, target, kind, names, column=None, defaults=None):
    if source is None:
        return ''
    # Parse native ACLs using the local server, retaining grantee/grantor/options.
    privileges = {'r': 'TABLE', 'S': 'SEQUENCE', 'f': 'FUNCTION', 'n': 'SCHEMA', 'T': 'TYPE'}
    obj = privileges[kind]
    modifier = '(' + q(column) + ')' if column else ''
    prefix = '' if defaults is None else defaults
    on = ' ON ' + obj + ' ' + target if defaults is None else ' ON ' + {'r': 'TABLES', 'S': 'SEQUENCES', 'f': 'FUNCTIONS', 'n': 'SCHEMAS', 'T': 'TYPES'}[kind]
    revoke = prefix + 'REVOKE ALL' + modifier + on + ' FROM PUBLIC,' + ','.join(q(n) for n in names) + ';'
    return revoke + "\nDO $acl$ DECLARE x record; BEGIN FOR x IN SELECT * FROM aclexplode(" + lit(source) + "::aclitem[]) LOOP " + \
        "EXECUTE format('SET LOCAL ROLE %I',pg_get_userbyid(x.grantor));" + \
        "EXECUTE '" + prefix.replace("'", "''") + "GRANT '||x.privilege_type||'" + modifier.replace("'", "''") + on.replace("'", "''") + \
        " TO '||CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END||" + \
        "CASE WHEN x.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END; RESET ROLE; END LOOP; END $acl$;"


def recreate(catalog, rls, sql):
    # Climate telemetry's sole identity column has no generation-mode metadata.
    # It is outside the stock/cattle/financial/audit protocols; exclude explicitly.
    excluded = {(c['schema'], c['table']) for c in catalog['columns'] if c['identity'] == 'YES'}
    if excluded != {('public', 'clima_lecturas')}:
        raise ValueError('Changed identity-column scope requires explicit replay review')
    tables = [r for r in catalog['relations'] if r['schema'] in SCHEMAS and r['kind'] == 'r'
              and (r['schema'], r['table']) not in excluded]
    keys = {(r['schema'], r['table']) for r in tables}
    names = [r['rolname'] for r in catalog['roles']]
    existing = set(json.loads(sql('SELECT json_agg(rolname) FROM pg_roles;')))
    statements = []
    for role in catalog['roles']:
        if role['rolname'] not in existing:
            flags = ' '.join(('' if role[key] else 'NO') + keyword for key, keyword in
                             [('rolsuper', 'SUPERUSER'), ('rolinherit', 'INHERIT'), ('rolcreaterole', 'CREATEROLE'),
                              ('rolcreatedb', 'CREATEDB'), ('rolcanlogin', 'LOGIN'), ('rolreplication', 'REPLICATION'),
                              ('rolbypassrls', 'BYPASSRLS')])
            statements.append('CREATE ROLE ' + q(role['rolname']) + ' ' + flags + ';')
    statements += ['CREATE SCHEMA respaldos;', 'CREATE SCHEMA extensions;',
                   'CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;',
                   'CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);',
                   "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
                   "CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;",
                   "CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;",
                   'GRANT USAGE ON SCHEMA auth TO PUBLIC;',
                   'SET check_function_bodies=off;']
    for enum in catalog['enums']:
        statements.append('CREATE TYPE ' + q(enum['schema']) + '.' + q(enum['type']) + ' AS ENUM (' +
                          ','.join(lit(v) for v in enum['labels']) + ');')
    # All captured functions are SQL/plpgsql; no captured function is called here.
    for function in catalog['functions']:
        if not re.search(r'LANGUAGE (?:plpgsql|sql)\b', function['def'], re.I):
            raise ValueError('Unsupported captured language')
        statements.append(function['def'] + ';')
    for sequence in catalog['sequences']:
        # Identity sequence belongs to excluded telemetry, not this domain graph.
        if any(c['identity'] == 'YES' and c['schema'] == sequence['schema'] and
               sequence['name'].startswith(c['table'] + '_') for c in catalog['columns']):
            continue
        statements.append('CREATE SEQUENCE ' + q(sequence['schema']) + '.' + q(sequence['name']) +
                          ' AS ' + sequence['type'] + ' START WITH ' + str(sequence['start_value']) +
                          ' INCREMENT BY ' + str(sequence['increment_by']) + ' MINVALUE ' + str(sequence['min_value']) +
                          ' MAXVALUE ' + str(sequence['max_value']) + ' CACHE ' + str(sequence['cache_size']) +
                          (' CYCLE;' if sequence['cycle'] else ' NO CYCLE;'))
    for table in tables:
        columns = sorted((c for c in catalog['columns'] if (c['schema'], c['table']) == (table['schema'], table['table'])), key=lambda c: c['pos'])
        defs, gaps, position = [], [], 1
        for column in columns:
            while position < column['pos']:
                gap = '__rehearsal_dropped_' + str(position)
                defs.append(q(gap) + ' integer')
                gaps.append(gap)
                position += 1
            definition = q(column['column']) + ' ' + column['formatted_type']
            if column['collation'] is not None:
                definition += ' COLLATE ' + q(column['collation'])
            if column.get('generation_expression'):
                definition += ' GENERATED ALWAYS AS (' + column['generation_expression'] + ') STORED'
            elif column['default'] is not None:
                definition += ' DEFAULT ' + column['default']
            if column['nullable'] == 'NO':
                definition += ' NOT NULL'
            defs.append(definition)
            position += 1
        statements.append('CREATE TABLE ' + q(table['schema']) + '.' + q(table['table']) + '(' + ','.join(defs) + ');')
        for gap in gaps:
            statements.append('ALTER TABLE ' + q(table['schema']) + '.' + q(table['table']) + ' DROP COLUMN ' + q(gap) + ';')
    sql('\n'.join(statements))
    constraints = [c for c in catalog['constraints'] if (c['schema'], c['table']) in keys
                   and not any(re.search(r'REFERENCES (?:' + re.escape(s) + r'\.)?' + re.escape(t) + r'\(', c['def']) for s, t in excluded)]
    if len(constraints) != sum((c['schema'],c['table']) in keys for c in catalog['constraints']):
        raise ValueError('A domain constraint references the excluded telemetry table')
    for kind in ('p', 'u', 'c', 'f', 'x'):
        statements = ['ALTER TABLE ' + q(c['schema']) + '.' + q(c['table']) + ' ADD CONSTRAINT ' + q(c['name']) + ' ' + c['def'] + ';'
                      for c in constraints if c['type'] == kind]
        if statements:
            sql('\n'.join(statements))
    # PostgreSQL can move equivalent casts while parsing old exported DDL.
    # Bind later drift checks to the server's result of the literal source DDL,
    # captured here before any probe/candidate can alter it.
    parsed = json.loads(sql("""SELECT json_agg(x) FROM (SELECT n.nspname AS schema,t.relname AS "table",
      c.conname AS name,pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('public','respaldos')) x;"""))
    canonical = p.unique_rows(parsed, ('schema','table','name'))
    constraints = [dict(c, replay_def=canonical[(c['schema'],c['table'],c['name'])]['def']) for c in constraints]
    existing_indexes = set(json.loads(sql("SELECT coalesce(json_agg(schemaname||'.'||indexname),'[]') FROM pg_indexes;")))
    indexes = [i for i in catalog['indexes'] if (i['schema'], i['table']) in keys]
    sql('\n'.join(i['def'] + ';' for i in indexes if i['schema'] + '.' + i['name'] not in existing_indexes))
    # Views can depend on one another; retry only dependency ordering, never alter definitions.
    pending = list(catalog['views'])
    while pending:
        remaining = []
        for view in pending:
            options = ' WITH (' + ','.join(view['options']) + ')' if view['options'] else ''
            result = sql('CREATE VIEW ' + q(view['schema']) + '.' + q(view['name']) + options + ' AS ' + view['def'] + ';', False)
            if result.returncode:
                remaining.append(view)
        if len(remaining) == len(pending):
            sql('CREATE VIEW ' + q(remaining[0]['schema']) + '.' + q(remaining[0]['name']) + ' AS ' + remaining[0]['def'] + ';')
        pending = remaining
    sql('\n'.join(t['def'] + '; ALTER TABLE ' + q(t['schema']) + '.' + q(t['table']) + ' ' +
                  {'O': 'ENABLE', 'D': 'DISABLE', 'A': 'ENABLE ALWAYS', 'R': 'ENABLE REPLICA'}[t['enabled']] + ' TRIGGER ' + q(t['name']) + ';'
                  for t in catalog['triggers'] if (t['schema'], t['table']) in keys))
    statements = []
    for table in tables:
        target = q(table['schema']) + '.' + q(table['table'])
        if table['rls']:
            statements.append('ALTER TABLE ' + target + ' ENABLE ROW LEVEL SECURITY;')
        if table['force_rls']:
            statements.append('ALTER TABLE ' + target + ' FORCE ROW LEVEL SECURITY;')
    for policy in rls['policies']:
        if (policy['schema'], policy['table']) not in keys:
            continue
        target = q(policy['schema']) + '.' + q(policy['table'])
        statement = 'CREATE POLICY ' + q(policy['policy']) + ' ON ' + target + ' AS ' + policy['permissive'] + ' FOR ' + policy['cmd']
        statement += ' TO ' + ','.join('PUBLIC' if name == 'public' else q(name) for name in policy['roles'])
        if policy['using'] is not None:
            statement += ' USING (' + policy['using'] + ')'
        if policy['with_check'] is not None:
            statement += ' WITH CHECK (' + policy['with_check'] + ')'
        statements.append(statement + ';')
    sql('\n'.join(statements))
    statements = []
    for row in catalog['grants']['table_grants']:
        if (row['schema'], row['table']) in keys or (row['schema'] in SCHEMAS and row['kind'] == 'v'):
            statements.append(acl(row['acl'], q(row['schema']) + '.' + q(row['table']), 'r', names))
    for row in catalog['grants']['column_grants']:
        if (row['schema'], row['table']) in keys:
            statements.append(acl(row['acl'], q(row['schema']) + '.' + q(row['table']), 'r', names, column=row['column']))
    for row in catalog['functions']:
        signature = q(row['schema']) + '.' + q(row['name']) + '(' + row['args'] + ')'
        statements.append(acl(row['acl'], signature, 'f', names))
    for row in catalog['grants']['schema_acl']:
        if row['schema'] in SCHEMAS:
            statements.append(acl(row['acl'], q(row['schema']), 'n', names))
    for membership in catalog['role_memberships']:
        statements.append('SET ROLE ' + q(membership['grantor']) + '; GRANT ' + q(membership['role']) + ' TO ' + q(membership['member']) +
            ' WITH ADMIN ' + str(membership['admin_option']).upper() +
            ', INHERIT ' + str(membership['inherit_option']).upper() + ', SET ' + str(membership['set_option']).upper() +
            ' GRANTED BY ' + q(membership['grantor']) + '; RESET ROLE;')
    for row in catalog['grants']['default_acl']:
        if row['schema'] in (None, '', *SCHEMAS):
            prefix = 'ALTER DEFAULT PRIVILEGES FOR ROLE ' + q(row['role'])
            if row['schema']:
                prefix += ' IN SCHEMA ' + q(row['schema'])
            statements.append(acl(row['acl'], '', row['objtype'], names, defaults=prefix + ' '))
    sql('\n'.join(statements))
    # Drop bootstrap superuser privileges to the actual exported installer role.
    installer = next(r for r in catalog['roles'] if r['rolname'] == 'postgres')
    flags = ' '.join(('' if installer[key] else 'NO') + keyword for key, keyword in
                     [('rolsuper', 'SUPERUSER'), ('rolinherit', 'INHERIT'), ('rolcreaterole', 'CREATEROLE'),
                      ('rolcreatedb', 'CREATEDB'), ('rolcanlogin', 'LOGIN'), ('rolreplication', 'REPLICATION'),
                      ('rolbypassrls', 'BYPASSRLS')])
    sql('ALTER ROLE postgres ' + flags + ';')
    return keys, constraints, indexes, excluded


def verify(catalog, rls, keys, constraints, indexes, sql, diagnostics=None):
    """Compare exported properties, publishing identities/field names only."""
    mismatches, counts, details = [], {}, []

    def compare(section, expected, actual, identity, restrict=True):
        left = p.unique_rows(expected, identity)
        right = p.unique_rows(actual, identity)
        # Restrict to the explicitly reconstructed domain graph.
        if restrict:
            right = {k: v for k, v in right.items() if (v.get('schema'), v.get('table')) in keys}
        for key in sorted(left.keys() | right.keys()):
            if key not in left or key not in right:
                mismatches.append({'section': section, 'identity': key, 'fields': ['identity']})
            else:
                fields = [field for field in left[key] if left[key][field] != right[key].get(field)]
                if fields:
                    mismatches.append({'section': section, 'identity': key, 'fields': fields})
                    details.append({'section': section, 'identity': key,
                                    'fields': {f: {'expected': left[key][f], 'actual': right[key].get(f)} for f in fields}})
        counts[section] = len(left)

    def query(source):
        return json.loads(sql("SELECT coalesce(json_agg(x),'[]') FROM (" + source + ') x;'))

    columns = [dict(schema=c['schema'], table=c['table'], column=c['column'], pos=c['pos'],
                    formatted_type=c['formatted_type'], typmod=c['typmod'], collation=c['collation'],
                    not_null=c['nullable'] == 'NO', generated='s' if c.get('generation_expression') else '',
                    identity='', default_expr=c.get('generation_expression') or c['default'])
               for c in catalog['columns'] if (c['schema'], c['table']) in keys]
    compare('columns', columns, query("""SELECT n.nspname AS schema,c.relname AS "table",a.attname AS "column",
      a.attnum AS pos,format_type(a.atttypid,a.atttypmod) AS formatted_type,a.atttypmod AS typmod,
      col.collname AS collation,a.attnotnull AS not_null,a.attgenerated AS generated,a.attidentity AS identity,
      pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      LEFT JOIN pg_collation col ON col.oid=a.attcollation WHERE n.nspname IN ('public','respaldos') AND c.relkind='r'"""), ('schema', 'table', 'column'))
    constraint_rows = query("""SELECT n.nspname AS schema,r.relname AS "table",c.conname AS name,c.contype AS type,
             pg_get_constraintdef(c.oid) AS def,pg_get_constraintdef(c.oid,true) AS pretty_def,c.convalidated,c.condeferrable,c.condeferred
             FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE n.nspname IN ('public','respaldos')""")
    expected_constraints = [{**{k: c[k] for k in ('schema','table','name','type','convalidated','condeferrable','condeferred')}, 'def': c['replay_def']} for c in constraints]
    counts['source_constraint_ddl_canonicalizations'] = sum(c['replay_def'] != c['def'] for c in constraints)
    compare('constraints', expected_constraints,
            constraint_rows, ('schema', 'table', 'name'))
    index_fields = ('schema', 'table', 'name', 'def', 'indisvalid', 'indisready', 'indislive', 'indimmediate',
                    'indisunique', 'indisprimary', 'indisexclusion', 'indnullsnotdistinct', 'indnkeyatts', 'indnatts',
                    'include_columns', 'predicate', 'expressions')
    index_rows = query("""SELECT n.nspname AS schema,t.relname AS "table",c.relname AS name,
      pg_get_indexdef(i.indexrelid) AS def,i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,
      i.indisexclusion,i.indnullsnotdistinct,i.indnkeyatts,i.indnatts,
      (SELECT coalesce(json_agg(pg_get_indexdef(i.indexrelid,k,true) ORDER BY k),'[]') FROM generate_series(1,i.indnkeyatts) k) AS key_columns,
      (SELECT coalesce(json_agg(pg_get_indexdef(i.indexrelid,k,false) ORDER BY k),'[]') FROM generate_series(1,i.indnkeyatts) k) AS plain_key_columns,
      (SELECT coalesce(json_agg(pg_get_indexdef(i.indexrelid,k,true) ORDER BY k),'[]') FROM generate_series(i.indnkeyatts+1,i.indnatts) k) AS include_columns,
      pg_get_expr(i.indpred,i.indrelid,true) AS predicate,pg_get_expr(i.indexprs,i.indrelid,true) AS expressions
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_class t ON t.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname IN ('public','respaldos')""")
    original_indexes = p.unique_rows(indexes, ('schema','table','name'))
    for row in index_rows:
        original = original_indexes.get((row['schema'],row['table'],row['name']))
        if original and row['plain_key_columns'] == original['key_columns']:
            row['key_columns'] = row['plain_key_columns']
    # Full CREATE INDEX text, expressions, key counts and all state flags remain
    # strict. Supplemental per-key display labels are redundant deparser output
    # (e.g. quoting of timestamp); record differences without treating them as a
    # different index when its full definition and expression tree match.
    counts['secondary_index_key_label_differences'] = sum(
        row['key_columns'] != original_indexes[(row['schema'],row['table'],row['name'])]['key_columns']
        for row in index_rows if (row['schema'],row['table'],row['name']) in original_indexes)
    compare('indexes', [{k: i[k] for k in index_fields} for i in indexes], index_rows, ('schema', 'table', 'name'))
    compare('triggers', [t for t in catalog['triggers'] if (t['schema'], t['table']) in keys],
            query("""SELECT n.nspname AS schema,c.relname AS "table",t.tgname AS name,t.tgenabled AS enabled,
             pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','respaldos')"""), ('schema', 'table', 'name'))
    expected_policies = [dict(policy, roles=sorted(policy['roles'])) for policy in rls['policies'] if (policy['schema'], policy['table']) in keys]
    actual_policies = query("""SELECT schemaname AS schema,tablename AS "table",policyname AS policy,permissive,cmd,roles,qual AS "using",with_check
                             FROM pg_policies WHERE schemaname IN ('public','respaldos')""")
    actual_policies = [dict(policy, roles=sorted(policy['roles'])) for policy in actual_policies]
    compare('policies', expected_policies, actual_policies, ('schema', 'table', 'policy'))
    compare('relations', [dict(r, owner=next(t['owner'] for t in catalog['grants']['table_grants'] if (t['schema'],t['table']) == (r['schema'],r['table'])))
                          for r in catalog['relations'] if (r['schema'],r['table']) in keys],
            query("""SELECT n.nspname AS schema,c.relname AS "table",c.relkind AS kind,c.relrowsecurity AS rls,
             c.relforcerowsecurity AS force_rls,pg_get_userbyid(c.relowner) AS owner FROM pg_class c
             JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','respaldos') AND c.relkind='r'"""), ('schema', 'table'))
    expected_functions = []
    for f in catalog['functions']:
        body = p.function_body(f['def'])
        if body is None:
            raise ValueError('Unsupported captured function body')
        expected_functions.append(dict(schema=f['schema'], name=f['name'], args=f['args'], returns=f['returns'],
                                        owner=f['owner'], config=f['config'], kind=f['kind'], volatility=f['volatility'],
                                        security_definer=f['security_definer'], body_md5=hashlib.md5(body.encode()).hexdigest()))
    compare('functions', expected_functions, query("""SELECT n.nspname AS schema,f.proname AS name,
       pg_get_function_identity_arguments(f.oid) AS args,pg_get_function_result(f.oid) AS returns,
       pg_get_userbyid(f.proowner) AS owner,f.proconfig AS config,f.prokind AS kind,f.provolatile AS volatility,
       f.prosecdef AS security_definer,md5(f.prosrc) AS body_md5 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
       WHERE n.nspname IN ('public','respaldos')"""), ('schema','name'), restrict=False)
    view_rows = query("""SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,pg_get_viewdef(c.oid) AS def,
                      pg_get_viewdef(c.oid,true) AS pretty_def,c.reloptions AS options
                      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname IN ('public','respaldos')""")
    originals = p.unique_rows(catalog['views'], ('schema','name'))
    for row in view_rows:
        original = originals.get((row['schema'],row['name']))
        if original and original['def'] == row['pretty_def']:
            row['def'] = row['pretty_def']
    compare('views', [{k: v[k] for k in ('schema','name','kind','def','options')} for v in catalog['views']], view_rows,
            ('schema','name'), restrict=False)
    compare('enums', catalog['enums'], query("""SELECT n.nspname AS schema,t.typname AS type,
       json_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname IN ('public','respaldos') GROUP BY n.nspname,t.typname"""),
       ('schema','type'), restrict=False)
    # Role attributes are authoritative locally too: postgres is not left as the
    # bootstrap superuser. System role names have their native PG17 identities.
    role_fields = ('rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolreplication','rolbypassrls')
    actual_roles = {r['rolname']: r for r in query('SELECT rolname,' + ','.join(role_fields) + ' FROM pg_roles')}
    for role in catalog['roles']:
        fields = [f for f in role_fields if role[f] != actual_roles[role['rolname']][f]]
        if fields:
            mismatches.append({'section': 'roles', 'identity': [role['rolname']], 'fields': fields})
    counts['roles'] = len(catalog['roles'])
    members = query("""SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
     pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members""")
    expected_members = p.unique_rows(catalog['role_memberships'], ('role','member','grantor'))
    actual_members = p.unique_rows(members, ('role','member','grantor'))
    if expected_members != actual_members:
        mismatches.append({'section': 'memberships', 'fields': ['role/member/grantor/options']})
    counts['memberships'] = len(expected_members)
    # Compare ACLs semantically; object OIDs and grant-entry ordering are local.
    def norm(expression, kind, owner):
        return "(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type) FROM aclexplode(coalesce(" + expression + ",acldefault('" + kind + "'," + owner + '))) x)'
    aclchecks = []
    for row in catalog['grants']['table_grants']:
        if (row['schema'],row['table']) in keys or (row['schema'] in SCHEMAS and row['kind']=='v'):
            target = lit(row['schema'] + '.' + row['table'])
            expected = 'NULL::aclitem[]' if row['acl'] is None else lit(row['acl']) + '::aclitem[]'
            aclchecks.append("SELECT 'relation' AS kind," + target + ' AS identity,' + norm('c.relacl','r','c.relowner') +
                             ' IS NOT DISTINCT FROM ' + norm(expected,'r','c.relowner') + ' AS matches FROM pg_class c WHERE c.oid=' + target + '::regclass')
    for function in catalog['functions']:
        target = lit(function['schema'] + '.' + function['name'] + '(' + function['args'] + ')')
        expected = 'NULL::aclitem[]' if function['acl'] is None else lit(function['acl']) + '::aclitem[]'
        aclchecks.append("SELECT 'function' AS kind," + target + ' AS identity,' + norm('f.proacl','f','f.proowner') +
                         ' IS NOT DISTINCT FROM ' + norm(expected,'f','f.proowner') +
                         ' AS matches FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname=' + lit(function['schema']) + ' AND f.proname=' + lit(function['name']))
    counts['object_acl_checks'] = len(aclchecks)
    for row in catalog['grants']['column_grants']:
        if (row['schema'],row['table']) in keys:
            target = lit(row['schema'] + '.' + row['table'])
            expected = 'NULL::aclitem[]' if row['acl'] is None else lit(row['acl']) + '::aclitem[]'
            aclchecks.append("SELECT 'column' AS kind," + lit(row['schema']+'.'+row['table']+'.'+row['column']) + ' AS identity,' +
                             norm('a.attacl','c','c.relowner') + ' IS NOT DISTINCT FROM ' + norm(expected,'c','c.relowner') +
                             ' AS matches FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid=' + target +
                             '::regclass AND a.attname=' + lit(row['column']))
    counts['column_acl_checks'] = len(aclchecks)-counts['object_acl_checks']
    for row in catalog['grants']['schema_acl']:
        if row['schema'] in SCHEMAS:
            expected = 'NULL::aclitem[]' if row['acl'] is None else lit(row['acl']) + '::aclitem[]'
            aclchecks.append("SELECT 'schema' AS kind," + lit(row['schema']) + ' AS identity,' + norm('n.nspacl','n','n.nspowner') +
                             ' IS NOT DISTINCT FROM ' + norm(expected,'n','n.nspowner') + ' AS matches FROM pg_namespace n WHERE n.nspname=' + lit(row['schema']))
    counts['schema_acl_checks'] = len(aclchecks)-counts['object_acl_checks']-counts['column_acl_checks']
    defaults = [r for r in catalog['grants']['default_acl'] if r['schema'] in (None,'',*SCHEMAS)]
    for row in defaults:
        schema = row['schema'] or ''
        expected = lit(row['acl']) + '::aclitem[]'
        aclchecks.append("SELECT 'default_acl' AS kind," + lit(row['role']+':'+schema+':'+row['objtype']) + ' AS identity,' +
                         norm('d.defaclacl',row['objtype'],'d.defaclrole') + ' IS NOT DISTINCT FROM ' +
                         norm(expected,row['objtype'],'d.defaclrole') +
                         ' AS matches FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE pg_get_userbyid(d.defaclrole)=' +
                         lit(row['role']) + " AND coalesce(n.nspname,'')=" + lit(schema) + ' AND d.defaclobjtype=' + lit(row['objtype']))
    actual_default_keys = query("""SELECT pg_get_userbyid(d.defaclrole) AS role,coalesce(n.nspname,'') AS schema,d.defaclobjtype AS objtype
       FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE coalesce(n.nspname,'') IN ('','public','respaldos')""")
    if {(r['role'],r['schema'] or '',r['objtype']) for r in defaults} != {(r['role'],r['schema'],r['objtype']) for r in actual_default_keys}:
        mismatches.append({'section':'default_acl','fields':['identity inventory']})
    counts['default_acl_checks'] = len(defaults)
    for row in query(' UNION ALL '.join(aclchecks)):
        if not row['matches']:
            mismatches.append({'section': 'acl', 'identity': [row['kind'], row['identity']], 'fields': ['grants']})
    rule_count = int(sql("SELECT count(*) FROM pg_rewrite r JOIN pg_class c ON c.oid=r.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','respaldos') AND r.rulename<>'_RETURN';"))
    if rule_count != len(catalog['rewrite_rules']):
        mismatches.append({'section': 'rules', 'fields': ['inventory']})
    counts['user_rewrite_rules'] = rule_count
    if details and diagnostics:
        fd = os.open(diagnostics, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(details, stream)
    return {'exported_property_parity_passed': not mismatches, 'verified_counts': counts, 'mismatches': mismatches}


def transaction_body(source):
    if len(re.findall(r'^BEGIN;\s*$', source, re.M)) != 1 or len(re.findall(r'^COMMIT;\s*$', source, re.M)) != 1 or not source.rstrip().endswith('COMMIT;'):
        raise ValueError('Unsupported candidate transaction wrapper')
    return re.sub(r'^COMMIT;\s*$', '', re.sub(r'^BEGIN;\s*$', '', source, count=1, flags=re.M), count=1, flags=re.M)


def probes(catalog, rls, keys, constraints, indexes, sql):
    mutations = {
        'column precision': "ALTER TABLE public.productos ALTER COLUMN cantidad_actual TYPE numeric(12,3)",
        'trigger state': 'ALTER TABLE public.productos DISABLE TRIGGER set_updated_at_productos',
        'index removal': 'DROP INDEX public.idx_productos_activo_nombre',
        'RLS disable': 'ALTER TABLE public.productos DISABLE ROW LEVEL SECURITY',
        'function body': "CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$",
        'grant option': 'GRANT UPDATE ON public.productos TO anon WITH GRANT OPTION',
    }
    fk = next(c for c in constraints if c['schema']=='public' and c['table']=='fin_gastos' and c['type']=='f' and re.search(r'^FOREIGN KEY \(compra_id\)',c['def']))
    mutations['expense FK removal'] = 'ALTER TABLE public.fin_gastos DROP CONSTRAINT ' + q(fk['name'])
    negative = []
    for label, mutation in mutations.items():
        def changed(source):
            return sql('BEGIN;' + mutation + ';' + source + 'ROLLBACK;')
        result = verify(catalog, rls, keys, constraints, indexes, changed)
        if result['exported_property_parity_passed']:
            raise ValueError('Parity validator failed to detect local adversarial drift')
        negative.append({'probe': label, 'refused': True, 'sections': sorted({m['section'] for m in result['mismatches']})})
    if not verify(catalog, rls, keys, constraints, indexes, sql)['exported_property_parity_passed']:
        raise ValueError('Drift probe rollback did not restore base schema')
    order = ('purchase-integrity', 'manual-stock-movement', 'product-catalog-integrity', 'csv-product-import',
             'application-closure', 'application-plan-delete', 'ronda-stock-integrity', 'hato-undo', 'hato-treatment-creation')
    candidates, results = [], []
    for name in order:
        source = (ROOT / 'src/sql/security-candidates' / (name + '.sql')).read_text()
        candidates.append((name, source))
        result = sql('BEGIN;' + transaction_body(source) + 'ROLLBACK;', False)
        # Only source-owned diagnostic literals are public; arbitrary SQL errors
        # and captured function internals are never copied into the report.
        allowed = re.findall(r"RAISE EXCEPTION '([^']*)'", source)
        messages = [message for message in allowed if '%' not in message and message in result.stderr]
        results.append({'candidate': name, 'source_sha256': p.digest(source.encode()),
                        'isolated_install': 'passed_then_rolled_back' if not result.returncode else 'refused',
                        'source_diagnostic': max(messages, key=len) if messages else None,
                        'server_diagnostic_sha256': p.digest(result.stderr.encode()) if result.returncode and not messages else None})
    combined = sql('BEGIN;' + '\n'.join(transaction_body(source) for _, source in candidates) + 'ROLLBACK;', False)
    if combined.returncode == 0:
        raise ValueError('Expected reproduced current-baseline incompatibility was not observed')
    combined_messages = [r['source_diagnostic'] for r in results if r['source_diagnostic'] and r['source_diagnostic'] in combined.stderr]
    after = verify(catalog, rls, keys, constraints, indexes, sql)
    if not after['exported_property_parity_passed']:
        raise ValueError('Installation rollback did not restore exported schema')
    schema_names = [re.search(r'^CREATE SCHEMA (\w+);',source,re.M)[1] for _, source in candidates]
    remaining = int(sql('SELECT count(*) FROM pg_namespace WHERE nspname IN (' + ','.join(lit(n) for n in schema_names) + ');'))
    if remaining:
        raise ValueError('Partial candidate schemas survived local rollback')
    rows = int(sql('SELECT ' + '+'.join('(SELECT count(*) FROM ' + q(s) + '.' + q(t) + ')' for s,t in sorted(keys)) + ';'))
    if rows:
        raise ValueError('Unexpected rows in structural rehearsal')
    return {'adversarial_catalog_probes': negative, 'isolated_installs': results,
            'coordinated_install': {'result': 'refused_and_rolled_back',
                                    'source_diagnostic': max(combined_messages,key=len) if combined_messages else None,
                                    'protected_schemas_remaining': remaining, 'schema_parity_restored': True},
            'domain_rows_loaded': 0, 'mutation_protocol_rehearsal': 'not admitted while coordinated installation refuses'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence_dir', type=Path)
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--client', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--private-diagnostics', type=Path, required=True)
    args = parser.parse_args()
    evidence, output = args.evidence_dir.resolve(), args.output.resolve()
    if output.is_relative_to(evidence) or output.name.endswith('-private.json') or args.private_diagnostics.resolve().is_relative_to(evidence):
        raise ValueError('Cannot overwrite private evidence')
    catalog, rls, hashes = load(evidence)
    with database(args.runtime.resolve(), args.client.resolve(), args.private_diagnostics.resolve()) as sql:
        keys, constraints, indexes, excluded = recreate(catalog, rls, sql)
        parity = verify(catalog, rls, keys, constraints, indexes, sql, args.private_diagnostics.resolve())
        report = {'snapshot_hashes': hashes, 'recreated_tables': len(keys),
                  'runtime': 'postgres (PostgreSQL) 17.6',
                  'postgres_binary_sha256': p.digest((args.runtime.resolve() / 'bin/postgres').read_bytes()),
                  'runner_sha256': p.digest(Path(__file__).read_bytes()),
                  'no_tcp_listener': True, 'unix_socket_permissions': '0700',
                  'recreated_constraints': len(constraints), 'recreated_indexes': len(indexes),
                  'excluded_non_protocol_identity_tables': sorted('.'.join(k) for k in excluded),
                  'parity': parity,
                  'status': 'exported-property parity passed' if parity['exported_property_parity_passed'] else 'parity refused; no installation admitted',
                  'limits': ['Synthetic Auth users/uid/role/jwt and local uuid-ossp; no hosted Auth/Storage/extension parity.',
                             'No production rows or scheduled jobs; no captured function invoked during reconstruction.',
                             'Constraint DDL is parsed literally; its initial local canonical form binds subsequent drift checks.',
                             'Supplemental index key labels are diagnostic; full index DDL/expressions/counts/state remain strict.']}
        if parity['exported_property_parity_passed']:
            report['rehearsal'] = probes(catalog, rls, keys, constraints, indexes, sql)
    report['temporary_database_stopped_and_removed'] = True
    output.write_text(json.dumps(report, indent=2) + '\n')
    print('Local reconstruction and cleanup completed; derived report saved.')
    raise SystemExit(0 if parity['exported_property_parity_passed'] else 2)


if __name__ == '__main__':
    main()
