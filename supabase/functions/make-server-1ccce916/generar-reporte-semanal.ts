// generar-reporte-semanal.tsx
// Módulo de Edge Function para generar reportes semanales en formato slides landscape (1280x720)
// Flujo: datos → DeepSeek via OpenRouter (solo análisis JSON) → plantilla HTML determinística → PDF

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
    contexto?: string;
  }>;
  interpretacion_monitoreo: string;
  interpretacion_tendencias_monitoreo: string;
}

// ============================================================================
// PROMPT TEMPLATE — Solo pide análisis JSON, NO HTML
// ============================================================================

const SYSTEM_PROMPT = `Eres un administrador agrícola experto de la finca de aguacate Hass "Escocia Hass" en Colombia.
Recibirás datos operativos de la semana actual, tendencias de las últimas 4 semanas, y resúmenes de las llamadas recientes con el propietario.

RESPONDE EXCLUSIVAMENTE en formato JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "...",
  "conclusiones": [
    { "icono": "⚠️", "texto": "...", "prioridad": "alta", "contexto": "..." }
  ],
  "interpretacion_monitoreo": "...",
  "interpretacion_tendencias_monitoreo": "..."
}

### resumen_ejecutivo
Escríbelo como si fuera un administrador de finca en una llamada rápida con el propietario.
- Tono directo, conversacional, sin tecnicismos
- Máximo 5 oraciones
- Menciona lo que pasó (no lo que "se realizó"): qué se fumigó, cuánto personal, qué alerta de plaga hay
- Empieza por lo más importante de la semana (no por el número de jornales)
- Incluye cifras clave de forma natural: jornales, lotes pendientes, alertas de plaga
- Ejemplo de tono: "Esta semana completamos la fumigación en los lotes del sur. Nos faltan Acueducto y Unión que quedaron para la próxima. Tuvimos 11 empleados, 2 fallas, y se trabajaron 48 de 55 jornales posibles. El monitoreo mostró alertas de Monalonion en 4 lotes, lo que hay que atender."

### conclusiones
Lista de 3 a 6 recomendaciones concretas y priorizadas.
- Factoriza datos de la semana actual + tendencias de las últimas 4 semanas + compromisos pendientes de las llamadas con el propietario
- Señala explícitamente si algo fue prometido y no se cumplió, o si una tendencia lleva varias semanas
- Cada conclusión tiene:
  - texto: verbo de acción + qué hacer + (opcional) plazo o lote específico
  - contexto: en 1 oración, por qué se recomienda esto (tendencia, compromiso de llamada, umbral superado)
  - prioridad: "alta" / "media" / "baja"
  - icono: 🔴 (alta/urgente), ⚠️ (media/atención), ✅ (baja/bueno), 📊 (informativo)
- Los verbos de acción deben ser: Ejecutar, Evaluar, Priorizar, Revisar, Programar, Escalar, Confirmar

### interpretacion_monitoreo
Párrafo breve (2-3 oraciones) del estado fitosanitario general de la semana.

### interpretacion_tendencias_monitoreo
Análisis por plaga: Monalonion, Ácaro, Trips, Cucarrón marceño. Para cada una: tendencia (sube/baja/estable), lotes con mayor riesgo.

REGLAS GENERALES:
- Todo en español
- NO incluir HTML, markdown, ni código. SOLO el objeto JSON.
- NO envolver el JSON en bloques de código.`;

// ============================================================================
// CONTEXTO HISTÓRICO — ÚLTIMAS 4 SEMANAS
// ============================================================================

async function fetchHistoricoSemanas(inicioSemanaActual: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return '';

  // 4 semanas atrás desde el inicio de la semana actual
  const inicioDate = new Date(inicioSemanaActual);
  const inicioHistorico = new Date(inicioDate);
  inicioHistorico.setDate(inicioHistorico.getDate() - 28);
  const inicioHistoricoStr = inicioHistorico.toISOString().split('T')[0];

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const encode = (s: string) => encodeURIComponent(s);

  try {
    // Monitoreos: incidencia por plaga por lote por semana
    const monitoreoRes = await fetch(
      `${supabaseUrl}/rest/v1/monitoreos?select=fecha_monitoreo,lote_id,plaga_enfermedad_id,incidencia,gravedad_texto,lote:lotes(nombre),plaga:plagas_enfermedades_catalogo(nombre)&fecha_monitoreo=gte.${encode(inicioHistoricoStr)}&fecha_monitoreo=lt.${encode(inicioSemanaActual)}&order=fecha_monitoreo.asc`,
      { headers }
    );

    // Aplicaciones pendientes/vencidas en el período
    const aplicacionesRes = await fetch(
      `${supabaseUrl}/rest/v1/aplicaciones?select=nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_cierre&fecha_inicio_planeada=gte.${encode(inicioHistoricoStr)}&fecha_inicio_planeada=lt.${encode(inicioSemanaActual)}`,
      { headers }
    );

    // Ausentismo laboral por semana
    const ausenciaRes = await fetch(
      `${supabaseUrl}/rest/v1/registros_trabajo?select=fecha_trabajo,fraccion_jornal&fecha_trabajo=gte.${encode(inicioHistoricoStr)}&fecha_trabajo=lt.${encode(inicioSemanaActual)}`,
      { headers }
    );

    const [monitoreos, aplicaciones, registros] = await Promise.all([
      monitoreoRes.ok ? monitoreoRes.json() : [],
      aplicacionesRes.ok ? aplicacionesRes.json() : [],
      ausenciaRes.ok ? ausenciaRes.json() : [],
    ]);

    const partes: string[] = [];
    partes.push('## TENDENCIAS OPERATIVAS — ÚLTIMAS 4 SEMANAS');

    // Pest trends grouped by week
    if (Array.isArray(monitoreos) && monitoreos.length > 0) {
      partes.push('\n### Monitoreo fitosanitario (evolución semanal)');
      // Group by plaga × lote × week
      const trend: Record<string, Record<string, Record<string, number[]>>> = {};
      for (const m of monitoreos) {
        const fecha = new Date(m.fecha_monitoreo);
        const weekStart = new Date(fecha);
        weekStart.setDate(fecha.getDate() - fecha.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        const plaga = m.plaga?.nombre || m.plaga_enfermedad_id || 'Desconocida';
        const lote = m.lote?.nombre || m.lote_id || 'Sin lote';
        if (!trend[plaga]) trend[plaga] = {};
        if (!trend[plaga][lote]) trend[plaga][lote] = {};
        if (!trend[plaga][lote][weekKey]) trend[plaga][lote][weekKey] = [];
        trend[plaga][lote][weekKey].push(m.incidencia ?? 0);
      }

      for (const [plaga, lotes] of Object.entries(trend)) {
        partes.push(`\n**${plaga}**`);
        for (const [lote, weeks] of Object.entries(lotes)) {
          const sortedWeeks = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));
          const vals = sortedWeeks.map(([wk, vals]) => {
            const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
            return `S(${wk.slice(5)}): ${avg.toFixed(1)}%`;
          });
          // Flag rising trends (2+ consecutive weeks)
          const rising = sortedWeeks.length >= 2 && sortedWeeks.every(([, vs], i) => {
            if (i === 0) return true;
            const prev = sortedWeeks[i - 1][1];
            const avgPrev = prev.reduce((s, v) => s + v, 0) / prev.length;
            const avgCurr = vs.reduce((s, v) => s + v, 0) / vs.length;
            return avgCurr >= avgPrev;
          });
          partes.push(`  - ${lote}: ${vals.join(' → ')}${rising && sortedWeeks.length >= 2 ? ' ⬆ TENDENCIA ASCENDENTE' : ''}`);
        }
      }
    }

    // Overdue/open applications
    if (Array.isArray(aplicaciones) && aplicaciones.length > 0) {
      const pendientes = aplicaciones.filter((a: any) => a.estado !== 'cerrada' && a.estado !== 'cancelada');
      if (pendientes.length > 0) {
        partes.push('\n### Aplicaciones pendientes o vencidas');
        const hoy = new Date(inicioSemanaActual);
        for (const a of pendientes) {
          const finDate = a.fecha_fin_planeada ? new Date(a.fecha_fin_planeada) : null;
          const semanasVencida = finDate ? Math.floor((hoy.getTime() - finDate.getTime()) / (7 * 86400000)) : null;
          const vencida = semanasVencida !== null && semanasVencida > 0 ? ` — VENCIDA ${semanasVencida} sem.` : '';
          partes.push(`  - ${a.nombre_aplicacion} (${a.tipo_aplicacion}): ${a.estado}, planeada ${a.fecha_inicio_planeada}${vencida}`);
        }
      }
    }

    // Absence patterns by week
    if (Array.isArray(registros) && registros.length > 0) {
      partes.push('\n### Ausentismo laboral (últimas 4 semanas)');
      const byWeek: Record<string, { fallas: number; jornales: number }> = {};
      for (const r of registros) {
        const fecha = new Date(r.fecha_trabajo);
        const weekStart = new Date(fecha);
        weekStart.setDate(fecha.getDate() - fecha.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        if (!byWeek[weekKey]) byWeek[weekKey] = { fallas: 0, jornales: 0 };
        if ((r.fraccion_jornal ?? 1) === 0) byWeek[weekKey].fallas++;
        byWeek[weekKey].jornales += r.fraccion_jornal ?? 1;
      }
      for (const [wk, d] of Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b))) {
        partes.push(`  - Sem ${wk.slice(5)}: ${d.fallas} fallas, ${d.jornales.toFixed(1)} jornales trabajados`);
      }
    }

    return partes.join('\n');
  } catch {
    return '';
  }
}

// ============================================================================
// CONTEXTO NOTION — ÚLTIMAS 4 LLAMADAS CON PROPIETARIO
// ============================================================================

async function fetchResumenesNotion(): Promise<string> {
  const token = Deno.env.get('NOTION_TOKEN');
  if (!token) return '';

  const DB_ID = '31167755ed688015a5c4f09e04cd65f5';
  const notionHeaders = {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
  };

  try {
    // Query last 4 pages sorted by Date desc
    const queryRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        sorts: [{ property: 'Date', direction: 'descending' }],
        page_size: 4,
      }),
    });
    if (!queryRes.ok) return '';

    const queryData = await queryRes.json();
    const pages: any[] = queryData.results || [];
    if (pages.length === 0) return '';

    const partes: string[] = [];
    partes.push('\n---\n\n## LLAMADAS CON PROPIETARIO — ÚLTIMAS 4 SEMANAS');

    for (const page of pages) {
      const dateRaw = page.properties?.Date?.date?.start || page.properties?.date?.date?.start || '';
      const titleArr = page.properties?.Name?.title || page.properties?.name?.title || [];
      const title = titleArr.map((t: any) => t.plain_text).join('') || 'Sin título';

      // Fetch page blocks
      const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
        headers: notionHeaders,
      });
      if (!blocksRes.ok) continue;

      const blocksData = await blocksRes.json();
      const blocks: any[] = blocksData.results || [];

      partes.push(`\n### ${dateRaw} — ${title}`);

      const pendingItems: string[] = [];
      const summaryLines: string[] = [];

      for (const block of blocks) {
        if (block.type === 'to_do') {
          const text = block.to_do?.rich_text?.map((t: any) => t.plain_text).join('') || '';
          const checked = block.to_do?.checked ?? false;
          if (!checked && text) pendingItems.push(`- [ ] ${text}`);
        } else if (['paragraph', 'bulleted_list_item', 'numbered_list_item', 'heading_2', 'heading_3'].includes(block.type)) {
          const richText = block[block.type]?.rich_text || [];
          const text = richText.map((t: any) => t.plain_text).join('').trim();
          if (text) summaryLines.push(text);
        }
      }

      if (pendingItems.length > 0) {
        partes.push('Compromisos pendientes:');
        partes.push(...pendingItems);
      }
      if (summaryLines.length > 0) {
        partes.push(`Temas discutidos: ${summaryLines.slice(0, 5).join(' / ')}`);
      }
    }

    return partes.join('\n');
  } catch {
    return '';
  }
}

// ============================================================================
// FUNCIONES DE FORMATEO DE DATOS PARA EL PROMPT
// ============================================================================

function formatearDatosParaPrompt(datos: any, historicoCtx = '', notionCtx = ''): string {
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

  // Include fallas/permisos details if provided
  if (datos.personal.detalleFallas?.length > 0) {
    partes.push(`### DETALLE DE FALLAS`);
    datos.personal.detalleFallas.forEach((falla: any) => {
      partes.push(`- ${falla.empleado}${falla.razon ? `: ${falla.razon}` : ''}`);
    });
  }

  if (datos.personal.detallePermisos?.length > 0) {
    partes.push(`### DETALLE DE PERMISOS`);
    datos.personal.detallePermisos.forEach((permiso: any) => {
      partes.push(`- ${permiso.empleado}${permiso.razon ? `: ${permiso.razon}` : ''}`);
    });
  }

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
      const tipoTarea = labor.tipoTarea || labor.tipo || 'Sin tipo';
      const lotesStr = (labor.lotes || []).join(', ') || 'Sin lotes';
      partes.push(`### ${labor.nombre} (${tipoTarea})
- Estado: ${labor.estado}
- Fechas: ${labor.fechaInicio} → ${labor.fechaFin}
- Lotes: ${lotesStr}`);
    });
  }

  // Aplicaciones cerradas (resumen)
  if (datos.aplicaciones?.cerradas?.length > 0) {
    partes.push(`## APLICACIONES CERRADAS ESTA SEMANA`);
    datos.aplicaciones.cerradas.forEach((app: any) => {
      const canecasDev = app.general?.canecasBultosDesviacion ?? null;
      const costoDev = app.general?.costoDesviacion ?? null;
      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Canecas/Bultos planeadas: ${app.general?.canecasBultosPlaneados ?? 'N/A'}, reales: ${app.general?.canecasBultosReales ?? 'N/A'}${canecasDev !== null ? `, desviación: ${canecasDev}%` : ''}
- Costo planeado: $${Math.round(app.general?.costoPlaneado || 0).toLocaleString('es-CO')}, real: $${Math.round(app.general?.costoReal || 0).toLocaleString('es-CO')}${costoDev !== null ? `, desviación: ${costoDev}%` : ''}`);
    });
  }

  if (datos.aplicaciones?.planeadas?.length > 0) {
    partes.push(`## APLICACIONES PLANEADAS`);
    datos.aplicaciones.planeadas.forEach((app: any) => {
      const costoTotal = app.costoTotalEstimado || 0;
      const costoPorLitroKg = app.costoPorLitroKg || 0;
      const costoPorArbol = app.costoPorArbol || 0;

      partes.push(`### ${app.nombre} (${app.tipo})
- Propósito: ${app.proposito}
- Blancos biológicos: ${app.blancosBiologicos?.join(', ') || 'N/A'}
- Fecha planeada: ${app.fechaInicioPlaneada}
- Costo total (Pedido + Inventario): $${Math.round(costoTotal).toLocaleString('es-CO')} COP
- Costo por litro/kg: ${costoPorLitroKg > 0 ? '$' + Math.round(costoPorLitroKg).toLocaleString('es-CO') : '—'}
- Costo por árbol: ${costoPorArbol > 0 ? '$' + Math.round(costoPorArbol).toLocaleString('es-CO') : '—'}
- Lista de compras:`);

      if (app.listaCompras?.length > 0) {
        app.listaCompras.forEach((item: any) => {
          const costoItem = item.costoEstimado || 0;
          const invDisplay = item.inventarioDisponible > 0 ? ` (Inv: ${item.inventarioDisponible})` : '';
          partes.push(`  - ${item.productoNombre}: ${item.cantidadNecesaria} ${item.unidad}${invDisplay}${costoItem > 0 ? ' ~$' + Math.round(costoItem).toLocaleString('es-CO') : ''}`);
        });
      }
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
    const mon = datos.monitoreo;
    const fechaInfo = mon.fechaActual
      ? `Observación principal: ${mon.fechaActual}${mon.fechaAnterior ? ` · Referencia: ${mon.fechaAnterior}` : ''}`
      : 'Sin monitoreos recientes';
    partes.push(`## MONITOREO FITOSANITARIO
${fechaInfo}${mon.avisoFechaDesactualizada ? `\n⚠ ${mon.avisoFechaDesactualizada}` : ''}`);

    // Resumen global
    if (mon.resumenGlobal && mon.resumenGlobal.length > 0) {
      partes.push(`### Resumen general de incidencia`);
      mon.resumenGlobal.forEach((r: any) => {
        const rango = r.minLote !== null ? `(rango: ${r.minLote}%-${r.maxLote}%)` : '';
        const tend = r.tendencia !== 'sin_referencia' && r.promedioAnterior !== null
          ? ` — tendencia: ${r.tendencia} (era ${r.promedioAnterior}%)`
          : '';
        partes.push(`  - ${r.plagaNombre}: ${r.promedioActual !== null ? r.promedioActual + '%' : 'Sin datos'} ${rango}${tend}`);
      });
    }

    // Detalle por lote
    if (mon.vistasPorLote && mon.vistasPorLote.length > 0) {
      partes.push(`### Detalle por lote`);
      mon.vistasPorLote.forEach((lote: any) => {
        if (lote.sinDatos) {
          partes.push(`  ${lote.loteNombre}: Sin monitoreo`);
        } else {
          partes.push(`  ${lote.loteNombre}:`);
          (lote.plagas || []).forEach((p: any) => {
            const tend = p.tendencia !== 'sin_referencia' && p.anterior !== null ? ` (${p.tendencia}, era ${p.anterior}%)` : '';
            partes.push(`    - ${p.plagaNombre}: ${p.actual !== null ? p.actual + '%' : 'Sin datos'}${tend}`);
          });
        }
      });
    }

    // Legacy detail for compatibility
    if (mon.detallePorLote && mon.detallePorLote.length > 0) {
      partes.push(`### Detalle granular por sublote (monitoreo más reciente)`);
      mon.detallePorLote.forEach((lote: any) => {
        partes.push(`  ${lote.loteNombre}:`);
        (lote.sublotes || []).forEach((s: any) => {
          partes.push(`    - ${s.subloteNombre} | ${s.plagaNombre}: ${s.incidencia}% (${s.gravedad}) [${s.arboresAfectados}/${s.arboresMonitoreados} árboles]`);
        });
      });
    }

    if (mon.insights && mon.insights.length > 0) {
      partes.push(`### Alertas e insights automáticos`);
      mon.insights.forEach((insight: any) => {
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

  if (historicoCtx) {
    partes.push(historicoCtx);
  }

  if (notionCtx) {
    partes.push(notionCtx);
  }

  return partes.join('\n\n');
}

// ============================================================================
// LLAMADA A GEMINI
// ============================================================================

async function llamarLLM(datosFormateados: string, instruccionesAdicionales?: string): Promise<{ analisis: AnalisisGemini; tokens: number }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no está configurada en las variables de entorno');
  }

  const model = 'deepseek/deepseek-v3.2';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const userMessage = instruccionesAdicionales
    ? `${datosFormateados}\n\n## INSTRUCCIONES ADICIONALES DEL USUARIO\n${instruccionesAdicionales}`
    : datosFormateados;

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Analiza estos datos operativos semanales y genera el JSON de análisis:\n\n${userMessage}` },
    ],
    temperature: 0.3,
    max_tokens: 4096,
    top_p: 0.8,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('La API no respondió en 50 segundos. Intenta de nuevo.');
    }
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API error:', response.status, errorText.slice(0, 500));
    throw new Error(`Error de OpenRouter API (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  const choice = result.choices?.[0];
  if (!choice) {
    console.error('OpenRouter response has no choices:', JSON.stringify(result).slice(0, 500));
    throw new Error('La API no retornó respuesta. Posible error de contenido o límite.');
  }

  const finishReason = choice.finish_reason;
  console.log('LLM finishReason:', finishReason);

  if (finishReason === 'content_filter') {
    throw new Error('La API bloqueó la respuesta por filtros de contenido.');
  }

  const text = choice.message?.content || '';

  if (!text) {
    throw new Error('La API no generó contenido de texto en la respuesta.');
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
    console.error('Failed to parse LLM JSON:', jsonText.slice(0, 300));
    analisis = {
      resumen_ejecutivo: 'Semana operativa procesada. Consulte los datos del reporte para detalles específicos.',
      conclusiones: [
        { icono: '📊', texto: 'Revisar los indicadores detallados en las secciones del reporte', prioridad: 'media' as const, contexto: '' },
        { icono: '📋', texto: 'Verificar el avance de las aplicaciones en curso', prioridad: 'media' as const, contexto: '' },
        { icono: '🌱', texto: 'Monitorear la evolución fitosanitaria en la próxima semana', prioridad: 'media' as const, contexto: '' },
      ],
      interpretacion_monitoreo: 'Consulte la sección de monitoreo para detalles sobre las tendencias fitosanitarias.',
      interpretacion_tendencias_monitoreo: 'Sin análisis disponible para esta semana.',
    };
  }

  if (!analisis.resumen_ejecutivo) analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [{ icono: '📊', texto: 'Revisar los indicadores del reporte', prioridad: 'media', contexto: '' }];
  }
  if (!analisis.interpretacion_monitoreo) analisis.interpretacion_monitoreo = '';
  if (!analisis.interpretacion_tendencias_monitoreo) analisis.interpretacion_tendencias_monitoreo = '';

  const tokens = result.usage?.total_tokens || 0;
  console.log('LLM response: analysis parsed, tokens:', tokens);

  return { analisis, tokens };
}

// ============================================================================
// DESIGN SYSTEM - Paleta Escocia OS
// ============================================================================

const DS = {
  // Colores principales
  primary: '#73991C',
  primaryDark: '#5f7d17',
  primaryLight: '#8DB440',
  secondary: '#BFD97D',
  secondaryLight: '#E8F0D0',
  
  // Fondos
  background: '#F8FAF5',
  card: '#FFFFFF',
  muted: '#F5F9EE',
  
  // Texto
  foreground: '#172E08',
  mutedForeground: '#6B7280',
  brandBrown: '#4D240F',
  
  // Estados
  success: '#2E7D32',
  successBg: '#E8F5E9',
  warning: '#F57F17',
  warningBg: '#FFF8E1',
  destructive: '#C62828',
  destructiveBg: '#FFEBEE',
  
  // Bordes
  border: 'rgba(115, 153, 28, 0.12)',
  borderStrong: 'rgba(115, 153, 28, 0.25)',
};

// ============================================================================
// HELPERS
// ============================================================================

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '0';
  return n.toFixed(decimals);
}
function getHeatmapColor(value: number, maxValue: number): string {
  if (value === 0 || maxValue === 0) return DS.card;
  const intensity = Math.min(value / maxValue, 1);
  if (intensity < 0.25) return '#F5F9EE';
  if (intensity < 0.5) return '#E8F0D0';
  if (intensity < 0.75) return '#BFD97D';
  return DS.primaryLight;
}
function getTextColorForHeatmap(value: number, maxValue: number): string {
  if (maxValue === 0) return DS.brandBrown;
  return (value / maxValue) > 0.65 ? '#FFFFFF' : DS.brandBrown;
}
function getIncidenciaColor(inc: number | null): string {
  if (inc === null || inc === 0) return DS.card;
  if (inc < 10) return DS.successBg;
  if (inc < 20) return DS.warningBg;
  return DS.destructiveBg;
}
function getDesvColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 10) return DS.successBg;
  if (abs <= 20) return DS.warningBg;
  return DS.destructiveBg;
}
function getDesvTextColor(pct: number): string {
  const abs = Math.abs(pct);
  if (abs <= 10) return DS.success;
  if (abs <= 20) return DS.warning;
  return DS.destructive;
}
function getBadgeHTML(texto: string, tipo: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    Alta: { bg: DS.destructiveBg, text: DS.destructive },
    Media: { bg: DS.warningBg, text: DS.warning },
    Baja: { bg: DS.successBg, text: DS.success },
  };
  const c = colors[tipo] || colors['Baja'];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600;background:${c.bg};color:${c.text};">${texto}</span>`;
}
function getInsightStyles(tipo: string): { border: string; bg: string; icon: string } {
  if (tipo === 'urgente') return { border: DS.destructive, bg: DS.destructiveBg, icon: '🔴' };
  if (tipo === 'atencion') return { border: DS.warning, bg: DS.warningBg, icon: '⚠️' };
  return { border: DS.primary, bg: DS.muted, icon: '✅' };
}
// --- Helpers for trend arrows ---
function getTendenciaArrow(tendencia: string): string {
  switch (tendencia) {
    case 'subiendo': return '↑';
    case 'bajando': return '↓';
    case 'estable': return '→';
    default: return '';
  }
}

function getTendenciaColor(tendencia: string): string {
  switch (tendencia) {
    case 'subiendo': return DS.destructive; // red — increasing is bad
    case 'bajando': return DS.success;      // green — decreasing is good
    case 'estable': return DS.warning;      // yellow
    default: return DS.mutedForeground;
  }
}

function formatTendenciaCell(actual: number | null, anterior: number | null, tendencia: string): string {
  if (actual === null) return `<span style="color:${DS.mutedForeground};">Sin datos</span>`;
  const arrow = getTendenciaArrow(tendencia);
  const color = getTendenciaColor(tendencia);
  if (anterior === null || tendencia === 'sin_referencia') {
    return `<span style="font-weight:700;">${formatNum(actual, 1)}%</span>`;
  }
  return `<span style="font-weight:700;">${formatNum(actual, 1)}%</span> <span style="color:${color};font-weight:600;">${arrow}</span><span style="color:${DS.mutedForeground};font-size:0.85em;">(era ${formatNum(anterior, 1)}%)</span>`;
}

function monitoreoLeyendaHTML(): string {
  return `<div style="margin-top:clamp(8px, 1.2vw, 12px);display:flex;gap:clamp(8px, 1.2vw, 12px);align-items:center;flex-wrap:wrap;">
    <span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};font-weight:600;">LEYENDA INCIDENCIA:</span>
    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:${DS.card};border:1px solid ${DS.border};border-radius:3px;"></span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">0%</span></span>
    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:${DS.successBg};border-radius:3px;"></span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">&lt;10%</span></span>
    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:${DS.warningBg};border-radius:3px;"></span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">&lt;20%</span></span>
    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:12px;height:12px;background:${DS.destructiveBg};border-radius:3px;"></span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">≥20%</span></span>
    <span style="display:inline-flex;align-items:center;gap:6px;margin-left:clamp(8px, 1.2vw, 12px);"><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};font-weight:600;">TENDENCIA:</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="color:${DS.destructive};font-weight:700;">↑</span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">Subiendo</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="color:${DS.success};font-weight:700;">↓</span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">Bajando</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="color:${DS.warning};font-weight:700;">→</span><span style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">Estable</span></span>
  </div>`;
}

function slideHeader(seccion: string, titulo: string, semana: any): string {
  return `<div style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);height:52px;display:flex;align-items:center;padding:0 24px;justify-content:space-between;flex-shrink:0;">
    <span style="background:rgba(255,255,255,0.2);color:#FFFFFF;font-size:10px;font-weight:700;padding:4px 12px;border-radius:6px;text-transform:uppercase;letter-spacing:0.5px;">${seccion}</span>
    <span style="color:#FFFFFF;font-size:16px;font-weight:700;letter-spacing:-0.02em;">${titulo}</span>
    <div style="text-align:right;"><div style="color:${DS.secondaryLight};font-size:11px;font-weight:600;">ESCOCIA HASS · S${semana.numero}/${semana.ano}</div><div style="color:${DS.secondaryLight};font-size:10px;opacity:0.85;">${semana.inicio} — ${semana.fin}</div></div>
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

  const kpis = [
    { label: 'Jornales', value: formatNum(totalJornales, 1), sub: 'trabajados', color: DS.primary, icon: '📊' },
    { label: 'Costo Total', value: formatCOP(costoTotal), sub: 'mano de obra', color: DS.primaryDark, icon: '💰' },
    { label: 'Trabajadores', value: String(trabajadores), sub: `${personal?.empleados || 0} emp · ${personal?.contratistas || 0} cont`, color: DS.primary, icon: '👥' },
    { label: 'Aplicaciones', value: String(appsActivas), sub: 'en ejecución', color: DS.warning, icon: '🌿' },
    { label: 'Alertas', value: String(alertas), sub: 'fitosanitarias', color: alertas > 0 ? DS.destructive : DS.success, icon: alertas > 0 ? '⚠️' : '✅' },
  ];

  return `<div class="slide">
  <div style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);height:180px;display:flex;flex-direction:column;justify-content:center;padding:0 clamp(24px, 4vw, 48px);flex-shrink:0;">
    <div style="font-size:clamp(28px, 5vw, 42px);font-weight:900;color:#FFFFFF;letter-spacing:1px;line-height:1;">ESCOCIA HASS</div>
    <div style="font-size:clamp(14px, 2.5vw, 18px);font-weight:600;color:${DS.secondaryLight};margin-top:8px;">Informe Semanal — Semana ${semana.numero}/${semana.ano}</div>
    <div style="font-size:clamp(11px, 1.5vw, 13px);color:${DS.secondary};margin-top:4px;">${semana.inicio} — ${semana.fin}</div>
  </div>
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(16px, 2.5vw, 24px);gap:clamp(12px, 2vw, 20px);overflow:hidden;">
    <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:clamp(8px, 1.5vw, 14px);">
      ${kpis.map(k => `<div style="background:${DS.card};border-radius:12px;padding:clamp(12px, 2vw, 18px) clamp(8px, 1.5vw, 14px);text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1px solid ${DS.border};position:relative;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${k.color};"></div>
        <div style="font-size:clamp(10px, 1.2vw, 12px);margin-bottom:4px;">${k.icon}</div>
        <div style="font-size:clamp(20px, 3vw, 28px);font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
        <div style="font-size:clamp(10px, 1.2vw, 12px);font-weight:700;color:${DS.brandBrown};margin-top:4px;">${k.label}</div>
        <div style="font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};margin-top:2px;">${k.sub}</div>
      </div>`).join('')}
    </div>
    <div style="flex:1;background:${DS.muted};border-radius:12px;padding:clamp(14px, 2vw, 20px);border-left:4px solid ${DS.primary};display:flex;flex-direction:column;min-height:0;">
      <div style="font-size:clamp(10px, 1.2vw, 11px);font-weight:800;color:${DS.primary};letter-spacing:0.5px;margin-bottom:clamp(6px, 1vw, 10px);text-transform:uppercase;">Resumen Ejecutivo</div>
      <div style="font-size:clamp(12px, 1.5vw, 14px);color:${DS.brandBrown};line-height:1.6;overflow:hidden;">${analisis.resumen_ejecutivo}</div>
    </div>
  </div>
</div>`;
}

function construirSlidePersonal(datos: any): string {
  const { semana, personal } = datos;
  const p = personal || {};
  const jornalesTrabajados = datos.jornales?.totalGeneral?.jornales || 0;
  const jornalesPosibles = (p.totalTrabajadores || 0) * 5;
  const eficiencia = jornalesPosibles > 0 ? Math.round((jornalesTrabajados / jornalesPosibles) * 100) : 0;
  const eficienciaColor = eficiencia >= 90 ? DS.success : eficiencia >= 70 ? DS.warning : DS.destructive;

  const kpisRow1 = [
    { label: 'Trabajadores', value: String(p.totalTrabajadores || 0), color: DS.primary, icon: '👥' },
    { label: 'Fallas', value: String(p.fallas || 0), color: (p.fallas || 0) > 0 ? DS.destructive : DS.success, icon: '❌' },
    { label: 'Permisos', value: String(p.permisos || 0), color: (p.permisos || 0) > 0 ? DS.warning : DS.success, icon: '📋' },
    { label: 'Eficiencia', value: `${eficiencia}%`, color: eficienciaColor, icon: '📈' },
  ];

  const kpisRow2 = [
    { label: 'Ingresos', value: String(p.ingresos || 0), color: DS.success, icon: '➕' },
    { label: 'Retiros', value: String(p.retiros || 0), color: (p.retiros || 0) > 0 ? DS.destructive : DS.mutedForeground, icon: '➖' },
    { label: 'Jornales', value: formatNum(jornalesTrabajados, 1), color: DS.primary, icon: '⏱️' },
    { label: 'Posibles', value: String(jornalesPosibles), color: DS.mutedForeground, icon: '📅' },
  ];

  const makeKpiCard = (k: any) => `<div style="flex:1;background:${DS.card};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);box-shadow:0 1px 4px rgba(0,0,0,0.05);border:1px solid ${DS.border};text-align:center;position:relative;">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${k.color};border-radius:10px 10px 0 0;"></div>
    <div style="font-size:clamp(8px, 1vw, 10px);margin-bottom:2px;">${k.icon}</div>
    <div style="font-size:clamp(18px, 2.5vw, 24px);font-weight:800;color:${k.color};line-height:1;">${k.value}</div>
    <div style="font-size:clamp(9px, 1vw, 11px);font-weight:600;color:${DS.brandBrown};margin-top:2px;">${k.label}</div>
  </div>`;

  let fallasTable = '';
  if (p.detalleFallas?.length > 0) {
    fallasTable = `<div style="background:${DS.card};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border:1px solid ${DS.border};height:100%;">
      <div style="font-size:clamp(10px, 1.2vw, 11px);font-weight:700;color:${DS.destructive};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">❌ Fallas (${p.detalleFallas.length})</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:${DS.destructiveBg};">
          <th style="padding:6px 10px;font-size:clamp(9px, 1vw, 10px);font-weight:700;color:${DS.destructive};text-align:left;border-radius:6px 0 0 0;">Empleado</th>
          <th style="padding:6px 10px;font-size:clamp(9px, 1vw, 10px);font-weight:700;color:${DS.destructive};text-align:left;border-radius:0 6px 0 0;">Motivo</th>
        </tr></thead>
        <tbody>${p.detalleFallas.slice(0, 5).map((f: any, i: number) => `<tr style="background:${i % 2 === 0 ? DS.card : DS.muted};"><td style="padding:5px 10px;font-size:clamp(10px, 1.1vw, 11px);color:${DS.brandBrown};">${f.empleado || f.nombre || '—'}</td><td style="padding:5px 10px;font-size:clamp(10px, 1.1vw, 11px);color:${DS.mutedForeground};">${f.razon || f.motivo || '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  let permisosTable = '';
  if (p.detallePermisos?.length > 0) {
    permisosTable = `<div style="background:${DS.card};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border:1px solid ${DS.border};height:100%;">
      <div style="font-size:clamp(10px, 1.2vw, 11px);font-weight:700;color:${DS.warning};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">📋 Permisos (${p.detallePermisos.length})</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:${DS.warningBg};">
          <th style="padding:6px 10px;font-size:clamp(9px, 1vw, 10px);font-weight:700;color:${DS.warning};text-align:left;border-radius:6px 0 0 0;">Empleado</th>
          <th style="padding:6px 10px;font-size:clamp(9px, 1vw, 10px);font-weight:700;color:${DS.warning};text-align:left;border-radius:0 6px 0 0;">Motivo</th>
        </tr></thead>
        <tbody>${p.detallePermisos.slice(0, 5).map((f: any, i: number) => `<tr style="background:${i % 2 === 0 ? DS.card : DS.muted};"><td style="padding:5px 10px;font-size:clamp(10px, 1.1vw, 11px);color:${DS.brandBrown};">${f.empleado || f.nombre || '—'}</td><td style="padding:5px 10px;font-size:clamp(10px, 1.1vw, 11px);color:${DS.mutedForeground};">${f.razon || f.motivo || '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  const showTables = (p.detalleFallas?.length > 0 || p.detallePermisos?.length > 0);

  return `<div class="slide page-break">
  ${slideHeader('PERSONAL', 'Resumen de Personal', semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(14px, 2vw, 20px);gap:clamp(10px, 1.5vw, 16px);overflow:hidden;">
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:clamp(8px, 1.2vw, 12px);">${kpisRow1.map(makeKpiCard).join('')}</div>
    <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:clamp(8px, 1.2vw, 12px);">${kpisRow2.map(makeKpiCard).join('')}</div>
    ${showTables ? `<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:clamp(12px, 2vw, 20px);min-height:0;">
      <div>${fallasTable || `<div style="background:${DS.successBg};border-radius:10px;padding:20px;text-align:center;height:100%;display:flex;align-items:center;justify-content:center;"><span style="color:${DS.success};font-weight:600;">✅ Sin fallas esta semana</span></div>`}</div>
      <div>${permisosTable || `<div style="background:${DS.muted};border-radius:10px;padding:20px;text-align:center;height:100%;display:flex;align-items:center;justify-content:center;"><span style="color:${DS.mutedForeground};font-weight:600;">Sin permisos registrados</span></div>`}</div>
    </div>` : ''}
  </div>
</div>`;
}

function construirSlideLaboresProgramadas(datos: any): string {
  const programadas = datos.labores?.programadas || [];
  if (programadas.length === 0) return '';
  const { semana } = datos;

  const estadoConfig: Record<string, { bg: string; text: string; icon: string }> = {
    'Por iniciar': { bg: DS.muted, text: DS.mutedForeground, icon: '⏳' },
    'En proceso': { bg: DS.warningBg, text: DS.warning, icon: '🔄' },
    'Terminada': { bg: DS.successBg, text: DS.success, icon: '✅' },
  };

  const rows = programadas.slice(0, 8).map((l: any, i: number) => {
    const est = estadoConfig[l.estado] || estadoConfig['Por iniciar'];
    const lotesArr = l.lotes || [];
    const lotesDisplay = lotesArr.length > 3 ? `${lotesArr.slice(0, 3).join(', ')}...+${lotesArr.length - 3}` : lotesArr.join(', ');
    
    return `<tr style="background:${i % 2 === 0 ? DS.card : DS.muted};">
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(10px, 1.2vw, 12px);font-weight:700;color:${DS.primary};">${l.codigoTarea || l.codigo || '—'}</td>
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(10px, 1.2vw, 12px);font-weight:600;color:${DS.brandBrown};">${l.nombre}</td>
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.mutedForeground};">${l.tipoTarea || l.tipo || '—'}</td>
      <td style="padding:clamp(6px, 1vw, 10px);"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:clamp(9px, 1vw, 11px);font-weight:600;background:${est.bg};color:${est.text};">${est.icon} ${l.estado}</span></td>
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.mutedForeground};">${l.fechaInicio || '—'}</td>
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.mutedForeground};">${l.fechaFin || '—'}</td>
      <td style="padding:clamp(6px, 1vw, 10px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.mutedForeground};max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lotesDisplay || '—'}</td>
    </tr>`;
  }).join('');

  const totalProgramadas = programadas.length;
  const terminadas = programadas.filter((l: any) => l.estado === 'Terminada').length;
  const enProceso = programadas.filter((l: any) => l.estado === 'En proceso').length;

  return `<div class="slide page-break">
  ${slideHeader('LABORES', 'Labores Programadas', semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(14px, 2vw, 20px);gap:clamp(10px, 1.5vw, 14px);overflow:hidden;">
    <div style="display:flex;gap:clamp(8px, 1.2vw, 12px);">
      <div style="background:${DS.card};border-radius:8px;padding:clamp(8px, 1.2vw, 12px) clamp(14px, 2vw, 20px);border:1px solid ${DS.border};display:flex;align-items:center;gap:10px;">
        <span style="font-size:clamp(18px, 2.5vw, 24px);font-weight:800;color:${DS.primary};">${totalProgramadas}</span>
        <span style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};font-weight:600;">Total</span>
      </div>
      <div style="background:${DS.successBg};border-radius:8px;padding:clamp(8px, 1.2vw, 12px) clamp(14px, 2vw, 20px);display:flex;align-items:center;gap:10px;">
        <span style="font-size:clamp(18px, 2.5vw, 24px);font-weight:800;color:${DS.success};">${terminadas}</span>
        <span style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.success};font-weight:600;">Terminadas</span>
      </div>
      <div style="background:${DS.warningBg};border-radius:8px;padding:clamp(8px, 1.2vw, 12px) clamp(14px, 2vw, 20px);display:flex;align-items:center;gap:10px;">
        <span style="font-size:clamp(18px, 2.5vw, 24px);font-weight:800;color:${DS.warning};">${enProceso}</span>
        <span style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.warning};font-weight:600;">En Proceso</span>
      </div>
    </div>
    <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;display:flex;flex-direction:column;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Código</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Nombre</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Tipo</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Estado</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Inicio</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Fin</th>
          <th style="padding:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Lotes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
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

  // Limit table size for viewport fit
  const visibleLotes = lotes.slice(0, 7);
  const visibleActs = actividades.slice(0, 6);

  let headerCells = `<th style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:left;">Actividad</th>`;
  for (const lote of visibleLotes) {
    headerCells += `<th style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">${lote}</th>`;
  }
  headerCells += `<th style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;background:${DS.primaryDark};">Total</th>`;

  let bodyRows = '';
  for (const act of visibleActs) {
    let cells = '';
    for (const lote of visibleLotes) {
      const val = matrizDatos[act]?.[lote]?.jornales || 0;
      const bg = getHeatmapColor(val, maxVal);
      const tc = getTextColorForHeatmap(val, maxVal);
      cells += `<td style="padding:clamp(5px, 0.8vw, 7px);text-align:center;font-size:clamp(9px, 1vw, 11px);font-weight:600;background:${bg};color:${tc};">${val > 0 ? formatNum(val) : '—'}</td>`;
    }
    const tot = totalesPorActividad[act]?.jornales || 0;
    cells += `<td style="padding:clamp(5px, 0.8vw, 7px);text-align:center;font-size:clamp(9px, 1vw, 11px);font-weight:700;background:${DS.secondaryLight};color:${DS.brandBrown};">${formatNum(tot)}</td>`;
    bodyRows += `<tr><td style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 10px);font-size:clamp(9px, 1vw, 11px);font-weight:600;color:${DS.brandBrown};background:${DS.muted};">${act}</td>${cells}</tr>`;
  }

  let totalCells = '';
  for (const lote of visibleLotes) {
    const val = totalesPorLote[lote]?.jornales || 0;
    totalCells += `<td style="padding:clamp(5px, 0.8vw, 7px);text-align:center;font-size:clamp(9px, 1vw, 11px);font-weight:700;background:${DS.secondaryLight};color:${DS.brandBrown};">${formatNum(val)}</td>`;
  }
  totalCells += `<td style="padding:clamp(5px, 0.8vw, 7px);text-align:center;font-size:clamp(11px, 1.3vw, 13px);font-weight:900;background:${DS.primary};color:#FFFFFF;">${formatNum(totalGeneral.jornales)}</td>`;
  bodyRows += `<tr style="background:${DS.secondaryLight};"><td style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 10px);font-size:clamp(9px, 1vw, 11px);font-weight:800;color:${DS.primary};">TOTAL</td>${totalCells}</tr>`;

  // Bar charts side by side
  const actOrden = [...actividades].sort((a: string, b: string) => (totalesPorActividad[b]?.jornales || 0) - (totalesPorActividad[a]?.jornales || 0));
  const loteOrden = [...lotes].sort((a: string, b: string) => (totalesPorLote[b]?.jornales || 0) - (totalesPorLote[a]?.jornales || 0));
  const maxAct = Math.max(...actOrden.map((a: string) => totalesPorActividad[a]?.jornales || 0), 1);
  const maxLote = Math.max(...loteOrden.map((l: string) => totalesPorLote[l]?.jornales || 0), 1);

  const barAct = actOrden.slice(0, 5).map((act: string) => {
    const v = totalesPorActividad[act]?.jornales || 0;
    const pct = (v / maxAct) * 100;
    return `<div style="display:flex;align-items:center;margin-bottom:clamp(4px, 0.6vw, 6px);">
      <div style="width:clamp(80px, 12vw, 120px);font-size:clamp(8px, 0.9vw, 10px);font-weight:600;color:${DS.brandBrown};text-align:right;padding-right:8px;flex-shrink:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${act}</div>
      <div style="flex:1;background:${DS.border};border-radius:4px;height:clamp(14px, 2vw, 20px);position:relative;overflow:hidden;">
        <div style="background:${DS.primary};height:100%;border-radius:4px;width:${Math.max(pct, 2)}%;"></div>
        <span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:clamp(8px, 0.9vw, 10px);font-weight:600;color:${pct > 35 ? '#FFF' : DS.brandBrown};">${formatNum(v, 1)}</span>
      </div>
    </div>`;
  }).join('');

  const barLote = loteOrden.slice(0, 6).map((lote: string) => {
    const v = totalesPorLote[lote]?.jornales || 0;
    const pct = (v / maxLote) * 100;
    return `<div style="display:flex;align-items:center;margin-bottom:clamp(4px, 0.6vw, 6px);">
      <div style="width:clamp(60px, 10vw, 90px);font-size:clamp(8px, 0.9vw, 10px);font-weight:600;color:${DS.brandBrown};text-align:right;padding-right:8px;flex-shrink:0;">${lote}</div>
      <div style="flex:1;background:${DS.border};border-radius:4px;height:clamp(14px, 2vw, 20px);position:relative;overflow:hidden;">
        <div style="background:${DS.primaryLight};height:100%;border-radius:4px;width:${Math.max(pct, 2)}%;"></div>
        <span style="position:absolute;left:6px;top:50%;transform:translateY(-50%);font-size:clamp(8px, 0.9vw, 10px);font-weight:600;color:${pct > 35 ? '#FFF' : DS.brandBrown};">${formatNum(v, 1)}</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('LABORES', 'Distribución de Jornales', semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(12px, 1.8vw, 16px);gap:clamp(10px, 1.5vw, 14px);overflow:hidden;">
    <div style="background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div style="display:flex;gap:clamp(16px, 2.5vw, 24px);">
      <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};padding:clamp(10px, 1.5vw, 14px);">
        <div style="font-size:clamp(10px, 1.2vw, 12px);font-weight:700;color:${DS.primary};margin-bottom:clamp(6px, 1vw, 10px);">📊 Por Actividad</div>
        ${barAct}
      </div>
      <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};padding:clamp(10px, 1.5vw, 14px);">
        <div style="font-size:clamp(10px, 1.2vw, 12px);font-weight:700;color:${DS.primaryLight};margin-bottom:clamp(6px, 1vw, 10px);">📍 Por Lote</div>
        ${barLote}
      </div>
    </div>
  </div>
</div>`;
}


function construirSlideCierreGeneral(app: any, semana: any): string {
  const general = app.general || {};
  const canecasPlan = general.canecasBultosPlaneados ?? 0;
  const canecasReal = general.canecasBultosReales ?? 0;
  const canecasDesv = general.canecasBultosDesviacion ?? 0;
  
  const costoPlan = general.costoPlaneado || 0;
  const costoReal = general.costoReal || 0;
  const costoDesv = general.costoDesviacion || 0;
  
  const unidadCan = general.unidad || 'und';
  const dias = app.diasEjecucion || '—';
  const tipoLabel = app.tipo || '—';

  const kpiCard = (label: string, icon: string, plan: any, real: any, desv: number, fmt: (v: any) => string, unit: string) => {
    const desvColor = getDesvTextColor(desv);
    const desvBg = getDesvColor(desv);
    return `<div style="flex:1;background:${DS.card};border-radius:12px;border:1px solid ${DS.border};padding:clamp(12px, 1.8vw, 18px);box-shadow:0 2px 8px rgba(0,0,0,0.04);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:clamp(10px, 1.5vw, 14px);">
        <span style="font-size:clamp(14px, 2vw, 18px);">${icon}</span>
        <span style="font-size:clamp(11px, 1.3vw, 13px);font-weight:700;color:${DS.mutedForeground};text-transform:uppercase;letter-spacing:0.3px;">${label}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:clamp(8px, 1.2vw, 12px);">
        <div style="text-align:center;padding:clamp(8px, 1.2vw, 12px);background:${DS.muted};border-radius:8px;">
          <div style="font-size:clamp(8px, 1vw, 10px);color:${DS.mutedForeground};font-weight:600;margin-bottom:4px;">PLAN</div>
          <div style="font-size:clamp(16px, 2.2vw, 22px);font-weight:800;color:${DS.brandBrown};">${fmt(plan)}</div>
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${DS.mutedForeground};">${unit}</div>
        </div>
        <div style="text-align:center;padding:clamp(8px, 1.2vw, 12px);background:${DS.muted};border-radius:8px;">
          <div style="font-size:clamp(8px, 1vw, 10px);color:${DS.mutedForeground};font-weight:600;margin-bottom:4px;">REAL</div>
          <div style="font-size:clamp(16px, 2.2vw, 22px);font-weight:800;color:${DS.primary};">${fmt(real)}</div>
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${DS.mutedForeground};">${unit}</div>
        </div>
        <div style="text-align:center;padding:clamp(8px, 1.2vw, 12px);background:${desvBg};border-radius:8px;">
          <div style="font-size:clamp(8px, 1vw, 10px);color:${desvColor};font-weight:600;margin-bottom:4px;">DESV.</div>
          <div style="font-size:clamp(16px, 2.2vw, 22px);font-weight:800;color:${desvColor};">${desv > 0 ? '+' : ''}${formatNum(desv, 1)}%</div>
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${desvColor};">vs plan</div>
        </div>
      </div>
    </div>`;
  };

  const fmt1 = (v: any) => v != null ? formatNum(Number(v), 1) : '—';
  const summaryRows = (app.kpiPorLote || []).slice(0, 8).map((lote: any, i: number) => {
    const fin = (app.financieroPorLote || [])[i] || {};
    const isTotal = lote.loteNombre === 'TOTAL';
    const rowBg = isTotal ? DS.secondaryLight : (i % 2 === 0 ? DS.card : DS.muted);
    const fontWeight = isTotal ? '700' : '400';

    return `<tr style="background:${rowBg};">
      <td style="padding:5px 8px;font-size:11px;font-weight:${isTotal ? '800' : '600'};color:${isTotal ? DS.primary : DS.brandBrown};">${lote.loteNombre}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:center;font-weight:${fontWeight};">${fmt1(lote.canecasPlaneadas)}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:center;font-weight:${fontWeight};">${fmt1(lote.canecasReales)}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:center;font-weight:600;background:${getDesvColor(lote.canecasDesviacion ?? 0)};color:${getDesvTextColor(lote.canecasDesviacion ?? 0)};">${lote.canecasDesviacion ?? '—'}%</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;font-weight:${fontWeight};">${formatCOP(fin.costoTotalPlaneado || 0)}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:right;font-weight:${fontWeight};">${formatCOP(fin.costoTotalReal || 0)}</td>
      <td style="padding:5px 6px;font-size:10px;text-align:center;font-weight:600;background:${getDesvColor(fin.costoTotalDesviacion ?? 0)};color:${getDesvTextColor(fin.costoTotalDesviacion ?? 0)};">${fin.costoTotalDesviacion ?? '—'}%</td>
    </tr>`;
  }).join('');

  // Insumos sidebar
  const insumos: any[] = app.listaInsumos || [];
  const insumosRows = insumos.slice(0, 8).map((ins: any, i: number) =>
    `<tr style="background:${i % 2 === 0 ? DS.card : DS.muted};">
      <td style="padding:4px 8px;font-size:10px;color:${DS.brandBrown};font-weight:500;">${ins.nombre}</td>
      <td style="padding:4px 6px;font-size:9px;color:${DS.mutedForeground};text-align:center;">${ins.categoria}</td>
    </tr>`
  ).join('');

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado General — ${app.nombre}`, semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:12px 16px;gap:10px;overflow:hidden;">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="display:inline-flex;align-items:center;gap:6px;padding:3px 12px;border-radius:8px;font-size:11px;font-weight:700;background:${DS.secondaryLight};color:${DS.primaryDark};">🌿 ${tipoLabel}</span>
      <span style="font-size:11px;color:${DS.mutedForeground};">📅 ${app.fechaInicio || '—'} → ${app.fechaFin || '—'}</span>
      <span style="font-size:11px;color:${DS.mutedForeground};">⏱️ ${dias} días</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${kpiCard('Canecas / Bultos', '📦', canecasPlan, canecasReal, canecasDesv, (v) => formatNum(Number(v), 1), unidadCan)}
      ${kpiCard('Costo Total', '💰', costoPlan, costoReal, costoDesv, formatCOP, 'COP')}
    </div>
    <div style="display:flex;flex:1;gap:12px;min-height:0;overflow:hidden;">
      ${summaryRows ? `<div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">
            <th style="padding:6px 8px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:left;">Lote</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Plan</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Real</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Desv%</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Costo Plan</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Costo Real</th>
            <th style="padding:6px;font-size:10px;font-weight:700;color:#FFFFFF;text-align:center;">Desv%</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>` : ''}
      <div style="flex:0 0 220px;display:flex;flex-direction:column;gap:8px;overflow:hidden;">
        ${app.proposito ? `<div style="background:${DS.muted};border-radius:8px;padding:8px 10px;border-left:3px solid ${DS.primary};">
          <div style="font-size:9px;font-weight:700;color:${DS.primary};text-transform:uppercase;margin-bottom:4px;">🎯 Objetivo</div>
          <div style="font-size:11px;color:${DS.brandBrown};line-height:1.4;">${app.proposito}</div>
        </div>` : ''}
        ${insumosRows ? `<div style="flex:1;background:${DS.card};border-radius:8px;border:1px solid ${DS.border};overflow:hidden;display:flex;flex-direction:column;">
          <div style="background:${DS.primary};padding:5px 8px;">
            <span style="font-size:10px;font-weight:700;color:#FFFFFF;">🧪 Insumos utilizados</span>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr style="background:${DS.muted};">
              <th style="padding:4px 8px;font-size:9px;font-weight:700;color:${DS.mutedForeground};text-align:left;">Producto</th>
              <th style="padding:4px 6px;font-size:9px;font-weight:700;color:${DS.mutedForeground};text-align:center;">Categoría</th>
            </tr></thead>
            <tbody>${insumosRows}</tbody>
          </table>
        </div>` : ''}
      </div>
    </div>
  </div>
</div>`;
}

function construirSlideCierreTecnico(app: any, semana: any): string {
  // Simplified table - key metrics only, max 6 rows
  const lotesData = app.kpiPorLote || [];
  const lotesRows = lotesData.slice(0, 6).map((lote: any, i: number) => {
    const isTotal = lote.loteNombre === 'TOTAL';
    const rowBg = isTotal ? DS.secondaryLight : (i % 2 === 0 ? DS.card : DS.muted);
    
    const canDesv = lote.canecasDesviacion ?? 0;
    const insDesv = lote.insumosDesviacion ?? 0;
    const jorDesv = lote.jornalesDesviacion ?? 0;
    
    return `<tr style="background:${rowBg};">
      <td style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 10px);font-size:clamp(9px, 1vw, 11px);font-weight:${isTotal ? '800' : '600'};color:${isTotal ? DS.primary : DS.brandBrown};">${lote.loteNombre}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.canecasPlaneadas != null ? formatNum(Number(lote.canecasPlaneadas), 1) : '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.canecasReales != null ? formatNum(Number(lote.canecasReales), 1) : '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:600;background:${getDesvColor(canDesv)};color:${getDesvTextColor(canDesv)};">${canDesv}%</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.insumosPlaneados ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.insumosReales ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:600;background:${getDesvColor(insDesv)};color:${getDesvTextColor(insDesv)};">${insDesv}%</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.jornalesPlaneados ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;">${lote.jornalesReales ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:600;background:${getDesvColor(jorDesv)};color:${getDesvTextColor(jorDesv)};">${jorDesv}%</td>
    </tr>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado Técnico — ${app.nombre}`, semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(12px, 1.8vw, 18px);gap:clamp(10px, 1.5vw, 14px);overflow:hidden;">
    <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;display:flex;flex-direction:column;min-height:0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">
            <th rowspan="2" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:left;border-right:1px solid rgba(255,255,255,0.2);">Lote</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;border-right:1px solid rgba(255,255,255,0.2);">📦 Canecas/Bultos</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;border-right:1px solid rgba(255,255,255,0.2);">🧪 Insumos (Kg/L)</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">⏱️ Jornales</th>
          </tr>
          <tr style="background:${DS.primary};">
            ${['Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv'].map(h => `<th style="padding:clamp(4px, 0.6vw, 6px);font-size:clamp(7px, 0.8vw, 9px);font-weight:600;color:#FFFFFF;text-align:center;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${lotesRows}</tbody>
      </table>
    </div>
    ${app.observaciones ? `<div style="background:${DS.muted};border-left:4px solid ${DS.primary};padding:clamp(10px, 1.5vw, 14px);border-radius:0 8px 8px 0;font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};line-height:1.5;">${app.observaciones}</div>` : ''}
  </div>
</div>`;
}

function construirSlideCierreFinanciero(app: any, semana: any): string {
  // Simplified table - only show Plan, Real, Desv for each cost category
  const lotesRows = (app.financieroPorLote || []).slice(0, 7).map((lote: any, i: number) => {
    const isTotal = lote.loteNombre === 'TOTAL';
    const rowBg = isTotal ? DS.secondaryLight : (i % 2 === 0 ? DS.card : DS.muted);
    const fontWeight = isTotal ? '700' : '400';
    
    return `<tr style="background:${rowBg};">
      <td style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 10px);font-size:clamp(9px, 1vw, 11px);font-weight:${isTotal ? '800' : '600'};color:${isTotal ? DS.primary : DS.brandBrown};">${lote.loteNombre}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${fontWeight};">${formatCOP(lote.costoInsumosPlaneado || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${fontWeight};">${formatCOP(lote.costoInsumosReal || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:600;background:${getDesvColor(lote.costoInsumosDesviacion ?? 0)};color:${getDesvTextColor(lote.costoInsumosDesviacion ?? 0)};">${lote.costoInsumosDesviacion ?? '—'}%</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${fontWeight};">${formatCOP(lote.costoManoObraPlaneado || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${fontWeight};">${formatCOP(lote.costoManoObraReal || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:600;background:${getDesvColor(lote.costoManoObraDesviacion ?? 0)};color:${getDesvTextColor(lote.costoManoObraDesviacion ?? 0)};">${lote.costoManoObraDesviacion ?? '—'}%</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${isTotal ? '800' : '600'};">${formatCOP(lote.costoTotalPlaneado || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:right;font-weight:${isTotal ? '800' : '600'};">${formatCOP(lote.costoTotalReal || 0)}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(8px, 0.9vw, 10px);text-align:center;font-weight:700;background:${getDesvColor(lote.costoTotalDesviacion ?? 0)};color:${getDesvTextColor(lote.costoTotalDesviacion ?? 0)};">${lote.costoTotalDesviacion ?? '—'}%</td>
    </tr>`;
  }).join('');

  const totalRow = (app.financieroPorLote || []).find((l: any) => l.loteNombre === 'TOTAL');
  const costoTotal = totalRow
    ? (totalRow.costoTotalReal || 0)
    : (app.financieroPorLote || [])
        .filter((l: any) => l.loteNombre !== 'TOTAL')
        .reduce((s: number, l: any) => s + (l.costoTotalReal || 0), 0);
  
  const desvTotal = app.desvCosto ?? totalRow?.costoTotalDesviacion ?? 0;

  return `<div class="slide page-break">
  ${slideHeader('CIERRE', `Resultado Financiero — ${app.nombre}`, semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(12px, 1.8vw, 18px);gap:clamp(10px, 1.5vw, 14px);overflow:hidden;">
    <div style="display:flex;gap:clamp(10px, 1.5vw, 16px);">
      <div style="flex:1;background:${DS.card};border-radius:12px;padding:clamp(12px, 1.8vw, 18px);border:1px solid ${DS.border};display:flex;align-items:center;gap:clamp(12px, 2vw, 20px);">
        <div style="width:clamp(40px, 6vw, 56px);height:clamp(40px, 6vw, 56px);background:${DS.secondaryLight};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:clamp(18px, 3vw, 28px);">💰</div>
        <div>
          <div style="font-size:clamp(9px, 1vw, 11px);color:${DS.mutedForeground};font-weight:600;text-transform:uppercase;">Costo Total Real</div>
          <div style="font-size:clamp(22px, 3.5vw, 32px);font-weight:900;color:${DS.primary};">${formatCOP(costoTotal)}</div>
        </div>
      </div>
      <div style="flex:0 0 auto;background:${getDesvColor(desvTotal)};border-radius:12px;padding:clamp(12px, 1.8vw, 18px) clamp(20px, 3vw, 32px);display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-size:clamp(9px, 1vw, 11px);color:${getDesvTextColor(desvTotal)};font-weight:600;text-transform:uppercase;">Desviación</div>
        <div style="font-size:clamp(22px, 3.5vw, 32px);font-weight:900;color:${getDesvTextColor(desvTotal)};">${desvTotal > 0 ? '+' : ''}${formatNum(desvTotal, 1)}%</div>
      </div>
    </div>
    <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;display:flex;flex-direction:column;min-height:0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:linear-gradient(135deg, ${DS.primaryDark} 0%, ${DS.primary} 100%);">
            <th rowspan="2" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:left;border-right:1px solid rgba(255,255,255,0.2);">Lote</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;border-right:1px solid rgba(255,255,255,0.2);">Insumos</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;border-right:1px solid rgba(255,255,255,0.2);">Mano de Obra</th>
            <th colspan="3" style="padding:clamp(5px, 0.8vw, 8px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">Total</th>
          </tr>
          <tr style="background:${DS.primary};">
            ${['Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv'].map(h => `<th style="padding:clamp(4px, 0.6vw, 6px);font-size:clamp(7px, 0.8vw, 9px);font-weight:600;color:#FFFFFF;text-align:center;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${lotesRows}</tbody>
      </table>
    </div>
  </div>
</div>`;
}


function construirSlideAplicacionesActivas(datos: any): string {
  const activas = datos.aplicaciones?.activas || [];
  if (activas.length === 0) return '';
  const { semana } = datos;

  const getProgressColor = (pct: number) => pct >= 80 ? DS.success : pct >= 40 ? DS.warning : DS.destructive;
  const getProgressBg = (pct: number) => pct >= 80 ? DS.successBg : pct >= 40 ? DS.warningBg : DS.destructiveBg;

  const appsHTML = activas.slice(0, 3).map((app: any) => {
    const pct = app.porcentajeGlobal || 0;
    const barColor = getProgressColor(pct);

    const loteBars = (app.progresoPorLote || []).slice(0, 6).map((lote: any) => {
      const lp = Math.round((lote.porcentaje || 0) * 10) / 10;
      const lpColor = getProgressColor(lp);
      return `<div style="display:flex;align-items:center;margin-bottom:3px;">
        <div style="width:70px;font-size:10px;font-weight:600;color:${DS.brandBrown};text-align:right;padding-right:6px;flex-shrink:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${lote.loteNombre}</div>
        <div style="flex:1;background:${DS.border};border-radius:4px;height:14px;position:relative;overflow:hidden;">
          <div style="background:${lpColor};height:100%;border-radius:4px;width:${Math.min(lp, 100)}%;"></div>
          <span style="position:absolute;left:4px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:600;color:${lp > 50 ? '#FFF' : DS.brandBrown};">${formatNum(lote.ejecutado, 1)}/${formatNum(lote.planeado, 1)} (${formatNum(lp, 1)}%)</span>
        </div>
      </div>`;
    }).join('');

    const pctDisplay = formatNum(pct, 1);
    return `<div style="background:${DS.card};border-radius:12px;border:1px solid ${DS.border};padding:clamp(12px, 1.8vw, 16px);flex:1;min-width:280px;box-shadow:0 2px 6px rgba(0,0,0,0.04);overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:clamp(12px, 1.5vw, 14px);font-weight:700;color:${DS.brandBrown};">${app.nombre}</div>
          <span style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:clamp(8px, 0.9vw, 10px);font-weight:600;background:${DS.warningBg};color:${DS.warning};margin-top:4px;">${app.tipo}</span>
        </div>
        <div style="background:${getProgressBg(pct)};padding:10px 14px;border-radius:10px;text-align:center;">
          <div style="font-size:clamp(20px, 3vw, 28px);font-weight:900;color:${barColor};line-height:1;">${pctDisplay}%</div>
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${barColor};font-weight:600;">avance</div>
        </div>
      </div>
      ${app.proposito ? `<div style="font-size:10px;color:${DS.mutedForeground};margin-bottom:10px;line-height:1.4;">${app.proposito}</div>` : ''}
      <div style="background:${DS.muted};border-radius:6px;height:22px;overflow:hidden;position:relative;margin-bottom:10px;">
        <div style="background:${barColor};height:100%;border-radius:6px;width:${Math.min(pct, 100)}%;"></div>
        <span style="position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);font-size:10px;font-weight:700;color:${pct > 45 ? '#FFF' : DS.brandBrown};">${formatNum(app.totalEjecutado, 1)}/${formatNum(app.totalPlaneado, 1)} ${app.unidad}</span>
      </div>
      ${loteBars}
    </div>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('APLICACIONES', 'Aplicaciones en Ejecución', semana)}
  <div style="flex:1;display:flex;padding:clamp(14px, 2vw, 20px);gap:clamp(12px, 1.8vw, 16px);overflow:hidden;">
    ${appsHTML}
  </div>
</div>`;
}

function construirSlideAplicacionPlaneada(app: any, semana: any): string {
  const comprasRows = (app.listaCompras || []).slice(0, 6).map((item: any, i: number) => {
    const needsOrder = (item.cantidadAComprar || item.cantidadOrdenar || 0) > 0;
    return `<tr style="background:${i % 2 === 0 ? DS.card : DS.muted};">
      <td style="padding:clamp(5px, 0.8vw, 7px) clamp(8px, 1.2vw, 10px);font-size:clamp(9px, 1.1vw, 11px);font-weight:600;color:${DS.brandBrown};">${item.productoNombre}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(9px, 1vw, 10px);text-align:center;">${item.cantidadNecesaria} ${item.unidad}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(9px, 1vw, 10px);text-align:center;">${item.inventarioDisponible ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(9px, 1vw, 10px);text-align:center;font-weight:600;color:${needsOrder ? DS.destructive : DS.success};">${item.cantidadAComprar ?? item.cantidadOrdenar ?? '—'}</td>
      <td style="padding:clamp(5px, 0.8vw, 7px);font-size:clamp(9px, 1vw, 10px);text-align:right;">${formatCOP(item.costoEstimado || 0)}</td>
    </tr>`;
  }).join('');

  const costoTotal = (app.listaCompras || []).reduce((s: number, i: any) => s + (i.costoEstimado || 0), 0);

  return `<div class="slide page-break">
  ${slideHeader('APLICACIONES', `Plan: ${app.nombre}`, semana)}
  <div style="flex:1;display:flex;padding:clamp(12px, 1.8vw, 18px);gap:clamp(14px, 2vw, 20px);overflow:hidden;">
    <div style="flex:0 0 clamp(260px, 30%, 320px);display:flex;flex-direction:column;gap:clamp(8px, 1.2vw, 12px);">
      <div style="background:${DS.muted};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border-left:4px solid ${DS.primary};">
        <div style="font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:${DS.primary};margin-bottom:clamp(4px, 0.8vw, 8px);text-transform:uppercase;">🎯 Propósito</div>
        <div style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};line-height:1.5;">${app.proposito || '—'}</div>
      </div>
      <div style="background:${DS.warningBg};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border-left:4px solid ${DS.warning};">
        <div style="font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:${DS.warning};margin-bottom:clamp(4px, 0.8vw, 8px);text-transform:uppercase;">🐛 Blancos Biológicos</div>
        <div style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};">${(app.blancosBiologicos || []).join(' · ')}</div>
      </div>
      <div style="background:${DS.card};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border:1px solid ${DS.border};">
        <div style="font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:${DS.mutedForeground};margin-bottom:clamp(4px, 0.8vw, 8px);text-transform:uppercase;">📅 Fechas</div>
        <div style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};">Inicio: <strong>${app.fechaInicioPlaneada || '—'}</strong></div>
        ${app.fechaFinPlaneada ? `<div style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.brandBrown};margin-top:2px;">Fin: <strong>${app.fechaFinPlaneada}</strong></div>` : ''}
      </div>
      ${app.mezclas?.length > 0 ? `<div style="background:${DS.secondaryLight};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);border-left:4px solid ${DS.secondary};">
        <div style="font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:${DS.primaryDark};margin-bottom:clamp(4px, 0.8vw, 8px);text-transform:uppercase;">🧪 Mezclas</div>
        ${app.mezclas.slice(0, 3).map((m: any) => `<div style="font-size:clamp(9px, 1.1vw, 11px);color:${DS.brandBrown};margin-bottom:2px;">· ${m.nombre || m}: ${m.dosis || ''}</div>`).join('')}
      </div>` : ''}
    </div>
    <div style="flex:1;display:flex;flex-direction:column;min-height:0;">
      <div style="font-size:clamp(10px, 1.2vw, 12px);font-weight:700;color:${DS.brandBrown};margin-bottom:clamp(6px, 1vw, 10px);">🛒 Lista de Compras</div>
      <div style="background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;flex:1;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">
            <th style="padding:clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:left;">Producto</th>
            <th style="padding:clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">Necesario</th>
            <th style="padding:clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">Inventario</th>
            <th style="padding:clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:center;">Ordenar</th>
            <th style="padding:clamp(6px, 1vw, 10px);font-size:clamp(8px, 0.9vw, 10px);font-weight:700;color:#FFFFFF;text-align:right;">Costo Est.</th>
          </tr></thead>
          <tbody>${comprasRows}</tbody>
        </table>
      </div>
        <div style="background:${DS.muted};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);text-align:center;">
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${DS.primary};font-weight:700;margin-bottom:4px;">COSTO/${app.tipo === 'Fumigación' ? 'L' : 'KG'}</div>
          <div style="font-size:clamp(14px, 2vw, 18px);font-weight:800;color:${DS.brandBrown};">${app.costoPorLitroKg ? formatCOP(app.costoPorLitroKg) : '—'}</div>
        </div>
        <div style="background:${DS.muted};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);text-align:center;">
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${DS.primary};font-weight:700;margin-bottom:4px;">COSTO/ÁRBOL</div>
          <div style="font-size:clamp(14px, 2vw, 18px);font-weight:800;color:${DS.brandBrown};">${app.costoPorArbol ? formatCOP(app.costoPorArbol) : '—'}</div>
        </div>
        <div style="background:${DS.secondaryLight};border-radius:10px;padding:clamp(10px, 1.5vw, 14px);text-align:center;">
          <div style="font-size:clamp(8px, 0.9vw, 10px);color:${DS.primaryDark};font-weight:700;margin-bottom:4px;">TOTAL EST.</div>
          <div style="font-size:clamp(16px, 2.2vw, 20px);font-weight:900;color:${DS.primary};">${formatCOP(costoTotal)}</div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}


function construirSlideMonitoreoTendencias(datos: any, analisis: AnalisisGemini): string {
  const monitoreo = datos.monitoreo;
  if (!monitoreo) return '';
  const resumen: any[] = monitoreo.resumenGlobal || [];
  if (resumen.length === 0 && !monitoreo.avisoFechaDesactualizada) return '';
  const { semana } = datos;

  // Date info banner
  const fechaActual = monitoreo.fechaActual;
  const fechaAnterior = monitoreo.fechaAnterior;
  const aviso = monitoreo.avisoFechaDesactualizada;

  let fechaBanner = '';
  if (aviso) {
    fechaBanner = `<div style="background:${DS.warningBg};border:1px solid ${DS.warning};border-radius:6px;padding:clamp(6px, 1vw, 8px) clamp(10px, 1.5vw, 14px);margin-bottom:clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.warning};font-weight:600;">⚠ ${aviso}</div>`;
  }
  if (fechaActual) {
    const refText = fechaAnterior ? ` · Referencia: ${fechaAnterior}` : ' · Sin observación de referencia';
    fechaBanner += `<div style="font-size:clamp(9px, 1.1vw, 11px);color:${DS.mutedForeground};margin-bottom:clamp(8px, 1.2vw, 10px);">Monitoreo: <strong>${fechaActual}</strong>${refText}</div>`;
  }

  // Table rows
  const rows = resumen.map((r: any) => {
    const bg = getIncidenciaColor(r.promedioActual);
    const rangoText = r.minLote !== null && r.maxLote !== null
      ? `${formatNum(r.minLote, 1)}%–${formatNum(r.maxLote, 1)}%`
      : '—';
    const tendenciaHTML = formatTendenciaCell(r.promedioActual, r.promedioAnterior, r.tendencia);

    return `<tr>
      <td style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(10px, 1.2vw, 12px);font-weight:600;color:${DS.brandBrown};border:1px solid ${DS.border};background:${DS.muted};${r.esPlaga_interes ? `border-left:3px solid ${DS.primary};` : ''}">${r.plagaNombre}</td>
      <td style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);text-align:center;font-size:clamp(10px, 1.2vw, 12px);font-weight:700;background:${bg};color:${DS.brandBrown};border:1px solid ${DS.border};">${r.promedioActual !== null ? formatNum(r.promedioActual, 1) + '%' : '—'}</td>
      <td style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);text-align:center;font-size:clamp(9px, 1.1vw, 11px);color:${DS.brandBrown};border:1px solid ${DS.border};">${rangoText}</td>
      <td style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);color:${DS.brandBrown};border:1px solid ${DS.border};">${tendenciaHTML}</td>
    </tr>`;
  }).join('');

  // Gemini analysis paragraph (reduced to a brief section below the table)
  let geminiParagraph = '';
  const geminiText = analisis.interpretacion_monitoreo || analisis.interpretacion_tendencias_monitoreo || '';
  if (geminiText) {
    geminiParagraph = `<div style="background:${DS.muted};border-left:4px solid ${DS.primary};border-radius:0 10px 10px 0;padding:clamp(8px, 1.2vw, 10px) clamp(10px, 1.5vw, 14px);margin-top:clamp(10px, 1.5vw, 14px);">
      <div style="font-size:clamp(9px, 1vw, 10px);font-weight:700;color:${DS.primary};letter-spacing:0.5px;margin-bottom:clamp(4px, 0.6vw, 4px);">ANÁLISIS</div>
      <div style="font-size:clamp(9px, 1.1vw, 11px);color:${DS.brandBrown};line-height:1.5;">${geminiText}</div>
    </div>`;
  }

  return `<div class="slide page-break">
  ${slideHeader('MONITOREO', 'Resumen General — Estado Fitosanitario', semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:clamp(12px, 1.8vw, 16px) clamp(16px, 2.2vw, 22px) clamp(8px, 1.2vw, 12px);gap:8px;overflow:hidden;">
    ${fechaBanner}
    <div style="flex:1;background:${DS.card};border-radius:10px;border:1px solid ${DS.border};overflow:hidden;min-height:0;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:linear-gradient(135deg, ${DS.primary} 0%, ${DS.primaryDark} 100%);">
          <th style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Plaga</th>
          <th style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:center;">Incidencia Promedio</th>
          <th style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:center;">Rango (Min–Max)</th>
          <th style="padding:clamp(6px, 1vw, 8px) clamp(8px, 1.2vw, 12px);font-size:clamp(9px, 1.1vw, 11px);font-weight:700;color:#FFFFFF;text-align:left;">Tendencia</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${monitoreoLeyendaHTML()}
    ${geminiParagraph}
  </div>
</div>`;
}

function construirSlideMonitoreoPorLote(datos: any): string {
  const monitoreo = datos.monitoreo;
  if (!monitoreo) return '';
  const vistas: any[] = monitoreo.vistasPorLote || [];
  if (vistas.length === 0) return '';
  const { semana } = datos;

  // Collect all unique plagas across all lotes (union), interest ones first
  const interestSet = new Set<string>();
  const allPlagasSet = new Set<string>();
  for (const lote of vistas) {
    for (const p of (lote.plagas || [])) {
      allPlagasSet.add(p.plagaNombre);
      if (p.esPlaga_interes) interestSet.add(p.plagaNombre);
    }
  }
  const allPlagas = Array.from(allPlagasSet).sort((a, b) => {
    const ai = interestSet.has(a), bi = interestSet.has(b);
    if (ai !== bi) return ai ? -1 : 1;
    return a.localeCompare(b);
  });

  // Alert styling per lote
  function alertStyle(alerta: string): { bg: string; color: string; icon: string } {
    if (alerta === 'ninguna') return { bg: DS.successBg, color: DS.success, icon: '✓' };
    if (alerta === 'amarilla') return { bg: DS.warningBg, color: DS.warning, icon: '⚠' };
    return { bg: DS.destructiveBg, color: DS.destructive, icon: '!' };
  }

  // Trend arrow
  function trendArrow(t: string): string {
    if (t === 'subiendo') return '↑';
    if (t === 'bajando') return '↓';
    if (t === 'estable') return '→';
    return '';
  }

  // Column widths: plaga column ~22%, rest split equally
  const lotePct = Math.floor(78 / Math.max(vistas.length, 1));

  // Header row: lote names
  const headerCols = vistas.map((lote: any) =>
    `<th style="padding:4px 5px;font-size:clamp(7px,0.85vw,9px);font-weight:700;color:#fff;background:${DS.primaryDark};border:1px solid ${DS.primaryDark};text-align:center;width:${lotePct}%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${lote.loteNombre}</th>`
  ).join('');

  // Fecha row
  const fechaCols = vistas.map((lote: any) => {
    const alerta = lote.nivelAlerta || 'roja';
    const st = alertStyle(alerta);
    const fecha = lote.fechaUltimaObservacion;
    const display = fecha ? `${st.icon} ${fecha.slice(5).replace('-', '/')}` : `${st.icon} —`;
    return `<td style="padding:3px 4px;text-align:center;font-size:clamp(7px,0.85vw,9px);font-weight:700;background:${st.bg};color:${st.color};border:1px solid ${DS.border};">${display}</td>`;
  }).join('');

  // Plaga rows
  const plagaRows = allPlagas.map((plaga: string) => {
    const isInterest = interestSet.has(plaga);
    const cells = vistas.map((lote: any) => {
      const p = (lote.plagas || []).find((x: any) => x.plagaNombre === plaga);
      if (!p || p.actual === null) {
        return `<td style="padding:3px 4px;text-align:center;font-size:clamp(7px,0.9vw,10px);border:1px solid ${DS.border};color:${DS.mutedForeground};">—</td>`;
      }
      const bg = getIncidenciaColor(p.actual);
      const arrow = trendArrow(p.tendencia);
      const val = `${formatNum(p.actual, 1)}%${arrow ? ` (${arrow})` : ''}`;
      return `<td style="padding:3px 4px;text-align:center;font-size:clamp(7px,0.9vw,10px);font-weight:600;background:${bg};border:1px solid ${DS.border};">${val}</td>`;
    }).join('');
    return `<tr>
      <td style="padding:3px 6px;font-size:clamp(7px,0.9vw,10px);font-weight:${isInterest ? '700' : '500'};color:${DS.brandBrown};background:${DS.muted};border:1px solid ${DS.border};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:0;${isInterest ? `border-left:3px solid ${DS.primary};` : ''}">${plaga}</td>
      ${cells}
    </tr>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('MONITOREO', 'Vista por Lote', semana)}
  <div style="flex:1;overflow:hidden;padding:clamp(10px,1.4vw,14px) clamp(12px,1.8vw,18px);">
    <table style="width:100%;table-layout:fixed;border-collapse:collapse;">
      <thead>
        <tr>
          <th style="padding:4px 6px;font-size:clamp(7px,0.85vw,9px);font-weight:700;color:#fff;background:${DS.primaryDark};border:1px solid ${DS.primaryDark};text-align:left;width:22%;">Plaga</th>
          ${headerCols}
        </tr>
        <tr>
          <td style="padding:3px 6px;font-size:clamp(7px,0.85vw,9px);font-weight:700;color:${DS.brandBrown};background:${DS.muted};border:1px solid ${DS.border};">Fecha</td>
          ${fechaCols}
        </tr>
      </thead>
      <tbody>${plagaRows}</tbody>
    </table>
  </div>
</div>`;
}

function construirSlideMonitoreoPorSublote(loteVista: any, semana: any): string {
  if (!loteVista) return '';
  const loteNombre = loteVista.loteNombre || 'Lote';

  if (loteVista.sinDatos) {
    const sublotes = loteVista.sublotes || [];
    if (sublotes.length === 0) return '';
    return `<div class="slide page-break">
    ${slideHeader('MONITOREO', `Sublotes — ${loteNombre}`, semana)}
    <div style="padding:clamp(30px, 4vw, 40px) clamp(16px, 2.2vw, 22px);text-align:center;">
      <div style="font-size:clamp(12px, 1.5vw, 14px);color:${DS.mutedForeground};font-weight:600;">No se monitoreó este lote</div>
      <div style="font-size:clamp(10px, 1.2vw, 12px);color:${DS.mutedForeground};margin-top:clamp(6px, 1vw, 8px);opacity:0.7;">Sublotes configurados: ${sublotes.join(', ')}</div>
    </div>
  </div>`;
  }

  const sublotes: string[] = loteVista.sublotes || [];
  const plagas: string[] = loteVista.plagas || [];
  const celdas = loteVista.celdas || {};

  if (sublotes.length === 0 || plagas.length === 0) return '';

  const subHeaders = sublotes.map((sl: string) =>
    `<th style="padding:clamp(5px, 0.8vw, 7px) clamp(6px, 1vw, 8px);font-size:clamp(9px, 1vw, 10px);font-weight:700;color:#FFFFFF;background:${DS.primaryDark};border:1px solid ${DS.primaryDark};text-align:center;min-width:clamp(70px, 8vw, 90px);">${sl}</th>`
  ).join('');

  const bodyRows = plagas.map((plaga: string) => {
    const cells = sublotes.map((sl: string) => {
      const celda = celdas[plaga]?.[sl];
      if (!celda || celda.actual === null) {
        return `<td style="padding:clamp(4px, 0.7vw, 6px) clamp(6px, 1vw, 8px);text-align:center;background:${DS.muted};border:1px solid ${DS.border};font-size:clamp(9px, 1vw, 10px);color:${DS.mutedForeground};">—</td>`;
      }
      const bg = getIncidenciaColor(celda.actual);
      const tendenciaHTML = formatTendenciaCell(celda.actual, celda.anterior, celda.tendencia);
      return `<td style="padding:clamp(4px, 0.7vw, 5px) clamp(4px, 0.7vw, 6px);text-align:center;border:1px solid ${DS.border};background:${bg};font-size:clamp(9px, 1vw, 10px);">${tendenciaHTML}</td>`;
    }).join('');
    return `<tr><td style="padding:clamp(5px, 0.8vw, 7px) clamp(8px, 1.2vw, 10px);font-size:clamp(9px, 1.1vw, 11px);font-weight:600;color:${DS.brandBrown};border:1px solid ${DS.border};background:${DS.muted};white-space:nowrap;">${plaga}</td>${cells}</tr>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('MONITOREO', `Sublotes — ${loteNombre}`, semana)}
  <div style="padding:clamp(12px, 1.8vw, 16px) clamp(16px, 2.2vw, 22px) 0;overflow:auto;">
    <table style="border-collapse:collapse;min-width:100%;">
      <thead><tr>
        <th style="padding:clamp(5px, 0.8vw, 7px) clamp(8px, 1.2vw, 10px);font-size:clamp(9px, 1vw, 10px);font-weight:700;color:#FFFFFF;background:${DS.primary};border:1px solid ${DS.primaryDark};text-align:left;">Plaga</th>
        ${subHeaders}
      </tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    ${monitoreoLeyendaHTML()}
  </div>
</div>`;
}


function construirSlideAdicional(bloque: any, semana: any): string {
  if (!bloque) return '';
  const titulo = bloque.titulo || 'Tema Adicional';

  let contenidoHTML = '';
  if (bloque.tipo === 'texto') {
    contenidoHTML = `<div style="padding:20px 28px;font-size:14px;color:#4D240F;line-height:1.8;">
      ${(bloque.contenido || '').replace(/\n/g, '<br>')}
    </div>`;
  } else if (bloque.tipo === 'imagen_con_texto') {
    const imagenes = bloque.imagenes || (bloque.imagen ? [bloque.imagen] : []);
    const imgsHTML = imagenes.slice(0, 2).map((img: string) => `<img src="${img}" style="max-width:100%;max-height:480px;border-radius:8px;object-fit:contain;" />`).join('');
    contenidoHTML = `<div style="padding:16px 22px;display:flex;gap:20px;">
      <div style="flex:1;display:flex;gap:12px;justify-content:center;align-items:flex-start;">${imgsHTML}</div>
      ${bloque.descripcion ? `<div style="flex:0 0 300px;background:#F5F9EE;border-radius:8px;padding:14px 16px;font-size:13px;color:#4D240F;line-height:1.6;">${bloque.descripcion.replace(/\n/g, '<br>')}</div>` : ''}
    </div>`;
  }

  return `<div class="slide page-break">
  ${slideHeader('ADICIONALES', titulo, semana)}
  ${contenidoHTML}
</div>`;
}

function construirSlideConclusiones(analisis: AnalisisGemini, semana: any): string {
  const prioridadConfig: Record<string, { bg: string; border: string; icon: string }> = {
    alta: { bg: DS.destructiveBg, border: DS.destructive, icon: '🔴' },
    media: { bg: DS.warningBg, border: DS.warning, icon: '🟡' },
    baja: { bg: DS.successBg, border: DS.success, icon: '🟢' },
  };

  const items = analisis.conclusiones.slice(0, 6).map((c, i) => {
    const config = prioridadConfig[c.prioridad] || prioridadConfig.media;
    const contextoHtml = c.contexto
      ? `<div style="font-size:10px;color:#6b7280;margin-top:2px;line-height:1.3;">${c.contexto}</div>`
      : '';
    return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;background:${config.bg};border-radius:8px;border-left:4px solid ${config.border};">
      <div style="font-size:20px;flex-shrink:0;line-height:1.2;">${c.icono}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;color:${DS.brandBrown};line-height:1.5;">${c.texto}</div>
        ${contextoHtml}
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
        <span style="font-size:9px;color:${config.border};font-weight:700;text-transform:uppercase;">${c.prioridad}</span>
        <span style="font-size:14px;">${config.icon}</span>
      </div>
    </div>`;
  }).join('');

  return `<div class="slide page-break">
  ${slideHeader('CONCLUSIONES', 'Conclusiones y Recomendaciones', semana)}
  <div style="flex:1;display:flex;flex-direction:column;padding:16px 20px;gap:8px;overflow:hidden;">
    ${items}
  </div>
</div>`;
}

// ============================================================================
// CONSTRUCTOR PRINCIPAL HTML
// ============================================================================

function construirHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const { semana, aplicaciones, monitoreo, temasAdicionales } = datos;
  const cerradas = aplicaciones?.cerradas || [];
  const planeadas = aplicaciones?.planeadas || [];

  // Build sublote vistas — filter out lotes with no sublotes configured
  const vistasPorSublote: any[] = (monitoreo?.vistasPorSublote || []).filter(
    (v: any) => v.sublotes && v.sublotes.length > 0 && v.tieneDatosSemanaActual
  );

  const temasAd: any[] = temasAdicionales || [];

  const slides = [
    construirSlidePortada(datos, analisis),
    construirSlidePersonal(datos),
    construirSlideLaboresProgramadas(datos),
    construirSlideLaboresMatriz(datos),
    ...cerradas.flatMap((app: any) => [
      construirSlideCierreGeneral(app, semana),
      construirSlideCierreTecnico(app, semana),
      construirSlideCierreFinanciero(app, semana),
    ]),
    construirSlideAplicacionesActivas(datos),
    ...planeadas.map((app: any) => construirSlideAplicacionPlaneada(app, semana)),
    construirSlideMonitoreoTendencias(datos, analisis),
    construirSlideMonitoreoPorLote(datos),
    ...vistasPorSublote.map((v: any) => construirSlideMonitoreoPorSublote(v, semana)),
    ...temasAd.map((b: any) => construirSlideAdicional(b, semana)),
    construirSlideConclusiones(analisis, semana),
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  /* ===========================================
     ESCOCIA OS - Report Design System
     =========================================== */
  
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    width: 1280px; 
    margin: 0 auto; 
    color: ${DS.brandBrown}; 
    background: ${DS.background}; 
    line-height: 1.4;
    -webkit-font-smoothing: antialiased;
  }
  
  /* Slide container - viewport fitting */
  .slide { 
    width: 1280px; 
    height: 720px; 
    overflow: hidden; 
    position: relative; 
    background: ${DS.background}; 
    page-break-after: always; 
    margin-bottom: 0;
    display: flex;
    flex-direction: column;
  }
  
  .page-break { page-break-before: always; }
  
  /* Tables */
  table { 
    border-collapse: collapse; 
    width: 100%;
  }
  
  th, td {
    border: none;
  }
  
  /* Print styles */
  @media print { 
    .slide { page-break-after: always; } 
    body { margin: 0; width: 100%; background: white; }
  }
</style>
</head>
<body>
${slides}
</body>
</html>`;
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

    const inicioSemana: string = datos.semana?.inicio || new Date().toISOString().split('T')[0];

    console.log('Fetching historical context (4 weeks)...');
    const [historicoCtx, notionCtx] = await Promise.all([
      fetchHistoricoSemanas(inicioSemana),
      fetchResumenesNotion(),
    ]);
    console.log('Historical context:', historicoCtx.length, 'chars; Notion context:', notionCtx.length, 'chars');

    const datosFormateados = formatearDatosParaPrompt(datos, historicoCtx, notionCtx);
    console.log('Datos formateados:', datosFormateados.length, 'chars');

    console.log('Calling DeepSeek via OpenRouter for analysis...');
    const llmStart = Date.now();
    const { analisis, tokens } = await llamarLLM(datosFormateados, instrucciones);
    console.log(`LLM completed in ${Date.now() - llmStart}ms`);

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
