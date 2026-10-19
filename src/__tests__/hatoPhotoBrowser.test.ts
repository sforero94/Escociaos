import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {validatePhotoPreviewResult} from '../utils/hato/hatoPhotoPreviewProtocol';
import {pendingBrowserPhoto,runBrowserPhoto} from '../utils/hato/hatoPhotoBrowserAttempt';
import {photoBrowserRequest} from '../utils/hato/hatoPhotoBrowserServer';
import type {PhotoServiceClient} from '../utils/hato/hatoPhotoUploadService';
const fixture=()=>JSON.parse(readFileSync('src/__tests__/fixtures/hatoPhotoPreview.json','utf8'));
afterEach(()=>vi.unstubAllGlobals());
describe('durable browser photo and retained original OCR proof',()=>{
 it('reconstructs exact native capture/outcome/source proof',()=>{const r=fixture();expect(validatePhotoPreviewResult(r,r.upload.owner,r.upload.requestKey)).toEqual(r);expect(r.preview.capture_after.filas_escritas).toBeNull();});
 it.each(['permit','owner','key','counter','source','outcomeCapture','outcomeDate','objectPath','summary','extra'])('refuses forged %s',kind=>{const r=fixture(),owner=r.upload.owner,key=r.upload.requestKey;
  if(kind==='permit')r.permit=r.preview.permission_id;if(kind==='owner')r.preview.owner_id=r.preview.permission_id;if(kind==='key')r.upload.requestKey=r.preview.permission_id;if(kind==='counter')r.preview.capture_after.filas_escritas=1;if(kind==='source')r.preview.receipt.source={};if(kind==='outcomeCapture')r.preview.outcome.resultado.capturaId=r.preview.permission_id;if(kind==='outcomeDate')r.preview.outcome.resultado.diff[0].fecha='2026-11-01';if(kind==='objectPath')r.preview.outcome.resultado.ocr.fotos[0].rutaStorage='legacy/guess';if(kind==='summary')r.preview.outcome.resultado.ocr.resumen.fotosRecibidas=999;if(kind==='extra')r.clientActor=owner;expect(()=>validatePhotoPreviewResult(r,owner,key)).toThrow();
 });
 it('preserves corrupt owner storage rather than allocating a replacement',()=>{const r=fixture(),raw='{broken',store=new Map([[`hato_photo_browser_v1:${r.upload.owner}`,raw]]);vi.stubGlobal('localStorage',{getItem:(k:string)=>store.get(k)??null});expect(()=>pendingBrowserPhoto(r.upload.owner)).toThrow();expect([...store.values()]).toEqual([raw]);});
 it('fails a stale owner/generation before request or local UUID allocation',async()=>{const r=fixture(),request=vi.fn(),write=vi.fn();vi.stubGlobal('navigator',{locks:{request:async(_n:string,_o:unknown,f:()=>unknown)=>f()}});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:write});const client={auth:{getUser:async()=>({data:{user:{id:r.upload.owner}},error:null}),getSession:async()=>({data:{session:{access_token:'synthetic'}},error:null})}};await expect(runBrowserPhoto(client,'https://photo.invalid',r.upload.owner,'resume',()=>false,undefined,null,request)).rejects.toThrow();expect(write).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();});
 it.each(['foreign','unknown','oversized','duplicate'])('actual HTTP boundary refuses %s input before upload/RPC',async kind=>{
  const owner='10000000-0000-4000-8000-000000000001',rpc=vi.fn(),upload=vi.fn(),service={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc,storage:{from:()=>({upload,download:vi.fn()})}} as unknown as PhotoServiceClient;
  let request:Request;if(kind==='duplicate'){const form=new FormData();form.set('requestKey',owner);form.set('expectedOwner',owner);form.set('version','1');form.set('anio','2026');form.append('anio','2026');form.set('mes','10');form.set('fotos',new File([new Uint8Array([1])],'x.png',{type:'image/png'}));request=new Request('https://photo.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:form});}
  else request=new Request('https://photo.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic','Content-Type':'application/json',...(kind==='oversized'?{'Content-Length':'99999999'}:{})},body:JSON.stringify({action:kind==='unknown'?'new':'recover',expectedOwner:kind==='foreign'?'foreign':owner,requestKey:null})});
  expect((await photoBrowserRequest(request,owner,service,vi.fn())).status).toBe(502);expect(rpc).not.toHaveBeenCalled();expect(upload).not.toHaveBeenCalled();
 });
 it('keeps reviewed handler/pipeline and preview helpers mirrored',()=>{for(const name of ['hato-pesaje-foto.ts','hato-pesaje-pipeline.ts','hatoPhotoBrowserServer.ts','hatoPhotoPreviewProtocol.ts'])expect(readFileSync(`supabase/functions/make-server-1ccce916/${name}`,'utf8')).toBe(readFileSync(`src/supabase/functions/server/${name}`,'utf8'));});
});
