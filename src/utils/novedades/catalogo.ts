/**
 * Catálogo declarativo de fuentes del bloque "Novedades" (issue #266).
 *
 * Una entrada por fuente *Must* del v1 (§2.3 del brief), con el módulo que
 * la gobierna, el gate adicional de rol (hoy sólo finanzas) y una referencia
 * a su cargador (`src/utils/novedades/fuentes/*.ts`). Sumar una fuente
 * nueva es UNA ENTRADA MÁS acá -- nunca un cambio al agrupador
 * (`agrupar.ts`), que no conoce el catálogo ni ningún nombre de tabla.
 *
 * Este archivo es PURO en el sentido del plan técnico (§6): no importa
 * React ni `@/utils/supabase/client`. Los cargadores SÍ llaman a Supabase
 * -- reciben el cliente inyectado como parámetro, nunca lo resuelven ellos
 * mismos -- así que quien orqueste (F3, `useNovedades.ts`) decide de dónde
 * sale ese cliente y puede sustituirlo en una prueba.
 */

import type { FuenteNovedad, ModuloNovedad, NovedadCruda } from './tipos';

import { cargarHatoEventos } from './fuentes/hatoEventos';
import { cargarHatoPesajesLeche } from './fuentes/hatoPesajesLeche';
import { cargarHatoTratamientos } from './fuentes/hatoTratamientos';
import { cargarHatoChequeos } from './fuentes/hatoChequeos';
import { cargarRegistrosTrabajo } from './fuentes/registrosTrabajo';
import { cargarMonitoreos } from './fuentes/monitoreos';
import { cargarMovimientosDiarios } from './fuentes/movimientosDiarios';
import { cargarFinGastos } from './fuentes/finGastos';

/**
 * Resultado de un cargador de fuente. `truncado` viaja siempre -- nunca se
 * descarta en silencio -- porque es lo que enciende el "sexto estado" de la
 * pantalla (§7/§8.3 del plan técnico: `fetchAll` agotó `maxPaginas` y ese
 * módulo no publica sus cifras como totales, K-3).
 */
export interface ResultadoCargaFuente {
  crudas: NovedadCruda[];
  /** true si `fetchAll` devolvió `truncado: true` -- pueden faltar filas. */
  truncado: boolean;
}

/**
 * Firma común de todo cargador de fuente. `supabase` viaja como `any` a
 * propósito: 4 de las 8 tablas *Must* (todas las `hato_*`) no están en
 * `src/types/database.ts` (generado, desactualizado desde antes de la
 * migración 044 -- ver `src/components/hato/CLAUDE.md`), así que cada hook
 * del módulo hato ya hace `getSupabase() as any` en el sitio de la llamada.
 * Unificar la firma acá evita que el catálogo tenga que conocer 8 tipos de
 * cliente distintos; cada cargador tipa sus propias filas por dentro.
 *
 * `desdeIso` es el borde inferior de la ventana -- un `timestamptz` ISO --
 * sobre `created_at` (fecha de CAPTURA, §4.2 del brief: el feed se ordena y
 * se recorta por captura, nunca por la fecha del hecho). Quién decide la
 * ventana (7 días, D-2(a)) es `useNovedades.ts` (F3), no este archivo.
 */
export type CargadorFuente = (supabase: any, desdeIso: string) => Promise<ResultadoCargaFuente>;

export interface EntradaCatalogo {
  fuente: FuenteNovedad;
  modulo: ModuloNovedad;
  /**
   * true = además de tener el módulo, el lector debe ser Gerencia (§5 del
   * brief, §7 del plan técnico: todas las `fin_*` son Gerencia-only por
   * RLS). El gate se decide ANTES de consultar -- si este flag es true, el
   * llamador ni siquiera invoca `cargador`, porque una consulta que vuelve
   * vacía por RLS es indistinguible de "no hubo gastos" (§12.6 del brief).
   * Hoy sólo `fin_gastos` lo lleva en `true`.
   */
  requiereGerencia: boolean;
  cargador: CargadorFuente;
}

/**
 * Las 8 fuentes *Must* del v1, en el orden del catálogo del brief (§2.3).
 * El orden acá no importa para el feed (que ordena por `capturadoEn`), pero
 * sí ayuda a leer el archivo en el mismo orden que la tabla del brief.
 */
export const CATALOGO_NOVEDADES: EntradaCatalogo[] = [
  {
    fuente: 'hato_eventos',
    modulo: 'hato_lechero',
    requiereGerencia: false,
    cargador: cargarHatoEventos,
  },
  {
    fuente: 'hato_pesajes_leche',
    modulo: 'hato_lechero',
    requiereGerencia: false,
    cargador: cargarHatoPesajesLeche,
  },
  {
    fuente: 'hato_tratamientos',
    modulo: 'hato_lechero',
    requiereGerencia: false,
    cargador: cargarHatoTratamientos,
  },
  {
    fuente: 'hato_chequeos',
    modulo: 'hato_lechero',
    requiereGerencia: false,
    cargador: cargarHatoChequeos,
  },
  {
    fuente: 'registros_trabajo',
    modulo: 'aguacate',
    requiereGerencia: false,
    cargador: cargarRegistrosTrabajo,
  },
  {
    fuente: 'monitoreos',
    modulo: 'aguacate',
    requiereGerencia: false,
    cargador: cargarMonitoreos,
  },
  {
    fuente: 'movimientos_diarios',
    modulo: 'aguacate',
    requiereGerencia: false,
    cargador: cargarMovimientosDiarios,
  },
  {
    fuente: 'fin_gastos',
    modulo: 'finanzas',
    requiereGerencia: true,
    cargador: cargarFinGastos,
  },
];
