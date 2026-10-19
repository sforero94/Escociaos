import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {validateUploadHistory,readUploadHistory,type HistoryClient} from '@/utils/hato/hatoUploadHistory';
import {filasVisibles,ListaSubidasMes} from '@/components/hato/components/SubidasPesajeMes';
const owner='11111111-1111-4111-8111-111111111111',captureId='22222222-2222-4222-8222-222222222222';
const entry={captureId,discardedAt:'2026-10-19T13:00:00.000Z',removedCount:2,retained:true as const};
const fixture=()=>({version:1,owner,year:2026,month:10,entries:[{...entry}]});
describe('authoritative retained upload disposition',()=>{
 it('accepts exact minimal proof and explicit empty month',()=>{expect(validateUploadHistory(fixture(),owner,2026,10).entries).toEqual([entry]);expect(validateUploadHistory({...fixture(),entries:[]},owner,2026,10).entries).toEqual([]);});
 it.each([{owner:captureId},{month:9},{privateSource:{}},{entries:[entry,entry]},{entries:[{...entry,removedCount:0}]},{entries:[{...entry,removedCount:2001}]},{entries:[{...entry,retained:false}]},{entries:[{...entry,discardedAt:'invalid'}]},{entries:[{...entry,receipt:{}}]}])('rejects malformed or mismatched history %j',patch=>{expect(()=>validateUploadHistory({...fixture(),...patch},owner,2026,10)).toThrow();});
 it('rejects unordered capture identifiers',()=>{expect(()=>validateUploadHistory({...fixture(),entries:[{...entry,captureId:'ffffffff-ffff-4fff-8fff-ffffffffffff'},entry]},owner,2026,10)).toThrow();});
 it('checks current authenticated owner before and after the read',async()=>{const getUser=vi.fn().mockResolvedValueOnce({data:{user:{id:owner}},error:null}).mockResolvedValueOnce({data:{user:{id:captureId}},error:null});const rpc=vi.fn().mockResolvedValue({data:fixture(),error:null});await expect(readUploadHistory({auth:{getUser},rpc},owner,2026,10,()=>true)).rejects.toThrow();expect(rpc).toHaveBeenCalledOnce();});
 it('does not read for a stale owner or generation',async()=>{const rpc=vi.fn();const client:HistoryClient={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc};await expect(readUploadHistory(client,owner,2026,10,()=>false)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();});
 it('never converts an unavailable reader into an empty disposition',async()=>{const client:HistoryClient={auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},rpc:async()=>({data:null,error:{message:'offline'}})};await expect(readUploadHistory(client,owner,2026,10,()=>true)).rejects.toThrow('No se pudo verificar');});
 it('retains photo and history while hiding repeat discard only for authoritative proof',()=>{
 const subida={captura:{id:captureId,creadoEn:'2026-10-18T12:00:00.000Z',anio:2026,mes:10,createdBy:owner,origen:'web' as const,desenlace:'ok' as const,storageBucket:'hato-pesajes-fotos',storageRutas:['original.jpg'],storageOk:true},filaIds:[],desde:null,hasta:null};
 const render=(known:boolean)=>renderToStaticMarkup(<ListaSubidasMes subidas={filasVisibles([subida],new Map(),{[captureId+':original.jpg']:'https://example.invalid/original.jpg'},known?new Map([[captureId,entry]]):new Map())} puedeGerencia descartando={false} onDescartar={()=>undefined}/>);
 expect(render(true)).toContain('2 pesajes descartados');expect(render(true)).toContain('fotos e historial conservados');expect(render(true)).toContain('https://example.invalid/original.jpg');expect(render(true)).not.toContain('Descartar esta subida');expect(render(false)).toContain('Descartar esta subida');expect(render(false)).toContain('Pesajes sujetos a verificación protegida');
 });
});
