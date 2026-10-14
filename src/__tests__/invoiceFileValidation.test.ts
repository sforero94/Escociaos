import {describe,it,expect} from 'vitest';
import {validateInvoiceBytes,INVOICE_MAX_BYTES} from '../supabase/functions/server/invoice-file-validation';
import {png,gif,jpeg,pdf,ordinaryPdf} from './invoiceUploadFixtures';
describe('actual invoice bytes and bounded envelope',()=>{
 it.each([[png,'image/png','png'],[gif,'image/gif','gif'],[jpeg,'image/jpeg','jpg'],[pdf(),'application/pdf','pdf']] as const)('accepts canonical container %s',async(b,mime,extension)=>{const r=await validateInvoiceBytes(b,mime,'invoice.'+extension);expect(r).toMatchObject({size:b.length,mime,extension,sourceExtension:extension});expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);});
 it('accepts an ordinary single-page classic-xref PDF',async()=>{expect((await validateInvoiceBytes(ordinaryPdf(),'application/pdf','invoice.pdf')).mime).toBe('application/pdf');});
 it('accepts exactly five MiB and rejects one byte more independently of MIME',async()=>{expect((await validateInvoiceBytes(pdf(INVOICE_MAX_BYTES),'application/pdf','a.pdf')).size).toBe(INVOICE_MAX_BYTES);await expect(validateInvoiceBytes(pdf(INVOICE_MAX_BYTES+1),'application/pdf','a.pdf')).rejects.toThrow();});
 it('rejects empty, HTML, MIME/extension spoof, signature-only and truncated containers',async()=>{
  for(const [bytes,mime,name] of [[new Uint8Array(),'image/png','a.png'],[new TextEncoder().encode('<script>x</script>'),'application/pdf','a.pdf'],[png,'image/jpeg','a.jpg'],[png,'image/png','a.svg'],[pdf(),'application/pdf','pdf'],[png.subarray(0,png.length-1),'image/png','a.png'],[gif.subarray(0,13),'image/gif','a.gif'],[jpeg.subarray(0,jpeg.length-2),'image/jpeg','a.jpg'],[pdf().subarray(0,20),'application/pdf','a.pdf'],[new TextEncoder().encode('%PDF-1.7\n%%EOF'),'application/pdf','a.pdf']] as const)await expect(validateInvoiceBytes(bytes,mime,name)).rejects.toThrow();
 });
 it('rejects CRC mutations and trailing non-container content',async()=>{const changed=png.slice();changed[40]^=1;await expect(validateInvoiceBytes(changed,'image/png','a.png')).rejects.toThrow();const extra=new Uint8Array(gif.length+1);extra.set(gif);await expect(validateInvoiceBytes(extra,'image/gif','a.gif')).rejects.toThrow();});
 it('requires actual xref object offsets, a Catalog root and complete endobj grammar',async()=>{
  const original=new TextDecoder().decode(pdf());
  for(const changed of [original.replace('0000000009 00000 n','0000000010 00000 n'),original.replace('/Root 1 0 R','/Root 7 0 R'),original.replace('/Catalog','/Invalid'),original.replace('endobj','xxxxxx'),original.replace('/Size 2','/Size 3')])await expect(validateInvoiceBytes(new TextEncoder().encode(changed),'application/pdf','a.pdf')).rejects.toThrow();
 });

 it('clearly refuses encrypted, incremental and object-stream PDF variants',async()=>{
  const original=new TextDecoder().decode(pdf());
  for(const variant of ['/Encrypt 2 0 R','/Prev 9','/XRefStm 9','/Type /ObjStm'])await expect(validateInvoiceBytes(new TextEncoder().encode(original.replace('/Size 2','/Size 2 '+variant)),'application/pdf','a.pdf')).rejects.toThrow('PDF no compatible');
 });

});
