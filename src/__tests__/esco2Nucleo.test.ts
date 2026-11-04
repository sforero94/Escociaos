import { describe, expect, it } from 'vitest';
import { resolverLotes, resolverTareas } from '../utils/esco2/catalogo.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from '../utils/esco2/ejecutor.ts';
import { evidenciaNumerica, verificarNumeros } from '../utils/esco2/guardaNumerica.ts';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { responderTurno, type ConfigModelos } from '../utils/esco2/nucleo.ts';
import { ErrorPlan, validarPlan } from '../utils/esco2/registro.ts';
import type { ConsultaLabores, DatosLabores } from '../utils/esco2/tipos.ts';

// Datos 100 % sintéticos.
const datos: DatosLabores = {
  lotes: [
    { id: 'L1', nombre: '1. Lote Norte', activo: true },
    { id: 'L2', nombre: '2. Lote Sur', activo: true },
    { id: 'L3', nombre: '3. La Loma', activo: true },
  ],
  tiposTareas: [
    { id: 'T1', nombre: 'Cosecha', categoria: 'Cosecha' },
    { id: 'T2', nombre: 'Proyecto', categoria: 'Proyectos Especiales' },
    { id: 'T3', nombre: 'Guadaña', categoria: 'Mantenimiento del cultivo' },
  ],
  tareas: [
    { id: 'a', nombre: 'Cosecha fruta temprana', estado: 'Completada', tipo_tarea_id: 'T1', jornales_estimados: 30 },
    { id: 'b', nombre: 'Clasificación cosecha ', estado: 'En Proceso', tipo_tarea_id: 'T1', jornales_estimados: 10 },
    { id: 'c', nombre: 'Compostaje', estado: 'Programada', tipo_tarea_id: 'T2', jornales_estimados: 50 },
    { id: 'd', nombre: 'Guadaña general', estado: 'En Proceso', tipo_tarea_id: 'T3', jornales_estimados: null },
  ],
  registros: [
    { id: 'r1', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-04', fraccion_jornal: 1, costo_jornal: 100000 },
    { id: 'r2', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-05', fraccion_jornal: 0.5, costo_jornal: 50000 },
    { id: 'r3', tarea_id: 'a', lote_id: 'L2', fecha_trabajo: '2026-05-06', fraccion_jornal: 0.75, costo_jornal: 75000 },
    { id: 'r4', tarea_id: 'b', lote_id: null, fecha_trabajo: '2026-05-06', fraccion_jornal: 0.25, costo_jornal: 25000 },
    { id: 'r5', tarea_id: 'd', lote_id: 'L3', fecha_trabajo: '2026-05-07', fraccion_jornal: 1, costo_jornal: null },
    { id: 'r6', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-20', fraccion_jornal: 1, costo_jornal: 100000 },
  ],
};

function consulta(p: Partial<ConsultaLabores>): ConsultaLabores {
  return {
    proposito: 'prueba',
    desde: '2026-05-01',
    hasta: '2026-05-10',
    lotes: [],
    tareas: [],
    categorias: [],
    sin_lote: 'incluir',
    agrupar_por: [],
    metricas: ['jornales', 'costo'],
    incluir_estado_tarea: false,
    limite: null,
    ...p,
  };
}

describe('catálogo', () => {
  it('resuelve lotes sin el número ni tildes, y reporta lo desconocido sin adivinar', () => {
    const r = resolverLotes(['lote norte', 'la loma', 'Grinch'], datos.lotes);
    expect(r.nombres).toEqual(['1. Lote Norte', '3. La Loma']);
    expect(r.noResueltos).toHaveLength(1);
    expect(r.noResueltos[0]).toMatchObject({ texto: 'Grinch', motivo: 'sin_coincidencia' });
  });

  it('un lote ambiguo no se resuelve', () => {
    const r = resolverLotes(['loma'], [...datos.lotes, { id: 'L4', nombre: '4. Loma Alta', activo: true }]);
    expect(r.ids.size).toBe(0);
    expect(r.noResueltos[0].motivo).toBe('ambiguo');
  });

  it('un fragmento de tarea abarca todas las tareas que lo contienen', () => {
    const r = resolverTareas(['cosecha'], datos.tareas);
    expect(r.nombres).toEqual(['Clasificación cosecha', 'Cosecha fruta temprana']);
  });

  it('el tipo de tarea filtra solo cuando ningún nombre coincide', () => {
    // "proyecto" no está en ningún nombre: cae al tipo "Proyecto".
    expect(resolverTareas(['proyecto'], datos.tareas, datos.tiposTareas).nombres).toEqual(['Compostaje']);
    // "cosecha" sí está en nombres: no arrastra otras tareas del tipo Cosecha.
    const conTipo = [...datos.tareas, { id: 'e', nombre: 'Empaque', estado: null, tipo_tarea_id: 'T1', jornales_estimados: null }];
    expect(resolverTareas(['cosecha'], conTipo, datos.tiposTareas).nombres).toEqual(['Clasificación cosecha', 'Cosecha fruta temprana']);
  });
});

describe('ejecutor', () => {
  it('los registros sin lote forman su propio grupo y el total los incluye', () => {
    const r = ejecutarConsulta(consulta({ agrupar_por: ['lote'] }), datos, '2026-12-31', 'p1');
    const sinLote = r.filas.find((f) => f.grupo.lote === SIN_LOTE_ETIQUETA);
    expect(sinLote?.jornales).toBe(0.25);
    expect(r.total.jornales).toBe(3.5);
    expect(r.cobertura.registros_sin_lote).toBe(1);
  });

  it('costo nulo no se convierte en cero', () => {
    const r = ejecutarConsulta(consulta({ lotes: ['la loma'] }), datos, '2026-12-31', 'p1');
    expect(r.total.costo).toBeNull();
    expect(r.cobertura.registros_sin_costo).toBe(1);
  });

  it('un filtro no resuelto deja la parte sin cifras en vez de sumar todo', () => {
    const r = ejecutarConsulta(consulta({ tareas: ['grinch'] }), datos, '2026-12-31', 'p1');
    expect(r.estado).toBe('no_resuelto');
    expect(r.total).toEqual({});
    expect(r.filas).toEqual([]);
  });

  it('recorta hasta a hoy y lo declara', () => {
    const r = ejecutarConsulta(consulta({ hasta: '2026-05-31' }), datos, '2026-05-10', 'p1');
    expect(r.alcance.hasta).toBe('2026-05-10');
    expect(r.alcance.hasta_recortado_a_hoy).toBe(true);
    expect(r.total.jornales).toBe(3.5);
  });

  it('con estado de tarea, incluye tareas filtradas sin registros', () => {
    const r = ejecutarConsulta(
      consulta({ categorias: ['proyectos especiales'], agrupar_por: ['tarea'], incluir_estado_tarea: true }),
      datos,
      '2026-12-31',
      'p1',
    );
    expect(r.filas).toEqual([expect.objectContaining({ grupo: { tarea: 'Compostaje' }, jornales: 0, estado_tarea: 'Programada', jornales_estimados: 50 })]);
  });

  it('el límite conserva el orden por jornales y declara los grupos totales', () => {
    const r = ejecutarConsulta(consulta({ agrupar_por: ['lote'], limite: 1 }), datos, '2026-12-31', 'p1');
    expect(r.filas.map((f) => f.grupo.lote)).toEqual(['1. Lote Norte']);
    expect(r.cobertura).toMatchObject({ grupos_totales: 4, grupos_mostrados: 1 });
    expect(r.filas[0].porcentaje_jornales).toBe(42.9);
  });

  it('primer y último registro y días con registro', () => {
    const r = ejecutarConsulta(
      consulta({ tareas: ['cosecha fruta'], hasta: '2026-05-31', metricas: ['primer_registro', 'ultimo_registro', 'dias_con_registro'] }),
      datos,
      '2026-12-31',
      'p1',
    );
    expect(r.total).toMatchObject({ jornales: 3.25, primer_registro: '2026-05-04', ultimo_registro: '2026-05-20', dias_con_registro: 4 });
    expect(r.total.costo).toBeUndefined();
  });
});

describe('registro', () => {
  const llamada = (args: Record<string, unknown>) => ({ nombre: 'consultar_labores', argumentos: JSON.stringify(args) });
  const valido = { proposito: 'x', desde: '2026-01-01', hasta: '2026-02-01', agrupar_por: ['lote'], metricas: ['jornales'] };

  it('acepta un plan válido', () => {
    const p = validarPlan([llamada(valido)]);
    expect(p.tipo).toBe('consultas');
  });

  it.each([
    [{ ...valido, sql: 'select 1' }, /no registrado/],
    [{ ...valido, desde: '2026-02-30' }, /fechas/],
    [{ ...valido, desde: '2026-03-01' }, /posterior/],
    [{ ...valido, agrupar_por: ['empleado'] }, /agrupación/],
    [{ ...valido, metricas: [] }, /métricas/],
  ])('rechaza argumentos inválidos %#', (args, error) => {
    expect(() => validarPlan([llamada(args)])).toThrow(error);
  });

  it('rechaza herramientas no registradas y más de 4 consultas', () => {
    expect(() => validarPlan([{ nombre: 'run_sql', argumentos: '{}' }])).toThrow(ErrorPlan);
    expect(() => validarPlan(Array.from({ length: 5 }, () => llamada(valido)))).toThrow(/más de 4/);
  });

  it('una aclaración gana sobre las consultas', () => {
    const p = validarPlan([llamada(valido), { nombre: 'pedir_aclaracion', argumentos: JSON.stringify({ pregunta: '¿Cuál lote?', motivo: 'ambiguo' }) }]);
    expect(p.tipo).toBe('aclaracion');
  });
});

describe('guarda numérica', () => {
  const r = ejecutarConsulta(consulta({ agrupar_por: ['lote'] }), datos, '2026-12-31', 'p1');
  const ev = evidenciaNumerica([r], '2026-12-31', '¿cuántos jornales?');

  it('acepta cifras de la evidencia en formato colombiano', () => {
    expect(verificarNumeros('Del 1 al 10 de mayo de 2026 hubo 3,5 jornales. Lote Norte: 1,5 jornales y $150.000 (42,9 %).', ev).ok).toBe(true);
  });

  it('acepta millones abreviados con un decimal y rechaza un total que no existe', () => {
    const grande = evidenciaNumerica([{ ...r, total: { jornales: 239.5, costo: 23904292 } }], '2026-12-31', '');
    expect(verificarNumeros('Costo: $23,9M.', grande).ok).toBe(true);
    // El costo total del alcance es null (un registro sin costo): sumar los grupos sería inventarlo.
    expect(verificarNumeros('Costo total: $250.000.', ev).ok).toBe(false);
  });

  it('rechaza una cifra inventada y una fecha que no está en la evidencia', () => {
    const g = verificarNumeros('Hubo 4,5 jornales; el último fue el 2026-05-09.', ev);
    expect(g.ok).toBe(false);
    expect(g.noSoportados).toEqual(['2026-05-09', '4,5']);
  });

  it('ignora marcadores de lista numerada', () => {
    expect(verificarNumeros('1. Lote Norte\n2. Lote Sur', ev).ok).toBe(true);
  });
});

describe('recorrido del turno', () => {
  const config: ConfigModelos = {
    nombre: 'falso',
    planificador: { modelo: 'falso', esfuerzo: 'none' },
    compositor: { modelo: 'falso', esfuerzo: 'none' },
  };
  function falso(respuestas: Partial<RespuestaLLM>[]): ClienteLLM & { solicitudes: SolicitudLLM[] } {
    const solicitudes: SolicitudLLM[] = [];
    return {
      solicitudes,
      async completar(s) {
        solicitudes.push(s);
        const r = respuestas.shift() ?? {};
        return { texto: '', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, modelo: 'falso', finishReason: 'stop', ...r };
      },
    };
  }
  const planValido = { llamadas: [{ nombre: 'consultar_labores', argumentos: JSON.stringify({ proposito: 'total', desde: '2026-05-01', hasta: '2026-05-10', agrupar_por: [], metricas: ['jornales'] }) }] };

  it('publica la respuesta del compositor cuando pasa la guarda', async () => {
    const llm = falso([planValido, { texto: 'Del 1 al 10 de mayo hubo 3,5 jornales.' }]);
    const t = await responderTurno({ pregunta: 'jornales', historial: [], hoy: '2026-12-31', datos, llm, config });
    expect(t.origen).toBe('compositor');
    expect(t.llamadas).toHaveLength(2);
  });

  it('tras dos fallos de la guarda publica el resumen determinista, con tres llamadas como máximo', async () => {
    const llm = falso([planValido, { texto: 'Hubo 99 jornales.' }, { texto: 'Fueron 98 jornales.' }]);
    const t = await responderTurno({ pregunta: 'jornales', historial: [], hoy: '2026-12-31', datos, llm, config });
    expect(t.origen).toBe('determinista');
    expect(t.respuesta).toContain('3,5 jornales');
    expect(t.llamadas).toHaveLength(3);
    expect(t.guarda).toEqual({ primera: ['99'], segunda: ['98'] });
  });

  it('un plan inválido no ejecuta nada ni llama al compositor', async () => {
    const llm = falso([{ llamadas: [{ nombre: 'run_sql', argumentos: '{}' }] }]);
    const t = await responderTurno({ pregunta: 'x', historial: [], hoy: '2026-12-31', datos, llm, config });
    expect(t.origen).toBe('error_plan');
    expect(t.resultados).toEqual([]);
    expect(llm.solicitudes).toHaveLength(1);
  });
});
