import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esDatoEdgeAprobado, leerDatoEdgeAprobado, resolverDependenciaEdgeAprobada } from './helpers/escoEdgeDependenciasQa';
describe('P4-4 grafo edge cerrado y detección de deriva', () => {
  it('alcanza motor/config/categorías puros con dependencias aprobadas y todas las rutas vigiladas', () => {
    const root = resolve(import.meta.dirname, '../..');
    const workflow = readFileSync(resolve(root, '.github/workflows/deteccion-deriva-despliegue.yml'), 'utf8');
    const paths = workflow.match(/slug: esco-consultas\s+path: ([^\n]+)/)?.[1].trim().split(/\s+/) ?? [];
    const visited = new Set<string>();
    const walk = (file: string) => {
      if (visited.has(file)) return;
      visited.add(file);
      if (esDatoEdgeAprobado(file)) { leerDatoEdgeAprobado(root, file); return; }
      const body = readFileSync(resolve(root, file), 'utf8');
      for (const m of body.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)) {
        const dependencia = resolverDependenciaEdgeAprobada(root, file, m[1]);
        for (const dato of dependencia.datos) walk(dato);
        if (!dependencia.local) continue;
        expect(dependencia.local).not.toMatch(/src\/supabase|make-server|telegram/i);
        walk(dependencia.local);
      }
    };
    walk('supabase/functions/esco-consultas/index.ts');
    expect([...visited]).toEqual(expect.arrayContaining(['src/utils/calculosHato.ts', 'src/utils/hatoCategorias.ts', 'src/utils/hatoConfigDesdeTabla.ts']));
    for (const file of visited) expect(paths.some(path => file === path || file.startsWith(path + '/')), file).toBe(true);
  });
});
