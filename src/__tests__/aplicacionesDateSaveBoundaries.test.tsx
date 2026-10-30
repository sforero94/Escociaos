import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

// A deliberately small hook renderer: keep component state between renders,
// suppress loading effects, and invoke the handlers from the real element tree.
// Children and IO do not execute. No date guard or payload builder is mocked.
const h = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, id: undefined as string | undefined,
  persisted: {} as Record<string, unknown>, navigate: vi.fn(),
  from: vi.fn(), rpc: vi.fn(), getUser: vi.fn(),
}));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual,
    useState: (initial: unknown) => {
      const slot = h.cursor++;
      if (!(slot in h.slots)) h.slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [h.slots[slot], (next: unknown) => {
        h.slots[slot] = typeof next === 'function' ? next(h.slots[slot]) : next;
      }];
    },
    useEffect: () => undefined,
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
  };
});
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate, useParams: () => ({ id: h.id }) }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => ({ from: h.from, rpc: h.rpc, auth: { getUser: h.getUser } }) }));
vi.mock('@/hooks/useFormPersistence', () => ({ useFormPersistence: () => [h.persisted, (next: unknown) => {
  h.persisted = (typeof next === 'function' ? next(h.persisted) : next) as Record<string, unknown>;
}, vi.fn()] }));
vi.mock('@/hooks/useFormDraft', () => ({ useFormDraft: () => ({ hasDraft: false, clearDraft: vi.fn() }) }));

import { CalculadoraAplicaciones } from '@/components/aplicaciones/CalculadoraAplicaciones';
import { IniciarEjecucionModal } from '@/components/aplicaciones/IniciarEjecucionModal';
import { CierreAplicacion } from '@/components/aplicaciones/CierreAplicacion';
import type { Aplicacion } from '@/types/aplicaciones';

type Element = { props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}
function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node && typeof node === 'object' && 'props' in node) return text((node as Element).props.children);
  return '';
}
function render(component: () => ReactNode) { h.cursor = 0; return component(); }
function click(tree: ReactNode, label: string) {
  const button = elements(tree).find(e => typeof e.props.onClick === 'function' && text(e.props.children).includes(label));
  expect(button, `Rendered action ${label}`).toBeDefined();
  return (button!.props.onClick as (event: { preventDefault: () => void }) => unknown)({ preventDefault: vi.fn() });
}
const application = (patch: Partial<Aplicacion> = {}) => ({
  id: 'synthetic-app', nombre_aplicacion: 'Synthetic', estado: 'Calculada', tipo_aplicacion: 'Fumigación',
  fecha_inicio_planeada: '2020-01-01', ...patch,
}) as Aplicacion;
function noIO() {
  expect(h.from).not.toHaveBeenCalled();
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.navigate).not.toHaveBeenCalled();
}
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.id = undefined; h.persisted = {};
  vi.clearAllMocks();
  h.from.mockImplementation(() => { throw new Error('Unexpected synthetic database access'); });
  h.rpc.mockResolvedValue({ error: null });
  h.getUser.mockResolvedValue({ data: { user: { id: 'synthetic-user' } } });
});

describe('actual application save handlers reject invalid dates before IO', () => {
  it.each([
    ['create', undefined, '2020-02-02', '2020-02-01', 'posterior'],
    ['edit', 'synthetic-app', '2020-02-02', '2020-02-01', 'posterior'],
    ['create missing start', undefined, '', '2020-02-01', 'requerida'],
    ['edit missing start', 'synthetic-app', '', '2020-02-01', 'requerida'],
  ])('%s exposes an error without creating/updating rows', async (_label, id, start, end, message) => {
    h.id = id;
    h.persisted = { paso_actual: 2, configuracion: {
      nombre: 'Synthetic', tipo: 'fumigacion', fecha_inicio_planeada: start, fecha_fin_planeada: end,
      lotes_seleccionados: [],
    }, mezclas: [{ id: 'synthetic-mix' }], calculos: [], lista_compras: null, guardando: false, error: null };
    await click(render(CalculadoraAplicaciones), 'Guardar y Finalizar');
    expect(text(render(CalculadoraAplicaciones))).toContain(message);
    noIO();
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it.each([
    ['2020-02-02', '2020-02-01', 'posterior'],
    ['2020-02-30', '2020-03-01', 'calendario'],
    ['', '2020-02-01', 'seleccionar'],
  ])('start execution rejects invalid actual start %s without updating', async (start, end, message) => {
    // Prevalidated stock isolates the date/save boundary from inventory reads.
    h.slots = [start, false, false, null, [], true, false];
    const success = vi.fn();
    const component = () => IniciarEjecucionModal({ aplicacion: application({ fecha_fin_ejecucion: end }), onClose: vi.fn(), onSuccess: success });
    await click(render(component), 'Iniciar Ejecución');
    expect(text(render(component))).toContain(message);
    noIO(); expect(success).not.toHaveBeenCalled();
  });

  it.each([
    ['2020-02-02', '2020-02-01', 'posterior'],
    ['2020-02-30', '2020-03-01', 'calendario'],
    ['', '2020-02-01', 'requeridos'],
  ])('close execution rejects actual start %s without invoking the transactional RPC', async (start, end, message) => {
    const component = () => CierreAplicacion({ aplicacion: application({ fecha_inicio_ejecucion: start }) });
    render(component); // Initialize the real component state slots.
    h.slots[0] = false; // Synthetic loading is complete; effects intentionally do not query.
    let tree = render(component);
    const dateSection = elements(tree).find(e => typeof e.props.onCambiarFechaFin === 'function');
    expect(dateSection).toBeDefined();
    (dateSection!.props.onCambiarFechaFin as (date: string) => void)(end);
    tree = render(component);
    await click(tree, 'Sí, cerrar aplicación');
    // AlertDialogAction's real wrapper starts an async operation without returning it.
    await Promise.resolve(); await Promise.resolve();
    expect(text(render(component))).toContain(message);
    noIO();
  });
});
