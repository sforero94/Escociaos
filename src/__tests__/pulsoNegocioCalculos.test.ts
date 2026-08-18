// ARCHIVO: __tests__/pulsoNegocioCalculos.test.ts
// DESCRIPCIÓN: TDD de las vistas derivadas puras del bloque "Pulso por
// negocio" del Tablero General (`docs/plan_dashboard_centro_control.md` §4
// Bloque 3 / §9.2). Tres funciones, una por negocio -- ninguna hace I/O,
// ninguna reimplementa lógica que ya existe en `hatoProduccion.ts` /
// `calculosMonitoreo.ts` / `calculosGanado.ts`, sólo las compone en la
// forma que la tarjeta necesita pintar.
//
// Regla que gobierna cada caso "sin dato" de este archivo: nunca 0 -- ver
// CLAUDE.md "Number Formatting" / plan §7 señal 5 ("Ningún cero fabricado").

import { describe, it, expect } from 'vitest';
import {
  calcularPulsoHato,
  calcularPulsoAguacate,
  calcularPulsoGanado,
  formatearFechaSinAnio,
  formatearDiasTranscurridos,
  vejezPesajes,
  PLAGAS_VISIBLES_PULSO_AGUACATE,
  type FilaMonitoreoPulso,
} from '../components/dashboard/pulsoNegocioCalculos';
import type { PesajeLecheVaca } from '../utils/hatoProduccion';
import type { InventarioPotreroRow } from '../types/ganado';

// ============================================================================
// calcularPulsoHato
// ============================================================================

describe('calcularPulsoHato', () => {
  it('sin ningún pesaje devuelve null -- nunca un 0 fabricado', () => {
    expect(calcularPulsoHato([], 34, '2026-08-17')).toBeNull();
  });

  it('reproduce el caso real del encargo: 15,4 L/vaca el 12 de agosto, 27 de 34 vacas', () => {
    const pesajes: PesajeLecheVaca[] = [];
    // 27 vacas pesadas el 2026-08-12, litros_total suma 416.5 (dato real del
    // encargo). Sólo la distribución exacta por vaca no importa para el
    // cálculo del hato -- lo que se verifica es la suma/promedio, así que
    // basta con inventar 27 filas cuya suma sea 416.5.
    for (let i = 0; i < 27; i++) {
      // 26 filas de 15 L + 1 fila de 26.5 L = 416.5 L exactos, 27 vacas.
      pesajes.push({ animal_id: `vaca-${i}`, fecha: '2026-08-12', litros_total: i < 26 ? 15 : 26.5 });
    }

    const resultado = calcularPulsoHato(pesajes, 34, '2026-08-17');

    expect(resultado).not.toBeNull();
    expect(resultado!.litrosTotalHoy).toBeCloseTo(416.5, 5);
    expect(resultado!.vacasPesadasHoy).toBe(27);
    expect(resultado!.litrosPorVacaHoy).toBeCloseTo(416.5 / 27, 5); // ≈ 15.4
    expect(resultado!.vacasTotalEnOrdeno).toBe(34);
    expect(resultado!.fechaUltimoPesaje).toBe('2026-08-12');
  });

  it('el denominador de vacas totales en ordeño viene del caller, nunca se deriva de los pesajes', () => {
    const pesajes: PesajeLecheVaca[] = [{ animal_id: 'a', fecha: '2026-08-12', litros_total: 15 }];
    const resultado = calcularPulsoHato(pesajes, 34, '2026-08-17');
    expect(resultado!.vacasPesadasHoy).toBe(1); // sólo 1 vaca en los pesajes
    expect(resultado!.vacasTotalEnOrdeno).toBe(34); // el denominador es el que pasó el caller
  });

  it('la serie va en orden cronológico ascendente (más viejo primero, hoy al final)', () => {
    const pesajes: PesajeLecheVaca[] = [
      { animal_id: 'a', fecha: '2026-06-24', litros_total: 400 }, // semana -7
      { animal_id: 'a', fecha: '2026-07-01', litros_total: 410 },
      { animal_id: 'a', fecha: '2026-07-08', litros_total: 420 },
      { animal_id: 'a', fecha: '2026-07-15', litros_total: 415 },
      { animal_id: 'a', fecha: '2026-07-22', litros_total: 405 },
      { animal_id: 'a', fecha: '2026-07-29', litros_total: 411 },
      { animal_id: 'a', fecha: '2026-08-05', litros_total: 418 },
      { animal_id: 'a', fecha: '2026-08-12', litros_total: 416.5 }, // semana 0, hoy
    ];
    const resultado = calcularPulsoHato(pesajes, 34, '2026-08-17');
    expect(resultado!.serieLitrosPorVaca.length).toBe(8);
    // Última entrada = pesaje más reciente (416.5 / 1 vaca = 416.5)
    expect(resultado!.serieLitrosPorVaca[resultado!.serieLitrosPorVaca.length - 1]).toBeCloseTo(416.5, 5);
    // Primera entrada = pesaje más viejo (400 / 1 vaca = 400)
    expect(resultado!.serieLitrosPorVaca[0]).toBeCloseTo(400, 5);
  });

  it('una semana sin pesaje dentro de la ventana no entra a la serie como 0 -- se omite', () => {
    const pesajes: PesajeLecheVaca[] = [
      { animal_id: 'a', fecha: '2026-08-12', litros_total: 416.5 }, // única semana con dato
    ];
    const resultado = calcularPulsoHato(pesajes, 34, '2026-08-17');
    // Sólo la semana con dato entra a la serie -- nunca 7 ceros rellenando el resto.
    expect(resultado!.serieLitrosPorVaca).toEqual([416.5 / 1]);
  });

  it('el `fechaUltimoPesaje` devuelto es la fecha real del pesaje más reciente, ancla para `vejezPesajes`', () => {
    // La vejez del pesaje NO vive en `PulsoHatoDatos` (se calcula aparte con
    // `vejezPesajes(pesajes, hoy)`, reexportado desde este módulo) porque
    // tiene que poder mostrarse incluso cuando `calcularPulsoHato` devuelve
    // `null` (cero pesajes -- `vejezPesajes` sabe reportar ese caso con su
    // propio nivel `critico`, sin que este módulo duplique esa rama).
    const pesajes: PesajeLecheVaca[] = [{ animal_id: 'a', fecha: '2026-08-12', litros_total: 416.5 }];
    const resultado = calcularPulsoHato(pesajes, 34, '2026-08-17');
    expect(resultado!.fechaUltimoPesaje).toBe('2026-08-12');
    expect(vejezPesajes(pesajes, '2026-08-17').nivel).toBe('ok');
  });

  it('vejezPesajes reporta crítico sin ningún pesaje, para cuando calcularPulsoHato ya devolvió null', () => {
    expect(vejezPesajes([], '2026-08-17').nivel).toBe('critico');
  });
});

// ============================================================================
// calcularPulsoAguacate
// ============================================================================

function filaMonitoreo(overrides: Partial<FilaMonitoreoPulso> = {}): FilaMonitoreoPulso {
  return {
    ronda_id: 'ronda-1',
    fecha_monitoreo: '2026-08-03',
    arboles_monitoreados: 420,
    arboles_afectados: 107,
    plaga_nombre: 'Huevos de ácaro',
    ...overrides,
  };
}

describe('calcularPulsoAguacate', () => {
  it('sin filas devuelve null', () => {
    expect(calcularPulsoAguacate([])).toBeNull();
  });

  it('filas legado sin ronda_id nunca se agrupan por fecha_monitoreo -- se excluyen del pulso', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ ronda_id: null, fecha_monitoreo: '2026-08-03' }),
      filaMonitoreo({ ronda_id: null, fecha_monitoreo: '2026-08-04' }),
    ];
    expect(calcularPulsoAguacate(filas)).toBeNull();
  });

  it('reproduce el caso real: huevos de ácaro 25,5% (107/420) como plaga principal de la ronda del 3 de agosto', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ plaga_nombre: 'Huevos de ácaro', arboles_afectados: 107, arboles_monitoreados: 420 }),
      filaMonitoreo({ plaga_nombre: 'Ácaro', arboles_afectados: 67, arboles_monitoreados: 420 }),
      filaMonitoreo({ plaga_nombre: 'Monalonion', arboles_afectados: 20, arboles_monitoreados: 175 }),
    ];
    const resultado = calcularPulsoAguacate(filas);

    expect(resultado).not.toBeNull();
    expect(resultado!.rondaId).toBe('ronda-1');
    expect(resultado!.fechaRonda).toBe('2026-08-03');
    expect(resultado!.plagas[0].nombre).toBe('Huevos de ácaro');
    expect(resultado!.plagas[0].incidencia).toBeCloseTo(25.476190476, 5);
    expect(resultado!.plagas[1].nombre).toBe('Ácaro');
    expect(resultado!.plagas[1].incidencia).toBeCloseTo(15.952380952, 5);
    expect(resultado!.plagas[2].nombre).toBe('Monalonion');
    expect(resultado!.plagas[2].incidencia).toBeCloseTo(11.428571429, 5);
  });

  it('agrupa una ronda que abarca varias fechas de monitoreo en un solo grupo', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ ronda_id: 'ronda-1', fecha_monitoreo: '2026-08-01', arboles_afectados: 50, arboles_monitoreados: 200 }),
      filaMonitoreo({ ronda_id: 'ronda-1', fecha_monitoreo: '2026-08-03', arboles_afectados: 57, arboles_monitoreados: 220 }),
    ];
    const resultado = calcularPulsoAguacate(filas);
    expect(resultado!.fechaRonda).toBe('2026-08-03'); // la fecha MÁS RECIENTE de la ronda
    expect(resultado!.plagas[0].arbolesAfectados).toBe(107); // 50 + 57, sumado dentro de la misma ronda
    expect(resultado!.plagas[0].arbolesMonitoreados).toBe(420);
  });

  it('elige la ronda más reciente cuando hay varias en la ventana consultada', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ ronda_id: 'ronda-vieja', fecha_monitoreo: '2026-07-01', plaga_nombre: 'Ácaro', arboles_afectados: 10, arboles_monitoreados: 100 }),
      filaMonitoreo({ ronda_id: 'ronda-1', fecha_monitoreo: '2026-08-03', plaga_nombre: 'Huevos de ácaro', arboles_afectados: 107, arboles_monitoreados: 420 }),
    ];
    const resultado = calcularPulsoAguacate(filas);
    expect(resultado!.rondaId).toBe('ronda-1');
  });

  it('una plaga sin lectura en la ronda actual nunca aparece con 0% -- simplemente no está en la lista', () => {
    const filas: FilaMonitoreoPulso[] = [filaMonitoreo({ plaga_nombre: 'Huevos de ácaro' })];
    const resultado = calcularPulsoAguacate(filas);
    expect(resultado!.plagas.some((p) => p.nombre === 'Monalonion')).toBe(false);
  });

  it('deltaPp es null cuando la plaga no tenía lectura en la ronda anterior -- nunca se asume 0', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ ronda_id: 'ronda-vieja', fecha_monitoreo: '2026-07-01', plaga_nombre: 'Ácaro', arboles_afectados: 10, arboles_monitoreados: 100 }),
      filaMonitoreo({ ronda_id: 'ronda-1', fecha_monitoreo: '2026-08-03', plaga_nombre: 'Huevos de ácaro', arboles_afectados: 107, arboles_monitoreados: 420 }),
    ];
    const resultado = calcularPulsoAguacate(filas);
    const huevos = resultado!.plagas.find((p) => p.nombre === 'Huevos de ácaro')!;
    expect(huevos.deltaPp).toBeNull();
  });

  it('deltaPp positivo cuando la incidencia subió respecto de la ronda anterior', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ ronda_id: 'ronda-vieja', fecha_monitoreo: '2026-07-01', plaga_nombre: 'Ácaro', arboles_afectados: 10, arboles_monitoreados: 100 }), // 10%
      filaMonitoreo({ ronda_id: 'ronda-1', fecha_monitoreo: '2026-08-03', plaga_nombre: 'Ácaro', arboles_afectados: 20, arboles_monitoreados: 100 }), // 20%
    ];
    const resultado = calcularPulsoAguacate(filas);
    expect(resultado!.plagas[0].deltaPp).toBeCloseTo(10, 5);
  });

  it('clasifica gravedad con los mismos cortes de clasificarGravedad (10% / 30%)', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ plaga_nombre: 'Alta', arboles_afectados: 35, arboles_monitoreados: 100 }),
      filaMonitoreo({ plaga_nombre: 'Media', arboles_afectados: 15, arboles_monitoreados: 100 }),
      filaMonitoreo({ plaga_nombre: 'Baja', arboles_afectados: 5, arboles_monitoreados: 100 }),
    ];
    const resultado = calcularPulsoAguacate(filas);
    const porNombre = new Map(resultado!.plagas.map((p) => [p.nombre, p]));
    expect(porNombre.get('Alta')!.gravedad.numerica).toBe(3);
    expect(porNombre.get('Media')!.gravedad.numerica).toBe(2);
    expect(porNombre.get('Baja')!.gravedad.numerica).toBe(1);
  });

  it('plagas quedan ordenadas de mayor a menor incidencia', () => {
    const filas: FilaMonitoreoPulso[] = [
      filaMonitoreo({ plaga_nombre: 'Baja', arboles_afectados: 5, arboles_monitoreados: 100 }),
      filaMonitoreo({ plaga_nombre: 'Alta', arboles_afectados: 35, arboles_monitoreados: 100 }),
      filaMonitoreo({ plaga_nombre: 'Media', arboles_afectados: 15, arboles_monitoreados: 100 }),
    ];
    const resultado = calcularPulsoAguacate(filas);
    expect(resultado!.plagas.map((p) => p.nombre)).toEqual(['Alta', 'Media', 'Baja']);
  });

  it('PLAGAS_VISIBLES_PULSO_AGUACATE es 3, el tope que usa la tarjeta para principal + siguientes', () => {
    expect(PLAGAS_VISIBLES_PULSO_AGUACATE).toBe(3);
  });
});

// ============================================================================
// calcularPulsoGanado
// ============================================================================

function filaGanado(overrides: Partial<InventarioPotreroRow> = {}): InventarioPotreroRow {
  return {
    potrero_id: 'potrero-1',
    potrero: 'General',
    finca_id: 'finca-1',
    finca: 'Escocia',
    ubicacion_id: 'ubi-1',
    ubicacion: 'Ubicación 1',
    hectareas: 0,
    novillos: 0,
    toros: 0,
    peso_promedio_kg: null,
    updated_at: null,
    ...overrides,
  };
}

describe('calcularPulsoGanado', () => {
  it('sin filas devuelve null', () => {
    expect(calcularPulsoGanado([])).toBeNull();
  });

  it('reproduce el caso real: 369 cabezas = 222 novillos + 147 toros', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-escocia', finca: 'Escocia', novillos: 120, toros: 77 }), // 197
      filaGanado({ finca_id: 'f-santimp', finca: 'santimp', novillos: 40, toros: 27 }), // 67
      filaGanado({ finca_id: 'f-carrizal', finca: 'Carrizal', novillos: 30, toros: 15 }), // 45
      filaGanado({ finca_id: 'f-mochuelos', finca: 'Mochuelos', novillos: 15, toros: 8 }), // 23
      filaGanado({ finca_id: 'f-andalucia', finca: 'Andalucía', novillos: 12, toros: 7 }), // 19
      filaGanado({ finca_id: 'f-maryland', finca: 'Maryland', novillos: 5, toros: 13 }), // 18
    ];
    const resultado = calcularPulsoGanado(rows);

    expect(resultado).not.toBeNull();
    expect(resultado!.totalCabezas).toBe(369);
    expect(resultado!.totalNovillos).toBe(222);
    expect(resultado!.totalToros).toBe(147);
    expect(resultado!.porFinca.map((f) => f.finca)).toEqual([
      'Escocia', 'santimp', 'Carrizal', 'Mochuelos', 'Andalucía', 'Maryland',
    ]);
    expect(resultado!.porFinca[0].cabezas).toBe(197);
  });

  it('suma varios potreros de la misma finca en una sola barra', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-1', finca: 'Escocia', potrero_id: 'p-1', novillos: 10, toros: 0 }),
      filaGanado({ finca_id: 'f-1', finca: 'Escocia', potrero_id: 'p-2', novillos: 5, toros: 2 }),
    ];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.porFinca.length).toBe(1);
    expect(resultado!.porFinca[0].cabezas).toBe(17);
  });

  it('cabezasPorHa es null cuando todas las fincas tienen hectáreas en 0 -- nunca 0 cabezas/ha fabricado', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-1', finca: 'Escocia', hectareas: 0, novillos: 10, toros: 5 }),
      filaGanado({ finca_id: 'f-2', finca: 'santimp', hectareas: 0, novillos: 3, toros: 2 }),
    ];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.cabezasPorHa).toBeNull();
  });

  it('cabezasPorHa se calcula cuando sí hay hectáreas capturadas', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-1', finca: 'Escocia', hectareas: 10, novillos: 10, toros: 10 }),
    ];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.cabezasPorHa).toBeCloseTo(2, 5);
  });

  it('toma la fecha de actualización más reciente entre todos los potreros', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-1', finca: 'Escocia', updated_at: '2026-08-10T10:00:00Z' }),
      filaGanado({ finca_id: 'f-2', finca: 'santimp', updated_at: '2026-08-15T10:00:00Z' }),
      filaGanado({ finca_id: 'f-3', finca: 'Carrizal', updated_at: null }),
    ];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.ultimaActualizacion).toBe('2026-08-15T10:00:00Z');
  });

  it('ultimaActualizacion es null cuando ningún potrero tiene fecha -- nunca una fecha inventada', () => {
    const rows: InventarioPotreroRow[] = [filaGanado({ updated_at: null })];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.ultimaActualizacion).toBeNull();
  });

  it('las fincas quedan ordenadas de mayor a menor número de cabezas', () => {
    const rows: InventarioPotreroRow[] = [
      filaGanado({ finca_id: 'f-1', finca: 'Chica', novillos: 5, toros: 0 }),
      filaGanado({ finca_id: 'f-2', finca: 'Grande', novillos: 50, toros: 0 }),
    ];
    const resultado = calcularPulsoGanado(rows);
    expect(resultado!.porFinca.map((f) => f.finca)).toEqual(['Grande', 'Chica']);
  });
});

// ============================================================================
// Helpers de formato compartidos
// ============================================================================

describe('formatearFechaSinAnio', () => {
  it('formatea una fecha ISO sin el año, en español', () => {
    expect(formatearFechaSinAnio('2026-08-12')).toBe('12 de agosto');
  });

  it('no se desplaza un día por huso horario (bug UTC repo-wide, ver CLAUDE.md)', () => {
    expect(formatearFechaSinAnio('2026-01-01')).toBe('1 de enero');
  });
});

describe('formatearDiasTranscurridos', () => {
  it('0 días o menos se lee "hoy"', () => {
    expect(formatearDiasTranscurridos(0)).toBe('hoy');
  });

  it('1 día se lee en singular', () => {
    expect(formatearDiasTranscurridos(1)).toBe('hace 1 día');
  });

  it('varios días se leen en plural, sin redondear a semanas', () => {
    expect(formatearDiasTranscurridos(13)).toBe('hace 13 días');
  });
});
