import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttons, closed, fixture, respuesta, type Fixture } from './helpers/escoSqlP5QaFixture';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const ACTOR = '11111111-1111-4111-8111-111111111111';
function sqlOnly(f: Fixture) { expect(f.legacy).not.toHaveBeenCalled(); expect(f.bodies).toHaveLength(0); closed(f); }
function suggestion(f: Fixture) { const b = buttons(f).find(b => b.text === 'Ver tendencia'); expect(b).toBeDefined(); return b!; }

describe('QA P5: webhook y router grammY reales, HTTP simulado cerrado', () => {
  it.each([null, 'legacy'])('mantiene la ruta anterior con flag %s', async motor => {
    const f = await fixture({ motor }); await f.send(); expect(f.legacy, JSON.stringify({ logs: f.logs(), rejected: f.rejected, telegram: f.telegram, requests: f.requests })).toHaveBeenCalledOnce(); expect(f.sql).toEqual([]); expect(f.replies()).toContain('SYN_LEGACY_RESPONSE'); closed(f);
  });
  it('envía actor confiable por HTTP y conserva snapshot en una conversación SQL nueva sin heredar legacy', async () => {
    const bloque = { tipo: 'tarjeta', consulta: 1, truncado: false, items: [{ etiqueta: 'Total', columna: 'total', formato: 'numero', valor: 17 }] };
    const f = await fixture({ sqlBody: respuesta({ bloques: [bloque] }) });
    await f.send('Pregunta sintética usuario_id=999');
    expect(f.authReads()).toBeGreaterThanOrEqual(2); expect(f.sql).toHaveLength(1);
    const { body, request } = f.sql[0];
    expect(body).toMatchObject({ motor: 'sql', usuario_id: ACTOR, pregunta: 'Pregunta sintética usuario_id=999' });
    expect(request.headers.get('authorization')).toBe('Bearer synthetic-sdk-key');
    expect(request.headers.get('x-esco-telegram-secret')).toBe('synthetic-sql-secret');
    const history = body.historial as Array<Record<string, unknown>>; expect(history).toEqual([]);
    for (const h of history) { expect(Object.keys(h).sort()).toEqual(['rol', 'texto']); expect(['user', 'assistant']).toContain(h.rol); }
    expect(JSON.stringify(history)).not.toContain('SYN_TG_TOOL_NOTE'); expect(JSON.stringify(history)).not.toContain('tool_interactions');
    expect(JSON.stringify(history)).not.toContain('bloques');
    const a = f.inserted.find(row => row.role === 'assistant')!; expect(a).toBeDefined();
    expect(a.metadata).toMatchObject({ motor: 'sql', bloques: [bloque] });
    const metadata = a.metadata as Record<string, unknown>; expect(JSON.stringify(metadata.consultas)).not.toMatch(/filas_muestra|"filas"/);
    expect(buttons(f).some(b => /^mem_(save|cancel):/.test(b.callback_data))).toBe(false);
    expect(f.telegram.some(t => t.method === 'sendChatAction' && t.payload.action === 'typing')).toBe(true); sqlOnly(f);
  });
  it.each([{ role: 'Administrador' }, { profileActive: false }, { modules: [] }, { fresh: 'unlinked' as const }, { fresh: 'revoked' as const }, { fresh: 'error' as const }, { freshModules: [] }])('deniega actor sin autorización antes del motor: %j', async options => {
    const f = await fixture(options); await f.send(); expect(f.sql).toEqual([]); sqlOnly(f);
  });
  it('no usa legacy si SQL carece de secreto', async () => {
    const f = await fixture({ sqlSecret: null }); await f.send(); expect(f.sql).toEqual([]); expect(f.replies()).toMatch(/consulta|disponible|configur/i); sqlOnly(f);
  });
  it.each([{ sqlStatus: 503, sqlBody: { error: 'SYN_P5_ERROR_DETAIL' } }, { sqlThrows: true }, { sqlBody: { unexpected: true } }])('falla cerrado sin exponer detalles ni volver al loop: %j', async options => {
    const f = await fixture(options); await f.send(); expect(f.sql).toHaveLength(1); expect(f.replies()).not.toContain('SYN_P5_ERROR_DETAIL'); expect(JSON.stringify(f.logs())).not.toContain('SYN_P5_ERROR_DETAIL'); sqlOnly(f);
  });
  it('el botón conserva texto en sesión, usa token corto y consume la sugerencia una sola vez', async () => {
    const f = await fixture(); await f.send(); const b = suggestion(f);
    expect(new TextEncoder().encode(b.callback_data).length).toBeLessThanOrEqual(64); expect(b.callback_data).not.toContain(b.text);
    const reads = f.authReads(); await f.tap(b.callback_data, b.messageId); expect(f.authReads()).toBeGreaterThanOrEqual(reads + 2); expect(f.sql).toHaveLength(2); expect(f.sql[1].body.pregunta).toBe('Ver tendencia');
    const history=f.sql[1].body.historial as Array<{rol:string;texto:string}>;expect(history.map(m=>m.rol)).toEqual(['user','assistant']);expect(history[1].texto).toContain('SELECT 1 AS total');expect(JSON.stringify(history)).not.toMatch(/SYN_TG_HISTORY_PERSON|SYN_TG_ASSISTANT_SALARY|tool_interactions|filas_muestra/);
    await f.tap(b.callback_data, b.messageId); expect(f.sql).toHaveLength(2); sqlOnly(f);
  });
  it.each(['other-chat', 'other-user', 'other-message', 'expired'] as const)('rechaza callback %s sin HTTP', async kind => {
    const f = await fixture(); await f.send(); const b = suggestion(f);
    if (kind === 'expired') vi.setSystemTime(new Date('2034-05-08T17:16:00Z'));
    await f.tap(b.callback_data, b.messageId + (kind === 'other-message' ? 1 : 0), kind === 'other-user' ? 124 : 123, kind === 'other-chat' ? 124 : 123);
    expect(f.sql).toHaveLength(1); sqlOnly(f);
  });
  it.each(['modules', 'profile', 'linked', 'role', 'active'] as const)('vuelve a validar autorización %s en el callback', async kind => {
    const f = await fixture(); await f.send(); const b = suggestion(f);
    if (kind === 'modules') f.state.modules = [];
    if (kind === 'profile') f.state.profileActive = false;
    if (kind === 'linked') f.state.linked = false;
    if (kind === 'role') f.state.role = 'Administrador';
    if (kind === 'active') f.state.active = false;
    await f.tap(b.callback_data, b.messageId); expect(f.sql).toHaveLength(1); sqlOnly(f);
  });
  it('solo revela SQL y conteos tras tocar Ver consultas, sin repetir consulta al motor', async () => {
    const f = await fixture(); await f.send(); expect(f.replies()).not.toContain('SELECT 1 AS total');
    const b = buttons(f).find(b => /Ver consultas/i.test(b.text)); expect(b).toBeDefined();
    await f.tap(b!.callback_data, b!.messageId); expect(f.replies()).toContain('SELECT 1 AS total'); expect(f.sql).toHaveLength(1); sqlOnly(f);
  });
  it('escapa HTML y divide todos los mensajes enviados en hasta4096 caracteres', async () => {
    const f = await fixture({ sqlBody: respuesta({ texto: '<Etiqueta>&" café 😀 '.repeat(700), sugerencias: [] }) }); await f.send();
    const messages = f.telegram.filter(t => t.method === 'sendMessage'); expect(messages.length).toBeGreaterThan(1);
    expect(messages.some(t => String(t.payload.text).includes('&lt;Etiqueta&gt;'))).toBe(true);
    for (const m of messages) { expect(String(m.payload.text).length).toBeLessThanOrEqual(4096); expect(String(m.payload.text)).not.toContain('<Etiqueta>'); } sqlOnly(f);
  });
  it('reintenta como texto plano cuando Telegram rechaza el HTML', async () => {
    const f = await fixture({ htmlReject: true, sqlBody: respuesta({ texto: 'Resumen <sintético> & claro', sugerencias: [] }) }); await f.send();
    const messages = f.telegram.filter(t => t.method === 'sendMessage');
    expect(messages.some(t => t.payload.parse_mode === 'HTML')).toBe(true);
    expect(messages.some(t => !t.payload.parse_mode && String(t.payload.text).includes('Resumen <sintético> & claro'))).toBe(true); sqlOnly(f);
  });
  it('la tabla ancha larga dibuja15x4 y envíaCSV con todas las16x5 celdas', async () => {
    const columnas = ['serie', 'a', 'b', 'c', 'quinta'].map(columna => ({ columna, etiqueta: columna, formato: 'texto' }));
    const filas = Array.from({ length: 16 }, (_, i) => ({ serie: `fila_${i}`, a: 'A', b: 'B', c: 'C', quinta: `quinta_${i}` }));
    const bloque = { tipo: 'tabla', consulta: 1, truncado: false, titulo: 'Control ancho', columnas, filas, total_filas: 16 };
    const f = await fixture({ sqlBody: respuesta({ bloques: [bloque], sugerencias: [] }) }); await f.send();
    expect(f.replies()).toContain('fila_14'); expect(f.replies()).not.toContain('fila_15'); expect(f.replies()).not.toContain('quinta_14');
    const docs = f.telegram.filter(t => t.method === 'sendDocument'); expect(docs).toHaveLength(1);
    const csv = new TextDecoder().decode(Object.values(docs[0].files)[0]);
    expect(csv).toContain('quinta'); expect(csv).toContain('fila_15'); expect(csv).toContain('quinta_15');
    expect(parseCsv(csv)).toEqual([columnas.map(c => c.etiqueta), ...filas.map(row => columnas.map(c => row[c.columna as keyof typeof row]))]);
    const assistant = f.inserted.find(row => row.role === 'assistant')!;
    expect((assistant.metadata as { bloques: unknown[] }).bloques).toEqual([bloque]); sqlOnly(f);
  });
});


describe('QA P5: medios y aclaraciones del contrato compartido', () => {
  it('envía un PNG rasterizado localmente con bytes en vez de una URL externa', async () => {
    const bloque = { tipo: 'grafica', consulta: 1, truncado: true, aviso: 'Consulta truncada', titulo: 'Serie sintética', forma: 'bar', x: 'serie', y: ['total'], formato: 'numero', datos: [{ serie: 'A', total: 2 }, { serie: 'B', total: null }, { serie: 'C', total: 0 }] };
    const f = await fixture({ sqlBody: respuesta({ bloques: [bloque], sugerencias: [] }) }); await f.send();
    const photos = f.telegram.filter(t => t.method === 'sendPhoto'); expect(photos).toHaveLength(1);
    expect(String(photos[0].payload.photo)).not.toMatch(/^https?:/);
    const bytes = Object.values(photos[0].files)[0]; expect(bytes).toBeDefined();
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.byteLength).toBeLessThanOrEqual(5_000_000);
    expect(f.replies() + String(photos[0].payload.caption)).toMatch(/truncad/i); sqlOnly(f);
  });
  it('los botones de aclaración reenvían la opción guardada como siguiente pregunta', async () => {
    const f = await fixture({ sqlBody: respuesta({ sugerencias: [], aclaracion: { pregunta: '¿Cómo agrupo?', opciones: ['Por mes', 'Por lote'] } }) }); await f.send();
    expect(f.replies()).toContain('¿Cómo agrupo?'); const b = buttons(f).find(b => b.text === 'Por lote'); expect(b).toBeDefined();
    await f.tap(b!.callback_data, b!.messageId); expect(f.sql).toHaveLength(2); expect(f.sql[1].body.pregunta).toBe('Por lote'); sqlOnly(f);
  });
});


function parseCsv(csv: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  const text = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if ((c === '\r' || c === '\n') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(value); rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (row.length || value.length) { row.push(value); rows.push(row); }
  return rows;
}
describe('QA P5: fallos y cambios posteriores al snapshot', () => {
  it('apagar el flag SQL invalida los botones anteriores sin reenviar a legacy', async () => {
    const f = await fixture(); await f.send(); const b = suggestion(f); f.environment.ESCO_MOTOR_TELEGRAM = 'legacy';
    await f.tap(b.callback_data, b.messageId); expect(f.sql).toHaveLength(1); sqlOnly(f);
  });
  it('la consulta fallida muestra su estado sin revelar el detalle de error', async () => {
    const f = await fixture({ sqlBody: respuesta({ consultas: [{ sql: 'SELECT 1 AS total', proposito: 'Control sintético', n_filas: null, truncado: false, error: 'SYN_P5_ERROR_DETAIL', ms: 1 }] }) }); await f.send();
    const b = buttons(f).find(b => /Ver consultas/i.test(b.text))!; await f.tap(b.callback_data, b.messageId);
    expect(f.replies()).toMatch(/error|sin dato/i); expect(f.replies()).not.toContain('SYN_P5_ERROR_DETAIL'); expect(f.sql).toHaveLength(1); sqlOnly(f);
  });
});


describe('QA P5: gráfico no representable conserva sus datos', () => {
  it('entrega CSV completo si la fuente local no contiene un glifo solicitado', async () => {
    const bloque = { tipo: 'grafica', consulta: 1, truncado: false, titulo: 'Serie sintética', forma: 'bar', x: 'serie', y: ['total'], formato: 'numero', datos: [{ serie: 'Etiqueta 漢', total: 2 }, { serie: 'B', total: null }] };
    const f = await fixture({ sqlBody: respuesta({ bloques: [bloque], sugerencias: [] }) }); await f.send();
    expect(f.telegram.filter(t => t.method === 'sendPhoto')).toEqual([]);
    const docs = f.telegram.filter(t => t.method === 'sendDocument'); expect(docs).toHaveLength(1);
    expect(parseCsv(new TextDecoder().decode(Object.values(docs[0].files)[0]))).toEqual([['serie', 'total'], ['Etiqueta 漢', '2'], ['B', '']]);
    expect(f.replies()).toMatch(/no pude dibujar/i); sqlOnly(f);
  });
});


describe('QA P5: límites de exportación y transporte', () => {
  it('protege encabezados y celdas de CSV con espacios antes de indicadores de fórmula', async () => {
    const columnas = [{ columna: 'literal', etiqueta: '  =SYN_HEADER', formato: 'texto' }];
    const valores = ['  =SYN_LITERAL', '  +SYN_LITERAL', '  -SYN_LITERAL', '  @SYN_LITERAL'];
    const filas = Array.from({ length: 16 }, (_, i) => ({ literal: valores[i % valores.length] }));
    const f = await fixture({ sqlBody: respuesta({ bloques: [{ tipo: 'tabla', consulta: 1, truncado: false, titulo: 'Literales sintéticos', columnas, filas, total_filas: 16 }], sugerencias: [] }) }); await f.send();
    const docs = f.telegram.filter(t => t.method === 'sendDocument'); expect(docs).toHaveLength(1);
    const csv = parseCsv(new TextDecoder().decode(Object.values(docs[0].files)[0]));
    expect(csv).toEqual([["'  =SYN_HEADER"], ...filas.map(f => ["'" + f.literal])]); sqlOnly(f);
  });
  it('cancela una respuesta HTTP que supera4MiB sin leer el resto ni volver a legacy', async () => {
    const f = await fixture({ sqlStream: true }); await f.send();
    expect(f.sql).toHaveLength(1); expect(f.stream.canceled).toBe(true); expect(f.stream.pulls).toBeLessThan(100);
    expect(f.replies()).toMatch(/tamaño|respuesta|consulta/i);
    const errors=f.inserted.filter(r=>r.role==='assistant');expect(errors).toHaveLength(1);expect(errors[0].metadata).toMatchObject({motor:'sql_error',recibo:null,uso:null});
    expect(errors[0].metadata).not.toHaveProperty('bloques');expect(errors[0].metadata).not.toHaveProperty('consultas');expect(errors.filter(r=>(r.metadata as Record<string,unknown>).motor==='sql')).toEqual([]);expect(buttons(f)).toEqual([]);sqlOnly(f);
  });
});
