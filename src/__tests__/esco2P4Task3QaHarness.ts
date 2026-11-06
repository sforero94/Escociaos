// Independent P4-3 QA fixture: invented dates, stations and sensor values.
// Frozen before runtime. The oracle does not call climate runtime calculations.
import type { PGlite } from '@electric-sql/pglite';
import { p2Db } from './esco2P2Harness.ts';

export const CLIMA_COLUMNAS = ['fecha','station_id','temp_c_min','temp_c_max','temp_c_avg','humedad_pct_min','humedad_pct_max','humedad_pct_avg','viento_kmh_avg','rafaga_kmh_max','viento_dir_predominante','lluvia_total_mm','lluvia_confianza','lluvia_mm_evento','radiacion_wm2_avg','radiacion_wm2_max','uv_index_max','horas_sol_duracion','lecturas_count','cobertura_hueco_max_min'];
export const CLIMA_ORACLE = {
  // 2026-10-04 es una cota de 0 mm: sin dato (CLAUDE.md 122), no una cota medida.
  lluvia: { subtotal_dias_completos:5,cota_inferior_medida:5,dias_completos:3,dias_cota_inferior:1,dias_sin_dato:6 },
  lluviaCobertura: {solicitados:10,usables:4,nulos_no_usables:5,sin_fila:1,calidad_desconocida:1},
  temperatura: {promedio:45,min:10,max:80,cobertura:{solicitados:10,usables:8,nulos_no_usables:1,sin_fila:1,calidad_desconocida:1}},
  humedad: {promedio:450/7,min:0,max:100,cobertura:{solicitados:10,usables:7,nulos_no_usables:2,sin_fila:1,calidad_desconocida:1}},
} as const;

export async function climaQaDb():Promise<PGlite> {
  const db=await p2Db();
  await db.exec(`create table clima_resumen_diario(
    fecha date not null,station_id text not null,
    temp_c_min numeric,temp_c_max numeric,temp_c_avg numeric,
    humedad_pct_min numeric,humedad_pct_max numeric,humedad_pct_avg numeric,
    viento_kmh_avg numeric,rafaga_kmh_max numeric,viento_dir_predominante numeric,
    lluvia_total_mm numeric,lluvia_confianza text not null check(lluvia_confianza in ('ok','contador_congelado','sin_time_piezo','cobertura_parcial','reconstruido')),lluvia_mm_evento numeric,
    radiacion_wm2_avg numeric,radiacion_wm2_max numeric,uv_index_max smallint,
    horas_sol_duracion numeric,lecturas_count integer not null,cobertura_hueco_max_min numeric,
    primary key(fecha,station_id));
    grant select on clima_resumen_diario to anon,authenticated;
    alter table clima_resumen_diario enable row level security;
    create policy clima_resumen_select_authenticated on clima_resumen_diario for select to authenticated using(true);`);
  await climaQaSeed(db);
  return db;
}

export async function climaQaSeed(db:PGlite) {
  await db.exec(`truncate clima_resumen_diario;
    insert into clima_resumen_diario(fecha,station_id,temp_c_avg,humedad_pct_avg,lluvia_total_mm,lluvia_confianza,lluvia_mm_evento,radiacion_wm2_avg,horas_sol_duracion,lecturas_count,cobertura_hueco_max_min) values
    ('2026-10-01','QA-A',10,50,2,'ok',999,100,4,48,30),
    ('2026-10-02','QA-A',NULL,60,90,'contador_congelado',888,NULL,NULL,288,5),
    ('2026-10-03','QA-A',20,70,5,'cobertura_parcial',777,200,NULL,288,120),
    ('2026-10-04','QA-A',30,NULL,0,'cobertura_parcial',666,NULL,NULL,288,180),
    ('2026-10-05','QA-A',40,80,NULL,'cobertura_parcial',555,NULL,NULL,10,120),
    ('2026-10-06','QA-A',50,90,3,'reconstruido',444,NULL,8,48,30),
    ('2026-10-08','QA-A',60,100,NULL,'ok',333,300,6,1,NULL),
    ('2026-10-09','QA-A',70,NULL,NULL,'ok',222,NULL,2,288,90),
    ('2026-10-10','QA-A',80,0,0,'ok',111,0,0,48,45);`);
}
