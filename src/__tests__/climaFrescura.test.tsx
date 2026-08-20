import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { LecturaClima, ResumenDiario } from '@/types/clima';
import {
  UMBRAL_FRESCURA_LECTURA,
  clasificarFrescuraLectura,
  etiquetaEdadLectura,
  lecturaEsReciente,
  minutosDesdeLectura,
} from '@/utils/calculosClima';

/**
 * Frescura de la lectura en vivo (ESCO-31). Caso real: el 2026-08-19 a las
 * 21:05 Bogotá la finca se quedó sin luz; la estación no envió una lectura
 * más hasta las 11:30 del día siguiente (14 h 25 min de hueco, verificado
 * contra producción). Durante todo ese rato el Tablero mostró la lectura de
 * las 21:05 — 19,5 °C / 0 W/m² / 0 km/h — bajo el rótulo "Ahora".
 *
 * `useClimaData` hace I/O contra Supabase dentro de un `useEffect`, que SSR
 * no ejecuta -- por eso se mockea, mismo precedente que
 * `climaCardFranja.test.tsx`.
 */

const AHORA = new Date('2026-08-20T11:00:00-05:00');

function haceMinutos(min: number): string {
  return new Date(AHORA.getTime() - min * 60_000).toISOString();
}

describe('minutosDesdeLectura', () => {
  it('mide la edad en minutos sobre el instante de la lectura', () => {
    expect(minutosDesdeLectura({ timestamp: haceMinutos(0) }, AHORA)).toBe(0);
    expect(minutosDesdeLectura({ timestamp: haceMinutos(45) }, AHORA)).toBe(45);
    expect(minutosDesdeLectura({ timestamp: haceMinutos(14 * 60 + 25) }, AHORA)).toBe(865);
  });

  it('sin lectura, null -- nunca 0, que significaría "recién llegada"', () => {
    expect(minutosDesdeLectura(null, AHORA)).toBeNull();
    expect(minutosDesdeLectura(undefined, AHORA)).toBeNull();
    expect(minutosDesdeLectura({ timestamp: 'no es una fecha' }, AHORA)).toBeNull();
  });

  it('una lectura con timestamp futuro (reloj de la estación adelantado) da 0, nunca negativo', () => {
    expect(minutosDesdeLectura({ timestamp: haceMinutos(-10) }, AHORA)).toBe(0);
  });
});

describe('lecturaEsReciente', () => {
  it('la lectura de hace 5 min sirve como condiciones actuales', () => {
    expect(lecturaEsReciente({ timestamp: haceMinutos(5) }, undefined, AHORA)).toBe(true);
  });

  it('la del corte de luz (14 h) no', () => {
    expect(lecturaEsReciente({ timestamp: haceMinutos(14 * 60) }, undefined, AHORA)).toBe(false);
  });

  it('sin lectura, false -- nunca true por omisión', () => {
    expect(lecturaEsReciente(null, undefined, AHORA)).toBe(false);
  });

  it('el umbral es parametrizable, con el default en UMBRAL_FRESCURA_LECTURA', () => {
    expect(UMBRAL_FRESCURA_LECTURA.frescaMinutos).toBe(30);
    expect(UMBRAL_FRESCURA_LECTURA.demoradaMinutos).toBe(180);
    expect(lecturaEsReciente({ timestamp: haceMinutos(45) }, undefined, AHORA)).toBe(false);
    expect(lecturaEsReciente({ timestamp: haceMinutos(45) }, 60, AHORA)).toBe(true);
  });
});

describe('clasificarFrescuraLectura', () => {
  it('fresca hasta el umbral inclusive, demorada hasta el segundo, obsoleta por encima', () => {
    expect(clasificarFrescuraLectura({ timestamp: haceMinutos(5) }, AHORA)).toBe('fresca');
    expect(clasificarFrescuraLectura({ timestamp: haceMinutos(30) }, AHORA)).toBe('fresca');
    expect(clasificarFrescuraLectura({ timestamp: haceMinutos(31) }, AHORA)).toBe('demorada');
    expect(clasificarFrescuraLectura({ timestamp: haceMinutos(180) }, AHORA)).toBe('demorada');
    expect(clasificarFrescuraLectura({ timestamp: haceMinutos(181) }, AHORA)).toBe('obsoleta');
  });

  it('sin ninguna lectura es obsoleta, no "fresca por defecto" -- tras la poda de 24 h de la migración 036 eso es justamente una estación muda hace más de un día', () => {
    expect(clasificarFrescuraLectura(null, AHORA)).toBe('obsoleta');
  });
});

describe('etiquetaEdadLectura', () => {
  it('minutos, horas y días, con formato colombiano', () => {
    expect(etiquetaEdadLectura(0)).toBe('hace instantes');
    expect(etiquetaEdadLectura(45)).toBe('hace 45 min');
    expect(etiquetaEdadLectura(59)).toBe('hace 59 min');
    expect(etiquetaEdadLectura(60)).toBe('hace 1 h');
    expect(etiquetaEdadLectura(14 * 60 + 25)).toBe('hace 14 h'); // el corte real
    expect(etiquetaEdadLectura(72 * 60)).toBe('hace 3 d');
  });

  it('sin lectura, "sin lecturas" -- nunca "hace 0 min"', () => {
    expect(etiquetaEdadLectura(null)).toBe('sin lecturas');
  });
});

// ---------------------------------------------------------------------------
// ClimaCard: lo que ve el usuario en el Tablero General
// ---------------------------------------------------------------------------

const resultadoMock = vi.fn();

vi.mock('@/hooks/useClimaData', () => ({
  useClimaData: () => resultadoMock(),
}));

const { ClimaCard } = await import('@/components/dashboard/ClimaCard');

function lectura(minutosDeAntiguedad: number): LecturaClima {
  return {
    id: 1,
    timestamp: haceMinutos(minutosDeAntiguedad),
    station_id: '84:1F:E8:35:D8:73',
    temp_c: 19.5,
    humedad_pct: 88,
    viento_kmh: 0,
    rafaga_kmh: 0,
    viento_dir: 90,
    lluvia_tasa_mm_hr: 0,
    lluvia_evento_mm: 0,
    lluvia_diaria_mm: 0,
    lluvia_diaria_actualizada_en: null,
    radiacion_wm2: 0,
    uv_index: 0,
    created_at: haceMinutos(minutosDeAntiguedad),
  };
}

const RESUMENES: ResumenDiario[] = [
  {
    fecha: '2026-08-19',
    station_id: '84:1F:E8:35:D8:73',
    temp_c_min: 15,
    temp_c_max: 27,
    temp_c_avg: 21,
    humedad_pct_min: 50,
    humedad_pct_max: 95,
    humedad_pct_avg: 75,
    lluvia_total_mm: 0,
    lluvia_confianza: 'ok',
    viento_kmh_avg: 5,
    rafaga_kmh_max: 12,
    viento_dir_predominante: 90,
    radiacion_wm2_avg: 200,
    radiacion_wm2_max: 700,
    uv_index_max: 6,
    lecturas_count: 164,
  },
];

function renderCard(estado: Record<string, unknown>) {
  resultadoMock.mockReturnValue({
    resumenPeriodos: [],
    resumenesDiarios: RESUMENES,
    loading: false,
    estacionConfigurada: true,
    ...estado,
  });
  return renderToStaticMarkup(
    <MemoryRouter>
      <ClimaCard />
    </MemoryRouter>,
  );
}

describe('ClimaCard — reja de frescura', () => {
  const TZ_ORIGINAL = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Bogota';
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ_ORIGINAL;
    resultadoMock.mockReset();
  });

  it('lectura fresca: se rotula "Ahora" y se pinta sin atenuar (comportamiento previo intacto)', () => {
    const html = renderCard({ lecturaActual: lectura(5) });
    expect(html).toContain('Ahora');
    expect(html).toContain('20°C'); // Math.round(19,5)
    expect(html).not.toContain('opacity-60');
    expect(html).not.toContain('Sin dato reciente');
  });

  it('entre 30 min y 3 h: el rótulo deja de decir "Ahora" y los valores se atenúan', () => {
    const html = renderCard({ lecturaActual: lectura(95) });
    expect(html).toContain('hace 1 h');
    expect(html).not.toContain('>Ahora<');
    expect(html).toContain('opacity-60');
    expect(html).toContain('20°C'); // el valor sigue visible, sólo calificado
  });

  it('el caso real del corte de luz (14 h): estado explícito, sin ningún valor presentado como actual', () => {
    const html = renderCard({ lecturaActual: lectura(14 * 60 + 25) });
    expect(html).toContain('Sin dato reciente del clima');
    expect(html).toContain('Última lectura hace 14 h');
    expect(html).not.toContain('>Ahora<');
    expect(html).not.toContain('20°C');
    expect(html).not.toContain('0 W/m²');
  });

  it('a las ~24 h el cron poda clima_lecturas y no queda ninguna: la tarjeta lo DICE, no desaparece', () => {
    const html = renderCard({ lecturaActual: null });
    expect(html).not.toBe('');
    expect(html).toContain('Sin dato reciente del clima');
    expect(html).toContain('más de 24 h');
  });

  it('una lectura sin temperatura tampoco se pinta como actual', () => {
    const html = renderCard({ lecturaActual: { ...lectura(2), temp_c: null } });
    expect(html).toContain('Sin dato reciente del clima');
  });

  it('el estado "sin dato reciente" conserva la historia (franja de lluvia), que sigue siendo válida', () => {
    const html = renderCard({ lecturaActual: null });
    expect(html).toContain('data-estado=');
  });

  it('sin estación en toda la base, la tarjeta sí desaparece: nunca hubo clima que mostrar', () => {
    const html = renderCard({ lecturaActual: null, resumenesDiarios: [], estacionConfigurada: false });
    expect(html).toBe('');
  });
});
