// ARCHIVO TEMPORAL — arnés de comparación para el torneo de rediseño de
// PriorizacionScouting. Renderiza las 4 propuestas con exactamente los mismos
// datos fijos (fixtureEntries.ts) detrás de un selector, para que las capturas
// de pantalla sean comparables entre sí. NO requiere autenticación (ruta
// pública temporal registrada en App.tsx) porque este sandbox no tiene acceso
// de red a Supabase Auth. Se elimina junto con el resto de esta carpeta y la
// ruta temporal en App.tsx al cerrar el torneo — nunca debe llegar a producción.
import { useState } from 'react';
import { FIXTURE_ENTRIES } from './fixtureEntries';
import { ConceptA } from './ConceptA';
import { ConceptB } from './ConceptB';
import { ConceptC } from './ConceptC';
import { ConceptD } from './ConceptD';

const CONCEPTS = [
  { id: 'A', label: 'Concepto A', Component: ConceptA },
  { id: 'B', label: 'Concepto B', Component: ConceptB },
  { id: 'C', label: 'Concepto C', Component: ConceptC },
  { id: 'D', label: 'Concepto D', Component: ConceptD },
] as const;

export function PriorizacionTournamentHarness() {
  const [active, setActive] = useState<(typeof CONCEPTS)[number]['id']>('A');
  const current = CONCEPTS.find((c) => c.id === active)!;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mb-4 flex items-center gap-2 flex-wrap border-b pb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-2">
          Torneo (temporal) —
        </span>
        {CONCEPTS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
              active === c.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-foreground border-border hover:bg-muted'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="max-w-5xl mx-auto">
        <current.Component entries={FIXTURE_ENTRIES} />
      </div>
    </div>
  );
}

export default PriorizacionTournamentHarness;
