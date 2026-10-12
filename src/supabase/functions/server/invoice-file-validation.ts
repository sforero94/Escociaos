// Bounded container-envelope validation, not decoding, sanitization or malware scanning.
export const INVOICE_VERSION=1;
export const INVOICE_MAX_BYTES=5*1024*1024;
export type InvoiceMime='image/jpeg'|'image/png'|'image/gif'|'application/pdf';
export interface InvoiceBytes { size:number; sha256:string; mime:InvoiceMime; extension:string; sourceExtension:string }
export class InvoiceValidationError extends Error {}
const unsupportedPdf=():never=>{throw new InvoiceValidationError('PDF no compatible: use un PDF sin cifrado, de una sola revisión y con tabla xref clásica');};
const fail=():never=>{throw new InvoiceValidationError('Factura vacía, truncada o de formato no permitido');};
const equal=(a:Uint8Array,start:number,b:number[])=>b.every((v,i)=>a[start+i]===v);
function png(a:Uint8Array){
  if(!equal(a,0,[137,80,78,71,13,10,26,10]))return false;
  const view=new DataView(a.buffer,a.byteOffset,a.byteLength);let i=8,first=true,hasData=false,ended=false,hasPalette=false,afterData=false,color=-1;
  while(i+12<=a.length){
    const n=view.getUint32(i);const kind=String.fromCharCode(...a.subarray(i+4,i+8));
    if(n>a.length-i-12 || !/^[A-Za-z]{4}$/.test(kind))return fail();
    if(first){
      if(kind!=='IHDR'||n!==13)return fail();const width=view.getUint32(i+8),height=view.getUint32(i+12),depth=a[i+16];color=a[i+17];
      const depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};
      if(!width||!height||width*height>40_000_000||!depths[color]?.includes(depth)||a[i+18]!==0||a[i+19]!==0||a[i+20]>1)return fail();first=false;
    }else if(kind==='IHDR')return fail();
    if(kind==='PLTE'){if(hasPalette||hasData||n===0||n%3!==0||n>768||[0,4].includes(color))return fail();hasPalette=true;}
    if(kind==='IDAT'){if(n===0||afterData||(color===3&&!hasPalette))return fail();hasData=true;}
    else if(hasData)afterData=true;
    if(kind[0]===kind[0].toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(kind))return fail();
    let crc=0xffffffff;
    for(let j=i+4;j<i+8+n;j++){crc^=a[j];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    if((crc^0xffffffff)>>>0!==view.getUint32(i+8+n))return fail();
    i+=n+12;if(kind==='IEND'){if(n!==0||!hasData||i!==a.length)return fail();ended=true;break;}
  }
  if(!ended)return fail();return true;
}
function jpeg(a:Uint8Array){
  if(!equal(a,0,[255,216]))return false;
  let i=2,frame=false,scan=false;
  while(i<a.length){
    if(a[i++]!==255)return fail();while(a[i]===255)i++;const marker=a[i++];
    if(marker===217){if(!frame||!scan||i!==a.length)return fail();return true;}
    if(marker===0||marker===216||marker===undefined)return fail();
    if(marker>=208&&marker<=215)continue;
    if(i+2>a.length)return fail();const n=a[i]*256+a[i+1];if(n<2||i+n>a.length)return fail();
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
      if(n<8||a[i+3]*256+a[i+4]===0||a[i+5]*256+a[i+6]===0)return fail();frame=true;
    }
    i+=n;
    if(marker===218){
      if(!frame)return fail();scan=true;
      let entropy=0;
      while(i<a.length){if(a[i++]!==255){entropy++;continue;}while(a[i]===255)i++;if(a[i]===0||(a[i]>=208&&a[i]<=215)){entropy++;i++;continue;}i--;break;}
      if(entropy===0)return fail();
    }
  }
  return fail();
}
function gif(a:Uint8Array){
  const header=String.fromCharCode(...a.subarray(0,6));if(header!=='GIF87a'&&header!=='GIF89a')return false;
  if(a.length<14||a[6]+256*a[7]===0||a[8]+256*a[9]===0)return fail();
  let i=13,image=false;if(a[10]&128)i+=3*(2**((a[10]&7)+1));
  const blocks=()=>{while(i<a.length){const n=a[i++];if(n===0)return;if(i+n>a.length)return fail();i+=n;}return fail();};
  while(i<a.length){const tag=a[i++];if(tag===59){if(!image||i!==a.length)return fail();return true;}
    if(tag===33){if(i>=a.length)return fail();i++;blocks();}
    else if(tag===44){if(i+9>a.length||a[i+4]+256*a[i+5]===0||a[i+6]+256*a[i+7]===0)return fail();const packed=a[i+8];i+=9;if(packed&128)i+=3*(2**((packed&7)+1));if(i>=a.length||a[i]<2||a[i]>8)return fail();i++;blocks();image=true;}
    else return fail();
  }
  return fail();
}
function pdf(a:Uint8Array){
  const text=new TextDecoder('latin1').decode(a);
  if(!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(text))return false;
  // Supported grammar: single revision, classic cross-reference table, direct
  // object offsets and Catalog root. XRef streams/incremental revisions fail
  // closed. This is a container envelope; stream payloads are never executed.
  const finish=text.match(/startxref\s+(\d+)\s+%%EOF[\t\r\n ]*$/);if(!finish)return fail();
  const offset=Number(finish[1]);if(!Number.isSafeInteger(offset)||offset<9||offset>=a.length)return fail();
  const section=text.slice(offset);if(!/^xref(?:\s|$)/.test(section)||/\/(?:Encrypt|ObjStm|XRefStm|Prev)\b/.test(text))return unsupportedPdf();const split=section.match(/^xref\s+([\s\S]*?)trailer\s*<<([\s\S]*?)>>\s*startxref\s+\d+\s+%%EOF[\t\r\n ]*$/);if(!split)return fail();
  const root=split[2].match(/\/Root\s+(\d+)\s+(\d+)\s+R(?:\s|$)/),size=split[2].match(/\/Size\s+(\d+)(?:\s|$)/);
  if(!root||!size||/\/(?:Prev|XRefStm)\b/.test(split[2]))return fail();
  const lines=split[1].trim().split(/\r\n|\r|\n/);const entries=new Map<number,{offset:number;generation:number}>();let count=0;
  for(let i=0;i<lines.length;){const range=lines[i++].trim().match(/^(\d+)\s+(\d+)$/);if(!range)return fail();const first=Number(range[1]),length=Number(range[2]);
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(length)||length<1||length>100000||count+length>100000||i+length>lines.length)return fail();count+=length;
    for(let j=0;j<length;j++){const item=lines[i++].match(/^(\d{10}) (\d{5}) ([nf]) ?$/);if(!item)return fail();
      const id=first+j;if(entries.has(id))return fail();const pos=Number(item[1]),generation=Number(item[2]);
      entries.set(id,{offset:item[3]==='n'?pos:-1,generation});
      if(item[3]==='n'&&(pos<9||pos>=offset||!text.slice(pos).startsWith(`${id} ${generation} obj`)))return fail();
    }
  }
  if(count!==Number(size[1])||entries.size!==count||[...entries.keys()].some(id=>id>=count))return fail();
  const objects=[...entries.entries()].filter(([,v])=>v.offset>=0).sort((a,b)=>a[1].offset-b[1].offset);
  for(let i=0;i<objects.length;i++){
    const [id,entry]=objects[i],end=i+1<objects.length?objects[i+1][1].offset:offset;
    const body=text.slice(entry.offset,end);if(!new RegExp(`^${id} ${entry.generation} obj(?:\\s|$)`).test(body)||! /endobj\s*$/.test(body))return fail();
    if(id===Number(root[1])&&(entry.generation!==Number(root[2])||! /\/Type\s*\/Catalog(?:\s|>|\/)/.test(body)))return fail();
  }
  const catalog=entries.get(Number(root[1]));if(!catalog||catalog.offset<0||catalog.generation!==Number(root[2]))return fail();
  return true;
}
export async function validateInvoiceBytes(bytes:Uint8Array,declared:string,name:string):Promise<InvoiceBytes>{
  if(bytes.length===0||bytes.length>INVOICE_MAX_BYTES)return fail();
  let mime:InvoiceMime,extension:string;
  if(png(bytes)){mime='image/png';extension='png';}
  else if(jpeg(bytes)){mime='image/jpeg';extension='jpg';}
  else if(gif(bytes)){mime='image/gif';extension='gif';}
  else if(pdf(bytes)){mime='application/pdf';extension='pdf';}
  else return fail();
  const basename=name.split(/[\\/]/).pop()??'';
  const sourceExtension=basename.includes('.')?basename.split('.').pop()?.toLowerCase()??'':'';
  if((declared==='image/jpg'?'image/jpeg':declared)!==mime || !(extension==='jpg'?['jpg','jpeg']: [extension]).includes(sourceExtension))return fail();
  const digest=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);
  return {size:bytes.length,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),mime,extension,sourceExtension};
}
