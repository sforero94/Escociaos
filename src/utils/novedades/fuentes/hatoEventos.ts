/**
 * Cargador de `hato_eventos` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/sql/migrations/053_create_hato_core.sql`
 * (la tabla no existe en `src/types/database.ts`, generado y desactualizado
 * -- ver `src/components/hato/CLAUDE.md`). `tipo` CHECK: `servicio`, `celo`,
 * `confirmacion_prenez`, `parto`, `aborto`, `secado_real`, `venta`,
 * `muerte`, `compra`, `cambio_etapa`, `rechequeo`. Este cargador NO filtra
 * por `tipo` -- toma el valor de la fila tal cual (`tipoHecho`): el brief
 * (§2.3) sólo cita 6 de los 11 como ejemplo ilustrativo, no como lista
 * cerrada, y filtrar de más violaría "el hecho vale aunque falte el
 * nombre" -- acá el hecho SÍ tiene autor y objeto, así que no hay motivo
 * para omitirlo.
 *
 * Grano: SESIÓN de captura (§4.1 del plan técnico) --
 * `hato_lechero|hato_eventos|<tipo>|<autorId>|<díaBogotá>`. Dos eventos del
 * MISMO tipo, mismo autor, mismo día Bogotá se funden en una línea (p. ej.
 * dos partos registrados por Martha el mismo día); dos autores el mismo día
 * NUNCA se funden porque `autorId` viaja dentro de la clave.
 *
 * Una fila = un evento = `tamano.filas = 1`; `agrupar.ts` suma las filas
 * que comparten clave. `objetoNombre` es el animal del evento (join simple
 * a `hato_animales` por FK, no a una tabla RLS-restringida) -- el
 * agrupador acumula hasta 3 + "y N más" (§2.4 del brief).
 */

import type { CanalNovedad, NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { diaBogota } from '@/utils/fechas';
import { animalDesdeEmbed, nombreAnimal, type AnimalEmbebido } from './_animalHato';

interface FilaHatoEvento {
  id: string;
  animal_id: string;
  tipo: string;
  fecha: string;
  created_at: string | null;
  created_by: string | null;
  fuente: string | null;
  hato_animales: AnimalEmbebido | AnimalEmbebido[] | null;
}

const CANALES_CONOCIDOS = new Set<CanalNovedad>(['web', 'telegram', 'importacion', 'alerta', 'chequeo']);

function canalDesde(valor: string | null): CanalNovedad | null {
  if (!valor) return null;
  return CANALES_CONOCIDOS.has(valor as CanalNovedad) ? (valor as CanalNovedad) : null;
}

export async function cargarHatoEventos(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaHatoEvento>((desde, hasta) =>
    supabase
      .from('hato_eventos')
      // `!animal_id` desambigua el embed: `hato_eventos` tiene DOS FK a
      // `hato_animales` (animal_id -- el sujeto -- y cria_id, para el parto).
      // Sin el hint, PostgREST responde 400 "more than one relationship was
      // found" -- verificado en vivo el 2026-09-17 contra producción.
      .select('id, animal_id, tipo, fecha, created_at, created_by, fuente, hato_animales!animal_id(nombre, numero)')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    // Una fila sin created_at es una fila que no se puede fechar de
    // captura -- no entra al feed (nunca se inventa una fecha).
    .filter((fila): fila is FilaHatoEvento & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      const dia = diaBogota(fila.created_at);
      return {
        fuente: 'hato_eventos',
        modulo: 'hato_lechero',
        tipoHecho: fila.tipo,
        claveGrano: `hato_lechero|hato_eventos|${fila.tipo}|${fila.created_by ?? 'sin-autor'}|${dia}`,
        autorId: fila.created_by,
        autorTextoLibre: null,
        canal: canalDesde(fila.fuente),
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha,
        objetoNombre: nombreAnimal(animalDesdeEmbed(fila.hato_animales)),
        tamano: { filas: 1 },
        ruta: `/hato-lechero/hato/${fila.animal_id}`,
      };
    });

  return { crudas, truncado };
}
