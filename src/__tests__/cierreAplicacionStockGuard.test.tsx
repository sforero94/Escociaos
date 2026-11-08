import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

// ESCO-165: el cierre lee el saldo fresco de `productos` y, si algún consumo lo supera, NO llama
// a `fn_cerrar_aplicacion`. Mismo renderizador mínimo de hooks que
// `aplicacionesDateSaveBoundaries.test.tsx`: estado persistente entre renders, efectos apagados,
// y los handlers reales del árbol de elementos.
const h = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, navigate: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  saldo: 0 as number,
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
vi.mock('react-router-dom', () => ({ useNavigate: () => h.navigate }));
vi.mock('@/utils/supabase/client', () => ({ getSupabase: () => ({ from: h.from, rpc: h.rpc }) }));
vi.mock('@/hooks/useFormDraft', () => ({ useFormDraft: () => ({ hasDraft: false, clearDraft: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
function boton(tree: ReactNode, label: string) {
  const button = elements(tree).find(e => typeof e.props.onClick === 'function' && text(e.props.children).includes(label));
  expect(button, `Rendered action ${label}`).toBeDefined();
  return button!;
}

const aplicacion = { id: 'app', nombre_aplicacion: 'Drench Septiembre', estado: 'En ejecución',
  tipo_aplicacion: 'Drench', fecha_inicio_ejecucion: '2026-09-01' } as Aplicacion;
// 17 consumos de 0,1 kg + uno de 57,9 = 59,60 kg registrados de Nutrifeed menor.
const movimientos = [...Array.from({ length: 17 }, () => 0.1), 57.9].map((cantidad) => ({
  fecha: '2026-09-02', producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor',
  cantidad_utilizada: cantidad, numero_canecas_utilizadas: 1, costo_unitario: 1000,
}));

beforeEach(() => {
  h.slots = []; h.cursor = 0;
  vi.clearAllMocks();
  h.rpc.mockResolvedValue({ error: null });
  h.from.mockImplementation((tabla: string) => {
    expect(tabla).toBe('productos');
    return { select: () => ({ in: async () => ({
      data: [{ id: 'nutrifeed', cantidad_actual: h.saldo, unidad_medida: 'Kilos' }], error: null,
    }) }) };
  });
});

async function intentarCierre() {
  const component = () => CierreAplicacion({ aplicacion });
  render(component); // Inicializa los slots reales del componente.
  h.slots[0] = false; // Carga sintética terminada.
  h.slots[4] = movimientos; // Estado `movimientos` ya consolidado por `cargarDatos`.
  let tree = render(component);
  const fechas = elements(tree).find(e => typeof e.props.onCambiarFechaFin === 'function');
  (fechas!.props.onCambiarFechaFin as (d: string) => void)('2026-09-20');
  tree = render(component);
  (boton(tree, 'Sí, cerrar aplicación').props.onClick as (e: { preventDefault: () => void }) => void)({ preventDefault: vi.fn() });
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return render(component);
}

describe('CierreAplicacion bloquea el cierre sin stock (ESCO-165)', () => {
  it('59,60 registrado contra 59,00 de saldo: no llama al RPC, lista el producto y deshabilita Cerrar', async () => {
    h.saldo = 59;
    const tree = await intentarCierre();
    expect(h.from).toHaveBeenCalledWith('productos');
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
    const contenido = text(tree);
    expect(contenido).toContain('falta inventario');
    expect(contenido).toContain('Nutrifeed menor');
    expect(contenido).toContain('59,60');
    expect(contenido).toContain('59,00');
    const cerrar = elements(tree).find(e => e.props.type === 'button' && text(e.props.children).includes('Cerrar Aplicación'));
    expect(cerrar!.props.disabled).toBe(true);
  });

  it('registrado igual al saldo: llama al RPC una vez', async () => {
    h.saldo = 59.6;
    const tree = await intentarCierre();
    expect(h.rpc).toHaveBeenCalledTimes(1);
    expect(h.rpc.mock.calls[0][0]).toBe('fn_cerrar_aplicacion');
    expect(text(tree)).not.toContain('falta inventario');
  });
});
