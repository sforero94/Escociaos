import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { LecturaClima, ResumenDiario } from '@/types/clima';

/**
 * Integración de la franja de lluvia dentro de `ClimaCard` (bloque "Hoy en
 * la finca", §4 Bloque 2.1 del plan del tablero). `useClimaData` hace I/O
 * contra Supabase dentro de un `useEffect`, que SSR no ejecuta -- por eso se
 * mockea, mismo precedente que `accionesRecomendadasSeccion.test.tsx`.
 *
 * Usa el caso real verificado en producción (06-ago → 15-ago 2026): 0,25 ·
 * 0,51 · s/d · 0,25 · s/d · 0,00 · 0,25 · s/d · 0,00 · 0,00 mm.
 */

const resultadoMock = vi.fn();

vi.mock('@/hooks/useClimaData', () => ({
  useClimaData: () => resultadoMock(),
}));

const { ClimaCard } = await import('@/components/dashboard/ClimaCard');

function lectura(overrides: Partial<LecturaClima> = {}): LecturaClima {
  return {
    id: 1,
    timestamp: new Date().toISOString(),
    station_id: 'ECOWITT-MAC',
    temp_c: 24,
    humedad_pct: 70,
    viento_kmh: 8,
    rafaga_kmh: 12,
    viento_dir: 90,
    lluvia_tasa_mm_hr: 0,
    lluvia_evento_mm: 0,
    lluvia_diaria_mm: 0,
    lluvia_diaria_actualizada_en: null,
    radiacion_wm2: 300,
    uv_index: 5,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function resumenDia(overrides: Partial<ResumenDiario> & { fecha: string }): ResumenDiario {
  return {
    station_id: 'ECOWITT-MAC',
    temp_c_min: 18,
    temp_c_max: 28,
    temp_c_avg: 23,
    humedad_pct_min: 50,
    humedad_pct_max: 90,
    humedad_pct_avg: 70,
    lluvia_total_mm: null,
    lluvia_confianza: 'ok',
    viento_kmh_avg: 8,
    rafaga_kmh_max: 15,
    viento_dir_predominante: 90,
    radiacion_wm2_avg: 250,
    radiacion_wm2_max: 400,
    uv_index_max: 6,
    lecturas_count: 288,
    ...overrides,
  };
}

// Caso real de producción (06-ago → 15-ago 2026).
const RESUMENES_10_DIAS: ResumenDiario[] = [
  resumenDia({ fecha: '2026-08-06', lluvia_total_mm: 0.25, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-07', lluvia_total_mm: 0.51, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-08', lluvia_total_mm: null, lluvia_confianza: 'contador_congelado' }),
  resumenDia({ fecha: '2026-08-09', lluvia_total_mm: 0.25, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-10', lluvia_total_mm: null, lluvia_confianza: 'contador_congelado' }),
  resumenDia({ fecha: '2026-08-11', lluvia_total_mm: 0, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-12', lluvia_total_mm: 0.25, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-13', lluvia_total_mm: null, lluvia_confianza: 'contador_congelado' }),
  resumenDia({ fecha: '2026-08-14', lluvia_total_mm: 0, lluvia_confianza: 'ok' }),
  resumenDia({ fecha: '2026-08-15', lluvia_total_mm: 0, lluvia_confianza: 'ok' }),
];

function renderCard() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ClimaCard />
    </MemoryRouter>,
  );
}

describe('ClimaCard — franja de lluvia de 10 días (§4 Bloque 2.1 del plan del tablero)', () => {
  const TZ_ORIGINAL = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Bogota';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T08:00:00-05:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ_ORIGINAL;
    resultadoMock.mockReset();
  });

  it('sin estación configurada, la tarjeta no pinta nada (comportamiento previo intacto)', () => {
    resultadoMock.mockReturnValue({
      lecturaActual: null,
      resumenPeriodos: [],
      resumenesDiarios: [],
      loading: false,
      estacionConfigurada: false,
    });
    expect(renderCard()).toBe('');
  });

  it('con datos, pinta la franja de 10 días distinguiendo lluvia / cero real / sin dato', () => {
    resultadoMock.mockReturnValue({
      lecturaActual: lectura(),
      resumenPeriodos: [],
      resumenesDiarios: RESUMENES_10_DIAS,
      loading: false,
      estacionConfigurada: true,
    });
    const html = renderCard();

    // Los tres días congelados salen como sin_dato, nunca 0mm
    expect((html.match(/data-estado="sin_dato"/g) ?? []).length).toBe(3);
    // Los cuatro días de lluvia real (06, 07, 09, 12-ago: 0,25 · 0,51 · 0,25 · 0,25)
    expect((html.match(/data-estado="lluvia"/g) ?? []).length).toBe(4);
    // Los tres ceros reales (08-11, 08-14, 08-15)
    expect((html.match(/data-estado="seco"/g) ?? []).length).toBe(3);

    expect(html).toContain('3 de 10 días sin dato de lluvia');
    expect(html).toContain('el contador del pluviómetro no se reinició');
  });

  it('un día sin fila en absoluto también es sin_dato -- no sólo el contador congelado', () => {
    resultadoMock.mockReturnValue({
      lecturaActual: lectura(),
      resumenPeriodos: [],
      resumenesDiarios: RESUMENES_10_DIAS.slice(0, 9), // falta 2026-08-15 (hoy)
      loading: false,
      estacionConfigurada: true,
    });
    const html = renderCard();
    // Ahora son 4 días sin dato: los 3 congelados + hoy sin fila
    expect(html).toContain('4 de 10 días sin dato de lluvia');
  });
});
