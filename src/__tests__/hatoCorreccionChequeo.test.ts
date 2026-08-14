// ARCHIVO: __tests__/hatoCorreccionChequeo.test.ts
// DESCRIPCIÓN: TDD de la lógica pura de la ventana de corrección del chequeo
// (Fase 3a de `docs/plan_chequeo_captura_foto.md`, decisión D-C del dueño).
// Lo que estos tests pinean, además del happy path:
//   * el CRUDO nunca se sobreescribe cuando se corrige el normalizado;
//   * toda corrección deja un `ParseIssue` auditable con prefijo estable, que
//     es el canal que llega a `hato_chequeo_vacas.normalizacion_issues`;
//   * corregir la fecha de servicio RE-DERIVA SECAR/PP (nunca los deja del
//     servicio viejo, nunca se teclean);
//   * un valor ilegible NO se convierte en null en silencio: sale como error;
//   * la fecha del chequeo se valida de verdad (calendario, rango, futuro) y
//     se propaga a TODAS las filas, no solo a la cabecera;
//   * la re-clasificación en vivo la hace `construirDiffChequeo`, el mismo
//     motor del servidor -- acá se comprueba la composición de los dos.

import { describe, it, expect } from 'vitest';
import {
  CAMPOS_CORRECCION_CHEQUEO,
  PREFIJO_ISSUE_CORRECCION_MANUAL,
  aplicarCorreccionesFila,
  aplicarCorreccionesHoja,
  compararClasificaciones,
  detectarTorosNuevos,
  esClasificacionAprobable,
  esFechaIsoReal,
  seleccionarFilasAprobables,
  validarFechaChequeo,
  valorParaEdicion,
  type CorreccionesPorFila,
} from '@/utils/hatoCorreccionChequeo';
import { construirDiffChequeo, type AnimalHatoActual, type UltimoChequeoVacaActual } from '@/utils/importHato/diffChequeo';
import { parseSX, type HatoConfig } from '@/utils/calculosHato';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60,
  dias_rechequeo_due: 60,
};

const HOY = '2026-07-29';

function fila(datos: Partial<FilaChequeoNormalizada> & { fila: number; numero: number | null }): FilaChequeoNormalizada {
  return {
    archivo: 'CHEQUEO JULIO 2026.xlsx',
    hoja: 'CHEQUEO JULIO 2026',
    fila: datos.fila,
    generacionEncabezado: 3,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    chequeoFecha: datos.chequeoFecha ?? '2026-07-20',
    chequeoFechaConfianza: datos.chequeoFechaConfianza ?? 'aproximada',
    raw: {
      pl: null,
      np: null,
      ultimaCria: null,
      sx: null,
      fechaServicio: null,
      toro: null,
      estadoRegistrado: null,
      tp: null,
      estado: null,
      secar: null,
      pp: null,
      ttto: null,
      ...(datos.raw ?? {}),
    },
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechasServicio: datos.fechasServicio ?? [],
    sx: datos.sx ?? null,
    estado: datos.estado ?? 'vacio',
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    toroNombre: datos.toroNombre ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    estadoRegistrado: datos.estadoRegistrado ?? null,
    issues: datos.issues ?? [],
  };
}

function animal(datos: Partial<AnimalHatoActual> & { id: string; numero: number }): AnimalHatoActual {
  return {
    id: datos.id,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    etapa: datos.etapa ?? 'vaca',
    estado: datos.estado ?? 'activa',
  };
}

function ultimo(datos: Partial<UltimoChequeoVacaActual> & { animalId: string }): UltimoChequeoVacaActual {
  return {
    animalId: datos.animalId,
    chequeoFecha: datos.chequeoFecha ?? '2026-05-20',
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechaServicio: datos.fechaServicio ?? null,
    toro: datos.toro ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    estado: datos.estado ?? null,
  };
}

// ============================================================================

describe('valorParaEdicion', () => {
  it('representa cada campo como el texto que el humano ve y edita', () => {
    const f = fila({
      fila: 5,
      numero: 157,
      nombre: 'ALINA',
      pl: 14.5,
      numPartos: 3,
      sx: parseSX('A 206'),
      fechasServicio: ['2026-01-10', '2026-04-15'],
      toroNombre: 'Nitro',
      tipoServicio: 'inseminacion',
      estado: 'vacia_apta',
    });

    expect(valorParaEdicion(f, 'numero')).toBe('157');
    expect(valorParaEdicion(f, 'nombre')).toBe('ALINA');
    expect(valorParaEdicion(f, 'pl')).toBe('14.5');
    expect(valorParaEdicion(f, 'numPartos')).toBe('3');
    expect(valorParaEdicion(f, 'sx')).toBe('A 206');
    // El VIGENTE es el último de la lista (V7), no el primero.
    expect(valorParaEdicion(f, 'fechaServicio')).toBe('2026-04-15');
    expect(valorParaEdicion(f, 'toro')).toBe('Nitro');
    expect(valorParaEdicion(f, 'tipoServicio')).toBe('inseminacion');
    expect(valorParaEdicion(f, 'estado')).toBe('vacia_apta');
  });

  it('"sin dato" y el sentinel "vacio" se ven igual: campo en blanco, nunca 0', () => {
    const f = fila({ fila: 6, numero: null, estado: 'vacio', sx: parseSX('') });
    expect(valorParaEdicion(f, 'numero')).toBe('');
    expect(valorParaEdicion(f, 'pl')).toBe('');
    expect(valorParaEdicion(f, 'numPartos')).toBe('');
    expect(valorParaEdicion(f, 'estado')).toBe('');
    expect(valorParaEdicion(f, 'sx')).toBe('');
  });

  it('un PL real de 0 se muestra como "0", no como celda vacía', () => {
    expect(valorParaEdicion(fila({ fila: 7, numero: 1, pl: 0 }), 'pl')).toBe('0');
    expect(valorParaEdicion(fila({ fila: 7, numero: 1, numPartos: 0 }), 'numPartos')).toBe('0');
  });
});

describe('aplicarCorreccionesFila — la capa cruda nunca se sobreescribe', () => {
  it('corrige el normalizado y deja el crudo intacto', () => {
    const original = fila({
      fila: 5,
      numero: 157,
      pl: 1,
      raw: { pl: '1', np: '3', ultimaCria: '2/12/2025', sx: 'OV', fechaServicio: null, toro: null, estadoRegistrado: null, tp: null, estado: null, secar: null, pp: null, ttto: 'estrumate' },
    });

    const { fila: corregida, camposCorregidos, errores } = aplicarCorreccionesFila(original, { pl: '14' }, CONFIG);

    expect(errores).toEqual([]);
    expect(camposCorregidos).toEqual(['pl']);
    expect(corregida.pl).toBe(14);
    // Crudo VERBATIM, incluidas las columnas que no se pueden corregir.
    expect(corregida.raw.pl).toBe('1');
    expect(corregida.raw.ultimaCria).toBe('2/12/2025');
    expect(corregida.raw.ttto).toBe('estrumate');
    // La fila original no se mutó.
    expect(original.pl).toBe(1);
  });

  it('registra la corrección como issue auditable con prefijo estable, citando crudo y ambos valores', () => {
    const original = fila({ fila: 5, numero: 157, pl: 1, raw: { pl: '1', np: null, ultimaCria: null, sx: null, fechaServicio: null, toro: null, estadoRegistrado: null, tp: null, estado: null, secar: null, pp: null, ttto: null } });
    const { fila: corregida } = aplicarCorreccionesFila(original, { pl: '14' }, CONFIG);

    const issue = corregida.issues.find((i) => i.motivo.startsWith(PREFIJO_ISSUE_CORRECCION_MANUAL));
    expect(issue).toBeDefined();
    expect(issue!.crudo).toBe('1'); // lo que decía el papel
    expect(issue!.motivo).toContain('[pl]');
    expect(issue!.motivo).toContain('«1»');
    expect(issue!.motivo).toContain('«14»');
  });

  it('conserva los issues de normalización originales: corregir no borra la historia del parseo', () => {
    const original = fila({
      fila: 5,
      numero: 157,
      pl: null,
      raw: { pl: '#VALUE!', np: null, ultimaCria: null, sx: null, fechaServicio: null, toro: null, estadoRegistrado: null, tp: null, estado: null, secar: null, pp: null, ttto: null },
      issues: [{ crudo: '#VALUE!', motivo: 'PL: error de fórmula de Excel propagado (no se reinterpreta aquí)' }],
    });

    const { fila: corregida } = aplicarCorreccionesFila(original, { pl: '9' }, CONFIG);

    expect(corregida.issues).toHaveLength(2);
    expect(corregida.issues[0].motivo).toContain('error de fórmula');
    expect(corregida.issues[1].motivo.startsWith(PREFIJO_ISSUE_CORRECCION_MANUAL)).toBe(true);
  });

  it('teclear el MISMO valor no es una corrección: ni issue ni campo marcado', () => {
    const original = fila({ fila: 5, numero: 157, pl: 14, nombre: 'ALINA' });
    const { fila: corregida, camposCorregidos } = aplicarCorreccionesFila(
      original,
      { pl: '14', nombre: '  ALINA  ' },
      CONFIG,
    );
    expect(camposCorregidos).toEqual([]);
    expect(corregida.issues).toEqual([]);
  });
});

describe('aplicarCorreccionesFila — interpretación por campo (un solo parser, el del motor)', () => {
  it('vaciar PL deja "sin dato" (null), nunca 0', () => {
    const { fila: corregida, camposCorregidos } = aplicarCorreccionesFila(fila({ fila: 2, numero: 10, pl: 12 }), { pl: '' }, CONFIG);
    expect(corregida.pl).toBeNull();
    expect(camposCorregidos).toEqual(['pl']);
  });

  it('un PL ilegible NO se guarda como null en silencio: sale como error de validación', () => {
    const original = fila({ fila: 2, numero: 10, pl: 12 });
    const { fila: corregida, errores, camposCorregidos } = aplicarCorreccionesFila(original, { pl: 'doce' }, CONFIG);
    expect(camposCorregidos).toEqual([]);
    expect(corregida.pl).toBe(12); // el valor previo se conserva hasta que se corrija bien
    expect(errores).toHaveLength(1);
    expect(errores[0]).toMatchObject({ fila: 2, campo: 'pl', valorIngresado: 'doce' });
  });

  it('# Partos exige entero no negativo', () => {
    expect(aplicarCorreccionesFila(fila({ fila: 2, numero: 10 }), { numPartos: '3.5' }, CONFIG).errores[0].mensaje).toContain('entero');
    expect(aplicarCorreccionesFila(fila({ fila: 2, numero: 10 }), { numPartos: '-1' }, CONFIG).errores[0].mensaje).toContain('menor');
    expect(aplicarCorreccionesFila(fila({ fila: 2, numero: 10 }), { numPartos: '0' }, CONFIG).fila.numPartos).toBe(0);
  });

  it('SX se reinterpreta con parseSX (único intérprete) y el crudo del archivo sobrevive', () => {
    const original = fila({
      fila: 3,
      numero: 148,
      sx: parseSX('0V'),
      raw: { pl: null, np: null, ultimaCria: null, sx: '0V', fechaServicio: null, toro: null, estadoRegistrado: null, tp: null, estado: null, secar: null, pp: null, ttto: null },
    });
    const { fila: corregida } = aplicarCorreccionesFila(original, { sx: 'A 206' }, CONFIG);
    expect(corregida.sx).toEqual(parseSX('A 206'));
    expect(corregida.sx!.tipo).toBe('a_n');
    expect(corregida.sx!.numeroCria).toBe(206);
    expect(corregida.raw.sx).toBe('0V');
  });

  it('vaciar SX deja la fila sin código: null, que es "no hay evento que derivar"', () => {
    const { fila: corregida } = aplicarCorreccionesFila(fila({ fila: 3, numero: 148, sx: parseSX('OV') }), { sx: '' }, CONFIG);
    expect(corregida.sx).toBeNull();
  });

  it('corregir la fecha de servicio RE-DERIVA SECAR y Parto probable', () => {
    const original = fila({
      fila: 4,
      numero: 120,
      fechasServicio: ['2025-11-30'],
      fechaSecar: '2026-06-30',
      fechaProbableParto: '2026-08-31',
    });
    const { fila: corregida } = aplicarCorreccionesFila(original, { fechaServicio: '2026-01-10' }, CONFIG);

    expect(corregida.fechasServicio).toEqual(['2026-01-10']);
    // +9 meses (PP) y +7 meses (SECAR, con _default=2) desde el servicio nuevo.
    expect(corregida.fechaProbableParto).toBe('2026-10-10');
    expect(corregida.fechaSecar).toBe('2026-08-10');
  });

  it('reemplaza SOLO el servicio vigente y conserva los intentos anteriores (V7)', () => {
    const original = fila({ fila: 4, numero: 120, fechasServicio: ['2025-09-01', '2025-11-30'] });
    const { fila: corregida } = aplicarCorreccionesFila(original, { fechaServicio: '2026-01-10' }, CONFIG);
    expect(corregida.fechasServicio).toEqual(['2025-09-01', '2026-01-10']);
  });

  it('vaciar la fecha de servicio deja la fila sin servicio vigente y sin derivadas', () => {
    const original = fila({ fila: 4, numero: 120, fechasServicio: ['2025-11-30'], fechaSecar: '2026-06-30', fechaProbableParto: '2026-08-31' });
    const { fila: corregida } = aplicarCorreccionesFila(original, { fechaServicio: '' }, CONFIG);
    expect(corregida.fechasServicio).toEqual([]);
    expect(corregida.fechaSecar).toBeNull();
    expect(corregida.fechaProbableParto).toBeNull();
  });

  it('rechaza una fecha de servicio que no existe en el calendario', () => {
    const { errores } = aplicarCorreccionesFila(fila({ fila: 4, numero: 120 }), { fechaServicio: '2026-02-30' }, CONFIG);
    expect(errores).toHaveLength(1);
    expect(errores[0].mensaje).toContain('no es una fecha real');
  });

  it('el toro se interpreta con parseToro: el prefijo "Ins " también fija el tipo de servicio', () => {
    const { fila: corregida, camposCorregidos } = aplicarCorreccionesFila(
      fila({ fila: 8, numero: 154, toroNombre: null, tipoServicio: null }),
      { toro: 'Ins Nitro' },
      CONFIG,
    );
    expect(corregida.toroNombre).toBe('Nitro');
    expect(corregida.tipoServicio).toBe('inseminacion');
    expect(camposCorregidos).toEqual(['toro']);
  });

  it('un tipo de servicio elegido a mano le gana a lo que deduzca el texto del toro', () => {
    const { fila: corregida } = aplicarCorreccionesFila(
      fila({ fila: 8, numero: 154 }),
      { toro: 'Ins Nitro', tipoServicio: 'monta' },
      CONFIG,
    );
    expect(corregida.toroNombre).toBe('Nitro');
    expect(corregida.tipoServicio).toBe('monta');
  });

  it('un código de ESTADO tecleado en Toro se rechaza con la razón (D6: nunca es un toro)', () => {
    const { errores } = aplicarCorreccionesFila(fila({ fila: 8, numero: 154 }), { toro: 'ok' }, CONFIG);
    expect(errores).toHaveLength(1);
    expect(errores[0].mensaje).toContain('ESTADO');
  });

  it('vaciar Estado deja null ("no se llenó"), nunca vacia_apta', () => {
    const { fila: corregida } = aplicarCorreccionesFila(fila({ fila: 9, numero: 88, estado: 'vacia_problema' }), { estado: '' }, CONFIG);
    expect(corregida.estado).toBeNull();
  });

  it('rechaza un estado fuera del vocabulario ofrecido', () => {
    const { errores } = aplicarCorreccionesFila(fila({ fila: 9, numero: 88 }), { estado: 'preñada' }, CONFIG);
    expect(errores).toHaveLength(1);
  });

  it('vaciar la caravana deja la fila sin identidad (explícito, no silencioso)', () => {
    const { fila: corregida, camposCorregidos } = aplicarCorreccionesFila(fila({ fila: 9, numero: 88 }), { numero: '' }, CONFIG);
    expect(corregida.numero).toBeNull();
    expect(camposCorregidos).toEqual(['numero']);
  });

  it('rechaza una caravana no entera o cero', () => {
    expect(aplicarCorreccionesFila(fila({ fila: 9, numero: 88 }), { numero: '12,5' }, CONFIG).errores).toHaveLength(1);
    expect(aplicarCorreccionesFila(fila({ fila: 9, numero: 88 }), { numero: '0' }, CONFIG).errores).toHaveLength(1);
  });

  it('el catálogo de campos declara qué corrección puede mover la clasificación del diff', () => {
    const enDiff = CAMPOS_CORRECCION_CHEQUEO.filter((c) => c.entraEnDiff).map((c) => c.campo);
    expect(enDiff).toEqual(['nombre', 'pl', 'numPartos', 'fechaServicio', 'toro', 'tipoServicio', 'estado']);
    // `toro` se aplica ANTES que `tipoServicio` -- el orden del catálogo ES el
    // orden de aplicación y de él depende que la selección explícita gane.
    const orden = CAMPOS_CORRECCION_CHEQUEO.map((c) => c.campo);
    expect(orden.indexOf('toro')).toBeLessThan(orden.indexOf('tipoServicio'));
  });
});

describe('validarFechaChequeo', () => {
  it('acepta una fecha real pasada o de hoy', () => {
    expect(validarFechaChequeo('2026-07-20', HOY)).toEqual({ fecha: '2026-07-20', error: null });
    expect(validarFechaChequeo(HOY, HOY)).toEqual({ fecha: HOY, error: null });
  });

  it('exige la fecha: vacía es error, no un default silencioso', () => {
    const r = validarFechaChequeo('', HOY);
    expect(r.fecha).toBeNull();
    expect(r.error).toContain('obligatoria');
  });

  it('rechaza formatos y fechas inexistentes', () => {
    expect(validarFechaChequeo('20/07/2026', HOY).fecha).toBeNull();
    expect(validarFechaChequeo('2026-02-30', HOY).fecha).toBeNull();
    expect(validarFechaChequeo('2026-13-01', HOY).fecha).toBeNull();
    expect(esFechaIsoReal('2024-02-29')).toBe(true); // bisiesto real
    expect(esFechaIsoReal('2026-02-29')).toBe(false);
  });

  it('rechaza el futuro y los años fuera de rango', () => {
    expect(validarFechaChequeo('2026-08-01', HOY).error).toContain('futuro');
    expect(validarFechaChequeo('1998-08-01', HOY).error).toContain('rango');
  });
});

describe('aplicarCorreccionesHoja — fecha del chequeo y resumen', () => {
  const filas = [
    fila({ fila: 5, numero: 157, nombre: 'ALINA', pl: 12, chequeoFecha: '2026-07-29', chequeoFechaConfianza: 'aproximada' }),
    fila({ fila: 6, numero: 148, nombre: 'GALLEGA', pl: 8, chequeoFecha: '2026-07-29', chequeoFechaConfianza: 'aproximada' }),
  ];

  it('propaga la fecha fijada a TODAS las filas (no solo a la cabecera) y la marca exacta', () => {
    const { filas: corregidas, resumen } = aplicarCorreccionesHoja(filas, {}, CONFIG, '2026-07-22');

    expect(corregidas.map((f) => f.chequeoFecha)).toEqual(['2026-07-22', '2026-07-22']);
    expect(corregidas.every((f) => f.chequeoFechaConfianza === 'exacta')).toBe(true);
    expect(resumen.fechaChequeoFijadaAMano).toBe(true);
    // Cada fila queda con constancia de que la fecha la fijó una persona: es
    // la fecha que ancla sus eventos y su meses_prenez.
    for (const f of corregidas) {
      const issue = f.issues.find((i) => i.motivo.includes('[fechaChequeo]'));
      expect(issue).toBeDefined();
      expect(issue!.crudo).toBe('2026-07-29');
      expect(issue!.motivo).toContain('«2026-07-22»');
    }
  });

  it('la MISMA fecha del archivo no genera issue ni cuenta como corrección', () => {
    const { filas: corregidas, resumen } = aplicarCorreccionesHoja(filas, {}, CONFIG, '2026-07-29');
    expect(resumen.fechaChequeoFijadaAMano).toBe(false);
    expect(corregidas.flatMap((f) => f.issues)).toEqual([]);
  });

  it('resume filas y campos corregidos, y agrupa los campos por fila', () => {
    const correcciones: CorreccionesPorFila = {
      5: { pl: '14', estado: 'vacia_apta' },
      6: { nombre: 'GALLEGA II' },
    };
    const resultado = aplicarCorreccionesHoja(filas, correcciones, CONFIG);
    expect(resultado.resumen).toEqual({ filasCorregidas: 2, camposCorregidos: 3, fechaChequeoFijadaAMano: false });
    expect(resultado.camposPorFila).toEqual({ 5: ['pl', 'estado'], 6: ['nombre'] });
    expect(resultado.errores).toEqual([]);
  });

  it('acumula los errores de todas las filas', () => {
    const resultado = aplicarCorreccionesHoja(filas, { 5: { pl: 'doce' }, 6: { numPartos: 'x' } }, CONFIG);
    expect(resultado.errores.map((e) => e.fila)).toEqual([5, 6]);
  });
});

describe('composición con construirDiffChequeo — la re-clasificación en vivo usa el MISMO motor', () => {
  const animales = [animal({ id: 'a1', numero: 157, nombre: 'ALINA' })];
  const ultimos = [ultimo({ animalId: 'a1', pl: 12 })];

  it('una corrección convierte "sin_cambio" en "cambio" (y por eso sigue siendo aprobable)', () => {
    const filas = [fila({ fila: 5, numero: 157, nombre: 'ALINA', pl: 12 })];

    const antes = construirDiffChequeo(filas, animales, ultimos);
    expect(antes.filas[0].clasificacion).toBe('sin_cambio');

    const { filas: corregidas } = aplicarCorreccionesHoja(filas, { 5: { pl: '15' } }, CONFIG);
    const despues = construirDiffChequeo(corregidas, animales, ultimos);

    expect(despues.filas[0].clasificacion).toBe('cambio');
    expect(despues.filas[0].diferencias).toEqual([{ campo: 'PL', anterior: 12, nuevo: 15 }]);
    expect(compararClasificaciones(antes, despues)).toEqual([
      { fila: 5, numero: 157, antes: 'sin_cambio', despues: 'cambio' },
    ]);
  });

  it('adjudicar una colisión de chapeta corrigiendo el número vuelve AMBAS filas aprobables', () => {
    // Caso real del corpus: dos vacas distintas con la misma chapeta en la
    // misma hoja -> las dos quedan `no_reconocido`, nada se adjudica solo.
    const filas = [
      fila({ fila: 5, numero: 162, nombre: 'ESMERALDA' }),
      fila({ fila: 6, numero: 162, nombre: 'VITROLA' }),
    ];
    const hato = [animal({ id: 'a1', numero: 162, nombre: 'ESMERALDA' }), animal({ id: 'a2', numero: 163, nombre: 'VITROLA' })];

    const antes = construirDiffChequeo(filas, hato, []);
    expect(antes.filas.map((f) => f.clasificacion)).toEqual(['no_reconocido', 'no_reconocido']);
    expect(antes.colisionesEnHoja).toHaveLength(1);

    // Un humano adjudica: la segunda fila es la #163.
    const { filas: corregidas } = aplicarCorreccionesHoja(filas, { 6: { numero: '163' } }, CONFIG);
    const despues = construirDiffChequeo(corregidas, hato, []);

    expect(despues.colisionesEnHoja).toEqual([]);
    expect(despues.filas.every((f) => esClasificacionAprobable(f.clasificacion))).toBe(true);
    expect(seleccionarFilasAprobables(corregidas, despues)).toHaveLength(2);
  });

  it('una fila "nuevo" NO se vuelve aprobable corrigiendo celdas: solo la ficha del animal la habilita', () => {
    const filas = [fila({ fila: 7, numero: 500, nombre: 'NORMA', pl: 10 })];

    const sinFicha = construirDiffChequeo(filas, animales, ultimos);
    expect(sinFicha.filas[0].clasificacion).toBe('nuevo');
    expect(seleccionarFilasAprobables(filas, sinFicha)).toEqual([]);

    // Se crea la ficha (misma alta que `CrearAnimalDialog`) y se re-obtiene el
    // estado del hato: recién ahí la fila entra al alcance del commit.
    const conFicha = construirDiffChequeo(filas, [...animales, animal({ id: 'a9', numero: 500, nombre: 'NORMA' })], ultimos);
    expect(conFicha.filas[0].clasificacion).toBe('cambio');
    expect(seleccionarFilasAprobables(filas, conFicha)).toHaveLength(1);
  });

  it('una chapeta provisional (800-999) sigue no aprobable aunque se corrijan sus celdas', () => {
    const filas = [fila({ fila: 8, numero: 983, nombre: 'INDIRA', pl: 5 })];
    const { filas: corregidas } = aplicarCorreccionesHoja(filas, { 8: { pl: '9' } }, CONFIG);
    const diff = construirDiffChequeo(corregidas, animales, ultimos);
    expect(diff.filas[0].clasificacion).toBe('no_reconocido');
    expect(diff.filas[0].numeroEsProvisional).toBe(true);
    expect(seleccionarFilasAprobables(corregidas, diff)).toEqual([]);
  });

  it('seleccionarFilasAprobables envía las filas CORREGIDAS, no las del archivo', () => {
    const filas = [fila({ fila: 5, numero: 157, nombre: 'ALINA', pl: 12 })];
    const { filas: corregidas } = aplicarCorreccionesHoja(filas, { 5: { pl: '15' } }, CONFIG);
    const diff = construirDiffChequeo(corregidas, animales, ultimos);
    expect(seleccionarFilasAprobables(corregidas, diff)[0].pl).toBe(15);
  });
});

describe('detectarTorosNuevos', () => {
  it('avisa de los toros que el commit crearía en el catálogo, sin repetir ni distinguir mayúsculas', () => {
    const filas = [
      fila({ fila: 5, numero: 1, toroNombre: 'Nitro', fechasServicio: ['2026-05-01'] }),
      fila({ fila: 6, numero: 2, toroNombre: 'nitro', fechasServicio: ['2026-05-02'] }),
      fila({ fila: 7, numero: 3, toroNombre: 'Fabace', fechasServicio: ['2026-05-03'] }),
      fila({ fila: 8, numero: 4, toroNombre: 'Steem', fechasServicio: ['2026-05-04'] }),
    ];
    expect(detectarTorosNuevos(filas, ['Steem', 'Laredo'])).toEqual(['Fabace', 'Nitro']);
  });

  it('un toro sin fecha de servicio no genera evento, así que no se anuncia como alta', () => {
    const filas = [fila({ fila: 5, numero: 1, toroNombre: 'Nitro', fechasServicio: [] })];
    expect(detectarTorosNuevos(filas, [])).toEqual([]);
  });
});
