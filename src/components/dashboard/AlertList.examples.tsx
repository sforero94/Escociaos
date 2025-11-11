/**
 * EJEMPLOS DE USO - AlertList Component
 * 
 * Este archivo muestra todos los casos de uso del componente AlertList
 */

import {
  AlertList,
  AlertListHeader,
  AlertListContainer,
  AlertEmptyState,
  Alerta,
} from './AlertList';

/**
 * EJEMPLO 1: Lista básica de alertas
 */
export function BasicAlertListExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: '⚠️ Stock bajo: Urea 46% - Solo quedan 50 kg',
      fecha: new Date(Date.now() - 2 * 60 * 60 * 1000), // Hace 2 horas
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'monitoreo',
      mensaje: '🔴 Phytophthora detectada en Lote B-3 - Nivel crítico',
      fecha: new Date(Date.now() - 1 * 60 * 60 * 1000), // Hace 1 hora
      prioridad: 'alta',
    },
    {
      id: 3,
      tipo: 'vencimiento',
      mensaje: '📅 Aplicación programada: Fertilización foliar mañana',
      fecha: new Date(Date.now() - 30 * 60 * 1000), // Hace 30 min
      prioridad: 'media',
    },
  ];

  return <AlertList alertas={alertas} />;
}

/**
 * EJEMPLO 2: Lista con header y container
 */
export function AlertListWithHeaderExample() {
  const alertas: Alerta[] = [
    {
      tipo: 'stock',
      mensaje: 'Stock bajo: Fungicida Ridomil',
      fecha: new Date(),
      prioridad: 'alta',
    },
    {
      tipo: 'monitoreo',
      mensaje: 'Trips detectados en Lote A-1',
      fecha: new Date(),
      prioridad: 'media',
    },
  ];

  return (
    <AlertListContainer>
      <AlertListHeader titulo="Alertas Recientes" count={alertas.length} />
      <AlertList alertas={alertas} />
    </AlertListContainer>
  );
}

/**
 * EJEMPLO 3: Estado de carga
 */
export function LoadingAlertListExample() {
  return <AlertList alertas={[]} loading={true} />;
}

/**
 * EJEMPLO 4: Sin alertas - Todo en orden
 */
export function EmptyAlertListExample() {
  return <AlertList alertas={[]} loading={false} />;
}

/**
 * EJEMPLO 5: Todas las prioridades
 */
export function AllPrioritiesExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: 'Prioridad ALTA: Stock crítico de Urea 46%',
      fecha: new Date(),
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'vencimiento',
      mensaje: 'Prioridad MEDIA: Aplicación programada para mañana',
      fecha: new Date(),
      prioridad: 'media',
    },
    {
      id: 3,
      tipo: 'monitoreo',
      mensaje: 'Prioridad BAJA: Inspección rutinaria pendiente',
      fecha: new Date(),
      prioridad: 'baja',
    },
  ];

  return <AlertList alertas={alertas} />;
}

/**
 * EJEMPLO 6: Todos los tipos de alertas
 */
export function AllTypesExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: 'Tipo STOCK: Stock bajo de fertilizante',
      fecha: new Date(),
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'vencimiento',
      mensaje: 'Tipo VENCIMIENTO: Aplicación programada próximamente',
      fecha: new Date(),
      prioridad: 'media',
    },
    {
      id: 3,
      tipo: 'monitoreo',
      mensaje: 'Tipo MONITOREO: Plaga detectada en cultivo',
      fecha: new Date(),
      prioridad: 'alta',
    },
  ];

  return <AlertList alertas={alertas} />;
}

/**
 * EJEMPLO 7: Con callback onClick
 */
export function ClickableAlertListExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: 'Haz click para ver detalles del inventario',
      fecha: new Date(),
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'monitoreo',
      mensaje: 'Haz click para ver el registro de monitoreo',
      fecha: new Date(),
      prioridad: 'media',
    },
  ];

  const handleAlertClick = (alerta: Alerta) => {
    alert(`Navegando a detalles de: ${alerta.mensaje}`);
    console.log('Alerta clicked:', alerta);
  };

  return <AlertList alertas={alertas} onAlertClick={handleAlertClick} />;
}

/**
 * EJEMPLO 8: Más de 5 alertas (muestra indicador)
 */
export function MoreThan5AlertsExample() {
  const alertas: Alerta[] = Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    tipo: ['stock', 'vencimiento', 'monitoreo'][i % 3] as Alerta['tipo'],
    mensaje: `Alerta #${i + 1}: Descripción de la alerta`,
    fecha: new Date(Date.now() - i * 60 * 60 * 1000),
    prioridad: ['alta', 'media', 'baja'][i % 3] as Alerta['prioridad'],
  }));

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Total de alertas: {alertas.length} (mostrando máximo 5)
      </p>
      <AlertList alertas={alertas} maxAlertas={5} />
    </div>
  );
}

/**
 * EJEMPLO 9: Alertas desde API (simulación)
 */
export function AlertsFromAPIExample() {
  const [alertas, setAlertas] = React.useState<Alerta[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Simular carga de API
    setTimeout(() => {
      setAlertas([
        {
          id: 1,
          tipo: 'stock',
          mensaje: 'Datos cargados desde API: Stock bajo',
          fecha: new Date(),
          prioridad: 'alta',
        },
        {
          id: 2,
          tipo: 'monitoreo',
          mensaje: 'Monitoreo crítico detectado',
          fecha: new Date(),
          prioridad: 'alta',
        },
      ]);
      setLoading(false);
    }, 2000);
  }, []);

  return <AlertList alertas={alertas} loading={loading} />;
}

/**
 * EJEMPLO 10: Dashboard completo con alertas
 */
export function CompleteDashboardAlertExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: '⚠️ Stock bajo: Urea 46%',
      fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'stock',
      mensaje: '⚠️ Stock bajo: Fungicida Ridomil',
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
      mensaje: '📅 Aplicación programada: Fertilización foliar',
      fecha: new Date(Date.now() - 30 * 60 * 1000),
      prioridad: 'media',
    },
    {
      id: 5,
      tipo: 'monitoreo',
      mensaje: 'ℹ️ Inspección rutinaria: Lote A-1',
      fecha: new Date(Date.now() - 4 * 60 * 60 * 1000),
      prioridad: 'baja',
    },
  ];

  const handleAlertClick = (alerta: Alerta) => {
    // Navegar según el tipo
    if (alerta.tipo === 'stock') {
      console.log('→ Navegando a Inventario');
    } else if (alerta.tipo === 'monitoreo') {
      console.log('→ Navegando a Monitoreo');
    } else if (alerta.tipo === 'vencimiento') {
      console.log('→ Navegando a Aplicaciones');
    }
  };

  return (
    <div className="space-y-6 bg-[#F8FAF5] p-8">
      <div>
        <h1 className="text-2xl text-[#172E08] mb-2">Dashboard - Escocia Hass</h1>
        <p className="text-[#4D240F]/70">Vista general del cultivo</p>
      </div>

      {/* Sección de alertas */}
      <AlertListContainer>
        <AlertListHeader titulo="Alertas Recientes" count={alertas.length} />
        <AlertList alertas={alertas} onAlertClick={handleAlertClick} />
      </AlertListContainer>
    </div>
  );
}

/**
 * EJEMPLO 11: AlertEmptyState personalizado
 */
export function CustomEmptyStateExample() {
  return (
    <div className="space-y-6">
      {/* Empty state default */}
      <AlertEmptyState />

      {/* Empty state personalizado */}
      <AlertEmptyState
        titulo="Sin alertas críticas"
        descripcion="Todas las operaciones funcionan correctamente"
      />
    </div>
  );
}

/**
 * EJEMPLO 12: Alertas con fechas relativas
 */
export function RelativeTimesExample() {
  const alertas: Alerta[] = [
    {
      id: 1,
      tipo: 'stock',
      mensaje: 'Hace 5 minutos',
      fecha: new Date(Date.now() - 5 * 60 * 1000),
      prioridad: 'alta',
    },
    {
      id: 2,
      tipo: 'stock',
      mensaje: 'Hace 2 horas',
      fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
      prioridad: 'media',
    },
    {
      id: 3,
      tipo: 'monitoreo',
      mensaje: 'Hace 1 día',
      fecha: new Date(Date.now() - 24 * 60 * 60 * 1000),
      prioridad: 'baja',
    },
    {
      id: 4,
      tipo: 'vencimiento',
      mensaje: 'Hace 3 días',
      fecha: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      prioridad: 'baja',
    },
  ];

  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">
        Las fechas se muestran en formato relativo ("hace X tiempo")
      </p>
      <AlertList alertas={alertas} />
    </div>
  );
}

/**
 * EJEMPLO 13: Integración con Dashboard real
 */
export function DashboardIntegrationExample() {
  // Simular datos de Supabase
  const data = {
    inventoryAlerts: 3,
    criticalIncidents: 2,
  };

  const alertas: Alerta[] = [
    ...(data.inventoryAlerts > 0
      ? [
          {
            id: 'inv-1',
            tipo: 'stock' as const,
            mensaje: `⚠️ ${data.inventoryAlerts} productos con stock bajo`,
            fecha: new Date(),
            prioridad: 'alta' as const,
          },
        ]
      : []),
    ...(data.criticalIncidents > 0
      ? [
          {
            id: 'mon-1',
            tipo: 'monitoreo' as const,
            mensaje: `🔴 ${data.criticalIncidents} incidencias críticas detectadas`,
            fecha: new Date(),
            prioridad: 'alta' as const,
          },
        ]
      : []),
  ];

  return (
    <AlertListContainer>
      <AlertListHeader titulo="Alertas del Sistema" count={alertas.length} />
      <AlertList
        alertas={alertas}
        onAlertClick={(alerta) => {
          if (alerta.tipo === 'stock') {
            console.log('→ Ir a Inventario');
          } else if (alerta.tipo === 'monitoreo') {
            console.log('→ Ir a Monitoreo');
          }
        }}
      />
    </AlertListContainer>
  );
}

// Fix para el ejemplo 9 - agregar React import
import React from 'react';
