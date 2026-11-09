import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BloquesSql, SugerenciasSql } from '../components/chat/BloquesSql';
import { ChatMessageView } from '../components/chat/ChatMessage';
import { motorSqlWebHabilitado, metadataRespuestaSql, leerMetadataSql, bloquesParaExportar } from '../utils/escoSqlChat';
import { leerStreamSql } from '../utils/escoSqlChatService';
import type { Bloque } from '../utils/escoSql/bloques';
const tabla: Bloque = { tipo: 'tabla', consulta: 1, titulo: 'Detalle sintético', truncado: false, total_filas: 80, columnas: [{ columna: 'monto', etiqueta: 'Monto', formato: 'moneda' }], filas: Array.from({ length: 80 }, (_, i) => ({ monto: i === 0 ? null : 95_000_000 + i })) };
const resultado = { texto: 'Respuesta sintética', bloques: [tabla], sugerencias: ['Ver detalle'], consultas: [{ sql: 'select monto', proposito: 'Consultar total', n_filas: 80, truncado: false, error: null, ms: 4, filas_muestra: [{ secreto: 'no persistir' }] }], ms: 12 };
const stream = (frames: string[]) => new Response(new ReadableStream({start(c) { for (const frame of frames) c.enqueue(new TextEncoder().encode(frame)); c.close(); }}), {headers:{'content-type':'text/event-stream'}});
describe('P3 cliente SQL', () => {
 it('el flag solo admite sql explícito; valores ausentes conservan legacy', () => { for (const v of [undefined, '', 'legacy', true, 'SQL']) expect(motorSqlWebHabilitado(v)).toBe(false); expect(motorSqlWebHabilitado('sql')).toBe(true); });
 it('persiste snapshot de bloques y consultas sin filas y reabre sin ejecutar SQL', () => { const meta = metadataRespuestaSql(resultado, '2026-11-09T12:00:00Z'); expect(meta.motor).toBe('sql'); expect(JSON.stringify(meta)).not.toContain('filas_muestra'); expect(JSON.stringify(meta)).not.toContain('no persistir'); expect(leerMetadataSql(meta)?.bloques).toEqual([tabla]); expect(leerMetadataSql(meta)?.sugerencias).toEqual(['Ver detalle']); });
 it('los metadatos malformados no rompen la conversación antigua', () => { expect(leerMetadataSql({})).toBeNull(); expect(leerMetadataSql({motor:'sql',bloques:[{tipo:'tabla'}]})).toMatchObject({bloques:[]}); });
 it('la tabla limita a cincuenta filas y distingue null del cero', () => { const html = renderToStaticMarkup(<BloquesSql bloques={[tabla]} />); expect(html).toContain('Sin dato'); expect(html).toContain('$95M'); expect(html).toContain('50 de 80'); expect((html.match(/<tbody[^>]*>[\s\S]*?<\/tbody>/)?.[0].match(/<tr/g) ?? []).length).toBe(50); });
 it('exporta bloques tipados sin analizar JSON del texto y conserva cifras exactas formateadas', () => { const bloques = bloquesParaExportar('Texto', [tabla]); expect(bloques[0]).toMatchObject({type:'text', value:'Texto'}); expect(JSON.stringify(bloques)).toContain('Detalle sintético'); expect(JSON.stringify(bloques)).not.toContain('filas_muestra'); });
 it('recompone frames partidos y exige done antes de devolver un resultado', async () => { const eventos = vi.fn(); const wire = `event: texto\r\ndata: ${JSON.stringify({type:'texto',texto:'Respuesta sintética'})}\r\n\r\nevent: done\ndata: ${JSON.stringify({type:'done',resultado})}\n\n`; const r = await leerStreamSql(stream([wire.slice(0,25),wire.slice(25)]),eventos); expect(r.texto).toBe('Respuesta sintética'); expect(eventos).toHaveBeenCalledTimes(2); });
 it('un error terminal y un stream incompleto no se convierten en respuesta correcta', async () => { await expect(leerStreamSql(stream([`data: {"type":"error","message":"Fallo sintético"}\n\n`]),()=>{})).rejects.toThrow('Fallo sintético'); await expect(leerStreamSql(stream([`data: {"type":"texto","texto":"Parcial"}\n\n`]),()=>{})).rejects.toThrow(/incomplet/i); });
});

it('una respuesta SQL reabierta muestra snapshot, tabla tipada y texto sin parsear gráficos heredados', () => { const metadata = metadataRespuestaSql(resultado, '2026-11-09T12:00:00Z'); const html=renderToStaticMarkup(<ChatMessageView role="assistant" content="Texto persistido" metadata={metadata} />); expect(html).toContain('Instantánea de la consulta'); expect(html).toContain('Detalle sintético'); });
it('las sugerencias usan botones accesibles y se bloquean durante un envío', () => { const html=renderToStaticMarkup(<SugerenciasSql sugerencias={['Ver detalle']} opciones={['Este mes']} onSelect={()=>{}} disabled />); expect(html).toContain('disabled'); expect(html).toContain('type="button"'); expect(html).toContain('Este mes'); });
it('detener desbloquea un lector SSE sin nuevos datos', async () => {
 const controller=new AbortController(); const response=new Response(new ReadableStream({start(){}}),{headers:{'content-type':'text/event-stream'}});
 const leyendo=leerStreamSql(response,()=>{},controller.signal); controller.abort(); await expect(leyendo).rejects.toMatchObject({name:'AbortError'});
});
