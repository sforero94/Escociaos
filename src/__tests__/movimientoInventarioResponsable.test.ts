// ARCHIVO: __tests__/movimientoInventarioResponsable.test.ts
// DESCRIPCIÓN: `movimientos_inventario` es el libro de trazabilidad de insumos que
// GlobalGAP audita. Toda fila tiene que decir QUIÉN la escribió, y la única forma de
// saberlo es que el escritor estampe `responsable` en el propio INSERT: la tabla
// **no tiene ningún trigger de atribución** (verificado contra `pg_trigger` en
// producción 2026-08-28: 0 triggers no internos), y la migración 112 cubre
// `productos.updated_by`, que es otra columna de otra tabla.
//
// El defecto que motivó este guard: `NuevoMovimientoModal` -- el ÚNICO camino de la
// app para un ajuste manual de stock -- construía su payload sin la clave
// `responsable`. Como nada la rellena después, toda corrección manual de inventario
// nacía sin persona responsable.
//
// Evidencia en producción (2026-08-28), antes del arreglo:
//   select responsable, count(*) from movimientos_inventario group by 1;
//     aescociahass@gmail.com  138
//     sforero94@gmail.com      18
//     santiago@thinksid.co      1
//     NULL                      3   <- las 3 del modal, todas 'Ajuste', 2026-08-24
// O sea: 3 de 160 filas en total, pero el **100 % de las escrituras de este camino**.
//
// El formato es un EMAIL, no un nombre: las 157 filas atribuidas guardan email, y el
// RPC `fn_cerrar_aplicacion` (migración 106) lo deriva server-side de
// `auth.jwt() ->> 'email'`. Un escritor nuevo que guarde un nombre partiría la columna
// en dos formatos sin que nada falle.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as ts from 'typescript';
import { join } from 'node:path';

/** Original browser entry points now delegate to these prospective SQL writers.
 * Removing an entry is not acceptable when its write moves to another layer. */
const ESCRITORES = [
  { entry: 'src/components/inventory/NuevoMovimientoModal.tsx', helper: 'src/utils/manualStockMovement.ts', call: 'postManualMovement', sql: 'manual-stock-movement.sql', rpc: 'fn_manual_stock_movement', email: 'profile.email' },
  { entry: 'src/components/inventory/NewPurchase.tsx', helper: 'src/utils/purchaseIntegrity.ts', call: 'postPurchase', sql: 'purchase-integrity.sql', rpc: 'fn_purchase_post', email: 'actor_email' },
  { entry: 'src/components/inventory/PurchaseHistory.tsx', helper: 'src/utils/purchaseIntegrity.ts', call: 'reversePurchase', sql: 'purchase-integrity.sql', rpc: 'fn_purchase_reverse', email: 'actor_email' },
];
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');
function routine(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp('CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?' + escaped + '\\([\\s\\S]*?AS (\\$[a-z_]*\\$)([\\s\\S]*?)\\1\\s*;', 'i'));
  expect(match, `missing SQL writer ${name}`).not.toBeNull();
  return match![2];
}
// Split SQL column/value lists without confusing nested calls or quoted commas.
function sqlList(source: string): string[] {
  let depth = 0, quote = false, start = 0;
  const parts: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "'") {
      if (quote && source[i + 1] === "'") { i++; continue; }
      quote = !quote;
    } else if (!quote) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (char === ',' && depth === 0) { parts.push(source.slice(start, i).trim()); start = i + 1; }
    }
  }
  parts.push(source.slice(start).trim());
  return parts;
}
function movementInserts(body: string) {
  return [...body.matchAll(/INSERT INTO (?:public\.)?movimientos_inventario\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*?)\)\s*RETURNING/gi)].map(match => ({ columns: sqlList(match[1]), values: sqlList(match[2]) }));
}
// Match all INSERT forms, including composite SELECT, DEFAULT VALUES and
// omitted column lists. Parsing VALUES is only an attribution check above.
const movementInsert = /\bINSERT\s+INTO\s+(?:ONLY\s+)?(?:(?:"public"|public)\s*\.\s*)?(?:"movimientos_inventario"|movimientos_inventario)(?=\s|\()/gi;
function sourceFiles(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? entry.name === '__tests__' ? [] : sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
function directMovementInserts(path: string, text = read(path)): number {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let count = 0;
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from'
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === 'movimientos_inventario') {
      let next: ts.Node = node;
      while (ts.isPropertyAccessExpression(next.parent) && ts.isCallExpression(next.parent.parent)) {
        const property = next.parent;
        if (property.name.text === 'insert') count++;
        next = property.parent;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  return count;
}

describe('guard: inventory writer registry follows transactional RPCs and trusted EMAIL attribution', () => {
  it.each(ESCRITORES)('$entry delegates to $rpc and that exact SQL INSERT stamps the authenticated profile email', writer => {
    const entry = read(writer.entry), helper = read(writer.helper), sql = read(`src/sql/security-candidates/${writer.sql}`);
    expect(entry).toMatch(new RegExp('await ' + writer.call + '\\('));
    expect(helper).toMatch(new RegExp('(?:rpc\\(client,\\s*|client\\.rpc\\()[\'"]' + writer.rpc + '[\'"]'));
    expect(helper).toContain('client.auth.getUser()');
    const body = routine(sql, writer.rpc), inserts = movementInserts(body);
    expect(inserts).toHaveLength(1);
    for (const insert of inserts) {
      expect(insert.columns).toHaveLength(insert.values.length);
      const index = insert.columns.indexOf('responsable');
      expect(index).toBeGreaterThanOrEqual(0);
      expect(insert.values[index]).toBe(writer.email);
    }
    if (writer.email === 'actor_email') {
      expect(body).toContain('actor := purchase_integrity.authorize()');
      expect(body).toMatch(/SELECT email INTO STRICT actor_email FROM public\.usuarios WHERE id=actor/);
      const auth = routine(sql, 'purchase_integrity.authorize');
      expect(auth).toContain('auth.uid()'); expect(auth).toMatch(/FROM public\.usuarios WHERE id=actor FOR SHARE/);
      expect(auth).toContain('profile.activo IS DISTINCT FROM true');
      expect(body).toContain("'responsable',actor_email");
      expect(body).toContain('to_jsonb(mov) @> expected');
    } else {
      expect(body).toContain('actor uuid:=auth.uid()');
      expect(body).toMatch(/FROM public\.usuarios WHERE id=actor FOR SHARE/);
      expect(body).toContain('profile.activo IS DISTINCT FROM true');
      expect(body).toContain('mov.responsable IS DISTINCT FROM profile.email');
    }
    expect(body).not.toMatch(/p_payload\s*->>\s*'responsable'/);
  });

  it('discovers every new direct TS movement INSERT instead of silently ignoring an unregistered writer', () => {
    const writers = [...sourceFiles('src'), ...sourceFiles('supabase')].filter(path => directMovementInserts(path) > 0);
    // The three browser writers moved to reviewed RPC candidates. Any new direct
    // writer needs explicit review and authenticated email attribution coverage.
    expect(writers).toEqual([]);
  }, 15_000); // Full AST traversal keeps escaped literal names visible under parallel load.

  it('discovery recognizes escaped TS table names and every SQL INSERT shape', () => {
    expect(directMovementInserts('synthetic.ts', String.raw`client.from('movimientos_\u0069nventario').insert(payload)`)).toBe(1);
    for (const statement of [
      'INSERT INTO movimientos_inventario(a) VALUES(1);',
      'INSERT INTO public.movimientos_inventario SELECT (expected_move).*;',
      'INSERT INTO "public"."movimientos_inventario" DEFAULT VALUES;',
      'INSERT INTO movimientos_inventario VALUES(1);',
    ]) expect([...statement.matchAll(movementInsert)]).toHaveLength(1);
  });

  it('CSV import follows browser, authenticated helper and human-JWT endpoint to trusted opening ledger attribution', () => {
    expect(read('src/components/inventory/ImportarProductosCSV.tsx')).toMatch(/await importCsvProducts\(/);
    const helper = read('src/utils/csvProductImport.ts');
    expect(helper).toContain('client.auth.getUser()');
    expect(helper).toContain('client.auth.getSession()');
    expect(helper).toContain('Authorization:`Bearer ${token}`');
    for (const endpoint of ['src/supabase/functions/server/importar-productos.tsx', 'supabase/functions/make-server-1ccce916/importar-productos.tsx']) {
      const source = read(endpoint);
      expect(source).toContain('supabase.auth.getUser(token)');
      expect(source).toContain('perfilAplicacionActivo(');
      expect(source).toContain('Authorization:`Bearer ${acceso.token}`');
      expect(source).toContain("await human.rpc(body.action === 'import' ? 'fn_csv_product_import'");
      expect(directMovementInserts(endpoint)).toBe(0);
    }
    const sql = read('src/sql/security-candidates/csv-product-import.sql');
    const body = routine(sql, 'fn_csv_product_import'), auth = routine(sql, 'csv_product_import.authorize');
    expect(auth).toContain('auth.uid() IS NULL');
    expect(auth).toContain('WHERE id=auth.uid() FOR SHARE');
    expect(auth).toContain('u.activo IS DISTINCT FROM true');
    expect(auth).toContain("u.rol::text NOT IN ('Administrador','Gerencia')");
    expect(auth).toContain("u.email IS NULL OR btrim(u.email)=''");
    expect(body).toContain('u=csv_product_import.authorize()');
    expect(body).toContain('IF expected.cantidad_actual>0 THEN');
    expect(body).toContain("'responsable',u.email");
    expect(body).toContain('INSERT INTO public.movimientos_inventario SELECT (expected_move).*');
    expect(body).toContain('to_jsonb(actual_move) IS DISTINCT FROM to_jsonb(expected_move)');
    expect(body).not.toMatch(/p_payload\s*->>\s*'responsable'/);
  });

  it('discovers every proposed SQL movement INSERT and refuses top-level or unregistered writers', () => {
    const writers: string[] = [];
    for (const file of readdirSync(join(process.cwd(), 'src/sql/security-candidates'))) {
      if (!file.endsWith('.sql')) continue;
      const sql = read(`src/sql/security-candidates/${file}`);
      const allInserts = [...sql.matchAll(movementInsert)].length;
      let registeredInserts = 0;
      for (const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION ([\w.]+)\([\s\S]*?AS (\$[a-z_]*\$)([\s\S]*?)\2\s*;/gi)) {
        const count = [...match[3].matchAll(movementInsert)].length;
        if (count > 0) writers.push(match[1]);
        registeredInserts += count;
      }
      expect(registeredInserts, `${file} has a movement INSERT outside the reviewed functions`).toBe(allInserts);
    }
    expect(writers.sort()).toEqual(['public.fn_csv_product_import','public.fn_cerrar_aplicacion','public.fn_manual_stock_movement','public.fn_product_catalog_post','public.fn_purchase_post','public.fn_purchase_reverse','ronda_stock_integrity.post'].sort());
  });

  it('both Ronda RPC lanes delegate to one registered ledger transaction with trusted attribution', () => {
    const sql = read('src/sql/security-candidates/ronda-stock-integrity.sql');
    for (const [rpc, operation] of [['fn_ronda_aplicar_ajuste','adjust'],['fn_ronda_resolver_con_captura','capture']]) {
      expect(routine(sql, rpc)).toContain(`ronda_stock_integrity.post('${operation}',payload)`);
    }
    const body = routine(sql, 'ronda_stock_integrity.post');
    const inserts = movementInserts(body);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values[inserts[0].columns.indexOf('responsable')]).toBe('public.fn_ronda_actor_correo(user_id,tg_id)');
    expect(body).toContain('ronda_stock_integrity.authorize(');
    expect(body).toContain("'responsable',public.fn_ronda_actor_correo(user_id,tg_id)");
  });

  it('catalog opening records are stamped from the locked profile and posted with the product', () => {
    expect(read('src/components/inventory/ProductForm.tsx')).toContain('await postCatalog(');
    const sql = read('src/sql/security-candidates/product-catalog-integrity.sql');
    expect(routine(sql, 'product_catalog_integrity.authorize')).toContain('WHERE id=auth.uid() FOR SHARE');
    const body = routine(sql, 'fn_product_catalog_post');
    expect(body).toContain('u:=product_catalog_integrity.authorize()');
    expect(body).toContain("'responsable',u.email");
    expect(body).toContain('INSERT INTO public.movimientos_inventario SELECT (move).*');
    expect(body).not.toMatch(/p_payload\s*->>\s*'responsable'/);
  });

  it('the prospective application closure RPC uses active-profile EMAIL and checks the exact returned movement', () => {
    const sql = read('src/sql/security-candidates/application-closure.sql');
    const body = routine(sql, 'fn_cerrar_aplicacion'), auth = routine(sql, 'application_closure.authorize');
    expect(auth).toMatch(/FROM public\.usuarios WHERE id=auth\.uid\(\) FOR SHARE/);
    expect(auth).toContain('profile.activo IS DISTINCT FROM true'); expect(auth).toContain('RETURN profile.email');
    expect(body).toContain('v_email := application_closure.authorize()');
    const insert = movementInserts(body);
    expect(insert).toHaveLength(1);
    expect(insert[0].values[insert[0].columns.indexOf('responsable')]).toBe('v_email');
    expect(body).toContain("'responsable',v_email"); expect(body).toContain('v_row @> v_expected');
    expect(body).toContain("'table','movimientos_inventario'");
  });

  it('the historical migration106 writer retains its JWT EMAIL attribution contract', () => {
    const source = read('src/sql/migrations/106_cierre_aplicacion_transaccional.sql');
    expect(source).toContain("auth.jwt() ->> 'email'");
    expect(/INSERT INTO movimientos_inventario[\s\S]{0,400}?responsable/i.test(source)).toBe(true);
  });
});
