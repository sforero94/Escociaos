// Prueba de planificador de M4 (alcance de labores) con datos 100 % sintéticos.
// Uso: node scripts/esco2/m4-sintetico.ts [--reps 2] [--budget 0.1]
// Comprueba, por pregunta, qué argumentos nuevos elige Luna y si la respuesta publicada
// pasa la guarda (incluidas las cifras obligatorias). No lee datos privados.

import { crearClienteOpenRouter } from '../../src/utils/esco2/llm.ts';
import { responderTurno, type ConfigModelos } from '../../src/utils/esco2/nucleo.ts';
import type { ConsultaLabores } from '../../src/utils/esco2/tipos.ts';
import { leerClaveOpenRouter } from './clave.ts';
import { datos } from './fixtureSintetico.ts';

const CONFIG: ConfigModelos = {
  nombre: 'm3',
  planificador: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
  compositor: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
  compositorReforzado: { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' },
};

interface Pregunta {
  brecha: string;
  texto: string;
  /** El plan debe cumplirlo en alguna consulta. */
  plan: (c: ConsultaLabores) => boolean;
  /** Fragmentos que la respuesta debe contener. */
  respuesta: string[];
}

const PREGUNTAS: Pregunta[] = [
  { brecha: '1 fechas de tarea', texto: '¿Cuándo empezó el compostaje y cuándo estaba planeado terminarlo?', plan: (c) => c.incluir_estado_tarea, respuesta: ['8 de mayo', '9 de mayo'] },
  { brecha: '2 por día', texto: '¿Cuántos jornales se registraron cada día entre el 4 y el 8 de mayo de 2026?', plan: (c) => c.agrupar_por.includes('dia'), respuesta: ['4 de mayo', '8 de mayo'] },
  { brecha: '2 por tipo', texto: 'Jornales de mayo por tipo de tarea', plan: (c) => c.agrupar_por.includes('tipo_tarea'), respuesta: ['Guadaña', 'Cosecha'] },
  { brecha: '3 por árbol', texto: '¿Cuántos jornales por árbol tuvo el lote Norte en mayo?', plan: (c) => c.metricas.includes('jornales_por_arbol'), respuesta: ['0,02'] },
  { brecha: '3 por hectárea por lote', texto: 'Jornales por hectárea de cada lote en mayo', plan: (c) => c.metricas.includes('jornales_por_hectarea') && c.agrupar_por.includes('lote'), respuesta: ['0,5'] },
  { brecha: '3 costo por jornal', texto: '¿Cuánto costó en promedio un jornal en el lote Norte en mayo?', plan: (c) => c.metricas.includes('costo_por_jornal'), respuesta: ['95.000'] },
  { brecha: '4 aplicación', texto: '¿De qué aplicación viene la tarea de compostaje?', plan: (c) => c.incluir_estado_tarea, respuesta: ['APL-1'] },
  { brecha: 'D30 estimados', texto: '¿Cuántos jornales llevamos en proyectos especiales este año?', plan: (c) => c.categorias.length > 0, respuesta: ['estimad'] },
];

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
}

async function main(): Promise<void> {
  const reps = Number(arg('reps', '2'));
  const presupuesto = Number(arg('budget', '0.1'));
  const llm = crearClienteOpenRouter(leerClaveOpenRouter());
  let gasto = 0;
  for (const p of PREGUNTAS) {
    const filas: string[] = [];
    for (let rep = 1; rep <= reps && gasto < presupuesto; rep++) {
      const t = await responderTurno({ pregunta: p.texto, historial: [], hoy: '2026-06-01', datos, llm, config: CONFIG });
      gasto += t.llamadas.reduce((s, l) => s + (l.costoUsd ?? 0), 0);
      const planOk = t.plan?.tipo === 'consultas' && t.plan.consultas.some(p.plan);
      const respOk = p.respuesta.every((f) => t.respuesta.toLowerCase().includes(f.toLowerCase()));
      filas.push(`r${rep} plan=${planOk} resp=${respOk} origen=${t.origen} ajustes=${t.ajustes.length}`);
      if (!planOk || !respOk) filas.push(`   ↳ ${JSON.stringify(t.plan?.tipo === 'consultas' ? t.plan.consultas.map((c) => ({ g: c.agrupar_por, m: c.metricas, e: c.incluir_estado_tarea, cat: c.categorias, t: c.tareas, l: c.lotes })) : t.plan)}\n   ↳ ${t.respuesta.replace(/\n/g, ' / ').slice(0, 400)}`);
    }
    console.log(`[${p.brecha}] ${p.texto}\n  ${filas.join('\n  ')}`);
  }
  console.log(`Gasto: USD ${gasto.toFixed(4)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
