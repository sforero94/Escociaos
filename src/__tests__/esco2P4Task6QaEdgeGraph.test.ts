// Independent P4-6 edge graph audit. Parse actual imports, including type exports
// and literal dynamic imports; do not assume a fixed module count.
import { existsSync,readFileSync } from 'node:fs';
import { dirname,relative,resolve,sep } from 'node:path';
import ts from 'typescript';
import { describe,expect,it } from 'vitest';

const root=resolve(import.meta.dirname,'../..');
function graph() {
  const visited=new Set<string>();const imports:Array<{from:string;spec:string}>=[];
  function walk(file:string) {
    if(visited.has(file))return;visited.add(file);
    const absolute=resolve(root,file);expect(existsSync(absolute),`Missing edge dependency ${file}`).toBe(true);
    const source=ts.createSourceFile(file,readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
    const specs:string[]=[];
    function visit(node:ts.Node) {
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))specs.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword) {
        expect(node.arguments.length).toBe(1);expect(ts.isStringLiteral(node.arguments[0]),`${file}: nonliteral dynamic import`).toBe(true);
        if(ts.isStringLiteral(node.arguments[0]))specs.push(node.arguments[0].text);
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
    for(const spec of specs) {
      imports.push({from:file,spec});if(spec.startsWith('npm:'))continue;
      expect(spec,`${file}: edge dependency must use relative .ts import`).toMatch(/^\.\.?\/.*\.ts$/);
      const next=relative(root,resolve(dirname(absolute),spec)).split(sep).join('/');
      expect(next).not.toMatch(/^\.\./);walk(next);
    }
  }
  walk('supabase/functions/esco-consultas/index.ts');return {visited:[...visited],imports};
}

describe('P4-6 QA: source-backed edge import graph and drift coverage',()=>{
  it('keeps every reachable local dependency relative, present and outside legacy/capture/UI trees',()=>{
    const {visited,imports}=graph();
    expect(visited.length).toBeGreaterThan(30);
    for(const file of visited)expect(file).not.toMatch(/src\/supabase\/|make-server-|telegram|src\/(?:components|hooks)\/|clima-actualizar|clima-reagregacion|calculosMonitoreoV2/i);
    expect(imports.filter(i=>i.spec.startsWith('npm:'))).toEqual([{from:'supabase/functions/esco-consultas/index.ts',spec:'npm:@supabase/supabase-js@2.49.8'}]);
  });

  it('watches every reachable local file in the actual esco-consultas drift workflow entry',()=>{
    const workflow=readFileSync(resolve(root,'.github/workflows/deteccion-deriva-despliegue.yml'),'utf8');
    const section=workflow.match(/- slug: esco-consultas\s+path: ([^\n]+)\s+verify_jwt: 'true'\s+health_anon: '401'/);
    expect(section).not.toBeNull();const watched=section![1].trim().split(/\s+/);
    for(const file of graph().visited)expect(watched.some(path=>file===path||file.startsWith(path+'/')),`${file} lacks drift coverage`).toBe(true);
  });

  it('reaches the approved monitoring, conductivity, rainfall-quality and radiation pure sources',()=>{
    const visited=graph().visited;
    for(const source of ['src/utils/calculosMonitoreo.ts','src/utils/calculosConductividad.ts','src/utils/escoClimaCalidad.ts','src/utils/calculosRadiacion.ts'])expect(visited).toContain(source);
  });

  it('retains gateway JWT verification and propagates the caller token from an anonymous-key client',()=>{
    const config=readFileSync(resolve(root,'supabase/config.toml'),'utf8');
    expect(config).toMatch(/\[functions\.esco-consultas\]\s*verify_jwt\s*=\s*true/);
    const entry=readFileSync(resolve(root,'supabase/functions/esco-consultas/index.ts'),'utf8');
    expect(entry).toContain('Authorization: `Bearer ${jwt}`');expect(entry).toContain('claveAnonima()');
    expect(entry).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
