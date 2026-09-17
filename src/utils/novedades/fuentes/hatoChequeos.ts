/**
 * Cargador de `hato_chequeos` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/sql/migrations/053_create_hato_core.sql`
 * (tampoco en `src/types/database.ts`).
 *
 * Grano: UNIDAD del módulo -- un chequeo ES la unidad, `hato_chequeos|<id>`.
 * Cada fila de esta tabla ya es UN chequeo (la cabecera de la ronda
 * veterinaria); no hace falta fundir nada, así que `agrupar.ts` recibe una
 * `NovedadCruda` por chequeo y no tiene trabajo de fusión que hacer acá
 * (sigue siendo el único responsable de agrupar -- para esta fuente el
 * resultado es un grupo de 1).
 *
 * El conteo de vacas ("35 vacas") sale del embed `hato_chequeo_vacas(count)`
 * -- mismo patrón ya usado por `useHatoChequeos.ts` -- NUNCA una segunda
 * consulta (§4.4 del plan técnico: "ninguna cifra se recalcula acá").
 */

import type { CanalNovedad, NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';

interface FilaHatoChequeo {
  id: string;
  fecha: string;
  created_at: string | null;
  created_by: string | null;
  fuente: string | null;
  hato_chequeo_vacas: { count: number }[] | { count: number } | null;
}

// CHECK de la 053: 'web' | 'importacion' -- subconjunto de `CanalNovedad`.
const CANALES_CONOCIDOS = new Set<CanalNovedad>(['web', 'importacion']);

function canalDesde(valor: string | null): CanalNovedad | null {
  if (!valor) return null;
  return CANALES_CONOCIDOS.has(valor as CanalNovedad) ? (valor as CanalNovedad) : null;
}

function totalVacas(embed: FilaHatoChequeo['hato_chequeo_vacas']): number {
  const conteo = Array.isArray(embed) ? embed[0] : embed;
  return conteo?.count ?? 0;
}

export async function cargarHatoChequeos(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaHatoChequeo>((desde, hasta) =>
    supabase
      .from('hato_chequeos')
      .select('id, fecha, created_at, created_by, fuente, hato_chequeo_vacas(count)')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaHatoChequeo & { created_at: string } => fila.created_at != null)
    .map((fila) => ({
      fuente: 'hato_chequeos',
      modulo: 'hato_lechero',
      tipoHecho: 'chequeo',
      claveGrano: `hato_chequeos|${fila.id}`,
      autorId: fila.created_by,
      autorTextoLibre: null,
      canal: canalDesde(fila.fuente),
      capturadoEn: fila.created_at,
      fechaHecho: fila.fecha,
      objetoNombre: null,
      tamano: { filas: totalVacas(fila.hato_chequeo_vacas) },
      ruta: `/hato-lechero/chequeos/${fila.id}`,
    }));

  return { crudas, truncado };
}
