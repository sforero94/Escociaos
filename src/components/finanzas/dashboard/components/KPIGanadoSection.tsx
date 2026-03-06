import { KPIScorecard } from './KPIScorecard';
import type { KPIConVariacion } from '@/types/finanzas';

interface KPIGanadoSectionProps {
  ventas: KPIConVariacion;
  compras: KPIConVariacion;
  kilosVendidos: KPIConVariacion;
  kilosComprados: KPIConVariacion;
  gastosActual: KPIConVariacion;
  gastosYtdAnterior: KPIConVariacion;
  gastosN1: KPIConVariacion;
  gastosN2: KPIConVariacion;
}

export function KPIGanadoSection({ ventas, compras, kilosVendidos, kilosComprados, gastosActual, gastosYtdAnterior, gastosN1, gastosN2 }: KPIGanadoSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Ventas/Compras + Kilos */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Transacciones</h3>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={ventas.periodo_label}
            valor={ventas.valor}
            variacion={ventas.variacion_porcentaje}
            size="sm"
          />
          <KPIScorecard
            label={compras.periodo_label}
            valor={compras.valor}
            variacion={compras.variacion_porcentaje}
            size="sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label="Kilos vendidos"
            valor={kilosVendidos.valor}
            variacion={kilosVendidos.variacion_porcentaje}
            formato="number"
            size="sm"
          />
          <KPIScorecard
            label="Kilos comprados"
            valor={kilosComprados.valor}
            variacion={kilosComprados.variacion_porcentaje}
            formato="number"
            size="sm"
          />
        </div>
      </div>

      {/* Right: Gastos 2x2 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide">Gastos</h3>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={gastosActual.periodo_label}
            valor={gastosActual.valor}
            variacion={gastosActual.variacion_porcentaje}
            size="sm"
          />
          <KPIScorecard
            label={gastosYtdAnterior.periodo_label}
            valor={gastosYtdAnterior.valor}
            size="sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={gastosN1.periodo_label}
            valor={gastosN1.valor}
            variacion={gastosN1.variacion_porcentaje}
            size="sm"
          />
          <KPIScorecard
            label={gastosN2.periodo_label}
            valor={gastosN2.valor}
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
