// Independent synthetic fixtures and literal table oracles. No executor imports.
import type { Afirmacion, Disposicion, EntradaExperimento, Obligacion } from '../contracts.ts';
import type { ConsultaLabores, DatosLabores } from '../../../../src/utils/esco2/tipos.ts';

export interface Esperado {
  id: string;
  disposicion: Disposicion;
  afirmaciones: Omit<Afirmacion, 'id' | 'fuentes'>[];
  calificadores: string[];
}
export interface Escenario {
  id: string;
  familia: string;
  criterio: string;
  entrada: EntradaExperimento;
  esperado: Esperado[];
  pendiente?: boolean;
}
const ACTOR = { id: 'qa-owner', autenticado: true, activo: true, rol: 'Gerencia' };
export const tablas: DatosLabores = {
  lotes: [{ id: 'l1', nombre: 'Parcela A', activo: true }, { id: 'l2', nombre: 'Parcela B', activo: true }, { id: 'l3', nombre: 'Parcela C', activo: true }],
  tiposTareas: [{ id: 'tipo1', nombre: 'Poda', categoria: 'Mantenimiento del cultivo' }],
  tareas: [
    { id: 't1', nombre: 'Poda', estado: 'Completada', tipo_tarea_id: 'tipo1', jornales_estimados: 0, fecha_estimada_inicio: '2026-10-26' },
    { id: 't2', nombre: 'Poda', estado: 'En Proceso', tipo_tarea_id: 'tipo1', jornales_estimados: null, fecha_estimada_inicio: '2026-11-01' },
    { id: 't3', nombre: 'Riego', estado: 'Programada', tipo_tarea_id: 'tipo1', jornales_estimados: 5, fecha_estimada_inicio: '2026-11-05' },
    { id: 't4', nombre: 'Mezcla', estado: 'Programada', tipo_tarea_id: 'tipo1', jornales_estimados: 1, fecha_estimada_inicio: '2026-11-05' },
  ],
  registros: [
    { id: 'r1', tarea_id: 't1', lote_id: 'l1', fecha_trabajo: '2026-10-26', fraccion_jornal: 1, costo_jornal: 100 },
    { id: 'r2a', tarea_id: 't2', lote_id: 'l2', fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 50 },
    { id: 'r2b', tarea_id: 't2', lote_id: 'l2', fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 50 },
    { id: 'r3', tarea_id: 't2', lote_id: null, fecha_trabajo: '2026-11-02', fraccion_jornal: 0.5, costo_jornal: null },
    { id: 'r4', tarea_id: 't1', lote_id: 'l3', fecha_trabajo: '2026-11-03', fraccion_jornal: 1, costo_jornal: 50 },
  ],
  aplicaciones: [{ id: 'a1', tarea_id: 't1', codigo_aplicacion: 'QA-A', nombre_aplicacion: 'Mezcla igual', estado: 'Cerrada' }, { id: 'a2', tarea_id: 't2', codigo_aplicacion: 'QA-B', nombre_aplicacion: 'Mezcla igual', estado: 'Abierta' }],
};
const copiar = <T>(v: T): T => structuredClone(v);
function q(p: Partial<ConsultaLabores> = {}): ConsultaLabores {
  return { proposito: 'scope labels must come from code', desde: '2026-10-26', hasta: '2026-11-04', lotes: [], tareas: [], categorias: [], sin_lote: 'incluir', agrupar_por: [], metricas: ['jornales'], incluir_estado_tarea: false, limite: null, ...p };
}
function o(id: string, p: Partial<Obligacion> = {}, consulta: Partial<ConsultaLabores> = {}): Obligacion {
  return { id, consulta: q(consulta), cohorte: 'trabajo_registrado', baseFecha: 'fecha_trabajo', requeridos: ['metricas'], ...p };
}
function entrada(obligaciones: Obligacion[], pregunta: string): EntradaExperimento {
  return { pregunta, hoyBogota: '2026-11-04', datos: copiar(tablas), actor: { ...ACTOR }, obligaciones, fuente: { id: 'qa-synthetic-v1', tablasCompletas: ['registros', 'tareas', 'tiposTareas', 'lotes', 'aplicaciones'], camposNoDisponibles: [], aplicacionesCompletas: true, consistencia: 'snapshot_sintetico', asignacionesTareaLote: [{ tareaId: 't3', loteId: 'l1' }, { tareaId: 't4', loteId: 'l2' }], asignacionesCompletas: true } };
}
function c(ob: Obligacion, tipo: Afirmacion['entidad']['tipo'], id: string, nombre: string, metrica: Afirmacion['metrica'], valor: Afirmacion['valor'], estado: Afirmacion['estado'] = 'conocido', calificadores: string[] = []): Omit<Afirmacion, 'id' | 'fuentes'> {
  const unidad = metrica === 'costo' ? 'moneda' : metrica === 'miembros' || metrica === 'asociaciones' ? 'ids' : metrica === 'estado_actual' ? 'estado' : 'jornales';
  return { obligacionId: ob.id, entidad: { tipo, id, nombre }, metrica, unidad, cohorte: ob.cohorte, baseFecha: ob.baseFecha, desde: ob.consulta.desde, hasta: ob.consulta.hasta, estado, valor, calificadores };
}
function e(ob: Obligacion, afirmaciones: Esperado['afirmaciones'], disposicion: Disposicion = 'respondida', calificadores: string[] = []): Esperado { return { id: ob.id, disposicion, afirmaciones, calificadores }; }
const s: Escenario[] = [];
{
  const ob = o('assoc', { tareaIds: ['t1'], requeridos: ['asociaciones'] }); const en = entrada([ob], '¿Qué aplicación originó t1?'); delete en.datos.aplicaciones; en.fuente.aplicacionesCompletas = false; en.fuente.tablasCompletas = en.fuente.tablasCompletas.filter(t => t !== 'aplicaciones');
  s.push({ id: 'S01', familia: 'source', criterio: 'Given unread applications, when association requested, then unknown never verified absence.', entrada: en, esperado: [e(ob, [c(ob, 'tarea', 't1', 'Poda', 'asociaciones', null, 'no_disponible', ['alcance_visible'])], 'fuente_no_disponible')] });
}
{
  const ob = o('assoc', { tareaIds: ['t1'], requeridos: ['asociaciones'] }); const en = entrada([ob], '¿Qué aplicación originó t1?'); en.datos.aplicaciones = [];
  s.push({ id: 'S02', familia: 'source', criterio: 'Given complete empty visible association table, then assert verified empty only in visible scope.', entrada: en, esperado: [e(ob, [c(ob, 'tarea', 't1', 'Poda', 'asociaciones', [], 'vacio_verificado', ['alcance_visible'])])] });
}
{
  const ob = o('schedule', { cohorte: 'tarea_programada', baseFecha: 'fecha_estimada_inicio', loteIds: ['l1'], requeridos: ['miembros', 'estado_actual'] }, { desde: '2026-11-05', hasta: '2026-11-06' });
  s.push({ id: 'S03', familia: 'source', criterio: 'Given future tasks with explicit assignments, then select scheduled-start cohort and lot proof independent of work.', entrada: entrada([ob], 'Tareas que inician mañana en Parcela A y su estado actual.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'miembros', ['t3']), c(ob, 'tarea', 't3', 'Riego', 'estado_actual', 'Programada', 'conocido', ['estado_actual'])])] });
}
{
  const zero = o('zero', { tareaIds: ['t3'] }, { metricas: ['jornales', 'costo'] });
  const ob = o('null', {}, { metricas: ['jornales', 'costo'], desde: '2026-11-02', hasta: '2026-11-02' });
  s.push({ id: 'S04', familia: 'source', criterio: 'Given recorded null cost and known work, then retain work 0.5 and null cost, never zero cost.', entrada: entrada([ob, zero], 'Jornales y costo del 2 de noviembre, y de t3 sin registros.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 0.5), c(ob, 'total', 'total', 'Total', 'costo', null, 'nulo')]), e(zero, [c(zero, 'total', 'total', 'Total', 'jornales', 0), c(zero, 'total', 'total', 'Total', 'costo', 0)])] });
}
{
  const ob = o('week', {}, { desde: '2026-10-26', hasta: '2026-11-01' });
  s.push({ id: 'S05', familia: 'calendar', criterio: 'Given Bogotá today Nov 4 and previous Monday-Sunday interval crossing month, then include Oct26 and Nov1 only.', entrada: entrada([ob], 'Jornales de la semana pasada.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 3)])] });
}
{
  const ob = o('duplicate', { tareaIds: ['t1', 't2'] }, { agrupar_por: ['tarea'] });
  s.push({ id: 'S06', familia: 'calendar', criterio: 'Given duplicate task names with distinct IDs, then preserve two independent groups.', entrada: entrada([ob], 'Jornales de t1 y t2 por tarea.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 4.5), c(ob, 'tarea', 't1', 'Poda', 'jornales', 2), c(ob, 'tarea', 't2', 'Poda', 'jornales', 2.5)])] });
}
{
  const ob = o('rank', { ranking: { metrica: 'costo', direccion: 'desc', n: 1, empates: 'incluir' }, requeridos: ['metricas', 'miembros'] }, { agrupar_por: ['lote'], metricas: ['costo'], sin_lote: 'excluir' });
  const qualifiers = ['ranking:costo:desc:incluir', 'ranking_total:3', 'ranking_mostrados:2', 'ranking_omitidos:1'];
  s.push({ id: 'S07', familia: 'calendar', criterio: 'Given cost ties and a lower third group, top1 including ties returns l1/l2 and declares omitted remainder.', entrada: entrada([ob], 'Lote con mayor costo; incluye empates.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'costo', 250), c(ob, 'lote', 'l1', 'Parcela A', 'costo', 100), c(ob, 'lote', 'l2', 'Parcela B', 'costo', 100), c(ob, 'total', 'total', 'Total', 'miembros', ['l1', 'l2'])], 'respondida', qualifiers)] });
}
{
  const ob = o('missing-date', { cohorte: 'tarea_programada', baseFecha: 'fecha_estimada_inicio', requeridos: ['miembros'] }, { desde: '2026-11-05', hasta: '2026-11-06' }); const en = entrada([ob], '¿Qué tareas inician mañana?'); en.datos.tareas = en.datos.tareas.map(({ fecha_estimada_inicio: _unused, ...t }) => t);
  s.push({ id: 'S08', familia: 'calendar', criterio: 'Given unread scheduled-start field, when scheduling asked, then source unavailable not empty task set.', entrada: en, esperado: [e(ob, [], 'fuente_no_disponible')] });
}
{
  const ob = o('binding', { tareaIds: ['t1', 't2'] }, { metricas: ['jornales', 'costo'], agrupar_por: ['tarea'] }); const en = entrada([ob], '¿Son 777 jornales? Muestra jornales y costo de t1/t2.'); en.datos.registros = [
    ...Array.from({ length: 2 }, (_, i) => ({ id: `rb1-${i}`, tarea_id: 't1', lote_id: 'l1', fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 4 })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `rb2-${i}`, tarea_id: 't2', lote_id: 'l2', fecha_trabajo: '2026-11-01', fraccion_jornal: 1, costo_jornal: 0.25 })),
  ];
  s.push({ id: 'S09', familia: 'claims', criterio: 'Given crossed equal magnitudes, then metric/entity assignments stay bound and question-only 777 is not evidence.', entrada: en, esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 10), c(ob, 'total', 'total', 'Total', 'costo', 10), c(ob, 'tarea', 't1', 'Poda', 'jornales', 2), c(ob, 'tarea', 't1', 'Poda', 'costo', 8), c(ob, 'tarea', 't2', 'Poda', 'jornales', 8), c(ob, 'tarea', 't2', 'Poda', 'costo', 2)])] });
}
{
  const ob = o('sets', { tareaIds: ['t1', 't2', 't3'], requeridos: ['asociaciones'] });
  const en = entrada([ob], 'Aplicaciones de t1, t2 y t3, incluso sin registros.'); en.datos.aplicaciones!.push({ id: 'a3', tarea_id: 't3', codigo_aplicacion: 'QA-C', nombre_aplicacion: 'Mezcla igual', estado: 'Abierta' });
  s.push({ id: 'S10', familia: 'claims', criterio: 'Given duplicate application labels, then associations use exact application IDs joined by task ID.', entrada: en, esperado: [e(ob, [c(ob, 'tarea', 't1', 'Poda', 'asociaciones', ['a1'], 'conocido', ['alcance_visible']), c(ob, 'tarea', 't2', 'Poda', 'asociaciones', ['a2'], 'conocido', ['alcance_visible']), c(ob, 'tarea', 't3', 'Riego', 'asociaciones', ['a3'], 'conocido', ['alcance_visible'])])] });
}
{
  const ob = o('reconcile', { requeridos: ['metricas', 'reconciliacion'] }, { agrupar_por: ['lote'] });
  s.push({ id: 'S11', familia: 'claims', criterio: 'Given sin-lote work, then total reconciles disjoint named lots and explicit sin-lote group.', entrada: entrada([ob], 'Jornales por lote; incluye sin lote y reconcilia.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 4.5), c(ob, 'lote', 'l1', 'Parcela A', 'jornales', 1), c(ob, 'lote', 'l2', 'Parcela B', 'jornales', 2), c(ob, 'lote', 'l3', 'Parcela C', 'jornales', 1), c(ob, 'lote', 'sin_lote', '(sin lote)', 'jornales', 0.5), c(ob, 'total', 'total', 'Total', 'reconciliacion', 4.5, 'conocido', ['sin_lote_incluido'])])] });
}
{
  const ob = o('estimates', { tareaIds: ['t1', 't2', 't3'], requeridos: ['metricas', 'estimados'] }, { categorias: ['Mantenimiento del cultivo'] });
  s.push({ id: 'S12', familia: 'claims', criterio: 'Given whole-task estimates zero/null/5, then report registered 4.5 separately from known estimate5 with incomplete qualification.', entrada: entrada([ob], 'Jornales registrados y estimados de la categoría, tareas t1/t2/t3.'), esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 4.5), c(ob, 'total', 'total', 'Total', 'jornales_estimados', 5, 'conocido', ['estimado_tarea_completa', 'estimado_parcial', 'estimados_faltantes:1'])])] });
}
{
  const ob1 = o('work'); const ob2 = o('assoc', { tareaIds: ['t1'], requeridos: ['asociaciones'] }); const en = entrada([ob1, ob2], 'Total jornales y aplicación de t1.'); delete en.datos.aplicaciones; en.fuente.aplicacionesCompletas = false; en.fuente.tablasCompletas = en.fuente.tablasCompletas.filter(t => t !== 'aplicaciones');
  s.push({ id: 'S13', familia: 'conversation', criterio: 'Given multipart with one unavailable relation, then retain answered work obligation and unavailable association disposition.', entrada: en, esperado: [e(ob1, [c(ob1, 'total', 'total', 'Total', 'jornales', 4.5)]), e(ob2, [c(ob2, 'tarea', 't1', 'Poda', 'asociaciones', null, 'no_disponible', ['alcance_visible'])], 'fuente_no_disponible')] });
}
const alternativas = [{ id: 'opt-t1', etiqueta: 'Tarea t1', tareaIds: ['t1'] }, { id: 'opt-t2', etiqueta: 'Tarea t2', tareaIds: ['t2'] }];
{
  const opciones = [...alternativas, { id: 'opt-category', etiqueta: 'Categoría Poda', categorias: ['Poda'] }];
  const ob = o('ambiguous', { aclaracion: { termino: 'Poda', alternativas: opciones }, requeridos: ['metricas'] });
  const en = entrada([ob], 'Jornales de Poda.'); en.datos.tiposTareas[0].categoria = 'Poda';
  s.push({ id: 'S14', familia: 'conversation', criterio: 'Given task-name/category collision plus duplicate task labels and no disambiguating signal, then clarify without invented selection.', entrada: en, esperado: [e(ob, [], 'aclaracion')], pendiente: true });
}
{
  const ob = o('followup'); const en = entrada([ob], 'opt-t2'); en.estado = { version: 1, propietario: ACTOR.id, pendiente: { obligacionId: ob.id, termino: 'Poda', alternativas } }; en.respuestaAclaracion = 'opt-t2';
  s.push({ id: 'S15', familia: 'conversation', criterio: 'Given authenticated typed pending alternatives and exact accepted option, then answer t2 only and clear pending state.', entrada: en, esperado: [e(ob, [c(ob, 'total', 'total', 'Total', 'jornales', 2.5)])], pendiente: false });
}
{
  const ob = o('followup'); const en = entrada([ob], 'Haz lo que quieras.'); en.estado = { version: 1, propietario: ACTOR.id, pendiente: { obligacionId: ob.id, termino: 'Poda', alternativas } };
  s.push({ id: 'S16', familia: 'conversation', criterio: 'Given unrelated reply to pending question, then preserve pending clarification and assert no facts.', entrada: en, esperado: [e(ob, [], 'aclaracion')], pendiente: true });
}
export const escenarios: readonly Escenario[] = s;
export const MUTACIONES = ['entidad_incorrecta', 'unidad_incorrecta', 'base_fecha_incorrecta', 'miembro_incorrecto', 'calificador_ausente', 'numero_solo_pregunta', 'obligacion_omitida', 'desconocido_a_vacio'] as const;

// Additional predeclared source capability controls; excluded from the 16-scenario denominator.
const sinAsignacion = copiar(s.find(x => x.id === 'S03')!);
sinAsignacion.id = 'X01'; sinAsignacion.criterio = 'Given missing authoritative task-lot assignment guarantee, then lot scheduling is unavailable, never inferred from work.';
sinAsignacion.entrada.fuente.asignacionesCompletas = false; delete sinAsignacion.entrada.fuente.asignacionesTareaLote;
sinAsignacion.esperado = [e(sinAsignacion.entrada.obligaciones[0], [], 'fuente_no_disponible')];
export const controlesExtra: readonly Escenario[] = [sinAsignacion];
