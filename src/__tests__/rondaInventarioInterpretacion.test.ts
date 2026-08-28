/**
 * Fase 1 -- Fundaciones del pipeline de voz de la ronda de inventario
 * (docs/brief_tecnico_verificacion_inventario.md §5, §12).
 *
 * `interpretarNota.ts` es puro: no llama al modelo de voz ni toca Supabase.
 * Recibe la respuesta YA des-serializada del modelo intérprete (los
 * fixtures de este archivo son exactamente eso) más el alcance congelado de
 * la ronda, y devuelve los hallazgos resueltos que `preview.ts` convierte en
 * lo que Uriel confirma. Mismo patrón que `importHatoOcrChequeo.test.ts`.
 *
 * FIXTURE #1 -- LITERAL, TAL COMO LO ESCRIBIÓ EL DUEÑO. §11.1 de
 * docs/plan_verificacion_inventario.md:
 *
 *   Uriel (audio): "Hay un desface en Silicalmag donde deberían haber 100 kg
 *   y hay 90 kg, David dice que es por error en el sistema y hacen falta 3
 *   martillos que no aparecen."
 *
 *   Bot (preview): "Registros a incluir: Silicalmag: hay 90, deberían haber
 *   100. David actualiza en sistema. Martillos: hay 5, deberían haber 8.
 *   Pérdida de equipo, pasa a aprobación de Santiago."
 *
 * Este test transcribe la frase de Uriel literal (como transcrito de
 * entrada) y los NÚMEROS Y DECISIONES que el dueño escribió como salida
 * esperada: Silicalmag hay 90 (dictado) / deberían haber 100 / vía "David lo
 * resuelve"; Martillos hay 5 (DERIVADO de "faltan 3" sobre un teórico de 8,
 * R-19/CA-31) / deberían haber 8 / vía "pasa a Santiago". Esos números y esas
 * dos vías son la aserción del dueño -- no se reinterpretan.
 *
 * Lo que SÍ es una decisión de esta sesión, y se documenta en vez de
 * esconderse: el TEXTO renderizado usa el lenguaje LITERAL de CA-30
 * ("«David lo resuelve» / «pasa a Santiago»"), que es la CA formal que
 * codificó -- el mismo día, en el mismo documento -- la ilustración libre de
 * §11.1 ("David actualiza en sistema", "Pérdida de equipo, pasa a..."). Las
 * dos frases del dueño no son un molde fijo -- usan verbos distintos para
 * cada causa ("actualiza" vs. la etiqueta completa "Pérdida de equipo") sin
 * ningún patrón común entre sí, así que replicarlas byte a byte habría
 * significado hardcodear una prosa distinta por cada causa en vez de un
 * renderer general. `renderPreviewTelegram` usa el vocabulario que la CA
 * fija como contrato formal; los HECHOS (producto, físico, teórico, vía) que
 * el dueño escribió se transcriben exactos y se comprueban con `toBe`/`toEqual`.
 */

import { describe, it, expect } from 'vitest';
import {
  construirPromptInterprete,
  derivarFisico,
  derivarVia,
  esquemaJsonHallazgos,
  parsearRespuestaModelo,
  resolverProducto,
  type HallazgoCrudo,
  type ProductoEnAlcance,
} from '@/utils/rondaInventario/interpretarNota';
import { construirPreview, previewConfirmable, renderPreviewTelegram, type FilaPreview } from '@/utils/rondaInventario/preview';
import { buscarCausaRaiz } from '@/utils/rondaInventario/causasRaiz';

// ---------------------------------------------------------------------------
// Helpers de test -- wiring de las piezas puras, NO forman parte del
// producto (el brief técnico no lista un orquestador en interpretarNota.ts;
// cada función se mantiene granular y se compone acá, mismo criterio que
// los tests de ocrChequeo.ts).
// ---------------------------------------------------------------------------

function resolverFilaPreview(hallazgo: HallazgoCrudo, alcance: readonly ProductoEnAlcance[]): FilaPreview {
  const resolucion = resolverProducto(hallazgo.productoMencionado, alcance);

  if (resolucion.estado === 'no_identificado') {
    return {
      productoMencionado: hallazgo.productoMencionado,
      productoIdentificado: false,
      productoId: null,
      nombreProducto: hallazgo.productoMencionado,
      unidad: null,
      fisico: null,
      fisicoOrigen: null,
      teorico: null,
      causaClave: null,
      causaEtiqueta: null,
      via: derivarVia(hallazgo),
      explicacionCitada: hallazgo.explicacionDavidCitada || null,
      fragmentoLiteral: hallazgo.fragmentoLiteral,
      fueraDeAlcance: false,
    };
  }

  // El teórico SIEMPRE sale del alcance congelado (R-5), nunca de lo que
  // dijo Uriel -- acá el fixture guarda el teórico junto al alcance para
  // simular `rondas_inventario_alcance.cantidad_teorica`.
  const teorico = (alcance.find((p) => p.productoId === resolucion.productoId) as ProductoEnAlcanceConTeorico).teoricoFoto;
  const fisicoResuelto = derivarFisico(hallazgo, teorico);
  const causa = hallazgo.causaClave ? buscarCausaRaiz(hallazgo.causaClave) : undefined;

  return {
    productoMencionado: hallazgo.productoMencionado,
    productoIdentificado: true,
    productoId: resolucion.productoId,
    nombreProducto: resolucion.nombreProducto,
    unidad: 'Kilos',
    fisico: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.fisico : null,
    fisicoOrigen: fisicoResuelto.estado === 'resuelto' ? fisicoResuelto.origen : null,
    teorico,
    causaClave: hallazgo.causaClave || null,
    causaEtiqueta: causa ? causa.etiqueta : null,
    via: derivarVia(hallazgo),
    explicacionCitada: hallazgo.explicacionDavidCitada || null,
    fragmentoLiteral: hallazgo.fragmentoLiteral,
    fueraDeAlcance: false,
  };
}

interface ProductoEnAlcanceConTeorico extends ProductoEnAlcance {
  teoricoFoto: number;
}

function respuestaModelo(hallazgos: Array<Record<string, unknown>>, observacionesLibres: string[] = [], avisos: string[] = []) {
  return { hallazgos, observaciones_libres: observacionesLibres, avisos };
}

// ---------------------------------------------------------------------------
// Fixture #1 -- literal, §11.1 del brief de producto
// ---------------------------------------------------------------------------

const TRANSCRITO_FIXTURE_1 =
  'Hay un desface en Silicalmag donde deberían haber 100 kg y hay 90 kg, David dice que es por error en el sistema y hacen falta 3 martillos que no aparecen.';

/** El alcance congelado de la ronda para este fixture (R-5): Silicalmag con
 * teórico 100 kg, Martillos con teórico 8 unidades -- los mismos números que
 * el dueño escribió como salida esperada. */
const ALCANCE_FIXTURE_1: ProductoEnAlcanceConTeorico[] = [
  { productoId: 'prod-silicalmag', nombre: 'Silicalmag', teoricoFoto: 100 },
  { productoId: 'prod-martillos', nombre: 'Martillos', teoricoFoto: 8 },
];

/** La salida del modelo intérprete para este transcrito -- construida a
 * mano como fixture de test (esta sesión no tuvo OPENROUTER_API_KEY para
 * correr el modelo real, ver el spike de docs/inventario/spike_stt_ogg_opus.py),
 * pero reproduce EXACTAMENTE lo que el transcrito dice: Silicalmag con
 * físico dictado (90) y una causa citada de David ("es por error en el
 * sistema" -> clasificada como error_captura_previa, vía captura_david);
 * Martillos con "faltan 3" (sin cifra física directa, sólo faltante) y sin
 * ninguna explicación en el audio (causa_confianza='ninguna' -- nadie dijo
 * por qué faltan -- por eso R-18 la manda a Gerencia, no porque el fixture
 * fuerce una causa 'pérdida' que el transcrito no sostiene). */
const RESPUESTA_MODELO_FIXTURE_1 = respuestaModelo([
  {
    producto_mencionado: 'Silicalmag',
    producto_confianza: 'alta',
    fragmento_literal: 'deberían haber 100 kg y hay 90 kg',
    cantidad_fisica_presente: true,
    cantidad_fisica: 90,
    cantidad_faltante_presente: false,
    cantidad_faltante: 0,
    causa_clave: 'error_captura_previa',
    causa_confianza: 'alta',
    explicacion_david_citada: 'es por error en el sistema',
  },
  {
    producto_mencionado: 'martillos',
    producto_confianza: 'alta',
    fragmento_literal: 'hacen falta 3 martillos que no aparecen',
    cantidad_fisica_presente: false,
    cantidad_fisica: 0,
    cantidad_faltante_presente: true,
    cantidad_faltante: 3,
    causa_clave: '',
    causa_confianza: 'ninguna',
    explicacion_david_citada: '',
  },
]);

describe('fixture #1 -- §11.1 del brief de producto (literal)', () => {
  it('el transcrito de entrada es literal', () => {
    expect(TRANSCRITO_FIXTURE_1).toBe(
      'Hay un desface en Silicalmag donde deberían haber 100 kg y hay 90 kg, David dice que es por error en el sistema y hacen falta 3 martillos que no aparecen.',
    );
  });

  it('Silicalmag: hay 90 (dictado), deberían haber 100, David lo resuelve', () => {
    const { hallazgos } = parsearRespuestaModelo(RESPUESTA_MODELO_FIXTURE_1);
    const fila = resolverFilaPreview(hallazgos[0], ALCANCE_FIXTURE_1);

    expect(fila.productoIdentificado).toBe(true);
    expect(fila.nombreProducto).toBe('Silicalmag');
    expect(fila.fisico).toBe(90);
    expect(fila.fisicoOrigen).toBe('dictado');
    expect(fila.teorico).toBe(100);
    expect(fila.via).toBe('captura_david');
    // CA-38: la cita de Uriel sobre lo que dijo David viaja como CITA, nunca
    // como su confirmación -- y no cambia la vía derivada (ver el bloque de
    // adversariales más abajo, que lo prueba explícitamente).
    expect(fila.explicacionCitada).toBe('es por error en el sistema');
  });

  it('Martillos: hay 5 (DERIVADO de "faltan 3" sobre un teórico de 8), pasa a Santiago', () => {
    const { hallazgos } = parsearRespuestaModelo(RESPUESTA_MODELO_FIXTURE_1);
    const fila = resolverFilaPreview(hallazgos[1], ALCANCE_FIXTURE_1);

    expect(fila.productoIdentificado).toBe(true);
    expect(fila.nombreProducto).toBe('Martillos');
    expect(fila.fisico).toBe(5); // 8 - 3, R-19/CA-31
    expect(fila.fisicoOrigen).toBe('derivado');
    expect(fila.teorico).toBe(8);
    expect(fila.via).toBe('aprobacion_gerencia');
  });

  it('el preview completo es confirmable y el texto usa el lenguaje literal de CA-30', () => {
    const { hallazgos } = parsearRespuestaModelo(RESPUESTA_MODELO_FIXTURE_1);
    const filas = hallazgos.map((h) => resolverFilaPreview(h, ALCANCE_FIXTURE_1));
    const preview = construirPreview(filas);

    expect(previewConfirmable(preview)).toBe(true);
    expect(renderPreviewTelegram(preview)).toBe(
      [
        'Esto entendí de tu nota:',
        '- Silicalmag: hay 90, deberían haber 100. Error de captura previa -- David lo resuelve',
        '- Martillos: hay 5 (derivado), deberían haber 8. pasa a Santiago',
        '',
        '¿Confirmás? [Confirmar] [Corregir] [Descartar]',
      ].join('\n'),
    );
  });
});

// ---------------------------------------------------------------------------
// Casos adversariales -- §5.6 del brief técnico, literales
// ---------------------------------------------------------------------------

describe('adversarial: "Silicio" que no resuelve', () => {
  it('nunca mapea a Silicalmag ni a Sulcamag por distancia de edición (D-T7)', () => {
    const alcance: ProductoEnAlcance[] = [
      { productoId: 'prod-silicalmag', nombre: 'Silicalmag' },
      { productoId: 'prod-sulcamag', nombre: 'Sulcamag' }, // el par de la migración 119
    ];

    expect(resolverProducto('Silicio', alcance)).toEqual({ estado: 'no_identificado' });
    // Sanity check de que el fixture ejercita distancias reales, no un caso
    // trivial: 'silicalmag'->'silicio' difiere en más de un carácter.
    expect(resolverProducto('silicio', alcance)).toEqual({ estado: 'no_identificado' });
  });

  it('sí resuelve por coincidencia normalizada exacta (mayúsculas/tildes/espacios no importan)', () => {
    const alcance: ProductoEnAlcance[] = [{ productoId: 'prod-silicalmag', nombre: 'Silicalmag' }];
    expect(resolverProducto('  SILICALMAG  ', alcance)).toEqual({
      estado: 'identificado',
      productoId: 'prod-silicalmag',
      nombreProducto: 'Silicalmag',
      origen: 'alcance',
    });
  });
});

describe('CA-4: "los productos en cero no entran solos; Uriel puede reportar uno igual si lo encuentra"', () => {
  // Hallazgo real de Santiago probando en vivo en producción (2026-08-28):
  // "15-15-15" existe en `productos` (Fertilizante) pero con
  // cantidad_actual=0 y activo=false -- `fn_ronda_abrir` sólo congela
  // `cantidad_actual > 0`, así que nunca entra al alcance de la ronda. Sin
  // una segunda lista, ese producto es estructuralmente imposible de
  // identificar por más veces que se corrija por texto.
  const alcance: ProductoEnAlcance[] = [{ productoId: 'prod-silicalmag', nombre: 'Silicalmag' }];
  const fueraDeAlcance: ProductoEnAlcance[] = [{ productoId: 'prod-15-15-15', nombre: '15-15-15' }];

  it('sin la segunda lista, un producto fuera del alcance sigue no_identificado (comportamiento previo intacto)', () => {
    expect(resolverProducto('15-15-15', alcance)).toEqual({ estado: 'no_identificado' });
  });

  it('con la segunda lista, se identifica -- origen "fuera_de_alcance"', () => {
    expect(resolverProducto('15-15-15', alcance, fueraDeAlcance)).toEqual({
      estado: 'identificado',
      productoId: 'prod-15-15-15',
      nombreProducto: '15-15-15',
      origen: 'fuera_de_alcance',
    });
  });

  it('el alcance congelado manda siempre primero -- nunca se prueba fuera de alcance si ya hay match ahí', () => {
    const fueraDeAlcanceConTrampa: ProductoEnAlcance[] = [{ productoId: 'prod-otro-id', nombre: 'Silicalmag' }];
    expect(resolverProducto('Silicalmag', alcance, fueraDeAlcanceConTrampa)).toEqual({
      estado: 'identificado',
      productoId: 'prod-silicalmag',
      nombreProducto: 'Silicalmag',
      origen: 'alcance',
    });
  });

  it('una ambigüedad DENTRO del alcance congelado sigue no_identificado -- nunca cede a fuera de alcance para desempatar', () => {
    const alcanceAmbiguo: ProductoEnAlcance[] = [
      { productoId: 'prod-a', nombre: 'Urea' },
      { productoId: 'prod-b', nombre: 'urea' }, // normaliza igual -- caso degenerado, R-20
    ];
    expect(resolverProducto('Urea', alcanceAmbiguo, fueraDeAlcance)).toEqual({ estado: 'no_identificado' });
  });

  it('sin match en ninguna de las dos listas, sigue no_identificado', () => {
    expect(resolverProducto('Producto Inexistente', alcance, fueraDeAlcance)).toEqual({ estado: 'no_identificado' });
  });
});

describe('adversarial: causa ausente', () => {
  it('causa_clave vacía -> aprobacion_gerencia (R-18), aunque la confianza declarada sea alta', () => {
    const hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'> = { causaClave: '', causaConfianza: 'alta' };
    expect(derivarVia(hallazgo)).toBe('aprobacion_gerencia');
  });

  it('causa_confianza no alta -> aprobacion_gerencia, incluso con una clave válida', () => {
    const hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'> = { causaClave: 'movimiento_no_capturado', causaConfianza: 'baja' };
    expect(derivarVia(hallazgo)).toBe('aprobacion_gerencia');
  });

  it('clave que no existe en el catálogo -> aprobacion_gerencia (cautela, no se inventa una causa)', () => {
    const hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'> = { causaClave: 'se_lo_comio_el_perro', causaConfianza: 'alta' };
    expect(derivarVia(hallazgo)).toBe('aprobacion_gerencia');
  });
});

describe('adversarial: causa "otro"', () => {
  it('"otro" con confianza alta -> aprobacion_gerencia, por el catálogo (D-T2), no por un caso especial', () => {
    const hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'> = { causaClave: 'otro', causaConfianza: 'alta' };
    expect(derivarVia(hallazgo)).toBe('aprobacion_gerencia');
    expect(buscarCausaRaiz('otro')?.exigeNota).toBe(true);
  });
});

describe('adversarial: "error de conteo"', () => {
  it('vía "ninguna", no mueve inventario -- cierra sin ajuste, no como un desenlace de Gerencia', () => {
    const hallazgo: Pick<HallazgoCrudo, 'causaClave' | 'causaConfianza'> = { causaClave: 'error_de_conteo', causaConfianza: 'alta' };
    expect(derivarVia(hallazgo)).toBe('ninguna');
    expect(buscarCausaRaiz('error_de_conteo')?.mueveInventario).toBe(false);
  });
});

describe('adversarial: "faltan 3" sin cantidad física dictada -> derivado, rotulado', () => {
  it('deriva el físico de teoricoFoto - cantidadFaltante y lo marca como derivado, nunca como dictado', () => {
    const hallazgo: HallazgoCrudo = {
      productoMencionado: 'Martillos',
      productoConfianza: 'alta',
      fragmentoLiteral: 'faltan 3 martillos',
      cantidadFisicaPresente: false,
      cantidadFisica: 0,
      cantidadFaltantePresente: true,
      cantidadFaltante: 3,
      causaClave: '',
      causaConfianza: 'ninguna',
      explicacionDavidCitada: '',
    };
    expect(derivarFisico(hallazgo, 8)).toEqual({ estado: 'resuelto', fisico: 5, origen: 'derivado' });
  });

  it('sin cantidad física NI faltante -> incompleto, no se puede confirmar (A-9)', () => {
    const hallazgo: HallazgoCrudo = {
      productoMencionado: 'Martillos',
      productoConfianza: 'alta',
      fragmentoLiteral: 'no sé cuántos hay',
      cantidadFisicaPresente: false,
      cantidadFisica: 0,
      cantidadFaltantePresente: false,
      cantidadFaltante: 0,
      causaClave: '',
      causaConfianza: 'ninguna',
      explicacionDavidCitada: '',
    };
    expect(derivarFisico(hallazgo, 8)).toEqual({ estado: 'incompleto' });
  });
});

describe('adversarial: producto no catalogado -> observación libre, no un hallazgo', () => {
  it('el modelo lo reporta en observaciones_libres, y el parser lo conserva sin intentar resolverlo contra ningún producto', () => {
    const bruto = respuestaModelo(
      [], // ningún hallazgo -- el verificador no comparó cantidad contra un teórico
      ['Encontré una guadaña vieja en la bodega que no está en el sistema, dejo la observación por si Santiago quiere darla de alta.'],
    );
    const resultado = parsearRespuestaModelo(bruto);

    expect(resultado.hallazgos).toEqual([]);
    expect(resultado.observacionesLibres).toEqual([
      'Encontré una guadaña vieja en la bodega que no está en el sistema, dejo la observación por si Santiago quiere darla de alta.',
    ]);
  });
});

describe('adversarial: audio con explicación de David dentro -> la cita NO habilita ninguna vía (CA-38)', () => {
  it('dos hallazgos idénticos salvo por explicacion_david_citada producen EXACTAMENTE la misma vía', () => {
    const base = {
      productoMencionado: 'Silicalmag',
      productoConfianza: 'alta' as const,
      fragmentoLiteral: 'deberían haber 100 y hay 90',
      cantidadFisicaPresente: true,
      cantidadFisica: 90,
      cantidadFaltantePresente: false,
      cantidadFaltante: 0,
      causaClave: 'error_captura_previa',
      causaConfianza: 'alta' as const,
    };
    const conCita: HallazgoCrudo = { ...base, explicacionDavidCitada: 'David dice que fue un error de captura' };
    const sinCita: HallazgoCrudo = { ...base, explicacionDavidCitada: '' };

    expect(derivarVia(conCita)).toBe(derivarVia(sinCita));
    expect(derivarVia(conCita)).toBe('captura_david');

    // La cita SÍ viaja en el hallazgo (para precargarla en la capa de
    // excepciones -- R-6/§11.4), pero como texto separado, nunca como parte
    // de la derivación de causa/vía. La confirmación real de David
    // (`estado='explicacion_precargada' -> 'explicada'`, el CHECK
    // `excepcion_avanza_solo_con_david`) vive en el esquema de la migración
    // 125 -- comprobado en esta misma sesión contra un Postgres 17 real
    // (ver el reporte de la tarea) y es responsabilidad de la Fase 2 (RPC)
    // ejercerlo de punta a punta con datos vivos, no de este módulo puro.
    expect(conCita.explicacionDavidCitada).toBe('David dice que fue un error de captura');
  });

  it('parsearRespuestaModelo conserva la cita como texto plano, sin resolverla ni normalizarla', () => {
    const bruto = respuestaModelo([
      {
        producto_mencionado: 'Silicalmag',
        producto_confianza: 'alta',
        fragmento_literal: 'David dice que es por error en el sistema',
        cantidad_fisica_presente: true,
        cantidad_fisica: 90,
        cantidad_faltante_presente: false,
        cantidad_faltante: 0,
        causa_clave: 'error_captura_previa',
        causa_confianza: 'alta',
        explicacion_david_citada: '  es por error en el sistema  ',
      },
    ]);
    const { hallazgos } = parsearRespuestaModelo(bruto);
    expect(hallazgos[0].explicacionDavidCitada).toBe('es por error en el sistema');
  });
});

// ---------------------------------------------------------------------------
// Degradación tolerante -- mismo criterio que parsearRespuestaModeloOcr
// ---------------------------------------------------------------------------

describe('parsearRespuestaModelo -- degradación tolerante', () => {
  it('lanza si "hallazgos" no es un arreglo -- no hay nada que rescatar', () => {
    expect(() => parsearRespuestaModelo({ observaciones_libres: [], avisos: [] })).toThrow();
  });

  it('lanza si la respuesta no es un objeto', () => {
    expect(() => parsearRespuestaModelo('no soy json')).toThrow();
    expect(() => parsearRespuestaModelo(null)).toThrow();
  });

  it('una confianza no reconocida se degrada a "ninguna" y queda un aviso, nunca se cuela como buena', () => {
    const bruto = respuestaModelo([
      {
        producto_mencionado: 'Silicalmag',
        producto_confianza: 'segura', // valor inválido a propósito
        fragmento_literal: 'x',
        cantidad_fisica_presente: true,
        cantidad_fisica: 90,
        cantidad_faltante_presente: false,
        cantidad_faltante: 0,
        causa_clave: '',
        causa_confianza: 'ninguna',
        explicacion_david_citada: '',
      },
    ]);
    const resultado = parsearRespuestaModelo(bruto);
    expect(resultado.hallazgos[0].productoConfianza).toBe('ninguna');
    expect(resultado.avisos.some((a) => a.includes('producto_confianza'))).toBe(true);
  });

  it('un hallazgo que no es un objeto se conserva vacío, no aborta a los demás', () => {
    const bruto = respuestaModelo([
      null,
      {
        producto_mencionado: 'Silicalmag',
        producto_confianza: 'alta',
        fragmento_literal: 'x',
        cantidad_fisica_presente: true,
        cantidad_fisica: 90,
        cantidad_faltante_presente: false,
        cantidad_faltante: 0,
        causa_clave: '',
        causa_confianza: 'ninguna',
        explicacion_david_citada: '',
      },
    ] as unknown as Array<Record<string, unknown>>);
    const resultado = parsearRespuestaModelo(bruto);
    expect(resultado.hallazgos).toHaveLength(2);
    expect(resultado.hallazgos[0].productoMencionado).toBe('');
    expect(resultado.hallazgos[1].productoMencionado).toBe('Silicalmag');
  });
});

// ---------------------------------------------------------------------------
// D-T8: el esquema y el prompt no tienen ranura para teórico/vía/producto_id
// ---------------------------------------------------------------------------

describe('D-T8 -- el esquema de salida no tiene ranura para lo que no debe tener', () => {
  it('esquemaJsonHallazgos() no declara cantidad_teorica, via, producto_id ni un campo de confirmación', () => {
    const esquema = JSON.stringify(esquemaJsonHallazgos());
    expect(esquema).not.toContain('cantidad_teorica');
    expect(esquema).not.toContain('"via"');
    expect(esquema).not.toContain('producto_id');
    expect(esquema).not.toContain('confirm');
  });

  it('construirPromptInterprete() no le pasa al modelo el alcance de productos (anti-circularidad, D-T7)', () => {
    const prompt = construirPromptInterprete();
    // El prompt SÍ debe listar las causas (vocabulario abierto, D-T2) pero
    // nunca nombres de producto del catálogo real -- eso lo resuelve el
    // servidor, no el modelo (mismo argumento que construirPromptOcr).
    expect(prompt).toContain('movimiento_no_capturado');
    expect(prompt).not.toContain('Silicalmag');
  });
});
