/**
 * Test de paridad frontend ⇄ edge function del pipeline de voz de la ronda
 * de inventario (Fase 1 de docs/brief_tecnico_verificacion_inventario.md §5.6).
 *
 * `src/supabase/functions/server/rondaInventario/` y
 * `supabase/functions/make-server-1ccce916/rondaInventario/` son copias
 * GENERADAS (nunca a mano) de `src/utils/rondaInventario/` por
 * `docs/inventario/regenerar-copias-ronda-inventario.py` -- necesarias
 * porque el pipeline de voz corre en el árbol de despliegue de la edge
 * function y no puede importar desde `src/utils/` (misma restricción que ya
 * produjo `calculos-hato.ts`/`priorizacion-scouting.ts`/`importHato/*`).
 *
 * Igual que `importHatoParidadServidor.test.ts`: los módulos SÍ importan
 * entre sí, así que la paridad estructural no puede ser "byte a byte" -- es
 * "el generador, corrido AHORA MISMO, produce exactamente lo que hay en el
 * árbol". Eso es lo que valida la primera sección corriendo el script en
 * modo `--check`. La segunda sección prueba, además, que las dos
 * implementaciones (frontend y la copia del servidor) se comportan IGUAL
 * sobre los mismos datos.
 *
 * Si este test falla: editá el original en `src/utils/rondaInventario/` y
 * corré `python3 docs/inventario/regenerar-copias-ronda-inventario.py`.
 * NUNCA edites una copia a mano para "arreglar" la falla.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import * as causasRaizFrontend from '@/utils/rondaInventario/causasRaiz';
import * as causasRaizEdge from '../supabase/functions/server/rondaInventario/causasRaiz';
import * as interpretarNotaFrontend from '@/utils/rondaInventario/interpretarNota';
import * as interpretarNotaEdge from '../supabase/functions/server/rondaInventario/interpretarNota';
import * as previewFrontend from '@/utils/rondaInventario/preview';
import * as previewEdge from '../supabase/functions/server/rondaInventario/preview';
import * as reporteCierreFrontend from '@/utils/rondaInventario/reporteCierre';
import * as reporteCierreEdge from '../supabase/functions/server/rondaInventario/reporteCierre';

const RAIZ = resolve(__dirname, '../..');

// ============================================================================
// 1. Paridad estructural: el generador, corrido ahora, no produce ningún diff.
// ============================================================================

describe('paridad estructural rondaInventario ⇄ rondaInventario (server)', () => {
  it('las copias Deno están al día con docs/inventario/regenerar-copias-ronda-inventario.py --check', () => {
    execFileSync('python3', ['docs/inventario/regenerar-copias-ronda-inventario.py', '--check'], {
      cwd: RAIZ,
      stdio: 'pipe',
    });
  });

  it('ambas implementaciones exportan exactamente la misma API (causasRaiz.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(causasRaizEdge)).toEqual(nombres(causasRaizFrontend));
  });

  it('ambas implementaciones exportan exactamente la misma API (interpretarNota.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(interpretarNotaEdge)).toEqual(nombres(interpretarNotaFrontend));
  });

  it('ambas implementaciones exportan exactamente la misma API (preview.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(previewEdge)).toEqual(nombres(previewFrontend));
  });

  it('ambas implementaciones exportan exactamente la misma API (reporteCierre.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(reporteCierreEdge)).toEqual(nombres(reporteCierreFrontend));
  });
});

// ============================================================================
// 2. Paridad de comportamiento -- las mismas entradas, la misma salida.
// ============================================================================

describe('paridad de comportamiento causasRaiz', () => {
  it('CAUSAS_RAIZ y buscarCausaRaiz coinciden en ambas implementaciones', () => {
    expect(causasRaizEdge.CAUSAS_RAIZ).toEqual(causasRaizFrontend.CAUSAS_RAIZ);
    expect(causasRaizEdge.buscarCausaRaiz('perdida_o_dano')).toEqual(causasRaizFrontend.buscarCausaRaiz('perdida_o_dano'));
    expect(causasRaizEdge.buscarCausaRaiz('no_existe')).toEqual(causasRaizFrontend.buscarCausaRaiz('no_existe'));
  });
});

describe('paridad de comportamiento interpretarNota', () => {
  const respuestaModelo = {
    hallazgos: [
      {
        producto_mencionado: 'Silicio',
        producto_confianza: 'baja',
        fragmento_literal: 'deberían haber 100 kg y hay 90 kg',
        cantidad_fisica_presente: true,
        cantidad_fisica: 90,
        cantidad_faltante_presente: false,
        cantidad_faltante: 0,
        causa_clave: 'error_captura_previa',
        causa_confianza: 'alta',
        explicacion_david_citada: 'es por error en el sistema',
      },
    ],
    observaciones_libres: [],
    avisos: [],
  };

  it('parsearRespuestaModelo produce el mismo resultado en ambas implementaciones', () => {
    expect(interpretarNotaEdge.parsearRespuestaModelo(respuestaModelo)).toEqual(
      interpretarNotaFrontend.parsearRespuestaModelo(respuestaModelo),
    );
  });

  it('resolverProducto / derivarFisico / derivarVia coinciden en ambas implementaciones', () => {
    const alcance = [{ productoId: 'p1', nombre: 'Silicalmag' }];
    expect(interpretarNotaEdge.resolverProducto('Silicio', alcance)).toEqual(
      interpretarNotaFrontend.resolverProducto('Silicio', alcance),
    );
    expect(interpretarNotaEdge.resolverProducto('Silicalmag', alcance)).toEqual(
      interpretarNotaFrontend.resolverProducto('Silicalmag', alcance),
    );

    const [hallazgo] = interpretarNotaFrontend.parsearRespuestaModelo(respuestaModelo).hallazgos;
    expect(interpretarNotaEdge.derivarFisico(hallazgo, 100)).toEqual(interpretarNotaFrontend.derivarFisico(hallazgo, 100));
    expect(interpretarNotaEdge.derivarVia(hallazgo)).toEqual(interpretarNotaFrontend.derivarVia(hallazgo));
  });

  it('construirPromptInterprete y esquemaJsonHallazgos son idénticos en ambas implementaciones', () => {
    expect(interpretarNotaEdge.esquemaJsonHallazgos()).toEqual(interpretarNotaFrontend.esquemaJsonHallazgos());
    expect(interpretarNotaEdge.construirPromptInterprete()).toEqual(interpretarNotaFrontend.construirPromptInterprete());
  });
});

describe('paridad de comportamiento preview', () => {
  const fila: previewFrontend.FilaPreview = {
    productoMencionado: 'Silicalmag',
    productoIdentificado: true,
    productoId: 'p1',
    nombreProducto: 'Silicalmag',
    unidad: 'Kilos',
    fisico: 90,
    fisicoOrigen: 'dictado',
    teorico: 100,
    causaClave: 'error_captura_previa',
    causaEtiqueta: 'Error de captura previa',
    via: 'captura_david',
    explicacionCitada: 'es por error en el sistema',
    fragmentoLiteral: 'deberían haber 100 kg y hay 90 kg',
    fueraDeAlcance: false,
  };

  it('construirPreview / renderPreviewTelegram / previewConfirmable coinciden en ambas implementaciones', () => {
    const preview = previewFrontend.construirPreview([fila]);
    expect(previewEdge.construirPreview([fila])).toEqual(preview);
    expect(previewEdge.renderPreviewTelegram(preview)).toEqual(previewFrontend.renderPreviewTelegram(preview));
    expect(previewEdge.previewConfirmable(preview)).toEqual(previewFrontend.previewConfirmable(preview));
  });

  it('aplicarCorreccion e intentosPreviewAgotados coinciden en ambas implementaciones', () => {
    const previas = previewFrontend.aplicarCorreccion([], 'Es Silicalmag, no Silicio', '2026-08-28T10:00:00.000Z');
    expect(previewEdge.aplicarCorreccion([], 'Es Silicalmag, no Silicio', '2026-08-28T10:00:00.000Z')).toEqual(previas);
    expect(previewEdge.intentosPreviewAgotados(4)).toEqual(previewFrontend.intentosPreviewAgotados(4));
    expect(previewEdge.MAX_INTENTOS_PREVIEW).toEqual(previewFrontend.MAX_INTENTOS_PREVIEW);
  });
});

describe('paridad de comportamiento reporteCierre', () => {
  const input: reporteCierreFrontend.InputReporteCierre = {
    cabecera: {
      periodo: '2026-08-01',
      cerradaEn: '2026-08-31T20:00:00.000Z',
      cerradoPorNombre: 'Uriel',
      alcanceDeclarado: 'completo',
      alcanceNota: null,
      esLineaBase: true,
    },
    valoracion: { incluyeValoracion: false, valorTotalActual: null, valorTotalMesAnterior: null },
    excepciones: [
      { productoNombre: 'Silicalmag', estado: 'ajuste_aplicado', fisico: 90, teorico: 100, causaEtiqueta: 'Error de captura previa', via: 'captura_david' },
    ],
    movimientosRondaAbierta: [],
    observacionesLibres: ['Se encontraron 2 canecas vacías sin identificar'],
    hallazgosNarradosSinConfirmar: 1,
  };

  it('clasificarDesenlace / construirReporteCierre / renderReporteCierreTelegram coinciden en ambas implementaciones', () => {
    const reporte = reporteCierreFrontend.construirReporteCierre(input);
    expect(reporteCierreEdge.construirReporteCierre(input)).toEqual(reporte);
    expect(reporteCierreEdge.renderReporteCierreTelegram(reporte)).toEqual(reporteCierreFrontend.renderReporteCierreTelegram(reporte));
    expect(reporteCierreEdge.reporteEsLimpio(reporte)).toEqual(reporteCierreFrontend.reporteEsLimpio(reporte));
    expect(reporteCierreEdge.clasificarDesenlace('reportada')).toEqual(reporteCierreFrontend.clasificarDesenlace('reportada'));
  });
});
