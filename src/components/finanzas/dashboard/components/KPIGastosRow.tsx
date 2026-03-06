import { KPIScorecard } from './KPIScorecard';
import type { KPIConVariacion } from '@/types/finanzas';

interface KPIGastosRowProps {
  ytdActual: KPIConVariacion;
  ytdAnterior: KPIConVariacion;
  totalAnterior: KPIConVariacion;
}

export function KPIGastosRow({ ytdActual, ytdAnterior, totalAnterior }: KPIGastosRowProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <KPIScorecard
        label={ytdActual.periodo_label}
        valor={ytdActual.valor}
        variacion={ytdActual.variacion_porcentaje}
      />
      <KPIScorecard
        label={ytdAnterior.periodo_label}
        valor={ytdAnterior.valor}
        variacion={ytdAnterior.variacion_porcentaje}
      />
      <KPIScorecard
        label={totalAnterior.periodo_label}
        valor={totalAnterior.valor}
        variacion={totalAnterior.variacion_porcentaje}
      />
    </div>
  );
}
