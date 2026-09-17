import { describe, it, expect } from 'vitest';
import {
  formatearListaNombres,
  formatearRangoHecho,
  frasearNovedad,
  frasearHatoEventos,
  frasearHatoPesajesLeche,
  frasearHatoTratamientos,
  frasearHatoChequeos,
  frasearRegistrosTrabajo,
  frasearMonitoreos,
  frasearMovimientosDiarios,
  frasearFinGastos,
} from '@/utils/novedades/frases';
import type { Novedad } from '@/utils/novedades/tipos';

/**
 * Una prueba por plantilla (§13.2 del plan técnico): ninguna cifra sin su
 * unidad, el literal exacto "sin autor registrado", el corte a 3 nombres +
 * "y N más", y el denominador del pesaje que NUNCA desaparece (ni con 0).
 */

function novedad(sobrescribir: Partial<Novedad>): Novedad {
  return {
    id: 'id-por-defecto',
    fuente: 'fin_gastos',
    modulo: 'finanzas',
    tipoHecho: 'gasto',
    autorId: 'autor-1',
    autorNombre: 'Consuelo Ramírez',
    autorTextoLibre: null,
    canal: null,
    capturadoEn: '2026-09-12T10:00:00Z',
    fechasHecho: ['2026-09-12'],
    conFechaFutura: false,
    objetosNombre: [],
    tamano: { filas: 1 },
    ruta: null,
    ...sobrescribir,
  };
}

describe('formatearListaNombres — hasta 3, luego "y N más"', () => {
  it('un nombre', () => expect(formatearListaNombres(['ELECTRA (#117)'])).toBe('ELECTRA (#117)'));
  it('dos nombres', () => expect(formatearListaNombres(['A', 'B'])).toBe('A y B'));
  it('tres nombres', () => expect(formatearListaNombres(['A', 'B', 'C'])).toBe('A, B y C'));
  it('cuatro nombres -- corta a 3 + "y 1 más"', () =>
    expect(formatearListaNombres(['A', 'B', 'C', 'D'])).toBe('A, B, C y 1 más'));
  it('seis nombres -- "y 3 más"', () =>
    expect(formatearListaNombres(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C y 3 más'));
  it('lista vacía', () => expect(formatearListaNombres([])).toBe(''));
});

describe('formatearRangoHecho — año sólo cuando la fecha lo exige', () => {
  it('una sola fecha, mismo año de captura -- sin año', () => {
    expect(formatearRangoHecho(['2026-09-12'], '2026-09-12T10:00:00Z')).toBe('12 de septiembre');
  });

  it('rango dentro del mismo año de captura -- sin año en ninguna punta', () => {
    expect(formatearRangoHecho(['2026-09-07', '2026-09-12'], '2026-09-12T13:00:00Z')).toBe(
      '7 de septiembre al 12 de septiembre',
    );
  });

  it('rango que cruza el año de captura -- año en LAS DOS puntas (el caso del 15-sep)', () => {
    expect(formatearRangoHecho(['2025-09-14', '2026-09-14'], '2026-09-15T08:37:00Z')).toBe(
      '14 de septiembre de 2025 al 14 de septiembre de 2026',
    );
  });

  it('sin fechas -- string vacío, nunca "varios días"', () => {
    expect(formatearRangoHecho([], '2026-09-12T10:00:00Z')).toBe('');
  });
});

describe('frasearNovedad — despacho y "sin autor registrado"', () => {
  it('despacha por fuente', () => {
    const n = novedad({ fuente: 'fin_gastos' });
    expect(frasearNovedad(n)).toEqual(frasearFinGastos(n));
  });

  it('lanza si la fuente no tiene plantilla, nunca un texto genérico inventado', () => {
    const n = novedad({ fuente: 'no-existe' as Novedad['fuente'] });
    expect(() => frasearNovedad(n)).toThrow();
  });

  it('un autor sin resolver imprime el literal "sin autor registrado", nunca "Sistema"', () => {
    const n = novedad({ autorId: null, autorNombre: null });
    expect(frasearFinGastos(n).texto).toContain('sin autor registrado');
    expect(frasearFinGastos(n).texto).not.toContain('Sistema');
  });
});

describe('frasearHatoEventos', () => {
  it('singular, con objeto nombrado -- "Martha Vega registró un servicio de ELECTRA (#117)"', () => {
    const n = novedad({
      fuente: 'hato_eventos', modulo: 'hato_lechero', tipoHecho: 'servicio',
      autorNombre: 'Martha Vega', canal: 'telegram', fechasHecho: ['2026-08-11'],
      objetosNombre: ['ELECTRA (#117)'], tamano: { filas: 1 },
    });
    const { texto, detalle } = frasearHatoEventos(n);
    expect(texto).toBe('Martha Vega registró un servicio de ELECTRA (#117)');
    // El detalle lleva un verbo, nunca una fecha pelada (brief §4.1:
    // "inseminación del 11 de agosto"). El pipeline no distingue
    // monta/inseminación (esa sub-distinción vive en tipo_servicio y no
    // viaja por Novedad), así que el sustantivo coincide con el de la
    // línea 1 ("servicio"), no con el ejemplo ilustrativo exacto.
    expect(detalle).toBe('servicio del 11 de agosto · por Telegram');
  });

  it('plural, con hasta 3 nombres y "y N más"', () => {
    const n = novedad({
      fuente: 'hato_eventos', tipoHecho: 'parto', autorNombre: 'Martha Vega',
      objetosNombre: ['A', 'B', 'C', 'D'], tamano: { filas: 4 },
    });
    expect(frasearHatoEventos(n).texto).toBe('Martha Vega registró 4 partos de A, B, C y 1 más');
  });

  it('el detalle lleva el verbo correcto por tipo (parto, secado, muerte)', () => {
    const parto = novedad({ fuente: 'hato_eventos', tipoHecho: 'parto', fechasHecho: ['2026-08-29'], canal: null });
    expect(frasearHatoEventos(parto).detalle).toBe('parto del 29 de agosto');
    const secado = novedad({ fuente: 'hato_eventos', tipoHecho: 'secado_real', fechasHecho: ['2026-08-29'], canal: null });
    expect(frasearHatoEventos(secado).detalle).toBe('secado del 29 de agosto');
    const muerte = novedad({ fuente: 'hato_eventos', tipoHecho: 'muerte', fechasHecho: ['2026-08-29'], canal: null });
    expect(frasearHatoEventos(muerte).detalle).toBe('muerte del 29 de agosto');
  });

  it('un tipoHecho fuera del catálogo nunca inventa palabra: usa el valor crudo', () => {
    const n = novedad({ fuente: 'hato_eventos', tipoHecho: 'algo_nuevo', tamano: { filas: 1 }, canal: null });
    expect(frasearHatoEventos(n).texto).toContain('un registro de algo_nuevo');
    // Sin verbo mapeado, el detalle cae a la fecha sola -- nunca inventa un verbo.
    expect(frasearHatoEventos(n).detalle).not.toMatch(/^algo_nuevo del/);
  });

  it('con fecha futura, el detalle termina en "con fecha futura"', () => {
    const n = novedad({ fuente: 'hato_eventos', tipoHecho: 'servicio', conFechaFutura: true });
    expect(frasearHatoEventos(n).detalle.endsWith('con fecha futura')).toBe(true);
  });
});

describe('frasearHatoPesajesLeche — el denominador nunca desaparece', () => {
  it('52 de 65 vacas', () => {
    const n = novedad({
      fuente: 'hato_pesajes_leche', autorNombre: 'Martha Vega', fechasHecho: ['2026-08-27'],
      tamano: { filas: 52, denominador: 65 },
    });
    const { texto, detalle } = frasearHatoPesajesLeche(n);
    expect(texto).toBe('Martha Vega registró el pesaje del 27 de agosto');
    expect(detalle).toContain('52 de 65 vacas');
  });

  it('denominador 0 -- sigue mostrándose, nunca se omite', () => {
    const n = novedad({ fuente: 'hato_pesajes_leche', tamano: { filas: 3, denominador: 0 } });
    expect(frasearHatoPesajesLeche(n).detalle).toContain('3 de 0 vacas');
  });
});

describe('frasearHatoTratamientos', () => {
  // Guardrail 2026-09-17 (Santiago): "martha vega registro un tratamiento"
  // no dice qué vaca -- el nombre del animal es obligatorio en el texto.
  it('singular, con el animal nombrado -- "Martha Vega registró un tratamiento de COPITA (#166)"', () => {
    const n = novedad({
      fuente: 'hato_tratamientos', autorNombre: 'Martha Vega', fechasHecho: ['2026-09-15'], canal: 'web',
      objetosNombre: ['COPITA (#166)'], tamano: { filas: 1 },
    });
    const { texto, detalle } = frasearHatoTratamientos(n);
    expect(texto).toBe('Martha Vega registró un tratamiento de COPITA (#166)');
    expect(detalle).toContain('inicio 15 de septiembre');
    expect(detalle).toContain('por la web');
  });

  it('plural, hasta 3 animales -- "Martha registró 3 tratamientos de A, B y C"', () => {
    const n = novedad({ fuente: 'hato_tratamientos', autorNombre: 'Martha', objetosNombre: ['A', 'B', 'C'], tamano: { filas: 3 } });
    expect(frasearHatoTratamientos(n).texto).toBe('Martha registró 3 tratamientos de A, B y C');
  });

  it('sin animal resuelto (fila huérfana): omite la cláusula entera, nunca "de undefined"', () => {
    const n = novedad({ fuente: 'hato_tratamientos', autorNombre: 'Martha', objetosNombre: [], tamano: { filas: 3 } });
    expect(frasearHatoTratamientos(n).texto).toBe('Martha registró 3 tratamientos');
  });
});

describe('frasearHatoChequeos', () => {
  it('"Martha subió el chequeo del 8 de septiembre · 35 vacas"', () => {
    const n = novedad({ fuente: 'hato_chequeos', autorNombre: 'Martha', fechasHecho: ['2026-09-08'], tamano: { filas: 35 } });
    const { texto, detalle } = frasearHatoChequeos(n);
    expect(texto).toBe('Martha subió el chequeo del 8 de septiembre');
    expect(detalle).toContain('35 vacas');
  });
});

describe('frasearRegistrosTrabajo', () => {
  // Guardrail 2026-09-17 (Santiago): "X jornales Y personas" no dice EN QUÉ
  // labor -- `objetosNombre` (nombre de tarea) es obligatorio en el texto,
  // y el conteo de personas viaja aparte en `tamano.personas` (nunca
  // `tamano.objetos`, que ahora cuenta labores distintas).
  it('"David García registró 8 jornales en Drench Septiembre para 8 personas"', () => {
    const n = novedad({
      fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', autorNombre: 'David García',
      fechasHecho: ['2026-09-14'], objetosNombre: ['Drench Septiembre'], tamano: { filas: 8, personas: 8 },
    });
    expect(frasearRegistrosTrabajo(n).texto).toBe('David García registró 8 jornales en Drench Septiembre para 8 personas');
  });

  it('varias labores -- hasta 3 + "y N más", mismo mecanismo que los animales', () => {
    const n = novedad({
      fuente: 'registros_trabajo', autorNombre: 'David García',
      objetosNombre: ['Recolección cosecha', 'Drench Septiembre', 'Clasificación', 'Apoyo finca'],
      tamano: { filas: 43.5, personas: 9 },
    });
    expect(frasearRegistrosTrabajo(n).texto).toBe(
      'David García registró 43,5 jornales en Recolección cosecha, Drench Septiembre, Clasificación y 1 más para 9 personas',
    );
  });

  it('sin labor resuelta (fila huérfana): omite la cláusula "en ...", nunca "en undefined"', () => {
    const n = novedad({ fuente: 'registros_trabajo', autorNombre: 'David García', objetosNombre: [], tamano: { filas: 8, personas: 8 } });
    expect(frasearRegistrosTrabajo(n).texto).toBe('David García registró 8 jornales para 8 personas');
  });

  it('1 jornal de 1 persona -- singular correcto', () => {
    const n = novedad({ fuente: 'registros_trabajo', autorNombre: 'David', objetosNombre: ['Poda'], tamano: { filas: 1, personas: 1 } });
    expect(frasearRegistrosTrabajo(n).texto).toBe('David registró 1 jornal en Poda para 1 persona');
  });

  it('el rango de fechas del hecho, con el año cuando difiere (el caso del 15-sep)', () => {
    const n = novedad({
      fuente: 'registros_trabajo', autorNombre: 'David García',
      capturadoEn: '2026-09-15T08:37:00Z', fechasHecho: ['2025-09-14', '2026-09-14'],
      objetosNombre: ['Recolección cosecha'], tamano: { filas: 8, personas: 8 },
    });
    expect(frasearRegistrosTrabajo(n).detalle).toBe(
      'trabajo del 14 de septiembre de 2025 al 14 de septiembre de 2026',
    );
  });
});

describe('frasearMonitoreos', () => {
  it('"David registró la ronda del 29 de agosto · 44 lecturas · monitor: Efrain"', () => {
    const n = novedad({
      fuente: 'monitoreos', modulo: 'aguacate', tipoHecho: 'ronda', autorNombre: 'David',
      fechasHecho: ['2026-08-29'], objetosNombre: ['Efrain'], tamano: { filas: 44 },
    });
    const { texto, detalle } = frasearMonitoreos(n);
    expect(texto).toBe('David registró la ronda del 29 de agosto');
    expect(detalle).toContain('44 lecturas');
    expect(detalle).toContain('monitor: Efrain');
  });

  it('sin monitor conocido -- se omite, nunca "monitor: "', () => {
    const n = novedad({ fuente: 'monitoreos', autorNombre: 'David', objetosNombre: [], tamano: { filas: 10 } });
    expect(frasearMonitoreos(n).detalle).not.toContain('monitor:');
  });
});

describe('frasearMovimientosDiarios', () => {
  // Guardrail 2026-09-17 (Santiago): "2 lotes" no dice CUÁLES -- el nombre
  // del lote pasa al texto, mismo mecanismo de lista que las labores/animales.
  it('"David registró la ejecución del 15 de septiembre en Lote 1 y Lote 2"', () => {
    const n = novedad({
      fuente: 'movimientos_diarios', modulo: 'aguacate', tipoHecho: 'ejecucion', autorNombre: 'David',
      fechasHecho: ['2026-09-15'], objetosNombre: ['Lote 1', 'Lote 2'], tamano: { filas: 2, objetos: 2 },
    });
    expect(frasearMovimientosDiarios(n).texto).toBe('David registró la ejecución del 15 de septiembre en Lote 1 y Lote 2');
  });

  it('sin lote resuelto: omite la cláusula "en ...", nunca "en undefined"', () => {
    const n = novedad({ fuente: 'movimientos_diarios', autorNombre: 'David', fechasHecho: ['2026-09-15'], objetosNombre: [], tamano: { filas: 1 } });
    expect(frasearMovimientosDiarios(n).texto).toBe('David registró la ejecución del 15 de septiembre');
  });
});

describe('frasearFinGastos', () => {
  // Guardrail 2026-09-17 (Santiago): "15 gastos" no dice por cuánto -- el
  // total, formateado como moneda colombiana de línea (nunca abreviado a
  // millones -- eso es para KPIs agregados, no para el total de una sesión).
  it('"Consuelito registró 15 gastos por $4.250.000"', () => {
    const n = novedad({ fuente: 'fin_gastos', autorNombre: 'Consuelito', tamano: { filas: 15, montoTotal: 4_250_000 } });
    expect(frasearFinGastos(n).texto).toBe('Consuelito registró 15 gastos por $4.250.000');
  });

  it('1 gasto -- singular correcto, con su propio total', () => {
    const n = novedad({ fuente: 'fin_gastos', autorNombre: 'Consuelito', tamano: { filas: 1, montoTotal: 89_900 } });
    expect(frasearFinGastos(n).texto).toBe('Consuelito registró 1 gasto por $89.900');
  });

  it('sin monto resuelto: omite el total, nunca "$undefined" ni "$0" inventado', () => {
    const n = novedad({ fuente: 'fin_gastos', autorNombre: 'Consuelito', tamano: { filas: 3 } });
    expect(frasearFinGastos(n).texto).toBe('Consuelito registró 3 gastos');
  });
});
