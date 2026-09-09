import { describe, it, expect } from 'vitest';
import {
  mensajeDeError,
  esColumnaPesoDestareAusente,
  mensajeErrorTransaccionGanado,
  PISTA_MIGRACION_141,
} from '@/utils/mensajeError';

describe('mensajeDeError', () => {
  it('lee message de un Error', () => {
    expect(mensajeDeError(new Error('permission denied'))).toBe('permission denied');
  });

  it('lee message de un objeto plano PostgREST (no es Error)', () => {
    const postgrest = {
      message: "Could not find the 'peso_total_kg' column of 'fin_transacciones_ganado' in the schema cache",
      code: 'PGRST204',
      details: null,
      hint: null,
    };
    expect(mensajeDeError(postgrest)).toBe(postgrest.message);
  });

  it('no traga un message presente a "Error desconocido"', () => {
    expect(mensajeDeError({ message: 'duplicate key' })).toBe('duplicate key');
    expect(mensajeDeError({ message: 'duplicate key' })).not.toBe('Error desconocido');
  });

  it('acepta un string', () => {
    expect(mensajeDeError('falló el RPC')).toBe('falló el RPC');
  });

  it('cae al fallback solo cuando no hay message', () => {
    expect(mensajeDeError(null)).toBe('Error desconocido');
    expect(mensajeDeError({})).toBe('Error desconocido');
    expect(mensajeDeError({ code: 'PGRST204' })).toBe('Error desconocido');
    expect(mensajeDeError({ message: '' })).toBe('Error desconocido');
    expect(mensajeDeError({ message: '   ' })).toBe('Error desconocido');
    expect(mensajeDeError(new Error(''))).toBe('Error desconocido');
  });
});

describe('esColumnaPesoDestareAusente', () => {
  it('reconoce PGRST204 de peso_total_kg (el fallo del preview #216)', () => {
    expect(
      esColumnaPesoDestareAusente(
        "Could not find the 'peso_total_kg' column of 'fin_transacciones_ganado' in the schema cache"
      )
    ).toBe(true);
  });

  it('reconoce destare_kg_cabeza en el schema cache', () => {
    expect(
      esColumnaPesoDestareAusente(
        "Could not find the 'destare_kg_cabeza' column of 'fin_transacciones_ganado' in the schema cache"
      )
    ).toBe(true);
  });

  it('no marca un CHECK de destare (columnas ya existen)', () => {
    expect(
      esColumnaPesoDestareAusente(
        'new row for relation "fin_transacciones_ganado" violates check constraint "fin_transacciones_ganado_destare_vs_peso_check"'
      )
    ).toBe(false);
  });
});

describe('mensajeErrorTransaccionGanado', () => {
  it('añade la pista de la 141 cuando falta la columna', () => {
    const err = {
      message: "Could not find the 'peso_total_kg' column of 'fin_transacciones_ganado' in the schema cache",
      code: 'PGRST204',
    };
    const texto = mensajeErrorTransaccionGanado(err);
    expect(texto).toContain(err.message);
    expect(texto).toContain(PISTA_MIGRACION_141);
  });

  it('no añade la pista a un error distinto', () => {
    expect(mensajeErrorTransaccionGanado({ message: 'JWT expired' })).toBe('JWT expired');
  });
});
