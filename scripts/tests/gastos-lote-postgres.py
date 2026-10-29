"""Pruebas de lotes de gastos contra PostgreSQL 17 local, sin red, puertos ni volúmenes.

Requiere Docker y una imagen postgres:17-alpine YA disponible. No instala ni
descarga nada. Nunca acepta una URL, conexión ni nombre de base externo.
"""
import concurrent.futures
import json
import pathlib
import re
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTAINER = 'escocia-gastos-' + uuid.uuid4().hex[:10]
G = '00000000-0000-4000-8000-000000000001'
A = '00000000-0000-4000-8000-000000000002'
P = '10000000-0000-4000-8000-000000000001'
Q = '10000000-0000-4000-8000-000000000002'
passed = 0


def sql(query, success=True):
    result = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=query, text=True, capture_output=True, timeout=30,
    )
    if success and result.returncode:
        raise AssertionError(result.stderr)
    if not success:
        assert result.returncode != 0, 'Se esperaba rechazo/rollback'
    value = result.stdout.strip()
    if re.fullmatch(r'-?\d+\.\d+', value):
        value = value.rstrip('0').rstrip('.')
    return value


def call(data, request=None, actor=G, success=True, expected=None):
    payload = json.dumps(data).replace("'", "''")
    return sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{actor}'; "
               f"SELECT fn_fin_gastos_guardar_lote('{request or uuid.uuid4()}', '{expected or actor}', '{payload}'::jsonb);", success)


def expense(name='Local', value=10):
    return dict(fecha='2026-10-28',nombre=name,valor=value,negocio_id=P,region_id=P,
                categoria_id=P,concepto_id=P,medio_pago_id=P,proveedor_id=None,
                observaciones=None,url_factura=None,estado='Confirmado')


def snapshot():
    return sql("SELECT json_build_array((SELECT json_agg(x ORDER BY id) FROM fin_gastos x),"
               "(SELECT json_agg(x ORDER BY solicitud_id) FROM fin_gastos_lotes x));")


def check(name):
    global passed
    passed += 1
    print('PASS', name, flush=True)


def run_cases():
    req = str(uuid.uuid4())
    data = [expense(),expense('Dos',20)]
    result = call(data,req)
    assert result == call(data,req)  # A fresh session represents reload/lost response.
    assert sql('SELECT count(*) FROM fin_gastos') == '2'
    assert sql(f"SELECT bool_and(created_by='{G}') FROM fin_gastos") == 't'
    assert len(json.loads(result)['ids']) == 2
    check('lost response/reload returns original IDs, counts and authorship')
    state = snapshot()
    call([expense(value=12)],req,success=False)
    call(data,req,actor='00000000-0000-4000-8000-000000000006',success=False)
    assert snapshot() == state
    assert sql("SET ROLE authenticated; SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000006'; SELECT count(*) FROM fin_gastos_lotes;") == '0'
    check('changed payload and cross-user receipt rejected without changes')
    for actor in [A,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000005']:
        call(data,actor=actor,success=False)
    sql(f"UPDATE usuarios SET activo=false WHERE id='{G}'")
    call(data,req,success=False)
    sql(f"UPDATE usuarios SET activo=true,rol='Administrador' WHERE id='{G}'")
    call(data,req,success=False)
    sql(f"UPDATE usuarios SET rol='Gerencia' WHERE id='{G}'")
    assert snapshot() == state
    assert sql(f"SET ROLE anon; SELECT fn_fin_gastos_guardar_lote('{uuid.uuid4()}','{G}','[]');",False) == ''
    call(data,actor='00000000-0000-4000-8000-000000000006',expected=G,success=False)
    assert snapshot()==state
    check('inactive/downgraded/other roles/anon and switched session denied')
    for invalid in [[],None,{},[expense(),expense(value=-1)], [expense(),dict(expense(),medio_pago_id=Q)],
                    [expense(),dict(expense(),fecha=None)],[expense(),dict(expense(),nombre='  ')]]:
        call(invalid,success=False)
        assert snapshot()==state
    check('validation, FK and NOT NULL failures roll back all rows and receipt')
    req2 = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda _:call(data,req2),range(4)))
    assert len(set(results))==1
    assert sql('SELECT count(*) FROM fin_gastos')=='4'
    check('four concurrent repeats commit one batch and return identical IDs')
    req3 = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda v:call([expense(value=v)],req3,success=False),[0,-1]))
    assert sql('SELECT count(*) FROM fin_gastos_lotes')=='2'
    assert call(data,req3)
    check('concurrent rejected attempts leave request usable after rollback')
    state=snapshot()
    sql("CREATE FUNCTION local_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.nombre='Dos' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER local_fail BEFORE INSERT ON fin_gastos FOR EACH ROW EXECUTE FUNCTION local_fail();")
    call(data,success=False)
    assert snapshot()==state
    sql('DROP TRIGGER local_fail ON fin_gastos; DROP FUNCTION local_fail();')
    check('injected second-row failure rolls back first row and receipt')
    for statement in ["UPDATE fin_gastos_lotes SET resultado='{}'",'DELETE FROM fin_gastos_lotes']:
        sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{G}'; {statement}",False)
    assert snapshot()==state
    assert sql("SELECT prosecdef FROM pg_proc WHERE proname='fn_fin_gastos_guardar_lote'")=='f'
    check('receipt immutable, RPC INVOKER and existing expense RLS preserved')
    # INVOKER trust limit: an authorized owner can forge its own receipt via
    # the table API, but cannot write another owner's receipt or alter receipts.
    forged=str(uuid.uuid4())
    other='00000000-0000-4000-8000-000000000006'
    sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{other}'; INSERT INTO fin_gastos_lotes(solicitud_id,usuario_id,datos,resultado) VALUES('{forged}','{G}','[]','{{}}');",False)
    sql(f"SET ROLE authenticated; SET request.jwt.claim.sub='{other}'; INSERT INTO fin_gastos_lotes(solicitud_id,usuario_id,datos,resultado) VALUES('{forged}','{other}','[]','{{}}');")
    assert sql('SELECT count(*) FROM fin_gastos')=='6'
    sql(f"DELETE FROM usuarios WHERE id='{other}'; DELETE FROM auth.users WHERE id='{other}';")
    assert sql(f"SELECT count(*) FROM fin_gastos_lotes WHERE solicitud_id='{forged}'")=='0'
    check('owner-INSERT trust limit explicit; no cross-owner forgery or new account-deletion block')
    print(f'{passed} grupos PostgreSQL OK')


def run_local():
    try:
        subprocess.run(['docker', 'run', '--pull=never', '--rm', '-d', '--name', CONTAINER,
                        '--network=none', '--tmpfs', '/var/lib/postgresql/data',
                        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine'],
                       check=True, capture_output=True, text=True)
        for _ in range(100):
            ready = subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-U', 'postgres'], capture_output=True)
            logs = subprocess.run(['docker', 'logs', CONTAINER], capture_output=True, text=True)
            output = logs.stdout + logs.stderr
            if ready.returncode == 0 and 'PostgreSQL init process complete' in output and output.count('database system is ready to accept connections') >= 2:
                break
            time.sleep(.1)
        else:
            raise AssertionError('PostgreSQL local no inició')
        sql((ROOT / 'scripts/tests/gastos-lote-fixture.sql').read_text())
        sql((ROOT / 'src/sql/migrations/187_fin_gastos_lote_reintentable.sql').read_text())
        check('migración completa compila con RLS y roles')

        run_cases()
    finally:
        subprocess.run(['docker', 'rm', '-f', CONTAINER], capture_output=True)


if __name__ == '__main__':
    run_local()
