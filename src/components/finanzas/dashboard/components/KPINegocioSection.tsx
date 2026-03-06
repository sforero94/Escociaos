import { KPIScorecard } from './KPIScorecard';
import type { KPIConVariacion } from '@/types/finanzas';

interface KPINegocioSectionProps {
  ingresosActual: KPIConVariacion;
  ingresosYtdAnterior: KPIConVariacion;
  ingresosN1: KPIConVariacion;
  ingresosN2: KPIConVariacion;
  gastosActual: KPIConVariacion;
  gastosYtdAnterior: KPIConVariacion;
  gastosN1: KPIConVariacion;
  gastosN2: KPIConVariacion;
}

export function KPINegocioSection({
  ingresosActual, ingresosYtdAnterior, ingresosN1, ingresosN2,
  gastosActual, gastosYtdAnterior, gastosN1, gastosN2,
}: KPINegocioSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Ingresos */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-green-700 uppercase tracking-wide">Ingresos</h3>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={ingresosActual.periodo_label}
            valor={ingresosActual.valor}
            variacion={ingresosActual.variacion_porcentaje}
            size="sm"
          />
          <KPIScorecard
            label={ingresosYtdAnterior.periodo_label}
            valor={ingresosYtdAnterior.valor}
            size="sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KPIScorecard
            label={ingresosN1.periodo_label}
            valor={ingresosN1.valor}
            variacion={ingresosN1.variacion_porcentaje}
            size="sm"
          />
          <KPIScorecard
            label={ingresosN2.periodo_label}
            valor={ingresosN2.valor}
            size="sm"
          />
        </div>
      </div>

      {/* Gastos */}
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
