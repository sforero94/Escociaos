import { describe, it, expect } from 'vitest';
import {
  construirFilaGanadoPendiente,
  derivarAplicacionesParaDecision,
  construirFilaAplicacionesColgadas,
  construirFilaAplicacionesArrancanPronto,
  construirFilaGastosPendientes,
  type AplicacionParaDecision,
} from '@/utils/calculosRequiereDecision';

const HOY = '2026-08-17';

describe('construirFilaGanadoPendiente', () => {
  it('sin pendientes no hay fila (cero real, no "sin dato")', () => {
    expect(construirFilaGanadoPendiente([], HOY, 369)).toBeNull();
  });

  it('un pendiente: título singular y días desde el más viejo (único)', () => {
    const fila = construirFilaGanadoPendiente([{ id: 'm1', fecha: '2026-08-08' }], HOY, 369);
    expect(fila).not.toBeNull();
    expect(fila!.titulo).toBe('1 movimiento de ganado pendiente de confirmar');
    expect(fila!.contexto).toContain('El más viejo lleva 9 días.');
    expect(fila!.contexto).toContain('369 cabezas');
    expect(fila!.idMasViejo).toBe('m1');
  });

  it('varios pendientes: título plural, y el ID resuelto es el MÁS VIEJO por fecha, no el primero del array', () => {
    const fila = construirFilaGanadoPendiente(
      [
        { id: 'reciente', fecha: '2026-08-15' },
        { id: 'viejo', fecha: '2026-08-08' },
      ],
      HOY,
      369,
    );
    expect(fila!.titulo).toBe('2 movimientos de ganado pendientes de confirmar');
    expect(fila!.contexto).toContain('El más viejo lleva 9 días.');
    expect(fila!.idMasViejo).toBe('viejo');
  });

  it('totalCabezas null (la consulta de inventario falló): el contexto se degrada sin fabricar un número', () => {
    const fila = construirFilaGanadoPendiente([{ id: 'm1', fecha: '2026-08-08' }], HOY, null);
    expect(fila!.contexto).toBe('El más viejo lleva 9 días. Sin confirmar, el inventario no se mueve.');
    expect(fila!.contexto).not.toMatch(/\b0\b/);
  });

  it('nunca dice "0" aunque el pendiente sea de hoy mismo', () => {
    const fila = construirFilaGanadoPendiente([{ id: 'm1', fecha: HOY }], HOY, 369);
    expect(fila!.contexto).toContain('El más viejo lleva 0 días.');
  });
});

function aplicacion(overrides: Partial<AplicacionParaDecision>): AplicacionParaDecision {
  return {
    id: 'a1',
    nombre: 'Aplicación genérica',
    estado: 'Calculada',
    created_at: null,
    fecha_inicio_planeada: null,
    ...overrides,
  };
}

describe('derivarAplicacionesParaDecision', () => {
  it('En ejecución hace más de 14 días → colgada; 14 días exactos NO colgada (umbral estricto)', () => {
    const { colgadas } = derivarAplicacionesParaDecision(
      [
        aplicacion({ id: 'a1', estado: 'En ejecución', fecha_inicio_planeada: '2026-08-04' }), // 13 días -> no colgada
        aplicacion({ id: 'a2', estado: 'En ejecución', fecha_inicio_planeada: '2026-08-03' }), // 14 días -> no colgada (estricto >)
        aplicacion({ id: 'a3', estado: 'En ejecución', fecha_inicio_planeada: '2026-07-01' }), // 47 días -> colgada
      ],
      HOY,
    );
    expect(colgadas.map((c) => c.id)).toEqual(['a3']);
  });

  it('Calculada hace más de 7 días desde created_at → colgada, usando la fecha LOCAL del timestamp', () => {
    const { colgadas } = derivarAplicacionesParaDecision(
      [aplicacion({ id: 'a1', estado: 'Calculada', created_at: '2026-08-04T23:30:00.000Z' })],
      HOY,
    );
    // 2026-08-04T23:30:00Z en Bogotá (UTC-5) es 2026-08-04 18:30 local -> misma
    // fecha de calendario, 13 días hasta el 17 -> colgada (> 7).
    expect(colgadas).toHaveLength(1);
    expect(colgadas[0].id).toBe('a1');
    expect(colgadas[0].estadoTexto).toBe('en estado Calculada');
  });

  it('Calculada con inicio planeado dentro de los próximos 7 días → arranca pronto, nunca también colgada', () => {
    const { colgadas, arrancanPronto } = derivarAplicacionesParaDecision(
      [
        aplicacion({
          id: 'a1',
          estado: 'Calculada',
          created_at: '2026-08-16T10:00:00.000Z', // 1 día -> no colgada
          fecha_inicio_planeada: '2026-08-18',
        }),
      ],
      HOY,
    );
    expect(colgadas).toHaveLength(0);
    expect(arrancanPronto).toHaveLength(1);
    expect(arrancanPronto[0]).toMatchObject({ id: 'a1', dias: 1, fechaInicio: '2026-08-18' });
  });

  it('Calculada ya colgada NUNCA también aparece como "arranca pronto", aunque su inicio caiga en la ventana', () => {
    const { colgadas, arrancanPronto } = derivarAplicacionesParaDecision(
      [
        aplicacion({
          id: 'a1',
          estado: 'Calculada',
          created_at: '2026-08-01T10:00:00.000Z', // 16 días -> colgada
          fecha_inicio_planeada: '2026-08-20', // dentro de la ventana de "arranca pronto"
        }),
      ],
      HOY,
    );
    expect(colgadas.map((c) => c.id)).toEqual(['a1']);
    expect(arrancanPronto).toHaveLength(0);
  });

  it('inicio planeado fuera de la ventana de 7 días no genera "arranca pronto"', () => {
    const { arrancanPronto } = derivarAplicacionesParaDecision(
      [aplicacion({ id: 'a1', estado: 'Calculada', created_at: HOY + 'T10:00:00.000Z', fecha_inicio_planeada: '2026-08-30' })],
      HOY,
    );
    expect(arrancanPronto).toHaveLength(0);
  });

  it('inicio planeado ya pasado no genera "arranca pronto" (evita negativos "arranca en -3 días")', () => {
    const { arrancanPronto } = derivarAplicacionesParaDecision(
      [aplicacion({ id: 'a1', estado: 'Calculada', created_at: HOY + 'T10:00:00.000Z', fecha_inicio_planeada: '2026-08-10' })],
      HOY,
    );
    expect(arrancanPronto).toHaveLength(0);
  });

  it('sin fecha_inicio_planeada, una aplicación En ejecución no puede evaluarse y se omite (nunca se asume colgada)', () => {
    const { colgadas } = derivarAplicacionesParaDecision(
      [aplicacion({ id: 'a1', estado: 'En ejecución', fecha_inicio_planeada: null })],
      HOY,
    );
    expect(colgadas).toHaveLength(0);
  });
});

describe('construirFilaAplicacionesColgadas', () => {
  it('sin colgadas no hay fila', () => {
    expect(construirFilaAplicacionesColgadas([])).toBeNull();
  });

  it('dos aplicaciones que cruzan el umbral (>14d), mismos días y estado → una fila combinada con destino a la lista', () => {
    // Mismo caso real citado por el plan (Drench agosto + Fumigación control
    // monalonion, ambas desde el 4 de agosto) pero con una fecha que SÍ cruza
    // el umbral existente de 14 días -- el "12 días" literal del plan (escrito
    // el 16 de agosto, un día antes de HOY) no lo cruza, y este test cubre el
    // umbral real, no la redacción editorial del documento.
    const { colgadas } = derivarAplicacionesParaDecision(
      [
        aplicacion({ id: 'drench', nombre: 'Drench agosto', estado: 'En ejecución', fecha_inicio_planeada: '2026-07-20' }),
        aplicacion({
          id: 'fumigacion',
          nombre: 'Fumigación control monalonion',
          estado: 'En ejecución',
          fecha_inicio_planeada: '2026-07-20',
        }),
      ],
      HOY,
    );
    const fila = construirFilaAplicacionesColgadas(colgadas);
    expect(fila!.titulo).toBe('2 aplicaciones llevan 28 días en ejecución');
    expect(fila!.contexto).toContain('Drench agosto y Fumigación control monalonion');
    expect(fila!.contexto).toContain('ambas desde el');
    // Con más de una aplicación no hay un único destino de cierre correcto.
    expect(fila!.aplicacionId).toBeNull();
  });

  it('una sola aplicación colgada: el botón puede apuntar a su cierre específico', () => {
    const fila = construirFilaAplicacionesColgadas([
      { id: 'a1', nombre: 'Drench agosto', dias: 12, estadoTexto: 'en ejecución', fechaReferencia: '2026-08-05' },
    ]);
    expect(fila!.titulo).toBe("'Drench agosto' lleva 12 días en ejecución");
    expect(fila!.aplicacionId).toBe('a1');
  });

  it('días o estado distintos entre colgadas: título genérico, contexto lista cada una con su propio dato', () => {
    const fila = construirFilaAplicacionesColgadas([
      { id: 'a1', nombre: 'Drench agosto', dias: 12, estadoTexto: 'en ejecución', fechaReferencia: '2026-08-05' },
      { id: 'a2', nombre: 'Enmienda', dias: 9, estadoTexto: 'en estado Calculada', fechaReferencia: '2026-08-08' },
    ]);
    expect(fila!.titulo).toBe('2 aplicaciones sin cerrar');
    expect(fila!.contexto).toContain('Drench agosto (12 días)');
    expect(fila!.contexto).toContain('Enmienda (9 días)');
    expect(fila!.aplicacionId).toBeNull();
  });
});

describe('construirFilaAplicacionesArrancanPronto', () => {
  it('sin filas no hay fila', () => {
    expect(construirFilaAplicacionesArrancanPronto([])).toBeNull();
  });

  it('el caso real de hoy: "Aplicacion Enmienda" arranca en 1 día', () => {
    const fila = construirFilaAplicacionesArrancanPronto([
      { id: 'enmienda', nombre: 'Aplicacion Enmienda', dias: 1, fechaInicio: '2026-08-18' },
    ]);
    expect(fila!.titulo).toBe("'Aplicacion Enmienda' arranca en 1 día");
    expect(fila!.contexto).toContain('18 de agosto');
    expect(fila!.aplicacionId).toBe('enmienda');
  });

  it('arranca el mismo día → "arranca hoy", no "en 0 días"', () => {
    const fila = construirFilaAplicacionesArrancanPronto([{ id: 'a1', nombre: 'X', dias: 0, fechaInicio: HOY }]);
    expect(fila!.titulo).toBe("'X' arranca hoy");
  });
});

describe('construirFilaGastosPendientes', () => {
  it('cero gastos pendientes (el caso real de hoy) no genera fila', () => {
    expect(construirFilaGastosPendientes([])).toBeNull();
  });

  it('suma el valor total y lo abrevia a millones, sin sufijo COP', () => {
    const fila = construirFilaGastosPendientes([{ valor: 1_200_000 }, { valor: 300_000 }]);
    expect(fila!.titulo).toBe('2 gastos pendientes de confirmar');
    expect(fila!.contexto).toBe('$1.5M registrados y todavía sin confirmar.');
  });

  it('un solo gasto pendiente: título singular', () => {
    const fila = construirFilaGastosPendientes([{ valor: 50_000 }]);
    expect(fila!.titulo).toBe('1 gasto pendiente de confirmar');
  });
});
