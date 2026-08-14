// Tests de la lógica pura de suscripción a alertas por usuario de Telegram.
// Precedente exacto: telegramUsuarios.ts / telegramUsuarios.test.ts.
//
// El catálogo (`alertas_catalogo`) vive en base de datos y hoy solo tiene
// filas del módulo `hato` — mañana tendrá `aguacate` y `ganado` sin que el
// código cambie. Estas pruebas cubren específicamente eso: agrupar y
// etiquetar módulos desconocidos sin lista hard-codeada de alertas.

import { describe, it, expect } from 'vitest';
import {
  agruparAlertasPorModulo,
  labelModulo,
  construirEstadoDesdeSuscripciones,
  alternarRecibe,
  alternarEscalamiento,
  construirFilasParaGuardar,
  contarSuscripcionesUsuario,
  formatearResumenAlertas,
  type AlertaCatalogoRow,
  type AlertaSuscripcionRow,
  type SuscripcionEstado,
} from '@/utils/telegramAlertas';

function alerta(overrides: Partial<AlertaCatalogoRow>): AlertaCatalogoRow {
  return {
    clave: 'hato.secado_due',
    modulo: 'hato',
    nombre: 'Secado próximo',
    descripcion: 'Una vaca debe entrar a secado en los próximos días',
    orden: 1,
    activo: true,
    ...overrides,
  };
}

function suscripcion(overrides: Partial<AlertaSuscripcionRow>): AlertaSuscripcionRow {
  return {
    telegram_usuario_id: 'u1',
    alerta_clave: 'hato.secado_due',
    recibe: true,
    escalamiento: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// labelModulo
// ---------------------------------------------------------------------------

describe('labelModulo', () => {
  it('etiqueta los módulos conocidos en español', () => {
    expect(labelModulo('hato')).toBe('Hato Lechero');
    expect(labelModulo('aguacate')).toBe('Aguacate');
    expect(labelModulo('ganado')).toBe('Ganado');
  });

  it('para un módulo desconocido, capitaliza la clave en vez de reventar', () => {
    expect(labelModulo('clima')).toBe('Clima');
    expect(labelModulo('finanzas')).toBe('Finanzas');
  });
});

// ---------------------------------------------------------------------------
// agruparAlertasPorModulo
// ---------------------------------------------------------------------------

describe('agruparAlertasPorModulo', () => {
  it('agrupa por módulo y ordena las alertas dentro de cada grupo por orden', () => {
    const catalogo = [
      alerta({ clave: 'hato.b', modulo: 'hato', orden: 2 }),
      alerta({ clave: 'hato.a', modulo: 'hato', orden: 1 }),
    ];
    const grupos = agruparAlertasPorModulo(catalogo);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].alertas.map((a) => a.clave)).toEqual(['hato.a', 'hato.b']);
  });

  it('crea un grupo nuevo automáticamente para un módulo nunca visto (aguacate/ganado de mañana)', () => {
    const catalogo = [
      alerta({ clave: 'hato.a', modulo: 'hato', orden: 1 }),
      alerta({ clave: 'aguacate.x', modulo: 'aguacate', orden: 1, nombre: 'Racimo listo' }),
      alerta({ clave: 'ganado.y', modulo: 'ganado', orden: 1, nombre: 'Peso bajo' }),
    ];
    const grupos = agruparAlertasPorModulo(catalogo);
    const modulos = grupos.map((g) => g.modulo).sort();
    expect(modulos).toEqual(['aguacate', 'ganado', 'hato']);
    const aguacate = grupos.find((g) => g.modulo === 'aguacate');
    expect(aguacate?.label).toBe('Aguacate');
    expect(aguacate?.alertas).toHaveLength(1);
  });

  it('excluye alertas inactivas', () => {
    const catalogo = [
      alerta({ clave: 'hato.activa', activo: true }),
      alerta({ clave: 'hato.inactiva', activo: false }),
    ];
    const grupos = agruparAlertasPorModulo(catalogo);
    const claves = grupos.flatMap((g) => g.alertas.map((a) => a.clave));
    expect(claves).toEqual(['hato.activa']);
  });

  it('devuelve una lista vacía cuando el catálogo está vacío', () => {
    expect(agruparAlertasPorModulo([])).toEqual([]);
  });

  it('ordena los grupos por el orden mínimo de sus alertas', () => {
    const catalogo = [
      alerta({ clave: 'ganado.y', modulo: 'ganado', orden: 5 }),
      alerta({ clave: 'hato.a', modulo: 'hato', orden: 1 }),
      alerta({ clave: 'aguacate.x', modulo: 'aguacate', orden: 3 }),
    ];
    const grupos = agruparAlertasPorModulo(catalogo);
    expect(grupos.map((g) => g.modulo)).toEqual(['hato', 'aguacate', 'ganado']);
  });
});

// ---------------------------------------------------------------------------
// construirEstadoDesdeSuscripciones
// ---------------------------------------------------------------------------

describe('construirEstadoDesdeSuscripciones', () => {
  it('construye un mapa clave -> {recibe, escalamiento}', () => {
    const subs = [
      suscripcion({ alerta_clave: 'hato.a', recibe: true, escalamiento: false }),
      suscripcion({ alerta_clave: 'hato.b', recibe: false, escalamiento: true }),
    ];
    const estado = construirEstadoDesdeSuscripciones(subs);
    expect(estado).toEqual({
      'hato.a': { recibe: true, escalamiento: false },
      'hato.b': { recibe: false, escalamiento: true },
    });
  });

  it('devuelve un objeto vacío para una lista vacía', () => {
    expect(construirEstadoDesdeSuscripciones([])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// alternarRecibe / alternarEscalamiento
// ---------------------------------------------------------------------------

describe('alternarRecibe', () => {
  it('activa "recibe" para una clave sin estado previo', () => {
    const resultado = alternarRecibe({}, 'hato.a');
    expect(resultado).toEqual({ 'hato.a': { recibe: true, escalamiento: false } });
  });

  it('desactiva "recibe" si ya estaba activo, sin tocar escalamiento', () => {
    const estado: SuscripcionEstado = { 'hato.a': { recibe: true, escalamiento: true } };
    const resultado = alternarRecibe(estado, 'hato.a');
    expect(resultado['hato.a']).toEqual({ recibe: false, escalamiento: true });
  });

  it('no muta el estado original (inmutable)', () => {
    const estado: SuscripcionEstado = { 'hato.a': { recibe: false, escalamiento: false } };
    const resultado = alternarRecibe(estado, 'hato.a');
    expect(resultado).not.toBe(estado);
    expect(estado['hato.a'].recibe).toBe(false);
  });

  it('no afecta el estado de otras claves', () => {
    const estado: SuscripcionEstado = { 'hato.a': { recibe: true, escalamiento: false } };
    const resultado = alternarRecibe(estado, 'hato.b');
    expect(resultado['hato.a']).toEqual({ recibe: true, escalamiento: false });
    expect(resultado['hato.b']).toEqual({ recibe: true, escalamiento: false });
  });
});

describe('alternarEscalamiento', () => {
  it('activa "escalamiento" sin requerir que "recibe" esté activo (estado legal)', () => {
    const resultado = alternarEscalamiento({}, 'hato.a');
    expect(resultado).toEqual({ 'hato.a': { recibe: false, escalamiento: true } });
  });

  it('desactiva "escalamiento" si ya estaba activo, sin tocar recibe', () => {
    const estado: SuscripcionEstado = { 'hato.a': { recibe: true, escalamiento: true } };
    const resultado = alternarEscalamiento(estado, 'hato.a');
    expect(resultado['hato.a']).toEqual({ recibe: true, escalamiento: false });
  });

  it('no muta el estado original (inmutable)', () => {
    const estado: SuscripcionEstado = { 'hato.a': { recibe: false, escalamiento: false } };
    const resultado = alternarEscalamiento(estado, 'hato.a');
    expect(resultado).not.toBe(estado);
    expect(estado['hato.a'].escalamiento).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// construirFilasParaGuardar
// ---------------------------------------------------------------------------

describe('construirFilasParaGuardar', () => {
  it('construye una fila por cada alerta del catálogo, con el estado actual', () => {
    const catalogo = [
      alerta({ clave: 'hato.a', orden: 1 }),
      alerta({ clave: 'hato.b', orden: 2 }),
    ];
    const estado: SuscripcionEstado = {
      'hato.a': { recibe: true, escalamiento: false },
    };
    const filas = construirFilasParaGuardar('u1', estado, catalogo);
    expect(filas).toEqual([
      { telegram_usuario_id: 'u1', alerta_clave: 'hato.a', recibe: true, escalamiento: false },
      { telegram_usuario_id: 'u1', alerta_clave: 'hato.b', recibe: false, escalamiento: false },
    ]);
  });

  it('una clave sin estado nunca tocada se guarda como false/false, no se omite', () => {
    const catalogo = [alerta({ clave: 'hato.a' })];
    const filas = construirFilasParaGuardar('u1', {}, catalogo);
    expect(filas).toEqual([
      { telegram_usuario_id: 'u1', alerta_clave: 'hato.a', recibe: false, escalamiento: false },
    ]);
  });

  it('ignora claves del estado que ya no están en el catálogo', () => {
    const catalogo = [alerta({ clave: 'hato.a' })];
    const estado: SuscripcionEstado = {
      'hato.a': { recibe: true, escalamiento: false },
      'hato.ya_no_existe': { recibe: true, escalamiento: true },
    };
    const filas = construirFilasParaGuardar('u1', estado, catalogo);
    expect(filas).toHaveLength(1);
    expect(filas[0].alerta_clave).toBe('hato.a');
  });

  it('devuelve un arreglo vacío cuando el catálogo está vacío', () => {
    expect(construirFilasParaGuardar('u1', {}, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// contarSuscripcionesUsuario
// ---------------------------------------------------------------------------

describe('contarSuscripcionesUsuario', () => {
  it('cuenta solo las filas del usuario indicado, solo las activas', () => {
    const todas = [
      suscripcion({ telegram_usuario_id: 'u1', alerta_clave: 'hato.a', recibe: true, escalamiento: false }),
      suscripcion({ telegram_usuario_id: 'u1', alerta_clave: 'hato.b', recibe: false, escalamiento: true }),
      suscripcion({ telegram_usuario_id: 'u1', alerta_clave: 'hato.c', recibe: false, escalamiento: false }),
      suscripcion({ telegram_usuario_id: 'u2', alerta_clave: 'hato.a', recibe: true, escalamiento: true }),
    ];
    expect(contarSuscripcionesUsuario(todas, 'u1')).toEqual({ recibe: 1, escalamiento: 1 });
    expect(contarSuscripcionesUsuario(todas, 'u2')).toEqual({ recibe: 1, escalamiento: 1 });
  });

  it('devuelve ceros cuando el usuario no tiene ninguna fila', () => {
    expect(contarSuscripcionesUsuario([], 'u1')).toEqual({ recibe: 0, escalamiento: 0 });
  });
});

// ---------------------------------------------------------------------------
// formatearResumenAlertas
// ---------------------------------------------------------------------------

describe('formatearResumenAlertas', () => {
  it('sin ninguna suscripción activa', () => {
    expect(formatearResumenAlertas({ recibe: 0, escalamiento: 0 })).toBe('Sin alertas');
  });

  it('singular vs. plural', () => {
    expect(formatearResumenAlertas({ recibe: 1, escalamiento: 0 })).toBe('1 alerta');
    expect(formatearResumenAlertas({ recibe: 3, escalamiento: 0 })).toBe('3 alertas');
  });

  it('agrega el conteo de escalamiento cuando hay alguno', () => {
    expect(formatearResumenAlertas({ recibe: 3, escalamiento: 1 })).toBe('3 alertas (1 esc.)');
  });

  it('caso raro pero legal: escalamiento sin recibir ninguna alerta', () => {
    expect(formatearResumenAlertas({ recibe: 0, escalamiento: 2 })).toBe('Sin alertas (2 esc.)');
  });
});
