/**
 * SHOWCASE - AlertList Component
 * 
 * Visualización completa de todas las variantes y estados
 * Usar como referencia visual o página de demo
 */

import {
  AlertList,
  AlertListHeader,
  AlertListContainer,
  AlertEmptyState,
  Alerta,
} from './AlertList';

export function AlertListShowcase() {
  return (
    <div className="min-h-screen bg-[#F8FAF5] p-8 space-y-12">
      {/* Header */}
      <div>
        <h1 className="text-4xl text-[#172E08] mb-2">AlertList Showcase</h1>
        <p className="text-[#4D240F]/70">
          Todas las variantes y estados del componente AlertList
        </p>
      </div>

      {/* Sección 1: Prioridades */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">1. Niveles de Prioridad</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alta */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Prioridad Alta</h3>
            <AlertList
              alertas={[
                {
                  id: 1,
                  tipo: 'stock',
                  mensaje: 'Stock crítico: Urea 46% - Solo 20 kg disponibles',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
                {
                  id: 2,
                  tipo: 'monitoreo',
                  mensaje: 'Phytophthora detectada en Lote B-3',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
              ]}
            />
          </div>

          {/* Media */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Prioridad Media</h3>
            <AlertList
              alertas={[
                {
                  id: 1,
                  tipo: 'vencimiento',
                  mensaje: 'Aplicación programada para mañana',
                  fecha: new Date(),
                  prioridad: 'media',
                },
                {
                  id: 2,
                  tipo: 'stock',
                  mensaje: 'Stock moderado de fertilizante',
                  fecha: new Date(),
                  prioridad: 'media',
                },
              ]}
            />
          </div>

          {/* Baja */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Prioridad Baja</h3>
            <AlertList
              alertas={[
                {
                  id: 1,
                  tipo: 'monitoreo',
                  mensaje: 'Inspección rutinaria pendiente',
                  fecha: new Date(),
                  prioridad: 'baja',
                },
                {
                  id: 2,
                  tipo: 'vencimiento',
                  mensaje: 'Mantenimiento programado',
                  fecha: new Date(),
                  prioridad: 'baja',
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Sección 2: Tipos de Alertas */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">2. Tipos de Alertas</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stock */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">
              Tipo: Stock (AlertTriangle)
            </h3>
            <AlertList
              alertas={[
                {
                  tipo: 'stock',
                  mensaje: 'Stock bajo de Urea 46%',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
                {
                  tipo: 'stock',
                  mensaje: 'Stock moderado de Fungicida',
                  fecha: new Date(),
                  prioridad: 'media',
                },
              ]}
            />
          </div>

          {/* Vencimiento */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">
              Tipo: Vencimiento (Calendar)
            </h3>
            <AlertList
              alertas={[
                {
                  tipo: 'vencimiento',
                  mensaje: 'Aplicación programada: Fertilización',
                  fecha: new Date(),
                  prioridad: 'media',
                },
                {
                  tipo: 'vencimiento',
                  mensaje: 'Cosecha programada: Lote A-1',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
              ]}
            />
          </div>

          {/* Monitoreo */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Tipo: Monitoreo (Bug)</h3>
            <AlertList
              alertas={[
                {
                  tipo: 'monitoreo',
                  mensaje: 'Phytophthora: Nivel crítico',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
                {
                  tipo: 'monitoreo',
                  mensaje: 'Trips detectados en Lote C-2',
                  fecha: new Date(),
                  prioridad: 'media',
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Sección 3: Estados */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">3. Estados del Componente</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Loading */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Estado: Loading</h3>
            <AlertList alertas={[]} loading={true} />
          </div>

          {/* Empty */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Estado: Vacío</h3>
            <AlertList alertas={[]} loading={false} />
          </div>

          {/* Con datos */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Estado: Con Datos</h3>
            <AlertList
              alertas={[
                {
                  tipo: 'stock',
                  mensaje: 'Alerta de ejemplo',
                  fecha: new Date(),
                  prioridad: 'alta',
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Sección 4: Fechas Relativas */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">4. Fechas Relativas</h2>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-2xl">
          <AlertList
            alertas={[
              {
                id: 1,
                tipo: 'stock',
                mensaje: 'Alerta de hace 5 minutos',
                fecha: new Date(Date.now() - 5 * 60 * 1000),
                prioridad: 'alta',
              },
              {
                id: 2,
                tipo: 'monitoreo',
                mensaje: 'Alerta de hace 1 hora',
                fecha: new Date(Date.now() - 1 * 60 * 60 * 1000),
                prioridad: 'media',
              },
              {
                id: 3,
                tipo: 'vencimiento',
                mensaje: 'Alerta de hace 2 horas',
                fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
                prioridad: 'media',
              },
              {
                id: 4,
                tipo: 'stock',
                mensaje: 'Alerta de hace 1 día',
                fecha: new Date(Date.now() - 24 * 60 * 60 * 1000),
                prioridad: 'baja',
              },
              {
                id: 5,
                tipo: 'monitoreo',
                mensaje: 'Alerta de hace 3 días',
                fecha: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
                prioridad: 'baja',
              },
            ]}
          />
        </div>
      </section>

      {/* Sección 5: Máximo de Alertas */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">
          5. Límite de Alertas (Max 5 por defecto)
        </h2>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-2xl">
          <p className="text-sm text-gray-600 mb-4">
            De 12 alertas totales, solo se muestran las primeras 5:
          </p>
          <AlertList
            alertas={Array.from({ length: 12 }, (_, i) => ({
              id: i + 1,
              tipo: ['stock', 'vencimiento', 'monitoreo'][i % 3] as Alerta['tipo'],
              mensaje: `Alerta número ${i + 1}: Descripción de la alerta`,
              fecha: new Date(Date.now() - i * 60 * 60 * 1000),
              prioridad: ['alta', 'media', 'baja'][i % 3] as Alerta['prioridad'],
            }))}
            maxAlertas={5}
          />
        </div>
      </section>

      {/* Sección 6: Con Container y Header */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">
          6. Con AlertListContainer y Header
        </h2>
        
        <div className="max-w-3xl">
          <AlertListContainer>
            <AlertListHeader titulo="Alertas Recientes" count={8} />
            <AlertList
              alertas={[
                {
                  id: 1,
                  tipo: 'stock',
                  mensaje: '⚠️ Stock bajo: Urea 46%',
                  fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
                  prioridad: 'alta',
                },
                {
                  id: 2,
                  tipo: 'monitoreo',
                  mensaje: '🔴 Phytophthora: Nivel crítico en Lote B-3',
                  fecha: new Date(Date.now() - 1 * 60 * 60 * 1000),
                  prioridad: 'alta',
                },
                {
                  id: 3,
                  tipo: 'vencimiento',
                  mensaje: '📅 Aplicación programada: Fertilización foliar',
                  fecha: new Date(Date.now() - 30 * 60 * 1000),
                  prioridad: 'media',
                },
              ]}
            />
          </AlertListContainer>
        </div>
      </section>

      {/* Sección 7: Interactividad */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">
          7. Alertas Interactivas (Hover para ver efecto)
        </h2>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-2xl">
          <p className="text-sm text-gray-600 mb-4">
            Haz click en una alerta para ver el callback:
          </p>
          <AlertList
            alertas={[
              {
                id: 1,
                tipo: 'stock',
                mensaje: 'Click aquí para ver detalles del inventario',
                fecha: new Date(),
                prioridad: 'alta',
              },
              {
                id: 2,
                tipo: 'monitoreo',
                mensaje: 'Click aquí para ver el monitoreo',
                fecha: new Date(),
                prioridad: 'media',
              },
            ]}
            onAlertClick={(alerta) => {
              alert(`Navegando a: ${alerta.tipo}\n\n${alerta.mensaje}`);
            }}
          />
        </div>
      </section>

      {/* Sección 8: Dashboard Completo Real */}
      <section className="bg-white/60 backdrop-blur-sm rounded-3xl p-8 border border-[#73991C]/10">
        <h2 className="text-2xl text-[#172E08] mb-6">
          8. Dashboard Completo - Escocia Hass
        </h2>
        
        <AlertListContainer>
          <AlertListHeader titulo="Alertas del Sistema" count={5} />
          <AlertList
            alertas={[
              {
                id: 1,
                tipo: 'stock',
                mensaje: '⚠️ Stock bajo: Urea 46% - Solo quedan 50 kg',
                fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
                prioridad: 'alta',
              },
              {
                id: 2,
                tipo: 'stock',
                mensaje: '⚠️ Stock bajo: Fungicida Ridomil Gold',
                fecha: new Date(Date.now() - 3 * 60 * 60 * 1000),
                prioridad: 'alta',
              },
              {
                id: 3,
                tipo: 'monitoreo',
                mensaje: '🔴 Phytophthora: Nivel crítico en Lote B-3',
                fecha: new Date(Date.now() - 1 * 60 * 60 * 1000),
                prioridad: 'alta',
              },
              {
                id: 4,
                tipo: 'vencimiento',
                mensaje: '📅 Aplicación programada: Fertilización foliar completa',
                fecha: new Date(Date.now() - 30 * 60 * 1000),
                prioridad: 'media',
              },
              {
                id: 5,
                tipo: 'monitoreo',
                mensaje: 'ℹ️ Inspección rutinaria pendiente en Lote A-1',
                fecha: new Date(Date.now() - 4 * 60 * 60 * 1000),
                prioridad: 'baja',
              },
            ]}
            onAlertClick={(alerta) => {
              console.log('Navegando a:', alerta.tipo);
            }}
          />
        </AlertListContainer>
      </section>

      {/* Sección 9: Custom Empty States */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">9. Estados Vacíos Personalizados</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Default</h3>
            <AlertEmptyState />
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg text-[#172E08] mb-4">Personalizado</h3>
            <AlertEmptyState
              titulo="Sin alertas críticas"
              descripcion="Todas las operaciones del cultivo funcionan correctamente"
            />
          </div>
        </div>
      </section>

      {/* Sección 10: Combinación de Prioridades */}
      <section>
        <h2 className="text-2xl text-[#172E08] mb-6">
          10. Mezcla de Prioridades y Tipos
        </h2>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-2xl">
          <AlertList
            alertas={[
              {
                tipo: 'stock',
                mensaje: 'Alta prioridad - Stock crítico',
                fecha: new Date(),
                prioridad: 'alta',
              },
              {
                tipo: 'monitoreo',
                mensaje: 'Alta prioridad - Plaga detectada',
                fecha: new Date(),
                prioridad: 'alta',
              },
              {
                tipo: 'vencimiento',
                mensaje: 'Media prioridad - Aplicación próxima',
                fecha: new Date(),
                prioridad: 'media',
              },
              {
                tipo: 'stock',
                mensaje: 'Media prioridad - Stock moderado',
                fecha: new Date(),
                prioridad: 'media',
              },
              {
                tipo: 'monitoreo',
                mensaje: 'Baja prioridad - Inspección rutinaria',
                fecha: new Date(),
                prioridad: 'baja',
              },
            ]}
          />
        </div>
      </section>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 pt-8 border-t border-gray-200">
        <p>AlertList Component v1.0</p>
        <p className="mt-2">Sistema Escocia Hass • Noviembre 2024</p>
      </div>
    </div>
  );
}

export default AlertListShowcase;
