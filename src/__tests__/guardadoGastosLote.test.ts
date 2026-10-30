import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guardarGastosLote, leerIntentoGastosLote } from '@/utils/guardadoGastosLote';
import type { ClienteGastosLote } from '@/utils/guardadoGastosLote';

const usuario = '00000000-0000-4000-8000-000000000001';
const key = `gastos_lote_pendiente_v1_${usuario}`;
const datos = [{ nombre: 'Sintético', valor: 10, url_factura: 'ruta-ya-cargada' }];
const resultado = { ids: ['10000000-0000-4000-8000-000000000001'], cantidad: 1 };
let storage: Map<string, string>;
let locked: number;
let request: ReturnType<typeof vi.fn>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  storage = new Map();
  locked = 0;
  let tail: Promise<unknown> = Promise.resolve();
  // Deterministic Web Locks model, not evidence of a real browser implementation.
  request = vi.fn((_name, _options, work) => {
    const next = tail.then(async () => {
      expect(locked).toBe(0);
      locked++;
      try { return await work(); } finally { locked--; }
    });
    tail = next.catch(() => {});
    return next;
  });
  vi.stubGlobal('navigator', { locks: { request } });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  });
});
const ok = () => ({ data: resultado, error: null });

describe('expense batch serialized durable retry', () => {
  it('owns the lock before persistence, RPC and synchronous confirmed cleanup', async () => {
    const rpc = vi.fn((_, args) => {
      expect(locked).toBe(1);
      expect(leerIntentoGastosLote(usuario)?.id).toBe(args.p_solicitud_id);
      expect(args.p_usuario_id).toBe(usuario);
      return Promise.resolve(ok());
    });
    const confirmed = vi.fn(() => { expect(locked).toBe(1); expect(storage.has(key)).toBe(true); });
    expect(await guardarGastosLote({ rpc }, usuario, datos, 'stable-draft', confirmed)).toBe(1);
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(leerIntentoGastosLote(usuario)).toBeNull();
    expect(request.mock.calls[0].slice(0,2)).toEqual([key, {mode:'exclusive'}]);
  });

  it('replays identical payload and ID after lost response and reload', async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue(ok());
    await expect(guardarGastosLote({ rpc }, usuario, datos, 'draft-a')).rejects.toThrow('lost');
    storage = new Map(JSON.parse(JSON.stringify([...storage])));
    expect(await guardarGastosLote({ rpc }, usuario)).toBe(1);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(leerIntentoGastosLote(usuario)?.id).toBe('draft-a');
  });

  it.each(['42501','23503','22007','PGRST202'])('retains an uncertain replay after later rejection %s', async code => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({data:null,error:{code,message:'rejected'}});
    await expect(guardarGastosLote({ rpc }, usuario, datos)).rejects.toThrow();
    const frozen = storage.get(key);
    await expect(guardarGastosLote({ rpc }, usuario)).rejects.toThrow('rejected');
    expect(storage.get(key)).toBe(frozen);
  });

  it.each(['23503', '23514', '22007', '40001', 'P0001', 'PGRST202'])('permits correction after first-attempt rollback %s with same draft ID', async code => {
    const rpc = vi.fn().mockResolvedValueOnce({ data:null,error:{code,message:'rollback'} }).mockResolvedValue(ok());
    await expect(guardarGastosLote({ rpc }, usuario, datos, 'original')).rejects.toThrow('rollback');
    expect(leerIntentoGastosLote(usuario)).toBeNull();
    await guardarGastosLote({ rpc }, usuario, [{...datos[0],valor:20}], 'original');
    expect(rpc.mock.calls[1][1].p_solicitud_id).toBe('original');
  });

  it('corrects a blank-name23514 rejection under the same durable draft UUID', async () => {
    const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'23514',message:'Nombre inválido'}}).mockResolvedValue(ok());
    await expect(guardarGastosLote({rpc},usuario,[{...datos[0],nombre:''}],'original-name')).rejects.toThrow('Nombre');
    expect(leerIntentoGastosLote(usuario)).toBeNull();
    await guardarGastosLote({rpc},usuario,[{...datos[0],nombre:'Corregido'}],'original-name',()=>true);
    expect(rpc.mock.calls[0][1].p_solicitud_id).toBe(rpc.mock.calls[1][1].p_solicitud_id);
    expect(rpc.mock.calls[1][1].p_datos[0].nombre).toBe('Corregido');
    expect(leerIntentoGastosLote(usuario)).toBeNull();
  });

  it.each(['PGB01','22023'])('never erases a first-attempt payload conflict %s', async code => {
    const rpc = vi.fn().mockResolvedValue({data:null,error:{code,message:'conflict'}});
    await expect(guardarGastosLote({rpc},usuario,datos,'same-id')).rejects.toThrow('conflict');
    expect(leerIntentoGastosLote(usuario)).toEqual({id:'same-id',datos});
  });

  it('rejects changed data or another draft without overwriting or sending it', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(guardarGastosLote({ rpc }, usuario, datos,'a')).rejects.toThrow();
    const frozen=storage.get(key);
    await expect(guardarGastosLote({ rpc }, usuario, [{nombre:'Otro'}],'a')).rejects.toThrow('cambiar');
    await expect(guardarGastosLote({ rpc }, usuario, datos,'b')).rejects.toThrow('otro lote');
    expect(storage.get(key)).toBe(frozen);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([false,true])('serializes adversarial same-UUID contenders with different edits/invoice paths, reverse=%s', async reverse => {
    const a=datos;
    const b=[{...datos[0],valor:20,url_factura:'other-upload-path'}];
    const first=reverse?b:a, second=reverse?a:b;
    const entered=deferred<void>(), release=deferred<void>();
    const rpc = vi.fn(async () => { entered.resolve(); await release.promise; throw new Error('committed response lost'); });
    const one=guardarGastosLote({rpc},usuario,first,'same-uuid').catch(e=>e.message);
    await entered.promise;
    const frozen=storage.get(key);
    const two=guardarGastosLote({rpc},usuario,second,'same-uuid').catch(e=>e.message);
    expect(request).toHaveBeenCalledTimes(2);
    expect(storage.get(key)).toBe(frozen);
    expect(rpc).toHaveBeenCalledTimes(1);
    release.resolve();
    expect(await one).toContain('response lost');
    expect(await two).toContain('cambiar');
    expect(storage.get(key)).toBe(frozen);
    expect(leerIntentoGastosLote(usuario)?.datos).toEqual(first);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['rollback','success'])('never removes another exact payload under the same UUID after external replacement: %s', async kind => {
    const replaced={id:'same',datos:[{...datos[0],url_factura:'other-owner-path'}]};
    const rpc = vi.fn(async () => {
      storage.set(key,JSON.stringify(replaced)); // Deliberate noncooperating writer.
      return kind==='rollback'?{data:null,error:{code:'23503',message:'rollback'}}:ok();
    });
    const cleanup=vi.fn();
    await expect(guardarGastosLote({rpc},usuario,datos,'same',cleanup)).rejects.toThrow();
    expect(leerIntentoGastosLote(usuario)).toEqual(replaced);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it.each(['absent','no-request'])('fails closed before storage/RPC when cross-tab locking is unsupported: %s', async mode => {
    vi.stubGlobal('navigator',mode==='absent'?undefined:{locks:{}});
    const rpc=vi.fn();
    const get=vi.fn(); vi.stubGlobal('localStorage',{getItem:get});
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow('navegador');
    expect(rpc).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });

  it('retains recovery when account-change cleanup declines or throws', async () => {
    const rpc=vi.fn().mockResolvedValue(ok());
    await guardarGastosLote({rpc},usuario,datos,'id',()=>false);
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
    await expect(guardarGastosLote({rpc},usuario,undefined,undefined,()=>{throw Error('cleanup failed');})).rejects.toThrow('cleanup failed');
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
  });

  it('isolates recovery by account and rejects corrupt/unavailable storage', async () => {
    const rpc=vi.fn().mockRejectedValue(new Error('timeout'));
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow();
    expect(leerIntentoGastosLote('other-user')).toBeNull();
    vi.stubGlobal('localStorage',{getItem:()=>'{broken'});
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow();
    vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw Error('quota');}});
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow('quota');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, {cantidad:2,ids:['id']}, {cantidad:1,ids:[]}, {cantidad:1,ids:[123]}])('retains pending on malformed success %j', async data => {
    const rpc=vi.fn().mockResolvedValue({data,error:null}) as ClienteGastosLote['rpc'];
    await expect(guardarGastosLote({rpc},usuario,datos)).rejects.toThrow('confirmación');
    expect(leerIntentoGastosLote(usuario)).not.toBeNull();
  });
});
