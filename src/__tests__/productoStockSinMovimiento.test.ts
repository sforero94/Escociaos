// ARCHIVO: __tests__/productoStockSinMovimiento.test.ts
// DESCRIPCIÓN: `productos.cantidad_actual` es SALDO DE INVENTARIO. Solo puede
// cambiar junto con la fila de `movimientos_inventario` que lo explica.
//
// `ProductForm` en modo EDICIÓN mandaba `{ ...formData }` completo al UPDATE.
// Como `cantidad_actual` es un campo más del formulario, el saldo viajaba con
// el resto y se sobrescribía SIN movimiento: una mutación de stock sin rastro.
//
// El defecto era invisible a un grep. Los escritores legítimos
// (`NuevoMovimientoModal`, `NewPurchase`, `PurchaseHistory` en TS; el RPC
// `fn_cerrar_aplicacion` en SQL, migración 106) escriben `cantidad_actual`
// de forma explícita y todos insertan su movimiento al lado; este escribía
// el mismo campo montado en un spread, sin nombrarlo nunca.
//
// `CierreAplicacion.tsx` escribía `cantidad_actual` directo hasta la
// migración 106 (cierre transaccional) -- ahora esa escritura vive en el
// RPC (`src/sql/migrations/106_cierre_aplicacion_transaccional.sql`), que
// hace el UPDATE de productos y el INSERT de movimientos_inventario en la
// misma transacción. El archivo TS ya no escribe ninguna de las dos tablas
// directamente: llama al RPC vía `.rpc('fn_cerrar_aplicacion', …)`.
//
// Evidencia en producción (2026-08-10): 5 productos activos tienen desfase
// entre `cantidad_actual` y la suma de sus `movimientos_inventario` Y su
// `updated_at` es POSTERIOR al último movimiento -- el orden que deja este bug.
// El peor es Sulcamag: un único movimiento de +8.000, `cantidad_actual = 16`,
// `updated_at` 9 días después del movimiento. -7.984 sin una sola fila que lo
// explique.
//
// El camino correcto para corregir un saldo ya existe: `NuevoMovimientoModal`
// con `tipo = 'Ajuste'`, que inserta en `movimientos_inventario` ANTES de tocar
// `productos` (NuevoMovimientoModal.tsx:133 -> :150).

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as ts from 'typescript';
import { join } from 'node:path';
import { prepararDatosProducto } from '@/components/inventory/ProductForm';

/** Formulario mínimo: solo los campos que este contrato mira. El helper
 * recibe el ProductData completo en producción, pero es agnóstico al resto. */
const formulario = {
  nombre: 'Naturboro',
  categoria: 'Fertilizante',
  cantidad_actual: 999,
  stock_minimo: 5,
  precio_unitario: 1200,
  registro_ica: '',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixture parcial a propósito
} as any;

describe('prepararDatosProducto — el saldo de inventario no viaja en un UPDATE', () => {
  it('en EDICIÓN elimina cantidad_actual del payload', () => {
    const datos = prepararDatosProducto(formulario, true);

    // Este es el assert que fallaba: antes del arreglo `cantidad_actual` salía
    // en el objeto con el valor del input y se escribía en `productos`.
    expect('cantidad_actual' in datos).toBe(false);
  });

  it('en EDICIÓN sí deja pasar el resto de los campos del producto', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect(datos.nombre).toBe('Naturboro');
    expect(datos.categoria).toBe('Fertilizante');
    expect(datos.stock_minimo).toBe(5);
    expect(datos.precio_unitario).toBe(1200);
  });

  it('en CREACIÓN sí incluye cantidad_actual: es el saldo de apertura', () => {
    const datos = prepararDatosProducto(formulario, false);

    expect(datos.cantidad_actual).toBe(999);
    expect(datos.activo).toBe(true);
  });

  it('convierte los strings vacíos a null, no a 0 -- "sin dato" no es "cero"', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect(datos.registro_ica).toBeNull();
  });

  it('no marca `activo` en EDICIÓN -- reactivaría un producto dado de baja', () => {
    const datos = prepararDatosProducto(formulario, true);

    expect('activo' in datos).toBe(false);
  });
});

// ============================================================================
// Guard estático: nadie más puede escribir el saldo sin dejar movimiento.
//
// El helper de arriba cierra ProductForm, pero el patrón que lo causó -- mandar
// un objeto de formulario entero a `productos` -- puede repetirse en cualquier
// pantalla nueva. Los escritores legítimos están enumerados; cualquier archivo
// que escriba `cantidad_actual` a `productos` sin insertar en
// `movimientos_inventario` en el mismo archivo rompe el contrato.
// ============================================================================

/** Keep the original entry points even when the mutation moves behind a utility/RPC. */
const ESCRITORES_AUTORIZADOS = [
  { entry: 'src/components/inventory/NuevoMovimientoModal.tsx', helper: 'src/utils/manualStockMovement.ts', call: 'postManualMovement', sql: 'manual-stock-movement.sql', rpc: 'fn_manual_stock_movement' },
  { entry: 'src/components/inventory/NewPurchase.tsx', helper: 'src/utils/purchaseIntegrity.ts', call: 'postPurchase', sql: 'purchase-integrity.sql', rpc: 'fn_purchase_post' },
  { entry: 'src/components/inventory/PurchaseHistory.tsx', helper: 'src/utils/purchaseIntegrity.ts', call: 'reversePurchase', sql: 'purchase-integrity.sql', rpc: 'fn_purchase_reverse' },
];
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf-8');
function sourceFiles(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? entry.name === '__tests__' ? [] : sourceFiles(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}
function productWrites(path: string, text = read(path)) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const writes: Array<{ method: string; payload: string }> = [];
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'from'
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === 'productos') {
      let next: ts.Node = node;
      while (ts.isPropertyAccessExpression(next.parent) && ts.isCallExpression(next.parent.parent)) {
        const property = next.parent, call = property.parent as ts.CallExpression;
        if (['insert','update','delete','upsert'].includes(property.name.text)) writes.push({ method: property.name.text, payload: call.arguments[0]?.getText(source) ?? '' });
        next = call;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source); return writes;
}
function routine(source: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp('CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?' + escaped + '\\([\\s\\S]*?AS (\\$[a-z_]*\\$)([\\s\\S]*?)\\1\\s*;', 'i'));
  expect(match, `missing SQL writer ${name}`).not.toBeNull(); return match![2];
}

// Opening balances are posted through the catalog and CSV protocols. The only
// remaining direct runtime product writers are narrow activation routes.
const CATALOGUE_WRITERS = [
  'src/supabase/functions/server/productos.tsx',
  'supabase/functions/make-server-1ccce916/productos.tsx',
];

describe('guard: every stock writer remains registered across browser, helper and SQL layers', () => {
  it.each(ESCRITORES_AUTORIZADOS)('$entry delegates to $rpc which updates stock and checks its exact movement', writer => {
    expect(read(writer.entry)).toMatch(new RegExp('await ' + writer.call + '\\('));
    expect(productWrites(writer.entry)).toEqual([]);
    expect(read(writer.helper)).toMatch(new RegExp('(?:rpc\\(client,\\s*|client\\.rpc\\()[\'"]' + writer.rpc + '[\'"]'));
    const body = routine(read(`src/sql/security-candidates/${writer.sql}`), writer.rpc);
    expect(body).toMatch(/UPDATE\s+(?:public\.)?productos\s+SET\s+cantidad_actual\s*=/i);
    expect(body).toMatch(/INSERT INTO (?:public\.)?movimientos_inventario\s*\(/i);
    expect(body).toMatch(/RETURNING (?:\*|to_jsonb\(movimientos_inventario\)) INTO (?:mov|v_row)/);
    expect(body).toMatch(/IF NOT FOUND[\s\S]*?RAISE EXCEPTION/);
    if (writer.rpc === 'fn_manual_stock_movement') {
      expect(body).toContain('to_jsonb(durable) IS DISTINCT FROM to_jsonb(expected)');
      expect(body).toContain('to_jsonb(durable_mov) IS DISTINCT FROM to_jsonb(mov)');
    } else {
      expect(body).toContain('to_jsonb(mov) @> expected');
      expect(body).toContain('to_jsonb(movimientos_inventario)=to_jsonb(mov)');
    }
  });

  it('discovers every direct product mutator and refuses unregistered stock payloads, including spread objects', () => {
    const paths = [...sourceFiles('src'), ...sourceFiles('supabase')];
    const writers = paths.filter(path => productWrites(path).length > 0).sort();
    expect(writers).toEqual([...CATALOGUE_WRITERS].sort());
    for (const path of writers) {
      const writes = productWrites(path);
      expect(writes).toEqual([{ method: 'update', payload: '{ activo }' }]);
    }
  }, 15_000); // Keep complete AST discovery, including escaped table literals.

  it('discovers escaped direct product writers rather than relying on raw text filtering', () => {
    expect(productWrites('synthetic.ts', String.raw`client.from('prod\u0075ctos').insert({...form})`)).toEqual([{ method: 'insert', payload: '{...form}' }]);
  });

  it('CSV opening balance uses the human-JWT RPC with positive ledger, zero proof and final readback', () => {
    const entry = read('src/components/inventory/ImportarProductosCSV.tsx'), helper = read('src/utils/csvProductImport.ts');
    expect(entry).toMatch(/await importCsvProducts\(/);
    expect(entry).toContain('/inventario/importar-productos');
    expect(productWrites('src/components/inventory/ImportarProductosCSV.tsx')).toEqual([]);
    expect(helper).toContain('client.auth.getUser()');
    expect(helper).toContain('Authorization:`Bearer ${token}`');
    for (const path of ['src/supabase/functions/server/importar-productos.tsx', 'supabase/functions/make-server-1ccce916/importar-productos.tsx']) {
      expect(productWrites(path)).toEqual([]);
      const endpoint = read(path);
      expect(endpoint).toContain('Authorization:`Bearer ${acceso.token}`');
      expect(endpoint).toContain("await human.rpc(body.action === 'import' ? 'fn_csv_product_import'");
      expect(endpoint).toContain('validateCsvReceipt(data,acceso.userId,body.requestKey,payload)');
    }
    const body = routine(read('src/sql/security-candidates/csv-product-import.sql'), 'fn_csv_product_import');
    expect(body).toContain('INSERT INTO public.productos SELECT (expected).*');
    expect(body).toContain('to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected)');
    expect(body).toMatch(/expected_move=NULL;\s*IF expected\.cantidad_actual>0 THEN[\s\S]*?INSERT INTO public\.movimientos_inventario SELECT \(expected_move\)\.\*;/);
    expect(body).toContain("'saldo_anterior',0,'saldo_nuevo',expected.cantidad_actual,'responsable',u.email");
    expect(body).toContain('to_jsonb(actual_move) IS DISTINCT FROM to_jsonb(expected_move)');
    expect(body).toContain("'movement_snapshot',CASE WHEN expected_move.id IS NULL THEN NULL ELSE to_jsonb(expected_move) END");
    expect(body).toContain('INSERT INTO csv_product_import.openings');
    expect(body).toContain("IS DISTINCT FROM proof->'product_snapshot'");
    expect(body).toContain("IS DISTINCT FROM proof->'movement_snapshot'");
    expect(body).toContain("CASE WHEN (proof->>'quantity_after')::numeric>0 THEN 1 ELSE 0 END");
    expect(body).toContain("RAISE EXCEPTION 'CSV final opening proof mismatch'");
    expect(body).toContain('actual_request.result IS DISTINCT FROM result');
  });

  it('discovers every proposed SQL balance writer so adding a candidate cannot evade the movement registry', () => {
    const names: string[] = [];
    // Every product INSERT can establish an opening balance, including a
    // composite record without a column list; conservatively register all.
    const balanceWrite = /\bUPDATE\s+(?:(?:"public"|public)\s*\.\s*)?(?:"productos"|productos)\s+SET[^;]*?\bcantidad_actual\s*=|\bINSERT\s+INTO\s+(?:ONLY\s+)?(?:(?:"public"|public)\s*\.\s*)?(?:"productos"|productos)(?=\s|\()/gi;
    for (const statement of [
      'INSERT INTO public.productos SELECT (expected).*;',
      'INSERT INTO "public"."productos" DEFAULT VALUES;',
      "INSERT INTO productos(nombre,cantidad_actual) VALUES('example',1);",
      'UPDATE productos SET cantidad_actual=1 WHERE id=1;',
    ]) expect([...statement.matchAll(balanceWrite)]).toHaveLength(1);
    for (const entry of readdirSync(join(process.cwd(), 'src/sql/security-candidates'))) {
      if (!entry.endsWith('.sql')) continue;
      const sql = read(`src/sql/security-candidates/${entry}`);
      let registeredWrites = 0;
      for (const match of sql.matchAll(/CREATE(?: OR REPLACE)? FUNCTION ([\w.]+)\([\s\S]*?AS (\$[a-z_]*\$)([\s\S]*?)\2\s*;/gi)) {
        const count = [...match[3].matchAll(balanceWrite)].length;
        if (count) names.push(match[1]);
        registeredWrites += count;
      }
      expect(registeredWrites, `${entry} has a balance writer outside the reviewed functions`).toBe([...sql.matchAll(balanceWrite)].length);
    }
    expect(names.sort()).toEqual(['public.fn_csv_product_import','public.fn_cerrar_aplicacion','public.fn_manual_stock_movement','public.fn_product_catalog_post','public.fn_purchase_post','public.fn_purchase_reverse','ronda_stock_integrity.post'].sort());
    const body = routine(read('src/sql/security-candidates/application-closure.sql'), 'fn_cerrar_aplicacion');
    expect(body).toMatch(/UPDATE productos\s+SET cantidad_actual = v_saldo_nuevo/);
    expect(body).toContain('INSERT INTO movimientos_inventario');
    expect(body).toContain('v_row @> v_expected');
    expect(body).toContain("'table','movimientos_inventario'");
  });

  it('el RPC fn_cerrar_aplicacion (migración 106) actualiza productos e inserta su movimiento en la misma transacción', () => {
    const fuente = readFileSync(
      join(process.cwd(), 'src/sql/migrations/106_cierre_aplicacion_transaccional.sql'),
      'utf-8',
    );

    expect(
      /UPDATE\s+productos[\s\S]*?SET[\s\S]*?cantidad_actual\s*=/i.test(fuente),
      'fn_cerrar_aplicacion ya no escribe productos.cantidad_actual',
    ).toBe(true);
    expect(
      fuente.includes('INSERT INTO movimientos_inventario'),
      'fn_cerrar_aplicacion escribe productos.cantidad_actual pero ya no inserta en ' +
        'movimientos_inventario dentro de la misma transacción.',
    ).toBe(true);
  });

  it('CierreAplicacion.tsx ya NO escribe productos ni movimientos_inventario directo -- llama al RPC transaccional', () => {
    const fuente = readFileSync(
      join(process.cwd(), 'src/components/aplicaciones/CierreAplicacion.tsx'),
      'utf-8',
    );

    expect(
      fuente.includes("from('productos')") && fuente.includes(".update({ cantidad_actual"),
      'CierreAplicacion.tsx volvió a escribir productos.cantidad_actual directo -- esa ' +
        'escritura debe vivir en fn_cerrar_aplicacion (migración 106), no en el cliente.',
    ).toBe(false);
    expect(
      fuente.includes("rpc('fn_cerrar_aplicacion'"),
      'CierreAplicacion.tsx dejó de llamar al RPC transaccional fn_cerrar_aplicacion.',
    ).toBe(true);
  });

  it('ProductForm NO escribe el saldo: lo borra del payload en edición', () => {
    const fuente = readFileSync(
      join(process.cwd(), 'src/components/inventory/ProductForm.tsx'),
      'utf-8',
    );

    expect(
      fuente.includes('delete datos.cantidad_actual'),
      'ProductForm volvió a mandar cantidad_actual en el UPDATE. Eso sobrescribe el ' +
        'saldo de inventario sin dejar fila en movimientos_inventario. Para corregir un ' +
        "saldo está NuevoMovimientoModal con tipo 'Ajuste'.",
    ).toBe(true);
  });
});
