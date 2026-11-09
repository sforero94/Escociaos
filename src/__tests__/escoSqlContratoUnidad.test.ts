import { expect, it } from 'vitest';
import { leerRespuestaFinal } from '../utils/escoSql/respuesta.ts';

it('lee el JSON final también cercado y conserva texto normal de clientes antiguos', () => {
  expect(leerRespuestaFinal('```json\n{"texto":"Listo","sugerencias":["Ver detalle"]}\n```')).toEqual({ texto: 'Listo', sugerencias: ['Ver detalle'] });
  expect(leerRespuestaFinal('Texto normal')).toEqual({ texto: 'Texto normal', sugerencias: [] });
});
it('descarta chart JSON y no convierte un contrato roto en respuesta visible', () => {
  expect(leerRespuestaFinal('Texto\n```chart\n{"datos":[999]}\n```').texto).toBe('Texto');
  expect(leerRespuestaFinal('{"sugerencias":[],"bloques":[{"valor":999}]}').texto).not.toContain('999');
  expect(leerRespuestaFinal('```json\n{"texto":"roto","sugerencias":[').texto).not.toContain('sugerencias');
  expect(leerRespuestaFinal('Texto\n```chart {"datos":[999]}').texto).toBe('Texto');
});
it('las opciones y sugerencias son breves, sin cifras, únicas y como máximo tres', () => {
  const r = leerRespuestaFinal(JSON.stringify({ texto: 'Aclara', sugerencias: ['Detalle', 'Detalle', 'Con 99', 'a'.repeat(200), 'Otra', 'Tercera', 'Cuarta'], aclaracion: { pregunta: '¿Qué período?', opciones: ['Este mes', 'En 2026'] } }));
  expect(r.sugerencias).toEqual(['Detalle', 'Otra', 'Tercera']);
  expect(r.aclaracion).toEqual({ pregunta: '¿Qué período?', opciones: ['Este mes'] });
});
