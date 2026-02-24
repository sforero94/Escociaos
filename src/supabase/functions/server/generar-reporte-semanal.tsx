// generar-reporte-semanal.tsx
// Edge Function: datos → Gemini (análisis JSON) → HTML de slides landscape 16:9 → PDF

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
// PROMPT TEMPLATE
// ============================================================================

const SYSTEM_PROMPT = `Eres un asistente agrícola experto para la finca de aguacate Hass "Escocia Hass" en Colombia.
Tu tarea es analizar datos operativos semanales y producir un análisis breve, concreto y accionable.

RESPONDE EXCLUSIVAMENTE en formato JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "2-3 oraciones resumiendo lo más importante de la semana. Menciona cifras clave.",
  "conclusiones": [
    { "icono": "⚠️", "texto": "Recomendación concreta y accionable con verbo de acción", "prioridad": "alta" }
  ],
  "interpretacion_monitoreo": "Interpretación breve de las tendencias fitosanitarias generales.",
  "interpretacion_tendencias_monitoreo": "Análisis detallado por plaga: para cada plaga importante (Monalonion, Ácaro, Huevos de Ácaro, Ácaro Cristalino, Cucarrón marceño, Trips) indica su tendencia (subiendo/bajando/estable) y qué lotes presentan mayor incidencia. Prioriza plagas de interés fitosanitario."
}

REGLAS:
- Todo en español
- Mínimo 3 conclusiones, máximo 5
- Las conclusiones DEBEN empezar con verbos de acción (Evaluar, Priorizar, Continuar, Revisar, Programar, Aplicar, etc.)
- El resumen ejecutivo debe mencionar las cifras más relevantes (total jornales, eficiencia operativa, alertas fitosanitarias)
- interpretacion_tendencias_monitoreo: analiza plaga por plaga, menciona lotes con mayor incidencia, indica si requiere intervención urgente
- Usa estos íconos: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
- NO incluir HTML, markdown, ni código. SOLO el objeto JSON.
- NO envolver el JSON en bloques de código (\`\`\`).`;

// ============================================================================
// FORMATEO DE DATOS PARA PROMPT
// ============================================================================

function formatearDatosParaPrompt(datos: any): string {
  const partes: string[] = [];

  partes.push(`## PERÍODO
- Semana ${datos.semana?.numero} del ${datos.semana?.ano}
- Desde: ${datos.semana?.inicio} hasta: ${datos.semana?.fin}`);

  const p = datos.personal || {};
  partes.push(`## PERSONAL
- Total: ${p.totalTrabajadores} (${p.empleados} empleados, ${p.contratistas} contratistas)
- Fallas: ${p.fallas} | Permisos: ${p.permisos} | Ingresos: ${p.ingresos || 0} | Retiros: ${p.retiros || 0}
- Jornales posibles: ${p.jornalesPosibles || 'N/A'} | Trabajados: ${p.jornalesTrabajados || 'N/A'}
- Eficiencia operativa: ${p.eficienciaOperativa || 'N/A'}%`);

  const mat = datos.labores?.matrizJornales || datos.jornales;
  if (mat) {
    partes.push(`## JORNALES
- Total general: ${mat.totalGeneral?.jornales || 0} jornales, costo $${mat.totalGeneral?.costo || 0}
- Actividades: ${(mat.actividades || []).join(', ')}
- Lotes: ${(mat.lotes || []).join(', ')}`);
  }

  const labProg = datos.labores?.programadas || [];
  if (labProg.length > 0) {
    partes.push(`## LABORES PROGRAMADAS (${labProg.length} tareas)
${labProg.slice(0, 8).map((l: any) => `- [${l.estado}] ${l.nombre} (${l.tipoTarea}) — lotes: ${(l.lotes || []).join(', ')}`).join('\n')}`);
  }

  const aps = datos.aplicaciones || {};
  if ((aps.planeadas || []).length > 0) {
    partes.push(`## APLICACIONES PLANEADAS
${(aps.planeadas || []).map((a: any) => `- ${a.nombre} (${a.tipo}): propósito ${a.proposito}, costo estimado $${a.costoTotalEstimado}`).join('\n')}`);
  }
  if ((aps.activas || []).length > 0) {
    partes.push(`## APLICACIONES ACTIVAS
${(aps.activas || []).map((a: any) => `- ${a.nombre}: ${a.porcentajeGlobal}% completado (${a.totalEjecutado}/${a.totalPlaneado} ${a.unidad})`).join('\n')}`);
  }
  if ((aps.cerradas || []).length > 0) {
    partes.push(`## APLICACIONES CERRADAS
${(aps.cerradas || []).map((c: any) => `- ${c.nombre}: desviación costo ${c.general?.costoDesviacion}%, ejecutado en ${c.diasEjecucion} días`).join('\n')}`);
  }

  const mon = datos.monitoreo || {};
  if ((mon.tendencias || []).length > 0) {
    partes.push(`## MONITOREO FITOSANITARIO
- Fechas: ${(mon.fechasMonitoreo || []).join(', ')}
${(mon.tendencias || []).map((t: any) => `- ${t.plagaNombre}: incidencia promedio ${t.incidenciaPromedio}%`).join('\n')}
- Plagas de interés: Monalonion, Ácaro, Huevos de Ácaro, Ácaro Cristalino, Cucarrón marceño, Trips`);
  }

  return partes.join('\n\n');
}

// ============================================================================
// LLAMADA A GEMINI
// ============================================================================

async function llamarGemini(datos: any, instrucciones?: string): Promise<{ analisis: AnalisisGemini; tokens: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const datosFormateados = formatearDatosParaPrompt(datos);
  const userContent = instrucciones
    ? `${datosFormateados}\n\n## INSTRUCCIONES ADICIONALES\n${instrucciones}`
    : datosFormateados;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini error ${response.status}: ${err}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const tokens = result.usageMetadata?.totalTokenCount || 0;

  let analisis: AnalisisGemini;
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analisis = JSON.parse(cleaned);
  } catch {
    analisis = {
      resumen_ejecutivo: text.slice(0, 300),
      conclusiones: [{ icono: '📊', texto: 'Ver datos del reporte para detalles.', prioridad: 'baja' }],
      interpretacion_monitoreo: '',
      interpretacion_tendencias_monitoreo: '',
    };
  }

  return { analisis, tokens };
}

// ============================================================================
// HELPERS HTML / CSS
// ============================================================================

function formatCOP(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatNum(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

function getHeatmapColor(value: number, max: number): string {
  if (max <= 0) return '#f8f9fa';
  const ratio = Math.min(value / max, 1);
  const r = Math.round(115 + (255 - 115) * (1 - ratio));
  const g = Math.round(153 + (255 - 153) * (1 - ratio));
  const b = Math.round(28 + (255 - 28) * (1 - ratio));
  if (ratio < 0.05) return '#f8f9fa';
  return `rgb(${r},${g},${b})`;
}

function getTextColorForHeatmap(value: number, max: number): string {
  if (max <= 0) return '#333';
  const ratio = Math.min(value / max, 1);
  return ratio > 0.5 ? '#fff' : '#333';
}

function getDesvColor(desv: number): string {
  const abs = Math.abs(desv);
  if (abs <= 10) return '#16a34a';
  if (abs <= 20) return '#d97706';
  return '#dc2626';
}

function getDesvBadge(desv: number): string {
  const color = getDesvColor(desv);
  const sign = desv >= 0 ? '+' : '';
  return `<span style="color:${color};font-weight:600">${sign}${formatNum(desv)}%</span>`;
}

function getIncidenciaColor(inc: number): string {
  if (inc <= 5) return '#16a34a';
  if (inc <= 20) return '#d97706';
  return '#dc2626';
}

function slideHeader(seccion: string, titulo: string, semana: any): string {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
      background:linear-gradient(135deg,#73991C,#5a7a14);
      color:white;padding:12px 28px;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:14px">
        <span style="font-size:11px;opacity:0.85;letter-spacing:1px;text-transform:uppercase">${seccion}</span>
        <span style="width:1px;height:16px;background:rgba(255,255,255,0.4)"></span>
        <span style="font-size:18px;font-weight:700">${titulo}</span>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;opacity:0.85">Escocia Hass</div>
        <div style="font-size:11px;opacity:0.75">Semana ${semana?.numero || ''} · ${semana?.ano || ''}</div>
      </div>
    </div>`;
}

function slideWrap(content: string): string {
  return `<div class="slide">${content}</div>`;
}

// ============================================================================
// SLIDE 1: PORTADA
// ============================================================================

function construirSlideTitulo(datos: any): string {
  const { semana } = datos;
  const fechaInicio = new Date(semana.inicio + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  const fechaFin = new Date(semana.fin + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

  return slideWrap(`
    <div style="width:100%;height:100%;background:linear-gradient(135deg,#1a2a06 0%,#2d4a0e 40%,#4D240F 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;text-align:center">
      <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;opacity:0.7;margin-bottom:16px">Escocia Hass · Informe Operativo</div>
      <div style="font-size:72px;font-weight:900;line-height:1;margin-bottom:8px">S${String(semana.numero).padStart(2,'0')}</div>
      <div style="font-size:28px;font-weight:300;opacity:0.9;margin-bottom:24px">Semana ${semana.numero} · ${semana.ano}</div>
      <div style="width:60px;height:3px;background:#73991C;margin:0 auto 24px"></div>
      <div style="font-size:18px;opacity:0.8">${fechaInicio} — ${fechaFin}</div>
    </div>`);
}

// ============================================================================
// SLIDE 2: PERSONAL
// ============================================================================

function construirSlidePersonal(datos: any): string {
  const p = datos.personal || {};
  const semana = datos.semana;
  const eficiencia = p.eficienciaOperativa || 0;
  const efColor = eficiencia >= 90 ? '#16a34a' : eficiencia >= 75 ? '#d97706' : '#dc2626';

  const detallesFallas = (p.detalleFallas || []).slice(0, 6);
  const detallesPermisos = (p.detallePermisos || []).slice(0, 6);

  const filaPersona = (d: any) => `
    <div style="padding:3px 0;font-size:12px;border-bottom:1px solid #f0f0f0;display:flex;gap:6px">
      <span style="font-weight:600;color:#4D240F">${d.empleado}</span>
      ${d.razon ? `<span style="color:#666">— ${d.razon}</span>` : ''}
    </div>`;

  return slideWrap(`
    ${slideHeader('Personal', 'Resumen de Equipo', semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;flex:1">
      <!-- KPIs principales -->
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="background:#f8fdf0;border:2px solid #73991C;border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:36px;font-weight:900;color:#73991C">${p.totalTrabajadores || 0}</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Total Trabajadores</div>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:8px">
            <div style="text-align:center">
              <div style="font-size:20px;font-weight:700;color:#4D240F">${p.empleados || 0}</div>
              <div style="font-size:10px;color:#888">Empleados</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:20px;font-weight:700;color:#4D240F">${p.contratistas || 0}</div>
              <div style="font-size:10px;color:#888">Contratistas</div>
            </div>
          </div>
        </div>
        <div style="background:#f8fdf0;border:2px solid ${efColor};border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:36px;font-weight:900;color:${efColor}">${formatNum(eficiencia, 1)}%</div>
          <div style="font-size:12px;color:#666;margin-top:2px">Eficiencia Operativa</div>
          <div style="margin-top:8px;display:flex;justify-content:center;gap:12px">
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:700">${p.jornalesTrabajados || 0}</div>
              <div style="font-size:10px;color:#888">Trabajados</div>
            </div>
            <div style="text-align:center;opacity:0.6">/</div>
            <div style="text-align:center">
              <div style="font-size:16px;font-weight:700">${p.jornalesPosibles || 0}</div>
              <div style="font-size:10px;color:#888">Posibles</div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:#fff3f3;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#dc2626">${p.fallas || 0}</div>
            <div style="font-size:10px;color:#666">Fallas</div>
          </div>
          <div style="background:#fffbf0;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#d97706">${p.permisos || 0}</div>
            <div style="font-size:10px;color:#666">Permisos</div>
          </div>
          <div style="background:#f0fff4;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#16a34a">${p.ingresos || 0}</div>
            <div style="font-size:10px;color:#666">Ingresos</div>
          </div>
          <div style="background:#f5f5f5;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#6b7280">${p.retiros || 0}</div>
            <div style="font-size:10px;color:#666">Retiros</div>
          </div>
        </div>
      </div>
      <!-- Detalle fallas -->
      <div style="background:white;border-radius:10px;border:1px solid #f0f0f0;padding:14px;overflow:hidden">
        <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>🔴</span> Fallas (${p.fallas || 0})
        </div>
        ${detallesFallas.length > 0
          ? detallesFallas.map((d: any) => filaPersona(d)).join('')
          : '<div style="font-size:12px;color:#aaa;font-style:italic">Sin fallas registradas</div>'}
      </div>
      <!-- Detalle permisos -->
      <div style="background:white;border-radius:10px;border:1px solid #f0f0f0;padding:14px;overflow:hidden">
        <div style="font-size:13px;font-weight:700;color:#d97706;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>⚠️</span> Permisos (${p.permisos || 0})
        </div>
        ${detallesPermisos.length > 0
          ? detallesPermisos.map((d: any) => filaPersona(d)).join('')
          : '<div style="font-size:12px;color:#aaa;font-style:italic">Sin permisos registrados</div>'}
      </div>
    </div>`);
}

// ============================================================================
// SLIDE 3: LABORES PROGRAMADAS
// ============================================================================

function construirSlideLaboresProgramadas(datos: any): string {
  const labores: any[] = datos.labores?.programadas || [];
  if (labores.length === 0) return '';

  const estadoColor: Record<string, string> = {
    'Por iniciar': '#6b7280',
    'En proceso': '#d97706',
    'Terminada': '#16a34a',
  };
  const estadoBg: Record<string, string> = {
    'Por iniciar': '#f5f5f5',
    'En proceso': '#fffbf0',
    'Terminada': '#f0fff4',
  };

  const filaLabor = (l: any, i: number) => {
    const color = estadoColor[l.estado] || '#333';
    const bg = estadoBg[l.estado] || '#fff';
    return `
      <tr style="background:${i % 2 === 0 ? 'white' : '#fafafa'}">
        <td style="padding:7px 10px;font-size:12px;color:#4D240F;max-width:220px">${l.nombre}</td>
        <td style="padding:7px 10px;font-size:11px;color:#666">${l.tipoTarea}</td>
        <td style="padding:7px 10px">
          <span style="background:${bg};color:${color};border:1px solid ${color};border-radius:12px;
            padding:2px 10px;font-size:11px;font-weight:600;white-space:nowrap">${l.estado}</span>
        </td>
        <td style="padding:7px 10px;font-size:11px;color:#666">${l.fechaInicio ? new Date(l.fechaInicio + 'T12:00:00').toLocaleDateString('es-CO', {day:'numeric',month:'short'}) : ''}</td>
        <td style="padding:7px 10px;font-size:11px;color:#888">${(l.lotes || []).slice(0,3).join(', ')}</td>
      </tr>`;
  };

  const resumen = {
    'Por iniciar': labores.filter((l: any) => l.estado === 'Por iniciar').length,
    'En proceso': labores.filter((l: any) => l.estado === 'En proceso').length,
    'Terminada': labores.filter((l: any) => l.estado === 'Terminada').length,
  };

  return slideWrap(`
    ${slideHeader('Labores', 'Tareas Programadas', datos.semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;flex:1">
      <div style="display:flex;flex-direction:column;gap:10px;min-width:160px">
        <div style="text-align:center;font-size:36px;font-weight:900;color:#73991C">${labores.length}</div>
        <div style="text-align:center;font-size:12px;color:#666">Tareas totales</div>
        ${Object.entries(resumen).map(([estado, count]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;
            background:${estadoBg[estado]};border-radius:8px;padding:8px 12px;border:1px solid ${estadoColor[estado]}33">
            <span style="font-size:12px;color:${estadoColor[estado]};font-weight:600">${estado}</span>
            <span style="font-size:18px;font-weight:800;color:${estadoColor[estado]}">${count}</span>
          </div>`).join('')}
      </div>
      <div style="overflow:hidden;max-height:580px">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#73991C;color:white">
              <th style="padding:8px 10px;font-size:12px;text-align:left;font-weight:600">Tarea</th>
              <th style="padding:8px 10px;font-size:12px;text-align:left;font-weight:600">Tipo</th>
              <th style="padding:8px 10px;font-size:12px;text-align:left;font-weight:600">Estado</th>
              <th style="padding:8px 10px;font-size:12px;text-align:left;font-weight:600">Inicio</th>
              <th style="padding:8px 10px;font-size:12px;text-align:left;font-weight:600">Lotes</th>
            </tr>
          </thead>
          <tbody>
            ${labores.slice(0, 14).map((l: any, i: number) => filaLabor(l, i)).join('')}
          </tbody>
        </table>
      </div>
    </div>`);
}

// ============================================================================
// SLIDE 4: MATRIZ DE JORNALES
// ============================================================================

function construirSlideLaboresMatriz(datos: any): string {
  const mat = datos.labores?.matrizJornales || datos.jornales;
  if (!mat) return '';

  const { actividades = [], lotes = [], datos: matDatos = {}, totalesPorActividad = {}, totalesPorLote = {}, totalGeneral = {} } = mat;
  if (actividades.length === 0 || lotes.length === 0) return '';

  const maxVal = totalGeneral.jornales || 1;

  const thStyle = 'padding:5px 8px;font-size:10px;font-weight:600;text-align:center;color:white;background:#73991C';
  const thLStyle = 'padding:5px 8px;font-size:10px;font-weight:600;text-align:left;color:white;background:#73991C';

  const lotesDisplay = lotes.slice(0, 10);

  return slideWrap(`
    ${slideHeader('Labores', 'Matriz de Jornales', datos.semana)}
    <div style="padding:14px 24px;overflow:auto;flex:1">
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr>
            <th style="${thLStyle};min-width:120px">Actividad</th>
            ${lotesDisplay.map((l: string) => `<th style="${thStyle};min-width:70px">${l}</th>`).join('')}
            <th style="${thStyle};background:#4D240F;min-width:70px">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${actividades.map((act: string) => {
            const totAct = totalesPorActividad[act] || { jornales: 0 };
            const bg = getHeatmapColor(totAct.jornales, maxVal);
            const txtColor = getTextColorForHeatmap(totAct.jornales, maxVal);
            return `
              <tr>
                <td style="padding:5px 8px;font-size:11px;font-weight:600;color:#4D240F;border-bottom:1px solid #e5e7eb">${act}</td>
                ${lotesDisplay.map((l: string) => {
                  const cell = (matDatos[act] || {})[l] || { jornales: 0 };
                  if (cell.jornales === 0) return `<td style="padding:5px 8px;text-align:center;color:#ccc;border-bottom:1px solid #e5e7eb">—</td>`;
                  const cellBg = getHeatmapColor(cell.jornales, maxVal);
                  const cellTxt = getTextColorForHeatmap(cell.jornales, maxVal);
                  return `<td style="padding:5px 8px;text-align:center;background:${cellBg};color:${cellTxt};font-weight:600;border-bottom:1px solid #e5e7eb">${formatNum(cell.jornales)}</td>`;
                }).join('')}
                <td style="padding:5px 8px;text-align:center;background:${bg};color:${txtColor};font-weight:700;border-bottom:1px solid #e5e7eb">${formatNum(totAct.jornales)}</td>
              </tr>`;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f8fdf0">
            <td style="padding:6px 8px;font-weight:700;font-size:11px;color:#4D240F;border-top:2px solid #73991C">TOTAL LOTE</td>
            ${lotesDisplay.map((l: string) => {
              const totL = totalesPorLote[l] || { jornales: 0 };
              return `<td style="padding:6px 8px;text-align:center;font-weight:700;color:#4D240F;border-top:2px solid #73991C">${formatNum(totL.jornales)}</td>`;
            }).join('')}
            <td style="padding:6px 8px;text-align:center;font-weight:900;color:white;background:#4D240F;font-size:13px">${formatNum(totalGeneral.jornales || 0)}</td>
          </tr>
          <tr style="background:#fdf8f0">
            <td style="padding:4px 8px;font-size:10px;color:#666">Costo total</td>
            ${lotesDisplay.map((l: string) => {
              const totL = totalesPorLote[l] || { costo: 0 };
              return `<td style="padding:4px 8px;text-align:center;font-size:10px;color:#666">${formatCOP(totL.costo)}</td>`;
            }).join('')}
            <td style="padding:4px 8px;text-align:center;font-weight:700;font-size:11px;color:#4D240F">${formatCOP(totalGeneral.costo || 0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`);
}

// ============================================================================
// SLIDE 5: GRÁFICOS JORNALES (barras horizontales)
// ============================================================================

function construirSlideLaboresGraficos(datos: any): string {
  const mat = datos.labores?.matrizJornales || datos.jornales;
  if (!mat) return '';

  const { actividades = [], lotes = [], totalesPorActividad = {}, totalesPorLote = {} } = mat;
  if (actividades.length === 0) return '';

  const maxAct = Math.max(...actividades.map((a: string) => totalesPorActividad[a]?.jornales || 0), 1);
  const maxLot = Math.max(...lotes.map((l: string) => totalesPorLote[l]?.jornales || 0), 1);

  const barraHoriz = (label: string, value: number, max: number, color: string) => {
    const pct = Math.min((value / max) * 100, 100);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
        <div style="width:130px;font-size:11px;color:#4D240F;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
        <div style="flex:1;background:#f0f0f0;border-radius:3px;height:18px;position:relative">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px;transition:width 0.3s"></div>
          <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;color:#333">${formatNum(value)}</span>
        </div>
      </div>`;
  };

  return slideWrap(`
    ${slideHeader('Labores', 'Distribución de Jornales', datos.semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1">
      <div>
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:14px">Por Tipo de Actividad</div>
        ${actividades.map((a: string) => barraHoriz(a, totalesPorActividad[a]?.jornales || 0, maxAct, '#73991C')).join('')}
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:14px">Por Lote</div>
        ${lotes.map((l: string) => barraHoriz(l, totalesPorLote[l]?.jornales || 0, maxLot, '#4D240F')).join('')}
      </div>
    </div>`);
}

// ============================================================================
// SLIDES 6-8: CIERRE DE APLICACIÓN (General, Técnico, Financiero)
// ============================================================================

function construirSlideCierreGeneral(cerrada: any, semana: any): string {
  const g = cerrada.general || {};
  const desvCosto = g.costoDesviacion || 0;
  const desvCanecas = g.canecasBultosDesviacion || 0;

  return slideWrap(`
    ${slideHeader('Cierre Aplicación', cerrada.nombre, semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="background:#f8fdf0;border:1px solid #73991C;border-radius:10px;padding:14px">
          <div style="font-size:12px;color:#666;margin-bottom:6px">Tipo: ${cerrada.tipo} · Propósito: ${cerrada.proposito}</div>
          <div style="display:flex;gap:16px">
            <div><span style="font-size:11px;color:#888">Inicio:</span> <span style="font-size:12px;font-weight:600">${cerrada.fechaInicio}</span></div>
            <div><span style="font-size:11px;color:#888">Fin:</span> <span style="font-size:12px;font-weight:600">${cerrada.fechaFin}</span></div>
            <div><span style="font-size:11px;color:#888">Días:</span> <span style="font-size:12px;font-weight:600">${cerrada.diasEjecucion}</span></div>
          </div>
        </div>
        <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
          <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:12px">Operativo — ${g.unidad || 'Canecas'}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
            <div style="text-align:center">
              <div style="font-size:11px;color:#888">Planeado</div>
              <div style="font-size:22px;font-weight:800;color:#6b7280">${formatNum(g.canecasBultosPlaneados || 0)}</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:11px;color:#888">Real</div>
              <div style="font-size:22px;font-weight:800;color:#4D240F">${formatNum(g.canecasBultosReales || 0)}</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:11px;color:#888">Desviación</div>
              <div style="font-size:22px;font-weight:800;color:${getDesvColor(desvCanecas)}">${desvCanecas >= 0 ? '+' : ''}${formatNum(desvCanecas)}%</div>
            </div>
          </div>
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px">
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:12px">Resultado Financiero</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#73991C;color:white">
            <th style="padding:7px 10px;font-size:11px;text-align:left">Concepto</th>
            <th style="padding:7px 10px;font-size:11px;text-align:right">Planeado</th>
            <th style="padding:7px 10px;font-size:11px;text-align:right">Real</th>
            <th style="padding:7px 10px;font-size:11px;text-align:right">Desv.</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:7px 10px;font-size:12px">Costo Total</td>
              <td style="padding:7px 10px;font-size:12px;text-align:right">${formatCOP(g.costoPlaneado || 0)}</td>
              <td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700">${formatCOP(g.costoReal || 0)}</td>
              <td style="padding:7px 10px;text-align:right">${getDesvBadge(desvCosto)}</td>
            </tr>
            ${g.costoAnterior ? `<tr>
              <td style="padding:7px 10px;font-size:11px;color:#888">Vs aplicación anterior</td>
              <td style="padding:7px 10px;font-size:11px;text-align:right;color:#888">${formatCOP(g.costoAnterior)}</td>
              <td style="padding:7px 10px"></td>
              <td style="padding:7px 10px;text-align:right">${getDesvBadge(g.costoVariacion || 0)}</td>
            </tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>`);
}

function construirSlideCierreTecnico(cerrada: any, semana: any): string {
  const kpis: any[] = cerrada.kpiPorLote || [];
  if (kpis.length === 0) return '';

  const thS = 'padding:6px 8px;font-size:10px;font-weight:600;text-align:center;color:white;background:#73991C';
  const thL = 'padding:6px 8px;font-size:10px;font-weight:600;text-align:left;color:white;background:#73991C';

  return slideWrap(`
    ${slideHeader('Cierre Técnico', cerrada.nombre, semana)}
    <div style="padding:14px 24px;overflow:auto;flex:1">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="${thL}">Lote</th>
            <th style="${thS}">Plan can.</th>
            <th style="${thS}">Real can.</th>
            <th style="${thS}">Desv.</th>
            <th style="${thS}">Plan ins.</th>
            <th style="${thS}">Real ins.</th>
            <th style="${thS}">Desv.</th>
            <th style="${thS}">L/árbol</th>
            <th style="${thS}">Árboles/J</th>
          </tr>
        </thead>
        <tbody>
          ${kpis.map((k: any, i: number) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#f9f9f9'}">
              <td style="padding:6px 8px;font-size:11px;font-weight:600;color:#4D240F;border-bottom:1px solid #e5e7eb">${k.loteNombre}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb">${k.canecasPlaneadas != null ? formatNum(k.canecasPlaneadas) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;font-weight:600;border-bottom:1px solid #e5e7eb">${k.canecasReales != null ? formatNum(k.canecasReales) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">${k.canecasDesviacion != null ? getDesvBadge(k.canecasDesviacion) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb">${k.insumosPlaneados != null ? formatNum(k.insumosPlaneados) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;font-weight:600;border-bottom:1px solid #e5e7eb">${k.insumosReales != null ? formatNum(k.insumosReales) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">${k.insumosDesviacion != null ? getDesvBadge(k.insumosDesviacion) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb">${k.litrosKgPorArbol != null ? formatNum(k.litrosKgPorArbol, 2) : '—'}</td>
              <td style="padding:6px 8px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb">${k.arbolesPorJornal != null ? formatNum(k.arbolesPorJornal, 1) : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`);
}

function construirSlideCierreFinanciero(cerrada: any, semana: any): string {
  const financiero: any[] = cerrada.financieroPorLote || [];
  if (financiero.length === 0) return '';

  const thS = 'padding:6px 8px;font-size:10px;font-weight:600;text-align:center;color:white;background:#4D240F';
  const thL = 'padding:6px 8px;font-size:10px;font-weight:600;text-align:left;color:white;background:#4D240F';

  return slideWrap(`
    ${slideHeader('Cierre Financiero', cerrada.nombre, semana)}
    <div style="padding:14px 24px;overflow:auto;flex:1">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr>
            <th style="${thL}">Lote</th>
            <th style="${thS}">Costo Plan</th>
            <th style="${thS}">Costo Real</th>
            <th style="${thS}">Desv. Total</th>
            <th style="${thS}">Insumos Plan</th>
            <th style="${thS}">Insumos Real</th>
            <th style="${thS}">Desv. Ins.</th>
            <th style="${thS}">M.O. Plan</th>
            <th style="${thS}">M.O. Real</th>
            <th style="${thS}">Desv. M.O.</th>
          </tr>
        </thead>
        <tbody>
          ${financiero.map((f: any, i: number) => `
            <tr style="background:${i % 2 === 0 ? 'white' : '#fdf8f4'}">
              <td style="padding:6px 8px;font-size:11px;font-weight:600;color:#4D240F;border-bottom:1px solid #e5e7eb">${f.loteNombre}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoTotalPlaneado)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoTotalReal)}</td>
              <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">${getDesvBadge(f.costoTotalDesviacion)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoInsumosPlaneado)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoInsumosReal)}</td>
              <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">${getDesvBadge(f.costoInsumosDesviacion)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoManoObraPlaneado)}</td>
              <td style="padding:6px 8px;text-align:right;font-size:11px;font-weight:700;border-bottom:1px solid #e5e7eb">${formatCOP(f.costoManoObraReal)}</td>
              <td style="padding:6px 8px;text-align:center;border-bottom:1px solid #e5e7eb">${getDesvBadge(f.costoManoObraDesviacion)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`);
}

// ============================================================================
// SLIDE 9: APLICACIONES ACTIVAS
// ============================================================================

function construirSlideAplicacionesActivas(datos: any): string {
  const activas: any[] = datos.aplicaciones?.activas || [];
  if (activas.length === 0) return '';

  const barProgreso = (val: number, max: number, color: string) => {
    const pct = max > 0 ? Math.min((val / max) * 100, 100) : 0;
    return `<div style="background:#e5e7eb;border-radius:4px;height:12px;overflow:hidden">
      <div style="height:100%;width:${pct}%;background:${color};border-radius:4px"></div>
    </div>`;
  };

  return slideWrap(`
    ${slideHeader('Aplicaciones', 'En Ejecución', datos.semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px;flex:1;overflow:auto">
      ${activas.map((a: any) => {
        const pct = a.porcentajeGlobal || 0;
        const pctColor = pct >= 80 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
        return `
          <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="font-size:13px;font-weight:700;color:#4D240F">${a.nombre}</div>
              <div style="font-size:18px;font-weight:900;color:${pctColor}">${formatNum(pct)}%</div>
            </div>
            <div style="font-size:11px;color:#888;margin-bottom:8px">${a.tipo} · ${a.proposito}</div>
            ${barProgreso(a.totalEjecutado, a.totalPlaneado, pctColor)}
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#888;margin-top:4px">
              <span>0</span>
              <span>${formatNum(a.totalEjecutado)} / ${formatNum(a.totalPlaneado)} ${a.unidad}</span>
            </div>
            ${(a.progresoPorLote || []).slice(0, 4).map((l: any) => `
              <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
                <div style="width:80px;font-size:10px;color:#555;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.loteNombre}</div>
                ${barProgreso(l.ejecutado, l.planeado, '#73991C')}
                <div style="width:34px;font-size:10px;text-align:right;font-weight:600;color:#4D240F">${formatNum(l.porcentaje)}%</div>
              </div>`).join('')}
          </div>`;
      }).join('')}
    </div>`);
}

// ============================================================================
// SLIDE 10: PLAN DE APLICACIÓN (one per planned app)
// ============================================================================

function construirSlideAplicacionPlaneada(ap: any, semana: any): string {
  const listaCompras: any[] = ap.listaCompras || [];
  const mezclas: any[] = ap.mezclas || [];

  return slideWrap(`
    ${slideHeader('Aplicaciones', `Plan: ${ap.nombre}`, semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:1fr 1fr;gap:20px;flex:1">
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="background:#f8fdf0;border:1px solid #73991C;border-radius:10px;padding:12px">
          <div style="font-size:11px;color:#888">Tipo: ${ap.tipo} · Propósito: ${ap.proposito}</div>
          <div style="font-size:11px;color:#888;margin-top:4px">
            Fecha inicio: ${ap.fechaInicioPlaneada}
            ${ap.fechaFinPlaneada ? ` · Fin: ${ap.fechaFinPlaneada}` : ''}
          </div>
          ${ap.blancosBiologicos?.length > 0 ? `<div style="font-size:11px;color:#888;margin-top:4px">Blancos: ${ap.blancosBiologicos.join(', ')}</div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#4D240F">${formatCOP(ap.costoTotalEstimado || 0)}</div>
            <div style="font-size:10px;color:#888">Costo estimado</div>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#73991C">${formatCOP(ap.inventarioTotalDisponible || 0)}</div>
            <div style="font-size:10px;color:#888">Inventario disp.</div>
          </div>
          ${ap.costoPorArbol != null ? `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#4D240F">${formatCOP(ap.costoPorArbol)}</div>
            <div style="font-size:10px;color:#888">Costo/árbol</div>
          </div>` : ''}
          ${ap.costoPorLitroKg != null ? `<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:800;color:#4D240F">${formatCOP(ap.costoPorLitroKg)}</div>
            <div style="font-size:10px;color:#888">Costo/L·Kg</div>
          </div>` : ''}
        </div>
        ${mezclas.length > 0 ? `
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px">
            <div style="font-size:12px;font-weight:700;color:#4D240F;margin-bottom:8px">Mezclas</div>
            ${mezclas.map((m: any) => `
              <div style="margin-bottom:6px">
                <div style="font-size:11px;font-weight:600;color:#73991C">${m.nombre}</div>
                <div style="font-size:10px;color:#666">${(m.productos || []).map((pr: any) => `${pr.nombre} (${pr.dosis})`).join(' + ')}</div>
              </div>`).join('')}
          </div>` : ''}
      </div>
      <div>
        <div style="font-size:12px;font-weight:700;color:#4D240F;margin-bottom:8px">Lista de Compras</div>
        ${listaCompras.length > 0 ? `
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr style="background:#73991C;color:white">
              <th style="padding:5px 8px;text-align:left">Producto</th>
              <th style="padding:5px 8px;text-align:center">Necesario</th>
              <th style="padding:5px 8px;text-align:center">Disponible</th>
              <th style="padding:5px 8px;text-align:center">A comprar</th>
              <th style="padding:5px 8px;text-align:right">Costo est.</th>
            </tr></thead>
            <tbody>
              ${listaCompras.map((c: any, i: number) => `
                <tr style="background:${i % 2 === 0 ? 'white' : '#f9f9f9'}">
                  <td style="padding:5px 8px;font-weight:600;color:#4D240F">${c.productoNombre}</td>
                  <td style="padding:5px 8px;text-align:center">${formatNum(c.cantidadNecesaria)} ${c.unidad}</td>
                  <td style="padding:5px 8px;text-align:center">${c.inventarioDisponible != null ? formatNum(c.inventarioDisponible) : '—'}</td>
                  <td style="padding:5px 8px;text-align:center;font-weight:700;color:${(c.cantidadAComprar || 0) > 0 ? '#dc2626' : '#16a34a'}">${c.cantidadAComprar != null ? formatNum(c.cantidadAComprar) : '—'}</td>
                  <td style="padding:5px 8px;text-align:right">${formatCOP(c.costoEstimado)}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div style="font-size:12px;color:#aaa;font-style:italic">No hay lista de compras</div>'}
      </div>
    </div>`);
}

// ============================================================================
// SLIDE 11: MONITOREO — TENDENCIAS (AI)
// ============================================================================

function construirSlideMonitoreoTendencias(datos: any, analisis: AnalisisGemini): string {
  const mon = datos.monitoreo || {};
  const tendencias: any[] = mon.tendencias || [];
  const fechas: string[] = mon.fechasMonitoreo || [];
  if (tendencias.length === 0) return '';

  const texto = analisis.interpretacion_tendencias_monitoreo || analisis.interpretacion_monitoreo || '';

  return slideWrap(`
    ${slideHeader('Monitoreo', 'Tendencias Fitosanitarias', datos.semana)}
    <div style="padding:16px 28px;display:grid;grid-template-columns:1fr 1.2fr;gap:20px;flex:1">
      <div>
        <div style="font-size:12px;color:#888;margin-bottom:10px">Fechas analizadas: ${fechas.join(' · ')}</div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:560px;overflow:hidden">
          ${tendencias.map((t: any) => {
            const color = getIncidenciaColor(t.incidenciaPromedio);
            const barPct = Math.min(t.incidenciaPromedio * 2, 100);
            return `
              <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px">
                <div style="flex:1">
                  <div style="font-size:12px;font-weight:600;color:#4D240F">${t.plagaNombre}</div>
                  <div style="background:#f0f0f0;border-radius:3px;height:8px;margin-top:4px">
                    <div style="height:100%;width:${barPct}%;background:${color};border-radius:3px"></div>
                  </div>
                </div>
                <div style="font-size:18px;font-weight:800;color:${color};min-width:48px;text-align:right">${formatNum(t.incidenciaPromedio)}%</div>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div style="background:#f8fdf0;border:1px solid #73991C;border-radius:10px;padding:16px;overflow:hidden">
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:10px;display:flex;align-items:center;gap:6px">
          <span>🌿</span> Análisis de Tendencias
        </div>
        <div style="font-size:12px;color:#333;line-height:1.7;white-space:pre-wrap">${texto}</div>
      </div>
    </div>`);
}

// ============================================================================
// SLIDE 12: MONITOREO — POR LOTE (tabla con 3 observaciones)
// ============================================================================

function construirSlideMonitoreoPorLote(datos: any): string {
  const mon = datos.monitoreo || {};
  const vistas: any[] = mon.vistasPorLote || [];
  if (vistas.length === 0) return '';

  const fechas: string[] = mon.fechasMonitoreo || [];
  const fechasShort = fechas.map((f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }));

  return slideWrap(`
    ${slideHeader('Monitoreo', 'Resumen por Lote', datos.semana)}
    <div style="padding:12px 24px;overflow:auto;flex:1">
      ${vistas.slice(0, 4).map((v: any) => `
        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:700;color:#73991C;margin-bottom:4px">${v.loteNombre}</div>
          <table style="width:100%;border-collapse:collapse;font-size:10px">
            <thead><tr style="background:#73991C;color:white">
              <th style="padding:4px 8px;text-align:left">Plaga</th>
              ${fechasShort.map((f: string) => `<th style="padding:4px 8px;text-align:center">${f}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${(v.plagasRows || []).map((row: any, i: number) => {
                const bgRow = i % 2 === 0 ? 'white' : '#f9f9f9';
                const textWeight = row.esPlaga_interes ? '700' : '400';
                return `<tr style="background:${bgRow}">
                  <td style="padding:4px 8px;font-weight:${textWeight};color:#4D240F">${row.plagaNombre}</td>
                  ${(row.observaciones || []).map((obs: any) => {
                    if (obs.incidencia == null) return `<td style="padding:4px 8px;text-align:center;color:#ccc">—</td>`;
                    const color = getIncidenciaColor(obs.incidencia);
                    return `<td style="padding:4px 8px;text-align:center;font-weight:600;color:${color}">${formatNum(obs.incidencia)}%</td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`).join('')}
    </div>`);
}

// ============================================================================
// SLIDE 13+: MONITOREO — POR SUBLOTE (one per lote)
// ============================================================================

function construirSlidesMonitoreoPorSublote(datos: any): string {
  const mon = datos.monitoreo || {};
  const vistas: any[] = mon.vistasPorSublote || [];
  if (vistas.length === 0) return '';

  return vistas.map((v: any) => {
    const sublotes: string[] = v.sublotes || [];
    const plagas: string[] = v.plagas || [];
    const celdas: Record<string, Record<string, any[]>> = v.celdas || {};
    const fechas: string[] = mon.fechasMonitoreo || [];
    const fechasShort = fechas.map((f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }));

    if (sublotes.length === 0 || plagas.length === 0) return '';

    const thS = 'padding:4px 6px;font-size:9px;font-weight:600;text-align:center;color:white;background:#73991C;white-space:nowrap';
    const thL = 'padding:4px 8px;font-size:9px;font-weight:600;text-align:left;color:white;background:#73991C';

    return slideWrap(`
      ${slideHeader('Monitoreo Sublotes', v.loteNombre, datos.semana)}
      <div style="padding:12px 20px;overflow:auto;flex:1">
        <table style="width:100%;border-collapse:collapse;font-size:9px">
          <thead>
            <tr>
              <th style="${thL}" rowspan="2">Plaga</th>
              ${sublotes.map((s: string) => `<th style="${thS};background:#4D240F" colspan="${fechas.length || 1}">${s}</th>`).join('')}
            </tr>
            <tr>
              ${sublotes.flatMap(() => (fechasShort.length > 0 ? fechasShort : ['—']).map((f: string) => `<th style="${thS};background:#5a7a14;font-weight:400">${f}</th>`)).join('')}
            </tr>
          </thead>
          <tbody>
            ${plagas.map((plaga: string, i: number) => `
              <tr style="background:${i % 2 === 0 ? 'white' : '#f9f9f9'}">
                <td style="padding:4px 8px;font-size:10px;font-weight:600;color:#4D240F;border-bottom:1px solid #e5e7eb">${plaga}</td>
                ${sublotes.flatMap((sub: string) => {
                  const obs: any[] = (celdas[plaga] || {})[sub] || [];
                  const fechasCount = fechas.length || 1;
                  const cells = [];
                  for (let j = 0; j < fechasCount; j++) {
                    const o = obs[j];
                    if (!o || o.incidencia == null) {
                      cells.push(`<td style="padding:4px 6px;text-align:center;color:#ccc;border-bottom:1px solid #e5e7eb">—</td>`);
                    } else {
                      const color = getIncidenciaColor(o.incidencia);
                      cells.push(`<td style="padding:4px 6px;text-align:center;font-weight:600;color:${color};border-bottom:1px solid #e5e7eb">${formatNum(o.incidencia)}%</td>`);
                    }
                  }
                  return cells;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`);
  }).join('');
}

// ============================================================================
// SLIDE ADICIONALES
// ============================================================================

function construirSlideAdicional(bloque: any, semana: any): string {
  if (bloque.tipo === 'texto') {
    return slideWrap(`
      ${slideHeader('Temas Adicionales', bloque.titulo || 'Información Adicional', semana)}
      <div style="padding:24px 40px;flex:1;overflow:hidden">
        <div style="font-size:14px;line-height:1.8;color:#333;white-space:pre-wrap">${bloque.contenido}</div>
      </div>`);
  }

  if (bloque.tipo === 'imagen_con_texto') {
    const imgs: string[] = bloque.imagenesBase64?.length > 0
      ? bloque.imagenesBase64
      : bloque.imagenBase64
        ? [bloque.imagenBase64]
        : [];
    const hasImgs = imgs.length > 0;

    return slideWrap(`
      ${slideHeader('Temas Adicionales', bloque.titulo || 'Registro Fotográfico', semana)}
      <div style="padding:16px 28px;display:grid;grid-template-columns:${hasImgs ? '1fr 1fr' : '1fr'};gap:20px;flex:1">
        ${hasImgs ? `
          <div style="display:flex;${imgs.length > 1 ? 'flex-direction:column;gap:12px' : ''}">
            ${imgs.map((src: string) => `
              <img src="${src}" style="width:100%;${imgs.length > 1 ? 'height:50%' : 'height:100%'};object-fit:cover;border-radius:8px" />`).join('')}
          </div>` : ''}
        <div style="display:flex;align-items:center">
          <div style="font-size:14px;line-height:1.8;color:#333">${bloque.descripcion}</div>
        </div>
      </div>`);
  }

  return '';
}

// ============================================================================
// SLIDE CONCLUSIONES
// ============================================================================

function construirSlideConclusiones(analisis: AnalisisGemini, semana: any): string {
  return slideWrap(`
    ${slideHeader('Conclusiones', 'Resumen y Recomendaciones', semana)}
    <div style="padding:20px 40px;display:grid;grid-template-columns:1fr 1fr;gap:24px;flex:1">
      <div>
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:12px">Resumen Ejecutivo</div>
        <div style="font-size:14px;line-height:1.8;color:#333;background:#f8fdf0;border-left:4px solid #73991C;
          padding:14px 16px;border-radius:0 8px 8px 0">${analisis.resumen_ejecutivo}</div>
      </div>
      <div>
        <div style="font-size:13px;font-weight:700;color:#4D240F;margin-bottom:12px">Acciones Recomendadas</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${(analisis.conclusiones || []).map((c: any) => {
            const priColors: Record<string, string> = { alta: '#dc2626', media: '#d97706', baja: '#16a34a' };
            const prioBg: Record<string, string> = { alta: '#fff5f5', media: '#fffbf0', baja: '#f0fff4' };
            const color = priColors[c.prioridad] || '#333';
            const bg = prioBg[c.prioridad] || '#f9f9f9';
            return `
              <div style="background:${bg};border:1px solid ${color}33;border-left:4px solid ${color};
                border-radius:0 8px 8px 0;padding:10px 14px;display:flex;gap:10px;align-items:flex-start">
                <span style="font-size:16px">${c.icono}</span>
                <span style="font-size:13px;color:#333;line-height:1.5">${c.texto}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </div>`);
}

// ============================================================================
// ENSAMBLADOR PRINCIPAL
// ============================================================================

function construirHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const slides: string[] = [];

  // Slide 1: Portada
  slides.push(construirSlideTitulo(datos));

  // Slide 2: Personal
  slides.push(construirSlidePersonal(datos));

  // Slide 3: Labores programadas
  const slabores = construirSlideLaboresProgramadas(datos);
  if (slabores) slides.push(slabores);

  // Slide 4: Matriz jornales
  const smatriz = construirSlideLaboresMatriz(datos);
  if (smatriz) slides.push(smatriz);

  // Slide 5: Gráficos jornales
  const sgraficos = construirSlideLaboresGraficos(datos);
  if (sgraficos) slides.push(sgraficos);

  // Slides 6-8: Cierre por aplicación
  for (const cerrada of (datos.aplicaciones?.cerradas || [])) {
    const sg = construirSlideCierreGeneral(cerrada, datos.semana);
    if (sg) slides.push(sg);
    const st = construirSlideCierreTecnico(cerrada, datos.semana);
    if (st) slides.push(st);
    const sf = construirSlideCierreFinanciero(cerrada, datos.semana);
    if (sf) slides.push(sf);
  }

  // Slide 9: Aplicaciones activas
  const sactivas = construirSlideAplicacionesActivas(datos);
  if (sactivas) slides.push(sactivas);

  // Slide 10: Plan por aplicación planeada
  for (const ap of (datos.aplicaciones?.planeadas || [])) {
    const sp = construirSlideAplicacionPlaneada(ap, datos.semana);
    if (sp) slides.push(sp);
  }

  // Slide 11: Monitoreo tendencias
  const smtend = construirSlideMonitoreoTendencias(datos, analisis);
  if (smtend) slides.push(smtend);

  // Slide 12: Monitoreo por lote
  const smlote = construirSlideMonitoreoPorLote(datos);
  if (smlote) slides.push(smlote);

  // Slides 13+: Monitoreo por sublote
  const smsublote = construirSlidesMonitoreoPorSublote(datos);
  if (smsublote) slides.push(smsublote);

  // Slides adicionales
  for (const bloque of (datos.temasAdicionales || [])) {
    const sa = construirSlideAdicional(bloque, datos.semana);
    if (sa) slides.push(sa);
  }

  // Slide final: Conclusiones
  slides.push(construirSlideConclusiones(analisis, datos.semana));

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #e5e7eb;
      width: 1280px;
    }
    .slide {
      width: 1280px;
      height: 720px;
      overflow: hidden;
      background: white;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
      margin-bottom: 0;
      position: relative;
    }
    @media print {
      body { background: white; }
      .slide {
        page-break-after: always;
        break-after: page;
        margin: 0;
      }
    }
  `;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280">
  <title>Reporte Semanal Escocia Hass</title>
  <style>${css}</style>
</head>
<body>
${slides.join('\n')}
</body>
</html>`;
}

// ============================================================================
// HANDLER PRINCIPAL
// ============================================================================

export async function generarReporteSemanal(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: GenerateReportRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { datos, instrucciones } = body;
  if (!datos) {
    return new Response(JSON.stringify({ success: false, error: 'Missing datos' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[generarReporteSemanal] Llamando a Gemini...');
    const { analisis, tokens } = await llamarGemini(datos, instrucciones);
    console.log('[generarReporteSemanal] Gemini OK. Tokens:', tokens);

    const html = construirHTMLReporte(datos, analisis);
    console.log('[generarReporteSemanal] HTML generado:', html.length, 'chars');

    const response: GenerateReportResponse = {
      success: true,
      html,
      tokens_usados: tokens,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[generarReporteSemanal] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Error interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
