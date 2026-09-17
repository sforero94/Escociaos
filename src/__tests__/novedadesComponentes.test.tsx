import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { UseNovedadesResultado } from '@/components/dashboard/hooks/useNovedades';
import type { GrupoDia, Novedad } from '@/utils/novedades/tipos';

/**
 * Los seis estados de pantalla del bloque "Novedades" (issue #266, F3 --
 * §4.4 del brief + el sexto "truncado" de §7 del plan técnico).
 *
 * `useNovedades` hace I/O contra Supabase dentro de un `useEffect`, que NO
 * corre durante `renderToStaticMarkup` (SSR no ejecuta efectos) -- mismo
 * motivo por el que `accionesRecomendadasSeccion.test.tsx` mockea
 * `useAccionesRecomendadas`: es la única forma de observar los demás
 * estados sin levantar un cliente Supabase real. La cobertura de la LÓGICA
 * de agrupamiento/frases ya vive, sin mocks, en `novedadesAgrupar.test.ts` /
 * `novedadesFrases.test.ts` / `novedadesDiaBogota.test.ts`.
 */

const resultadoMock = vi.fn<() => UseNovedadesResultado>();

vi.mock('@/components/dashboard/hooks/useNovedades', () => ({
  useNovedades: () => resultadoMock(),
}));

// El import de Novedades debe ir DESPUÉS del vi.mock (hoisted por vitest,
// pero se importa aquí de forma dinámica-estática para dejar la intención
// explícita en el archivo -- mismo patrón que accionesRecomendadasSeccion.test.tsx).
const { Novedades, NovedadesFeed } = await import('@/components/dashboard/Novedades');

function resultadoBase(overrides: Partial<UseNovedadesResultado> = {}): UseNovedadesResultado {
  return {
    cargando: false,
    grupos: [],
    notaPie: null,
    errores: [],
    modulosTruncados: [],
    modulosLegibles: ['Aguacate Hass'],
    registrarExpansion: vi.fn(),
    registrarNavegacion: vi.fn(),
    ...overrides,
  };
}

function novedad(overrides: Partial<Novedad> = {}): Novedad {
  return {
    id: 'n1',
    fuente: 'hato_eventos',
    modulo: 'hato_lechero',
    tipoHecho: 'servicio',
    autorId: 'u1',
    autorNombre: 'Martha Vega',
    autorTextoLibre: null,
    canal: 'telegram',
    capturadoEn: '2026-09-16T02:00:00Z', // 2026-09-15 21:00 Bogotá
    fechasHecho: ['2026-08-11'],
    conFechaFutura: false,
    objetosNombre: ['ELECTRA (#117)'],
    tamano: { filas: 1 },
    ruta: '/hato-lechero/hato/a1',
    ...overrides,
  };
}

function render(ui: React.ReactElement) {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Novedades — los seis estados (§4.4 del brief + truncado, §7 del plan técnico)', () => {
  it('cero módulos habilitados (Uriel): la sección entera desaparece, sin mensaje', () => {
    resultadoMock.mockReturnValue(resultadoBase({ modulosLegibles: [] }));
    expect(render(<Novedades profile={{ rol: 'Administrador', modulos: [] }} />)).toBe('');
  });

  it('cargando: pinta un esqueleto de 3 líneas del tamaño final, nunca un spinner de pantalla completa', () => {
    resultadoMock.mockReturnValue(resultadoBase({ cargando: true }));
    const html = render(<Novedades profile={{ rol: 'Gerencia', modulos: [] }} />);
    expect(html).toContain('Novedades');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('No se registró nada');
    expect(html).not.toMatch(/registró|servicio/);
  });

  it('ventana vacía: nombra los módulos del lector, NUNCA "0 novedades"', () => {
    resultadoMock.mockReturnValue(resultadoBase({ modulosLegibles: ['Aguacate Hass'] }));
    const html = render(<Novedades profile={{ rol: 'Administrador', modulos: ['aguacate'] }} />);
    expect(html).toContain('No se registró nada en Aguacate Hass en los últimos 7 días.');
    expect(html).not.toMatch(/0 novedades/i);
  });

  it('ventana vacía con varios módulos (Gerencia): la frase enumera todos, con "y"', () => {
    resultadoMock.mockReturnValue(resultadoBase({ modulosLegibles: ['Hato Lechero', 'Aguacate Hass', 'Finanzas'] }));
    const html = render(<Novedades profile={{ rol: 'Gerencia', modulos: [] }} />);
    expect(html).toContain('No se registró nada en Hato Lechero, Aguacate Hass y Finanzas en los últimos 7 días.');
  });

  it('con novedades: agrupa por día, el peek siempre muestra 5 -- móvil y escritorio por igual (7 líneas totales -> "2 restantes")', () => {
    const hoy: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: [novedad({ id: 'n1', autorNombre: 'Martha Vega', objetosNombre: ['ELECTRA (#117)'] })],
    };
    const ayer: GrupoDia = {
      encabezado: 'Ayer — lunes 15 de septiembre',
      fecha: '2026-09-15',
      novedades: [2, 3, 4, 5, 6, 7].map((n) =>
        novedad({
          id: `n${n}`,
          fuente: 'registros_trabajo',
          modulo: 'aguacate',
          tipoHecho: 'jornal',
          autorId: 'u2',
          autorNombre: 'David García',
          objetosNombre: ['Drench Septiembre'],
          tamano: { filas: 8, personas: 8 },
          fechasHecho: ['2025-09-14'],
          capturadoEn: '2026-09-15T13:37:00Z',
          ruta: '/labores',
        }),
      ),
    };

    resultadoMock.mockReturnValue(
      resultadoBase({ grupos: [hoy, ayer], modulosLegibles: ['Hato Lechero', 'Aguacate Hass'] }),
    );
    const html = render(<Novedades profile={{ rol: 'Gerencia', modulos: [] }} />);

    expect(html).toContain('Hoy');
    expect(html).toContain('Ayer — lunes 15 de septiembre');
    expect(html).toContain('Martha Vega');
    expect(html).toContain('David García');
    expect(html).toContain('registró');
    // El año 2025 en la fecha del hecho debe imprimirse (difiere del año de
    // captura) -- el caso real que justifica el feature (docs/plan_novedades.md §1).
    expect(html).toContain('2025');
    // Peek = 5 (decisión 2026-09-17, siempre, sin importar el viewport):
    // 1 de Hoy + 4 de Ayer = 5 visibles, 2 restantes. Un solo render -- ya
    // no hay árbol separado "3 móvil"/"5 escritorio".
    expect(html).toContain('ver las 2 restantes');
    // El nombre del autor va en negrita (guardrail 2026-09-17: "bold the
    // user names") -- nunca la frase entera.
    expect(html).toContain('<strong class="font-semibold">Martha Vega</strong>');
    expect(html).toContain('<strong class="font-semibold">David García</strong>');
  });

  it('captura masiva: sin UI propia -- la línea sólo declara su tamaño (43,5 jornales para 9 personas)', () => {
    const grupo: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: [
        novedad({
          id: 'masiva',
          fuente: 'registros_trabajo',
          modulo: 'aguacate',
          tipoHecho: 'jornal',
          autorNombre: 'David García',
          objetosNombre: ['Recolección cosecha principal 2027'],
          tamano: { filas: 43.5, personas: 9 },
          fechasHecho: ['2026-09-07', '2026-09-12'],
          ruta: '/labores',
        }),
      ],
    };
    resultadoMock.mockReturnValue(resultadoBase({ grupos: [grupo], modulosLegibles: ['Aguacate Hass'] }));
    const html = render(<Novedades profile={{ rol: 'Administrador', modulos: ['aguacate'] }} />);
    expect(html).toContain('David García');
    expect(html).toContain('43,5');
    expect(html).toContain('9 personas');
    expect(html).toContain('Recolección cosecha principal 2027');
    // No debe aparecer ningún botón de "ver las N restantes" para una sola línea.
    expect(html).not.toContain('restantes');
  });

  it('una fuente falla: las demás líneas se pintan igual, y aparece la línea gris nombrando el módulo', () => {
    const grupo: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: [novedad({ id: 'aguacate-ok', modulo: 'aguacate', fuente: 'monitoreos', tipoHecho: 'ronda', autorNombre: 'David García', objetosNombre: [], ruta: '/monitoreo' })],
    };
    resultadoMock.mockReturnValue(
      resultadoBase({
        grupos: [grupo],
        errores: [{ modulo: 'hato_lechero', mensaje: 'No se pudo leer el hato.' }],
        modulosLegibles: ['Hato Lechero', 'Aguacate Hass'],
      }),
    );
    const html = render(<Novedades profile={{ rol: 'Gerencia', modulos: [] }} />);
    expect(html).toContain('David García');
    expect(html).toContain('registró');
    expect(html).toContain('No se pudo leer el hato.');
  });

  it('sólo errores, sin ninguna línea: NO es el estado vacío -- no debe decir "No se registró nada"', () => {
    resultadoMock.mockReturnValue(
      resultadoBase({
        grupos: [],
        errores: [{ modulo: 'aguacate', mensaje: 'No se pudo leer aguacate.' }],
        modulosLegibles: ['Aguacate Hass'],
      }),
    );
    const html = render(<Novedades profile={{ rol: 'Administrador', modulos: ['aguacate'] }} />);
    expect(html).toContain('No se pudo leer aguacate.');
    expect(html).not.toContain('No se registró nada');
  });

  it('truncado: nota honesta por módulo, sin publicar la cifra como total', () => {
    const grupo: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: [novedad({ id: 'm1', modulo: 'aguacate', fuente: 'monitoreos', tipoHecho: 'ronda', objetosNombre: [], ruta: '/monitoreo' })],
    };
    resultadoMock.mockReturnValue(
      resultadoBase({ grupos: [grupo], modulosTruncados: ['aguacate'], modulosLegibles: ['Aguacate Hass'] }),
    );
    const html = render(<Novedades profile={{ rol: 'Administrador', modulos: ['aguacate'] }} />);
    expect(html).toContain('Puede haber más de lo que se muestra en aguacate');
    expect(html).toContain('límite de lectura');
  });

  it('sin ninguna severidad: cero rojo/ámbar/destructive, cero badges de conteo', () => {
    const grupo: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: [novedad()],
    };
    resultadoMock.mockReturnValue(resultadoBase({ grupos: [grupo], modulosLegibles: ['Hato Lechero'] }));
    const html = render(<Novedades profile={{ rol: 'Gerencia', modulos: [] }} />);
    expect(html).not.toMatch(/bg-(red|amber)-\d/);
    expect(html).not.toMatch(/border-(destructive|warning)/);
  });
});

describe('NovedadesFeed — tope duro de 20 líneas aun expandido (§4.4 del brief)', () => {
  it('con "tope" mayor al total, nunca inventa más líneas de las que `grupos` trae, y el pie declara el resto', () => {
    const veinte: GrupoDia = {
      encabezado: 'Hoy',
      fecha: '2026-09-16',
      novedades: Array.from({ length: 20 }, (_, i) => novedad({ id: `v${i}`, objetosNombre: [`Vaca ${i}`] })),
    };
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <NovedadesFeed
          grupos={[veinte]}
          tope={9999}
          hoyBogota="2026-09-16"
          errores={[]}
          notasTruncado={[]}
          notaPie="y 3 más en los últimos 7 días"
          onNavegar={() => {}}
          onExpandir={() => {}}
        />
      </MemoryRouter>,
    );
    // Las 20 líneas del fixture están presentes (una por vaca)...
    for (let i = 0; i < 20; i += 1) expect(html).toContain(`Vaca ${i}`);
    // ...nunca un "ver las N restantes" dentro de lo que YA se entregó completo...
    expect(html).not.toContain('restantes');
    // ...y el pie de más-allá-del-tope-duro se muestra tal cual, sin recalcularlo.
    expect(html).toContain('y 3 más en los últimos 7 días');
  });
});
