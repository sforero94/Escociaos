import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { UseAccionesRecomendadasResultado } from '@/components/dashboard/hooks/useAccionesRecomendadas';
import type { AccionParaMostrar } from '@/types/acciones';

/**
 * Los cuatro estados del bloque "Acciones recomendadas" (§4.3 del plan del
 * tablero / §9.2), a nivel de sección completa (encabezado + chip + cuerpo).
 *
 * `useAccionesRecomendadas` hace I/O contra Supabase dentro de un
 * `useEffect`, que NO corre durante `renderToStaticMarkup` (SSR no ejecuta
 * efectos) -- por eso el hook se mockea aquí: es la única forma de observar
 * los otros tres estados (`no_disponible`/`todos_vacios`/`con_acciones`)
 * sin levantar un cliente Supabase real. La cobertura de la LÓGICA que
 * decide cada estado ya vive, sin mocks, en `accionesRecomendadasEstado.test.ts`.
 */

const resultadoMock = vi.fn<() => UseAccionesRecomendadasResultado>();

vi.mock('@/components/dashboard/hooks/useAccionesRecomendadas', () => ({
  useAccionesRecomendadas: () => resultadoMock(),
}));

// El import de AccionesRecomendadas debe ir DESPUÉS del vi.mock (hoisted por
// vitest, pero se importa aquí de forma dinámica-estática para dejar la
// intención explícita en el archivo).
const { AccionesRecomendadas } = await import('@/components/dashboard/AccionesRecomendadas');

function accion(overrides: Partial<AccionParaMostrar> = {}): AccionParaMostrar {
  return {
    id: 'a1',
    clave: 'hato_lechero.vacias_90d',
    negocio: 'hato_lechero',
    frase: 'Revisar las 11 vacas vacías',
    evidencia: ['11 de 65 vacas — v_hato_estado_actual, hoy'],
    boton: { etiqueta: 'Ver las vacías', ruta: '/hato-lechero/hato?filtro=vacias_90d' },
    ...overrides,
  };
}

const entradaVacia = { animalesHato: null, priorizacion: null, ganado: null, config: null, hoy: '2026-08-17' };

function renderSeccion(negocios: Array<'hato_lechero' | 'aguacate' | 'ganado'> = ['hato_lechero', 'aguacate', 'ganado']) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <AccionesRecomendadas negocios={negocios} entrada={entradaVacia} esGerencia={false} userId="u1" />
    </MemoryRouter>,
  );
}

describe('AccionesRecomendadas — los cuatro estados (§4.3 del plan del tablero)', () => {
  it('cargando: nada -- sin skeleton, se reserva cero hueco', () => {
    resultadoMock.mockReturnValue({
      estado: 'cargando',
      generadoAt: null,
      porNegocio: [],
      descartar: vi.fn(),
    });
    expect(renderSeccion()).toBe('');
  });

  it('motor no disponible: una línea gris, sin icono de error ni color de alarma', () => {
    resultadoMock.mockReturnValue({
      estado: 'no_disponible',
      generadoAt: null,
      porNegocio: [
        { negocio: 'hato_lechero', acciones: [] },
        { negocio: 'aguacate', acciones: [] },
        { negocio: 'ganado', acciones: [] },
      ],
      descartar: vi.fn(),
    });
    const html = renderSeccion();
    expect(html).toContain('Acciones recomendadas');
    expect(html).toContain('Las acciones recomendadas no están disponibles ahora.');
    expect(html).toContain('Hato Lechero');
    expect(html).toContain('Aguacate Hass');
    expect(html).toContain('Ganado');
    // Nunca un mensaje técnico, nunca un color de alarma.
    expect(html).not.toMatch(/error|Error|fallo|AlertTriangle/);
    expect(html).not.toMatch(/text-(red|destructive)/);
  });

  it('todos vacíos: la sección colapsa a una línea verde con check', () => {
    resultadoMock.mockReturnValue({
      estado: 'todos_vacios',
      generadoAt: '2026-08-17T10:50:00-05:00',
      porNegocio: [
        { negocio: 'hato_lechero', acciones: [] },
        { negocio: 'aguacate', acciones: [] },
        { negocio: 'ganado', acciones: [] },
      ],
      descartar: vi.fn(),
    });
    const html = renderSeccion();
    expect(html).toContain('Nada recomendado hoy');
    expect(html).toContain('text-primary');
    // Nunca una tarjeta por negocio en este estado -- es UNA línea.
    expect(html).not.toContain('Sin acciones recomendadas para');
  });

  it('con acciones: encabezado + chip de procedencia (dato, nunca hora escrita a mano) + grilla desktop', () => {
    resultadoMock.mockReturnValue({
      estado: 'con_acciones',
      generadoAt: new Date().toISOString(), // "hace unos segundos" vía formatRelativeTime
      porNegocio: [
        { negocio: 'hato_lechero', acciones: [accion()] },
        { negocio: 'aguacate', acciones: [] },
        { negocio: 'ganado', acciones: [] },
      ],
      descartar: vi.fn(),
    });
    const html = renderSeccion();
    expect(html).toContain('Acciones recomendadas');
    expect(html).toContain('Sugerido ·');
    expect(html).toContain('Revisar las 11 vacas vacías');
    // El negocio sin acciones sigue con su tarjeta (vacío honesto), no
    // desaparece silenciosamente.
    expect(html).toContain('Sin acciones recomendadas para aguacate hoy.');
    expect(html).toContain('Sin acciones recomendadas para ganado hoy.');
  });

  it('sin ningún negocio habilitado, la sección entera desaparece (§8 del plan)', () => {
    resultadoMock.mockReturnValue({
      estado: 'con_acciones',
      generadoAt: new Date().toISOString(),
      porNegocio: [],
      descartar: vi.fn(),
    });
    expect(renderSeccion([])).toBe('');
  });
});
