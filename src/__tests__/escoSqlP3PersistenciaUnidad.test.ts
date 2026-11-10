import { beforeEach, expect, it, vi } from 'vitest';
import { enviarMensajeSql } from '../utils/escoSqlChatService';
const mocks = vi.hoisted(() => ({ getSupabase: vi.fn(), fetch: vi.fn() }));
vi.mock('../utils/supabase/client', () => ({ getSupabase: mocks.getSupabase }));
beforeEach(() => { vi.stubGlobal('fetch', mocks.fetch); vi.clearAllMocks(); });
it('guarda el turno completo en una sola escritura con snapshot y sin muestras SQL', async () => {
 const insertMensajes = vi.fn(async (_filas: Record<string, unknown>[]) => ({error:null}));
 const crear = vi.fn(() => ({select: () => ({single: async () => ({data:{id:'conv-a'},error:null})})}));
 const db = {auth:{getSession:async()=>({data:{session:{access_token:'sintetico',user:{id:'user-a'}}}})},from:vi.fn((tabla:string)=>tabla==='chat_conversations'?{insert:crear}:{insert:insertMensajes})};
 mocks.getSupabase.mockReturnValue(db);
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({texto:'Respuesta',bloques:[],sugerencias:[],consultas:[{sql:'select 1',proposito:'p',n_filas:1,truncado:false,error:null,ms:1,filas_muestra:[{oculto:99}]}],ms:1}),{headers:{'content-type':'application/json'}}));
 const r = await enviarMensajeSql(null,'Pregunta',[],()=>{});
 expect(r.conversationId).toBe('conv-a'); expect(insertMensajes).toHaveBeenCalledTimes(1);
 const filas=insertMensajes.mock.calls[0][0] as {role:string;metadata:unknown}[];
 expect(filas.map((f)=>f.role)).toEqual(['user','assistant']); expect(JSON.stringify(filas)).not.toContain('filas_muestra'); expect(JSON.stringify(filas)).not.toContain('oculto');
 expect(r.asistente.metadata.motor).toBe('sql');
});
it('un abort o un error del motor no crea conversación ni escribe mensajes', async () => {
 const from=vi.fn(); mocks.getSupabase.mockReturnValue({auth:{getSession:async()=>({data:{session:{access_token:'sintetico',user:{id:'user-a'}}}})},from});
 mocks.fetch.mockResolvedValue(new Response('{"error":"Fallo sintético"}',{status:502,headers:{'content-type':'application/json'}}));
 await expect(enviarMensajeSql(null,'Pregunta',[],()=>{})).rejects.toThrow('Fallo sintético'); expect(from).not.toHaveBeenCalled();
});
it('recarga y recorta el historial SQL sin heredar mensajes legacy locales', async () => {
 const insertMensajes=vi.fn(async()=>({error:null}));
 const owner={eq:()=>owner,maybeSingle:async()=>({data:{id:'conv-a'},error:null})};
 const historialDb={eq:()=>historialDb,in:()=>historialDb,order:()=>historialDb,limit:async()=>({data:[{id:'sql-previo',role:'assistant',content:'b'.repeat(5000),metadata:{motor:'sql'},created_at:'2026-01-01T00:00:00Z'}],error:null})};
 mocks.getSupabase.mockReturnValue({auth:{getSession:async()=>({data:{session:{access_token:'sintetico',user:{id:'user-a'}}}})},from:(tabla:string)=>tabla==='chat_conversations'?{select:()=>owner}:{insert:insertMensajes,select:()=>historialDb}});
 mocks.fetch.mockResolvedValue(new Response(JSON.stringify({texto:'Respuesta',bloques:[],sugerencias:[],consultas:[],ms:1}),{headers:{'content-type':'application/json'}}));
 await enviarMensajeSql('conv-a','Seguimiento',[{id:'old',conversation_id:'conv-a',role:'assistant',content:'a'.repeat(5000),metadata:{},created_at:'2026-01-01'}],()=>{});
 const cuerpo=JSON.parse(mocks.fetch.mock.calls[0][1].body); expect(cuerpo.historial[0].texto).toHaveLength(4000); expect(cuerpo.historial).toEqual([{rol:'assistant',texto:'b'.repeat(4000)}]);
});
