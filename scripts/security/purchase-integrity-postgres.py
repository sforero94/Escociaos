#!/usr/bin/env python3
"""Synthetic PG17.6 verification. No network, binds, ports, secrets or production data."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
ACTOR = '10000000-0000-4000-8000-000000000001'
MANAGER = '10000000-0000-4000-8000-000000000002'
INACTIVE = '10000000-0000-4000-8000-000000000003'
VIEWER = '10000000-0000-4000-8000-000000000004'
P1 = '20000000-0000-4000-8000-000000000001'
P2 = '20000000-0000-4000-8000-000000000002'
ENV = os.environ.copy()
for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
CONTAINER = None
CHECKS = 0


def docker(args, data=None, check=True):
    return subprocess.run(DOCKER + args, input=data, text=True, capture_output=True,
                          env=ENV, check=check, timeout=60)


def sql(source, ok=True):
    result = docker(['exec', '-i', '-u', 'postgres', CONTAINER, 'psql', '-X', '-qAt',
                     '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], source, False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and result.returncode == 0:
        raise AssertionError('Expected SQL rejection, got success')
    return result.stdout.strip() if ok else result.stderr


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def call(fn, payload, key=None, actor=ACTOR, ok=True, role='authenticated'):
    key = key or str(uuid.uuid4())
    claim = actor or ''
    source = f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={literal(claim)}; "
    source += f"SELECT public.{fn}('{key}'::uuid,{literal(json.dumps(payload))}::jsonb); COMMIT;"
    result = sql(source, ok)
    return json.loads(result) if ok else result


def read_proof(purchase, actor=ACTOR, role='authenticated', ok=True):
    claim=actor or ''
    result=sql(f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={literal(claim)}; "
               f"SELECT public.fn_purchase_proof('{purchase}'::uuid); COMMIT;",ok)
    return json.loads(result) if ok else result


def proof_rejected(purchase, actor=ACTOR, role='authenticated', label='proof read rejected'):
    before=state()
    read_proof(purchase,actor,role,False)
    verify(state()==before,label)


def line(product=P1, quantity=2.345, unit_cost=10.456, total_cost=24.519):
    return {'producto_id': product, 'fecha_compra': '2026-01-02', 'proveedor': 'Synthetic supplier',
            'numero_factura': 'SYNTHETIC', 'cantidad': quantity, 'unidad': 'Kilos',
            'costo_unitario': unit_cost, 'costo_total': total_cost,
            'url_factura': 'synthetic://retained-invoice'}


def state():
    tables = ['public.productos', 'public.compras', 'public.movimientos_inventario', 'public.fin_gastos',
              'purchase_integrity.requests', 'purchase_integrity.postings', 'purchase_integrity.expense_links']
    selects = [f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM {table} t)"
               for table in tables]
    return sql('SELECT jsonb_build_array(' + ','.join(selects) + ')::text;')


def verify(value, label):
    global CHECKS
    if not value:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS', label, flush=True)


def failed_atomically(fn, payload, key=None, actor=ACTOR, role='authenticated', label='atomic rejection'):
    before = state()
    error = call(fn, payload, key, actor, False, role)
    if any(unexpected in error for unexpected in ('ambiguous', 'syntax error', 'record \"', 'is not assigned yet')):
        raise AssertionError(error)
    verify(state() == before, label)


def suppress(table, event, action='RETURN NULL;'):
    sql(f"CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; "
        f"CREATE TRIGGER synthetic_fault BEFORE {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();")


def unsuppress(table):
    sql(f'DROP TRIGGER synthetic_fault ON {table}; DROP FUNCTION public.synthetic_fault();')


FIXTURE = f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TYPE public.rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');
CREATE TYPE public.unidad_medida AS ENUM ('Kilos','Litros','Unidades');
CREATE TYPE public.tipo_movimiento AS ENUM ('Entrada','Salida Otros');
CREATE TABLE public.usuarios(id uuid PRIMARY KEY,email text NOT NULL,rol public.rol_usuario NOT NULL,activo boolean);
INSERT INTO public.usuarios VALUES ('{ACTOR}','admin@synthetic.invalid','Administrador',true),
 ('{MANAGER}','manager@synthetic.invalid','Gerencia',true),
 ('{INACTIVE}','inactive@synthetic.invalid','Administrador',false),
 ('{VIEWER}','viewer@synthetic.invalid','Verificador',true);
CREATE TABLE public.productos(id uuid PRIMARY KEY,nombre text,unidad_medida public.unidad_medida NOT NULL,
 cantidad_actual numeric(12,2),precio_unitario numeric(12,2),activo boolean,updated_at timestamptz DEFAULT now());
INSERT INTO public.productos VALUES ('{P1}','Synthetic one','Kilos',10,2,false,now()),
 ('{P2}','Synthetic two','Kilos',10,2,true,now());
CREATE TABLE public.fin_proveedores(id uuid PRIMARY KEY);
CREATE TABLE public.compras(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fecha_compra date NOT NULL,
 proveedor text NOT NULL,numero_factura text,producto_id uuid NOT NULL REFERENCES public.productos,
 cantidad numeric(12,2) NOT NULL CHECK(cantidad>0),unidad public.unidad_medida NOT NULL,
 numero_lote_producto text,fecha_vencimiento date,costo_unitario numeric(12,2) NOT NULL CHECK(costo_unitario>0),
 costo_total numeric(12,2) NOT NULL CHECK(costo_total>0),link_factura text,usuario_registro text,
 created_at timestamptz DEFAULT now(),updated_at timestamp DEFAULT now(),updated_by uuid,
 proveedor_id uuid REFERENCES public.fin_proveedores,url_factura text);
CREATE TABLE public.movimientos_inventario(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fecha_movimiento date NOT NULL,
 producto_id uuid NOT NULL REFERENCES public.productos,tipo_movimiento public.tipo_movimiento NOT NULL,
 cantidad numeric(12,2) NOT NULL,unidad public.unidad_medida NOT NULL,lote_aplicacion text,aplicacion_id uuid,
 factura text,saldo_anterior numeric(12,2),saldo_nuevo numeric(12,2),valor_movimiento numeric(12,2),
 responsable text,observaciones text,provisional boolean DEFAULT false,created_at timestamptz DEFAULT now(),notas text);
CREATE TABLE public.fin_gastos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fecha date NOT NULL,
 negocio_id uuid NOT NULL,region_id uuid NOT NULL,categoria_id uuid NOT NULL,concepto_id uuid NOT NULL,
 nombre text NOT NULL,proveedor_id uuid,valor numeric NOT NULL CHECK(valor>0),medio_pago_id uuid NOT NULL,
 observaciones text,compra_id uuid REFERENCES public.compras ON DELETE SET NULL,
 estado text CHECK(estado IN ('Pendiente','Confirmado')),created_at timestamptz DEFAULT now(),
 updated_at timestamptz DEFAULT now(),created_by uuid,updated_by uuid,url_factura text);
CREATE FUNCTION public.fn_cleanup_compra_dependencies(p_compra_id uuid) RETURNS void
 LANGUAGE sql SECURITY DEFINER AS $$ DELETE FROM public.fin_gastos WHERE compra_id=p_compra_id $$;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_gastos ENABLE ROW LEVEL SECURITY;
"""


def add_expenses(purchase):
    sql(f"INSERT INTO public.fin_gastos(fecha,negocio_id,region_id,categoria_id,concepto_id,nombre,valor,medio_pago_id,compra_id,estado,url_factura) "
        f"SELECT '2026-01-02','{P1}','{P1}','{P1}','{P1}','Synthetic expense '||coalesce(estado,'null'),7,'{P1}','{purchase}',estado,'synthetic://expense' "
        "FROM (VALUES ('Pendiente'),('Confirmado'),(NULL::text)) e(estado);")


def tests():
    verify(sql('SHOW server_version;').startswith('17.6'), 'pinned PostgreSQL17.6')
    sql(FIXTURE)
    sql((ROOT / 'src/sql/security-candidates/purchase-integrity.sql').read_text())
    payload = {'lines': [line()]}
    for actor in (None, INACTIVE, VIEWER, '10000000-0000-4000-8000-999999999999'):
        failed_atomically('fn_purchase_post', payload, actor=actor, label=f'creation unauthorized actor {actor}')
    failed_atomically('fn_purchase_post', payload, role='anon', label='anon has no RPC execute')
    failed_atomically('fn_purchase_post', payload, role='service_role', label='service role has no human RPC execute')
    for value in (-1, 0, 'NaN', 'Infinity', '12kilos', None, 0.001, 1e12):
        malformed = {'lines': [line(quantity=1), line(quantity=value)]}
        failed_atomically('fn_purchase_post', malformed, label=f'all-line numeric validation {value}')
    failed_atomically('fn_purchase_post', {'lines': [line(), {**line(), 'actor': ACTOR}]}, label='caller actor fields rejected')
    failed_atomically('fn_purchase_post', {'lines': [line(), {**line(P2), 'proveedor_id':'90000000-0000-4000-8000-000000000000'}]}, label='late second-line FK error rolls back first-line writes')
    sql(f"UPDATE public.productos SET cantidad_actual=9999999999.99 WHERE id='{P2}';")
    failed_atomically('fn_purchase_post', {'lines':[line(),line(P2,1,2,2)]}, label='late second-product overflow rolls back first-product writes')
    sql(f"UPDATE public.productos SET cantidad_actual=10 WHERE id='{P2}';")
    failed_atomically('fn_purchase_post', {'lines': [line('90000000-0000-4000-8000-000000000000')]}, label='missing product')
    for table, event in [('purchase_integrity.requests','INSERT'),('public.compras','INSERT'),
                         ('public.productos','UPDATE'),('public.movimientos_inventario','INSERT'),
                         ('purchase_integrity.postings','INSERT'),('purchase_integrity.requests','UPDATE')]:
        suppress(table,event)
        failed_atomically('fn_purchase_post', payload, label=f'posting suppression rollback {table}/{event}')
        unsuppress(table)
    suppress('public.productos','UPDATE','NEW.cantidad_actual:=NEW.cantidad_actual+1; RETURN NEW;')
    failed_atomically('fn_purchase_post',payload,label='altered stock RETURNING rollback')
    unsuppress('public.productos')
    sql("CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
        "UPDATE public.compras SET costo_total=costo_total+1 WHERE id=NEW.id; RETURN NEW; END $$; "
        "CREATE TRIGGER synthetic_fault AFTER INSERT ON public.compras FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();")
    failed_atomically('fn_purchase_post',payload,label='AFTER purchase mutation rollback')
    unsuppress('public.compras')
    sql("CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN "
        "IF pg_trigger_depth()=1 THEN UPDATE purchase_integrity.requests SET result='{}'::jsonb WHERE actor=NEW.actor AND request_key=NEW.request_key; END IF; RETURN NEW; END $$; "
        "CREATE TRIGGER synthetic_fault AFTER UPDATE ON purchase_integrity.requests FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();")
    failed_atomically('fn_purchase_post',payload,label='AFTER receipt mutation rolls back every posting write')
    unsuppress('purchase_integrity.requests')

    key = str(uuid.uuid4())
    initial = call('fn_purchase_post',payload,key)
    purchase = initial['purchases'][0]
    verify(sql(f"SELECT cantidad=2.35 AND costo_unitario=10.46 AND costo_total=24.52 FROM public.compras WHERE id='{purchase['purchase_id']}';")=='t',
           'numeric12,2 rounds quantity/unitcost/total independently')
    verify(sql(f"SELECT cantidad_actual=12.35 AND precio_unitario=10.46 AND activo FROM public.productos WHERE id='{P1}';")=='t',
           'stock delta uses locked current balance and reactivates stocked product')
    before = state()
    verify(call('fn_purchase_post',payload,key)==initial and state()==before,'exact successful creation replay performs no writes')
    failed_atomically('fn_purchase_post',{'lines':[line(quantity=2.346)]},key,label='same key different unrounded payload rejected')
    sql(f"UPDATE public.usuarios SET activo=false WHERE id='{ACTOR}';")
    failed_atomically('fn_purchase_post',payload,key,label='successful replay reauthorizes inactive actor')
    sql(f"UPDATE public.usuarios SET activo=true WHERE id='{ACTOR}';")
    smoke=call('fn_purchase_post',{'lines':[line(P2,1,2,2)]})['purchases'][0]
    call('fn_purchase_reverse',{'purchase_id':smoke['purchase_id'],'expected':smoke['expected']})
    verify(sql(f"SELECT cantidad_actual=10 FROM public.productos WHERE id='{P2}';")=='t','positive reversal succeeds before fault injection')
    before=state()
    verify(read_proof(purchase['purchase_id'])=={'purchase_id':purchase['purchase_id'],'expected':purchase['expected']} and state()==before,
           'active Admin proof reader returns canonical snapshot without writes')
    verify(read_proof(purchase['purchase_id'],MANAGER)['expected']==purchase['expected'],
           'active Gerencia can read another authorized manager posting proof')
    for actor in (None,INACTIVE,VIEWER,'10000000-0000-4000-8000-999999999999'):
        proof_rejected(purchase['purchase_id'],actor,label=f'proof reader rejects unauthorized actor {actor}')
    for role in ('anon','service_role'):
        proof_rejected(purchase['purchase_id'],role=role,label=f'proof RPC execution denied for {role}')
    proof_rejected('90000000-0000-4000-8000-000000000000',label='missing proof reader target rejected')
    sql(f"UPDATE public.usuarios SET activo=false WHERE id='{ACTOR}';")
    proof_rejected(purchase['purchase_id'],label='proof reader freshly rejects revoked active account')
    sql(f"UPDATE public.usuarios SET activo=true WHERE id='{ACTOR}';")
    missing=call('fn_purchase_post',{'lines':[line(P2,1,2,2)]})['purchases'][0]
    sql(f"DELETE FROM public.compras WHERE id='{missing['purchase_id']}';")
    proof_rejected(missing['purchase_id'],label='proof reader refuses protected proof whose original purchase vanished')
    failed_atomically('fn_purchase_reverse',{'purchase_id':missing['purchase_id'],'expected':missing['expected']},
                      label='vanished original purchase never authorizes stock debit')
    sql(f"UPDATE public.productos SET cantidad_actual=10 WHERE id='{P2}';")
    reverse = {'purchase_id':purchase['purchase_id'],'expected':purchase['expected']}
    add_expenses(purchase['purchase_id'])
    for table,event in [('purchase_integrity.expense_links','INSERT'),('public.movimientos_inventario','INSERT'),
                        ('public.productos','UPDATE'),('public.compras','DELETE'),('public.fin_gastos','UPDATE'),
                        ('purchase_integrity.expense_links','UPDATE'),('purchase_integrity.postings','UPDATE'),
                        ('purchase_integrity.requests','UPDATE')]:
        suppress(table,event)
        failed_atomically('fn_purchase_reverse',reverse,label=f'reversal suppression rollback {table}/{event}')
        unsuppress(table)
    suppress('public.compras','DELETE','DELETE FROM public.fin_gastos WHERE compra_id=OLD.id; RETURN OLD;')
    failed_atomically('fn_purchase_reverse',reverse,label='unexpected expense deletion trigger rolls back all writes')
    unsuppress('public.compras')
    suppress('purchase_integrity.postings','UPDATE',"NEW.purchase_snapshot:=NEW.purchase_snapshot||jsonb_build_object('cantidad',999); RETURN NEW;")
    failed_atomically('fn_purchase_reverse',reverse,label='altered protected proof RETURNING rolls back all writes')
    unsuppress('purchase_integrity.postings')
    failed_atomically('fn_purchase_reverse',{**reverse,'expected':{**purchase['expected'],'cantidad':3}},label='caller stale expected snapshot rejected')
    sql(f"UPDATE public.compras SET numero_factura='EDITED' WHERE id='{purchase['purchase_id']}';")
    failed_atomically('fn_purchase_reverse',reverse,label='mutated original purchase rejected')
    proof_rejected(purchase['purchase_id'],label='proof reader cannot return usable proof for edited purchase')
    sql(f"UPDATE public.compras SET numero_factura='SYNTHETIC' WHERE id='{purchase['purchase_id']}';")
    sql(f"UPDATE public.movimientos_inventario SET notas='EDITED' WHERE id='{purchase['movement_id']}';")
    failed_atomically('fn_purchase_reverse',reverse,label='mutated original movement rejected')
    proof_rejected(purchase['purchase_id'],label='proof reader refuses edited posting movement')
    sql(f"UPDATE public.movimientos_inventario SET notas=NULL WHERE id='{purchase['movement_id']}';")
    sql(f"UPDATE public.productos SET cantidad_actual=1 WHERE id='{P1}';")
    failed_atomically('fn_purchase_reverse',reverse,label='consumed stock cannot be reversed below zero')
    sql(f"UPDATE public.productos SET cantidad_actual=12.35 WHERE id='{P1}';")
    suppress('public.fin_gastos','UPDATE',"NEW.valor:=NEW.valor+1; RETURN NEW;")
    failed_atomically('fn_purchase_reverse',reverse,label='expense amount mutation during FK detach rolls back all writes')
    unsuppress('public.fin_gastos')
    # Owner-call cannot restore the dangerous old cleanup body; grants also deny callers.
    sql(f"SELECT public.fn_cleanup_compra_dependencies('{purchase['purchase_id']}');",False)
    verify(sql('SELECT count(*) FROM public.fin_gastos;')=='3','deprecated cleanup preserves every expense')
    sql(f"SET ROLE authenticated; SELECT public.fn_cleanup_compra_dependencies('{purchase['purchase_id']}');",False)
    verify(sql("SELECT has_function_privilege('authenticated','public.fn_cleanup_compra_dependencies(uuid)','EXECUTE');")=='f','old cleanup execute revoked')
    sql("SET ROLE authenticated; INSERT INTO purchase_integrity.postings(purchase_id) VALUES(gen_random_uuid());",False)
    verify(True,'ordinary callers cannot forge protected posting proof')

    reverse_key = str(uuid.uuid4())
    result = call('fn_purchase_reverse',reverse,reverse_key,MANAGER)
    proof_rejected(purchase['purchase_id'],label='proof reader refuses an already-reversed purchase')
    verify(result['preserved_expenses']==3,'reversal retains pending/confirmed/null-state expenses')
    verify(sql('SELECT count(*)=3 AND bool_and(compra_id IS NULL) FROM public.fin_gastos;')=='t','FK SET NULL preserves all expense rows')
    verify(sql("SELECT count(*)=3 AND bool_and(after_snapshot->'compra_id'='null'::jsonb) AND bool_and(before_snapshot->>'compra_id' IS NOT NULL) FROM purchase_integrity.expense_links;")=='t',
           'durable expense association holds before and after audit snapshots')
    verify(sql(f"SELECT cantidad_actual=10 AND precio_unitario IS NULL FROM public.productos WHERE id='{P1}';")=='t','reversal debits exact quantity and unknown surviving price stays null')
    before=state()
    verify(call('fn_purchase_reverse',reverse,reverse_key,MANAGER)==result and state()==before,'same reversal key replay never debits twice')
    failed_atomically('fn_purchase_reverse',reverse,actor=ACTOR,label='different reversal key cannot repeat a debit')
    failed_atomically('fn_purchase_reverse',reverse,reverse_key,ACTOR,label='request keys are scoped to trusted actor')
    failed_atomically('fn_purchase_post',payload,reverse_key,MANAGER,label='same actor/key cannot change operation')
    sql(f"UPDATE public.usuarios SET rol='Verificador' WHERE id='{MANAGER}';")
    failed_atomically('fn_purchase_reverse',reverse,reverse_key,MANAGER,label='reversal replay reauthorizes demoted actor')
    proof_rejected(purchase['purchase_id'],MANAGER,label='proof reader reauthorizes demoted manager before accessing proof')
    sql(f"UPDATE public.usuarios SET rol='Gerencia' WHERE id='{MANAGER}';")
    legacy=sql(f"INSERT INTO public.compras(fecha_compra,proveedor,producto_id,cantidad,unidad,costo_unitario,costo_total) VALUES('2025-01-01','Legacy','{P1}',2,'Kilos',8,16) RETURNING id;")
    snapshot=json.loads(sql(f"SELECT to_jsonb(compras) FROM public.compras WHERE id='{legacy}';"))
    failed_atomically('fn_purchase_reverse',{'purchase_id':legacy,'expected':snapshot},label='legacy quantity or similar ledger text never manufactures proof')
    proof_rejected(legacy,label='proof reader never promotes a legacy purchase into proven posting')

    # Opposite product orders and same request retries execute on independent backend sessions.
    multi={'lines':[line(P1,1,2,2),line(P2,1,2,2)]}
    opposite={'lines':list(reversed(multi['lines']))}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(lambda body:call('fn_purchase_post',body),[multi,opposite]))
    verify(len(results)==2 and sql(f"SELECT sum(cantidad_actual)=24 FROM public.productos;")=='t','opposite multi-product orders serialize without deadlock or stale balance')
    retry_key=str(uuid.uuid4()); retry_payload={'lines':[line(P2,1,2,2)]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(lambda _:call('fn_purchase_post',retry_payload,retry_key),range(2)))
    verify(results[0]==results[1] and sql(f"SELECT cantidad_actual=13 FROM public.productos WHERE id='{P2}';")=='t','concurrent exact creation retries credit stock once')
    concurrent_reverse={'purchase_id':results[0]['purchases'][0]['purchase_id'],'expected':results[0]['purchases'][0]['expected']}
    reverse_key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(lambda _:call('fn_purchase_reverse',concurrent_reverse,reverse_key),range(2)))
    verify(results[0]==results[1] and sql(f"SELECT cantidad_actual=12 FROM public.productos WHERE id='{P2}';")=='t','concurrent exact reversal retries debit stock once')
    race=call('fn_purchase_post',{'lines':[line(P2,1,2,2)]})['purchases'][0]
    race_payload={'purchase_id':race['purchase_id'],'expected':race['expected']}
    def race_attempt(actor):
        try:
            return ('success',call('fn_purchase_reverse',race_payload,actor=actor))
        except AssertionError as error:
            return ('rejected',str(error))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        raced=list(executor.map(race_attempt,[ACTOR,MANAGER]))
    verify(sum(kind=='success' for kind,_ in raced)==1 and sql(f"SELECT cantidad_actual=12 FROM public.productos WHERE id='{P2}';")=='t',
           'different actors/keys racing one purchase produce one stock debit')
    # Reversal uses the latest surviving purchase price including a legitimate legacy price.
    new=call('fn_purchase_post',{'lines':[line(P1,1,3,3)]})['purchases'][0]
    call('fn_purchase_reverse',{'purchase_id':new['purchase_id'],'expected':new['expected']})
    verify(sql(f"SELECT precio_unitario=2 FROM public.productos WHERE id='{P1}';")=='t','price restored from latest surviving purchase with deterministic tie order')
    same_sku=call('fn_purchase_post',{'lines':[line(P1,1,5,5),line(P1,1,6,6),line(P1,1,7,7)]})['purchases']
    call('fn_purchase_reverse',{'purchase_id':same_sku[1]['purchase_id'],'expected':same_sku[1]['expected']})
    verify(sql(f"SELECT precio_unitario=7 FROM public.productos WHERE id='{P1}';")=='t','same-transaction repeated product restores actual latest surviving line price')
    # A profile change cannot race a posting after fresh authorization: row-share
    # lock lasts until commit. Synthetic pg_sleep is bounded and has no network.
    lock_key=str(uuid.uuid4()); lock_payload={'lines':[line(P2,1,2,2)]}
    session_sql=f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{ACTOR}'; SELECT public.fn_purchase_post('{lock_key}',{literal(json.dumps(lock_payload))}::jsonb); SELECT pg_sleep(2); COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        posting=executor.submit(sql,session_sql)
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event='PgSleep');")=='t':
                break
            time.sleep(.05)
        else:
            raise AssertionError('Profile lock test failed to observe posting session')
        demotion=executor.submit(sql,f"UPDATE public.usuarios SET rol='Verificador' WHERE id='{ACTOR}';")
        deadline=time.monotonic()+1
        blocked=False
        while time.monotonic()<deadline:
            if sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE public.usuarios%');")=='t':
                blocked=True
                break
            time.sleep(.05)
        verify(blocked,'fresh active profile is locked through the posting transaction')
        posting.result(); demotion.result()
    failed_atomically('fn_purchase_post',lock_payload,lock_key,label='reauthorization after concurrent demotion denies receipt replay')
    sql(f"UPDATE public.usuarios SET rol='Administrador' WHERE id='{ACTOR}';")


def main():
    global CONTAINER
    docker(['info','--format','{{.ServerVersion}}'])
    # Pull never: this script cannot download images or access a remote daemon.
    CONTAINER = docker(['run','-d','--pull=never','--network=none','--read-only',
        '--tmpfs','/var/lib/postgresql/data:rw,size=512m','--tmpfs','/var/run/postgresql:rw,size=16m',
        '--tmpfs','/tmp:rw,size=16m','--memory=768m','--cpus=2','--security-opt=no-new-privileges',
        '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE]).stdout.strip()
    completed=False
    try:
        inspection=json.loads(docker(['inspect','--format','{{json .HostConfig}}',CONTAINER]).stdout)
        verify(inspection['NetworkMode']=='none' and not inspection['Binds'] and not inspection['PortBindings'],
               'isolation: network none, no bind mounts or ports')
        for _ in range(120):
            ready=docker(['exec','-u','postgres',CONTAINER,'pg_isready'],check=False)
            initialized='PostgreSQL init process complete; ready for start up.' in docker(['logs',CONTAINER]).stdout
            if initialized and ready.returncode==0:
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Synthetic PostgreSQL startup failed')
        tests()
        completed=True
    finally:
        docker(['rm','-f','-v',CONTAINER])
        verify(docker(['inspect',CONTAINER],check=False).returncode != 0,'cleanup verified: synthetic container and tmpfs removed')
    if completed:
        print(f'{CHECKS} synthetic assertions passed; candidate remains unapplied to production.',flush=True)


if __name__=='__main__':
    main()
