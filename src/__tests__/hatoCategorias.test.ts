// ARCHIVO: __tests__/hatoCategorias.test.ts
// DESCRIPCIÓN: TDD de `clasificarCategoriaHato` -- las 3 categorías de
// inventario pedidas por el dueño (terneras / hato / horro, decisión
// 2026-07-22, ver cabecera de `hatoCategorias.ts` para la asunción
// documentada sobre el límite hato/horro).
//
// S6 (D-13, docs/plan_hato_ronda_agosto_2026.md §0/§4): las categorías
// ternera/novilla/vaca dejan de leerse directo del campo manual `etapa` y
// pasan a CALCULARSE de `num_partos` + `fecha_nacimiento`, con `etapa`
// como override manual fácil cuando el cálculo no puede resolver la edad
// (fecha de nacimiento ausente o imposible). `clasificarCategoriaHato`
// en sí no cambia -- sigue resolviendo hato/horro sobre la etapa YA
// resuelta -- así que sus tests de arriba no se tocan.
//
// Corrección de precedencia (2026-08-06, migración 092): `calcularEtapaHato`
// gana un parámetro `etapaForzada` -- cuando es `true`, `etapaManual` GANA
// siempre, sin mirar num_partos ni fecha_nacimiento. Ver la nota de cabecera
// en `hatoCategorias.ts` para el porqué (una fecha_nacimiento PRESENTE pero
// mal digitada no tenía forma de corregirse antes de esta corrección).

import { describe, it, expect } from 'vitest';
import {
  clasificarCategoriaHato,
  calcularEdadMeses,
  calcularSubetapaTernera,
  calcularEtapaHato,
  construirUmbralesCategoriaHatoDesdeFilas,
  type UmbralesCategoriaHato,
} from '../utils/hatoCategorias';
import type { EstadoReproductivo } from '../utils/calculosHato';

describe('clasificarCategoriaHato', () => {
  it('clasifica una ternera como "ternera" sin importar el estado reproductivo', () => {
    expect(clasificarCategoriaHato('ternera', 'cria')).toBe('ternera');
  });

  it('clasifica una vaca seca (secado_real registrado) como "horro"', () => {
    expect(clasificarCategoriaHato('vaca', 'seca')).toBe('horro');
  });

  it('clasifica una vaca "proxima_a_secar" como "hato" -- todavía no se secó', () => {
    expect(clasificarCategoriaHato('vaca', 'proxima_a_secar')).toBe('hato');
  });

  const estadosActivosNoSecos: EstadoReproductivo[] = [
    'novilla',
    'servida',
    'preñada',
    'parida_reciente',
    'vacia_por_servir',
    'indeterminado',
  ];
  it.each(estadosActivosNoSecos)('clasifica una vaca en estado "%s" como "hato"', (estado) => {
    expect(clasificarCategoriaHato('vaca', estado)).toBe('hato');
  });

  const estadosTerminales: EstadoReproductivo[] = ['vendida', 'muerta', 'descartada'];
  it.each(estadosTerminales)('no clasifica un animal en estado terminal "%s" (null)', (estado) => {
    expect(clasificarCategoriaHato('vaca', estado)).toBeNull();
    expect(clasificarCategoriaHato('novilla', estado)).toBeNull();
  });

  it('una novilla activa cae en "novilla" -- categoría propia (decisión del dueño, tercera ronda 2026-07-22)', () => {
    expect(clasificarCategoriaHato('novilla', 'novilla')).toBe('novilla');
  });

  it('una novilla seca (caso raro) sigue siendo "novilla" -- la etapa manda antes que el estado', () => {
    expect(clasificarCategoriaHato('novilla', 'seca')).toBe('novilla');
  });
});

// ============================================================================
// S6 (D-13) -- construirUmbralesCategoriaHatoDesdeFilas
// ============================================================================

describe('construirUmbralesCategoriaHatoDesdeFilas', () => {
  it('lee las 2 claves numéricas de hato_config', () => {
    const umbrales = construirUmbralesCategoriaHatoDesdeFilas([
      { clave: 'meses_ternera_leche_max', valor: 3 },
      { clave: 'meses_ternera_max', valor: 12 },
    ]);
    expect(umbrales).toEqual<UmbralesCategoriaHato>({ meses_ternera_leche_max: 3, meses_ternera_max: 12 });
  });

  it('lanza un único error listando TODAS las claves faltantes -- nunca un default inventado', () => {
    expect(() => construirUmbralesCategoriaHatoDesdeFilas([])).toThrow(
      /meses_ternera_leche_max.*meses_ternera_max|meses_ternera_max.*meses_ternera_leche_max/s,
    );
  });

  it('lanza si una clave llega mal tipada (no numérica)', () => {
    expect(() =>
      construirUmbralesCategoriaHatoDesdeFilas([
        { clave: 'meses_ternera_leche_max', valor: '3' },
        { clave: 'meses_ternera_max', valor: 12 },
      ]),
    ).toThrow(/meses_ternera_leche_max/);
  });
});

// ============================================================================
// S6 (D-13) -- calcularEdadMeses
// ============================================================================

describe('calcularEdadMeses', () => {
  it('devuelve null si fecha_nacimiento es null', () => {
    expect(calcularEdadMeses(null, '2026-08-06')).toBeNull();
  });

  it('devuelve null si fecha_nacimiento es una fecha futura (dato imposible)', () => {
    expect(calcularEdadMeses('2027-01-01', '2026-08-06')).toBeNull();
  });

  it('devuelve null si fecha_nacimiento no se puede parsear', () => {
    expect(calcularEdadMeses('no es una fecha', '2026-08-06')).toBeNull();
  });

  it('calcula meses completos exactos', () => {
    expect(calcularEdadMeses('2026-05-06', '2026-08-06')).toBe(3);
  });

  it('no redondea hacia arriba antes de cumplir el mes -- un día antes del aniversario mensual cuenta el mes anterior', () => {
    expect(calcularEdadMeses('2026-05-07', '2026-08-06')).toBe(2);
  });

  it('un recién nacido (misma fecha) da 0 meses, nunca negativo', () => {
    expect(calcularEdadMeses('2026-08-06', '2026-08-06')).toBe(0);
  });

  it('calcula meses a través de un cambio de año', () => {
    expect(calcularEdadMeses('2025-11-15', '2026-02-10')).toBe(2);
  });
});

// ============================================================================
// S6 (D-13) -- calcularSubetapaTernera
// ============================================================================

describe('calcularSubetapaTernera', () => {
  const umbrales: UmbralesCategoriaHato = { meses_ternera_leche_max: 3, meses_ternera_max: 12 };

  it('menos de meses_ternera_leche_max es "leche"', () => {
    expect(calcularSubetapaTernera(0, umbrales)).toBe('leche');
    expect(calcularSubetapaTernera(2, umbrales)).toBe('leche');
  });

  it('meses_ternera_leche_max exacto ya es "concentrado" (corte estrictamente menor que)', () => {
    expect(calcularSubetapaTernera(3, umbrales)).toBe('concentrado');
  });

  it('hasta el borde de meses_ternera_max sigue siendo "concentrado"', () => {
    expect(calcularSubetapaTernera(11, umbrales)).toBe('concentrado');
  });
});

// ============================================================================
// S6 (D-13) -- calcularEtapaHato (orquestador: calculada con override manual)
// ============================================================================

describe('calcularEtapaHato', () => {
  const umbrales: UmbralesCategoriaHato = { meses_ternera_leche_max: 3, meses_ternera_max: 12 };
  const HOY = '2026-08-06';

  it('num_partos >= 1 siempre es "vaca" calculada, sin mirar fecha_nacimiento', () => {
    const resultado = calcularEtapaHato('novilla', false, 1, null, umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'vaca', origen: 'calculado', subetapaTernera: null });
  });

  it('sin partos y edad < meses_ternera_leche_max -> ternera/leche calculada', () => {
    const resultado = calcularEtapaHato('ternera', false, 0, '2026-06-06', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'ternera', origen: 'calculado', subetapaTernera: 'leche' });
  });

  it('sin partos y meses_ternera_leche_max <= edad < meses_ternera_max -> ternera/concentrado calculada', () => {
    const resultado = calcularEtapaHato('ternera', false, 0, '2026-02-06', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'ternera', origen: 'calculado', subetapaTernera: 'concentrado' });
  });

  it('sin partos y edad >= meses_ternera_max -> novilla calculada', () => {
    const resultado = calcularEtapaHato('ternera', false, 0, '2024-01-06', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'novilla', origen: 'calculado', subetapaTernera: null });
  });

  it('sin partos y fecha_nacimiento ausente -> override manual (respeta la etapa ya editada)', () => {
    const resultado = calcularEtapaHato('novilla', false, 0, null, umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'novilla', origen: 'override_manual', subetapaTernera: null });
  });

  it('sin partos y fecha_nacimiento imposible (futura) -> override manual, nunca inventa una edad', () => {
    const resultado = calcularEtapaHato('ternera', false, 0, '2027-01-01', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'ternera', origen: 'override_manual', subetapaTernera: null });
  });

  it('caso real de cobertura (plan §2, VICTORIA-style): partos ganan aunque la etapa manual esté desactualizada', () => {
    // Un animal con etapa manual "novilla" pero que ya tuvo un parto -- el
    // cálculo por partos manda, exactamente el bug que S1 corrigió a mano
    // para VICTORIA antes de que existiera este motor.
    const resultado = calcularEtapaHato('novilla', false, 1, '2020-01-01', umbrales, HOY);
    expect(resultado.etapa).toBe('vaca');
    expect(resultado.origen).toBe('calculado');
  });

  // ==========================================================================
  // Corrección de precedencia (2026-08-06, migración 092): `etapaForzada`
  // gana SIEMPRE sobre el cálculo -- decisión del dueño tras revisar S6.
  // ==========================================================================

  it('etapaForzada=true gana aunque fecha_nacimiento sea perfectamente calculable (el caso que S6 dejó sin arreglo)', () => {
    // fecha_nacimiento calcularía "ternera" (2 meses) si no estuviera
    // forzada -- exactamente el caso de una fecha mal digitada que el
    // cálculo no puede distinguir de una buena.
    const resultado = calcularEtapaHato('novilla', true, 0, '2026-06-06', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'novilla', origen: 'override_manual', subetapaTernera: null });
  });

  it('etapaForzada=true gana incluso con num_partos >= 1 (que sin forzar SIEMPRE sería "vaca")', () => {
    const resultado = calcularEtapaHato('novilla', true, 3, '2020-01-01', umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'novilla', origen: 'override_manual', subetapaTernera: null });
  });

  it('etapaForzada=true con etapaManual="vaca" -> vaca forzada, subetapaTernera null', () => {
    const resultado = calcularEtapaHato('vaca', true, 0, null, umbrales, HOY);
    expect(resultado).toEqual({ etapa: 'vaca', origen: 'override_manual', subetapaTernera: null });
  });

  it('etapaForzada=false se comporta EXACTAMENTE igual que antes de la corrección (regresión)', () => {
    const conForzadaFalse = calcularEtapaHato('ternera', false, 0, '2026-02-06', umbrales, HOY);
    expect(conForzadaFalse).toEqual({ etapa: 'ternera', origen: 'calculado', subetapaTernera: 'concentrado' });
  });
});
