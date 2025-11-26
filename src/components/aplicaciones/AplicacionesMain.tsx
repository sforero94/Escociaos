// ARCHIVO: components/aplicaciones/AplicacionesMain.tsx
// DESCRIPCIÓN: Componente principal con navegación por tabs para módulo de Aplicaciones
// Tabs: Tablero | Historial | Reportes | GlobalGAP

import { useState } from 'react';
import { LayoutDashboard, History, BarChart3, FileCheck } from 'lucide-react';
import { AplicacionesList } from './AplicacionesList';
import { HistorialAplicaciones } from './HistorialAplicaciones';
import { TendenciasAplicaciones } from './TendenciasAplicaciones';
import { GlobalGAPExport } from './GlobalGAPExport';

type VistaAplicaciones = 'tablero' | 'historial' | 'tendencias' | 'globalgap';

export function AplicacionesMain() {
  const [vistaActual, setVistaActual] = useState<VistaAplicaciones>('tablero');

  const tabs = [
    {
      id: 'tablero' as VistaAplicaciones,
      label: 'Tablero',
      icon: LayoutDashboard,
      descripcion: 'Vista general y nueva aplicación',
    },
    {
      id: 'historial' as VistaAplicaciones,
      label: 'Historial',
      icon: History,
      descripcion: 'Todas las aplicaciones con filtros',
    },
    {
      id: 'tendencias' as VistaAplicaciones,
      label: 'Análisis de Tendencias',
      icon: BarChart3,
      descripcion: 'Gráficos y evolución',
    },
    {
      id: 'globalgap' as VistaAplicaciones,
      label: 'GlobalGAP',
      icon: FileCheck,
      descripcion: 'Exportación certificada',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAF5]">
      {/* Header con navegación */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Título principal */}
          <div className="py-4 border-b border-gray-100">
            <h1 className="text-2xl font-bold text-[#172E08]">
              Gestión de Aplicaciones
            </h1>
            <p className="text-sm text-[#4D240F]/70 mt-1">
              Planificación, ejecución y análisis de fumigaciones y fertilizaciones
            </p>
          </div>

          {/* Tabs de navegación */}
          <div className="flex gap-2 overflow-x-auto py-3">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = vistaActual === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setVistaActual(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap
                    transition-all duration-200 min-w-fit
                    ${
                      isActive
                        ? 'bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white shadow-sm'
                        : 'text-[#4D240F]/70 hover:bg-[#E7EDDD]/50 hover:text-[#172E08]'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? '' : 'opacity-70'}`} />
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-sm">{tab.label}</span>
                    {!isActive && (
                      <span className="text-xs opacity-60">{tab.descripcion}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Contenido según vista activa */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {vistaActual === 'tablero' && <AplicacionesList />}
        {vistaActual === 'historial' && <HistorialAplicaciones />}
        {vistaActual === 'tendencias' && <TendenciasAplicaciones />}
        {vistaActual === 'globalgap' && <GlobalGAPExport />}
      </div>
    </div>
  );
}
