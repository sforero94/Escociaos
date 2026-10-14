#!/usr/bin/env python3
"""LOCAL PG17.6 fixture only. No production rows, credentials, network or exports.

Explicit historical-DDL approximation, not current schema/trigger parity certification.
"""
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
ANIMAL = '20000000-0000-4000-8000-000000000001'
ENV = os.environ.copy()
for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(name, None)
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
    if not ok and not result.returncode:
        raise AssertionError('Expected rejection')
    if not ok and any(word in result.stderr for word in ('column reference', 'syntax error', 'is not assigned yet')):
        raise AssertionError(result.stderr)
    return result.stdout.strip() if ok else result.stderr


def lit(value):
    return "'" + value.replace("'", "''") + "'"


def call(name, args, role='service_role', ok=True):
    result = sql(f'BEGIN; SET LOCAL ROLE {role}; SELECT public.{name}({args}); COMMIT;', ok)
    return json.loads(result) if ok else result


def prepare(op, target, sender=123, ok=True, role='service_role'):
    return call('fn_hato_undo_prepare', f'{sender},{lit(op)},{lit(target)}::uuid', role, ok)


def mutate(payload, key=None, sender=123, ok=True, role='service_role', resolve=False):
    return call('fn_hato_undo_resolve' if resolve else 'fn_hato_undo',
                f'{sender},{lit(key or str(uuid.uuid4()))}::uuid,{lit(json.dumps(payload))}::jsonb', role, ok)


def verify(condition, label):
    global CHECKS
    if not condition:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS', label, flush=True)


def state():
    return sql("SELECT jsonb_object_agg(n,rows) FROM (SELECT schemaname||'.'||tablename n,"
               "hato_undo.capture(ARRAY[(quote_ident(schemaname)||'.'||quote_ident(tablename))::regclass::oid]) rows "
               "FROM pg_tables WHERE schemaname IN ('public','hato_undo')) s;")


def reject(payload, label, **args):
    before = state()
    mutate(payload, ok=False, **args)
    verify(state() == before, label)


def event(**changes):
    target = str(uuid.uuid4())
    sql(f"INSERT INTO public.hato_eventos(id,animal_id,tipo,fecha,fuente,datos) VALUES('{target}','{ANIMAL}','celo','2026-01-01','telegram','{{}}');")
    for column, value in changes.items():
        sql(f'UPDATE public.hato_eventos SET {column}={value} WHERE id={lit(target)};')
    return target


def treatment(steps=2):
    target = str(uuid.uuid4())
    sql(f"INSERT INTO public.hato_tratamientos(id,animal_id,fuente,fecha_inicio,estado) VALUES('{target}','{ANIMAL}','telegram','2026-01-01','activo');")
    for number in range(steps):
        sql(f"INSERT INTO public.hato_tratamiento_pasos(id,tratamiento_id,paso_num,fecha_programada) VALUES(gen_random_uuid(),'{target}',{number},'2026-01-02');")
    return target


def fault(table, timing, event_name, body='RETURN NULL;'):
    sql(f'CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {body} END $$; '
        f'CREATE TRIGGER synthetic_fault {timing} {event_name} ON {table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();')


def clear_fault(table):
    sql(f'DROP TRIGGER synthetic_fault ON {table}; DROP FUNCTION public.synthetic_fault();')


FIXTURE = f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.usuarios(id uuid PRIMARY KEY,activo boolean,rol text,email text);
INSERT INTO public.usuarios VALUES('{ACTOR}',true,'Gerencia','synthetic@invalid');
CREATE TABLE public.telegram_usuarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint UNIQUE,usuario_id uuid REFERENCES usuarios,activo boolean);
INSERT INTO public.telegram_usuarios(telegram_id,usuario_id,activo) VALUES(123,'{ACTOR}',true);
CREATE TABLE public.hato_animales(id uuid PRIMARY KEY,numero integer,nombre text);
INSERT INTO public.hato_animales VALUES('{ANIMAL}',157,'ALINA');
CREATE TABLE public.hato_eventos(id uuid PRIMARY KEY,animal_id uuid NOT NULL REFERENCES hato_animales,tipo text NOT NULL,fecha date NOT NULL,
 fuente text,datos jsonb,chequeo_vaca_id uuid,cria_id uuid REFERENCES hato_animales,cria_destino text,tipo_servicio text,alerta_id uuid,transaccion_ganado_id uuid,
 created_at timestamptz DEFAULT now(),created_by uuid);
CREATE TABLE public.hato_tratamientos(id uuid PRIMARY KEY,animal_id uuid NOT NULL REFERENCES hato_animales,fuente text,chequeo_id uuid,
 fecha_inicio date NOT NULL,estado text NOT NULL,nombre text,nota text,created_at timestamptz DEFAULT now(),created_by uuid);
CREATE TABLE public.hato_tratamiento_pasos(id uuid PRIMARY KEY,tratamiento_id uuid NOT NULL REFERENCES hato_tratamientos ON DELETE CASCADE,
 paso_num integer,fecha_programada date,fecha_ejecutada date,descripcion text,UNIQUE(tratamiento_id,paso_num));
CREATE TABLE public.hato_alertas(id uuid PRIMARY KEY,animal_id uuid REFERENCES hato_animales,paso_id uuid REFERENCES hato_tratamiento_pasos,
 tipo text,estado text,respuesta text,respondida_por text,updated_at timestamptz);
CREATE TABLE public.hato_alertas_envios(alerta_id uuid REFERENCES hato_alertas ON DELETE CASCADE,telegram_id text,message_id bigint,
 PRIMARY KEY(alerta_id,telegram_id));
CREATE TABLE public.synthetic_event_reference(id uuid PRIMARY KEY,event_id uuid REFERENCES hato_eventos ON DELETE SET NULL,notes text);
CREATE TABLE public.synthetic_step_reference(id uuid PRIMARY KEY,step_id uuid REFERENCES hato_tratamiento_pasos ON DELETE CASCADE);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
"""


def tests():
    verify(sql('SHOW server_version;').startswith('17.6'), 'pinned local PostgreSQL17.6')
    sql(FIXTURE)
    sql((ROOT / 'src/sql/security-candidates/hato-undo.sql').read_text())
    # Baseline core transaction regression tests exercise the now-private old
    # entry points using LOCAL FIXTURE ONLY temporary grants, revoked afterward.
    for name in ('fn_hato_undo','fn_hato_undo_resolve'):
        verify(sql(f"SELECT has_function_privilege('service_role','public.{name}(bigint,uuid,jsonb)','EXECUTE');")=='f',f'{name} arbitrary payload mutation denied in installed candidate')
    sql('GRANT EXECUTE ON FUNCTION public.fn_hato_undo(bigint,uuid,jsonb),public.fn_hato_undo_resolve(bigint,uuid,jsonb) TO service_role;')
    # Actual repository 177, not a reimplemented approximation of its lock protocol.
    sql((ROOT / 'src/sql/migrations/177_hato_confirmar_paso_tratamiento.sql').read_text())
    target = event()
    proof = prepare('event', target)
    for role in ('anon', 'authenticated'):
        prepare('event', target, role=role, ok=False)
        reject(proof, f'{role} cannot mutate by claiming a Telegram sender', role=role)
        reject(proof, f'{role} cannot cancel by claiming a Telegram sender', role=role, resolve=True)
    for sender in (0, -1, 999, 'NULL', 9007199254740992):
        reject(proof, f'invalid/unlinked sender {sender} rejected', sender=sender)
    for column, value in [('activo','NULL'),('activo','false'),('rol',"'Administrador'"),('rol','NULL')]:
        sql(f'UPDATE public.usuarios SET {column}={value};')
        reject(proof, f'profile {column}={value} refuses')
        sql("UPDATE public.usuarios SET activo=true,rol='Gerencia';")
    sql('UPDATE public.telegram_usuarios SET activo=NULL;')
    reject(proof, 'null active binding refuses')
    sql('UPDATE public.telegram_usuarios SET activo=true;')
    for field, value in [('actor',str(uuid.uuid4())),('sender',999),('operation',None),('snapshot',None),('extra',True)]:
        reject({**proof,field:value}, f'caller proof field {field} refuses')
    for changes in [dict(fuente='NULL'),dict(fuente="'web'"),dict(tipo="'servicio'",tipo_servicio="'inseminacion'"),
                    dict(tipo="'servicio'",tipo_servicio='NULL'),dict(cria_id=lit(ANIMAL)),dict(cria_destino="'retenida'"),
                    dict(chequeo_vaca_id='gen_random_uuid()'),dict(datos="'{\"pajilla_uso_id\":null}'"),dict(datos="'[]'"),
                    dict(transaccion_ganado_id='gen_random_uuid()'),dict(alerta_id='gen_random_uuid()')]:
        bad = event(**changes)
        before = state()
        prepare('event',bad,ok=False)
        verify(state() == before, f'ambiguous/coupled/source legacy refused {changes}')
    sql(f"UPDATE public.hato_eventos SET datos='{{\"edited\":true}}' WHERE id='{target}';")
    reject(proof,'stale full snapshot refuses')
    proof=prepare('event',target)
    sql(f"INSERT INTO synthetic_event_reference VALUES(gen_random_uuid(),'{target}','preserve');")
    reject(proof,'actual incoming SET NULL reference preserved')
    sql('DELETE FROM synthetic_event_reference;')
    unrelated=event()
    key=str(uuid.uuid4())
    receipt=mutate(proof,key)
    verify(receipt['before']==proof['snapshot'] and receipt['after']=={'target':None,'steps':[]},'canonical exact event before/after')
    stored=json.loads(sql(f"SELECT to_jsonb(a) FROM hato_undo.audit a WHERE request_key='{key}';"))
    verify(stored['before_snapshot']==proof['snapshot'] and stored['after_snapshot']==receipt['after']
           and unrelated not in json.dumps(stored) and len(stored['before_footprint_sha256'])==64
           and len(stored['after_footprint_sha256'])==64,
           'retained audit contains exact affected rows and hashes, never unrelated clinical rows')
    verify(mutate(proof,key)==receipt,'same stable key replays after target deletion')
    verify(mutate(proof,key,resolve=True)['receipt']==receipt,'lost response resolves committed receipt')
    reject({**proof,'snapshot':{**proof['snapshot'],'target':{**proof['snapshot']['target'],'tipo':'parto'}}},'same key changed payload rejected',key=key)
    reject(proof,'fresh key cannot repeat target deletion')
    cancelled=prepare('event',event()); key=str(uuid.uuid4())
    verify(mutate(cancelled,key,resolve=True)['state']=='cancelled','missing request durably cancelled')
    reject(cancelled,'late original fenced by cancellation',key=key)
    verify(mutate(cancelled,key,resolve=True)['state']=='cancelled','cancelled status idempotent')
    # Suppressed request, target, cascade and audit writes must roll back EVERYTHING.
    for table,timing,action in [('hato_undo.requests','BEFORE','INSERT'),('public.hato_eventos','BEFORE','DELETE'),
                                ('hato_undo.audit','BEFORE','INSERT'),('hato_undo.requests','BEFORE','UPDATE')]:
        p=prepare('event',event()); fault(table,timing,action)
        reject(p,f'suppressed {table} {action} atomic rollback'); clear_fault(table)
    for table in ('public.hato_tratamientos','public.hato_tratamiento_pasos'):
        p=prepare('treatment',treatment()); fault(table,'BEFORE','DELETE')
        reject(p,f'suppressed treatment/cascade {table} rollback'); clear_fault(table)
    p=prepare('event',event()); other=event()
    for table,action in [('public.hato_eventos','DELETE'),('hato_undo.audit','INSERT'),('hato_undo.requests','UPDATE')]:
        fault(table,'AFTER',action,f"UPDATE public.hato_eventos SET tipo='aborto' WHERE id='{other}'; RETURN NEW;")
        reject(p,f'AFTER {table} extra domain mutation rollback'); clear_fault(table)
    fault('hato_undo.audit','AFTER','INSERT','DELETE FROM hato_undo.audit WHERE target_id=NEW.target_id; RETURN NEW;')
    reject(p,'audit vanished after insertion rollback'); clear_fault('hato_undo.audit')
    fault('hato_undo.requests','AFTER','INSERT',f"UPDATE public.hato_eventos SET tipo='aborto' WHERE id='{other}'; RETURN NEW;")
    reject(p,'status cancellation trigger domain mutation rollback',resolve=True); clear_fault('hato_undo.requests')
    p=prepare('treatment',treatment()); step=p['snapshot']['steps'][0]['id']
    sql(f"UPDATE hato_tratamiento_pasos SET fecha_ejecutada='2026-01-02' WHERE id='{step}';")
    reject(p,'executed step preserved even after prepare')
    t=treatment(); p=prepare('treatment',t); step=p['snapshot']['steps'][0]['id']
    sql(f"INSERT INTO hato_alertas VALUES(gen_random_uuid(),'{ANIMAL}','{step}','tratamiento_paso','pendiente',NULL,NULL,NULL);")
    sql("INSERT INTO hato_alertas_envios SELECT id,'123',77 FROM hato_alertas;")
    reject(p,'linked reminder and send history preserved')
    sql('DELETE FROM hato_alertas_envios; DELETE FROM hato_alertas;')
    sql(f"INSERT INTO synthetic_step_reference VALUES(gen_random_uuid(),'{step}');")
    reject(p,'unknown cascade step reference preserved')
    sql('DELETE FROM synthetic_step_reference;')
    receipt=mutate(p)
    verify(len(receipt['before']['steps'])==2 and receipt['after']['steps']==[], 'complete exact treatment cascade audit')
    verify(sql("SELECT count(*) FROM hato_undo.audit WHERE before_snapshot IS NULL OR after_snapshot IS NULL;")=='0','all audits contain exact affected before/after snapshots')
    extra_faults()
    races()
    sql('REVOKE ALL ON FUNCTION public.fn_hato_undo(bigint,uuid,jsonb),public.fn_hato_undo_resolve(bigint,uuid,jsonb) FROM service_role;')
    review_tests()



def extra_faults():
    p=prepare('event',event())
    for table,body in [
        ('hato_undo.audit', "NEW.before_snapshot:='{}'::jsonb; RETURN NEW;"),
        ('hato_undo.requests', "NEW.payload:='{}'::jsonb; RETURN NEW;"),
    ]:
        fault(table,'BEFORE','INSERT',body)
        reject(p,f'corrupted {table} insert rolls back exact domain/audit')
        clear_fault(table)
    for table in ('public.hato_tratamientos','public.hato_tratamiento_pasos'):
        p=prepare('treatment',treatment())
        unrelated=treatment(0)
        fault(table,'AFTER','DELETE',f"UPDATE public.hato_tratamientos SET nota='unexpected' WHERE id='{unrelated}'; RETURN OLD;")
        reject(p,f'AFTER {table} unexpected protected mutation rollback')
        clear_fault(table)
    p=prepare('event',event())
    fault('hato_undo.requests','BEFORE','INSERT')
    reject(p,'suppressed cancellation cannot claim a durable fence',resolve=True)
    clear_fault('hato_undo.requests')
    key=str(uuid.uuid4()); receipt=mutate(p,key)
    sql('UPDATE usuarios SET activo=false;')
    reject(p,'committed replay reauthorizes current Gerencia',key=key)
    reject(p,'committed status reauthorizes current Gerencia',key=key,resolve=True)
    sql('UPDATE usuarios SET activo=true;')
    sql(f"UPDATE hato_undo.audit SET receipt='{{}}'::jsonb WHERE request_key='{key}';")
    reject(p,'damaged audit refuses replay',key=key)
    reject(p,'damaged audit refuses committed resolution',key=key,resolve=True)
    sql(f"UPDATE hato_undo.audit SET receipt={lit(json.dumps(receipt))}::jsonb WHERE request_key='{key}';")
    sql(f"UPDATE hato_undo.audit SET before_snapshot='{{}}'::jsonb WHERE request_key='{key}';")
    reject(p,'damaged minimized snapshot refuses replay',key=key)
    reject(p,'damaged minimized snapshot refuses resolution',key=key,resolve=True)
    sql(f"UPDATE hato_undo.audit SET before_snapshot={lit(json.dumps(p['snapshot']))}::jsonb WHERE request_key='{key}';")
    for role in ('anon','authenticated','service_role'):
        for table in ('hato_undo.requests','hato_undo.audit'):
            sql(f'SET ROLE {role}; SELECT * FROM {table};',ok=False)
            sql(f"SET ROLE {role}; DELETE FROM {table};",ok=False)
            verify(True,f'{role} cannot read/delete protected {table}')


def hold_sql(source):
    return sql("SET application_name='hato_undo_hold'; " + source)


def wait_held():
    # Observe the transaction AFTER its mutation/lock is held, rather than infer
    # scheduling from an arbitrary sleep in the test runner.
    for _ in range(40):
        if sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='hato_undo_hold' AND wait_event='PgSleep';")=='1':
            return
        time.sleep(0.05)
    raise AssertionError('Concurrent fixture transaction never reached lock-holding barrier')


def races():
    t=treatment(); proof=prepare('treatment',t); step=proof['snapshot']['steps'][0]['id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        confirm=pool.submit(hold_sql,f"BEGIN; SET LOCAL ROLE service_role; SELECT fn_hato_confirmar_paso_tratamiento('{ANIMAL}','{step}','2026-01-02','Synthetic'); SELECT pg_sleep(2); COMMIT;")
        wait_held()
        undo=pool.submit(mutate,proof,ok=False)
        confirm.result(); undo.result()
    verify(sql(f"SELECT fecha_ejecutada FROM hato_tratamiento_pasos WHERE id='{step}';")=='2026-01-02','actual historical177 wins race: executed step retained')
    p=prepare('event',event()); key=str(uuid.uuid4())
    body=f"BEGIN; SET LOCAL ROLE service_role; SELECT fn_hato_undo(123,'{key}',{lit(json.dumps(p))}::jsonb); SELECT pg_sleep(2); COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        original=pool.submit(hold_sql,body); wait_held()
        status=pool.submit(mutate,p,key,resolve=True)
        committed=json.loads(original.result().splitlines()[0]); resolved=status.result()
    verify(resolved['receipt']==committed,'status waits on same request lock and observes committed undo')
    p=prepare('event',event()); target=p['target_id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        writer=pool.submit(hold_sql,f"BEGIN; INSERT INTO synthetic_event_reference VALUES(gen_random_uuid(),'{target}','racing'); SELECT pg_sleep(2); COMMIT;")
        wait_held(); undo=pool.submit(mutate,p,ok=False)
        writer.result(); undo.result()
    verify(sql(f"SELECT count(*) FROM hato_eventos WHERE id='{target}';")=='1','incoming FK race locks/readback retain referenced event')
    p=prepare('event',event())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        revoke=pool.submit(hold_sql,"BEGIN; UPDATE usuarios SET activo=false; SELECT pg_sleep(2); COMMIT;")
        wait_held(); undo=pool.submit(mutate,p,ok=False)
        revoke.result(); undo.result()
    verify(sql(f"SELECT count(*) FROM hato_eventos WHERE id='{p['target_id']}';")=='1','current profile revocation wins and target preserved')
    sql('UPDATE usuarios SET activo=true;')
    p=prepare('event',event()); key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _: mutate(p,key),range(2)))
    verify(results[0]==results[1] and sql(f"SELECT count(*) FROM hato_undo.audit WHERE request_key='{key}';")=='1',
           'concurrent same-key posts share one exact audit receipt')
    p=prepare('event',event())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _: docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],
                              f"SET ROLE service_role; SELECT fn_hato_undo(123,'{uuid.uuid4()}',{lit(json.dumps(p))}::jsonb);",False),range(2)))
    verify(sorted(r.returncode for r in results)==[0,3] and sql(f"SELECT count(*) FROM hato_undo.audit WHERE target_id='{p['target_id']}';")=='1',
           'competing fresh keys permit exactly one target mutation')
    p=prepare('event',event()); key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        cancel=pool.submit(hold_sql,f"BEGIN; SET LOCAL ROLE service_role; SELECT fn_hato_undo_resolve(123,'{key}',{lit(json.dumps(p))}::jsonb); SELECT pg_sleep(2); COMMIT;")
        wait_held(); late=pool.submit(mutate,p,key,ok=False)
        cancel.result(); late.result()
    verify(sql(f"SELECT count(*) FROM hato_eventos WHERE id='{p['target_id']}';")=='1','cancellation winning request lock fences concurrent late post')
    p=prepare('event',event())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        revoke=pool.submit(hold_sql,"BEGIN; UPDATE telegram_usuarios SET activo=false; SELECT pg_sleep(2); COMMIT;")
        wait_held(); undo=pool.submit(mutate,p,ok=False)
        revoke.result(); undo.result()
    verify(sql(f"SELECT count(*) FROM hato_eventos WHERE id='{p['target_id']}';")=='1','binding revocation wins and target preserved')
    sql('UPDATE telegram_usuarios SET activo=true;')
    p=prepare('treatment',treatment()); step=p['snapshot']['steps'][0]['id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        undo=pool.submit(hold_sql,f"BEGIN; SET LOCAL ROLE service_role; SELECT fn_hato_undo(123,'{uuid.uuid4()}',{lit(json.dumps(p))}::jsonb); SELECT pg_sleep(2); COMMIT;")
        wait_held()
        confirm=pool.submit(call,'fn_hato_confirmar_paso_tratamiento',f"'{ANIMAL}','{step}','2026-01-02','Synthetic'",ok=False)
        undo.result(); confirm.result()
    verify(sql(f"SELECT count(*) FROM hato_tratamientos WHERE id='{p['target_id']}';")=='0','undo wins historical177 race and late confirmation refuses')
    p=prepare('treatment',treatment()); step=p['snapshot']['steps'][0]['id']
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        writer=pool.submit(hold_sql,f"BEGIN; UPDATE hato_tratamiento_pasos SET fecha_ejecutada='2026-01-02' WHERE id='{step}'; SELECT pg_sleep(2); COMMIT;")
        wait_held(); undo=pool.submit(mutate,p,ok=False)
        writer.result(); undo.result()
    verify(sql(f"SELECT fecha_ejecutada FROM hato_tratamiento_pasos WHERE id='{step}';")=='2026-01-02','coarse locks fence direct non-header step writer in fixture')


def review_begin(target,op='event',sender=123,role='service_role',ok=True):
    return call('fn_hato_undo_review_begin',f"{sender},{lit(op)},{lit(target)}::uuid",role,ok)


def review_action(review,action='confirm',message=77,chat=123,sender=123,op=None,ok=True,status=False,fresh=False):
    name='fn_hato_undo_review_new' if fresh else 'fn_hato_undo_review_status' if status else 'fn_hato_undo_review_action'
    args=f"{sender},{lit(op or review['payload']['operation'])},{lit(review['key'])}::uuid,{chat},{message}"
    if not status and not fresh: args+=f",{lit(action)}"
    return call(name,args,ok=ok)


def delivered(review,message=77,chat=123,sender=123,ok=True,complete=True):
    return call('fn_hato_undo_review_deliver',f"{sender},{lit(review['payload']['operation'])},{lit(review['key'])}::uuid,{chat},{message},{str(complete).lower()}",ok=ok)


def review_tests():
    target=event(); a=review_begin(target)
    verify(a['state']=='pending' and a['payload']['target_id']==target and a['receipt'] is None,'server atomically owns durable original key/proof')
    verify(review_begin(target)==a,'lost begin response and restarted worker recover original review')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        recovered=list(pool.map(lambda _:review_begin(target),range(2)))
    verify(recovered==[a,a],'concurrent begin cannot overwrite proof or replace key')
    for role in ('anon','authenticated'):
        review_begin(target,role=role,ok=False)
        verify(True,f'{role} cannot register impersonated review')
    before=state(); review_action(a,ok=False)
    verify(state()==before,'no destructive action before complete private delivery registered')
    before=state(); delivered(a,chat=999,ok=False)
    verify(state()==before,'delivery refuses non-owner private chat')
    verify(delivered(a)==a,'complete delivered control message durably bound')
    for args in [dict(chat=999),dict(message=999),dict(sender=999),dict(op='treatment')]:
        before=state(); review_action(a,ok=False,**args)
        verify(state()==before,f'forwarded/wrong owner/message/operation action refused {args}')
    before=state(); result=review_action(a,status=True)
    verify(result==a and state()==before,'status is read-only and cannot cancel absent request')
    unknown={**a,'key':str(uuid.uuid4())}
    before=state(); review_action(unknown,status=True,ok=False)
    verify(state()==before,'unknown status cannot create a cancellation fence')
    done=review_action(a)
    verify(done['state']=='committed' and done['receipt']['before']==a['payload']['snapshot'],'confirmed delivery atomically commits exact original receipt')
    verify(review_action(a)==done and review_action(a,status=True)==done and review_begin(target)==done,'failed Telegram edit/restarted worker recover committed original receipt')
    verify(review_action(a,action='cancel')==done,'cancel after confirm returns original committed receipt')
    a=review_begin(event()); delivered(a)
    cancelled=review_action(a,action='cancel')
    verify(cancelled['state']=='cancelled' and review_begin(a['payload']['target_id'])==cancelled,'explicit cancellation retained; original target never auto-rebases')
    before=state(); review_action(a,ok=False)
    verify(state()==before,'late confirm fenced under original cancelled key')
    new=review_action(a,fresh=True)
    verify(new['key']!=a['key'] and new['state']=='pending' and review_action(a,fresh=True)==new,'explicit fresh review registers one new proof/key idempotently')
    before=state(); review_action(new,ok=False)
    verify(state()==before,'new review needs its own complete DM delivery')
    delivered(new,message=88); review_action(new,message=88)
    a=review_begin(event()); delivered(a)
    sql(f"UPDATE hato_eventos SET datos='{{\"edited\":true}}' WHERE id='{a['payload']['target_id']}';")
    before=state(); review_action(a,ok=False)
    verify(state()==before and review_begin(a['payload']['target_id'])==a,'stale clinical target refuses and never rebases frozen review')
    for table,action in [('hato_undo.attempts','INSERT'),('hato_undo.deliveries','INSERT'),('hato_undo.attempts','UPDATE')]:
        target=event()
        if action=='INSERT' and table.endswith('attempts'):
            fault(table,'BEFORE',action); before=state(); review_begin(target,ok=False)
        else:
            a=review_begin(target)
            if action=='UPDATE': delivered(a)
            fault(table,'BEFORE',action); before=state()
            if action=='UPDATE':review_action(a,ok=False)
            else:delivered(a,ok=False)
        verify(state()==before,f'suppressed durable {table} {action} rolls back')
        clear_fault(table)
    a=review_begin(event()); delivered(a)
    fault('hato_undo.attempts','AFTER','UPDATE',f"UPDATE hato_eventos SET tipo='aborto' WHERE id='{target}'; RETURN NEW;")
    before=state();review_action(a,ok=False)
    verify(state()==before,'durable outcome AFTER trigger cannot add protected domain mutation')
    clear_fault('hato_undo.attempts')
    a=review_begin(event()); delivered(a,complete=False)
    before=state();review_action(a,ok=False)
    verify(state()==before,'cancellation-only review control cannot be forged into destructive confirmation')
    verify(review_action(a,status=True)==a,'cancellation-only status remains read-only')
    cancelled=review_action(a,action='cancel')
    verify(cancelled['state']=='cancelled','cancellation-only review can durably cancel original attempt')
    verify(review_action(a,fresh=True)['key']!=a['key'],'cancelled incomplete review permits only explicit new review')
    a=review_begin(event()); delivered(a)
    sql("UPDATE hato_animales SET numero=158;")
    before=state();review_action(a,ok=False)
    verify(state()==before,'changed animal display identity refuses original clinical review')
    sql("UPDATE hato_animales SET numero=157;")
    for change,restore in [("UPDATE usuarios SET rol='Administrador';","UPDATE usuarios SET rol='Gerencia';"),
                           ('UPDATE telegram_usuarios SET activo=false;','UPDATE telegram_usuarios SET activo=true;')]:
        sql(change);before=state();review_action(a,ok=False);review_action(a,status=True,ok=False)
        verify(state()==before,'current revoked role/binding refuses review confirmation and status')
        sql(restore)
    before=state();review_action(a,fresh=True,ok=False)
    verify(state()==before,'pending review cannot request a replacement key')
    for table in ('hato_undo.attempts','hato_undo.deliveries'):
        target=event();other=event()
        if table.endswith('deliveries'):a=review_begin(target)
        fault(table,'AFTER','INSERT',f"UPDATE hato_eventos SET tipo='aborto' WHERE id='{other}'; RETURN NEW;")
        before=state()
        if table.endswith('attempts'):review_begin(target,ok=False)
        else:delivered(a,ok=False)
        verify(state()==before,f'{table} registration AFTER trigger cannot mutate clinical footprint')
        clear_fault(table)
    a=review_begin(event());delivered(a,complete=False)
    before=state();delivered(a,complete=True,ok=False)
    verify(state()==before,'cancellation-only message cannot be upgraded by conflicting registration')
    a=review_begin(event());delivered(a)
    body=f"BEGIN; SET ROLE service_role; SELECT fn_hato_undo_review_action(123,'event','{a['key']}',123,77,'confirm'); SELECT pg_sleep(2); COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first=pool.submit(hold_sql,body);wait_held();second=pool.submit(review_action,a,action='cancel')
        committed=json.loads(first.result().splitlines()[0]);cancel=second.result()
    verify(cancel==committed and cancel['state']=='committed','confirmation winning durable fence makes racing cancel return original receipt')
    a=review_begin(event());delivered(a)
    body=f"BEGIN; SET ROLE service_role; SELECT fn_hato_undo_review_action(123,'event','{a['key']}',123,77,'cancel'); SELECT pg_sleep(2); COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first=pool.submit(hold_sql,body);wait_held();second=pool.submit(review_action,a,ok=False)
        first.result();second.result()
    verify(review_action(a,status=True)['state']=='cancelled','cancellation winning durable fence blocks racing confirmation')
    a=review_begin(event());delivered(a);done=review_action(a)
    sql(f"UPDATE hato_undo.requests SET result='{{}}'::jsonb WHERE request_key='{a['key']}';")
    before=state();review_action(a,status=True,ok=False)
    verify(state()==before,'committed review status refuses corrupted underlying request receipt')
    sql(f"UPDATE hato_undo.requests SET result={lit(json.dumps(done['receipt']))}::jsonb WHERE request_key='{a['key']}';")
    for table in ('hato_undo.attempts','hato_undo.deliveries'):
        for role in ('anon','authenticated','service_role'):
            sql(f'SET ROLE {role}; SELECT * FROM {table};',ok=False)
            sql(f'SET ROLE {role}; DELETE FROM {table};',ok=False)
            verify(True,f'{role} cannot read/delete protected {table}')


def main():
    global CONTAINER
    docker(['info','--format','{{.ServerVersion}}'])
    CONTAINER=docker(['run','-d','--pull=never','--network=none','--read-only',
        '--tmpfs','/var/lib/postgresql/data:rw,size=512m','--tmpfs','/var/run/postgresql:rw,size=16m',
        '--tmpfs','/tmp:rw,size=16m','--memory=768m','--cpus=2','--security-opt=no-new-privileges',
        '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE]).stdout.strip()
    completed=False
    try:
        inspection=json.loads(docker(['inspect','--format','{{json .HostConfig}}',CONTAINER]).stdout)
        verify(inspection['NetworkMode']=='none' and not inspection['Binds'] and not inspection['PortBindings'],'isolated fixture: no network/binds/ports')
        for _ in range(120):
            ready=docker(['exec','-u','postgres',CONTAINER,'pg_isready'],check=False)
            initialized='PostgreSQL init process complete; ready for start up.' in docker(['logs',CONTAINER]).stdout
            if initialized and not ready.returncode:
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Local PostgreSQL startup failed')
        tests(); completed=True
    finally:
        docker(['rm','-f','-v',CONTAINER])
        verify(docker(['inspect',CONTAINER],check=False).returncode!=0,'synthetic container/tmpfs removed')
    if completed:
        print(f'{CHECKS} local synthetic assertions passed; NOT production schema parity.',flush=True)


if __name__=='__main__':
    main()
