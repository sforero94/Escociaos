/**
 * Cargador de `registros_trabajo` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/types/database.ts` (SÍ generado para esta
 * tabla): `registrado_por` (autor, migración 074 -- NUNCA `created_by`, que
 * no existe en esta tabla), `fraccion_jornal` (ENUM `'0.25'|'0.5'|'0.75'|
 * '1.0'`, migración 106), `empleado_id`/`contratista_id` (mutuamente
 * excluyentes), `fecha_trabajo` (fecha del HECHO, distinta de `created_at`
 * = captura), sin columna de canal.
 *
 * Grano: SESIÓN de captura -- `aguacate|registros_trabajo|jornal|<autorId>|
 * <díaBogotá>`. UNA `NovedadCruda` por fila cruda leída (mismo contrato que
 * el resto de los cargadores) -- `agrupar.ts` es quien funde las filas que
 * comparten clave, nunca este archivo.
 *
 * **"N jornales" NO es el conteo de filas.** El 12-sep, 66 filas sumaron
 * 43,5 jornales -- así que cada fila cruda lleva en `tamano.filas` su
 * PROPIA `fraccion_jornal` (no `1`), y `agrupar.ts` suma `tamano.filas` de
 * todo el grupo con su regla genérica: la suma da el total correcto de
 * jornales, no de filas.
 *
 * **"N personas" es un conteo DISTINTO, no una suma ingenua.** Una persona
 * que trabajó en dos lotes el mismo día no puede contar dos veces, y
 * `NovedadCruda` no tiene un campo de "identidad" para que un agrupador
 * genérico deduzca por su cuenta. La solución: este cargador -- que SÍ ve
 * cada fila con su `empleado_id`/`contratista_id` -- marca `tamano.objetos
 * = 1` únicamente en la PRIMERA fila de cada persona dentro de su sesión
 * (autor + día de captura), y deja `tamano.objetos` sin definir en las
 * repeticiones. La suma genérica de `agrupar.ts` sobre esa contribución
 * MARGINAL da el conteo distinto correcto, sin que el agrupador necesite
 * saber qué es una "persona" ni ver ningún id.
 *
 * **NUNCA hace `join` a `empleados`/`contratistas`** -- desde la migración
 * 123 esas tablas son Gerencia+Administrador-only por RLS, y unir contra
 * ellas levantaría un muro más para un feed que David (Administrador) debe
 * poder leer completo. `objetoNombre` no nombra personas por eso -- nombra
 * la LABOR (`tareas.nombre` vía `tarea_id`, NOT NULL, sin ambigüedad de FK).
 * `tareas` no tiene RLS de rol (no es como `contratistas`), así que unirla
 * no levanta ningún muro nuevo.
 *
 * Guardrail 2026-09-17 (Santiago): "David registró 12 jornales de 7
 * personas" no dice EN QUÉ -- la línea tiene que nombrar la labor para
 * leerse sola. `objetoNombre` = nombre de tarea resuelve eso con el mismo
 * mecanismo de `formatearListaNombres` (hasta 3 + "y N más") que ya usan
 * `hato_eventos`/`movimientos_diarios`. Por eso el conteo de personas SE
 * MUEVE de `tamano.objetos` (que ahora, con `objetoNombre` poblado, cuenta
 * labores distintas vía la regla genérica de `agrupar.ts`) a
 * `tamano.personas`, un campo aparte para que las dos cuentas no choquen.
 */

import type { NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { diaBogota } from '@/utils/fechas';
import type { Database } from '@/types/database';

type FilaRegistroTrabajo = Pick<
  Database['public']['Tables']['registros_trabajo']['Row'],
  'id' | 'fecha_trabajo' | 'fraccion_jornal' | 'empleado_id' | 'contratista_id' | 'registrado_por' | 'created_at'
> & { tareas: { nombre: string | null } | { nombre: string | null }[] | null };

function nombreTarea(embed: FilaRegistroTrabajo['tareas']): string | null {
  const fila = Array.isArray(embed) ? (embed[0] ?? null) : embed;
  return fila?.nombre?.trim() || null;
}

export async function cargarRegistrosTrabajo(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaRegistroTrabajo>((desde, hasta) =>
    supabase
      .from('registros_trabajo')
      .select('id, fecha_trabajo, fraccion_jornal, empleado_id, contratista_id, registrado_por, created_at, tareas(nombre)')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  // Personas ya contabilizadas por sesión (claveGrano) -- así la SEGUNDA
  // fila de la misma persona en la misma sesión no vuelve a sumar.
  const personasVistasPorSesion = new Map<string, Set<string>>();

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaRegistroTrabajo & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      const dia = diaBogota(fila.created_at);
      const claveGrano = `aguacate|registros_trabajo|jornal|${fila.registrado_por ?? 'sin-autor'}|${dia}`;

      const persona = fila.empleado_id ?? fila.contratista_id;
      let vistas = personasVistasPorSesion.get(claveGrano);
      if (!vistas) {
        vistas = new Set();
        personasVistasPorSesion.set(claveGrano, vistas);
      }
      const esPersonaNueva = persona != null && !vistas.has(persona);
      if (persona && esPersonaNueva) vistas.add(persona);

      return {
        fuente: 'registros_trabajo',
        modulo: 'aguacate',
        tipoHecho: 'jornal',
        claveGrano,
        autorId: fila.registrado_por,
        autorTextoLibre: null,
        canal: null, // registros_trabajo no tiene columna de canal (§5 del plan técnico)
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha_trabajo,
        objetoNombre: nombreTarea(fila.tareas),
        tamano: {
          filas: Number(fila.fraccion_jornal),
          personas: esPersonaNueva ? 1 : undefined,
        },
        ruta: '/labores',
      };
    });

  return { crudas, truncado };
}
