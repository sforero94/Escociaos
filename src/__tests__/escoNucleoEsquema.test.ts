/** Independent repository-schema check; not a live PostgREST/cache acceptance test. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {GANADO_PROYECCIONES} from '../utils/escoNucleoGanado';
import {PROYECCIONES_CULTIVOS} from '../utils/escoNucleoCultivos';
import {COMPRAS_PROYECCION,MOVIMIENTOS_PROYECCION} from '../utils/escoNucleoComercio';
import {TAREAS_PROYECCION,RADIACION_PROYECCION,CONDUCTIVIDAD_PROYECCION} from '../utils/escoNucleoOperaciones';
const file=ts.createSourceFile('database.ts',readFileSync(resolve(__dirname,'../types/database.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const alias=file.statements.find((n):n is ts.TypeAliasDeclaration=>ts.isTypeAliasDeclaration(n)&&n.name.text==='Database')!;
function member(type:ts.TypeNode|undefined,key:string):ts.TypeNode {
 if(!type||!ts.isTypeLiteralNode(type))throw Error('Unknown schema shape');
 const prop=type.members.find(m=>ts.isPropertySignature(m)&&m.name.getText(file).replace(/^['"]|['"]$/g,'')===key) as ts.PropertySignature|undefined;
 if(!prop?.type)throw Error('Unknown schema member');return prop.type;
}
const tables=member(member(alias.type,'public'),'Tables');
function parts(projection:string):string[]{let depth=0,start=0;const result:string[]=[];for(let i=0;i<projection.length;i++){if(projection[i]==='(')depth++;if(projection[i]===')')depth--;if(projection[i]===','&&depth===0){result.push(projection.slice(start,i));start=i+1;}}result.push(projection.slice(start));return result;}
function projectionExists(table:string,projection:string):void {
 const tableType=member(tables,table),row=member(tableType,'Row');
 for(const field of parts(projection)){
  const embed=/^(?:\w+:)?(\w+)\((.+)\)$/.exec(field);
  if(embed){const relationships=member(tableType,'Relationships').getText(file);if(!relationships.includes('referencedRelation: "'+embed[1]+'"'))throw Error('Unknown relationship');projectionExists(embed[1],embed[2]);}
  else member(row,field);
 }
}
const projections:Array<[string,string]>=[...Object.entries(GANADO_PROYECCIONES),
 ['produccion',PROYECCIONES_CULTIVOS.produccion],['produccion',PROYECCIONES_CULTIVOS.calidad],['monitoreos',PROYECCIONES_CULTIVOS.monitoreos],['cosechas',PROYECCIONES_CULTIVOS.cosechas],['despachos',PROYECCIONES_CULTIVOS.despachos],
 ['compras',COMPRAS_PROYECCION],['compras',COMPRAS_PROYECCION+',proveedor_id,proveedor'],['movimientos_inventario',MOVIMIENTOS_PROYECCION+',saldo_anterior,saldo_nuevo'],
 ['tareas',TAREAS_PROYECCION],['clima_resumen_diario',RADIACION_PROYECCION],['mon_conductividad',CONDUCTIVIDAD_PROYECCION],
 ['productos','id,nombre'],['lotes','id,nombre'],['sublotes','id,lote_id,nombre'],['plagas_enfermedades_catalogo','id,nombre'],['clientes','id,nombre'],['tipos_tareas','id,categoria']];
it.each(projections)('selected source projection exists in versioned schema: %s / %s',(table,projection)=>{expect(()=>projectionExists(table,projection)).not.toThrow();});
it('the check rejects a nonexistent column and an unrelated embed rather than accepting loose fixtures',()=>{expect(()=>projectionExists('compras','id,nonexistent_column')).toThrow();expect(()=>projectionExists('compras','id,worker:empleados(nombre)')).toThrow('Unknown relationship');});
