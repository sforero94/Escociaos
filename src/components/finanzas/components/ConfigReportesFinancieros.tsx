import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/utils/format';
import type { TipoCosto } from '@/types/reportesFinancieros';

interface CategoriaFila {
  id: string;
  nombre: string;
  tipo_costo: TipoCosto;
}

const CLAVES = [
  {
    clave: 'cabezas_inventario_inicial',
    etiqueta: 'Cabezas de ganado antes del primer registro',
    ayuda:
      'Las transacciones registran 571 cabezas compradas y 801 vendidas: había ganado antes de que empezara el registro. Sin este dato, el costo de venta queda subestimado.',
    esMoneda: false,
  },
  {
    clave: 'costo_cabeza_inventario_inicial',
    etiqueta: 'Costo por cabeza de ese inventario inicial',
    ayuda: 'Lo que costó en promedio cada una de esas cabezas.',
    esMoneda: true,
  },
  {
    clave: 'saldo_inicial_caja',
    etiqueta: 'Saldo de caja al 1 de enero',
    ayuda:
      'Opcional. Mientras esté vacío, el flujo de caja muestra «Flujo acumulado del período» en vez de «Saldo de caja».',
    esMoneda: true,
  },
] as const;

/**
 * Configuración que alimenta /finanzas/reportes:
 *   1. qué categorías de gasto son costo directo (define el margen de contribución)
 *   2. los inputs contables que el sistema no puede derivar de sus propios datos
 */
export function ConfigReportesFinancieros() {
  const [categorias, setCategorias] = useState<CategoriaFila[]>([]);
  const [parametros, setParametros] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const supabase = getSupabase();
      const [catRes, parRes] = await Promise.all([
        (supabase.from('fin_categorias_gastos') as any)
          .select('id, nombre, tipo_costo')
          .order('nombre'),
        (supabase.from('fin_parametros' as any) as any).select('clave, valor'),
      ]);

      if (catRes.error) throw catRes.error;

      setCategorias((catRes.data ?? []) as CategoriaFila[]);

      const mapa: Record<string, string> = {};
      for (const p of (parRes.data ?? []) as { clave: string; valor: number | string }[]) {
        mapa[p.clave] = String(p.valor);
      }
      setParametros(mapa);
    } catch {
      toast.error('No se pudo cargar la configuración de reportes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarTipo = async (id: string, tipo: TipoCosto) => {
    const previo = categorias;
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, tipo_costo: tipo } : c)));

    const { error } = await (getSupabase().from('fin_categorias_gastos') as any)
      .update({ tipo_costo: tipo })
      .eq('id', id);

    if (error) {
      setCategorias(previo);
      toast.error('No se pudo guardar el cambio.');
    }
  };

  const guardarParametros = async () => {
    setGuardando(true);
    try {
      const supabase = getSupabase();

      for (const { clave } of CLAVES) {
        const texto = parametros[clave];
        if (texto == null || texto.trim() === '') continue;

        const valor = Number(texto);
        if (!Number.isFinite(valor)) continue;

        // UPDATE-por-id y luego INSERT, nunca upsert de PostgREST: el índice
        // único de fin_parametros está sobre expresiones COALESCE y no se
        // puede referenciar desde `on_conflict`.
        const { data: existente } = await (supabase.from('fin_parametros' as any) as any)
          .select('id')
          .eq('clave', clave)
          .is('anio', null)
          .is('negocio_id', null)
          .maybeSingle();

        if (existente?.id) {
          await (supabase.from('fin_parametros' as any) as any)
            .update({ valor, updated_at: new Date().toISOString() })
            .eq('id', existente.id);
        } else {
          await (supabase.from('fin_parametros' as any) as any).insert({ clave, valor });
        }
      }

      toast.success('Parámetros guardados');
      await cargar();
    } catch {
      toast.error('No se pudieron guardar los parámetros.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin mr-2" />
        <span className="text-brand-brown/70">Cargando configuración…</span>
      </div>
    );
  }

  const directas = categorias.filter((c) => c.tipo_costo === 'directo').length;

  return (
    <div className="space-y-6">
      {/* ── Clasificación de costos ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-foreground">Clasificación de costos</h3>
          <p className="text-sm text-brand-brown/70 mt-1">
            Un costo <strong>directo</strong> crece con la operación y entra antes del Margen de
            Contribución. Uno <strong>indirecto</strong> es estructura que existe aunque el negocio
            no produzca. Cambiar una categoría mueve el margen, pero nunca la Utilidad Operativa.
          </p>
          <p className="text-xs text-brand-brown/70 mt-2">
            {directas} de {categorias.length} categorías marcadas como directas.
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {categorias.map((cat) => (
            <div key={cat.id} className="px-6 py-3 flex items-center justify-between gap-4">
              <span className="text-sm text-foreground">{cat.nombre}</span>
              <div className="w-48 flex-shrink-0">
                <Select
                  value={cat.tipo_costo}
                  onValueChange={(v) => cambiarTipo(cat.id, v as TipoCosto)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="directo">Costo directo</SelectItem>
                    <SelectItem value="indirecto">Gasto indirecto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Parámetros contables ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-foreground">Parámetros contables</h3>
          <p className="text-sm text-brand-brown/70 mt-1">
            Datos que el sistema no puede deducir de sus propios registros.
          </p>
        </div>

        <div className="px-6 py-4 space-y-5">
          {CLAVES.map(({ clave, etiqueta, ayuda, esMoneda }) => (
            <div key={clave}>
              <label className="block text-sm text-foreground mb-1" htmlFor={clave}>
                {etiqueta}
              </label>
              <Input
                id={clave}
                type="number"
                min="0"
                value={parametros[clave] ?? ''}
                placeholder="Sin definir"
                // Evita que al hacer scroll sobre el campo se cambie el valor.
                onWheel={(e) => e.currentTarget.blur()}
                onChange={(e) => setParametros((prev) => ({ ...prev, [clave]: e.target.value }))}
                className="max-w-sm"
              />
              <p className="text-xs text-brand-brown/70 mt-1">{ayuda}</p>
              {esMoneda && parametros[clave] && Number.isFinite(Number(parametros[clave])) && (
                <p className="text-xs text-primary mt-1">
                  {formatCurrency(Number(parametros[clave]))}
                </p>
              )}
            </div>
          ))}

          <Button onClick={guardarParametros} disabled={guardando} className="flex items-center gap-2">
            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar parámetros
          </Button>
        </div>
      </div>
    </div>
  );
}
