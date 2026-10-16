// Read-only actual source-call inventory, no domain or network access.
import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const roots=['src','supabase/functions'];const violations=[],files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['__tests__','vendor','node_modules'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name))files.push(p);}}
for(const root of roots)walk(root);
for(const p of files){const source=fs.readFileSync(p,'utf8'),tree=ts.createSourceFile(p,source,ts.ScriptTarget.Latest,true);function visit(n){if(ts.isCallExpression(n)){const callee=n.expression.getText(tree);if((ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='rpc'&&n.arguments.some(a=>ts.isStringLiteralLike(a)&&a.text==='fn_hato_registrar_venta_animales'))||callee==='useRegistrarSalidaHato'||callee==='registrarVenta'||callee.endsWith('.registrarVenta'))violations.push({path:p,line:tree.getLineAndCharacterOfPosition(n.getStart()).line+1,callee});}ts.forEachChild(n,visit);}visit(tree);}
if(violations.length)throw Error('Unretired actual sale callers: '+JSON.stringify(violations));
const caller=fs.readFileSync('src/components/hato/components/VentaAnimalesHatoDialog.tsx','utf8');if(!caller.includes("flow.run('prepare'")||!caller.includes("action('post')"))throw Error('Actual separate prepared sale caller missing');
process.stdout.write(JSON.stringify({files:files.length,legacySaleCalls:0,separatePreparedCaller:true})+'\n');
