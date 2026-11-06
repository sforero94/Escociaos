import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
describe('P4-4 grafo edge cerrado y detección de deriva',()=>{
 it('alcanza motor/config/categorías puros con imports relativos.ts y todas las rutas vigiladas',()=>{
  const root=resolve(import.meta.dirname,'../..'),workflow=readFileSync(resolve(root,'.github/workflows/deteccion-deriva-despliegue.yml'),'utf8');
  const paths=workflow.match(/slug: esco-consultas\s+path: ([^\n]+)/)?.[1].trim().split(/\s+/)??[],visited=new Set<string>();
  const walk=(file:string)=>{
   if(visited.has(file))return;visited.add(file);const body=readFileSync(resolve(root,file),'utf8');
   for(const m of body.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)){
    const spec=m[1];if(spec.startsWith('npm:'))continue;expect(spec,file).toMatch(/^\..*\.ts$/);
    const next=relative(root,resolve(root,dirname(file),spec));expect(next).not.toMatch(/src\/supabase|make-server|telegram/i);walk(next);
   }
  };walk('supabase/functions/esco-consultas/index.ts');
  expect([...visited]).toEqual(expect.arrayContaining(['src/utils/calculosHato.ts','src/utils/hatoCategorias.ts','src/utils/hatoConfigDesdeTabla.ts']));
  for(const file of visited)expect(paths.some(p=>file===p||file.startsWith(`${p}/`)),file).toBe(true);
 });
});
