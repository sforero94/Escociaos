// ARCHIVO: components/inventory/rondas/hooks/useRondaDetalle.ts
// DESCRIPCIÓN: Detalle de UNA ronda de inventario (`/inventario/rondas/:id`,
// C-3 del brief de producto). Sólo lectura -- ningún RPC de escritura se
// llama desde este módulo. Trae, en una sola carga: la cabecera de la
// ronda, su alcance congelado (R-5), sus excepciones con la trazabilidad
// completa que R-8/CA-12 exige, el catálogo de causa raíz (para traducir
// `clave` -> `etiqueta`), y los nombres de los actores involucrados
// (usuario web O usuario de Telegram -- D-T4 del brief técnico: nunca
// ambos con sentido a la vez).

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import type {
  InventarioCausaRaizRow,
  RondaExcepcionRow,
  RondaInventarioAlcanceRow,
  RondaInventarioRow,
} from '@/types/rondaInventario';

export interface RondaDetalleData {
  ronda: RondaInventarioRow;
  alcance: RondaInventarioAlcanceRow[];
  excepciones: RondaExcepcionRow[];
  causas: InventarioCausaRaizRow[];
  usuariosPorId: Map<string, string>;
  telegramPorId: Map<string, string>;
  /**
   * Nombre + unidad de un producto por `producto_id`, para las excepciones.
   * Se completa primero desde `alcance` (denormalizado, R-5 -- lo que Uriel
   * vio en campo, no un rename posterior); un `producto_id` que no esté en
   * el alcance congelado (CA-4: Uriel puede reportar un producto en cero
   * aunque no entre solo) se resuelve con una consulta de respaldo a
   * `productos`.
   */
  productosPorId: Map<string, { nombre: string; unidad: string }>;
  /**
   * Total de productos activos HOY en el catálogo -- se usa sólo para
   * dimensionar aproximadamente "cuántos quedan fuera del alcance" (R-3/
   * CA-16). `null` si la consulta falla: la pantalla muestra "—" en vez de
   * asumir un número, nunca 0.
   */
  totalProductosActivos: number | null;
}

export function useRondaDetalle(rondaId: string | undefined) {
  const [detalle, setDetalle] = useState<RondaDetalleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!rondaId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabase() as any;

      const [
        { data: ronda, error: rondaError },
        { data: alcance, error: alcanceError },
        { data: excepciones, error: excepcionesError },
        { data: causas, error: causasError },
        { count: totalProductosActivos, error: productosError },
      ] = await Promise.all([
        supabase.from('rondas_inventario').select('*').eq('id', rondaId).maybeSingle(),
        supabase.from('rondas_inventario_alcance').select('*').eq('ronda_id', rondaId),
        supabase
          .from('rondas_excepciones')
          .select('*')
          .eq('ronda_id', rondaId)
          .order('reportada_en', { ascending: true }),
        supabase.from('inventario_causas_raiz').select('*').order('orden', { ascending: true }),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      ]);

      if (rondaError) throw rondaError;
      if (!ronda) throw new Error('No se encontró la ronda de inventario solicitada.');
      if (alcanceError) throw alcanceError;
      if (excepcionesError) throw excepcionesError;
      if (causasError) throw causasError;
      // `productosError` se ignora a propósito: es un dato secundario
      // (dimensiona "fuera de alcance" de forma aproximada) -- no debe
      // tumbar toda la pantalla si falla. Se refleja como `null` abajo.

      const excepcionesRows = (excepciones ?? []) as RondaExcepcionRow[];

      const idsUsuario = new Set<string>();
      const idsTelegram = new Set<string>();
      const registrarActor = (usuarioId: string | null, telegramId: string | null) => {
        if (usuarioId) idsUsuario.add(usuarioId);
        if (telegramId) idsTelegram.add(telegramId);
      };
      registrarActor(ronda.abierta_por_usuario, ronda.abierta_por_telegram);
      registrarActor(ronda.cerrada_por_usuario, ronda.cerrada_por_telegram);
      for (const e of excepcionesRows) {
        registrarActor(e.reportada_por_usuario, e.reportada_por_telegram);
        registrarActor(e.explicacion_david_usuario, e.explicacion_david_telegram);
        registrarActor(e.captura_por_usuario, e.captura_por_telegram);
        registrarActor(e.propuesta_por_usuario, e.propuesta_por_telegram);
        registrarActor(e.decision_por_usuario, e.decision_por_telegram);
        registrarActor(e.aplicacion_por_usuario, e.aplicacion_por_telegram);
      }

      const usuariosPorId = new Map<string, string>();
      if (idsUsuario.size > 0) {
        const { data: usuarios } = await supabase
          .from('usuarios')
          .select('id, nombre_completo, email')
          .in('id', Array.from(idsUsuario));
        for (const u of usuarios ?? []) {
          usuariosPorId.set(u.id, u.nombre_completo || u.email);
        }
      }

      const telegramPorId = new Map<string, string>();
      if (idsTelegram.size > 0) {
        const { data: telegramUsuarios } = await supabase
          .from('telegram_usuarios')
          .select('id, nombre_display')
          .in('id', Array.from(idsTelegram));
        for (const t of telegramUsuarios ?? []) {
          telegramPorId.set(t.id, t.nombre_display);
        }
      }

      const alcanceRows = (alcance ?? []) as RondaInventarioAlcanceRow[];
      const productosPorId = new Map<string, { nombre: string; unidad: string }>();
      for (const fila of alcanceRows) {
        productosPorId.set(fila.producto_id, { nombre: fila.nombre_producto, unidad: fila.unidad });
      }
      // CA-4: Uriel puede reportar un producto que no entró solo al alcance
      // (existencia = 0 al abrir). Su producto_id no está en `alcance` --
      // se resuelve con una consulta de respaldo, sólo para los que falten.
      const idsProductoFaltantes = Array.from(
        new Set(excepcionesRows.map((e) => e.producto_id).filter((id) => !productosPorId.has(id))),
      );
      if (idsProductoFaltantes.length > 0) {
        const { data: productosFaltantes } = await supabase
          .from('productos')
          .select('id, nombre, unidad_medida')
          .in('id', idsProductoFaltantes);
        for (const p of productosFaltantes ?? []) {
          productosPorId.set(p.id, { nombre: p.nombre, unidad: p.unidad_medida });
        }
      }

      setDetalle({
        ronda: ronda as RondaInventarioRow,
        alcance: alcanceRows,
        excepciones: excepcionesRows,
        causas: (causas ?? []) as InventarioCausaRaizRow[],
        usuariosPorId,
        telegramPorId,
        productosPorId,
        totalProductosActivos: productosError ? null : (totalProductosActivos ?? null),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido cargando la ronda de inventario.');
      setDetalle(null);
    } finally {
      setLoading(false);
    }
  }, [rondaId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { detalle, loading, error, reload };
}
