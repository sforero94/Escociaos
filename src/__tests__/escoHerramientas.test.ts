import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  ETIQUETAS_HERRAMIENTAS,
  detalleArgumentos,
  etiquetaHerramienta,
  formatearDuracion,
  resumenTraza,
} from '@/utils/escoHerramientas';

const CHAT_TSX = resolve(__dirname, '../supabase/functions/server/chat.tsx');

/**
 * Nombres de herramienta declarados de verdad en el edge function.
 *
 * Se leen del `switch` de `executeTool`, que es el único lugar donde una
 * herramienta se vuelve ejecutable: si no tiene `case`, el modelo puede pedirla
 * pero nunca corre. Leer del archivo y no de una lista copiada es lo que hace
 * que esta prueba detecte la deriva en vez de repetirla.
 */
function herramientasDelServidor(): string[] {
  const src = readFileSync(CHAT_TSX, 'utf8');
  const cuerpo = src.slice(src.indexOf('async function executeTool'));
  const fin = cuerpo.indexOf('\n}');
  return [...cuerpo.slice(0, fin).matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
}

describe('escoHerramientas — paridad con el edge function', () => {
  it('encuentra las herramientas en el servidor (si esto falla, el parser quedó obsoleto)', () => {
    expect(herramientasDelServidor().length).toBeGreaterThanOrEqual(30);
  });

  it('toda herramienta ejecutable tiene etiqueta en español', () => {
    const sinEtiqueta = herramientasDelServidor().filter((t) => !ETIQUETAS_HERRAMIENTAS[t]);
    expect(sinEtiqueta).toEqual([]);
  });

  it('no hay etiquetas para herramientas que ya no existen', () => {
    const reales = new Set(herramientasDelServidor());
    const huerfanas = Object.keys(ETIQUETAS_HERRAMIENTAS).filter((t) => !reales.has(t));
    expect(huerfanas).toEqual([]);
  });

  it('ninguna etiqueta se repite — dos fuentes distintas no pueden leerse igual en la traza', () => {
    const vistas = Object.values(ETIQUETAS_HERRAMIENTAS);
    expect(new Set(vistas).size).toBe(vistas.length);
  });
});

describe('etiquetaHerramienta', () => {
  it('traduce una herramienta conocida', () => {
    expect(etiquetaHerramienta('get_labor_summary')).toBe('Jornales y mano de obra');
  });

  it('degrada legible ante una herramienta nueva sin registrar', () => {
    expect(etiquetaHerramienta('get_algo_nuevo')).toBe('algo nuevo');
  });
});

describe('detalleArgumentos — rangos de fecha', () => {
  it('comprime un rango dentro del mismo año', () => {
    expect(detalleArgumentos({ date_from: '2026-05-16', date_to: '2026-08-16' })).toBe('may–ago 2026');
  });

  it('colapsa un rango de un solo mes', () => {
    expect(detalleArgumentos({ date_from: '2026-08-01', date_to: '2026-08-31' })).toBe('ago 2026');
  });

  it('conserva ambos años cuando el rango los cruza', () => {
    expect(detalleArgumentos({ date_from: '2025-11-01', date_to: '2026-04-30' })).toBe(
      'nov 2025 – abr 2026',
    );
  });

  it('maneja un rango abierto por un extremo', () => {
    expect(detalleArgumentos({ date_from: '2026-03-09' })).toBe('desde 9 mar 2026');
    expect(detalleArgumentos({ date_to: '2026-03-09' })).toBe('hasta 9 mar 2026');
  });

  /**
   * Regresión: `new Date('2026-05-01')` es medianoche UTC, que en Bogotá (UTC-5) cae
   * el 30 de abril a las 19:00 — `getMonth()` habría devuelto abril. Es la misma
   * trampa que documenta el CLAUDE.md para `obtenerFechaHoy()`, mirando al revés.
   */
  it('lee el primer día del mes sin correrse al mes anterior por UTC', () => {
    expect(detalleArgumentos({ date_from: '2026-05-01', date_to: '2026-05-31' })).toBe('may 2026');
    expect(detalleArgumentos({ date_from: '2026-01-01', date_to: '2026-01-31' })).toBe('ene 2026');
  });

  it('ignora una fecha con formato inválido', () => {
    expect(detalleArgumentos({ date_from: 'hace tres meses' })).toBeNull();
    expect(detalleArgumentos({ date_from: '2026-13-01' })).toBeNull();
  });
});

describe('detalleArgumentos — otros argumentos', () => {
  it('prefiere el rango de fechas sobre cualquier otro argumento', () => {
    expect(detalleArgumentos({ lote_name: 'Lote 7', date_from: '2026-08-01', date_to: '2026-08-31' })).toBe(
      'ago 2026',
    );
  });

  it('cae al primer argumento con significado', () => {
    expect(detalleArgumentos({ limit: 2000, lote_name: 'Lote 7' })).toBe('Lote 7');
  });

  it('no muestra plomería como detalle', () => {
    expect(detalleArgumentos({ limit: 2000, include_config: true })).toBeNull();
  });

  it('recorta un valor largo en vez de romper el chip', () => {
    const detalle = detalleArgumentos({ search_term: 'a'.repeat(60) });
    expect(detalle).toHaveLength(28);
    expect(detalle?.endsWith('…')).toBe(true);
  });

  it('devuelve null sin argumentos', () => {
    expect(detalleArgumentos(undefined)).toBeNull();
    expect(detalleArgumentos({})).toBeNull();
  });
});

describe('formatearDuracion', () => {
  it('usa milisegundos por debajo del segundo', () => {
    expect(formatearDuracion(340)).toBe('340 ms');
  });

  it('usa segundos con coma decimal colombiana', () => {
    expect(formatearDuracion(4200)).toBe('4,2 s');
    expect(formatearDuracion(24_100)).toBe('24,1 s');
  });
});

describe('resumenTraza', () => {
  it('concuerda el singular', () => {
    expect(resumenTraza([{ ms: 1200 }])).toBe('Consulté 1 fuente · 1,2 s');
  });

  it('suma las duraciones de todas las fuentes', () => {
    expect(resumenTraza([{ ms: 1200 }, { ms: 800 }, { ms: 2000 }])).toBe('Consulté 3 fuentes · 4,0 s');
  });

  it('omite el total cuando ninguna fuente reportó duración', () => {
    expect(resumenTraza([{}, {}])).toBe('Consulté 2 fuentes');
  });
});
