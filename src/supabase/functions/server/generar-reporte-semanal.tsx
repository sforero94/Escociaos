// generar-reporte-semanal.tsx
// Módulo de Edge Function para generar reportes semanales en formato slides landscape (1280x720)
// Flujo: datos → Gemini (solo análisis JSON) → plantilla HTML determinística → PDF

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

interface AnalisisGemini {
  resumen_ejecutivo: string;
  conclusiones: Array<{
    icono: string;
    texto: string;
    prioridad: 'alta' | 'media' | 'baja';
  }>;
  interpretacion_monitoreo: string;
  interpretacion_tendencias_monitoreo: string;
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
  "interpretacion_monitoreo": "Interpretación breve de las tendencias fitosanitarias.",
  "interpretacion_tendencias_monitoreo": "Análisis detallado por plaga. Menciona Monalonion, Ácaro, Trips, Cucarrón marceño. Indica si cada plaga sube, baja o está estable. Menciona lotes con mayor riesgo."
}

REGLAS:
- Todo en español
- Mínimo 3 conclusiones, máximo 5
- Las conclusiones DEBEN empezar con verbos de acción (Evaluar, Priorizar, Continuar, Revisar, Programar)
- Usa íconos: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
- NO incluir HTML, markdown, ni código. SOLO el objeto JSON.
- NO envolver el JSON en bloques de código.`;

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

  // Labores programadas
  if (datos.labores?.programadas?.length > 0) {
    partes.push(`## LABORES PROGRAMADAS`);
    datos.labores.programadas.forEach((labor: any) => {
      partes.push(`### ${labor.codigo} — ${labor.nombre} (${labor.tipo})
- Estado: ${labor.estado}
- Fechas: ${labor.fechaInicio} → ${labor.fechaFin}
- Lotes: ${(labor.lotes || []).join(', ')}`);
    });
  }

  // Aplicaciones cerradas (resumen)
  if (datos.aplicaciones?.cerradas?.length > 0) {
    partes.push(`## APLICACIONES CERRADAS ESTA SEMANA`);
    datos.aplicaciones.cerradas.forEach((app: any) => {
      const canecasDev = app.desvCanecas ?? app.desvBultos ?? null;
      const costoDev = app.desvCosto ?? null;
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Canecas/Bultos planeadas: ${app.planeadoCanecas ?? app.planeadoBultos ?? 'N/A'}, reales: ${app.realCanecas ?? app.realBultos ?? 'N/A'}${canecasDev !== null ? `, desviación: ${canecasDev}%` : ''}
- Costo planeado: $${Math.round(app.costoPlan || 0).toLocaleString('es-CO')}, real: $${Math.round(app.costoReal || 0).toLocaleString('es-CO')}${costoDev !== null ? `, desviación: ${costoDev}%` : ''}`);
    });
  }

  if (datos.aplicaciones?.planeadas?.length > 0) {
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

  if (datos.aplicaciones?.activas?.length > 0) {
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
      partes.push(`### Detalle por lote (monitoreo más reciente)`);
      datos.monitoreo.detallePorLote.forEach((lote: any) => {
        partes.push(`  ${lote.loteNombre}:`);
        lote.sublotes.forEach((s: any) => {
          partes.push(`    - ${s.subloteNombre} | ${s.plagaNombre}: ${s.incidencia}% (${s.gravedad}) [${s.arboresAfectados}/${s.arboresMonitoreados} árboles]`);
        });
      });
    }

    if (datos.monitoreo.insights.length > 0) {
      partes.push(`### Alertas e insights automáticos`);
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
        partes.push(`### ${bloque.titulo || `Imagen ${i + 1}`}\n[IMAGEN incluida en base64]\nDescripción: ${bloque.descripcion}`);
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

  const model = 'gemini-3-flash-preview';
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

  const candidate = result.candidates?.[0];
  if (!candidate) {
    console.error('Gemini response has no candidates:', JSON.stringify(result).slice(0, 500));
    throw new Error('Gemini no retornó candidatos. Posible error de contenido o límite.');
  }

  const finishReason = candidate.finishReason;
  console.log('Gemini finishReason:', finishReason);

  if (finishReason === 'SAFETY') {
    throw new Error('Gemini bloqueó la respuesta por filtros de seguridad.');
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
      conclusiones: [
        { icono: '📊', texto: 'Revisar los indicadores detallados en las secciones del reporte', prioridad: 'media' },
        { icono: '📋', texto: 'Verificar el avance de las aplicaciones en curso', prioridad: 'media' },
        { icono: '🌱', texto: 'Monitorear la evolución fitosanitaria en la próxima semana', prioridad: 'media' },
      ],
      interpretacion_monitoreo: 'Consulte la sección de monitoreo para detalles sobre las tendencias fitosanitarias.',
      interpretacion_tendencias_monitoreo: 'Sin análisis disponible para esta semana.',
    };
  }

  if (!analisis.resumen_ejecutivo) analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [{ icono: '📊', texto: 'Revisar los indicadores del reporte', prioridad: 'media' }];
  }
  if (!analisis.interpretacion_monitoreo) analisis.interpretacion_monitoreo = '';
  if (!analisis.interpretacion_tendencias_monitoreo) analisis.interpretacion_tendencias_monitoreo = '';

  const tokens = result.usageMetadata?.totalTokenCount || 0;
  console.log('Gemini response: analysis parsed, tokens:', tokens);

  return { analisis, tokens };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function formatNum(n: number, decimals = 2): string {
  return n.toFixed(decimals);
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
  return (value / maxValue) > 0.6 ? '#FFFFFF' : '#4D240F';
}
function getIncidenciaColor(inc: number | null): string {
  if (inc === null || inc === 0) return '#FFFFFF';
  if (inc < 10) return '#FFF9C4';
  if (inc < 20) return '#FFB74D';
  return '#EF9A9A';
}
function getDesvColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 10) return '#C8E6C9';
  if (abs <= 20) return '#FFF9C4';
  return '#FFCDD2';
}
function getBadgeHTML(texto: string, tipo: string): string {
  const colors: Record<string, {bg: string; text: string}> = {
    Alta: { bg: '#FFCDD2', text: '#C62828' },
    Media: { bg: '#FFF9C4', text: '#F57F17' },
    Baja: { bg: '#C8E6C9', text: '#2E7D32' },
  };
  const c = colors[tipo] || colors['Baja'];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text};">${texto}</span>`;
}
function getInsightStyles(tipo: string): {border: string; bg: string; icon: string} {
  if (tipo === 'urgente') return { border: '#D32F2F', bg: '#FFF5F5', icon: '🔴' };
  if (tipo === 'atencion') return { border: '#F9A825', bg: '#FFFDF0', icon: '⚠️' };
  return { border: '#73991C', bg: '#F5F9EE', icon: '✅' };
}
function slideHeader(seccion: string, titulo: string, semana: any): string {
  return `<div style="background:#73991C;height:48px;display:flex;align-items:center;padding:0 20px;justify-content:space-between;">
    <span style="background:rgba(255,255,255,0.25);color:#FFFFFF;font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;">${seccion}</span>
    <span style="color:#FFFFFF;font-size:15px;font-weight:700;">${titulo}</span>
    <div style="text-align:right;"><div style="color:#E8F0D0;font-size:11px;font-weight:600;">ESCOCIA HASS · S${semana.numero}/${semana.ano}</div><div style="color:#E8F0D0;font-size:10px;">${semana.inicio} — ${semana.fin}</div></div>
  </div>`;
}


// ============================================================================
// SLIDE BUILDERS
// ============================================================================

function construirSlidePortada(datos: any, analisis: AnalisisGemini): string {
  const { semana, personal, jornales, aplicaciones, monitoreo } = datos;
  const totalJornales = jornales?.totalGeneral?.jornales || 0;
  const costoTotal = jornales?.totalGeneral?.costo || 0;
  const trabajadores = personal?.totalTrabajadores || 0;
  const appsActivas = aplicaciones?.activas?.length || 0;
  const alertas = monitoreo?.insights?.filter((i: any) => i.tipo === 'urgente' || i.tipo === 'atencion')?.length || 0;

  return `<div class="slide">
  <div style="background:linear-gradient(135deg,#73991C 60%,#5A7A15 100%);height:220px;display:flex;flex-direction:column;justify-content:center;padding:0 48px;">
    <div style="font-size:42px;font-weight:900;color:#FFFFFF;letter-spacing:2px;line-height:1;">ESCOCIA HASS</div>
    <div style="font-size:20px;font-weight:600;color:#E8F0D0;margin-top:10px;">Informe Semanal — Semana ${semana.numero}/${semana.ano}</div>
    <div style="font-size:13px;color:#C8DC9A;margin-top:6px;">${semana.inicio} — ${semana.fin}</div>
  </div>
  <div style="display:flex;gap:0;padding:24px 28px 0;justify-content:space-between;">
    ${[
      { label: 'Jornales', value: formatNum(totalJornales, 1), sub: 'trabajados', color: '#73991C' },
      { label: 'Costo Total', value: formatCOP(costoTotal), sub: 'pesos COP', color: '#1976D2' },
      { label: 'Trabajadores', value: String(trabajadores), sub: `${personal?.empleados||0} emp / ${personal?.contratistas||0} cont`, color: '#00897B' },
      { label: 'Apps Activas', value: String(appsActivas), sub: 'en ejecución', color: '#F57C00' },
      { label: 'Alertas', value: String(alertas), sub: 'fitosanitarias', color: '#D32F2F' },
    ].map(k => `<div style="flex:1;background:#FFFFFF;border-radius:10px;border-top:4px solid ${k.color};padding:16px 12px;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,0.08);margin:0 6px;">
      <div style="font-size:28px;font-weight:900;color:${k.color};">${k.value}</div>
      <div style="font-size:12px;font-weight:700;color:#4D240F;margin-top:4px;">${k.label}</div>
      <div style="font-size:10px;color:#888;margin-top:2px;">${k.sub}</div>
    </div>`).join('')}
  </div>
  <div style="margin:20px 28px 0;background:#F5F9EE;border-left:5px solid #73991C;border-radius:0 8px 8px 0;padding:16px 20px;">
    <div style="font-size:11px;font-weight:800;color:#73991C;letter-spacing:1px;margin-bottom:8px;">RESUMEN EJECUTIVO</div>
    <div style="font-size:14px;color:#4D240F;line-height:1.65;">${analisis.resumen_ejecutivo}</div>
  </div>
</div>`;
}

function construirSlidePersonal(datos: any): string {
  const { semana, personal } = datos;
  const p = personal || {};
  const jornalesTrabajados = datos.jornales?.totalGeneral?.jornales || 0;
  const jornalesPosibles = (p.totalTrabajadores || 0) * 5;
  const eficiencia = jornalesPosibles > 0 ? Math.round((jornalesTrabajados / jornalesPosibles) * 100) : 0;

  const stats1 = [
    { label: 'Trabajadores', value: String(p.totalTrabajadores || 0), color: '#73991C' },
    { label: 'Fallas', value: String(p.fallas || 0), color: '#D32F2F' },
    { label: 'Permisos', value: String(p.permisos || 0), color: '#F57C00' },
    { label: 'Eficiencia', value: `${eficiencia}%`, color: '#1976D2' },
  ];
  const stats2 = [
    { label: 'Ingresos', value: String(p.ingresos || 0), color: '#00897B' },
    { label: 'Retiros', value: String(p.retiros || 0), color: '#E53935' },
    { label: 'Jornales Trabajados', value: formatNum(jornalesTrabajados, 1), color: '#73991C' },
    { label: 'Jornales Posibles', value: String(jornalesPosibles), color: '#888' },
  ];

  const makeStatCard = (s: any) => `<div style="flex:1;background:#FFFFFF;border-radius:8px;border-left:4px solid ${s.color};padding:14px 12px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
    <div style="font-size:26px;font-weight:800;color:${s.color};">${s.value}</div>
    <div style="font-size:11px;font-weight:600;color:#4D240F;margin-top:3px;">${s.label}</div>
  </div>`;

  let fallasTable = '';
  if (p.detalleFallas?.length > 0) {
    fallasTable = `<div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:700;color:#D32F2F;margin-bottom:4px;">FALLAS</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#FFF5F5;">
          <th style="padding:5px 10px;font-size:10px;font-weight:700;color:#D32F2F;text-align:left;border-bottom:1px solid #FFCDD2;">Empleado</th>
          <th style="padding:5px 10px;font-size:10px;font-weight:700;color:#D32F2F;text-align:left;border-bottom:1px solid #FFCDD2;">Motivo</th>
        </tr></thead>
        <tbody>${p.detalleFallas.map((f: any) => `<tr><td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F5F5F5;">${f.nombre}</td><td style="padding:5px 10px;font-size:11px;color:#888;border-bottom:1px solid #F5F5F5;">${f.motivo || '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  let permisosTable = '';
  if (p.detallePermisos?.length > 0) {
    permisosTable = `<div style="margin-top:12px;">
      <div style="font-size:11px;font-weight:700;color:#F57C00;margin-bottom:4px;">PERMISOS</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#FFF8F0;">
          <th style="padding:5px 10px;font-size:10px;font-weight:700;color:#F57C00;text-align:left;border-bottom:1px solid #FFE0B2;">Empleado</th>
          <th style="padding:5px 10px;font-size:10px;font-weight:700;color:#F57C00;text-align:left;border-bottom:1px solid #FFE0B2;">Motivo</th>
        </tr></thead>
        <tbody>${p.detallePermisos.map((f: any) => `<tr><td style="padding:5px 10px;font-size:11px;border-bottom:1px solid #F5F5F5;">${f.nombre}</td><td style="padding:5px 10px;font-size:11px;color:#888;border-bottom:1px solid #F5F5F5;">${f.motivo || '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  return `<div class="slide page-break">
  ${slideHeader('PERSONAL', 'Resumen de Personal', semana)}
  <div style="padding:18px 22px 0;">
    <div style="display:flex;gap:12px;margin-bottom:12px;">${stats1.map(makeStatCard).join('')}</div>
    <div style="display:flex;gap:12px;margin-bottom:16px;">${stats2.map(makeStatCard).join('')}</div>
    <div style="display:flex;gap:20px;">
      <div style="flex:1;">${fallasTable}</div>
      <div style="flex:1;">${permisosTable}</div>
    </div>
  </div>
</div>`;
}

function construirSlideLaboresProgramadas(datos: any): string {
  const programadas = datos.labores?.programadas || [];
  if (programadas.length === 0) return '';
  const { semana } = datos;

  const estadoStyle: Record<string, string> = {
    'Por iniciar': 'background:#E3F2FD;color:#1565C0;',
    'En proceso': 'background:#FFF9C4;color:#F57F17;',
    'Terminada': 'background:#C8E6C9;color:#2E7D32;',
  };

  const rows = programadas.map((l: any) => {
    const est = estadoStyle[l.estado] || 'background:#F5F5F0;color:#4D240F;';
    return `<tr style="border-bottom:1px solid #F0F0F0;">
      <td style="padding:8px 10px;font-size:12px;font-weight:700;color:#73991C;">${l.codigo || '—'}</td>
      <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#4D240F;">${l.nombre}</td>
      <td style="padding:8px 10px;font-size:11px;color:#555;">${l.tipo || '—'}</td>
      <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;${est}">${l.estado}</span></td>
      <td style="padding:8px 10px;font-size:11px;color:#555;">${l.fechaInicio || '—'}</td>
      <td style="padding:8px 10px;font-size:11px;color:#555;">${l.fechaFin || '—'}</td>
      <td style="padding:8px 10px;font-size:11px;color:#555;">${(l.lotes || []).join(', ')}</td>
    </tr>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('LABORES', 'Labores Programadas', semana)}
  <div style="padding:18px 22px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#73991C;">
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Código</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Nombre</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Tipo</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Estado</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Inicio</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Fin</th>
        <th style="padding:9px 10px;font-size:11px;font-weight:700;color:#FFFFFF;text-align:left;">Lotes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function construirSlideLaboresMatriz(datos: any): string {
  const jornales = datos.jornales;
  if (!jornales || !jornales.actividades || jornales.actividades.length === 0) return '';
  const { semana } = datos;
  const { actividades, lotes, datos: matrizDatos, totalesPorActividad, totalesPorLote, totalGeneral } = jornales;

  let maxVal = 0;
  for (const act of actividades) {
    for (const lote of lotes) {
      const v = matrizDatos[act]?.[lote]?.jornales || 0;
      if (v > maxVal) maxVal = v;
    }
  }

  let headerCells = `<th style="padding:7px 10px;font-size:10px;font-weight:700;color:#FFFFFF;background:#73991C;border:1px solid #5A7A15;text-align:left;">Actividad</th>`;
  for (const lote of lotes) {
    headerCells += `<th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;background:#73991C;border:1px solid #5A7A15;text-align:center;min-width:64px;">${lote}</th>`;
  }
  headerCells += `<th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;background:#4D6B15;border:1px solid #3A5010;text-align:center;">Total</th>`;

  let bodyRows = '';
  for (const act of actividades) {
    let cells = '';
    for (const lote of lotes) {
      const val = matrizDatos[act]?.[lote]?.jornales || 0;
      const bg = getHeatmapColor(val, maxVal);
      const tc = getTextColorForHeatmap(val, maxVal);
      cells += `<td style="padding:7px 8px;text-align:center;font-size:11px;font-weight:600;background:${bg};color:${tc};border:1px solid #E8E8E8;">${val > 0 ? formatNum(val) : '—'}</td>`;
    }
    const tot = totalesPorActividad[act]?.jornales || 0;
    cells += `<td style="padding:7px 8px;text-align:center;font-size:11px;font-weight:700;background:#F0F5E8;color:#4D240F;border:1px solid #E8E8E8;">${formatNum(tot)}</td>`;
    bodyRows += `<tr><td style="padding:7px 10px;font-size:11px;font-weight:600;color:#4D240F;border:1px solid #E8E8E8;background:#FAFAFA;">${act}</td>${cells}</tr>`;
  }

  let totalCells = '';
  for (const lote of lotes) {
    const val = totalesPorLote[lote]?.jornales || 0;
    totalCells += `<td style="padding:7px 8px;text-align:center;font-size:11px;font-weight:700;background:#E8F0D0;color:#4D240F;border:1px solid #E8E8E8;">${formatNum(val)}</td>`;
  }
  totalCells += `<td style="padding:7px 8px;text-align:center;font-size:13px;font-weight:900;background:#73991C;color:#FFFFFF;border:1px solid #5A7A15;">${formatNum(totalGeneral.jornales)}</td>`;
  bodyRows += `<tr><td style="padding:7px 10px;font-size:11px;font-weight:800;color:#4D240F;border:1px solid #E8E8E8;background:#E8F0D0;">TOTAL</td>${totalCells}</tr>`;

  // Bar charts side by side
  const actOrden = [...actividades].sort((a: string, b: string) => (totalesPorActividad[b]?.jornales||0) - (totalesPorActividad[a]?.jornales||0));
  const loteOrden = [...lotes].sort((a: string, b: string) => (totalesPorLote[b]?.jornales||0) - (totalesPorLote[a]?.jornales||0));
  const maxAct = Math.max(...actOrden.map((a: string) => totalesPorActividad[a]?.jornales||0), 1);
  const maxLote = Math.max(...loteOrden.map((l: string) => totalesPorLote[l]?.jornales||0), 1);

  const barAct = actOrden.slice(0, 6).map((act: string) => {
    const v = totalesPorActividad[act]?.jornales || 0;
    const pct = (v / maxAct) * 100;
    return `<div style="display:flex;align-items:center;margin-bottom:5px;">
      <div style="width:110px;font-size:10px;font-weight:600;color:#4D240F;text-align:right;padding-right:8px;flex-shrink:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${act}</div>
      <div style="flex:1;background:#E8E8E8;border-radius:3px;height:18px;position:relative;overflow:hidden;">
        <div style="background:#73991C;height:100%;border-radius:3px;width:${Math.max(pct,2)}%;"></div>
        <span style="position:absolute;left:6px;top:2px;font-size:10px;font-weight:600;color:${pct>35?'#FFF':'#4D240F'};">${formatNum(v,1)}</span>
      </div>
    </div>`;
  }).join('');

  const barLote = loteOrden.slice(0, 8).map((lote: string) => {
    const v = totalesPorLote[lote]?.jornales || 0;
    const pct = (v / maxLote) * 100;
    return `<div style="display:flex;align-items:center;margin-bottom:5px;">
      <div style="width:80px;font-size:10px;font-weight:600;color:#4D240F;text-align:right;padding-right:8px;flex-shrink:0;">${lote}</div>
      <div style="flex:1;background:#E8E8E8;border-radius:3px;height:18px;position:relative;overflow:hidden;">
        <div style="background:#8DB440;height:100%;border-radius:3px;width:${Math.max(pct,2)}%;"></div>
        <span style="position:absolute;left:6px;top:2px;font-size:10px;font-weight:600;color:${pct>35?'#FFF':'#4D240F'};">${formatNum(v,1)}</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('LABORES', 'Distribución de Jornales', semana)}
  <div style="padding:14px 18px 0;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div style="display:flex;gap:24px;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:#4D240F;margin-bottom:7px;">Por Actividad</div>
        ${barAct}
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:#4D240F;margin-bottom:7px;">Por Lote</div>
        ${barLote}
      </div>
    </div>
  </div>
</div>`;
}


function construirSlideCierreGeneral(app: any, semana: any): string {
  const canecasPlan = app.planeadoCanecas ?? app.planeadoBultos ?? 0;
  const canecasReal = app.realCanecas ?? app.realBultos ?? 0;
  const canecasDesv = app.desvCanecas ?? app.desvBultos ?? 0;
  const costoPlan = app.costoPlan || 0;
  const costoReal = app.costoReal || 0;
  const costoDesv = app.desvCosto || 0;
  const unidadCan = app.unidadCanecas || app.unidadBultos || 'und';
  const dias = app.diasEjecucion || '—';
  const tipoLabel = app.tipo || '—';
  const tipoStyle = 'background:#E8F4FD;color:#1565C0;';

  const kpiBlock = (label: string, plan: any, real: any, desv: number, fmt: (v: any) => string, unit: string) => {
    const dc = getDesvColor(desv);
    return `<div style="flex:1;background:#FFFFFF;border-radius:10px;border:1px solid #E8E8E8;padding:18px 16px;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
      <div style="font-size:12px;font-weight:700;color:#888;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <div style="text-align:center;">
          <div style="font-size:10px;color:#888;margin-bottom:2px;">Plan</div>
          <div style="font-size:20px;font-weight:800;color:#4D240F;">${fmt(plan)}</div>
          <div style="font-size:10px;color:#888;">${unit}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#888;margin-bottom:2px;">Real</div>
          <div style="font-size:20px;font-weight:800;color:#1976D2;">${fmt(real)}</div>
          <div style="font-size:10px;color:#888;">${unit}</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:10px;color:#888;margin-bottom:2px;">Desviación</div>
          <div style="font-size:20px;font-weight:800;background:${dc};color:#4D240F;border-radius:6px;padding:2px 10px;">${desv > 0 ? '+' : ''}${formatNum(desv, 1)}%</div>
        </div>
      </div>
    </div>`;
  };

  // Summary table rows
  const summaryRows = (app.resumenPorLote || []).map((lote: any) => `<tr style="border-bottom:1px solid #F0F0F0;">
    <td style="padding:7px 10px;font-size:12px;font-weight:600;color:#4D240F;">${lote.loteNombre}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${lote.canecasPlan ?? lote.bultosPlan ?? '—'}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${lote.canecasReal ?? lote.bultosReal ?? '—'}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;background:${getDesvColor(lote.desvCanecas ?? lote.desvBultos ?? 0)};">${lote.desvCanecas ?? lote.desvBultos ?? '—'}%</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${formatCOP(lote.costoPlan || 0)}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${formatCOP(lote.costoReal || 0)}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;background:${getDesvColor(lote.desvCosto || 0)};">${lote.desvCosto ?? '—'}%</td>
  </tr>`).join('');

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado General — ${app.nombre}`, semana)}
  <div style="padding:16px 22px 0;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <span style="display:inline-block;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:700;${tipoStyle}">${tipoLabel}</span>
      <span style="font-size:12px;color:#888;">${app.fechaInicio || '—'} → ${app.fechaFin || '—'}</span>
      <span style="font-size:12px;color:#888;">· ${dias} días</span>
      ${app.proposito ? `<span style="font-size:12px;color:#555;font-style:italic;">"${app.proposito}"</span>` : ''}
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
      ${kpiBlock('Canecas / Bultos', canecasPlan, canecasReal, canecasDesv, (v) => String(v), unidadCan)}
      ${kpiBlock('Costo', costoPlan, costoReal, costoDesv, formatCOP, 'COP')}
    </div>
    ${summaryRows ? `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#73991C;">
        <th style="padding:7px 10px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:left;">Lote</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Can/Blt Plan</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Can/Blt Real</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Desv %</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Costo Plan</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Costo Real</th>
        <th style="padding:7px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Desv %</th>
      </tr></thead>
      <tbody>${summaryRows}</tbody>
    </table>` : ''}
  </div>
</div>`;
}

function construirSlideCierreTecnico(app: any, semana: any): string {
  const lotesRows = (app.detallesPorLote || app.resumenPorLote || []).map((lote: any) => {
    const cols = [
      { v: lote.loteNombre, style: 'font-weight:600;' },
      { v: String(lote.hectareas || '—'), style: 'text-align:center;' },
      { v: String(lote.canecasPlan ?? lote.bultosPlan ?? '—'), style: 'text-align:center;' },
      { v: String(lote.canecasReal ?? lote.bultosReal ?? '—'), style: 'text-align:center;' },
      { v: `${lote.desvCanecas ?? lote.desvBultos ?? '—'}%`, style: `text-align:center;background:${getDesvColor(lote.desvCanecas ?? lote.desvBultos ?? 0)};` },
      { v: String(lote.arbolesTratados ?? '—'), style: 'text-align:center;' },
      { v: String(lote.dosis || '—'), style: 'text-align:center;' },
      { v: String(lote.operarios || '—'), style: 'text-align:center;' },
      { v: String(lote.jornales || '—'), style: 'text-align:center;' },
    ];
    return `<tr style="border-bottom:1px solid #F0F0F0;">${cols.map(c => `<td style="padding:7px 9px;font-size:11px;color:#4D240F;${c.style}">${c.v}</td>`).join('')}</tr>`;
  }).join('');

  const headers = ['Lote', 'Ha', 'Plan', 'Real', 'Desv%', 'Árboles', 'Dosis', 'Operarios', 'Jornales'];

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado Técnico — ${app.nombre}`, semana)}
  <div style="padding:16px 22px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#73991C;">${headers.map(h => `<th style="padding:8px 9px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:${h==='Lote'?'left':'center'};">${h}</th>`).join('')}</tr></thead>
      <tbody>${lotesRows}</tbody>
    </table>
    ${app.observaciones ? `<div style="margin-top:14px;background:#F5F9EE;border-left:4px solid #73991C;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;color:#4D240F;line-height:1.5;">${app.observaciones}</div>` : ''}
  </div>
</div>`;
}

function construirSlideCierreFinanciero(app: any, semana: any): string {
  const lotesRows = (app.detallesPorLote || app.resumenPorLote || []).map((lote: any) => {
    const cols = [
      { v: lote.loteNombre, style: 'font-weight:600;' },
      { v: formatCOP(lote.costoInsumosPlan || 0), style: 'text-align:right;' },
      { v: formatCOP(lote.costoInsumosReal || 0), style: 'text-align:right;' },
      { v: `${lote.desvInsumos ?? '—'}%`, style: `text-align:center;background:${getDesvColor(lote.desvInsumos ?? 0)};` },
      { v: formatCOP(lote.costoMOPlan || 0), style: 'text-align:right;' },
      { v: formatCOP(lote.costoMOReal || 0), style: 'text-align:right;' },
      { v: `${lote.desvMO ?? '—'}%`, style: `text-align:center;background:${getDesvColor(lote.desvMO ?? 0)};` },
      { v: formatCOP(lote.costoTotalPlan || lote.costoPlan || 0), style: 'text-align:right;font-weight:600;' },
      { v: formatCOP(lote.costoTotalReal || lote.costoReal || 0), style: 'text-align:right;font-weight:600;' },
      { v: `${lote.desvCosto ?? '—'}%`, style: `text-align:center;font-weight:700;background:${getDesvColor(lote.desvCosto ?? 0)};` },
    ];
    return `<tr style="border-bottom:1px solid #F0F0F0;">${cols.map(c => `<td style="padding:7px 9px;font-size:11px;color:#4D240F;${c.style}">${c.v}</td>`).join('')}</tr>`;
  }).join('');

  const headers = ['Lote', 'Insum. Plan', 'Insum. Real', 'Desv%', 'MO Plan', 'MO Real', 'Desv%', 'Total Plan', 'Total Real', 'Desv%'];

  const costoTotal = (app.detallesPorLote || app.resumenPorLote || []).reduce((s: number, l: any) => s + (l.costoTotalReal || l.costoReal || 0), 0);

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado Financiero — ${app.nombre}`, semana)}
  <div style="padding:16px 22px 0;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#1565C0;">${headers.map(h => `<th style="padding:8px 9px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:${h==='Lote'?'left':'center'};">${h}</th>`).join('')}</tr></thead>
      <tbody>${lotesRows}</tbody>
    </table>
    <div style="margin-top:14px;display:flex;gap:16px;">
      <div style="background:#E3F2FD;border-radius:8px;padding:12px 18px;text-align:center;">
        <div style="font-size:11px;color:#1565C0;font-weight:600;">COSTO TOTAL REAL</div>
        <div style="font-size:22px;font-weight:900;color:#1565C0;">${formatCOP(costoTotal)}</div>
      </div>
      <div style="background:${getDesvColor(app.desvCosto||0)};border-radius:8px;padding:12px 18px;text-align:center;">
        <div style="font-size:11px;color:#4D240F;font-weight:600;">DESVIACIÓN TOTAL</div>
        <div style="font-size:22px;font-weight:900;color:#4D240F;">${app.desvCosto !== undefined ? (app.desvCosto > 0 ? '+' : '') + formatNum(app.desvCosto, 1) + '%' : '—'}</div>
      </div>
    </div>
  </div>
</div>`;
}


function construirSlideAplicacionesActivas(datos: any): string {
  const activas = datos.aplicaciones?.activas || [];
  if (activas.length === 0) return '';
  const { semana } = datos;

  const appsHTML = activas.map((app: any) => {
    const pct = app.porcentajeGlobal || 0;
    const barColor = pct >= 80 ? '#73991C' : pct >= 40 ? '#F57C00' : '#D32F2F';

    const loteBars = (app.progresoPorLote || []).map((lote: any) => {
      const lp = lote.porcentaje || 0;
      return `<div style="display:flex;align-items:center;margin-bottom:4px;">
        <div style="width:70px;font-size:10px;font-weight:600;color:#4D240F;text-align:right;padding-right:8px;flex-shrink:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${lote.loteNombre}</div>
        <div style="flex:1;background:#E8E8E8;border-radius:3px;height:14px;position:relative;overflow:hidden;">
          <div style="background:${lp>=100?'#73991C':lp>=50?'#8DB440':'#BFD97D'};height:100%;border-radius:3px;width:${Math.min(lp,100)}%;"></div>
          <span style="position:absolute;left:4px;top:1px;font-size:9px;font-weight:600;color:${lp>50?'#FFF':'#4D240F'};">${lote.ejecutado}/${lote.planeado} (${lp}%)</span>
        </div>
      </div>`;
    }).join('');

    return `<div style="background:#FFFFFF;border-radius:8px;border:1px solid #E8E8E8;padding:14px 16px;flex:1;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:#4D240F;">${app.nombre}</div>
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#FFF3E0;color:#F57C00;margin-top:3px;">${app.tipo}</span>
        </div>
        <div style="font-size:26px;font-weight:900;color:${barColor};">${pct}%</div>
      </div>
      <div style="font-size:10px;color:#888;margin-bottom:8px;">${app.proposito || ''}</div>
      <div style="background:#E0E0E0;border-radius:4px;height:20px;overflow:hidden;position:relative;margin-bottom:10px;">
        <div style="background:${barColor};height:100%;border-radius:4px;width:${Math.min(pct,100)}%;"></div>
        <span style="position:absolute;left:50%;top:2px;transform:translateX(-50%);font-size:10px;font-weight:700;color:${pct>45?'#FFF':'#4D240F'};">${app.totalEjecutado}/${app.totalPlaneado} ${app.unidad}</span>
      </div>
      ${loteBars}
    </div>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('APLICACIONES', 'Aplicaciones en Ejecución', semana)}
  <div style="padding:18px 22px 0;display:flex;gap:16px;flex-wrap:wrap;">
    ${appsHTML}
  </div>
</div>`;
}

function construirSlideAplicacionPlaneada(app: any, semana: any): string {
  const comprasRows = (app.listaCompras || []).map((item: any) => `<tr style="border-bottom:1px solid #F0F0F0;">
    <td style="padding:7px 10px;font-size:12px;font-weight:600;color:#4D240F;">${item.productoNombre}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${item.cantidadNecesaria} ${item.unidad}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;">${item.inventarioDisponible ?? '—'}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:center;font-weight:600;color:${(item.cantidadOrdenar||0)>0?'#D32F2F':'#73991C'};">${item.cantidadOrdenar ?? '—'}</td>
    <td style="padding:7px 10px;font-size:11px;text-align:right;">${formatCOP(item.costoEstimado || 0)}</td>
  </tr>`).join('');

  const costoTotal = (app.listaCompras || []).reduce((s: number, i: any) => s + (i.costoEstimado || 0), 0);

  return `<div class="slide page-break">
  ${slideHeader('APLICACIONES', `Plan: ${app.nombre}`, semana)}
  <div style="padding:16px 22px 0;display:flex;gap:24px;">
    <div style="flex:0 0 320px;">
      <div style="background:#F5F9EE;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#73991C;margin-bottom:6px;">PROPÓSITO</div>
        <div style="font-size:12px;color:#4D240F;line-height:1.5;">${app.proposito || '—'}</div>
      </div>
      <div style="background:#FFFDF0;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#F57F17;margin-bottom:6px;">BLANCOS BIOLÓGICOS</div>
        <div style="font-size:12px;color:#4D240F;">${(app.blancosBiologicos || []).join(' · ')}</div>
      </div>
      <div style="background:#F5F5F0;border-radius:8px;padding:14px 16px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#555;margin-bottom:6px;">FECHAS</div>
        <div style="font-size:12px;color:#4D240F;">📅 Inicio planeado: <strong>${app.fechaInicioPlaneada || '—'}</strong></div>
        ${app.fechaFinPlaneada ? `<div style="font-size:12px;color:#4D240F;margin-top:2px;">📅 Fin planeado: <strong>${app.fechaFinPlaneada}</strong></div>` : ''}
      </div>
      ${app.mezclas?.length > 0 ? `<div style="background:#EDE7F6;border-radius:8px;padding:14px 16px;">
        <div style="font-size:11px;font-weight:700;color:#6A1B9A;margin-bottom:6px;">MEZCLAS</div>
        ${app.mezclas.map((m: any) => `<div style="font-size:11px;color:#4D240F;margin-bottom:2px;">· ${m.nombre || m}: ${m.dosis || ''}</div>`).join('')}
      </div>` : ''}
    </div>
    <div style="flex:1;">
      <div style="font-size:12px;font-weight:700;color:#4D240F;margin-bottom:8px;">LISTA DE COMPRAS</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#73991C;">
          <th style="padding:8px 10px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:left;">Producto</th>
          <th style="padding:8px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Cant. Nec.</th>
          <th style="padding:8px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Inventario</th>
          <th style="padding:8px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">A Ordenar</th>
          <th style="padding:8px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:right;">Costo Est.</th>
        </tr></thead>
        <tbody>${comprasRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:10px;font-size:14px;font-weight:700;color:#4D240F;">Total estimado: <span style="color:#73991C;">${formatCOP(costoTotal)}</span></div>
    </div>
  </div>
</div>`;
}

