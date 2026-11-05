// Entirely synthetic D34 source. Literal expectations never call the executor/calculator.
import type { PGlite } from '@electric-sql/pglite';
import { T3, task3QaDb, task3QaSeed } from './esco2P3Task3QaHarness.ts';
export const T4_ORACLE = { frozen:200, execution:127, plan:320, period:78 } as const;
export async function task4QaDb() {
  const db=await task3QaDb();
  await db.exec(`alter table aplicaciones add column costo_total_insumos numeric;alter table aplicaciones add column costo_total_mano_obra numeric;alter table aplicaciones add column costo_total numeric;
    alter table aplicaciones_cierre add column valor_jornal numeric;
    create table productos(id uuid primary key,nombre text,unidad_medida text,precio_unitario numeric,cantidad_actual numeric);
    grant select on productos to authenticated;alter table productos enable row level security;
    create policy qa_inventory_read on productos for select to authenticated using(true);`);
  await task4QaSeed(db);return db;
}
export async function task4QaSeed(db:PGlite) {
  await task3QaSeed(db);await db.exec('truncate productos;');
  await db.query('update aplicaciones set costo_total_insumos=120,costo_total_mano_obra=80,costo_total=200 where id=$1',[T3.fertilizer]);
  await db.query('update aplicaciones_cierre set valor_jornal=777 where aplicacion_id=$1',[T3.fertilizer]);
  await db.query("insert into productos values($1,'Insumo P','Kilos',7,100),($2,'Insumo Q','Kilos',11,100),($3,'Insumo R','Litros',5,100)",[T3.productP,T3.productQ,T3.productR]);
  await db.exec("update aplicaciones_productos set producto_nombre=case producto_id::text when '81000000-0000-4000-8000-000000000001' then 'Insumo P' when '81000000-0000-4000-8000-000000000002' then 'Insumo Q' else producto_nombre end;update movimientos_diarios_productos set producto_nombre=case producto_id::text when '81000000-0000-4000-8000-000000000001' then 'Insumo P' when '81000000-0000-4000-8000-000000000002' then 'Insumo Q' else producto_nombre end;");
}
