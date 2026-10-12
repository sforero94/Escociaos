import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLAVE_ALERTA_SILENCIO,
  UMBRAL_SILENCIO_MS,
  construirMensajeSilencio,
  evaluarSilencioEstacion,
} from '../supabase/functions/server/clima-silencio';

/**
 * ESCO-152 / migración 180: aviso por Telegram cuando la estación Ecowitt lleva
 * más de 3 h sin mandar lecturas. Un aviso por apagón.
 */

const AHORA = new Date('2026-10-09T05:00:00Z'); // 00:00 Bogotá

describe('evaluarSilencioEstacion', () => {
  it('el umbral es 3 horas', () => {
    expect(UMBRAL_SILENCIO_MS).toBe(3 * 60 * 60 * 1000);
    expect(CLAVE_ALERTA_SILENCIO).toBe('clima.estacion_sin_datos');
  });

  it('una lectura de hace 10 minutos no es silencio', () => {
    const r = evaluarSilencioEstacion('2026-10-09T04:50:00Z', AHORA);
    expect(r.enSilencio).toBe(false);
    expect(r.clave).toBeNull();
  });

  it('exactamente 3 horas todavía no dispara; un minuto más sí', () => {
    expect(evaluarSilencioEstacion('2026-10-09T02:00:00Z', AHORA).enSilencio).toBe(false);
    const r = evaluarSilencioEstacion('2026-10-09T01:59:00Z', AHORA);
    expect(r.enSilencio).toBe(true);
    expect(r.horasSinDatos).toBe(3);
  });

  it('el apagón real del 2026-10-09: misma clave en cada sync del mismo apagón', () => {
    const ultima = '2026-10-09T00:45:02Z';
    const a = evaluarSilencioEstacion(ultima, new Date('2026-10-09T03:50:00Z'));
    const b = evaluarSilencioEstacion(ultima, new Date('2026-10-10T09:00:00Z'));
    expect(a.enSilencio).toBe(true);
    expect(b.enSilencio).toBe(true);
    expect(a.clave).toBe('estacion_sin_datos:2026-10-09T00:45:02.000Z');
    expect(b.clave).toBe(a.clave);
  });

  it('dos apagones distintos producen claves distintas', () => {
    const a = evaluarSilencioEstacion('2026-10-01T05:50:00Z', new Date('2026-10-01T10:00:00Z'));
    const b = evaluarSilencioEstacion('2026-10-09T00:45:02Z', AHORA);
    expect(a.clave).not.toBe(b.clave);
  });

  it('sin ninguna lectura (tabla podada a 24 h): un recordatorio por día de Bogotá', () => {
    const r1 = evaluarSilencioEstacion(null, new Date('2026-10-10T04:59:00Z')); // 09-oct 23:59 Bogotá
    const r2 = evaluarSilencioEstacion(null, new Date('2026-10-10T05:01:00Z')); // 10-oct 00:01 Bogotá
    expect(r1.enSilencio).toBe(true);
    expect(r1.horasSinDatos).toBeNull();
    expect(r1.clave).toBe('estacion_sin_datos:sin_lecturas:2026-10-09');
    expect(r2.clave).toBe('estacion_sin_datos:sin_lecturas:2026-10-10');
  });

  it('una marca ilegible no inventa una alerta', () => {
    const r = evaluarSilencioEstacion('no-es-fecha', AHORA);
    expect(r.enSilencio).toBe(false);
    expect(r.clave).toBeNull();
  });
});

describe('construirMensajeSilencio', () => {
  it('dice cuándo llegó la última lectura en hora Colombia y cuántas horas van', () => {
    const t = construirMensajeSilencio('2026-10-09T00:45:02Z', new Date('2026-10-09T04:45:02Z'));
    expect(t).toContain('Estación de clima sin datos');
    expect(t).toContain('19:45'); // 00:45Z = 19:45 Bogotá del 8-oct
    expect(t).toContain('hace 4 horas');
    expect(t).toContain('luz, la batería y el wifi');
  });

  it('sin lecturas lo dice sin inventar una hora', () => {
    const t = construirMensajeSilencio(null, AHORA);
    expect(t).toContain('No hay ninguna lectura en las últimas 24 horas');
  });
});

describe('cableado en /clima/sync (las dos copias)', () => {
  const RAIZ = resolve(__dirname, '../..');
  const COPIAS = [
    'src/supabase/functions/server/clima.tsx',
    'supabase/functions/make-server-1ccce916/clima.tsx',
  ];

  it('handleClimaSync llama a vigilarSilencioEstacion en un finally', () => {
    for (const rel of COPIAS) {
      const fuente = readFileSync(resolve(RAIZ, rel), 'utf8');
      const inicio = fuente.indexOf('export async function handleClimaSync');
      const fin = fuente.indexOf('async function backfillUnDia', inicio);
      const sync = fuente.slice(inicio, fin);
      expect(sync, rel).toMatch(/finally \{[\s\S]*await vigilarSilencioEstacion\(\);/);
      expect(fuente, rel).toContain("from './clima-silencio.ts'");
      // Reclama en clima_avisos ANTES de enviar: un aviso por apagón.
      const vig = fuente.slice(fuente.indexOf('async function vigilarSilencioEstacion'), inicio);
      expect(vig.indexOf("from('clima_avisos')")).toBeGreaterThan(-1);
      expect(vig.indexOf("from('clima_avisos')")).toBeLessThan(vig.indexOf('enviarMensajeTelegram('));
    }
  });

  it('las dos copias de clima-silencio.ts son idénticas', () => {
    const [a, b] = [
      'src/supabase/functions/server/clima-silencio.ts',
      'supabase/functions/make-server-1ccce916/clima-silencio.ts',
    ].map((rel) => readFileSync(resolve(RAIZ, rel), 'utf8'));
    expect(a).toBe(b);
  });
});
