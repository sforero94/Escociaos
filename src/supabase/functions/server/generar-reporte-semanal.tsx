// generar-reporte-semanal.tsx
// Local copy of the Edge Function for testing with Vitest
// Matches: supabase/functions/make-server-1ccce916/generar-reporte-semanal.ts
// NOTE: Deno.env is mocked in tests via vi.stubGlobal('Deno', ...)

// ============================================================================
// TIPOS
// ============================================================================

interface GenerateReportRequest {
  datos: any;
  instrucciones?: string;
}

interface GenerateReportResponse {
  success: boolean;
  html?: string;
  error?: string;
  tokens_usados?: number;
}

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
// PROMPT TEMPLATE
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
  "narrativa_semana": "Un párrafo narrativo describiendo cómo fue la semana operativamente."
}

REGLAS:
- Todo en español
- highlights: mínimo 2, máximo 4 frases cortas
- alertas: solo incluir si hay situaciones que requieran atención
- conclusiones: mínimo 3, máximo 5 items accionables
- recomendaciones: mínimo 2, máximo 4 para la próxima semana
- Usa estos íconos según prioridad: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
- NO incluir HTML, markdown, ni código. SOLO el objeto JSON.`;

// ============================================================================
// FUNCIONES DE FORMATEO DE DATOS PARA EL PROMPT
// ============================================================================

function formatearDatosParaPrompt(datos: any): string {
  const partes: string[] = [];

  partes.push(`## PERÍODO DEL REPORTE
- Semana ${datos.semana.numero} del ${datos.semana.ano}
- Desde: ${datos.semana.inicio}
- Hasta: ${datos.semana.fin}`);

  partes.push(`## PERSONAL
- Total trabajadores: ${datos.personal.totalTrabajadores}
  - Empleados: ${datos.personal.empleados}
  - Contratistas: ${datos.personal.contratistas}
- Fallas: ${datos.personal.fallas}
- Permisos: ${datos.personal.permisos}`);

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

  if (datos.aplicaciones.cerradas?.length > 0) {
    partes.push(`## APLICACIONES CERRADAS RECIENTEMENTE`);
    datos.aplicaciones.cerradas.forEach((app: any) => {
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Período: ${app.fechaInicio} — ${app.fechaFin} (${app.diasEjecucion} días)
- Resultado: ${app.general?.canecasBultosReales || 0}/${app.general?.canecasBultosPlaneados || 0} ${app.general?.unidad || ''}
- Costo real: $${Math.round(app.general?.costoReal || 0).toLocaleString('es-CO')} COP`);
    });
  }

  if (datos.monitoreo) {
    partes.push(`## MONITOREO FITOSANITARIO
Fechas de monitoreo analizadas: ${datos.monitoreo.fechasMonitoreo.join(', ')}`);

    if (datos.monitoreo.tendencias.length > 0) {
      partes.push(`### Tendencias (últimos 3 monitoreos)`);
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

    if (datos.monitoreo.detallePorLote.length > 0) {
      partes.push(`### Detalle por lote`);
      datos.monitoreo.detallePorLote.forEach((lote: any) => {
        partes.push(`  ${lote.loteNombre}:`);
        lote.sublotes.forEach((s: any) => {
          partes.push(`    - ${s.subloteNombre} | ${s.plagaNombre}: ${s.incidencia}% (${s.gravedad}) [${s.arboresAfectados}/${s.arboresMonitoreados}]`);
        });
      });
    }

    if (datos.monitoreo.insights.length > 0) {
      partes.push(`### Alertas e insights`);
      datos.monitoreo.insights.forEach((insight: any) => {
        const icono = insight.tipo === 'urgente' ? '🔴' : insight.tipo === 'atencion' ? '⚠️' : '✅';
        partes.push(`  ${icono} [${insight.tipo.toUpperCase()}] ${insight.titulo}: ${insight.descripcion}`);
        if (insight.accion) partes.push(`    → Acción: ${insight.accion}`);
      });
    }
  }

  if (datos.temasAdicionales?.length > 0) {
    partes.push(`## TEMAS ADICIONALES`);
    datos.temasAdicionales.forEach((bloque: any, i: number) => {
      if (bloque.tipo === 'texto') {
        partes.push(`### ${bloque.titulo || `Tema ${i + 1}`}\n${bloque.contenido}`);
      } else if (bloque.tipo === 'imagen_con_texto') {
        partes.push(`### ${bloque.titulo || `Imagen ${i + 1}`}\n[IMAGEN]\nDescripción: ${bloque.descripcion}`);
      }
    });
  }

  return partes.join('\n\n');
}

// ============================================================================
// LLAMADA A GEMINI
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

  const candidate = result.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini no retornó candidatos.');
  }

  const finishReason = candidate.finishReason;
  console.log('Gemini finishReason:', finishReason);

  if (finishReason === 'SAFETY') {
    throw new Error('Gemini bloqueó la respuesta por filtros de seguridad. Intenta ajustar los datos del reporte.');
  }

  if (finishReason === 'RECITATION') {
    throw new Error('Gemini bloqueó la respuesta por detección de recitación.');
  }

  const text = candidate.content?.parts?.[0]?.text || '';
  if (!text) {
    throw new Error('Gemini no generó contenido de texto en la respuesta.');
  }

  let jsonText = text.trim();
  if (jsonText.startsWith('```json')) jsonText = jsonText.slice(7);
  else if (jsonText.startsWith('```')) jsonText = jsonText.slice(3);
  if (jsonText.endsWith('```')) jsonText = jsonText.slice(0, -3);
  jsonText = jsonText.trim();

  let analisis: AnalisisGemini;
  try {
    analisis = JSON.parse(jsonText);
  } catch {
    console.error('Failed to parse Gemini JSON:', jsonText.slice(0, 300));
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
      analisis_monitoreo: 'Consulte la sección de monitoreo.',
      interpretacion_monitoreo: 'Consulte la sección de monitoreo.',
      recomendaciones: ['Revisar los indicadores del reporte', 'Planificar las actividades de la próxima semana'],
      narrativa_semana: 'Semana operativa procesada.',
    };
    console.warn('Using fallback analysis due to JSON parse failure');
  }

  // Fill missing fields
  if (!analisis.resumen_ejecutivo) analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  if (!Array.isArray(analisis.highlights)) analisis.highlights = [];
  if (!Array.isArray(analisis.alertas)) analisis.alertas = [];
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [{ icono: '📊', texto: 'Revisar los indicadores del reporte', prioridad: 'media' }];
  }
  if (!analisis.analisis_jornales) analisis.analisis_jornales = '';
  if (!analisis.analisis_aplicaciones) analisis.analisis_aplicaciones = '';
  if (!analisis.analisis_monitoreo) analisis.analisis_monitoreo = '';
  if (!analisis.interpretacion_monitoreo) analisis.interpretacion_monitoreo = '';
  if (!Array.isArray(analisis.recomendaciones)) analisis.recomendaciones = [];
  if (!analisis.narrativa_semana) analisis.narrativa_semana = '';

  const tokens = result.usageMetadata?.totalTokenCount || 0;
  return { analisis, tokens };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

function formatNum(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

// ============================================================================
// SIMPLE BUILT-IN HTML TEMPLATE (used when no external htmlBuilder is provided)
// This is a minimal fallback. The real template is in generar-reporte-html.ts
// ============================================================================

function construirHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const { semana, personal, jornales, aplicaciones, monitoreo, temasAdicionales } = datos;

  // KPIs
  const totalJornales = jornales?.totalGeneral?.jornales || 0;
  const costoTotal = jornales?.totalGeneral?.costo || 0;
  const numAplicaciones = (aplicaciones?.activas?.length || 0) + (aplicaciones?.planeadas?.length || 0) + (aplicaciones?.cerradas?.length || 0);
  const numAlertas = monitoreo?.insights?.length || 0;

  let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; width: 210mm; margin: 0 auto; color: #172E08; background: #F8FAF5; font-size: 10pt; line-height: 1.5; }
    .page { padding: 15mm; }
    h1 { font-size: 20pt; font-weight: 700; margin-bottom: 4mm; }
    h2 { font-size: 13pt; font-weight: 600; margin-bottom: 3mm; border-bottom: 2px solid #73991C; padding-bottom: 2mm; }
    h3 { font-size: 10.5pt; font-weight: 600; margin-bottom: 2mm; }
    .section { margin-bottom: 8mm; page-break-inside: avoid; }
    .page-break { page-break-before: always; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 2mm; }
    th { background: #73991C; color: white; padding: 2mm 3mm; text-align: left; font-size: 8pt; }
    td { padding: 2mm 3mm; border-bottom: 1px solid #E7EDDD; }
    tr:nth-child(even) { background: #F0F4E8; }
    .kpi-grid { display: flex; gap: 3mm; margin: 4mm 0; }
    .kpi-box { flex: 1; background: white; border: 1px solid #BFD97D; border-radius: 6px; padding: 3mm; text-align: center; }
    .kpi-value { font-size: 18pt; font-weight: 700; color: #73991C; }
    .kpi-label { font-size: 7pt; color: #666; text-transform: uppercase; }
    .card { background: white; border: 1px solid #E7EDDD; border-radius: 6px; padding: 4mm; margin-bottom: 3mm; }
    .badge { display: inline-block; padding: 1mm 3mm; border-radius: 10px; font-size: 7.5pt; font-weight: 600; }
    .badge-ok { background: #d4edda; color: #155724; }
    .badge-warn { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .progress-bar { background: #E7EDDD; border-radius: 4px; height: 6px; overflow: hidden; margin: 1mm 0; }
    .progress-fill { height: 100%; background: #73991C; border-radius: 4px; }
    .analysis { background: white; border-left: 3px solid #73991C; padding: 3mm 4mm; margin-top: 3mm; font-size: 9pt; color: #4a5e2a; font-style: italic; }
    .footer { margin-top: 10mm; padding-top: 3mm; border-top: 1px solid #E7EDDD; font-size: 7.5pt; color: #999; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
<div class="page">
  <h1>📊 Reporte Semanal · S${semana.numero}/${semana.ano}</h1>
  <p style="color:#666;margin-bottom:6mm">${formatDate(semana.inicio)} — ${formatDate(semana.fin)}</p>

  <div class="section">
    <h2>RESUMEN EJECUTIVO</h2>
    <div class="analysis" style="border-left-width:4px">${escapeHtml(analisis.resumen_ejecutivo)}</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-box"><div class="kpi-value">${formatNum(totalJornales)}</div><div class="kpi-label">Total Jornales</div></div>
    <div class="kpi-box"><div class="kpi-value">${formatCOP(costoTotal)}</div><div class="kpi-label">Costo Total</div></div>
    <div class="kpi-box"><div class="kpi-value">${personal.totalTrabajadores}</div><div class="kpi-label">Trabajadores</div></div>
    <div class="kpi-box"><div class="kpi-value">${numAplicaciones}</div><div class="kpi-label">Aplicaciones</div></div>
    <div class="kpi-box"><div class="kpi-value">${numAlertas}</div><div class="kpi-label">Alertas Fito</div></div>
  </div>`;

  // Personal
  html += `
  <div class="section">
    <h2>👥 Personal</h2>
    <div class="kpi-grid">
      <div class="kpi-box"><div class="kpi-value">${personal.empleados}</div><div class="kpi-label">Empleados</div></div>
      <div class="kpi-box"><div class="kpi-value">${personal.contratistas}</div><div class="kpi-label">Contratistas</div></div>
      <div class="kpi-box"><div class="kpi-value" style="color:${personal.fallas > 2 ? '#DC3545' : personal.fallas > 0 ? '#FFC107' : '#73991C'}">${personal.fallas}</div><div class="kpi-label">Fallas</div></div>
      <div class="kpi-box"><div class="kpi-value">${personal.permisos}</div><div class="kpi-label">Permisos</div></div>
    </div>
  </div>`;

  // Jornales
  if (jornales) {
    const { actividades, lotes, datos: matrizDatos, totalesPorActividad, totalGeneral: tg } = jornales;
    let rows = '';
    for (const act of actividades) {
      let cells = '';
      for (const lote of lotes) {
        const val = matrizDatos[act]?.[lote]?.jornales || 0;
        cells += `<td style="text-align:right">${val > 0 ? formatNum(val) : '—'}</td>`;
      }
      const total = totalesPorActividad[act]?.jornales || 0;
      rows += `<tr><td>${escapeHtml(act)}</td>${cells}<td style="text-align:right;font-weight:600">${formatNum(total)}</td></tr>`;
    }
    html += `
  <div class="section page-break">
    <h2>📋 Distribución de Jornales</h2>
    <table>
      <thead><tr><th>Actividad</th>${lotes.map((l: string) => `<th style="text-align:right">${escapeHtml(l)}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#BFD97D"><td><strong>TOTAL</strong></td>${lotes.map((l: string) => `<td style="text-align:right;font-weight:600">${formatNum(jornales.totalesPorLote[l]?.jornales || 0)}</td>`).join('')}<td style="text-align:right;font-weight:700">${formatNum(tg.jornales)}</td></tr></tfoot>
    </table>
    ${analisis.analisis_jornales ? `<div class="analysis">${escapeHtml(analisis.analisis_jornales)}</div>` : ''}
  </div>`;
  }

  // Aplicaciones
  const activas = aplicaciones?.activas || [];
  const planeadas = aplicaciones?.planeadas || [];
  const cerradas = aplicaciones?.cerradas || [];

  if (activas.length > 0 || planeadas.length > 0 || cerradas.length > 0) {
    html += `<div class="section page-break"><h2>🧪 Aplicaciones</h2>`;

    for (const app of cerradas) {
      const g = app.general || {};
      html += `
      <div class="card">
        <h3>${escapeHtml(app.nombre)} <span class="badge badge-ok">Cerrada · ${escapeHtml(app.tipo)}</span></h3>
        <p style="font-size:8.5pt;color:#666">${formatDate(app.fechaInicio)} — ${formatDate(app.fechaFin)} (${app.diasEjecucion} días) · Costo: ${formatCOP(g.costoReal || 0)}</p>
        <div class="kpi-grid" style="margin-top:2mm">
          <div class="kpi-box"><div class="kpi-value" style="font-size:14pt">${g.canecasBultosPlaneados ?? 0}</div><div class="kpi-label">Planeado (${g.unidad || ''})</div></div>
          <div class="kpi-box"><div class="kpi-value" style="font-size:14pt">${g.canecasBultosReales ?? 0}</div><div class="kpi-label">Real</div></div>
          <div class="kpi-box"><div class="kpi-value" style="font-size:14pt">${g.canecasBultosDesviacion > 0 ? '+' : ''}${g.canecasBultosDesviacion ?? 0}%</div><div class="kpi-label">Desviación</div></div>
        </div>
      </div>`;
    }

    for (const app of activas) {
      const pct = Math.min(100, app.porcentajeGlobal || 0);
      let lotesHtml = '';
      for (const lote of (app.progresoPorLote || [])) {
        const lPct = Math.min(100, lote.porcentaje || 0);
        lotesHtml += `<tr><td>${escapeHtml(lote.loteNombre)}</td><td style="text-align:right">${lote.ejecutado}/${lote.planeado} ${lote.unidad}</td><td style="text-align:right">${lPct}%</td></tr>`;
      }
      html += `
      <div class="card">
        <h3>${escapeHtml(app.nombre)} <span class="badge badge-warn">En ejecución · ${escapeHtml(app.tipo)}</span></h3>
        <p style="font-size:8.5pt;color:#666">Inicio: ${formatDate(app.fechaInicio)} · ${escapeHtml(app.proposito)}</p>
        <p style="font-size:9pt;margin-top:1mm">Progreso: ${app.totalEjecutado}/${app.totalPlaneado} ${app.unidad}</p>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        <p style="text-align:right;font-size:8pt;font-weight:600;color:#73991C">${pct}%</p>
        ${lotesHtml ? `<table><thead><tr><th>Lote</th><th style="text-align:right">Avance</th><th style="text-align:right">%</th></tr></thead><tbody>${lotesHtml}</tbody></table>` : ''}
      </div>`;
    }

    for (const app of planeadas) {
      let comprasHtml = '';
      for (const item of (app.listaCompras || [])) {
        comprasHtml += `<tr><td>${escapeHtml(item.productoNombre)}</td><td>${escapeHtml(item.categoria)}</td><td style="text-align:right">${item.cantidadNecesaria} ${escapeHtml(item.unidad)}</td><td style="text-align:right">${formatCOP(item.costoEstimado)}</td></tr>`;
      }
      html += `
      <div class="card">
        <h3>${escapeHtml(app.nombre)} <span class="badge" style="background:#BFD97D;color:#5a7a14">Planeada · ${escapeHtml(app.tipo)}</span></h3>
        <p style="font-size:8.5pt;color:#666">Fecha: ${formatDate(app.fechaInicioPlaneada)} · Costo est.: ${formatCOP(app.costoTotalEstimado)} · Blancos: ${escapeHtml(app.blancosBiologicos.join(', '))}</p>
        ${comprasHtml ? `<table><thead><tr><th>Producto</th><th>Categoría</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Costo Est.</th></tr></thead><tbody>${comprasHtml}</tbody></table>` : ''}
      </div>`;
    }

    if (analisis.analisis_aplicaciones) {
      html += `<div class="analysis">${escapeHtml(analisis.analisis_aplicaciones)}</div>`;
    }
    html += `</div>`;
  }

  // Monitoreo
  if (monitoreo && monitoreo.detallePorLote?.length > 0) {
    let detalleRows = '';
    for (const lote of monitoreo.detallePorLote) {
      for (const s of lote.sublotes) {
        const sevClass = s.gravedad === 'Alta' ? 'color:#DC3545;font-weight:600' : s.gravedad === 'Media' ? 'color:#856404;font-weight:600' : '';
        detalleRows += `<tr><td>${escapeHtml(lote.loteNombre)}</td><td>${escapeHtml(s.subloteNombre)}</td><td>${escapeHtml(s.plagaNombre)}</td><td style="${sevClass}">${s.incidencia.toFixed(1)}%</td><td style="${sevClass}">${escapeHtml(s.gravedad)}</td><td>${s.arboresAfectados}/${s.arboresMonitoreados}</td></tr>`;
      }
    }
    html += `
  <div class="section page-break">
    <h2>🐛 Monitoreo Fitosanitario</h2>
    <table>
      <thead><tr><th>Lote</th><th>Sublote</th><th>Plaga</th><th style="text-align:right">Incidencia</th><th>Gravedad</th><th style="text-align:right">Árboles</th></tr></thead>
      <tbody>${detalleRows}</tbody>
    </table>
    ${analisis.interpretacion_monitoreo ? `<div class="analysis">${escapeHtml(analisis.interpretacion_monitoreo)}</div>` : ''}
  </div>`;
  }

  // Temas adicionales
  if (temasAdicionales?.length > 0) {
    html += `<div class="section page-break"><h2>📝 Temas Adicionales</h2>`;
    for (const bloque of temasAdicionales) {
      if (bloque.tipo === 'texto') {
        html += `<div class="card"><h3>${escapeHtml(bloque.titulo || '')}</h3><p style="font-size:9pt">${escapeHtml(bloque.contenido || '').replace(/\n/g, '<br>')}</p></div>`;
      }
    }
    html += `</div>`;
  }

  // Conclusiones
  if (analisis.conclusiones?.length > 0) {
    html += `<div class="section page-break"><h2>🎯 Conclusiones y Recomendaciones</h2>`;
    for (const c of analisis.conclusiones) {
      const bg = c.prioridad === 'alta' ? '#f8d7da' : c.prioridad === 'media' ? '#fff3cd' : '#d4edda';
      html += `<div class="card" style="border-left:4px solid ${c.prioridad === 'alta' ? '#DC3545' : c.prioridad === 'media' ? '#FFC107' : '#73991C'};background:${bg}">${c.icono} ${escapeHtml(c.texto)}</div>`;
    }
    html += `</div>`;
  }

  // Footer
  html += `
  <div class="footer">
    <span>Escocia OS · Reporte Semanal S${semana.numero}/${semana.ano}</span>
    <span>Generado con IA · ${formatDate(new Date().toISOString().split('T')[0])}</span>
  </div>
</div>
</body>
</html>`;

  return html;
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
      return { success: false, error: 'Datos del reporte no proporcionados o incompletos' };
    }

    console.log(`Semana ${datos.semana.numero}/${datos.semana.ano}`);

    const datosFormateados = formatearDatosParaPrompt(datos);
    console.log('Datos formateados:', datosFormateados.length, 'chars');

    console.log('Calling Gemini API for analysis...');
    const geminiStart = Date.now();
    const { analisis, tokens } = await llamarGemini(datosFormateados, instrucciones);
    console.log(`Gemini completed in ${Date.now() - geminiStart}ms`);

    console.log('Building HTML template...');
    const buildHtml = htmlBuilder || construirHTMLReporte;
    const html = buildHtml(datos, analisis);
    console.log('HTML built:', html.length, 'chars');

    if (!html || html.length < 500) {
      return { success: false, error: 'Error interno al construir el HTML del reporte' };
    }

    console.log(`=== generarReporteSemanal SUCCESS in ${Date.now() - startTime}ms ===`);
    return {
      success: true,
      html,
      tokens_usados: tokens,
    };
  } catch (error: any) {
    console.error(`=== generarReporteSemanal ERROR ===`, error.message);
    return {
      success: false,
      error: error.message || 'Error interno al generar el reporte',
    };
  }
}
