import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useGanadoInventario } from '@/components/ganado/hooks/useGanadoInventario';
import { calcularKPIsInventario } from '@/utils/calculosGanado';
import { formatNumber } from '@/utils/format';
import { KPIScorecard } from './KPIScorecard';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import type { KPIsInventarioGanado } from '@/types/ganado';

/**
 * Franja de KPIs del inventario vivo de ganado (issue #51) dentro del
 * dashboard financiero de Ganado (issue #45). Conecta la capa
 * financiera (fin_transacciones_ganado) con la operativa (gan_*).
 */
export function InventarioGanadoKPIs() {
  const { fetchInventario, countPendientes } = useGanadoInventario();
  const [kpis, setKpis] = useState<KPIsInventarioGanado | null>(null);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        const [rows, pend] = await Promise.all([fetchInventario(), countPendientes()]);
        setKpis(calcularKPIsInventario(rows));
        setPendientes(pend);
      } catch {
        // El módulo de inventario puede no estar desplegado aún (migración 044)
        setKpis(null);
      }
    };
    load();
  }, [fetchInventario, countPendientes]);

  if (!kpis) return null;

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-green-700">Inventario vivo</h3>
        <div className="flex items-center gap-3">
          {pendientes > 0 && (
            <Link to="/ganado/movimientos" className="flex items-center gap-1 text-xs text-amber-700 hover:underline">
              <AlertTriangle className="w-3.5 h-3.5" />
              {pendientes} {pendientes === 1 ? 'pendiente' : 'pendientes'} de confirmar
            </Link>
          )}
          <Link to="/ganado" className="flex items-center gap-1 text-xs text-primary hover:underline">
            Ver inventario
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIScorecard label="Total cabezas" valor={kpis.totalCabezas} valorFormateado={formatNumber(kpis.totalCabezas)} size="sm" />
        <KPIScorecard label="Novillos" valor={kpis.totalNovillos} valorFormateado={formatNumber(kpis.totalNovillos)} size="sm" />
        <KPIScorecard label="Toros" valor={kpis.totalToros} valorFormateado={formatNumber(kpis.totalToros)} size="sm" />
        <KPIScorecard
          label="Cabezas/Ha"
          valor={kpis.cabezasPorHa || 0}
          valorFormateado={kpis.cabezasPorHa != null ? formatNumber(kpis.cabezasPorHa, 1) : '-'}
          size="sm"
        />
      </div>
    </div>
  );
}
