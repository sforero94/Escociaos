import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { GastosBatchTable } from '@/components/finanzas/components/GastosBatchTable';
import { IngresosBatchTable } from '@/components/finanzas/components/IngresosBatchTable';
import { GastosBatchRow } from '@/components/finanzas/components/GastosBatchRow';
import { IngresosBatchRow } from '@/components/finanzas/components/IngresosBatchRow';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { GastosCatalogs } from '@/components/finanzas/hooks/useGastosCatalogs';
import type { IngresosCatalogs } from '@/components/finanzas/hooks/useIngresosCatalogs';

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    sdk.client.mockReturnValue({ storage: { from: () => sdk }, from: () => sdk });
    sdk.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
    sdk.insert.mockResolvedValue({ error: null });
    act(() => { tree = create(kind === 'gastos' ? <GastosBatchTable catalogs={catalogs} onSaved={() => {}} /> : <IngresosBatchTable catalogs={catalogs} onSaved={() => {}} />); });
  });
  afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });

  it('preserves a valid attachment on invalid replacement and uploads canonical metadata', async () => {
    fill(0);
    const valid = new File(['x'], 'unsafe.html', { type: 'image/jpg' });
    attach(0, valid);
    attach(0, new File(['x'], 'a.svg', { type: 'image/svg+xml' }));
    expect(row().props.row.factura_file).toBe(valid);
    await clickSave();
    expect(sdk.upload).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/), valid, { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
    expect(sdk.insert).toHaveBeenCalledOnce();
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
