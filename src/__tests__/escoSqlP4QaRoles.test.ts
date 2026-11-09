// Refutación sintética del diseño P4 invoker+SET ROLE. No es una migración candidata.
// La RPC interior sí se extrae de la migración192 que existe en main.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTRO = '22222222-2222-4222-8222-222222222222';
const migracion = readFileSync(new URL('../sql/migrations/192_esco_sql_vistas_y_rpc.sql', import.meta.url), 'utf8');
const rpc = /CREATE FUNCTION public\.esco_sql_lectura[\s\S]*?\$fn\$;/.exec(migracion)?.[0];
if (!rpc) throw new Error('No se encontró la función de192');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role authenticator login noinherit;
    grant authenticated, service_role to authenticator;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    create function public.get_user_role() returns text language sql as $$select 'Gerencia'::text$$;
    create table public.qa_restringida (actor uuid, valor text);
    insert into public.qa_restringida values ('${OTRO}', 'dato-sintetico-ajeno');
    alter table public.qa_restringida enable row level security;
    grant select on public.qa_restringida to authenticated, service_role;
    create policy solo_actor on public.qa_restringida for select to authenticated using (actor = auth.uid());
    ${rpc}
    revoke all on function public.esco_sql_lectura(text) from public;
    grant execute on function public.esco_sql_lectura(text) to authenticated, service_role;
    create function public.qa_actor_propuesto(p_usuario uuid, p_sql text) returns jsonb
    language plpgsql security invoker set search_path = public, pg_temp as $$
    begin
      if current_user <> 'service_role' then raise exception 'servicio requerido' using errcode='42501'; end if;
      perform set_config('request.jwt.claims', jsonb_build_object('sub', p_usuario, 'role', 'authenticated')::text, true);
      perform set_config('role', 'authenticated', true);
      return public.esco_sql_lectura(p_sql);
    end $$;
    revoke all on function public.qa_actor_propuesto(uuid,text) from public;
    grant execute on function public.qa_actor_propuesto(uuid,text) to service_role;
    set session authorization authenticator;
  `);
});
afterAll(async () => { await db.close(); });

async function consultar(sql: string) {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query<{ r: { filas: Record<string, unknown>[] } }>('select public.qa_actor_propuesto($1::uuid,$2) r', [ACTOR, sql])).rows[0].r;
  });
}

describe('QA P4 — refutación de SET ROLE con authenticator como session_user', () => {
  it('el control positivo sí cambia al actor y la RLS oculta la fila de otro usuario', async () => {
    const rol = await consultar('select current_user as rol, session_user as sesion');
    expect(rol.filas).toEqual([{ rol: 'authenticated', sesion: 'authenticator' }]);
    const datos = await consultar('select * from public.qa_restringida');
    expect(datos.filas).toEqual([]);
  });

  it('la consulta puede recuperar service_role mediante set_config pese a estar en transacción readonly', async () => {
    const r = await consultar("with cambio as materialized (select set_config('role','service_role',true)) select current_user as rol, session_user as sesion from cambio");
    expect(r.filas).toEqual([{ rol: 'service_role', sesion: 'authenticator' }]);
  });

  it('tras recuperar service_role una consulta anidada lee la fila que el control positivo ocultaba', async () => {
    const r = await consultar("with cambio as materialized (select set_config('role','service_role',true)) select query_to_xml('select valor from public.qa_restringida',false,false,'')::text as datos from cambio");
    expect(r.filas[0].datos).toContain('dato-sintetico-ajeno');
  });
});
