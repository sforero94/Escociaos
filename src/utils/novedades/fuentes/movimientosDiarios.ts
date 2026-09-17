/**
 * Cargador de `movimientos_diarios` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/types/database.ts` (SÍ generado para esta
 * tabla): `created_by` existe (a diferencia de lo que dice hoy el
 * `CLAUDE.md` raíz sobre "aplicaciones y movimientos_diarios* siguen sin
 * columna de capturador" -- corrección ya señalada por el plan técnico
 * §1: la columna SÍ existe desde antes, sólo falta el trigger que la
 * llene en todos los caminos de escritura; la web sí la llena
 * (`DailyMovementForm.tsx`)). `lote_id` + `lote_nombre` (TEXT, columna
 * directa de la fila -- nombrar el lote NO es un `join`, es leer la
 * misma fila), `fecha_movimiento` (fecha del hecho), sin columna de canal.
 *
 * Grano: SESIÓN de captura -- `aguacate|movimientos_diarios|ejecucion|
 * <autorId>|<díaBogotá>`. UNA `NovedadCruda` por fila cruda; `agrupar.ts`
 * funde.
 *
 * **"N lotes" es un conteo DISTINTO de `lote_nombre`, no una suma de
 * filas.** Dos movimientos del mismo lote el mismo día no deben contar dos
 * veces. Como `lote_nombre` viaja en `objetoNombre` (es un nombre propio
 * legítimo, no una identidad opaca), la regla GENÉRICA de `agrupar.ts`
 * ("si el grupo tiene `objetoNombre`, `tamano.objetos` = conteo de
 * distintos") ya lo resuelve sin ningún truco de este cargador -- a
 * diferencia de `registrosTrabajo.ts`, que sí necesita uno porque ahí
 * `objetoNombre` se deja en `null` a propósito (nunca nombrar personas).
 */

import type { NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { diaBogota } from '@/utils/fechas';
import type { Database } from '@/types/database';

type FilaMovimientoDiario = Pick<
  Database['public']['Tables']['movimientos_diarios']['Row'],
  'id' | 'aplicacion_id' | 'lote_nombre' | 'fecha_movimiento' | 'created_at' | 'created_by'
>;

export async function cargarMovimientosDiarios(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaMovimientoDiario>((desde, hasta) =>
    supabase
      .from('movimientos_diarios')
      .select('id, aplicacion_id, lote_nombre, fecha_movimiento, created_at, created_by')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaMovimientoDiario & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      const dia = diaBogota(fila.created_at);
      return {
        fuente: 'movimientos_diarios',
        modulo: 'aguacate',
        tipoHecho: 'ejecucion',
        claveGrano: `aguacate|movimientos_diarios|ejecucion|${fila.created_by ?? 'sin-autor'}|${dia}`,
        autorId: fila.created_by,
        autorTextoLibre: null,
        canal: null, // movimientos_diarios no tiene columna de canal (§5 del plan técnico)
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha_movimiento,
        objetoNombre: fila.lote_nombre?.trim() || null,
        tamano: { filas: 1 },
        // Sin filtro por fecha/aplicación en /aplicaciones (§17.4 del plan
        // técnico) -- una sesión puede cubrir más de una aplicación, así
        // que ni siquiera hay un único `aplicacion_id` que filtrar.
        ruta: '/aplicaciones',
      };
    });

  return { crudas, truncado };
}
