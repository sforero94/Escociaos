/**
 * Cargador de `fin_gastos` para "Novedades" (issue #266).
 *
 * Esquema verificado contra `src/types/database.ts` (SÍ generado):
 * `created_by` (autor, migración 050), `estado` (TEXT, `'Confirmado'` es el
 * único valor que cuenta -- misma regla que el resto del sistema: reportes
 * financieros y el dashboard, ver CLAUDE.md raíz "Financial Reports"), sin
 * columna de canal.
 *
 * **El gate de Gerencia NO vive acá.** Este cargador no comprueba rol ni
 * sabe qué es `puedeAccederModulo`/Gerencia -- eso lo decide el catálogo
 * (`requiereGerencia: true` en `catalogo.ts`) y quien orqueste (F3,
 * `useNovedades.ts`), ANTES de siquiera invocar este cargador (§7 del plan
 * técnico, §12.6 del brief: el gate viaja con el dato, nunca con el
 * render, y se decide antes de consultar -- una consulta a `fin_gastos` de
 * un Administrador vuelve vacía por RLS, indistinguible de "no hubo
 * gastos"). Este archivo SIEMPRE filtra por `estado='Confirmado'`, pero
 * NUNCA decide si debe correr.
 *
 * Grano: SESIÓN de captura -- `finanzas|fin_gastos|gasto|<autorId>|
 * <díaBogotá>`.
 *
 * Guardrail 2026-09-17 (Santiago): "Consuelito registró 15 gastos" no dice
 * por cuánto -- una cifra sin su total no se lee sola. `tamano.montoTotal`
 * es la SUMA llana de `valor` (cada fila es un gasto distinto, nada que
 * deduplicar, a diferencia de `objetos`/`personas`); `agrupar.ts` la suma
 * con el mismo mecanismo genérico.
 */

import type { NovedadCruda } from '../tipos';
import type { ResultadoCargaFuente } from '../catalogo';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { diaBogota } from '@/utils/fechas';
import type { Database } from '@/types/database';

type FilaGasto = Pick<
  Database['public']['Tables']['fin_gastos']['Row'],
  'id' | 'fecha' | 'estado' | 'created_at' | 'created_by' | 'valor'
>;

export async function cargarFinGastos(supabase: any, desdeIso: string): Promise<ResultadoCargaFuente> {
  const { filas, truncado } = await fetchAll<FilaGasto>((desde, hasta) =>
    supabase
      .from('fin_gastos')
      .select('id, fecha, estado, created_at, created_by, valor')
      .eq('estado', 'Confirmado')
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(desde, hasta),
    // §8.3 del plan tecnico: 5 paginas (5.000 filas) alcanzan una ventana de 7 dias
    // incluso en un dia de carga masiva; si no bastan, `truncado` se declara, nunca se trunca en silencio.
    { maxPaginas: 5 },
  );

  const crudas: NovedadCruda[] = filas
    .filter((fila): fila is FilaGasto & { created_at: string } => fila.created_at != null)
    .map((fila) => {
      const dia = diaBogota(fila.created_at);
      return {
        fuente: 'fin_gastos',
        modulo: 'finanzas',
        tipoHecho: 'gasto',
        claveGrano: `finanzas|fin_gastos|gasto|${fila.created_by ?? 'sin-autor'}|${dia}`,
        autorId: fila.created_by,
        autorTextoLibre: null,
        canal: null, // fin_gastos no tiene columna de canal (§5 del plan técnico)
        capturadoEn: fila.created_at,
        fechaHecho: fila.fecha,
        objetoNombre: null,
        tamano: { filas: 1, montoTotal: fila.valor ?? undefined },
        // /finanzas/gastos no acepta filtro por fecha todavía (§17.4 del
        // plan técnico) -- navega sin filtro.
        ruta: '/finanzas/gastos',
      };
    });

  return { crudas, truncado };
}
