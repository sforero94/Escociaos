import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

// Same small hook harness as aplicacionesDateSaveBoundaries: real handlers and
// element tree, synthetic IO, no browser, credentials or automatic network calls.
const h = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, ejecutar: vi.fn(), cerrar: vi.fn(), user: 'user-a' }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  function slot(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.slots)) h.slots[index] = typeof initial === 'function' ? initial() : initial;
    return index;
  }
  return { ...actual,
    useState: (initial: unknown) => {
      const index = slot(initial);
      return [h.slots[index], (next: unknown) => { h.slots[index] = typeof next === 'function' ? next(h.slots[index]) : next; }];
    },
    useRef: (initial: unknown) => h.slots[slot({ current: initial })],
    useEffect: () => undefined,
  };
});
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: h.user }, profile: { rol: 'Gerencia' } }) }));
vi.mock('../utils/esco2ClientePrueba', async importOriginal => ({
  ENDPOINT_PRUEBA_ESCO2: 'https://synthetic.example/esco-consultas',
  ejecutarPruebaEsco2: h.ejecutar, cerrarSesionPruebaEsco2: h.cerrar,
  // Pure helper: keep the real one so the screen's history is exercised as shipped.
  agregarTurnoHistorial: (await importOriginal<typeof import('../utils/esco2ClientePrueba')>()).agregarTurnoHistorial,
}));
import { Esco2AccessCheck } from '../components/esco2/Esco2AccessCheck';
type Element = { type: unknown; props: Record<string, unknown>; key: string };
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const e = node as Element;
  return [e, ...nodes(e.props.children)];
}
function text(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node && typeof node === 'object' && 'props' in node) return text((node as Element).props.children);
  return '';
}
let mountedKey: string;
function render(): ReactNode {
  const wrapper = Esco2AccessCheck() as unknown as Element;
  if (wrapper.key !== mountedKey) { h.slots = []; mountedKey = wrapper.key; }
  h.cursor = 0;
  return (wrapper.type as (props: unknown) => ReactNode)(wrapper.props);
}
function action(tree: ReactNode, label: string) {
  const button = nodes(tree).find(e => typeof e.props.onClick === 'function' && text(e.props.children) === label);
  expect(button, `action ${label}`).toBeDefined();
  return button!;
}
function click(tree: ReactNode, label: string) { return (action(tree, label).props.onClick as () => unknown)(); }
function submit(tree: ReactNode) {
  return (nodes(tree).find(e => typeof e.props.onSubmit === 'function')!.props.onSubmit as (event: unknown) => Promise<void>)({ preventDefault: vi.fn() });
}
const options = [{ id: 'tarea', etiqueta: 'La tarea Cosecha' }, { id: 'categoria', etiqueta: 'La categoría Cosecha' }];
const pending = { http: 200, valida: true, respuesta: 'Elige una opción.', origen: 'aclaracion', estadoToken: 'opaque-a', opcionesAclaracion: options };
const PREGUNTA_INICIAL = '¿Cuántos jornales se registraron ayer? Sin desglose por persona.';
// After one valid turn the screen sends that turn, so a follow-up keeps its period.
const turnoPrevio = [{ rol: 'user', texto: PREGUNTA_INICIAL }, { rol: 'assistant', texto: 'Elige una opción.' }];
beforeEach(() => {
  h.slots = []; h.cursor = 0; h.user = 'user-a'; mountedKey = '';
  vi.clearAllMocks();
  h.ejecutar.mockResolvedValue(pending); h.cerrar.mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('pantalla: aclaración por opciones exactas', () => {
  it('muestra dos botones y envía la opción con el token del turno anterior', async () => {
    await submit(render());
    const tree = render();
    for (const option of options) expect(action(tree, option.etiqueta).props.type).toBe('button');
    h.ejecutar.mockResolvedValue({ http: 200, valida: true, respuesta: 'Listo.', origen: 'determinista' });
    await click(tree, 'La categoría Cosecha');
    expect(h.ejecutar).toHaveBeenLastCalledWith('La categoría Cosecha', 'user-a', expect.any(AbortSignal), { estadoToken: 'opaque-a', respuestaAclaracion: 'categoria', historial: turnoPrevio });
    expect(text(render())).not.toContain('La categoría Cosecha');
  });
  it('envía texto libre pendiente con token sin convertirlo a una opción', async () => {
    await submit(render());
    const tree = render();
    const input = nodes(tree).find(e => e.props.id === 'pregunta-esco2')!;
    (input.props.onChange as (e: unknown) => void)({ target: { value: 'la categoría por favor' } });
    await submit(render());
    expect(h.ejecutar).toHaveBeenLastCalledWith('la categoría por favor', 'user-a', expect.any(AbortSignal), { estadoToken: 'opaque-a', historial: turnoPrevio });
  });
  it('desactiva las opciones durante el envío e impide un segundo clic simultáneo', async () => {
    await submit(render());
    let release!: (value: unknown) => void;
    h.ejecutar.mockReturnValue(new Promise(resolve => { release = resolve; }));
    const tree = render();
    const request = click(tree, 'La tarea Cosecha');
    expect(action(render(), 'La categoría Cosecha').props.disabled).toBe(true);
    await click(tree, 'La categoría Cosecha');
    expect(h.ejecutar).toHaveBeenCalledTimes(2);
    release(pending); await request;
  });
  it('una nueva consulta elimina el contexto y las opciones antes de enviar', async () => {
    await submit(render());
    click(render(), 'Nueva consulta');
    expect(text(render())).not.toContain('La tarea Cosecha');
    await submit(render());
    expect(h.ejecutar).toHaveBeenLastCalledWith(expect.any(String), 'user-a', expect.any(AbortSignal), {});
  });
  it('cambiar de cuenta elimina contexto aunque falle el cierre de sesión', async () => {
    await submit(render());
    h.cerrar.mockRejectedValue(new Error('synthetic'));
    await click(render(), 'Cambiar de cuenta');
    expect(text(render())).not.toContain('La tarea Cosecha');
    await submit(render());
    expect(h.ejecutar).toHaveBeenLastCalledWith(expect.any(String), 'user-a', expect.any(AbortSignal), {});
  });
  it('remonta sin opciones ni contexto al cambiar el usuario autenticado', async () => {
    await submit(render()); h.user = 'user-b';
    expect(text(render())).not.toContain('La tarea Cosecha');
    await submit(render());
    expect(h.ejecutar).toHaveBeenLastCalledWith(expect.any(String), 'user-b', expect.any(AbortSignal), {});
  });
  it('un fallo de red conserva la elección pendiente para reintento manual', async () => {
    await submit(render());
    h.ejecutar.mockRejectedValue(new Error('synthetic network'));
    await click(render(), 'La tarea Cosecha');
    expect(text(render())).toContain('No se pudo completar la prueba');
    expect(action(render(), 'La tarea Cosecha').props.disabled).toBe(false);
  });
});
