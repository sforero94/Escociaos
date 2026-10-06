import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  JOBS_HORARIO_ALERTAS,
  esFuncionHorarioAusente,
  esJobHorarioAlertas,
  formatearHoraAlertas,
  validarHoraAlertas,
} from '@/utils/horarioAlertas';

describe('horario de alertas (migración 175)', () => {
  it('valida HH:MM entre 00:00 y 23:59', () => {
    expect(validarHoraAlertas('07:30')).toBeNull();
    expect(validarHoraAlertas('00:00')).toBeNull();
    expect(validarHoraAlertas('23:59')).toBeNull();
    expect(validarHoraAlertas('24:00')).not.toBeNull();
    expect(validarHoraAlertas('7:30')).not.toBeNull();
    expect(validarHoraAlertas('07:60')).not.toBeNull();
    expect(validarHoraAlertas('')).not.toBeNull();
  });

  it('formatea la hora en 12 h y nunca inventa una hora', () => {
    expect(formatearHoraAlertas('07:30')).toBe('7:30 a. m.');
    expect(formatearHoraAlertas('00:05')).toBe('12:05 a. m.');
    expect(formatearHoraAlertas('12:00')).toBe('12:00 p. m.');
    expect(formatearHoraAlertas('19:05')).toBe('7:05 p. m.');
    expect(formatearHoraAlertas(null)).toBe('sin hora');
  });

  it('solo reconoce los dos procesos que mandan alertas', () => {
    expect(esJobHorarioAlertas('hato-alertas-tick')).toBe(true);
    expect(esJobHorarioAlertas('ronda-inventario-tick')).toBe(true);
    expect(esJobHorarioAlertas('clima-sync-wu')).toBe(false);
  });

  it('distingue "falta la migración" de un error real', () => {
    expect(esFuncionHorarioAusente({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true);
    expect(esFuncionHorarioAusente({ code: '42501', message: 'Solo Gerencia cambia el horario' })).toBe(false);
    expect(esFuncionHorarioAusente(null)).toBe(false);
  });

  it('la lista de procesos del navegador es la misma que la de la migración', () => {
    const sql = readFileSync(
      resolve(__dirname, '..', 'sql/migrations/175_hato_alertas_tick_0730.sql'),
      'utf8',
    );
    for (const job of JOBS_HORARIO_ALERTAS) expect(sql).toContain(`'${job}'`);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toContain('es_usuario_gerencia()');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_alertas_horario_cambiar\(TEXT, TEXT\) FROM PUBLIC, anon/);
  });
});
