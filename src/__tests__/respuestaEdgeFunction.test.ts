// ARCHIVO: __tests__/respuestaEdgeFunction.test.ts
// DESCRIPCIÓN: Contrato de `leerCuerpoEdgeFunction` -- nunca debe dejar
// escapar un `SyntaxError` de `JSON.parse` hacia la UI. Caso real que motiva
// este archivo: `hato/produccion/quincena/foto` sin desplegar responde 404
// con el texto plano por defecto de Hono (`"404 Not Found"`), y
// `JSON.parse("404 Not Found")` produce exactamente el mensaje que Martha
// vio en pantalla: "Unexpected non-whitespace character after JSON at
// position 4 (line 1 column 5)".

import { describe, it, expect } from 'vitest';
import { leerCuerpoEdgeFunction } from '@/utils/supabase/respuestaEdgeFunction';

describe('leerCuerpoEdgeFunction', () => {
  it('cuerpo de texto plano 404 Not Found (ruta sin desplegar) -- nunca la palabra JSON, siempre el status', async () => {
    const res = new Response('404 Not Found', { status: 404 });
    const resultado = await leerCuerpoEdgeFunction(res);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperaba ok: false');
    expect(resultado.mensaje).not.toMatch(/json/i);
    expect(resultado.mensaje).not.toMatch(/syntaxerror/i);
    expect(resultado.mensaje).not.toMatch(/unexpected non-whitespace/i);
    expect(resultado.mensaje).toContain('404');
    expect(resultado.mensaje.toLowerCase()).toContain('no reconoce');
    expect(resultado.mensaje.toLowerCase()).toContain('soporte');
  });

  it('cuerpo HTML (ej. proxy/gateway caído) -- se reporta como error legible, sin SyntaxError', async () => {
    const res = new Response('<html><body>Bad Gateway</body></html>', { status: 502 });
    const resultado = await leerCuerpoEdgeFunction(res);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperaba ok: false');
    expect(resultado.mensaje).not.toMatch(/json/i);
    expect(resultado.mensaje).toContain('502');
    expect(resultado.mensaje.toLowerCase()).toContain('soporte');
  });

  it('cuerpo vacío -- se reporta como error legible, sin intentar parsear', async () => {
    const res = new Response('', { status: 500 });
    const resultado = await leerCuerpoEdgeFunction(res);

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error('esperaba ok: false');
    expect(resultado.mensaje).not.toMatch(/json/i);
    expect(resultado.mensaje).toContain('500');
    expect(resultado.mensaje.toLowerCase()).toContain('soporte');
  });

  it('JSON de error válido (ej. 401 sin sesión) -- se parsea normal, el llamador sigue leyendo body.error', async () => {
    const res = new Response(JSON.stringify({ success: false, error: 'No autorizado' }), { status: 401 });
    const resultado = await leerCuerpoEdgeFunction<{ success: boolean; error: string }>(res);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('esperaba ok: true');
    expect(resultado.body.success).toBe(false);
    expect(resultado.body.error).toBe('No autorizado');
  });

  it('JSON exitoso -- se parsea normal', async () => {
    const res = new Response(JSON.stringify({ success: true, documento: { proveedor: 'El Pomar' } }), { status: 200 });
    const resultado = await leerCuerpoEdgeFunction<{ success: boolean; documento: { proveedor: string } }>(res);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('esperaba ok: true');
    expect(resultado.body.success).toBe(true);
    expect(resultado.body.documento.proveedor).toBe('El Pomar');
  });

  it('status 404 con cuerpo JSON válido (no el caso del bug, pero no debe confundirse) sigue el camino JSON', async () => {
    const res = new Response(JSON.stringify({ success: false, error: 'No encontrado' }), { status: 404 });
    const resultado = await leerCuerpoEdgeFunction<{ success: boolean; error: string }>(res);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) throw new Error('esperaba ok: true');
    expect(resultado.body.error).toBe('No encontrado');
  });
});
