// P4-2 independent QA: entirely invented rows, SQL/RLS and literal arithmetic frozen before runtime.
import type { PGlite } from '@electric-sql/pglite';
import { ID, p2Db, p2Seed } from './esco2P2Harness.ts';

export const CE_QA = {
  first:'85000000-0000-4000-8000-000000000001',
  second:'85000000-0000-4000-8000-000000000002',
  hiddenChild:'85000000-0000-4000-8000-000000000003',
  visibleRound:'86000000-0000-4000-8000-000000000001',
  hiddenRound:'86000000-0000-4000-8000-000000000002',
  hiddenLot:'a1000000-0000-4000-8000-000000000099',
} as const;
export const CE_ORACLE = {
  // Available-side means: 1, 0, 1, 1.5; both-NULL tree omitted. Mean .875 rounds to .88.
  first:{pctBajo:25,pctEnRango:75,pctAlto:0,totalArboles:4,promedio:0.88},
  second:{pctBajo:0,pctEnRango:0,pctAlto:100,totalArboles:1,promedio:2},
  savedFirst:7.25,
  savedSecond:0,
  phFirst:6.4,
  measurements:[{arbol:1,alta:null,baja:1},{arbol:2,alta:0,baja:null},{arbol:3,alta:0,baja:2},{arbol:4,alta:1.5,baja:null},{arbol:5,alta:null,baja:null}],
} as const;
export async function ceQaDb():Promise<PGlite> {
  const db=await p2Db();
  await db.exec(`
    create table rondas_monitoreo(id uuid primary key,nombre text,fecha_inicio date not null,fecha_fin date);
    create table mon_conductividad(id uuid primary key,lote_id uuid not null,ronda_id uuid,fecha_monitoreo date not null,valor_ce numeric not null,lecturas jsonb,num_arboles integer,ph numeric);
    grant select on rondas_monitoreo,mon_conductividad to anon,authenticated;
    alter table rondas_monitoreo enable row level security;
    alter table mon_conductividad enable row level security;
    create policy ce_round_read on rondas_monitoreo for select to authenticated using(true);
    create policy ce_read on mon_conductividad for select to authenticated using(true);
    create policy ce_hidden_round on rondas_monitoreo as restrictive for select to authenticated using(id <> '${CE_QA.hiddenRound}');
    create policy ce_hidden_lot on lotes as restrictive for select to authenticated using(id <> '${CE_QA.hiddenLot}');
  `);
  await ceQaSeed(db);return db;
}
export async function ceQaSeed(db:PGlite) {
  await db.exec('truncate mon_conductividad,rondas_monitoreo;');
  await p2Seed(db);
  await db.query("update lotes set nombre=case when id=$1 then 'QA CE Norte' when id=$2 then 'QA CE Sur' else 'QA CE Vacío' end",[ID.l1,ID.l2]);
  await db.query("insert into lotes values($1,'NO PUBLICAR CE LOTE',true,100,2)",[CE_QA.hiddenLot]);
  await db.query("insert into rondas_monitoreo values($1,'QA CE Coincidente','2026-10-02',null),($2,'NO PUBLICAR CE RONDA','2026-10-02',null)",[CE_QA.visibleRound,CE_QA.hiddenRound]);
  await db.query(`insert into mon_conductividad values
    ($1,$4,null,'2026-10-02',7.25,$7::jsonb,99,6.4),
    ($2,$5,$8,'2026-10-03',0,'[{"arbol":1,"alta":2,"baja":null}]',1,null),
    ($3,$6,null,'2026-10-02',987.65,'[{"arbol":1,"alta":1,"baja":1}]',1,7)`,
  [CE_QA.first,CE_QA.second,CE_QA.hiddenChild,ID.l1,ID.l2,CE_QA.hiddenLot,JSON.stringify(CE_ORACLE.measurements),CE_QA.visibleRound]);
}
