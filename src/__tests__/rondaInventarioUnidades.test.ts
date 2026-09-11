// ARCHIVO: src/__tests__/rondaInventarioUnidades.test.ts
// DESCRIPCIÓN: Regresión de ESCO-61 -- el preview de Uriel y el reporte de
// cierre imprimían cantidades PELADAS, sin unidad de medida, aun teniendo la
// unidad a mano.
//
// EL CASO REAL, `rondas_reportes.texto_telegram` de la primera ronda cerrada
// (emitido 2026-08-30 12:00:02Z), que se contradice a sí mismo:
//
//   Resueltas con captura (1):
//   - 15-15-15: hay 3, deberían haber 0
//   ...
//   Movimientos de inventario ocurridos con la ronda abierta (1):
//   - 15-15-15: Entrada de 150 (captura de excepción) -- Santiago Forero
//
// Mismo producto, misma ronda, mismo informe: 3 contra 150. El `3` se
// registró en BULTOS y el `150` en kilos (`productos.unidad_medida` del
// 15-15-15 es 'Kilos', `presentacion_kg_l` 50,00 -- el transcrito decía
// "tres bultos de 15-15-15 de 50 kilos"). Con la unidad impresa, las dos
// cifras dejan de parecer la misma magnitud y la contradicción se vuelve
// legible en el propio informe.
//
// La unidad SIEMPRE estuvo disponible: `FilaPreview.unidad` la puebla
// `resolverHallazgos.ts` desde el alcance congelado, y el tick lee
// `rondas_inventario_alcance.unidad` / `productos.unidad_medida`. Sólo no se
// imprimía.
//
// Este fichero prueba el TEXTO, que es lo único que el humano lee.

import { describe, it, expect } from 'vitest';
import { construirPreview, renderPreviewTelegram, type FilaPreview } from '@/utils/rondaInventario/preview';
import {
  construirReporteCierre,
  renderReporteCierreTelegram,
  type InputReporteCierre,
} from '@/utils/rondaInventario/reporteCierre';

// ---------------------------------------------------------------------------
// 1. Preview de Uriel (§5.6/CA-30)
// ---------------------------------------------------------------------------

const FILA_BASE: FilaPreview = {
  productoMencionado: '15-15-15',
  productoIdentificado: true,
  productoId: 'prod-15-15-15',
  nombreProducto: '15-15-15',
  unidad: 'Kilos',
  fisico: 3,
  fisicoOrigen: 'dictado',
  teorico: 0,
  causaClave: null,
  causaEtiqueta: null,
  via: 'captura_david',
  explicacionCitada: null,
  fragmentoLiteral: 'tres bultos de 15-15-15 de 50 kilos',
  fueraDeAlcance: false,
};

describe('preview -- la cantidad nunca se imprime sin unidad (ESCO-61)', () => {
  it('físico y teórico llevan los dos la unidad del alcance congelado', () => {
    const texto = renderPreviewTelegram(construirPreview([FILA_BASE]));

    expect(texto).toContain('hay 3 Kilos, deberían haber 0 Kilos');
    // La redacción sin unidad es exactamente la que produjo el informe
    // contradictorio -- no debe poder volver.
    expect(texto).not.toContain('hay 3, deberían haber 0');
  });

  it('un físico DERIVADO lleva la unidad antes de la marca "(derivado)"', () => {
    const texto = renderPreviewTelegram(
      construirPreview([{ ...FILA_BASE, fisico: 5, fisicoOrigen: 'derivado', teorico: 8 }]),
    );

    expect(texto).toContain('hay 5 Kilos (derivado), deberían haber 8 Kilos');
  });

  it('sin unidad conocida (`null`) no inventa ninguna -- imprime la cifra pelada', () => {
    const texto = renderPreviewTelegram(construirPreview([{ ...FILA_BASE, unidad: null }]));

    expect(texto).toContain('hay 3, deberían haber 0');
  });
});

// ---------------------------------------------------------------------------
// 2. Reporte de cierre (§8.3/CA-19) -- el informe que se contradecía
// ---------------------------------------------------------------------------

const INPUT_CASO_REAL: InputReporteCierre = {
  cabecera: {
    periodo: '2026-08-01',
    cerradaEn: '2026-08-29',
    cerradoPorNombre: 'Santiago Forero',
    alcanceDeclarado: 'completo',
    alcanceNota: null,
    esLineaBase: true,
  },
  valoracion: { incluyeValoracion: false, valorTotalActual: null, valorTotalMesAnterior: null },
  excepciones: [
    {
      productoNombre: '15-15-15',
      estado: 'resuelta_con_captura',
      fisico: 3,
      teorico: 0,
      unidad: 'Kilos',
      causaEtiqueta: null,
      via: 'captura_david',
    },
  ],
  movimientosRondaAbierta: [
    {
      productoNombre: '15-15-15',
      tipoMovimiento: 'Entrada',
      cantidad: 150,
      unidad: 'Kilos',
      origen: 'captura_excepcion',
      responsable: 'Santiago Forero',
    },
  ],
  observacionesLibres: [],
  hallazgosNarradosSinConfirmar: 1,
};

describe('reporte de cierre -- excepciones y movimientos llevan unidad (ESCO-61)', () => {
  it('la línea de la excepción imprime la unidad en las dos cifras', () => {
    const texto = renderReporteCierreTelegram(construirReporteCierre(INPUT_CASO_REAL));

    expect(texto).toContain('- 15-15-15: hay 3 Kilos, deberían haber 0 Kilos');
    expect(texto).not.toContain('hay 3, deberían haber 0');
  });

  it('la línea del movimiento imprime la unidad de la cantidad', () => {
    const texto = renderReporteCierreTelegram(construirReporteCierre(INPUT_CASO_REAL));

    expect(texto).toContain('- 15-15-15: Entrada de 150 Kilos (captura de excepción) -- Santiago Forero');
    expect(texto).not.toContain('Entrada de 150 (');
  });

  it('las dos cifras del caso real quedan contrastables en el MISMO informe', () => {
    const texto = renderReporteCierreTelegram(construirReporteCierre(INPUT_CASO_REAL));

    // Lo que hacía ilegible la contradicción era que «3» y «150» se leían
    // como la misma magnitud. Con la unidad, las dos líneas del mismo
    // producto se pueden comparar.
    expect(texto).toContain('3 Kilos');
    expect(texto).toContain('150 Kilos');
  });

  it('sin unidad conocida (`null`) ninguna de las dos líneas inventa una', () => {
    const sinUnidad: InputReporteCierre = {
      ...INPUT_CASO_REAL,
      excepciones: [{ ...INPUT_CASO_REAL.excepciones[0], unidad: null }],
      movimientosRondaAbierta: [{ ...INPUT_CASO_REAL.movimientosRondaAbierta[0], unidad: null }],
    };
    const texto = renderReporteCierreTelegram(construirReporteCierre(sinUnidad));

    expect(texto).toContain('- 15-15-15: hay 3, deberían haber 0');
    expect(texto).toContain('- 15-15-15: Entrada de 150 (captura de excepción) -- Santiago Forero');
  });

  it('una excepción sin cifra completa sigue diciendo «sin cifra completa», con o sin unidad', () => {
    const incompleta: InputReporteCierre = {
      ...INPUT_CASO_REAL,
      excepciones: [{ ...INPUT_CASO_REAL.excepciones[0], fisico: null, teorico: null }],
    };
    const texto = renderReporteCierreTelegram(construirReporteCierre(incompleta));

    expect(texto).toContain('- 15-15-15: sin cifra completa');
    expect(texto).not.toContain('sin cifra completa Kilos');
  });
});
