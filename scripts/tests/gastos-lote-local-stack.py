"""Ephemeral real Auth/PostgREST validation for exact187 and the PR362 candidate.

Official images, network-none shared loopback namespace, tmpfs Postgres, no host
settings, no hosted target/config/credential lookup. Synthetic credentials remain
in process memory and stdin/env files in a TemporaryDirectory; never printed.
"""
import base64
import concurrent.futures
import hashlib
import hmac
import http.client
import io
import json
import os
import pathlib
import secrets
import subprocess
import tempfile
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[2]
PG_IMAGE = 'postgres:17-alpine'
AUTH_IMAGE = 'supabase/gotrue:v2.197.0'
REST_IMAGE = 'postgrest/postgrest:v14.18'
MIGRATION_SHA = '6bf56111bfea8d8f4fb4e45ddea6291a295c0b7bf200346b9b6de77bb557a1af'
CAT = '10000000-0000-4000-8000-000000000001'
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']


class RawSocket:
    def __init__(self, data):
        self.data = data

    def makefile(self, *_args, **_kwargs):
        return self.data if hasattr(self.data,'read') else io.BytesIO(self.data)


class LocalStack:
    def __init__(self):
        self.name = 'escocia-expense-local-' + uuid.uuid4().hex[:10]
        self.pg = self.name + '-pg'
        self.auth = self.name + '-auth'
        self.rest = self.name + '-rest'
        self.created = []
        self.temp = tempfile.TemporaryDirectory(prefix='escocia-expense-local-')
        self.secret = secrets.token_urlsafe(48)
        self.password = secrets.token_urlsafe(24)
        self.dbpassword = secrets.token_urlsafe(24)
        self.passed = 0
        self.users = {}
        self.lock = threading.Lock()
        self.requests = []
        self.drop = None
        self.release = threading.Event()
        self.server = None

    def docker(self, *args, input=None, check=True, timeout=45):
        result = subprocess.run(DOCKER + list(args), input=input, text=True,
                                capture_output=True, timeout=timeout)
        if check and result.returncode:
            # Do not dump command arguments/environment, which may contain fixture secrets.
            raise RuntimeError('Docker operation failed: ' + result.stderr[-2000:])
        return result

    def sql(self, query, success=True):
        r = self.docker('exec', '-i', self.pg, 'psql', '-U', 'postgres', '-X',
                        '-qAt', '-v', 'ON_ERROR_STOP=1', input=query, check=False)
        if success and r.returncode:
            raise AssertionError(r.stderr[-2000:])
        if not success:
            assert r.returncode != 0, 'Expected SQL rollback'
        return r.stdout.strip()

    def jwt(self, role):
        def encode(v):
            return base64.urlsafe_b64encode(json.dumps(v, separators=(',', ':')).encode()).decode().rstrip('=')
        content = encode({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encode({
            'iss': self.url + '/auth/v1', 'role': role, 'iat': int(time.time()),
            'exp': int(time.time()) + 3600,
        })
        signature = base64.urlsafe_b64encode(hmac.new(self.secret.encode(), content.encode(), hashlib.sha256).digest()).decode().rstrip('=')
        return content + '.' + signature

    def envfile(self, name, env):
        path = pathlib.Path(self.temp.name) / name
        path.write_text(''.join(f'{k}={v}\n' for k, v in env.items()))
        path.chmod(0o600)
        return str(path)

    def start_container(self, name, image, env, command=None, pg=False):
        args = ['run', '--pull=never', '-d', '--name', name]
        if pg:
            args += ['--network=none', '--tmpfs', '/var/lib/postgresql/data']
        else:
            args += ['--network=container:' + self.pg]
        args += ['--env-file', self.envfile(name + '.env', env), image]
        args += command or []
        self.docker(*args)
        self.created.append(name)

    def wire(self, port, method, path, body=None, headers=None):
        payload = b'' if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        hs = {'Host': f'127.0.0.1:{port}', 'Connection': 'close', 'Content-Type': 'application/json',
              'Content-Length': str(len(payload))}
        hs.update(headers or {})
        request = f'{method} {path} HTTP/1.1\r\n' + ''.join(f'{k}: {v}\r\n' for k, v in hs.items()) + '\r\n'
        # nc and both official servers share the PG network-none loopback namespace.
        process = subprocess.Popen(DOCKER + ['exec', '-i', self.pg, 'nc', '-w', '30', '127.0.0.1', str(port)],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            # Keep stdin open until the complete HTTP response is read. Closing it
            # early makes busybox nc cancel the HTTP request/GoTrue DB context.
            process.stdin.write(request.encode() + payload)
            process.stdin.flush()
            response = http.client.HTTPResponse(RawSocket(process.stdout))
            response.begin()
            data = response.read()
            return response.status, dict(response.getheaders()), data
        finally:
            try: process.stdin.close()
            except BrokenPipeError: pass
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
            process.stdout.close(); process.stderr.close()

    def api(self, target, path, body=None, token=None, method='POST'):
        headers = {}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        status, _, data = self.wire(9999 if target == 'auth' else 3000, method, path, body, headers)
        return status, json.loads(data) if data else None

    def check(self, message):
        self.passed += 1
        print('PASS', message, flush=True)

    def start(self):
        for image in [PG_IMAGE, AUTH_IMAGE, REST_IMAGE]:
            self.docker('image', 'inspect', image, '--format', '{{.Id}}')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), self.handler())
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.start_container(self.pg, PG_IMAGE, {'POSTGRES_HOST_AUTH_METHOD': 'trust'}, pg=True)
        for _ in range(100):
            ready = self.docker('exec', self.pg, 'pg_isready', '-U', 'postgres', check=False)
            logs = self.docker('logs', self.pg).stdout
            if ready.returncode == 0 and 'PostgreSQL init process complete' in logs:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('Local PostgreSQL did not initialize')
        self.sql(f"""
          CREATE ROLE anon NOLOGIN;
          CREATE ROLE authenticated NOLOGIN;
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
          CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '{self.dbpassword}';
          GRANT anon,authenticated,service_role TO authenticator;
          CREATE ROLE supabase_auth_admin LOGIN NOINHERIT PASSWORD '{self.dbpassword}';
          CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
          ALTER ROLE supabase_auth_admin SET search_path=auth;
          GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
          CREATE EXTENSION IF NOT EXISTS pgcrypto;
        """)
        self.start_container(self.auth, AUTH_IMAGE, {
            'GOTRUE_API_HOST': '127.0.0.1', 'GOTRUE_API_PORT': '9999',
            'API_EXTERNAL_URL': self.url + '/auth/v1',
            'GOTRUE_DB_DRIVER': 'postgres',
            'GOTRUE_DB_DATABASE_URL': f'postgres://supabase_auth_admin:{self.dbpassword}@127.0.0.1:5432/postgres?sslmode=disable',
            'GOTRUE_DB_NAMESPACE': 'auth',
            'GOTRUE_SITE_URL': self.url,
            'GOTRUE_URI_ALLOW_LIST': 'http://127.0.0.1:*',
            'GOTRUE_DISABLE_SIGNUP': 'false',
            'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true',
            'GOTRUE_MAILER_AUTOCONFIRM': 'true',
            'GOTRUE_JWT_SECRET': self.secret,
            'GOTRUE_JWT_AUD': 'authenticated',
            'GOTRUE_JWT_ADMIN_ROLES': 'service_role',
            'GOTRUE_JWT_EXP': '3600',
            'GOTRUE_RATE_LIMIT_EMAIL_SENT': '1000',
            'GOTRUE_RATE_LIMIT_TOKEN_REFRESH': '1000',
        })
        for _ in range(100):
            try:
                status, _ = self.api('auth', '/health', method='GET')
                if status == 200:
                    break
            except Exception:
                pass
            time.sleep(.2)
        else:
            logs = self.docker('logs', self.auth, check=False)
            # Log tail is local fixture startup only, but avoid credential-bearing URLs.
            safe=(logs.stdout+logs.stderr).replace(self.secret,'[fixture-secret]').replace(self.dbpassword,'[fixture-db-password]').replace(self.password,'[fixture-password]')
            pathlib.Path('/tmp/expense-local-auth-startup.log').write_text(safe)
            print('Auth startup failed; sanitized log saved under /tmp/expense-local-auth-startup.log',flush=True)
            raise RuntimeError('Local Auth did not initialize; no host setting was changed')
        fixture = (ROOT / 'scripts/tests/gastos-lote-fixture.sql').read_text()
        # Real Auth owns auth.users and its schema; only adapt fixture bootstrap/claims.
        fixture = fixture[fixture.index('CREATE TYPE public.rol_usuario'):]
        fixture = fixture[:fixture.index('INSERT INTO auth.users(id)')]
        # Auth's real migrations supply auth.uid(); do not replace Auth-owned helpers.
        first = fixture.index('CREATE FUNCTION auth.uid()')
        last = fixture.index('CREATE FUNCTION public.get_user_role()')
        fixture = fixture[:first] + fixture[last:]
        fixture = fixture.replace('GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated, anon;',
                                  'GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;')
        self.sql(fixture + """
          ALTER TABLE public.usuarios ADD COLUMN nombre_completo text,
            ADD COLUMN email text, ADD COLUMN modulos_acceso text[] DEFAULT '{}',
            ADD COLUMN created_at timestamptz DEFAULT now();
          ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
          GRANT SELECT ON public.usuarios TO authenticated;
          CREATE POLICY profile_own ON public.usuarios FOR SELECT TO authenticated
            USING(id=auth.uid());
          ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            GRANT ALL ON TABLES TO anon,authenticated,service_role;
          ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
        """)
        migration = (ROOT / 'src/sql/migrations/187_fin_gastos_lote_reintentable.sql').read_bytes()
        assert hashlib.sha256(migration).hexdigest() == MIGRATION_SHA
        self.sql(migration.decode())
        self.start_container(self.rest, REST_IMAGE, {
            'PGRST_DB_URI': f'postgres://authenticator:{self.dbpassword}@127.0.0.1:5432/postgres?sslmode=disable',
            'PGRST_DB_SCHEMAS': 'public', 'PGRST_DB_ANON_ROLE': 'anon',
            'PGRST_SERVER_HOST': '127.0.0.1', 'PGRST_SERVER_PORT': '3000',
            'PGRST_JWT_SECRET': self.secret, 'PGRST_JWT_AUD': 'authenticated',
            'PGRST_DB_USE_LEGACY_GUCS': 'false',
        })
        for _ in range(100):
            try:
                status, _ = self.api('rest', '/', method='GET')
                if status == 200:
                    break
            except Exception:
                pass
            time.sleep(.2)
        else:
            raise RuntimeError('Local PostgREST did not initialize')
        for label, role, active in [('owner', 'Gerencia', True), ('other', 'Gerencia', True),
                                    ('admin', 'Administrador', True), ('inactive', 'Gerencia', False)]:
            email = label + '@expense-local.example.test'
            status, data = self.api('auth', '/admin/users', {
                'email': email, 'password': self.password, 'email_confirm': True, 'role': 'authenticated',
            }, self.jwt('service_role'))
            if status not in [200, 201]:
                logs=self.docker('logs',self.auth,check=False)
                safe=(logs.stdout+logs.stderr).replace(self.secret,'[fixture-secret]').replace(self.dbpassword,'[fixture-db-password]').replace(self.password,'[fixture-password]')
                pathlib.Path('/tmp/expense-local-auth-api.log').write_text(safe)
                raise AssertionError('Local Auth admin creation failed; sanitized log /tmp/expense-local-auth-api.log')
            user_id = data['id']
            self.sql(f"INSERT INTO usuarios(id,rol,activo,nombre_completo,email,modulos_acceso) VALUES('{user_id}','{role}',{str(active).lower()},'Synthetic {label}','{email}',ARRAY['finanzas']);")
            status, session = self.api('auth', '/token?grant_type=password', {'email': email, 'password': self.password})
            assert status == 200, (label, status)
            self.users[label] = {'id': user_id, 'email': email, 'token': session['access_token'],
                                 'refresh': session['refresh_token']}
        self.check('official Auth issues real password-grant sessions; exact187 behind real PostgREST')

    def handler(self):
        stack = self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def cors(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Headers', self.headers.get('Access-Control-Request-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer'))
                self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
                self.send_header('Access-Control-Expose-Headers', 'content-range')

            def do_OPTIONS(self):
                self.send_response(204); self.cors(); self.end_headers()

            def handle_request(self):
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                if self.path.startswith('/__test/'):
                    if self.path == '/__test/drop':
                        args = json.loads(body)
                        with stack.lock:
                            stack.drop = args['request_id']
                            stack.release.clear()
                        output = {'ok': True}
                    elif self.path == '/__test/release':
                        stack.release.set(); output = {'ok': True}
                    elif self.path == '/__test/state':
                        with stack.lock:
                            output = {'requests': list(stack.requests)}
                    else:
                        self.send_error(404); return
                    data = json.dumps(output).encode()
                    self.send_response(200); self.cors(); self.send_header('Content-Length', str(len(data)))
                    self.end_headers(); self.wfile.write(data); return
                if self.path.startswith('/auth/v1/'):
                    port, path = 9999, self.path[len('/auth/v1'):]
                elif self.path.startswith('/rest/v1/'):
                    port, path = 3000, self.path[len('/rest/v1'):]
                else:
                    self.send_error(404); return
                headers = {k: v for k, v in self.headers.items()
                           if k.lower() in ['authorization', 'apikey', 'content-type', 'prefer', 'accept', 'x-supabase-api-version', 'accept-profile', 'content-profile']}
                try:
                    status, hs, data = stack.wire(port, self.command, path, body, headers)
                    if path.startswith('/rpc/fn_fin_gastos_guardar_lote'):
                        payload = json.loads(body)
                        request_id = payload.get('p_solicitud_id')
                        with stack.lock:
                            stack.requests.append({'id': request_id, 'status': status,
                                                   'payload_hash': hashlib.sha256(json.dumps(payload.get('p_datos'), sort_keys=True).encode()).hexdigest()})
                            drop = status == 200 and stack.drop == request_id
                            if drop:
                                stack.drop = None
                        if drop:
                            stack.release.wait(30)
                            self.close_connection = True
                            return  # Genuine committed HTTP response deliberately lost at loopback gateway.
                    self.send_response(status); self.cors()
                    for k, v in hs.items():
                        if k.lower() not in ['content-length', 'connection', 'transfer-encoding', 'access-control-allow-origin', 'access-control-allow-headers', 'access-control-expose-headers']:
                            self.send_header(k, v)
                    self.send_header('Content-Length', str(len(data))); self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass
            do_GET = handle_request
            do_POST = handle_request
            do_PATCH = handle_request
            do_DELETE = handle_request
        return Handler

    def expense(self, name='Synthetic expense', value=10):
        return dict(fecha='2026-10-29', nombre=name, valor=value, negocio_id=CAT, region_id=CAT,
                    categoria_id=CAT, concepto_id=CAT, medio_pago_id=CAT, proveedor_id=None,
                    observaciones=None, url_factura=None, estado='Confirmado')

    def rpc(self, label='owner', data=None, request=None, expected=None, token=None):
        user = self.users[label]
        args = {'p_solicitud_id': request or str(uuid.uuid4()),
                'p_usuario_id': expected or user['id'], 'p_datos': data or [self.expense()]}
        status, result = self.api('rest', '/rpc/fn_fin_gastos_guardar_lote', args,
                                  user['token'] if token is None else token)
        return status, result, args

    def cases(self):
        owner, other = self.users['owner'], self.users['other']
        request = str(uuid.uuid4())
        first = self.rpc(request=request)
        assert first[0] == 200, first[:2]
        again = self.rpc(request=request)
        assert first[1] == again[1]
        assert self.sql(f"SELECT count(*) FROM fin_gastos WHERE id='{first[1]['ids'][0]}' AND created_by='{owner['id']}'") == '1'
        self.check('real JWT/PostgREST replay returns exact original row IDs and attribution')
        status, result, _ = self.rpc(data=[self.expense(value=20)], request=request)
        assert status == 400 and result['code'] == 'PGB01', (status, result)
        status, result, _ = self.rpc(data=[self.expense(name='   ')])
        assert status == 400 and result['code'] == '23514', (status, result)
        self.check('real HTTP error transport distinguishes PGB01 conflict from23514 correction')
        for label in ['other', 'admin', 'inactive']:
            status, result, _ = self.rpc(label=label, request=request)
            assert status == 403 and result['code'] == '42501', (label, status, result)
        status, result, _ = self.rpc(expected=other['id'])
        assert status == 403 and result['code'] == '42501'
        status, result, _ = self.rpc(token='')
        assert status == 401 and result['code'] == '42501', (status, result)
        status, _, _ = self.rpc(token='invalid.synthetic.jwt')
        assert status == 401
        self.check('real token verification/RLS rejects foreign receipt, wrong actor, inactive/admin and anon')
        concurrent_request = str(uuid.uuid4())
        before = int(self.sql('SELECT count(*) FROM fin_gastos'))
        with concurrent.futures.ThreadPoolExecutor(4) as pool:
            results = list(pool.map(lambda _: self.rpc(request=concurrent_request), range(4)))
        assert all(x[0] == 200 and x[1] == results[0][1] for x in results)
        assert int(self.sql('SELECT count(*) FROM fin_gastos')) == before + 1
        self.check('four real concurrent PostgREST requests commit exactly one expense batch')
        fail = str(uuid.uuid4())
        self.sql("CREATE FUNCTION local_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.nombre='Fail second' THEN RAISE EXCEPTION 'Synthetic trigger rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER local_fail BEFORE INSERT ON fin_gastos FOR EACH ROW EXECUTE FUNCTION local_fail();")
        status, result, _ = self.rpc(data=[self.expense(), self.expense('Fail second')], request=fail)
        assert status == 400 and result['code'] == 'P0001', (status, result)
        assert self.sql(f"SELECT count(*) FROM fin_gastos_lotes WHERE solicitud_id='{fail}'") == '0'
        assert int(self.sql('SELECT count(*) FROM fin_gastos')) == before + 1
        self.sql('DROP TRIGGER local_fail ON fin_gastos; DROP FUNCTION local_fail();')
        self.check('real HTTP second-row trigger failure rolls back both first row and receipt')
        self.sql(f"UPDATE usuarios SET activo=false WHERE id='{owner['id']}'")
        status, result, _ = self.rpc(request=request)
        assert status == 403 and result['code'] == '42501'
        self.sql(f"UPDATE usuarios SET activo=true,rol='Administrador' WHERE id='{owner['id']}'")
        assert self.rpc(request=request)[0] == 403
        self.sql(f"UPDATE usuarios SET rol='Gerencia' WHERE id='{owner['id']}'")
        assert self.rpc(request=request)[1] == first[1]
        self.check('current app deactivation/downgrade denies replay despite an already issued real JWT')
        status, rows = self.api('rest', '/fin_gastos_lotes?select=solicitud_id', token=other['token'], method='GET')
        assert status == 200 and rows == []
        for method in ['PATCH', 'DELETE']:
            status, result = self.api('rest', '/fin_gastos_lotes?solicitud_id=eq.' + request,
                                      {'resultado': {'synthetic_update': True}} if method == 'PATCH' else None, owner['token'], method)
            assert status == 403 and result['code'] == '42501', (method, status, result)
        assert self.sql(f"SELECT count(*) FROM fin_gastos_lotes WHERE solicitud_id='{request}'") == '1'
        self.check('real table REST isolates receipts and denies authenticated PATCH/DELETE under default ACLs')
        status, refreshed = self.api('auth', '/token?grant_type=refresh_token', {'refresh_token': owner['refresh']})
        assert status == 200
        status, _, _ = self.rpc(token=refreshed['access_token'])
        assert status == 200
        self.check('real Auth refresh produces a JWT accepted by the protected expense RPC')

    def browser(self):
        config = {'api': self.url, 'anon': self.jwt('anon'), 'email': self.users['owner']['email'],
                  'password': self.password, 'user': self.users['owner']['id'], 'catalog': CAT}
        process = subprocess.run(['node', str(ROOT / 'scripts/tests/gastos-lote-local-stack-browser.mjs')],
                                 input=json.dumps(config), text=True, capture_output=True, timeout=150,
                                 cwd=ROOT)
        # Browser emits only bounded PASS/failure facts, never sessions.
        print(process.stdout, end='', flush=True)
        if process.returncode:
            print(process.stderr[-3000:], flush=True)
            raise AssertionError('Real local Auth/PostgREST browser validation failed')

    def close(self):
        self.release.set()
        if self.server:
            self.server.shutdown(); self.server.server_close()
        remaining=[]
        for name in reversed(self.created):
            self.docker('rm', '-f', name, check=False)
            observed=self.docker('ps','-aq','--filter','name=^/'+name+'$',check=False)
            if observed.returncode or observed.stdout.strip():
                remaining.append(name)
        self.temp.cleanup()
        if remaining:
            raise RuntimeError('Local cleanup not confirmed for: '+','.join(remaining))


def main():
    stack = LocalStack()
    try:
        stack.start()
        print('CAPABILITY real local Auth/PostgREST ready; network-none shared loopback; no host change', flush=True)
        stack.cases()
        stack.browser()
        print(f'{stack.passed} real Auth/PostgREST groups OK; browser groups reported above', flush=True)
    finally:
        stack.close()
        print('CLEANUP local test containers/env files removed; no hosted resources or external credentials', flush=True)


if __name__ == '__main__':
    main()
