// Independent, entirely invented D36 SQL fixture and literal oracles.
import type { PGlite } from '@electric-sql/pglite';
import { ID } from './esco2P2Harness.ts';
import { APPS, task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';
export const T5_ORACLE = { jornales: 1.75, costo_registrado: 60, sin_lote: 0.25, con_costo_completo: 70 } as const;
export async function task5QaDb() {
  const db = await task2QaDb();
  await db.exec(`create policy qa_hidden_task on tareas as restrictive for select to authenticated using (id <> '${ID.t3}'::uuid);`);
  await task5QaSeed(db);
  return db;
}
export async function task5QaSeed(db: PGlite) {
  await task2QaSeed(db);
  await db.exec('truncate registros_trabajo;');
  await db.query('update aplicaciones set tarea_id=$1,nombre_aplicacion=case when id=$2 then \'Primera aplicación\' else \'Segunda aplicación\' end where id=any($3::uuid[])', [ID.t1, APPS.closed, [APPS.closed, APPS.future]]);
  await db.query("insert into registros_trabajo values ($1,$4,$5,'2026-11-01','0.5',20),($2,$4,null,'2026-11-02','0.25',null),($3,$4,$6,'2026-11-03','1.0',40),('d5000000-0000-4000-8000-000000000009',$7,$5,'2026-11-02','1.0',999)", [ID.r1, ID.r2, ID.r3, ID.t1, ID.l1, ID.l2, ID.t2]);
  await db.query("update lotes set nombre=case when id=$1 then 'Lote A' when id=$2 then 'Lote B' else nombre end", [ID.l1, ID.l2]);
}
