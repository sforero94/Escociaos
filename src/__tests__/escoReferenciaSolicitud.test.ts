import { describe, expect, it } from 'vitest';
import { analizarPropositoUsuario, proponerPeriodoSolicitudUsuario, resolverReferenciaSolicitud, tieneReferenciaSolicitud } from '../utils/escoReferenciaSolicitud';
import { crearContextoNucleo } from '../utils/escoNucleoSolicitud';
import { proponerPeriodoUsuario, separarPeriodoUsuario, relacionFechaPeriodo, relacionSolapamientoPeriodo } from '../utils/escoAlcance';
const now = new Date('2034-05-10T17:00:00Z');
const previousUserAt = '2034-04-05T17:00:00Z';
const prior = 'Estado y fechas de la aplicación Sol en lote Norte del 2034-04-01 al 2034-04-05, sin nombres.';
const resolve = (question: string, previousUserText?: string, at: string | undefined = previousUserAt) =>
  resolverReferenciaSolicitud({ question, previousUserText, previousUserAt: at, now });

describe('USER-only reference proposals, never identity/cohort attestation', () => {
  it.each(['¿Cuánto costó en esa aplicación?', 'Jornales para esa aplicación', 'Y el costo', '¿Qué pasó en esos lotes?', 'Costo en esta aplicación'])('marks an orphan without inventing a selector: %s', question => {
    expect(resolve(question)).toEqual({ state: 'orphan', effectiveQuestion: question });
  });
  it.each(['Resumen de labores de la semana pasada', 'Y resumen de labores de la semana pasada',
    'Compras por producto del 2034-05-01 al 2034-05-07', 'Estado de la aplicación Luna', 'Y compras del producto Azul del 2034-05-01 al 2034-05-07'])('does not inherit an independent current request: %s', question => {
    expect(resolve(question, prior)).toEqual({ state: 'none', effectiveQuestion: question });
  });
  it('lets an explicit current application replace a prior one, even beside a demonstrative', () => {
    const question = 'Costo en esa aplicación llamada Luna del 2034-05-01 al 2034-05-07';
    expect(resolve(question, prior)).toEqual({ state: 'none', effectiveQuestion: question });
  });
  it('retains the same named application, lot, dates and exclusions without source IDs or receipts', () => {
    const r = resolve('Y el costo en esa aplicación', prior);
    expect(r.state).toBe('resolved'); expect(r.previousUserText).toBe(prior);
    expect(r.effectiveQuestion).toContain('aplicación Sol'); expect(r.effectiveQuestion).toContain('lote Norte');
    expect(r.effectiveQuestion).toContain('sin nombres'); expect(r.effectiveQuestion).not.toContain('esa aplicación');
    expect(proponerPeriodoUsuario(r.effectiveQuestion, now)).toMatchObject({ state: 'resolved', from: '2034-04-01', to: '2034-04-05' });
    expect(Object.keys(r).sort()).toEqual(['effectiveQuestion', 'previousUserText', 'state']);
  });
  it('current dates override prior dates while retaining business restrictions, never concatenating periods', () => {
    const r = resolve('Y el costo en esa aplicación del 2034-05-01 al 2034-05-07', prior);
    expect(r.state).toBe('resolved'); expect(r.effectiveQuestion).toContain('lote Norte');
    expect(r.effectiveQuestion).not.toContain('2034-04-01');
    expect(proponerPeriodoUsuario(r.effectiveQuestion, now)).toMatchObject({ from: '2034-05-01', to: '2034-05-07' });
  });
  it('keeps a scope/request boundary after an aggregate grouping without inventing a named lot', () => {
    const r = resolve('¿Y el costo por lote?', 'Jornales registrados por lote este mes.');
    expect(r.state).toBe('resolved'); expect(r.previousUserText).toBe('Jornales registrados por lote este mes.');
    expect(r.effectiveQuestion).toMatch(/por lote\s*\.\s+y el costo por lote/);
    expect(proponerPeriodoSolicitudUsuario(r.effectiveQuestion, now)).toMatchObject({ state: 'resolved', from: '2034-04-01', to: '2034-04-05' });
    expect(tieneReferenciaSolicitud(r.effectiveQuestion)).toBe(false);
    expect(crearContextoNucleo({ question: r.effectiveQuestion, now }).period).toEqual({ from: '2034-04-01', to: '2034-04-05' });
  });
  it('does not append a follow-up metric to the preceding explicit application label', () => {
    const r = resolve('¿Y las fechas de esa aplicación?', 'Estado de la aplicación plaga Q');
    expect(r.state).toBe('resolved'); expect(r.effectiveQuestion).toMatch(/aplicación plaga Q y las fechas/);
    expect(r.effectiveQuestion).not.toContain('esa aplicación');
    expect(tieneReferenciaSolicitud(r.effectiveQuestion)).toBe(false);
    expect(proponerPeriodoSolicitudUsuario(r.effectiveQuestion, now)).toEqual({ state: 'absent' });
    expect(resolve('¿Y las fechas de esa aplicación del 2034-05-01 al 2034-05-07?', 'Estado de la aplicación plaga Q').effectiveQuestion)
      .toMatch(/aplicación plaga Q y las fechas.*del 2034-05-01 al 2034-05-07/);
  });
  it('absolutizes a prior relative date at its own Bogotá timestamp and preserves a filtered textual cohort', () => {
    const r = resolve('Y el costo de esas aplicaciones', 'Aplicaciones cerradas de este mes en lote Norte, sin nombres.');
    expect(r.state).toBe('resolved'); expect(r.effectiveQuestion).toContain('cerradas'); expect(r.effectiveQuestion).toContain('lote Norte');
    expect(proponerPeriodoUsuario(r.effectiveQuestion, now)).toMatchObject({ from: '2034-04-01', to: '2034-04-05' });
    expect(r).not.toHaveProperty('ids'); expect(r).not.toHaveProperty('cohort');
  });
  it('keeps month/date-looking business labels separate from temporal scope, including NFC equivalents', () => {
    for (const question of ['Aplicación Mayo', 'Aplicación "Sol de Mayo"', 'Aplicación «2034-05-02»']) {
      expect(proponerPeriodoSolicitudUsuario(question, now)).toEqual({ state: 'absent' });
      expect(proponerPeriodoSolicitudUsuario(question.normalize('NFD'), now)).toEqual({ state: 'absent' });
    }
    const r = resolve('Y el costo en esa aplicación', 'Aplicación Mayo en lote Norte');
    expect(r.state).toBe('resolved'); expect(r.effectiveQuestion).toContain('Aplicación Mayo');
    expect(proponerPeriodoSolicitudUsuario(r.effectiveQuestion, now)).toEqual({ state: 'absent' });
    expect(crearContextoNucleo({ question: 'Aplicación Mayo del 2034-05-01 al 2034-05-07', now }).period).toEqual({ from: '2034-05-01', to: '2034-05-07' });
    expect(proponerPeriodoSolicitudUsuario('Aplicación Sol hoy', now)).toMatchObject({ state: 'resolved', from: '2034-05-10', to: '2034-05-10' });
  });
  it.each([undefined, '', 'not-a-date', '2034-02-30T17:00:00Z', '2034-04-05T24:00:00Z', '2035-04-05T17:00:00Z'])('does not anchor history to today when server timestamp is missing/invalid/future (%s)', at => {
    expect(resolverReferenciaSolicitud({ question: 'Y el costo', previousUserText: 'Labores de este mes', previousUserAt: at, now }).state).toBe('orphan');
  });
  it.each(['Aplicación Sol o aplicación Luna del 2034-04-01 al 2034-04-05',
    'Aplicación Sol y Luna del 2034-04-01 al 2034-04-05', 'Aplicaciones cerradas del 2034-04-01 al 2034-04-05',
    'Aplicación Sol de abril o mayo', 'Estado en esa aplicación', 'Compras y labores de abril',
    'Salario de empleado Sintético en aplicación Sol'])('does not certify an ambiguous antecedent: %s', p => {
    expect(resolve('Y el costo en esa aplicación', p).state).toBe('ambiguous');
  });
  it('does not turn an unrelated prior request into an application', () => {
    expect(resolve('Costo en esa aplicación', 'Compras del 2034-04-01 al 2034-04-05').state).toBe('orphan');
  });
  it('treats journals of a single named application as its metric, not an unrelated second population', () => {
    expect(resolve('Y el costo en esa aplicación', 'Jornales de aplicación Sol del 2034-04-01 al 2034-04-05').state).toBe('resolved');
  });
  it('does not clear a prior-selector guard merely because a follow-up repeats an operation noun', () => {
    const question = '¿Y la conductividad del 2034-05-01 al 2034-05-07?';
    expect(tieneReferenciaSolicitud(question)).toBe(true);
    expect(resolve(question).state).toBe('orphan');
    expect(crearContextoNucleo({ question, now }).referencePending).toBe(true);
    expect(crearContextoNucleo({ question, now, previousUserText: 'Conductividad en lote Norte', previousUserAt: undefined })).not.toHaveProperty('previousUserText');
  });
  it.each(['Y el costo en esa aplicación de abril o mayo', 'Y el costo en esa aplicación del 2034-05-07 al 2034-05-01'])('keeps current ambiguous/invalid periods intact for clarification: %s', question => {
    expect(resolve(question, prior)).toEqual({ state: 'ambiguous', effectiveQuestion: question });
  });
  it('requires no lot merely because a labor aggregate requests last week', () => {
    const ctx = crearContextoNucleo({ question: 'Y resumen de labores de la semana pasada', now });
    expect(ctx.referencePending).not.toBe(true); expect(ctx.period).toEqual({ from: '2034-05-01', to: '2034-05-07' });
    expect(tieneReferenciaSolicitud('Costo en esa aplicación')).toBe(true);
    expect(crearContextoNucleo({ question: 'Costo en esa aplicación', now }).referencePending).toBe(true);
  });
  it.each([';', '\n'])('retains an independent current operation beside an orphan reference with separator %j', separator => {
    const question = `Costo en esa aplicación${separator} además jornales por lote de la semana pasada`;
    expect(resolve(question)).toEqual({ state: 'orphan', effectiveQuestion: question, independentQuestion: 'jornales por lote de la semana pasada' });
    const ctx = crearContextoNucleo({ question: resolve(question).independentQuestion!, now });
    expect(ctx.period).toEqual({ from: '2034-05-01', to: '2034-05-07' }); expect(ctx.referencePending).not.toBe(true);
  });
  it('retains only a self-contained current clause when prior references or periods are ambiguous', () => {
    const question = 'Costo en esa aplicación; compras del 2034-05-01 al 2034-05-07; jornales de esos lotes';
    const r = resolve(question, 'Aplicación Sol o aplicación Luna');
    expect(r.state).toBe('ambiguous'); expect(r.effectiveQuestion).toBe(question);
    expect(r.independentQuestion).toBe('compras del 2034-05-01 al 2034-05-07');
  });
  it.each(['Costo en esa aplicación, además jornales de la semana pasada',
    'Costo en esa aplicación y jornales de la semana pasada', 'Costo en esa aplicación; su costo',
    'Costo en esa aplicación; compras de abril o mayo'])('does not fabricate a safe independent scope from uncertain coordination: %s', question => {
    expect(resolve(question)).not.toHaveProperty('independentQuestion');
  });
});

describe('purpose grammar binds definitions to the current USER, not model proposals', () => {
  it.each([['¿Qué significa Cerrada?', ['Cerrada']], ['Define Calculada y En ejecución en aplicaciones', ['Calculada', 'En ejecución']],
    ['¿Cuál es el significado de «Cerrada»?', ['Cerrada']], ['Diferencia entre Calculada y Cerrada', ['Calculada', 'Cerrada']]])('recognizes definition objects independently of tool proposal: %s', (question, states) => {
    const p = analizarPropositoUsuario(String(question)); expect(p.intents).toContain('definition');
    expect(p.definitions).toEqual([{ domain: 'application', states }]);
  });
  it('permits a general explicit definition of application states', () => {
    expect(analizarPropositoUsuario('Explica el significado de los estados de las aplicaciones')).toMatchObject({ intents: ['definition'], definitions: [{ domain: 'application', states: [] }] });
  });
  it.each(['¿Cuál es el estado de la aplicación Sol?', 'Muestra las aplicaciones cerradas de mayo', '¿La aplicación Sol está cerrada?',
    '¿Por qué está cerrada la aplicación Sol?', 'Costo y jornales de la aplicación Sol', 'No expliques qué significa Cerrada, muestra las fechas de la aplicación Sol'])('does not allow a definition to replace an actual record query: %s', question => {
    const p = analizarPropositoUsuario(question); expect(p.intents).not.toContain('definition'); expect(p.definitions).toEqual([]);
    expect(p.intents).toContain('data_query');
  });
  it('retains separate useful definition, data and capability intents in a mixed request', () => {
    const p = analizarPropositoUsuario('Qué significa Cerrada; muestra el costo de la aplicación Sol; ¿puedes pronosticar lluvia?');
    expect(p.intents).toEqual(expect.arrayContaining(['definition', 'data_query', 'capability']));
    expect(p.definitions).toEqual([{ domain: 'application', states: ['Cerrada'] }]);
  });
  it('keeps coordinated definition and quantified data purposes separate', () => {
    const p = analizarPropositoUsuario('Qué significa Cerrada y cuántos jornales tiene la aplicación Sol');
    expect(p.intents).toEqual(expect.arrayContaining(['definition', 'data_query']));
    expect(p.definitions).toEqual([{ domain: 'application', states: ['Cerrada'] }]);
  });
  it.each(['Qué significa una tarea Cerrada', 'Qué significa el producto «Cerrada»', 'Qué significa conductividad'])('does not authorize an application definition for a different concept/object: %s', question => {
    expect(analizarPropositoUsuario(question)).toEqual({ intents: ['definition'], definitions: [] });
  });
  it.each(['Ejemplo: qué significa Cerrada', 'Cita «qué significa Calculada»; muestra las compras',
    'Muestra las compras; "puedes pronosticar lluvia"', 'La respuesta anterior decía qué significa Cerrada'])('does not grant a purpose from quoted/reported instructions: %s', question => {
    expect(analizarPropositoUsuario(question).intents).not.toContain('definition');
    expect(analizarPropositoUsuario(question).intents).not.toContain('capability');
  });
  it('does not treat an operation or concrete record query as an ability question', () => {
    for (const q of ['Compras del mes pasado', 'Estado de aplicación Sol', 'Pronóstico de lluvia para mañana']) {
      expect(analizarPropositoUsuario(q).intents).not.toContain('capability');
    }
    expect(analizarPropositoUsuario('¿Qué herramientas tienes?').intents).toContain('capability');
    expect(analizarPropositoUsuario('¿Qué no puedes hacer?').intents).toContain('capability');
  });
  it.each(['Explica el límite de la conciliación de inventario', 'Describe el alcance de la exportación de reportes',
    '¿Cuál es el límite del pronóstico de lluvia?'])('recognizes an explicit operation-limit purpose without choosing a tool: %s', question => {
    expect(analizarPropositoUsuario(question)).toEqual({ intents: ['capability'], definitions: [] });
  });
  it.each(['Ejemplo: explica el límite de la conciliación de inventario',
    'No expliques el límite de la conciliación de inventario', 'Sin explicar el alcance de la exportación',
    'Explica el límite de conductividad registrado', 'Cuál es el límite del lote Norte',
    'Qué significa Cerrada'])('does not grant operation-limit purpose from examples, negation or a different domain: %s', question => {
    expect(analizarPropositoUsuario(question).intents).not.toContain('capability');
  });
});

describe('calendar primitives keep populations and null dates separate', () => {
  const range = { from: '2034-05-01', to: '2034-05-07' };
  it('reuses exact parser spans, retaining labels and restrictions', () => {
    const q = 'Aplicación Sol en lote Norte del 1 al 7 de mayo de 2034, sin nombres';
    const r = separarPeriodoUsuario(q, now); expect(r.period).toMatchObject({ state: 'resolved', ...range });
    expect(r.remainder).toContain('Aplicación Sol en lote Norte'); expect(r.remainder).toContain('sin nombres');
    expect(r.remainder).not.toContain('mayo');
    for (const text of ['abril o mayo', '2034-05-07 al 2034-05-01']) expect(separarPeriodoUsuario(text, now).remainder).toBe(text);
  });
  it('never substitutes a planned start or activity day for missing/outside actual-start membership', () => {
    const row = { actualStart: null, plannedStart: '2034-05-02', activityDay: '2034-05-03' };
    expect(relacionFechaPeriodo(row.actualStart, range)).toBe('unknown');
    expect(relacionFechaPeriodo(row.plannedStart, range)).toBe('inside'); expect(relacionFechaPeriodo(row.activityDay, range)).toBe('inside');
    expect(relacionFechaPeriodo('2034-04-30', range)).toBe('outside');
  });
  it.each(['2034-05-01', '2034-05-07'])('includes the exact declared calendar boundary %s', d => { expect(relacionFechaPeriodo(d, range)).toBe('inside'); });
  it.each([null, undefined])('keeps null/absent separate from zero or malformed dates: %s', value => {
    expect(relacionFechaPeriodo(value, range)).toBe('unknown'); expect(relacionSolapamientoPeriodo('2034-05-02', value, range)).toBe('unknown');
  });
  it.each([0, '', '2034-02-30', '2034-05-03T00:00:00Z'])('rejects malformed date values without coercion: %s', value => { expect(relacionFechaPeriodo(value, range)).toBe('invalid'); });
  it('distinguishes start-cohort membership from inclusive interval overlap', () => {
    expect(relacionFechaPeriodo('2034-04-30', range)).toBe('outside');
    expect(relacionSolapamientoPeriodo('2034-04-30', '2034-05-01', range)).toBe('inside');
    expect(relacionSolapamientoPeriodo('2034-04-01', '2034-04-30', range)).toBe('outside');
    expect(relacionSolapamientoPeriodo('2034-05-07', '2034-05-08', range)).toBe('inside');
    expect(relacionSolapamientoPeriodo('2034-05-07', '2034-05-01', range)).toBe('invalid');
    expect(relacionFechaPeriodo('2034-05-01', { from: range.to, to: range.from })).toBe('invalid');
  });
});
