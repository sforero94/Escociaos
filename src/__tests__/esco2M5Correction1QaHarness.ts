// New synthetic correction-cycle source. No campaign inputs or original oracles.
import type { PGlite } from '@electric-sql/pglite';
import { p6FinalQaDb } from './esco2P4Task6QaFinalHarness.ts';
import { HATO_QA } from './esco2P4Task5QaHarness.ts';
import { ID } from './esco2P2Harness.ts';
export const CORRECTION_QA={animal:HATO_QA.main,lot:ID.l1,station:'QA-NUEVA-BRUMA',animalName:'QA Nimbo Cardamomo',lotName:'QA Faro Cuatro',ce:'ad710000-0000-4000-8000-000000000001'} as const;
export async function correctionQaDb():Promise<PGlite> {
  const db=await p6FinalQaDb();
  await db.exec(`create table rondas_monitoreo(id uuid primary key);
    create table mon_conductividad(id uuid primary key,lote_id uuid not null,ronda_id uuid,fecha_monitoreo date not null,valor_ce numeric not null,lecturas jsonb,num_arboles integer,ph numeric);
    grant select on rondas_monitoreo,mon_conductividad to anon,authenticated;
    alter table rondas_monitoreo enable row level security;alter table mon_conductividad enable row level security;
    create policy correction_round_read on rondas_monitoreo for select to authenticated using(true);
    create policy correction_ce_read on mon_conductividad for select to authenticated using(true);`);
  await correctionQaSeed(db);return db;
}
export async function correctionQaSeed(db:PGlite) {
  await db.exec('truncate clima_resumen_diario,hato_pesajes_leche,mon_conductividad;');
  await db.query('update hato_animales set nombre=$1 where id=$2',[CORRECTION_QA.animalName,CORRECTION_QA.animal]);
  await db.query('update lotes set nombre=$1 where id=$2',[CORRECTION_QA.lotName,CORRECTION_QA.lot]);
  await db.query(`insert into clima_resumen_diario(fecha,station_id,temp_c_avg,humedad_pct_avg,lluvia_confianza,lecturas_count,cobertura_hueco_max_min) values
    ('2025-02-01',$1,4,30,'ok',48,30),('2025-02-02',$1,8,40,'ok',48,30),('2025-02-03',$1,40,80,'ok',48,30)`,[CORRECTION_QA.station]);
  await db.query(`insert into hato_pesajes_leche values
    ('ad720000-0000-4000-8000-000000000001',$1,'2025-03-01',6,2,4,'qa-sintetica-nueva'),
    ('ad720000-0000-4000-8000-000000000002',$1,'2025-03-02',1,1,null,'qa-sintetica-nueva')`,[CORRECTION_QA.animal]);
  await db.query(`insert into mon_conductividad values($1,$2,null,'2025-04-07',4.6,'[{"arbol":101,"alta":0.3,"baja":null},{"arbol":102,"alta":1.3,"baja":1.3}]',2,null)`,[CORRECTION_QA.ce,CORRECTION_QA.lot]);
}
