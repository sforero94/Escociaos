/**
 * Hook que carga los datos necesarios para el motor de costo/kg y
 * delega todos los cálculos a `src/utils/calculosCostoKg.ts`.
 *
 * Fuentes de datos:
 *   - Labor directa  : registros_trabajo (lote_id, fraccion_jornal, costo_jornal)
 *   - Insumos        : movimientos_diarios (lote_id) ⋈ movimientos_diarios_productos
 *                      (cantidad_utilizada, unidad) ⋈ productos (precio_unitario)
 *   - Overhead       : fin_gastos (estado='Confirmado', negocio 'Aguacate Hass',
 *                      fecha del año) ⋈ fin_categorias_gastos (nombre)
 *   - Árboles por lote: lotes (id, nombre, total_arboles)
 *   - Producción     : produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales)
 *                      Consolidado: si existe registro nivel-lote (sublote_id IS NULL)
 *                      para (lote_id, cosecha_tipo), se usa ese; de lo contrario
 *                      se suman sublotes para evitar doble conteo.
 *
 * NO modifica useProduccionData.ts.
 */

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  calcularCostoKgAnual,
  CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT,
  ANO_MIN_LOTE,
} from '@/utils/calculosCostoKg';
import type {
  CostoKgFarmFallback,
  CostoKgResult,
  CostoLoteAnual,
  InsumoLoteAnual,
  LaborLoteAnual,
  LoteInfoCosto,
  OverheadFarmaAnual,
  CosechaTipo,
  ParametrosCostoKg,
} from '@/types/produccion';

// ---------------------------------------------------------------------------
// Tipos de retorno del hook
// ---------------------------------------------------------------------------

export interface DatosCostoKg {
  resultados: CostoKgResult[];
  overheadFarm: OverheadFarmaAnual;
  costosLote: CostoLoteAnual[];
  fallback?: CostoKgFarmFallback;
}

export interface UseCostoKgReturn {
  loading: boolean;
  error: string | null;
  /**
   * Calcula costo/kg para el año dado.
   * Para años >= ANO_MIN_LOTE retorna desglose por lote.
   * Para años anteriores retorna `fallback` (nivel finca).
   */
  calcular: (params: ParametrosCostoKg) => Promise<DatosCostoKg>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCostoKg(): UseCostoKgReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calcular = useCallback(async (params: ParametrosCostoKg): Promise<DatosCostoKg> => {
    const { ano, categoriasExcluidas = CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT } = params;
    const supabase = getSupabase();

    setLoading(true);
    setError(null);

    try {
      // ------------------------------------------------------------------
      // 1. Lotes con total_arboles (generado en DB)
      // ------------------------------------------------------------------
      const { data: lotesData, error: lotesErr } = await supabase
        .from('lotes')
        .select('id, nombre, total_arboles')
        .eq('activo', true)
        .order('numero_orden', { ascending: true });

      if (lotesErr) throw new Error(`Lotes: ${lotesErr.message}`);

      const lotes: LoteInfoCosto[] = (lotesData ?? []).map((l: {
        id: string;
        nombre: string;
        total_arboles: number | null;
      }) => ({
        id: l.id,
        nombre: l.nombre,
        total_arboles: l.total_arboles ?? 0,
      }));

      // ------------------------------------------------------------------
      // 2. Labor directa: registros_trabajo con lote_id asignado, año dado
      //    costo_jornal ya incorpora salario + prestaciones + auxilios / jornal
      //    (calculado por trigger de DB al insertar).
      // ------------------------------------------------------------------
      const { data: registrosData, error: registrosErr } = await supabase
        .from('registros_trabajo')
        .select('lote_id, fraccion_jornal, costo_jornal')
        .not('lote_id', 'is', null)
        .gte('fecha_trabajo', `${ano}-01-01`)
        .lte('fecha_trabajo', `${ano}-12-31`);

      if (registrosErr) throw new Error(`Registros trabajo: ${registrosErr.message}`);

      // Agregar por lote
      const laborMap = new Map<string, { costo: number; jornales: number }>();
      for (const r of (registrosData ?? []) as {
        lote_id: string;
        fraccion_jornal: number | string;
        costo_jornal: number | string;
      }[]) {
        if (!r.lote_id) continue;
        const cur = laborMap.get(r.lote_id) ?? { costo: 0, jornales: 0 };
        cur.costo += Number(r.costo_jornal) || 0;
        cur.jornales += Number(r.fraccion_jornal) || 0;
        laborMap.set(r.lote_id, cur);
      }

      const labor: LaborLoteAnual[] = Array.from(laborMap.entries()).map(([lote_id, v]) => ({
        lote_id,
        costo_labor: v.costo,
        jornales: v.jornales,
      }));

      // ------------------------------------------------------------------
      // 3. Insumos directos: movimientos_diarios (lote, año) ⋈
      //    movimientos_diarios_productos ⋈ productos.precio_unitario
      //
      //    precio_unitario en productos es el precio por unidad base
      //    (litros/kilos/unidades) — mismo campo que usa cost-aggregation.ts.
      // ------------------------------------------------------------------
      const { data: movimientosData, error: movErr } = await supabase
        .from('movimientos_diarios')
        .select('id, lote_id')
        .not('lote_id', 'is', null)
        .gte('fecha_movimiento', `${ano}-01-01`)
        .lte('fecha_movimiento', `${ano}-12-31`);

      if (movErr) throw new Error(`Movimientos diarios: ${movErr.message}`);

      const movLoteMap = new Map<string, string>(); // id → lote_id
      for (const m of (movimientosData ?? []) as { id: string; lote_id: string }[]) {
        if (m.lote_id) movLoteMap.set(m.id, m.lote_id);
      }

      const insumosMap = new Map<string, number>(); // lote_id → costo_insumos

      if (movLoteMap.size > 0) {
        const movIds = Array.from(movLoteMap.keys());

        const { data: prodData, error: prodErr } = await supabase
          .from('movimientos_diarios_productos')
          .select(`
            movimiento_diario_id,
            cantidad_utilizada,
            unidad,
            productos!inner(precio_unitario)
          `)
          .in('movimiento_diario_id', movIds);

        if (prodErr) throw new Error(`Movimientos diarios productos: ${prodErr.message}`);

        for (const p of (prodData ?? []) as {
          movimiento_diario_id: string;
          cantidad_utilizada: number | string;
          unidad: string | null;
          productos: { precio_unitario: number | null };
        }[]) {
          const loteId = movLoteMap.get(p.movimiento_diario_id);
          if (!loteId) continue;

          const cantidad = Number(p.cantidad_utilizada) || 0;
          const precio = Number(p.productos?.precio_unitario) || 0;

          // Normalizar unidad al precio unitario de la tabla productos.
          // precio_unitario es por litro/kilo/unidad, los productos se
          // registran en cc/L/g/Kg. Convertimos a la unidad base.
          const cantidadBase = normalizarCantidad(cantidad, p.unidad);
          const costo = cantidadBase * precio;

          insumosMap.set(loteId, (insumosMap.get(loteId) ?? 0) + costo);
        }
      }

      const insumos: InsumoLoteAnual[] = Array.from(insumosMap.entries()).map(
        ([lote_id, costo_insumos]) => ({ lote_id, costo_insumos }),
      );

      // ------------------------------------------------------------------
      // 4. Overhead de finca: fin_gastos Confirmado, negocio Aguacate Hass, año
      //    JOIN con fin_categorias_gastos para filtrar por categoría.
      //    Para el fallback se usa el total sin excluir; calcularOverheadFarm
      //    aplicará las exclusiones.
      // ------------------------------------------------------------------
      // Primero resolvemos el negocio_id de 'Aguacate Hass'
      const { data: negocioData, error: negErr } = await supabase
        .from('fin_negocios')
        .select('id')
        .eq('nombre', 'Aguacate Hass')
        .maybeSingle();

      if (negErr) throw new Error(`Negocio Aguacate Hass: ${negErr.message}`);

      let gastosOverhead: { valor: number; categoria_nombre: string | null }[] = [];

      if (negocioData?.id) {
        const { data: gastosData, error: gastosErr } = await supabase
          .from('fin_gastos')
          .select('valor, fin_categorias_gastos(nombre)')
          .eq('estado', 'Confirmado')
          .eq('negocio_id', negocioData.id)
          .gte('fecha', `${ano}-01-01`)
          .lte('fecha', `${ano}-12-31`);

        if (gastosErr) throw new Error(`Gastos overhead: ${gastosErr.message}`);

        gastosOverhead = (gastosData ?? []).map((g: {
          valor: number;
          fin_categorias_gastos: { nombre: string } | null;
        }) => ({
          valor: g.valor ?? 0,
          categoria_nombre: g.fin_categorias_gastos?.nombre ?? null,
        }));
      }

      // ------------------------------------------------------------------
      // 5. Producción por lote y cosecha.
      //    Consolidamos igual que consolidarRegistros en useProduccionData:
      //    si existe un registro nivel-lote (sublote_id IS NULL) para el
      //    grupo (lote_id, ano, cosecha_tipo), se usa ese; de lo contrario
      //    se suman los registros de sublote para evitar doble conteo.
      // ------------------------------------------------------------------
      const { data: produccionData, error: prodAnualErr } = await supabase
        .from('produccion')
        .select('lote_id, sublote_id, cosecha_tipo, kg_totales')
        .eq('ano', ano);

      if (prodAnualErr) throw new Error(`Produccion: ${prodAnualErr.message}`);

      // Agrupar por (lote_id, cosecha_tipo) y aplicar lógica de consolidación
      type RawProd = {
        lote_id: string;
        sublote_id: string | null;
        cosecha_tipo: CosechaTipo;
        kg_totales: number | string;
      };

      const grupos = new Map<string, RawProd[]>();
      for (const p of (produccionData ?? []) as RawProd[]) {
        if (!p.lote_id) continue;
        const key = `${p.lote_id}__${p.cosecha_tipo}`;
        const arr = grupos.get(key) ?? [];
        arr.push(p);
        grupos.set(key, arr);
      }

      const produccionPorLoteCosecha = new Map<
        string,
        { cosecha_tipo: CosechaTipo; kg: number }[]
      >();

      for (const grupo of grupos.values()) {
        const nivelLote = grupo.find((r) => r.sublote_id === null);
        const canonical = nivelLote ?? null;
        const kg = canonical
          ? Number(canonical.kg_totales) || 0
          : grupo.reduce((s, r) => s + (Number(r.kg_totales) || 0), 0);

        const loteId = grupo[0].lote_id;
        const cosechaTipo = grupo[0].cosecha_tipo;
        const arr = produccionPorLoteCosecha.get(loteId) ?? [];
        arr.push({ cosecha_tipo: cosechaTipo, kg });
        produccionPorLoteCosecha.set(loteId, arr);
      }

      // ------------------------------------------------------------------
      // 6. Calcular (lógica pura)
      // ------------------------------------------------------------------
      const resultado = calcularCostoKgAnual(
        ano,
        lotes,
        labor,
        insumos,
        gastosOverhead,
        produccionPorLoteCosecha,
        categoriasExcluidas,
      );

      return resultado;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, calcular };
}

// ---------------------------------------------------------------------------
// Helpers internos del hook
// ---------------------------------------------------------------------------

/**
 * Normaliza cantidad al precio unitario de productos (por litro o kilo):
 *   cc  → litros (/1000)
 *   g   → kilos  (/1000)
 *   L/Litro/Litros → litros (×1)
 *   Kg/Kilo/Kilos  → kilos  (×1)
 *   Otros (Unidad) → sin conversión (×1)
 *
 * Espejo de `convertirUnidadBase` en cost-aggregation.ts para el contexto
 * de movimientos_diarios_productos.
 */
function normalizarCantidad(cantidad: number, unidad: string | null | undefined): number {
  const u = (unidad ?? '').trim().toLowerCase();
  if (u === 'cc') return cantidad / 1000;
  if (u === 'g') return cantidad / 1000;
  return cantidad; // L, Kg, Unidad — sin conversión
}

// Re-export de constantes para facilitar el uso desde la UI
export { CATEGORIAS_OVERHEAD_EXCLUIDAS_DEFAULT, ANO_MIN_LOTE };
