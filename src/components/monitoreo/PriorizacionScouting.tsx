// ARCHIVO: components/monitoreo/PriorizacionScouting.tsx
// DESCRIPCIÓN: Wrapper delgado de "priorización de scouting" — P2 de
// docs/PLAN_PRIORIZACION_MONITOREO.md. Toda la presentación vive en
// `PriorizacionScoutingView.tsx` (versión de producción del Concepto B
// ganador del torneo, ver src/components/monitoreo/tournament/); este
// archivo sólo conecta el hook de datos (`usePriorizacionMonitoreo`, sin
// modificar) con la vista y conserva el botón "Actualizar" + el patrón de
// carga inicial que ya existía.

import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { usePriorizacionMonitoreo } from './hooks/usePriorizacionMonitoreo';
import { PriorizacionScoutingView } from './PriorizacionScoutingView';
import type { PriorizacionEntry } from '../../utils/priorizacionMonitoreo';

export function PriorizacionScouting() {
  const { loading, error, cargarPriorizacion } = usePriorizacionMonitoreo();
  const [entradas, setEntradas] = useState<PriorizacionEntry[]>([]);
  // `usePriorizacionMonitoreo().loading` arranca en `false` (sólo se pone en
  // `true` dentro de `cargarPriorizacion`), así que sin esta bandera la vista
  // mostraría un instante el estado "vacío" antes de que el efecto inicial
  // dispare la primera carga. Se apaga apenas la primera carga resuelve
  // (éxito o error), igual que el `cargado` del componente anterior.
  const [primeraCargaPendiente, setPrimeraCargaPendiente] = useState(true);

  const recargar = useCallback(() => {
    cargarPriorizacion()
      .then((resultado) => {
        setEntradas(resultado);
      })
      .catch(() => {
        // El error ya queda expuesto vía `error` del hook; nada más que hacer aquí.
      })
      .finally(() => {
        setPrimeraCargaPendiente(false);
      });
  }, [cargarPriorizacion]);

  useEffect(() => {
    recargar();
    // Sólo al montar — recargar es estable (useCallback sin deps externas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button variant="outline" size="sm" onClick={recargar} disabled={loading} className="gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <PriorizacionScoutingView entries={entradas} loading={loading || primeraCargaPendiente} error={error} />
    </div>
  );
}

export default PriorizacionScouting;
