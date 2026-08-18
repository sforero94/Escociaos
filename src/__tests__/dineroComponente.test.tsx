import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { DatosDinero, EstadoDinero } from '@/components/dashboard/hooks/useDinero';

/**
 * Estados del bloque "Dinero" del Tablero General
 * (`docs/plan_dashboard_centro_control.md` §4 Bloque 5 / §9.2 / §8). Mismo
 * patrón que `accionesRecomendadasSeccion.test.tsx`: `useAuth`/`useDinero`
 * hacen I/O real (Context + Supabase), así que se mockean para observar el
 * render puro con `renderToStaticMarkup` (SSR no ejecuta efectos). La
 * cobertura de la ARITMÉTICA ya vive, sin mocks, en `calculosDinero.test.ts`.
 */

const authMock = vi.fn();
const dineroMock = vi.fn<() => { estado: EstadoDinero; datos: DatosDinero | null }>();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authMock(),
}));
vi.mock('@/components/dashboard/hooks/useDinero', () => ({
  useDinero: () => dineroMock(),
}));

const { Dinero } = await import('@/components/dashboard/Dinero');

function auth(overrides: Partial<{ isLoading: boolean; rol: string; modulos: string[] }> = {}) {
  const { isLoading = false, rol = 'Gerencia', modulos = ['finanzas', 'hato_lechero'] } = overrides;
  authMock.mockReturnValue({
    isLoading,
    profile: isLoading ? null : { id: 'u1', nombre: 'Santiago', email: 's@x.com', rol, modulos },
    hasModulo: (m: string) => modulos.includes(m),
  });
}

function datosBase(overrides: Partial<DatosDinero> = {}): DatosDinero {
  return {
    hoy: '2026-08-17',
    mesActual: 8,
    trimestreActual: 3,
    gastoMesActual: 66_529_769,
    gastoMesAnterior: 144_838_926,
    gastoAcumuladoAnio: 300_000_000,
    porNegocioAnio: [
      { nombre: 'Aguacate Hass', total: 524_900_000 },
      { nombre: 'Oficina Central', total: 359_700_000 },
    ],
    presupuestoTotalAnual: 400_000_000,
    ingresoMesActual: 0,
    ingresoTieneFilas: false,
    ultimaQuincena: { anio: 2026, mes: 7, quincena: 2 },
    quincenaValores: [11_608_790, 27_000_000],
    ...overrides,
  };
}

function render() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Dinero />
    </MemoryRouter>,
  );
}

describe('Dinero — cierre por ROL (§8 del plan)', () => {
  it('mientras AuthContext resuelve el perfil: skeleton del mismo tamaño, nunca un hueco en blanco', () => {
    auth({ isLoading: true });
    dineroMock.mockReturnValue({ estado: 'cargando', datos: null });
    const html = render();
    expect(html).toContain('animate-pulse');
    expect(html).not.toBe('');
  });

  it('sin el módulo finanzas, la sección entera desaparece -- nunca un candado ni un mensaje', () => {
    auth({ modulos: [] });
    dineroMock.mockReturnValue({ estado: 'cargando', datos: null });
    const html = render();
    expect(html).toBe('');
  });

  it('con el módulo pero sin rol Gerencia: candado explicativo, NUNCA un vacío ni ceros', () => {
    auth({ rol: 'Administrador', modulos: ['finanzas'] });
    dineroMock.mockReturnValue({ estado: 'cargando', datos: null });
    const html = render();
    expect(html).toContain('requiere permisos de Gerencia');
    expect(html).not.toContain('$0');
  });
});

describe('Dinero — el caso "sin ingresos" (§5.2, "el caso más importante del documento")', () => {
  it('agosto sin ninguna fila en fin_ingresos: NUNCA $0 -- guion grande + nota ámbar + botón', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'listo', datos: datosBase() });
    const html = render();
    expect(html).not.toContain('$0');
    expect(html).not.toMatch(/>\$0[.,]/);
    expect(html).toContain('Sin ingresos registrados en agosto');
    expect(html).toContain('Registrar quincena');
  });

  it('cita la evidencia de las quincenas faltantes con su rango de valor', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'listo', datos: datosBase() });
    const html = render();
    expect(html).toContain('No es que no se vendió');
    expect(html).toContain('quincena');
  });

  it('con filas de ingreso, se muestra el monto real -- nunca el guion', () => {
    auth();
    dineroMock.mockReturnValue({
      estado: 'listo',
      datos: datosBase({ ingresoMesActual: 25_000_000, ingresoTieneFilas: true }),
    });
    const html = render();
    expect(html).toContain('$25,0M');
    expect(html).not.toContain('Sin ingresos registrados');
  });
});

describe('Dinero — gasto vs. presupuesto (§5.1)', () => {
  it('caso real: agosto $66,5M con chip verde (bajó 54% vs julio)', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'listo', datos: datosBase() });
    const html = render();
    expect(html).toContain('$66,5M');
    expect(html).toContain('-54% vs julio');
    expect(html).toContain('bg-green-50');
  });

  it('un aumento de gasto pinta el chip en rojo, nunca verde', () => {
    auth();
    dineroMock.mockReturnValue({
      estado: 'listo',
      datos: datosBase({ gastoMesActual: 200_000_000, gastoMesAnterior: 100_000_000 }),
    });
    const html = render();
    expect(html).toContain('+100% vs julio');
    expect(html).toContain('bg-red-50');
  });

  it('sin presupuesto cargado, NUNCA una barra al 0% -- sólo la nota', () => {
    auth();
    dineroMock.mockReturnValue({
      estado: 'listo',
      datos: datosBase({ presupuestoTotalAnual: 0 }),
    });
    const html = render();
    expect(html).toContain('Sin presupuesto cargado');
    expect(html).not.toContain('width:0%');
    expect(html).not.toContain('width: 0%');
  });

  it('con presupuesto, muestra el % ejecutado al trimestre', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'listo', datos: datosBase() });
    const html = render();
    expect(html).toContain('presupuestado al Q3');
  });

  it('cita los dos negocios de mayor gasto del año', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'listo', datos: datosBase() });
    const html = render();
    expect(html).toContain('Mayor gasto del año');
    expect(html).toContain('Aguacate Hass');
    expect(html).toContain('Oficina Central');
    expect(html).toContain('$524,9M');
    expect(html).toContain('$359,7M');
  });
});

describe('Dinero — degradación', () => {
  it('error de consulta: mensaje discreto, nunca un error técnico', () => {
    auth();
    dineroMock.mockReturnValue({ estado: 'error', datos: null });
    const html = render();
    expect(html).toContain('No se pudo cargar la información financiera');
  });
});
