import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Un día que FALLA en el reintento diario del clima (migración 121) tiene que
 * dejar su propia línea en los logs de la edge function.
 *
 * Qué pasó, con fechas y números de producción:
 *
 *  - **2026-08-28 no tiene fila en `clima_resumen_diario`.** Sus vecinos sí
 *    (08-27 con 349 lecturas, 08-29 con 311), así que no es una caída de varios
 *    días: es exactamente uno.
 *  - El cron `clima-reintento-sin-dato` (jobid 8) corrió los días 08-29, 08-30,
 *    08-31, 09-01, 09-02, 09-03 y 09-04, las siete veces `succeeded`, y el día
 *    sigue sin fila.
 *  - El log de la corrida del 2026-09-04 11:00 UTC lista **4 candidatos**:
 *    `2026-08-28, 2026-08-27, 2026-08-20, 2026-08-19`. Tres de los cuatro dejan
 *    línea propia (`2026-08-19: 105 lecturas reagregadas`, `2026-08-20: 32
 *    lecturas reagregadas`, `2026-08-27: … se deja intacta`). **El 2026-08-28
 *    no aparece en ninguna línea.** El resumen dice `0/4 día(s) resuelto(s) a
 *    'ok' en esta corrida, 1 dejado(s) intacto(s) por cobertura menor`: tres
 *    días quedan explicados y el cuarto se evapora.
 *
 * Mecanismo: el bucle de candidatos mete `r.error` en el array `resultados` del
 * cuerpo de la respuesta HTTP y no lo escribe a la consola. Ese cuerpo no llega
 * a ningún lado — `pg_net` corta a los 5.000 ms y guarda `content = NULL`
 * (verificado en `net._http_response` id 48883, 2026-09-04 11:00:00 UTC), y
 * `pg_cron` igual reporta `succeeded` porque sólo registra que encoló.
 *
 * Consecuencia, y es la que importa: desde fuera **no se distingue «Ecowitt
 * tampoco tiene el día» de «la llamada dio error»**. Un día irrecuperable y un
 * día que nadie intentó se ven idénticos, indefinidamente.
 *
 * El bucle del backfill MANUAL (`/clima/backfill`) sí registra cada fallo con
 * `console.warn(\`${'${log}'} ${'${dateStr}'}: ${'${resultado.error}'}\`)`. Esta prueba exige la
 * misma simetría en el camino automático, que es el único que corre solo.
 *
 * Es una guarda ESTÁTICA porque el endpoint vive del lado de Deno: montarlo en
 * Vitest exigiría simular Hono, `Deno.env` y cuatro `fetch` distintos para
 * comprobar una línea de log. La misma decisión que ya tomaron
 * `climaTablaCorrectaGuard`, `climaFrescuraGuard` y `climaReintentoNoEmpeora`.
 */

const RAIZ = resolve(__dirname, '..', '..');
const COPIAS_CLIMA = [
  'src/supabase/functions/server/clima.tsx',
  'supabase/functions/make-server-1ccce916/clima.tsx',
];

function leer(rel: string): string {
  return readFileSync(resolve(RAIZ, rel), 'utf-8');
}

/**
 * El cuerpo del bucle de candidatos: desde la llamada a `backfillUnDia` hasta
 * el `resultados.push(` que la sigue. Acotarlo importa — el fichero tiene otros
 * `console.error`, y ninguno de ellos habla de un día candidato.
 */
function cuerpoDelBucleDeCandidatos(src: string, rel: string): string {
  const iLlamada = src.indexOf('const r = await backfillUnDia(');
  expect(iLlamada, `${rel}: no se encontró el bucle de candidatos del reintento`).toBeGreaterThan(-1);
  const iPush = src.indexOf('resultados.push(', iLlamada);
  expect(iPush, `${rel}: no se encontró el push de resultados`).toBeGreaterThan(iLlamada);
  return src.slice(iLlamada, iPush);
}

describe('clima.tsx — un día que falla en el reintento deja rastro en los logs', () => {
  it('el bucle de candidatos registra el fallo en la consola, no sólo en el cuerpo de la respuesta', () => {
    for (const rel of COPIAS_CLIMA) {
      const bloque = cuerpoDelBucleDeCandidatos(leer(rel), rel);
      expect(
        bloque,
        `${rel}: un día con r.ok === false no escribe nada a la consola; el error muere en el cuerpo HTTP que pg_net descarta`,
      ).toMatch(/if\s*\(!r\.ok\)[\s\S]*console\.(error|warn)/);
    }
  });

  it('la línea nombra el día que falló, para poder distinguirlo de los demás candidatos', () => {
    for (const rel of COPIAS_CLIMA) {
      const bloque = cuerpoDelBucleDeCandidatos(leer(rel), rel);
      expect(
        bloque,
        `${rel}: la línea de fallo no incluye la fecha del candidato`,
      ).toContain('formatEcowittDate(dia.fecha)');
    }
  });

  it('la línea incluye el motivo que devolvió `backfillUnDia`', () => {
    for (const rel of COPIAS_CLIMA) {
      const bloque = cuerpoDelBucleDeCandidatos(leer(rel), rel);
      const conLog = bloque.slice(bloque.search(/console\.(error|warn)/));
      expect(
        conLog,
        `${rel}: la línea de fallo no dice por qué falló (r.error)`,
      ).toContain('r.error');
    }
  });

  it('la línea lleva el prefijo `${log}`, así que sale junto a las demás del reintento', () => {
    for (const rel of COPIAS_CLIMA) {
      const bloque = cuerpoDelBucleDeCandidatos(leer(rel), rel);
      const conLog = bloque.slice(bloque.search(/console\.(error|warn)/));
      expect(conLog, `${rel}: la línea de fallo no lleva el prefijo del endpoint`).toContain('${log}');
    }
  });

  it('las dos copias del árbol de edge function siguen idénticas', () => {
    expect(leer(COPIAS_CLIMA[0])).toBe(leer(COPIAS_CLIMA[1]));
  });
});
