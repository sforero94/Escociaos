/**
 * Cargador de `hato_pesajes_leche` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/sql/migrations/054_create_hato_leche.sql`
 * + `061_hato_pesajes_litros_total.sql` (tampoco está en
 * `src/types/database.ts`, generado y desactualizado).
 *
 * Grano: UNIDAD del módulo (§4.1 del plan técnico), no sesión --
 * `hato_pesajes_leche|<fecha>`. Un pesaje semanal es UN día de pesaje del
 * hato entero; todas las filas de ese día se funden en una línea sin
 * importar quién las capturó. **Deliberadamente sin `autorId` en la clave**
 * -- el catálogo v1 del plan técnico (§4.1, tabla "Unidad del módulo")
 * lista `hato_pesajes_leche` ahí, no bajo "Sesión de captura"; el brief
 * (§2.3) lo describe sueltamente como "autor × fecha de pesaje", pero el
 * plan técnico es la fuente de verdad para el grano (y coincide con el
 * mandato explícito de esta tarea: "MODULE-UNIT grain keyed by the
 * pesaje's own fecha"). Consecuencia conocida: si dos autores distintos
 * capturan pesajes del MISMO día, la línea atribuye la sesión al autor de
 * la fila más reciente (criterio del agrupador) -- caso hoy inexistente en
 * producción (una sola persona pesa por día).
 *
 * El denominador ("52 de 65 vacas") se calcula UNA sola vez para todo el
 * lote leído -- nunca por fila -- con `contarVacasActivas`
 * (`@/utils/hatoAlertasTablero`), la MISMA función que ya gobierna el
 * denominador contractual del Pulso del hato. Nunca un `count` propio ni
 * `categoria === 'hato'` (§4.4 del plan técnico). Sólo se pide
 * `hato_animales` si el lote de pesajes no vino vacío -- una ventana de 7
 * días sin ningún pesaje no debe pagar esa segunda consulta (§8 del plan
 * técnico: "las consultas de segundo nivel sólo se disparan si la de
 * primer nivel trajo filas").
 */

import type { CanalNovedad, NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { contarVacasActivas } from '@/utils/hatoAlertasTablero';
import type { AnimalHatoDerivado } from '@/components/hato/hooks/useHatoAnimales';

const CANALES_CONOCIDOS = new Set<CanalNovedad>(['web', 'telegram', 'importacion', 'alerta', 'chequeo']);

/**
 * `fuente` es TEXT libre, sin CHECK -- valores reales conocidos hoy incluyen
 * 'foto' (pipeline de carga por foto, migración 146), que NO es un miembro
 * de `CanalNovedad`. Se mapean sólo los valores que SÍ son miembros del
 * tipo cerrado; cualquier otro (incluido 'foto') produce `null`, nunca una
 * etiqueta inventada (§5 del plan técnico). Ampliar `CanalNovedad` con
 * 'foto' es un cambio aditivo seguro para una sesión futura, no tomado acá
 * por disciplina de alcance de F2.
 */
function canalDesde(valor: string | null): CanalNovedad | null {
  if (!valor) return null;
  return CANALES_CONOCIDOS.has(valor as CanalNovedad) ? (valor as CanalNovedad) : null;
}

interface FilaHatoPesaje {
  id: string;
  animal_id: string;
  fecha: string;
  created_at: string | null;
  created_by: string | null;
  fuente: string | null;
}

interface FilaHatoAnimalMinima {
  etapa: string;
  estado: string;
}

export async function cargarHatoPesajesLeche(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaHatoPesaje>((desde, hasta) =>
    supabase
      .from('hato_pesajes_leche')
      .select('id, animal_id, fecha, created_at, created_by, fuente')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  if (filas.length === 0) return { crudas: [], truncado };

  // Segundo nivel -- sólo se dispara porque el primero trajo filas.
  const { data: animales, error: errorAnimales } = await supabase
    .from('hato_animales')
    .select('etapa, estado');
  if (errorAnimales) throw new Error(errorAnimales.message);

  // `contarVacasActivas` sólo lee `.etapa`/`.estadoAnimal` de cada elemento
  // -- se construye el objeto mínimo compatible y se castea, en vez de
  // arrastrar `derivarEstadoReproductivo`/`v_hato_estado_actual` (todo el
  // motor del hato) sólo para un conteo. Mismo espíritu del cast
  // `getSupabase() as any` que ya usan los hooks de este módulo.
  const minimos = ((animales ?? []) as FilaHatoAnimalMinima[]).map((a) => ({
    etapa: a.etapa,
    estadoAnimal: a.estado,
  }));
  const denominador = contarVacasActivas(minimos as unknown as AnimalHatoDerivado[]);

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaHatoPesaje & { created_at: string } => fila.created_at != null)
    .map((fila) => ({
      fuente: 'hato_pesajes_leche',
      modulo: 'hato_lechero',
      tipoHecho: 'pesaje',
      claveGrano: `hato_pesajes_leche|${fila.fecha}`,
      autorId: fila.created_by,
      autorTextoLibre: null,
      canal: canalDesde(fila.fuente),
      capturadoEn: fila.created_at,
      fechaHecho: fila.fecha,
      objetoNombre: null,
      tamano: { filas: 1, denominador },
      ruta: '/hato-lechero/produccion',
    }));

  return { crudas, truncado };
}
