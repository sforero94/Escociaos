// Independent Task 2 synthetic source/oracles, frozen before implementation.
// Fixture IDs/names/dates/amounts are invented; no production/evaluation row content.
import type { PGlite } from '@electric-sql/pglite';
import type { ClienteUsuario } from '../../supabase/functions/esco-consultas/manejador.ts';
import type { FiltroPostgrest, RespuestaPostgrest } from '../utils/esco2/fuente.ts';
import { clienteRls, type Traza } from './esco2ArnesRls.ts';
import { ID, p2Db, p2Seed } from './esco2P2Harness.ts';

export const APPS = {
  closed: ID.a1,
  unlinked: ID.a2,
  nullMetadata: 'e1000000-0000-4000-8000-000000000003',
  future: 'e1000000-0000-4000-8000-000000000004',
  hidden: 'e1000000-0000-4000-8000-000000000005',
  missingDate: 'e1000000-0000-4000-8000-000000000006',
} as const;
export const MOVEMENTS = {
  first: 'f1000000-0000-4000-8000-000000000001',
  second: 'f1000000-0000-4000-8000-000000000002',
  current: 'f1000000-0000-4000-8000-000000000003',
  hidden: 'f1000000-0000-4000-8000-000000000004',
} as const;

// Literal business expectations, independent of the runtime/executor result.
export const EXPECTED = {
  planned: [APPS.closed, APPS.unlinked, APPS.nullMetadata].sort(),
  executed: [APPS.closed],
  closed: [APPS.closed],
  future: [APPS.future],
} as const;

export async function task2QaDb(): Promise<PGlite> {
  const db = await p2Db();
  await db.exec(`
    alter table aplicaciones add column tipo_aplicacion text;
    alter table aplicaciones add column fecha_inicio_planeada date;
    alter table aplicaciones add column fecha_fin_planeada date;
    alter table aplicaciones add column fecha_inicio_ejecucion date;
    alter table aplicaciones add column fecha_fin_ejecucion date;
    alter table aplicaciones add column fecha_cierre timestamptz;
    alter table aplicaciones add column created_at timestamptz;
    create table movimientos_diarios(id uuid primary key, aplicacion_id uuid not null, lote_id uuid not null, fecha_movimiento date not null);
    create table aplicaciones_cierre(id uuid primary key, aplicacion_id uuid not null unique, fecha_cierre date not null, created_at timestamptz);
    grant select on movimientos_diarios,aplicaciones_cierre to authenticated;
    alter table movimientos_diarios enable row level security;
    alter table aplicaciones_cierre enable row level security;
    -- Live policy expression from the authorized metadata, not simulated absence.
    create policy "Usuarios autenticados pueden leer movimientos diarios" on movimientos_diarios for select to authenticated using (true);
    create policy "Gerencia acceso total" on aplicaciones_cierre for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
    -- Adversarial stricter parent visibility. Child rows remain readable independently.
    create policy qa_parent_scope on aplicaciones as restrictive for select to authenticated using (id <> '${APPS.hidden}'::uuid);
  `);
  await task2QaSeed(db);
  return db;
}

export async function task2QaSeed(db: PGlite) {
  await p2Seed(db);
  await db.exec('truncate movimientos_diarios,aplicaciones_cierre;');
  await db.query(`update aplicaciones set nombre_aplicacion='Aplicación repetida',codigo_aplicacion=null,tipo_aplicacion='Fumigación',estado='Cerrada',fecha_inicio_planeada='2026-11-01',fecha_fin_planeada='2026-11-02',fecha_inicio_ejecucion='2026-09-01',fecha_fin_ejecucion='2026-09-10',fecha_cierre='2026-11-02T00:00:00Z',created_at='2026-12-01T12:00:00Z' where id=$1`, [APPS.closed]);
  await db.query(`update aplicaciones set nombre_aplicacion='Aplicación repetida',codigo_aplicacion='QA-B',tipo_aplicacion='Drench',estado='Calculada',tarea_id=null,fecha_inicio_planeada='2026-11-02',fecha_fin_planeada='2026-11-03',fecha_inicio_ejecucion='2026-11-03',fecha_fin_ejecucion=null,created_at='2026-10-01T12:00:00Z' where id=$1`, [APPS.unlinked]);
  await db.query(`insert into aplicaciones(id,tarea_id,codigo_aplicacion,nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_inicio_ejecucion,fecha_fin_ejecucion,created_at) values
    ($1,null,null,null,'Fertilización',null,'2026-11-01',null,null,null,'2026-10-01T12:00:00Z'),
    ($2,$5,null,'Plan futuro','Drench','En ejecución','2026-11-10','2026-11-12','2026-11-04',null,'2026-10-01T12:00:00Z'),
    ($3,null,null,'NO PUBLICAR PADRE OCULTO','Fumigación','Cerrada','2026-11-02',null,'2026-11-02','2026-11-02','2026-12-01T12:00:00Z'),
    ($4,null,null,'Sin fecha ni cierre','Fumigación','Cerrada',null,null,null,null,'2026-11-02T12:00:00Z')`, [APPS.nullMetadata, APPS.future, APPS.hidden, APPS.missingDate, ID.t2]);
  await db.query(`insert into movimientos_diarios values
    ($1,$5,$8,'2026-11-03'),($2,$5,$9,'2026-11-03'),($3,$6,$8,'2026-11-04'),($4,$7,$8,'2026-11-02')`, [MOVEMENTS.first, MOVEMENTS.second, MOVEMENTS.current, MOVEMENTS.hidden, APPS.closed, APPS.future, APPS.hidden, ID.l1, ID.l2]);
  await db.query(`insert into aplicaciones_cierre values
    ('91000000-0000-4000-8000-000000000001',$1,'2026-11-02','2026-12-01T12:00:00Z'),
    ('91000000-0000-4000-8000-000000000002',$2,'2026-11-02','2026-12-01T12:00:00Z')`, [APPS.closed, APPS.hidden]);
}

export interface QaProjection {
  tabla: string;
  columnas: string;
  count?: 'exact';
}
/** Preserve real local SQL/JWT/RLS then inject only the explicit transport fault. */
export function qaFaultClient(db: PGlite, jwt: string, traza: Traza, projections: QaProjection[], fault?: (table: string, response: RespuestaPostgrest) => RespuestaPostgrest): ClienteUsuario {
  const original = clienteRls(db, jwt, traza);
  return { ...original, from(table) {
    return { select(columns, options) {
      projections.push({ tabla: table, columnas: columns, count: options?.count });
      const query = original.from(table).select(columns, options);
      const proxy: FiltroPostgrest = new Proxy(query, { get(target, key) {
        if (key === 'then') return (resolve: (r: RespuestaPostgrest) => unknown, reject: (e: unknown) => unknown) => target.then(r => resolve(fault ? fault(table, r) : r), reject);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? (...args: unknown[]) => {
          const result = Reflect.apply(value, target, args);
          return result === target ? proxy : result;
        } : value;
      } });
      return proxy;
    } };
  } };
}
