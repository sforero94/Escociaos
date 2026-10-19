import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {photoIntent,validatePhotoResult,photoSame} from '../utils/hato/hatoPhotoUploadProtocol';
const fixture=()=>JSON.parse(readFileSync('src/__tests__/fixtures/hatoPhotoUpload.json','utf8'));
describe('strict native photo upload proof',()=>{
 it('independently reconstructs the exact native actor/paths/pages/unknown counters',()=>{const r=fixture();expect(validatePhotoResult(r,r.owner,r.requestKey)).toEqual(r);expect(r.receipt.capture.filas_escritas).toBeNull();});
 it.each(['owner','key','paths','permission','captureCount','captureActor','objectPath','objectDigest','objectMarker','extraReceipt','extraResult'])('rejects forged %s',kind=>{const r=fixture(),owner=r.owner,key=r.requestKey;
  if(kind==='owner')r.owner='22222222-2222-4222-8222-222222222222';if(kind==='key')r.requestKey='22222222-2222-4222-8222-222222222222';if(kind==='paths')r.paths[0]='legacy/guessed';if(kind==='permission')r.permit=r.permissionId;if(kind==='captureCount')r.receipt.capture.filas_escritas=1;if(kind==='captureActor')r.receipt.capture.created_by=null;if(kind==='objectPath')r.receipt.objects[0].row.name='other';if(kind==='objectDigest')r.receipt.objects[0].sha256='a'.repeat(64);if(kind==='objectMarker')r.receipt.objects[0].row.is_delete_marker=true;if(kind==='extraReceipt')r.receipt.clientActor=owner;if(kind==='extraResult')r.claimed=true;
  expect(()=>validatePhotoResult(r,owner,key)).toThrow();
 });
 it.each(['duplicate','oversized','fractional','extension','digest','extra'])('refuses unsafe original manifest %s',kind=>{const p=fixture().intent;if(kind==='duplicate')p.files.push(p.files[0]);if(kind==='oversized')p.files[0].size=15728641;if(kind==='fractional')p.month=1.5;if(kind==='extension')p.files[0].extension='jpg';if(kind==='digest')p.files[0].sha256='A'.repeat(64);if(kind==='extra')p.owner='client';expect(()=>photoIntent(p)).toThrow();});
 it('ignores JSON property order while refusing changed original source',()=>{const r=fixture();expect(photoSame({a:1,b:[2]},{b:[2],a:1})).toBe(true);const changed=fixture();changed.bucket.file_size_limit=99;expect(()=>validatePhotoResult(changed,r.owner,r.requestKey,undefined,r)).toThrow();});
});
