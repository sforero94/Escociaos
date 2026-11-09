// Independent P4-6 edge graph audit. Parse actual imports, including type exports
// and dynamic imports; only the currently approved static graph is permitted.
import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe,expect,it } from 'vitest';
import { CATALOGO_SQL_EDGE, CONFIG_SQL_EDGE, LOCK_SQL_EDGE, MAPEADOR_SQL_EDGE, esDatoEdgeAprobado, leerDatoEdgeAprobado, resolverDependenciaEdgeAprobada } from './helpers/escoEdgeDependenciasQa';

const root=resolve(import.meta.dirname,'../..');
function graph() {
  const visited=new Set<string>();const imports:Array<{from:string;spec:string}>=[];const dynamicImports:Array<{from:string;spec:string}>=[];
  function walk(file:string) {
    if(visited.has(file))return;visited.add(file);
    const absolute=resolve(root,file);expect(existsSync(absolute),`Missing edge dependency ${file}`).toBe(true);
    if(esDatoEdgeAprobado(file)){leerDatoEdgeAprobado(root,file);return;}
    const source=ts.createSourceFile(file,readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
    const specs:string[]=[];
    function visit(node:ts.Node) {
      if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)) {
        specs.push(node.moduleSpecifier.text);
        if(node.moduleSpecifier.text.endsWith('.json')) {
          expect(ts.isImportDeclaration(node),file+': catálogo debe ser import JSON').toBe(true);
          if(ts.isImportDeclaration(node)) expect(node.attributes?.elements.map(e=>[e.name.text,ts.isStringLiteral(e.value)?e.value.text:null])).toEqual([['type','json']]);
        }
      }
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword) {
        expect(node.arguments.length).toBe(1);expect(ts.isStringLiteral(node.arguments[0]),`${file}: nonliteral dynamic import`).toBe(true);
        if(ts.isStringLiteral(node.arguments[0])){specs.push(node.arguments[0].text);dynamicImports.push({from:file,spec:node.arguments[0].text});}
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
    for(const spec of specs) {
      imports.push({from:file,spec});
      const dependency=resolverDependenciaEdgeAprobada(root,file,spec);
      for(const data of dependency.datos)walk(data);
      if(dependency.local)walk(dependency.local);
    }
  }
  walk('supabase/functions/esco-consultas/index.ts');return {visited:[...visited],imports,dynamicImports};
}

describe('P4-6 QA: source-backed edge import graph and drift coverage',()=>{
  it('keeps every reachable local dependency relative, present and outside legacy/capture/UI trees',()=>{
    const {visited,imports,dynamicImports}=graph();
    expect(dynamicImports,'No dynamic edge imports are approved').toEqual([]);
    expect(visited.length).toBeGreaterThan(30);
    for(const file of visited)expect(file).not.toMatch(/src\/supabase\/|make-server-|telegram|src\/(?:components|hooks)\/|clima-actualizar|clima-reagregacion|calculosMonitoreoV2/i);
    expect(imports.filter(i=>i.spec.startsWith('npm:'))).toEqual([{from:'supabase/functions/esco-consultas/index.ts',spec:'npm:@supabase/supabase-js@2.49.8'}]);
    expect(imports.filter(i=>i.spec==='pgsql-ast-parser')).toEqual([{from:MAPEADOR_SQL_EDGE,spec:'pgsql-ast-parser'}]);
    expect(visited).toEqual(expect.arrayContaining([CATALOGO_SQL_EDGE,CONFIG_SQL_EDGE,LOCK_SQL_EDGE]));
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

  it('does not widen the parser and JSON exceptions to another module, file or package',()=>{
    expect(()=>resolverDependenciaEdgeAprobada(root,'src/utils/escoSql/loop.ts','pgsql-ast-parser')).toThrow();
    expect(()=>resolverDependenciaEdgeAprobada(root,MAPEADOR_SQL_EDGE,'otro-paquete')).toThrow();
    expect(()=>resolverDependenciaEdgeAprobada(root,MAPEADOR_SQL_EDGE,'./otro-catalogo.json')).toThrow();
    expect(()=>resolverDependenciaEdgeAprobada(root,'src/utils/escoSql/loop.ts','./catalogoConsulta.json')).toThrow();
  });

  it('retains gateway JWT verification and keeps user and service credentials in separate client factories',()=>{
    const config=readFileSync(resolve(root,'supabase/config.toml'),'utf8');
    expect(config).toMatch(/\[functions\.esco-consultas\]\s*verify_jwt\s*=\s*true/);
    const entry=readFileSync(resolve(root,'supabase/functions/esco-consultas/index.ts'),'utf8');
    const source=ts.createSourceFile('index.ts',entry,ts.ScriptTarget.Latest,true);
    let dependencies:ts.ObjectLiteralExpression|undefined;
    const findDependencies=(node:ts.Node)=>{
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='manejar'&&node.arguments[1]&&ts.isObjectLiteralExpression(node.arguments[1]))dependencies=node.arguments[1];
      ts.forEachChild(node,findDependencies);
    };
    findDependencies(source);expect(dependencies).toBeDefined();
    const factory=(name:string):ts.ArrowFunction=>{
      const property=dependencies!.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(source)===name);
      expect(property,name).toBeDefined();
      if(!property||!ts.isPropertyAssignment(property)||!ts.isArrowFunction(property.initializer))throw new Error('Factory no reconocida: '+name);
      return property.initializer;
    };
    const createClientCall=(arrow:ts.ArrowFunction):ts.CallExpression=>{
      const calls:ts.CallExpression[]=[];
      const scan=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='createClient')calls.push(node);ts.forEachChild(node,scan);};
      scan(arrow.body);expect(calls).toHaveLength(1);return calls[0];
    };
    const property=(expression:ts.Expression,name:string):ts.Expression=>{
      if(!ts.isObjectLiteralExpression(expression))throw new Error('Objeto de opciones no reconocido');
      const member=expression.properties.find(p=>ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name))&&p.name.text===name);
      if(!member||!ts.isPropertyAssignment(member))throw new Error('Opción ausente: '+name);
      return member.initializer;
    };
    const user=factory('crearClienteUsuario'),userCall=createClientCall(user);
    expect(user.parameters.map(p=>p.name.getText(source))).toEqual(['jwt']);
    const userKey=userCall.arguments[1];
    expect(ts.isCallExpression(userKey)&&userKey.expression.getText(source)).toBe('claveAnonima');
    if(ts.isCallExpression(userKey))expect(userKey.arguments).toHaveLength(0);
    const bearer=property(property(property(userCall.arguments[2],'global'),'headers'),'Authorization');
    expect(ts.isTemplateExpression(bearer)).toBe(true);
    if(ts.isTemplateExpression(bearer)){
      expect(bearer.head.text).toBe('Bearer ');expect(bearer.templateSpans).toHaveLength(1);
      expect(bearer.templateSpans[0].expression.getText(source)).toBe('jwt');expect(bearer.templateSpans[0].literal.text).toBe('');
    }
    expect(user.body.getText(source)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    const anonymousKey=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='claveAnonima');
    expect(anonymousKey).toBeDefined();
    const anonymousEnvironmentKeys:string[]=[];
    const environmentKeys=(node:ts.Node)=>{
      if(ts.isCallExpression(node)&&node.expression.getText(source)==='Deno.env.get'){
        expect(node.arguments).toHaveLength(1);expect(ts.isStringLiteral(node.arguments[0])).toBe(true);
        if(ts.isStringLiteral(node.arguments[0]))anonymousEnvironmentKeys.push(node.arguments[0].text);
      }
      ts.forEachChild(node,environmentKeys);
    };
    environmentKeys(anonymousKey!);
    expect(anonymousEnvironmentKeys.sort()).toEqual(['SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS']);
    const service=factory('crearClienteServicio'),serviceCall=createClientCall(service);
    expect(service.parameters).toHaveLength(0);
    const serviceKey=serviceCall.arguments[1];
    expect(ts.isBinaryExpression(serviceKey)&&serviceKey.operatorToken.kind).toBe(ts.SyntaxKind.QuestionQuestionToken);
    if(ts.isBinaryExpression(serviceKey)){
      expect(ts.isStringLiteral(serviceKey.right)&&serviceKey.right.text).toBe('');
      expect(ts.isCallExpression(serviceKey.left)).toBe(true);
      if(ts.isCallExpression(serviceKey.left)){
        expect(serviceKey.left.expression.getText(source)).toBe('Deno.env.get');expect(serviceKey.left.arguments).toHaveLength(1);
        expect(ts.isStringLiteral(serviceKey.left.arguments[0])&&serviceKey.left.arguments[0].text).toBe('SUPABASE_SERVICE_ROLE_KEY');
      }
    }
    expect(service.body.getText(source)).not.toContain('claveAnonima');
    expect(service.body.getText(source)).not.toContain('Bearer ${jwt}');
  });
});
