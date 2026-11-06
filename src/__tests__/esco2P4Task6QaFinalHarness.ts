// Final P4-6 controlled source: all rows remain invented prior QA fixtures.
import type { PGlite } from '@electric-sql/pglite';
import { milkQaDb,milkQaSeed } from './esco2P4Task5QaHarness.ts';
import { climaQaSeed } from './esco2P4Task3QaHarness.ts';
export async function p6FinalQaDb():Promise<PGlite> {
  const db=await milkQaDb();
  await db.exec(`create table clima_resumen_diario(
    fecha date not null,station_id text not null,temp_c_min numeric,temp_c_max numeric,temp_c_avg numeric,
    humedad_pct_min numeric,humedad_pct_max numeric,humedad_pct_avg numeric,viento_kmh_avg numeric,rafaga_kmh_max numeric,viento_dir_predominante numeric,
    lluvia_total_mm numeric,lluvia_confianza text not null,lluvia_mm_evento numeric,radiacion_wm2_avg numeric,radiacion_wm2_max numeric,uv_index_max smallint,
    horas_sol_duracion numeric,lecturas_count integer not null,cobertura_hueco_max_min numeric,primary key(fecha,station_id));
    grant select on clima_resumen_diario to anon,authenticated;alter table clima_resumen_diario enable row level security;
    create policy clima_resumen_select_authenticated on clima_resumen_diario for select to authenticated using(true);`);
  await climaQaSeed(db);return db;
}
export async function p6FinalQaSeed(db:PGlite) {await milkQaSeed(db);await climaQaSeed(db);}
