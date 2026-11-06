// Independent P4-4 QA: invented herd, actual local SQL/JWT/RLS and literal oracles.
import type { PGlite } from '@electric-sql/pglite';
import { p2Db,p2Seed } from './esco2P2Harness.ts';
export const HATO_QA={
  main:'a4400000-0000-4000-8000-000000000001',
  twinActive:'a4400000-0000-4000-8000-000000000002',
  twinSold:'a4400000-0000-4000-8000-000000000003',
  provisional:'a4400000-0000-4000-8000-000000000004',
  hidden:'a4400000-0000-4000-8000-000000000005',
  calf:'a4400000-0000-4000-8000-000000000006',
  bull:'a4400000-0000-4000-8000-000000000007',
  hiddenBull:'a4400000-0000-4000-8000-000000000008',
  eventService:'b4400000-0000-4000-8000-000000000001',
  eventConfirmation:'b4400000-0000-4000-8000-000000000002',
  eventBirth:'b4400000-0000-4000-8000-000000000003',
  check:'c4400000-0000-4000-8000-000000000001',
  checkRow:'d4400000-0000-4000-8000-000000000001',
} as const;
// Deliberately synthetic settings differ from typical production defaults.
export const HATO_CONFIG_QA={
  razas:['qa-raza'],meses_secado_por_raza:{'qa-raza':2,_default:1},meses_gestacion_default:10,
  umbral_partos_reemplazo:3,ventana_proxima_secar_dias:11,ventana_proximo_parir_dias:13,
  dias_parto_proximo_alerta:17,dias_servicio_sin_confirmacion:41,dias_rechequeo_due:43,
  dias_espera_voluntaria_post_parto:47,meses_ternera_leche_max:4,meses_ternera_max:14,
} as const;
export const HATO_ORACLE={
  today:'2026-11-05',mainName:'QA Lira',mainNumber:601,
  confirmed:{estado:'preñada',fecha_secar:'2027-04-01',fecha_probable_parto:'2027-06-01',dias_abiertos:31,tiempo_prenez_dias:96,senal_revision:null},
  presumed:{estado:'servida',fecha_secar:'2027-04-01',fecha_probable_parto:'2027-06-01',dias_abiertos:31,tiempo_prenez_dias:null,senal_revision:null},
  aborted:{estado:'vacia_por_servir',fecha_secar:null,fecha_probable_parto:null,dias_abiertos:null,senal_revision:{tipo:'aborto',fecha:'2026-10-20'}},
} as const;
export async function hatoQaDb():Promise<PGlite>{
  const db=await p2Db();
  await db.exec(`
    create table hato_animales(id uuid primary key,numero int,nombre text,sexo text,etapa text not null,raza text,estado text not null,fecha_estado date,fecha_nacimiento date,fecha_nacimiento_confianza text not null,madre_id uuid,padre_id uuid,padre_toro_id uuid,finca_id uuid,origen text,confianza text not null,etapa_forzada bool not null);
    create table hato_toros(id uuid primary key,nombre text not null);
    create table hato_eventos(id uuid primary key,animal_id uuid not null,tipo text not null,fecha date not null,datos jsonb,created_at timestamptz,toro_id uuid,tipo_servicio text);
    create table hato_chequeos(id uuid primary key,fecha date not null);
    create table hato_chequeo_vacas(id uuid primary key,animal_id uuid not null,chequeo_id uuid not null,created_at timestamptz,pl numeric,meses_prenez numeric,fecha_secar date,fecha_probable_parto date,estado text);
    create table hato_config(clave text primary key,valor jsonb not null);
    grant select on hato_animales,hato_toros,hato_eventos,hato_chequeos,hato_chequeo_vacas,hato_config to anon,authenticated;
    alter table hato_animales enable row level security;
    alter table hato_toros enable row level security;
    alter table hato_eventos enable row level security;
    alter table hato_chequeos enable row level security;
    alter table hato_chequeo_vacas enable row level security;
    alter table hato_config enable row level security;
    create policy hato_animales_read on hato_animales for select to authenticated using(true);
    create policy hato_toros_read on hato_toros for select to authenticated using(true);
    create policy hato_eventos_read on hato_eventos for select to authenticated using(true);
    create policy hato_chequeos_read on hato_chequeos for select to authenticated using(true);
    create policy hato_chequeo_vacas_read on hato_chequeo_vacas for select to authenticated using(true);
    create policy hato_config_read on hato_config for select to authenticated using(true);
    create policy qa_hato_hidden on hato_animales as restrictive for select to authenticated using(id <> '${HATO_QA.hidden}');
    create policy qa_hato_hidden_bull on hato_toros as restrictive for select to authenticated using(id <> '${HATO_QA.hiddenBull}');
    create view v_hato_estado_actual with(security_invoker=true) as
      select a.id animal_id,a.etapa,a.raza,a.estado,a.fecha_nacimiento,a.etapa_forzada,
      (select count(*) from hato_eventos e where e.animal_id=a.id and e.tipo='parto') num_partos,
      (select max(c.fecha) from hato_chequeo_vacas cv join hato_chequeos c on c.id=cv.chequeo_id where cv.animal_id=a.id) ultimo_chequeo_fecha,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id and e.tipo='servicio') ultimo_servicio_fecha,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id and e.tipo='parto') ultimo_parto_fecha,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id and e.tipo='secado_real') ultimo_secado_real_fecha,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id and e.tipo='confirmacion_prenez') ultima_confirmacion_prenez_fecha,
      (select e.datos->>'metodo' from hato_eventos e where e.animal_id=a.id and e.tipo='confirmacion_prenez' order by e.fecha desc,e.created_at desc limit 1) ultima_confirmacion_prenez_metodo,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id) ultimo_evento_fecha,
      (select max(e.fecha) from hato_eventos e where e.animal_id=a.id and e.tipo='aborto') ultimo_aborto_fecha,
      (select cv.estado from hato_chequeo_vacas cv join hato_chequeos c on c.id=cv.chequeo_id where cv.animal_id=a.id order by c.fecha desc,cv.created_at desc limit 1) ultimo_estado_chequeo
      from hato_animales a;
    grant select on v_hato_estado_actual to anon,authenticated;
  `);
  await hatoQaSeed(db);return db;
}
export async function hatoQaSeed(db:PGlite){
  await db.exec('truncate hato_animales,hato_toros,hato_eventos,hato_chequeos,hato_chequeo_vacas,hato_config;');
  await p2Seed(db);
  await db.query(`insert into hato_animales values
    ($1,601,'QA Lira','hembra','vaca','qa-raza','activa',null,'2022-06-01','exacta',$5,null,$7,null,'compra','alta',false),
    ($2,602,'QA Homónima','hembra','vaca',null,'activa',null,null,'desconocida',null,null,null,null,'compra','alta',false),
    ($3,602,'QA Homónima','hembra','vaca',null,'vendida','2026-10-01',null,'desconocida',null,null,null,null,'compra','alta',false),
    ($4,901,'QA Aura','hembra','novilla',null,'activa',null,'2024-04-01','aproximada',null,$1,null,null,'nacimiento','media',false),
    ($5,603,'NO PUBLICAR MADRE','hembra','vaca',null,'vendida','2023-01-01','2018-01-01','exacta',null,null,null,null,'compra','alta',false),
    ($6,null,'QA Bebé','hembra','novilla',null,'activa',null,'2026-09-05','aproximada',$1,null,null,null,'nacimiento','media',false)`,
    [HATO_QA.main,HATO_QA.twinActive,HATO_QA.twinSold,HATO_QA.provisional,HATO_QA.hidden,HATO_QA.calf,HATO_QA.bull]);
  await db.query("insert into hato_toros values($1,'QA Toro Norte'),($2,'NO PUBLICAR TORO')",[HATO_QA.bull,HATO_QA.hiddenBull]);
  await db.query(`insert into hato_eventos values
    ($1,$4,'servicio','2026-08-01',null,'2026-10-11T00:00:00Z',null,null),
    ($2,$4,'confirmacion_prenez','2026-08-15','{"metodo":"palpacion"}','2026-08-15T00:00:00Z',null,null),
    ($3,$4,'parto','2026-07-01',null,'2026-07-01T00:00:00Z',null,null)`,
    [HATO_QA.eventService,HATO_QA.eventConfirmation,HATO_QA.eventBirth,HATO_QA.main]);
  await db.query("insert into hato_chequeos values($1,'2026-10-25')",[HATO_QA.check]);
  await db.query("insert into hato_chequeo_vacas values($1,$2,$3,'2026-10-25T12:00:00Z',null,null,'1901-01-01','1902-01-01',null)",[HATO_QA.checkRow,HATO_QA.main,HATO_QA.check]);
  for(const [clave,valor]of Object.entries(HATO_CONFIG_QA))await db.query('insert into hato_config values($1,$2::jsonb)',[clave,JSON.stringify(valor)]);
}
