import { DollarSign, Package, TreePine, Users } from 'lucide-react';
import { KPICard, type KPIComparacion } from '@/components/aplicaciones/shared/KPICard';
import { calcularCambio } from '@/utils/calculosReporteAplicacion';
import { formatearMoneda, formatearNumero } from '@/utils/format';

interface ComparisonField {
  real: number;
  planeado: number;
  // D2: `undefined` = sin plan (planeado 0/ausente). Ya viene resuelto desde
  // useReporteAplicacion.ts (calcularCambio) — esta tarjeta solo lo traduce a un badge o nada.
  desviacion: number | undefined;
}

interface FinancieroField {
  real: number;
  planeado: number;
  desviacion: number | undefined;
  cambio: number;
}

interface AnteriorData {
  nombre: string;
  costo_total: number;
  costo_por_arbol: number;
  total_arboles: number;
  canecas: number;
  jornales: number;
  arboles_por_jornal: number;
}

interface HeroKPICardsProps {
  financiero: {
    costo_total: FinancieroField;
    costo_por_arbol: FinancieroField;
  };
  canecasTotales: ComparisonField;
  totalArboles: number;
  totalJornales: number;
  containerLabel: string;
  anterior?: AnteriorData;
}

/**
 * Arma el arreglo `comparaciones` de una tarjeta: Plan (si hay base > 0) + Anterior (si se
 * seleccionó una aplicación anterior y su valor es > 0). Un `delta` ausente no entra al arreglo
 * — `KPICard` ya sabe no pintar nada en ese caso (contrato §3 del spec, cierra D2).
 */
function construirComparaciones(params: {
  real: number;
  planeado: number;
  deltaPlan: number | undefined;
  anteriorValor: number | undefined;
  formatear: (v: number) => string;
  invertido: boolean;
}): KPIComparacion[] {
  const { real, planeado, deltaPlan, anteriorValor, formatear, invertido } = params;
  const comparaciones: KPIComparacion[] = [];

  if (planeado > 0 && deltaPlan !== undefined) {
    comparaciones.push({
      tipo: 'plan',
      etiqueta: 'Plan',
      valorFormateado: `Plan: ${formatear(planeado)}`,
      delta: deltaPlan,
      invertido,
    });
  }

  if (anteriorValor !== undefined && anteriorValor > 0) {
    comparaciones.push({
      tipo: 'anterior',
      etiqueta: 'Anterior',
      valorFormateado: `Anterior: ${formatear(anteriorValor)}`,
      delta: calcularCambio(real, anteriorValor),
      invertido,
    });
  }

  return comparaciones;
}

export function HeroKPICards({ financiero, canecasTotales, totalArboles, totalJornales, containerLabel, anterior }: HeroKPICardsProps) {
  const sinJornales = totalJornales <= 0;
  const arbolesPorJornal = sinJornales ? 0 : totalArboles / totalJornales;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KPICard
        titulo="Costo Total"
        valor={formatearMoneda(financiero.costo_total.real)}
        icon={DollarSign}
        comparaciones={construirComparaciones({
          real: financiero.costo_total.real,
          planeado: financiero.costo_total.planeado,
          deltaPlan: financiero.costo_total.desviacion,
          anteriorValor: anterior?.costo_total,
          formatear: formatearMoneda,
          invertido: true,
        })}
      />
      <KPICard
        titulo="Costo/Árbol"
        valor={formatearMoneda(financiero.costo_por_arbol.real)}
        icon={TreePine}
        comparaciones={construirComparaciones({
          real: financiero.costo_por_arbol.real,
          planeado: financiero.costo_por_arbol.planeado,
          deltaPlan: financiero.costo_por_arbol.desviacion,
          anteriorValor: anterior?.costo_por_arbol,
          formatear: formatearMoneda,
          invertido: true,
        })}
      />
      <KPICard
        titulo={containerLabel}
        valor={formatearNumero(canecasTotales.real, 1)}
        icon={Package}
        comparaciones={construirComparaciones({
          real: canecasTotales.real,
          planeado: canecasTotales.planeado,
          deltaPlan: canecasTotales.desviacion,
          anteriorValor: anterior?.canecas,
          formatear: (v) => formatearNumero(v, 1),
          invertido: false,
        })}
      />
      <KPICard
        titulo="Árboles/Jornal"
        valor={formatearNumero(arbolesPorJornal, 0)}
        icon={Users}
        sinDato={sinJornales}
        notaSinDato={sinJornales ? 'Sin jornales registrados' : undefined}
        comparaciones={sinJornales ? [] : construirComparaciones({
          real: arbolesPorJornal,
          planeado: 0,
          deltaPlan: undefined,
          anteriorValor: anterior?.arboles_por_jornal,
          formatear: (v) => formatearNumero(v, 0),
          invertido: false,
        })}
      />
    </div>
  );
}
