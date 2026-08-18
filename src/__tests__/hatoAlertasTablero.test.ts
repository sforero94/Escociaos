// ARCHIVO: __tests__/hatoAlertasTablero.test.ts
// DESCRIPCIÓN: TDD de la derivación de señales del "Tablero de alertas" del
// Dashboard (`utils/hatoAlertasTablero.ts`, Figma alignment spec §7). NO es
// el motor S6 (ese es `utils/hatoAlertas.ts`, con su propio test): esto solo
// cubre el resumen derivado client-side que consume `HatoDashboard.tsx` --
// las 5 señales (Fase 0a separó secado vencido de próximo a secar, ver
// docs/brief_tecnico_motor_acciones.md §10 0a), el aplanado en filas, la
// identidad nombre-primero para chapetas provisionales, el contrato de las
// 4 claves de meta/pill, y `vaciasMasDeNDias` -- el filtro nuevo que
// prepara el hecho `hato.vacias_90d` del motor de acciones recomendadas
// (Fase 1, todavía no implementada en este archivo).

import { describe, it, expect } from 'vitest';
import {
  derivarAlertasTablero,
  vaciasMasDeNDias,
  contarVacasActivas,
  nombreAnimalTablero,
  ALERTA_META_TABLERO,
  PILL_ALERTA_TABLERO,
} from '../utils/hatoAlertasTablero';
import type { AnimalHatoDerivado } from '../components/hato/hooks/useHatoAnimales';
import type { EstadoReproductivoDerivado, HatoConfig } from '../utils/calculosHato';

function derivado(overrides: Partial<EstadoReproductivoDerivado> = {}): EstadoReproductivoDerivado {
  return {
    estado: 'servida',
    fecha_secar: null,
    fecha_probable_parto: null,
    dias_abiertos: null,
    tiempo_prenez_dias: null,
    tiempo_secada_dias: null,
    proxima_a_reemplazo: false,
    vacia_es_problema: null,
    senal_revision: null,
    alertas: { secado_due: false, rechequeo_due: false, servicio_sin_confirmacion: false, parto_proximo: false },
    ...overrides,
  };
}

function animal(overrides: Partial<AnimalHatoDerivado> = {}): AnimalHatoDerivado {
  return {
    animalId: overrides.animalId ?? crypto.randomUUID(),
    numero: null,
    numeroEsProvisional: false,
    nombre: null,
    etapa: 'vaca',
    raza: null,
    estadoAnimal: 'activa',
    pl: null,
    numPartos: 0,
    ultimoChequeoFecha: null,
    ultimoPartoFecha: null,
    fechaNacimiento: null,
    derivado: derivado(),
    categoria: 'hato',
    categoriaOrigen: 'calculado',
    subetapaTernera: null,
    ...overrides,
  };
}

describe('derivarAlertasTablero', () => {
  // Fase 0a del motor de acciones (docs/brief_tecnico_motor_acciones.md
  // §3.3, §10 0a): `secado_vencido` y `proxima_a_secar` eran una sola lista
  // mezclada (`secado_due || estado === 'proxima_a_secar'`) -- separados a
  // partir de esta fase en dos conjuntos DISJUNTOS.
  it('secadoVencido: solo `alertas.secado_due`, sin importar el estado', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, secado_due: true } }) });
    const b = animal({ animalId: 'b', derivado: derivado({ estado: 'proxima_a_secar' }) }); // dentro de ventana, no vencida
    const c = animal({ animalId: 'c' }); // servida, sin ninguna alerta -- no debe aparecer
    const resultado = derivarAlertasTablero([a, b, c]);
    expect(resultado.secadoVencido.map((x) => x.animalId)).toEqual(['a']);
  });

  it('proximasASecar: estado proxima_a_secar SIN secado_due -- excluye las vencidas', () => {
    const vencida = animal({
      animalId: 'vencida',
      derivado: derivado({ estado: 'proxima_a_secar', alertas: { ...derivado().alertas, secado_due: true } }),
    });
    const proxima = animal({ animalId: 'proxima', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const c = animal({ animalId: 'c' });
    const resultado = derivarAlertasTablero([vencida, proxima, c]);
    expect(resultado.proximasASecar.map((x) => x.animalId)).toEqual(['proxima']);
  });

  it('secadoVencido y proximasASecar nunca se solapan (11/5/2 de producción, disjuntos por construcción)', () => {
    const vencidas = Array.from({ length: 5 }, (_, i) =>
      animal({
        animalId: `vencida-${i}`,
        derivado: derivado({ estado: 'proxima_a_secar', alertas: { ...derivado().alertas, secado_due: true } }),
      }),
    );
    const proximas = Array.from({ length: 2 }, (_, i) =>
      animal({ animalId: `proxima-${i}`, derivado: derivado({ estado: 'proxima_a_secar' }) }),
    );
    const resto = Array.from({ length: 3 }, (_, i) => animal({ animalId: `resto-${i}` })); // servida, sin alerta

    const resultado = derivarAlertasTablero([...vencidas, ...proximas, ...resto]);
    expect(resultado.secadoVencido).toHaveLength(5);
    expect(resultado.proximasASecar).toHaveLength(2);

    const idsVencidas = new Set(resultado.secadoVencido.map((x) => x.animalId));
    const idsProximas = new Set(resultado.proximasASecar.map((x) => x.animalId));
    const interseccion = [...idsVencidas].filter((id) => idsProximas.has(id));
    expect(interseccion).toEqual([]);
  });

  it('aplana secadoVencido y proximasASecar bajo el mismo tipo "secado", vencidas primero', () => {
    const vencida = animal({
      animalId: 'vencida',
      derivado: derivado({ estado: 'proxima_a_secar', alertas: { ...derivado().alertas, secado_due: true } }),
    });
    const proxima = animal({ animalId: 'proxima', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const resultado = derivarAlertasTablero([proxima, vencida]);
    expect(resultado.filas.map((f) => ({ tipo: f.tipo, id: f.animal.animalId }))).toEqual([
      { tipo: 'secado', id: 'vencida' },
      { tipo: 'secado', id: 'proxima' },
    ]);
  });

  it('clasifica próxima a parir solo por alertas.parto_proximo', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const b = animal({ animalId: 'b' });
    expect(derivarAlertasTablero([a, b]).proximasAParir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('clasifica rechequeo pendiente solo por alertas.rechequeo_due', () => {
    const a = animal({ animalId: 'a', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const b = animal({ animalId: 'b' });
    expect(derivarAlertasTablero([a, b]).rechequeoPendiente.map((x) => x.animalId)).toEqual(['a']);
  });

  it('vacías por servir se calcula SOLO sobre el hato en ordeño (categoria === "hato")', () => {
    const enOrdeno = animal({ animalId: 'a', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    const horro = animal({ animalId: 'b', categoria: 'horro', derivado: derivado({ estado: 'vacia_por_servir' }) });
    expect(derivarAlertasTablero([enOrdeno, horro]).vaciasPorServir.map((x) => x.animalId)).toEqual(['a']);
  });

  it('aplana las 4 listas en el orden secado→parto→rechequeo→servir', () => {
    const secado = animal({ animalId: 'secado', derivado: derivado({ estado: 'proxima_a_secar' }) });
    const parto = animal({ animalId: 'parto', derivado: derivado({ alertas: { ...derivado().alertas, parto_proximo: true } }) });
    const rechequeo = animal({ animalId: 'rechequeo', derivado: derivado({ alertas: { ...derivado().alertas, rechequeo_due: true } }) });
    const servir = animal({ animalId: 'servir', categoria: 'hato', derivado: derivado({ estado: 'vacia_por_servir' }) });
    expect(derivarAlertasTablero([servir, rechequeo, parto, secado]).filas.map((f) => f.tipo)).toEqual([
      'secado', 'parto', 'rechequeo', 'servir',
    ]);
  });

  it('un animal sin ninguna señal activa no genera ninguna fila', () => {
    expect(derivarAlertasTablero([animal({ animalId: 'quieto' })]).filas).toEqual([]);
  });
});

describe('vaciasMasDeNDias', () => {
  // Umbral real de producción (migración 084, `hato_config.dias_espera_
  // voluntaria_post_parto`). `HOY` y las fechas de parto son literales fijos
  // (nunca `new Date()`) para que el test sea determinístico.
  const CONFIG: Pick<HatoConfig, 'dias_espera_voluntaria_post_parto'> = { dias_espera_voluntaria_post_parto: 90 };
  const HOY = '2026-08-17';
  const HACE_89_DIAS = '2026-05-20'; // < 90 -- todavía dentro de la espera voluntaria
  const HACE_90_DIAS = '2026-05-19'; // umbral exacto -- ya cuenta
  const HACE_100_DIAS = '2026-05-09';
  const HACE_150_DIAS = '2026-03-20';

  it('cuenta parida_reciente con parto a 90 días exactos o más (11 de producción, 2026-08-17)', () => {
    const vacias = Array.from({ length: 11 }, (_, i) =>
      animal({
        animalId: `vacia-${i}`,
        derivado: derivado({ estado: 'parida_reciente', dias_abiertos: 100 }),
        ultimoPartoFecha: i % 2 === 0 ? HACE_100_DIAS : HACE_150_DIAS,
      }),
    );
    const resultado = vaciasMasDeNDias(vacias, CONFIG, HOY);
    expect(resultado).toHaveLength(11);
  });

  it('también cuenta vacia_por_servir (p. ej. tras un aborto) con parto viejo, misma regla', () => {
    const a = animal({
      animalId: 'a',
      derivado: derivado({ estado: 'vacia_por_servir' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    expect(vaciasMasDeNDias([a], CONFIG, HOY).map((x) => x.animalId)).toEqual(['a']);
  });

  it('exactamente en el umbral (90 días) cuenta; un día antes (89) NO cuenta', () => {
    const enUmbral = animal({
      animalId: 'en-umbral',
      derivado: derivado({ estado: 'parida_reciente' }),
      ultimoPartoFecha: HACE_90_DIAS,
    });
    const antesDelUmbral = animal({
      animalId: 'antes',
      derivado: derivado({ estado: 'parida_reciente' }),
      ultimoPartoFecha: HACE_89_DIAS,
    });
    const resultado = vaciasMasDeNDias([enUmbral, antesDelUmbral], CONFIG, HOY);
    expect(resultado.map((x) => x.animalId)).toEqual(['en-umbral']);
  });

  it('una vaca SIN ultimoPartoFecha nunca entra -- sin dato es sin dato, no se infiere', () => {
    const sinParto = animal({
      animalId: 'sin-parto',
      derivado: derivado({ estado: 'parida_reciente' }),
      ultimoPartoFecha: null,
    });
    expect(vaciasMasDeNDias([sinParto], CONFIG, HOY)).toEqual([]);
  });

  it('una vaca no activa (vendida/muerta/descartada) nunca entra aunque su parto sea viejo', () => {
    const vendida = animal({
      animalId: 'vendida',
      estadoAnimal: 'vendida',
      derivado: derivado({ estado: 'parida_reciente' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    expect(vaciasMasDeNDias([vendida], CONFIG, HOY)).toEqual([]);
  });

  it('preñez SIN confirmar aún (servida) o CONFIRMADA (preñada/proxima_a_secar/seca) nunca cuenta como vacía', () => {
    const servida = animal({
      animalId: 'servida',
      derivado: derivado({ estado: 'servida' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    const prenada = animal({
      animalId: 'prenada',
      derivado: derivado({ estado: 'preñada' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    const proximaASecar = animal({
      animalId: 'proxima-a-secar',
      derivado: derivado({ estado: 'proxima_a_secar' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    const seca = animal({
      animalId: 'seca',
      derivado: derivado({ estado: 'seca' }),
      ultimoPartoFecha: HACE_150_DIAS,
    });
    expect(vaciasMasDeNDias([servida, prenada, proximaASecar, seca], CONFIG, HOY)).toEqual([]);
  });

  it('disjunto de secadoVencido/proximasASecar -- ningún animal puede caer en ambos conjuntos (11/5/2 de producción)', () => {
    const vacias = Array.from({ length: 11 }, (_, i) =>
      animal({
        animalId: `vacia-${i}`,
        derivado: derivado({ estado: 'parida_reciente' }),
        ultimoPartoFecha: HACE_100_DIAS,
      }),
    );
    const secadoVencido = Array.from({ length: 5 }, (_, i) =>
      animal({
        animalId: `secado-vencido-${i}`,
        derivado: derivado({ estado: 'proxima_a_secar', alertas: { ...derivado().alertas, secado_due: true } }),
      }),
    );
    const proximasASecar = Array.from({ length: 2 }, (_, i) =>
      animal({ animalId: `proxima-a-secar-${i}`, derivado: derivado({ estado: 'proxima_a_secar' }) }),
    );
    const todos = [...vacias, ...secadoVencido, ...proximasASecar];

    const resultadoVacias = vaciasMasDeNDias(todos, CONFIG, HOY);
    const resultadoAlertas = derivarAlertasTablero(todos);

    expect(resultadoVacias).toHaveLength(11);
    expect(resultadoAlertas.secadoVencido).toHaveLength(5);
    expect(resultadoAlertas.proximasASecar).toHaveLength(2);

    const idsVacias = new Set(resultadoVacias.map((x) => x.animalId));
    const idsSecado = new Set([...resultadoAlertas.secadoVencido, ...resultadoAlertas.proximasASecar].map((x) => x.animalId));
    const interseccion = [...idsVacias].filter((id) => idsSecado.has(id));
    expect(interseccion).toEqual([]);
  });
});

describe('contarVacasActivas', () => {
  // Caso real de producción (2026-08-17): 35 vacas activas
  // (`v_hato_estado_actual` con `estado='activa' AND etapa='vaca'`), pero
  // sólo 27 tenían pesaje en el último pesaje. El denominador del pulso de
  // hato ("27 de N vacas pesadas") tiene que salir de ESTE conteo, nunca de
  // `categoria === 'hato'`: esa categoría exige que
  // `derivarEstadoReproductivo` pueda devolver `estado === 'seca'`, y eso
  // depende de un evento `secado_real` que el motor de alertas nunca ha
  // podido escribir en producción (LAZO ABIERTO documentado en
  // `src/components/hato/CLAUDE.md`) -- así que `categoria === 'hato'`
  // subcuenta el hato real por construcción (26 en vez de 35), no por un
  // error de captura.
  it('cuenta etapa vaca + activa, sin importar la categoría de inventario (35 de producción)', () => {
    const vacasActivas = Array.from({ length: 35 }, (_, i) =>
      animal({ animalId: `vaca-${i}`, etapa: 'vaca', estadoAnimal: 'activa', categoria: 'hato' }),
    );
    expect(contarVacasActivas(vacasActivas)).toBe(35);
  });

  it('una vaca activa clasificada como "horro" (categoria !== "hato") SÍ cuenta -- el denominador no depende de la categoría', () => {
    const horro = animal({ animalId: 'horro', etapa: 'vaca', estadoAnimal: 'activa', categoria: 'horro' });
    expect(contarVacasActivas([horro])).toBe(1);
  });

  it('excluye etapas que no son "vaca" (novilla, ternera, toro)', () => {
    const novilla = animal({ animalId: 'novilla', etapa: 'novilla', estadoAnimal: 'activa' });
    const ternera = animal({ animalId: 'ternera', etapa: 'ternera', estadoAnimal: 'activa' });
    const toro = animal({ animalId: 'toro', etapa: 'toro', estadoAnimal: 'activa' });
    expect(contarVacasActivas([novilla, ternera, toro])).toBe(0);
  });

  it('excluye vacas no activas (vendida/muerta/descartada) aunque su etapa sea "vaca"', () => {
    const vendida = animal({ animalId: 'vendida', etapa: 'vaca', estadoAnimal: 'vendida' });
    const muerta = animal({ animalId: 'muerta', etapa: 'vaca', estadoAnimal: 'muerta' });
    expect(contarVacasActivas([vendida, muerta])).toBe(0);
  });
});

describe('nombreAnimalTablero', () => {
  it('lidera con el número cuando la chapeta NO es provisional', () => {
    expect(nombreAnimalTablero(animal({ numero: 47, numeroEsProvisional: false, nombre: 'Estrella' }))).toEqual({
      principal: '#47', secundario: 'Estrella',
    });
  });

  it('lidera con el nombre cuando la chapeta ES provisional (800-999)', () => {
    expect(nombreAnimalTablero(animal({ numero: 947, numeroEsProvisional: true, nombre: 'Estrella' }))).toEqual({
      principal: 'Estrella', secundario: '#947',
    });
  });

  it('lidera con el nombre cuando no hay número, y sin secundario', () => {
    expect(nombreAnimalTablero(animal({ numero: null, nombre: 'Estrella' }))).toEqual({
      principal: 'Estrella', secundario: null,
    });
  });

  it('usa "Sin nombre" cuando falta el nombre y la chapeta es provisional', () => {
    expect(nombreAnimalTablero(animal({ numero: 900, numeroEsProvisional: true, nombre: null }))).toEqual({
      principal: 'Sin nombre', secundario: '#900',
    });
  });
});

describe('ALERTA_META_TABLERO / PILL_ALERTA_TABLERO -- contrato de las 4 claves', () => {
  it('cubre exactamente los 4 tipos de alerta', () => {
    expect(Object.keys(ALERTA_META_TABLERO).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
    expect(Object.keys(PILL_ALERTA_TABLERO).sort()).toEqual(['parto', 'rechequeo', 'secado', 'servir']);
  });

  it('el pill de secado es "Vencido" cuando ya pasó la fecha', () => {
    const a = animal({ derivado: derivado({ fecha_secar: '2026-01-01' }) });
    expect(PILL_ALERTA_TABLERO.secado(a, '2026-07-24').label).toBe('Vencido');
  });
});
