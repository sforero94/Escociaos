// Carga de datos para /finanzas/reportes. SOLO fetching y normalización:
// toda la lógica de cálculo vive en los motores puros de `src/utils/`.
//
// Una sola carga por año alimenta las 4 vistas y los 2 reportes. Filtrar por
// negocio en memoria es más barato que 8 consultas distintas, y garantiza que
// el P&G y el Flujo de Caja nunca discrepen por haber leído la base en
// momentos distintos.

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import type {
  DatosCrudosReportes,
  GastoCrudo,
  IngresoCrudo,
  ParametroFinanciero,
  TipoCosto,
  TransaccionGanadoCruda,
} from '@/types/reportesFinancieros';

interface FilaCatalogo {
  id: string;
  nombre: string;
  tipo_costo?: string | null;
}

interface FilaGasto {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number | string;
  estado: string | null;
  categoria_id: string | null;
  concepto_id: string | null;
}

interface FilaIngreso {
  id: string;
  fecha: string;
  negocio_id: string;
  valor: number | string;
  categoria_id: string | null;
  cosecha: string | null;
  cantidad: number | string | null;
}

interface FilaGanado {
  id: string;
  fecha: string;
  tipo: string;
  cantidad_cabezas: number | string;
  kilos_pagados: number | string | null;
  valor_total: number | string;
}

interface FilaParametro {
  clave: string;
  anio: number | null;
  negocio_id: string | null;
  valor: number | string;
}

/** PostgREST devuelve NUMERIC como string para no perder precisión. */
function num(valor: number | string | null | undefined): number {
  if (valor == null) return 0;
  const n = typeof valor === 'number' ? valor : parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

function numONull(valor: number | string | null | undefined): number | null {
  if (valor == null) return null;
  const n = typeof valor === 'number' ? valor : parseFloat(valor);
  return Number.isFinite(n) ? n : null;
}

function comoTipoCosto(valor: string | null | undefined): TipoCosto | null {
  return valor === 'directo' || valor === 'indirecto' ? valor : null;
}

export interface EstadoReportesData {
  datos: DatosCrudosReportes | null;
  loading: boolean;
  error: string | null;
  recargar: () => void;
}

export function useReportesFinancierosData(anio: number): EstadoReportesData {
  const [datos, setDatos] = useState<DatosCrudosReportes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Clave de string, no identidad de objeto: evita el refetch en cada render
  // del padre que sufría el P&G anterior.
  const ultimaClave = useRef<string>('');

  const recargar = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const clave = `${anio}|${nonce}`;
    if (ultimaClave.current === clave) return;
    ultimaClave.current = clave;

    let cancelado = false;

    async function cargar() {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabase();

        // El modo cosecha necesita el 2º semestre del año anterior, así que la
        // ventana de gastos siempre cubre dos años.
        const desdeGastos = `${anio - 1}-01-01`;
        const hastaGastos = `${anio}-12-31`;

        const [
          negociosRes,
          categoriasGastoRes,
          conceptosRes,
          categoriasIngresoRes,
          gastosRes,
          ingresosRes,
          ganadoRes,
          parametrosRes,
        ] = await Promise.all([
          supabase.from('fin_negocios').select('id, nombre').order('nombre'),
          // `tipo_costo` viene de la migración 051 y no está en database.ts.
          (supabase.from('fin_categorias_gastos') as any).select('id, nombre, tipo_costo'),
          (supabase.from('fin_conceptos_gastos') as any).select('id, nombre, tipo_costo'),
          supabase.from('fin_categorias_ingresos').select('id, nombre'),
          fetchAll<FilaGasto>((desde, hasta) =>
            supabase
              .from('fin_gastos')
              .select('id, fecha, negocio_id, valor, estado, categoria_id, concepto_id')
              .gte('fecha', desdeGastos)
              .lte('fecha', hastaGastos)
              .order('id')
              .range(desde, hasta)
          ),
          // Solo 219 filas en total; traerlas completas evita tener que razonar
          // sobre qué ventana necesita cada modo del reporte.
          fetchAll<FilaIngreso>((desde, hasta) =>
            supabase
              .from('fin_ingresos')
              .select('id, fecha, negocio_id, valor, categoria_id, cosecha, cantidad')
              .order('id')
              .range(desde, hasta)
          ),
          // Histórico COMPLETO: el costo promedio móvil del ganado es
          // path-dependent y recortar la serie cambiaría el costo de venta.
          fetchAll<FilaGanado>((desde, hasta) =>
            (supabase.from('fin_transacciones_ganado') as any)
              .select('id, fecha, tipo, cantidad_cabezas, kilos_pagados, valor_total')
              .order('id')
              .range(desde, hasta)
          ),
          (supabase.from('fin_parametros' as any) as any).select('clave, anio, negocio_id, valor'),
        ]);

        if (cancelado) return;

        const errores = [
          negociosRes.error,
          categoriasGastoRes.error,
          conceptosRes.error,
          categoriasIngresoRes.error,
          parametrosRes.error,
        ].filter(Boolean);
        if (errores.length > 0) throw new Error(errores[0]!.message);

        const catGastos = new Map<string, FilaCatalogo>(
          ((categoriasGastoRes.data ?? []) as FilaCatalogo[]).map((c) => [c.id, c])
        );
        const conceptos = new Map<string, FilaCatalogo>(
          ((conceptosRes.data ?? []) as FilaCatalogo[]).map((c) => [c.id, c])
        );
        const catIngresos = new Map<string, FilaCatalogo>(
          ((categoriasIngresoRes.data ?? []) as FilaCatalogo[]).map((c) => [c.id, c])
        );

        const gastos: GastoCrudo[] = gastosRes.filas.map((g) => {
          const cat = g.categoria_id ? catGastos.get(g.categoria_id) : undefined;
          const con = g.concepto_id ? conceptos.get(g.concepto_id) : undefined;
          return {
            id: g.id,
            fecha: g.fecha,
            negocio_id: g.negocio_id,
            valor: num(g.valor),
            estado: g.estado,
            categoria_id: g.categoria_id,
            categoria_nombre: cat?.nombre ?? null,
            categoria_tipo_costo: comoTipoCosto(cat?.tipo_costo),
            concepto_id: g.concepto_id,
            concepto_nombre: con?.nombre ?? null,
            concepto_tipo_costo: comoTipoCosto(con?.tipo_costo),
          };
        });

        const ingresos: IngresoCrudo[] = ingresosRes.filas.map((i) => ({
          id: i.id,
          fecha: i.fecha,
          negocio_id: i.negocio_id,
          valor: num(i.valor),
          categoria_id: i.categoria_id,
          categoria_nombre: i.categoria_id ? catIngresos.get(i.categoria_id)?.nombre ?? null : null,
          cosecha: i.cosecha,
          cantidad: numONull(i.cantidad),
        }));

        const ganado: TransaccionGanadoCruda[] = ganadoRes.filas
          .filter((t) => t.tipo === 'compra' || t.tipo === 'venta')
          .map((t) => ({
            id: t.id,
            fecha: t.fecha,
            tipo: t.tipo as 'compra' | 'venta',
            cantidad_cabezas: num(t.cantidad_cabezas),
            kilos_pagados: numONull(t.kilos_pagados),
            valor_total: num(t.valor_total),
          }));

        const parametros: ParametroFinanciero[] = ((parametrosRes.data ?? []) as FilaParametro[]).map(
          (p) => ({
            clave: p.clave,
            anio: p.anio,
            negocio_id: p.negocio_id,
            valor: num(p.valor),
          })
        );

        setDatos({
          anio,
          negocios: (negociosRes.data ?? []) as { id: string; nombre: string }[],
          ingresos,
          gastos,
          ganado,
          parametros,
          truncado: gastosRes.truncado || ingresosRes.truncado || ganadoRes.truncado,
        });
      } catch (e) {
        if (!cancelado) {
          setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos del reporte.');
          setDatos(null);
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [anio, nonce]);

  return { datos, loading, error, recargar };
}
