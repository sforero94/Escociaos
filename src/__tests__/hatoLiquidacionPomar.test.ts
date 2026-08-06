// ARCHIVO: __tests__/hatoLiquidacionPomar.test.ts
// DESCRIPCIÓN: TDD de `src/utils/hatoLiquidacionPomar.ts` -- OCR de la
// liquidación quincenal de El Pomar (S4, docs/plan_hato_ronda_agosto_2026.md
// D-8). El fixture "real" reproduce EXACTAMENTE la liquidación de julio,
// quincena 02 (16-31 julio 2026) que mandó el dueño:
//   INVERSIONES FOVEMSA Y CIA. S. EN C. -- NIT 900360730 -- prom. precio
//   $2.000,00 -- cantidad $5.938,00 L -- sub-total $11.876.000,00.
//
// Lo que estos tests protegen, en orden de importancia:
//   1. "SIN DATO, NUNCA 0" EN LA LECTURA: un campo `baja`/`ilegible` entra
//      vacío y marcado, jamás adivinado.
//   2. Ningún campo `alta` que dos fotos lean distinto se adjudica solo.
//   3. Los parsers deterministas (moneda colombiana, mes, quincena, NIT,
//      periodo) interpretan exactamente lo que el modelo transcribió --
//      nunca inventan ni corrigen.
//   4. La coherencia precio×cantidad≈subtotal se AVISA, nunca se corrige.

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_OCR_LIQUIDACION,
  combinarLecturasLiquidacion,
  construirPromptOcrLiquidacion,
  esquemaJsonOcrLiquidacion,
  interpretarLecturaLiquidacion,
  parseMesLiquidacion,
  parseMonedaColombiana,
  parseNitLiquidacion,
  parsePeriodoLiquidacion,
  parseQuincenaLiquidacion,
  parsearRespuestaModeloOcrLiquidacion,
  validarCoherenciaLiquidacion,
  type CampoLiquidacionOcr,
  type CampoOcrLiquidacion,
  type LecturaOcrLiquidacion,
  type LiquidacionInterpretada,
} from '@/utils/hatoLiquidacionPomar';

function campo(texto: string, confianza: CampoOcrLiquidacion['confianza'] = 'alta'): CampoOcrLiquidacion {
  return { texto, confianza };
}

function campos(parcial: Partial<Record<CampoLiquidacionOcr, CampoOcrLiquidacion>> = {}): Record<CampoLiquidacionOcr, CampoOcrLiquidacion> {
  const salida = {} as Record<CampoLiquidacionOcr, CampoOcrLiquidacion>;
  for (const c of CAMPOS_OCR_LIQUIDACION) salida[c] = parcial[c] ?? campo('');
  return salida;
}

/** La liquidación real de julio Q02, tal como la transcribiría el modelo si
 * leyera todo con confianza alta. */
function lecturaJulioQ02(overrides: Partial<Record<CampoLiquidacionOcr, CampoOcrLiquidacion>> = {}, pagina = 1): LecturaOcrLiquidacion {
  return {
    pagina,
    campos: campos({
      proveedor: campo('INVERSIONES FOVEMSA Y CIA. S. EN C.'),
      nit: campo('900360730'),
      mes: campo('JULIO'),
      quincena: campo('02'),
      periodo: campo('PERIODO COMPRENDIDO DEL 16 AL 31 DE JULIO 2026'),
      precioPromedio: campo('$ 2.000,00'),
      cantidad: campo('$ 5.938,00'),
      subtotal: campo('$ 11.876.000,00'),
      ...overrides,
    }),
    avisos: [],
  };
}

// ============================================================================
// parseMonedaColombiana
// ============================================================================

describe('parseMonedaColombiana', () => {
  it('parsea el precio promedio real ($ 2.000,00 -> 2000)', () => {
    expect(parseMonedaColombiana('$ 2.000,00')).toBe(2000);
  });

  it('parsea la cantidad real ($ 5.938,00 -> 5938)', () => {
    expect(parseMonedaColombiana('$ 5.938,00')).toBe(5938);
  });

  it('parsea el subtotal real ($ 11.876.000,00 -> 11876000)', () => {
    expect(parseMonedaColombiana('$ 11.876.000,00')).toBe(11876000);
  });

  it('parsea sin símbolo $ y sin decimales', () => {
    expect(parseMonedaColombiana('5938')).toBe(5938);
  });

  it('tolera espacio pegado o no entre $ y el número', () => {
    expect(parseMonedaColombiana('$2.000,00')).toBe(2000);
  });

  it('texto vacío es null, no 0', () => {
    expect(parseMonedaColombiana('')).toBeNull();
    expect(parseMonedaColombiana('   ')).toBeNull();
  });

  it('texto no numérico es null, nunca una adivinanza', () => {
    expect(parseMonedaColombiana('ilegible')).toBeNull();
    expect(parseMonedaColombiana('$ dos mil')).toBeNull();
  });

  it('dos comas decimales es null -- no es un número colombiano válido', () => {
    expect(parseMonedaColombiana('1,234,56')).toBeNull();
  });
});

// ============================================================================
// parseMesLiquidacion
// ============================================================================

describe('parseMesLiquidacion', () => {
  it('reconoce JULIO -> 7', () => {
    expect(parseMesLiquidacion('JULIO')).toEqual({ num: 7, nombre: 'julio' });
  });

  it('tolera minúsculas y espacios', () => {
    expect(parseMesLiquidacion('  julio  ')).toEqual({ num: 7, nombre: 'julio' });
  });

  it('reconoce una abreviatura de 3 letras', () => {
    expect(parseMesLiquidacion('jul')).toEqual({ num: 7, nombre: 'julio' });
  });

  it('texto vacío o sin mes reconocible es null', () => {
    expect(parseMesLiquidacion('')).toBeNull();
    expect(parseMesLiquidacion('XYZ')).toBeNull();
  });
});

// ============================================================================
// parseQuincenaLiquidacion
// ============================================================================

describe('parseQuincenaLiquidacion', () => {
  it("'02' -> 2", () => {
    expect(parseQuincenaLiquidacion('02')).toBe(2);
  });

  it("'1' -> 1", () => {
    expect(parseQuincenaLiquidacion('1')).toBe(1);
  });

  it('cualquier otro número es null -- solo existen 1ª y 2ª', () => {
    expect(parseQuincenaLiquidacion('3')).toBeNull();
    expect(parseQuincenaLiquidacion('0')).toBeNull();
  });

  it('sin dígitos es null', () => {
    expect(parseQuincenaLiquidacion('')).toBeNull();
  });
});

// ============================================================================
// parseNitLiquidacion
// ============================================================================

describe('parseNitLiquidacion', () => {
  it('el NIT real pasa tal cual', () => {
    expect(parseNitLiquidacion('900360730')).toBe('900360730');
  });

  it('descarta guiones y puntos, deja solo dígitos', () => {
    expect(parseNitLiquidacion('900.360.730-1')).toBe('9003607301');
  });

  it('demasiado corto es null', () => {
    expect(parseNitLiquidacion('123')).toBeNull();
  });
});

// ============================================================================
// parsePeriodoLiquidacion
// ============================================================================

describe('parsePeriodoLiquidacion', () => {
  it('parsea el periodo real a fechas ISO', () => {
    expect(parsePeriodoLiquidacion('PERIODO COMPRENDIDO DEL 16 AL 31 DE JULIO 2026')).toEqual({
      inicio: '2026-07-16',
      fin: '2026-07-31',
    });
  });

  it('texto que no calza con el patrón es {null, null}', () => {
    expect(parsePeriodoLiquidacion('algo que no es un periodo')).toEqual({ inicio: null, fin: null });
  });

  it('mes no reconocible dentro del patrón es {null, null}', () => {
    expect(parsePeriodoLiquidacion('DEL 16 AL 31 DE XYZ 2026')).toEqual({ inicio: null, fin: null });
  });
});

// ============================================================================
// parsearRespuestaModeloOcrLiquidacion
// ============================================================================

describe('parsearRespuestaModeloOcrLiquidacion', () => {
  it('parsea una respuesta bien formada', () => {
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
    const lectura = parsearRespuestaModeloOcrLiquidacion(bruto, 1);
    expect(lectura.pagina).toBe(1);
    expect(lectura.campos.subtotal).toEqual({ texto: '$ 11.876.000,00', confianza: 'alta' });
    expect(lectura.avisos).toEqual([]);
  });

  it('un campo ausente en la respuesta entra ilegible, nunca en blanco silencioso', () => {
    const bruto = { campos: { proveedor: { texto: 'X', confianza: 'alta' } } };
    const lectura = parsearRespuestaModeloOcrLiquidacion(bruto, 1);
    expect(lectura.campos.subtotal).toEqual({ texto: '', confianza: 'ilegible' });
  });

  it('una confianza desconocida se degrada a ilegible y deja aviso', () => {
    const bruto = { campos: { nit: { texto: '900360730', confianza: 'media' } } };
    const lectura = parsearRespuestaModeloOcrLiquidacion(bruto, 2);
    expect(lectura.campos.nit.confianza).toBe('ilegible');
    expect(lectura.avisos.some((a) => a.includes('confianza'))).toBe(true);
  });

  it('lanza si la raíz no es un objeto', () => {
    expect(() => parsearRespuestaModeloOcrLiquidacion(null, 1)).toThrow();
    expect(() => parsearRespuestaModeloOcrLiquidacion('texto', 1)).toThrow();
  });
});

// ============================================================================
// interpretarLecturaLiquidacion -- caso real completo
// ============================================================================

describe('interpretarLecturaLiquidacion', () => {
  it('interpreta la liquidación real de julio Q02 completa', () => {
    const resultado = interpretarLecturaLiquidacion(lecturaJulioQ02());
    const esperado: LiquidacionInterpretada = {
      proveedor: 'INVERSIONES FOVEMSA Y CIA. S. EN C.',
      nit: '900360730',
      mes: 7,
      mesNombre: 'julio',
      quincena: 2,
      periodoInicio: '2026-07-16',
      periodoFin: '2026-07-31',
      precioPromedioLitro: 2000,
      cantidadLitros: 5938,
      subtotal: 11876000,
      camposNoConfiables: [],
      advertencias: [],
    };
    expect(resultado).toEqual(esperado);
  });

  it('un campo `ilegible` entra como null, nunca como una adivinanza', () => {
    const lectura = lecturaJulioQ02({ subtotal: campo('', 'ilegible') });
    const resultado = interpretarLecturaLiquidacion(lectura);
    expect(resultado.subtotal).toBeNull();
    expect(resultado.camposNoConfiables).toContain('subtotal');
  });

  it('un campo `baja` entra como null igual que `ilegible`', () => {
    const lectura = lecturaJulioQ02({ cantidad: campo('5.938,00 borroso', 'baja') });
    const resultado = interpretarLecturaLiquidacion(lectura);
    expect(resultado.cantidadLitros).toBeNull();
    expect(resultado.camposNoConfiables).toContain('cantidad');
  });

  it('un campo alta que no parsea deja el valor en null y un aviso -- nunca falla en silencio', () => {
    const lectura = lecturaJulioQ02({ mes: campo('MERCOLES') }); // no es un mes
    const resultado = interpretarLecturaLiquidacion(lectura);
    expect(resultado.mes).toBeNull();
    expect(resultado.advertencias.some((a) => a.includes("'mes'"))).toBe(true);
  });
});

// ============================================================================
// combinarLecturasLiquidacion
// ============================================================================

describe('combinarLecturasLiquidacion', () => {
  it('con una sola foto, devuelve la interpretación tal cual', () => {
    const { resultado, interpretadas } = combinarLecturasLiquidacion([lecturaJulioQ02()]);
    expect(resultado.subtotal).toBe(11876000);
    expect(interpretadas).toHaveLength(1);
  });

  it('dos fotos que coinciden en todo producen el mismo resultado sin advertencias de divergencia', () => {
    const { resultado } = combinarLecturasLiquidacion([lecturaJulioQ02({}, 1), lecturaJulioQ02({}, 2)]);
    expect(resultado.subtotal).toBe(11876000);
    expect(resultado.advertencias.some((a) => a.includes('no coinciden'))).toBe(false);
  });

  it('dos fotos que DIVERGEN en un campo lo dejan en null -- nunca se adjudica solo', () => {
    const foto1 = lecturaJulioQ02({}, 1);
    const foto2 = lecturaJulioQ02({ subtotal: campo('$ 11.608.790,00') }, 2); // otra lectura del subtotal
    const { resultado } = combinarLecturasLiquidacion([foto1, foto2]);
    expect(resultado.subtotal).toBeNull();
    expect(resultado.advertencias.some((a) => a.includes('subtotal'))).toBe(true);
    // Los campos que SÍ coinciden entre las dos fotos no se pierden.
    expect(resultado.proveedor).toBe('INVERSIONES FOVEMSA Y CIA. S. EN C.');
  });

  it('un campo leído en una sola de las N fotos (la otra ilegible) se conserva, no diverge', () => {
    const foto1 = lecturaJulioQ02({}, 1);
    const foto2 = lecturaJulioQ02({ subtotal: campo('', 'ilegible') }, 2);
    const { resultado } = combinarLecturasLiquidacion([foto1, foto2]);
    expect(resultado.subtotal).toBe(11876000);
  });

  it('lanza si se le pasa un arreglo vacío -- error del llamador, no del OCR', () => {
    expect(() => combinarLecturasLiquidacion([])).toThrow();
  });
});

// ============================================================================
// validarCoherenciaLiquidacion
// ============================================================================

describe('validarCoherenciaLiquidacion', () => {
  it('la liquidación real es coherente (2000 x 5938 = 11.876.000) -- sin aviso', () => {
    const resultado = interpretarLecturaLiquidacion(lecturaJulioQ02());
    expect(validarCoherenciaLiquidacion(resultado)).toBeNull();
  });

  it('avisa si precio x cantidad no coincide con el subtotal leído', () => {
    const resultado = interpretarLecturaLiquidacion(lecturaJulioQ02({ subtotal: campo('$ 10.000.000,00') }));
    expect(validarCoherenciaLiquidacion(resultado)).toMatch(/no coincide/);
  });

  it('sin los tres valores presentes, no hay nada que validar', () => {
    const resultado = interpretarLecturaLiquidacion(lecturaJulioQ02({ subtotal: campo('', 'ilegible') }));
    expect(validarCoherenciaLiquidacion(resultado)).toBeNull();
  });

  it('nunca corrige -- solo devuelve el mensaje, los valores de entrada quedan intactos', () => {
    const resultado = interpretarLecturaLiquidacion(lecturaJulioQ02({ subtotal: campo('$ 10.000.000,00') }));
    validarCoherenciaLiquidacion(resultado);
    expect(resultado.subtotal).toBe(10000000); // no se tocó
  });
});

// ============================================================================
// Prompt y esquema -- guardas de forma mínimas
// ============================================================================

describe('esquemaJsonOcrLiquidacion / construirPromptOcrLiquidacion', () => {
  it('el esquema exige los 8 campos', () => {
    const esquema = esquemaJsonOcrLiquidacion() as {
      properties: { campos: { required: string[] } };
    };
    expect(esquema.properties.campos.required.sort()).toEqual([...CAMPOS_OCR_LIQUIDACION].sort());
  });

  it('el prompt no está vacío y menciona las 8 columnas', () => {
    const prompt = construirPromptOcrLiquidacion();
    expect(prompt.length).toBeGreaterThan(100);
    for (const c of CAMPOS_OCR_LIQUIDACION) {
      expect(prompt).toContain(`'${c}'`);
    }
  });
});
