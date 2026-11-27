/**
 * ESCO-190: el chequeo por foto es de varias páginas. La segunda página se
 * AGREGA al chequeo de la misma fecha; nunca borra las vacas de la primera.
 *
 * Guardas estáticas sobre la migración 202 y las rutas de la edge function.
 * La paridad byte a byte de los dos árboles ya la cubre
 * arbolEdgeFunctionParidad.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');
const leer = (r: string) => readFileSync(resolve(RAIZ, r), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');

const SQL = sinComentarios(leer('src/sql/migrations/202_fn_hato_commit_chequeo_agregar.sql'));

describe('migración 202 — fn_hato_commit_chequeo_agregar', () => {
  it('crea una función nueva y no reemplaza fn_hato_commit_chequeo (065/069)', () => {
    expect(SQL).toMatch(/CREATE (OR REPLACE )?FUNCTION public\.fn_hato_commit_chequeo_agregar\s*\(/);
    expect(SQL).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.fn_hato_commit_chequeo\s*\(/);
  });

  it('borra SOLO las vacas del payload, nunca el chequeo entero', () => {
    const borrados = SQL.match(/DELETE FROM hato_(eventos|chequeo_vacas)[\s\S]*?;/g) ?? [];
    expect(borrados).toHaveLength(2);
    for (const b of borrados) expect(b).toMatch(/animal_id = ANY \(v_animal_ids\)/);
    expect(SQL).not.toMatch(/DELETE FROM hato_chequeos\b/);
  });

  it('serializa dos páginas de la misma fecha y devuelve las filas conservadas', () => {
    expect(SQL).toMatch(/LOCK TABLE hato_chequeos IN SHARE ROW EXCLUSIVE MODE/);
    expect(SQL).toMatch(/'filasConservadas'/);
  });

  it('SECURITY DEFINER con search_path pineado y EXECUTE solo para service_role', () => {
    expect(SQL).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(SQL).toMatch(/REVOKE EXECUTE ON FUNCTION public\.fn_hato_commit_chequeo_agregar\(JSONB, UUID\) FROM PUBLIC, anon, authenticated/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.fn_hato_commit_chequeo_agregar\(JSONB, UUID\) TO service_role/);
    expect(SQL).not.toMatch(/TO (anon|authenticated)\s*;/);
  });
});

describe('edge function — ruta /hato/chequeo/agregar', () => {
  for (const indice of [
    'src/supabase/functions/server/index.tsx',
    'supabase/functions/make-server-1ccce916/index.ts',
  ]) {
    it(`${indice} registra la ruta agregar con su handler`, () => {
      const src = leer(indice);
      expect(src).toMatch(/app\.post\("\/make-server-1ccce916\/hato\/chequeo\/agregar"[\s\S]*?handleHatoChequeoAgregar\(c\)/);
      expect(src).toMatch(/app\.post\("\/make-server-1ccce916\/hato\/chequeo\/commit"[\s\S]*?handleHatoChequeoCommit\(c\)/);
    });
  }

  it('cada modo llama a su propia RPC', () => {
    const src = leer('src/supabase/functions/server/hato-chequeo-commit.ts');
    expect(src).toMatch(/agregar:\s*['"]fn_hato_commit_chequeo_agregar['"]/);
    expect(src).toMatch(/reemplazar:\s*['"]fn_hato_commit_chequeo['"]/);
  });
});
