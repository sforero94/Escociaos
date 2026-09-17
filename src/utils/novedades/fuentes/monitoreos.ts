/**
 * Cargador de `monitoreos` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/types/database.ts` (SÍ generado): `user_id`
 * (autor, migración 074 -- distinto de `monitor`, TEXT libre que es quién
 * CAMINÓ la ronda, no quién la capturó en el sistema), `ronda_id` (FK
 * nullable a `rondas_monitoreo`), `fecha_monitoreo`, sin columna de canal.
 *
 * Grano: UNIDAD del módulo -- **siempre por `ronda_id`, nunca por
 * `fecha_monitoreo`** (CLAUDE.md raíz, sección "Monitoring Module": "a
 * round can span several calendar dates depending on the lote -- always
 * group by `ronda_id`, never by `fecha_monitoreo`"). Clave:
 * `monitoreos|ronda|<ronda_id>`.
 *
 * **Filas sin `ronda_id`** (históricas, o cualquier captura que no pasó por
 * el flujo de rondas) no tienen unidad de agrupación real -- fundirlas por
 * fecha violaría la regla de arriba, y descartarlas silenciosamente
 * violaría "un hecho capturado por una persona entra al feed" (N-1). Cada
 * una se convierte en su PROPIA unidad, clave `monitoreos|fila|<id>` --
 * nunca se inventa un agrupamiento que el dato no sostiene (mismo criterio
 * que la migración 100 aplicó a los traslados de ganado sin forma
 * reconocible, citado como precedente en R8 del plan técnico).
 *
 * **"N lecturas"** = conteo de filas (`agrupar.ts` suma `tamano.filas = 1`
 * por lectura). **"monitor: Efrain"** -- `monitor` es un dato del HECHO (no
 * del capturador), así que viaja en `objetoNombre`: `agrupar.ts` lo
 * deduplica igual que un nombre de animal, y `frases.ts` lo interpreta como
 * "monitor: X" para esta fuente en particular, nunca como un objeto
 * nombrado genérico.
 */

import type { NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import type { Database } from '@/types/database';

type FilaMonitoreo = Pick<
  Database['public']['Tables']['monitoreos']['Row'],
  'id' | 'ronda_id' | 'fecha_monitoreo' | 'monitor' | 'created_at' | 'user_id'
>;

export async function cargarMonitoreos(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaMonitoreo>((desde, hasta) =>
    supabase
      .from('monitoreos')
      .select('id, ronda_id, fecha_monitoreo, monitor, created_at, user_id')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaMonitoreo & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      // Ver docstring de cabecera: sin ronda_id, cada fila es su propia
      // unidad -- nunca se agrupa por fecha_monitoreo.
      const claveGrano = fila.ronda_id ? `monitoreos|ronda|${fila.ronda_id}` : `monitoreos|fila|${fila.id}`;
      return {
        fuente: 'monitoreos',
        modulo: 'aguacate',
        tipoHecho: 'ronda',
        claveGrano,
        autorId: fila.user_id,
        autorTextoLibre: null,
        canal: null, // monitoreos no tiene columna de canal (§5 del plan técnico)
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha_monitoreo,
        objetoNombre: fila.monitor?.trim() || null,
        tamano: { filas: 1 },
        // /monitoreo no acepta filtro por ronda todavía (§17.4 del plan
        // técnico) -- navega sin filtro.
        ruta: '/monitoreo',
      };
    });

  return { crudas, truncado };
}
