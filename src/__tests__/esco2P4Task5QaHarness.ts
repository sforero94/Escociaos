// P4-5 independent synthetic SQL rows and literal oracles, before milk runtime.
import type { PGlite } from '@electric-sql/pglite';
import { HATO_QA,hatoQaDb,hatoQaSeed } from './esco2P4Task4QaHarness.ts';
export { HATO_QA };
export const MILK={
  p1:'a5500000-0000-4000-8000-000000000001',p2:'a5500000-0000-4000-8000-000000000002',p3:'a5500000-0000-4000-8000-000000000003',p4:'a5500000-0000-4000-8000-000000000004',
  q1:'b5500000-0000-4000-8000-000000000001',q2:'b5500000-0000-4000-8000-000000000002',q3:'b5500000-0000-4000-8000-000000000003',q4:'b5500000-0000-4000-8000-000000000004',qHidden:'b5500000-0000-4000-8000-000000000005',qNull:'b5500000-0000-4000-8000-000000000006',qOpen:'b5500000-0000-4000-8000-000000000007',
  i1:'c5500000-0000-4000-8000-000000000001',iZero:'c5500000-0000-4000-8000-000000000002',iShared:'c5500000-0000-4000-8000-000000000003',iHidden:'c5500000-0000-4000-8000-000000000004',iNull:'c5500000-0000-4000-8000-000000000005',iOpen:'c5500000-0000-4000-8000-000000000006',
} as const;
export const MILK_ORACLE={
  pesajes:{suma_muestras:20,promedio_dias_pesados:20/3,cobertura:{dias_solicitados:5,dias_con_pesaje:4,dias_sin_fila:1,completos:2,historicos_total:1,incompletos:1,no_calculables:0}},
  quincenas:{medido:{litros:100,quincenas:2},derivado_mensual:{litros:100,quincenas:2}},
} as const;
export async function milkQaDb():Promise<PGlite> {
  const db=await hatoQaDb();
  await db.exec(`
    create table hato_pesajes_leche(id uuid primary key,animal_id uuid not null,fecha date not null,litros_total numeric not null,litros_am numeric,litros_pm numeric,fuente text,unique(animal_id,fecha));
    create table fin_ingresos(id uuid primary key,cantidad numeric,valor numeric,precio_unitario numeric,comprador text,medio_pago text);
    create table hato_produccion_quincenal(id uuid primary key,anio int not null,mes int not null,quincena int not null,fecha_inicio date,fecha_fin date,origen_dato text not null,litros_total numeric,fin_ingreso_id uuid not null,num_vacas_ordeno integer,num_vacas_ordeno_origen text,unique(anio,mes,quincena));
    create unique index qa_medida_ingreso_unico on hato_produccion_quincenal(fin_ingreso_id) where origen_dato='medido';
    grant select on hato_pesajes_leche,hato_produccion_quincenal,fin_ingresos to anon,authenticated;
    alter table hato_pesajes_leche enable row level security;alter table hato_produccion_quincenal enable row level security;alter table fin_ingresos enable row level security;
    create policy hato_pesajes_leche_select_authenticated on hato_pesajes_leche for select to authenticated using(true);
    create policy hato_produccion_quincenal_select_authenticated on hato_produccion_quincenal for select to authenticated using(true);
    create policy fin_ingresos_select on fin_ingresos for select to public using(get_user_role()='Gerencia');
    create policy qa_ingreso_hidden on fin_ingresos as restrictive for select to authenticated using(id<>'${MILK.iHidden}');
  `);
  await milkQaSeed(db);return db;
}
export async function milkQaSeed(db:PGlite) {
  await db.exec('truncate hato_pesajes_leche,hato_produccion_quincenal,fin_ingresos;');await hatoQaSeed(db);
  await db.query(`insert into hato_pesajes_leche values
    ($1,$5,'2026-10-01',12,5,7,'qa-turnos'),($2,$5,'2026-10-02',0,0,0,'qa-cero'),
    ($3,$5,'2026-10-03',3,3,null,'qa-incompleto'),($4,$5,'2026-10-04',8,null,null,'qa-historico'),
    ('a5500000-0000-4000-8000-000000000005',$6,'2026-10-01',40,20,20,'qa-activa'),
    ('a5500000-0000-4000-8000-000000000006',$7,'2026-10-01',32,16,16,'qa-vendida'),
    ('a5500000-0000-4000-8000-000000000007',$8,'2026-10-01',999,499,500,'NO PUBLICAR PESO')`,[MILK.p1,MILK.p2,MILK.p3,MILK.p4,HATO_QA.main,HATO_QA.twinActive,HATO_QA.twinSold,HATO_QA.hidden]);
  await db.query(`insert into fin_ingresos values
    ($1,100,999901,999902,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO'),($2,0,999903,999904,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO'),
    ($3,1000,999905,999906,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO'),($4,777,999907,999908,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO'),
    ($5,null,999909,999910,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO'),($6,11,999911,999912,'NO PUBLICAR COMPRADOR','NO PUBLICAR MEDIO')`,[MILK.i1,MILK.iZero,MILK.iShared,MILK.iHidden,MILK.iNull,MILK.iOpen]);
  await db.query(`insert into hato_produccion_quincenal values
    ($1,2026,1,1,'2026-01-01','2026-01-15','medido',null,$8,null,null),
    ($2,2026,1,2,'2026-01-16','2026-01-31','medido',null,$9,10,'qa-manual'),
    ($3,2026,2,1,'2026-02-01','2026-02-15','derivado_mensual',40,$10,null,null),
    ($4,2026,2,2,'2026-02-16','2026-02-28','derivado_mensual',60,$10,null,null),
    ($5,2026,3,1,'2026-03-01','2026-03-15','medido',null,$11,null,null),
    ($6,2026,3,2,'2026-03-16','2026-03-31','medido',null,$12,null,null),
    ($7,2026,11,1,'2026-11-01','2026-11-15','medido',null,$13,null,null)`,[MILK.q1,MILK.q2,MILK.q3,MILK.q4,MILK.qHidden,MILK.qNull,MILK.qOpen,MILK.i1,MILK.iZero,MILK.iShared,MILK.iHidden,MILK.iNull,MILK.iOpen]);
}
