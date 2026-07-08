// ARCHIVO TEMPORAL — placeholder del torneo de diseño. Un agente constructor
// reemplaza el contenido de este archivo. Se elimina junto con
// src/components/monitoreo/tournament/ al cerrar el torneo.
import type { PriorizacionEntry } from '../../../utils/priorizacionMonitoreo';

export function ConceptA({ entries }: { entries: PriorizacionEntry[] }) {
  return <div className="p-4 text-sm text-muted-foreground">Concept A placeholder — {entries.length} entradas</div>;
}

export default ConceptA;
