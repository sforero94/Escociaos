import {pdf} from './invoiceUploadFixtures';
import {owner,other,product,memory,storage,testLocks,sdkHarness} from './purchaseProtocolFixtures';
import {validateInvoiceBytes} from '../supabase/functions/server/invoice-file-validation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GastosBatchTable } from '@/components/finanzas/components/GastosBatchTable';
import { IngresosBatchTable } from '@/components/finanzas/components/IngresosBatchTable';
import { GastosBatchRow } from '@/components/finanzas/components/GastosBatchRow';
import { IngresosBatchRow } from '@/components/finanzas/components/IngresosBatchRow';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { GastosCatalogs } from '@/components/finanzas/hooks/useGastosCatalogs';
import type { IngresosCatalogs } from '@/components/finanzas/hooks/useIngresosCatalogs';

const authState=vi.hoisted(()=>({owner:''}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:{id:authState.owner}})}));
vi.mock('@/utils/supabase/config',()=>({getSupabaseConfig:()=>({url:'https://invoice.invalid'})}));
const sdk = vi.hoisted(() => ({ upload: vi.fn(), insert: vi.fn(), client: vi.fn() }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: sdk.client }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
// Modal portals require a browser; keep their public callbacks while exercising real tables/rows.
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }));
vi.mock('@/components/shared/ProveedorDialog', () => ({ ProveedorDialog: () => null }));
vi.mock('@/components/finanzas/components/CompradorDialog', () => ({ CompradorDialog: () => null }));
const catalogs = {
  negocios: [], regiones: [], categorias: [], conceptos: [], proveedores: [], compradores: [], mediosPago: [],
  loading: false, getConceptosPorCategoria: () => [], getCategoriasPorNegocio: () => [],
} as unknown as GastosCatalogs & IngresosCatalogs;

describe.each(['gastos', 'ingresos'] as const)('%s invoice save boundaries in actual React', kind => {
  let tree: ReactTestRenderer;
  const Row = kind === 'gastos' ? GastosBatchRow : IngresosBatchRow;
  const row = (index = 0) => tree.root.findAllByType(Row)[index];
  const clickSave = async () => {
    const button = tree.root.findAllByType('button').find(b => b.props.onClick && b.children.some(c => typeof c === 'string' && c.startsWith('Guardar')))!;
    await act(async () => { await button.props.onClick(); });
  };
  const fill = (index: number, date = '2020-01-01') => act(() => {
    const change = row(index).props.onChange;
    for (const [field, value] of Object.entries({ fecha: date, nombre: 'Factura', valor: '10', negocio_id: 'n', region_id: 'r', categoria_id: 'c', concepto_id: 'co', medio_pago_id: 'm' })) change(index, field, value);
  });
  const attach = (index: number, file: File) => act(() => row(index).findAllByType('input').find(i => i.props.type === 'file')!.props.onChange({ target: { files: [file] } }));
  beforeEach(async () => {
    memory.clear();authState.owner=owner;
    const h=await sdkHarness(()=>null);
    vi.clearAllMocks();
    vi.stubGlobal('localStorage',storage);vi.stubGlobal('navigator',{locks:testLocks});
    sdk.client.mockReturnValue({auth:h.client.auth,storage:{from:()=>sdk},from:()=>sdk});
    vi.stubGlobal('fetch',vi.fn(async(input:unknown,init:RequestInit)=>{expect(new Headers(init.headers).get('Authorization')).toMatch(/^Bearer ey/);if(String(input).endsWith('/target')){const b=JSON.parse(String(init.body));return new Response(JSON.stringify({actor:owner,targetKey:b.targetKey,generation:other,active:b.action==='activate'}));}return new Response(JSON.stringify(await sdk.upload(init.body)));}));
    sdk.upload.mockImplementation(async(f:FormData)=>{const file=f.get('file') as File;const identity={requestKey:f.get('requestKey'),protocolVersion:1,targetKey:f.get('targetKey'),generation:f.get('generation'),tipo:f.get('tipo'),...await validateInvoiceBytes(new Uint8Array(await file.arrayBuffer()),file.type,file.name)};return {actor:owner,identity,receiptId:product,path:`verified/${product}.pdf`,state:'committed',cleanupPending:false};});
    sdk.insert.mockResolvedValue({ error: null });
    act(() => { tree = create(kind === 'gastos' ? <GastosBatchTable catalogs={catalogs} onSaved={() => {}} /> : <IngresosBatchTable catalogs={catalogs} onSaved={() => {}} />); });
  });
  afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });

  it('preserves a valid attachment on invalid replacement and uploads canonical metadata', async () => {
    fill(0);
    const valid = new File([pdf()], 'invoice.pdf', { type: 'application/pdf' });
    attach(0, valid);
    attach(0, new File(['x'], 'a.svg', { type: 'image/svg+xml' }));
    expect(row().props.row.factura_file).toBe(valid);
    await clickSave();
    expect(sdk.upload).toHaveBeenCalledWith(expect.any(FormData));
    expect((sdk.insert.mock.calls[0][0] as Array<{url_factura:string}>)[0].url_factura).toBe(`verified/${product}.pdf`);
    expect(sdk.insert).toHaveBeenCalledOnce();
  });

  it.each(['owner','row'] as const)('late verified upload after %s change cannot write a financial row',async(change)=>{
    fill(0);attach(0,new File([pdf()],'invoice.pdf',{type:'application/pdf'}));
    const successful=sdk.upload.getMockImplementation()!;let release!:(r:unknown)=>void;let form!:FormData;
    sdk.upload.mockImplementationOnce((f:FormData)=>{form=f;return new Promise(done=>{release=done;});});
    const save=clickSave();await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    if(change==='owner'){authState.owner=other;act(()=>tree.update(kind==='gastos'?<GastosBatchTable catalogs={catalogs} onSaved={()=>{}}/>:<IngresosBatchTable catalogs={catalogs} onSaved={()=>{}}/>));}
    else act(()=>row().props.onChange(0,'nombre','Changed target'));
    await act(async()=>{release(await successful(form));await save;});
    expect(sdk.insert).not.toHaveBeenCalled();
  });
  it('failed business insert retries the canonical invoice receipt without another upload',async()=>{
    fill(0);attach(0,new File([pdf()],'invoice.pdf',{type:'application/pdf'}));
    sdk.insert.mockResolvedValueOnce({error:new Error('synthetic insert failure')});await clickSave();
    // Trusted status verifies the cached receipt before reusing it.
    const prior=sdk.upload.mock.calls[0][0] as FormData;const successful=sdk.upload.getMockImplementation()!;
    vi.stubGlobal('fetch',vi.fn(async(input:unknown,init:RequestInit)=>String(input).endsWith('/status')?new Response(JSON.stringify(await successful(prior))):new Response(JSON.stringify({actor:owner,targetKey:JSON.parse(String(init.body)).targetKey,generation:other,active:false}))));
    await clickSave();expect(sdk.upload).toHaveBeenCalledOnce();expect(sdk.insert).toHaveBeenCalledTimes(2);
  });
  it('validates all attachments before the first upload or business call', async () => {
    fill(0);
    attach(0, new File(['x'], 'first.png', { type: 'image/png' }));
    act(() => tree.root.findAllByType('button').find(b => b.children.includes('Agregar fila'))!.props.onClick());
    fill(1);
    const later = new File(['x'], 'later.png', { type: 'image/png' });
    attach(1, later);
    // Simulate metadata changing after selection; save must independently revalidate the entire batch.
    Object.defineProperty(later, 'type', { value: 'image/svg+xml' });
    await clickSave();
    expect(sdk.client).not.toHaveBeenCalled();
    expect(sdk.upload).not.toHaveBeenCalled();
    expect(sdk.insert).not.toHaveBeenCalled();
  });

  it('refuses a later spoofed PDF before uploading an earlier valid file and keeps both selections',async()=>{
    fill(0);const first=new File([pdf()],'first.pdf',{type:'application/pdf'});attach(0,first);
    act(()=>tree.root.findAllByType('button').find(b=>b.children.includes('Agregar fila'))!.props.onClick());fill(1);
    const spoof=new File(['<html>'],'later.pdf',{type:'application/pdf'});attach(1,spoof);await clickSave();
    expect(sdk.upload).not.toHaveBeenCalled();expect(sdk.insert).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    expect(row(0).props.row.factura_file).toBe(first);expect(row(1).props.row.factura_file).toBe(spoof);
  });

  it('revalidates on future date confirmation before any SDK call', async () => {
    fill(0, '2099-01-01');
    const file = new File(['x'], 'invoice.pdf', { type: 'application/pdf' });
    attach(0, file);
    await clickSave();
    expect(tree.root.findByType(ConfirmDialog).props.open).toBe(true);
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 });
    await act(async () => { await tree.root.findByType(ConfirmDialog).props.onConfirm(); });
    expect(sdk.client).not.toHaveBeenCalled();
    expect(sdk.upload).not.toHaveBeenCalled();
    expect(sdk.insert).not.toHaveBeenCalled();
  });
});
