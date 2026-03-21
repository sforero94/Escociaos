import { useState } from 'react';
import { Button } from '../ui/button';
import { Plus, ChevronDown, Bug, Zap, Hexagon } from 'lucide-react';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { TablaMonitoreos } from './TablaMonitoreos';
import { RegistroMonitoreo } from './RegistroMonitoreo';
import { RegistroConductividad } from './RegistroConductividad';
import { RegistroColmenas } from './RegistroColmenas';
import { TablaConductividad } from './tablas/TablaConductividad';
import { TablaColmenas } from './tablas/TablaColmenas';

type DominioTab = 'plagas' | 'conductividad' | 'colmenas';

const TABS: { id: DominioTab; label: string; icon: typeof Bug }[] = [
  { id: 'plagas', label: 'Plagas', icon: Bug },
  { id: 'conductividad', label: 'Conductividad', icon: Zap },
  { id: 'colmenas', label: 'Colmenas', icon: Hexagon },
];

export function RegistrosMonitoreo() {
  const [tabActiva, setTabActiva] = useState<DominioTab>('plagas');
  const [mostrarRegistroPlagas, setMostrarRegistroPlagas] = useState(false);
  const [mostrarRegistroCE, setMostrarRegistroCE] = useState(false);
  const [mostrarRegistroColmenas, setMostrarRegistroColmenas] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleRegistrar() {
    if (tabActiva === 'plagas') setMostrarRegistroPlagas(true);
    else if (tabActiva === 'conductividad') setMostrarRegistroCE(true);
    else if (tabActiva === 'colmenas') setMostrarRegistroColmenas(true);
  }

  function handleSuccess() {
    setRefreshKey(k => k + 1);
  }

  const labelRegistro = tabActiva === 'plagas'
    ? 'Registrar plagas'
    : tabActiva === 'conductividad'
      ? 'Registrar CE'
      : 'Registrar colmenas';

  return (
    <div className="space-y-6">
      <MonitoreoSubNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl text-foreground">Registros de Monitoreo</h2>
          <p className="text-sm text-brand-brown/70 mt-1">
            Registros de plagas, conductividad eléctrica y colmenas
          </p>
        </div>
        <Button
          onClick={handleRegistrar}
          className="bg-gradient-to-br from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white shadow-md hover:shadow-lg transition-all"
        >
          <Plus className="w-4 h-4 mr-2" />
          {labelRegistro}
        </Button>
      </div>

      {/* Domain tabs */}
      <div className="flex gap-1 border-b border-secondary/30">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const activa = tabActiva === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setTabActiva(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activa
                  ? 'border-primary text-primary'
                  : 'border-transparent text-brand-brown/60 hover:text-brand-brown hover:border-secondary/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Table by domain */}
      {tabActiva === 'plagas' && <TablaMonitoreos />}
      {tabActiva === 'conductividad' && <TablaConductividad refreshKey={refreshKey} />}
      {tabActiva === 'colmenas' && <TablaColmenas refreshKey={refreshKey} />}

      {/* Modals */}
      <RegistroMonitoreo
        open={mostrarRegistroPlagas}
        onClose={() => setMostrarRegistroPlagas(false)}
        onSuccess={() => {
          setMostrarRegistroPlagas(false);
          handleSuccess();
        }}
      />
      <RegistroConductividad
        open={mostrarRegistroCE}
        onClose={() => setMostrarRegistroCE(false)}
        onSuccess={handleSuccess}
      />
      <RegistroColmenas
        open={mostrarRegistroColmenas}
        onClose={() => setMostrarRegistroColmenas(false)}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
