// ARCHIVO: __tests__/hatoProduccion.test.ts
// DESCRIPCIÓN: TDD del motor puro de producción del rework del submódulo
// Producción (Hato Lechero) -- SOW 2 de
// `docs/plan_hato_produccion_rework.md` §4.2/§6. Cubre los casos
// obligatorios enumerados en §6 SOW 2 más los casos adicionales que se
// consideraron necesarios para no dejar huecos en "sin dato, nunca 0" y en
// la trampa de unidades (R-4).

import { describe, it, expect } from 'vitest';
import {
  ordenarConNulosAlFinal,
  ventanaSemanasDe,
  ventanaDiasRanking,
  rendimientoPorVaca,
  semanasDesdeParto,
  curvaVaca,
  curvaLactanciaHato,
  MINIMO_VACAS_BUCKET_CURVA,
  vejezPesajes,
  fechaAnclaProduccion,
  proyectarHato,
  promedioLitrosPorVaca,
  reconstruirEstadoAFecha,
  contarVacasEnOrdenoAFecha,
  resolverLitrosQuincenal,
  calcularPrecioUnitarioQuincena,
  validarCabezasVentaAnimales,
  clasificarIngresoHato,
  repartoVentasHato,
  promedioProductividadQuincenal,
  detalleQuincenaVenta,
  diasPeriodoVentaHato,
  filtrarHistorialPorPeriodo,
  filtrarIngresosPorPeriodo,
  fechaAnclaVentasHato,
  rangoPeriodoVentaHato,
  aplicaRetencionIcaLeche,
  calcularNetoConIca,
  calcularPrecioBrutoLitro,
  type PesajeLecheVaca,
  type AnimalHistorico,
  type EventoHistorico,
  type ChequeoVacaHistorico,
  type EstadoReproductivoProyeccion,
  type FilaProduccionQuincenalCruda,
  type IngresoHatoParaReparto,
  type SemanaProyeccion,
} from '@/utils/hatoProduccion';
import type { HatoConfig } from '@/utils/calculosHato';

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

function pesaje(overrides: Partial<PesajeLecheVaca> = {}): PesajeLecheVaca {
  return { animal_id: 'v1', fecha: '2026-07-01', litros_total: 10, ...overrides };
}

// ============================================================================
// ordenarConNulosAlFinal
// ============================================================================

describe('ordenarConNulosAlFinal', () => {
  const filas = [
    { id: 'a', v: 5 as number | null },
    { id: 'b', v: null },
    { id: 'c', v: 20 as number | null },
    { id: 'd', v: null },
    { id: 'e', v: 10 as number | null },
  ];

  it('manda las null al final en orden ascendente', () => {
    const r = ordenarConNulosAlFinal(filas, (f) => f.v, 'asc');
    expect(r.map((f) => f.id)).toEqual(['a', 'e', 'c', 'b', 'd']);
  });

  it('manda las null al final en orden descendente también -- nunca al principio', () => {
    const r = ordenarConNulosAlFinal(filas, (f) => f.v, 'desc');
    expect(r.map((f) => f.id)).toEqual(['c', 'e', 'a', 'b', 'd']);
  });

  it('todas null: no revienta y conserva el orden original', () => {
    const soloNulas = [{ id: 'x', v: null as number | null }, { id: 'y', v: null }];
    expect(ordenarConNulosAlFinal(soloNulas, (f) => f.v, 'asc').map((f) => f.id)).toEqual(['x', 'y']);
  });
});

describe('ventanaSemanasDe', () => {
  it('mapea las 3 ventanas de ranking (decisión 12) a semanas', () => {
    expect(ventanaSemanasDe('semana')).toBe(1);
    expect(ventanaSemanasDe('mes')).toBe(4);
    expect(ventanaSemanasDe('trimestre')).toBe(13);
  });
});

describe('ventanaDiasRanking', () => {
  it('semana/mes/trimestre: igual que ventanaSemanasDe(ventana) * 7 -- sin cambios de comportamiento', () => {
    expect(ventanaDiasRanking('semana', '2026-06-30')).toBe(7);
    expect(ventanaDiasRanking('mes', '2026-06-30')).toBe(28);
    expect(ventanaDiasRanking('trimestre', '2026-06-30')).toBe(91);
  });

  it('ytd: NO es un número fijo de semanas -- días entre el 1 de enero del año del ancla y el ancla', () => {
    // 2026-01-01 -> 2026-06-30: enero(31)+feb(28)+mar(31)+abr(30)+may(31) = 151 días transcurridos + 29 de junio = 180
    expect(ventanaDiasRanking('ytd', '2026-06-30')).toBe(180);
  });

  it('ytd: varía con el ancla -- distinto de la ventana fija de las otras 3', () => {
    expect(ventanaDiasRanking('ytd', '2026-01-15')).toBe(14);
    expect(ventanaDiasRanking('ytd', '2026-12-31')).toBe(364);
  });
});

// ============================================================================
// a) rendimientoPorVaca
// ============================================================================

describe('rendimientoPorVaca', () => {
  it('ventana sin pesajes recientes -> actual es null, NUNCA 0', () => {
    const pesajes = [pesaje({ fecha: '2026-01-01', litros_total: 15 })]; // muy vieja, fuera de la ventana de 4 semanas
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-07-01');
    expect(r).toHaveLength(1);
    expect(r[0].actual).toBeNull();
    expect(r[0].nPesajesVentana).toBe(0);
    // Pero SÍ sigue visible con su potencial (todo el historial, sin parto).
    expect(r[0].potencial).toBe(15);
  });

  it('vaca sin parto usable: sigue visible, lactanciaConocida=false, potencial sobre TODO el historial', () => {
    const pesajes = [
      pesaje({ fecha: '2026-06-01', litros_total: 12 }),
      pesaje({ fecha: '2026-06-15', litros_total: 18 }),
    ];
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-07-01', { ventanaSemanas: 52 });
    expect(r).toHaveLength(1);
    expect(r[0].lactanciaConocida).toBe(false);
    expect(r[0].semanasDesdeParto).toBeNull();
    expect(r[0].potencial).toBe(18); // pico sobre todo el historial, no solo desde un parto
  });

  it('con parto conocido: potencial es el pico SOLO desde el último parto, no de toda la historia', () => {
    const pesajes = [
      pesaje({ fecha: '2026-01-01', litros_total: 40 }), // lactancia anterior, pico alto
      pesaje({ fecha: '2026-06-05', litros_total: 12 }),
      pesaje({ fecha: '2026-06-20', litros_total: 18 }),
    ];
    const partos = new Map([['v1', '2026-06-01']]);
    const r = rendimientoPorVaca(pesajes, partos, '2026-07-01', { ventanaSemanas: 52 });
    expect(r[0].lactanciaConocida).toBe(true);
    expect(r[0].potencial).toBe(18); // NO 40 -- ese pesaje es de la lactancia anterior
  });

  it('promedia SOLO sobre las filas presentes en la ventana -- una semana sin pesar no cuenta como 0', () => {
    // Ventana de 2 semanas terminando en 2026-07-15: solo el pesaje del 10 cae dentro.
    const pesajes = [
      pesaje({ fecha: '2026-06-20', litros_total: 100 }), // fuera de ventana
      pesaje({ fecha: '2026-07-10', litros_total: 20 }),
    ];
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-07-15', { ventanaSemanas: 2 });
    expect(r[0].actual).toBe(20); // promedio de UNA fila, no de (100+20)/2 ni de 20/2
    expect(r[0].nPesajesVentana).toBe(1);
  });

  it('nunca mira al futuro: un pesaje con fecha posterior a fechaReferencia se ignora por completo', () => {
    const pesajes = [pesaje({ fecha: '2026-08-01', litros_total: 999 })];
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-07-01');
    expect(r).toHaveLength(0); // la vaca ni siquiera aparece: su único pesaje es futuro
  });

  it('sin pesajes en absoluto: no produce ninguna fila (universo lo define pesajes, no un catálogo de vacas)', () => {
    expect(rendimientoPorVaca([], new Map(), '2026-07-01')).toEqual([]);
  });

  it('ventanaDias toma precedencia sobre ventanaSemanas cuando ambas vienen informadas (soporte YTD)', () => {
    const pesajes = [
      pesaje({ fecha: '2026-06-20', litros_total: 100 }), // fuera de una ventana de 2 días
      pesaje({ fecha: '2026-07-10', litros_total: 20 }),
    ];
    // ventanaSemanas=52 (todo el año) diría que ambas caen dentro -- ventanaDias=2 debe ganar y dejar solo la última.
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-07-10', { ventanaSemanas: 52, ventanaDias: 2 });
    expect(r[0].actual).toBe(20);
    expect(r[0].nPesajesVentana).toBe(1);
  });

  it('ventanaDias admite un valor que no es múltiplo de 7 (YTD real no cabe en semanas completas)', () => {
    const pesajes = [
      pesaje({ fecha: '2026-01-01', litros_total: 30 }),
      pesaje({ fecha: '2026-06-30', litros_total: 20 }),
    ];
    // ventanaDiasRanking('ytd', '2026-06-30') = 180 -- el pesaje del 1 de enero (diferenciaDias=180) cae
    // justo en el borde EXCLUSIVO de rendimientoPorVaca (`< ventanaDias`, no `<=`); el del 30 de junio sí entra.
    const r = rendimientoPorVaca(pesajes, new Map(), '2026-06-30', { ventanaDias: 180 });
    expect(r[0].nPesajesVentana).toBe(1);
    expect(r[0].actual).toBe(20);
  });
});

// ============================================================================
// b) semanasDesdeParto / curvaVaca / curvaLactanciaHato
// ============================================================================

describe('semanasDesdeParto', () => {
  it('floor(dias/7) -- 7 días exactos es semana 1, no 0', () => {
    expect(semanasDesdeParto('2026-06-08', '2026-06-01')).toBe(1);
  });
  it('0-6 días es semana 0', () => {
    expect(semanasDesdeParto('2026-06-06', '2026-06-01')).toBe(0);
    expect(semanasDesdeParto('2026-06-01', '2026-06-01')).toBe(0);
  });
  it('pesaje anterior al parto da negativo (floor, no truncamiento hacia 0)', () => {
    expect(semanasDesdeParto('2026-05-25', '2026-06-01')).toBe(-1);
  });
});

describe('curvaVaca', () => {
  it('excluye pesajes anteriores al parto -- nunca grafica semana negativa', () => {
    const pesajes = [
      pesaje({ fecha: '2026-05-20', litros_total: 30 }), // antes del parto
      pesaje({ fecha: '2026-06-05', litros_total: 12 }),
      pesaje({ fecha: '2026-06-19', litros_total: 15 }),
    ];
    const curva = curvaVaca(pesajes, '2026-06-01');
    expect(curva).toEqual([
      { semana: 0, litros: 12 },
      { semana: 2, litros: 15 },
    ]);
  });

  it('vaca sin ningún pesaje: curva vacía, no revienta', () => {
    expect(curvaVaca([], '2026-06-01')).toEqual([]);
  });
});

describe('curvaLactanciaHato', () => {
  it('bucket con menos de 3 vacas -> litros null, muestra insuficiente (nunca promedio de 1-2 vacas)', () => {
    const partos = new Map([
      ['v1', '2026-06-01'],
      ['v2', '2026-06-01'],
    ]);
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-06-08', litros_total: 10 }),
      pesaje({ animal_id: 'v2', fecha: '2026-06-08', litros_total: 20 }),
    ];
    const curva = curvaLactanciaHato(pesajes, partos);
    expect(curva).toHaveLength(1);
    expect(curva[0]).toEqual({ semana: 1, litros: null, nVacas: 2 });
  });

  it('bucket con exactamente el mínimo (3) SÍ promedia', () => {
    const partos = new Map([
      ['v1', '2026-06-01'],
      ['v2', '2026-06-01'],
      ['v3', '2026-06-01'],
    ]);
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-06-08', litros_total: 10 }),
      pesaje({ animal_id: 'v2', fecha: '2026-06-08', litros_total: 20 }),
      pesaje({ animal_id: 'v3', fecha: '2026-06-08', litros_total: 30 }),
    ];
    const curva = curvaLactanciaHato(pesajes, partos);
    expect(curva[0]).toEqual({ semana: 1, litros: 20, nVacas: 3 });
    expect(MINIMO_VACAS_BUCKET_CURVA).toBe(3);
  });

  it('vaca sin parto usable (no está en el mapa) queda EXCLUIDA de la curva del hato', () => {
    const partos = new Map([
      ['v1', '2026-06-01'],
      ['v2', '2026-06-01'],
      ['v3', '2026-06-01'],
      // v4 sin parto conocido -- no aparece en el mapa.
    ]);
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-06-08', litros_total: 10 }),
      pesaje({ animal_id: 'v2', fecha: '2026-06-08', litros_total: 20 }),
      pesaje({ animal_id: 'v3', fecha: '2026-06-08', litros_total: 30 }),
      pesaje({ animal_id: 'v4', fecha: '2026-06-08', litros_total: 1000 }), // debe ser invisible aquí
    ];
    const curva = curvaLactanciaHato(pesajes, partos);
    expect(curva[0].nVacas).toBe(3); // v4 no cuenta
    expect(curva[0].litros).toBe(20); // el promedio (10+20+30)/3, no contaminado por 1000
  });

  it('historial vacío: curva vacía', () => {
    expect(curvaLactanciaHato([], new Map())).toEqual([]);
  });
});

// ============================================================================
// d) vejezPesajes
// ============================================================================

describe('vejezPesajes', () => {
  it('sin ningún pesaje: critico, sin fecha ni semanas fabricadas', () => {
    expect(vejezPesajes([], '2026-07-28')).toEqual({ ultimaFecha: null, semanas: null, nivel: 'critico' });
  });

  it('último pesaje hace <= 1 semana: ok', () => {
    const r = vejezPesajes([pesaje({ fecha: '2026-07-22' })], '2026-07-28');
    expect(r.nivel).toBe('ok');
    expect(r.semanas).toBe(0);
  });

  it('último pesaje hace 2-3 semanas: atrasado', () => {
    const r = vejezPesajes([pesaje({ fecha: '2026-07-07' })], '2026-07-28');
    expect(r.semanas).toBe(3);
    expect(r.nivel).toBe('atrasado');
  });

  it('último pesaje hace >= 4 semanas: critico -- caso real del brief (última fila 2026-06-24, hoy 2026-07-28)', () => {
    const r = vejezPesajes([pesaje({ fecha: '2026-06-24' })], '2026-07-28');
    expect(r.ultimaFecha).toBe('2026-06-24');
    expect(r.semanas).toBe(4);
    expect(r.nivel).toBe('critico');
  });

  it('usa la fecha MÁS RECIENTE entre varias vacas, no la primera del arreglo', () => {
    const r = vejezPesajes(
      [pesaje({ fecha: '2026-07-01' }), pesaje({ fecha: '2026-07-20' }), pesaje({ fecha: '2026-07-10' })],
      '2026-07-28',
    );
    expect(r.ultimaFecha).toBe('2026-07-20');
  });
});

// ============================================================================
// FIX 3 (QA rework) -- fechaAnclaProduccion
// ============================================================================

describe('fechaAnclaProduccion', () => {
  it('con pesajes: ancla al MÁS RECIENTE, no a "hoy" -- caso real del brief (última fila 2026-06-24, hoy 2026-07-28)', () => {
    const pesajes = [
      pesaje({ fecha: '2026-05-01' }),
      pesaje({ fecha: '2026-06-24' }),
      pesaje({ fecha: '2026-06-10' }),
    ];
    expect(fechaAnclaProduccion(pesajes, '2026-07-28')).toBe('2026-06-24');
  });

  it('sin ningún pesaje: cae de vuelta en "hoy" -- no hay otra ancla posible (arranque, no backlog)', () => {
    expect(fechaAnclaProduccion([], '2026-07-28')).toBe('2026-07-28');
  });

  it('el pesaje más reciente puede ser posterior a "hoy" en el fixture (no filtra futuro -- ese filtro vive en rendimientoPorVaca/proyectarHato)', () => {
    const pesajes = [pesaje({ fecha: '2026-08-01' })];
    expect(fechaAnclaProduccion(pesajes, '2026-07-28')).toBe('2026-08-01');
  });
});

// ============================================================================
// c) proyectarHato
// ============================================================================

describe('proyectarHato', () => {
  function estado(overrides: Partial<EstadoReproductivoProyeccion> = {}): EstadoReproductivoProyeccion {
    return { animalId: 'v1', enOrdeno: true, fechaProbableParto: null, fechaSecar: null, ...overrides };
  }

  it('proyección con curva incompleta (falta un bucket) -> se proyecta PLANA al nivel actual y la vaca entra en `planas`', () => {
    const pesajes = [pesaje({ animal_id: 'v1', fecha: '2026-07-01', litros_total: 20 })];
    const partos = new Map([['v1', '2026-05-01']]); // semana base = semanasDesdeParto('2026-07-28','2026-05-01')
    const curvaHato = [{ semana: 12, litros: 25, nVacas: 5 }]; // falta el bucket de semana+1 y semana+2
    const r = proyectarHato({
      pesajes,
      partos,
      estadosReproductivos: [estado()],
      curvaHato,
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 2,
      ventanaMedidaSemanas: 1,
    });
    const proyectadas = r.filter((s) => s.tipo === 'proyectado');
    expect(proyectadas).toHaveLength(2);
    for (const semana of proyectadas) {
      expect(semana.planas).toContain('v1');
      expect(semana.litrosDia).toBe(20); // plano al nivel actual (promedio de la ventana móvil)
    }
  });

  it('semana medida sin ningún pesaje (backlog) -> litrosDia null, nunca 0', () => {
    const r = proyectarHato({
      pesajes: [], // sin ningún pesaje -- backlog total
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 1,
      ventanaMedidaSemanas: 2,
    });
    const medidas = r.filter((s) => s.tipo === 'medido');
    expect(medidas).toHaveLength(2);
    for (const semana of medidas) expect(semana.litrosDia).toBeNull();
  });

  it('semana medida con pesajes: litrosDia es la SUMA del hato para esa semana (litros/día, no litros/quincena)', () => {
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-07-28', litros_total: 15 }),
      pesaje({ animal_id: 'v2', fecha: '2026-07-27', litros_total: 12 }),
    ];
    const r = proyectarHato({
      pesajes,
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 1,
    });
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('medido');
    expect(r[0].litrosDia).toBe(27);
    expect(r[0].vacasBase.sort()).toEqual(['v1', 'v2']);
  });

  it('vaca sin pesajes recientes (nivel=null) no contribuye y no revienta la suma', () => {
    const r = proyectarHato({
      pesajes: [], // v1 nunca pesada -- rendimientoPorVaca no la devuelve
      partos: new Map(),
      estadosReproductivos: [estado()],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 1,
      ventanaMedidaSemanas: 0,
    });
    const proyectada = r.find((s) => s.tipo === 'proyectado')!;
    expect(proyectada.litrosDia).toBeNull(); // ninguna vaca base contribuyó -- sin dato, no 0
    expect(proyectada.planas).toEqual([]); // no es "plana" -- directamente no hay base
  });

  it('vaca que entra (fecha_probable_parto dentro del horizonte) aporta la curva del hato desde su semana 0', () => {
    const curvaHato = [
      { semana: 0, litros: 8, nVacas: 4 },
      { semana: 1, litros: 12, nVacas: 4 },
    ];
    const r = proyectarHato({
      pesajes: [],
      partos: new Map(),
      estadosReproductivos: [
        estado({ animalId: 'nueva', enOrdeno: false, fechaProbableParto: '2026-08-04' }), // +7 días = semana 1
      ],
      curvaHato,
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 2,
      ventanaMedidaSemanas: 0,
    });
    const semana1 = r.find((s) => s.tipo === 'proyectado' && s.semana === 1)!;
    const semana2 = r.find((s) => s.tipo === 'proyectado' && s.semana === 2)!;
    expect(semana1.vacasEntran).toEqual(['nueva']);
    expect(semana1.litrosDia).toBe(8); // semana 0 de su lactancia
    expect(semana2.vacasEntran).toEqual([]); // solo se marca "entra" en su semana exacta
    expect(semana2.litrosDia).toBe(12); // semana 1 de su lactancia
  });

  it('vaca que va a secarse dentro del horizonte deja de contribuir desde su semana de salida', () => {
    const pesajes = [pesaje({ animal_id: 'v1', fecha: '2026-07-28', litros_total: 20 })];
    const r = proyectarHato({
      pesajes,
      partos: new Map(),
      estadosReproductivos: [estado({ fechaSecar: '2026-08-04' })], // +7 días = semana 1
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 2,
      ventanaMedidaSemanas: 0,
    });
    const semana1 = r.find((s) => s.tipo === 'proyectado' && s.semana === 1)!;
    const semana2 = r.find((s) => s.tipo === 'proyectado' && s.semana === 2)!;
    expect(semana1.vacasSalen).toEqual(['v1']);
    expect(semana1.litrosDia).toBeNull(); // ya no contribuye desde su semana de salida
    expect(semana2.litrosDia).toBeNull();
  });

  it('horizonteSemanas=0: solo produce semanas medidas, ninguna proyectada', () => {
    const r = proyectarHato({
      pesajes: [],
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 2,
    });
    expect(r.every((s) => s.tipo === 'medido')).toBe(true);
    expect(r).toHaveLength(2);
  });

  it('FIX 3 (QA rework) -- anclando fechaReferencia al último pesaje, un backlog de 34 días SÍ produce semanas medidas con dato', () => {
    // Reproduce el caso real del brief: última fila 2026-06-24, "hoy"
    // 2026-07-28 (34 días de brecha). Pasar "hoy" literal como
    // fechaReferencia deja las 4 semanas medidas en null (el bug); pasar
    // `fechaAnclaProduccion(pesajes, hoy)` las llena.
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-06-24', litros_total: 18 }),
      pesaje({ animal_id: 'v2', fecha: '2026-06-17', litros_total: 15 }),
    ];
    const hoy = '2026-07-28';
    const ancla = fechaAnclaProduccion(pesajes, hoy);
    expect(ancla).toBe('2026-06-24'); // no '2026-07-28'

    const conHoyLiteral = proyectarHato({
      pesajes,
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: hoy,
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 4,
    });
    expect(conHoyLiteral.filter((s) => s.tipo === 'medido').every((s) => s.litrosDia === null)).toBe(true);

    const conAncla = proyectarHato({
      pesajes,
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: ancla,
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 4,
    });
    const medidasConDato = conAncla.filter((s) => s.tipo === 'medido' && s.litrosDia !== null);
    expect(medidasConDato.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// promedioLitrosPorVaca + `vacasAportantes` -- la normalizacion que
// reemplazo al sub-label ambar de cobertura (FIX 4 del QA rework): el
// tracker ahora grafica el total (barra) Y el promedio por vaca (linea),
// asi que la comparabilidad entre semanas con distinto numero de vacas se
// resuelve con un dato, no con una advertencia.
// ============================================================================

describe('promedioLitrosPorVaca', () => {
  function semana(overrides: Partial<SemanaProyeccion> = {}): SemanaProyeccion {
    return {
      semana: 0,
      litrosDia: 100,
      tipo: 'medido',
      vacasBase: ['v1', 'v2', 'v3', 'v4'],
      vacasAportantes: ['v1', 'v2', 'v3', 'v4'],
      vacasEntran: [],
      vacasSalen: [],
      planas: [],
      ...overrides,
    };
  }

  it('divide el total entre las vacas que APORTARON', () => {
    expect(promedioLitrosPorVaca(semana())).toBe(25);
  });

  it('semana sin dato (backlog): null, nunca 0', () => {
    expect(promedioLitrosPorVaca(semana({ litrosDia: null, vacasAportantes: [] }))).toBeNull();
  });

  it('sin vacas aportantes: null, nunca division por cero', () => {
    expect(promedioLitrosPorVaca(semana({ litrosDia: 0, vacasAportantes: [] }))).toBeNull();
  });

  it('NO usa vacasBase como denominador -- en una semana proyectada esa lista incluye vacas que no aportaron', () => {
    const s = semana({
      tipo: 'proyectado',
      litrosDia: 60,
      vacasBase: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], // lista completa del horizonte
      vacasAportantes: ['v1', 'v2', 'v3'], // 3 secadas / sin nivel base no aportaron
    });
    expect(promedioLitrosPorVaca(s)).toBe(20); // 60/3, no 60/6
  });

  it('la cobertura real de la ventana queda expuesta: dos semanas con el mismo total y distinto numero de vacas dan promedios distintos', () => {
    const marzo = semana({ litrosDia: 400, vacasAportantes: Array.from({ length: 20 }, (_, i) => `v${i}`) });
    const junio = semana({ litrosDia: 400, vacasAportantes: Array.from({ length: 28 }, (_, i) => `v${i}`) });
    expect(promedioLitrosPorVaca(marzo)).toBe(20);
    expect(promedioLitrosPorVaca(junio)).toBeCloseTo(14.2857, 4);
  });
});

describe('proyectarHato -- vacasAportantes', () => {
  function estadoProy(overrides: Partial<EstadoReproductivoProyeccion> = {}): EstadoReproductivoProyeccion {
    return { animalId: 'v1', enOrdeno: true, fechaProbableParto: null, fechaSecar: null, ...overrides };
  }

  it('semana medida: son exactamente las vacas pesadas (una fila por vaca, sin repetidos)', () => {
    const r = proyectarHato({
      pesajes: [
        pesaje({ animal_id: 'v1', fecha: '2026-07-28', litros_total: 15 }),
        pesaje({ animal_id: 'v2', fecha: '2026-07-27', litros_total: 12 }),
      ],
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 1,
    });
    expect(r[0].vacasAportantes.sort()).toEqual(['v1', 'v2']);
    expect(promedioLitrosPorVaca(r[0])).toBe(13.5); // 27/2
  });

  it('semana medida sin pesajes: vacasAportantes vacio y promedio null -- nunca 0 vacas', () => {
    const r = proyectarHato({
      pesajes: [],
      partos: new Map(),
      estadosReproductivos: [],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 1,
    });
    expect(r[0].vacasAportantes).toEqual([]);
    expect(promedioLitrosPorVaca(r[0])).toBeNull();
  });

  it('semana proyectada: excluye a la vaca ya secada, aunque siga en vacasBase', () => {
    const pesajes = [
      pesaje({ animal_id: 'v1', fecha: '2026-07-28', litros_total: 20 }),
      pesaje({ animal_id: 'v2', fecha: '2026-07-28', litros_total: 10 }),
    ];
    const r = proyectarHato({
      pesajes,
      partos: new Map(),
      estadosReproductivos: [
        estadoProy({ animalId: 'v1' }),
        estadoProy({ animalId: 'v2', fechaSecar: '2026-08-04' }), // sale en la semana 1
      ],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 1,
      ventanaMedidaSemanas: 0,
    });
    const proyectada = r.find((s) => s.tipo === 'proyectado')!;
    expect(proyectada.vacasBase.sort()).toEqual(['v1', 'v2']); // la lista base no cambia
    expect(proyectada.vacasAportantes).toEqual(['v1']); // el denominador si
    expect(promedioLitrosPorVaca(proyectada)).toBe(20);
  });

  it('semana proyectada sin ninguna contribucion: vacasAportantes vacio junto al litrosDia null', () => {
    const r = proyectarHato({
      pesajes: [], // v1 nunca pesada -- no hay nivel del cual proyectar
      partos: new Map(),
      estadosReproductivos: [estadoProy()],
      curvaHato: [],
      fechaReferencia: '2026-07-28',
      horizonteSemanas: 1,
      ventanaMedidaSemanas: 0,
    });
    const proyectada = r.find((s) => s.tipo === 'proyectado')!;
    expect(proyectada.litrosDia).toBeNull();
    expect(proyectada.vacasAportantes).toEqual([]);
    expect(promedioLitrosPorVaca(proyectada)).toBeNull();
  });
});

// ============================================================================
// e) reconstruirEstadoAFecha / contarVacasEnOrdenoAFecha
// ============================================================================

describe('reconstruirEstadoAFecha + contarVacasEnOrdenoAFecha', () => {
  function animal(overrides: Partial<AnimalHistorico> = {}): AnimalHistorico {
    return {
      id: 'a1',
      etapa: 'vaca',
      raza: 'jersey',
      estado: 'activa',
      fecha_estado: null,
      ...overrides,
    };
  }

  it('animal vendida SIN evento venta y SIN fecha_estado: se excluye del conteo y suma a cobertura.sinFecha (riesgo R-2)', () => {
    const animales: AnimalHistorico[] = [animal({ id: 'a1', estado: 'vendida', fecha_estado: null })];
    const filas = reconstruirEstadoAFecha(animales, [], [], '2026-07-28');
    expect(filas).toHaveLength(1);
    expect(filas[0].cobertura).toBe('sin_fecha');
    expect(filas[0].presente).toBe(false);

    const resultado = contarVacasEnOrdenoAFecha(filas, CONFIG_BASE, '2026-07-28');
    expect(resultado.conteo).toBe(0);
    expect(resultado.cobertura).toEqual({ conFecha: 0, sinFecha: 1 });
  });

  it('animal vendida SIN evento venta pero CON fecha_estado (y con historial que la respalda): usa fecha_estado, cobertura con_fecha', () => {
    const animales: AnimalHistorico[] = [
      animal({ id: 'a1', estado: 'vendida', fecha_estado: '2026-03-01' }),
    ];
    // Al menos un chequeo previo respalda que el animal existía --
    // sin esto, el lado de ENTRADA no tendría evidencia (ver el bloque de
    // tests dedicado más abajo) y degradaría a 'sin_fecha' aunque el lado
    // de salida sí supiera la fecha.
    const chequeoVacas: ChequeoVacaHistorico[] = [{ animal_id: 'a1', fecha: '2025-01-01', estado: null }];

    // Corte ANTES de la venta -- seguía presente ese día.
    const filasAntes = reconstruirEstadoAFecha(animales, [], chequeoVacas, '2026-02-01');
    expect(filasAntes[0].cobertura).toBe('con_fecha');
    expect(filasAntes[0].presente).toBe(true);
    expect(filasAntes[0].estado).toBe('activa');

    // Corte DESPUÉS de la venta -- ya no estaba.
    const filasDespues = reconstruirEstadoAFecha(animales, [], chequeoVacas, '2026-04-01');
    expect(filasDespues[0].cobertura).toBe('con_fecha');
    expect(filasDespues[0].presente).toBe(false);
    expect(filasDespues[0].estado).toBe('vendida');

    const conteo = contarVacasEnOrdenoAFecha(filasDespues, CONFIG_BASE, '2026-04-01');
    expect(conteo.cobertura).toEqual({ conFecha: 1, sinFecha: 0 });
    expect(conteo.conteo).toBe(0); // no presente -> no cuenta, aunque tenga cobertura
  });

  it('evento venta explícito manda sobre fecha_estado (más confiable) para decidir la fecha de salida', () => {
    const animales: AnimalHistorico[] = [
      animal({ id: 'a1', estado: 'vendida', fecha_estado: '2026-05-01' }),
    ];
    const eventos: EventoHistorico[] = [{ animal_id: 'a1', tipo: 'venta', fecha: '2026-02-01' }];
    // El evento dice que salió en febrero -- en marzo ya no debía contar,
    // aunque fecha_estado (mayo) diga lo contrario.
    const filas = reconstruirEstadoAFecha(animales, eventos, [], '2026-03-01');
    expect(filas[0].presente).toBe(false);
    expect(filas[0].cobertura).toBe('con_fecha');
  });

  describe('lado de ENTRADA (riesgo R-2 también corre en esta dirección)', () => {
    // `fecha_estado` solo se puebla al SALIR del hato -- en la práctica es
    // una columna vacía en el 100% de los animales `activa` reales, así que
    // nunca puede fechar una entrada. Sin evidencia propia (evento o
    // chequeo), un animal `activa` NO puede asumirse presente en cualquier
    // corte histórico solo porque hoy sigue activa.

    it('animal activa SIN ningún evento ni chequeo: sin evidencia de cuándo entró -- cobertura sin_fecha, en CUALQUIER corte', () => {
      const animales: AnimalHistorico[] = [animal({ id: 'a1', estado: 'activa' })];
      const filasViejo = reconstruirEstadoAFecha(animales, [], [], '2019-01-01');
      const filasReciente = reconstruirEstadoAFecha(animales, [], [], '2026-07-28');
      for (const filas of [filasViejo, filasReciente]) {
        expect(filas[0].cobertura).toBe('sin_fecha');
        expect(filas[0].presente).toBe(false);
      }
    });

    it('animal activa CON evidencia (evento o chequeo): presente solo desde la primera evidencia en adelante', () => {
      const animales: AnimalHistorico[] = [animal({ id: 'a1', estado: 'activa' })];
      const eventos: EventoHistorico[] = [{ animal_id: 'a1', tipo: 'parto', fecha: '2025-01-10' }];

      // Corte ANTES de la primera evidencia: sabemos que TODAVÍA no había
      // aparecido -- es un "no" informado, no una laguna.
      const filasAntes = reconstruirEstadoAFecha(animales, eventos, [], '2024-01-01');
      expect(filasAntes[0].cobertura).toBe('con_fecha');
      expect(filasAntes[0].presente).toBe(false);

      // Corte DESPUÉS de la primera evidencia: presente.
      const filasDespues = reconstruirEstadoAFecha(animales, eventos, [], '2025-06-01');
      expect(filasDespues[0].cobertura).toBe('con_fecha');
      expect(filasDespues[0].presente).toBe(true);
    });

    it('una fila de chequeo (sin ningún evento) también sirve como evidencia de entrada', () => {
      const animales: AnimalHistorico[] = [animal({ id: 'a1', estado: 'activa' })];
      const chequeoVacas: ChequeoVacaHistorico[] = [{ animal_id: 'a1', fecha: '2025-01-10', estado: 'vacia_apta' }];
      const filas = reconstruirEstadoAFecha(animales, [], chequeoVacas, '2025-06-01');
      expect(filas[0].cobertura).toBe('con_fecha');
      expect(filas[0].presente).toBe(true);
    });

    it('el lado de entrada NUNCA degrada un caso ya resuelto por el lado de salida (ej. animal ya excluido por venta)', () => {
      const animales: AnimalHistorico[] = [animal({ id: 'a1', estado: 'vendida', fecha_estado: '2020-01-01' })];
      // Sin ningún evento ni chequeo -- si el lado de entrada se evaluara
      // incondicionalmente, esto degradaría a 'sin_fecha'. Pero como el
      // lado de salida YA determinó `presente=false` con cobertura
      // conocida, el lado de entrada ni se evalúa.
      const filas = reconstruirEstadoAFecha(animales, [], [], '2026-07-28');
      expect(filas[0].presente).toBe(false);
      expect(filas[0].cobertura).toBe('con_fecha');
    });
  });

  it('conteo "en ordeño" solo cuenta presentes clasificados hato -- una novilla o una ternera no cuentan', () => {
    const animales: AnimalHistorico[] = [
      animal({ id: 'v1', etapa: 'vaca' }),
      animal({ id: 'n1', etapa: 'novilla' }),
      animal({ id: 't1', etapa: 'ternera' }),
    ];
    // Cada una necesita al menos un chequeo para tener evidencia de
    // entrada (ver bloque "lado de ENTRADA" arriba) -- sin esto las tres
    // caerían en cobertura 'sin_fecha' y el conteo no probaría nada.
    const chequeoVacas: ChequeoVacaHistorico[] = [
      { animal_id: 'v1', fecha: '2026-01-01', estado: null },
      { animal_id: 'n1', fecha: '2026-01-01', estado: null },
      { animal_id: 't1', fecha: '2026-01-01', estado: null },
    ];
    const filas = reconstruirEstadoAFecha(animales, [], chequeoVacas, '2026-07-28');
    const resultado = contarVacasEnOrdenoAFecha(filas, CONFIG_BASE, '2026-07-28');
    expect(resultado.conteo).toBe(1); // solo v1
  });

  it('anclaChequeo es el chequeo más reciente <= fechaCorte entre todas las filas', () => {
    const animales: AnimalHistorico[] = [animal({ id: 'v1' }), animal({ id: 'v2' })];
    const chequeoVacas: ChequeoVacaHistorico[] = [
      { animal_id: 'v1', fecha: '2026-01-15', estado: null },
      { animal_id: 'v2', fecha: '2026-03-20', estado: null },
      { animal_id: 'v2', fecha: '2026-09-01', estado: null }, // futuro respecto al corte -- se ignora
    ];
    const filas = reconstruirEstadoAFecha(animales, [], chequeoVacas, '2026-07-28');
    const resultado = contarVacasEnOrdenoAFecha(filas, CONFIG_BASE, '2026-07-28');
    expect(resultado.anclaChequeo).toBe('2026-03-20');
  });

  it('sin ningún chequeo antes del corte: anclaChequeo es null, no una fecha inventada', () => {
    const animales: AnimalHistorico[] = [animal({ id: 'v1' })];
    const filas = reconstruirEstadoAFecha(animales, [], [], '2026-07-28');
    const resultado = contarVacasEnOrdenoAFecha(filas, CONFIG_BASE, '2026-07-28');
    expect(resultado.anclaChequeo).toBeNull();
  });

  it('num_partos y ultimo_parto_fecha solo cuentan eventos parto <= fechaCorte', () => {
    const animales: AnimalHistorico[] = [animal({ id: 'v1' })];
    const eventos: EventoHistorico[] = [
      { animal_id: 'v1', tipo: 'parto', fecha: '2024-01-01' },
      { animal_id: 'v1', tipo: 'parto', fecha: '2025-01-01' },
      { animal_id: 'v1', tipo: 'parto', fecha: '2026-12-01' }, // después del corte
    ];
    const filas = reconstruirEstadoAFecha(animales, eventos, [], '2026-07-28');
    expect(filas[0].num_partos).toBe(2);
    expect(filas[0].ultimo_parto_fecha).toBe('2025-01-01');
  });
});

// ============================================================================
// SOW 3 -- helpers puros de captura (ProduccionQuincenalForm,
// VentaAnimalesHatoDialog)
// ============================================================================

describe('resolverLitrosQuincenal', () => {
  it('fila medida: lee del embed fin_ingreso.cantidad, nunca de litros_total', () => {
    const fila: FilaProduccionQuincenalCruda = {
      litros_total: null,
      origen_dato: 'medido',
      fin_ingreso: { cantidad: 1234 },
    };
    expect(resolverLitrosQuincenal(fila)).toBe(1234);
  });

  it('fila medida sin embed (ingreso ausente o consulta sin join): null, nunca 0', () => {
    const fila: FilaProduccionQuincenalCruda = { litros_total: null, origen_dato: 'medido', fin_ingreso: null };
    expect(resolverLitrosQuincenal(fila)).toBeNull();
  });

  it('fila derivado_mensual: lee de litros_total, ignora el embed', () => {
    const fila: FilaProduccionQuincenalCruda = {
      litros_total: 3145,
      origen_dato: 'derivado_mensual',
      fin_ingreso: { cantidad: 6291 },
    };
    expect(resolverLitrosQuincenal(fila)).toBe(3145);
  });
});

describe('calcularPrecioUnitarioQuincena', () => {
  it('valor y litros positivos: valor / litros', () => {
    expect(calcularPrecioUnitarioQuincena(900000, 900)).toBe(1000);
  });

  it('sin litros (null/0/negativo): null, nunca división por cero', () => {
    expect(calcularPrecioUnitarioQuincena(900000, null)).toBeNull();
    expect(calcularPrecioUnitarioQuincena(900000, 0)).toBeNull();
    expect(calcularPrecioUnitarioQuincena(900000, -5)).toBeNull();
  });

  it('sin valor (null/0/undefined): null', () => {
    expect(calcularPrecioUnitarioQuincena(null, 900)).toBeNull();
    expect(calcularPrecioUnitarioQuincena(0, 900)).toBeNull();
    expect(calcularPrecioUnitarioQuincena(undefined, 900)).toBeNull();
  });
});

describe('validarCabezasVentaAnimales', () => {
  it('entero >= 1: válido (null)', () => {
    expect(validarCabezasVentaAnimales(1)).toBeNull();
    expect(validarCabezasVentaAnimales(5)).toBeNull();
  });

  it('ausente/no finito: mensaje de error', () => {
    expect(validarCabezasVentaAnimales(undefined)).not.toBeNull();
    expect(validarCabezasVentaAnimales(null)).not.toBeNull();
    expect(validarCabezasVentaAnimales(NaN)).not.toBeNull();
  });

  it('cero, negativo o decimal: mensaje de error', () => {
    expect(validarCabezasVentaAnimales(0)).not.toBeNull();
    expect(validarCabezasVentaAnimales(-1)).not.toBeNull();
    expect(validarCabezasVentaAnimales(1.5)).not.toBeNull();
  });
});

// ============================================================================
// SOW 5 -- clasificarIngresoHato / repartoVentasHato / promedioProductividadQuincenal
// ============================================================================

describe('clasificarIngresoHato', () => {
  it('clasifica por NOMBRE (case-insensitive), nunca por id', () => {
    expect(clasificarIngresoHato('Venta Leche')).toBe('leche');
    expect(clasificarIngresoHato('venta de leche cruda')).toBe('leche');
    expect(clasificarIngresoHato('Venta de Terneros')).toBe('terneros');
    expect(clasificarIngresoHato('Venta de Vacas de Descarte')).toBe('descarte');
  });

  it('cualquier nombre no reconocido cae en "otros" -- nunca se pierde de la suma', () => {
    expect(clasificarIngresoHato('Subsidio')).toBe('otros');
    expect(clasificarIngresoHato('')).toBe('otros');
  });
});

function ingreso(overrides: Partial<IngresoHatoParaReparto> = {}): IngresoHatoParaReparto {
  return { categoriaNombre: 'Venta Leche', valor: 100000, cantidad: 1000, fecha: '2026-07-01', ...overrides };
}

describe('repartoVentasHato', () => {
  it('arreglo vacío: las 4 cubetas en 0, total 0 -- nunca se inventa una cubeta', () => {
    const reparto = repartoVentasHato([]);
    expect(reparto).toEqual({
      leche: { valor: 0, litros: null },
      terneros: { valor: 0, litros: null },
      descarte: { valor: 0, litros: null },
      otros: { valor: 0, litros: null },
      total: 0,
    });
  });

  it('reconcilia por construcción: la suma de las 4 cubetas es SIEMPRE el total real', () => {
    const ingresos = [
      ingreso({ categoriaNombre: 'Venta Leche', valor: 500000, cantidad: 5000 }),
      ingreso({ categoriaNombre: 'Venta de Terneros', valor: 300000, cantidad: 2 }),
      ingreso({ categoriaNombre: 'Venta de Vacas de Descarte', valor: 200000, cantidad: 1 }),
      ingreso({ categoriaNombre: 'Subsidio inesperado', valor: 50000, cantidad: null }),
    ];
    const reparto = repartoVentasHato(ingresos);
    expect(reparto.leche.valor).toBe(500000);
    expect(reparto.terneros.valor).toBe(300000);
    expect(reparto.descarte.valor).toBe(200000);
    expect(reparto.otros.valor).toBe(50000);
    expect(reparto.total).toBe(1050000);
    expect(reparto.leche.valor + reparto.terneros.valor + reparto.descarte.valor + reparto.otros.valor).toBe(
      reparto.total,
    );
  });

  it('litros SOLO se acumulan para la cubeta leche -- terneros/descarte nunca aportan litros', () => {
    const reparto = repartoVentasHato([
      ingreso({ categoriaNombre: 'Venta Leche', valor: 100000, cantidad: 1000 }),
      ingreso({ categoriaNombre: 'Venta Leche', valor: 90000, cantidad: 900 }),
      ingreso({ categoriaNombre: 'Venta de Terneros', valor: 300000, cantidad: 3 }),
    ]);
    expect(reparto.leche.litros).toBe(1900);
    expect(reparto.terneros.litros).toBeNull();
  });

  it('ningún ingreso de leche trae cantidad: litros null, nunca 0', () => {
    const reparto = repartoVentasHato([ingreso({ categoriaNombre: 'Venta Leche', valor: 100000, cantidad: null })]);
    expect(reparto.leche.litros).toBeNull();
  });
});

describe('promedioProductividadQuincenal', () => {
  it('historial vacío: null, nunca 0', () => {
    expect(promedioProductividadQuincenal([])).toBeNull();
  });

  it('ignora quincenas sin litros_total o sin num_vacas_ordeno (nunca las cuenta como 0)', () => {
    const historial = [
      { litros_total: 1000, num_vacas_ordeno: 20 }, // 50
      { litros_total: null, num_vacas_ordeno: 20 },
      { litros_total: 1000, num_vacas_ordeno: null },
      { litros_total: 2000, num_vacas_ordeno: 20 }, // 100
    ];
    expect(promedioProductividadQuincenal(historial)).toBe(75);
  });

  it('ninguna quincena con ambos datos: null', () => {
    expect(
      promedioProductividadQuincenal([
        { litros_total: null, num_vacas_ordeno: 20 },
        { litros_total: 1000, num_vacas_ordeno: null },
      ]),
    ).toBeNull();
  });
});

// ============================================================================
// UI rework de Producción (owner feedback, este sesión): dialog de detalle
// de quincena (click en barra) + toggle quincena/mes/trimestre de "Ventas
// del Hato". `litrosTotal` que reciben estas funciones YA está resuelto vía
// `resolverLitrosQuincenal` -- nunca se vuelve a leer `litros_total` crudo.
// ============================================================================

describe('detalleQuincenaVenta', () => {
  it('fila medido: el valor es el del ingreso enlazado directamente, precio = valor/litros', () => {
    const detalle = detalleQuincenaVenta({
      litrosTotal: 5000,
      numVacasOrdeno: 25,
      origenDato: 'medido',
      finIngreso: { valor: 10_000_000, cantidad: 5000 },
    });
    expect(detalle.litrosTotal).toBe(5000);
    expect(detalle.valor).toBe(10_000_000);
    expect(detalle.precioPromedio).toBe(2000);
    expect(detalle.lVacaPromedio).toBe(200);
  });

  it('fila medido sin num_vacas_ordeno: L/vaca es null, nunca 0', () => {
    const detalle = detalleQuincenaVenta({
      litrosTotal: 5000,
      numVacasOrdeno: null,
      origenDato: 'medido',
      finIngreso: { valor: 10_000_000, cantidad: 5000 },
    });
    expect(detalle.lVacaPromedio).toBeNull();
  });

  it('fila derivado_mensual: el valor se reparte proporcional a la participación en litros del mes', () => {
    // Ingreso mensual: 20.000.000 por 10.000 L (precio 2.000/L). Esta
    // quincena aportó 4.000 de esos 10.000 L (40%) -> valor estimado 8.000.000,
    // y el precio promedio de la quincena converge al precio del mes.
    const detalle = detalleQuincenaVenta({
      litrosTotal: 4000,
      numVacasOrdeno: 20,
      origenDato: 'derivado_mensual',
      finIngreso: { valor: 20_000_000, cantidad: 10_000 },
    });
    expect(detalle.valor).toBe(8_000_000);
    expect(detalle.precioPromedio).toBe(2000);
    expect(detalle.lVacaPromedio).toBe(200);
  });

  it('fila derivado_mensual sin cantidad del mes: valor null, nunca fabricado', () => {
    const detalle = detalleQuincenaVenta({
      litrosTotal: 4000,
      numVacasOrdeno: 20,
      origenDato: 'derivado_mensual',
      finIngreso: { valor: 20_000_000, cantidad: null },
    });
    expect(detalle.valor).toBeNull();
    expect(detalle.precioPromedio).toBeNull();
  });

  it('sin fin_ingreso (RLS bloqueó el embed): valor y precio null', () => {
    const detalle = detalleQuincenaVenta({
      litrosTotal: 4000,
      numVacasOrdeno: 20,
      origenDato: 'medido',
      finIngreso: null,
    });
    expect(detalle.valor).toBeNull();
    expect(detalle.precioPromedio).toBeNull();
    // Los litros y el L/vaca siguen disponibles -- no dependen de fin_ingreso.
    expect(detalle.litrosTotal).toBe(4000);
    expect(detalle.lVacaPromedio).toBe(200);
  });

  it('sin litros resueltos: precio y L/vaca null', () => {
    const detalle = detalleQuincenaVenta({
      litrosTotal: null,
      numVacasOrdeno: 20,
      origenDato: 'medido',
      finIngreso: { valor: 10_000_000, cantidad: null },
    });
    expect(detalle.precioPromedio).toBeNull();
    expect(detalle.lVacaPromedio).toBeNull();
  });
});

describe('diasPeriodoVentaHato', () => {
  it('mapea las 3 ventanas del toggle en días', () => {
    expect(diasPeriodoVentaHato('quincena')).toBe(15);
    expect(diasPeriodoVentaHato('mes')).toBe(30);
    expect(diasPeriodoVentaHato('trimestre')).toBe(90);
  });
});

describe('filtrarHistorialPorPeriodo', () => {
  const historial = [
    { id: 'a', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15' },
    { id: 'b', fecha_inicio: '2026-06-01', fecha_fin: '2026-06-15' },
    { id: 'c', fecha_inicio: '2026-01-01', fecha_fin: '2026-01-15' },
  ];

  it('quincena: solo la(s) fila(s) dentro de los últimos 15 días de la referencia', () => {
    const filtrado = filtrarHistorialPorPeriodo(historial, 'quincena', '2026-07-20');
    expect(filtrado.map((h) => h.id)).toEqual(['a']);
  });

  it('trimestre: incluye julio y junio, excluye enero', () => {
    const filtrado = filtrarHistorialPorPeriodo(historial, 'trimestre', '2026-07-20');
    expect(filtrado.map((h) => h.id)).toEqual(['a', 'b']);
  });

  it('usa fecha_inicio como respaldo cuando fecha_fin es null', () => {
    const filtrado = filtrarHistorialPorPeriodo(
      [{ id: 'x', fecha_inicio: '2026-07-10', fecha_fin: null }],
      'quincena',
      '2026-07-20',
    );
    expect(filtrado.map((h) => h.id)).toEqual(['x']);
  });

  it('sin fecha_inicio NI fecha_fin: se excluye, nunca se incluye por defecto', () => {
    const filtrado = filtrarHistorialPorPeriodo(
      [{ id: 'y', fecha_inicio: null, fecha_fin: null }],
      'trimestre',
      '2026-07-20',
    );
    expect(filtrado).toEqual([]);
  });
});

describe('filtrarIngresosPorPeriodo', () => {
  it('filtra por fecha dentro de la ventana rodante', () => {
    const ingresos = [
      { id: 'a', fecha: '2026-07-18' },
      { id: 'b', fecha: '2026-06-01' },
    ];
    expect(filtrarIngresosPorPeriodo(ingresos, 'mes', '2026-07-20').map((i) => i.id)).toEqual(['a']);
    expect(filtrarIngresosPorPeriodo(ingresos, 'trimestre', '2026-07-20').map((i) => i.id)).toEqual(['a', 'b']);
  });
});

// ============================================================================
// BUG de producción (owner, hallado a ojo): el límite inferior de la
// ventana rodante era INCLUSIVO (`fecha >= ancla - N`) -- con facturas de
// leche fechadas fin-de-mes, `ancla - 30` cae EXACTAMENTE en el mes
// anterior, así que "Mes" sumaba dos facturas mensuales completas en vez de
// una: Leche $51.645.049 (jun $27.076.564,28 + may $24.568.485,00) en vez
// de $27.076.564,28; Terneros $480.000 (4 × $120.000, las 4 fechadas
// 2026-05-31) en vez de $0. El límite inferior ahora es EXCLUSIVO
// (`fecha > ancla - N`, expresado como `desde = (ancla - N) + 1 día`, ver
// `rangoPeriodoVentaHato`) -- una fila fechada EXACTAMENTE N días antes del
// ancla cae fuera, una fechada N-1 días antes cae dentro. Los casos de abajo
// fijan ambos lados de esa frontera con los valores REALES de producción
// (ancla 2026-06-30, periodo "mes" = 30 días) para que una regresión a
// `>=` los rompa de inmediato -- no solo un caso sintético.
// ============================================================================

describe('rangoPeriodoVentaHato', () => {
  it('quincena: desde es 14 días antes del ancla (límite inferior + 1 día)', () => {
    expect(rangoPeriodoVentaHato('quincena', '2026-06-30')).toEqual({ desde: '2026-06-16', hasta: '2026-06-30' });
  });

  it('mes: desde es 29 días antes del ancla -- el caso real de producción', () => {
    expect(rangoPeriodoVentaHato('mes', '2026-06-30')).toEqual({ desde: '2026-06-01', hasta: '2026-06-30' });
  });

  it('trimestre: desde es 89 días antes del ancla', () => {
    expect(rangoPeriodoVentaHato('trimestre', '2026-06-30')).toEqual({ desde: '2026-04-02', hasta: '2026-06-30' });
  });

  // ==========================================================================
  // YTD (owner feedback, agregado después de las 3 ventanas rodantes de
  // arriba): CALENDARIO-ANCLA, no rodante -- `desde` es SIEMPRE el 1 de
  // enero del año del ancla, INCLUSIVO, y JAMÁS lleva el desplazamiento
  // `+1 día` que corrige el artefacto de las ventanas de longitud fija --
  // el 1 de enero es una frontera calendario real, no un artefacto.
  // ==========================================================================
  describe('ytd', () => {
    it('ancla 2026-06-30: desde es el 1 de enero de 2026, hasta es el ancla', () => {
      expect(rangoPeriodoVentaHato('ytd', '2026-06-30')).toEqual({ desde: '2026-01-01', hasta: '2026-06-30' });
    });

    it('NO hereda el desplazamiento +1 día de las ventanas rodantes -- desde es EXACTAMENTE 1 de enero, no 2', () => {
      const { desde } = rangoPeriodoVentaHato('ytd', '2026-06-30');
      expect(desde).toBe('2026-01-01');
      expect(desde).not.toBe('2026-01-02');
    });

    it('ancla el 1 de enero mismo: ventana de un solo día', () => {
      expect(rangoPeriodoVentaHato('ytd', '2026-01-01')).toEqual({ desde: '2026-01-01', hasta: '2026-01-01' });
    });

    it('ancla el 31 de diciembre: ventana del año completo', () => {
      expect(rangoPeriodoVentaHato('ytd', '2026-12-31')).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' });
    });
  });
});

describe('filtrarIngresosPorPeriodo -- ytd (mutation-check del límite calendario)', () => {
  it('una fila fechada EXACTAMENTE 2026-01-01 se INCLUYE (frontera calendario real, no artefacto)', () => {
    expect(
      filtrarIngresosPorPeriodo([{ id: 'enero1', fecha: '2026-01-01' }], 'ytd', '2026-06-30').map((i) => i.id),
    ).toEqual(['enero1']);
  });

  it('una fila fechada 2025-12-31 se EXCLUYE -- es del año anterior al del ancla', () => {
    expect(
      filtrarIngresosPorPeriodo([{ id: 'dic31', fecha: '2025-12-31' }], 'ytd', '2026-06-30').map((i) => i.id),
    ).toEqual([]);
  });

  it('reproduce el caso real: 6 facturas de leche ene-jun 2026 quedan dentro de YTD con ancla 2026-06-30', () => {
    const ingresos = [
      { id: 'ene', fecha: '2026-01-31' },
      { id: 'feb', fecha: '2026-02-28' },
      { id: 'mar', fecha: '2026-03-31' },
      { id: 'abr', fecha: '2026-04-30' },
      { id: 'may', fecha: '2026-05-31' },
      { id: 'jun', fecha: '2026-06-30' },
      { id: 'dic-anterior', fecha: '2025-12-31' }, // año anterior -- debe excluirse
    ];
    expect(filtrarIngresosPorPeriodo(ingresos, 'ytd', '2026-06-30').map((i) => i.id)).toEqual([
      'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    ]);
  });
});

describe('filtrarHistorialPorPeriodo -- límite inferior EXCLUSIVO (bug de producción)', () => {
  it('una fila fechada EXACTAMENTE N días antes del ancla se EXCLUYE', () => {
    const filtrado = filtrarHistorialPorPeriodo(
      [{ id: 'limite', fecha_inicio: null, fecha_fin: '2026-05-31' }],
      'mes',
      '2026-06-30',
    );
    expect(filtrado).toEqual([]);
  });

  it('una fila fechada N-1 días antes del ancla se INCLUYE', () => {
    const filtrado = filtrarHistorialPorPeriodo(
      [{ id: 'dentro', fecha_inicio: null, fecha_fin: '2026-06-01' }],
      'mes',
      '2026-06-30',
    );
    expect(filtrado.map((h) => h.id)).toEqual(['dentro']);
  });

  it('reproduce el caso real: la factura de mayo (2026-05-31) NO se mezcla con la de junio bajo "mes"', () => {
    const historial = [
      { id: 'jun', fecha_inicio: null, fecha_fin: '2026-06-30' },
      { id: 'may', fecha_inicio: null, fecha_fin: '2026-05-31' },
    ];
    expect(filtrarHistorialPorPeriodo(historial, 'mes', '2026-06-30').map((h) => h.id)).toEqual(['jun']);
  });

  it('trimestre: incluye exactamente las 3 facturas de fin de mes (abr/may/jun), nunca una 4ª', () => {
    const historial = [
      { id: 'jun', fecha_inicio: null, fecha_fin: '2026-06-30' },
      { id: 'may', fecha_inicio: null, fecha_fin: '2026-05-31' },
      { id: 'abr', fecha_inicio: null, fecha_fin: '2026-04-30' },
      { id: 'mar', fecha_inicio: null, fecha_fin: '2026-03-31' },
    ];
    expect(filtrarHistorialPorPeriodo(historial, 'trimestre', '2026-06-30').map((h) => h.id)).toEqual([
      'jun',
      'may',
      'abr',
    ]);
  });
});

describe('filtrarIngresosPorPeriodo -- límite inferior EXCLUSIVO (bug de producción)', () => {
  it('un ingreso fechado EXACTAMENTE N días antes del ancla se EXCLUYE', () => {
    expect(
      filtrarIngresosPorPeriodo([{ id: 'limite', fecha: '2026-05-31' }], 'mes', '2026-06-30').map((i) => i.id),
    ).toEqual([]);
  });

  it('un ingreso fechado N-1 días antes del ancla se INCLUYE', () => {
    expect(
      filtrarIngresosPorPeriodo([{ id: 'dentro', fecha: '2026-06-01' }], 'mes', '2026-06-30').map((i) => i.id),
    ).toEqual(['dentro']);
  });

  it('reproduce el caso real: las 4 ventas de terneros de 2026-05-31 se excluyen de "mes" con ancla 2026-06-30', () => {
    const ingresos = [
      { id: 't1', fecha: '2026-05-31' },
      { id: 't2', fecha: '2026-05-31' },
      { id: 't3', fecha: '2026-05-31' },
      { id: 't4', fecha: '2026-05-31' },
    ];
    expect(filtrarIngresosPorPeriodo(ingresos, 'mes', '2026-06-30')).toEqual([]);
  });
});

describe('fechaAnclaVentasHato', () => {
  it('ancla a la fecha más reciente entre quincenas e ingresos, nunca a "hoy" literal', () => {
    const ancla = fechaAnclaVentasHato(
      [{ fecha_inicio: '2026-05-01', fecha_fin: '2026-05-15' }],
      [{ fecha: '2026-06-10' }],
      '2026-07-28',
    );
    expect(ancla).toBe('2026-06-10');
  });

  it('sin ningún dato: devuelve "hoy" tal cual', () => {
    expect(fechaAnclaVentasHato([], [], '2026-07-28')).toBe('2026-07-28');
  });
});

// ============================================================================
// S4 (docs/plan_hato_ronda_agosto_2026.md) -- ICA de la quincenal del Pomar
// (D-11/D-12): bruto capturado, ICA y neto calculados.
// ============================================================================

describe('aplicaRetencionIcaLeche', () => {
  it('D-12: no aplica antes de julio 2026', () => {
    expect(aplicaRetencionIcaLeche(2026, 6)).toBe(false);
    expect(aplicaRetencionIcaLeche(2025, 12)).toBe(false);
  });

  it('D-12: aplica desde julio 2026 en adelante', () => {
    expect(aplicaRetencionIcaLeche(2026, 7)).toBe(true);
    expect(aplicaRetencionIcaLeche(2026, 12)).toBe(true);
    expect(aplicaRetencionIcaLeche(2027, 1)).toBe(true);
  });
});

describe('calcularNetoConIca', () => {
  it('caso real: bruto $11.876.000 con ICA 2,25% -> neto $11.608.790 (fórmula del dueño)', () => {
    const { neto, ica } = calcularNetoConIca(11876000, 0.0225);
    expect(neto).toBe(11608790);
    expect(ica).toBe(267210);
  });

  it('sin retención (0), el neto es igual al bruto y el ica es 0', () => {
    expect(calcularNetoConIca(2000000, 0)).toEqual({ ica: 0, neto: 2000000 });
  });

  it('redondea a 2 decimales', () => {
    const { neto, ica } = calcularNetoConIca(1000, 0.0225);
    expect(neto).toBe(977.5);
    expect(ica).toBe(22.5);
  });
});

describe('calcularPrecioBrutoLitro', () => {
  it('caso real: $11.876.000 / 5.938 L = $2.000/L', () => {
    expect(calcularPrecioBrutoLitro(11876000, 5938)).toBe(2000);
  });

  it('sin litros positivos, null -- nunca una división por cero disfrazada de precio', () => {
    expect(calcularPrecioBrutoLitro(11876000, 0)).toBeNull();
    expect(calcularPrecioBrutoLitro(11876000, null)).toBeNull();
  });

  it('sin bruto, null', () => {
    expect(calcularPrecioBrutoLitro(null, 5938)).toBeNull();
    expect(calcularPrecioBrutoLitro(0, 5938)).toBeNull();
  });
});
