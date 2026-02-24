import { useState } from 'react';
import { Button } from '../ui/button';
import { Plus } from 'lucide-react';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { TablaMonitoreos } from './TablaMonitoreos';
import { RegistroMonitoreo } from './RegistroMonitoreo';

/**
 * Componente para ver todos los registros de monitoreo
 * Incluye botón para agregar registro y tabla agrupada por semana
 */
export function RegistrosMonitoreo() {
  const [mostrarRegistroMonitoreo, setMostrarRegistroMonitoreo] = useState(false);

  return (
    <div className="space-y-6">
      {/* SubNav de Monitoreo */}
      <MonitoreoSubNav />
      
      {/* Header con botón Agregar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-foreground">Registros de Monitoreo</h2>
          <p className="text-sm text-brand-brown/70 mt-1">
            Todos los registros agrupados por semana
          </p>
        </div>
        <Button
          onClick={() => setMostrarRegistroMonitoreo(true)}
          className="bg-gradient-to-br from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white shadow-md hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar registro
        </Button>
      </div>

      {/* Tabla de Monitoreos */}
      <TablaMonitoreos />

      {/* Modal de Registro de Monitoreo */}
      <RegistroMonitoreo
        open={mostrarRegistroMonitoreo}
        onClose={() => setMostrarRegistroMonitoreo(false)}
        onSuccess={() => {
          setMostrarRegistroMonitoreo(false);
          // Recargar la tabla
          window.location.reload();
        }}
      />
    </div>
  );
}
