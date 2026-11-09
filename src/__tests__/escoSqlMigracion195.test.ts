// Migración 195 contra Postgres real (PGlite): vistas de hato (eventos, pesajes, quincenal, estado derivado)
// y de monitoreo (orden de ronda, incidencia ponderada). El SQL se EXTRAE del archivo de la migración.
//
// La prueba que importa es la de PARIDAD: la vista v_esco_hato reimplementa en SQL el estado reproductivo y las
// fechas de secar y de parto que calcula derivarEstadoReproductivo() (src/utils/calculosHato.ts). Corre las dos
// sobre las mismas filas sintéticas y exige el mismo resultado. Datos 100 % sintéticos.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  derivarEstadoReproductivo,
  etiquetaEstadoReproductivo,
  type EstadoActualHatoRow,
  type HatoConfig,
} from '../utils/calculosHato.ts';
import { VISTAS_ESCO } from '../utils/escoSql/prompt.ts';

const M195 = readFileSync(new URL('../sql/migrations/195_esco_sql_hato_monitoreo_vistas.sql', import.meta.url), 'utf8');
const M192 = readFileSync(new URL('../sql/migrations/192_esco_sql_vistas_y_rpc.sql', import.meta.url), 'utf8');

function vista(nombre: string): string {
  const m = new RegExp(`CREATE VIEW public\\.${nombre} WITH[\\s\\S]*?;\\n`).exec(M195);
  if (!m) throw new Error(`no encontré la vista ${nombre}`);
  return m[0];
}

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
const dia = (offset: number) => {
  const d = new Date(`${hoy}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const CONFIG = {
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
  meses_secado_por_raza: { _default: 2, holstein: 2, jersey: 2, normanda: 3 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_rechequeo_due: 60,
  dias_espera_voluntaria_post_parto: 90,
} as unknown as HatoConfig;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ESQUEMA = `
create table hato_config (clave text primary key, valor jsonb);
insert into hato_config values
  ('meses_gestacion_default', '9'), ('ventana_proxima_secar_dias', '30'),
  ('meses_secado_por_raza', '{"_default": 2, "holstein": 2, "jersey": 2, "normanda": 3}');
create table v_hato_estado_actual (
  animal_id uuid, numero int, nombre text, etapa text, raza text, estado text, fecha_nacimiento date, num_partos int,
  ultimo_parto_fecha date, ultimo_servicio_fecha date, ultimo_tipo_servicio text,
  ultima_confirmacion_prenez_fecha date, ultima_confirmacion_prenez_metodo text, ultimo_aborto_fecha date,
  ultimo_secado_real_fecha date, ultimo_estado_chequeo text, ultimo_chequeo_fecha date, pl numeric, ultimo_evento_fecha date);
create table hato_animales (id uuid primary key, numero int, nombre text);
create table hato_toros (id uuid primary key, nombre text);
create table hato_eventos (id uuid primary key default gen_random_uuid(), animal_id uuid, tipo text, fecha date, fecha_confianza text,
  toro_id uuid, tipo_servicio text, fuente text);
create table hato_pesajes_leche (id uuid primary key default gen_random_uuid(), animal_id uuid, fecha date, litros_total numeric, fuente text);
create table fin_ingresos (id uuid primary key, cantidad numeric);
create table hato_produccion_quincenal (id uuid primary key default gen_random_uuid(), anio int, mes int, quincena int, fecha_inicio date,
  fecha_fin date, litros_total numeric, num_vacas_ordeno int, origen_dato text, fin_ingreso_id uuid);
create table lotes (id uuid primary key, nombre text);
create table sublotes (id uuid primary key, nombre text);
create table rondas_monitoreo (id uuid primary key, nombre text, fecha_inicio date, fecha_fin date);
create table plagas_enfermedades_catalogo (id uuid primary key, nombre text, tipo text);
create table monitoreos (id uuid primary key default gen_random_uuid(), ronda_id uuid, lote_id uuid, sublote_id uuid, plaga_enfermedad_id uuid,
  fecha_monitoreo date, arboles_afectados int, arboles_monitoreados int);
`;

// PRNG determinista (mulberry32): la prueba debe dar siempre lo mismo.
function prng(semilla: number) {
  let a = semilla;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Caso extends EstadoActualHatoRow { id: string; numero: number }

function generarCasos(n: number): Caso[] {
  const r = prng(195);
  const elige = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const OFFSETS = [null, null, -900, -400, -300, -250, -200, -150, -100, -60, -30, -10, -3, 0, 5, 20];
  const casos: Caso[] = [];
  for (let i = 0; i < n; i++) {
    const f = () => { const o = elige(OFFSETS); return o === null ? null : dia(o); };
    const vacio = r() < 0.1; // sin ningún evento del ciclo (novilla / vacía sin historia)
    const serv = vacio ? null : f(), conf = vacio ? null : f(), sec = vacio ? null : f(), parto = vacio ? null : f();
    const maxCiclo = [serv, conf, sec, parto].filter((x): x is string => !!x).sort().at(-1) ?? null;
    // El último evento: nada, el mismo máximo, uno posterior (aborto o no) o uno anterior.
    const tipoEvento = elige(['ninguno', 'igual', 'posterior_aborto', 'posterior_otro', 'anterior']);
    let evento: string | null = null;
    let aborto: string | null = r() < 0.2 ? dia(-500) : null;
    if (tipoEvento === 'igual') evento = maxCiclo;
    else if (tipoEvento === 'posterior_aborto' || tipoEvento === 'posterior_otro') {
      const base = maxCiclo ?? dia(-100);
      const d = new Date(`${base}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1 + Math.floor(r() * 20));
      evento = d.toISOString().slice(0, 10);
      if (tipoEvento === 'posterior_aborto') aborto = evento;
    } else if (tipoEvento === 'anterior') evento = dia(-950);
    casos.push({
      id: uuid(1000 + i),
      numero: i + 1,
      etapa: elige(['ternera', 'novilla', 'vaca', 'vaca', 'vaca', 'toro']),
      raza: elige([null, 'jersey', 'Jersey ', 'holstein', 'normanda', 'gyr', '']),
      estado: elige(['activa', 'activa', 'activa', 'activa', 'vendida', 'muerta', 'descartada']),
      num_partos: Math.floor(r() * 12),
      ultimo_chequeo_fecha: null,
      ultimo_servicio_fecha: serv,
      ultimo_parto_fecha: parto,
      ultimo_secado_real_fecha: sec,
      ultima_confirmacion_prenez_fecha: conf,
      ultimo_evento_fecha: evento,
      ultima_confirmacion_prenez_metodo: conf ? elige([null, 'palpacion', 'presuncion']) : null,
      ultimo_aborto_fecha: aborto,
      ultimo_estado_chequeo: null,
    } as Caso);
  }
  // Casos de BORDE de la ventana de «por secar» (30 días): el secado cae a hoy+28 … hoy+32 y a hoy-1, hoy y hoy+1.
  // Sin ellos el azar casi nunca cae justo en el límite y un `<` en lugar de `<=` pasaría desapercibido.
  let k = 0;
  for (const raza of ['jersey', 'normanda', null]) {
    for (const hasta of [-1, 0, 1, 28, 29, 30, 31, 32]) {
      for (const metodo of [null, 'palpacion'] as const) {
        const meses = raza === 'normanda' ? 6 : 7; // gestación 9 − meses de secado (2; 3 en normanda)
        const d = new Date(`${dia(hasta)}T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - meses);
        const serv = d.toISOString().slice(0, 10);
        casos.push({
          id: uuid(9000 + k), numero: 9000 + k++, etapa: 'vaca', raza, estado: 'activa', num_partos: 2, ultimo_chequeo_fecha: null,
          ultimo_servicio_fecha: serv, ultimo_parto_fecha: null, ultimo_secado_real_fecha: null,
          ultima_confirmacion_prenez_fecha: metodo ? serv : null, ultima_confirmacion_prenez_metodo: metodo,
          ultimo_evento_fecha: serv, ultimo_aborto_fecha: null, ultimo_estado_chequeo: null,
        } as Caso);
      }
    }
  }
  return casos;
}

let db: PGlite;
const CASOS = generarCasos(2500);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUEMA);
  for (const c of CASOS) {
    await db.query(
      `insert into v_hato_estado_actual(animal_id, numero, nombre, etapa, raza, estado, num_partos, ultimo_parto_fecha, ultimo_servicio_fecha,
         ultima_confirmacion_prenez_fecha, ultima_confirmacion_prenez_metodo, ultimo_aborto_fecha, ultimo_secado_real_fecha, ultimo_evento_fecha)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.id, c.numero, `vaca ${c.numero}`, c.etapa, c.raza, c.estado, c.num_partos, c.ultimo_parto_fecha, c.ultimo_servicio_fecha,
        c.ultima_confirmacion_prenez_fecha, c.ultima_confirmacion_prenez_metodo, c.ultimo_aborto_fecha, c.ultimo_secado_real_fecha, c.ultimo_evento_fecha],
    );
  }
  for (const n of ['v_esco_hato_eventos', 'v_esco_hato_pesajes', 'v_esco_hato_produccion_quincenal', 'v_esco_hato', 'v_esco_monitoreo', 'v_esco_monitoreo_ronda_plaga']) {
    await db.exec(vista(n));
  }
}, 60000);
afterAll(async () => { await db.close(); });

describe('195 · hato — paridad del estado derivado con derivarEstadoReproductivo()', () => {
  it('el mismo estado, la misma fecha de secar y la misma fecha probable de parto en más de 2.500 filas', async () => {
    const r = await db.query<{ animal_id: string; estado_reproductivo: string; estado_pantalla: string; fecha_secar: string | null; fecha_probable_parto: string | null }>(
      `select animal_id, estado_reproductivo, estado_pantalla, to_char(fecha_secar,'YYYY-MM-DD') fecha_secar, to_char(fecha_probable_parto,'YYYY-MM-DD') fecha_probable_parto from v_esco_hato`);
    expect(r.rows).toHaveLength(CASOS.length);
    expect(CASOS.filter((c) => c.numero >= 9000)).toHaveLength(48);
    const porId = new Map(r.rows.map((x) => [x.animal_id, x]));
    const diferencias: string[] = [];
    for (const c of CASOS) {
      const ts = derivarEstadoReproductivo(c, CONFIG, hoy);
      const sql = porId.get(c.id)!;
      if (sql.estado_reproductivo !== ts.estado) diferencias.push(`estado ${c.numero}: sql=${sql.estado_reproductivo} ts=${ts.estado}`);
      if (sql.estado_pantalla !== etiquetaEstadoReproductivo(ts.estado)) diferencias.push(`etiqueta ${c.numero}: sql=${sql.estado_pantalla} ts=${etiquetaEstadoReproductivo(ts.estado)}`);
      if (sql.fecha_secar !== ts.fecha_secar) diferencias.push(`secar ${c.numero}: sql=${sql.fecha_secar} ts=${ts.fecha_secar}`);
      if (sql.fecha_probable_parto !== ts.fecha_probable_parto) diferencias.push(`pp ${c.numero}: sql=${sql.fecha_probable_parto} ts=${ts.fecha_probable_parto}`);
    }
    expect(diferencias.slice(0, 10)).toEqual([]);
  });

  it('la muestra cubre todos los estados que produce el motor (si no, la paridad no prueba nada)', async () => {
    const vistos = new Set(CASOS.map((c) => derivarEstadoReproductivo(c, CONFIG, hoy).estado));
    for (const e of ['cria', 'novilla', 'servida', 'preñada', 'proxima_a_secar', 'seca', 'parida_reciente', 'vacia_por_servir', 'indeterminado', 'vendida', 'muerta']) {
      expect(vistos.has(e as never), e).toBe(true);
    }
  });

  it('no pierde ni duplica animales', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int n from v_esco_hato');
    expect(r.rows[0].n).toBe(CASOS.length);
  });

  it('lee los parámetros de hato_config en vivo: con 12 meses de gestación las fechas se mueven', async () => {
    await db.exec(`update hato_config set valor = '12' where clave = 'meses_gestacion_default'`);
    const casoConCiclo = CASOS.find((c) => derivarEstadoReproductivo(c, CONFIG, hoy).fecha_probable_parto)!;
    const r = await db.query<{ pp: string }>(`select to_char(fecha_probable_parto,'YYYY-MM-DD') pp from v_esco_hato where animal_id = '${casoConCiclo.id}'`);
    await db.exec(`update hato_config set valor = '9' where clave = 'meses_gestacion_default'`);
    const d = new Date(`${casoConCiclo.ultimo_servicio_fecha}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 3);
    expect(r.rows[0].pp.slice(0, 7)).not.toBe(derivarEstadoReproductivo(casoConCiclo, CONFIG, hoy).fecha_probable_parto!.slice(0, 7));
  });
});

describe('195 · hato — hechos', () => {
  it('eventos: partos por año con la chapeta y el toro, y los de otro tipo no se mezclan', async () => {
    await db.exec(`
      insert into hato_animales values ('${uuid(1)}', 101, 'Paula'), ('${uuid(2)}', 102, 'Mona');
      insert into hato_toros values ('${uuid(9)}', 'Jersey Uno');
      insert into hato_eventos(animal_id, tipo, fecha, fecha_confianza, toro_id, tipo_servicio, fuente) values
        ('${uuid(1)}', 'parto', '2026-03-01', 'exacta', null, null, 'chequeo'),
        ('${uuid(1)}', 'servicio', '2026-05-01', 'exacta', '${uuid(9)}', 'inseminacion', 'telegram'),
        ('${uuid(2)}', 'parto', '2025-12-30', 'aproximada', null, null, 'chequeo'),
        ('${uuid(2)}', 'parto', '2026-07-10', 'exacta', null, null, 'web');`);
    const partos = await db.query<{ n: number }>("select count(*)::int n from v_esco_hato_eventos where tipo = 'parto' and fecha >= date '2026-01-01' and fecha < date '2027-01-01'");
    expect(partos.rows[0].n).toBe(2);
    const serv = await db.query<Record<string, unknown>>("select chapeta, toro, tipo_servicio from v_esco_hato_eventos where tipo = 'servicio'");
    expect(serv.rows).toEqual([{ chapeta: 101, toro: 'Jersey Uno', tipo_servicio: 'inseminacion' }]);
  });

  it('pesajes: una fila por vaca y fecha con sus litros', async () => {
    await db.exec(`insert into hato_pesajes_leche(animal_id, fecha, litros_total, fuente) values
      ('${uuid(1)}', '2026-10-28', 12.5, 'foto'), ('${uuid(2)}', '2026-10-28', 9, 'foto'), ('${uuid(1)}', '2026-10-21', 11, 'web')`);
    const r = await db.query<{ n: number; ultima: string; litros: string }>(
      "select count(*)::int n, to_char(max(fecha),'YYYY-MM-DD') ultima, sum(litros) litros from v_esco_hato_pesajes where fecha >= date '2026-01-01'");
    expect(r.rows[0]).toMatchObject({ n: 3, ultima: '2026-10-28' });
    expect(Number(r.rows[0].litros)).toBe(32.5);
  });

  it('quincenal: los litros de una quincena medida salen de la venta; la derivada trae los suyos; sin dinero', async () => {
    await db.exec(`
      insert into fin_ingresos values ('${uuid(70)}', 5000);
      insert into hato_produccion_quincenal(anio, mes, quincena, fecha_inicio, fecha_fin, litros_total, num_vacas_ordeno, origen_dato, fin_ingreso_id) values
        (2026, 10, 1, '2026-10-01', '2026-10-15', null, 30, 'medido', '${uuid(70)}'),
        (2026, 10, 2, '2026-10-16', '2026-10-31', 4000, 28, 'derivado_mensual', null)`);
    const r = await db.query<{ quincena: number; litros: string }>('select quincena, litros from v_esco_hato_produccion_quincenal order by quincena');
    expect(r.rows.map((f) => [f.quincena, Number(f.litros)])).toEqual([[1, 5000], [2, 4000]]);
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'v_esco_hato_produccion_quincenal'")).rows.map((c) => c.column_name);
    expect(cols).not.toContain('valor');
    expect(cols.some((c) => /precio|valor|dinero/.test(c))).toBe(false);
  });
});

describe('195 · monitoreo — última ronda e incidencia ponderada', () => {
  const R1 = uuid(201), R2 = uuid(202), L1 = uuid(211), L2 = uuid(212), P = uuid(221);

  beforeAll(async () => {
    await db.exec(`
      insert into lotes values ('${L1}', '1. Norte'), ('${L2}', '2. Sur');
      insert into plagas_enfermedades_catalogo values ('${P}', 'Ácaro', 'Plaga');
      insert into rondas_monitoreo values ('${R1}', 'Ronda 1', '2026-10-01', '2026-10-05'), ('${R2}', 'Ronda 2', '2026-11-01', null);
      insert into monitoreos(ronda_id, lote_id, plaga_enfermedad_id, fecha_monitoreo, arboles_afectados, arboles_monitoreados) values
        ('${R1}', '${L1}', '${P}', '2026-10-02', 1, 10),
        ('${R2}', '${L1}', '${P}', '2026-11-02', 1, 10),
        ('${R2}', '${L2}', '${P}', '2026-11-02', 9, 10),
        (null,    '${L1}', '${P}', '2026-11-05', 5, 10);`);
  });

  it('«ORDER BY ronda_inicio DESC LIMIT 1» elige las filas SIN ronda (el defecto): la vista da la ronda real con es_ultima_ronda', async () => {
    const mala = await db.query<{ ronda: string | null }>('select ronda from v_esco_monitoreo order by ronda_inicio desc limit 1');
    expect(mala.rows[0].ronda).toBeNull(); // el error que cometía el modelo
    const buena = await db.query<{ ronda: string }>('select distinct ronda from v_esco_monitoreo where es_ultima_ronda');
    expect(buena.rows).toEqual([{ ronda: 'Ronda 2' }]);
  });

  it('ronda_orden: 1 = la más reciente; las filas sin ronda quedan NULL y nunca son «última»', async () => {
    const r = await db.query<{ ronda: string | null; ronda_orden: number | null; es_ultima_ronda: boolean }>(
      'select distinct ronda, ronda_orden, es_ultima_ronda from v_esco_monitoreo order by ronda_orden nulls last');
    expect(r.rows).toEqual([
      { ronda: 'Ronda 2', ronda_orden: 1, es_ultima_ronda: true },
      { ronda: 'Ronda 1', ronda_orden: 2, es_ultima_ronda: false },
      { ronda: null, ronda_orden: null, es_ultima_ronda: false },
    ]);
  });

  it('incidencia ponderada por ronda y plaga = Σ afectados / Σ monitoreados, no el promedio de porcentajes', async () => {
    const r = await db.query<{ incidencia_pct: string; n_lotes: number; n_observaciones: number }>(
      "select incidencia_pct, n_lotes, n_observaciones from v_esco_monitoreo_ronda_plaga where ronda = 'Ronda 2'");
    expect(Number(r.rows[0].incidencia_pct)).toBe(50); // (1+9)/(10+10), no (10 % + 90 %)/2
    expect(Number(r.rows[0].n_lotes)).toBe(2);
    expect(Number(r.rows[0].n_observaciones)).toBe(2);
  });

  it('la vista por ronda y plaga no incluye las observaciones sin ronda', async () => {
    const r = await db.query<{ n: number }>('select count(*)::int n from v_esco_monitoreo_ronda_plaga where ronda is null');
    expect(r.rows[0].n).toBe(0);
  });

  it('las observaciones se cuentan con SUM(n_observaciones), no con COUNT(*) de la vista agregada', async () => {
    const r = await db.query<{ filas_vista: number; observaciones: number }>(
      "select count(*)::int filas_vista, sum(n_observaciones)::int observaciones from v_esco_monitoreo where fecha_primera >= date '2026-11-01'");
    expect(r.rows[0]).toEqual({ filas_vista: 3, observaciones: 3 });
    await db.exec(`insert into monitoreos(ronda_id, lote_id, plaga_enfermedad_id, fecha_monitoreo, arboles_afectados, arboles_monitoreados)
      values ('${R2}', '${L1}', '${P}', '2026-11-03', 2, 10)`);
    const r2 = await db.query<{ filas_vista: number; observaciones: number }>(
      "select count(*)::int filas_vista, sum(n_observaciones)::int observaciones from v_esco_monitoreo where fecha_primera >= date '2026-11-01'");
    expect(r2.rows[0]).toEqual({ filas_vista: 3, observaciones: 4 }); // la vista agrega: 3 filas, 4 observaciones
  });
});

describe('195 · contrato del archivo', () => {
  it('crea 6 vistas con security_invoker, reemplaza solo v_esco_hato y v_esco_monitoreo y no usa CASCADE', () => {
    const creadas = [...M195.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH \(security_invoker = true\)/g)].map((m) => m[1]).sort();
    expect(creadas).toEqual(['v_esco_hato', 'v_esco_hato_eventos', 'v_esco_hato_pesajes', 'v_esco_hato_produccion_quincenal', 'v_esco_monitoreo', 'v_esco_monitoreo_ronda_plaga']);
    expect([...M195.matchAll(/^DROP VIEW public\.(v_esco_\w+);/gm)].map((m) => m[1]).sort()).toEqual(['v_esco_hato', 'v_esco_monitoreo']);
    expect(M195).not.toMatch(/DROP VIEW[^;]*CASCADE/i);
    expect(M195).not.toMatch(/CREATE (OR REPLACE )?FUNCTION/i);
  });

  it('las 14 vistas de la 192 + 195 (sin repetir) están descritas en el prompt, y al revés', () => {
    const de192 = [...M192.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH/g)].map((m) => m[1]);
    const de195 = [...M195.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH/g)].map((m) => m[1]);
    expect([...new Set([...de192, ...de195])].sort()).toEqual(VISTAS_ESCO.map((v) => v.nombre).sort());
    expect(VISTAS_ESCO).toHaveLength(14);
  });

  it('la vista de hato no vuelve a copiar las fechas probables del último chequeo', () => {
    const v = vista('v_esco_hato');
    expect(v).toMatch(/e\.pp_derivada\s+AS fecha_probable_parto/);
    expect(v).toMatch(/e\.secar_derivada\s+AS fecha_secar/);
    expect(v).not.toMatch(/h\.fecha_probable_parto|h\.fecha_secar/);
  });

  it('mismos permisos que la 192 y no escribe datos', () => {
    expect(M195).toMatch(/REVOKE ALL ON public\.v_esco_hato[\s\S]*?FROM PUBLIC, anon/);
    expect(M195).toMatch(/GRANT SELECT ON public\.v_esco_hato[\s\S]*?TO authenticated, service_role/);
    expect(M195).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  });
});
