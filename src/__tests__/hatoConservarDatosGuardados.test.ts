// ARCHIVO: __tests__/hatoConservarDatosGuardados.test.ts
// DESCRIPCIÓN: Una celda vacía de la foto NO borra un dato ya guardado
// (bloque 6b de `hatoCorreccionChequeo.ts`). Casos reales del chequeo
// 2026-11-24: INDIA perdió fecha de servicio, toro y tipo; MAGNIFICA perdió
// PL 17 y el toro Jericó. Lo que estos tests pinean:
//   * un campo vacío toma el valor guardado y la fila queda marcada;
//   * solo un borrado explícito (`''`) deja el campo vacío, y queda auditado;
//   * un servicio que dejó de ser cierto (parto, lectura vacía, parto
//     probable vencido) NO se arrastra: se marca para que decida una persona;
//   * PL y Estado solo se conservan dentro del MISMO chequeo (otra página);
//   * una identidad dudosa (número repetido o provisional) no se toca;
//   * compuesto con el diff, el campo conservado deja de contar como cambio.

import { describe, it, expect } from 'vitest';
import {
  PREFIJO_ISSUE_CORRECCION_MANUAL,
  PREFIJO_ISSUE_DATO_CONSERVADO,
  PREFIJO_ISSUE_DATO_NO_CONSERVADO,
  conservarDatosGuardados,
  type CampoCorreccionChequeo,
} from '@/utils/hatoCorreccionChequeo';
import { construirDiffChequeo, type AnimalHatoActual, type UltimoChequeoVacaActual } from '@/utils/importHato/diffChequeo';
import type { HatoConfig } from '@/utils/calculosHato';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60,
  dias_rechequeo_due: 60,
};

const HOY = '2026-07-29';

function fila(datos: Partial<FilaChequeoNormalizada> & { fila: number; numero: number | null }): FilaChequeoNormalizada {
  return {
    archivo: 'CHEQUEO JULIO 2026.xlsx',
    hoja: 'CHEQUEO JULIO 2026',
    fila: datos.fila,
    generacionEncabezado: 3,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    chequeoFecha: datos.chequeoFecha ?? '2026-07-20',
    chequeoFechaConfianza: datos.chequeoFechaConfianza ?? 'aproximada',
    raw: {
      pl: null,
      np: null,
      ultimaCria: null,
      sx: null,
      fechaServicio: null,
      toro: null,
      estadoRegistrado: null,
      tp: null,
      estado: null,
      secar: null,
      pp: null,
      ttto: null,
      ...(datos.raw ?? {}),
    },
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechasServicio: datos.fechasServicio ?? [],
    sx: datos.sx ?? null,
    estado: datos.estado ?? 'vacio',
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    toroNombre: datos.toroNombre ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    estadoRegistrado: datos.estadoRegistrado ?? null,
    issues: datos.issues ?? [],
  };
}

function animal(datos: Partial<AnimalHatoActual> & { id: string; numero: number }): AnimalHatoActual {
  return {
    id: datos.id,
    numero: datos.numero,
    nombre: datos.nombre ?? null,
    etapa: datos.etapa ?? 'vaca',
    estado: datos.estado ?? 'activa',
  };
}

function ultimo(datos: Partial<UltimoChequeoVacaActual> & { animalId: string }): UltimoChequeoVacaActual {
  return {
    animalId: datos.animalId,
    chequeoFecha: datos.chequeoFecha ?? '2026-05-20',
    pl: datos.pl ?? null,
    numPartos: datos.numPartos ?? null,
    fechaServicio: datos.fechaServicio ?? null,
    toro: datos.toro ?? null,
    tipoServicio: datos.tipoServicio ?? null,
    fechaSecar: datos.fechaSecar ?? null,
    fechaProbableParto: datos.fechaProbableParto ?? null,
    estado: datos.estado ?? null,
  };
}

const FECHA = '2026-11-24';
const INDIA = animal({ id: 'a-india', numero: 120, nombre: 'INDIA' });
const MAGN = animal({ id: 'a-magn', numero: 103, nombre: 'MAGNIFICA' });

const motivos = (f: FilaChequeoNormalizada) => f.issues.map((i) => i.motivo);

describe('conservarDatosGuardados', () => {
  it('INDIA: conserva fecha de servicio, toro y tipo, re-deriva SECAR/PP y marca la fila', () => {
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA, estado: 'vacio' })];
    const ultimos = [
      ultimo({
        animalId: 'a-india',
        chequeoFecha: '2026-10-20',
        fechaServicio: '2026-09-15',
        toro: 'Laredo',
        tipoServicio: 'inseminacion',
      }),
    ];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG);
    expect(r.fechasServicio).toEqual(['2026-09-15']);
    expect(r.toroNombre).toBe('Laredo');
    expect(r.tipoServicio).toBe('inseminacion');
    expect(r.fechaProbableParto).toBe('2027-06-15');
    expect(r.fechaSecar).toBe('2027-04-15');
    expect(motivos(r).filter((m) => m.startsWith(PREFIJO_ISSUE_DATO_CONSERVADO))).toHaveLength(3);
    // no muta la entrada
    expect(filas[0].fechasServicio).toEqual([]);
    expect(filas[0].issues).toEqual([]);
  });

  it('INDIA compuesta con el diff: el servicio deja de contar como cambio', () => {
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA, estado: 'vacio' })];
    const ultimos = [
      ultimo({
        animalId: 'a-india',
        chequeoFecha: '2026-10-20',
        fechaServicio: '2026-09-15',
        toro: 'Laredo',
        tipoServicio: 'inseminacion',
        fechaSecar: '2027-04-15',
        fechaProbableParto: '2027-06-15',
      }),
    ];
    const antes = construirDiffChequeo(filas, [INDIA], ultimos);
    const campos = (d: typeof antes) => d.filas[0].diferencias.map((x) => x.campo);
    expect(campos(antes)).toContain('fecha de servicio');
    const despues = construirDiffChequeo(conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG), [INDIA], ultimos);
    expect(campos(despues)).not.toContain('fecha de servicio');
    expect(campos(despues)).not.toContain('toro');
    expect(despues.filas[0].issues.length).toBeGreaterThan(0);
  });

  it('MAGNIFICA, otra página del mismo chequeo: conserva PL 17 y el toro Jericó', () => {
    const filas = [
      fila({ fila: 7, numero: 103, chequeoFecha: FECHA, fechasServicio: ['2026-03-09'], estado: 'vacio' }),
    ];
    const ultimos = [
      ultimo({
        animalId: 'a-magn',
        chequeoFecha: FECHA,
        pl: 17,
        fechaServicio: '2026-03-09',
        toro: 'Jericó',
        tipoServicio: 'inseminacion',
      }),
    ];
    const [r] = conservarDatosGuardados(filas, [MAGN], ultimos, {}, CONFIG);
    expect(r.pl).toBe(17);
    expect(r.toroNombre).toBe('Jericó');
    expect(r.tipoServicio).toBe('inseminacion');
  });

  it('PL no viaja entre chequeos distintos (es la leche de ese día)', () => {
    const filas = [fila({ fila: 7, numero: 103, chequeoFecha: FECHA })];
    const ultimos = [ultimo({ animalId: 'a-magn', chequeoFecha: '2026-10-20', pl: 17 })];
    const [r] = conservarDatosGuardados(filas, [MAGN], ultimos, {}, CONFIG);
    expect(r.pl).toBeNull();
    expect(r.issues).toEqual([]);
  });

  it('un borrado explícito («Sin dato») deja el campo vacío y queda auditado', () => {
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA })];
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-09-15', toro: 'Laredo' })];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, { 4: { fechaServicio: '' } }, CONFIG);
    expect(r.fechasServicio).toEqual([]);
    expect(r.toroNombre).toBeNull();
    expect(motivos(r).some((m) => m.startsWith(`${PREFIJO_ISSUE_CORRECCION_MANUAL} [fechaServicio]`))).toBe(true);
  });

  it('no repite la auditoría si la corrección manual ya la registró', () => {
    const previa = { crudo: 'x', motivo: `${PREFIJO_ISSUE_CORRECCION_MANUAL} [toro] Toro: «Laredo» → «sin dato».` };
    const filas = [
      fila({ fila: 4, numero: 120, chequeoFecha: FECHA, fechasServicio: ['2026-09-15'], issues: [previa] }),
    ];
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-09-15', toro: 'Laredo' })];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, { 4: { toro: '' } }, CONFIG);
    expect(r.toroNombre).toBeNull();
    expect(motivos(r).filter((m) => m.includes('[toro]'))).toHaveLength(1);
  });

  it('no arrastra el servicio de una vaca que parió después de él', () => {
    const filas = [
      fila({ fila: 4, numero: 120, chequeoFecha: FECHA, raw: { ultimaCria: '01/11/2026' } as never }),
    ];
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-02-01', numPartos: 2 })];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG);
    expect(r.fechasServicio).toEqual([]);
    expect(r.numPartos).toBeNull();
    expect(motivos(r).filter((m) => m.startsWith(PREFIJO_ISSUE_DATO_NO_CONSERVADO))).toHaveLength(2);
  });

  it('no arrastra el servicio si la hoja la lee vacía', () => {
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA, estado: 'vacia_apta' })];
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-09-15', toro: 'Laredo' })];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG);
    expect(r.fechasServicio).toEqual([]);
    expect(r.toroNombre).toBeNull();
    expect(motivos(r).some((m) => m.startsWith(`${PREFIJO_ISSUE_DATO_NO_CONSERVADO} [fechaServicio]`))).toBe(true);
  });

  it('no arrastra el servicio cuyo parto probable ya pasó', () => {
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA })];
    const ultimos = [
      ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-01-10', fechaProbableParto: '2026-10-10' }),
    ];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG);
    expect(r.fechasServicio).toEqual([]);
    expect(motivos(r).some((m) => m.includes('ya pasó'))).toBe(true);
  });

  it('con un servicio NUEVO en la hoja no conserva toro, tipo ni estado viejos', () => {
    const filas = [fila({ fila: 7, numero: 103, chequeoFecha: FECHA, fechasServicio: ['2026-11-10'] })];
    const ultimos = [
      ultimo({ animalId: 'a-magn', chequeoFecha: FECHA, fechaServicio: '2026-03-09', toro: 'Jericó', estado: 'vacia_apta' }),
    ];
    const [r] = conservarDatosGuardados(filas, [MAGN], ultimos, {}, CONFIG);
    expect(r.toroNombre).toBeNull();
    expect(r.estado).toBe('vacio');
  });

  it('conserva el estado solo dentro del mismo chequeo', () => {
    const mismo = conservarDatosGuardados(
      [fila({ fila: 7, numero: 103, chequeoFecha: FECHA })],
      [MAGN],
      [ultimo({ animalId: 'a-magn', chequeoFecha: FECHA, estado: 'vacia_problema' })],
      {},
      CONFIG,
    );
    expect(mismo[0].estado).toBe('vacia_problema');
    const otro = conservarDatosGuardados(
      [fila({ fila: 7, numero: 103, chequeoFecha: FECHA })],
      [MAGN],
      [ultimo({ animalId: 'a-magn', chequeoFecha: '2026-10-20', estado: 'vacia_problema' })],
      {},
      CONFIG,
    );
    expect(otro[0].estado).toBe('vacio');
  });

  it('no toca filas con número repetido, provisional, desconocido o con chequeo guardado posterior', () => {
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-09-15' })];
    const repetidas = conservarDatosGuardados(
      [fila({ fila: 4, numero: 120, chequeoFecha: FECHA }), fila({ fila: 5, numero: 120, chequeoFecha: FECHA })],
      [INDIA],
      ultimos,
      {},
      CONFIG,
    );
    expect(repetidas.every((f) => f.fechasServicio.length === 0)).toBe(true);
    const provisional = conservarDatosGuardados(
      [fila({ fila: 4, numero: 950, chequeoFecha: FECHA })],
      [animal({ id: 'a-india', numero: 950 })],
      ultimos,
      {},
      CONFIG,
    );
    expect(provisional[0].fechasServicio).toEqual([]);
    const desconocido = conservarDatosGuardados([fila({ fila: 4, numero: 777, chequeoFecha: FECHA })], [INDIA], ultimos, {}, CONFIG);
    expect(desconocido[0].fechasServicio).toEqual([]);
    const posterior = conservarDatosGuardados(
      [fila({ fila: 4, numero: 120, chequeoFecha: '2026-10-01' })],
      [INDIA],
      ultimos,
      {},
      CONFIG,
    );
    expect(posterior[0].fechasServicio).toEqual([]);
  });

  it('dice que la letra era dudosa cuando el OCR marcó la celda', () => {
    const dudosas = new Map<number, Set<CampoCorreccionChequeo>>([[4, new Set(['toro', 'tipoServicio'])]]);
    const filas = [fila({ fila: 4, numero: 120, chequeoFecha: FECHA, fechasServicio: ['2026-09-15'] })];
    const ultimos = [ultimo({ animalId: 'a-india', chequeoFecha: '2026-10-20', fechaServicio: '2026-09-15', toro: 'Laredo' })];
    const [r] = conservarDatosGuardados(filas, [INDIA], ultimos, {}, CONFIG, dudosas);
    expect(motivos(r).find((m) => m.includes('[toro]'))).toMatch(/letra dudosa/);
  });
});
