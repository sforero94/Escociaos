// Independent invented D37 fixture. Expectations are literal, not calculator outputs.
import type { PGlite } from '@electric-sql/pglite';
import { APPS } from './esco2P3Task2QaHarness.ts';
import { T3,task3QaDb,task3QaSeed } from './esco2P3Task3QaHarness.ts';
export const T6_ORACLE={needP:17,stockP:8,shortP:9,needQ:1.003,shortQ:0.003} as const;
export async function task6QaDb(){
  const db=await task3QaDb();
  await db.exec(`create table productos(id uuid primary key,nombre text,unidad_medida text,cantidad_actual numeric,precio_unitario numeric,presentacion_kg_l numeric);
    create table aplicaciones_compras(id uuid primary key,producto_id uuid,cantidad_faltante numeric,inventario_actual numeric);
    grant select on productos,aplicaciones_compras to authenticated;alter table productos enable row level security;create policy qa_current_inventory on productos for select to authenticated using(true);`);
  await task6QaSeed(db);return db;
}
export async function task6QaSeed(db:PGlite){
  await task3QaSeed(db);await db.exec('truncate productos,aplicaciones_compras;');
  await db.query("update aplicaciones set estado='En ejecución' where id=any($1::uuid[])",[[T3.fertilizer,T3.liquid]]);
  await db.query('update aplicaciones_productos set cantidad_total_necesaria=case when mezcla_id=$1 then 6 else 4 end where producto_id=$2',[T3.mix1,T3.productP]);
  await db.query('update aplicaciones_productos set cantidad_total_necesaria=1.001 where producto_id=$1',[T3.productQ]);
  await db.query("insert into aplicaciones_productos values('96000000-0000-4000-8000-000000000001',$1,$2,'Insumo Q','Sintético','Kilos',0.002,null,null,null,null,null,null)",[T3.mix2,T3.productQ]);
  await db.query("update aplicaciones_productos set producto_id=$1,producto_nombre='Insumo P',producto_unidad='Kilos',cantidad_total_necesaria=7 where mezcla_id=$2",[T3.productP,T3.liquidMix]);
  await db.query("insert into productos values($1,'Insumo P','Kilos',8,null,null),($2,'Insumo Q','Kilos',1,null,null)",[T3.productP,T3.productQ]);
  await db.query("insert into aplicaciones_compras values('97000000-0000-4000-8000-000000000001',$1,999,999)",[T3.productP]);
  await db.query("insert into aplicaciones_mezclas values('98000000-0000-4000-8000-000000000001',$1,1,'Cerrada ajena')",[APPS.missingDate]);
  await db.query("insert into aplicaciones_productos values('96000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001',$1,'Insumo P','Sintético','Kilos',50,null,null,null,null,null,null)",[T3.productP]);
}
