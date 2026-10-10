#!/usr/bin/env python3
"""Synthetic PG17.6 verification: cached image, no network/ports/binds/live data."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
OWNER = '11111111-1111-4111-8111-111111111111'
FOREIGN = '22222222-2222-4222-8222-222222222222'
ENV = os.environ.copy()
for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
NAME = 'escocia-memory-' + uuid.uuid4().hex[:12]
CHECKS = 0


def docker(args, source=None, check=True):
    return subprocess.run(DOCKER + args, input=source, text=True, capture_output=True,
                          env=ENV, timeout=60, check=check)


def sql(source, ok=True):
    result = docker(['exec', '-i', '-u', 'postgres', NAME, 'psql', '-X', '-qAt',
                    '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], source, False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and not result.returncode:
        raise AssertionError('Expected SQL rejection')
    return result.stdout.strip() if ok else result.stderr


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def verify(value, label):
    global CHECKS
    if not value:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS', label, flush=True)


def token(age_seconds=0):
    milliseconds = int((time.time() - age_seconds) * 1000)
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    encoded = ''
    while milliseconds:
        milliseconds, remainder = divmod(milliseconds, 36)
        encoded = digits[remainder] + encoded
    return 'mem_' + encoded + '_' + str(uuid.uuid4())


def age_token(key, seconds):
    # Simulate passage of time for an already registered proposal: age the
    # encoded issuance along with stored times, retaining its original UUID.
    aged = token(seconds).rsplit('_', 1)[0] + '_' + key.rsplit('_', 1)[1]
    sql('BEGIN; SET LOCAL session_replication_role=replica; '
        f"UPDATE public.esco_memory_proposals SET token={literal(aged)},created_at=clock_timestamp()-interval '{seconds} seconds',expires_at=clock_timestamp()-interval '{seconds-1800} seconds' WHERE token={literal(key)}; "
        f'UPDATE public.esco_memory_confirmation_receipts SET token={literal(aged)} WHERE token={literal(key)}; '
        f"UPDATE public.esco_memory_proposals p SET payload_hash=sha256(convert_to(jsonb_build_array(owner_id,token,coalesce(content,(SELECT r.receipt->>'content' FROM public.esco_memory_confirmation_receipts r WHERE r.token=p.token)),reason)::text,'UTF8')) WHERE token={literal(aged)}; "
        f'UPDATE public.esco_memory_confirmation_receipts r SET payload_hash=p.payload_hash FROM public.esco_memory_proposals p WHERE r.token=p.token AND r.token={literal(aged)}; COMMIT;')
    return aged


def register(key, content='Confirmed synthetic memory', owner=OWNER, ok=True, role='service_role'):
    return sql(f"SET ROLE {role}; SELECT public.esco_register_memory_proposal('{owner}',{literal(key)},{literal(content)},NULL);", ok)


def confirm(key, owner=OWNER, sender=123, ok=True, role='service_role'):
    result = sql(f"SET ROLE {role}; SELECT public.esco_confirm_telegram_memory('{owner}',{sender},{literal(key)});", ok)
    return json.loads(result) if ok else result


def state():
    tables = ['esco_memorias', 'esco_memory_proposals', 'esco_memory_confirmation_receipts']
    return sql('SELECT jsonb_build_array(' + ','.join(
        f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM public.{table} t)"
        for table in tables) + ')::text;')


def fails_unchanged(action, label):
    before = state()
    action()
    verify(before == state(), label)


def fixture():
    # Inspect only local catalog index 0 (columns), then synthesize empty tables.
    # No production rows or credentials are read or copied into the container.
    outer = json.loads((ROOT / 'docs/security-integrity/live-catalog-private.json').read_text())
    catalog = json.loads(outer['content'][0]['text'])['data']['results'][0]['response']['data']['result']
    if isinstance(catalog, str):
        catalog = json.loads(catalog)
    statements = ["CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;",
                  "CREATE TYPE public.rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');"]
    required = {'usuarios': {'id': 'uuid', 'activo': 'bool', 'rol': 'rol_usuario'},
                'telegram_usuarios': {'telegram_id': 'int8', 'usuario_id': 'uuid', 'activo': 'bool', 'modulos_permitidos': '_text'},
                'esco_memorias': {'id': 'uuid', 'user_id': 'uuid', 'content': 'text', 'source_channel': 'text', 'created_at': 'timestamptz'}}
    for table, expected in required.items():
        columns = [r for r in catalog if r['table_name'] == table]
        verify(all(any(r['column_name'] == name and r['udt_name'] == kind for r in columns)
                   for name, kind in expected.items()), table + ' required types match local catalog')
        definitions = []
        for column in columns:
            kind = 'text[]' if column['udt_name'] == '_text' else column['udt_name']
            default = column['column_default']
            definition = '"' + column['column_name'] + '" ' + kind
            if default:
                definition += ' DEFAULT ' + default
            if column['is_nullable'] == 'NO':
                definition += ' NOT NULL'
            definitions.append(definition)
        definitions += ['PRIMARY KEY (id)']
        if table == 'telegram_usuarios':
            definitions += ['UNIQUE (telegram_id)']
        statements.append(f'CREATE TABLE public.{table} (' + ','.join(definitions) + ');')
    statements += [f"INSERT INTO public.usuarios(id,email,rol,activo) VALUES ('{OWNER}','owner@synthetic.invalid','Gerencia',true),('{FOREIGN}','foreign@synthetic.invalid','Gerencia',true);",
                   f"INSERT INTO public.telegram_usuarios(telegram_id,usuario_id,nombre_display,activo,modulos_permitidos) VALUES(123,'{OWNER}','Synthetic owner',true,ARRAY['consultas']),(456,'{FOREIGN}','Synthetic foreign',true,ARRAY['consultas']);"]
    return '\n'.join(statements)


def run():
    docker(['image', 'inspect', IMAGE])  # Never download a missing image.
    try:
        docker(['run', '-d', '--name', NAME, '--pull=never', '--network=none',
                '--tmpfs', '/var/lib/postgresql/data:rw', '--tmpfs', '/var/run/postgresql:rw',
                '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', IMAGE])
        details = json.loads(docker(['inspect', NAME]).stdout)[0]
        verify(details['HostConfig']['NetworkMode'] == 'none' and not details['HostConfig']['PortBindings']
               and not details['HostConfig']['Binds'] and all(m['Type'] == 'tmpfs' for m in details['Mounts']),
               'container isolated: network none, tmpfs only, no binds or published ports')
        deadline = time.monotonic() + 30
        while (docker(['exec', NAME, 'cat', '/proc/1/comm'], check=False).stdout.strip() != 'postgres'
               or docker(['exec', '-u', 'postgres', NAME, 'pg_isready'], check=False).returncode):
            if time.monotonic() >= deadline:
                raise AssertionError('Postgres readiness deadline')
            time.sleep(.2)
        verify(sql('SHOW server_version;').startswith('17.6'), 'PostgreSQL 17.6 pinned runtime')
        sql(fixture())
        sql((ROOT / 'src/sql/security-candidates/telegram-memory-confirmation.sql').read_text())
        positive = token(); register(positive)
        verify(confirm(positive)['content'] == 'Confirmed synthetic memory', 'positive registration and human confirmation precede fault probes')
        sql('DELETE FROM public.esco_memory_confirmation_receipts; DELETE FROM public.esco_memory_proposals; DELETE FROM public.esco_memorias;')
        for timing in ('BEFORE', 'AFTER'):
            for field, expression in [('token', "NEW.token || 'x'"), ('owner_id', f"'{FOREIGN}'::uuid"), ('payload_hash', "'altered'::bytea"), ('content', "'altered'"), ('reason', "'altered reason'"),
                                      ('expires_at', "NEW.expires_at - interval '1 minute'"),
                                      ('expires_at', "NEW.expires_at + interval '1 minute'"),
                                      ('created_at', "NEW.created_at + interval '1 second'"),
                                      ('consumed_at', 'clock_timestamp()')]:
                action = f'NEW.{field}:={expression};' if timing == 'BEFORE' else f'UPDATE public.esco_memory_proposals SET {field}={expression} WHERE token=NEW.token;'
                sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} RETURN NEW; END $$; CREATE TRIGGER synthetic_fault {timing} INSERT ON public.esco_memory_proposals FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
                fails_unchanged(lambda: register(token(), ok=False), f'{timing} registration {field} mutation rejects atomically')
                sql('DROP TRIGGER synthetic_fault ON public.esco_memory_proposals; DROP FUNCTION public.synthetic_fault();')
        for timing, action in [('BEFORE', 'RETURN NULL;'), ('AFTER', 'DELETE FROM public.esco_memory_proposals WHERE token=NEW.token; RETURN NEW;')]:
            sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; CREATE TRIGGER synthetic_fault {timing} INSERT ON public.esco_memory_proposals FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
            fails_unchanged(lambda: register(token(), ok=False), f'{timing} registration suppression rejects atomically')
            sql('DROP TRIGGER synthetic_fault ON public.esco_memory_proposals; DROP FUNCTION public.synthetic_fault();')
        for aged in (token(1801), token(7*86400), token(-120), 'mem_' + 'z'*11 + '_' + str(uuid.uuid4())):
            fails_unchanged(lambda: register(aged, ok=False), 'reject expired, historical, future-skew or oversized issuance')
        future = token(-30); register(future)
        verify(sql(f"SELECT expires_at <= created_at + interval '31 minutes' FROM public.esco_memory_proposals WHERE token={literal(future)};") == 't', 'accepted clock skew bounds DB-clock lifetime to at most 31 minutes')
        sql(f"DELETE FROM public.esco_memory_proposals WHERE token={literal(future)};")
        fails_unchanged(lambda: verify('existing pg_cron' in sql((ROOT / 'src/sql/security-candidates/telegram-memory-confirmation-cleanup.sql').read_text(), False), 'cleanup schedule explicitly requires existing pg_cron'), 'scheduled cleanup candidate fails closed without pg_cron (release gate)')
        key = token()
        register(key)
        before = state()
        register(key)
        verify(before == state(), 'exact registration retry does not extend TTL or mutate payload')
        fails_unchanged(lambda: register(key, 'different payload', ok=False), 'payload mismatch registration rejects atomically')
        fails_unchanged(lambda: register(key, owner=FOREIGN, ok=False), 'foreign proposal registration cannot take over token')
        fails_unchanged(lambda: confirm(key, FOREIGN, 456, False), 'foreign human cannot consume owner proposal')
        for role in ('anon', 'authenticated'):
            fails_unchanged(lambda: register(token(), role=role, ok=False), role + ' cannot register proposal')
            fails_unchanged(lambda: confirm(key, role=role, ok=False), role + ' cannot call confirmation RPC')
            verify('permission denied' in sql(f'SET ROLE {role}; SELECT * FROM public.esco_memory_proposals;', False), role + ' cannot read private proposals')
        verify('permission denied' in sql('SET ROLE service_role; INSERT INTO public.esco_memory_proposals(token,owner_id,payload_hash) VALUES (\'bypass\',\'' + OWNER + "','x'::bytea);", False), 'service role has RPC access, no direct proposal DML')
        for mutation, restore, label in [
            ("UPDATE public.usuarios SET activo=false", "UPDATE public.usuarios SET activo=true", 'deactivated owner'),
            ("UPDATE public.usuarios SET rol='Administrador'", "UPDATE public.usuarios SET rol='Gerencia'", 'demoted owner'),
            ("UPDATE public.telegram_usuarios SET activo=false", "UPDATE public.telegram_usuarios SET activo=true", 'deactivated Telegram link'),
            ("UPDATE public.telegram_usuarios SET usuario_id='" + FOREIGN + "' WHERE telegram_id=123", "UPDATE public.telegram_usuarios SET usuario_id='" + OWNER + "' WHERE telegram_id=123", 'relinked sender'),
            ("UPDATE public.telegram_usuarios SET modulos_permitidos='{}'", "UPDATE public.telegram_usuarios SET modulos_permitidos='{consultas}'", 'removed consultas grant'),
        ]:
            sql(mutation)
            fails_unchanged(lambda: confirm(key, ok=False), label + ' blocked at atomic DB boundary')
            sql(restore)
        for mutation, restore, label in [
            ("UPDATE public.usuarios SET activo=false WHERE id='" + OWNER + "'", "UPDATE public.usuarios SET activo=true", 'owner deactivation'),
            ("UPDATE public.telegram_usuarios SET modulos_permitidos='{}' WHERE telegram_id=123", "UPDATE public.telegram_usuarios SET modulos_permitidos='{consultas}'", 'consultas revocation'),
            ("UPDATE public.telegram_usuarios SET usuario_id='" + FOREIGN + "' WHERE telegram_id=123", "UPDATE public.telegram_usuarios SET usuario_id='" + OWNER + "' WHERE telegram_id=123", 'sender relink'),
        ]:
            before = state()
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                revoke = pool.submit(sql, "SET application_name='synthetic_memory_revocation'; BEGIN; " + mutation + "; SELECT pg_sleep(2); COMMIT;")
                deadline = time.monotonic() + 10
                while sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='synthetic_memory_revocation' AND wait_event='PgSleep');") != 't':
                    if time.monotonic() > deadline:
                        raise AssertionError('Concurrent revocation lock was not observed')
                    time.sleep(.02)
                confirm(key, ok=False)
                revoke.result()
            verify(before == state(), 'confirmation waiting behind concurrent ' + label + ' rejects without partial writes')
            sql(restore)
        for table, event in [('esco_memorias', 'INSERT'), ('esco_memory_confirmation_receipts', 'INSERT'), ('esco_memory_proposals', 'UPDATE')]:
            for action in ["RAISE EXCEPTION 'synthetic fault';", 'RETURN NULL;']:
                sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; CREATE TRIGGER synthetic_fault BEFORE {event} ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
                fails_unchanged(lambda: confirm(key, ok=False), f'{table} {action} rolls memory/consume/receipt back together')
                sql(f'DROP TRIGGER synthetic_fault ON public.{table}; DROP FUNCTION public.synthetic_fault();')
        for field, expression in [('content', "'altered'"), ('reason', "'altered reason'"),
                                  ('expires_at', "expires_at - interval '1 minute'"),
                                  ('expires_at', "expires_at + interval '1 minute'")]:
            fails_unchanged(lambda: sql(f"BEGIN; UPDATE public.esco_memory_proposals SET {field}={expression} WHERE token={literal(key)}; SET ROLE service_role; SELECT public.esco_confirm_telegram_memory('{OWNER}',123,{literal(key)});", False), 'pending ' + field + ' alteration cannot confirm')
        for table, event, fields in [
            ('esco_memorias', 'INSERT', [('content', "'altered'"), ('user_id', f"'{FOREIGN}'::uuid")]),
            ('esco_memory_confirmation_receipts', 'INSERT', [('receipt', "'{}'::jsonb"), ('owner_id', f"'{FOREIGN}'::uuid"), ('confirmed_at', "NEW.confirmed_at + interval '1 second'")]),
            ('esco_memory_proposals', 'UPDATE', [('owner_id', f"'{FOREIGN}'::uuid"), ('payload_hash', "'altered'::bytea"), ('expires_at', "NEW.expires_at + interval '1 minute'"), ('consumed_at', "NEW.consumed_at + interval '1 second'")]),
        ]:
            for timing in ('BEFORE', 'AFTER'):
                for field, expression in fields:
                    where = 'id=NEW.id' if table == 'esco_memorias' else 'token=NEW.token'
                    action = f'NEW.{field}:={expression};' if timing == 'BEFORE' else f'UPDATE public.{table} SET {field}={expression} WHERE {where};'
                    sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; {action} RETURN NEW; END $$; CREATE TRIGGER synthetic_fault {timing} {event} ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
                    fails_unchanged(lambda: confirm(key, ok=False), f'{timing} {table} {field} mutation rolls all three rows back')
                    sql(f'DROP TRIGGER synthetic_fault ON public.{table}; DROP FUNCTION public.synthetic_fault();')
        for table, event in [('esco_memorias','INSERT'), ('esco_memory_confirmation_receipts','INSERT'), ('esco_memory_proposals','UPDATE')]:
            where = 'id=NEW.id' if table == 'esco_memorias' else 'token=NEW.token'
            sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM public.{table} WHERE {where}; RETURN NEW; END $$; CREATE TRIGGER synthetic_fault AFTER {event} ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
            fails_unchanged(lambda: confirm(key, ok=False), f'AFTER {table} deletion cannot claim durable success')
            sql(f'DROP TRIGGER synthetic_fault ON public.{table}; DROP FUNCTION public.synthetic_fault();')
        sql("CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE public.esco_memorias SET content='late cross-table mutation'; RETURN NEW; END $$; CREATE TRIGGER synthetic_fault AFTER UPDATE ON public.esco_memory_proposals FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();")
        fails_unchanged(lambda: confirm(key, ok=False), 'late consume trigger changing earlier memory insert is detected by final readback')
        sql('DROP TRIGGER synthetic_fault ON public.esco_memory_proposals; DROP FUNCTION public.synthetic_fault();')
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: confirm(key), range(8)))
        verify(len({r['id'] for r in results}) == 1 and sum(not r['replayed'] for r in results) == 1,
               'eight concurrent confirmations create exactly one memory and one receipt')
        verify(sql('SELECT count(*) FROM public.esco_memorias;') == '1', 'one canonical memory row')
        first = next(r for r in results if not r['replayed'])
        replay = confirm(key)
        verify({k: v for k, v in replay.items() if k != 'replayed'} == {k: v for k, v in first.items() if k != 'replayed'}, 'lost-response retry returns exact original receipt')
        sql("UPDATE public.telegram_usuarios SET activo=false WHERE telegram_id=123;")
        fails_unchanged(lambda: confirm(key, ok=False), 'receipt replay still requires current active admission')
        sql("UPDATE public.telegram_usuarios SET activo=true WHERE telegram_id=123;")
        sql(f"INSERT INTO public.telegram_usuarios(telegram_id,usuario_id,nombre_display,activo,modulos_permitidos) VALUES(789,'{OWNER}','Synthetic alternate',true,ARRAY['consultas']);")
        fails_unchanged(lambda: confirm(key, sender=789, ok=False), 'receipt cannot replay with another sender linked to same owner')
        expired = token(); register(expired)
        expired = age_token(expired, 1801)
        fails_unchanged(lambda: confirm(expired, ok=False), '30-minute proposal expiry prevents first consume')
        key = age_token(key, 167*3600+60)
        sql("UPDATE public.esco_memory_confirmation_receipts SET confirmed_at=clock_timestamp()-interval '167 hours'; UPDATE public.esco_memory_proposals SET consumed_at=clock_timestamp()-interval '167 hours' WHERE consumed_at IS NOT NULL;")
        verify(confirm(key)['replayed'], 'receipt survives beyond proposal TTL and below 168 hours')
        key = age_token(key, 168*3600+60)
        sql("UPDATE public.esco_memory_confirmation_receipts SET confirmed_at=clock_timestamp()-interval '168 hours'; UPDATE public.esco_memory_proposals SET consumed_at=clock_timestamp()-interval '168 hours' WHERE consumed_at IS NOT NULL;")
        fails_unchanged(lambda: confirm(key, ok=False), '168-hour receipt expiry prevents replay')
        for table in ('esco_memory_confirmation_receipts', 'esco_memory_proposals'):
            sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER synthetic_fault BEFORE DELETE ON public.{table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')
            fails_unchanged(lambda: sql('SET ROLE service_role; SELECT public.esco_purge_memory_confirmation_payloads();', False), table + ' silent DELETE suppression fails cleanup atomically for scheduler health')
            sql(f'DROP TRIGGER synthetic_fault ON public.{table}; DROP FUNCTION public.synthetic_fault();')
        sql('UPDATE public.usuarios SET activo=false;')
        sql('SET ROLE service_role; SELECT public.esco_purge_memory_confirmation_payloads();')
        verify(True, 'scheduled purge function runs without active users or user traffic')
        sql('UPDATE public.usuarios SET activo=true;')
        verify(sql('SELECT count(*) FROM public.esco_memory_confirmation_receipts;') == '0', 'caller purge removes expired receipt')
        verify(sql('SELECT count(*) FROM public.esco_memory_proposals;') == '0', 'purge deletes all expired/spent proposal rows and owner/token/hash metadata')
        verify(sql('SELECT count(*) FROM public.esco_memorias;') == '1', 'receipt cleanup preserves the long-term saved memory')
        fails_unchanged(lambda: confirm(key, ok=False), 'purged historical token has no confirmation row')
        fails_unchanged(lambda: verify('issuance expired' in register(key, ok=False), 'historical re-registration rejects specifically on issuance age'), 'purged historical consumed token cannot be re-registered by expired issuance')
        fails_unchanged(lambda: register(expired, ok=False), 'purged pending token cannot be re-registered by expired issuance')
        print(json.dumps({'checks': CHECKS, 'postgres': '17.6', 'live_requests': 0, 'candidate_applied_only_to_synthetic_database': True}), flush=True)
    finally:
        docker(['rm', '-f', NAME], check=False)
        verify(docker(['inspect', NAME], check=False).returncode != 0, 'cleanup verified: owned container removed')


if __name__ == '__main__':
    run()
