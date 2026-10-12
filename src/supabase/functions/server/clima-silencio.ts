// clima-silencio.ts — alerta «estación de clima sin datos» (ESCO-152, migración 180).
//
// La estación Ecowitt se apagó 5 veces en ~7,5 semanas. Mientras está apagada,
// `/clima/sync` responde 200 `{"message":"No data available","synced":0}` y el
// cron dice `succeeded`: nadie se entera hasta 2–4 días después, y para entonces
// el día ya se perdió (la History API tampoco lo tiene).
//
// Contrato:
//   - Silencio = la lectura más reciente de `clima_lecturas` tiene más de
//     UMBRAL_SILENCIO_MS (3 h). Decisión de Santiago, 2026-10-12.
//   - UN aviso por apagón: la clave de idempotencia es la marca de la última
//     lectura, así que el mismo apagón produce siempre la misma clave.
//   - Si `clima_lecturas` está vacía (el cron de la 036 la poda a ~24 h, así que
//     un apagón de más de un día la deja sin filas), no hay última lectura con
//     qué armar la clave: se usa la fecha de Bogotá, o sea UN recordatorio por
//     día mientras dure.
//   - Puro: sin Deno, sin red. El I/O vive en `clima.tsx` (único sitio que lee
//     `clima_lecturas` en el servidor — ver climaTablaCorrectaGuard.test.ts).
//
// Mirrored by hand into `supabase/functions/make-server-1ccce916/` —
// `arbolEdgeFunctionParidad.test.ts` covers the pair.

export const CLAVE_ALERTA_SILENCIO = 'clima.estacion_sin_datos';
export const UMBRAL_SILENCIO_MS = 3 * 60 * 60 * 1000;

export interface EvaluacionSilencio {
  enSilencio: boolean;
  /** Horas desde la última lectura, redondeadas a 1 decimal; null si no hay lecturas. */
  horasSinDatos: number | null;
  /** Clave de idempotencia para `clima_avisos`; null si no hay silencio. */
  clave: string | null;
}

function fechaBogota(d: Date): string {
  // en-CA da AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function horaBogota(d: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function evaluarSilencioEstacion(
  ultimaLecturaIso: string | null,
  ahora: Date,
  umbralMs: number = UMBRAL_SILENCIO_MS,
): EvaluacionSilencio {
  if (!ultimaLecturaIso) {
    return {
      enSilencio: true,
      horasSinDatos: null,
      clave: `estacion_sin_datos:sin_lecturas:${fechaBogota(ahora)}`,
    };
  }
  const ultima = new Date(ultimaLecturaIso);
  if (Number.isNaN(ultima.getTime())) {
    // Una marca ilegible no es evidencia de silencio: no se inventa una alerta.
    return { enSilencio: false, horasSinDatos: null, clave: null };
  }
  const transcurrido = ahora.getTime() - ultima.getTime();
  const horas = Math.round((transcurrido / 3_600_000) * 10) / 10;
  if (transcurrido <= umbralMs) {
    return { enSilencio: false, horasSinDatos: horas, clave: null };
  }
  return {
    enSilencio: true,
    horasSinDatos: horas,
    clave: `estacion_sin_datos:${ultima.toISOString()}`,
  };
}

export function construirMensajeSilencio(ultimaLecturaIso: string | null, ahora: Date): string {
  const evaluacion = evaluarSilencioEstacion(ultimaLecturaIso, ahora, 0);
  const lineas = ['⚠️ Estación de clima sin datos'];
  if (ultimaLecturaIso && evaluacion.horasSinDatos !== null) {
    lineas.push(
      `La última lectura llegó el ${horaBogota(new Date(ultimaLecturaIso))} (hora Colombia), hace ${evaluacion.horasSinDatos.toLocaleString('es-CO')} horas.`,
    );
  } else {
    lineas.push('No hay ninguna lectura en las últimas 24 horas.');
  }
  lineas.push('Revisa la luz, la batería y el wifi de la estación Ecowitt en la finca.');
  lineas.push('Si pasa un día entero sin datos, ese día se pierde: Ecowitt tampoco lo guarda.');
  return lineas.join('\n');
}
