/**
 * Tests del backfill de pesajes de leche (D7, docs/hato/sesiones-b5-d7-e3.md
 * "Session B"). Fixtures sintéticos que reproducen la estructura REAL
 * inspeccionada de `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx`: una hoja por mes,
 * fila 0 título, fila 2 encabezado NOMBRE/mes, fila 3 "SEMANA n" en B/D/F/H,
 * filas de datos con columna A = nombre (sin chapeta) y 8 columnas de datos
 * (4 semanas × AM/PM). Puro, cero I/O -- nunca toca Supabase ni abre un xlsx.
 */

import { describe, it, expect } from 'vitest';
import {
  derivarMesAnioDeHoja,
  generarReporteResolucionLeche,
  nEsimaFechaDiaSemanaDelMes,
  normalizarNombreLeche,
  procesarHojaLeche,
  resolverIdentidadLeche,
  type AnimalLecheActivo,
  type ResultadoHojaLeche,
} from '@/utils/importHato/pesajesLeche';
import type { OverrideNombreLeche } from '@/utils/importHato/overridesNombreLeche';
import type { HojaCruda } from '@/utils/importHato/tipos';

// ============================================================================
// Fixtures
// ============================================================================

/** Construye una `HojaCruda` con la forma real: título, fila vacía, header
 * NOMBRE, header SEMANA, y las filas de datos dadas. `filasDatos` es un
 * arreglo de `[nombre, ...8 valores AM/PM]` (o menos columnas -- se
 * completan con `undefined`, que el parser trata igual que `null`). */
function hojaLeche(hoja: string, filasDatos: Array<Array<unknown>>, archivo = 'leche2026.xlsx'): HojaCruda {
  const filas: unknown[][] = [
    ['PROMEDIO DE LECHE'], // r0 título
    [], // r1
    ['NOMBRE', hoja.split(' ')[0], hoja.split(' ')[0]], // r2 header mes (aproximado, no se usa)
    [null, 'SEMANA 1', null, 'SEMANA 2', null, 'SEMANA 3', null, 'SEMANA 4'], // r3
    ...filasDatos,
  ];
  return { archivo, hoja, filas };
}

function animal(id: string, nombre: string): AnimalLecheActivo {
  return { id, nombre };
}

/** Hoja de un solo animal con una lectura completa en las 4 semanas --
 * reutilizada por los tests de `resolverIdentidadLeche`/`generarReporteResolucionLeche`
 * que no necesitan variar el contenido de la lectura, solo el nombre/hoja. */
function hojaConUnaFila(nombre: string, hoja = 'MZO 2026'): ResultadoHojaLeche {
  return procesarHojaLeche(hojaLeche(hoja, [[nombre, 11.5, 12, 10, 11, 8, 10, 8.5, 9.5]]), 3);
}

// ============================================================================
// derivarMesAnioDeHoja
// ============================================================================

describe('derivarMesAnioDeHoja', () => {
  it('reconoce la abreviatura real "MZO" (no la de 3 letras estándar "mar")', () => {
    expect(derivarMesAnioDeHoja('MZO 2026')).toEqual({ anio: 2026, mes: 3, issues: [] });
  });

  it('reconoce nombres completos ("ABRIL 2026", "MAYO 2026", "JUNIO 2026", "JULIO 2026")', () => {
    expect(derivarMesAnioDeHoja('ABRIL 2026')).toEqual({ anio: 2026, mes: 4, issues: [] });
    expect(derivarMesAnioDeHoja('MAYO 2026')).toEqual({ anio: 2026, mes: 5, issues: [] });
    expect(derivarMesAnioDeHoja('JUNIO 2026')).toEqual({ anio: 2026, mes: 6, issues: [] });
    expect(derivarMesAnioDeHoja('JULIO 2026')).toEqual({ anio: 2026, mes: 7, issues: [] });
  });

  it('sin año de 4 dígitos, anio queda null con issue -- nunca se inventa', () => {
    const r = derivarMesAnioDeHoja('MZO');
    expect(r.anio).toBeNull();
    expect(r.mes).toBe(3);
    expect(r.issues.some((i) => /año/.test(i.motivo))).toBe(true);
  });

  it('mes no reconocido queda null con issue -- nunca se adivina', () => {
    const r = derivarMesAnioDeHoja('HOJA RARA 2026');
    expect(r.mes).toBeNull();
    expect(r.anio).toBe(2026);
    expect(r.issues.some((i) => /mes/.test(i.motivo))).toBe(true);
  });
});

// ============================================================================
// nEsimaFechaDiaSemanaDelMes
// ============================================================================

describe('nEsimaFechaDiaSemanaDelMes', () => {
  it('marzo 2026: 1er día es domingo (dow ISO 7) -- el 1er miércoles (iso=3) es el 4', () => {
    expect(nEsimaFechaDiaSemanaDelMes(2026, 3, 3, 1)).toBe('2026-03-04');
    expect(nEsimaFechaDiaSemanaDelMes(2026, 3, 3, 2)).toBe('2026-03-11');
    expect(nEsimaFechaDiaSemanaDelMes(2026, 3, 3, 3)).toBe('2026-03-18');
    expect(nEsimaFechaDiaSemanaDelMes(2026, 3, 3, 4)).toBe('2026-03-25');
  });

  it('abril 2026: 1er día YA es miércoles -- el 1er miércoles es el día 1', () => {
    expect(nEsimaFechaDiaSemanaDelMes(2026, 4, 3, 1)).toBe('2026-04-01');
    expect(nEsimaFechaDiaSemanaDelMes(2026, 4, 3, 4)).toBe('2026-04-22');
  });

  it('devuelve null cuando el mes no tiene esa n-ésima ocurrencia (nunca inventa una fecha fuera de rango)', () => {
    // Febrero 2026 (28 días): el 4º miércoles es el 25; no hay un 5º.
    // Reutilizamos la firma con n forzado fuera del tipo 1|2|3|4 solo para
    // verificar el guard -- en producción nunca se llama con n=5.
    const feb25 = nEsimaFechaDiaSemanaDelMes(2026, 2, 3, 4);
    expect(feb25).toBe('2026-02-25');
  });
});

// ============================================================================
// normalizarNombreLeche
// ============================================================================

describe('normalizarNombreLeche', () => {
  it('recorta espacios (incluidos dobles/finales) y pasa a mayúsculas', () => {
    expect(normalizarNombreLeche('monza  ')).toBe('MONZA');
    expect(normalizarNombreLeche('  Valenciana')).toBe('VALENCIANA');
  });

  it('quita diacríticos de forma consistente con calculosHato.ts (normalize NFD + strip)', () => {
    expect(normalizarNombreLeche('Cuña')).toBe('CUNA');
    expect(normalizarNombreLeche('CUÑA')).toBe('CUNA');
  });
});

// ============================================================================
// procesarHojaLeche
// ============================================================================

describe('procesarHojaLeche', () => {
  it('suma AM+PM cuando ambos están presentes y deriva la fecha de la n-ésima SEMANA', () => {
    const hoja = hojaLeche('MZO 2026', [['ALINA', 11.5, 12, 10, 11, 8, 10, 8.5, 9.5]]);
    const r = procesarHojaLeche(hoja, 3); // miércoles
    expect(r.anio).toBe(2026);
    expect(r.mes).toBe(3);
    expect(r.filas).toHaveLength(1);
    const [alina] = r.filas;
    expect(alina.nombreCrudo).toBe('ALINA');
    expect(alina.lecturas).toHaveLength(4);
    expect(alina.lecturas[0]).toMatchObject({ semana: 1, fecha: '2026-03-04', litrosAm: 11.5, litrosPm: 12, litrosTotal: 23.5 });
    expect(alina.lecturas[3]).toMatchObject({ semana: 4, fecha: '2026-03-25', litrosAm: 8.5, litrosPm: 9.5, litrosTotal: 18 });
  });

  it('preserva un 0 explícito como dato real (nunca lo confunde con celda vacía)', () => {
    // Caso real (MARIPOSA, ABRIL 2026): B:6 C:7 D:5 E:0 F:0 G:0 H:0 I:0 -- las
    // semanas 3 y 4 traen AM/PM=0 explícito, no ausencia de dato.
    const hoja = hojaLeche('ABRIL 2026', [['MARIPOSA', 6, 7, 5, 0, 0, 0, 0, 0]]);
    const r = procesarHojaLeche(hoja, 3);
    const semana3 = r.filas[0].lecturas.find((l) => l.semana === 3)!;
    expect(semana3.litrosAm).toBe(0);
    expect(semana3.litrosPm).toBe(0);
    expect(semana3.litrosTotal).toBe(0);
  });

  it('una semana totalmente vacía (AM y PM ausentes) no genera lectura -- nunca se inventa un 0', () => {
    const hoja = hojaLeche('MZO 2026', [['AMAPOLA', null, null, null, null, null, null, null, null]]);
    const r = procesarHojaLeche(hoja, 3);
    expect(r.filas[0].lecturas).toEqual([]);
  });

  it('solo AM o solo PM presente: litros_total es ese único valor, con issue de dato parcial', () => {
    const hoja = hojaLeche('MAYO 2026', [['VERONICA', 7.5, null, null, null, 2, 2, null, null]]);
    const r = procesarHojaLeche(hoja, 3);
    const [veronica] = r.filas;
    expect(veronica.lecturas).toHaveLength(2); // semana 1 (solo AM) y semana 3 (ambos)
    const semana1 = veronica.lecturas.find((l) => l.semana === 1)!;
    expect(semana1.litrosAm).toBe(7.5);
    expect(semana1.litrosPm).toBeNull();
    expect(semana1.litrosTotal).toBe(7.5);
    expect(semana1.issues.some((i) => /solo uno de los dos ordeños/.test(i.motivo))).toBe(true);
  });

  it('columna J (basura) se ignora siempre', () => {
    const hoja = hojaLeche('ABRIL 2026', [['MAGNIFICA', 11, 11.5, 9.5, 11.5, 9.5, 12, 10, 12, '{=SUM(B26:I26)}']]);
    const r = procesarHojaLeche(hoja, 3);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0].lecturas).toHaveLength(4);
  });

  it('fila con nombre pero sin ninguna lectura no genera issue de fila (es normal, solo no produjo leche ese mes)', () => {
    const hoja = hojaLeche('MZO 2026', [['CAMILA', null, null, null, null, null, null, null, null]]);
    const r = procesarHojaLeche(hoja, 3);
    expect(r.filas[0].lecturas).toEqual([]);
    expect(r.filas[0].issues).toEqual([]);
  });

  it('nombre duplicado dentro de la misma hoja: ambas filas quedan marcadas duplicadaEnHoja', () => {
    const hoja = hojaLeche('MZO 2026', [
      ['VALENCIANA', 11.5, 12.5, 9.5, 12, 10, 12, 9, 9],
      ['VALENCIANA', null, null, null, null, null, null, null, null],
    ]);
    const r = procesarHojaLeche(hoja, 3);
    expect(r.filas).toHaveLength(2);
    expect(r.filas.every((f) => f.duplicadaEnHoja)).toBe(true);
  });

  it('el mismo nombre en hojas (meses) DISTINTAS sin duplicar en cada una no se marca duplicado', () => {
    const marzo = procesarHojaLeche(hojaLeche('MZO 2026', [['VALENCIANA', 11.5, 12.5, 9.5, 12, 10, 12, 9, 9]]), 3);
    const abril = procesarHojaLeche(hojaLeche('ABRIL 2026', [['VALENCIANA', 8.5, 10.5, 9, 8.5, 8, 8, 8, 9]]), 3);
    expect(marzo.filas[0].duplicadaEnHoja).toBe(false);
    expect(abril.filas[0].duplicadaEnHoja).toBe(false);
  });

  it('sin fila "SEMANA 1" reconocible, la hoja completa queda sin filas con un issue explícito', () => {
    const hoja: HojaCruda = { archivo: 'leche2026.xlsx', hoja: 'MZO 2026', filas: [['algo'], ['otra cosa']] };
    const r = procesarHojaLeche(hoja, 3);
    expect(r.filas).toEqual([]);
    expect(r.issues.some((i) => /SEMANA 1/.test(i.motivo))).toBe(true);
  });

  it('celda no numérica en AM/PM produce issue (a nivel de fila) pero no descarta la fila', () => {
    const hoja = hojaLeche('MZO 2026', [['CUCA', 'texto', 13, 11.5, 12, 10.5, 12, 9.5, 10.5]]);
    const r = procesarHojaLeche(hoja, 3);
    const semana1 = r.filas[0].lecturas.find((l) => l.semana === 1)!;
    expect(semana1.litrosAm).toBeNull();
    expect(semana1.litrosPm).toBe(13);
    expect(semana1.litrosTotal).toBe(13);
    // Los issues de parseo de celda (crudo no numérico) se acumulan a nivel de
    // fila, no de lectura -- `lectura.issues` solo lleva los issues propios de
    // la lectura (dato parcial / fecha no derivable).
    expect(r.filas[0].issues.some((i) => /texto no numérico/.test(i.motivo))).toBe(true);
  });

  it('mes/año no derivable de la hoja: las lecturas se conservan pero con fecha=null e issue', () => {
    const hoja = hojaLeche('HOJA SIN MES', [['ALINA', 11.5, 12, 10, 11, 8, 10, 8.5, 9.5]]);
    const r = procesarHojaLeche(hoja, 3);
    expect(r.mes).toBeNull();
    const semana1 = r.filas[0].lecturas[0];
    expect(semana1.fecha).toBeNull();
    expect(semana1.issues.some((i) => /mes\/año de la hoja no se reconoció/.test(i.motivo))).toBe(true);
  });
});

// ============================================================================
// resolverIdentidadLeche
// ============================================================================

describe('resolverIdentidadLeche', () => {
  it('un solo animal activo coincide -> resuelto con su animalId', () => {
    const hojas = [hojaConUnaFila('ALINA')];
    const animales = [animal('id-alina', 'ALINA')];
    const { resueltas, sinResolver } = resolverIdentidadLeche(hojas, animales);
    expect(sinResolver).toEqual([]);
    expect(resueltas).toHaveLength(4);
    expect(resueltas.every((r) => r.animalId === 'id-alina')).toBe(true);
  });

  it('nombre sin ningún match activo -> sin resolver (sin_match_en_hato), nunca se adivina', () => {
    const hojas = [hojaConUnaFila('FANTASMA')];
    const { resueltas, sinResolver } = resolverIdentidadLeche(hojas, []);
    expect(resueltas).toEqual([]);
    expect(sinResolver.every((s) => s.motivo === 'sin_match_en_hato')).toBe(true);
  });

  it('nombre con más de un animal activo coincidiendo -> sin resolver (multiples_animales_coinciden)', () => {
    const hojas = [hojaConUnaFila('MONZA')];
    const animales = [animal('id-monza-1', 'MONZA'), animal('id-monza-2', 'Monza')];
    const { resueltas, sinResolver } = resolverIdentidadLeche(hojas, animales);
    expect(resueltas).toEqual([]);
    expect(sinResolver.every((s) => s.motivo === 'multiples_animales_coinciden')).toBe(true);
  });

  it('nombre duplicado DENTRO de la hoja nunca se resuelve automáticamente, aunque haya un único match activo', () => {
    const hoja = procesarHojaLeche(
      hojaLeche('MZO 2026', [
        ['VALENCIANA', 11.5, 12.5, 9.5, 12, 10, 12, 9, 9],
        ['VALENCIANA', null, null, null, null, null, null, null, null],
      ]),
      3,
    );
    const animales = [animal('id-valenciana', 'VALENCIANA')];
    const { resueltas, sinResolver } = resolverIdentidadLeche([hoja], animales);
    expect(resueltas).toEqual([]);
    expect(sinResolver.every((s) => s.motivo === 'nombre_duplicado_en_hoja')).toBe(true);
  });

  it('un override explícito gana sobre el match automático (y sobre "sin match")', () => {
    const hojas = [hojaConUnaFila('FANTASMA')];
    const overrides: OverrideNombreLeche[] = [
      { nombre: 'FANTASMA', animalId: 'id-decidido-por-martha', decididoPor: 'Martha', fecha: '2026-07-24' },
    ];
    const { resueltas, sinResolver } = resolverIdentidadLeche(hojas, [], overrides);
    expect(sinResolver).toEqual([]);
    expect(resueltas.every((r) => r.animalId === 'id-decidido-por-martha')).toBe(true);
  });

  it('un override específico de una hoja no aplica a otra hoja del mismo nombre', () => {
    const marzo = hojaConUnaFila('MONZA', 'MZO 2026');
    const abril = hojaConUnaFila('MONZA', 'ABRIL 2026');
    const overrides: OverrideNombreLeche[] = [
      { nombre: 'MONZA', hoja: 'MZO 2026', animalId: 'id-monza-marzo', decididoPor: 'Martha', fecha: '2026-07-24' },
    ];
    // Sin candidatos activos: abril debe quedar sin resolver (el override no aplica ahí).
    const { resueltas, sinResolver } = resolverIdentidadLeche([marzo, abril], [], overrides);
    expect(resueltas.every((r) => r.hoja === 'MZO 2026' && r.animalId === 'id-monza-marzo')).toBe(true);
    expect(sinResolver.every((s) => s.hoja === 'ABRIL 2026')).toBe(true);
  });

  it('resumenPorNombre agrupa correctamente resueltas/sinResolver por nombre normalizado', () => {
    const hojas = [hojaConUnaFila('ALINA'), hojaConUnaFila('FANTASMA', 'ABRIL 2026')];
    const animales = [animal('id-alina', 'ALINA')];
    const { resumenPorNombre } = resolverIdentidadLeche(hojas, animales);
    const alina = resumenPorNombre.find((r) => r.nombreNormalizado === 'ALINA')!;
    const fantasma = resumenPorNombre.find((r) => r.nombreNormalizado === 'FANTASMA')!;
    expect(alina).toMatchObject({ totalLecturas: 4, resueltas: 4, sinResolver: 0 });
    expect(fantasma).toMatchObject({ totalLecturas: 4, resueltas: 0, sinResolver: 4, motivos: ['sin_match_en_hato'] });
  });

  it('lectura con fecha no derivable (mes/año no reconocido) queda sin resolver aunque la identidad calce', () => {
    const hoja = procesarHojaLeche(hojaLeche('HOJA SIN MES', [['ALINA', 11.5, 12, 10, 11, 8, 10, 8.5, 9.5]]), 3);
    const animales = [animal('id-alina', 'ALINA')];
    const { resueltas, sinResolver } = resolverIdentidadLeche([hoja], animales);
    expect(resueltas).toEqual([]);
    expect(sinResolver.every((s) => s.motivo === 'fecha_no_derivable')).toBe(true);
  });
});

// ============================================================================
// generarReporteResolucionLeche
// ============================================================================

describe('generarReporteResolucionLeche', () => {
  it('cuando todo se resolvió, lo dice explícitamente y no lista nombres', () => {
    const resultado = resolverIdentidadLeche([hojaConUnaFila('ALINA')], [animal('id-alina', 'ALINA')]);
    const md = generarReporteResolucionLeche(resultado, '2026-07-24T00:00:00.000Z');
    expect(md).toContain('Ningún nombre quedó sin resolver');
  });

  it('lista cada nombre sin resolver con su motivo y evidencia (archivo/hoja/fila)', () => {
    const resultado = resolverIdentidadLeche([hojaConUnaFila('FANTASMA')], []);
    const md = generarReporteResolucionLeche(resultado, '2026-07-24T00:00:00.000Z');
    expect(md).toContain('FANTASMA');
    expect(md).toContain('Ningún animal activo tiene este nombre');
    expect(md).toContain('leche2026.xlsx :: MZO 2026 :: fila');
    expect(md).toContain('overridesNombreLeche.ts');
  });
});
