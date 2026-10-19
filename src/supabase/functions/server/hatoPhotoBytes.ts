// Container envelopes only: no image decoding, sanitization or malware certification.
export const PHOTO_MAX_BYTES=15*1024*1024;
export const PHOTO_MAX_FILES=6;
export type PhotoMime='image/jpeg'|'image/png'|'image/webp'|'image/heic'|'image/heif';
export interface PhotoFile {page:number;sha256:string;size:number;mime:PhotoMime;extension:string}
export class PhotoValidationError extends Error {}
const fail=():never=>{throw new PhotoValidationError('Foto vacía, truncada o no compatible. Conserve el intento original.');};
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
      const height=a[i+3]*256+a[i+4],width=a[i+5]*256+a[i+6];if(n<8||!height||!width||height*width>40_000_000)return fail();frame=true;
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
const ascii=(a:Uint8Array,i:number,n:number)=>String.fromCharCode(...a.subarray(i,i+n));
function webp(a:Uint8Array){
 if(ascii(a,0,4)!=='RIFF'||ascii(a,8,4)!=='WEBP')return false;
 if(a.length<20)return fail();const v=new DataView(a.buffer,a.byteOffset,a.byteLength);if(v.getUint32(4,true)!==a.length-8)return fail();let i=12,image=false,extended=false;
 while(i+8<=a.length){const type=ascii(a,i,4),n=v.getUint32(i+4,true),start=i+8,end=start+n;if(end>a.length||!n)return fail();
  if(type==='VP8X'){if(i!==12||n!==10||(a[start]&0xc3)!==0||a[start+1]||a[start+2]||a[start+3])return fail();const w=1+a[start+4]+256*a[start+5]+65536*a[start+6],h=1+a[start+7]+256*a[start+8]+65536*a[start+9];if(w*h>40_000_000)return fail();extended=true;}
  else if(type==='VP8 '){if(image||n<11||(a[start]&1)!==0||!equal(a,start+3,[157,1,42]))return fail();const w=v.getUint16(start+6,true)&16383,h=v.getUint16(start+8,true)&16383;if(!w||!h||w*h>40_000_000)return fail();image=true;}
  else if(type==='VP8L'){if(image||n<6||a[start]!==47)return fail();const bits=v.getUint32(start+1,true),w=(bits&16383)+1,h=((bits>>>14)&16383)+1;if(bits>>>29||w*h>40_000_000)return fail();image=true;}
  else if(!extended||!['ICCP','ALPH','EXIF','XMP '].includes(type))return fail();
  i=end+(n%2);if(i>a.length||(n%2&&a[end]!==0))return fail();
 }
 if(i!==a.length||!image)return fail();return true;
}
function heif(a:Uint8Array):PhotoMime|null{
 if(a.length<20||ascii(a,4,4)!=='ftyp')return null;const v=new DataView(a.buffer,a.byteOffset,a.byteLength);let i=0,meta=false,data=false,brand=false;
 while(i+8<=a.length){const n=v.getUint32(i),type=ascii(a,i+4,4);if(n<8||n>a.length-i)return fail();
  if(i===0){if(n<20||(n-16)%4)return fail();const brands=[ascii(a,8,4)];for(let j=16;j<n;j+=4)brands.push(ascii(a,j,4));brand=brands.some(b=>['heic','heix','hevc','hevx','heim','heis','hevm','hevs'].includes(b));if(!brand)return fail();}
  else if(type==='ftyp')return fail();
  else if(type==='meta'){
   if(meta||n<20||v.getUint32(i+8)!==0)return fail();meta=true;let j=i+12;const seen=new Set<string>();while(j+8<=i+n){const size=v.getUint32(j),kind=ascii(a,j+4,4);if(size<8||size>i+n-j)return fail();seen.add(kind);j+=size;}if(j!==i+n||!['hdlr','pitm','iloc','iinf','iprp'].every(k=>seen.has(k)))return fail();
  }else if(type==='mdat'){if(n<=8)return fail();data=true;}
  else if(!['free','skip'].includes(type))return fail();i+=n;
 }
 if(i!==a.length||!meta||!data||!brand)return fail();return 'image/heic';
}
export async function validatePhotoBytes(bytes:Uint8Array,declared:string,page:number):Promise<PhotoFile>{
 if(!Number.isInteger(page)||page<1||page>PHOTO_MAX_FILES||bytes.length===0||bytes.length>PHOTO_MAX_BYTES)return fail();
 let mime:PhotoMime,extension:string;
 if(png(bytes)){mime='image/png';extension='png';}
 else if(jpeg(bytes)){mime='image/jpeg';extension='jpg';}
 else if(webp(bytes)){mime='image/webp';extension='webp';}
 else {const container=heif(bytes);if(!container)return fail();mime=container;extension='heic';}
 const normalized=declared.toLowerCase()==='image/jpg'?'image/jpeg':declared.toLowerCase();if(normalized!==mime&&!(mime==='image/heic'&&normalized==='image/heif'))return fail();
 const digest=await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>);
 return {page,size:bytes.length,sha256:Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''),mime,extension};
}
