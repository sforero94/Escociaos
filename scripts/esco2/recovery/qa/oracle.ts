// Independent semantic evaluator. It never imports a candidate executor or numeric guard.
import type { Afirmacion, SalidaExperimento } from '../contracts.ts';
import type { Escenario } from './scenarios.ts';

const serial = (value: unknown): string => JSON.stringify(value);
const key = (c: Pick<Afirmacion, 'obligacionId' | 'entidad' | 'metrica'>): string => serial([c.obligacionId, c.entidad.tipo, c.entidad.id, c.metrica]);
const same = (a: unknown, b: unknown) => serial(a) === serial(b);
export interface Juicio { pasa: boolean; critico: boolean; errores: string[] }

// This is an independently implemented rendering specification, not the candidate renderer.
export function textoEspecificado(salida: SalidaExperimento): string {
  const lines: string[] = [];
  for (const result of salida.resultados) {
    const block: string[] = [`${result.id}: ${result.disposicion}${result.motivo ? ` (${result.motivo})` : ''}`];
    for (const fact of result.afirmaciones) {
      const value = ['conocido', 'vacio_verificado'].includes(fact.estado) ? serial(fact.valor) : fact.estado;
      block.push(`${fact.entidad.nombre} [${fact.entidad.tipo}:${fact.entidad.id}] ${fact.metrica}: ${value}; unidad=${fact.unidad}; cohorte=${fact.cohorte}; fecha=${fact.baseFecha}; ${fact.desde} a ${fact.hasta}; ${fact.calificadores.join(', ')}`);
    }
    block.push(`Alcance: ${result.calificadores.join(', ')}`);
    lines.push(block.join('\n'));
  }
  return lines.join('\n\n');
}
export function juzgar(scenario: Escenario, actual: SalidaExperimento): Juicio {
  const errors: string[] = [];
  let critical = false;
  if (!same(actual.resultados.map(r => r.id).sort(), scenario.esperado.map(r => r.id).sort())) errors.push('obligation_coverage');
  const allowedSources = new Set([scenario.entrada.fuente.id, ...Object.values(scenario.entrada.datos).flatMap(rows => Array.isArray(rows) ? rows.map(row => row.id) : [])]);
  for (const expected of scenario.esperado) {
    const got = actual.resultados.find(r => r.id === expected.id);
    if (!got) continue;
    if (got.disposicion !== expected.disposicion) errors.push(`${expected.id}:disposition:${got.disposicion}`);
    for (const qualifier of expected.calificadores) if (!got.calificadores.includes(qualifier)) { errors.push(`${expected.id}:qualifier:${qualifier}`); critical = true; }
    const byKey = new Map(got.afirmaciones.map(c => [key(c), c]));
    if (byKey.size !== got.afirmaciones.length) { errors.push(`${expected.id}:duplicate_claim`); critical = true; }
    for (const want of expected.afirmaciones) {
      const fact = byKey.get(key(want));
      if (!fact) { errors.push(`${expected.id}:missing_claim:${key(want)}`); continue; }
      const { id: _id, fuentes: _sources, calificadores: _qualifiers, ...tuple } = fact;
      const { calificadores: _required, ...wanted } = want;
      if (!same(tuple, wanted)) { errors.push(`${expected.id}:false_claim:${key(want)}`); critical = true; }
      for (const qualifier of want.calificadores) if (!fact.calificadores.includes(qualifier)) { errors.push(`${expected.id}:claim_qualifier:${qualifier}`); critical = true; }
      if (fact.entidad.tipo === 'tarea' && ['jornales', 'costo', 'asociaciones', 'estado_actual'].includes(fact.metrica)) {
        const matching = new Set([scenario.entrada.fuente.id, fact.entidad.id, ...scenario.entrada.datos.registros.filter(r => r.tarea_id === fact.entidad.id).map(r => r.id), ...(scenario.entrada.datos.aplicaciones ?? []).filter(a => a.tarea_id === fact.entidad.id).map(a => a.id)]);
        if (fact.fuentes.some(source => !matching.has(source))) { errors.push(`${expected.id}:unrelated_provenance`); critical = true; }
      }
      if (fact.entidad.tipo === 'lote' && ['jornales', 'costo'].includes(fact.metrica)) {
        const matching = new Set([scenario.entrada.fuente.id, ...scenario.entrada.datos.registros.filter(r => r.lote_id === (fact.entidad.id === 'sin_lote' ? null : fact.entidad.id)).map(r => r.id)]);
        if (fact.fuentes.some(source => !matching.has(source))) { errors.push(`${expected.id}:unrelated_provenance`); critical = true; }
      }
      if (!fact.fuentes.length || fact.fuentes.some(source => !allowedSources.has(source))) { errors.push(`${expected.id}:unproven_source`); critical = true; }
    }
    const expectedKeys = new Set(expected.afirmaciones.map(key));
    for (const fact of got.afirmaciones) if (!expectedKeys.has(key(fact))) { errors.push(`${expected.id}:ungraded_extra_claim:${key(fact)}`); }
  }
  if (scenario.pendiente !== undefined && !!actual.estado?.pendiente !== scenario.pendiente) errors.push('pending_state');
  if (actual.estado && actual.estado.propietario !== scenario.entrada.actor.id) { errors.push('state_owner'); critical = true; }
  if (!actual.seguridad.permitido || actual.seguridad.propietario !== scenario.entrada.actor.id) errors.push('authorized_scope');
  if (actual.variante !== 'baseline' && actual.texto !== textoEspecificado(actual)) { errors.push('untrusted_factual_text'); critical = true; }
  return { pasa: errors.length === 0, critico: critical, errores: errors };
}

export interface Mutacion { nombre: string; escenarioId: string; cambiar(salida: SalidaExperimento): void }
export const mutaciones: readonly Mutacion[] = [
  { nombre: 'entidad_incorrecta', escenarioId: 'S09', cambiar: x => { x.resultados[0].afirmaciones.find(c => c.entidad.id === 't1' && c.metrica === 'jornales')!.entidad.id = 't2'; } },
  { nombre: 'unidad_incorrecta', escenarioId: 'S09', cambiar: x => { x.resultados[0].afirmaciones[0].unidad = 'kg'; } },
  { nombre: 'base_fecha_incorrecta', escenarioId: 'S09', cambiar: x => { x.resultados[0].afirmaciones[0].baseFecha = 'fecha_estimada_inicio'; } },
  { nombre: 'miembro_incorrecto', escenarioId: 'S10', cambiar: x => { x.resultados[0].afirmaciones[0].valor = ['a2']; } },
  { nombre: 'calificador_ausente', escenarioId: 'S12', cambiar: x => { x.resultados[0].afirmaciones.find(c => c.metrica === 'jornales_estimados')!.calificadores = []; } },
  { nombre: 'numero_solo_pregunta', escenarioId: 'S09', cambiar: x => { x.resultados[0].afirmaciones[0].valor = 777; } },
  { nombre: 'obligacion_omitida', escenarioId: 'S13', cambiar: x => { x.resultados.pop(); } },
  { nombre: 'desconocido_a_vacio', escenarioId: 'S01', cambiar: x => { const c = x.resultados[0].afirmaciones[0]; c.estado = 'vacio_verificado'; c.valor = []; x.resultados[0].disposicion = 'respondida'; } },
];
