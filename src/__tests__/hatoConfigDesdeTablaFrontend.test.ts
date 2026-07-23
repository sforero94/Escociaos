// ARCHIVO: __tests__/hatoConfigDesdeTablaFrontend.test.ts
// DESCRIPCIÓN: TDD de `construirHatoConfigDesdeFilas` -- versión FRONTEND
// (`src/utils/hatoConfigDesdeTabla.ts`, S4). Espejo intencional de
// `hatoConfigDesdeTabla.test.ts` (la copia Deno del endpoint B0): misma
// lógica, mismo contrato de "ninguna clave faltante cae a un default
// inventado", pero un archivo de test propio porque son dos módulos
// distintos (el frontend no importa el árbol de la edge function -- ver el
// comentario de cabecera de `hatoConfigDesdeTabla.ts`).

import { describe, it, expect } from 'vitest';
import { construirHatoConfigDesdeFilas, type FilaHatoConfig } from '../utils/hatoConfigDesdeTabla';

const FILAS_COMPLETAS: FilaHatoConfig[] = [
  { clave: 'razas', valor: ['jersey', 'holstein', 'normanda', 'gyr'] },
  { clave: 'meses_secado_por_raza', valor: { jersey: 2, holstein: 2, normanda: 3, _default: 2 } },
  { clave: 'meses_gestacion_default', valor: 9 },
  { clave: 'umbral_partos_reemplazo', valor: 9 },
  { clave: 'ventana_proxima_secar_dias', valor: 30 },
  { clave: 'ventana_proximo_parir_dias', valor: 30 },
  { clave: 'dias_parto_proximo_alerta', valor: 14 },
  { clave: 'dias_servicio_sin_confirmacion', valor: 45 },
  { clave: 'dias_rechequeo_due', valor: 60 },
  { clave: 'dias_espera_voluntaria_post_parto', valor: 60 },
];

describe('construirHatoConfigDesdeFilas (frontend)', () => {
  it('arma un HatoConfig completo desde las 10 filas sembradas (058 + 062 + 064)', () => {
    const config = construirHatoConfigDesdeFilas(FILAS_COMPLETAS);
    expect(config).toEqual({
      razas: ['jersey', 'holstein', 'normanda', 'gyr'],
      meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
      meses_gestacion_default: 9,
      umbral_partos_reemplazo: 9,
      ventana_proxima_secar_dias: 30,
      ventana_proximo_parir_dias: 30,
      dias_parto_proximo_alerta: 14,
      dias_servicio_sin_confirmacion: 45,
      dias_rechequeo_due: 60,
      dias_espera_voluntaria_post_parto: 60,
    });
  });

  it('lanza un error explícito y nombra la clave si falta alguna de las 10', () => {
    const filas = FILAS_COMPLETAS.filter((f) => f.clave !== 'dias_espera_voluntaria_post_parto');
    expect(() => construirHatoConfigDesdeFilas(filas)).toThrow(/dias_espera_voluntaria_post_parto/);
  });

  it('lanza un error explícito si faltan varias claves, nombrando todas', () => {
    const filas = FILAS_COMPLETAS.filter((f) => f.clave !== 'razas' && f.clave !== 'umbral_partos_reemplazo');
    expect(() => construirHatoConfigDesdeFilas(filas)).toThrow(/razas.*umbral_partos_reemplazo|umbral_partos_reemplazo.*razas/s);
  });

  it('lanza un error explícito si "razas" no es un arreglo de strings', () => {
    const filas = FILAS_COMPLETAS.map((f) => (f.clave === 'razas' ? { clave: 'razas', valor: 'jersey' } : f));
    expect(() => construirHatoConfigDesdeFilas(filas)).toThrow(/razas/);
  });

  it('lanza un error explícito si "meses_secado_por_raza" no trae "_default"', () => {
    const filas = FILAS_COMPLETAS.map((f) =>
      f.clave === 'meses_secado_por_raza' ? { clave: f.clave, valor: { jersey: 2, holstein: 2 } } : f,
    );
    expect(() => construirHatoConfigDesdeFilas(filas)).toThrow(/_default/);
  });

  it('lanza un error explícito si un umbral numérico viene con un tipo no numérico', () => {
    const filas = FILAS_COMPLETAS.map((f) => (f.clave === 'dias_rechequeo_due' ? { clave: f.clave, valor: 'sesenta' } : f));
    expect(() => construirHatoConfigDesdeFilas(filas)).toThrow(/dias_rechequeo_due/);
  });

  it('ignora claves desconocidas en la tabla sin fallar (H2 puede agregar nuevas sin romper el hook)', () => {
    const filas = [...FILAS_COMPLETAS, { clave: 'una_clave_futura', valor: { algo: 1 } }];
    expect(() => construirHatoConfigDesdeFilas(filas)).not.toThrow();
  });
});
