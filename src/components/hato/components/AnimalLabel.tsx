// ARCHIVO: components/hato/components/AnimalLabel.tsx
// DESCRIPCIÓN: Identidad del animal en filas de lista/alerta (Figma
// alignment spec §0c/§7) -- lidera con el NOMBRE cuando la chapeta es
// provisional (800-999, migración 066), y siempre muestra el chip
// "provisional" para que nadie salga a buscar esa caravana en el potrero.
// Extraído de `HatoDashboard.tsx` (Wave 1) como parte del refactor DRY de
// Wave 2b: `HatoDashboard.tsx` y `AlertasView.tsx` comparten este mismo
// componente + `nombreAnimalAlerta` (utils/hatoAlertas.ts) para no poder
// divergir en cómo identifican al mismo animal.

import { EstadoChip } from './EstadoChip';
import { chipNumeroProvisional } from '@/utils/hatoUi';
import { nombreAnimalAlerta } from '@/utils/hatoAlertas';
import type { AnimalHatoDerivado } from '../hooks/useHatoAnimales';

export function AnimalLabel({ animal }: { animal: AnimalHatoDerivado }) {
  const { principal, secundario } = nombreAnimalAlerta(animal);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 min-w-0">
      <span className="font-medium text-gray-900 truncate">{principal}</span>
      {secundario && <span className="text-gray-500">{secundario}</span>}
      {animal.numeroEsProvisional && <EstadoChip chip={chipNumeroProvisional()} />}
    </span>
  );
}
