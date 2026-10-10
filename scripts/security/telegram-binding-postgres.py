#!/usr/bin/env python3
"""Service-only atomic Telegram binding tests against synthetic isolated PostgreSQL17.6."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
ENV = os.environ.copy()
for key in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'):
    ENV.pop(key, None)
DOCKER = ['docker','--host=unix:///var/run/docker.sock']
CONTAINER = None
CHECKS = 0
PROFILE = str(uuid.uuid4())
REGISTRATION = str(uuid.uuid4())
CODE = 'CODE0001'
SENDER = 1234567


def docker(args, data=None, check=True):
    return subprocess.run(DOCKER+args, input=data, text=True, capture_output=True,
                          env=ENV, check=check, timeout=60)


def sql(source, ok=True):
    result = docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],source,False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and result.returncode == 0:
        raise AssertionError('Expected SQL rejection, got success')
    return result.stdout.strip() if ok else result.stderr


def literal(value):
    return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"


def verify(condition, label):
    global CHECKS
    if not condition:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS',label,flush=True)


def call(code=CODE, sender=SENDER, username='synthetic', role='service_role', ok=True):
    result = sql(f"BEGIN; SET LOCAL ROLE {role}; SELECT public.telegram_consume_binding_code({literal(code)},"
                 f"{literal(sender)}::bigint,{literal(username)}); COMMIT;",ok)
    return json.loads(result) if ok else result


def state():
    return sql("SELECT jsonb_build_array((SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.telegram_usuarios t),"
               "(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]') FROM public.usuarios u))::text;")


def reset(linked=True):
    sql(f"TRUNCATE public.telegram_usuarios; DELETE FROM public.usuarios; DELETE FROM auth.users; "
        f"INSERT INTO auth.users VALUES('{PROFILE}'); INSERT INTO public.usuarios VALUES('{PROFILE}','Gerencia',true); "
        f"INSERT INTO public.telegram_usuarios(id,usuario_id,nombre_display,rol_bot,modulos_permitidos,codigo_vinculacion,codigo_expira_at) "
        f"VALUES('{REGISTRATION}',{literal(PROFILE if linked else None)},'Synthetic configured worker','campo',ARRAY['labores'],'{CODE}',clock_timestamp()+interval '1 day');")


def failure(label, **kwargs):
    before = state()
    error = call(ok=False,**kwargs)
    if any(text in error for text in ('syntax error','ambiguous','is not assigned yet')):
        raise AssertionError(error)
    verify(state() == before,label)
    return error


def fault(event, body):
    sql(f"CREATE FUNCTION public.synthetic_binding_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {body} END $$; "
        f"CREATE TRIGGER synthetic_binding_fault {event} ON public.telegram_usuarios FOR EACH ROW EXECUTE FUNCTION public.synthetic_binding_fault();")


def remove_fault():
    sql('DROP TRIGGER synthetic_binding_fault ON public.telegram_usuarios; DROP FUNCTION public.synthetic_binding_fault();')


# Shapes and constraints were verified in private catalog captures on 2026-10-10.
# auth.users/empleados/contratistas and timestamp trigger are explicitly synthetic supporting fixtures.
FIXTURE = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TYPE public.rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');
CREATE TABLE public.usuarios(id uuid PRIMARY KEY REFERENCES auth.users,rol public.rol_usuario,activo boolean);
CREATE TABLE public.empleados(id uuid PRIMARY KEY); CREATE TABLE public.contratistas(id uuid PRIMARY KEY);
CREATE TABLE public.telegram_usuarios(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint UNIQUE,telegram_username text,
 usuario_id uuid REFERENCES auth.users,empleado_id uuid REFERENCES public.empleados,contratista_id uuid REFERENCES public.contratistas,
 nombre_display text NOT NULL,rol_bot text NOT NULL DEFAULT 'campo' CHECK(rol_bot IN ('campo','admin','gerencia','monitor')),
 modulos_permitidos text[] DEFAULT '{labores}',codigo_vinculacion text,codigo_expira_at timestamptz,
 activo boolean DEFAULT true,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE INDEX idx_telegram_usuarios_codigo_vinculacion ON public.telegram_usuarios(codigo_vinculacion) WHERE codigo_vinculacion IS NOT NULL;
CREATE INDEX idx_telegram_usuarios_telegram_id ON public.telegram_usuarios(telegram_id);
CREATE FUNCTION public.synthetic_binding_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER synthetic_binding_updated_at BEFORE UPDATE ON public.telegram_usuarios
 FOR EACH ROW EXECUTE FUNCTION public.synthetic_binding_updated_at();
ALTER TABLE public.telegram_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
"""


def tests():
    verify(sql('SHOW server_version;').startswith('17.6'),'pinned PostgreSQL17.6')
    sql(FIXTURE)
    sql((ROOT/'src/sql/security-candidates/telegram-binding.sql').read_text())
    for role in ('anon','authenticated'):
        reset()
        error = failure(f'{role} cannot execute service-only binding RPC',role=role)
        verify('permission denied for function' in error,f'{role} fails at function ACL before mutation')
    reset()
    verify(sql("SELECT has_function_privilege('service_role','public.telegram_consume_binding_code(text,bigint,text)','EXECUTE');")=='t',
           'only intended service caller has ordinary-role execute')
    for sender in (None,0,-1,9007199254740992):
        failure(f'invalid sender {sender} rejected atomically',sender=sender)
    for code in (None,'','CODE001','CODE00001','code0001','CODE000!'):
        failure(f'invalid code {code} rejected atomically',code=code)
    failure('oversized username rejected atomically',username='x'*65)
    for expiration in ('NULL', "clock_timestamp()-interval '1 second'", "'infinity'::timestamptz", "'-infinity'::timestamptz"):
        reset(); sql(f'UPDATE public.telegram_usuarios SET codigo_expira_at={expiration};')
        failure(f'expiry {expiration} refuses without consuming code')
    for active in ('false','NULL'):
        reset(); sql(f'UPDATE public.telegram_usuarios SET activo={active};')
        failure(f'inactive registration {active} never auto-reactivates')
        reset(); sql(f'UPDATE public.usuarios SET activo={active};')
        failure(f'inactive linked profile {active} refuses binding')
    reset(); sql('DELETE FROM public.usuarios;')
    failure('auth.users FK alone cannot stand in for missing application profile')
    reset(); sql('UPDATE public.usuarios SET rol=NULL;')
    failure('missing linked application role refuses binding')
    reset(); sql(f"UPDATE public.telegram_usuarios SET codigo_vinculacion='NEWCODE1';")
    failure('manager-issued code rotation revokes previous code atomically')
    reset(); sql(f"INSERT INTO public.telegram_usuarios(nombre_display,codigo_vinculacion,codigo_expira_at) VALUES('Synthetic duplicate','{CODE}',clock_timestamp()+interval '1 day');")
    failure('nonunique code index ambiguity consumes neither registration')
    reset(); sql(f"INSERT INTO public.telegram_usuarios(nombre_display,telegram_id) VALUES('Synthetic sender already linked',{SENDER});")
    failure('existing unique sender registration cannot be taken over by another code')
    reset(); sql(f'UPDATE public.telegram_usuarios SET telegram_id={SENDER+1};')
    failure('already-bound target cannot be rebound despite a residual code')
    for event, body, label in [
        ('BEFORE UPDATE','RETURN NULL;','suppressed UPDATE refuses and retains code'),
        ('BEFORE UPDATE','NEW.rol_bot:=\'gerencia\'; RETURN NEW;','BEFORE role escalation rolls back'),
        ('BEFORE UPDATE','NEW.telegram_id:=NEW.telegram_id+1; RETURN NEW;','BEFORE altered sender rolls back'),
        ('AFTER UPDATE',"UPDATE public.telegram_usuarios SET modulos_permitidos=ARRAY['consultas'] WHERE id=NEW.id; RETURN NEW;",'AFTER module mutation rolls back'),
        ('AFTER UPDATE',"UPDATE public.usuarios SET activo=false WHERE id=NEW.usuario_id; RETURN NEW;",'AFTER profile deactivation rolls back'),
        ('AFTER UPDATE',"DELETE FROM public.telegram_usuarios WHERE id=NEW.id; RETURN NEW;",'AFTER registration deletion rolls back'),
    ]:
        reset()
        # Bound AFTER mutations against recursion; the nested UPDATE skips this trigger.
        if event == 'AFTER UPDATE' and 'UPDATE public.telegram_usuarios' in body:
            body = 'IF pg_trigger_depth()>1 THEN RETURN NEW; END IF; '+body
        fault(event,body); failure(label); remove_fault()
    reset(); sql("UPDATE public.telegram_usuarios SET codigo_expira_at=clock_timestamp()+interval '1 second';")
    fault('BEFORE UPDATE','PERFORM pg_sleep(1.1); RETURN NEW;')
    failure('expiry during delayed trigger cannot produce a successful consumed binding'); remove_fault()
    reset(False)
    result = call()
    verify(result['registration']['usuario_id'] is None and result['linked_profile'] is None,'existing unlinked configured worker lane binds successfully')
    verify(result['registration']['activo'] and result['registration']['rol_bot']=='campo' and result['registration']['modulos_permitidos']==['labores'],
           'binding preserves configured role/modules and does not need reactivation')
    failure('same-sender consumed code replay performs no write')
    failure('different-sender consumed code replay performs no write',sender=SENDER+1)
    reset(); sql("UPDATE public.usuarios SET rol='Verificador'; UPDATE public.telegram_usuarios SET rol_bot='gerencia';")
    result=call()
    verify(result['linked_profile']['rol']=='Verificador' and result['registration']['rol_bot']=='gerencia',
           'current linked app role returned separately; cached bot role never becomes profile authority')
    verify(result['registration']['codigo_vinculacion'] is None and result['registration']['codigo_expira_at'] is None,
           'confirmed binding atomically clears both one-use code fields')
    for same_sender in (True,False):
        reset()
        # Return raw status so one expected refusal does not hide unexpected SQL faults.
        def concurrent_call(sender):
            return docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],
                f"BEGIN; SET LOCAL ROLE service_role; SELECT public.telegram_consume_binding_code('{CODE}',{sender},'synthetic'); COMMIT;",False)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=list(pool.map(concurrent_call,[SENDER,SENDER if same_sender else SENDER+1]))
        verify(sum(outcome.returncode==0 for outcome in outcomes)==1,f'concurrent same-code requests have exactly one success, same_sender={same_sender}')
        verify(all(outcome.returncode==0 or 'Binding code unavailable' in outcome.stderr for outcome in outcomes),
               f'losing concurrent request refuses by code state, same_sender={same_sender}')
        verify(sql('SELECT count(*)=1 AND bool_and(codigo_vinculacion IS NULL) FROM public.telegram_usuarios;')=='t',
               f'concurrent requests leave one consumed registration only, same_sender={same_sender}')
    reset()
    # A revocation transaction that owns the profile lock before the bind query
    # must commit inactive state before the blocked FOR SHARE admission resumes.
    command = f"BEGIN; UPDATE public.usuarios SET activo=false WHERE id='{PROFILE}'; SELECT pg_advisory_xact_lock(784041); SELECT pg_sleep(2); COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        revoke=pool.submit(sql,command)
        deadline=time.monotonic()+5
        while sql("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=784041 AND granted);") != 't':
            if revoke.done() or time.monotonic()>deadline:
                raise AssertionError('Revocation profile-lock barrier was not observed')
            time.sleep(0.02)
        bind=pool.submit(call,ok=False)
        revoke.result(); error=bind.result()
    verify('Current linked application profile required' in error,'concurrent linked-profile revocation wins before admission')
    verify(sql('SELECT telegram_id IS NULL AND codigo_vinculacion IS NOT NULL FROM public.telegram_usuarios;')=='t',
           'revocation race preserves unused code and does not link sender')


def main():
    global CONTAINER
    docker(['info','--format','{{.ServerVersion}}'])
    CONTAINER='escociaos-telegram-binding-'+uuid.uuid4().hex
    try:
        docker(['run','-d','--name',CONTAINER,'--pull=never','--network=none','--read-only',
            '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m',
            '--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=2','--security-opt=no-new-privileges',
            '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE])
        config=json.loads(docker(['inspect','--format','{{json .HostConfig}}',CONTAINER]).stdout)
        verify(config['NetworkMode']=='none' and not config['Binds'] and not config['PortBindings'],'network none, no bind mounts or ports')
        for _ in range(120):
            process=docker(['exec',CONTAINER,'cat','/proc/1/comm'],check=False)
            if process.stdout.strip()=='postgres' and docker(['exec','-u','postgres',CONTAINER,'pg_isready'],check=False).returncode==0:
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Synthetic PostgreSQL startup failed')
        tests()
        print(f'{CHECKS} synthetic assertions passed; no production calls or deployment.',flush=True)
    finally:
        docker(['rm','-f','-v',CONTAINER],check=False)
        verify(docker(['inspect',CONTAINER],check=False).returncode!=0,'container/tmpfs cleanup verified')


if __name__=='__main__':
    main()
