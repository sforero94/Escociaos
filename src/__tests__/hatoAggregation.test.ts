/**
 * hatoAggregation.test.ts — S7 (Backend: Herramientas Esco, plan §7.2).
 *
 * Cubre las 3 funciones de agregación pura de
 * `src/supabase/functions/server/hato-aggregation.ts` (get_hato_animal,
 * get_hato_reproduccion, get_hato_produccion) y verifica que ambas copias
 * de `chat.tsx` (src/supabase/functions/server y
 * supabase/functions/make-server-1ccce916) registran los 3 tools nuevos —
 * mismo patrón que `ganadoInventarioEsco.test.ts` y
 * `reportesFinancierosParidad.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  shapeAnimalMatches,
  buildAnimalFicha,
  buildReproduccionSummary,
  buildProduccionSummary,
  calcularEdadMeses,
  calcularSubetapaTernera,
  construirUmbralesCategoriaHatoDesdeFilas,
  type HatoAnimalRow,
  type HatoToroRow,
  type HatoEstadoActualRow,
  type HatoEventoRow,
  type HatoChequeoVacaDetalleRow,
  type HatoPesajeRow,
  type HatoProduccionQuincenalDbRow,
  type UmbralesCategoriaHato,
  resolverLitrosQuincenal,
} from '../supabase/functions/server/hato-aggregation';
import type { HatoConfig } from '../supabase/functions/server/calculos-hato';

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

// S6 (D-13): umbrales de edad para las categorías calculadas, fuera de
// HatoConfig a propósito (ver cabecera de hato-aggregation.ts).
const UMBRALES_CATEGORIA_BASE: UmbralesCategoriaHato = {
  meses_ternera_leche_max: 3,
  meses_ternera_max: 12,
};

function animalBase(overrides: Partial<HatoAnimalRow> = {}): HatoAnimalRow {
  return {
    id: 'a1',
    numero: 47,
    nombre: 'MONA',
    sexo: 'hembra',
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    fecha_estado: null,
    fecha_nacimiento: '2019-03-01',
    fecha_nacimiento_confianza: 'exacta',
    madre_id: null,
    padre_toro_id: null,
    padre_id: null,
    origen: 'nacimiento',
    confianza: 'alta',
    notas: null,
    ...overrides,
  };
}

function estadoBase(overrides: Partial<HatoEstadoActualRow> = {}): HatoEstadoActualRow {
  return {
    animal_id: 'a1',
    numero: 47,
    nombre: 'MONA',
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 2,
    ultimo_chequeo_fecha: '2024-08-09',
    ultimo_chequeo_vaca_id: 'cv1',
    ultimo_servicio_fecha: null,
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultima_confirmacion_prenez_metodo: null,
    ultimo_aborto_fecha: null,
    ultimo_estado_chequeo: null,
    // Irrelevante para las filas con num_partos >= 1 (la regla D-13 las
    // clasifica "vaca" por el 1er parto, nunca por edad) -- mismo default
    // que `animalBase()`. Las filas que SÍ ejercitan el cálculo por edad
    // (ternera/novilla, num_partos: 0) traen su propio override explícito.
    fecha_nacimiento: '2019-03-01',
    // Corrección de precedencia (092, 2026-08-06): false por defecto -- el
    // cálculo manda, mismo comportamiento que antes de la corrección. Las
    // filas que SÍ ejercitan el override forzado lo traen explícito.
    etapa_forzada: false,
    ...overrides,
  };
}

// ============================================================================
// shapeAnimalMatches
// ============================================================================

describe('shapeAnimalMatches', () => {
  it('reduce filas de hato_animales a un resumen de coincidencias', () => {
    const animales = [animalBase({ id: 'a1', numero: 47 }), animalBase({ id: 'a2', numero: 48, nombre: 'MONA' })];
    expect(shapeAnimalMatches(animales)).toEqual([
      { id: 'a1', numero: 47, nombre: 'MONA', etapa: 'vaca', estado: 'activa' },
      { id: 'a2', numero: 48, nombre: 'MONA', etapa: 'vaca', estado: 'activa' },
    ]);
  });

  it('lista vacía para cero coincidencias', () => {
    expect(shapeAnimalMatches([])).toEqual([]);
  });
});

// ============================================================================
// buildAnimalFicha
// ============================================================================

describe('buildAnimalFicha', () => {
  it('arma la ficha completa con genealogía, estado reproductivo, eventos y último chequeo', () => {
    const madre = animalBase({ id: 'm1', numero: 12, nombre: 'ROSA' });
    const padreToro: HatoToroRow = { id: 't1', nombre: 'FABACE', tipo: 'monta', raza: 'jersey', activo: true };
    const estadoActual = estadoBase({ ultimo_servicio_fecha: '2024-08-01' });
    const eventos: HatoEventoRow[] = [
      { tipo: 'servicio', fecha: '2024-08-01', fecha_confianza: 'exacta', tipo_servicio: 'monta', cria_destino: null, toro: { nombre: 'FABACE' }, datos: null },
      { tipo: 'parto', fecha: '2023-10-01', fecha_confianza: 'exacta', tipo_servicio: null, cria_destino: 'retenida', toro: null, datos: null },
    ];
    const ultimoChequeo: HatoChequeoVacaDetalleRow = {
      pl: 3,
      num_partos: 2,
      fecha_servicio: '2024-08-01',
      toro: 'FABACE',
      tipo_servicio: 'monta',
      meses_prenez: 0,
      fecha_secar: '2025-03-01',
      fecha_probable_parto: '2025-05-01',
      estado: null,
      estado_raw: null,
      normalizacion_issues: null,
      chequeo_fecha: '2024-08-09',
    };

    const ficha = buildAnimalFicha({
      animal: animalBase({ madre_id: 'm1', padre_toro_id: 't1' }),
      madre,
      padreToro,
      padreAnimal: null,
      estadoActual,
      config: CONFIG_BASE,
      fechaReferencia: '2024-08-09',
      eventosRecientes: eventos,
      ultimoChequeo,
    });

    expect(ficha.encontrado).toBe(true);
    expect(ficha.numero).toBe(47);
    expect(ficha.numero_es_provisional).toBe(false);
    expect(ficha.genealogia.madre).toEqual({ numero: 12, nombre: 'ROSA', numero_es_provisional: false });
    expect(ficha.genealogia.padre_toro).toEqual({ nombre: 'FABACE', tipo: 'monta', raza: 'jersey' });
    expect(ficha.genealogia.padre_animal).toBeNull();
    expect(ficha.estado_reproductivo?.estado).toBe('servida');
    expect(ficha.estado_reproductivo?.fecha_referencia).toBe('2024-08-09');
    expect(ficha.ultimo_chequeo?.numero_partos).toBe(2);
    expect(ficha.ultimo_chequeo?.chequeo_fecha).toBe('2024-08-09');
    expect(ficha.eventos_recientes).toHaveLength(2);
    expect(ficha.eventos_recientes[0].toro).toBe('FABACE');
    expect(ficha.eventos_recientes[1].toro).toBeNull();
  });

  it('marca numero_es_provisional para chapetas de trabajo 800-999 (propias y de la madre)', () => {
    const ficha = buildAnimalFicha({
      animal: animalBase({ numero: 975 }),
      madre: animalBase({ id: 'm1', numero: 976, nombre: 'FRESIA' }),
      padreToro: null,
      padreAnimal: null,
      estadoActual: null,
      config: CONFIG_BASE,
      fechaReferencia: '2024-08-09',
      eventosRecientes: [],
      ultimoChequeo: null,
    });
    expect(ficha.numero_es_provisional).toBe(true);
    expect(ficha.genealogia.madre?.numero_es_provisional).toBe(true);
  });

  it('sin estadoActual (fila ausente en v_hato_estado_actual): estado_reproductivo null, nunca un valor inventado', () => {
    const ficha = buildAnimalFicha({
      animal: animalBase(),
      madre: null,
      padreToro: null,
      padreAnimal: null,
      estadoActual: null,
      config: CONFIG_BASE,
      fechaReferencia: '2024-08-09',
      eventosRecientes: [],
      ultimoChequeo: null,
    });
    expect(ficha.estado_reproductivo).toBeNull();
  });

  it('sin chequeo ni genealogía: campos correspondientes en null, no se sintetiza nada', () => {
    const ficha = buildAnimalFicha({
      animal: animalBase({ madre_id: null, padre_toro_id: null, padre_id: null }),
      madre: null,
      padreToro: null,
      padreAnimal: null,
      estadoActual: estadoBase(),
      config: CONFIG_BASE,
      fechaReferencia: '2024-08-09',
      eventosRecientes: [],
      ultimoChequeo: null,
    });
    expect(ficha.genealogia).toEqual({ madre: null, padre_toro: null, padre_animal: null });
    expect(ficha.ultimo_chequeo).toBeNull();
    expect(ficha.eventos_recientes).toEqual([]);
  });
});

// ============================================================================
// buildReproduccionSummary
// ============================================================================

describe('buildReproduccionSummary', () => {
  it('hato vacío: totales y listas en cero/vacío, nunca undefined', () => {
    const summary = buildReproduccionSummary([], CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-08-09');
    expect(summary.total_animales).toBe(0);
    expect(summary.categorias).toEqual({
      terneras: 0,
      terneras_leche: 0,
      terneras_concentrado: 0,
      terneras_edad_sin_calcular: 0,
      novillas: 0,
      hato_ordeno: 0,
      horro: 0,
      toros: 0,
    });
    expect(summary.proximos_partos).toEqual([]);
    expect(summary.proximas_a_secar).toEqual([]);
    expect(summary.inactivos).toEqual({ vendidas: 0, muertas: 0, descartadas: 0 });
  });

  it('categoriza terneras (CALCULADA por edad, D-13), novillas, hato en ordeño (incl. próxima a secar), horro (solo secas) y toros por separado', () => {
    const filas: HatoEstadoActualRow[] = [
      // Ternera: sin partos, 2 meses (< meses_ternera_leche_max=3) referida
      // a 2024-12-01 -> ternera/leche. etapa='vaca' A PROPÓSITO: D-13
      // manda que el cálculo por edad gane sobre el campo manual cuando
      // SÍ se puede resolver la edad.
      estadoBase({
        animal_id: 't1',
        numero: 200,
        nombre: 'TERNERA1',
        etapa: 'vaca',
        num_partos: 0,
        fecha_nacimiento: '2024-10-01',
      }),
      // Novilla: sin partos, ~23 meses (>= meses_ternera_max=12) -> novilla.
      estadoBase({
        animal_id: 'n1',
        numero: 201,
        nombre: 'NOVILLA1',
        etapa: 'vaca',
        num_partos: 0,
        fecha_nacimiento: '2023-01-01',
      }),
      // servida (ordeño): servicio reciente, lejos de secar
      estadoBase({ animal_id: 'o1', numero: 47, nombre: 'MONA', ultimo_servicio_fecha: '2024-08-01' }),
      // próxima a secar: sigue en ordeño -> cuenta en "hato", no en "horro"
      // (regla unificada con hatoCategorias.ts: horro = solo 'seca')
      estadoBase({ animal_id: 'h1', numero: 48, nombre: 'ROSA', ultimo_servicio_fecha: '2024-05-14' }),
      // seca (secado_real registrado) -> horro
      estadoBase({
        animal_id: 'h2',
        numero: 49,
        nombre: 'SECA1',
        ultimo_servicio_fecha: '2024-05-14',
        ultimo_secado_real_fecha: '2024-11-25',
      }),
      // toro histórico de importación (catálogo vivo es hato_toros, no cuenta en las 3 categorías)
      estadoBase({ animal_id: 'x1', numero: 5, nombre: 'NITRO', etapa: 'toro', num_partos: 0 }),
      // vendida: no cuenta en categorías activas
      estadoBase({ animal_id: 'v1', numero: 99, nombre: 'VENDIDA', estado: 'vendida' }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');
    expect(summary.total_animales).toBe(7);
    expect(summary.categorias.terneras).toBe(1);
    expect(summary.categorias.terneras_leche).toBe(1);
    expect(summary.categorias.terneras_concentrado).toBe(0);
    expect(summary.categorias.novillas).toBe(1);
    expect(summary.categorias.hato_ordeno).toBe(2);
    expect(summary.categorias.horro).toBe(1);
    expect(summary.categorias.toros).toBe(1);
    expect(summary.inactivos.vendidas).toBe(1);
  });

  it('D-13: sin partos y sin fecha_nacimiento utilizable, cae al override manual (etapa) -- nunca se inventa una edad', () => {
    const filas: HatoEstadoActualRow[] = [
      estadoBase({
        animal_id: 'o1',
        numero: 300,
        nombre: 'SINFECHA',
        etapa: 'novilla',
        num_partos: 0,
        fecha_nacimiento: null,
      }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');
    expect(summary.categorias.novillas).toBe(1);
    expect(summary.categorias.terneras).toBe(0);
  });

  it('próximos partos y próximas a secar respetan las ventanas del tablero, ordenados por días restantes', () => {
    const filas: HatoEstadoActualRow[] = [
      // PP ~2025-02-14 (servicio 2024-05-14); con referencia 2025-01-20 quedan 25 días -> dentro de ventana (30d)
      estadoBase({ animal_id: 'p1', numero: 1, nombre: 'CERCA', ultimo_servicio_fecha: '2024-05-14' }),
      // PP ~2025-05-01 (servicio 2024-08-01); con la misma referencia quedan ~100 días -> fuera de la ventana
      estadoBase({ animal_id: 'p2', numero: 2, nombre: 'LEJOS', ultimo_servicio_fecha: '2024-08-01' }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2025-01-20');
    const numerosPartos = summary.proximos_partos.map((p) => p.numero);
    expect(numerosPartos).toContain(1);
    expect(numerosPartos).not.toContain(2);
  });

  it('cuenta alertas activas y vacías-problema, respetando el motor puro (nunca reimplementado aquí)', () => {
    const filas: HatoEstadoActualRow[] = [
      // servicio >=45 días sin confirmación -> servicio_sin_confirmacion
      estadoBase({ animal_id: 's1', numero: 10, ultimo_servicio_fecha: '2024-06-01' }),
      // vacía con último chequeo explícito "vacia_problema"
      estadoBase({ animal_id: 'w1', numero: 11, ultimo_estado_chequeo: 'vacia_problema' }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-08-09');
    expect(summary.alertas_activas.servicio_sin_confirmacion).toBeGreaterThanOrEqual(1);
    expect(summary.vacias_problema).toContainEqual({ numero: 11, nombre: 'MONA', estado_reproductivo: 'vacia_por_servir' });
  });

  it('próxima a reemplazo cuando num_partos alcanza el umbral de config', () => {
    const filas: HatoEstadoActualRow[] = [estadoBase({ animal_id: 'r1', numero: 20, num_partos: 9 })];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-08-09');
    expect(summary.proximas_a_reemplazo).toEqual([{ numero: 20, nombre: 'MONA', num_partos: 9 }]);
  });

  // ==========================================================================
  // Corrección de precedencia (2026-08-06, migración 092): etapa_forzada
  // gana SIEMPRE sobre el cálculo -- mismo criterio que hatoCategorias.ts.
  // ==========================================================================

  it('etapa_forzada=true gana aunque fecha_nacimiento sea perfectamente calculable', () => {
    const filas: HatoEstadoActualRow[] = [
      // Sin la marca, esto calcularía "terneras" (2 meses referida a
      // 2024-12-01) -- exactamente el caso que la corrección arregla: una
      // fecha_nacimiento presente pero mal digitada.
      estadoBase({
        animal_id: 'f1',
        numero: 400,
        nombre: 'FORZADA1',
        etapa: 'novilla',
        num_partos: 0,
        fecha_nacimiento: '2024-10-01',
        etapa_forzada: true,
      }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');
    expect(summary.categorias.novillas).toBe(1);
    expect(summary.categorias.terneras).toBe(0);
  });

  it('etapa_forzada=true gana incluso con num_partos >= 1 (que sin forzar SIEMPRE sería "vaca")', () => {
    const filas: HatoEstadoActualRow[] = [
      estadoBase({
        animal_id: 'f2',
        numero: 401,
        nombre: 'FORZADA2',
        etapa: 'ternera',
        num_partos: 3,
        etapa_forzada: true,
      }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');
    expect(summary.categorias.terneras).toBe(1);
    expect(summary.categorias.hato_ordeno).toBe(0);
    expect(summary.categorias.horro).toBe(0);
  });

  it('etapa_forzada=true con etapa manual "vaca" cae en hato_ordeno u horro según el estado reproductivo, igual que un animal no forzado', () => {
    const filas: HatoEstadoActualRow[] = [
      estadoBase({
        animal_id: 'f3',
        numero: 402,
        nombre: 'FORZADA3',
        etapa: 'vaca',
        num_partos: 0,
        fecha_nacimiento: null,
        etapa_forzada: true,
        ultimo_servicio_fecha: '2024-05-14',
        ultimo_secado_real_fecha: '2024-11-25',
      }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');
    expect(summary.categorias.horro).toBe(1);
  });

  // ==========================================================================
  // Bugfix (2026-08-06, reconciliación chip/pestaña, mismo bug corregido en
  // hatoCategorias.ts::clasificarAnimalHato -- ver ese archivo para el
  // reporte original). `por_estado_reproductivo` venía de alimentar
  // `derivarEstadoReproductivo` con `fila.etapa` CRUDA mientras `categorias`
  // ya usaba la etapa CALCULADA -- un animal calculado como "terneras" por
  // edad, con `etapa` manual todavía en "novilla" sin corregir, contaba
  // como `novilla` en `por_estado_reproductivo` mientras `categorias.terneras`
  // ya lo tenía bien. Esco no puede reportar ese mismo desacuerdo.
  // ==========================================================================

  it('por_estado_reproductivo usa la MISMA etapa calculada que categorias -- una ternera calculada por edad (etapa manual "novilla" sin corregir) nunca cuenta como "novilla"', () => {
    const filas: HatoEstadoActualRow[] = [
      estadoBase({
        animal_id: 't2',
        numero: 500,
        nombre: 'TERNERANOVILLA',
        etapa: 'novilla', // manual, todavía sin corregir
        num_partos: 0,
        fecha_nacimiento: '2024-10-01', // 2 meses a 2024-12-01 -> ternera
        etapa_forzada: false,
      }),
    ];
    const summary = buildReproduccionSummary(filas, CONFIG_BASE, UMBRALES_CATEGORIA_BASE, '2024-12-01');

    expect(summary.categorias.terneras).toBe(1);
    expect(summary.categorias.novillas).toBe(0);
    expect(summary.por_estado_reproductivo.novilla).toBeUndefined();
    expect(summary.por_estado_reproductivo.cria).toBe(1);
  });
});

// ============================================================================
// S6 (D-13) -- calcularEdadMeses / calcularSubetapaTernera /
// construirUmbralesCategoriaHatoDesdeFilas (implementación independiente de
// `hatoCategorias.ts`, mismo contrato)
// ============================================================================

describe('calcularEdadMeses (hato-aggregation)', () => {
  it('null si fecha_nacimiento es null, no parseable, o futura', () => {
    expect(calcularEdadMeses(null, '2026-08-06')).toBeNull();
    expect(calcularEdadMeses('no es una fecha', '2026-08-06')).toBeNull();
    expect(calcularEdadMeses('2027-01-01', '2026-08-06')).toBeNull();
  });

  it('calcula meses completos, nunca negativo', () => {
    expect(calcularEdadMeses('2026-05-06', '2026-08-06')).toBe(3);
    expect(calcularEdadMeses('2026-08-06', '2026-08-06')).toBe(0);
  });
});

describe('calcularSubetapaTernera (hato-aggregation)', () => {
  it('respeta el corte de meses_ternera_leche_max, estrictamente menor que', () => {
    expect(calcularSubetapaTernera(2, UMBRALES_CATEGORIA_BASE)).toBe('leche');
    expect(calcularSubetapaTernera(3, UMBRALES_CATEGORIA_BASE)).toBe('concentrado');
  });
});

describe('construirUmbralesCategoriaHatoDesdeFilas (hato-aggregation)', () => {
  it('lanza si falta una clave -- nunca un default inventado', () => {
    expect(() => construirUmbralesCategoriaHatoDesdeFilas([{ clave: 'meses_ternera_max', valor: 12 }])).toThrow(
      /meses_ternera_leche_max/,
    );
  });
});

// ============================================================================
// buildProduccionSummary
// ============================================================================

describe('buildProduccionSummary', () => {
  it('sin pesajes ni quincenas: listas vacías, promedios null, nunca 0 fabricado', () => {
    const summary = buildProduccionSummary({ periodo: { desde: '2024-07-01', hasta: '2024-09-30' }, pesajes: [], produccionQuincenal: [] });
    expect(summary.pesajes_semanales.total_registros).toBe(0);
    expect(summary.pesajes_semanales.por_vaca).toEqual([]);
    expect(summary.pesajes_semanales.promedio_litros_por_pesaje).toBeNull();
    expect(summary.produccion_quincenal).toEqual([]);
    expect(summary.kpi_quincena_mas_reciente).toBeNull();
  });

  it('agrupa pesajes por vaca; una vaca sin pesaje en el rango simplemente no aparece (nunca litros=0)', () => {
    const pesajes: HatoPesajeRow[] = [
      { fecha: '2024-08-01', litros_am: 5, litros_pm: 4, litros_total: 9, animal: { numero: 47, nombre: 'MONA' } },
      { fecha: '2024-08-08', litros_am: 6, litros_pm: 5, litros_total: 11, animal: { numero: 47, nombre: 'MONA' } },
    ];
    const summary = buildProduccionSummary({ periodo: { desde: '2024-08-01', hasta: '2024-08-08' }, pesajes, produccionQuincenal: [] });
    expect(summary.pesajes_semanales.total_registros).toBe(2);
    expect(summary.pesajes_semanales.por_vaca).toHaveLength(1);
    expect(summary.pesajes_semanales.por_vaca[0]).toMatchObject({ numero: 47, nombre: 'MONA', num_pesajes: 2, promedio_litros: 10 });
    // ROSA (#48) no tiene pesajes en el rango -- no debe aparecer en por_vaca.
    expect(summary.pesajes_semanales.por_vaca.find((v) => v.numero === 48)).toBeUndefined();
  });

  it('calcula litros_por_vaca vía calcularProductividad y marca pendiente de conciliación cuando falta el Pomar — lee los litros de una fila medida vía el ingreso enlazado, nunca de litros_total', () => {
    const quincenas: HatoProduccionQuincenalDbRow[] = [
      // origen_dato='medido': litros_total es NULL en la tabla a propósito
      // (migración 070) -- los litros reales vienen del embed fin_ingreso.
      { anio: 2024, mes: 8, quincena: 1, fecha_inicio: '2024-08-01', fecha_fin: '2024-08-15', litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: 890, num_vacas_ordeno: 30, notas: null, fin_ingreso: { cantidad: 900 } },
      { anio: 2024, mes: 7, quincena: 2, fecha_inicio: '2024-07-16', fecha_fin: '2024-07-31', litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: null, num_vacas_ordeno: 28, notas: null, fin_ingreso: { cantidad: 850 } },
    ];
    const summary = buildProduccionSummary({ periodo: { desde: '2024-07-01', hasta: '2024-08-15' }, pesajes: [], produccionQuincenal: quincenas });
    expect(summary.produccion_quincenal).toHaveLength(2);
    // Orden desc: agosto Q1 primero.
    expect(summary.produccion_quincenal[0].mes).toBe(8);
    expect(summary.produccion_quincenal[0].litros_total).toBe(900);
    expect(summary.produccion_quincenal[0].litros_por_vaca).toBeCloseTo(30);
    expect(summary.produccion_quincenal[0].pendiente_conciliacion).toBe(false);
    expect(summary.produccion_quincenal[0].diferencia_pomar).toBe(-10);
    expect(summary.produccion_quincenal[1].pendiente_conciliacion).toBe(true);
    expect(summary.produccion_quincenal[1].diferencia_pomar).toBeNull();
    expect(summary.kpi_quincena_mas_reciente).toEqual({ anio: 2024, mes: 8, quincena: 1, litros_total: 900, litros_por_vaca: 30 });
  });

  it('litros_por_vaca es null (nunca 0) cuando falta num_vacas_ordeno', () => {
    const quincenas: HatoProduccionQuincenalDbRow[] = [
      { anio: 2024, mes: 8, quincena: 1, fecha_inicio: null, fecha_fin: null, litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: null, fin_ingreso: { cantidad: 900 } },
    ];
    const summary = buildProduccionSummary({ periodo: { desde: '2024-08-01', hasta: '2024-08-15' }, pesajes: [], produccionQuincenal: quincenas });
    expect(summary.produccion_quincenal[0].litros_por_vaca).toBeNull();
  });

  it('una fila derivado_mensual (backfill) lee los litros de litros_total, nunca del ingreso mensual enlazado', () => {
    const quincenas: HatoProduccionQuincenalDbRow[] = [
      { anio: 2023, mes: 3, quincena: 1, fecha_inicio: '2023-03-01', fecha_fin: '2023-03-15', litros_total: 3145, origen_dato: 'derivado_mensual', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: 'backfill', fin_ingreso: { cantidad: 6291 } },
    ];
    const summary = buildProduccionSummary({ periodo: { desde: '2023-03-01', hasta: '2023-03-15' }, pesajes: [], produccionQuincenal: quincenas });
    expect(summary.produccion_quincenal[0].litros_total).toBe(3145);
  });
});

describe('resolverLitrosQuincenal', () => {
  it('fila medida: lee del embed fin_ingreso.cantidad, nunca de litros_total', () => {
    const fila: HatoProduccionQuincenalDbRow = { anio: 2024, mes: 8, quincena: 1, fecha_inicio: null, fecha_fin: null, litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: null, fin_ingreso: { cantidad: 1234 } };
    expect(resolverLitrosQuincenal(fila)).toBe(1234);
  });

  it('fila medida sin embed (ingreso ausente o consulta sin join): null, nunca 0', () => {
    const fila: HatoProduccionQuincenalDbRow = { anio: 2024, mes: 8, quincena: 1, fecha_inicio: null, fecha_fin: null, litros_total: null, origen_dato: 'medido', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: null, fin_ingreso: null };
    expect(resolverLitrosQuincenal(fila)).toBeNull();
  });

  it('fila derivado_mensual: lee de litros_total, ignora el embed', () => {
    const fila: HatoProduccionQuincenalDbRow = { anio: 2023, mes: 3, quincena: 1, fecha_inicio: null, fecha_fin: null, litros_total: 3145, origen_dato: 'derivado_mensual', litros_pomar_confirmado: null, num_vacas_ordeno: null, notas: null, fin_ingreso: { cantidad: 6291 } };
    expect(resolverLitrosQuincenal(fila)).toBe(3145);
  });
});

// ============================================================================
// Integración en chat.tsx (ambas copias)
// ============================================================================

describe('integración en chat.tsx (ambas copias)', () => {
  for (const copia of ['../supabase/functions/server/chat.tsx', '../../supabase/functions/make-server-1ccce916/chat.tsx']) {
    const source = readFileSync(resolve(__dirname, copia), 'utf-8');

    it(`${copia} registra get_hato_animal, get_hato_reproduccion y get_hato_produccion`, () => {
      for (const tool of ['get_hato_animal', 'get_hato_reproduccion', 'get_hato_produccion']) {
        expect(source).toContain(`name: '${tool}'`);
        expect(source).toContain(`case '${tool}'`);
        // Mención en el system prompt (dominios de datos disponibles).
        expect(source).toContain(tool);
      }
      expect(source).toContain('buildAnimalFicha');
      expect(source).toContain('buildReproduccionSummary');
      expect(source).toContain('buildProduccionSummary');
      expect(source).toContain("from './hato-aggregation.ts'");
    });
  }
});
