import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { EstadoSaludDatos } from '@/components/dashboard/hooks/useSaludDatos';
import type { SenalSaludDatos } from '@/utils/calculosSaludDatos';

/**
 * Estados del bloque "Salud de los datos" del Tablero General
 * (`docs/plan_dashboard_centro_control.md` §4 Bloque 6 / §9.2 / §8). Mismo
 * patrón que `accionesRecomendadasSeccion.test.tsx`/`dineroComponente.test.tsx`:
 * `useAuth`/`useSaludDatos` se mockean para observar el render puro. La
 * clasificación por umbral ya está cubierta, sin mocks, en
 * `calculosSaludDatos.test.ts`.
 */

const authMock = vi.fn();
const saludMock = vi.fn<() => { estado: EstadoSaludDatos; senales: SenalSaludDatos[] }>();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authMock(),
}));
vi.mock('@/components/dashboard/hooks/useSaludDatos', () => ({
  useSaludDatos: () => saludMock(),
}));

const { SaludDatos } = await import('@/components/dashboard/SaludDatos');

function auth(modulos: string[]) {
  authMock.mockReturnValue({ hasModulo: (m: string) => modulos.includes(m) });
}

const SENALES_REALES: SenalSaludDatos[] = [
  { clave: 'monitoreo', etiqueta: 'Monitoreo', detalle: '13 d', nivel: 'verde' },
  { clave: 'chequeo', etiqueta: 'Chequeo', detalle: '38 d', nivel: 'verde' },
  { clave: 'pesaje', etiqueta: 'Pesaje', detalle: '4 d', nivel: 'verde' },
  { clave: 'quincena', etiqueta: 'Quincena', detalle: 'julio Q2', nivel: 'verde' },
  { clave: 'clima', etiqueta: 'Clima', detalle: '7 de 10 días confiables', nivel: 'ambar' },
];

function render() {
  return renderToStaticMarkup(<SaludDatos />);
}

describe('SaludDatos — gate por módulo (§8 del plan)', () => {
  it('sin ningún módulo gobernado (aguacate/hato_lechero), la sección desaparece', () => {
    auth([]);
    saludMock.mockReturnValue({ estado: 'listo', senales: [] });
    expect(render()).toBe('');
  });

  it('cargando: skeleton del tamaño final, no un hueco vacío', () => {
    auth(['aguacate']);
    saludMock.mockReturnValue({ estado: 'cargando', senales: [] });
    const html = render();
    expect(html).toContain('animate-pulse');
  });

  it('con módulo pero sin ninguna señal calculable, no renderiza nada (degradación graciosa)', () => {
    auth(['aguacate']);
    saludMock.mockReturnValue({ estado: 'listo', senales: [] });
    expect(render()).toBe('');
  });
});

describe('SaludDatos — caso real (§4 Bloque 6 del plan)', () => {
  it('pinta las cinco señales con sus edades exactas', () => {
    auth(['aguacate', 'hato_lechero']);
    saludMock.mockReturnValue({ estado: 'listo', senales: SENALES_REALES });
    const html = render();
    expect(html).toContain('Salud de los datos');
    expect(html).toContain('Monitoreo');
    expect(html).toContain('13 d');
    expect(html).toContain('Chequeo');
    expect(html).toContain('38 d');
    expect(html).toContain('Pesaje');
    expect(html).toContain('4 d');
    expect(html).toContain('Quincena');
    expect(html).toContain('julio Q2');
    expect(html).toContain('Clima');
    expect(html).toContain('7 de 10 días confiables');
  });

  it('colapsada por defecto: trae el disparador "Ver detalle", la tabla NO se monta hasta expandir (Radix)', () => {
    auth(['aguacate', 'hato_lechero']);
    saludMock.mockReturnValue({ estado: 'listo', senales: SENALES_REALES });
    const html = render();
    expect(html).toContain('Ver detalle');
    expect(html).toContain('data-state="closed"');
    expect(html).not.toContain('<table');
  });

  it('un punto de color por señal -- verde para las frescas, ámbar para el clima parcial', () => {
    auth(['aguacate', 'hato_lechero']);
    saludMock.mockReturnValue({ estado: 'listo', senales: SENALES_REALES });
    const html = render();
    expect(html).toContain('bg-green-500');
    expect(html).toContain('bg-amber-500');
  });
});
