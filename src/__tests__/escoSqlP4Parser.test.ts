import { describe, expect, it } from 'vitest';
import { convertirSqlSeguro, ErrorConsultaSegura } from '../utils/escoSql/consultaSegura.ts';

describe('P4 parser SQL determinista', () => {
  it('resuelve una vista y conserva el total agregado', () => {
    const r = convertirSqlSeguro('SELECT sum(jornales) AS total FROM v_esco_jornales');
    expect(r.query.body).toMatchObject({
      kind: 'select',
      columns: [{ alias: 'total', expr: { kind: 'aggregate', fn: 'sum' } }],
      from: { kind: 'view', name: 'v_esco_jornales' },
    });
  });
  it('conserva tokens numericos grandes y decimales exactos', () => {
    const r = convertirSqlSeguro(
      'SELECT 9007199254740993 AS n, 0.123456789012345678 AS d, -12.50 AS neg',
    );
    expect(r.params.map((p) => p.value)).toEqual([
      '9007199254740993',
      '0.123456789012345678',
      '-12.50',
    ]);
  });
  it('infiere la fecha y UUID de comparaciones sin cambiar la literal', () => {
    const r = convertirSqlSeguro(
      "SELECT registro_id FROM v_esco_jornales WHERE fecha >= '2026-11-01' AND lote_id = '00000000-0000-4000-8000-000000000001'",
    );
    expect(r.params).toEqual([
      { type: 'date', value: '2026-11-01' },
      { type: 'uuid', value: '00000000-0000-4000-8000-000000000001' },
    ]);
  });
  it('expande asteriscos solo con columnas del catalogo', () => {
    const r = convertirSqlSeguro('SELECT * FROM v_esco_gastos');
    if (r.query.body.kind !== 'select') throw Error('select');
    expect(r.query.body.columns.map((c) => c.alias)).toEqual([
      'id',
      'fecha',
      'valor',
      'nombre',
      'negocio',
      'region',
      'categoria',
      'concepto',
      'proveedor',
    ]);
  });
  it('resuelve CTE y JOIN y alias del ORDER BY', () => {
    const r = convertirSqlSeguro(
      'WITH a AS (SELECT lote_id, sum(jornales) AS n FROM v_esco_jornales GROUP BY lote_id) SELECT a.lote_id, a.n FROM a LEFT JOIN v_esco_produccion p ON a.lote_id = p.lote_id ORDER BY n DESC LIMIT 10',
    );
    expect(r.query.with).toHaveLength(1);
    expect(r.query.orderBy[0]).toEqual({
      expr: { kind: 'output', name: 'n' },
      direction: 'desc',
      nulls: 'first',
    });
    expect(r.query.limit).toBe(10);
  });
  it('admite subconsulta relacional y UNION ALL', () => {
    const r = convertirSqlSeguro(
      'SELECT x.n FROM (SELECT count(*) AS n FROM v_esco_gastos) x UNION ALL SELECT count(*) AS n FROM v_esco_ingresos',
    );
    expect(r.query.body.kind).toBe('union_all');
  });
  it('admite CASE, COALESCE, NULLIF y filtro agregado', () => {
    const r = convertirSqlSeguro(
      'SELECT coalesce(sum(CASE WHEN jornales > 0 THEN jornales ELSE NULL END) FILTER (WHERE costo > 0), 0) / nullif(count(*), 0) AS media FROM v_esco_jornales',
    );
    expect(r.query.body.kind).toBe('select');
  });
  it('admite fechas tipadas, intervalos y funciones de fecha', () => {
    const r = convertirSqlSeguro(
      "SELECT date_trunc('month', fecha) AS mes, extract(year FROM fecha) AS anio FROM v_esco_gastos WHERE fecha < DATE '2026-11-01' + INTERVAL '1 month'",
    );
    expect(r.params).toEqual([
      { type: 'date', value: '2026-11-01' },
      { type: 'interval', value: { quantity: '1', unit: 'month' } },
    ]);
  });
  it('conserva timestamp sin zona como tipo propio, también en CTE', () => {
    const r = convertirSqlSeguro(
      "WITH a AS (SELECT DATE '2026-11-01' + INTERVAL '2 hours' AS instante) SELECT a.instante FROM a WHERE a.instante >= TIMESTAMP '2026-11-01 01:00:00'",
    );
    expect(r.params).toContainEqual({ type: 'timestamp', value: '2026-11-01 01:00:00' });
  });
  it('rechaza timestamp imposible antes de producir un contrato', () => {
    expect(() => convertirSqlSeguro("SELECT TIMESTAMP '2026-02-30 25:99:99' AS instante")).toThrow(
      ErrorConsultaSegura,
    );
  });
  it('distingue NULL y boolean y no inventa fuentes', () => {
    const r = convertirSqlSeguro('SELECT NULL AS sin_dato, true AS activo, false AS inactivo');
    expect(r.params).toEqual([
      { type: 'boolean', value: true },
      { type: 'boolean', value: false },
    ]);
    if (r.query.body.kind !== 'select') throw Error('select');
    expect(r.query.body.columns[0].expr).toEqual({ kind: 'null' });
  });
  it('admite IN de valores y IS NULL', () => {
    const r = convertirSqlSeguro(
      "SELECT nombre FROM v_esco_gastos WHERE categoria IN ('A', 'B') AND proveedor IS NOT NULL",
    );
    expect(r.params.map((p) => p.value)).toEqual(['A', 'B']);
  });
  it.each([
    'SELECT * FROM tabla_no_registrada',
    'SELECT columna_inexistente FROM v_esco_gastos',
    'SELECT funcion_no_registrada(valor) FROM v_esco_gastos',
    'SELECT 1; SELECT 2',
    'SELECT count(*) OVER () FROM v_esco_gastos',
    'WITH RECURSIVE a AS (SELECT 1) SELECT * FROM a',
    'SELECT valor FROM v_esco_gastos FOR UPDATE',
    'SELECT valor FROM v_esco_gastos g JOIN v_esco_ingresos i ON g.id=i.id',
    'SELECT * FROM v_esco_jornales, v_esco_gastos',
    'SELECT 1e300 AS demasiado_grande',
  ])('rechaza construccion fuera de contrato: %s', (sql) => {
    expect(() => convertirSqlSeguro(sql)).toThrow(ErrorConsultaSegura);
  });
  it('conserva negación anidada como operación, sin invertir mal la literal', () => {
    const r = convertirSqlSeguro('SELECT -(-12.50) AS n');
    if (r.query.body.kind !== 'select') throw Error('select');
    expect(r.query.body.columns[0].expr).toMatchObject({ kind: 'unary', op: '-' });
    expect(r.params).toEqual([{ type: 'numeric', value: '-12.50' }]);
  });
  it('valida identificadores en bytes sin truncar Unicode válido', () => {
    const r = convertirSqlSeguro('SELECT valor AS "total año" FROM v_esco_gastos');
    if (r.query.body.kind !== 'select') throw Error('select');
    expect(r.query.body.columns[0].alias).toBe('total año');
    expect(() => convertirSqlSeguro('SELECT 1 AS "' + 'ñ'.repeat(32) + '"')).toThrow(
      ErrorConsultaSegura,
    );
    expect(() => convertirSqlSeguro('SELECT 1 AS "dos\nlíneas"')).toThrow(ErrorConsultaSegura);
  });
  it('rechaza limites antes de producir la estructura', () => {
    expect(() => convertirSqlSeguro(' '.repeat(12001))).toThrow(ErrorConsultaSegura);
    expect(() => convertirSqlSeguro('SELECT 1 AS n LIMIT 501')).toThrow(ErrorConsultaSegura);
    expect(() => convertirSqlSeguro("SELECT '" + 'a'.repeat(4001) + "' AS texto")).toThrow(
      ErrorConsultaSegura,
    );
  });
});
