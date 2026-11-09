// Test infrastructure: the approved parser pin and data files are explicit edge dependencies.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { expect } from 'vitest';

export const MAPEADOR_SQL_EDGE = 'src/utils/escoSql/consultaSegura.ts';
export const CATALOGO_SQL_EDGE = 'src/utils/escoSql/catalogoConsulta.json';
export const CONFIG_SQL_EDGE = 'supabase/functions/esco-consultas/deno.json';
export const LOCK_SQL_EDGE = 'supabase/functions/esco-consultas/deno.lock';
const INTEGRIDAD_PARSER = 'sha512-1WWa96Sw6h4uv9GLw98EzH/+xoBTC8j2TwV/AMW3E+Ir/fHOu/jLLbj6kPiz3y2bGISTKNYvKWwHoqvQ5FLuAw==';
const DATOS_EDGE = new Set([CATALOGO_SQL_EDGE, CONFIG_SQL_EDGE, LOCK_SQL_EDGE]);
export const esDatoEdgeAprobado = (archivo: string) => DATOS_EDGE.has(archivo);

export function leerDatoEdgeAprobado(root: string, archivo: string): unknown {
  expect(DATOS_EDGE.has(archivo), 'JSON fuera de las dependencias edge aprobadas: ' + archivo).toBe(true);
  return JSON.parse(readFileSync(resolve(root, archivo), 'utf8')) as unknown;
}
function validarPinParser(root: string): void {
  const config = leerDatoEdgeAprobado(root, CONFIG_SQL_EDGE) as { imports: Record<string, string>; lock: string };
  expect(config.imports).toEqual({ 'pgsql-ast-parser': 'npm:pgsql-ast-parser@12.0.2' });
  expect(config.lock).toBe('./deno.lock');
  const lock = leerDatoEdgeAprobado(root, LOCK_SQL_EDGE) as { version: string; specifiers: Record<string, string>; npm: Record<string, { integrity: string }> };
  expect(lock.version).toBe('4');
  expect(lock.specifiers['npm:pgsql-ast-parser@12.0.2']).toBe('12.0.2');
  expect(lock.npm['pgsql-ast-parser@12.0.2'].integrity).toBe(INTEGRIDAD_PARSER);
  const npmLock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8')) as { packages: Record<string, { version: string; integrity: string }> };
  expect(npmLock.packages['node_modules/pgsql-ast-parser']).toMatchObject({ version: '12.0.2', integrity: INTEGRIDAD_PARSER });
  const paquete = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
  expect(paquete.dependencies['pgsql-ast-parser']).toBe('12.0.2');
}

export function resolverDependenciaEdgeAprobada(root: string, archivo: string, spec: string): { local?: string; datos: string[] } {
  if (spec === 'pgsql-ast-parser') {
    expect(archivo, 'El alias del parser solo existe en el mapeador aprobado').toBe(MAPEADOR_SQL_EDGE);
    validarPinParser(root);
    return { datos: [CONFIG_SQL_EDGE, LOCK_SQL_EDGE] };
  }
  if (spec.startsWith('npm:')) {
    expect({ archivo, spec }, 'Dependencia npm edge no aprobada').toEqual({ archivo: 'supabase/functions/esco-consultas/index.ts', spec: 'npm:@supabase/supabase-js@2.49.8' });
    return { datos: [] };
  }
  if (spec.endsWith('.json')) {
    expect({ archivo, spec }, 'Import JSON edge no aprobado').toEqual({ archivo: MAPEADOR_SQL_EDGE, spec: './catalogoConsulta.json' });
    return { local: CATALOGO_SQL_EDGE, datos: [] };
  }
  expect(spec, archivo + ': dependencia edge relativa .ts').toMatch(/^\.\.?\/.*\.ts$/);
  const local = relative(root, resolve(root, dirname(archivo), spec)).split(sep).join('/');
  expect(local, archivo + ': import fuera del repositorio').not.toMatch(/^\.\.(?:\/|$)/);
  return { local, datos: [] };
}
