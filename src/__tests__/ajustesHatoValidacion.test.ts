// ARCHIVO: __tests__/ajustesHatoValidacion.test.ts
// DESCRIPCIÓN: TDD de `src/utils/ajustesHatoValidacion.ts` (Épica H, S10).
// Objetivo central: probar que lo que `AjustesHato.tsx` va a guardar en
// `hato_config` sigue satisfaciendo `construirHatoConfigDesdeFilas` -- el
// lector estricto que usan los hooks del motor en producción
// (`useHatoAnimales.ts`, `useHatoAnimal.ts`). Una regresión de forma aquí
// debe reventar en Vitest, no en el tablero de un usuario real.

import { describe, it, expect } from 'vitest';
import {
  serializarAjustesHato,
  validarAjustesHatoParaMotor,
  formularioDesdeFilas,
  CLAVE_DIA_PESAJE_SEMANAL,
  type AjustesHatoForm,
} from '../utils/ajustesHatoValidacion';
import type { FilaHatoConfig } from '../utils/hatoConfigDesdeTabla';

const FORM_VALIDO: AjustesHatoForm = {
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
  mesesSecadoPorRaza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  mesesGestacionDefault: 9,
  umbralPartosReemplazo: 9,
  ventanaProximaSecarDias: 30,
  ventanaProximoParirDias: 30,
  diasPartoProximoAlerta: 14,
  diasServicioSinConfirmacion: 45,
  diasRechequeoDue: 60,
  diasEsperaVoluntariaPostParto: 60,
  diaPesajeSemanal: { iso: 3, nombre: 'miercoles' },
};

describe('serializarAjustesHato', () => {
  it('produce 11 filas, una por clave de hato_config (058+062+064)', () => {
    const filas = serializarAjustesHato(FORM_VALIDO);
    expect(filas).toHaveLength(11);
    expect(filas.map((f) => f.clave).sort()).toEqual(
      [
        'razas',
        'meses_secado_por_raza',
        'meses_gestacion_default',
        'umbral_partos_reemplazo',
        'ventana_proxima_secar_dias',
        'ventana_proximo_parir_dias',
        'dias_parto_proximo_alerta',
        'dias_servicio_sin_confirmacion',
        'dias_rechequeo_due',
        'dias_espera_voluntaria_post_parto',
        CLAVE_DIA_PESAJE_SEMANAL,
      ].sort(),
    );
  });

  it('serializa dia_pesaje_semanal como objeto {iso, nombre}, no como string', () => {
    const filas = serializarAjustesHato(FORM_VALIDO);
    const fila = filas.find((f) => f.clave === CLAVE_DIA_PESAJE_SEMANAL);
    expect(fila?.valor).toEqual({ iso: 3, nombre: 'miercoles' });
  });
});

describe('validarAjustesHatoParaMotor — round-trip contra construirHatoConfigDesdeFilas', () => {
  it('un formulario válido pasa la validación y arma el HatoConfig esperado', () => {
    const filas = serializarAjustesHato(FORM_VALIDO);
    const config = validarAjustesHatoParaMotor(filas);
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

  it('sobrevive un round-trip por JSON (simula ida y vuelta por una columna jsonb)', () => {
    const filas = serializarAjustesHato(FORM_VALIDO);
    const filasTrasJson: FilaHatoConfig[] = JSON.parse(JSON.stringify(filas));
    expect(() => validarAjustesHatoParaMotor(filasTrasJson)).not.toThrow();
  });

  it('excluye dia_pesaje_semanal de la validación del motor -- una forma inválida ahí no rompe el guardado', () => {
    const form: AjustesHatoForm = { ...FORM_VALIDO, diaPesajeSemanal: { iso: NaN, nombre: '' } };
    const filas = serializarAjustesHato(form);
    expect(() => validarAjustesHatoParaMotor(filas)).not.toThrow();
  });

  it('regresión: si meses_secado_por_raza pierde "_default" al serializar, la validación revienta nombrando la clave', () => {
    const form: AjustesHatoForm = {
      ...FORM_VALIDO,
      mesesSecadoPorRaza: { jersey: 2, holstein: 2, normanda: 3 }, // sin _default
    };
    const filas = serializarAjustesHato(form);
    expect(() => validarAjustesHatoParaMotor(filas)).toThrow(/_default/);
  });

  it('regresión: si "razas" se serializara como string en vez de arreglo, la validación revienta', () => {
    const filas = serializarAjustesHato(FORM_VALIDO).map((f) =>
      f.clave === 'razas' ? { clave: f.clave, valor: 'jersey' } : f,
    );
    expect(() => validarAjustesHatoParaMotor(filas)).toThrow(/razas/);
  });

  it('regresión: un umbral numérico serializado como string revienta la validación', () => {
    const filas = serializarAjustesHato(FORM_VALIDO).map((f) =>
      f.clave === 'dias_rechequeo_due' ? { clave: f.clave, valor: '60' } : f,
    );
    expect(() => validarAjustesHatoParaMotor(filas)).toThrow(/dias_rechequeo_due/);
  });

  it('regresión: si falta una fila completa (ej. umbral_partos_reemplazo), la validación la nombra', () => {
    const filas = serializarAjustesHato(FORM_VALIDO).filter((f) => f.clave !== 'umbral_partos_reemplazo');
    expect(() => validarAjustesHatoParaMotor(filas)).toThrow(/umbral_partos_reemplazo/);
  });
});

describe('formularioDesdeFilas — inverso para poblar el formulario al abrir la pantalla', () => {
  it('reconstruye un AjustesHatoForm equivalente al original desde las filas serializadas', () => {
    const filas = serializarAjustesHato(FORM_VALIDO);
    expect(formularioDesdeFilas(filas)).toEqual(FORM_VALIDO);
  });

  it('no lanza si falta una clave (a diferencia de validarAjustesHatoParaMotor) y aplica un default razonable', () => {
    const filas = serializarAjustesHato(FORM_VALIDO).filter((f) => f.clave !== 'dias_rechequeo_due');
    expect(() => formularioDesdeFilas(filas)).not.toThrow();
    expect(formularioDesdeFilas(filas).diasRechequeoDue).toBe(60);
  });
});
