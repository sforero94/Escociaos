// generar-reporte-semanal.tsx
// Módulo de Edge Function para generar reportes semanales usando Google Gemini
// Recibe datos estructurados del frontend y devuelve HTML estilizado para conversión a PDF

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

// ============================================================================
// PROMPT TEMPLATE
// ============================================================================

const SYSTEM_PROMPT = `Eres un asistente especializado en generar reportes semanales ALTAMENTE VISUALES para una operación agrícola de aguacate Hass en Colombia.
Tu tarea es generar un reporte HTML que PRIORICE elementos visuales sobre texto. Mínimo texto, máximo impacto visual.

FILOSOFÍA: "Show, don't tell" — cada dato debe presentarse como tabla, barra, indicador visual o métrica destacada. Evitar párrafos largos.

REGLAS DE DISEÑO:
- HTML completo con CSS inline (necesario para conversión a PDF)
- Paleta Escocia Hass:
  - Verde primario: #73991C (headers, acentos, barras positivas)
  - Verde claro: #BFD97D (fondos de secciones, highlights)
  - Marrón oscuro: #4D240F (texto principal)
  - Rojo alerta: #D32F2F (alertas, valores negativos)
  - Amarillo: #F9A825 (advertencias, atención)
  - Blanco: #FFFFFF / Gris claro: #F5F5F0 (fondos)
- Fuente: Arial, sans-serif
- Ancho fijo: 794px (A4). Márgenes de 15mm
- IMPORTANTE: NO usar tags <img> ni imágenes base64. SOLO texto, Unicode y CSS

ELEMENTOS VISUALES OBLIGATORIOS (usar CSS puro):
1. KPI Cards: Métricas clave en cards grandes con número prominente, label pequeño, y color de fondo según contexto (verde=bueno, amarillo=atención, rojo=alerta)
2. Barras horizontales CSS: Para distribución de jornales por actividad y por lote (div con background-color y width porcentual). Mostrar el valor numérico dentro de la barra
3. Tabla de calor (heatmap): Para la matriz jornales × lotes, usar intensidad de color de fondo según el valor (más oscuro = más jornales)
4. Barras de progreso: Para aplicaciones activas, barras con % completado visualmente
5. Indicadores semáforo: Círculos CSS (●) coloreados verde/amarillo/rojo para gravedad de monitoreo
6. Mini sparklines CSS: Tendencias de monitoreo como barras verticales consecutivas mostrando evolución
7. Íconos Unicode abundantes: ✅ ⚠️ 🔴 📊 📈 📉 🌱 💧 🐛 👷 💰

ESTRUCTURA DEL REPORTE:
1. Header: Fondo verde #73991C, texto blanco "ESCOCIA HASS — Reporte Semana {N}" con fechas
2. Dashboard KPIs: Fila de 4-5 cards con métricas clave (total jornales, costo total, trabajadores, aplicaciones activas, alertas fitosanitarias)
3. Jornales: Heatmap de la matriz actividad×lote + barras horizontales para top actividades
4. Aplicaciones: Cards con barras de progreso por lote
5. Monitoreo: Tabla con indicadores semáforo + mini barras de tendencia
6. Temas Adicionales (si hay): Formato card compacto
7. Conclusiones: Máximo 3-4 bullets con íconos, NO párrafos largos

REGLAS DE CONTENIDO:
- Todo en español
- MÍNIMO texto explicativo. Solo bullets cortos donde sea imprescindible
- Cada sección debe ser 80% visual, 20% texto máximo
- Usar negrita para destacar valores numéricos clave
- Las conclusiones deben ser actionable items, no descripciones

FORMATO DE SALIDA:
- SOLO HTML (sin markdown, sin explicaciones)
- Empezar con <!DOCTYPE html>
- Incluir @media print para impresión
- Usar page-break-before para separar secciones grandes`;

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
// LLAMADA A GEMINI
// ============================================================================

async function llamarGemini(datosFormateados: string, instruccionesAdicionales?: string): Promise<{ html: string; tokens: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno');
  }

  const model = 'gemini-2.5-flash';
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
          { text: `Genera el reporte semanal HTML basado en estos datos:\n\n${userMessage}` }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
      topP: 0.8,
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

  // Extraer el HTML del response
  const text = candidate.content?.parts?.[0]?.text || '';

  if (!text) {
    console.error('Gemini candidate has no text. finishReason:', finishReason);
    throw new Error('Gemini no generó contenido de texto en la respuesta.');
  }

  // Gemini puede envolver el HTML en bloques de código markdown
  let html = text;
  if (html.startsWith('```html')) {
    html = html.slice(7);
  } else if (html.startsWith('```')) {
    html = html.slice(3);
  }
  if (html.endsWith('```')) {
    html = html.slice(0, -3);
  }
  html = html.trim();

  // Si fue truncado, cerrar HTML gracefully
  if (finishReason === 'MAX_TOKENS' && !html.endsWith('</html>')) {
    console.warn('Truncated HTML detected, appending closing tags');
    html += '</body></html>';
  }

  const tokens = result.usageMetadata?.totalTokenCount || 0;
  console.log('Gemini response: HTML length:', html.length, 'tokens:', tokens);

  return { html, tokens };
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function generarReporteSemanal(body: GenerateReportRequest): Promise<GenerateReportResponse> {
  const startTime = Date.now();
  console.log('=== generarReporteSemanal START ===');

  try {
    const { datos, instrucciones } = body;

    if (!datos || !datos.semana) {
      console.log('Validation failed: datos or semana missing');
      return { success: false, error: 'Datos del reporte no proporcionados o incompletos' };
    }

    console.log(`Semana ${datos.semana.numero}/${datos.semana.ano}`);

    // Formatear datos para el prompt
    const datosFormateados = formatearDatosParaPrompt(datos);
    console.log('Datos formateados:', datosFormateados.length, 'chars');

    // Llamar a Gemini
    console.log('Calling Gemini API...');
    const geminiStart = Date.now();
    const { html, tokens } = await llamarGemini(datosFormateados, instrucciones);
    console.log(`Gemini completed in ${Date.now() - geminiStart}ms`);

    if (!html || html.length < 100) {
      console.error('HTML too short:', html.length, 'chars');
      return { success: false, error: 'Gemini no generó un HTML válido (respuesta demasiado corta)' };
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
