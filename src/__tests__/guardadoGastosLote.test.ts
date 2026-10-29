import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarGastosLote, leerIntentoGastosLote, finalizarGastosLote } from '@/utils/guardadoGastosLote';
import type { ClienteGastosLote } from '@/utils/guardadoGastosLote';

const usuario = '00000000-0000-4000-8000-000000000001';
const datos = [{ nombre: 'Sintético', valor: 10, url_factura: 'ruta-ya-cargada' }];
const resultado = { ids: ['10000000-0000-4000-8000-000000000001'], cantidad: 1 };
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});
const ok = () => ({ data: resultado, error: null });

describe('expense batch durable retry', () => {
  it('persists before RPC and binds the expected authenticated user', async () => {
    const rpc = vi.fn((_, args) => {
      expect(leerIntentoGastosLote(usuario)?.id).toBe(args.p_solicitud_id);
      expect(args.p_usuario_id).toBe(usuario);
      return Promise.resolve(ok());
    });
    expect(await guardarGastosLote({ rpc }, usuario, datos, 'stable-draft')).toBe(1);
    expect(leerIntentoGastosLote(usuario)?.id).toBe('stable-draft');
    finalizarGastosLote(usuario, 'stale-response');
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
    finalizarGastosLote(usuario, 'stable-draft');
    expect(leerIntentoGastosLote(usuario)).toBeNull();
  });

  it('replays identical payload and ID after lost response and reload', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(ok());
    await expect(guardarGastosLote({ rpc }, usuario, datos, 'draft-a')).rejects.toThrow('lost');
    const persisted = JSON.stringify([...storage]);
    storage = new Map(JSON.parse(persisted)); // New browser instance, same durable storage.
    expect(await guardarGastosLote({ rpc }, usuario)).toBe(1);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it('retains a frozen request after auth failure during replay', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({data:null,error:{code:'42501',message:'revoked'}});
    await expect(guardarGastosLote({ rpc }, usuario, datos)).rejects.toThrow();
    await expect(guardarGastosLote({ rpc }, usuario)).rejects.toThrow('revoked');
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
  });

  it.each(['23503', '22007', '40001', 'P0001', 'PGRST202'])('permits correction after definitive rollback %s with same draft identity', async code => {
    const rpc = vi.fn().mockResolvedValueOnce({ data:null,error:{code,message:'rollback'} }).mockResolvedValue(ok());
    await expect(guardarGastosLote({ rpc }, usuario, datos, 'original')).rejects.toThrow('rollback');
    expect(leerIntentoGastosLote(usuario)).toBeNull();
    await guardarGastosLote({ rpc }, usuario, [{...datos[0],valor:20}], 'original');
    expect(rpc.mock.calls[1][1].p_solicitud_id).toBe('original');
  });

  it('rejects changed data or another draft while a request is uncertain', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(guardarGastosLote({ rpc }, usuario, datos,'a')).rejects.toThrow();
    await expect(guardarGastosLote({ rpc }, usuario, [{nombre:'Otro'}],'a')).rejects.toThrow('cambiar');
    await expect(guardarGastosLote({ rpc }, usuario, datos,'b')).rejects.toThrow('otro lote');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('isolates account recovery and fails closed for corrupt/unavailable storage', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(guardarGastosLote({ rpc },usuario,datos)).rejects.toThrow();
    expect(leerIntentoGastosLote('other-user')).toBeNull();
    vi.stubGlobal('localStorage',{getItem:()=>'{broken'});
    await expect(guardarGastosLote({ rpc },usuario,datos)).rejects.toThrow();
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw new Error('quota');}});
    await expect(guardarGastosLote({ rpc },usuario,datos)).rejects.toThrow('quota');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, {cantidad:2,ids:['id']}, {cantidad:1,ids:[]}, {cantidad:1,ids:[123]}])('retains pending on malformed success %j', async data => {
    const rpc = vi.fn().mockResolvedValue({data,error:null}) as ClienteGastosLote['rpc'];
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow('confirmación');
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
  });
});
