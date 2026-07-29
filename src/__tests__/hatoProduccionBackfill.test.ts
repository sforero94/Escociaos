// ARCHIVO: __tests__/hatoProduccionBackfill.test.ts
// DESCRIPCIÓN: TDD del backfill de quincenas históricas de venta de leche --
// SOW 4 de `docs/plan_hato_produccion_rework.md` §5/§6. Cubre TODOS los
// invariantes enumerados al final de §5.3, incluida la corrección
// (2026-07-28) sobre la premisa original "44 -> 88" (falsa).
//
// Las cifras agregadas de 2023-01/02/03/04 (12.854 / 17.879 / 6.291 /
// 12.941 L) son las REALES del brief §5.2 -- el reparto individual entre
// filas de un mismo mes NO está documentado ahí (solo el total y el día),
// así que se inventa un reparto plausible que suma exacto al total real;
// eso es lo único que importa para probar la cascada de clasificación.

import { describe, it, expect } from 'vitest';
import {
  planificarBackfillProduccionQuincenal,
  dividirMensualEnQuincenas,
  medianaLitrosVecinos,
  diffContraEstadoExistente,
  derivarNumVacasOrdeno,
  numVacasOrdenoMedidoQuincena,
  estaEnEraPesajesMedidos,
  INICIO_ERA_PESAJES_MEDIDOS,
  FRACCION_UMBRAL_MEDIO_MES,
  MARGEN_REVISION_UMBRAL_MEDIO_MES,
  type FilaIngresoMensualCruda,
  type EntradaBackfillProduccionQuincenal,
  type FilaProduccionQuincenalExistente,
  type PesajeMinimo,
} from '@/utils/hatoProduccionBackfill';
import type { HatoConfig } from '@/utils/calculosHato';
import type { AnimalHistorico, ChequeoVacaHistorico } from '@/utils/hatoProduccion';

const CONFIG_BASE: HatoConfig = {
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

function fila(overrides: Partial<FilaIngresoMensualCruda> = {}): FilaIngresoMensualCruda {
  return { id: 'f1', fecha: '2026-01-15', cantidad: 12000, ...overrides };
}

function entradaBase(overrides: Partial<EntradaBackfillProduccionQuincenal> = {}): EntradaBackfillProduccionQuincenal {
  return {
    filasIngresoMensual: [],
    pesajes: [],
    ...overrides,
  };
}

// ============================================================================
// dividirMensualEnQuincenas -- exactitud de la partición 15/N (caso 2)
// ============================================================================

describe('dividirMensualEnQuincenas', () => {
  it('mes de 31 días: q1 + q2 == litrosMes, exacto', () => {
    const [q1, q2] = dividirMensualEnQuincenas({ anio: 2025, mes: 1, litrosMes: 12345 });
    expect(q1.litros + q2.litros).toBe(12345);
    expect(q1.litros).toBe(Math.round((12345 * 15) / 31));
  });

  it('mes de 30 días', () => {
    const [q1, q2] = dividirMensualEnQuincenas({ anio: 2025, mes: 4, litrosMes: 11800 });
    expect(q1.litros + q2.litros).toBe(11800);
  });

  it('febrero NO bisiesto (28 días)', () => {
    const [q1, q2] = dividirMensualEnQuincenas({ anio: 2025, mes: 2, litrosMes: 11201 });
    expect(q1.litros + q2.litros).toBe(11201);
    expect(q1.litros).toBe(Math.round((11201 * 15) / 28));
  });

  it('febrero bisiesto (29 días)', () => {
    const [q1, q2] = dividirMensualEnQuincenas({ anio: 2024, mes: 2, litrosMes: 11599 });
    expect(q1.litros + q2.litros).toBe(11599);
    expect(q1.litros).toBe(Math.round((11599 * 15) / 29));
  });

  it('la resta (no un segundo round) es lo que garantiza la suma exacta', () => {
    // Un valor deliberadamente propenso a deriva de redondeo si q2 también
    // se redondeara por separado.
    const [q1, q2] = dividirMensualEnQuincenas({ anio: 2025, mes: 5, litrosMes: 10001 });
    expect(q1.litros + q2.litros).toBe(10001);
  });
});

// ============================================================================
// medianaLitrosVecinos
// ============================================================================

describe('medianaLitrosVecinos', () => {
  const totales = [
    { anio: 2023, mes: 1, total: 12854 },
    { anio: 2023, mes: 2, total: 17879 },
    { anio: 2023, mes: 3, total: 6291 },
    { anio: 2023, mes: 4, total: 12941 },
    { anio: 2023, mes: 5, total: 12500 },
  ];

  it('ventana ±2 excluyendo el propio mes', () => {
    // índice 2 (2023-03): vecinos son índices 0,1,3,4 -> [12854,17879,12941,12500]
    const m = medianaLitrosVecinos(totales, 2);
    expect(m).toBe((12854 + 12941) / 2); // mediana de 4 valores ordenados
  });

  it('sin ningún vecino disponible (arreglo de un solo elemento): null', () => {
    expect(medianaLitrosVecinos([{ anio: 2023, mes: 1, total: 100 }], 0)).toBeNull();
  });

  it('en el borde del arreglo, usa solo los vecinos que existen', () => {
    // índice 0: no hay "antes", solo índices 1 y 2 dentro de la ventana.
    const m = medianaLitrosVecinos(totales, 0, 2);
    expect(m).toBe(mediana([17879, 6291]));
  });
});

function mediana(valores: number[]): number {
  const ord = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(ord.length / 2);
  return ord.length % 2 === 0 ? (ord[mid - 1] + ord[mid]) / 2 : ord[mid];
}

// ============================================================================
// planificarBackfillProduccionQuincenal -- la cascada completa
// ============================================================================

describe('planificarBackfillProduccionQuincenal -- fixture real 2023-01 a 2023-05', () => {
  // Reparto INVENTADO por fila (el brief solo da el total + el día), pero
  // los totales por mes son los REALES del brief §5.2.
  const filas: FilaIngresoMensualCruda[] = [
    // 2023-01 -- 2 filas, YA quincenal (caso 1) -- total real 12.854 L
    fila({ id: 'ene-3', fecha: '2023-01-03', cantidad: 6000 }), // día<=15 -> Q1
    fila({ id: 'ene-19', fecha: '2023-01-19', cantidad: 6854 }), // día>15 -> Q2
    // 2023-02 -- 3 filas, sub-mensual (caso 1) -- total real 17.879 L.
    // Días 20 y 28 caen en la MISMA quincena (Q2) -> deben sumarse.
    fila({ id: 'feb-6', fecha: '2023-02-06', cantidad: 5000 }), // Q1
    fila({ id: 'feb-20', fecha: '2023-02-20', cantidad: 6000 }), // Q2
    fila({ id: 'feb-28', fecha: '2023-02-28', cantidad: 6879 }), // Q2 (se suma con feb-20)
    // 2023-03 -- 1 fila, volumen ≈ medio mes (caso 3) -- REAL: 6.291 L, día 21
    fila({ id: 'mar-21', fecha: '2023-03-21', cantidad: 6291 }),
    // 2023-04 -- 2 filas, ya quincenal (caso 1) -- total real 12.941 L
    fila({ id: 'abr-3', fecha: '2023-04-03', cantidad: 6000 }), // Q1
    fila({ id: 'abr-21', fecha: '2023-04-21', cantidad: 6941 }), // Q2
    // 2023-05 -- 1 fila, volumen de mes completo -- solo para dar vecinos a
    // marzo dentro de la ventana ±2 (no forma parte del histórico real
    // citado en el brief, pero es plausible: "~11-14k").
    fila({ id: 'may-21', fecha: '2023-05-21', cantidad: 12500 }),
  ];

  const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));

  it('un mes con >1 fila NUNCA se parte: 2023-02 (3 filas) produce como máximo 2 quincenas, jamás 6', () => {
    const feb = reporte.filasDerivadas.filter((f) => f.anio === 2023 && f.mes === 2);
    expect(feb.length).toBeLessThanOrEqual(2);
    expect(feb.length).toBe(2); // Q1 (día 6) y Q2 (días 20+28 sumados)
    const q2 = feb.find((f) => f.quincena === 2)!;
    expect(q2.litros_total).toBe(6000 + 6879); // suma de las dos filas que cayeron en Q2
  });

  it('2023-01 y 2023-04 (2 filas cada uno, ya quincenales): 2 filas derivadas cada uno, sin partir', () => {
    const ene = reporte.filasDerivadas.filter((f) => f.anio === 2023 && f.mes === 1);
    const abr = reporte.filasDerivadas.filter((f) => f.anio === 2023 && f.mes === 4);
    expect(ene).toHaveLength(2);
    expect(abr).toHaveLength(2);
    expect(ene.find((f) => f.quincena === 1)!.litros_total).toBe(6000);
    expect(ene.find((f) => f.quincena === 2)!.litros_total).toBe(6854);
  });

  it('un mes de medio volumen produce UNA fila, no dos: 2023-03 -> una quincena; la otra no existe', () => {
    const marzo = reporte.filasDerivadas.filter((f) => f.anio === 2023 && f.mes === 3);
    expect(marzo).toHaveLength(1);
    expect(marzo[0].quincena).toBe(2); // día 21 -> Q2, vía resolverQuincena
    expect(marzo[0].litros_total).toBe(6291); // cargada COMPLETA, nunca partida en cuartos
    const clasificacionMarzo = reporte.clasificaciones.find((c) => c.anio === 2023 && c.mes === 3)!;
    expect(clasificacionMarzo.caso).toBe('medio_mes');
  });

  it('la suma de litros de TODAS las filas derivadas de un mes es exactamente la suma de cantidad de fin_ingresos de ese mes -- en los tres casos', () => {
    const sumaPorMes = (mes: number) =>
      reporte.filasDerivadas.filter((f) => f.anio === 2023 && f.mes === mes).reduce((acc, f) => acc + f.litros_total, 0);
    expect(sumaPorMes(1)).toBe(12854); // caso 1 (multi-fila)
    expect(sumaPorMes(2)).toBe(17879); // caso 1 (multi-fila, con merge)
    expect(sumaPorMes(3)).toBe(6291); // caso 3 (medio mes, sin partir)
    expect(sumaPorMes(4)).toBe(12941); // caso 1 (multi-fila)
  });

  it('ninguna fila derivada queda sin fin_ingreso_id', () => {
    expect(reporte.filasDerivadas.every((f) => typeof f.fin_ingreso_id === 'string' && f.fin_ingreso_id.length > 0)).toBe(true);
  });

  it('todo mes multi-fila queda marcado para revisión humana, aun con el desfase resuelto', () => {
    const mesesMultiFila = reporte.clasificaciones.filter((c) => c.caso === 'multi_fila').map((c) => c.mes);
    expect(mesesMultiFila.sort()).toEqual([1, 2, 4]);
    for (const c of reporte.clasificaciones.filter((c) => c.caso === 'multi_fila')) {
      expect(reporte.paraRevisionHumana).toContain(c);
    }
  });

  it('un mes de medio mes (caso 3) NO se marca para revisión humana -- se decidió en automático', () => {
    const marzo = reporte.clasificaciones.find((c) => c.anio === 2023 && c.mes === 3)!;
    expect(reporte.paraRevisionHumana).not.toContain(marzo);
  });
});

describe('planificarBackfillProduccionQuincenal -- caso 2 (mes completo) a través de la cascada completa', () => {
  it('mes de 1 fila con volumen consistente con sus vecinos se parte 15/N y la suma es exacta', () => {
    const filas: FilaIngresoMensualCruda[] = [
      fila({ id: 'a', fecha: '2025-11-21', cantidad: 12000 }),
      fila({ id: 'b', fecha: '2025-12-28', cantidad: 12300 }),
      fila({ id: 'c', fecha: '2026-01-28', cantidad: 11800 }), // mes bajo prueba
      fila({ id: 'd', fecha: '2026-02-28', cantidad: 12100 }),
      fila({ id: 'e', fecha: '2026-03-28', cantidad: 12500 }),
    ];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));
    const enero = reporte.filasDerivadas.filter((f) => f.anio === 2026 && f.mes === 1);
    expect(enero).toHaveLength(2);
    expect(enero.reduce((acc, f) => acc + f.litros_total, 0)).toBe(11800);
    expect(enero.every((f) => f.fin_ingreso_id === 'c')).toBe(true);
    const clasificacion = reporte.clasificaciones.find((c) => c.anio === 2026 && c.mes === 1)!;
    expect(clasificacion.caso).toBe('mes_completo');
    expect(reporte.paraRevisionHumana).not.toContain(clasificacion);
  });

  it('un mes cerca del umbral (dentro del margen) se reporta ambiguo -- NO produce filas, ni decide solo', () => {
    // Vecinos ~12000; el mes bajo prueba está justo en la banda de
    // revisión [umbral-margen, umbral+margen] = [0.55, 0.75] -> 0.65*12000=7800
    const filas: FilaIngresoMensualCruda[] = [
      fila({ id: 'a', fecha: '2025-11-21', cantidad: 12000 }),
      fila({ id: 'b', fecha: '2025-12-28', cantidad: 12000 }),
      fila({ id: 'c', fecha: '2026-01-28', cantidad: 7800 }), // ratio == umbral exacto -> ambiguo
      fila({ id: 'd', fecha: '2026-02-28', cantidad: 12000 }),
      fila({ id: 'e', fecha: '2026-03-28', cantidad: 12000 }),
    ];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));
    const enero = reporte.filasDerivadas.filter((f) => f.anio === 2026 && f.mes === 1);
    expect(enero).toHaveLength(0);
    const clasificacion = reporte.clasificaciones.find((c) => c.anio === 2026 && c.mes === 1)!;
    expect(clasificacion.caso).toBe('ambiguo');
    expect(reporte.paraRevisionHumana).toContain(clasificacion);
  });

  it('un mes de 1 fila sin ningún vecino con datos: ambiguo por falta de referencia, no se decide a ciegas', () => {
    const filas: FilaIngresoMensualCruda[] = [fila({ id: 'unico', fecha: '2023-01-21', cantidad: 9000 })];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));
    expect(reporte.filasDerivadas).toHaveLength(0);
    const clasificacion = reporte.clasificaciones[0];
    expect(clasificacion.caso).toBe('ambiguo');
    if (clasificacion.caso === 'ambiguo') {
      expect(clasificacion.ratioVecinos).toBeNull();
      expect(clasificacion.motivo).toMatch(/vecinos/);
    }
  });
});

describe('planificarBackfillProduccionQuincenal -- filas sin cantidad (histórico sin parsear)', () => {
  it('un mensual sin cantidad produce 0 filas y 1 entrada de reporte -- nunca se estima desde valor', () => {
    const filas: FilaIngresoMensualCruda[] = [fila({ id: 'sin-cantidad', fecha: '2023-06-15', cantidad: null })];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));
    expect(reporte.filasDerivadas).toHaveLength(0);
    expect(reporte.clasificaciones).toHaveLength(0); // el mes ni siquiera entra a la cascada
    expect(reporte.omitidas).toHaveLength(1);
    expect(reporte.omitidas[0]).toMatchObject({ id: 'sin-cantidad', anio: 2023, mes: 6 });
  });

  it('un mes con 1 fila sin cantidad y otra con cantidad: la sin cantidad se omite, la otra sigue su cascada normal', () => {
    const filas: FilaIngresoMensualCruda[] = [
      fila({ id: 'sin-cantidad', fecha: '2023-06-05', cantidad: null }),
      fila({ id: 'con-cantidad', fecha: '2023-06-20', cantidad: 9000 }),
    ];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));
    expect(reporte.omitidas).toHaveLength(1);
    expect(reporte.omitidas[0].id).toBe('sin-cantidad');
    // Con una sola fila VÁLIDA en el mes, entra por la rama de 1 fila (no
    // multi_fila) -- sin vecinos con datos en este fixture, cae ambiguo.
    const clasificacion = reporte.clasificaciones.find((c) => c.anio === 2023 && c.mes === 6)!;
    expect(clasificacion.caso).not.toBe('multi_fila');
  });
});

// ============================================================================
// num_vacas_ordeno -- corrección del dueño 2026-07-28: "medido donde se
// pueda, NULL en el resto" -- ver cabecera de hatoProduccionBackfill.ts.
// `derivarNumVacasOrdeno` (chequeos) queda DEFINIDA Y TESTEADA aparte, pero
// el orquestador ya NO la llama -- estos tests prueban exactamente eso.
// ============================================================================

function pesaje(overrides: Partial<PesajeMinimo> = {}): PesajeMinimo {
  return { animal_id: 'v1', fecha: '2026-03-05', ...overrides };
}

describe('estaEnEraPesajesMedidos', () => {
  it('INICIO_ERA_PESAJES_MEDIDOS es 2026-03 (pesajes desde 2026-03-04)', () => {
    expect(INICIO_ERA_PESAJES_MEDIDOS).toEqual({ anio: 2026, mes: 3 });
  });

  it('meses anteriores a la era: false', () => {
    expect(estaEnEraPesajesMedidos(2026, 2)).toBe(false);
    expect(estaEnEraPesajesMedidos(2025, 12)).toBe(false);
    expect(estaEnEraPesajesMedidos(2023, 3)).toBe(false);
  });

  it('el mes de inicio y los posteriores: true', () => {
    expect(estaEnEraPesajesMedidos(2026, 3)).toBe(true);
    expect(estaEnEraPesajesMedidos(2026, 4)).toBe(true);
    expect(estaEnEraPesajesMedidos(2027, 1)).toBe(true);
  });
});

describe('numVacasOrdenoMedidoQuincena', () => {
  it('cuenta animales DISTINTOS con al menos un pesaje en el rango -- un mismo animal pesado 2 veces cuenta 1 vez', () => {
    const pesajes: PesajeMinimo[] = [
      pesaje({ animal_id: 'v1', fecha: '2026-03-05' }),
      pesaje({ animal_id: 'v1', fecha: '2026-03-12' }), // misma vaca, otra fecha dentro del rango
      pesaje({ animal_id: 'v2', fecha: '2026-03-10' }),
    ];
    const r = numVacasOrdenoMedidoQuincena(pesajes, '2026-03-01', '2026-03-15');
    expect(r.numVacasOrdeno).toBe(2);
    expect(r.origen).toBe('medido');
  });

  it('sin ningún pesaje en el rango: null, NUNCA 0', () => {
    const pesajes: PesajeMinimo[] = [pesaje({ fecha: '2026-02-20' })]; // fuera del rango
    const r = numVacasOrdenoMedidoQuincena(pesajes, '2026-03-01', '2026-03-15');
    expect(r.numVacasOrdeno).toBeNull();
    expect(r.origen).toBeNull();
  });

  it('pesajes en OTRA quincena del mismo mes no cuentan', () => {
    const pesajes: PesajeMinimo[] = [pesaje({ fecha: '2026-03-20' })]; // Q2, no Q1
    const r = numVacasOrdenoMedidoQuincena(pesajes, '2026-03-01', '2026-03-15');
    expect(r.numVacasOrdeno).toBeNull();
  });

  it('los bordes del rango (fecha_inicio y fecha_fin) son inclusivos', () => {
    const pesajes: PesajeMinimo[] = [
      pesaje({ animal_id: 'v1', fecha: '2026-03-01' }),
      pesaje({ animal_id: 'v2', fecha: '2026-03-15' }),
    ];
    const r = numVacasOrdenoMedidoQuincena(pesajes, '2026-03-01', '2026-03-15');
    expect(r.numVacasOrdeno).toBe(2);
  });
});

describe('planificarBackfillProduccionQuincenal -- num_vacas_ordeno (era medida vs. NULL)', () => {
  // 2026-02 (2 filas, multi-fila -- caso 1, no requiere vecinos) es ANTES
  // de la era medida. 2026-03 (2 filas, multi-fila) es el primer mes DE la
  // era. Usar meses multi-fila evita tener que montar vecinos para el
  // umbral de medio mes -- lo que se está probando aquí es num_vacas_ordeno,
  // no la cascada de clasificación (ya cubierta arriba).
  const filasFeb: FilaIngresoMensualCruda[] = [
    fila({ id: 'feb-3', fecha: '2026-02-03', cantidad: 6000 }), // Q1
    fila({ id: 'feb-20', fecha: '2026-02-20', cantidad: 6200 }), // Q2
  ];
  const filasMar: FilaIngresoMensualCruda[] = [
    fila({ id: 'mar-3', fecha: '2026-03-03', cantidad: 6100 }), // Q1: 2026-03-01..15
    fila({ id: 'mar-20', fecha: '2026-03-20', cantidad: 6300 }), // Q2: 2026-03-16..31
  ];

  it('quincena ANTERIOR a la era medida: NULL/NULL SIEMPRE, incluso si por error llegaran pesajes fechados ahí', () => {
    const pesajesFueraDeEra: PesajeMinimo[] = [
      pesaje({ animal_id: 'v1', fecha: '2026-02-05' }),
      pesaje({ animal_id: 'v2', fecha: '2026-02-10' }),
    ];
    const reporte = planificarBackfillProduccionQuincenal(
      entradaBase({ filasIngresoMensual: filasFeb, pesajes: pesajesFueraDeEra }),
    );
    const feb = reporte.filasDerivadas.filter((f) => f.anio === 2026 && f.mes === 2);
    expect(feb.length).toBe(2);
    for (const q of feb) {
      expect(q.num_vacas_ordeno).toBeNull();
      expect(q.num_vacas_ordeno_origen).toBeNull();
      expect(q.notas).toMatch(/anterior a la era de pesaje medido/);
    }
  });

  it('quincena DENTRO de la era medida con pesajes en su rango: cuenta distintas, origen medido', () => {
    const pesajes: PesajeMinimo[] = [
      pesaje({ animal_id: 'v1', fecha: '2026-03-05' }), // Q1
      pesaje({ animal_id: 'v1', fecha: '2026-03-06' }), // Q1, misma vaca -- no debe duplicar
      pesaje({ animal_id: 'v2', fecha: '2026-03-10' }), // Q1
    ];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filasMar, pesajes }));
    const q1 = reporte.filasDerivadas.find((f) => f.anio === 2026 && f.mes === 3 && f.quincena === 1)!;
    expect(q1.num_vacas_ordeno).toBe(2);
    expect(q1.num_vacas_ordeno_origen).toBe('medido');
    expect(q1.notas).toMatch(/origen 'medido'/);
  });

  it('quincena DENTRO de la era medida SIN ningún pesaje en su rango: null, NUNCA 0', () => {
    const pesajes: PesajeMinimo[] = [
      pesaje({ animal_id: 'v1', fecha: '2026-03-05' }), // solo cae en Q1
    ];
    const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filasMar, pesajes }));
    const q2 = reporte.filasDerivadas.find((f) => f.anio === 2026 && f.mes === 3 && f.quincena === 2)!;
    expect(q2.num_vacas_ordeno).toBeNull();
    expect(q2.num_vacas_ordeno_origen).toBeNull();
    expect(q2.notas).toMatch(/sin lecturas en este rango/);
  });
});

// ============================================================================
// derivarNumVacasOrdeno -- conservada (chequeos), NO llamada por el
// backfill (corrección 2026-07-28). Se testea directamente, sin pasar por
// el orquestador -- ver su docstring para el motivo completo.
// ============================================================================

describe('derivarNumVacasOrdeno (no usada por el backfill hoy -- conservada, ver docstring)', () => {
  function animal(overrides: Partial<AnimalHistorico> = {}): AnimalHistorico {
    return { id: 'a1', etapa: 'vaca', raza: 'jersey', estado: 'activa', fecha_estado: null, ...overrides };
  }

  it('sin NINGÚN chequeo antes del corte: NULL, no 0 -- cobertura insuficiente', () => {
    const r = derivarNumVacasOrdeno([animal()], [], [], CONFIG_BASE, '2026-01-28');
    expect(r.numVacasOrdeno).toBeNull();
    expect(r.origen).toBeNull();
  });

  it('con cobertura suficiente: el conteo, con origen derivado_chequeos', () => {
    const animales: AnimalHistorico[] = [animal({ id: 'v1' }), animal({ id: 'v2' })];
    const chequeoVacas: ChequeoVacaHistorico[] = [
      { animal_id: 'v1', fecha: '2025-06-01', estado: null },
      { animal_id: 'v2', fecha: '2025-06-01', estado: null },
    ];
    const r = derivarNumVacasOrdeno(animales, [], chequeoVacas, CONFIG_BASE, '2026-01-28');
    expect(r.numVacasOrdeno).toBe(2);
    expect(r.origen).toBe('derivado_chequeos');
    expect(r.anclaChequeo).toBe('2025-06-01');
  });

  it('mayoría de animales sin fecha determinable (riesgo R-2): NULL aunque haya ancla de chequeo', () => {
    const animales: AnimalHistorico[] = [
      animal({ id: 'v1' }),
      animal({ id: 'v2', estado: 'vendida', fecha_estado: null }),
      animal({ id: 'v3', estado: 'vendida', fecha_estado: null }),
      animal({ id: 'v4', estado: 'vendida', fecha_estado: null }),
    ];
    const chequeoVacas: ChequeoVacaHistorico[] = [{ animal_id: 'v1', fecha: '2025-06-01', estado: null }];
    const r = derivarNumVacasOrdeno(animales, [], chequeoVacas, CONFIG_BASE, '2026-01-28');
    expect(r.numVacasOrdeno).toBeNull();
    expect(r.origen).toBeNull();
  });
});

// ============================================================================
// Idempotencia -- diffContraEstadoExistente
// ============================================================================

describe('diffContraEstadoExistente', () => {
  const filas: FilaIngresoMensualCruda[] = [
    fila({ id: 'a', fecha: '2025-11-21', cantidad: 12000 }),
    fila({ id: 'b', fecha: '2025-12-28', cantidad: 12000 }),
    fila({ id: 'c', fecha: '2026-01-28', cantidad: 12000 }),
    fila({ id: 'd', fecha: '2026-02-28', cantidad: 12000 }),
  ];
  const reporte = planificarBackfillProduccionQuincenal(entradaBase({ filasIngresoMensual: filas }));

  it('primera corrida (nada en la base): todo va a aInsertar', () => {
    const diff = diffContraEstadoExistente(reporte.filasDerivadas, []);
    expect(diff.aInsertar).toHaveLength(reporte.filasDerivadas.length);
    expect(diff.sinCambios).toHaveLength(0);
    expect(diff.divergentes).toHaveLength(0);
    expect(diff.respetadasPorSerMedidas).toHaveLength(0);
  });

  it('re-correr sobre un estado ya aplicado produce 0 escrituras (0 aInsertar, 0 divergentes)', () => {
    const existentes: FilaProduccionQuincenalExistente[] = reporte.filasDerivadas.map((f, i) => ({
      id: `existente-${i}`,
      anio: f.anio,
      mes: f.mes,
      quincena: f.quincena,
      origen_dato: 'derivado_mensual',
      litros_total: f.litros_total,
      fin_ingreso_id: f.fin_ingreso_id,
      num_vacas_ordeno: f.num_vacas_ordeno,
    }));
    const diff = diffContraEstadoExistente(reporte.filasDerivadas, existentes);
    expect(diff.aInsertar).toHaveLength(0);
    expect(diff.divergentes).toHaveLength(0);
    expect(diff.sinCambios).toHaveLength(reporte.filasDerivadas.length);
  });

  it('un periodo que ya tiene una fila MEDIDA se respeta -- nunca se pisa', () => {
    const primero = reporte.filasDerivadas[0];
    const existentes: FilaProduccionQuincenalExistente[] = [
      {
        id: 'medida-1',
        anio: primero.anio,
        mes: primero.mes,
        quincena: primero.quincena,
        origen_dato: 'medido',
        litros_total: null, // una fila medida nunca guarda litros_total (070)
        fin_ingreso_id: 'otro-ingreso',
        num_vacas_ordeno: 99,
      },
    ];
    const diff = diffContraEstadoExistente(reporte.filasDerivadas, existentes);
    expect(diff.respetadasPorSerMedidas).toHaveLength(1);
    expect(diff.respetadasPorSerMedidas[0].propuesta).toBe(primero);
    expect(diff.aInsertar).not.toContain(primero);
  });

  it('un periodo derivado existente con valores distintos a la propuesta actual: divergente, no se sobrescribe solo', () => {
    const primero = reporte.filasDerivadas[0];
    const existentes: FilaProduccionQuincenalExistente[] = [
      {
        id: 'derivada-vieja',
        anio: primero.anio,
        mes: primero.mes,
        quincena: primero.quincena,
        origen_dato: 'derivado_mensual',
        litros_total: primero.litros_total + 500, // el histórico cambió entre corridas
        fin_ingreso_id: primero.fin_ingreso_id,
        num_vacas_ordeno: primero.num_vacas_ordeno,
      },
    ];
    const diff = diffContraEstadoExistente(reporte.filasDerivadas, existentes);
    expect(diff.divergentes).toHaveLength(1);
    expect(diff.sinCambios).toHaveLength(0);
  });
});

// ============================================================================
// Guard de las constantes del umbral -- documentadas, no mágicas
// ============================================================================

describe('constantes del umbral de medio mes', () => {
  it('están declaradas y calibran el caso real conocido (2023-03: razón ~0,49)', () => {
    const ratioReal2023_03 = 6291 / ((12854 + 12941) / 2); // mediana de sus vecinos más cercanos en el fixture real
    expect(ratioReal2023_03).toBeLessThan(FRACCION_UMBRAL_MEDIO_MES - MARGEN_REVISION_UMBRAL_MEDIO_MES);
  });
});
