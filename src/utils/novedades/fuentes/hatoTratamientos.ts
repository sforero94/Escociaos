/**
 * Cargador de `hato_tratamientos` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/sql/migrations/055_create_hato_tratamientos.sql`
 * + `140_hato_registrar_tratamiento.sql` (columna `fuente`, tampoco en
 * `src/types/database.ts`).
 *
 * Grano: SESIÓN de captura -- `hato_lechero|hato_tratamientos|tratamiento|
 * <autorId>|<díaBogotá>`. El brief (§2.3) da el ejemplo "Martha registró 3
 * tratamientos" sin listar los animales, pero guardrail 2026-09-17
 * (Santiago): "martha vega registro un tratamiento -- ¿qué vaca?" no se
 * puede leer sola sin el animal. Mismo embed y misma fórmula de nombre que
 * `hato_eventos` (`_animalHato.ts`) -- `animal_id` es la única FK de esta
 * tabla a `hato_animales`, sin ambigüedad que desambiguar.
 */

import type { CanalNovedad, NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { diaBogota } from '@/utils/fechas';
import { animalDesdeEmbed, nombreAnimal, type AnimalEmbebido } from './_animalHato';

interface FilaHatoTratamiento {
  id: string;
  animal_id: string;
  fecha_inicio: string;
  created_at: string | null;
  created_by: string | null;
  fuente: string | null;
  hato_animales: AnimalEmbebido | AnimalEmbebido[] | null;
}

// CHECK de la 140: 'web' | 'telegram' | 'importacion' | 'chequeo' -- sin
// 'alerta' (un tratamiento nunca nace de una alerta del motor), subconjunto
// de `CanalNovedad`.
const CANALES_CONOCIDOS = new Set<CanalNovedad>(['web', 'telegram', 'importacion', 'chequeo']);

function canalDesde(valor: string | null): CanalNovedad | null {
  if (!valor) return null;
  return CANALES_CONOCIDOS.has(valor as CanalNovedad) ? (valor as CanalNovedad) : null;
}

export async function cargarHatoTratamientos(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaHatoTratamiento>((desde, hasta) =>
    supabase
      .from('hato_tratamientos')
      .select('id, animal_id, fecha_inicio, created_at, created_by, fuente, hato_animales(nombre, numero)')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaHatoTratamiento & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      const dia = diaBogota(fila.created_at);
      return {
        fuente: 'hato_tratamientos',
        modulo: 'hato_lechero',
        tipoHecho: 'tratamiento',
        claveGrano: `hato_lechero|hato_tratamientos|tratamiento|${fila.created_by ?? 'sin-autor'}|${dia}`,
        autorId: fila.created_by,
        autorTextoLibre: null,
        canal: canalDesde(fila.fuente),
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha_inicio,
        objetoNombre: nombreAnimal(animalDesdeEmbed(fila.hato_animales)),
        tamano: { filas: 1 },
        ruta: `/hato-lechero/hato/${fila.animal_id}`,
      };
    });

  return { crudas, truncado };
}
