// generar-reporte-semanal.tsx
// Módulo de Edge Function para generar reportes semanales
// Flujo: datos → Gemini (solo análisis JSON) → plantilla HTML determinística → PDF

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

interface AnalisisGemini {
  resumen_ejecutivo: string;
  conclusiones: Array<{
    icono: string;
    texto: string;
    prioridad: 'alta' | 'media' | 'baja';
  }>;
  interpretacion_monitoreo: string;
}

// ============================================================================
// PROMPT TEMPLATE — Solo pide análisis JSON, NO HTML
// ============================================================================

const SYSTEM_PROMPT = `Eres un asistente agrícola experto para la finca de aguacate Hass "Escocia Hass" en Colombia.
Tu tarea es analizar datos operativos semanales y producir un análisis breve, concreto y accionable.

RESPONDE EXCLUSIVAMENTE en formato JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "2-3 oraciones resumiendo lo más importante de la semana operativa. Menciona cifras clave.",
  "conclusiones": [
    { "icono": "⚠️", "texto": "Recomendación concreta y accionable con verbo de acción", "prioridad": "alta" }
  ],
  "interpretacion_monitoreo": "Interpretación breve de las tendencias fitosanitarias. Indica si suben, bajan o están estables."
}

REGLAS:
- Todo en español
- Mínimo 3 conclusiones, máximo 5
- Las conclusiones DEBEN ser actionable items que empiecen con verbos de acción (Evaluar, Priorizar, Continuar, Revisar, Programar, etc.)
- El resumen ejecutivo debe mencionar las cifras más relevantes (total jornales, costo, alertas)
- La interpretación del monitoreo debe mencionar si las tendencias van subiendo, bajando o están estables, y qué plagas requieren atención
- Usa estos íconos según prioridad: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
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
// LLAMADA A GEMINI — Retorna análisis JSON, no HTML
// ============================================================================

async function llamarGemini(datosFormateados: string, instruccionesAdicionales?: string): Promise<{ analisis: AnalisisGemini; tokens: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno');
  }

  const model = 'gemini-3-pro-preview';
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
      maxOutputTokens: 2048,
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
      conclusiones: [
        { icono: '📊', texto: 'Revisar los indicadores detallados en las secciones del reporte', prioridad: 'media' },
        { icono: '📋', texto: 'Verificar el avance de las aplicaciones en curso', prioridad: 'media' },
        { icono: '🌱', texto: 'Monitorear la evolución fitosanitaria en la próxima semana', prioridad: 'media' },
      ],
      interpretacion_monitoreo: 'Consulte la sección de monitoreo para detalles sobre las tendencias fitosanitarias.',
    };
    console.warn('Using fallback analysis due to JSON parse failure');
  }

  // Validar estructura mínima
  if (!analisis.resumen_ejecutivo) {
    analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  }
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [
      { icono: '📊', texto: 'Revisar los indicadores del reporte', prioridad: 'media' },
    ];
  }
  if (!analisis.interpretacion_monitoreo) {
    analisis.interpretacion_monitoreo = '';
  }

  const tokens = result.usageMetadata?.totalTokenCount || 0;
  console.log('Gemini response: analysis parsed, tokens:', tokens);

  return { analisis, tokens };
}

// ============================================================================
// HELPERS PARA HTML
// ============================================================================

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function formatNum(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getHeatmapColor(value: number, maxValue: number): string {
  if (value === 0 || maxValue === 0) return '#FFFFFF';
  const intensity = Math.min(value / maxValue, 1);
  const r = Math.round(245 - intensity * (245 - 115));
  const g = Math.round(248 - intensity * (248 - 153));
  const b = Math.round(230 - intensity * (230 - 28));
  return `rgb(${r},${g},${b})`;
}

function getTextColorForHeatmap(value: number, maxValue: number): string {
  if (maxValue === 0) return '#4D240F';
  const intensity = value / maxValue;
  return intensity > 0.6 ? '#FFFFFF' : '#4D240F';
}

function getBadgeHTML(texto: string, tipo: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    'Alta': { bg: '#FFCDD2', text: '#C62828' },
    'Media': { bg: '#FFF9C4', text: '#F57F17' },
    'Baja': { bg: '#C8E6C9', text: '#2E7D32' },
  };
  const c = colors[tipo] || colors['Baja'];
  return `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text};">${texto}</span>`;
}

function getInsightStyles(tipo: string): { border: string; bg: string; icon: string } {
  if (tipo === 'urgente') return { border: '#D32F2F', bg: '#FFF5F5', icon: '🔴' };
  if (tipo === 'atencion') return { border: '#F9A825', bg: '#FFFDF0', icon: '⚠️' };
  return { border: '#73991C', bg: '#F5F9EE', icon: '✅' };
}

// ============================================================================
// PLANTILLA HTML DETERMINÍSTICA
// ============================================================================

function construirHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const { semana, personal, jornales, aplicaciones, monitoreo, temasAdicionales } = datos;

  // Calcular KPIs
  const totalJornales = jornales?.totalGeneral?.jornales || 0;
  const costoTotal = jornales?.totalGeneral?.costo || 0;
  const trabajadoresActivos = personal?.totalTrabajadores || 0;
  const aplicacionesActivas = aplicaciones?.activas?.length || 0;
  const alertasFito = monitoreo?.insights?.filter((i: any) => i.tipo === 'urgente' || i.tipo === 'atencion')?.length || 0;

  // Encontrar el valor máximo en la matriz para heatmap
  let maxJornalCelda = 0;
  if (jornales?.datos) {
    for (const act of jornales.actividades || []) {
      for (const lote of jornales.lotes || []) {
        const val = jornales.datos[act]?.[lote]?.jornales || 0;
        if (val > maxJornalCelda) maxJornalCelda = val;
      }
    }
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; width: 794px; margin: 0 auto; color: #4D240F; background: #FFFFFF; font-size: 13px; line-height: 1.5; }
  @media print {
    .page-break { page-break-before: always; }
    body { margin: 0; width: 100%; }
  }
  table { border-collapse: collapse; }
</style>
</head>
<body>

<!-- ========== HEADER ========== -->
<div style="background:#73991C;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
  <div>
    <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:1px;">ESCOCIA HASS</div>
    <div style="font-size:12px;color:#E8F0D0;margin-top:2px;">Finca Aguacate Hass</div>
  </div>
  <div style="text-align:right;">
    <div style="font-size:16px;font-weight:600;color:#FFFFFF;">Reporte Semanal</div>
    <div style="font-size:20px;font-weight:700;color:#FFFFFF;">Semana ${semana.numero} / ${semana.ano}</div>
    <div style="font-size:11px;color:#E8F0D0;margin-top:2px;">${semana.inicio} — ${semana.fin}</div>
  </div>
</div>

<!-- ========== RESUMEN EJECUTIVO ========== -->
<div style="background:#F5F5F0;padding:14px 20px;margin:16px 20px 0;border-radius:8px;border-left:4px solid #73991C;">
  <div style="font-size:12px;font-weight:700;color:#73991C;margin-bottom:6px;">📋 RESUMEN EJECUTIVO</div>
  <div style="font-size:13px;color:#4D240F;line-height:1.6;">${analisis.resumen_ejecutivo}</div>
</div>

<!-- ========== KPI CARDS ========== -->
<div style="display:flex;gap:12px;padding:16px 20px 0;justify-content:space-between;">
  ${construirKPICard('Total Jornales', formatNum(totalJornales), 'jornales registrados', '#73991C')}
  ${construirKPICard('Costo Total', formatCOP(costoTotal), 'pesos colombianos', '#1976D2')}
  ${construirKPICard('Trabajadores', String(trabajadoresActivos), `${personal?.empleados || 0} emp. / ${personal?.contratistas || 0} cont.`, '#00897B')}
  ${construirKPICard('Aplicaciones', String(aplicacionesActivas), 'en ejecución', '#F57C00')}
  ${construirKPICard('Alertas Fito', String(alertasFito), 'requieren atención', '#D32F2F')}
</div>

<!-- ========== PERSONAL RÁPIDO ========== -->
${(personal?.fallas > 0 || personal?.permisos > 0) ? `
<div style="display:flex;gap:12px;padding:8px 20px 0;">
  ${personal.fallas > 0 ? `<div style="font-size:11px;color:#F57C00;">⚠️ Fallas: <strong>${personal.fallas}</strong></div>` : ''}
  ${personal.permisos > 0 ? `<div style="font-size:11px;color:#1976D2;">📋 Permisos: <strong>${personal.permisos}</strong></div>` : ''}
</div>` : ''}

<!-- ========== DISTRIBUCIÓN DE JORNALES ========== -->
${jornales ? construirSeccionJornales(jornales, maxJornalCelda) : ''}

<!-- ========== PAGE BREAK ========== -->
<div class="page-break"></div>

<!-- ========== APLICACIONES ========== -->
${construirSeccionAplicaciones(aplicaciones)}

<!-- ========== MONITOREO FITOSANITARIO ========== -->
${monitoreo ? construirSeccionMonitoreo(monitoreo, analisis.interpretacion_monitoreo) : ''}

<!-- ========== PAGE BREAK ========== -->
<div class="page-break"></div>

<!-- ========== TEMAS ADICIONALES ========== -->
${(temasAdicionales && temasAdicionales.length > 0) ? construirSeccionTemasAdicionales(temasAdicionales) : ''}

<!-- ========== CONCLUSIONES ========== -->
${construirSeccionConclusiones(analisis.conclusiones)}

<!-- ========== FOOTER ========== -->
<div style="text-align:center;padding:20px;margin-top:20px;border-top:1px solid #E0E0E0;">
  <div style="font-size:10px;color:#999;">Generado automáticamente — Escocia Hass — ${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

</body>
</html>`;

  return html;
}

// ============================================================================
// SUB-CONSTRUCTORES DE SECCIONES
// ============================================================================

function construirKPICard(label: string, value: string, subtitle: string, color: string): string {
  return `<div style="flex:1;background:#FFFFFF;border-radius:8px;border-top:4px solid ${color};padding:14px 10px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:24px;font-weight:800;color:${color};">${value}</div>
    <div style="font-size:11px;font-weight:600;color:#4D240F;margin-top:2px;">${label}</div>
    <div style="font-size:10px;color:#888;margin-top:1px;">${subtitle}</div>
  </div>`;
}

function construirSeccionJornales(jornales: any, maxJornalCelda: number): string {
  const { actividades, lotes, datos, totalesPorActividad, totalesPorLote, totalGeneral } = jornales;

  // Heatmap table
  let tableRows = '';
  for (const act of actividades) {
    let cells = '';
    for (const lote of lotes) {
      const val = datos[act]?.[lote]?.jornales || 0;
      const bg = getHeatmapColor(val, maxJornalCelda);
      const textColor = getTextColorForHeatmap(val, maxJornalCelda);
      cells += `<td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:600;background:${bg};color:${textColor};border:1px solid #E8E8E8;">${val > 0 ? val.toFixed(2) : '-'}</td>`;
    }
    const actTotal = totalesPorActividad[act]?.jornales || 0;
    cells += `<td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:700;background:#F5F5F0;color:#4D240F;border:1px solid #E8E8E8;">${actTotal.toFixed(2)}</td>`;
    tableRows += `<tr><td style="padding:8px 12px;font-size:12px;font-weight:600;color:#4D240F;border:1px solid #E8E8E8;background:#FAFAFA;">${act}</td>${cells}</tr>`;
  }

  // Fila de totales
  let totalCells = '';
  for (const lote of lotes) {
    const val = totalesPorLote[lote]?.jornales || 0;
    totalCells += `<td style="padding:8px 10px;text-align:center;font-size:12px;font-weight:700;background:#E8F0D0;color:#4D240F;border:1px solid #E8E8E8;">${val.toFixed(2)}</td>`;
  }
  totalCells += `<td style="padding:8px 10px;text-align:center;font-size:13px;font-weight:800;background:#73991C;color:#FFFFFF;border:1px solid #E8E8E8;">${totalGeneral.jornales.toFixed(2)}</td>`;
  tableRows += `<tr><td style="padding:8px 12px;font-size:12px;font-weight:700;color:#4D240F;border:1px solid #E8E8E8;background:#E8F0D0;">TOTAL</td>${totalCells}</tr>`;

  // Header de tabla
  let tableHeaders = '<th style="padding:8px 12px;font-size:11px;font-weight:700;color:#FFFFFF;background:#73991C;border:1px solid #5A7A15;text-align:left;">Actividad</th>';
  for (const lote of lotes) {
    tableHeaders += `<th style="padding:8px 10px;font-size:11px;font-weight:700;color:#FFFFFF;background:#73991C;border:1px solid #5A7A15;text-align:center;">${lote}</th>`;
  }
  tableHeaders += '<th style="padding:8px 10px;font-size:11px;font-weight:700;color:#FFFFFF;background:#73991C;border:1px solid #5A7A15;text-align:center;">Total</th>';

  // Barras horizontales por actividad
  const actividadesOrdenadas = [...actividades].sort((a: string, b: string) => {
    return (totalesPorActividad[b]?.jornales || 0) - (totalesPorActividad[a]?.jornales || 0);
  });

  let barrasHTML = '';
  for (const act of actividadesOrdenadas) {
    const val = totalesPorActividad[act]?.jornales || 0;
    const pct = totalGeneral.jornales > 0 ? (val / totalGeneral.jornales * 100) : 0;
    const costo = totalesPorActividad[act]?.costo || 0;
    barrasHTML += `
    <div style="display:flex;align-items:center;margin-bottom:6px;">
      <div style="width:120px;font-size:11px;font-weight:600;color:#4D240F;text-align:right;padding-right:10px;flex-shrink:0;">${act}</div>
      <div style="flex:1;background:#E8E8E8;border-radius:4px;height:22px;position:relative;overflow:hidden;">
        <div style="background:#73991C;height:100%;border-radius:4px;width:${Math.max(pct, 2)}%;transition:width 0.3s;"></div>
        <span style="position:absolute;left:8px;top:3px;font-size:11px;font-weight:600;color:${pct > 30 ? '#FFFFFF' : '#4D240F'};">${val.toFixed(1)} jorn. (${pct.toFixed(0)}%)</span>
      </div>
      <div style="width:90px;font-size:10px;color:#888;text-align:right;padding-left:8px;flex-shrink:0;">${formatCOP(costo)}</div>
    </div>`;
  }

  return `
  <div style="padding:20px 20px 0;">
    <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #73991C;padding-left:10px;">📊 Distribución de Jornales</div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead><tr>${tableHeaders}</tr></thead>
      <tbody>${tableRows}</tbody>
    </table>

    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-bottom:8px;">Distribución por Actividad</div>
    ${barrasHTML}
  </div>`;
}

function construirSeccionAplicaciones(aplicaciones: any): string {
  const planeadas = aplicaciones?.planeadas || [];
  const activas = aplicaciones?.activas || [];
  const cerradas = aplicaciones?.cerradas || [];

  if (planeadas.length === 0 && activas.length === 0 && cerradas.length === 0) {
    return `
    <div style="padding:20px 20px 0;">
      <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #F57C00;padding-left:10px;">🧪 Aplicaciones</div>
      <div style="padding:16px;background:#F5F5F0;border-radius:8px;font-size:12px;color:#888;text-align:center;">Sin aplicaciones planeadas ni en ejecución esta semana</div>
    </div>`;
  }

  let cerradasHTML = '';
  for (const app of cerradas) {
    cerradasHTML += `
    <div style="background:#F5F9EE;border-radius:8px;border:1px solid #BFD97D;padding:12px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;color:#4D240F;">${app.nombre} <span style="font-size:10px;color:#73991C;">(${app.tipo} - Cerrada)</span></div>
      <div style="font-size:11px;color:#888;margin:4px 0;">📅 ${app.fechaInicio} — ${app.fechaFin} (${app.diasEjecucion} días) | 💰 Costo Real: ${formatCOP(app.general?.costoReal || 0)}</div>
      <div style="font-size:11px;color:#555;margin-top:4px;">${app.proposito || ''}</div>
      <div style="font-size:11px;color:#555;margin-top:4px;"><strong>Ejecución (${app.general?.unidad || ''}):</strong> Planeado: ${app.general?.canecasBultosPlaneados || 0}, Real: ${app.general?.canecasBultosReales || 0} (${app.general?.canecasBultosDesviacion > 0 ? '+' : ''}${app.general?.canecasBultosDesviacion || 0}%)</div>
    </div>`;
  }

  let activasHTML = '';
  for (const app of activas) {
    let lotesHTML = '';
    for (const lote of app.progresoPorLote || []) {
      lotesHTML += `
      <div style="margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">
          <span style="font-weight:600;">${lote.loteNombre}</span>
          <span style="color:#888;">${lote.ejecutado}/${lote.planeado} ${lote.unidad} (${lote.porcentaje}%)</span>
        </div>
        <div style="background:#E0E0E0;border-radius:4px;height:16px;overflow:hidden;">
          <div style="background:${lote.porcentaje >= 100 ? '#73991C' : lote.porcentaje >= 50 ? '#8DB440' : '#BFD97D'};height:100%;border-radius:4px;width:${Math.min(lote.porcentaje, 100)}%;"></div>
        </div>
      </div>`;
    }

    // Barra global
    const globalPct = app.porcentajeGlobal || 0;
    activasHTML += `
    <div style="background:#FFFFFF;border-radius:8px;border:1px solid #E8E8E8;padding:16px;margin-bottom:12px;box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div>
          <span style="font-size:14px;font-weight:700;color:#4D240F;">${app.nombre}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#FFF3E0;color:#F57C00;margin-left:8px;">${app.tipo}</span>
        </div>
        <div style="font-size:20px;font-weight:800;color:${globalPct >= 80 ? '#73991C' : globalPct >= 40 ? '#F57C00' : '#D32F2F'};">${globalPct}%</div>
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:10px;">${app.proposito || ''}</div>

      <div style="background:#E0E0E0;border-radius:6px;height:22px;overflow:hidden;margin-bottom:12px;position:relative;">
        <div style="background:#73991C;height:100%;border-radius:6px;width:${Math.min(globalPct, 100)}%;"></div>
        <span style="position:absolute;left:50%;top:3px;transform:translateX(-50%);font-size:11px;font-weight:700;color:${globalPct > 45 ? '#FFFFFF' : '#4D240F'};">Global: ${app.totalEjecutado}/${app.totalPlaneado} ${app.unidad}</span>
      </div>

      ${lotesHTML}
    </div>`;
  }

  let planeadasHTML = '';
  for (const app of planeadas) {
    const comprasItems = (app.listaCompras || []).map((item: any) =>
      `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;background:#F0F0F0;color:#555;margin:2px;">${item.productoNombre}: ${item.cantidadNecesaria} ${item.unidad}</span>`
    ).join(' ');

    planeadasHTML += `
    <div style="background:#FFFDF0;border-radius:8px;border:1px solid #F9E4A0;padding:12px;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;color:#4D240F;">${app.nombre} <span style="font-size:10px;color:#F57C00;">(${app.tipo})</span></div>
      <div style="font-size:11px;color:#888;margin:4px 0;">📅 Planeada: ${app.fechaInicioPlaneada} | 💰 Estimado: ${formatCOP(app.costoTotalEstimado)}</div>
      <div style="font-size:11px;color:#555;margin-top:4px;">${app.proposito}</div>
      ${comprasItems ? `<div style="margin-top:6px;">${comprasItems}</div>` : ''}
    </div>`;
  }

  return `
  <div style="padding:20px 20px 0;">
    <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #F57C00;padding-left:10px;">🧪 Aplicaciones</div>

    ${cerradas.length > 0 ? `
    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-bottom:8px;">Cerradas Recientemente (${cerradas.length})</div>
    ${cerradasHTML}` : ''}

    ${activas.length > 0 ? `
    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-bottom:8px;margin-top:12px;">En Ejecución (${activas.length})</div>
    ${activasHTML}` : ''}

    ${planeadas.length > 0 ? `
    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-bottom:8px;margin-top:12px;">Planeadas (${planeadas.length})</div>
    ${planeadasHTML}` : ''}
  </div>`;
}

function construirSeccionMonitoreo(monitoreo: any, interpretacion: string): string {
  const { detallePorLote, insights, tendencias, fechasMonitoreo } = monitoreo;

  if ((!detallePorLote || detallePorLote.length === 0) && (!insights || insights.length === 0)) {
    return `
    <div style="padding:20px 20px 0;">
      <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #D32F2F;padding-left:10px;">🐛 Monitoreo Fitosanitario</div>
      <div style="padding:16px;background:#F5F5F0;border-radius:8px;font-size:12px;color:#888;text-align:center;">Sin datos de monitoreo esta semana</div>
    </div>`;
  }

  // Construir mapa de tendencias por plaga para mini barras
  const tendenciasPorPlaga = new Map<string, number[]>();
  if (tendencias && tendencias.length > 0) {
    for (const t of tendencias) {
      if (!tendenciasPorPlaga.has(t.plagaNombre)) tendenciasPorPlaga.set(t.plagaNombre, []);
      tendenciasPorPlaga.get(t.plagaNombre)!.push(t.incidenciaPromedio);
    }
  }

  // Tabla de detalle
  let tableRows = '';
  for (const lote of detallePorLote || []) {
    for (let i = 0; i < lote.sublotes.length; i++) {
      const s = lote.sublotes[i];
      const showLote = i === 0;

      // Mini barras de tendencia
      const plagaTendencia = tendenciasPorPlaga.get(s.plagaNombre) || [];
      let miniBarrasHTML = '';
      if (plagaTendencia.length > 0) {
        const maxTend = Math.max(...plagaTendencia, 1);
        miniBarrasHTML = plagaTendencia.map((val: number) => {
          const h = Math.max((val / maxTend) * 24, 3);
          const barColor = val > 20 ? '#D32F2F' : val > 10 ? '#F9A825' : '#73991C';
          return `<div style="display:inline-block;width:10px;height:${h}px;background:${barColor};border-radius:2px;margin-right:3px;vertical-align:bottom;"></div>`;
        }).join('');
        miniBarrasHTML = `<div style="display:flex;align-items:flex-end;height:28px;">${miniBarrasHTML}</div>`;
      } else {
        miniBarrasHTML = '<span style="font-size:10px;color:#CCC;">—</span>';
      }

      tableRows += `<tr style="border-bottom:1px solid #F0F0F0;">
        ${showLote ? `<td rowspan="${lote.sublotes.length}" style="padding:8px 10px;font-size:12px;font-weight:600;color:#4D240F;border-right:1px solid #E8E8E8;vertical-align:top;background:#FAFAFA;">${lote.loteNombre}</td>` : ''}
        <td style="padding:6px 10px;font-size:11px;color:#555;">${s.subloteNombre}</td>
        <td style="padding:6px 10px;font-size:11px;font-weight:600;color:#4D240F;">${s.plagaNombre}</td>
        <td style="padding:6px 10px;font-size:12px;font-weight:700;text-align:center;color:${s.incidencia > 20 ? '#D32F2F' : s.incidencia > 10 ? '#F57C00' : '#4D240F'};">${s.incidencia}%</td>
        <td style="padding:6px 10px;text-align:center;">${getBadgeHTML(s.gravedad, s.gravedad)}</td>
        <td style="padding:6px 10px;font-size:11px;text-align:center;color:#555;">${s.arboresAfectados}/${s.arboresMonitoreados}</td>
        <td style="padding:6px 10px;text-align:center;">${miniBarrasHTML}</td>
      </tr>`;
    }
  }

  // Insights cards
  let insightsHTML = '';
  if (insights && insights.length > 0) {
    for (const insight of insights) {
      const styles = getInsightStyles(insight.tipo);
      insightsHTML += `
      <div style="border-left:4px solid ${styles.border};background:${styles.bg};padding:10px 14px;border-radius:0 6px 6px 0;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;color:#4D240F;">${styles.icon} ${insight.titulo}</div>
        <div style="font-size:11px;color:#555;margin-top:3px;">${insight.descripcion}</div>
        ${insight.accion ? `<div style="font-size:11px;color:${styles.border};font-weight:600;margin-top:4px;">→ ${insight.accion}</div>` : ''}
      </div>`;
    }
  }

  return `
  <div style="padding:20px 20px 0;">
    <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:4px;border-left:4px solid #D32F2F;padding-left:10px;">🐛 Monitoreo Fitosanitario</div>
    ${fechasMonitoreo?.length > 0 ? `<div style="font-size:10px;color:#999;margin-bottom:12px;padding-left:14px;">Monitoreos: ${fechasMonitoreo.join(', ')}</div>` : ''}

    ${detallePorLote && detallePorLote.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#F5F5F0;">
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:left;border-bottom:2px solid #E0E0E0;">Lote</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:left;border-bottom:2px solid #E0E0E0;">Sublote</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:left;border-bottom:2px solid #E0E0E0;">Plaga</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:center;border-bottom:2px solid #E0E0E0;">Incid. %</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:center;border-bottom:2px solid #E0E0E0;">Gravedad</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:center;border-bottom:2px solid #E0E0E0;">Árboles</th>
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#555;text-align:center;border-bottom:2px solid #E0E0E0;">Tendencia</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>` : ''}

    ${insightsHTML ? `
    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-bottom:8px;">Alertas e Insights</div>
    ${insightsHTML}` : ''}

    ${interpretacion ? `
    <div style="background:#F0F7E8;padding:12px 16px;border-radius:8px;margin-top:12px;">
      <div style="font-size:11px;font-weight:700;color:#73991C;margin-bottom:4px;">🔬 Interpretación de Tendencias</div>
      <div style="font-size:12px;color:#4D240F;line-height:1.5;">${interpretacion}</div>
    </div>` : ''}
  </div>`;
}

function construirSeccionTemasAdicionales(temas: any[]): string {
  let contenidoHTML = '';
  for (const bloque of temas) {
    if (bloque.tipo === 'texto') {
      contenidoHTML += `
      <div style="background:#FFFFFF;border:1px solid #E8E8E8;border-radius:8px;padding:14px;margin-bottom:8px;">
        ${bloque.titulo ? `<div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:6px;">${bloque.titulo}</div>` : ''}
        <div style="font-size:12px;color:#555;line-height:1.6;">${(bloque.contenido || '').replace(/\n/g, '<br>')}</div>
      </div>`;
    } else if (bloque.tipo === 'imagen_con_texto') {
      contenidoHTML += `
      <div style="background:#FFFFFF;border:1px solid #E8E8E8;border-radius:8px;padding:14px;margin-bottom:8px;">
        ${bloque.titulo ? `<div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:6px;">📷 ${bloque.titulo}</div>` : ''}
        <div style="font-size:12px;color:#555;line-height:1.6;">${bloque.descripcion || ''}</div>
      </div>`;
    }
  }

  return `
  <div style="padding:20px 20px 0;">
    <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #1976D2;padding-left:10px;">📝 Temas Adicionales</div>
    ${contenidoHTML}
  </div>`;
}

function construirSeccionConclusiones(conclusiones: AnalisisGemini['conclusiones']): string {
  const prioridadColor: Record<string, { bg: string; dot: string }> = {
    alta: { bg: '#FFF5F5', dot: '#D32F2F' },
    media: { bg: '#FFFDF0', dot: '#F9A825' },
    baja: { bg: '#F5F9EE', dot: '#73991C' },
  };

  let items = '';
  for (const c of conclusiones) {
    const colors = prioridadColor[c.prioridad] || prioridadColor.media;
    items += `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:${colors.bg};border-radius:6px;margin-bottom:6px;">
      <div style="font-size:18px;flex-shrink:0;line-height:1;">${c.icono}</div>
      <div style="flex:1;">
        <div style="font-size:12px;color:#4D240F;line-height:1.5;">${c.texto}</div>
      </div>
      <div style="width:8px;height:8px;border-radius:50%;background:${colors.dot};flex-shrink:0;margin-top:5px;"></div>
    </div>`;
  }

  return `
  <div style="padding:20px 20px 0;">
    <div style="font-size:15px;font-weight:700;color:#4D240F;margin-bottom:12px;border-left:4px solid #73991C;padding-left:10px;">🎯 Conclusiones y Recomendaciones</div>
    ${items}
  </div>`;
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

    // Paso 1: Formatear datos para el prompt
    const datosFormateados = formatearDatosParaPrompt(datos);
    console.log('Datos formateados:', datosFormateados.length, 'chars');

    // Paso 2: Llamar a Gemini para análisis (solo JSON)
    console.log('Calling Gemini API for analysis...');
    const geminiStart = Date.now();
    const { analisis, tokens } = await llamarGemini(datosFormateados, instrucciones);
    console.log(`Gemini completed in ${Date.now() - geminiStart}ms`);

    // Paso 3: Construir HTML determinístico
    console.log('Building deterministic HTML template...');
    const html = construirHTMLReporte(datos, analisis);
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
