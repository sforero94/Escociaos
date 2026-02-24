// generar-reporte-semanal.ts
// Módulo de Edge Function para generar reportes semanales
// Flujo: datos → Gemini (solo análisis JSON) → plantilla HTML determinística (generar-reporte-html.ts) → PDF

// ============================================================================
// TIPOS
// ============================================================================

interface GenerateReportRequest {
  datos: any; // DatosReporteSemanal del frontend
  instrucciones?: string;
}

interface GenerateReportResponse {
  success: boolean;
  html?: string;
  error?: string;
  tokens_usados?: number;
}

/**
 * Análisis completo generado por Gemini.
 * generar-reporte-html.ts imports this type to build the HTML template.
 */
export interface AnalisisGemini {
  resumen_ejecutivo: string;
  highlights: string[];
  alertas: Array<{
    nivel: 'urgente' | 'atencion' | 'ok';
    titulo: string;
    descripcion: string;
    accion?: string;
  }>;
  conclusiones: Array<{
    icono: string;
    texto: string;
    prioridad: 'alta' | 'media' | 'baja';
  }>;
  analisis_jornales: string;
  analisis_aplicaciones: string;
  analisis_monitoreo: string;
  interpretacion_monitoreo: string;
  recomendaciones: string[];
  narrativa_semana: string;
}

// ============================================================================
// PROMPT TEMPLATE — Pide análisis JSON completo
// ============================================================================

const SYSTEM_PROMPT = `Eres un asistente agrícola experto para la finca de aguacate Hass "Escocia Hass" en Colombia.
Tu tarea es analizar datos operativos semanales y producir un análisis completo, concreto y accionable.

RESPONDE EXCLUSIVAMENTE en formato JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "2-3 oraciones resumiendo lo más importante de la semana operativa. Menciona cifras clave.",
  "highlights": [
    "Destacado 1 en máx 8 palabras",
    "Destacado 2 en máx 8 palabras"
  ],
  "alertas": [
    {
      "nivel": "urgente",
      "titulo": "Título corto de la alerta",
      "descripcion": "Descripción breve del problema o situación",
      "accion": "Acción recomendada (opcional)"
    }
  ],
  "conclusiones": [
    { "icono": "⚠️", "texto": "Recomendación concreta y accionable con verbo de acción", "prioridad": "alta" }
  ],
  "analisis_jornales": "1-2 oraciones analizando la distribución de jornales, eficiencia, y costos.",
  "analisis_aplicaciones": "1-2 oraciones sobre el estado de las aplicaciones activas y planeadas.",
  "analisis_monitoreo": "1-2 oraciones sobre las tendencias fitosanitarias, plagas críticas.",
  "interpretacion_monitoreo": "Interpretación de las tendencias. Indica si suben, bajan o están estables.",
  "recomendaciones": [
    "Recomendación 1 para la próxima semana",
    "Recomendación 2 para la próxima semana"
  ],
  "narrativa_semana": "Un párrafo narrativo (3-4 oraciones) describiendo cómo fue la semana operativamente, conectando personal, labores, aplicaciones y monitoreo."
}

REGLAS:
- Todo en español
- highlights: mínimo 2, máximo 4 frases cortas (máx 8 palabras cada una)
- alertas: solo incluir si hay situaciones que requieran atención. nivel: "urgente", "atencion", o "ok"
- conclusiones: mínimo 3, máximo 5 items accionables que empiecen con verbos de acción
- analisis_jornales: mencionar actividad con más jornales, costo total, eficiencia
- analisis_aplicaciones: mencionar progreso de activas, alertas de planeadas
- analisis_monitoreo: mencionar plagas con tendencia al alza, umbrales superados
- recomendaciones: mínimo 2, máximo 4 para la próxima semana
- narrativa_semana: conectar los diferentes aspectos operativos en prosa
- Usa estos íconos en conclusiones según prioridad: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
- NO incluir HTML, markdown, ni código. SOLO el objeto JSON.
- NO envolver el JSON en bloques de código (\`\`\`).`;

// ============================================================================
// FUNCIONES DE FORMATEO DE DATOS PARA EL PROMPT
// ============================================================================

function formatearDatosParaPrompt(datos: any): string {
  const partes: string[] = [];

  // Semana
  partes.push(`## PERÍODO DEL REPORTE
- Semana ${datos.semana.numero} del ${datos.semana.ano}
- Desde: ${datos.semana.inicio}
- Hasta: ${datos.semana.fin}`);

  // Personal
  partes.push(`## PERSONAL
- Total trabajadores: ${datos.personal.totalTrabajadores}
  - Empleados: ${datos.personal.empleados}
  - Contratistas: ${datos.personal.contratistas}
- Fallas: ${datos.personal.fallas}
- Permisos: ${datos.personal.permisos}`);

  // Jornales
  if (datos.jornales) {
    const { actividades, lotes, datos: matrizDatos, totalesPorActividad, totalesPorLote, totalGeneral } = datos.jornales;

    partes.push(`## DISTRIBUCIÓN DE JORNALES
Total general: ${totalGeneral.jornales.toFixed(2)} jornales ($${Math.round(totalGeneral.costo).toLocaleString('es-CO')} COP)

### Matriz Actividades × Lotes (valores = jornales)
Lotes: ${lotes.join(', ')}
Actividades: ${actividades.join(', ')}

Datos de la matriz:`);

    actividades.forEach((act: string) => {
      const fila = lotes.map((lote: string) => {
        const celda = matrizDatos[act]?.[lote];
        return celda ? celda.jornales.toFixed(2) : '0';
      });
      const totalAct = totalesPorActividad[act]?.jornales || 0;
      partes.push(`  ${act}: [${fila.join(', ')}] Total: ${totalAct.toFixed(2)}`);
    });

    const totalesLote = lotes.map((lote: string) =>
      (totalesPorLote[lote]?.jornales || 0).toFixed(2)
    );
    partes.push(`  TOTALES POR LOTE: [${totalesLote.join(', ')}]`);
  }

  // Aplicaciones planeadas
  if (datos.aplicaciones.planeadas?.length > 0) {
    partes.push(`## APLICACIONES PLANEADAS`);
    datos.aplicaciones.planeadas.forEach((app: any) => {
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Blancos biológicos: ${app.blancosBiologicos.join(', ')}
- Fecha planeada: ${app.fechaInicioPlaneada}
- Costo total estimado: $${Math.round(app.costoTotalEstimado).toLocaleString('es-CO')} COP
- Lista de compras:`);
      app.listaCompras.forEach((item: any) => {
        partes.push(`  - ${item.productoNombre}: ${item.cantidadNecesaria} ${item.unidad} (~$${Math.round(item.costoEstimado).toLocaleString('es-CO')})`);
      });
    });
  }

  // Aplicaciones activas
  if (datos.aplicaciones.activas?.length > 0) {
    partes.push(`## APLICACIONES EN EJECUCIÓN`);
    datos.aplicaciones.activas.forEach((app: any) => {
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Fecha inicio: ${app.fechaInicio}
- Progreso global: ${app.totalEjecutado}/${app.totalPlaneado} ${app.unidad} (${app.porcentajeGlobal}%)
- Detalle por lote:`);
      app.progresoPorLote.forEach((lote: any) => {
        partes.push(`  - ${lote.loteNombre}: ${lote.ejecutado}/${lote.planeado} ${lote.unidad} (${lote.porcentaje}%)`);
      });
    });
  }

  // Aplicaciones cerradas
  if (datos.aplicaciones.cerradas?.length > 0) {
    partes.push(`## APLICACIONES CERRADAS RECIENTEMENTE`);
    datos.aplicaciones.cerradas.forEach((app: any) => {
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Período: ${app.fechaInicio} — ${app.fechaFin} (${app.diasEjecucion} días)
- Resultado global: ${app.general?.canecasBultosReales || 0}/${app.general?.canecasBultosPlaneados || 0} ${app.general?.unidad || ''} (${app.general?.canecasBultosDesviacion || 0}% desviación)
- Costo total real: $${Math.round(app.general?.costoReal || 0).toLocaleString('es-CO')} COP`);
    });
  }

  // Monitoreo
  if (datos.monitoreo) {
    partes.push(`## MONITOREO FITOSANITARIO
Fechas de monitoreo analizadas: ${datos.monitoreo.fechasMonitoreo.join(', ')}`);

    // Tendencias
    if (datos.monitoreo.tendencias.length > 0) {
      partes.push(`### Tendencias (últimos 3 monitoreos)`);

      // Agrupar por plaga
      const porPlaga = new Map<string, any[]>();
      datos.monitoreo.tendencias.forEach((t: any) => {
        if (!porPlaga.has(t.plagaNombre)) porPlaga.set(t.plagaNombre, []);
        porPlaga.get(t.plagaNombre)!.push(t);
      });

      porPlaga.forEach((tendencias, plaga) => {
        const valores = tendencias
          .sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))
          .map((t: any) => `${t.fecha}: ${t.incidenciaPromedio}%`);
        partes.push(`  - ${plaga}: ${valores.join(' → ')}`);
      });
    }

    // Detalle por lote
    if (datos.monitoreo.detallePorLote.length > 0) {
      partes.push(`### Detalle por lote (monitoreo más reciente)`);
      datos.monitoreo.detallePorLote.forEach((lote: any) => {
        partes.push(`  ${lote.loteNombre}:`);
        lote.sublotes.forEach((s: any) => {
          partes.push(`    - ${s.subloteNombre} | ${s.plagaNombre}: ${s.incidencia}% (${s.gravedad}) [${s.arboresAfectados}/${s.arboresMonitoreados} árboles]`);
        });
      });
    }

    // Insights
    if (datos.monitoreo.insights.length > 0) {
      partes.push(`### Alertas e insights automáticos`);
      datos.monitoreo.insights.forEach((insight: any) => {
        const icono = insight.tipo === 'urgente' ? '🔴' : insight.tipo === 'atencion' ? '⚠️' : '✅';
        partes.push(`  ${icono} [${insight.tipo.toUpperCase()}] ${insight.titulo}: ${insight.descripcion}`);
        if (insight.accion) partes.push(`    → Acción: ${insight.accion}`);
      });
    }
  }

  // Temas adicionales
  if (datos.temasAdicionales?.length > 0) {
    partes.push(`## TEMAS ADICIONALES`);
    datos.temasAdicionales.forEach((bloque: any, i: number) => {
      if (bloque.tipo === 'texto') {
        partes.push(`### ${bloque.titulo || `Tema ${i + 1}`}\n${bloque.contenido}`);
      } else if (bloque.tipo === 'imagen_con_texto') {
        partes.push(`### ${bloque.titulo || `Imagen ${i + 1}`}\n[IMAGEN incluida en base64]\nDescripción: ${bloque.descripcion}`);
      }
    });
  }

  return partes.join('\n\n');
}

// ============================================================================
// LLAMADA A GEMINI — Retorna análisis JSON completo
// ============================================================================

async function llamarGemini(datosFormateados: string, instruccionesAdicionales?: string): Promise<{ analisis: AnalisisGemini; tokens: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno');
  }

  const model = 'gemini-2.5-flash-preview-05-20';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const userMessage = instruccionesAdicionales
    ? `${datosFormateados}\n\n## INSTRUCCIONES ADICIONALES DEL USUARIO\n${instruccionesAdicionales}`
    : datosFormateados;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          { text: `Analiza estos datos operativos semanales y genera el JSON de análisis:\n\n${userMessage}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      topP: 0.8,
      responseMimeType: 'application/json',
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('La API de Gemini no respondió en 50 segundos. Intenta de nuevo.');
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', response.status, errorText.slice(0, 500));
    throw new Error(`Error de Gemini API (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  // Validar estructura de respuesta
  const candidate = result.candidates?.[0];
  if (!candidate) {
    console.error('Gemini response has no candidates:', JSON.stringify(result).slice(0, 500));
    throw new Error('Gemini no retornó candidatos. Posible error de contenido o límite.');
  }

  const finishReason = candidate.finishReason;
  console.log('Gemini finishReason:', finishReason);

  if (finishReason === 'SAFETY') {
    console.error('Gemini blocked response due to safety filters');
    throw new Error(
      'Gemini bloqueó la respuesta por filtros de seguridad. Intenta ajustar los datos del reporte.'
    );
  }

  if (finishReason === 'RECITATION') {
    throw new Error('Gemini bloqueó la respuesta por detección de recitación.');
  }

  const text = candidate.content?.parts?.[0]?.text || '';

  if (!text) {
    console.error('Gemini candidate has no text. finishReason:', finishReason);
    throw new Error('Gemini no generó contenido de texto en la respuesta.');
  }

  // Parsear JSON — limpiar posibles fences markdown
  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  let analisis: AnalisisGemini;
  try {
    analisis = JSON.parse(jsonText);
  } catch {
    console.error('Failed to parse Gemini JSON:', jsonText.slice(0, 300));
    // Fallback: análisis genérico
    analisis = {
      resumen_ejecutivo: 'Semana operativa procesada. Consulte los datos del reporte para detalles específicos.',
      highlights: ['Reporte generado', 'Ver detalles abajo'],
      alertas: [],
      conclusiones: [
        { icono: '📊', texto: 'Revisar los indicadores detallados en las secciones del reporte', prioridad: 'media' },
        { icono: '📋', texto: 'Verificar el avance de las aplicaciones en curso', prioridad: 'media' },
        { icono: '🌱', texto: 'Monitorear la evolución fitosanitaria en la próxima semana', prioridad: 'media' },
      ],
      analisis_jornales: 'Consulte la sección de jornales para detalles.',
      analisis_aplicaciones: 'Consulte la sección de aplicaciones para detalles.',
      analisis_monitoreo: 'Consulte la sección de monitoreo para detalles sobre las tendencias fitosanitarias.',
      interpretacion_monitoreo: 'Consulte la sección de monitoreo para detalles.',
      recomendaciones: ['Revisar los indicadores del reporte', 'Planificar las actividades de la próxima semana'],
      narrativa_semana: 'Semana operativa procesada. Consulte las secciones individuales para un análisis detallado.',
    };
    console.warn('Using fallback analysis due to JSON parse failure');
  }

  // Validar estructura mínima — fill missing fields
  if (!analisis.resumen_ejecutivo) {
    analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  }
  if (!Array.isArray(analisis.highlights)) {
    analisis.highlights = [];
  }
  if (!Array.isArray(analisis.alertas)) {
    analisis.alertas = [];
  }
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [
      { icono: '📊', texto: 'Revisar los indicadores del reporte', prioridad: 'media' },
    ];
  }
  if (!analisis.analisis_jornales) {
    analisis.analisis_jornales = '';
  }
  if (!analisis.analisis_aplicaciones) {
    analisis.analisis_aplicaciones = '';
  }
  if (!analisis.analisis_monitoreo) {
    analisis.analisis_monitoreo = '';
  }
  if (!analisis.interpretacion_monitoreo) {
    analisis.interpretacion_monitoreo = '';
  }
  if (!Array.isArray(analisis.recomendaciones)) {
    analisis.recomendaciones = [];
  }
  if (!analisis.narrativa_semana) {
    analisis.narrativa_semana = '';
  }

  const tokens = result.usageMetadata?.totalTokenCount || 0;
  console.log('Gemini response: analysis parsed, tokens:', tokens);

  return { analisis, tokens };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function generarReporteSemanal(
  body: GenerateReportRequest,
  htmlBuilder?: (datos: any, analisis: AnalisisGemini) => string
): Promise<GenerateReportResponse> {
  const startTime = Date.now();
  console.log('=== generarReporteSemanal START ===');

  try {
    const { datos, instrucciones } = body;

    if (!datos || !datos.semana) {
      console.log('Validation failed: datos or semana missing');
      return { success: false, error: 'Datos del reporte no proporcionados o incompletos' };
    }

    console.log(`Semana ${datos.semana.numero}/${datos.semana.ano}`);

    // Paso 1: Formatear datos para el prompt
    const datosFormateados = formatearDatosParaPrompt(datos);
    console.log('Datos formateados:', datosFormateados.length, 'chars');

    // Paso 2: Llamar a Gemini para análisis (JSON completo)
    console.log('Calling Gemini API for analysis...');
    const geminiStart = Date.now();
    const { analisis, tokens } = await llamarGemini(datosFormateados, instrucciones);
    console.log(`Gemini completed in ${Date.now() - geminiStart}ms`);

    // Paso 3: Construir HTML determinístico
    console.log('Building deterministic HTML template...');
    if (!htmlBuilder) {
      throw new Error('htmlBuilder function is required');
    }
    const html = htmlBuilder(datos, analisis);
    console.log('HTML built:', html.length, 'chars');

    if (!html || html.length < 500) {
      console.error('HTML too short:', html.length, 'chars');
      return { success: false, error: 'Error interno al construir el HTML del reporte' };
    }

    console.log(`=== generarReporteSemanal SUCCESS in ${Date.now() - startTime}ms ===`);
    return {
      success: true,
      html,
      tokens_usados: tokens,
    };
  } catch (error: any) {
    console.error(`=== generarReporteSemanal ERROR in ${Date.now() - startTime}ms ===`, error.message);
    return {
      success: false,
      error: error.message || 'Error interno al generar el reporte',
    };
  }
}
