// Versioned, pure CSV contract shared by the edge and browser. No database I/O.
export const CSV_PARSER_VERSION = 1;
export const CSV_MAX_BYTES = 1024 * 1024;
export const CSV_MAX_ROWS = 500;
export const CSV_ENUMS: Record<string, readonly string[]> = {
  categoria: ['Fertilizante','Fungicida','Insecticida','Acaricida','Insecticida - Acaricida','Herbicida','Biocontrolador','Biológicos','Coadyuvante','Regulador','Fitorregulador','Desinfectante','Enmienda','Enmienda - regulador','Herramienta','Equipo','Maquinaria','Otros'],
  grupo: ['Agroinsumos','Herramientas','Maquinaria y equipo'], tipo_aplicacion: ['Foliar','Edáfico','Drench'],
  estado_fisico: ['Líquido','Sólido'], unidad_medida: ['Litros','Kilos','Unidades'],
};
export const CSV_TEXT = ['nombre','registro_ica','blanco_biologico','ingrediente_activo_1','ingrediente_activo_2','ingrediente_activo_3','link_ficha_tecnica','link_hoja_seguridad'];
export const CSV_NUMERIC10 = ['concentracion_ia_1','concentracion_ia_2','concentracion_ia_3','nitrogeno','fosforo','potasio','calcio','magnesio','azufre','hierro','manganeso','zinc','cobre','boro','molibdeno','carbono_organico','silicio','sodio','presentacion_kg_l'];
export const CSV_PERCENT = ['nitrogeno','fosforo','potasio','calcio','magnesio','azufre'];
export const CSV_NUMERIC12 = ['precio_por_presentacion','precio_unitario','cantidad_actual','stock_minimo'];
export const CSV_INTEGER = ['periodo_reingreso_horas','periodo_carencia_dias'];
export const CSV_BOOLEAN = ['permitido_gerencia','epp_alto_nivel','riesgo_acuatico','riesgo_vida_silvestre','riesgo_polinizador','riesgo_transeunte','activo'];
export const CSV_FIELDS = [...CSV_TEXT,...Object.keys(CSV_ENUMS),...CSV_NUMERIC10,...CSV_NUMERIC12,...CSV_INTEGER,...CSV_BOOLEAN];
export type CsvProduct = Record<string, string | number | boolean>;
export interface CsvPayload { raw_csv: string; parser_version: number; products: CsvProduct[] }
export class CsvValidationError extends Error {
  constructor(public errores: string[], public total = 0) { super('Se encontraron errores de validación'); }
}
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
// RFC-style quoted cells, doubled quotes and embedded newlines. Comments only
// outside records, so a quoted line beginning # remains legitimate field data.
function records(raw: string): Array<{ cells: string[]; line: number }> {
  const rows: Array<{ cells: string[]; line: number }> = [];
  let cells: string[] = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
  const endCell = () => { cells.push(cell.trim()); cell = ''; closed = false; };
  const endRow = () => { endCell(); if (cells.some(c => c !== '')) rows.push({ cells, line:start }); cells = []; };
  const text = raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (!quoted && !closed && !cells.length && !cell.trim() && c==='#') {
      while (i<text.length && text[i]!=='\n') i++;
      line++;start=line;cell='';continue;
    }
    if (quoted) {
      if (c==='"') { if (text[i+1]==='"') { cell+='"';i++; } else { quoted=false;closed=true; } }
      else { cell+=c; if (c==='\n') line++; }
    } else if (c===',') endCell();
    else if (c==='\n') { endRow();line++;start=line; }
    else if (c==='"' && !cell.trim() && !closed) { cell='';quoted=true; }
    else if (c==='"' || (closed && !/\s/.test(c))) throw new CsvValidationError([`Fila ${line}: comillas CSV inválidas`]);
    else if (!closed) cell+=c;
  }
  if (quoted) throw new CsvValidationError([`Fila ${start}: celda entre comillas sin cerrar`]);
  if (cell || cells.length || closed) endRow();
  return rows;
}
// Decimal rounding is PostgreSQL numeric rounding (ties away from zero), not
// binary floating point Math.round. Preserve complete scientific/decimal tokens.
export function csvDecimal(token: string, max: number, integer = false): number {
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(token)) throw new Error('número inválido');
  const value=Number(token.replace(',','.'));
  if (!Number.isFinite(value) || Math.abs(value)>max || (integer && !Number.isInteger(value))) throw new Error('número fuera de rango');
  const match=token.replace(',','.').match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/)!;
  const digits=(match[2]+(match[3]??'')).replace(/^0+/,'') || '0';
  const shift=Number(match[4]??0)-(match[3]?.length??0)+2;
  if (shift>20) { if (value===0) return 0; throw new Error('número fuera de rango'); }
  const n=BigInt(digits);
  if(shift>=0){if(n*10n**BigInt(shift)>BigInt(Math.round(max*100)))throw new Error('número fuera de rango');}
  else if(-shift<=digits.length+1 && n>BigInt(Math.round(max*100))*10n**BigInt(-shift))throw new Error('número fuera de rango');
  if(integer){
    const integerShift=shift-2;
    if(integerShift<0 && (-integerShift>digits.length || n%10n**BigInt(-integerShift)!==0n)) {
      if(n!==0n)throw new Error('entero inválido');
    }
    return value;
  }
  let cents: bigint;
  if (shift>=0) cents=BigInt(digits)*10n**BigInt(shift);
  else if (-shift>digits.length+1) cents=0n;
  else { const d=10n**BigInt(-shift); const n=BigInt(digits); cents=n/d+(n%d*2n>=d?1n:0n); }
  const result=Number(cents)/100*(match[1]==='-'?-1:1);
  if (Math.abs(result)>max) throw new Error('número fuera de rango');
  return result===0?0:result;
}
export function parseCsvProducts(raw: string): CsvPayload {
  if (typeof raw!=='string' || !raw.trim()) throw new CsvValidationError(['No se proporcionó datos CSV']);
  if (new TextEncoder().encode(raw).length>CSV_MAX_BYTES) throw new CsvValidationError(['El archivo supera 1 MiB']);
  const rows=records(raw); const header=rows.shift()?.cells;
  if (!header || rows.length===0) throw new CsvValidationError(['El CSV debe incluir encabezados y productos']);
  if (rows.length>CSV_MAX_ROWS) throw new CsvValidationError(['Máximo 500 productos por archivo'],rows.length);
  if (new Set(header).size!==header.length || header.some(k=>!CSV_FIELDS.includes(k)) || ['nombre','categoria','grupo','unidad_medida'].some(k=>!header.includes(k)))
    throw new CsvValidationError(['Encabezados inválidos, desconocidos, duplicados o incompletos'],rows.length);
  const errors: string[]=[]; const names=new Set<string>();
  const products=rows.map(({cells,line})=>{
    const p: CsvProduct={activo:true};
    if(cells.length>header.length) errors.push(`Fila ${line}: demasiadas columnas`);
    header.forEach((k,i)=>{
      const v=cells[i]??'';
      if (!v) { if (['nombre','categoria','grupo','unidad_medida'].includes(k)) errors.push(`Fila ${line}: ${k} es obligatorio`); return; }
      if(CSV_TEXT.includes(k)) p[k]=v;
      else if(CSV_ENUMS[k]) { const canonical=CSV_ENUMS[k].find(x=>normalize(x)===normalize(v)); if(canonical) p[k]=canonical; else errors.push(`Fila ${line}: ${k} inválido`); }
      else if(CSV_BOOLEAN.includes(k)) {
        const flag=v.toLowerCase();
        if(['true','1','sí','si','yes'].includes(flag))p[k]=true;
        else if(['false','0','no'].includes(flag))p[k]=false;
        else errors.push(`Fila ${line}: ${k} debe ser true/1/sí/si/yes o false/0/no`);
      }
      else { try {
        const max=CSV_PERCENT.includes(k)?100:CSV_INTEGER.includes(k)?2147483647:CSV_NUMERIC12.includes(k)?9999999999.99:99999999.99;
        if(v.startsWith('-') && /[1-9]/.test(v.split(/[eE]/)[0])) throw new Error('número negativo');
        p[k]=csvDecimal(v,max,CSV_INTEGER.includes(k));
      } catch { errors.push(`Fila ${line}: ${k} debe ser un número finito válido dentro del rango permitido`); } }
    });
    if(typeof p.nombre==='string') { if(names.has(p.nombre)) errors.push(`Fila ${line}: nombre duplicado`);names.add(p.nombre); }
    return p;
  });
  if(errors.length) throw new CsvValidationError(errors,rows.length);
  return { raw_csv:raw,parser_version:CSV_PARSER_VERSION,products };
}
export interface CsvReceipt {
  success: true; actor: string; requestKey: string; parserVersion: number; csvSha256: string;
  total: number; importados: number; message: string;
  products: Array<{ product_id: string; opening_quantity: number; movement_id: string | null; product: Record<string, unknown> }>;
}
const uuid=(s:unknown):s is string=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function csvHash(raw:string):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
// Absence is actionable only with a durable cancellation proof tied to this
// exact owner, key and versioned raw file, just like a committed receipt.
export async function validateCsvStatus(data:unknown,actor:string,key:string,payload:CsvPayload):Promise<CsvReceipt|null> {
  if(!data || typeof data!=='object' || Array.isArray(data))throw new Error('Respuesta de resolución no verificable');
  const p=data as Record<string,unknown>;
  if(Object.keys(p).length!==6 || p.actor!==actor || p.requestKey!==key || p.parserVersion!==CSV_PARSER_VERSION
    || p.csvSha256!==await csvHash(payload.raw_csv) || typeof p.committed!=='boolean' || !('result' in p)
    || (!p.committed && p.result!==null))throw new Error('Respuesta de resolución no verificable. Conserve el intento pendiente.');
  return p.committed?validateCsvReceipt(p.result,actor,key,payload):null;
}
export async function validateCsvReceipt(data: unknown, actor: string, key: string, payload: CsvPayload): Promise<CsvReceipt> {
  const fail=():never=>{throw new Error('No se pudo verificar la importación. Conserve el intento pendiente.');};
  if(!data || typeof data!=='object' || Array.isArray(data)) return fail();
  const r=data as CsvReceipt;
  const hash=await csvHash(payload.raw_csv);
  if(r.success!==true || r.actor!==actor || r.requestKey!==key || r.parserVersion!==CSV_PARSER_VERSION || r.csvSha256!==hash
    || r.total!==payload.products.length || r.importados!==r.total || typeof r.message!=='string' || !Array.isArray(r.products) || r.products.length!==r.total) return fail();
  const ids=new Set<string>();const movements=new Set<string>();
  r.products.forEach((p,i)=>{
    const input=payload.products[i];const qty=Number(input.cantidad_actual??0);
    if(!uuid(p.product_id) || ids.has(p.product_id) || p.opening_quantity!==qty || !p.product || p.product.id!==p.product_id
      || p.product.cantidad_actual!==qty || p.product.updated_by!==actor || Object.keys(input).some(k=>p.product[k]!==input[k])) return fail();
    ids.add(p.product_id);
    if(qty===0) {if(p.movement_id!==null) return fail();}
    else {if(!uuid(p.movement_id)||movements.has(p.movement_id)) return fail();movements.add(p.movement_id);}
  });
  return r;
}
