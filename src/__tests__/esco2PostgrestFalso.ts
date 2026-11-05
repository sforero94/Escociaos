// Cliente PostgREST falso para pruebas de Esco 2.0. Datos sintéticos en memoria.
// Imita lo que importa para la lectura: filtros eq/gte/lte, orden, rango, conteo exacto
// y el tope silencioso de filas por respuesta (`maxFilas`), que es el defecto que la
// fuente paginada tiene que detectar.

import type { ClienteDatos, FiltroPostgrest, RespuestaPostgrest } from '../utils/esco2/fuente.ts';

export interface OpcionesFalso {
  /** Tope de filas por respuesta, como `max-rows` de PostgREST. */
  maxFilas?: number;
  /** Si es true, la primera página no trae conteo. */
  sinConteo?: boolean;
  /** Total de filas que el servidor entrega antes de devolver vacío (simula filas perdidas). */
  limiteTotal?: number;
  /** Error forzado por tabla. */
  errores?: Record<string, string>;
}

export interface Llamada {
  tabla: string;
  columnas: string;
  rango: [number, number] | null;
}

export function clientePostgrestFalso(tablas: Record<string, Record<string, unknown>[]>, op: OpcionesFalso = {}): ClienteDatos & { llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  const entregadas: Record<string, number> = {};
  const cliente = {
    llamadas,
    from(tabla: string) {
      return {
        select(columnas: string, opciones?: { count?: 'exact' }): FiltroPostgrest {
          const filtros: Array<(f: Record<string, unknown>) => boolean> = [];
          let orden: string | null = null;
          let rango: [number, number] | null = null;
          const q: FiltroPostgrest = {
            eq(c, v) {
              filtros.push((f) => f[c] === v);
              return q;
            },
            gte(c, v) {
              filtros.push((f) => String(f[c]) >= v);
              return q;
            },
            lte(c, v) {
              filtros.push((f) => String(f[c]) <= v);
              return q;
            },
            in(c, vs) {
              filtros.push((f) => vs.includes(f[c] as string));
              return q;
            },
            order(c) {
              orden = c;
              return q;
            },
            range(a, b) {
              rango = [a, b];
              return q;
            },
            then(resolver, rechazar) {
              llamadas.push({ tabla, columnas, rango });
              let r: RespuestaPostgrest;
              if (op.errores?.[tabla]) r = { data: null, error: { message: op.errores[tabla] }, count: null };
              else {
                const cols = columnas.split(',');
                let filas = (tablas[tabla] ?? []).filter((f) => filtros.every((fn) => fn(f)));
                if (orden) filas = [...filas].sort((x, y) => String(x[orden!]).localeCompare(String(y[orden!])));
                const total = filas.length;
                if (rango) filas = filas.slice(rango[0], rango[1] + 1);
                if (op.maxFilas !== undefined) filas = filas.slice(0, op.maxFilas);
                if (op.limiteTotal !== undefined) filas = filas.slice(0, Math.max(0, op.limiteTotal - (entregadas[tabla] ?? 0)));
                entregadas[tabla] = (entregadas[tabla] ?? 0) + filas.length;
                const proyectadas = filas.map((f) => Object.fromEntries(cols.map((c) => [c, f[c] ?? null])));
                r = { data: proyectadas, error: null, count: opciones?.count === 'exact' && !op.sinConteo ? total : null };
              }
              return Promise.resolve(r).then(resolver, rechazar);
            },
          };
          return q;
        },
      };
    },
  };
  return cliente;
}
