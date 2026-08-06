// ARCHIVO: __tests__/hatoAlertasUi.test.ts
// DESCRIPCIÓN: TDD de la lógica pura de AlertasView (S6/V11):
// orden/filtro/conteo de la cola de `hato_alertas` y el chip de respuesta.
// El chip de estado (`chipEstadoAlerta`) ya se prueba en hatoUi.test.ts,
// que es su fuente única -- aquí solo se prueba que este archivo lo
// re-exporta sin romperlo.

import { describe, it, expect } from 'vitest';
import {
  TIPOS_ALERTA_HATO,
  ESTADOS_ALERTA_HATO,
  LABEL_TIPO_ALERTA_HATO,
  LABEL_ESTADO_ALERTA_HATO,
  ordenarAlertasHato,
  filtrarAlertasHato,
  contarAlertasPorEstado,
  requiereRevisionSemanal,
  chipRespuestaAlerta,
  chipEstadoAlerta,
  alertasVencidasParaExpirar,
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '../utils/hatoAlertasUi';
import { DIAS_EXPIRACION_ALERTA } from '../utils/hatoAlertas';

describe('LABEL_TIPO_ALERTA_HATO / LABEL_ESTADO_ALERTA_HATO', () => {
  it('tiene una etiqueta no vacía para cada uno de los 5 tipos', () => {
    for (const tipo of TIPOS_ALERTA_HATO) {
      expect(LABEL_TIPO_ALERTA_HATO[tipo].length).toBeGreaterThan(0);
    }
  });

  it('tiene una etiqueta no vacía para cada uno de los 7 estados', () => {
    for (const estado of ESTADOS_ALERTA_HATO) {
      expect(LABEL_ESTADO_ALERTA_HATO[estado].length).toBeGreaterThan(0);
    }
  });
});

describe('ordenarAlertasHato', () => {
  it('pone escalada antes que pendiente, y pendiente antes que confirmada', () => {
    const alertas = [
      { id: 'c', estado: 'confirmada' as EstadoAlertaHato, fecha_programada: '2026-07-01' },
      { id: 'p', estado: 'pendiente' as EstadoAlertaHato, fecha_programada: '2026-07-01' },
      { id: 'e', estado: 'escalada' as EstadoAlertaHato, fecha_programada: '2026-07-01' },
    ];
    const ordenadas = ordenarAlertasHato(alertas);
    expect(ordenadas.map((a) => a.id)).toEqual(['e', 'p', 'c']);
  });

  it('dentro del mismo estado, ordena por fecha_programada ascendente (lo más vencido primero)', () => {
    const alertas = [
      { id: 'nueva', estado: 'pendiente' as EstadoAlertaHato, fecha_programada: '2026-08-01' },
      { id: 'vieja', estado: 'pendiente' as EstadoAlertaHato, fecha_programada: '2026-06-01' },
    ];
    const ordenadas = ordenarAlertasHato(alertas);
    expect(ordenadas.map((a) => a.id)).toEqual(['vieja', 'nueva']);
  });

  it('no muta el arreglo original', () => {
    const alertas = [
      { id: 'a', estado: 'confirmada' as EstadoAlertaHato, fecha_programada: '2026-07-01' },
      { id: 'b', estado: 'pendiente' as EstadoAlertaHato, fecha_programada: '2026-07-01' },
    ];
    const copia = [...alertas];
    ordenarAlertasHato(alertas);
    expect(alertas).toEqual(copia);
  });
});

describe('filtrarAlertasHato', () => {
  const alertas = [
    { id: '1', estado: 'pendiente' as EstadoAlertaHato, tipo: 'secado_due' as TipoAlertaHato },
    { id: '2', estado: 'respondida' as EstadoAlertaHato, tipo: 'parto_proximo' as TipoAlertaHato },
    { id: '3', estado: 'pendiente' as EstadoAlertaHato, tipo: 'parto_proximo' as TipoAlertaHato },
  ];

  it('sin filtros devuelve todo', () => {
    expect(filtrarAlertasHato(alertas, {})).toHaveLength(3);
  });

  it('filtra por estado', () => {
    const resultado = filtrarAlertasHato(alertas, { estado: 'pendiente' });
    expect(resultado.map((a) => a.id)).toEqual(['1', '3']);
  });

  it('filtra por tipo', () => {
    const resultado = filtrarAlertasHato(alertas, { tipo: 'parto_proximo' });
    expect(resultado.map((a) => a.id)).toEqual(['2', '3']);
  });

  it('combina estado y tipo', () => {
    const resultado = filtrarAlertasHato(alertas, { estado: 'pendiente', tipo: 'parto_proximo' });
    expect(resultado.map((a) => a.id)).toEqual(['3']);
  });
});

describe('contarAlertasPorEstado', () => {
  it('cuenta solo los estados que realmente aparecen -- nunca inventa un 0', () => {
    const conteo = contarAlertasPorEstado([
      { estado: 'pendiente' as EstadoAlertaHato },
      { estado: 'pendiente' as EstadoAlertaHato },
      { estado: 'confirmada' as EstadoAlertaHato },
    ]);
    expect(conteo).toEqual({ pendiente: 2, confirmada: 1 });
    expect(conteo.escalada).toBeUndefined();
  });

  it('con una cola vacía devuelve un objeto vacío, no un mapa de ceros', () => {
    expect(contarAlertasPorEstado([])).toEqual({});
  });
});

describe('requiereRevisionSemanal', () => {
  it('es true para respondida, escalada y expirada', () => {
    expect(requiereRevisionSemanal('respondida')).toBe(true);
    expect(requiereRevisionSemanal('escalada')).toBe(true);
    expect(requiereRevisionSemanal('expirada')).toBe(true);
  });

  it('es false para pendiente, enviada, confirmada y descartada', () => {
    expect(requiereRevisionSemanal('pendiente')).toBe(false);
    expect(requiereRevisionSemanal('enviada')).toBe(false);
    expect(requiereRevisionSemanal('confirmada')).toBe(false);
    expect(requiereRevisionSemanal('descartada')).toBe(false);
  });
});

describe('chipRespuestaAlerta', () => {
  it('devuelve null cuando no hay respuesta (nunca se inventa un color)', () => {
    expect(chipRespuestaAlerta(null)).toBeNull();
    expect(chipRespuestaAlerta('')).toBeNull();
    expect(chipRespuestaAlerta('   ')).toBeNull();
  });

  it('resalta en rojo una respuesta negativa', () => {
    expect(chipRespuestaAlerta('No')?.className).toContain('red');
    expect(chipRespuestaAlerta('Todavía no')?.className).toContain('red');
  });

  it('muestra en gris neutro cualquier otra respuesta', () => {
    expect(chipRespuestaAlerta('Sí')?.className).toContain('gray');
    expect(chipRespuestaAlerta('Se sirvió el 12/07 con Fabace')?.className).toContain('gray');
  });
});

describe('chipEstadoAlerta (re-exportado desde hatoUi.ts)', () => {
  it('devuelve un label no vacío para cada uno de los 7 estados', () => {
    for (const estado of ESTADOS_ALERTA_HATO) {
      expect(chipEstadoAlerta(estado).label.length).toBeGreaterThan(0);
    }
  });
});

// T3a (ronda agosto 2026): la regla de expiración automática que
// `AlertasView.tsx` ofrece como acción explícita (nunca dispara sola) para
// que `escalada`/`respondida` no se acumulen para siempre -- el tick solo
// cubre `pendiente`/`enviada`.
describe('alertasVencidasParaExpirar', () => {
  const HOY = '2026-08-06T10:00:00.000Z';

  it('marca una `escalada` cuya escalada_at supera el umbral', () => {
    const alertas = [
      { id: 'a', estado: 'escalada' as EstadoAlertaHato, escalada_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' },
    ];
    expect(alertasVencidasParaExpirar(alertas, HOY).map((a) => a.id)).toEqual(['a']);
  });

  it('NO marca una `escalada` reciente (dentro del umbral)', () => {
    const alertas = [
      { id: 'a', estado: 'escalada' as EstadoAlertaHato, escalada_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
    ];
    expect(alertasVencidasParaExpirar(alertas, HOY)).toEqual([]);
  });

  it('para `respondida` usa `updated_at` como ancla (no tiene escalada_at)', () => {
    const alertas = [
      { id: 'a', estado: 'respondida' as EstadoAlertaHato, escalada_at: null, updated_at: '2026-07-01T00:00:00.000Z' },
    ];
    expect(alertasVencidasParaExpirar(alertas, HOY).map((a) => a.id)).toEqual(['a']);
  });

  it('ignora pendiente/enviada/confirmada/descartada/expirada -- esos son terreno del tick, no de esta regla', () => {
    const viejo = '2026-01-01T00:00:00.000Z';
    const alertas = (['pendiente', 'enviada', 'confirmada', 'descartada', 'expirada'] as EstadoAlertaHato[]).map((estado, i) => ({
      id: `id-${i}`,
      estado,
      escalada_at: viejo,
      updated_at: viejo,
    }));
    expect(alertasVencidasParaExpirar(alertas, HOY)).toEqual([]);
  });

  it('respeta un umbral distinto al default cuando se lo pasan', () => {
    const alertas = [
      { id: 'a', estado: 'escalada' as EstadoAlertaHato, escalada_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
    ];
    // 5 días desde 08-01 hasta 08-06 -- por debajo del default (14) pero por
    // encima de un umbral de 3.
    expect(alertasVencidasParaExpirar(alertas, HOY, 3).map((a) => a.id)).toEqual(['a']);
    expect(alertasVencidasParaExpirar(alertas, HOY, DIAS_EXPIRACION_ALERTA)).toEqual([]);
  });

  it('no muta el arreglo original', () => {
    const alertas = [
      { id: 'a', estado: 'escalada' as EstadoAlertaHato, escalada_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' },
    ];
    const copia = [...alertas];
    alertasVencidasParaExpirar(alertas, HOY);
    expect(alertas).toEqual(copia);
  });
});
