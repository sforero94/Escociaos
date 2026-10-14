#!/usr/bin/env python3
"""Synthetic configuration tests only; not hosted Storage or file byte validation."""
import importlib.util
import json
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('isolated_pg', ROOT / 'scripts/security/purchase-integrity-postgres.py')
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)
candidate = (ROOT / 'src/sql/security-candidates/invoice-storage-limits.sql').read_text()

def snapshot():
    return pg.sql('SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM storage.buckets b;')

def rejected(label):
    before = snapshot()
    pg.sql(candidate, ok=False)
    pg.verify(snapshot() == before, label)

def main():
    pg.docker(['info', '--format', '{{.ServerVersion}}'])
    pg.CONTAINER = pg.docker(['run','-d','--pull=never','--network=none','--read-only',
        '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m',
        '--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=1','--security-opt=no-new-privileges',
        '-e','POSTGRES_HOST_AUTH_METHOD=trust',pg.IMAGE]).stdout.strip()
    try:
        config = json.loads(pg.docker(['inspect','--format','{{json .HostConfig}}',pg.CONTAINER]).stdout)
        pg.verify(config['NetworkMode']=='none' and not config['Binds'] and not config['PortBindings'], 'isolated synthetic container')
        for _ in range(150):
            probe = pg.docker(['exec','-u','postgres',pg.CONTAINER,'psql','-XqAt','-c','SELECT 1'],check=False)
            logs = pg.docker(['logs',pg.CONTAINER]).stdout
            if not probe.returncode and 'PostgreSQL init process complete' in logs:
                break
            time.sleep(.1)
        else:
            raise AssertionError('PostgreSQL startup failed')
        pg.sql('CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean, file_size_limit bigint, allowed_mime_types text[]); INSERT INTO storage.buckets VALUES (\'facturas\',false,NULL,NULL),(\'synthetic-other\',true,123,ARRAY[\'text/plain\']);')
        other = pg.sql("SELECT to_jsonb(b) FROM storage.buckets b WHERE id='synthetic-other';")
        pg.sql(candidate)
        pg.verify(pg.sql("SELECT file_size_limit=5242880 AND cardinality(allowed_mime_types)=5 AND NOT public FROM storage.buckets WHERE id='facturas';")=='t', 'exact approved private bucket limits')
        pg.verify(pg.sql("SELECT to_jsonb(b) FROM storage.buckets b WHERE id='synthetic-other';")==other, 'other bucket untouched')
        rejected('repeat refuses without replacing existing settings')
        pg.sql("UPDATE storage.buckets SET public=true,file_size_limit=NULL,allowed_mime_types=NULL WHERE id='facturas';")
        rejected('public bucket refuses atomically')
        pg.sql("UPDATE storage.buckets SET public=false,file_size_limit=1024 WHERE id='facturas';")
        rejected('new administrator settings preserved')
        pg.sql("DELETE FROM storage.buckets WHERE id='facturas';")
        rejected('missing bucket refuses without creation')
        pg.sql("INSERT INTO storage.buckets VALUES ('facturas',false,NULL,NULL); CREATE FUNCTION storage.suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER suppress BEFORE UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.suppress();")
        rejected('suppressed configuration write refuses')
    finally:
        pg.docker(['rm','-f',pg.CONTAINER])
        pg.verify(pg.docker(['inspect',pg.CONTAINER],check=False).returncode != 0, 'container and tmpfs removed')
    print(f'PASS {pg.CHECKS} assertions including verified cleanup')

if __name__ == '__main__':
    main()
