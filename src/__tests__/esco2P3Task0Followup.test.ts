import { describe, expect, it } from 'vitest';
import { solicitudDesarrollo } from '@/utils/esco2/seguimientoDesarrollo';

const opciones = [{ id: 'tarea', etiqueta: 'Tareas con ese nombre' }, { id: 'categoria', etiqueta: 'Categoría completa' }];
describe('development runner follows an offered button', () => {
  it('uses the predeclared named-task choice for the D26 development fixture', () => {
    expect(solicitudDesarrollo({ pregunta: 'Un texto cualquiera', estadoToken: 'server-token', opciones, modo: 'aclaracion_d26' }))
      .toEqual({ pregunta: 'Tareas con ese nombre', estadoToken: 'server-token', respuestaAclaracion: 'tarea' });
  });
  it('honors an explicit fixture choice instead of the mode default', () => {
    expect(solicitudDesarrollo({ pregunta: 'tarea', estadoToken: 'server-token', opciones, modo: 'aclaracion_d26', opcionId: 'categoria' }))
      .toEqual({ pregunta: 'Categoría completa', estadoToken: 'server-token', respuestaAclaracion: 'categoria' });
  });
  it('sends the exact offered option ID and token, using its label as question', () => {
    expect(solicitudDesarrollo({ pregunta: 'Un texto cualquiera', estadoToken: 'server-token', opciones, opcionId: 'categoria' }))
      .toEqual({ pregunta: 'Categoría completa', estadoToken: 'server-token', respuestaAclaracion: 'categoria' });
  });
  it('never maps free text into scope when no button choice is configured', () => {
    expect(solicitudDesarrollo({ pregunta: 'categoria', estadoToken: 'server-token', opciones }))
      .toEqual({ pregunta: 'categoria', estadoToken: 'server-token', respuestaAclaracion: undefined });
  });
  it('does not send a choice before options are offered', () => {
    expect(solicitudDesarrollo({ pregunta: 'Consulta inicial', opcionId: 'categoria' }))
      .toEqual({ pregunta: 'Consulta inicial', estadoToken: undefined, respuestaAclaracion: undefined });
  });
  it('rejects a configured choice that was not offered', () => {
    expect(() => solicitudDesarrollo({ pregunta: 'text', estadoToken: 'server-token', opciones, opcionId: 'inventada' }))
      .toThrow('opcion_desarrollo_no_ofrecida');
  });
  it('rejects an offered choice without its server token', () => {
    expect(() => solicitudDesarrollo({ pregunta: 'text', opciones, opcionId: 'tarea' }))
      .toThrow('aclaracion_desarrollo_sin_token');
  });
});
