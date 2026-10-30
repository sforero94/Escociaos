import { describe, expect, it } from 'vitest';
import { pideFechasPlaneadas, requiereConsultaAplicaciones } from '../utils/escoConsultas';

const positives = [
  '¿Qué aplicaciones están planeadas para noviembre de 2026?',
  '¿Cuáles aplicaciones están planeadas para noviembre de 2026?',
  '¿Cuáles son las aplicaciones planeadas para noviembre de 2026?',
  '¿Qué aplicaciones tenemos planeadas para noviembre de 2026?',
  '¿Qué fumigaciones hay planificadas para noviembre de 2026?',
  '¿Cuáles son las aplicaciones que están planeadas para noviembre de 2026?',
];
describe('explicit planned interrogatives', () => {
  it.each(positives)('recognizes and routes the direct planned request: %s', question => {
    expect(pideFechasPlaneadas(question)).toBe(true);
    expect(requiereConsultaAplicaciones(question)).toBe(true);
  });
  it.each(['Solo lectura. ', 'Solo lectura: ', 'Consulta de solo lectura: '])('preserves the planned question after a bounded read-only prefix: %s', prefix => {
    expect(pideFechasPlaneadas(prefix + positives[0])).toBe(true);
    expect(requiereConsultaAplicaciones(prefix + positives[0])).toBe(true);
  });
  it.each([
    '¿Qué aplicaciones no están planeadas para noviembre de 2026?',
    '¿Cuáles aplicaciones están en ejecución en noviembre de 2026?',
    '¿Cuál es el estado de la aplicación cuya fecha planeada estaba mal?',
    'Dame el estado de la aplicación cuya fecha planeada estaba mal; usa la real.',
    '¿Qué aplicaciones están planeadas para noviembre? Pero usa fechas reales.',
    '¿Qué aplicaciones están planeadas para noviembre? No uses fechas planeadas.',
    '¿Qué aplicaciones están planeadas y qué fechas reales tienen?',
    '¿Qué aplicaciones móviles están planeadas para noviembre?',
    '¿Qué aplicaciones planeadas están en ejecución ahora?',
    '¿Qué aplicaciones están planeadas para noviembre sin usar fechas planeadas?',
    '¿Qué aplicaciones están planificadas para noviembre sin utilizar fechas planificadas?',
  ])('does not grant planned-date consent from a negative, contrast or incidental mention: %s', question => {
    expect(pideFechasPlaneadas(question)).toBe(false);
  });
});
