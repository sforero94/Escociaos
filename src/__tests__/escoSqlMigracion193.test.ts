// Migración 193 contra Postgres real (PGlite): las correcciones de vistas de Esco SQL.
//   F2  ventas frente a ingresos (es_venta + ventas de ganado de ceba)
//   F3  costo de aplicación = el del reporte (compara la vista con calcularCostoAplicacionReal)
//   F4  fecha de cierre sin desplazar un día
//   F10 días calendario sin fila de clima
// El SQL que se prueba se EXTRAE del archivo de la migración, no se copia. Datos 100 % sintéticos.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularCostoAplicacionReal } from '../utils/calculosCostoAplicacionReporte.ts';
import { VISTAS_ESCO } from '../utils/escoSql/prompt.ts';

const M193 = readFileSync(new URL('../sql/migrations/193_esco_sql_correcciones_vistas.sql', import.meta.url), 'utf8');
const M192 = readFileSync(new URL('../sql/migrations/192_esco_sql_vistas_y_rpc.sql', import.meta.url), 'utf8');

function vista(sql: string, nombre: string): string {
  const m = new RegExp(`CREATE VIEW public\\.${nombre} WITH[\\s\\S]*?;\\n`).exec(sql);
  if (!m) throw new Error(`no encontré la vista ${nombre}`);
  return m[0];
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const L1 = uuid(1);
const T_A = uuid(10), T_B = uuid(11);
const P1 = uuid(20), P2 = uuid(21);
const APP_A = uuid(30), APP_B = uuid(31), APP_C = uuid(32), APP_D = uuid(33);
const M_CON_LOTE = uuid(40), M_SIN_LOTE = uuid(41);

const ESQUEMA = `
create type fraccion_jornal as enum ('0.25', '0.5', '0.75', '1.0');
create table lotes (id uuid primary key, nombre text);
create table fin_negocios (id uuid primary key, nombre text);
create table fin_regiones (id uuid primary key, nombre text);
create table fin_categorias_ingresos (id uuid primary key, nombre text);
create table fin_ingresos (id uuid primary key default gen_random_uuid(), fecha date, negocio_id uuid, region_id uuid, categoria_id uuid,
  nombre text, valor numeric, cantidad numeric, precio_unitario numeric(15,2), cosecha text, cliente text, finca text, cabezas integer);
create table fin_transacciones_ganado (id uuid primary key default gen_random_uuid(), fecha date, tipo text, finca text, cliente_proveedor text,
  cantidad_cabezas integer, valor_total numeric, es_hato boolean not null default false);
create table productos (id uuid primary key, nombre text, precio_unitario numeric);
create table aplicaciones (id uuid primary key, codigo_aplicacion text, nombre_aplicacion text, tipo_aplicacion text, estado text,
  fecha_inicio_planeada date, fecha_fin_planeada date, fecha_inicio_ejecucion date, fecha_fin_ejecucion date, fecha_cierre timestamptz,
  tarea_id uuid, jornales_utilizados numeric, valor_jornal numeric, costo_total_insumos numeric, costo_total_mano_obra numeric, costo_total numeric);
create table aplicaciones_calculos (id uuid primary key default gen_random_uuid(), aplicacion_id uuid, lote_id uuid);
create table aplicaciones_cierre (id uuid primary key default gen_random_uuid(), aplicacion_id uuid, fecha_cierre date, valor_jornal numeric,
  created_at timestamptz default now());
create table movimientos_diarios (id uuid primary key, aplicacion_id uuid, lote_id uuid);
create table movimientos_diarios_productos (id uuid primary key default gen_random_uuid(), movimiento_diario_id uuid, producto_id uuid, cantidad_utilizada numeric);
create table registros_trabajo (id uuid primary key default gen_random_uuid(), tarea_id uuid, lote_id uuid, fraccion_jornal fraccion_jornal, costo_jornal numeric);
create table clima_resumen_diario (fecha date, station_id text, temp_c_min numeric, temp_c_max numeric, temp_c_avg numeric, humedad_pct_avg numeric,
  lluvia_total_mm numeric, lluvia_confianza text, viento_kmh_avg numeric, rafaga_kmh_max numeric, radiacion_wm2_avg numeric, horas_sol_duracion numeric,
  primary key (fecha, station_id));
`;

// Registros y movimientos de la aplicación A. Se usan para sembrar la base Y como entrada de la función
// del reporte, para que los dos lados lean exactamente los mismos datos.
const REGISTROS_A = [
  { lote_id: L1, fraccion_jornal: '1.0', costo_jornal: 100 },
  { lote_id: L1, fraccion_jornal: '0.5', costo_jornal: 60 },
  { lote_id: L1, fraccion_jornal: '0.25', costo_jornal: null }, // costo NULL cuenta 0, pero sus jornales cuentan
  { lote_id: null, fraccion_jornal: '1.0', costo_jornal: 999 }, // sin lote: el reporte no lo cuenta
] as const;
const MOVIMIENTOS_A = [{ id: M_CON_LOTE, lote_id: L1 }, { id: M_SIN_LOTE, lote_id: null }];
const PRODUCTOS_A = [
  { movimiento_diario_id: M_CON_LOTE, producto_id: P1, cantidad_utilizada: 2, precio_unitario: 10 },
  { movimiento_diario_id: M_CON_LOTE, producto_id: P2, cantidad_utilizada: 1, precio_unitario: null }, // sin precio: 0
  { movimiento_diario_id: M_SIN_LOTE, producto_id: P1, cantidad_utilizada: 5, precio_unitario: 10 }, // movimiento sin lote
];

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ESQUEMA);
  await db.exec(`
    insert into lotes values ('${L1}', '1. Norte');
    insert into fin_negocios values ('${uuid(50)}', 'Aguacate Hass'), ('${uuid(51)}', 'Agrícola'), ('${uuid(52)}', 'Hato Lechero');
    insert into fin_categorias_ingresos values ('${uuid(60)}', 'Nacional'), ('${uuid(61)}', 'Rentas'), ('${uuid(62)}', 'Venta Leche'), ('${uuid(63)}', 'Otros Ingresos');
    insert into fin_ingresos(fecha, negocio_id, categoria_id, nombre, valor, cantidad) values
      ('2026-10-01', '${uuid(50)}', '${uuid(60)}', 'Venta de aguacate', 1000, 500),
      ('2026-10-02', '${uuid(51)}', '${uuid(61)}', 'Arriendo', 500, null),
      ('2026-10-03', '${uuid(52)}', '${uuid(62)}', 'Leche', 200, 4000),
      ('2026-10-04', '${uuid(51)}', '${uuid(63)}', 'Otro', 50, null),
      ('2026-10-05', '${uuid(51)}', null, 'Sin categoría', 7, null);
    insert into fin_transacciones_ganado(fecha, tipo, finca, cliente_proveedor, cantidad_cabezas, valor_total, es_hato) values
      ('2026-10-06', 'venta',  'Escocia', 'Cliente X', 3, 300, false),
      ('2026-10-07', 'venta',  'Escocia', 'Cliente Y', 1, 999, true),
      ('2026-10-08', 'compra', 'Escocia', 'Proveedor', 2, 777, false);

    insert into productos values ('${P1}', 'Producto 1', 10), ('${P2}', 'Producto 2', null);
    insert into aplicaciones(id, nombre_aplicacion, tipo_aplicacion, estado, fecha_cierre, tarea_id, jornales_utilizados, valor_jornal, costo_total_insumos, costo_total_mano_obra, costo_total) values
      ('${APP_A}', 'App A', 'Fertilización', 'Cerrada', '2026-10-15 00:00:00+00', '${T_A}', 50, 1000, 1, 1, 2),
      ('${APP_B}', 'App B', 'Fumigación',    'Cerrada', '2026-10-30 00:00:00+00', '${T_B}', 4, 0, 5, 5, 10),
      ('${APP_C}', 'App C', 'Drench',        'Calculada', null, null, null, null, null, null, null),
      ('${APP_D}', 'App D', 'Fumigación',    'Cerrada', '2026-10-31 00:00:00+00', null, null, null, null, null, null);
    insert into aplicaciones_cierre(aplicacion_id, fecha_cierre, valor_jornal) values ('${APP_A}', '2026-10-15', 1000), ('${APP_B}', '2026-10-30', 25000);
    insert into aplicaciones_calculos(aplicacion_id, lote_id) values ('${APP_A}', '${L1}');
    insert into movimientos_diarios values ('${M_CON_LOTE}', '${APP_A}', '${L1}'), ('${M_SIN_LOTE}', '${APP_A}', null);
    insert into movimientos_diarios_productos(movimiento_diario_id, producto_id, cantidad_utilizada) values
      ('${M_CON_LOTE}', '${P1}', 2), ('${M_CON_LOTE}', '${P2}', 1), ('${M_SIN_LOTE}', '${P1}', 5);
  `);
  for (const r of REGISTROS_A) {
    await db.query('insert into registros_trabajo(tarea_id, lote_id, fraccion_jornal, costo_jornal) values ($1,$2,$3,$4)', [T_A, r.lote_id, r.fraccion_jornal, r.costo_jornal]);
  }
  await db.exec(`
    insert into clima_resumen_diario(fecha, station_id, lluvia_total_mm, lluvia_confianza) values
      ('2026-01-01', 'E1', 5,   'ok'),
      ('2026-01-04', 'E1', 0,   'cobertura_parcial'),
      ('2026-01-05', 'E1', 2,   'cobertura_parcial'),
      ('2026-01-06', 'E1', 9.5, 'contador_congelado');
  `);
  await db.exec(vista(M193, 'v_esco_ingresos'));
  await db.exec(vista(M193, 'v_esco_aplicaciones'));
  await db.exec(vista(M193, 'v_esco_clima_diario'));
});
afterAll(async () => { await db.close(); });

describe('193 · F2 — ventas frente a ingresos', () => {
  it('los ingresos incluyen las ventas de ganado de ceba; las del hato (es_hato) y las compras no', async () => {
    const r = await db.query<{ total: string; n: number }>('select sum(valor) total, count(*)::int n from v_esco_ingresos');
    // 1000 + 500 + 200 + 50 + 7 (fin_ingresos) + 300 (venta de ganado de ceba). No 999 (hato) ni 777 (compra).
    expect(Number(r.rows[0].total)).toBe(2057);
    expect(r.rows[0].n).toBe(6);
  });

  it('es_venta: aguacate y leche sí; rentas, otros ingresos y sin categoría no; ganado sí', async () => {
    const r = await db.query<{ categoria: string | null; es_venta: boolean }>('select categoria, es_venta from v_esco_ingresos order by valor desc');
    expect(r.rows.map((f) => [f.categoria, f.es_venta])).toEqual([
      ['Nacional', true], ['Rentas', false], ['Venta de ganado', true], ['Venta Leche', true], ['Otros Ingresos', false], [null, false],
    ]);
  });

  it('«ventas» (es_venta) suma solo ventas y no incluye rentas ni otros', async () => {
    const r = await db.query<{ ventas: string }>('select sum(valor) ventas from v_esco_ingresos where es_venta');
    expect(Number(r.rows[0].ventas)).toBe(1500); // 1000 aguacate + 200 leche + 300 ganado
  });

  it('la fila de ganado trae negocio Ganado, cabezas, origen y no se mezcla con fin_ingresos', async () => {
    const r = await db.query<Record<string, unknown>>("select negocio, cabezas, cliente, origen, es_venta from v_esco_ingresos where origen = 'fin_transacciones_ganado'");
    expect(r.rows).toEqual([{ negocio: 'Ganado', cabezas: 3, cliente: 'Cliente X', origen: 'fin_transacciones_ganado', es_venta: true }]);
  });
});

describe('193 · F3 — el costo de la aplicación es el del reporte', () => {
  const sql = (id: string) => `select costo_total_insumos i, costo_total_mano_obra m, costo_total t, jornales_utilizados j from v_esco_aplicaciones where aplicacion_id = '${id}'`;

  it('aplicación con registros de trabajo: la vista da lo mismo que calcularCostoAplicacionReal', async () => {
    const esperado = calcularCostoAplicacionReal({
      registros: [...REGISTROS_A],
      movimientos: MOVIMIENTOS_A,
      productosMovimiento: PRODUCTOS_A,
      jornalesRespaldo: 50,
      valorJornal: 1000,
    });
    // Comprobación manual de la función, para que el test no dependa solo de ella: 160 de MO, 20 de insumos.
    expect(esperado).toMatchObject({ costoManoObra: 160, costoInsumos: 20, costoTotal: 180 });
    expect(esperado.jornales).toBeCloseTo(1.75);

    const v = (await db.query<{ i: string; m: string; t: string; j: string }>(sql(APP_A))).rows[0];
    expect(Number(v.i)).toBe(esperado.costoInsumos);
    expect(Number(v.m)).toBe(esperado.costoManoObra);
    expect(Number(v.t)).toBe(esperado.costoTotal);
    expect(Number(v.j)).toBeCloseTo(esperado.jornales);
  });

  it('NO usa el costo guardado (aplicaciones.costo_total*): el reporte lo ignora', async () => {
    const v = (await db.query<{ t: string }>(sql(APP_A))).rows[0];
    expect(Number(v.t)).not.toBe(2); // el valor guardado de A es 2
  });

  it('sin registros de trabajo usa jornales_utilizados × valor_jornal (con el del cierre si el de la aplicación es 0)', async () => {
    const esperado = calcularCostoAplicacionReal({ registros: [], movimientos: [], productosMovimiento: [], jornalesRespaldo: 4, valorJornal: 25000 });
    const v = (await db.query<{ i: string | null; m: string; t: string }>(sql(APP_B))).rows[0];
    expect(Number(v.m)).toBe(esperado.costoManoObra); // 4 × 25.000
    expect(v.i).toBeNull(); // sin movimientos: sin dato, no 0
    expect(Number(v.t)).toBe(100000);
  });

  it('una aplicación sin movimientos ni jornales no tiene costo: NULL (sin dato), no 0', async () => {
    const v = (await db.query<{ i: string | null; m: string | null; t: string | null; j: string | null }>(sql(APP_C))).rows[0];
    expect(v).toEqual({ i: null, m: null, t: null, j: null });
  });
});

describe('193 · F4 — fecha de cierre sin desplazar', () => {
  it('usa aplicaciones_cierre.fecha_cierre (15 de octubre), no el 14 que daba la conversión a Bogotá', async () => {
    const r = await db.query<{ f: string }>(`select to_char(fecha_cierre, 'YYYY-MM-DD') f from v_esco_aplicaciones where aplicacion_id = '${APP_A}'`);
    expect(r.rows[0].f).toBe('2026-10-15');
  });

  it('sin fila de cierre cae a la fecha UTC del timestamptz (medianoche UTC = ese mismo día)', async () => {
    const r = await db.query<{ f: string }>(`select to_char(fecha_cierre, 'YYYY-MM-DD') f from v_esco_aplicaciones where aplicacion_id = '${APP_D}'`);
    expect(r.rows[0].f).toBe('2026-10-31');
  });

  it('el resultado no depende del huso de la sesión', async () => {
    await db.exec("set time zone 'America/Bogota'");
    const r = await db.query<{ f: string }>(`select to_char(fecha_cierre, 'YYYY-MM-DD') f from v_esco_aplicaciones where aplicacion_id = '${APP_D}'`);
    await db.exec("set time zone 'UTC'");
    expect(r.rows[0].f).toBe('2026-10-31');
  });

  it('el filtro de un mes cierra las aplicaciones correctas (rango semiabierto)', async () => {
    const r = await db.query<{ n: number }>("select count(*)::int n from v_esco_aplicaciones where fecha_cierre >= date '2026-10-01' and fecha_cierre < date '2026-11-01'");
    expect(r.rows[0].n).toBe(3); // A (15-oct), B (30-oct), D (31-oct)
  });

  it('ninguna vista convierte una fecha de negocio a Bogotá: todas son `date` de origen', () => {
    expect(vista(M193, 'v_esco_aplicaciones')).not.toMatch(/AT TIME ZONE 'America\/Bogota'/);
    expect(vista(M193, 'v_esco_ingresos')).not.toMatch(/AT TIME ZONE/);
    // La única conversión de huso permitida es la del límite superior del calendario de clima (ayer, en Bogotá).
    const clima = vista(M193, 'v_esco_clima_diario');
    expect([...clima.matchAll(/AT TIME ZONE/g)]).toHaveLength(1);
    // Las vistas de la 192 que no cambian no convierten husos.
    for (const n of ['v_esco_jornales', 'v_esco_gastos', 'v_esco_aplicaciones_productos', 'v_esco_produccion', 'v_esco_monitoreo', 'v_esco_hato']) {
      expect(vista(M192, n)).not.toMatch(/AT TIME ZONE/);
    }
  });
});

describe('193 · F10 — días calendario sin fila de clima', () => {
  it('genera cada día desde el primer dato hasta ayer (Bogotá), sin duplicar ni saltar', async () => {
    const r = await db.query<{ n: number; distintos: number; maxf: string; esperado: string }>(
      `select count(*)::int n, count(distinct fecha)::int distintos, to_char(max(fecha),'YYYY-MM-DD') maxf,
              to_char((now() at time zone 'America/Bogota')::date - 1,'YYYY-MM-DD') esperado
       from v_esco_clima_diario`);
    expect(r.rows[0].maxf).toBe(r.rows[0].esperado);
    expect(r.rows[0].n).toBe(r.rows[0].distintos);
    const dias = await db.query<{ d: number }>("select ((now() at time zone 'America/Bogota')::date - 1 - date '2026-01-01' + 1)::int d");
    expect(r.rows[0].n).toBe(dias.rows[0].d);
  });

  it('un día sin fila sale como sin_dato, con lluvia NULL y tiene_fila = false (no 0 mm)', async () => {
    const r = await db.query<Record<string, unknown>>(
      "select to_char(fecha,'MM-DD') f, lluvia_mm, lluvia_estado, tiene_fila from v_esco_clima_diario where fecha between '2026-01-01' and '2026-01-06' order by fecha");
    expect(r.rows).toEqual([
      { f: '01-01', lluvia_mm: '5', lluvia_estado: 'completo', tiene_fila: true },
      { f: '01-02', lluvia_mm: null, lluvia_estado: 'sin_dato', tiene_fila: false },
      { f: '01-03', lluvia_mm: null, lluvia_estado: 'sin_dato', tiene_fila: false },
      { f: '01-04', lluvia_mm: null, lluvia_estado: 'sin_dato', tiene_fila: true }, // cobertura parcial con 0 mm
      { f: '01-05', lluvia_mm: '2', lluvia_estado: 'cota_inferior', tiene_fila: true },
      { f: '01-06', lluvia_mm: null, lluvia_estado: 'sin_dato', tiene_fila: true }, // contador congelado
    ]);
  });

  it('contar días con dato y sin dato de un período cuadra con los días calendario', async () => {
    const r = await db.query<{ total: number; con_dato: number; sin_dato: number }>(
      `select count(*)::int total, count(lluvia_mm)::int con_dato, count(*) filter (where lluvia_mm is null)::int sin_dato
       from v_esco_clima_diario where fecha >= date '2026-01-01' and fecha < date '2026-01-07'`);
    expect(r.rows[0]).toEqual({ total: 6, con_dato: 2, sin_dato: 4 });
  });
});

describe('193 · contrato del archivo', () => {
  it('reemplaza exactamente las tres vistas con security_invoker y no toca las otras siete', () => {
    const creadas = [...M193.matchAll(/CREATE VIEW public\.(v_esco_\w+) WITH \(security_invoker = true\)/g)].map((m) => m[1]).sort();
    expect(creadas).toEqual(['v_esco_aplicaciones', 'v_esco_clima_diario', 'v_esco_ingresos']);
    const borradas = [...M193.matchAll(/^DROP VIEW public\.(v_esco_\w+);/gm)].map((m) => m[1]).sort();
    expect(borradas).toEqual(creadas);
    expect(M193).not.toMatch(/DROP VIEW[^;]*CASCADE/i);
  });

  it('las columnas nuevas están descritas en el prompt', () => {
    const col = (n: string) => VISTAS_ESCO.find((v) => v.nombre === n)!.columnas;
    expect(col('v_esco_ingresos')).toMatch(/es_venta, origen/);
    expect(col('v_esco_clima_diario')).toMatch(/tiene_fila/);
  });

  it('mismos permisos que la 192: nada para anon, SELECT a authenticated', () => {
    expect(M193).toMatch(/REVOKE ALL ON public\.v_esco_ingresos, public\.v_esco_aplicaciones, public\.v_esco_clima_diario\s+FROM PUBLIC, anon/);
    expect(M193).toMatch(/GRANT SELECT ON public\.v_esco_ingresos, public\.v_esco_aplicaciones, public\.v_esco_clima_diario\s+TO authenticated, service_role/);
  });

  it('no es una migración que escriba datos', () => {
    expect(M193).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  });
});
