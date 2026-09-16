// ARCHIVO: __tests__/hatoReactivacionAnimal.test.ts
// DESCRIPCIÓN: `utils/hato/reactivacionAnimal.ts` (plan
// `docs/hato/plan_chequeo_novedades_implementacion.md` §4.6/§6.2) -- las dos
// funciones puras que sostienen la reactivación desde la ventana de revisión
// del chequeo (`numero_animal_inactivo`, Path A):
//
//   * `construirNotaReactivacion` -- arma el párrafo que se APPENDEA a
//     `hato_animales.notas`, mismo tono que la migración 153 §B. Nunca
//     reemplaza lo que ya había escrito, y nunca llama a `new Date()` --
//     la fecha de hoy y la del chequeo siempre viajan como parámetro.
//   * `detectarColisionCaravana` -- el pre-chequeo cliente de la colisión de
//     caravana (índice único parcial de la migración 066): busca un animal
//     ACTIVO que ya lleve ese número, excluyendo al propio animal que se está
//     reactivando (que hoy es inactivo, pero la exclusión es la garantía, no
//     una suposición sobre su estado actual).

import { describe, it, expect } from 'vitest';
import { construirNotaReactivacion, detectarColisionCaravana } from '@/utils/hato/reactivacionAnimal';

describe('construirNotaReactivacion', () => {
  it('appendea a notas previas, nunca las reemplaza', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: 'Madre (crudo): COMETA',
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2026-08-11',
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: null,
    });
    expect(nota.startsWith('Madre (crudo): COMETA')).toBe(true);
    expect(nota).toContain('Madre (crudo): COMETA');
    expect(nota).toContain('Reactivada 2026-09-15');
  });

  it('separa lo previo de la nota nueva con una línea en blanco (mismo patrón que la migración 153)', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: 'Nota vieja',
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2026-08-11',
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: null,
    });
    expect(nota).toBe(
      'Nota vieja\n\nReactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes descartada desde 2026-08-11).',
    );
  });

  it('maneja notasPrevias null -- no imprime "null" ni deja un salto de línea colgado', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'vendida',
      fechaEstadoAnterior: '2026-01-05',
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: null,
    });
    expect(nota).toBe(
      'Reactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes vendida desde 2026-01-05).',
    );
    expect(nota).not.toContain('null');
    expect(nota.startsWith('\n')).toBe(false);
  });

  it('notasPrevias vacío ("") se trata igual que null', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: '',
      estadoAnterior: 'muerta',
      fechaEstadoAnterior: null,
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: null,
    });
    expect(nota.startsWith('Reactivada')).toBe(true);
  });

  it('usa la fecha INYECTADA, nunca la del reloj -- fechaHoy y fechaChequeo mandan tal cual llegan', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2020-01-01',
      fechaHoy: '2099-12-31',
      fechaChequeo: '2099-12-25',
      motivo: null,
    });
    expect(nota).toContain('Reactivada 2099-12-31');
    expect(nota).toContain('desde el chequeo del 2099-12-25');
  });

  it('sin fechaEstadoAnterior no inventa una fecha -- dice el estado sin "desde"', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: null,
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: null,
    });
    expect(nota).toBe(
      'Reactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes descartada).',
    );
  });

  it('sin fechaChequeo (fila sin fecha fijada todavía) no inventa un origen -- lo dice genérico', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2026-08-11',
      fechaHoy: '2026-09-15',
      fechaChequeo: null,
      motivo: null,
    });
    expect(nota).toBe(
      'Reactivada 2026-09-15: apareció escrita a mano en un chequeo (antes descartada desde 2026-08-11).',
    );
  });

  it('un motivo escrito por la persona se agrega al final, tal cual', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2026-08-11',
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: 'Uriel la vio en el potrero de Escocia.',
    });
    expect(nota).toBe(
      'Reactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes descartada desde 2026-08-11). Uriel la vio en el potrero de Escocia.',
    );
  });

  it('un motivo en blanco (solo espacios) se trata como ausente', () => {
    const nota = construirNotaReactivacion({
      notasPrevias: null,
      estadoAnterior: 'descartada',
      fechaEstadoAnterior: '2026-08-11',
      fechaHoy: '2026-09-15',
      fechaChequeo: '2026-09-08',
      motivo: '   ',
    });
    expect(nota).toBe(
      'Reactivada 2026-09-15 desde el chequeo del 2026-09-08: apareció escrita a mano en la planilla (antes descartada desde 2026-08-11).',
    );
  });
});

describe('detectarColisionCaravana', () => {
  const ACTIVOS = [
    { id: 'novilla-9', numero: 178, nombre: 'NOVILLA9' },
    { id: 'vaca-50', numero: 50, nombre: 'PAZ' },
    { id: 'sin-numero', numero: null, nombre: 'SIN CARAVANA' },
  ];

  it('encuentra al animal activo que ya lleva ese número', () => {
    const colision = detectarColisionCaravana(178, ACTIVOS, 'comina-inactiva');
    expect(colision).toEqual({ id: 'novilla-9', nombre: 'NOVILLA9' });
  });

  it('excluye al propio animal que se está reactivando de su propia búsqueda', () => {
    // Si por lo que fuera el animal a reactivar YA estuviera en la lista de
    // activos con ese mismo número (no debería, pero la exclusión es la
    // garantía, no una suposición), no cuenta como colisión contra sí mismo.
    const colision = detectarColisionCaravana(178, ACTIVOS, 'novilla-9');
    expect(colision).toBeNull();
  });

  it('sin ningún activo con ese número, no hay colisión', () => {
    expect(detectarColisionCaravana(999, ACTIVOS, 'comina-inactiva')).toBeNull();
  });

  it('un activo sin caravana (numero null) nunca colisiona con nada', () => {
    expect(detectarColisionCaravana(null as unknown as number, ACTIVOS, 'x')).toBeNull();
  });
});
