// Runner de la campaña M2.5 (Esco 2.0, familia de labores).
// Uso: node scripts/esco2/m25.ts --config luna|sol|m3 --reps 3 [--cases L01,L02] [--budget 5]
// Lee datos privados de "docs/Esco 2.0/" (excluida de git) y escribe ahí mismo los resultados.
// Nunca escribe en producción: el ejecutor lee el snapshot congelado.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearClienteOpenRouter } from '../../src/utils/esco2/llm.ts';
import { responderTurno, type ConfigModelos } from '../../src/utils/esco2/nucleo.ts';
import { puntuarIntento, type Ancla } from '../../src/utils/esco2/evaluacion.ts';
import type { DatosLabores, MensajeHistorial } from '../../src/utils/esco2/tipos.ts';
import { leerClaveOpenRouter } from './clave.ts';

const PRIVADO = process.env.ESCO2_PRIVADO ?? '/Users/santiagoforero/Codigo/Escociaos/docs/Esco 2.0';

const CONFIGS: Record<string, ConfigModelos> = {
  luna: { nombre: 'luna', planificador: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' }, compositor: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' } },
  sol: { nombre: 'sol', planificador: { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' }, compositor: { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' } },
  // M3: la configuración de esco-consultas (D25: Sol solo compone planes de varias partes).
  m3: {
    nombre: 'm3',
    planificador: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
    compositor: { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
    compositorReforzado: { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' },
  },
};

interface Caso {
  id: string;
  key: string;
  as_of_bogota: string;
  pregunta: string;
  historial: MensajeHistorial[];
  seguimientos: string[];
  anclas: Ancla[];
}

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
}

function cargarDatos(): DatosLabores {
  const s = JSON.parse(readFileSync(join(PRIVADO, 'snapshot/labor_snapshot.json'), 'utf8'));
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    registros: s.registros_trabajo.map((r: Record<string, string | null>) => ({
      id: r.id,
      tarea_id: r.tarea_id,
      lote_id: r.lote_id,
      fecha_trabajo: r.fecha_trabajo,
      fraccion_jornal: Number(r.fraccion_jornal),
      costo_jornal: num(r.costo_jornal),
    })),
    tareas: s.tareas.map((t: Record<string, string | null>) => ({ ...t, jornales_estimados: num(t.jornales_estimados) })),
    tiposTareas: s.tipos_tareas,
    lotes: s.lotes,
  };
}

async function main(): Promise<void> {
  const config = CONFIGS[arg('config', 'luna')];
  if (!config) throw new Error('config desconocida');
  const reps = Number(arg('reps', '1'));
  const presupuesto = Number(arg('budget', '5'));
  const gastoPrevio = Number(arg('spent', '0'));
  const etiqueta = arg('tag', `${config.nombre}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const filtro = arg('cases', '');
  const { casos } = JSON.parse(readFileSync(join(PRIVADO, 'm1/cases_m25.json'), 'utf8')) as { casos: Caso[] };
  const seleccion = filtro ? casos.filter((c) => filtro.split(',').includes(c.key)) : casos;
  const datos = cargarDatos();
  const llm = crearClienteOpenRouter(leerClaveOpenRouter());
  const dir = join(PRIVADO, 'm25');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const archivo = join(dir, `${etiqueta}.jsonl`);

  let gasto = 0;
  for (let rep = 1; rep <= reps; rep++) {
    for (const caso of seleccion) {
      if (gastoPrevio + gasto >= presupuesto) {
        console.log(`Presupuesto agotado (USD ${(gastoPrevio + gasto).toFixed(4)}). Se detiene.`);
        return;
      }
      const hoy = caso.as_of_bogota.slice(0, 10);
      const historial = [...caso.historial];
      const turnos = [];
      for (const pregunta of [caso.pregunta, ...caso.seguimientos]) {
        const t = await responderTurno({ pregunta, historial, hoy, datos, llm, config });
        turnos.push({ pregunta, ...t });
        historial.push({ rol: 'user', texto: pregunta }, { rol: 'assistant', texto: t.respuesta });
        gasto += t.llamadas.reduce((s, l) => s + (l.costoUsd ?? 0), 0);
      }
      const puntaje = puntuarIntento(turnos[0], caso.anclas, caso.key === 'L09');
      const fila = { etiqueta, config: config.nombre, rep, caso: caso.key, hoy, puntaje, turnos };
      appendFileSync(archivo, JSON.stringify(fila) + '\n');
      const llam = turnos[0].llamadas;
      console.log(
        `${config.nombre} r${rep} ${caso.key} origen=${turnos[0].origen} sel=${puntaje.seleccionCorrecta} resp=${puntaje.respuestaCorrecta} ` +
          `llamadas=${llam.length} ms=${turnos[0].ms} usd=${llam.reduce((s, l) => s + (l.costoUsd ?? 0), 0).toFixed(5)}`,
      );
    }
  }
  writeFileSync(join(dir, `${etiqueta}.gasto.json`), JSON.stringify({ gastoUsd: gasto }));
  console.log(`Gasto de esta corrida: USD ${gasto.toFixed(4)} · archivo ${archivo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
