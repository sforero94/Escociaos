// Source-only inventory. No credentials, remote SDK or database transport.
import ts from 'typescript';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const files=execFileSync('rg',['--files','src','supabase'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.[cm]?tsx?$/.test(p)&&!/(?:__tests__|\.test\.|vendor\/)/.test(p)).sort();
const targets=new Set(['productos','compras','movimientos_inventario','hato_tratamientos','hato_tratamiento_pasos']);
const rows=[],rpc=[];
const digest=createHash('sha256');
for(const path of files){
 const source=fs.readFileSync(path,'utf8');digest.update(path+'\0'+source+'\0');
 const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
 if(file.parseDiagnostics.length)throw Error('Source inventory requires valid TypeScript syntax: '+path);
 function visit(n){
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='rpc'&&n.arguments.length&&ts.isStringLiteralLike(n.arguments[0]))rpc.push({path,line:file.getLineAndCharacterOfPosition(n.getStart()).line+1,function:n.arguments[0].text});
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='from'&&n.arguments.length){
   let arg=n.arguments[0];
   while(ts.isAsExpression(arg)||ts.isTypeAssertionExpression(arg)||ts.isParenthesizedExpression(arg)||ts.isNonNullExpression(arg))arg=arg.expression;
   const table=ts.isStringLiteralLike(arg)?arg.text:null;
   let top=n,methods=[];
   while(top.parent&&(ts.isPropertyAccessExpression(top.parent)&&top.parent.expression===top||ts.isCallExpression(top.parent)&&top.parent.expression===top)){
    top=top.parent;if(ts.isCallExpression(top)&&ts.isPropertyAccessExpression(top.expression))methods.push(top.expression.name.text);
   }
   const writes=methods.filter(m=>['insert','update','delete','upsert'].includes(m));
   if(writes.length&&(targets.has(table)||table===null)) rows.push({path,line:file.getLineAndCharacterOfPosition(n.getStart()).line+1,table:table??'<dynamic>',argument:table===null?arg.getText(file):undefined,writes});
  }
  ts.forEachChild(n,visit);
 }
 visit(file);
}
process.stdout.write(JSON.stringify({scanned_files:files.length,source_tree_sha256:digest.digest('hex'),mutating_callers:rows,legacy_treatment_rpc_callers:rpc.filter(r=>r.function==='fn_hato_registrar_tratamiento'),legacy_clinical_confirmation_callers:rpc.filter(r=>r.function==='fn_hato_confirmar_paso_tratamiento'),clinical_confirmation_callers:rpc.filter(r=>/^fn_clinical_step_(web|telegram)$/.test(r.function)),stock_rpc_callers:rpc.filter(r=>/fn_(purchase|product_catalog|manual_stock|csv_product|application_clos|application_plan|ronda_|hato_treatment)/.test(r.function)),limits:['Literal fluent SDK calls only; dynamic table/helper call graphs require manual reconciliation.']},null,2)+'\n');
