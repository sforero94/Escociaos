/**
 * Fase 5 -- Recordatorio, alerta del día 15 y reporte de cierre
 * (docs/brief_tecnico_verificacion_inventario.md §8/§13). Cobertura de
 * `src/utils/rondaInventario/tick.ts` -- lógica PURA de los cuatro trabajos
 * del tick (`ronda-inventario-tick.ts`, I/O, no testeado acá; ver
 * `hato-alertas-tick.ts`/`acciones-tick.ts` para el precedente de por qué la
 * capa I/O no lleva test de Vitest dedicado).
 *
 * Escrito ANTES de `ronda-inventario-tick.ts` -- TDD: cada función de acá se
 * corrió primero contra un archivo `tick.ts` inexistente (falla por import),
 * y sólo después se escribió la implementación.
 */

import { describe, it, expect } from 'vitest';
import {
  DIAS_UMBRAL_EXCEPCION_VENCIDA,
  MAX_EXCEPCIONES_VENCIDAS_EN_MENSAJE,
  claveRecordatorioBase,
  claveRecordatorioPospuesto,
  decidirRecordatorio,
  claveMesOmitido,
  decidirMesOmitido,
  claveExcepcionesVencidas,
  decidirExcepcionesVencidas,
  sumarDiasFecha,
  clasificarMovimientoRondaAbierta,
  calcularValorInventario,
  etiquetaEstadoPendienteExcepcion,
  construirMensajeRevisionDia15,
  construirMensajeRecordatorio,
  type ProductoParaValoracion,
} from '@/utils/rondaInventario/tick';

// ---------------------------------------------------------------------------
// Claves -- formato literal de §8.1 del brief técnico.
// ---------------------------------------------------------------------------

describe('claves de rondas_avisos', () => {
  it('claveRecordatorioBase: "recordatorio:AAAA-MM"', () => {
    expect(claveRecordatorioBase('2026-09-01')).toBe('recordatorio:2026-09');
  });

  it('claveRecordatorioPospuesto: "recordatorio:AAAA-MM:posp:AAAA-MM-DD"', () => {
    expect(claveRecordatorioPospuesto('2026-09-01', '2026-09-08')).toBe('recordatorio:2026-09:posp:2026-09-08');
  });

  it('claveMesOmitido: "mes_omitido:AAAA-MM"', () => {
    expect(claveMesOmitido('2026-09-01')).toBe('mes_omitido:2026-09');
  });

  it('claveExcepcionesVencidas: "excepciones_vencidas:AAAA-MM"', () => {
    expect(claveExcepcionesVencidas('2026-09-01')).toBe('excepciones_vencidas:2026-09');
  });
});

// ---------------------------------------------------------------------------
// decidirRecordatorio (A-1/A-4/CA-3) -- día 1 del mes, o la fecha a la que
// Uriel pospuso, y no hay ronda cerrada del período.
// ---------------------------------------------------------------------------

describe('decidirRecordatorio', () => {
  it('día 1 del mes, sin ronda cerrada -> envía con la clave base', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-01', periodo: '2026-09-01', rondaCerradaDelPeriodo: false, posponerHasta: null });
    expect(d).toEqual({ enviar: true, clave: 'recordatorio:2026-09' });
  });

  it('día 1 del mes, pero la ronda de ese período YA está cerrada -> no envía', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-01', periodo: '2026-09-01', rondaCerradaDelPeriodo: true, posponerHasta: null });
    expect(d.enviar).toBe(false);
  });

  it('día distinto de 1 y sin posponer_hasta -> no envía', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-05', periodo: '2026-09-01', rondaCerradaDelPeriodo: false, posponerHasta: null });
    expect(d.enviar).toBe(false);
  });

  it('hoy coincide con la fecha a la que Uriel pospuso -> envía con la clave pospuesta', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-08', periodo: '2026-09-01', rondaCerradaDelPeriodo: false, posponerHasta: '2026-09-08' });
    expect(d).toEqual({ enviar: true, clave: 'recordatorio:2026-09:posp:2026-09-08' });
  });

  it('hoy NO coincide con la fecha pospuesta -> no envía (ni siquiera si ya pasó)', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-09', periodo: '2026-09-01', rondaCerradaDelPeriodo: false, posponerHasta: '2026-09-08' });
    expect(d.enviar).toBe(false);
  });

  it('posponer_hasta con ronda ya cerrada -> no envía (CA-24 nunca se salta por una fecha pospuesta)', () => {
    const d = decidirRecordatorio({ hoy: '2026-09-08', periodo: '2026-09-01', rondaCerradaDelPeriodo: true, posponerHasta: '2026-09-08' });
    expect(d.enviar).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decidirMesOmitido (R-11/CA-23/CA-24) -- día >= 15, sin ronda cerrada.
// ---------------------------------------------------------------------------

describe('decidirMesOmitido', () => {
  it('día 15 exacto, sin ronda cerrada -> envía', () => {
    expect(decidirMesOmitido({ hoy: '2026-09-15', periodo: '2026-09-01', rondaCerradaDelPeriodo: false })).toEqual({
      enviar: true,
      clave: 'mes_omitido:2026-09',
    });
  });

  it('día 20 (después del 15), sin ronda cerrada -> envía igual (red de seguridad si el cron falló el día 15)', () => {
    expect(decidirMesOmitido({ hoy: '2026-09-20', periodo: '2026-09-01', rondaCerradaDelPeriodo: false }).enviar).toBe(true);
  });

  it('día 14 -> no envía todavía', () => {
    expect(decidirMesOmitido({ hoy: '2026-09-14', periodo: '2026-09-01', rondaCerradaDelPeriodo: false }).enviar).toBe(false);
  });

  it('día >= 15 pero la ronda del período YA está cerrada -> no envía', () => {
    expect(decidirMesOmitido({ hoy: '2026-09-20', periodo: '2026-09-01', rondaCerradaDelPeriodo: true }).enviar).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decidirExcepcionesVencidas (P-2/M-4) -- día >= 15 y AL MENOS una excepción
// vencida. NO depende de si la ronda del mes se cerró o no (P-2, el bloque
// NO cuelga del de mes omitido -- puede salir en un mes con la ronda hecha).
// ---------------------------------------------------------------------------

describe('decidirExcepcionesVencidas', () => {
  it('día 15, hay excepciones vencidas -> envía', () => {
    expect(decidirExcepcionesVencidas({ hoy: '2026-09-15', periodo: '2026-09-01', hayExcepcionesVencidas: true })).toEqual({
      enviar: true,
      clave: 'excepciones_vencidas:2026-09',
    });
  });

  it('día 15, sin ninguna excepción vencida -> no envía', () => {
    expect(decidirExcepcionesVencidas({ hoy: '2026-09-15', periodo: '2026-09-01', hayExcepcionesVencidas: false }).enviar).toBe(false);
  });

  it('día 10 (antes del 15), aunque haya excepciones vencidas -> no envía todavía', () => {
    expect(decidirExcepcionesVencidas({ hoy: '2026-09-10', periodo: '2026-09-01', hayExcepcionesVencidas: true }).enviar).toBe(false);
  });

  it('DIAS_UMBRAL_EXCEPCION_VENCIDA es 30 (M-4, literal)', () => {
    expect(DIAS_UMBRAL_EXCEPCION_VENCIDA).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// sumarDiasFecha -- aritmética de calendario para "Mañana"/"En 3 días"/
// "La próxima semana" (A-4, mecánica de posponer resuelta por el backend).
// ---------------------------------------------------------------------------

describe('sumarDiasFecha', () => {
  it('suma 1 día dentro del mismo mes', () => {
    expect(sumarDiasFecha('2026-09-01', 1)).toBe('2026-09-02');
  });

  it('suma 3 días', () => {
    expect(sumarDiasFecha('2026-09-05', 3)).toBe('2026-09-08');
  });

  it('suma 7 días cruzando fin de mes', () => {
    expect(sumarDiasFecha('2026-09-28', 7)).toBe('2026-10-05');
  });

  it('suma 7 días cruzando fin de año', () => {
    expect(sumarDiasFecha('2026-12-28', 7)).toBe('2027-01-04');
  });
});

// ---------------------------------------------------------------------------
// clasificarMovimientoRondaAbierta (R-9/CA-19, P-3 §15.3) -- los TRES
// orígenes de OrigenMovimientoRondaAbierta (reporteCierre.ts), exactos.
// ---------------------------------------------------------------------------

describe('clasificarMovimientoRondaAbierta', () => {
  const productoIdsEnAlcance = new Set(['prod-1', 'prod-2']);

  it('movimiento ligado a una excepción de esta ronda (captura O aplicación) -> captura_excepcion', () => {
    const movimientoIdsDeExcepcion = new Set(['mov-1']);
    expect(
      clasificarMovimientoRondaAbierta({ movimientoId: 'mov-1', productoId: 'prod-1', movimientoIdsDeExcepcion, productoIdsEnAlcance }),
    ).toBe('captura_excepcion');
  });

  it('movimiento NO ligado a ninguna excepción, de un producto que SÍ estaba en el alcance -> ajuste_puntual', () => {
    const movimientoIdsDeExcepcion = new Set<string>();
    expect(
      clasificarMovimientoRondaAbierta({ movimientoId: 'mov-2', productoId: 'prod-2', movimientoIdsDeExcepcion, productoIdsEnAlcance }),
    ).toBe('ajuste_puntual');
  });

  it('movimiento de un producto que NO estaba en el alcance congelado -> entrada_fuera_de_alcance (P-3)', () => {
    const movimientoIdsDeExcepcion = new Set<string>();
    expect(
      clasificarMovimientoRondaAbierta({ movimientoId: 'mov-3', productoId: 'prod-nuevo', movimientoIdsDeExcepcion, productoIdsEnAlcance }),
    ).toBe('entrada_fuera_de_alcance');
  });

  it('un movimiento ligado a una excepción SIEMPRE es captura_excepcion, incluso si el producto no está en el alcance (no debería pasar, pero la ligazón manda)', () => {
    const movimientoIdsDeExcepcion = new Set(['mov-4']);
    expect(
      clasificarMovimientoRondaAbierta({ movimientoId: 'mov-4', productoId: 'prod-nuevo', movimientoIdsDeExcepcion, productoIdsEnAlcance }),
    ).toBe('captura_excepcion');
  });
});

// ---------------------------------------------------------------------------
// calcularValorInventario -- MISMA fórmula que MovementsDashboard.tsx:195-201
// (Σ cantidad_actual × precio_unitario sobre productos activos, NULL -> 0).
// ---------------------------------------------------------------------------

describe('calcularValorInventario', () => {
  it('suma cantidad × precio de los productos activos', () => {
    const productos: ProductoParaValoracion[] = [
      { cantidadActual: 10, precioUnitario: 100, activo: true },
      { cantidadActual: 5, precioUnitario: 200, activo: true },
    ];
    expect(calcularValorInventario(productos)).toBe(10 * 100 + 5 * 200);
  });

  it('excluye productos inactivos', () => {
    const productos: ProductoParaValoracion[] = [
      { cantidadActual: 10, precioUnitario: 100, activo: true },
      { cantidadActual: 999, precioUnitario: 999, activo: false },
    ];
    expect(calcularValorInventario(productos)).toBe(1000);
  });

  it('precio_unitario NULL se trata como 0, nunca revienta', () => {
    const productos: ProductoParaValoracion[] = [{ cantidadActual: 8000, precioUnitario: null, activo: true }];
    expect(calcularValorInventario(productos)).toBe(0);
  });

  it('cantidad_actual NULL se trata como 0', () => {
    const productos: ProductoParaValoracion[] = [{ cantidadActual: null, precioUnitario: 500, activo: true }];
    expect(calcularValorInventario(productos)).toBe(0);
  });

  it('lista vacía -> 0', () => {
    expect(calcularValorInventario([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// etiquetaEstadoPendienteExcepcion -- §8.4: "nombra el estado en el que está
// trabada cada excepción", nunca un conteo fundido (misma disciplina de
// CA-10 aplicada al mensaje del día 15).
// ---------------------------------------------------------------------------

describe('etiquetaEstadoPendienteExcepcion', () => {
  it('reportada -> esperando a David', () => {
    expect(etiquetaEstadoPendienteExcepcion('reportada')).toMatch(/David/);
  });

  it('explicacion_precargada -> esperando a David (confirmar la cita)', () => {
    expect(etiquetaEstadoPendienteExcepcion('explicacion_precargada')).toMatch(/David/);
  });

  it('ajuste_propuesto -> esperando la aprobación de Santiago', () => {
    expect(etiquetaEstadoPendienteExcepcion('ajuste_propuesto')).toMatch(/aprobación/);
  });

  it('ajuste_propuesto y explicacion_precargada dan etiquetas DISTINTAS (acciones de personas distintas)', () => {
    expect(etiquetaEstadoPendienteExcepcion('ajuste_propuesto')).not.toBe(etiquetaEstadoPendienteExcepcion('explicacion_precargada'));
  });

  it('un estado desconocido no revienta -- devuelve el estado tal cual', () => {
    expect(etiquetaEstadoPendienteExcepcion('estado_inventado')).toBe('estado_inventado');
  });
});

// ---------------------------------------------------------------------------
// construirMensajeRevisionDia15 (§8.4, R-11/CA-23/CA-24 + P-2) -- el mensaje
// del día 15 con sus DOS bloques, cada uno independiente del otro.
// ---------------------------------------------------------------------------

describe('construirMensajeRevisionDia15', () => {
  it('ningún bloque aplica -> null (un día 15 limpio no genera ruido)', () => {
    expect(construirMensajeRevisionDia15({ bloqueMesOmitido: null, excepcionesVencidas: [] })).toBeNull();
  });

  it('sólo el bloque de mes omitido -> lo incluye, sin mencionar excepciones', () => {
    const texto = construirMensajeRevisionDia15({
      bloqueMesOmitido: { mesActualNombre: 'septiembre 2026', ultimaRondaCerradaNombre: 'agosto 2026' },
      excepcionesVencidas: [],
    });
    expect(texto).toContain('septiembre 2026');
    expect(texto).toContain('agosto 2026');
    expect(texto).not.toContain('excepci');
  });

  it('sin ronda anterior cerrada -> "—", nunca vacío ni inventado', () => {
    const texto = construirMensajeRevisionDia15({
      bloqueMesOmitido: { mesActualNombre: 'septiembre 2026', ultimaRondaCerradaNombre: null },
      excepcionesVencidas: [],
    });
    expect(texto).toContain('—');
  });

  it('sólo el bloque de excepciones vencidas -- puede salir en un mes con la ronda hecha (P-2)', () => {
    const texto = construirMensajeRevisionDia15({
      bloqueMesOmitido: null,
      excepcionesVencidas: [{ productoNombre: 'Silicalmag', reportadaEn: '2026-08-01', estadoEtiqueta: 'esperando tu aprobación', dias: 45 }],
    });
    expect(texto).toContain('Silicalmag');
    expect(texto).toContain('esperando tu aprobación');
    expect(texto).not.toContain('no se ha cerrado');
  });

  it('los dos bloques aplican a la vez -> un solo mensaje con los dos (§8.1, literal)', () => {
    const texto = construirMensajeRevisionDia15({
      bloqueMesOmitido: { mesActualNombre: 'septiembre 2026', ultimaRondaCerradaNombre: 'julio 2026' },
      excepcionesVencidas: [{ productoNombre: 'Sulcamag', reportadaEn: '2026-07-01', estadoEtiqueta: 'esperando la explicación de David', dias: 60 }],
    });
    expect(texto).toContain('septiembre 2026');
    expect(texto).toContain('Sulcamag');
  });

  it('hasta 5 excepciones se listan; de ahí en más, "y N más"', () => {
    const excepciones = Array.from({ length: 7 }, (_, i) => ({
      productoNombre: `Producto ${i + 1}`,
      reportadaEn: '2026-08-01',
      estadoEtiqueta: 'esperando tu aprobación',
      dias: 40 + i,
    }));
    const texto = construirMensajeRevisionDia15({ bloqueMesOmitido: null, excepcionesVencidas: excepciones })!;
    expect(texto).toContain('Producto 1');
    expect(texto).toContain('Producto 5');
    expect(texto).not.toContain('Producto 6');
    expect(texto).toContain('y 2 más');
  });

  it('MAX_EXCEPCIONES_VENCIDAS_EN_MENSAJE es 5 (§8.4, literal)', () => {
    expect(MAX_EXCEPCIONES_VENCIDAS_EN_MENSAJE).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// construirMensajeRecordatorio (A-1) -- nombra el período, nunca un genérico.
// ---------------------------------------------------------------------------

describe('construirMensajeRecordatorio', () => {
  it('incluye el nombre del período', () => {
    expect(construirMensajeRecordatorio('septiembre 2026')).toContain('septiembre 2026');
  });
});
