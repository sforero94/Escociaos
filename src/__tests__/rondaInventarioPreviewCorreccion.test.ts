/**
 * Fase 3 -- Telegram, Uriel (docs/brief_tecnico_verificacion_inventario.md
 * §7.3, CA-35): "La corrección re-interpreta el TRANSCRITO ORIGINAL + el
 * historial de correcciones acumuladas (no edites el transcrito ni
 * reinterpretes sólo la corrección aislada)".
 *
 * `construirTextoConCorrecciones` es lo que el handler de Telegram le pasa a
 * `interpretarTranscrito` (etapa 2 del pipeline) en cada vuelta del bucle de
 * preview -- nunca reemplaza `rondas_transcritos.transcrito` (CA-36: la capa
 * cruda no se toca), y nunca manda SÓLO la corrección aislada (perdería el
 * contexto del resto de lo que Uriel narró).
 */

import { describe, it, expect } from 'vitest';
import { construirTextoConCorrecciones, type Correccion } from '@/utils/rondaInventario/preview';

const TRANSCRITO_ORIGINAL =
  'Hay un desface en Silicalmag donde deberían haber 100 kg y hay 90 kg, David dice que es por error en el sistema.';

describe('construirTextoConCorrecciones', () => {
  it('sin correcciones, devuelve el transcrito original tal cual', () => {
    expect(construirTextoConCorrecciones(TRANSCRITO_ORIGINAL, [])).toBe(TRANSCRITO_ORIGINAL);
  });

  it('con una corrección, el texto combinado contiene AMBOS -- el original y la corrección', () => {
    const correcciones: Correccion[] = [{ texto: 'no era Silicalmag, era Sulcamag', en: '2026-08-28T10:00:00.000Z' }];
    const combinado = construirTextoConCorrecciones(TRANSCRITO_ORIGINAL, correcciones);
    expect(combinado).toContain(TRANSCRITO_ORIGINAL);
    expect(combinado).toContain('no era Silicalmag, era Sulcamag');
  });

  it('con varias correcciones, conserva el ORDEN en que se hicieron', () => {
    const correcciones: Correccion[] = [
      { texto: 'primero: agrega 3 martillos', en: '2026-08-28T10:00:00.000Z' },
      { texto: 'segundo: en realidad son 5', en: '2026-08-28T10:05:00.000Z' },
    ];
    const combinado = construirTextoConCorrecciones(TRANSCRITO_ORIGINAL, correcciones);
    expect(combinado.indexOf('primero:')).toBeLessThan(combinado.indexOf('segundo:'));
  });

  it('nunca muta el arreglo de correcciones de entrada', () => {
    const correcciones: Correccion[] = [{ texto: 'x', en: '2026-08-28T10:00:00.000Z' }];
    const copia = [...correcciones];
    construirTextoConCorrecciones(TRANSCRITO_ORIGINAL, correcciones);
    expect(correcciones).toEqual(copia);
  });
});
