-- Migration 032: Unify duplicate "Beneficos" / "Benéficos" pest catalog entries
-- Canonical name: "Benéficos" (with accent)
-- Merge all monitoreos referencing the unaccented duplicate into the canonical entry, then delete duplicate.

BEGIN;

-- Update monitoreos that reference the duplicate (unaccented "Beneficos")
-- to point to the canonical entry ("Benéficos" with accent)
UPDATE monitoreos
SET plaga_enfermedad_id = (
  SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Benéficos' LIMIT 1
)
WHERE plaga_enfermedad_id = (
  SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Beneficos' LIMIT 1
);

-- Delete the duplicate entry (unaccented)
DELETE FROM plagas_enfermedades_catalogo
WHERE nombre = 'Beneficos';

COMMIT;
