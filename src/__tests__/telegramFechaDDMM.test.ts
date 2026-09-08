/**
 * Lectura de fechas del bot (incidente 2026-09-08).
 *
 * Martha registró seis eventos de corrido y cuatro quedaron corridos cuatro
 * meses: escribió mes/día («5/9» por 5 de septiembre) contra un paso que
 * pedía DD/MM. El parser no falló — resolvió en silencio un texto que se lee
 * de dos formas. Estas pruebas fijan que ya no lo resuelve solo.
 */

import { describe, it, expect } from 'vitest';
import {
  DIAS_FECHA_LEJANA,
  avisoFechaLejana,
  diasAtras,
  fechaLegible,
  leerFecha,
} from '../supabase/functions/server/telegram/fechaDDMM';

const HOY = '2026-09-08';

describe('leerFecha — el caso que costó los cuatro registros', () => {
  it('NO decide sola cuando el texto se lee de dos formas', () => {
    const r = leerFecha('5/9', HOY);
    expect(r.tipo).toBe('ambiguo');
    if (r.tipo !== 'ambiguo') return;
    expect([r.probable.iso, r.alterna.iso].sort()).toEqual(['2026-05-09', '2026-09-05']);
  });

  it('ofrece primero la lectura más cercana a hoy', () => {
    // 5 de septiembre está a 3 días; 9 de mayo, a 122.
    const r = leerFecha('5/9', HOY);
    if (r.tipo !== 'ambiguo') throw new Error('debería ser ambiguo');
    expect(r.probable.iso).toBe('2026-09-05');
    expect(r.alterna.iso).toBe('2026-05-09');
  });

  it('presenta las opciones en prosa, nunca como el texto ambiguo', () => {
    const r = leerFecha('5/9', HOY);
    if (r.tipo !== 'ambiguo') throw new Error('debería ser ambiguo');
    expect(r.probable.etiqueta).toBe('5 de septiembre 2026');
    expect(r.alterna.etiqueta).toBe('9 de mayo 2026');
    for (const o of [r.probable, r.alterna]) expect(o.etiqueta).not.toContain('/');
  });

  it.each([
    ['9/3', ['2026-03-09', '2026-09-03']],
    ['9/4', ['2026-04-09', '2026-09-04']],
    ['9/5', ['2026-05-09', '2026-09-05']],
  ])('reconoce %s como ambigua (las tres fechas del incidente)', (texto, esperadas) => {
    const r = leerFecha(texto as string, HOY);
    expect(r.tipo).toBe('ambiguo');
    if (r.tipo !== 'ambiguo') return;
    expect([r.probable.iso, r.alterna.iso].sort()).toEqual(esperadas);
  });
});

describe('leerFecha — lo que sí es inequívoco se resuelve sin preguntar', () => {
  it('un día mayor que 12 solo se lee de una forma', () => {
    const r = leerFecha('28/12', HOY);
    expect(r).toEqual({ tipo: 'unico', fecha: { iso: '2025-12-28', etiqueta: '28 de diciembre 2025' } });
  });

  it('día igual a mes no es ambiguo: las dos lecturas coinciden', () => {
    const r = leerFecha('7/7', HOY);
    expect(r.tipo).toBe('unico');
  });

  it('acepta - y . como separadores', () => {
    for (const t of ['28-12', '28.12']) {
      expect(leerFecha(t, HOY)).toEqual(leerFecha('28/12', HOY));
    }
  });

  it('rechaza un día que no existe en ese mes en vez de correrlo', () => {
    // 31/02 no es una lectura; 02/31 tampoco. Nunca debe volverse 2 de marzo.
    expect(leerFecha('31/2', HOY).tipo).toBe('invalido');
  });

  it('rechaza lo que no es una fecha', () => {
    for (const t of ['', 'hola', '5', '5/', '5/9/', '13/13', '0/9']) {
      expect(leerFecha(t, HOY).tipo).toBe('invalido');
    }
  });
});

describe('leerFecha — año explícito', () => {
  it('acepta DD/MM/AA y DD/MM/AAAA, que antes eran "formato inválido"', () => {
    // Es justo lo que el dueño reportó que Martha escribió: "5/9/26".
    for (const t of ['5/9/26', '5/9/2026']) {
      const r = leerFecha(t, HOY);
      expect(r.tipo).toBe('ambiguo');
      if (r.tipo !== 'ambiguo') continue;
      expect([r.probable.iso, r.alterna.iso].sort()).toEqual(['2026-05-09', '2026-09-05']);
    }
  });

  it('respeta el año escrito y NO lo retrocede aunque quede en el futuro', () => {
    const r = leerFecha('25/12/2026', HOY);
    expect(r).toEqual({ tipo: 'unico', fecha: { iso: '2026-12-25', etiqueta: '25 de diciembre 2026' } });
  });

  it('sin año, una fecha futura se lee como el año pasado', () => {
    const r = leerFecha('25/12', HOY);
    if (r.tipo !== 'unico') throw new Error('debería ser único');
    expect(r.fecha.iso).toBe('2025-12-25');
  });
});

describe('avisoFechaLejana', () => {
  it('avisa con los DÍAS, que es lo que choca con lo que la persona recuerda', () => {
    const aviso = avisoFechaLejana('2026-05-09', HOY);
    expect(aviso).toContain('122');
    expect(aviso).toContain('9 de mayo 2026');
  });

  it('las cuatro fechas del incidente habrían disparado el aviso', () => {
    for (const iso of ['2026-03-09', '2026-04-09', '2026-05-09']) {
      expect(avisoFechaLejana(iso, HOY)).not.toBeNull();
    }
  });

  it('no avisa por una fecha reciente', () => {
    expect(avisoFechaLejana('2026-09-05', HOY)).toBeNull();
    expect(avisoFechaLejana(HOY, HOY)).toBeNull();
  });

  it('el umbral es el declarado, no un número suelto', () => {
    expect(diasAtras('2026-05-09', HOY)).toBe(122);
    expect(DIAS_FECHA_LEJANA).toBe(45);
  });
});

describe('fechaLegible', () => {
  it('escribe el mes en letras', () => {
    expect(fechaLegible('2026-09-05')).toBe('5 de septiembre 2026');
    expect(fechaLegible('2026-01-31')).toBe('31 de enero 2026');
  });
});
