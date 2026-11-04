// Runner de la campaña M2.5 (Esco 2.0, familia de labores).
// Uso: node scripts/esco2/m25.ts --config luna|sol|m3 --reps 3 [--cases L01,L02]
//   --budget 0.25 --spent 0 --reserve-usd 0.025 [--aggregate-only]
// Lee datos privados de "docs/Esco 2.0/" (excluida de git) y escribe ahí mismo los resultados.
// Nunca escribe en producción: el ejecutor lee el snapshot congelado.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearClienteOpenRouter } from '../../src/utils/esco2/llm.ts';
import { responderTurno, type ConfigModelos } from '../../src/utils/esco2/nucleo.ts';
import { puntuarCaso, type Ancla, type ModoCaso } from '../../src/utils/esco2/evaluacion.ts';
import type { DatosLabores, MensajeHistorial } from '../../src/utils/esco2/tipos.ts';
import { leerClaveOpenRouter } from './clave.ts';
import { guardarEstado, leerEstado } from '../../src/utils/esco2/estado.ts';
import { limitarPresupuestoDesarrollo } from '../../src/utils/esco2/presupuestoDesarrollo.ts';
import { solicitudDesarrollo } from '../../src/utils/esco2/seguimientoDesarrollo.ts';

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
  /** Cómo se puntúa. Sin él: cifras (y alias_inexistente para L09, por compatibilidad). */
  modo?: ModoCaso;
  /** Explicit choice ID for a scripted button click. Never inferred from follow-up text. */
  opcionAclaracion?: string;
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
  const presupuesto = Number(arg('budget', '0.25'));
  const gastoPrevio = Number(arg('spent', '0'));
  const reservaPorLlamadaUsd = Number(arg('reserve-usd', '0.025'));
  const soloAgregados = process.argv.includes('--aggregate-only');
  if (!Number.isInteger(reps) || reps < 1) throw new Error('reps inválido');
  const etiqueta = arg('tag', `${config.nombre}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const filtro = arg('cases', '');
  const { casos } = JSON.parse(readFileSync(join(PRIVADO, 'm1/cases_m25.json'), 'utf8')) as { casos: Caso[] };
  const seleccion = filtro ? casos.filter((c) => filtro.split(',').includes(c.key)) : casos;
  const datos = cargarDatos();
  const controlGasto = limitarPresupuestoDesarrollo(crearClienteOpenRouter(leerClaveOpenRouter()), {
    limiteUsd: presupuesto, gastoPrevioUsd: gastoPrevio, reservaPorLlamadaUsd,
  });
  const llm = controlGasto.cliente;
  const dir = join(PRIVADO, 'm25');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const archivo = join(dir, `${etiqueta}.jsonl`);

  let intentos = 0;
  let seleccionCorrecta = 0;
  let respuestaCorrecta = 0;
  const porRepeticion: Array<{ rep: number; intentos: number; seleccionCorrecta: number; respuestaCorrecta: number }> = [];
  try {
    for (let rep = 1; rep <= reps; rep++) {
      const agregado = { rep, intentos: 0, seleccionCorrecta: 0, respuestaCorrecta: 0 };
      porRepeticion.push(agregado);
      for (const caso of seleccion) {
        if (controlGasto.estado().motivoDetencion) return;
        const hoy = caso.as_of_bogota.slice(0, 10);
        const historial = [...caso.historial];
        const turnos = [];
        const owner = crypto.randomUUID();
        let estadoToken: string | undefined;
        const modo = caso.modo ?? (caso.key === 'L09' ? 'alias_inexistente' : 'cifras');
        for (const texto of [caso.pregunta, ...caso.seguimientos]) {
          const anterior = turnos.at(-1);
          // The D26 development fixture chooses the named tasks. Click the
          // predeclared offered ID; never infer scope from follow-up text.
          const solicitud = solicitudDesarrollo({ pregunta: texto, estadoToken, opciones: anterior?.opcionesAclaracion, opcionId: caso.opcionAclaracion, modo });
          const estado = solicitud.estadoToken ? leerEstado(solicitud.estadoToken, owner, Date.now()) : undefined;
          if (solicitud.estadoToken && !estado) throw new Error('contexto_desarrollo_no_disponible');
          const t = await responderTurno({ ...solicitud, estado, historial, hoy, datos, llm, config });
          // Exercise the same opaque-token boundary as the HTTP UI. Never log tokens.
          estadoToken = t.estado ? guardarEstado(owner, t.estado, Date.now()) : undefined;
          if (t.opcionesAclaracion?.length && !estadoToken) throw new Error('contexto_desarrollo_no_guardado');
          turnos.push({ pregunta: solicitud.pregunta, ...t });
          historial.push({ rol: 'user', texto: solicitud.pregunta }, { rol: 'assistant', texto: t.respuesta });
          if (controlGasto.estado().motivoDetencion) break;
        }
        const puntaje = puntuarCaso(turnos, caso.anclas, { modo, hoy });
        const fila = { etiqueta, config: config.nombre, rep, caso: caso.key, hoy, puntaje, turnos };
        appendFileSync(archivo, JSON.stringify(fila) + '\n');
        intentos++;
        agregado.intentos++;
        if (puntaje.seleccionCorrecta) { seleccionCorrecta++; agregado.seleccionCorrecta++; }
        if (puntaje.respuestaCorrecta) { respuestaCorrecta++; agregado.respuestaCorrecta++; }
        if (!soloAgregados) {
          const llam = turnos.flatMap(t => t.llamadas);
          const costo = llam.some(l => l.costoUsd === null) ? null : llam.reduce((s, l) => s + l.costoUsd!, 0);
          console.log(`${config.nombre} r${rep} ${caso.key} origen=${turnos[0].origen} sel=${puntaje.seleccionCorrecta} resp=${puntaje.respuestaCorrecta} llamadas=${llam.length} usd=${costo === null ? 'desconocido' : costo.toFixed(5)}`);
        }
      }
    }
  } finally {
    const resumen = { ...controlGasto.estado(), gastoPrevioUsd: gastoPrevio, presupuestoUsd: presupuesto, reservaPorLlamadaUsd, intentos, seleccionCorrecta, respuestaCorrecta, porRepeticion };
    writeFileSync(join(dir, `${etiqueta}.gasto.json`), JSON.stringify(resumen));
    console.log(JSON.stringify(resumen));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
