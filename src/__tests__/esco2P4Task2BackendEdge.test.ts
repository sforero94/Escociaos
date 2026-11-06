import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { describe,expect,it } from 'vitest';
describe('P4-2 grafo edge y detector de deriva',()=>{
 it('alcanza el motor CE puro sin captura y vigila cada dependencia local',()=>{
   const root=resolve(import.meta.dirname,'../..');
   const workflow=readFileSync(resolve(root,'.github/workflows/deteccion-deriva-despliegue.yml'),'utf8');
   const paths=workflow.match(/slug: esco-consultas\s+path: ([^\n]+)/)?.[1].trim().split(/\s+/)??[];
   const visited=new Set<string>();
   const walk=(file:string)=>{
     if(visited.has(file))return;
     visited.add(file);
     const body=readFileSync(resolve(root,file),'utf8');
     const imports=[...body.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^;]*?\s+from\s*)?['"]([^'"]+)['"]/g)].map(m=>m[1]);
     for(const spec of imports){
       if(spec.startsWith('npm:'))continue;
       expect(spec,`${file}: import edge`).toMatch(/^\..*\.ts$/);
       const next=relative(root,resolve(root,dirname(file),spec));
       expect(next).not.toMatch(/calculosMonitoreoV2|src\/supabase|make-server|telegram/i);
       walk(next);
     }
   };
   walk('supabase/functions/esco-consultas/index.ts');
   expect([...visited]).toContain('src/utils/calculosConductividad.ts');
   for(const file of visited)expect(paths.some(path=>file===path||file.startsWith(`${path}/`)),file).toBe(true);
   expect(readFileSync(resolve(root,'src/utils/calculosConductividad.ts'),'utf8')).not.toMatch(/asignarRonda|supabase|@\//i);
 });
});
