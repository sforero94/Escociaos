/**
 * EJEMPLOS DE USO - MetricCard Component
 * 
 * Este archivo muestra todos los casos de uso del componente MetricCard
 * Incluye ejemplos para: colores, tendencias, loading, interactividad
 */

import { 
  Package, 
  TrendingUp, 
  DollarSign, 
  Users, 
  ShoppingCart,
  Activity,
  Sprout,
  MapPin
} from 'lucide-react';
import { MetricCard, MetricCardGrid, MetricCardSkeleton } from './MetricCard';

/**
 * EJEMPLO 1: Card básica con valor simple
 */
export function BasicMetricCardExample() {
  return (
    <MetricCard
      title="Inventario Total"
      value="$4,250,000"
      icon={<Package className="w-6 h-6" />}
    />
  );
}

/**
 * EJEMPLO 2: Card con tendencia positiva (up)
 */
export function MetricCardWithUpTrend() {
  return (
    <MetricCard
      title="Ventas del Mes"
      value="$174,370,000"
      icon={<DollarSign className="w-6 h-6" />}
      trend="up"
      trendValue="+12.5%"
      color="green"
      subtitle="Comparado con el mes anterior"
    />
  );
}

/**
 * EJEMPLO 3: Card con tendencia negativa (down)
 */
export function MetricCardWithDownTrend() {
  return (
    <MetricCard
      title="Stock Disponible"
      value="1,250 kg"
      icon={<Package className="w-6 h-6" />}
      trend="down"
      trendValue="-8.2%"
      color="red"
      subtitle="Requiere reposición pronto"
    />
  );
}

/**
 * EJEMPLO 4: Card con tendencia neutral
 */
export function MetricCardWithNeutralTrend() {
  return (
    <MetricCard
      title="Clientes Activos"
      value="42"
      icon={<Users className="w-6 h-6" />}
      trend="neutral"
      trendValue="0%"
      color="gray"
      subtitle="Sin cambios esta semana"
    />
  );
}

/**
 * EJEMPLO 5: Card en estado de carga
 */
export function MetricCardLoadingExample() {
  return (
    <MetricCard
      title="Cargando..."
      value="--"
      icon={<Activity className="w-6 h-6" />}
      loading={true}
    />
  );
}

/**
 * EJEMPLO 6: Card clickeable con acción
 */
export function MetricCardClickableExample() {
  return (
    <MetricCard
      title="Producción Semanal"
      value="4.8 ton"
      icon={<TrendingUp className="w-6 h-6" />}
      trend="up"
      trendValue="+5.3%"
      color="green"
      subtitle="Promedio: 0.4 kg/árbol"
      onClick={() => alert('Navegando a producción...')}
    />
  );
}

/**
 * EJEMPLO 7: Todas las variantes de color
 */
export function AllColorVariantsExample() {
  return (
    <MetricCardGrid>
      <MetricCard
        title="Color Verde (Primary)"
        value="$330M"
        icon={<Package className="w-6 h-6" />}
        color="green"
        trend="up"
        trendValue="+10%"
      />
      
      <MetricCard
        title="Color Azul"
        value="8 lotes"
        icon={<MapPin className="w-6 h-6" />}
        color="blue"
        trend="neutral"
        trendValue="0%"
      />
      
      <MetricCard
        title="Color Amarillo"
        value="3 alertas"
        icon={<Activity className="w-6 h-6" />}
        color="yellow"
        trend="down"
        trendValue="-2"
      />
      
      <MetricCard
        title="Color Rojo"
        value="2 críticas"
        icon={<Activity className="w-6 h-6" />}
        color="red"
        trend="up"
        trendValue="+1"
      />
      
      <MetricCard
        title="Color Gris"
        value="12,000"
        icon={<Sprout className="w-6 h-6" />}
        color="gray"
      />
    </MetricCardGrid>
  );
}

/**
 * EJEMPLO 8: Dashboard completo con MetricCardGrid
 */
export function CompleteDashboardExample() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-gray-900">Dashboard - Escocia Hass</h1>
      
      <MetricCardGrid>
        <MetricCard
          title="Inventario Total"
          value="$330.0M"
          icon={<Package className="w-6 h-6" />}
          trend="up"
          trendValue="+5.2%"
          color="green"
          subtitle="3 productos con stock bajo"
        />

        <MetricCard
          title="Producción Semanal"
          value="4.8 ton"
          icon={<TrendingUp className="w-6 h-6" />}
          trend="up"
          trendValue="+12.8%"
          color="green"
          subtitle="Promedio: 0.4 kg/árbol"
        />

        <MetricCard
          title="Ventas del Mes"
          value="$174.4M"
          icon={<DollarSign className="w-6 h-6" />}
          trend="up"
          trendValue="+8.5%"
          color="blue"
          subtitle="6 clientes activos"
        />

        <MetricCard
          title="Aplicaciones Activas"
          value="5"
          icon={<Sprout className="w-6 h-6" />}
          trend="neutral"
          trendValue="0"
          color="yellow"
          subtitle="Próxima: Fertilización foliar"
        />

        <MetricCard
          title="Monitoreos Críticos"
          value="2"
          icon={<Activity className="w-6 h-6" />}
          trend="down"
          trendValue="-1"
          color="red"
          subtitle="Phytophthora en Lote B-3"
        />

        <MetricCard
          title="Lotes Activos"
          value="8"
          icon={<MapPin className="w-6 h-6" />}
          color="gray"
          subtitle="Más productivo: A-1 (6.5 ha)"
        />
      </MetricCardGrid>
    </div>
  );
}

/**
 * EJEMPLO 9: Grid con Skeleton Loaders
 */
export function MetricCardGridWithLoadersExample() {
  const isLoading = true;

  if (isLoading) {
    return (
      <MetricCardGrid>
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </MetricCardGrid>
    );
  }

  return (
    <MetricCardGrid>
      {/* Cards reales aquí */}
    </MetricCardGrid>
  );
}

/**
 * EJEMPLO 10: Cards con datos dinámicos (simulación de API)
 */
export function DynamicMetricCardsExample() {
  // Simular datos de API
  const metrics = [
    {
      id: 1,
      title: 'Total Inventario',
      value: '$330,000,000',
      icon: Package,
      trend: 'up' as const,
      trendValue: '+5.2%',
      color: 'green' as const,
    },
    {
      id: 2,
      title: 'Producción',
      value: '4800 kg',
      icon: TrendingUp,
      trend: 'up' as const,
      trendValue: '+12%',
      color: 'green' as const,
    },
    {
      id: 3,
      title: 'Ventas',
      value: '$174M',
      icon: DollarSign,
      trend: 'down' as const,
      trendValue: '-3%',
      color: 'red' as const,
    },
  ];

  return (
    <MetricCardGrid>
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          title={metric.title}
          value={metric.value}
          icon={<metric.icon className="w-6 h-6" />}
          trend={metric.trend}
          trendValue={metric.trendValue}
          color={metric.color}
        />
      ))}
    </MetricCardGrid>
  );
}

/**
 * EJEMPLO 11: Cards responsive (mobile-first)
 */
export function ResponsiveMetricCardsExample() {
  return (
    <div className="space-y-4">
      {/* En mobile: stack vertical */}
      <div className="md:hidden space-y-4">
        <MetricCard
          title="Ventas"
          value="$174M"
          icon={<DollarSign className="w-6 h-6" />}
          color="green"
        />
        <MetricCard
          title="Producción"
          value="4.8 ton"
          icon={<TrendingUp className="w-6 h-6" />}
          color="blue"
        />
      </div>

      {/* En desktop: grid */}
      <div className="hidden md:block">
        <MetricCardGrid>
          <MetricCard
            title="Ventas"
            value="$174M"
            icon={<DollarSign className="w-6 h-6" />}
            color="green"
          />
          <MetricCard
            title="Producción"
            value="4.8 ton"
            icon={<TrendingUp className="w-6 h-6" />}
            color="blue"
          />
          <MetricCard
            title="Inventario"
            value="$330M"
            icon={<Package className="w-6 h-6" />}
            color="yellow"
          />
        </MetricCardGrid>
      </div>
    </div>
  );
}

/**
 * EJEMPLO 12: Cards con formato de números usando utilidades
 */
export function FormattedMetricCardsExample() {
  // Importar utilidades de formato
  // import { formatCurrency, formatWeight, formatNumber } from '../../utils/format';
  
  const data = {
    inventoryValue: 330000000,
    weekProduction: 4800,
    activeClients: 42,
  };

  return (
    <MetricCardGrid>
      <MetricCard
        title="Inventario Total"
        value={`$${(data.inventoryValue / 1000000).toFixed(1)}M`} // formatCurrency
        icon={<Package className="w-6 h-6" />}
        color="green"
      />

      <MetricCard
        title="Producción Semanal"
        value={`${(data.weekProduction / 1000).toFixed(1)} ton`} // formatWeight
        icon={<TrendingUp className="w-6 h-6" />}
        color="blue"
      />

      <MetricCard
        title="Clientes Activos"
        value={data.activeClients.toLocaleString('es-CO')} // formatNumber
        icon={<Users className="w-6 h-6" />}
        color="gray"
      />
    </MetricCardGrid>
  );
}

/**
 * TIPS DE USO:
 * 
 * 1. COLORES:
 *    - green: Para valores positivos, ingresos, éxito
 *    - blue: Para información neutral, lotes, áreas
 *    - yellow: Para advertencias, alertas moderadas
 *    - red: Para críticos, problemas, stock bajo
 *    - gray: Para datos neutrales, conteos
 * 
 * 2. TENDENCIAS:
 *    - up: Usar para incrementos positivos
 *    - down: Usar para disminuciones (puede ser bueno o malo según contexto)
 *    - neutral: Sin cambios
 * 
 * 3. LOADING:
 *    - Usar loading={true} mientras se cargan datos
 *    - O usar <MetricCardSkeleton /> para mejor UX
 * 
 * 4. INTERACTIVIDAD:
 *    - Pasar onClick para cards clickeables
 *    - Muestra indicador visual en hover
 * 
 * 5. GRID:
 *    - Usar <MetricCardGrid> para layout responsive automático
 *    - 1 col mobile, 2 tablet, 3 desktop
 */
