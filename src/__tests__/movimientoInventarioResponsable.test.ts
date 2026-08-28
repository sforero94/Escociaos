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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Los tres escritores TS de `movimientos_inventario`. El cuarto escritor es el RPC
 * `fn_cerrar_aplicacion` (migración 106), cubierto en su propio caso más abajo. */
const ESCRITORES_TS = [
  'src/components/inventory/NuevoMovimientoModal.tsx',
  'src/components/inventory/NewPurchase.tsx',
  'src/components/inventory/PurchaseHistory.tsx',
];

/**
 * Devuelve el cuerpo `{ … }` de cada `.from('movimientos_inventario').insert({ … })`
 * del archivo, recortado por balanceo de llaves. Mirar el archivo entero no sirve:
 * `responsable` puede aparecer en un tipo o en un comentario y el guard quedaría verde
 * con el INSERT igual de mudo.
 */
function payloadsDeInsert(fuente: string): string[] {
  const payloads: string[] = [];
  const marcador = "from('movimientos_inventario')";
  let desde = 0;

  for (;;) {
    const iTabla = fuente.indexOf(marcador, desde);
    if (iTabla === -1) break;
    desde = iTabla + marcador.length;

    const iInsert = fuente.indexOf('.insert(', iTabla);
    if (iInsert === -1) continue;
    // Solo cuenta si el `.insert(` pertenece a esta misma cadena: si entre medias
    // aparece otro `from(`, este `from` no era un INSERT.
    if (fuente.slice(iTabla + marcador.length, iInsert).includes('.from(')) continue;

    const iLlave = fuente.indexOf('{', iInsert);
    if (iLlave === -1) continue;

    let profundidad = 0;
    let fin = -1;
    for (let i = iLlave; i < fuente.length; i++) {
      if (fuente[i] === '{') profundidad++;
      else if (fuente[i] === '}') {
        profundidad--;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin === -1) continue;

    payloads.push(fuente.slice(iLlave, fin + 1));
  }

  return payloads;
}

describe('guard: todo INSERT en movimientos_inventario estampa `responsable`', () => {
  it.each(ESCRITORES_TS)('%s', (archivo) => {
    const fuente = readFileSync(join(process.cwd(), archivo), 'utf-8');
    const payloads = payloadsDeInsert(fuente);

    expect(
      payloads.length,
      `${archivo} ya no inserta en movimientos_inventario; si el escritor se movió, ` +
        'actualizá ESCRITORES_TS en vez de borrar el caso.',
    ).toBeGreaterThan(0);

    for (const payload of payloads) {
      expect(
        /(^|[\s,{])responsable\s*[,:]/.test(payload),
        `${archivo} inserta en movimientos_inventario sin la clave \`responsable\`. ` +
          'La tabla no tiene trigger de atribución, así que la fila queda sin persona ' +
          'responsable para siempre y el libro que audita GlobalGAP no puede decir ' +
          'quién movió el stock. Tomalo de la sesión: `user?.email ?? null`.',
      ).toBe(true);
    }
  });

  it('el valor sale de la sesión y es un EMAIL, no un nombre libre', () => {
    for (const archivo of ESCRITORES_TS) {
      const fuente = readFileSync(join(process.cwd(), archivo), 'utf-8');

      expect(
        /user\?\.email/.test(fuente),
        `${archivo} escribe movimientos_inventario.responsable pero no lo deriva de ` +
          '`user?.email`. Las 157 filas atribuidas en producción guardan email y el RPC ' +
          '`fn_cerrar_aplicacion` deriva `auth.jwt() ->> \'email\'`: un segundo formato ' +
          'parte la columna en dos sin que nada falle.',
      ).toBe(true);
    }
  });

  it('el RPC fn_cerrar_aplicacion (migración 106) deriva responsable del JWT', () => {
    const fuente = readFileSync(
      join(process.cwd(), 'src/sql/migrations/106_cierre_aplicacion_transaccional.sql'),
      'utf-8',
    );

    expect(fuente.includes("auth.jwt() ->> 'email'")).toBe(true);
    expect(/INSERT INTO movimientos_inventario[\s\S]{0,400}?responsable/i.test(fuente)).toBe(true);
  });
});
