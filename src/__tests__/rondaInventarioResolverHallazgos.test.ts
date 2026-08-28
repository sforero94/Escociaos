/**
 * Fase 3 -- Telegram, Uriel (docs/brief_tecnico_verificacion_inventario.md
 * §13). El handler de voz de Telegram necesita, para CADA hallazgo del
 * intérprete, combinar `resolverProducto` + `derivarFisico` + `derivarVia`
 * (granulares en `interpretarNota.ts`, Fase 1) en UNA fila de preview
 * (`FilaPreview`, para lo que Uriel ve) Y en el fragmento de payload que
 * `fn_ronda_confirmar_hallazgos` espera (para cuando Uriel toca Confirmar).
 *
 * La Fase 1 dejó esta composición como un helper DE TEST, explícitamente NO
 * producto (`rondaInventarioInterpretacion.test.ts`, `resolverFilaPreview`):
 * en ese momento no había ningún llamador real. La Fase 3 sí lo tiene -- el
 * handler de Telegram necesita esta MISMA composición dos veces (al recibir
 * la nota de voz y al reinterpretar una corrección) -- así que gradúa a
 * código de producto acá, con su propia cobertura, en vez de quedar inline
 * en un archivo Deno sin test (que es justamente lo que el brief del
 * orquestador prohíbe).
 *
 * Usa el MISMO fixture #1 (§11.1 del brief de producto, literal) que
 * `rondaInventarioInterpretacion.test.ts`, para que las dos suites nunca
 * puedan divergir sobre qué produce ese ejemplo.
 */

import { describe, it, expect } from 'vitest';
import type { HallazgoCrudo } from '@/utils/rondaInventario/interpretarNota';
import { previewConfirmable, construirPreview } from '@/utils/rondaInventario/preview';
import {
  resolverHallazgo,
  resolverHallazgos,
  type AlcanceItem,
} from '@/utils/rondaInventario/resolverHallazgos';

const ALCANCE_FIXTURE_1: AlcanceItem[] = [
  { productoId: 'prod-silicalmag', nombre: 'Silicalmag', cantidadTeorica: 100, unidad: 'Kilos' },
  { productoId: 'prod-martillos', nombre: 'Martillos', cantidadTeorica: 8, unidad: 'Unidades' },
];

const HALLAZGO_SILICALMAG: HallazgoCrudo = {
  productoMencionado: 'Silicalmag',
  productoConfianza: 'alta',
  fragmentoLiteral: 'deberían haber 100 kg y hay 90 kg',
  cantidadFisicaPresente: true,
  cantidadFisica: 90,
  cantidadFaltantePresente: false,
  cantidadFaltante: 0,
  causaClave: 'error_captura_previa',
  causaConfianza: 'alta',
  explicacionDavidCitada: 'es por error en el sistema',
};

const HALLAZGO_MARTILLOS: HallazgoCrudo = {
  productoMencionado: 'martillos',
  productoConfianza: 'alta',
  fragmentoLiteral: 'hacen falta 3 martillos que no aparecen',
  cantidadFisicaPresente: false,
  cantidadFisica: 0,
  cantidadFaltantePresente: true,
  cantidadFaltante: 3,
  causaClave: '',
  causaConfianza: 'ninguna',
  explicacionDavidCitada: '',
};

describe('resolverHallazgo -- fixture #1 (§11.1, literal)', () => {
  it('Silicalmag: fila igual a la del helper de Fase 1, y paraConfirmar listo para el RPC', () => {
    const { fila, paraConfirmar } = resolverHallazgo(HALLAZGO_SILICALMAG, ALCANCE_FIXTURE_1);

    expect(fila.productoIdentificado).toBe(true);
    expect(fila.productoId).toBe('prod-silicalmag');
    expect(fila.nombreProducto).toBe('Silicalmag');
    expect(fila.unidad).toBe('Kilos');
    expect(fila.fisico).toBe(90);
    expect(fila.fisicoOrigen).toBe('dictado');
    expect(fila.teorico).toBe(100);
    expect(fila.via).toBe('captura_david');
    expect(fila.explicacionCitada).toBe('es por error en el sistema');

    expect(paraConfirmar).toEqual({
      productoId: 'prod-silicalmag',
      cantidadFisica: 90,
      fisicoOrigen: 'dictado',
      observacionUriel: 'deberían haber 100 kg y hay 90 kg',
      explicacionCitada: 'es por error en el sistema',
      causaClave: 'error_captura_previa',
      causaConfianza: 'alta',
    });
  });

  it('Martillos: físico DERIVADO (5 = 8-3), vía Gerencia, paraConfirmar con causaClave null', () => {
    const { fila, paraConfirmar } = resolverHallazgo(HALLAZGO_MARTILLOS, ALCANCE_FIXTURE_1);

    expect(fila.fisico).toBe(5);
    expect(fila.fisicoOrigen).toBe('derivado');
    expect(fila.teorico).toBe(8);
    expect(fila.via).toBe('aprobacion_gerencia');

    expect(paraConfirmar).toEqual({
      productoId: 'prod-martillos',
      cantidadFisica: 5,
      fisicoOrigen: 'derivado',
      observacionUriel: 'hacen falta 3 martillos que no aparecen',
      explicacionCitada: null,
      causaClave: null,
      causaConfianza: 'ninguna',
    });
  });

  it('el preview conjunto de los dos hallazgos es confirmable (A-9)', () => {
    const resueltos = resolverHallazgos([HALLAZGO_SILICALMAG, HALLAZGO_MARTILLOS], ALCANCE_FIXTURE_1);
    const preview = construirPreview(resueltos.map((r) => r.fila));
    expect(previewConfirmable(preview)).toBe(true);
    expect(resueltos.every((r) => r.paraConfirmar !== null)).toBe(true);
  });
});

describe('resolverHallazgo -- producto no identificado (R-20/CA-32)', () => {
  it('"Silicio" no resuelve -- paraConfirmar es null, nunca se puede confirmar así', () => {
    const hallazgo: HallazgoCrudo = { ...HALLAZGO_SILICALMAG, productoMencionado: 'Silicio' };
    const { fila, paraConfirmar } = resolverHallazgo(hallazgo, ALCANCE_FIXTURE_1);

    expect(fila.productoIdentificado).toBe(false);
    expect(fila.productoId).toBeNull();
    expect(fila.teorico).toBeNull();
    expect(paraConfirmar).toBeNull();
  });
});

describe('resolverHallazgo -- hallazgo incompleto (sin físico ni faltante)', () => {
  it('producto identificado pero sin cifra -- paraConfirmar null, no se puede confirmar (A-9)', () => {
    const hallazgo: HallazgoCrudo = {
      productoMencionado: 'Silicalmag',
      productoConfianza: 'alta',
      fragmentoLiteral: 'no sé cuánto hay',
      cantidadFisicaPresente: false,
      cantidadFisica: 0,
      cantidadFaltantePresente: false,
      cantidadFaltante: 0,
      causaClave: '',
      causaConfianza: 'ninguna',
      explicacionDavidCitada: '',
    };
    const { fila, paraConfirmar } = resolverHallazgo(hallazgo, ALCANCE_FIXTURE_1);

    expect(fila.productoIdentificado).toBe(true);
    expect(fila.fisico).toBeNull();
    expect(paraConfirmar).toBeNull();
  });
});

describe('resolverHallazgos -- mapea en orden, uno a uno', () => {
  it('conserva el orden de entrada', () => {
    const resueltos = resolverHallazgos([HALLAZGO_MARTILLOS, HALLAZGO_SILICALMAG], ALCANCE_FIXTURE_1);
    expect(resueltos.map((r) => r.fila.nombreProducto)).toEqual(['Martillos', 'Silicalmag']);
  });

  it('arreglo vacío -> arreglo vacío', () => {
    expect(resolverHallazgos([], ALCANCE_FIXTURE_1)).toEqual([]);
  });
});
