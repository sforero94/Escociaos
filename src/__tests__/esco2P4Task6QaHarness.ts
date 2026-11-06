// P4-6 independent combined SQL fixture. Reuses only invented prior QA rows.
import type { PGlite } from '@electric-sql/pglite';
import { MON,monQaDb,monQaSeed } from './esco2P4Task1QaHarness.ts';
import { climaQaSeed } from './esco2P4Task3QaHarness.ts';
import { ID } from './esco2P2Harness.ts';

export { MON,ID };
export const P6_CE='98000000-0000-4000-8000-000000000001';
export const P6_ORACLE={monitoring:{afectados:20,muestreados:120,observaciones:3,incidencia:100/6},climate:{promedio:10,usables:1},conductivity:{guardado:7.25,individual:1,ph:6.4},laborTask:1.25} as const;
export async function p6QaDb():Promise<PGlite> {
  const db=await monQaDb();
  await db.exec(`create table clima_resumen_diario(
    fecha date not null,station_id text not null,temp_c_min numeric,temp_c_max numeric,temp_c_avg numeric,
    humedad_pct_min numeric,humedad_pct_max numeric,humedad_pct_avg numeric,viento_kmh_avg numeric,rafaga_kmh_max numeric,viento_dir_predominante numeric,
    lluvia_total_mm numeric,lluvia_confianza text not null,lluvia_mm_evento numeric,radiacion_wm2_avg numeric,radiacion_wm2_max numeric,uv_index_max smallint,
    horas_sol_duracion numeric,lecturas_count integer not null,cobertura_hueco_max_min numeric,primary key(fecha,station_id));
    create table mon_conductividad(id uuid primary key,lote_id uuid not null,ronda_id uuid,fecha_monitoreo date not null,valor_ce numeric not null,lecturas jsonb,num_arboles integer,ph numeric);
    grant select on clima_resumen_diario,mon_conductividad to anon,authenticated;
    alter table clima_resumen_diario enable row level security;
    alter table mon_conductividad enable row level security;
    create policy clima_resumen_select_authenticated on clima_resumen_diario for select to authenticated using(true);
    create policy qa_ce_read on mon_conductividad for select to authenticated using(true);`);
  await p6QaSeed(db);return db;
}
export async function p6QaSeed(db:PGlite) {
  await monQaSeed(db);await climaQaSeed(db);
  await db.exec('truncate mon_conductividad;');
  await db.query("insert into mon_conductividad values($1,$2,null,'2026-10-02',7.25,'[{\"arbol\":1,\"alta\":null,\"baja\":0.5},{\"arbol\":2,\"alta\":1.5,\"baja\":null}]',2,6.4)",[P6_CE,ID.l1]);
}
