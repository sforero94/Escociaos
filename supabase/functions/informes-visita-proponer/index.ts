// Standalone propose endpoint for Composio/single-file deploy.
// Same behaviour as make-server-1ccce916/informes-visita-proponer.ts.
// Snippets helpers are inlined from informes-visita-snippets.ts (parity copy).
// verify_jwt = false; the handler checks JWT + Administrador/Gerencia.

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


import { createClient } from 'jsr:@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELO = 'google/gemini-3-flash-preview';
const TIMEOUT_MODELO_MS = 120_000;
const ROLES_PERMITIDOS = new Set(['Administrador', 'Gerencia']);
const TEXTO_MAX = 40_000;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Access-Control-Max-Age': '600',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function respuestaError(status: 400 | 401 | 403 | 500 | 502 | 503, error: string): Response {
  return json({ error }, status);
}

async function verificarAcceso(
  req: Request,
  supabase: ReturnType<typeof createClient>,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return respuestaError(401, 'No autorizado -- falta encabezado Authorization Bearer.');
  }
  const token = authHeader.slice(7);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return respuestaError(401, 'Token inválido o expirado.');
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (usuarioError) {
    return respuestaError(500, `No se pudo verificar el rol del usuario: ${usuarioError.message}`);
  }
  if (!usuario || !ROLES_PERMITIDOS.has((usuario as { rol: string }).rol)) {
    return respuestaError(403, 'Acceso restringido a Administrador o Gerencia.');
  }

  return { userId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return respuestaError(400, 'Solo POST.');
  }

  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    return respuestaError(
      503,
      'No se pueden proponer snippets: falta el secreto OPENROUTER_API_KEY en la edge function.',
    );
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const acceso = await verificarAcceso(req, supabase);
  if (acceso instanceof Response) return acceso;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respuestaError(400, 'El cuerpo tiene que ser JSON.');
  }

  const texto = typeof body.texto === 'string' ? body.texto : '';
  if (!texto.trim()) {
    return respuestaError(400, 'Falta el texto extraído del Word.');
  }

  const piesDeFoto = Array.isArray(body.pies_de_foto)
    ? body.pies_de_foto.filter((p): p is string => typeof p === 'string')
    : [];
  const nFotos = typeof body.n_fotos === 'number' && Number.isInteger(body.n_fotos) && body.n_fotos >= 0
    ? body.n_fotos
    : piesDeFoto.length;
  const fechaFallback = typeof body.fecha_fallback === 'string' && FECHA_ISO.test(body.fecha_fallback)
    ? body.fecha_fallback
    : '';
  if (!fechaFallback) {
    return respuestaError(400, 'fecha_fallback tiene que ser AAAA-MM-DD.');
  }

  const textoCorto = texto.slice(0, TEXTO_MAX);
  const prompt = construirPromptSnippets(textoCorto, piesDeFoto);
  const esquema = esquemaJsonSnippets();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MODELO_MS);

  try {
    const respuesta = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELO,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Propón los snippets. Devuelve solo el JSON del esquema.' },
        ],
        temperature: 0,
        max_tokens: 8000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'snippets_informe_visita', strict: true, schema: esquema },
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      return respuestaError(502, `El modelo respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
    }

    const resultado = await respuesta.json();
    const contenido = resultado?.choices?.[0]?.message?.content;
    if (typeof contenido !== 'string' || contenido.trim() === '') {
      return respuestaError(502, 'El modelo devolvió una respuesta vacía.');
    }

    const bruto = extraerJsonModelo(contenido);
    const parsed = parsearRespuestaSnippets(bruto, textoCorto, nFotos, fechaFallback);
    return json({
      cabecera: parsed.cabecera,
      snippets: parsed.snippets,
      descartadosPorCita: parsed.descartadosPorCita,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const mensaje =
      err instanceof Error && err.name === 'AbortError'
        ? `La propuesta superó el tiempo máximo (${TIMEOUT_MODELO_MS / 1000}s).`
        : err instanceof Error
          ? err.message
          : String(err);
    return respuestaError(502, mensaje);
  }
});
