// Independent synthetic HTTP + SQL/RLS + scripted-provider integration.
// This tests transport closure, never planner accuracy or independent acceptance.
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { manejar } from '../../supabase/functions/esco-consultas/manejador.ts';
import { AVISO_EXTRACTO_HISTORIAL, MAX_RESPUESTA_TRANSPORTE } from '../utils/esco2Historial.ts';
import { dependencies, forbidNetwork, ID, p2Db, plan, request, tool } from './esco2P2Harness.ts';

let db: PGlite;
beforeAll(async () => {
  forbidNetwork();
  db = await p2Db();
  // Seed source rows once. No output of the implementation supplies expected facts.
  await db.exec('truncate registros_trabajo,tareas,aplicaciones;');
  for (let n = 1; n <= 40; n++) {
    const suffix = String(n).padStart(12, '0');
    const task = `ca000000-0000-4000-8000-${suffix}`;
    await db.query('insert into tareas(id,nombre,estado,tipo_tarea_id,jornales_estimados,lote_ids) values($1,$2,\'Programada\',$3,1,ARRAY[]::uuid[])', [task, `Labor sintética ${n} ${'descripción verificable '.repeat(7)}`, ID.ty]);
    await db.query('insert into registros_trabajo values($1,$2,$3,\'2026-11-01\',\'1.0\',100)', [`da000000-0000-4000-8000-${suffix}`, task, ID.l3]);
  }
}, 30_000);
afterAll(async () => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  await db?.close();
});

describe('M6 QA: response to history over the real HTTP handler', () => {
  it('returns substantive long detail then accepts that exact answer as assistant history', async () => {
    const calls = [tool(plan({ agrupar_por: ['tarea'], metricas: ['jornales', 'costo'] }))];
    const first = dependencies(db, calls);
    const response = await manejar(request({ pregunta: 'Jornales y costo por tarea del 2026-10-26 al 2026-11-01' }), first.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultados[0].total).toMatchObject({ jornales: 40, costo: 4000 });
    expect(body.resultados[0].filas).toHaveLength(40);
    expect(body.respuesta.length).toBeGreaterThan(4000);
    expect(body.historialRespuesta.length).toBeLessThanOrEqual(4000);
    // This flag describes incoming history; historialRespuesta describes outgoing context.
    expect(body.historialCompactado).toBe(false);
    expect(body.historialRespuesta).toContain(AVISO_EXTRACTO_HISTORIAL);
    const second = dependencies(db, calls);
    const followup = await manejar(request({ pregunta: 'Conserva el mismo período y muestra el detalle', historial: [
      { rol: 'user', texto: 'Jornales y costo por tarea del 2026-10-26 al 2026-11-01' },
      { rol: 'assistant', texto: body.respuesta },
    ] }), second.deps);
    expect(followup.status).toBe(200);
    const next = await followup.json();
    expect(next.historialCompactado).toBe(true);
    expect(next.resultados[0].total).toMatchObject({ jornales: 40, costo: 4000 });
    expect(second.solicitudes.length).toBeGreaterThan(0);
  });

  it.each([3999, 4000, 4001])('accepts a factual assistant message at %i characters without losing the next question', async length => {
    const h = dependencies(db, [tool(plan())]);
    const response = await manejar(request({ pregunta: 'Total de jornales', historial: [{ rol: 'assistant', texto: 'x'.repeat(length) }] }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resultados[0].total.jornales).toBe(40);
    expect(h.solicitudes.length).toBeGreaterThan(0);
    expect(h.solicitudes[0].mensajes.at(-1)?.content).toContain('Total de jornales');
  });

  it('retains the message-count boundary before any data/provider call', async () => {
    const h = dependencies(db, [tool(plan())]);
    const response = await manejar(request({ pregunta: 'Total', historial: Array.from({ length: 13 }, () => ({ rol: 'user', texto: 'contexto' })) }), h.deps);
    expect(response.status).toBe(400);
    expect(h.solicitudes).toHaveLength(0);
    expect(h.traza.consultas).toHaveLength(0);
  });

  it('does not enlarge the user-message boundary when accepting long assistant answers', async () => {
    const h = dependencies(db, [tool(plan())]);
    const response = await manejar(request({ pregunta: 'Total', historial: [{ rol: 'user', texto: 'x'.repeat(4001) }] }), h.deps);
    expect(response.status).toBe(400);
    expect(h.solicitudes).toHaveLength(0);
    expect(h.traza.consultas).toHaveLength(0);
  });

  it('bounds assistant context explicitly while preserving Unicode, user scope and answer tail', async () => {
    const h = dependencies(db, [tool(plan())]);
    const priorUser = 'Mantén la población visible y el período del 2026-10-26 al 2026-11-01.';
    const longAnswer = `CABECERA ${'🌳'.repeat(6000)} COLA_IMPORTANTE`;
    const question = 'Conserva el período, sin convertir los registros sin lote en cero.';
    const response = await manejar(request({ pregunta: question, historial: [
      { rol: 'user', texto: priorUser }, { rol: 'assistant', texto: longAnswer },
    ] }), h.deps);
    expect(response.status).toBe(200);
    const messages = h.solicitudes[0].mensajes;
    expect(messages.some(m => m.role === 'user' && m.content === priorUser)).toBe(true);
    expect(messages.at(-1)?.content).toContain(question);
    const compacted = messages.find(m => m.role === 'assistant')?.content;
    expect(compacted).toBeDefined();
    expect(compacted!.length).toBeLessThanOrEqual(4000);
    expect(compacted).toContain('CABECERA');
    expect(compacted).toContain('COLA_IMPORTANTE');
    expect(compacted).toContain(AVISO_EXTRACTO_HISTORIAL);
    expect(compacted).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });

  it('accepts the assistant transport bound and rejects one extra character before data/provider access', async () => {
    const allowed = dependencies(db, [tool(plan())]);
    expect((await manejar(request({ pregunta: 'Total', historial: [{ rol: 'assistant', texto: 'x'.repeat(MAX_RESPUESTA_TRANSPORTE) }] }), allowed.deps)).status).toBe(200);
    const denied = dependencies(db, [tool(plan())]);
    expect((await manejar(request({ pregunta: 'Total', historial: [{ rol: 'assistant', texto: 'x'.repeat(MAX_RESPUESTA_TRANSPORTE + 1) }] }), denied.deps)).status).toBe(400);
    expect(denied.solicitudes).toHaveLength(0);
    expect(denied.traza.consultas).toHaveLength(0);
  });

  it('returns explicit transport failure instead of an answer that cannot be replayed as history', async () => {
    const saved = await db.query<{ id: string; nombre: string }>('select id,nombre from tareas');
    try {
      await db.query('update tareas set nombre=$1', ['Nombre sintético '.repeat(600)]);
      const h = dependencies(db, [tool(plan({ agrupar_por: ['tarea'] }))]);
      const response = await manejar(request({ pregunta: 'Detalle de jornales por tarea' }), h.deps);
      expect(response.status).toBe(413);
      const body = await response.json();
      expect(body.respuesta).toBeUndefined();
      expect(body.error).toBeTruthy();
    } finally {
      for (const row of saved.rows) await db.query('update tareas set nombre=$1 where id=$2', [row.nombre, row.id]);
    }
  });
});
