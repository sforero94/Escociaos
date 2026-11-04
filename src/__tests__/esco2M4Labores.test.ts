// Esco 2.0 M4 (alcance de labores): fechas de tarea, agrupación por día y tipo, razones
// calculadas por código, aplicación de origen, estimados D30, cifras obligatorias, scorer exacto
// y D29. Datos 100 % sintéticos.

import { describe, expect, it } from 'vitest';
import { aplicarReglaDoble } from '../utils/esco2/ambiguedad.ts';
import { ejecutarConsulta, SIN_LOTE_ETIQUETA } from '../utils/esco2/ejecutor.ts';
import { esAclaracionD26, puntuarCaso, puntuarIntento, type Ancla } from '../utils/esco2/evaluacion.ts';
import { extraerFechas } from '../utils/esco2/fechasTexto.ts';
import { fuenteSupabase } from '../utils/esco2/fuente.ts';
import { cifrasObligatorias, evidenciaNumerica, verificarCifrasObligatorias, verificarNumeros } from '../utils/esco2/guardaNumerica.ts';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '../utils/esco2/llm.ts';
import { renderDeterminista, responderTurno, type ConfigModelos, type ResultadoTurno } from '../utils/esco2/nucleo.ts';
import { ErrorPlan, herramientasPlanificador, validarPlan } from '../utils/esco2/registro.ts';
import type { ConsultaLabores, DatosLabores, ResultadoParte } from '../utils/esco2/tipos.ts';
import { datos as datosSinteticos } from '../../scripts/esco2/fixtureSintetico.ts';
import { clientePostgrestFalso } from './esco2PostgrestFalso.ts';

const datos: DatosLabores = datosSinteticos;

function consulta(p: Partial<ConsultaLabores>): ConsultaLabores {
  return {
    proposito: 'prueba',
    desde: '2026-05-01',
    hasta: '2026-05-31',
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

const ejecutar = (p: Partial<ConsultaLabores>, d: DatosLabores = datos) => ejecutarConsulta(consulta(p), d, '2026-06-01', 'p1');
const fila = (r: ResultadoParte, clave: string) => r.filas.find((f) => Object.values(f.grupo).includes(clave))!;

// --- Registro y validación ----------------------------------------------------------------

describe('registro: agrupaciones, métricas y datos de tarea', () => {
  const llamar = (args: Record<string, unknown>) =>
    validarPlan([{ nombre: 'consultar_labores', argumentos: JSON.stringify({ proposito: 'x', desde: '2026-05-01', hasta: '2026-05-31', agrupar_por: [], metricas: ['jornales'], ...args }) }]);

  it('el esquema que ve el modelo ofrece día, tipo de tarea y las tres razones', () => {
    const f = (herramientasPlanificador() as Array<{ function: { name: string; parameters: { properties: Record<string, { items?: { enum?: string[] } }> } } }>).find((h) => h.function.name === 'consultar_labores')!;
    expect(f.function.parameters.properties.agrupar_por.items?.enum).toEqual(expect.arrayContaining(['dia', 'tipo_tarea']));
    expect(f.function.parameters.properties.metricas.items?.enum).toEqual(expect.arrayContaining(['jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal']));
  });

  it('acepta las agrupaciones y métricas nuevas y rechaza las no registradas', () => {
    const p = llamar({ agrupar_por: ['dia', 'tipo_tarea'], metricas: ['jornales', 'jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal'] });
    expect(p.tipo === 'consultas' && p.consultas[0].agrupar_por).toEqual(['dia', 'tipo_tarea']);
    expect(() => llamar({ agrupar_por: ['trimestre'] })).toThrow(ErrorPlan);
    expect(() => llamar({ metricas: ['jornales_por_planta'] })).toThrow(ErrorPlan);
    expect(() => llamar({ agrupar_por: ['dia', 'lote', 'tarea'] })).toThrow(ErrorPlan);
  });

  it('pedir datos de tarea sin agrupar por tarea agrega la agrupación en código; sin espacio, rechaza', () => {
    const p = llamar({ incluir_estado_tarea: true, tareas: ['compostaje'] });
    expect(p.tipo === 'consultas' && p.consultas[0].agrupar_por).toEqual(['tarea']);
    const q = llamar({ incluir_estado_tarea: true, agrupar_por: ['lote'] });
    expect(q.tipo === 'consultas' && q.consultas[0].agrupar_por).toEqual(['lote', 'tarea']);
    expect(() => llamar({ incluir_estado_tarea: true, agrupar_por: ['lote', 'mes'] })).toThrow('incluir_estado_tarea exige agrupar por tarea');
  });
});

// --- Brecha 1 y 4: fechas de tarea y aplicación de origen --------------------------------------

describe('fechas planeadas y reales de la tarea, y aplicación de origen', () => {
  it('cada fila por tarea trae estado, las cuatro fechas y la aplicación', () => {
    const r = ejecutar({ tareas: ['compostaje', 'cosecha temprana'], agrupar_por: ['tarea'], incluir_estado_tarea: true });
    expect(fila(r, 'Compostaje')).toMatchObject({
      estado_tarea: 'Completada',
      fechas_tarea: { estimada_inicio: '2026-05-07', estimada_fin: '2026-05-09', real_inicio: '2026-05-08', real_fin: '2026-05-08' },
      aplicacion: { codigo: 'APL-1', nombre: 'Compostaje de mayo', estado: 'Cerrada' },
    });
    // Una fecha ausente es null, no una fecha inventada ni el último registro.
    expect(fila(r, 'Cosecha temprana').fechas_tarea).toEqual({ estimada_inicio: '2026-05-01', estimada_fin: '2026-05-31', real_inicio: '2026-05-02', real_fin: null });
    // Una tarea que no viene de una aplicación lo dice con null.
    expect(fila(r, 'Cosecha temprana').aplicacion).toBeNull();
  });

  it('lista la tarea filtrada que aún no tiene registros, con sus fechas planeadas', () => {
    const r = ejecutar({ tareas: ['mezcla'], agrupar_por: ['tarea'], incluir_estado_tarea: true, desde: '2026-06-01', hasta: '2026-06-30' }, { ...datos, registros: [] });
    expect(r.estado).toBe('ok');
    expect(fila(r, 'Mezcla')).toMatchObject({ jornales: 0, estado_tarea: 'Programada', fechas_tarea: { real_inicio: null } });
  });

  it('si la fuente no leyó fechas ni aplicaciones, el campo no existe (no se dice «sin fecha»)', () => {
    const viejo: DatosLabores = {
      ...datos,
      aplicaciones: undefined,
      tareas: datos.tareas.map(({ id, nombre, estado, tipo_tarea_id, jornales_estimados }) => ({ id, nombre, estado, tipo_tarea_id, jornales_estimados })),
    };
    const r = ejecutar({ tareas: ['compostaje'], agrupar_por: ['tarea'], incluir_estado_tarea: true }, viejo);
    expect(r.filas[0]).not.toHaveProperty('fechas_tarea');
    expect(r.filas[0]).not.toHaveProperty('aplicacion');
    expect(r.filas[0].estado_tarea).toBe('Completada');
  });

  it('sin incluir_estado_tarea no viajan datos de tarea', () => {
    const r = ejecutar({ tareas: ['compostaje'], agrupar_por: ['tarea'] });
    expect(r.filas[0]).not.toHaveProperty('fechas_tarea');
    expect(r.filas[0]).not.toHaveProperty('aplicacion');
  });
});

// --- Brecha 2: agrupar por día y por tipo de tarea ---------------------------------------------------

describe('agrupar por día y por tipo de tarea', () => {
  it('por día: una fila por fecha, el sin lote se cuenta y el costo nulo sigue nulo', () => {
    const r = ejecutar({ agrupar_por: ['dia'] });
    expect(r.filas.map((f) => f.grupo.dia).sort()).toEqual(['2026-05-04', '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08']);
    expect(fila(r, '2026-05-06')).toMatchObject({ jornales: 1, costo: 100000 });
    expect(fila(r, '2026-05-07')).toMatchObject({ jornales: 1, costo: null });
    expect(r.cobertura.registros_sin_lote).toBe(1);
  });

  it('por día y lote: el registro sin lote forma su propio grupo', () => {
    const r = ejecutar({ agrupar_por: ['dia', 'lote'] });
    expect(r.filas.find((f) => f.grupo.dia === '2026-05-06' && f.grupo.lote === SIN_LOTE_ETIQUETA)).toMatchObject({ jornales: 0.25, costo: 25000 });
    expect(r.filas.reduce((s, f) => s + (f.jornales ?? 0), 0)).toBe(r.total.jornales);
  });

  it('por tipo de tarea: usa el nombre del tipo, no la categoría', () => {
    const r = ejecutar({ agrupar_por: ['tipo_tarea'] });
    expect(fila(r, 'Cosecha')).toMatchObject({ jornales: 2.5, costo: 250000 });
    expect(fila(r, 'Guadaña')).toMatchObject({ jornales: 1, costo: null });
    expect(fila(r, 'Proyecto').jornales).toBe(0.75);
  });

  it('una tarea sin tipo cae en «(sin tipo)», nunca se reparte', () => {
    const r = ejecutar({ agrupar_por: ['tipo_tarea'] }, { ...datos, tareas: datos.tareas.map((t) => (t.id === 'e' ? { ...t, tipo_tarea_id: null } : t)) });
    expect(fila(r, '(sin tipo)').jornales).toBe(0.25);
  });
});

// --- Brecha 3: razones calculadas por código ------------------------------------------------------

describe('razones: jornales por árbol, por hectárea y costo por jornal', () => {
  it('por lote: divide el jornal del lote por sus árboles y hectáreas', () => {
    const r = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales', 'jornales_por_arbol', 'jornales_por_hectarea'] });
    expect(fila(r, '1. Norte')).toMatchObject({ jornales: 2, jornales_por_arbol: 0.02, jornales_por_hectarea: 0.5 });
    expect(fila(r, '3. Loma')).toMatchObject({ jornales: 1.25, jornales_por_arbol: 0.025 });
  });

  it('sin árboles o hectáreas en el catálogo la razón es null y la nota dice cuál lote', () => {
    const r = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales', 'jornales_por_arbol', 'jornales_por_hectarea'] });
    expect(fila(r, '2. Sur').jornales_por_arbol).toBeNull();
    expect(fila(r, '3. Loma').jornales_por_hectarea).toBeNull();
    expect(r.notas.join('|')).toContain('jornales_por_arbol (2. Sur): sin árboles registrados en el catálogo para 2. Sur');
    expect(r.notas.join('|')).toContain('jornales_por_hectarea (3. Loma): sin hectáreas registrados en el catálogo para 3. Loma');
  });

  it('el grupo «(sin lote)» no tiene base: null, nunca se reparte', () => {
    const r = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales', 'jornales_por_arbol'] });
    expect(fila(r, SIN_LOTE_ETIQUETA).jornales_por_arbol).toBeNull();
  });

  it('el total solo lleva razón por árbol cuando se nombran lotes', () => {
    const sinNombrar = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales', 'jornales_por_arbol'] });
    expect(sinNombrar.total.jornales_por_arbol).toBeNull();
    expect(sinNombrar.notas.join('|')).toContain('jornales_por_arbol (total): sin lotes de referencia');
    const nombrado = ejecutar({ lotes: ['norte'], metricas: ['jornales', 'jornales_por_arbol', 'jornales_por_hectarea'] });
    expect(nombrado.total).toMatchObject({ jornales: 2, jornales_por_arbol: 0.02, jornales_por_hectarea: 0.5 });
    // Con varios lotes nombrados, uno sin base vuelve null a todo el total: no se calcula con medio denominador.
    const mezcla = ejecutar({ lotes: ['norte', 'sur'], metricas: ['jornales', 'jornales_por_arbol'] });
    expect(mezcla.total.jornales_por_arbol).toBeNull();
  });

  it('por mes con lotes nombrados usa el mismo denominador en cada fila', () => {
    const r = ejecutar({ lotes: ['norte'], agrupar_por: ['dia'], metricas: ['jornales', 'jornales_por_arbol'] });
    expect(fila(r, '2026-05-04').jornales_por_arbol).toBe(0.01);
  });

  it('costo por jornal: costo entre jornales; null si falta algún costo o no hay jornales', () => {
    const r = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales', 'costo', 'costo_por_jornal'] });
    expect(fila(r, '1. Norte')).toMatchObject({ costo: 190000, costo_por_jornal: 95000 });
    expect(fila(r, '3. Loma')).toMatchObject({ costo: null, costo_por_jornal: null });
    expect(r.total.costo_por_jornal).toBeNull();
    expect(r.notas.join('|')).toContain('costo_por_jornal (3. Loma): algún registro no tiene costo');
    const sinJornales = ejecutar({ tareas: ['mezcla'], desde: '2026-06-01', hasta: '2026-06-30', agrupar_por: ['tarea'], incluir_estado_tarea: true, metricas: ['jornales', 'costo', 'costo_por_jornal'] });
    expect(sinJornales.filas[0].costo_por_jornal).toBeNull();
  });

  it('una razón no pedida no viaja', () => {
    const r = ejecutar({ agrupar_por: ['lote'], metricas: ['jornales'] });
    expect(r.filas[0]).not.toHaveProperty('jornales_por_arbol');
    expect(r.total).not.toHaveProperty('costo_por_jornal');
  });
});

// --- D30: estimados junto a registrados ---------------------------------------------------------

describe('D30: una categoría de tareas siempre muestra los estimados junto a los registrados', () => {
  it('el total trae los estimados de todas las tareas de la categoría, aparte de los registrados', () => {
    const r = ejecutar({ categorias: ['Cosecha'] });
    expect(r.total.jornales).toBe(2.5);
    expect(r.estimados).toEqual({ jornales_estimados: 40, tareas_en_alcance: 2, tareas_sin_estimado: 0, tareas_estimado_no_disponible:0, base: 'toda_la_categoria' });
  });

  it('cuenta las tareas sin estimado y no las vuelve cero en silencio', () => {
    const r = ejecutar({ categorias: ['Proyectos Especiales'] });
    expect(r.estimados).toMatchObject({ jornales_estimados: 50, tareas_en_alcance: 2, tareas_sin_estimado: 1 });
  });

  it('incluye las tareas de la categoría aunque no tengan registros en el período', () => {
    const r = ejecutar({ categorias: ['Cosecha'], desde: '2026-05-08', hasta: '2026-05-31' });
    expect(r.estado).toBe('sin_registros');
    expect(r.estimados?.jornales_estimados).toBe(40);
  });

  it('por tarea, por categoría o por tipo: el estimado de cada fila sale con su fila', () => {
    const porTarea = ejecutar({ categorias: ['Cosecha'], agrupar_por: ['tarea'] });
    expect(fila(porTarea, 'Cosecha temprana')).toMatchObject({ jornales: 2.25, jornales_estimados: 30 });
    expect(fila(porTarea, 'Clasificación cosecha')).toMatchObject({ jornales: 0.25, jornales_estimados: 10 });
    expect(fila(ejecutar({ categorias: ['Cosecha'], agrupar_por: ['categoria'] }), 'Cosecha').jornales_estimados).toBe(40);
    expect(fila(ejecutar({ categorias: ['Cosecha'], agrupar_por: ['tipo_tarea'] }), 'Cosecha').jornales_estimados).toBe(40);
  });

  it('con otra agrupación el estimado no se repite por fila (el total lo trae)', () => {
    const r = ejecutar({ categorias: ['Cosecha'], agrupar_por: ['lote'] });
    for (const f of r.filas) expect(f).not.toHaveProperty('jornales_estimados');
    expect(r.estimados?.jornales_estimados).toBe(40);
  });

  it('con filtro de lote, los estimados cubren solo las tareas con registros en esos lotes', () => {
    const r = ejecutar({ categorias: ['Cosecha'], lotes: ['sur'] });
    expect(r.estimados).toEqual({ jornales_estimados: 30, tareas_en_alcance: 1, tareas_sin_estimado: 0, tareas_estimado_no_disponible:0, base: 'tareas_con_registros_en_los_lotes' });
  });

  it('sin filtro de categoría no hay bloque de estimados (D30 no cambia las demás consultas)', () => {
    expect(ejecutar({ tareas: ['cosecha'] }).estimados).toBeUndefined();
    expect(ejecutar({ lotes: ['norte'] }).estimados).toBeUndefined();
  });

  it('una categoría no resuelta no produce estimados', () => {
    const r = ejecutar({ categorias: ['Inexistente'] });
    expect(r.estado).toBe('no_resuelto');
    expect(r.estimados).toBeUndefined();
  });
});

// --- Fuente de Supabase ------------------------------------------------------------------------------

describe('fuente de Supabase: columnas nuevas', () => {
  const tablas = (): Record<string, Record<string, unknown>[]> => ({
    tareas: datos.tareas.map((t) => ({ ...t, jornales_estimados: t.jornales_estimados === null ? null : String(t.jornales_estimados), fecha_inicio_real: t.fecha_inicio_real ? `${t.fecha_inicio_real}` : null })),
    tipos_tareas: datos.tiposTareas.map((t) => ({ ...t })),
    lotes: datos.lotes.map((l) => ({ ...l, area_hectareas: l.area_hectareas === null ? null : String(l.area_hectareas) })),
    aplicaciones: [{ id: 'AP1', tarea_id: 'c', codigo_aplicacion: 'APL-1', nombre_aplicacion: 'Compostaje de mayo ', estado: 'Cerrada' }] as Record<string, unknown>[],
  });

  it('lee fechas, árboles, hectáreas y aplicaciones con columnas fijas; null sigue null', async () => {
    const cliente = clientePostgrestFalso(tablas());
    const cat = await fuenteSupabase(cliente).catalogo();
    const norte = cat.lotes.find((l) => l.id === 'L1')!;
    expect(norte).toMatchObject({ total_arboles: 100, area_hectareas: 4 });
    expect(cat.lotes.find((l) => l.id === 'L2')?.total_arboles).toBeNull();
    expect(cat.tareas.find((t) => t.id === 'c')).toMatchObject({ fecha_estimada_inicio: '2026-05-07', fecha_fin_real: '2026-05-08' });
    expect(cat.tareas.find((t) => t.id === 'd')?.fecha_inicio_real).toBeNull();
    expect(cat.aplicaciones).toEqual([{ id: 'AP1', tarea_id: 'c', codigo_aplicacion: 'APL-1', nombre_aplicacion: 'Compostaje de mayo', estado: 'Cerrada' }]);
    const columnas = Object.fromEntries(cliente.llamadas.map((l) => [l.tabla, l.columnas]));
    expect(columnas.tareas).toBe('id,nombre,estado,tipo_tarea_id,jornales_estimados,lote_ids,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real');
    expect(columnas.lotes).toBe('id,nombre,activo,total_arboles,area_hectareas');
    expect(columnas.aplicaciones).toBe('id,tarea_id,codigo_aplicacion,nombre_aplicacion,estado');
  });

  it('P2 lectura de aplicaciones paginada conserva asociación no disponible si incompleta', async () => {
    const t = tablas();
    t.aplicaciones = Array.from({ length: 1200 }, (_, i) => ({ id: `AP${String(i).padStart(4, '0')}`, tarea_id: 'c', codigo_aplicacion: null as unknown as string, nombre_aplicacion: 'x', estado: 'Cerrada' }));
    expect((await fuenteSupabase(clientePostgrestFalso(t), {}).catalogo()).aplicaciones).toHaveLength(1200);
    expect((await fuenteSupabase(clientePostgrestFalso(t, { limiteTotal: 1100 })).catalogo()).aplicaciones).toBeUndefined();
  });

  it('una aplicación sin tarea se omite; no hace fallar el catálogo', async () => {
    const t = tablas();
    t.aplicaciones = [
      ...t.aplicaciones,
      { id: 'AP2', tarea_id: null, codigo_aplicacion: 'APL-2', nombre_aplicacion: 'Sin tarea', estado: 'Calculada' },
      { id: 'AP3', codigo_aplicacion: 'APL-3', nombre_aplicacion: 'Sin columna', estado: 'Calculada' },
    ];
    const cat = await fuenteSupabase(clientePostgrestFalso(t)).catalogo();
    expect(cat.aplicaciones?.map((a) => a.id)).toEqual(['AP1']);
    expect(cat.tareas).toHaveLength(datos.tareas.length);
  });
});

// --- Brecha 6: cifras obligatorias ------------------------------------------------------------------------

describe('cifras obligatorias: la guarda atrapa lo que la respuesta omite', () => {
  const partes = () => [ejecutar({ categorias: ['Cosecha'], metricas: ['jornales', 'costo'] })];

  it('lista el total, el costo y los estimados de la parte', () => {
    expect(cifrasObligatorias(partes()).map((c) => c.etiqueta)).toEqual(['jornales del total', 'costo del total', 'jornales estimados']);
  });

  it('una respuesta que omite los estimados (D30) o el costo no pasa', () => {
    const r = partes();
    expect(verificarCifrasObligatorias('Hubo 2,5 jornales registrados y $250.000.', r)).toEqual(['jornales estimados (p1): 40']);
    expect(verificarCifrasObligatorias('Hubo 2,5 jornales registrados y 40 estimados.', r)).toEqual(['costo del total (p1): 250000']);
    expect(verificarCifrasObligatorias('Hubo 2,5 jornales registrados ($250.000) y 40 estimados.', r)).toEqual([]);
  });

  it('en un plan de varias partes, falta el total de la parte que no se dijo', () => {
    const r = [ejecutar({ tareas: ['guadaña'], metricas: ['jornales'] }), ejecutar({ lotes: ['norte'], metricas: ['jornales'] })];
    expect(verificarCifrasObligatorias('Guadaña: 1 jornal.', r)).toEqual(['jornales del total (p1): 2']);
  });

  it('exige las fechas del total y no exige un null ni un cero', () => {
    const r = [ejecutar({ tareas: ['compostaje'], metricas: ['jornales', 'primer_registro', 'ultimo_registro'] })];
    expect(verificarCifrasObligatorias('Compostaje: 0,5 jornales. Empezó el 8 de mayo de 2026.', r)).toEqual([]);
    expect(verificarCifrasObligatorias('Compostaje: 0,5 jornales.', r)).toEqual(['primer_registro del total (p1): 2026-05-08', 'ultimo_registro del total (p1): 2026-05-08']);
    const vacio = ejecutar({ tareas: ['mezcla'], desde: '2026-06-01', hasta: '2026-06-30' });
    expect(cifrasObligatorias([vacio])).toEqual([]);
  });

  it('una razón null no se exige; una con valor, sí', () => {
    const r = [ejecutar({ lotes: ['norte'], metricas: ['jornales', 'jornales_por_arbol', 'costo_por_jornal'] })];
    expect(cifrasObligatorias(r).map((c) => c.etiqueta)).toEqual(expect.arrayContaining(['jornales_por_arbol del total', 'costo_por_jornal del total']));
    const nula = [ejecutar({ lotes: ['sur'], metricas: ['jornales', 'jornales_por_arbol'] })];
    expect(nula[0].total.jornales_por_arbol).toBeNull();
    expect(cifrasObligatorias(nula).map((c) => c.etiqueta)).toEqual(['jornales del total']);
  });

  it('la respuesta determinista siempre dice todo lo obligatorio y no trae cifras sin evidencia', () => {
    const consultas: Array<Partial<ConsultaLabores>> = [
      { categorias: ['Cosecha'], agrupar_por: ['tarea'], incluir_estado_tarea: true, metricas: ['jornales', 'costo', 'dias_con_registro', 'primer_registro', 'ultimo_registro'] },
      { agrupar_por: ['lote'], metricas: ['jornales', 'costo', 'costo_por_jornal', 'jornales_por_arbol', 'jornales_por_hectarea'] },
      { lotes: ['norte'], agrupar_por: ['dia'], metricas: ['jornales', 'jornales_por_arbol', 'jornales_por_hectarea', 'costo_por_jornal'] },
      { categorias: ['Proyectos Especiales'], agrupar_por: ['tipo_tarea'], metricas: ['jornales'] },
    ];
    for (const c of consultas) {
      const r = [ejecutar(c)];
      const texto = renderDeterminista(r);
      expect(verificarCifrasObligatorias(texto, r), JSON.stringify(c)).toEqual([]);
      expect(verificarNumeros(texto, evidenciaNumerica(r, '2026-06-01', '')).noSoportados, JSON.stringify(c)).toEqual([]);
    }
  });
});

// --- El turno completo con la guarda de cifras obligatorias --------------------------------------------------

const CONFIG: ConfigModelos = {
  nombre: 'prueba',
  planificador: { modelo: 'luna', esfuerzo: 'none' },
  compositor: { modelo: 'luna', esfuerzo: 'none' },
};

function llmConTextos(consultas: Array<Partial<ConsultaLabores>>, textos: string[]): ClienteLLM & { solicitudes: SolicitudLLM[] } {
  const solicitudes: SolicitudLLM[] = [];
  let i = 0;
  const r = (p: Partial<RespuestaLLM>): RespuestaLLM => ({ texto: '', llamadas: [], uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd: 0 }, ms: 1, modelo: 'falso', finishReason: 'stop', ...p });
  return {
    solicitudes,
    async completar(s) {
      solicitudes.push(s);
      if (s.herramientas) {
        return r({ llamadas: consultas.map((c) => ({ nombre: 'consultar_labores', argumentos: JSON.stringify({ proposito: 'x', desde: '2026-05-01', hasta: '2026-05-31', agrupar_por: [], metricas: ['jornales'], ...c }) })) });
      }
      return r({ texto: textos[i++] ?? textos[textos.length - 1] });
    },
  };
}

describe('P2: cifras obligatorias por render determinista, sin recomposición', () => {
  // «Proyectos Especiales» no es palabra doble (D26): 0,75 jornales registrados y 50 estimados (una tarea sin estimado).
  const turno = (textos: string[]) =>
    responderTurno({ pregunta: 'jornales de proyectos especiales', historial: [], hoy: '2026-06-01', datos, llm: llmConTextos([{ categorias: ['Proyectos Especiales'] }], textos), config: CONFIG });

  it('una respuesta correcta en cifras pero sin los estimados no se publica tal cual', async () => {
    const t = await turno(['Proyectos especiales: 0,75 jornales registrados.', 'Proyectos especiales: 0,75 jornales registrados y 50 jornales estimados (plan completo de esas tareas).']);
    expect(t.origen).toBe('determinista');
    expect(t.guarda.primera).toBeNull();
    expect(t.llamadas).toHaveLength(1);
  });

  it('el render no depende del texto que produciría un compositor', async () => {
    const t = await turno(['Proyectos especiales: 0,75 jornales registrados.']);
    expect(t.origen).toBe('determinista');
    expect(t.respuesta).toContain('estimados');
    expect(t.respuesta).toContain('50');
    expect(t.llamadas).toHaveLength(1);
  });

  it('una respuesta completa requiere solo planificación', async () => {
    const t = await turno(['Registrados: 0,75 jornales. Estimados: 50 jornales.']);
    expect(t.origen).toBe('determinista');
    expect(t.llamadas).toHaveLength(1);
  });
});

// --- Brecha 5: scorer exacto -----------------------------------------------------------------------------------

function turnoDe(respuesta: string, resultados: ResultadoParte[] = [], origen: ResultadoTurno['origen'] = 'compositor'): ResultadoTurno {
  return { respuesta, origen, plan: null, errorPlan: null, ruta: null, ajustes: [], resultados, guarda: { primera: [], segunda: null }, llamadas: [], ms: 1 };
}

describe('fechas en texto', () => {
  it('reconoce las formas habituales y no confunde rangos de jornales con fechas', () => {
    const f = extraerFechas('Del 18 al 31 de mayo de 2026; el 22-may; 27 abr y 2026-07-23; 3/8/2026. Fueron 10-12 jornales y 5 marcas.', 2026);
    expect([...f].sort()).toEqual(['2026-04-27', '2026-05-18', '2026-05-22', '2026-05-31', '2026-07-23', '2026-08-03']);
  });
  it('un mes sin día no es una fecha', () => {
    expect(extraerFechas('Durante mayo hubo 40 jornales; en mayo de 2026 también.', 2026).size).toBe(0);
  });
});

describe('scorer: fecha y conjunto de fechas exactos', () => {
  const rondas: Ancla = { claim: 'rondas', valor: ['2026-04-27', '2026-05-08', '2026-07-23', '2026-08-07'], tol: null, tipo: 'conjunto' };
  const resultadoConFechas = (fechas: string[]): ResultadoParte[] => [{ ...ejecutar({}), filas: fechas.map((f) => ({ grupo: { dia: f }, jornales: 1 })) }];
  const ok = ['2026-04-27', '2026-05-08', '2026-07-23', '2026-08-07'];

  it('el conjunto correcto, dicho completo, pasa', () => {
    const t = turnoDe('Australia: 27 de abril al 8 de mayo. Piedra Paula: 23 de julio al 7 de agosto.', resultadoConFechas(ok));
    expect(puntuarIntento(t, [rondas], { hoy: '2026-08-10' })).toMatchObject({ seleccionCorrecta: true, respuestaCorrecta: true, fechasDeMas: [] });
  });

  it('un conjunto con una fecha equivocada falla aunque los números sueltos coincidan', () => {
    // 27 y 8 y 23 y 7 aparecen como números; la fecha del cierre de Piedra Paula es otra.
    const t = turnoDe('Australia: 27 de abril al 8 de mayo. Piedra Paula: 23 de julio al 6 de agosto.', resultadoConFechas(ok));
    const p = puntuarIntento(t, [rondas], { hoy: '2026-08-10' });
    expect(p.respuestaCorrecta).toBe(false);
  });

  it('una fecha de más afirmada como hecho hace fallar el conjunto', () => {
    const t = turnoDe('Australia: 27 de abril al 8 de mayo. Piedra Paula: 23 de julio al 7 de agosto. Otra ronda empezó el 2 de junio.', resultadoConFechas(ok));
    const p = puntuarIntento(t, [rondas], { hoy: '2026-08-10' });
    expect(p.fechasDeMas).toEqual(['2026-06-02']);
    expect(p.respuestaCorrecta).toBe(false);
  });

  it('un miembro que falta falla; en resultados exige todos los miembros exactos', () => {
    const t = turnoDe('Australia: 27 de abril al 8 de mayo.', resultadoConFechas(ok.slice(0, 3)));
    const p = puntuarIntento(t, [rondas], { hoy: '2026-08-10' });
    expect(p.seleccionCorrecta).toBe(false);
    expect(p.respuestaCorrecta).toBe(false);
  });

  it('las fechas de contexto (hoy y el período consultado) y las permitidas no cuentan como de más', () => {
    const res = [{ ...ejecutar({ desde: '2026-04-01', hasta: '2026-08-10' }), filas: ok.map((f) => ({ grupo: { dia: f }, jornales: 1 })) }];
    const t = turnoDe('Del 1 de abril al 10 de agosto: 27 de abril, 8 de mayo, 23 de julio y 7 de agosto. Hoy es 10 de agosto de 2026. Cerrada el 15 de julio.', res);
    expect(puntuarIntento(t, [rondas], { hoy: '2026-08-10' }).respuestaCorrecta).toBe(false);
    expect(puntuarIntento(t, [{ ...rondas, permitidas: ['2026-07-15'] }], { hoy: '2026-08-10' }).respuestaCorrecta).toBe(true);
  });

  it('una fecha simple es exacta: otra fecha afirmada la hace fallar', () => {
    const ancla: Ancla = { claim: 'último registro', valor: '2026-05-22', tol: null, tipo: 'fecha' };
    const res = [{ ...ejecutar({}), filas: [{ grupo: { dia: '2026-05-22' }, jornales: 1 }] }];
    expect(puntuarIntento(turnoDe('El último registro fue el 22 de mayo.', res), [ancla], { hoy: '2026-06-01' }).respuestaCorrecta).toBe(true);
    expect(puntuarIntento(turnoDe('El último registro fue el 22 de mayo; empezó el 4 de mayo.', res), [ancla], { hoy: '2026-06-01' }).respuestaCorrecta).toBe(false);
    expect(puntuarIntento(turnoDe('El último registro fue el 23 de mayo.', res), [ancla], { hoy: '2026-06-01' })).toMatchObject({ respuestaCorrecta: false, seleccionCorrecta: true });
  });

  it('un conjunto de nombres: un miembro de más del universo falla', () => {
    const ancla: Ancla = { claim: 'lotes con cosecha', valor: ['La Vega', 'Piedra Paula'], tol: null, tipo: 'conjunto', universo: ['La Vega', 'Piedra Paula', 'Australia'] };
    const res = [{ ...ejecutar({}), filas: [{ grupo: { lote: 'La Vega' } }, { grupo: { lote: 'Piedra Paula' } }] }];
    expect(puntuarIntento(turnoDe('Cosecha en La Vega y Piedra Paula.', res), [ancla]).respuestaCorrecta).toBe(true);
    expect(puntuarIntento(turnoDe('Cosecha en La Vega, Piedra Paula y Australia.', res), [ancla]).respuestaCorrecta).toBe(false);
  });

  it('las anclas numéricas no cambian', () => {
    const ancla: Ancla = { claim: 'total', valor: 2.5, tol: 0.1, tipo: 'numero' };
    const t = turnoDe('Fueron 2,5 jornales hasta el 1 de junio.', [ejecutar({})]);
    expect(puntuarIntento(t, [ancla], { hoy: '2026-06-01' }).respuestaCorrecta).toBe(true);
  });
});

// --- D29 ------------------------------------------------------------------------------------------------------------

describe('D29: «cosecha» sola se pregunta; la cifra llega en el seguimiento', () => {
  const catalogo = { tareas: datos.tareas, tiposTareas: datos.tiposTareas };
  const planCosecha = { tipo: 'consultas' as const, consultas: [consulta({ tareas: ['cosecha'] })] };

  it('el núcleo hace la pregunta D26 y el scorer la acepta como correcta en el primer turno', () => {
    const d26 = aplicarReglaDoble(planCosecha, catalogo, []);
    expect(d26.plan.tipo).toBe('aclaracion');
    const pregunta = d26.plan.tipo === 'aclaracion' ? d26.plan.aclaracion.pregunta : '';
    const t1 = turnoDe(pregunta, [], 'aclaracion');
    expect(esAclaracionD26(t1)).toBe(true);
    const ancla: Ancla = { claim: 'cosecha por nombre', valor: 2.5, tol: 0.1, tipo: 'numero' };
    const r = ejecutar({ tareas: ['cosecha'] });
    const t2 = turnoDe('Las tareas con cosecha en el nombre suman 2,5 jornales.', [r]);
    expect(puntuarCaso([t1, t2], [ancla], { modo: 'aclaracion_d26', hoy: '2026-06-01' })).toMatchObject({ seleccionCorrecta: true, respuestaCorrecta: true });
  });

  it('dar la cifra de inmediato, sin preguntar, ya no es correcto', () => {
    const ancla: Ancla = { claim: 'cosecha por nombre', valor: 2.5, tol: 0.1, tipo: 'numero' };
    const t1 = turnoDe('Cosecha: 2,5 jornales.', [ejecutar({ tareas: ['cosecha'] })]);
    expect(puntuarCaso([t1], [ancla], { modo: 'aclaracion_d26', hoy: '2026-06-01' })).toMatchObject({ seleccionCorrecta: false, respuestaCorrecta: false });
  });

  it('preguntar y que el seguimiento no dé la cifra tampoco es correcto', () => {
    const ancla: Ancla = { claim: 'cosecha por nombre', valor: 2.5, tol: 0.1, tipo: 'numero' };
    const t1 = turnoDe('«cosecha» puede ser la categoría Cosecha o las tareas… ¿Cuál?', [], 'aclaracion');
    const t2 = turnoDe('Fueron 9 jornales.', [ejecutar({ tareas: ['guadaña'] })]);
    expect(puntuarCaso([t1, t2], [ancla], { modo: 'aclaracion_d26', hoy: '2026-06-01' }).respuestaCorrecta).toBe(false);
  });

  it('una aclaración que no es la D26 (otra causa) no cuenta', () => {
    expect(esAclaracionD26(turnoDe('¿A qué lote te refieres?', [], 'aclaracion'))).toBe(false);
  });
});
