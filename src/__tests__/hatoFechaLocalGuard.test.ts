// ARCHIVO: __tests__/hatoFechaLocalGuard.test.ts
// DESCRIPCIÓN: Guard estático + regresión de un bug que SÍ corrompía datos
// guardados (a diferencia del off-by-one de `format.ts`, que solo mentía al
// renderizar).
//
// `new Date().toISOString().slice(0, 10)` NO es "hoy": es la fecha UTC. En
// Bogotá (UTC-5), entre las 19:00 y la medianoche ya es el día SIGUIENTE en
// UTC. Verificado en vivo el 2026-07-28 (martes, hora local):
//
//   obtenerFechaHoy()                    -> 2026-07-28   local, correcto
//   new Date().toISOString().slice(0,10) -> 2026-07-29   UTC, mañana
//
// Como 2026-07-29 ES miércoles, `calcularFechaUltimoDiaPesaje(hoy, 3)`
// devolvía ese mismo día con `retroceso = 0`, y la grilla de pesaje ofrecía
// -- y `guardarPesajes` PERSISTÍA -- una fecha futura. Una pesada digitada un
// miércoles por la noche quedaba archivada el jueves, y con ella se corría de
// semana en el tracker y en el ranking.
//
// El helper correcto ya existía en el repo: `obtenerFechaHoy()`
// (`src/utils/fechas.ts`), que arma el string desde getFullYear/getMonth/
// getDate LOCALES. El módulo hato simplemente no lo usaba.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { obtenerFechaHoy } from '@/utils/fechas';

const RAIZ_HATO = join(process.cwd(), 'src', 'components', 'hato');

/** Patrón prohibido: tomar "hoy" del reloj en UTC. */
const PATRON_UTC_HOY = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;

/** Quita comentarios antes de buscar el patrón. Varios archivos DOCUMENTAN el
 * antipatrón en prosa ("NUNCA `new Date().toISOString().slice(0, 10)`") y esas
 * notas son justamente lo que queremos conservar -- sin este filtro el guard se
 * dispararía contra su propia explicación. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) out.push(...archivosTs(ruta));
    else if (/\.tsx?$/.test(entrada)) out.push(ruta);
  }
  return out;
}

describe('obtenerFechaHoy — contrato de fecha LOCAL', () => {
  it('devuelve el día calendario local, no el UTC', () => {
    const ahora = new Date();
    const local = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
      ahora.getDate(),
    ).padStart(2, '0')}`;
    expect(obtenerFechaHoy()).toBe(local);
  });

  it('no delega en toISOString (que devolvería el día UTC) -- caso de pared de reloj, no determinístico por sí solo', () => {
    // Este assert solo DIVERGE cuando la hora local y la UTC caen en días
    // distintos; el resto del tiempo es trivialmente cierto. Por eso el caso
    // de abajo (reloj fijo + TZ fija) es la defensa REAL de mutación -- este
    // solo documenta el porqué contra el reloj de verdad.
    const ahora = new Date();
    const local = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
      ahora.getDate(),
    ).padStart(2, '0')}`;
    if (local !== ahora.toISOString().slice(0, 10)) {
      expect(obtenerFechaHoy()).not.toBe(ahora.toISOString().slice(0, 10));
    }
    expect(obtenerFechaHoy()).toBe(local);
  });

  // ==========================================================================
  // Caso determinístico (mutation-check real): reloj del sistema Y timezone
  // del proceso FIJOS a un instante conocido de "noche en Bogotá / madrugada
  // UTC" -- reproduce EXACTAMENTE el escenario verificado en vivo (martes
  // 2026-07-28 23:30 Bogotá == miércoles 2026-07-29 04:30 UTC), sin depender
  // de la hora de pared ni de la TZ del entorno donde corre el test. Si
  // `obtenerFechaHoy()` alguna vez vuelve a delegar en
  // `toISOString().slice(0, 10)`, este caso falla SIEMPRE, no solo entre las
  // 19:00 y la medianoche.
  // ==========================================================================
  describe('caso determinístico -- reloj + TZ fijos (2026-07-28T23:30:00-05:00 Bogotá)', () => {
    const TZ_ORIGINAL = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'America/Bogota';
      vi.useFakeTimers();
      // 2026-07-28T23:30:00-05:00 (Bogotá) == 2026-07-29T04:30:00Z (UTC) --
      // el mismo instante que el dueño verificó en vivo.
      vi.setSystemTime(new Date('2026-07-28T23:30:00-05:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
      process.env.TZ = TZ_ORIGINAL;
    });

    it('obtenerFechaHoy() es el día calendario LOCAL (2026-07-28), no el UTC (2026-07-29)', () => {
      expect(obtenerFechaHoy()).toBe('2026-07-28');
    });

    it('NO coincide con new Date().toISOString().slice(0, 10) -- ese es "mañana" en UTC', () => {
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-07-29');
      expect(obtenerFechaHoy()).not.toBe(new Date().toISOString().slice(0, 10));
    });
  });
});

describe('guard estático: el módulo hato nunca toma "hoy" en UTC', () => {
  it('ningún archivo bajo src/components/hato/ usa new Date().toISOString().slice(0,10)', () => {
    const infractores = archivosTs(RAIZ_HATO).filter((ruta) =>
      PATRON_UTC_HOY.test(sinComentarios(readFileSync(ruta, 'utf-8'))),
    );

    expect(
      infractores.map((r) => r.replace(process.cwd() + '/', '')),
      'Estos archivos toman "hoy" del reloj en UTC, así que después de las 19:00 en ' +
        'Bogotá devuelven MAÑANA. Los formularios que guardan esa fecha (pesaje, venta, ' +
        'muerte, uso de pajilla) persisten un día futuro. Usa `obtenerFechaHoy()` de ' +
        '`@/utils/fechas` -- ya existe y ya es local-correcto. Si de verdad necesitas un ' +
        'instante UTC (no un día calendario), constrúyelo explícitamente desde un string ' +
        '`YYYY-MM-DDT00:00:00Z` como hace `fechaCorteTimeline` en EventoTimeline.tsx.',
    ).toEqual([]);
  });
});
