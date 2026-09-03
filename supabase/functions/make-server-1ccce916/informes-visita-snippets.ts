// GENERATED COPY of src/utils/informesVisita/{fechasInforme,cabecera,snippets}.ts
// Keep behavioral parity with those files. chat.tsx / this Deno tree cannot
// import across the Vite boundary. If this test fails, edit the frontend
// originals and recopy — never silence a parity failure by editing this copy.

export interface InformeVisitaCabecera {
  fecha_visita: string;
  agronoma: string | null;
  finca: string | null;
  especie: string | null;
  fenologia: string | null;
  materia_seca: string | null;
  proyeccion_cosecha: string | null;
}

export interface SnippetPropuesto {
  clave: string;
  texto: string;
  cita_word: string | null;
  origen: 'informe' | 'conversacion';
  tipo: string | null;
  insumo: string | null;
  plaga: string | null;
  foto_indice: number | null;
  temas: string[];
}

const MESES: Record<string, string> = {
  enero: '01', ene: '01',
  febrero: '02', feb: '02',
  marzo: '03', mar: '03',
  abril: '04', abr: '04',
  mayo: '05', may: '05',
  junio: '06', jun: '06',
  julio: '07', jul: '07',
  agosto: '08', ago: '08',
  septiembre: '09', setiembre: '09', sep: '09', sept: '09',
  octubre: '10', oct: '10',
  noviembre: '11', nov: '11',
  diciembre: '12', dic: '12',
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parsea fechas del Word (28 de julio de 2026, 9 jul 2026, 09/07/2026). */
export function parsearFechaInforme(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  const s = crudo.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const dia = Number(dmy[1]);
    const mes = Number(dmy[2]);
    const anio = Number(dmy[3]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return `${anio}-${pad2(mes)}-${pad2(dia)}`;
    }
  }

  const largo = /(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/.exec(s);
  if (largo) {
    const mes = MESES[largo[2]];
    if (mes) return `${largo[3]}-${mes}-${pad2(Number(largo[1]))}`;
  }

  const corto = /(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/.exec(s);
  if (corto) {
    const mes = MESES[corto[2]];
    if (mes) return `${corto[3]}-${mes}-${pad2(Number(corto[1]))}`;
  }

  return null;
}

/** Primera fecha parseable en el texto. No inventa un día a partir de “julio 2026”. */
export function extraerPrimeraFechaDelTexto(texto: string): string | null {
  if (!texto.trim()) return null;
  const ventana = texto.slice(0, 5000);
  const candidatos = [
    ...ventana.matchAll(/(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóúü]+\s+(?:de\s+)?\d{4})/g),
    ...ventana.matchAll(/(\d{1,2}\s+[A-Za-zÁÉÍÓÚáéíóúü]{3,}\s+\d{4})/g),
    ...ventana.matchAll(/(\d{1,2}[/.\\-]\d{1,2}[/.\\-]\d{4})/g),
    ...ventana.matchAll(/(\d{4}-\d{2}-\d{2})/g),
  ];
  for (const m of candidatos) {
    const parsed = parsearFechaInforme(m[1]);
    if (parsed) return parsed;
  }
  return null;
}

function campo(texto: string, etiqueta: RegExp): string | null {
  const mismaLinea = new RegExp(`(?:${etiqueta.source})\\s*[:|–-]\\s*([^\\n]+)`, etiqueta.flags);
  const m1 = mismaLinea.exec(texto);
  if (m1) {
    const v = (m1[1] ?? '').trim();
    if (v.length > 0) return v;
  }
  const dosLineas = new RegExp(`(?:${etiqueta.source})\\s*\\n\\s*([^\\n]+)`, etiqueta.flags);
  const m2 = dosLineas.exec(texto);
  if (!m2) return null;
  const v = (m2[1] ?? '').trim();
  return v.length > 0 ? v : null;
}

/** Cabecera barata desde etiquetas del Word. El modelo puede completar huecos. */
export function extraerCabecera(texto: string, fechaFallback: string): InformeVisitaCabecera {
  const fechaCruda = campo(texto, /fecha(?:\s+de\s+(?:la\s+)?visita)?/i);
  return {
    fecha_visita: parsearFechaInforme(fechaCruda) ?? extraerPrimeraFechaDelTexto(texto) ?? fechaFallback,
    agronoma: campo(texto, /agr[oó]nom[ao]|elaborad[oa]\s+por/i),
    finca: campo(texto, /finca/i),
    especie: campo(texto, /especie/i),
    fenologia: campo(texto, /fenolog[ií]a/i),
    materia_seca: campo(texto, /materia\s+seca/i),
    proyeccion_cosecha: campo(texto, /proyecci[oó]n(?:\s+de\s+cosecha)?/i),
  };
}

export function fusionarCabecera(
  base: InformeVisitaCabecera,
  overlay: Partial<InformeVisitaCabecera>,
): InformeVisitaCabecera {
  return {
    fecha_visita: overlay.fecha_visita || base.fecha_visita,
    agronoma: overlay.agronoma || base.agronoma,
    finca: overlay.finca || base.finca,
    especie: overlay.especie || base.especie,
    fenologia: overlay.fenologia || base.fenologia,
    materia_seca: overlay.materia_seca || base.materia_seca,
    proyeccion_cosecha: overlay.proyeccion_cosecha || base.proyeccion_cosecha,
  };
}

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
