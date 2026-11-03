import { validarCobertura, type Coverage, type PopulationProof } from './escoEvidencia.ts';

export interface PaginaObservada {
  offset: number;
  requested: number;
  identities: readonly string[];
  count: number | null;
}
export interface AuditoriaPaginas {
  rowsRead: number;
  expectedRows: number | null;
  identityUnique: boolean;
  consistency: Coverage['consistency'];
  complete: boolean;
  reasons: string[];
  /** Stable counters cannot prove unchanged membership/values between requests. */
  atomicSnapshot: false;
}

/** Diagnostics for the trusted read port. Never creates PopulationProof or grants access.
 * Single reads also require an exact counter: a short response can be a server cap.
 */
export function auditarPaginas(paginas: readonly PaginaObservada[], maxFilas = 20000): AuditoriaPaginas {
  const reasons = new Set<string>();
  let rowsRead = 0;
  let identityUnique = true;
  let expectedRows: number | null = null;
  const ids = new Set<string>();
  if (!Number.isSafeInteger(maxFilas) || maxFilas < 1 || maxFilas > 20000) reasons.add('budget_exceeded');
  if (!paginas.length) reasons.add('missing_count');
  for (const p of paginas) {
    if (!Number.isSafeInteger(p.offset) || p.offset !== rowsRead || !Number.isSafeInteger(p.requested) || p.requested < 1 || p.identities.length > p.requested) reasons.add('incomplete_population');
    if (p.count === null) reasons.add('missing_count');
    else if (!Number.isSafeInteger(p.count) || p.count < 0) reasons.add('invalid_value');
    else if (expectedRows === null) expectedRows = p.count;
    else if (p.count !== expectedRows) reasons.add('unstable_count');
    for (const id of p.identities) {
      if (typeof id !== 'string' || !id || id.length > 128 || id.trim() !== id || Array.from(id).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) { identityUnique = false; reasons.add('invalid_value'); }
      if (ids.has(id)) { identityUnique = false; reasons.add('duplicate_identity'); }
      ids.add(id);
    }
    rowsRead += p.identities.length;
    if (rowsRead > maxFilas) reasons.add('budget_exceeded');
  }
  if (expectedRows !== rowsRead) reasons.add('incomplete_population');
  const complete = reasons.size === 0 && identityUnique;
  return { rowsRead, expectedRows, identityUnique,
    consistency: complete ? paginas.length === 1 ? 'single_read' : 'stable_count_pages' : 'not_attested',
    complete, reasons: [...reasons], atomicSnapshot: false };
}

/** Copies population authority only from the external read-port proof, never row inference. */
export function coberturaDesdePrueba(proof: PopulationProof, missingValues: number, reasons: readonly string[] = [], valoresParciales = false): Coverage {
  const c: Coverage = { populationId: proof.populationId, population: proof.population,
    rowsRead: proof.rowsRead, expectedRows: proof.expectedRows, identityUnique: proof.identityUnique, consistency: proof.consistency,
    missingValues, values: missingValues === 0 && !valoresParciales ? 'complete' : missingValues === proof.rowsRead && missingValues > 0 ? 'unknown' : 'partial',
    reasons: [...new Set([...reasons, ...(proof.population !== 'complete' ? ['incomplete_population'] : []), ...(!proof.identityUnique ? ['duplicate_identity'] : [])])],
  };
  if (!validarCobertura(c)) throw new Error('invalid_value');
  return c;
}
