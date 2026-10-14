import {pdf} from './invoiceUploadFixtures';
import {owner,other,product,memory,storage,testLocks,sdkHarness} from './purchaseProtocolFixtures';
import {validateInvoiceBytes} from '../supabase/functions/server/invoice-file-validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FacturaUploader } from '@/components/shared/FacturaUploader';

const authState=vi.hoisted(()=>({owner:''}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:authState.owner}})}));
vi.mock('@/utils/supabase/config',()=>({getSupabaseConfig:()=>({url:'https://invoice.invalid'})}));
const sdk = vi.hoisted(() => ({ upload: vi.fn(), createSignedUrl: vi.fn(), client: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: sdk.client }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function deferred() {
  let resolve!: (value: { data: { signedUrl: string } | null; error?: unknown }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ data: { signedUrl: string } | null; error?: unknown }>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('FacturaUploader actual React lifecycle and SDK calls', () => {
  let tree: ReactTestRenderer;
  const onUploadSuccess = vi.fn();
  const onRemove = vi.fn();
  const render = (currentUrl?: string) => <FacturaUploader tipo="compra" currentUrl={currentUrl} onUploadSuccess={onUploadSuccess} onRemove={onRemove} />;
  beforeEach(async () => {
    memory.clear();authState.owner=owner;
    vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});
    const h=await sdkHarness(()=>null);
    vi.clearAllMocks();
    sdk.client.mockReturnValue({auth:h.client.auth, storage: { from: () => sdk } });
    vi.stubGlobal('fetch',vi.fn(async(input:unknown,init:RequestInit)=>{
      expect(new Headers(init.headers).get('Authorization')).toMatch(/^Bearer ey/);
      if(String(input).endsWith('/target')){const b=JSON.parse(String(init.body));return new Response(JSON.stringify({actor:owner,targetKey:b.targetKey,generation:other,active:b.action==='activate'}));}
      const value=await sdk.upload(init.body);return new Response(JSON.stringify(value));
    }));
    sdk.upload.mockImplementation(async (f:FormData)=>{const file=f.get('file') as File;const identity={requestKey:f.get('requestKey'),protocolVersion:1,targetKey:f.get('targetKey'),generation:f.get('generation'),tipo:f.get('tipo'),...await validateInvoiceBytes(new Uint8Array(await file.arrayBuffer()),file.type,file.name)};return {actor:owner,identity,receiptId:product,path:`verified/${product}.pdf`,state:'committed',cleanupPending:false};});
    sdk.createSignedUrl.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => { if (tree) act(() => tree.unmount());vi.unstubAllGlobals(); });

  it('uploads with canonical MIME/UUID extension and rejects invalid metadata before SDK access', async () => {
    act(() => { tree = create(render()); });
    const select = tree.root.findByType('input').props.onChange;
    await act(async () => { await select({ target: { files: [new File([pdf()], 'invoice.pdf', { type: 'application/pdf' })], value: 'chosen' } }); });
    expect(sdk.upload).toHaveBeenCalledWith(expect.any(FormData));
    expect(onUploadSuccess).toHaveBeenCalledWith(`verified/${product}.pdf`);
    expect(onUploadSuccess).toHaveBeenCalledOnce();
    sdk.client.mockClear();
    await act(async () => { await select({ target: { files: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })], value: 'chosen' } }); });
    expect(sdk.client).not.toHaveBeenCalled();
    expect(onUploadSuccess).toHaveBeenCalledOnce();
  });

  it('ignores an old A request after A → B → A and binds rendered URLs to the current path', async () => {
    const first = deferred(), second = deferred(), third = deferred();
    sdk.createSignedUrl.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise);
    act(() => { tree = create(render('A.jpg')); });
    act(() => tree.update(render('B.png')));
    act(() => tree.update(render('A.jpg')));
    await act(async () => first.resolve({ data: { signedUrl: 'old-A' } }));
    expect(tree.root.findAllByType('img')).toHaveLength(0);
    await act(async () => third.resolve({ data: { signedUrl: 'new-A' } }));
    expect(tree.root.findByType('img').props.src).toBe('new-A');
    await act(async () => second.resolve({ data: { signedUrl: 'late-B' } }));
    expect(tree.root.findByType('img').props.src).toBe('new-A');
    act(() => tree.update(render('document.pdf')));
    expect(tree.root.findAllByType('img')).toHaveLength(0);
  });

  it.each(['remove', 'unmount', 'error', 'reject'] as const)('never restores a stale preview after %s', async action => {
    const pending = deferred();
    sdk.createSignedUrl.mockReturnValueOnce(pending.promise);
    act(() => { tree = create(render('A.jpg')); });
    if (action === 'remove') act(() => tree.root.findAllByType('button')[1].props.onClick());
    if (action === 'unmount') act(() => tree.unmount());
    await act(async () => {
      if (action === 'reject') pending.reject(new Error('offline'));
      else pending.resolve({ data: { signedUrl: 'obsolete' }, ...(action === 'error' ? { error: new Error('denied') } : {}) });
    });
    if (action !== 'unmount') expect(tree.root.findAllByType('img')).toHaveLength(0);
  });

  it('ignores a pending view URL when its object is removed', async () => {
    const pending = deferred();
    sdk.createSignedUrl.mockReturnValueOnce(pending.promise);
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    try {
      act(() => { tree = create(render('invoice.pdf')); });
      let viewing!: Promise<void>;
      act(() => { viewing = tree.root.findAllByType('button')[0].props.onClick(); });
      act(() => tree.update(render()));
      await act(async () => {
        pending.resolve({ data: { signedUrl: 'old-pdf' } });
        await viewing;
      });
      expect(open).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('ignores upload completion after unmount', async () => {
    let resolve!: (value: { data: { path: string }; error: null }) => void;
    sdk.upload.mockReturnValueOnce(new Promise(res => { resolve = res; }));
    act(() => { tree = create(render()); });
    let upload!: Promise<void>;
    act(() => {
      upload = tree.root.findByType('input').props.onChange({ target: { files: [new File([pdf()], 'invoice.pdf', { type: 'application/pdf' })], value: 'chosen' } });
    });
    await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));
    act(() => tree.unmount());
    await act(async () => { resolve({ data: { path: 'late.png' }, error: null }); await upload; });
    expect(onUploadSuccess).not.toHaveBeenCalled();
  });
});
