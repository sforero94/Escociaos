// Independent Task 3 literal synthetic tables. Expected quantities are not read from an engine.
import type { PGlite } from '@electric-sql/pglite';
import { ID } from './esco2P2Harness.ts';
import { APPS, MOVEMENTS, task2QaDb, task2QaSeed } from './esco2P3Task2QaHarness.ts';

export const T3 = {
  fertilizer: APPS.closed, liquid: APPS.unlinked,
  productP: '81000000-0000-4000-8000-000000000001',
  productQ: '81000000-0000-4000-8000-000000000002',
  productR: '81000000-0000-4000-8000-000000000003',
  hiddenProduct: '81000000-0000-4000-8000-000000000004',
  mix1: '82000000-0000-4000-8000-000000000001',
  mix2: '82000000-0000-4000-8000-000000000002',
  liquidMix: '82000000-0000-4000-8000-000000000003',
  hiddenParentMix: '82000000-0000-4000-8000-000000000004',
  hiddenMix: '82000000-0000-4000-8000-000000000005',
  liquidMovement: 'f1000000-0000-4000-8000-000000000005',
  hiddenMovement: 'f1000000-0000-4000-8000-000000000006',
} as const;

export const T3_ORACLE = {
  planFertilizer: [
    { lote_id: ID.l1, producto_id: T3.productP, unidad: 'Kilos', cantidad: 10 },
    { lote_id: ID.l1, producto_id: T3.productQ, unidad: 'Kilos', cantidad: 0 },
    { lote_id: ID.l2, producto_id: T3.productP, unidad: 'Kilos', cantidad: 0 },
    { lote_id: ID.l2, producto_id: T3.productQ, unidad: 'Kilos', cantidad: 10 },
    { lote_id: ID.l3, producto_id: T3.productP, unidad: 'Kilos', cantidad: 20 },
  ],
  executionFertilizer: [
    { lote_id: ID.l1, producto_id: T3.productP, unidad: 'Kilos', cantidad: 7 },
    { lote_id: ID.l2, producto_id: T3.productQ, unidad: 'Kilos', cantidad: 2 },
    { lote_id: ID.l3, producto_id: T3.productP, unidad: 'Kilos', cantidad: 8 },
  ],
  executionFertilizerPeriod: [
    { lote_id: ID.l2, producto_id: T3.productQ, unidad: 'Kilos', cantidad: 2 },
    { lote_id: ID.l3, producto_id: T3.productP, unidad: 'Kilos', cantidad: 8 },
  ],
  planLiquid: [{ lote_id: ID.l1, producto_id: T3.productR, unidad: 'Litros', cantidad: 0.03 }],
  executionLiquid: [{ lote_id: ID.l1, producto_id: T3.productR, unidad: 'Litros', cantidad: 0.01 }],
} as const;

export async function task3QaDb(): Promise<PGlite> {
  const db = await task2QaDb();
  await db.exec(`
    alter table movimientos_diarios add column numero_canecas numeric;
    alter table movimientos_diarios add column numero_bultos numeric;
    create table aplicaciones_mezclas(id uuid primary key,aplicacion_id uuid not null,numero_mezcla integer not null,nombre_mezcla text,unique(aplicacion_id,numero_mezcla));
    create table aplicaciones_calculos(id uuid primary key,aplicacion_id uuid not null,lote_id uuid not null,lote_nombre text,total_arboles integer not null,mezcla_id uuid,numero_canecas numeric,litros_mezcla numeric,numero_bultos integer,kilos_totales numeric,unique(aplicacion_id,lote_id));
    create table aplicaciones_lotes(id uuid primary key,aplicacion_id uuid not null,lote_id uuid not null,arboles_grandes integer not null,arboles_medianos integer not null,arboles_pequenos integer not null,arboles_clonales integer not null,total_arboles integer not null,calibracion_litros_arbol numeric,tamano_caneca integer,unique(aplicacion_id,lote_id));
    create table aplicaciones_productos(id uuid primary key,mezcla_id uuid not null,producto_id uuid not null,producto_nombre text not null,producto_categoria text not null,producto_unidad text not null,cantidad_total_necesaria numeric not null,dosis_por_caneca numeric,unidad_dosis text,dosis_grandes numeric,dosis_medianos numeric,dosis_pequenos numeric,dosis_clonales numeric,unique(mezcla_id,producto_id));
    create table movimientos_diarios_productos(id uuid primary key,movimiento_diario_id uuid not null,producto_id uuid not null,producto_nombre text not null,producto_categoria text not null,cantidad_utilizada numeric not null,unidad text not null);
    grant select on aplicaciones_mezclas,aplicaciones_calculos,aplicaciones_lotes,aplicaciones_productos,movimientos_diarios_productos to authenticated;
    alter table aplicaciones_mezclas enable row level security;
    alter table aplicaciones_calculos enable row level security;
    alter table aplicaciones_lotes enable row level security;
    alter table aplicaciones_productos enable row level security;
    alter table movimientos_diarios_productos enable row level security;
    create policy "Gerencia acceso total" on aplicaciones_mezclas for all to public using ((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
    create policy authenticated_select_aplicaciones_calculos on aplicaciones_calculos for select to authenticated using(true);
    create policy authenticated_select_aplicaciones_lotes on aplicaciones_lotes for select to authenticated using(true);
    create policy authenticated_select_aplicaciones_productos on aplicaciones_productos for select to authenticated using(true);
    create policy authenticated_select_movimientos_diarios_productos on movimientos_diarios_productos for select to authenticated using(true);
    -- Additional adversarial RLS: readable grandchildren do not authorize hidden relation parents.
    create policy qa_mix_scope on aplicaciones_mezclas as restrictive for select to authenticated using(id <> '${T3.hiddenMix}'::uuid);
    create policy qa_movement_scope on movimientos_diarios as restrictive for select to authenticated using(id <> '${T3.hiddenMovement}'::uuid);
  `);
  await task3QaSeed(db);
  return db;
}

export async function task3QaSeed(db: PGlite) {
  await task2QaSeed(db);
  await db.exec('truncate aplicaciones_mezclas,aplicaciones_calculos,aplicaciones_lotes,aplicaciones_productos,movimientos_diarios_productos;');
  await db.query("update aplicaciones set tipo_aplicacion='Fertilización',nombre_aplicacion='Fertilizante sintético',codigo_aplicacion='QA-F' where id=$1", [T3.fertilizer]);
  await db.query("update aplicaciones set tipo_aplicacion='Drench',nombre_aplicacion='Líquido sintético',codigo_aplicacion='QA-D' where id=$1", [T3.liquid]);
  await db.query('update lotes set activo=false where id=$1', [ID.l2]);
  await db.query(`insert into aplicaciones_mezclas values($1,$6,1,'Mezcla repetida'),($2,$6,2,'Mezcla repetida'),($3,$7,1,'Mezcla líquida'),($4,$8,1,'NO PUBLICAR PADRE OCULTO'),($5,$6,3,'NO PUBLICAR MEZCLA OCULTA')`, [T3.mix1,T3.mix2,T3.liquidMix,T3.hiddenParentMix,T3.hiddenMix,T3.fertilizer,T3.liquid,APPS.hidden]);
  await db.query(`insert into aplicaciones_lotes values
    ('84000000-0000-4000-8000-000000000001',$1,$3,100,0,0,0,100,null,null),
    ('84000000-0000-4000-8000-000000000002',$1,$4,0,0,100,0,100,null,null),
    ('84000000-0000-4000-8000-000000000003',$1,$5,50,0,50,0,100,null,null),
    ('84000000-0000-4000-8000-000000000004',$2,$3,3,0,0,0,3,1,7)`, [T3.fertilizer,T3.liquid,ID.l1,ID.l2,ID.l3]);
  await db.query(`insert into aplicaciones_calculos values
    ('83000000-0000-4000-8000-000000000001',$1,$3,'Lote repetido',100,$6,null,null,1,10),
    ('83000000-0000-4000-8000-000000000002',$1,$4,'Lote repetido',100,$6,null,null,1,10),
    ('83000000-0000-4000-8000-000000000003',$1,$5,'Otro',100,$7,null,null,1,20),
    ('83000000-0000-4000-8000-000000000004',$2,$3,'Lote repetido',3,$8,0.43,3,null,null)`, [T3.fertilizer,T3.liquid,ID.l1,ID.l2,ID.l3,T3.mix1,T3.mix2,T3.liquidMix]);
  await db.query(`insert into aplicaciones_productos values
    ('85000000-0000-4000-8000-000000000001',$1,$6,'Insumo repetido','Sintético','Kilos',10,null,null,100,0,0,0),
    ('85000000-0000-4000-8000-000000000002',$1,$7,'Insumo repetido','Sintético','Kilos',10,null,null,0,0,100,0),
    ('85000000-0000-4000-8000-000000000003',$2,$6,'Insumo repetido','Sintético','Kilos',20,null,null,200,200,200,200),
    ('85000000-0000-4000-8000-000000000004',$3,$8,'Líquido sintético','Sintético','Litros',0.03,70,'cc',null,null,null,null),
    ('85000000-0000-4000-8000-000000000005',$4,$9,'NO PUBLICAR INSUMO PADRE OCULTO','Sintético','Kilos',999,null,null,100,100,100,100),
    ('85000000-0000-4000-8000-000000000006',$5,$9,'NO PUBLICAR INSUMO MEZCLA OCULTA','Sintético','Kilos',777,null,null,100,100,100,100)`, [T3.mix1,T3.mix2,T3.liquidMix,T3.hiddenParentMix,T3.hiddenMix,T3.productP,T3.productQ,T3.productR,T3.hiddenProduct]);
  await db.query("update movimientos_diarios set aplicacion_id=$1,lote_id=$2,fecha_movimiento='2026-11-01',numero_bultos=1,numero_canecas=null where id=$3", [T3.fertilizer,ID.l1,MOVEMENTS.first]);
  await db.query("update movimientos_diarios set aplicacion_id=$1,lote_id=$2,fecha_movimiento='2026-11-03',numero_bultos=2,numero_canecas=null where id=$3", [T3.fertilizer,ID.l3,MOVEMENTS.second]);
  await db.query("update movimientos_diarios set aplicacion_id=$1,lote_id=$2,fecha_movimiento='2026-11-02',numero_bultos=1,numero_canecas=null where id=$3", [T3.fertilizer,ID.l2,MOVEMENTS.current]);
  await db.query(`insert into movimientos_diarios values($1,$3,$5,'2026-11-03',0.1,null),($2,$4,$5,'2026-11-02',null,1)`, [T3.liquidMovement,T3.hiddenMovement,T3.liquid,T3.fertilizer,ID.l1]);
  await db.query(`insert into movimientos_diarios_productos values
    ('86000000-0000-4000-8000-000000000001',$1,$7,'Insumo repetido','Sintético',3,'Kilos'),
    ('86000000-0000-4000-8000-000000000002',$1,$7,'Insumo repetido','Sintético',4,'Kilos'),
    ('86000000-0000-4000-8000-000000000003',$2,$7,'Insumo repetido','Sintético',8,'Kilos'),
    ('86000000-0000-4000-8000-000000000004',$3,$8,'Insumo repetido','Sintético',2,'Kilos'),
    ('86000000-0000-4000-8000-000000000005',$4,$9,'Líquido sintético','Sintético',0.01,'Litros'),
    ('86000000-0000-4000-8000-000000000006',$5,$10,'NO PUBLICAR INSUMO PADRE OCULTO','Sintético',999,'Kilos'),
    ('86000000-0000-4000-8000-000000000007',$6,$10,'NO PUBLICAR INSUMO MOVIMIENTO OCULTO','Sintético',555,'Kilos')`, [MOVEMENTS.first,MOVEMENTS.second,MOVEMENTS.current,T3.liquidMovement,MOVEMENTS.hidden,T3.hiddenMovement,T3.productP,T3.productQ,T3.productR,T3.hiddenProduct]);
}
