/**
 * SHOWCASE - MetricCard Component
 * 
 * Visualización de todas las variantes y estados del componente
 * Usar este archivo como referencia visual o demo page
 */

import { 
  Package, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Activity,
  Sprout,
  MapPin,
  ShoppingCart
} from 'lucide-react';
import { MetricCard, MetricCardGrid, MetricCardSkeleton } from './MetricCard';

export function MetricCardShowcase() {
  return (
    <div className="min-h-screen bg-[#F8FAF5] p-8 space-y-12">
      
      {/* Header */}
      <div>
        <h1 className="text-4xl text-[#172E08] mb-2">MetricCard Showcase</h1>
        <p className="text-[#4D240F]/70">
          Todas las variantes y estados del componente MetricCard
        </p>
      </div>

      {/* Sección 1: Variantes de Color */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">1. Variantes de Color</h2>
        <MetricCardGrid>
          <MetricCard
            title="Green (Primary)"
            value="$330.0M"
            icon={<Package className="w-6 h-6" />}
            color="green"
            subtitle="Color por defecto - Valores positivos"
          />
          
          <MetricCard
            title="Blue"
            value="8 lotes"
            icon={<MapPin className="w-6 h-6" />}
            color="blue"
            subtitle="Información neutral"
          />
          
          <MetricCard
            title="Yellow"
            value="3 alertas"
            icon={<Activity className="w-6 h-6" />}
            color="yellow"
            subtitle="Advertencias moderadas"
          />
          
          <MetricCard
            title="Red"
            value="2 críticas"
            icon={<Activity className="w-6 h-6" />}
            color="red"
            subtitle="Situaciones urgentes"
          />
          
          <MetricCard
            title="Gray"
            value="12,000"
            icon={<Sprout className="w-6 h-6" />}
            color="gray"
            subtitle="Datos neutrales"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 2: Tendencias */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">2. Indicadores de Tendencia</h2>
        <MetricCardGrid>
          <MetricCard
            title="Tendencia Positiva"
            value="$174.4M"
            icon={<DollarSign className="w-6 h-6" />}
            trend="up"
            trendValue="+12.5%"
            color="green"
            subtitle="Incremento respecto al mes anterior"
          />
          
          <MetricCard
            title="Tendencia Negativa"
            value="850 kg"
            icon={<Package className="w-6 h-6" />}
            trend="down"
            trendValue="-8.2%"
            color="red"
            subtitle="Disminución de stock"
          />
          
          <MetricCard
            title="Sin Cambios"
            value="42"
            icon={<Users className="w-6 h-6" />}
            trend="neutral"
            trendValue="0%"
            color="gray"
            subtitle="Clientes activos estables"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 3: Con y Sin Subtitle */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">3. Con y Sin Subtítulo</h2>
        <MetricCardGrid>
          <MetricCard
            title="Sin Subtítulo"
            value="$4,250,000"
            icon={<Package className="w-6 h-6" />}
            color="green"
          />
          
          <MetricCard
            title="Con Subtítulo"
            value="$4,250,000"
            icon={<Package className="w-6 h-6" />}
            subtitle="Valor total del inventario"
            color="green"
          />
          
          <MetricCard
            title="Con Subtítulo Largo"
            value="4.8 ton"
            icon={<TrendingUp className="w-6 h-6" />}
            subtitle="Producción semanal promedio de aguacate Hass"
            color="green"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 4: Valores Diferentes */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">4. Tipos de Valores</h2>
        <MetricCardGrid>
          <MetricCard
            title="Valor Monetario"
            value="$4,250,000 COP"
            icon={<DollarSign className="w-6 h-6" />}
            color="green"
          />
          
          <MetricCard
            title="Valor Numérico"
            value={42}
            icon={<Users className="w-6 h-6" />}
            color="blue"
          />
          
          <MetricCard
            title="Valor con Unidad"
            value="4.8 ton"
            icon={<Package className="w-6 h-6" />}
            color="green"
          />
          
          <MetricCard
            title="Valor Porcentual"
            value="85.5%"
            icon={<Activity className="w-6 h-6" />}
            color="yellow"
          />
          
          <MetricCard
            title="Valor Compacto"
            value="$330.0M"
            icon={<DollarSign className="w-6 h-6" />}
            color="green"
          />
          
          <MetricCard
            title="Valor Decimal"
            value="0.400 kg/árbol"
            icon={<Sprout className="w-6 h-6" />}
            color="gray"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 5: Estados de Carga */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">5. Estados de Carga</h2>
        <MetricCardGrid>
          <MetricCard
            title="Cargando..."
            value="--"
            icon={<Activity className="w-6 h-6" />}
            loading={true}
          />
          
          <MetricCardSkeleton />
          
          <MetricCard
            title="Card Normal"
            value="$4,250,000"
            icon={<Package className="w-6 h-6" />}
            color="green"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 6: Cards Clickeables */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">6. Interactividad (Hover para ver)</h2>
        <MetricCardGrid>
          <MetricCard
            title="Card Clickeable"
            value="$4,250,000"
            icon={<Package className="w-6 h-6" />}
            color="green"
            subtitle="Haz click para navegar"
            onClick={() => alert('Navegando a Inventario...')}
          />
          
          <MetricCard
            title="Card Normal (No Clickeable)"
            value="8 lotes"
            icon={<MapPin className="w-6 h-6" />}
            color="blue"
            subtitle="Sin acción al hacer click"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 7: Dashboard Real Completo */}
      <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-8 border border-[#73991C]/10">
        <h2 className="text-2xl text-[#172E08] mb-6">7. Dashboard Completo - Escocia Hass</h2>
        <MetricCardGrid>
          <MetricCard
            title="INVENTARIO"
            value="$330.0M"
            icon={<Package className="w-6 h-6" />}
            trend="up"
            trendValue="+5.2%"
            color="green"
            subtitle="3 productos con stock bajo"
            onClick={() => console.log('→ Inventario')}
          />

          <MetricCard
            title="PRODUCCIÓN"
            value="4.8 ton"
            icon={<TrendingUp className="w-6 h-6" />}
            trend="up"
            trendValue="+12.8%"
            color="green"
            subtitle="Promedio: 0.400 kg/árbol"
            onClick={() => console.log('→ Producción')}
          />

          <MetricCard
            title="VENTAS"
            value="$174.4M"
            icon={<DollarSign className="w-6 h-6" />}
            trend="up"
            trendValue="+8.5%"
            color="blue"
            subtitle="6 clientes activos"
            onClick={() => console.log('→ Ventas')}
          />

          <MetricCard
            title="APLICACIONES"
            value="5 activas"
            icon={<Sprout className="w-6 h-6" />}
            trend="neutral"
            trendValue="0"
            color="yellow"
            subtitle="Próxima: Fertilización foliar"
            onClick={() => console.log('→ Aplicaciones')}
          />

          <MetricCard
            title="MONITOREO"
            value="2 críticas"
            icon={<Activity className="w-6 h-6" />}
            trend="down"
            trendValue="-1"
            color="red"
            subtitle="Phytophthora en Lote B-3"
            onClick={() => console.log('→ Monitoreo')}
          />

          <MetricCard
            title="LOTES"
            value="8"
            icon={<MapPin className="w-6 h-6" />}
            color="gray"
            subtitle="Más productivo: A-1 (6.5 ha)"
            onClick={() => console.log('→ Lotes')}
          />
        </MetricCardGrid>
      </section>

      {/* Sección 8: Comparación de Tamaños */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">8. Variantes de Tamaño de Icono</h2>
        <MetricCardGrid>
          <MetricCard
            title="Icono Pequeño"
            value="$4,250,000"
            icon={<Package className="w-4 h-4" />}
            color="green"
            subtitle="w-4 h-4"
          />
          
          <MetricCard
            title="Icono Normal"
            value="$4,250,000"
            icon={<Package className="w-6 h-6" />}
            color="green"
            subtitle="w-6 h-6 (recomendado)"
          />
          
          <MetricCard
            title="Icono Grande"
            value="$4,250,000"
            icon={<Package className="w-8 h-8" />}
            color="green"
            subtitle="w-8 h-8"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 9: Combinaciones Avanzadas */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">9. Combinaciones Avanzadas</h2>
        <MetricCardGrid>
          <MetricCard
            title="Todo Completo"
            value="$174.4M"
            icon={<DollarSign className="w-6 h-6" />}
            trend="up"
            trendValue="+12.5%"
            color="green"
            subtitle="Con todas las props activadas"
            onClick={() => alert('Card completa!')}
          />
          
          <MetricCard
            title="Crítico con Tendencia"
            value="2 incidencias"
            icon={<Activity className="w-6 h-6" />}
            trend="up"
            trendValue="+1"
            color="red"
            subtitle="Requiere atención inmediata"
          />
          
          <MetricCard
            title="Advertencia Neutral"
            value="Stock: 100 kg"
            icon={<Package className="w-6 h-6" />}
            trend="neutral"
            trendValue="0%"
            color="yellow"
            subtitle="Nivel adecuado"
          />
        </MetricCardGrid>
      </section>

      {/* Sección 10: Responsive Demo */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">10. Demo Responsive</h2>
        <div className="bg-white/40 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-gray-600">
            El grid se adapta automáticamente:
            <br />
            📱 Mobile (&lt; 768px): 1 columna
            <br />
            📱 Tablet (768-1024px): 2 columnas
            <br />
            💻 Desktop (&gt; 1024px): 3 columnas
          </p>
          <MetricCardGrid>
            <MetricCard
              title="Card 1"
              value="Valor 1"
              icon={<Package className="w-6 h-6" />}
              color="green"
            />
            <MetricCard
              title="Card 2"
              value="Valor 2"
              icon={<TrendingUp className="w-6 h-6" />}
              color="blue"
            />
            <MetricCard
              title="Card 3"
              value="Valor 3"
              icon={<DollarSign className="w-6 h-6" />}
              color="yellow"
            />
            <MetricCard
              title="Card 4"
              value="Valor 4"
              icon={<Users className="w-6 h-6" />}
              color="red"
            />
          </MetricCardGrid>
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 pt-8 border-t border-gray-200">
        <p>MetricCard Component v1.0</p>
        <p className="mt-2">Sistema Escocia Hass • Noviembre 2024</p>
      </div>
    </div>
  );
}

export default MetricCardShowcase;