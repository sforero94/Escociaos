import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { ofrecerPasosPendientes, type PasoTratamientoPendiente } from '../supabase/functions/server/telegram/confirmarPasoTratamiento';

const paso: PasoTratamientoPendiente = { id: 'paso-1', nombre: 'Medicamento de prueba', descripcion: 'Segunda aplicación', fecha_inicio: '2026-09-01', fecha_programada: '2026-09-15' };
const cb = (callback: string) => ({ callback });
const txt = (texto: string) => ({ texto });

async function ejecutar(entradas: Array<{ callback?: string; texto?: string }>, opciones: { pasos?: PasoTratamientoPendiente[]; errorLectura?: boolean; errorEscritura?: boolean } = {}) {
  const mensajes: Array<{ texto: string; botones?: Array<Array<{ text: string; callback_data: string }>> }> = [];
  const escrituras: Array<{ id: string; fecha: string }> = [];
  const continuar = await ofrecerPasosPendientes({
    hoy: '2026-10-06',
    cargar: async () => { if (opciones.errorLectura) throw new Error('DB'); return opciones.pasos ?? [paso]; },
    confirmar: async (p, fecha) => { if (opciones.errorEscritura) throw new Error('Conflicto'); escrituras.push({ id: p.id, fecha }); },
    transporte: {
      decir: async (texto, botones) => { mensajes.push({ texto, botones }); },
      esperar: async () => { const e = entradas.shift(); if (!e) throw new Error('Faltan entradas'); return e; },
    },
  });
  return { continuar, mensajes, escrituras };
}

describe('/tratamiento antes de crear uno nuevo', () => {
  it('sin pendientes continúa inmediatamente, sin escrituras ni oferta', async () => {
    expect(await ejecutar([], { pasos: [] })).toEqual({ continuar: true, mensajes: [], escrituras: [] });
  });
  it('con pendientes permite registrar nuevo sin confirmar nada', async () => {
    const r = await ejecutar([cb('tp_nuevo')]);
    expect(r.continuar).toBe(true);
    expect(r.escrituras).toEqual([]);
    expect(r.mensajes[0].botones?.flat().map(b => b.callback_data)).toContain('tp_nuevo');
  });
  it('confirma solo el paso elegido y requiere confirmación explícita de fecha', async () => {
    const r = await ejecutar([cb('tp_paso_1'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_fin')], { pasos: [paso, { ...paso, id: 'paso-2', nombre: 'Otro medicamento' }] });
    expect(r.escrituras).toEqual([{ id: 'paso-2', fecha: '2026-10-06' }]);
    expect(r.continuar).toBe(false);
    expect(r.mensajes.some(m => m.texto.includes('alerta cerrada'))).toBe(true);
    if (process.env.ESCOCIA_QA_TRANSCRIPT) writeFileSync(process.env.ESCOCIA_QA_TRANSCRIPT, JSON.stringify(r, null, 2));
  });
  it('permite un nuevo tratamiento después de confirmar', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_nuevo')]);
    expect(r.continuar).toBe(true);
    expect(r.escrituras).toHaveLength(1);
  });
  it('volver desde confirmación no escribe y sigue permitiendo nuevo', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_hoy'), cb('tp_volver'), cb('tp_nuevo')]);
    expect(r.escrituras).toEqual([]);
    expect(r.continuar).toBe(true);
  });
  it('cancelar en texto termina sin escribir', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_fecha'), txt('/cancelar')]);
    expect(r.continuar).toBe(false);
    expect(r.escrituras).toEqual([]);
  });
  it('no infiere el año y acepta una fecha explícita', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_fecha'), txt('16/09'), txt('16/09/2026'), cb('tp_confirmar'), cb('tp_fin')]);
    expect(r.escrituras[0].fecha).toBe('2026-09-16');
    expect(r.mensajes.some(m => m.texto.includes('con año'))).toBe(true);
  });
  it('rechaza futuro e inicio imposible; no altera otras fechas', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_fecha'), txt('16/10/2026'), txt('16/08/2026'), txt('16/09/2026'), cb('tp_confirmar'), cb('tp_fin')]);
    expect(r.escrituras).toEqual([{ id: 'paso-1', fecha: '2026-09-16' }]);
    expect(r.mensajes.filter(m => m.texto.includes('entre'))).toHaveLength(2);
  });
  it('pregunta por ambas lecturas de una fecha ambigua', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_fecha'), txt('5/9/2026'), cb('tp_amb_0'), cb('tp_confirmar'), cb('tp_fin')]);
    const opciones = r.mensajes.find(m => m.texto.includes('dos lecturas'));
    expect(opciones?.botones?.[0][0].text).toContain('septiembre');
    expect(r.escrituras[0].fecha).toBe('2026-09-05');
  });
  it('puede registrar nuevo desde la elección de fecha ambigua', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_fecha'), txt('5/9/2026'), cb('tp_nuevo')]);
    expect(r.continuar).toBe(true);
    expect(r.escrituras).toEqual([]);
  });
  it('puede confirmar un segundo paso sin crear otro tratamiento', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_volver'), cb('tp_paso_0'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_fin')], { pasos: [paso, { ...paso, id: 'paso-2' }] });
    expect(r.escrituras.map(p => p.id)).toEqual(['paso-1', 'paso-2']);
  });
  it('pagina más de seis pendientes sin aceptar un botón de otra página', async () => {
    const r = await ejecutar([cb('tp_paso_6'), cb('tp_siguiente'), cb('tp_paso_6'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_fin')], { pasos: Array.from({ length: 7 }, (_, i) => ({ ...paso, id: `paso-${i}` })) });
    expect(r.escrituras.map(p => p.id)).toEqual(['paso-6']);
  });
  it('un fallo de lectura no bloquea un tratamiento nuevo', async () => {
    const r = await ejecutar([cb('tp_nuevo')], { errorLectura: true });
    expect(r.continuar).toBe(true);
    expect(r.escrituras).toEqual([]);
  });
  it('un conflicto no afirma éxito y permite continuar a nuevo', async () => {
    const r = await ejecutar([cb('tp_paso_0'), cb('tp_hoy'), cb('tp_confirmar'), cb('tp_nuevo')], { errorEscritura: true });
    expect(r.continuar).toBe(true);
    expect(r.mensajes.some(m => m.texto.includes('alerta cerrada'))).toBe(false);
  });
  it('los dos árboles edge mantienen la misma conversación y helper', () => {
    for (const ruta of ['telegram/confirmarPasoTratamiento.ts', 'telegram/conversations/eventoHato.ts']) {
      expect(readFileSync(`src/supabase/functions/server/${ruta}`, 'utf8')).toBe(readFileSync(`supabase/functions/make-server-1ccce916/${ruta}`, 'utf8'));
    }
  });
});
