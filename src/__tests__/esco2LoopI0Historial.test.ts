import { describe, expect, it } from 'vitest';
import { AVISO_EXTRACTO_HISTORIAL, compactarRespuestaHistorial, MAX_CONTEXTO_MENSAJE } from '../utils/esco2Historial.ts';
const budget = MAX_CONTEXTO_MENSAJE - AVISO_EXTRACTO_HISTORIAL.length;
const head = Math.floor(budget * 0.7);
const tail = budget - head;
describe('Loop I0: extractos no fabrican cifras por corte', () => {
  it('retira la cifra entera si el límite de cabeza cae dentro de ella', () => {
    const prefix = 'a'.repeat(head - 14) + ' Total: ';
    const text = prefix + '1.234.567,891234' + ' fin '.repeat(2000);
    const result = compactarRespuestaHistorial(text);
    const shown = result.split(AVISO_EXTRACTO_HISTORIAL)[0];
    expect(shown).toBe(prefix);
    expect(result.length).toBeLessThanOrEqual(MAX_CONTEXTO_MENSAJE);
  });
  it('retira el fragmento de cifra al inicio de la cola', () => {
    const suffix = ' cola '.repeat(Math.ceil(tail / 6)).slice(0, tail - 8);
    const text = 'inicio '.repeat(2000) + ' 987.654.321,123456 ' + suffix;
    const result = compactarRespuestaHistorial(text);
    const shown = result.split(AVISO_EXTRACTO_HISTORIAL)[1];
    expect(shown).toBe(' ' + suffix);
  });
  it('no presenta fragmentos de un token numérico sin espacios aunque ocupe toda la respuesta', () => {
    const result = compactarRespuestaHistorial('1234567890'.repeat(1000));
    expect(result).toBe(AVISO_EXTRACTO_HISTORIAL);
  });
  it('conserva sin cambios una respuesta corta y una cifra completa al borde de un espacio', () => {
    const text = 'Total: 1.234.567,89\nDetalle completo.';
    expect(compactarRespuestaHistorial(text)).toBe(text);
  });
});
