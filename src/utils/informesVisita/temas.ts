/** Temas por nota. El usuario confirma o cambia chips; no son tipos de snippet. */

export const TEMAS_INFORME = [
  'fertilización',
  'fumigación',
  'inventario',
  'monitoreo',
  'planeacion labores',
  'observaciones',
  'alertas',
  'ideas',
] as const;

export type TemaInforme = (typeof TEMAS_INFORME)[number];

const SET_TEMAS = new Set<string>(TEMAS_INFORME);

const TIPO_SNIPPET_A_TEMA: Record<string, TemaInforme> = {
  rec_edafica: 'fertilización',
  rec_foliar: 'fertilización',
  rec_drench: 'fertilización',
  monitoreo: 'monitoreo',
  observacion: 'observaciones',
  labor: 'planeacion labores',
};

const PALABRAS: Record<TemaInforme, RegExp> = {
  'fertilización': /\bfertiliz|\bedafic|\bfoliar\b|\bdrench\b|\bnutricion|\babono\b|\bsilical|\bhidrocomplex/,
  'fumigación': /\bfumig|\binsecticid|\bfungicid|\bacaricid|\basperj|\bpulveriz|\bplaguicid/,
  'inventario': /\binventario\b|\bbodega\b|\bexistencias\b|\bstock\b/,
  'monitoreo': /\bmonitoreo|\bincidencia\b|\btrampas?\b|\brecuento\b|\bmuestreo\b/,
  'planeacion labores': /\blabores?\b|\bcuadrilla\b|\bjornale?s?\b|\bpoda\b|\bplaneacion|\bplanificacion/,
  'observaciones': /\bobservacion/,
  'alertas': /\balerta|\burgente\b|\bcritic[oa]\b|\bumbral\b/,
  'ideas': /\bideas?\b|\brecomiend|\bsugerenc|\bconviene\b/,
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Conserva el orden del catálogo. Tira cualquier valor que no esté en la lista. */
export function sanitizarTemas(raw: unknown): TemaInforme[] {
  if (!Array.isArray(raw)) return [];
  const hay = new Set<TemaInforme>();
  for (const t of raw) {
    if (typeof t === 'string' && SET_TEMAS.has(t)) hay.add(t as TemaInforme);
  }
  return TEMAS_INFORME.filter((t) => hay.has(t));
}

/**
 * Preselección barata de UNA nota: palabras de su texto + tipo de snippet.
 * El usuario confirma o cambia los chips antes de guardar.
 */
export function proponerTemasDeNota(texto: string, tipo?: string | null): TemaInforme[] {
  const hay = new Set<TemaInforme>();
  const cuerpo = normalizar(texto);
  for (const tema of TEMAS_INFORME) {
    if (PALABRAS[tema].test(cuerpo)) hay.add(tema);
  }
  const mapped = tipo ? TIPO_SNIPPET_A_TEMA[tipo] : undefined;
  if (mapped) hay.add(mapped);
  return TEMAS_INFORME.filter((t) => hay.has(t));
}

/** Si el snippet ya trae temas válidos, los conserva. Si no, propone. */
export function asegurarTemasSnippet<T extends { texto: string; tipo?: string | null; temas?: unknown }>(
  s: T,
): T & { temas: TemaInforme[] } {
  const ya = sanitizarTemas(s.temas);
  return {
    ...s,
    temas: ya.length > 0 ? ya : proponerTemasDeNota(s.texto, s.tipo),
  };
}
