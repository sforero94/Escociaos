/**
 * Test de paridad frontend ⇄ edge function de `hatoLiquidacionPomar.ts` (S4,
 * docs/plan_hato_ronda_agosto_2026.md). Mismo criterio que
 * `calculosHatoParidad.test.ts`: el módulo es PURO con CERO imports, así que
 * las dos copias Deno-side (generadas por
 * `docs/hato/regenerar-copias-liquidacion-pomar.py`) deben ser BYTE-IDÉNTICAS
 * al original debajo de su propio encabezado, y comportarse igual sobre el
 * mismo fixture.
 *
 * Si este test falla: edita `src/utils/hatoLiquidacionPomar.ts` y corre
 * `python3 docs/hato/regenerar-copias-liquidacion-pomar.py`. NUNCA edites las
 * copias a mano.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as frontend from '@/utils/hatoLiquidacionPomar';
import * as servidorFuente from '../supabase/functions/server/hato-liquidacion-pomar';
import * as servidorDespliegue from '../../supabase/functions/make-server-1ccce916/hato-liquidacion-pomar';

const RAIZ = resolve(__dirname, '../..');
const HEADER_END_MARKER = '// -------';

const ARCHIVOS = {
  frontend: 'src/utils/hatoLiquidacionPomar.ts',
  servidorFuente: 'src/supabase/functions/server/hato-liquidacion-pomar.ts',
  servidorDespliegue: 'supabase/functions/make-server-1ccce916/hato-liquidacion-pomar.ts',
} as const;

/** Cuerpo del módulo -- todo desde el primer separador de sección
 * (`// -------`) en adelante, descartando el encabezado (que SÍ difiere:
 * cada archivo explica su propio rol). */
function cuerpo(rutaRelativa: string): string {
  const texto = readFileSync(resolve(RAIZ, rutaRelativa), 'utf-8');
  const i = texto.indexOf(HEADER_END_MARKER);
  if (i === -1) throw new Error(`No se encontró el marcador de fin de encabezado en ${rutaRelativa}`);
  return texto.slice(i);
}

describe('hatoLiquidacionPomar — paridad estructural (byte-idéntica bajo el encabezado)', () => {
  it('servidorFuente es byte-idéntico al frontend', () => {
    expect(cuerpo(ARCHIVOS.servidorFuente)).toBe(cuerpo(ARCHIVOS.frontend));
  });

  it('servidorDespliegue es byte-idéntico al frontend', () => {
    expect(cuerpo(ARCHIVOS.servidorDespliegue)).toBe(cuerpo(ARCHIVOS.frontend));
  });

  it('servidorFuente y servidorDespliegue son byte-idénticos entre sí', () => {
    expect(cuerpo(ARCHIVOS.servidorFuente)).toBe(cuerpo(ARCHIVOS.servidorDespliegue));
  });
});

describe('hatoLiquidacionPomar — paridad de comportamiento', () => {
  const bruto = {
    campos: {
      proveedor: { texto: 'INVERSIONES FOVEMSA Y CIA. S. EN C.', confianza: 'alta' },
      nit: { texto: '900360730', confianza: 'alta' },
      mes: { texto: 'JULIO', confianza: 'alta' },
      quincena: { texto: '02', confianza: 'alta' },
      periodo: { texto: 'PERIODO COMPRENDIDO DEL 16 AL 31 DE JULIO 2026', confianza: 'alta' },
      precioPromedio: { texto: '$ 2.000,00', confianza: 'alta' },
      cantidad: { texto: '$ 5.938,00', confianza: 'alta' },
      subtotal: { texto: '$ 11.876.000,00', confianza: 'alta' },
    },
  };

  it('las tres implementaciones interpretan la liquidación real de forma idéntica', () => {
    const lecturaFrontend = frontend.parsearRespuestaModeloOcrLiquidacion(bruto, 1);
    const lecturaFuente = servidorFuente.parsearRespuestaModeloOcrLiquidacion(bruto, 1);
    const lecturaDespliegue = servidorDespliegue.parsearRespuestaModeloOcrLiquidacion(bruto, 1);

    const resultadoFrontend = frontend.interpretarLecturaLiquidacion(lecturaFrontend);
    const resultadoFuente = servidorFuente.interpretarLecturaLiquidacion(lecturaFuente);
    const resultadoDespliegue = servidorDespliegue.interpretarLecturaLiquidacion(lecturaDespliegue);

    expect(resultadoFuente).toEqual(resultadoFrontend);
    expect(resultadoDespliegue).toEqual(resultadoFrontend);
    expect(resultadoFrontend.subtotal).toBe(11876000);
  });
});
