/**
 * Fase 4 -- Telegram, David y Santiago (docs/brief_tecnico_verificacion_inventario.md
 * §7.2/§13). Cobertura de `src/utils/rondaInventario/resolucion.ts` (mensajes
 * puros de /explicar, /proponer y /aprobar) y de los helpers de índice de
 * causa agregados a `causasRaiz.ts` para poder codificar la causa elegida en
 * un `callback_data` de Telegram sin superar el límite de 64 bytes.
 */

import { describe, it, expect } from 'vitest';
import { CAUSAS_RAIZ, causaPorIndice, indiceDeCausa } from '@/utils/rondaInventario/causasRaiz';
import {
  calcularDelta,
  etiquetaDecision,
  renderCasoDavid,
  renderCasoProponer,
  renderCasoProponerInicio,
  renderCasoSantiago,
  renderCitaDavid,
  renderConfirmacionDecision,
  renderConfirmacionPropuesta,
  renderLineaPendienteDavid,
  renderLineaProponer,
  renderLineaSantiago,
  type CasoExcepcion,
  type CasoProponer,
  type CasoSantiago,
} from '@/utils/rondaInventario/resolucion';

const CASO_SILICALMAG: CasoExcepcion = {
  productoNombre: 'Silicalmag',
  unidad: 'Kilos',
  fisico: 90,
  teorico: 100,
  observacionUriel: null,
};

// ---------------------------------------------------------------------------
// causaPorIndice / indiceDeCausa -- round-trip contra las 7 causas reales
// ---------------------------------------------------------------------------

describe('causaPorIndice / indiceDeCausa', () => {
  it('el índice de cada causa hace round-trip contra su propia clave', () => {
    for (const causa of CAUSAS_RAIZ) {
      const indice = indiceDeCausa(causa.clave);
      expect(indice).toBe(causa.orden);
      expect(causaPorIndice(indice!)).toEqual(causa);
    }
  });

  it('indiceDeCausa devuelve undefined para una clave desconocida', () => {
    expect(indiceDeCausa('no_existe')).toBeUndefined();
  });

  it('causaPorIndice devuelve undefined para un índice fuera de rango (callback_data corrupto/reenviado)', () => {
    expect(causaPorIndice(0)).toBeUndefined();
    expect(causaPorIndice(8)).toBeUndefined();
    expect(causaPorIndice(-1)).toBeUndefined();
  });

  it('los índices son 1..7 sin huecos ni repeticiones (7 causas, R-7)', () => {
    const indices = CAUSAS_RAIZ.map((c) => c.orden).sort((a, b) => a - b);
    expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// ---------------------------------------------------------------------------
// calcularDelta -- MISMA fórmula que R-4 / fn_ronda_proponer_ajuste /
// fn_ronda_aplicar_ajuste (migración 126): fisico - teorico
// ---------------------------------------------------------------------------

describe('calcularDelta', () => {
  it('físico menor que teórico -> delta negativo (faltan)', () => {
    expect(calcularDelta(90, 100)).toBe(-10);
  });

  it('físico mayor que teórico -> delta positivo (sobran)', () => {
    expect(calcularDelta(12, 8)).toBe(4);
  });

  it('físico igual a teórico -> delta cero', () => {
    expect(calcularDelta(50, 50)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// David -- /explicar (lista + caso completo + cita)
// ---------------------------------------------------------------------------

describe('renderLineaPendienteDavid', () => {
  it('muestra el producto y "faltan N" cuando el físico es menor', () => {
    expect(renderLineaPendienteDavid(CASO_SILICALMAG)).toBe('Silicalmag — faltan 10');
  });

  it('muestra "sobran N" cuando el físico es mayor', () => {
    const caso: CasoExcepcion = { ...CASO_SILICALMAG, fisico: 110 };
    expect(renderLineaPendienteDavid(caso)).toBe('Silicalmag — sobran 10');
  });

  it('muestra "coincide" cuando no hay diferencia', () => {
    const caso: CasoExcepcion = { ...CASO_SILICALMAG, fisico: 100 };
    expect(renderLineaPendienteDavid(caso)).toBe('Silicalmag — coincide');
  });
});

describe('renderCasoDavid', () => {
  it('incluye producto, teórico, físico y diferencia con unidad', () => {
    const texto = renderCasoDavid(CASO_SILICALMAG);
    expect(texto).toContain('Silicalmag');
    expect(texto).toContain('Teórico: 100 Kilos');
    expect(texto).toContain('Físico reportado: 90 Kilos');
    expect(texto).toContain('Diferencia: -10 Kilos (faltan 10)');
  });

  it('agrega la observación de Uriel cuando existe', () => {
    const caso: CasoExcepcion = { ...CASO_SILICALMAG, observacionUriel: 'lo vi mal guardado' };
    expect(renderCasoDavid(caso)).toContain('Observación de Uriel: lo vi mal guardado');
  });

  it('NO agrega línea de observación cuando es null', () => {
    expect(renderCasoDavid(CASO_SILICALMAG)).not.toContain('Observación de Uriel');
  });

  it('nunca menciona precio, valor ni $ (R-15/CA-13)', () => {
    const caso: CasoExcepcion = { ...CASO_SILICALMAG, observacionUriel: 'algo' };
    const texto = renderCasoDavid(caso);
    expect(texto).not.toMatch(/\$|precio|valor/i);
  });
});

describe('renderCitaDavid', () => {
  it('cita el texto literal y pregunta confirmar/corregir', () => {
    const texto = renderCitaDavid('es por error en el sistema');
    expect(texto).toContain('"es por error en el sistema"');
    expect(texto).toMatch(/confirm/i);
    expect(texto).toMatch(/corriges|corregir/i);
  });
});

// ---------------------------------------------------------------------------
// Proponer (B-5)
// ---------------------------------------------------------------------------

const CASO_PROPONER: CasoProponer = {
  ...CASO_SILICALMAG,
  explicacionDavid: 'no se capturó la salida a la aplicación del jueves',
  causaSugeridaEtiqueta: null,
};

describe('renderLineaProponer', () => {
  it('mismo formato corto que la línea de David', () => {
    expect(renderLineaProponer(CASO_PROPONER)).toBe('Silicalmag — faltan 10');
  });
});

describe('renderCasoProponer', () => {
  it('incluye la explicación de David y pregunta la causa', () => {
    const texto = renderCasoProponer(CASO_PROPONER);
    expect(texto).toContain('Explicación de David: no se capturó la salida a la aplicación del jueves');
    expect(texto).toContain('¿Cuál es la causa raíz?');
  });

  it('muestra la causa sugerida como pista NO vinculante cuando existe (D-T8/CA-34)', () => {
    const caso: CasoProponer = { ...CASO_PROPONER, causaSugeridaEtiqueta: 'Error de captura previa' };
    const texto = renderCasoProponer(caso);
    expect(texto).toContain('El sistema sugiere: Error de captura previa');
    expect(texto).toMatch(/no vinculante/i);
  });

  it('no menciona ninguna sugerencia cuando el intérprete no propuso causa', () => {
    expect(renderCasoProponer(CASO_PROPONER)).not.toMatch(/sugiere/i);
  });
});

describe('renderCasoProponerInicio (migración 132)', () => {
  it('incluye la explicación de David pero NUNCA pregunta la causa -- ese paso viene después de reconfirmar la cantidad', () => {
    const texto = renderCasoProponerInicio(CASO_PROPONER);
    expect(texto).toContain('Explicación de David: no se capturó la salida a la aplicación del jueves');
    expect(texto).not.toContain('¿Cuál es la causa raíz?');
  });

  it('invita a tocar el botón para reportar la cantidad', () => {
    expect(renderCasoProponerInicio(CASO_PROPONER)).toContain('Toca el botón para reportar la cantidad física real');
  });

  it('muestra la causa sugerida como pista NO vinculante cuando existe (D-T8/CA-34)', () => {
    const caso: CasoProponer = { ...CASO_PROPONER, causaSugeridaEtiqueta: 'Error de captura previa' };
    const texto = renderCasoProponerInicio(caso);
    expect(texto).toContain('El sistema sugiere: Error de captura previa');
    expect(texto).toMatch(/no vinculante/i);
  });
});

// ---------------------------------------------------------------------------
// Santiago -- /aprobar (B-6/B-7)
// ---------------------------------------------------------------------------

const CASO_SANTIAGO: CasoSantiago = {
  ...CASO_SILICALMAG,
  explicacionDavid: 'no se capturó la salida a la aplicación del jueves',
  propuestaCausaEtiqueta: 'Movimiento no capturado',
  propuestaNota: null,
  propuestoPor: 'David',
};

describe('renderLineaSantiago', () => {
  it('incluye producto, diferencia, causa propuesta y quién la propuso', () => {
    const texto = renderLineaSantiago(CASO_SANTIAGO);
    expect(texto).toBe('Silicalmag — faltan 10 — causa propuesta: Movimiento no capturado (David)');
  });
});

describe('renderCasoSantiago', () => {
  it('incluye el caso completo, la explicación de David y la causa propuesta', () => {
    const texto = renderCasoSantiago(CASO_SANTIAGO);
    expect(texto).toContain('Silicalmag');
    expect(texto).toContain('Explicación de David: no se capturó la salida a la aplicación del jueves');
    expect(texto).toContain('Causa propuesta por David: Movimiento no capturado');
  });

  it('agrega la nota de la propuesta cuando existe (causa "otro")', () => {
    const caso: CasoSantiago = { ...CASO_SANTIAGO, propuestaCausaEtiqueta: 'Otro (con nota)', propuestaNota: 'se rompió el empaque' };
    expect(renderCasoSantiago(caso)).toContain('Nota: se rompió el empaque');
  });

  it('no agrega línea de nota cuando es null', () => {
    expect(renderCasoSantiago(CASO_SANTIAGO)).not.toContain('Nota:');
  });

  it('nunca menciona precio, valor ni $ (R-15/CA-13 -- CA-6 pide el valor pero está gateado a §11/Fase 5, ver cabecera del archivo)', () => {
    const texto = renderCasoSantiago(CASO_SANTIAGO);
    expect(texto).not.toMatch(/\$|precio|valor de la diferencia/i);
  });
});

describe('etiquetaDecision', () => {
  it('"aprobado" -> "Aprobar"', () => {
    expect(etiquetaDecision('aprobado')).toBe('Aprobar');
  });

  it('"desestimado" -> "Desestimar"', () => {
    expect(etiquetaDecision('desestimado')).toBe('Desestimar');
  });
});

describe('renderConfirmacionDecision', () => {
  it('arma la pregunta de confirmación con el verbo correcto para aprobar', () => {
    expect(renderConfirmacionDecision('Silicalmag', 'aprobado', 'Movimiento no capturado')).toBe(
      'Vas a aprobar el ajuste de "Silicalmag" con causa "Movimiento no capturado". ¿Confirmas?',
    );
  });

  it('arma la pregunta de confirmación con el verbo correcto para desestimar', () => {
    expect(renderConfirmacionDecision('Silicalmag', 'desestimado', 'Error de conteo')).toBe(
      'Vas a desestimar el ajuste de "Silicalmag" con causa "Error de conteo". ¿Confirmas?',
    );
  });
});

describe('renderConfirmacionPropuesta (migración 132: incluye la cantidad reconfirmada)', () => {
  it('arma la pregunta de confirmación de la propuesta con la cantidad confirmada', () => {
    expect(renderConfirmacionPropuesta('Silicalmag', 'Movimiento no capturado', 90, 'Kilos')).toBe(
      'Vas a proponer el ajuste de "Silicalmag" (cantidad física confirmada: 90 Kilos) con causa "Movimiento no capturado". ¿Confirmas?',
    );
  });
});
