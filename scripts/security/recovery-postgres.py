#!/usr/bin/env python3
"""Synthetic restore procedure checks only; never reads backups, keys or production data."""
import json
import importlib.util
from pathlib import Path
import time

spec = importlib.util.spec_from_file_location('isolated_pg', Path(__file__).with_name('purchase-integrity-postgres.py'))
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)


def main():
    pg.docker(['info', '--format', '{{.ServerVersion}}'])
    pg.CONTAINER = pg.docker([
        'run', '-d', '--pull=never', '--network=none', '--read-only',
        '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
        '--tmpfs', '/var/run/postgresql:rw,size=16m', '--tmpfs', '/tmp:rw,size=16m',
        '--memory=512m', '--cpus=1', '--security-opt=no-new-privileges',
        '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', pg.IMAGE,
    ]).stdout.strip()
    try:
        config = json.loads(pg.docker(['inspect', '--format', '{{json .HostConfig}}', pg.CONTAINER]).stdout)
        assert config['NetworkMode'] == 'none' and not config['Binds'] and not config['PortBindings']
        assert config['ReadonlyRootfs'] and not config['Privileged'] and not config['PidMode']
        print('PASS isolated cached container: no network, ports, binds or host PID access', flush=True)
        for _ in range(120):
            ready = pg.docker(['exec', '-u', 'postgres', pg.CONTAINER, 'pg_isready'], check=False)
            initialized = 'PostgreSQL init process complete; ready for start up.' in pg.docker(['logs', pg.CONTAINER]).stdout
            if ready.returncode == 0 and initialized:
                break
            time.sleep(.25)
        else:
            raise AssertionError('Synthetic database did not initialize')
        files = {
            'roles.sql': 'CREATE ROLE synthetic_restore_reader;',
            'schema.sql': 'CREATE TABLE synthetic_restore(id integer PRIMARY KEY);',
            'data.sql': 'INSERT INTO synthetic_restore VALUES (1);',
            'broken.sql': 'INSERT INTO synthetic_restore VALUES (1); SELECT nonexistent_restore_function(); INSERT INTO synthetic_restore VALUES (2);',
        }
        for name, content in files.items():
            pg.docker(['exec', '-i', '-u', 'postgres', pg.CONTAINER, 'sh', '-c', f'umask 077; cat > /tmp/{name}'], content)
        args = ['exec', '-u', 'postgres', pg.CONTAINER, 'psql', '-X', '-qAt', '-d', 'postgres']
        # Demonstrate the unsafe recipe with synthetic input; no application data.
        result = pg.docker(args + ['-f', '/tmp/roles.sql', '-f', '/tmp/schema.sql', '-f', '/tmp/broken.sql'], check=False)
        assert result.returncode == 0 and pg.sql('SELECT count(*) FROM synthetic_restore;') == '2'
        print('PASS reproduced default psql: SQL failure can return success with partial data', flush=True)
        pg.sql('DROP TABLE synthetic_restore; DROP ROLE synthetic_restore_reader;')
        guarded = args + ['--set=ON_ERROR_STOP=1', '--single-transaction']
        result = pg.docker(guarded + ['-f', '/tmp/roles.sql', '-f', '/tmp/schema.sql', '-f', '/tmp/broken.sql'], check=False)
        assert result.returncode != 0
        assert pg.sql("SELECT to_regclass('public.synthetic_restore') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='synthetic_restore_reader');") == 't'
        print('PASS failed guarded restore rolls back roles, schema and all rows', flush=True)
        pg.docker(guarded + ['-f', '/tmp/roles.sql', '-f', '/tmp/schema.sql', '-f', '/tmp/data.sql'])
        assert pg.sql('SELECT count(*)=1 AND min(id)=1 FROM synthetic_restore;') == 't'
        print('PASS valid guarded synthetic restore commits exact expected state', flush=True)
    finally:
        pg.docker(['rm', '-f', '-v', pg.CONTAINER])
        assert pg.docker(['inspect', pg.CONTAINER], check=False).returncode != 0
        print('PASS test container and tmpfs cleanup verified', flush=True)
    print('Synthetic procedure verified; real backup recovery and runtime remain unverified.', flush=True)


if __name__ == '__main__':
    main()
