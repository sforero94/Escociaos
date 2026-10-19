import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validatePhotoBytes,PHOTO_MAX_BYTES} from '../utils/hato/hatoPhotoBytes';
import {png,jpeg,gif,pdf} from './invoiceUploadFixtures';
const join=(...parts:Uint8Array[])=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){b.set(p,i);i+=p.length;}return b;};
const text=(s:string)=>new TextEncoder().encode(s);
const box=(name:string,body:Uint8Array)=>{const b=new Uint8Array(8+body.length);new DataView(b.buffer).setUint32(0,b.length);b.set(text(name),4);b.set(body,8);return b;};
function heic(){return join(box('ftyp',join(text('heic'),new Uint8Array(4),text('mif1'))),box('meta',join(new Uint8Array(4),...['hdlr','pitm','iloc','iinf','iprp'].map(n=>box(n,new Uint8Array())))),box('mdat',new Uint8Array([1])));}
function webp(){const payload=new Uint8Array([16,0,0,157,1,42,1,0,1,0,7]),chunk=new Uint8Array(20);chunk.set(text('VP8 '));new DataView(chunk.buffer).setUint32(4,payload.length,true);chunk.set(payload,8);const b=join(text('RIFF'),new Uint8Array(4),text('WEBP'),chunk);new DataView(b.buffer).setUint32(4,b.length-8,true);return b;}
describe('Hato prospective actual-byte photo envelopes',()=>{
 it.each([[png,'image/png','png'],[jpeg,'image/jpg','jpg'],[webp(),'image/webp','webp'],[heic(),'image/heif','heic']] as const)('derives canonical container/hash from bytes (%s)',async(bytes,mime,extension)=>{const r=await validatePhotoBytes(bytes,mime,1);expect(r).toMatchObject({page:1,size:bytes.length,extension});expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);});
 it.each([[gif,'image/png'],[pdf(),'image/jpeg'],[png,'image/jpeg'],[new Uint8Array(),'image/png'],[new Uint8Array(PHOTO_MAX_BYTES+1),'image/png']] as const)('rejects disallowed, empty, oversized or MIME-spoofed content',async(bytes,mime)=>{await expect(validatePhotoBytes(bytes,mime,1)).rejects.toThrow();});
 it.each([0,7,1.5])('refuses unbounded/noncanonical page %s',async page=>{await expect(validatePhotoBytes(png,'image/png',page)).rejects.toThrow();});
 it('requires PNG CRC/envelope, JPEG EOF and exact WebP/HEIF box boundaries',async()=>{
  const bad=new Uint8Array(png);bad[bad.length-1]^=1;const b=webp();new DataView(b.buffer).setUint32(4,b.length,true);const h=heic();new DataView(h.buffer).setUint32(0,4294967295);
  for(const [bytes,mime] of [[bad,'image/png'],[jpeg.slice(0,-1),'image/jpeg'],[join(png,new Uint8Array([0])),'image/png'],[b,'image/webp'],[h,'image/heic']] as const)await expect(validatePhotoBytes(bytes,mime,1)).rejects.toThrow();
 });
 it('keeps all three function-root helper packages identical to reviewed pure sources',()=>{
  for(const name of ['hatoPhotoBytes','hatoPhotoUploadProtocol','hatoPhotoUploadService']){
   let expected=readFileSync(`src/utils/hato/${name}.ts`,'utf8');for(const dep of ['hatoPhotoBytes','hatoPhotoUploadProtocol'])expected=expected.split(`from './${dep}'`).join(`from './${dep}.ts'`);
   for(const root of ['src/supabase/functions/server','supabase/functions/make-server-1ccce916'])expect(readFileSync(`${root}/${name}.ts`,'utf8')).toBe(expected);
  }
 });
});
