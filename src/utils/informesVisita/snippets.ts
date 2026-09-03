import type { InformeVisitaCabecera, SnippetPropuesto } from '@/types/informesVisita';
import { parsearFechaInforme } from './fechasInforme';
import { extraerCabecera, fusionarCabecera } from './cabecera';

const TIPOS_OK = new Set([
  'monitoreo',
  'rec_edafica',
  'rec_foliar',
  'rec_drench',
  'observacion',
  'labor',
]);

export function normalizarParaCita(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** La cita tiene que aparecer en el Word. Si no, el snippet se descarta. */
export function citaEstaEnTexto(cita: string, texto: string): boolean {
  const c = normalizarParaCita(cita);
  if (c.length < 8) return false;
  return normalizarParaCita(texto).includes(c);
}

/** El insumo del chip tiene que aparecer en el Word o en la cita, nunca solo en el texto generado. */
export function insumoEstaEnSnippet(insumo: string | null, texto: string, cita: string | null): boolean {
  if (!insumo || !insumo.trim()) return true;
  const n = normalizarParaCita(insumo);
  return normalizarParaCita(texto).includes(n) || (cita ? normalizarParaCita(cita).includes(n) : false);
}

export function construirPromptSnippets(texto: string, piesDeFoto: string[]): string {
  const pies = piesDeFoto.filter(Boolean).map((p, i) => `${i}: ${p}`).join('\n');
  return `Eres un asistente de una finca de aguacate Hass. Te doy el texto extraído de un informe de visita agronómica en Word. El texto suele llegar sucio (tablas convertidas en párrafos).

TAREA: propón SNIPPETS. Un snippet = UNA idea. Puede juntar diagnóstico y recomendación. NO tienen que ser MECE. No hagas una fila por cada párrafo.

REGLAS DURAS:
- Nunca inventes un insumo, dosis, carencia, lote o cifra que no esté en el texto.
- Cada snippet de origen informe DEBE traer cita_word: una frase LITERAL copiada del texto (mínimo 8 caracteres) que respalde la idea.
- Ignora encabezados de tabla, "nombre de quien recibe la visita", firmas y ruido.
- Español. Máximo 40 snippets. Prefiere 8–25 ideas reales a 60 fragmentos.
- tipo es opcional: monitoreo | rec_edafica | rec_foliar | rec_drench | observacion | labor. Cadena vacía si no aplica.
- insumo y plaga son chips opcionales. Cadena vacía si no hay. El insumo debe aparecer en texto o en cita_word.
- foto_indice: índice del pie de foto si el snippet habla de esa imagen, o -1.

Cabecera: extrae fecha_visita (YYYY-MM-DD si puedes), agronoma, finca, especie, fenologia, materia_seca, proyeccion_cosecha. Cadena vacía si no está.

PIES DE FOTO:
${pies || '(ninguno)'}

TEXTO DEL WORD:
${texto.slice(0, 40_000)}`;
}

export function esquemaJsonSnippets(): Record<string, unknown> {
  const snippet = {
    type: 'object',
    properties: {
      texto: { type: 'string', description: 'La idea completa, en español.' },
      cita_word: { type: 'string', description: 'Frase literal del Word que respalda la idea.' },
      tipo: { type: 'string', description: 'monitoreo, rec_edafica, rec_foliar, rec_drench, observacion, labor, o vacío.' },
      insumo: { type: 'string', description: 'Nombre comercial si está en el texto. Vacío si no.' },
      plaga: { type: 'string', description: 'Plaga o enfermedad si está en el texto. Vacío si no.' },
      foto_indice: { type: 'integer', description: 'Índice del pie de foto, o -1.' },
    },
    required: ['texto', 'cita_word', 'tipo', 'insumo', 'plaga', 'foto_indice'],
    additionalProperties: false,
  };

  return {
    type: 'object',
    properties: {
      cabecera: {
        type: 'object',
        properties: {
          fecha_visita: { type: 'string' },
          agronoma: { type: 'string' },
          finca: { type: 'string' },
          especie: { type: 'string' },
          fenologia: { type: 'string' },
          materia_seca: { type: 'string' },
          proyeccion_cosecha: { type: 'string' },
        },
        required: [
          'fecha_visita',
          'agronoma',
          'finca',
          'especie',
          'fenologia',
          'materia_seca',
          'proyeccion_cosecha',
        ],
        additionalProperties: false,
      },
      snippets: {
        type: 'array',
        items: snippet,
      },
    },
    required: ['cabecera', 'snippets'],
    additionalProperties: false,
  };
}

function textoONulo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export function extraerJsonModelo(contenido: string): unknown {
  const limpio = contenido.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(limpio);
}

export function parsearRespuestaSnippets(
  bruto: unknown,
  textoWord: string,
  nFotos: number,
  fechaFallback: string,
): { cabecera: InformeVisitaCabecera; snippets: SnippetPropuesto[]; descartadosPorCita: number } {
  const base = extraerCabecera(textoWord, fechaFallback);
  if (bruto === null || typeof bruto !== 'object') {
    throw new Error('La respuesta del modelo no es un objeto JSON.');
  }
  const raiz = bruto as Record<string, unknown>;
  const cabBruta = (raiz.cabecera ?? {}) as Record<string, unknown>;
  const overlay: Partial<InformeVisitaCabecera> = {
    fecha_visita: parsearFechaInforme(textoONulo(cabBruta.fecha_visita)) ?? undefined,
    agronoma: textoONulo(cabBruta.agronoma),
    finca: textoONulo(cabBruta.finca),
    especie: textoONulo(cabBruta.especie),
    fenologia: textoONulo(cabBruta.fenologia),
    materia_seca: textoONulo(cabBruta.materia_seca),
    proyeccion_cosecha: textoONulo(cabBruta.proyeccion_cosecha),
  };
  const cabecera = fusionarCabecera(base, overlay);

  const lista = Array.isArray(raiz.snippets) ? raiz.snippets : [];
  const snippets: SnippetPropuesto[] = [];
  let descartadosPorCita = 0;

  lista.forEach((item, i) => {
    if (item === null || typeof item !== 'object') return;
    const s = item as Record<string, unknown>;
    const texto = textoONulo(s.texto);
    const cita = textoONulo(s.cita_word);
    if (!texto) return;
    if (!cita || !citaEstaEnTexto(cita, textoWord)) {
      descartadosPorCita += 1;
      return;
    }
    const insumo = textoONulo(s.insumo);
    if (!insumoEstaEnSnippet(insumo, textoWord, cita)) {
      descartadosPorCita += 1;
      return;
    }
    const tipoRaw = textoONulo(s.tipo);
    const tipo = tipoRaw && TIPOS_OK.has(tipoRaw) ? tipoRaw : null;
    let fotoIndice: number | null = null;
    if (typeof s.foto_indice === 'number' && Number.isInteger(s.foto_indice) && s.foto_indice >= 0 && s.foto_indice < nFotos) {
      fotoIndice = s.foto_indice;
    }
    snippets.push({
      clave: `s-${i}`,
      texto,
      cita_word: cita,
      origen: 'informe',
      tipo: tipo,
      insumo,
      plaga: textoONulo(s.plaga),
      foto_indice: fotoIndice,
      temas: [],
    });
  });

  return { cabecera, snippets, descartadosPorCita };
}
