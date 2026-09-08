import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato estático de ESCO-81 / issue #201: `get_user_role()` debe
 * respetar `usuarios.activo`, igual que `es_usuario_gerencia()`.
 *
 * No hay Postgres en CI, así que se lee el SQL y los call sites. Un usuario
 * inactivo no encuentra fila (`AND activo = true`) y la función SQL
 * devuelve NULL — fail-closed para todo `=` / `IN` de las ~125 políticas.
 * Un usuario activo no cambia: la fila sigue existiendo y el `rol` sale igual.
 */

const RAIZ = join(__dirname, '..', '..');

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

const MIGRACION = 'src/sql/migrations/137_get_user_role_respeta_activo.sql';
const COPIAS_USUARIOS = [
  'src/supabase/functions/server/usuarios.tsx',
  'supabase/functions/make-server-1ccce916/usuarios.tsx',
] as const;

describe('migración 137: get_user_role respeta usuarios.activo', () => {
  const sql = leer(MIGRACION);

  it('es CREATE OR REPLACE, nunca DROP de la primitiva de autorización', () => {
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_user_role\s*\(\s*\)/i);
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
  });

  it('el cuerpo filtra activo = true; inactivo → NULL, activo sin cambio', () => {
    expect(sql).toMatch(
      /SELECT\s+rol\s+FROM\s+usuarios\s+WHERE\s+id\s*=\s*auth\.uid\(\)\s+AND\s+activo\s*=\s*true/i,
    );
    expect(sql).toMatch(/RETURNS\s+rol_usuario/i);
    expect(sql).toMatch(/LANGUAGE\s+sql/i);
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
  });

  it('guarda previa aborta si hay usuarios inactivos', () => {
    expect(sql).toMatch(/count\(\*\)\s+INTO\s+v_inactivos/i);
    expect(sql).toMatch(/FROM\s+public\.usuarios/i);
    expect(sql).toMatch(/WHERE\s+activo\s*=\s*false/i);
    expect(sql).toMatch(/IF\s+v_inactivos\s*<>\s*0\s+THEN/i);
    expect(sql).toMatch(/RAISE EXCEPTION '137 ABORTADA \(pre\): hay % usuario/);
  });

  it('guarda posterior exige EXECUTE para anon y authenticated (082)', () => {
    expect(sql).toContain("has_function_privilege('anon'");
    expect(sql).toContain("has_function_privilege('authenticated'");
    expect(sql).toContain("'public.get_user_role()'");
    expect(sql).toContain("'EXECUTE'");
    expect(sql).toMatch(/RAISE EXCEPTION '137 ABORTADA \(post\): anon perdio EXECUTE/);
    expect(sql).toMatch(/RAISE EXCEPTION '137 ABORTADA \(post\): authenticated perdio EXECUTE/);
  });

  it('search_path queda public, pg_temp', () => {
    expect(sql).toMatch(/SET\s+search_path\s+TO\s+'public',\s*'pg_temp'/i);
    expect(sql).toContain("'search_path=public, pg_temp'");
  });

  it('no reescribe las migraciones 073 ni 093', () => {
    const m073 = leer('src/sql/migrations/073_cerrar_escalacion_privilegios.sql');
    const m093 = leer('src/sql/migrations/093_rls_wrap_helpers_gerencia_rol.sql');
    expect(m073).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+.*get_user_role/i);
    expect(m093).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+.*get_user_role/i);
    expect(m093).toContain('`get_user_role()` NO');
  });
});

describe('capa app: cuenta desactivada', () => {
  it('ProtectedRoute muestra cuenta desactivada cuando activo === false, antes del branch Monitor', () => {
    const fuente = leer('src/components/auth/ProtectedRoute.tsx');
    const posActivo = fuente.indexOf('profile?.activo === false');
    const posMonitor = fuente.indexOf("profile?.rol === 'Monitor'");
    expect(posActivo).toBeGreaterThan(-1);
    expect(posMonitor).toBeGreaterThan(posActivo);
    expect(fuente).toContain('Cuenta desactivada');
  });

  it('getUserProfile propaga usuarios.activo al perfil', () => {
    const fuente = leer('src/utils/supabase/client.ts');
    const fn = fuente.slice(fuente.indexOf('export async function getUserProfile'));
    expect(fn).toContain('activo: data.activo');
  });
});

describe('capa edge: ban_duration al desactivar (ambos árboles idénticos)', () => {
  it('las dos copias de usuarios.tsx son byte-idénticas', () => {
    const a = leer(COPIAS_USUARIOS[0]);
    const b = leer(COPIAS_USUARIOS[1]);
    expect(a).toBe(b);
  });

  it('editarUsuario banea al desactivar y quita el baneo al reactivar', () => {
    for (const copia of COPIAS_USUARIOS) {
      const fuente = leer(copia);
      const fn = fuente.slice(fuente.indexOf('export async function editarUsuario'));
      expect(fn).toContain("activo === false ? '876000h'");
      expect(fn).toContain("activo === true ? 'none'");
      expect(fn).toContain('ban_duration');
    }
  });
});
