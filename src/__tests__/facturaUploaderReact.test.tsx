import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FacturaUploader } from '@/components/shared/FacturaUploader';

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
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.client.mockReturnValue({ storage: { from: () => sdk } });
    sdk.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
    sdk.createSignedUrl.mockResolvedValue({ data: null, error: null });
  });
  afterEach(() => { if (tree) act(() => tree.unmount()); });

  it('uploads with canonical MIME/UUID extension and rejects invalid metadata before SDK access', async () => {
    act(() => { tree = create(render()); });
    const select = tree.root.findByType('input').props.onChange;
    await act(async () => { await select({ target: { files: [new File(['x'], 'evil.html', { type: 'image/jpg' })], value: 'chosen' } }); });
    expect(sdk.upload).toHaveBeenCalledWith(expect.stringMatching(/^facturas_compra\/[0-9a-f-]+\.jpg$/), expect.any(File), { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
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
      upload = tree.root.findByType('input').props.onChange({ target: { files: [new File(['x'], 'a.png', { type: 'image/png' })], value: 'chosen' } });
    });
    act(() => tree.unmount());
    await act(async () => { resolve({ data: { path: 'late.png' }, error: null }); await upload; });
    expect(onUploadSuccess).not.toHaveBeenCalled();
  });
});
