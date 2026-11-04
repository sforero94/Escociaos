import { describe, expect, it } from 'vitest';
import { aplicarReglaDoble, terminoDoble } from '../utils/esco2/ambiguedad.ts';
import { ErrorDatos, fuenteSupabase } from '../utils/esco2/fuente.ts';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { rangoDelPlan, responderTurno, responderTurnoDesdeFuente, type ConfigModelos } from '../utils/esco2/nucleo.ts';
import { elegirRuta } from '../utils/esco2/ruteo.ts';
import type { ConsultaLabores, DatosLabores, Plan } from '../utils/esco2/tipos.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';

// Datos 100 % sintéticos.
const datos: DatosLabores = {
  lotes: [
    { id: 'L1', nombre: '1. Lote Norte', activo: true },
    { id: 'L2', nombre: '2. Lote Sur', activo: true },
  ],
  tiposTareas: [
    { id: 'T1', nombre: 'Cosecha', categoria: 'Cosecha' },
    { id: 'T2', nombre: 'Proyecto', categoria: 'Proyectos Especiales' },
    { id: 'T3', nombre: 'Guadaña', categoria: 'Mantenimiento del cultivo' },
  ],
  tareas: [
    { id: 'a', nombre: 'Cosecha fruta temprana', estado: 'Completada', tipo_tarea_id: 'T1', jornales_estimados: 30 },
    { id: 'b', nombre: 'Clasificación cosecha', estado: 'En Proceso', tipo_tarea_id: 'T1', jornales_estimados: 10 },
    { id: 'c', nombre: 'Compostaje', estado: 'Programada', tipo_tarea_id: 'T2', jornales_estimados: 50 },
    { id: 'd', nombre: 'Guadaña general', estado: 'En Proceso', tipo_tarea_id: 'T3', jornales_estimados: null },
    // Tipificada como Cosecha pero sin "cosecha" en el nombre: separa tarea de categoría.
    { id: 'e', nombre: 'Empaque', estado: 'En Proceso', tipo_tarea_id: 'T1', jornales_estimados: null },
  ],
  registros: [
    { id: 'r1', tarea_id: 'a', lote_id: 'L1', fecha_trabajo: '2026-05-04', fraccion_jornal: 1, costo_jornal: 100000 },
    { id: 'r2', tarea_id: 'b', lote_id: null, fecha_trabajo: '2026-05-05', fraccion_jornal: 0.5, costo_jornal: 50000 },
    { id: 'r3', tarea_id: 'e', lote_id: 'L2', fecha_trabajo: '2026-05-06', fraccion_jornal: 0.25, costo_jornal: 25000 },
    { id: 'r4', tarea_id: 'd', lote_id: 'L2', fecha_trabajo: '2026-05-07', fraccion_jornal: 1, costo_jornal: 90000 },
    { id: 'r5', tarea_id: 'c', lote_id: 'L1', fecha_trabajo: '2026-05-08', fraccion_jornal: 0.75, costo_jornal: 70000 },
  ],
};

function c(p: Partial<ConsultaLabores>): ConsultaLabores {
  return {
    proposito: 'prueba',
    desde: '2026-05-01',
    hasta: '2026-05-31',
    lotes: [],
    tareas: [],
    categorias: [],
    sin_lote: 'incluir',
    agrupar_por: [],
    metricas: ['jornales'],
    incluir_estado_tarea: false,
    limite: null,
    ...p,
  };
}

const plan = (...consultas: ConsultaLabores[]): Plan => ({ tipo: 'consultas', consultas });

describe('D26: palabra que es categoría y tarea', () => {
  it('detecta «cosecha» como término doble y no «guadaña» ni un nombre completo', () => {
    expect(terminoDoble('cosecha', datos)).toMatchObject({ categoria: 'Cosecha', tareas: ['Clasificación cosecha', 'Cosecha fruta temprana'] });
    expect(terminoDoble('guadaña', datos)).toBeNull();
    expect(terminoDoble('Cosecha fruta temprana', datos)).toBeNull();
  });

  it('sin señal: pide aclaración en vez de elegir', () => {
    const r = aplicarReglaDoble(plan(c({ tareas: ['cosecha'] })), datos);
    expect(r.plan.tipo).toBe('aclaracion');
    if (r.plan.tipo === 'aclaracion') {
      expect(r.plan.aclaracion.pregunta).toContain('categoría Cosecha');
      expect(r.plan.aclaracion.pregunta).toContain('Cosecha fruta temprana');
    }
    // Igual si el planificador la puso como categoría.
    expect(aplicarReglaDoble(plan(c({ categorias: ['Cosecha'] })), datos).plan.tipo).toBe('aclaracion');
  });

  it('junto a otras tareas (aunque sea en otra parte del plan): es tarea', () => {
    const r = aplicarReglaDoble(plan(c({ categorias: ['cosecha'] }), c({ tareas: ['guadaña'] })), datos);
    expect(r.plan.tipo).toBe('consultas');
    if (r.plan.tipo === 'consultas') {
      expect(r.plan.consultas[0]).toMatchObject({ tareas: ['cosecha'], categorias: [] });
    }
    expect(r.ajustes).toEqual(['D26: «cosecha» pasó de categoria a tarea']);
  });

  it('junto a otras categorías: es categoría', () => {
    const r = aplicarReglaDoble(plan(c({ tareas: ['cosecha'], categorias: ['Proyectos Especiales'] })), datos);
    expect(r.plan.tipo).toBe('consultas');
    if (r.plan.tipo === 'consultas') expect(r.plan.consultas[0]).toMatchObject({ tareas: [], categorias: ['cosecha', 'Proyectos Especiales'] });
  });

  it('señales opuestas: pregunta', () => {
    const r = aplicarReglaDoble(plan(c({ tareas: ['cosecha', 'guadaña'], categorias: ['Proyectos Especiales'] })), datos);
    expect(r.plan.tipo).toBe('aclaracion');
  });

  it('si el turno anterior fue la pregunta D26, respeta lo que el usuario contestó', () => {
    const previa = aplicarReglaDoble(plan(c({ tareas: ['cosecha'] })), datos).plan;
    const pregunta = previa.tipo === 'aclaracion' ? previa.aclaracion.pregunta : '';
    const historial = [
      { rol: 'user' as const, texto: '¿cuántos jornales de cosecha en mayo?' },
      { rol: 'assistant' as const, texto: pregunta },
    ];
    const r = aplicarReglaDoble(plan(c({ categorias: ['cosecha'] })), datos, historial);
    expect(r.plan.tipo).toBe('consultas');
    if (r.plan.tipo === 'consultas') expect(r.plan.consultas[0].categorias).toEqual(['cosecha']);
  });

  it('la diferencia importa: tarea excluye «Empaque», categoría lo incluye', async () => {
    const llm = llmFalso([[{ tareas: ['cosecha'] }, { tareas: ['guadaña'] }]]);
    const t = await responderTurno({ pregunta: 'cosecha y guadaña en mayo', historial: [], hoy: '2026-06-01', datos, llm, config: CONFIG });
    expect(t.resultados[0].alcance.tareas).toEqual(['Clasificación cosecha', 'Cosecha fruta temprana']);
    expect(t.resultados[0].total.jornales).toBe(1.5);
    const llm2 = llmFalso([[{ categorias: ['cosecha', 'Proyectos Especiales'] }]]);
    const t2 = await responderTurno({ pregunta: 'categorías cosecha y proyectos', historial: [], hoy: '2026-06-01', datos, llm: llm2, config: CONFIG });
    expect(t2.resultados[0].total.jornales).toBe(2.5);
  });

  it('turno completo sin señal: una sola llamada al modelo y respuesta de aclaración', async () => {
    const llm = llmFalso([[{ tareas: ['cosecha'] }]]);
    const t = await responderTurno({ pregunta: 'jornales de cosecha', historial: [], hoy: '2026-06-01', datos, llm, config: CONFIG });
    expect(t.origen).toBe('aclaracion');
    expect(t.llamadas).toHaveLength(1);
    expect(t.resultados).toHaveLength(0);
  });
});

// --- LLM falso -------------------------------------------------------------------

const CONFIG: ConfigModelos = {
  nombre: 'prueba',
  planificador: { modelo: 'luna', esfuerzo: 'none' },
  compositor: { modelo: 'luna', esfuerzo: 'none' },
  compositorReforzado: { modelo: 'sol', esfuerzo: 'low' },
};

function respuesta(p: Partial<RespuestaLLM>, modelo: string): RespuestaLLM {
  return { texto: '', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, modelo, finishReason: 'stop', ...p };
}

/** El planificador devuelve las consultas dadas; el compositor responde un texto sin cifras. */
function llmFalso(planes: Array<Array<Partial<ConsultaLabores>>>, textoCompositor = 'Listo.'): ClienteLLM & { solicitudes: SolicitudLLM[] } {
  const solicitudes: SolicitudLLM[] = [];
  let i = 0;
  return {
    solicitudes,
    async completar(s) {
      solicitudes.push(s);
      if (s.herramientas) {
        const partes = planes[i++] ?? [];
        return respuesta(
          {
            llamadas: partes.map((p) => ({
              nombre: 'consultar_labores',
              argumentos: JSON.stringify({ proposito: 'x', desde: '2026-05-01', hasta: '2026-05-31', agrupar_por: [], metricas: ['jornales'], ...p }),
            })),
          },
          s.modelo,
        );
      }
      return respuesta({ texto: textoCompositor }, s.modelo);
    },
  };
}

describe('D25: ruta del compositor por regla determinista', () => {
  it('una parte → Luna; dos partes → Sol', async () => {
    const una = llmFalso([[{ tareas: ['guadaña'] }]]);
    const t1 = await responderTurno({ pregunta: 'guadaña', historial: [], hoy: '2026-06-01', datos, llm: una, config: CONFIG });
    expect(t1.ruta).toBe('habitual');
    expect(una.solicitudes.map((s) => s.modelo)).toEqual(['luna', 'luna']);

    const dos = llmFalso([[{ tareas: ['guadaña'] }, { lotes: ['lote norte'] }]]);
    const t2 = await responderTurno({ pregunta: 'guadaña y lote norte', historial: [], hoy: '2026-06-01', datos, llm: dos, config: CONFIG });
    expect(t2.ruta).toBe('reforzada');
    expect(dos.solicitudes.map((s) => s.modelo)).toEqual(['luna', 'sol']);
  });

  it('la recomposición usa el mismo modelo que la composición', async () => {
    const llm = llmFalso([[{ tareas: ['guadaña'] }, { lotes: ['lote norte'] }]], 'Fueron 999 jornales.');
    const t = await responderTurno({ pregunta: 'guadaña y lote norte', historial: [], hoy: '2026-06-01', datos, llm, config: CONFIG });
    expect(t.origen).toBe('determinista');
    expect(llm.solicitudes.map((s) => s.modelo)).toEqual(['luna', 'sol', 'sol']);
  });

  it('sin compositor reforzado configurado, siempre la ruta habitual', async () => {
    const llm = llmFalso([[{ tareas: ['guadaña'] }, { lotes: ['lote norte'] }]]);
    const { compositorReforzado: _omitido, ...sinRefuerzo } = CONFIG;
    await responderTurno({ pregunta: 'x', historial: [], hoy: '2026-06-01', datos, llm, config: sinRefuerzo });
    expect(llm.solicitudes.map((s) => s.modelo)).toEqual(['luna', 'luna']);
  });

  it('el modelo nunca elige: aclaración y fuera de alcance no tienen ruta', () => {
    expect(elegirRuta({ tipo: 'aclaracion', aclaracion: { pregunta: '?', motivo: '' } })).toBe('habitual');
    expect(elegirRuta(plan(c({}), c({}), c({})))).toBe('reforzada');
  });
});

// --- Fuente paginada ------------------------------------------------------------

function tablasSinteticas(nRegistros: number): Record<string, Record<string, unknown>[]> {
  const fracciones = ['0.25', '0.5', '0.75', '1.0'];
  const registros = Array.from({ length: nRegistros }, (_, i) => ({
    id: `r${String(i).padStart(5, '0')}`,
    tarea_id: 'd',
    lote_id: i % 10 === 0 ? null : 'L1',
    fecha_trabajo: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    fraccion_jornal: fracciones[i % 4],
    costo_jornal: i === 7 ? null : '1000.00',
  }));
  return {
    registros_trabajo: registros,
    tareas: datos.tareas.map((t) => ({ ...t, jornales_estimados: t.jornales_estimados === null ? null : String(t.jornales_estimados) })),
    tipos_tareas: datos.tiposTareas.map((t) => ({ ...t })),
    lotes: datos.lotes.map((l) => ({ ...l })),
  };
}

describe('fuente Supabase paginada', () => {
  it('lee las 2.500 filas en tres páginas y convierte el ENUM y el costo nulo', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(2500), { maxFilas: 1000 });
    const regs = await fuenteSupabase(cliente).registros('2026-05-01', '2026-05-31');
    expect(regs).toHaveLength(2500);
    expect(regs.reduce((s, r) => s + r.fraccion_jornal, 0)).toBe(1562.5);
    expect(regs.filter((r) => r.costo_jornal === null)).toHaveLength(1);
    expect(cliente.llamadas.filter((l) => l.tabla === 'registros_trabajo').map((l) => l.rango)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(cliente.llamadas[0].columnas).toBe('id,tarea_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal');
  });

  it('un tope del servidor por debajo de la página: sigue paginando y lee todo', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(2500), { maxFilas: 500 });
    expect(await fuenteSupabase(cliente).registros('2026-05-01', '2026-05-31')).toHaveLength(2500);
  });

  it('si el servidor deja de entregar filas antes del conteo: falla, nunca devuelve datos recortados', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(2500), { limiteTotal: 1800 });
    await expect(fuenteSupabase(cliente).registros('2026-05-01', '2026-05-31')).rejects.toThrow('lectura incompleta (1800 de 2500 filas)');
  });

  it('sin conteo exacto no se puede comprobar la lectura: falla', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(10), { sinConteo: true });
    await expect(fuenteSupabase(cliente).registros('2026-05-01', '2026-05-31')).rejects.toBeInstanceOf(ErrorDatos);
  });

  it('un error de lectura termina el turno en error_datos, sin llamar al compositor', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(10), { errores: { registros_trabajo: 'permission denied' } });
    const llm = llmFalso([[{ tareas: ['guadaña'] }]]);
    const t = await responderTurnoDesdeFuente({ pregunta: 'guadaña', historial: [], hoy: '2026-06-01', fuente: fuenteSupabase(cliente), llm, config: CONFIG });
    expect(t.origen).toBe('error_datos');
    expect(t.respuesta).not.toMatch(/\d/);
    expect(llm.solicitudes).toHaveLength(1);
  });

  it('pide solo el rango del plan, recortado a hoy', async () => {
    const cliente = clientePostgrestFalso(tablasSinteticas(10));
    const llm = llmFalso([[{ tareas: ['guadaña'], desde: '2026-05-10', hasta: '2026-12-31' }]]);
    const t = await responderTurnoDesdeFuente({ pregunta: 'guadaña', historial: [], hoy: '2026-05-20', fuente: fuenteSupabase(cliente), llm, config: CONFIG });
    expect(t.origen).toBe('compositor');
    expect(rangoDelPlan(t.plan!, '2026-05-20')).toEqual({ desde: '2026-05-10', hasta: '2026-05-20' });
    expect(t.resultados[0].cobertura.registros).toBe(1);
  });
});
