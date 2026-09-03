export interface LoteCatalogo {
  id: string;
  nombre: string;
}

export function normalizarNombreLote(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const GENERICO =
  /^(este|ese|aquel|esta|esa|estos|esas)\s+(sector|tipo|lote|arbol|arboles|zona|parte)\b/i;

/**
 * FK a `lotes` solo con match claro: igualdad de nombre (sin acento, sin
 * prefijo "lote "). Cero o más de un candidato → null. Nunca substring.
 */
export function resolverLoteId(
  texto: string | null | undefined,
  lotes: LoteCatalogo[],
): string | null {
  if (!texto) return null;
  const crudo = texto.trim();
  if (!crudo) return null;
  if (GENERICO.test(crudo)) return null;

  const sinPrefijo = crudo.replace(/^lotes?\s+/i, '').trim();
  const n = normalizarNombreLote(sinPrefijo);
  if (n.length < 2) return null;

  const matches = lotes.filter((l) => normalizarNombreLote(l.nombre) === n);
  return matches.length === 1 ? matches[0].id : null;
}
