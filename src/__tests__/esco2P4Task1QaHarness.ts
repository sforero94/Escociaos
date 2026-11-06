// P4-1 QA: invented SQL rows and literal expectations, independent of the runtime.
import type { PGlite } from '@electric-sql/pglite';
import { ID, p2Db, p2Seed } from './esco2P2Harness.ts';

export const MON = {
  r1: '71000000-0000-4000-8000-000000000001',
  r2: '71000000-0000-4000-8000-000000000002',
  last: '71000000-0000-4000-8000-000000000003',
  hiddenRound: '71000000-0000-4000-8000-000000000004',
  s1: '72000000-0000-4000-8000-000000000001',
  s2: '72000000-0000-4000-8000-000000000002',
  pest1: '73000000-0000-4000-8000-000000000001',
  pest2: '73000000-0000-4000-8000-000000000002',
  hiddenPest: '73000000-0000-4000-8000-000000000003',
  hiddenLot: 'a1000000-0000-4000-8000-000000000004',
  o1: '74000000-0000-4000-8000-000000000001',
  o2: '74000000-0000-4000-8000-000000000002',
  o3: '74000000-0000-4000-8000-000000000003',
  o4: '74000000-0000-4000-8000-000000000004',
} as const;

// The requested population is three observations in r1/l1/s1/pest1: 1/10+15/90+4/20.
// These are observations of sampled trees, not 120 distinct trees.
export const MON_ORACLE = {
  weighted: { afectados: 20, muestreados: 120, observaciones: 3, incidencia: 100 / 6, gravedad: 'Media' },
  roundOnePestOne: { afectados: 22, muestreados: 140, observaciones: 4, incidencia: 110 / 7, gravedad: 'Media' },
  secondRound: { afectados: 0, muestreados: 10, observaciones: 1, incidencia: 0, gravedad: 'Baja' },
  distinctDates: ['2026-10-01', '2026-10-03'],
} as const;

export async function monQaDb(): Promise<PGlite> {
  const db = await p2Db();
  await db.exec(`
    create table rondas_monitoreo(id uuid primary key,nombre text,fecha_inicio date not null,fecha_fin date);
    create table sublotes(id uuid primary key,lote_id uuid not null,nombre text not null);
    create table plagas_enfermedades_catalogo(id uuid primary key,nombre text not null);
    create table monitoreos(id uuid primary key,ronda_id uuid,fecha_monitoreo date not null,lote_id uuid not null,sublote_id uuid,plaga_enfermedad_id uuid not null,arboles_monitoreados int not null,arboles_afectados int not null);
    grant select on rondas_monitoreo,sublotes,plagas_enfermedades_catalogo,monitoreos to anon,authenticated;
    alter table rondas_monitoreo enable row level security;
    alter table sublotes enable row level security;
    alter table plagas_enfermedades_catalogo enable row level security;
    alter table monitoreos enable row level security;
    create policy "Usuarios autenticados pueden leer rondas_monitoreo" on rondas_monitoreo for select to authenticated using(true);
    create policy "Usuarios autenticados pueden leer sublotes" on sublotes for select to authenticated using(true);
    create policy "Usuarios autenticados pueden leer plagas" on plagas_enfermedades_catalogo for select to authenticated using(true);
    create policy "Usuarios autenticados pueden leer monitoreos" on monitoreos for select to authenticated using(true);
    -- Stricter adversarial scopes expose children while withholding each kind of parent.
    create policy qa_hidden_round on rondas_monitoreo as restrictive for select to authenticated using(id <> '${MON.hiddenRound}');
    create policy qa_hidden_lot on lotes as restrictive for select to authenticated using(id <> '${MON.hiddenLot}');
    create policy qa_hidden_pest on plagas_enfermedades_catalogo as restrictive for select to authenticated using(id <> '${MON.hiddenPest}');
  `);
  await monQaSeed(db);
  return db;
}

export async function monQaSeed(db: PGlite) {
  await db.exec('truncate rondas_monitoreo,sublotes,plagas_enfermedades_catalogo,monitoreos;');
  await p2Seed(db);
  await db.query("update lotes set nombre=case when id=$1 then 'QA Norte' when id=$2 then 'QA Sur' else 'QA Vacío' end", [ID.l1,ID.l2]);
  await db.query("insert into lotes values($1,'NO PUBLICAR LOTE',true,1000,2)", [MON.hiddenLot]);
  await db.query(`insert into rondas_monitoreo values
    ($1,'QA Alfa','2026-10-01','2026-10-03'),
    ($2,'QA Beta','2026-10-01','2026-10-01'),
    ($3,'QA Última','2026-10-10',null),
    ($4,'NO PUBLICAR RONDA','2026-10-20',null)`, [MON.r1,MON.r2,MON.last,MON.hiddenRound]);
  await db.query("insert into sublotes values($1,$3,'QA Subnorte'),($2,$4,'QA Subsur')", [MON.s1,MON.s2,ID.l1,ID.l2]);
  await db.query("insert into plagas_enfermedades_catalogo values($1,'QA Plaga Uno'),($2,'QA Plaga Dos'),($3,'NO PUBLICAR PLAGA')", [MON.pest1,MON.pest2,MON.hiddenPest]);
  await db.query(`insert into monitoreos values
    ($1,$5,'2026-10-01',$9,$11,$13,10,1),
    ($2,$5,'2026-10-01',$9,$11,$13,90,15),
    ($3,$5,'2026-10-03',$9,$11,$13,20,4),
    ($4,$5,'2026-10-03',$10,$12,$13,20,2),
    ('74000000-0000-4000-8000-000000000005',$6,'2026-10-01',$9,$11,$13,10,0),
    ('74000000-0000-4000-8000-000000000006',$5,'2026-10-01',$9,$11,$14,10,3),
    ('74000000-0000-4000-8000-000000000007',$7,'2026-10-10',$10,$12,$14,10,5),
    ('74000000-0000-4000-8000-000000000008',null,'2026-10-01',$9,$11,$13,20,17),
    ('74000000-0000-4000-8000-000000000009',$8,'2026-10-20',$9,$11,$13,100,99),
    ('74000000-0000-4000-8000-000000000010',$5,'2026-10-01',$15,null,$13,1000,777),
    ('74000000-0000-4000-8000-000000000011',$5,'2026-10-01',$9,$11,$16,1000,888)`,
  [MON.o1,MON.o2,MON.o3,MON.o4,MON.r1,MON.r2,MON.last,MON.hiddenRound,ID.l1,ID.l2,MON.s1,MON.s2,MON.pest1,MON.pest2,MON.hiddenLot,MON.hiddenPest]);
}
