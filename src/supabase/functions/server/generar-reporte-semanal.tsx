// generar-reporte-semanal.tsx
// Módulo de Edge Function para generar reportes semanales en formato slides landscape (1280x720)
// Flujo: datos -> DeepSeek via OpenRouter (analisis JSON + titulares) -> plantilla HTML deterministica -> PDF

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
  titulares: {
    personal: string;
    labores: string;
    jornales: string;
    monitoreo: string;
    aplicaciones: string;
    clima?: string;
    floracion?: string;
    conductividad_electrica?: string;
    colmenas?: string;
  };
  conclusiones: Array<{
    texto: string;
    prioridad: 'alta' | 'media' | 'baja';
    contexto?: string;
    icono?: string;
  }>;
  interpretacion_monitoreo: string;
  interpretacion_tendencias_monitoreo: string;
  interpretacion_clima?: string;
  interpretacion_floracion?: string;
  interpretacion_ce?: string;
  interpretacion_colmenas?: string;
}

// ============================================================================
// PROMPT TEMPLATE — Pide analisis JSON + titulares por seccion
// ============================================================================

const SYSTEM_PROMPT = `Eres un administrador agricola experto de la finca de aguacate Hass "Escocia Hass" en Colombia.
Recibiras datos operativos de la semana actual, tendencias de las ultimas 4 semanas, y resumenes de las llamadas recientes con el propietario.

RESPONDE EXCLUSIVAMENTE en formato JSON con esta estructura exacta:
{
  "resumen_ejecutivo": "...",
  "titulares": {
    "personal": "...",
    "labores": "...",
    "jornales": "...",
    "monitoreo": "...",
    "aplicaciones": "...",
    "clima": "...",
    "floracion": "...",
    "conductividad_electrica": "...",
    "colmenas": "..."
  },
  "conclusiones": [
    { "texto": "...", "prioridad": "alta", "contexto": "..." }
  ],
  "interpretacion_monitoreo": "...",
  "interpretacion_tendencias_monitoreo": "...",
  "interpretacion_clima": "...",
  "interpretacion_floracion": "...",
  "interpretacion_ce": "...",
  "interpretacion_colmenas": "..."
}

NOTA: Los campos clima, floracion, conductividad_electrica, colmenas en titulares e interpretaciones son OPCIONALES.
Incluyelos SOLO si los datos correspondientes estan presentes en los datos de entrada. Si no hay datos, omitelos del JSON.

### resumen_ejecutivo
Escribelo como si fuera un administrador de finca en una llamada rapida con el propietario.
- Tono directo, conversacional, sin tecnicismos
- Maximo 5 oraciones
- Menciona lo que paso (no lo que "se realizo"): que se fumigo, cuanto personal, que alerta de plaga hay
- Empieza por lo mas importante de la semana (no por el numero de jornales)
- Incluye cifras clave de forma natural: jornales, lotes pendientes, alertas de plaga
- Ejemplo de tono: "Esta semana completamos la fumigacion en los lotes del sur. Nos faltan Acueducto y Union que quedaron para la proxima. Tuvimos 11 empleados, 2 fallas, y se trabajaron 48 de 55 jornales posibles. El monitoreo mostro alertas de Monalonion en 4 lotes, lo que hay que atender."

### titulares
Cada titular es UNA oracion de maximo 15 palabras que resume el punto clave de esa seccion.
Debe ser analitico, no descriptivo. No repitas la etiqueta de la seccion.
Usa datos concretos (cifras, porcentajes, nombres de lotes).

Ejemplo BUENO personal: "109% eficiencia con 10 trabajadores — 1 retiro reduce capacidad"
Ejemplo MALO personal: "Resumen del personal de esta semana"

Ejemplo BUENO monitoreo: "Alerta critica: Cucarron marceno al 35% en Salto de Tequendama"
Ejemplo MALO monitoreo: "Estado fitosanitario de los lotes monitoreados"

Ejemplo BUENO jornales: "54.5 jornales — La Vega concentra 55% del esfuerzo semanal"
Ejemplo MALO jornales: "Distribucion de jornales por lote y actividad"

Ejemplo BUENO labores: "8 labores activas, ninguna completada — zanjas llevan 7 semanas"
Ejemplo MALO labores: "Las labores programadas de la semana"

Ejemplo BUENO aplicaciones: "Fumigacion al 83% de avance — Acueducto al 0% requiere atencion"
Ejemplo MALO aplicaciones: "Estado de las aplicaciones en ejecucion"

Ejemplo BUENO clima: "Lluvia 3x el promedio (86mm vs 28mm) — presion fungica alta y ventanas de aplicacion limitadas"
Ejemplo MALO clima: "Resumen del clima de la semana"

Ejemplo BUENO floracion: "74% en cuaje, brotes solo en La Vega — segunda floracion uniforme"
Ejemplo MALO floracion: "Estado de floracion de los lotes"

Ejemplo BUENO conductividad_electrica: "CE estable — 85% en rango, solo Acueducto sobre 1.5 dS/m"
Ejemplo MALO conductividad_electrica: "Datos de conductividad electrica"

Ejemplo BUENO colmenas: "92% fuertes, 3 muertas en Apiario B — revisar alimentacion"
Ejemplo MALO colmenas: "Estado de las colmenas"

### conclusiones
Lista de 3 a 6 recomendaciones concretas y priorizadas.
- Factoriza datos de la semana actual + tendencias de las ultimas 4 semanas + compromisos pendientes de las llamadas con el propietario
- Senala explicitamente si algo fue prometido y no se cumplio, o si una tendencia lleva varias semanas
- Cada conclusion tiene:
  - texto: verbo de accion + que hacer + (opcional) plazo o lote especifico
  - contexto: en 1 oracion, por que se recomienda esto (tendencia, compromiso de llamada, umbral superado)
  - prioridad: "alta" / "media" / "baja"
- Los verbos de accion deben ser: Ejecutar, Evaluar, Priorizar, Revisar, Programar, Escalar, Confirmar

### interpretacion_monitoreo
Parrafo breve (2-3 oraciones) del estado fitosanitario general de la semana.

### interpretacion_tendencias_monitoreo
Analisis por plaga: Monalonion, Acaro, Trips, Cucarron marceno. Para cada una: tendencia (sube/baja/estable), lotes con mayor riesgo.

### interpretacion_clima (solo si hay datos de clima)
Parrafo de 3-5 oraciones que CONTRASTA el clima de esta semana con el promedio historico de las ultimas 4 semanas.
- Identifica si el comportamiento es TIPICO o ATIPICO (ej: "La lluvia de 86mm es 3x el promedio de las ultimas 4 semanas")
- Señala implicaciones concretas: presion de enfermedades fungicas por humedad alta, ventanas de aplicacion limitadas por lluvia continua, estres por radiacion extrema, riesgo de heladas
- Relaciona con impacto en floracion (ej: lluvia excesiva en cuaje puede causar caida de frutos) y presion de plagas (ej: humedad alta favorece Monalonion)
- Si los datos son tipicos, dilo explicitamente: "Condiciones dentro del rango normal"

### interpretacion_floracion (solo si hay datos de floracion)
Parrafo breve (2-3 oraciones) del estado de floracion. Indica la etapa dominante, que lotes estan mas avanzados, y si hay uniformidad o desfase entre lotes.

### interpretacion_ce (solo si hay datos de CE)
Parrafo breve (2-3 oraciones) del estado de conductividad electrica. Senala lotes fuera de rango y posibles acciones correctivas (riego, fertilizacion).

### interpretacion_colmenas (solo si hay datos de colmenas)
Parrafo breve (2-3 oraciones) del estado de los apiarios. Senala apiarios con colmenas debiles o muertas y si la polinizacion esta en riesgo.

REGLAS GENERALES:
- Todo en espanol
- NO incluir HTML, markdown, ni codigo. SOLO el objeto JSON.
- NO envolver el JSON en bloques de codigo.`;

// ============================================================================
// CONTEXTO HISTORICO — ULTIMAS 4 SEMANAS
// ============================================================================

async function fetchHistoricoSemanas(inicioSemanaActual: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return '';

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
    const [monitoreos, aplicaciones, registros] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/monitoreos?select=fecha_monitoreo,lote_id,plaga_enfermedad_id,incidencia,arboles_afectados,arboles_monitoreados,gravedad_texto,lote:lotes(nombre),plaga:plagas_enfermedades_catalogo(nombre)&fecha_monitoreo=gte.${encode(inicioHistoricoStr)}&fecha_monitoreo=lt.${encode(inicioSemanaActual)}&order=fecha_monitoreo.asc`,
        { headers }
      ).then(r => r.ok ? r.json() : []),
      fetch(
        `${supabaseUrl}/rest/v1/aplicaciones?select=nombre_aplicacion,tipo_aplicacion,estado,fecha_inicio_planeada,fecha_fin_planeada,fecha_cierre&fecha_inicio_planeada=gte.${encode(inicioHistoricoStr)}&fecha_inicio_planeada=lt.${encode(inicioSemanaActual)}`,
        { headers }
      ).then(r => r.ok ? r.json() : []),
      fetch(
        `${supabaseUrl}/rest/v1/registros_trabajo?select=fecha_trabajo,fraccion_jornal&fecha_trabajo=gte.${encode(inicioHistoricoStr)}&fecha_trabajo=lt.${encode(inicioSemanaActual)}`,
        { headers }
      ).then(r => r.ok ? r.json() : []),
    ]);

    const partes: string[] = [];
    partes.push('## TENDENCIAS OPERATIVAS — ULTIMAS 4 SEMANAS');

    if (Array.isArray(monitoreos) && monitoreos.length > 0) {
      partes.push('\n### Monitoreo fitosanitario (evolucion semanal)');
      const trend: Record<string, Record<string, Record<string, { afectados: number; monitoreados: number }>>> = {};
      for (const m of monitoreos) {
        const fecha = new Date(m.fecha_monitoreo);
        const weekStart = new Date(fecha);
        weekStart.setDate(fecha.getDate() - fecha.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        const plaga = m.plaga?.nombre || m.plaga_enfermedad_id || 'Desconocida';
        const lote = m.lote?.nombre || m.lote_id || 'Sin lote';
        if (!trend[plaga]) trend[plaga] = {};
        if (!trend[plaga][lote]) trend[plaga][lote] = {};
        if (!trend[plaga][lote][weekKey]) trend[plaga][lote][weekKey] = { afectados: 0, monitoreados: 0 };
        trend[plaga][lote][weekKey].afectados += m.arboles_afectados ?? 0;
        trend[plaga][lote][weekKey].monitoreados += m.arboles_monitoreados ?? 0;
      }

      const calcInc = (t: { afectados: number; monitoreados: number }) =>
        t.monitoreados > 0 ? (t.afectados / t.monitoreados) * 100 : 0;

      for (const [plaga, lotes] of Object.entries(trend)) {
        partes.push(`\n**${plaga}**`);
        for (const [lote, weeks] of Object.entries(lotes)) {
          const sortedWeeks = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));
          const vals = sortedWeeks.map(([wk, t]) => {
            return `S(${wk.slice(5)}): ${calcInc(t).toFixed(1)}%`;
          });
          const rising = sortedWeeks.length >= 2 && sortedWeeks.every(([, t], i) => {
            if (i === 0) return true;
            return calcInc(t) >= calcInc(sortedWeeks[i - 1][1]);
          });
          partes.push(`  - ${lote}: ${vals.join(' -> ')}${rising && sortedWeeks.length >= 2 ? ' TENDENCIA ASCENDENTE' : ''}`);
        }
      }
    }

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

    if (Array.isArray(registros) && registros.length > 0) {
      partes.push('\n### Ausentismo laboral (ultimas 4 semanas)');
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
// CONTEXTO NOTION — ULTIMAS 4 LLAMADAS CON PROPIETARIO
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
    partes.push('\n---\n\n## LLAMADAS CON PROPIETARIO — ULTIMAS 4 SEMANAS');

    const pageResults = await Promise.all(
      pages.map(async (page: any) => {
        const dateRaw = page.properties?.Date?.date?.start || page.properties?.date?.date?.start || '';
        const titleArr = page.properties?.Name?.title || page.properties?.name?.title || [];
        const title = titleArr.map((t: any) => t.plain_text).join('') || 'Sin titulo';

        const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
          headers: notionHeaders,
        });
        if (!blocksRes.ok) return null;

        const blocksData = await blocksRes.json();
        const blocks: any[] = blocksData.results || [];

        const lines: string[] = [];
        lines.push(`\n### ${dateRaw} — ${title}`);

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
          lines.push('Compromisos pendientes:');
          lines.push(...pendingItems);
        }
        if (summaryLines.length > 0) {
          lines.push(`Temas discutidos: ${summaryLines.slice(0, 5).join(' / ')}`);
        }

        return lines.join('\n');
      })
    );

    for (const result of pageResults) {
      if (result) partes.push(result);
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

  partes.push(`## PERIODO DEL REPORTE
- Semana ${datos.semana.numero} del ${datos.semana.ano}
- Desde: ${datos.semana.inicio}
- Hasta: ${datos.semana.fin}`);

  partes.push(`## PERSONAL
- Total trabajadores: ${datos.personal.totalTrabajadores}
  - Empleados: ${datos.personal.empleados}
  - Contratistas: ${datos.personal.contratistas}
- Fallas: ${datos.personal.fallas}
- Permisos: ${datos.personal.permisos}`);

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
    const { actividades, totalesPorActividad, totalesPorLote, totalGeneral } = datos.jornales;

    // Top 5 actividades y lotes por jornales para reducir prompt
    const topActividades = actividades
      .map((act: string) => ({ nombre: act, jornales: totalesPorActividad[act]?.jornales || 0 }))
      .sort((a: any, b: any) => b.jornales - a.jornales)
      .slice(0, 5);

    const topLotes = Object.entries(totalesPorLote as Record<string, { jornales: number }>)
      .map(([nombre, v]) => ({ nombre, jornales: v.jornales || 0 }))
      .sort((a, b) => b.jornales - a.jornales)
      .slice(0, 5);

    partes.push(`## DISTRIBUCION DE JORNALES
Total general: ${totalGeneral.jornales.toFixed(2)} jornales ($${Math.round(totalGeneral.costo).toLocaleString('es-CO')} COP)

### Top tareas por jornales
${topActividades.map((a: any) => `  - ${a.nombre}: ${a.jornales.toFixed(2)}`).join('\n')}

### Top lotes por jornales
${topLotes.map((l: any) => `  - ${l.nombre}: ${l.jornales.toFixed(2)}`).join('\n')}`);
  }

  if (datos.labores?.programadas?.length > 0) {
    partes.push(`## LABORES PROGRAMADAS`);
    console.log(`[formatearDatosParaPrompt] Processing ${datos.labores.programadas.length} labores`);
    datos.labores.programadas.forEach((labor: any) => {
      console.log(`[formatearDatosParaPrompt] Labor:`, JSON.stringify(labor));
      const tipoTarea = labor.tipoTarea || labor.tipo || 'Sin tipo';
      const lotesStr = (labor.lotes || []).join(', ') || 'Sin lotes';
      partes.push(`### ${labor.nombre} (${tipoTarea})
- Estado: ${labor.estado}
- Fechas: ${labor.fechaInicio} -> ${labor.fechaFin}
- Lotes: ${lotesStr}`);
    });
  }

  if (datos.aplicaciones?.cerradas?.length > 0) {
    partes.push(`## APLICACIONES CERRADAS ESTA SEMANA`);
    datos.aplicaciones.cerradas.forEach((app: any) => {
      const canecasDev = app.general?.canecasBultosDesviacion ?? null;
      const costoDev = app.general?.costoDesviacion ?? null;
      partes.push(`### ${app.nombre} (${app.tipo})
- Proposito: ${app.proposito}
- Canecas/Bultos planeadas: ${app.general?.canecasBultosPlaneados ?? 'N/A'}, reales: ${app.general?.canecasBultosReales ?? 'N/A'}${canecasDev !== null ? `, desviacion: ${canecasDev}%` : ''}
- Costo planeado: $${Math.round(app.general?.costoPlaneado || 0).toLocaleString('es-CO')}, real: $${Math.round(app.general?.costoReal || 0).toLocaleString('es-CO')}${costoDev !== null ? `, desviacion: ${costoDev}%` : ''}`);
    });
  }

  if (datos.aplicaciones?.planeadas?.length > 0) {
    partes.push(`## APLICACIONES PLANEADAS`);
    datos.aplicaciones.planeadas.forEach((app: any) => {
      console.log(`[formatearDatosParaPrompt] App planeada: ${app.nombre}, costoTotal: ${app.costoTotalEstimado}`);
      const costoTotal = app.costoTotalEstimado || 0;
      const costoPorLitroKg = app.costoPorLitroKg || 0;
      const costoPorArbol = app.costoPorArbol || 0;

      const numProductos = app.listaCompras?.length || 0;
      partes.push(`### ${app.nombre} (${app.tipo})
- Proposito: ${app.proposito}
- Blancos biologicos: ${app.blancosBiologicos?.join(', ') || 'N/A'}
- Fecha planeada: ${app.fechaInicioPlaneada}
- Costo total (Pedido + Inventario): $${Math.round(costoTotal).toLocaleString('es-CO')} COP
- Costo por litro/kg: ${costoPorLitroKg > 0 ? '$' + Math.round(costoPorLitroKg).toLocaleString('es-CO') : '—'}
- Costo por arbol: ${costoPorArbol > 0 ? '$' + Math.round(costoPorArbol).toLocaleString('es-CO') : '—'}
- Productos: ${numProductos} items`);
    });
  }

  if (datos.aplicaciones?.activas?.length > 0) {
    partes.push(`## APLICACIONES EN EJECUCION`);
    datos.aplicaciones.activas.forEach((app: any) => {
      partes.push(`### ${app.nombre} (${app.tipo})
- Proposito: ${app.proposito}
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
      ? `Observacion principal: ${mon.fechaActual}${mon.fechaAnterior ? ` - Referencia: ${mon.fechaAnterior}` : ''}`
      : 'Sin monitoreos recientes';
    partes.push(`## MONITOREO FITOSANITARIO
${fechaInfo}${mon.avisoFechaDesactualizada ? `\n${mon.avisoFechaDesactualizada}` : ''}`);

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

    // Sublote-level detail omitted to reduce prompt size — resumenGlobal + vistasPorLote provide sufficient context

    if (mon.insights && mon.insights.length > 0) {
      partes.push(`### Alertas e insights automaticos`);
      mon.insights.forEach((insight: any) => {
        const icono = insight.tipo === 'urgente' ? '[URGENTE]' : insight.tipo === 'atencion' ? '[ATENCION]' : '[OK]';
        partes.push(`  ${icono} ${insight.titulo}: ${insight.descripcion}`);
        if (insight.accion) partes.push(`    -> Accion: ${insight.accion}`);
      });
    }
  }

  // --- New sections: Clima, Floración, CE, Colmenas ---
  if (datos.clima) {
    const c = datos.clima;
    partes.push(`## RESUMEN DEL CLIMA — SEMANA ACTUAL
- Temperatura: min ${c.tempMin ?? '—'}°C, max ${c.tempMax ?? '—'}°C, promedio ${c.tempPromedio ?? '—'}°C
- Lluvia total: ${c.lluviaTotal ?? '—'} mm
- Humedad promedio: ${c.humedadPromedio ?? '—'}%
- Radiacion solar: promedio ${c.radiacionPromedio ?? '—'} W/m2, max ${c.radiacionMax ?? '—'} W/m2

### Lluvia y radiacion diaria`);
    for (const d of (c.diario || [])) {
      partes.push(`  - ${d.fecha}: lluvia ${d.lluviaMm}mm, rad max ${d.radiacionMaxWm2} W/m2, temp ${d.tempMin ?? '—'}–${d.tempMax ?? '—'}°C`);
    }

    // Historical comparison data
    const h = c.historico;
    if (h) {
      partes.push(`\n### PROMEDIO HISTORICO (ultimas ${h.semanasAnalizadas} semanas)
- Temperatura promedio: ${h.tempPromedio ?? '—'}°C
- Lluvia promedio semanal: ${h.lluviaPromSemanal ?? '—'} mm
- Humedad promedio: ${h.humedadPromedio ?? '—'}%
- Radiacion promedio: ${h.radiacionPromedio ?? '—'} W/m2

### COMPARATIVO (semana actual vs historico)
- Lluvia: ${c.lluviaTotal ?? 0}mm esta semana vs ${h.lluviaPromSemanal ?? 0}mm promedio semanal (${h.lluviaPromSemanal && c.lluviaTotal ? (((c.lluviaTotal - h.lluviaPromSemanal) / h.lluviaPromSemanal) * 100).toFixed(0) : '—'}% de diferencia)
- Temperatura: ${c.tempPromedio ?? '—'}°C vs ${h.tempPromedio ?? '—'}°C historico
- Humedad: ${c.humedadPromedio ?? '—'}% vs ${h.humedadPromedio ?? '—'}% historico
- Radiacion: ${c.radiacionPromedio ?? '—'} vs ${h.radiacionPromedio ?? '—'} W/m2 historico`);
    }
  }

  if (datos.floracion?.porLote?.length > 0) {
    partes.push(`## FLORACION POR LOTE`);
    for (const l of datos.floracion.porLote) {
      partes.push(`  - ${l.loteNombre}: Sin flor ${l.pctSinFlor}%, Brotes ${l.pctBrotes}%, Flor madura ${l.pctFlorMadura}%, Cuaje ${l.pctCuaje}% (${l.arboresMonitoreados} arboles)`);
    }
  }

  if (datos.conductividadElectrica?.porLote?.length > 0) {
    partes.push(`## CONDUCTIVIDAD ELECTRICA POR LOTE`);
    for (const l of datos.conductividadElectrica.porLote) {
      partes.push(`  - ${l.loteNombre}: Bajo ${l.pctBajo}%, En rango ${l.pctEnRango}%, Alto ${l.pctAlto}%, promedio ${l.promedio} dS/m (${l.totalLecturas} lecturas)`);
    }
  }

  if (datos.colmenas?.porApiario?.length > 0) {
    const t = datos.colmenas.totales;
    partes.push(`## COLMENAS
Totales: ${t.total} colmenas — ${t.fuertes} fuertes (${t.pctFuertes}%), ${t.debiles} debiles, ${t.muertas} muertas, ${t.conReina} con reina`);
    for (const a of datos.colmenas.porApiario) {
      partes.push(`  - ${a.apiarioNombre}: ${a.fuertes}F / ${a.debiles}D / ${a.muertas}M / ${a.conReina}R (total ${a.total})`);
    }
  }

  if (datos.temasAdicionales?.length > 0) {
    partes.push(`## TEMAS ADICIONALES`);
    datos.temasAdicionales.forEach((bloque: any, i: number) => {
      if (bloque.tipo === 'texto') {
        partes.push(`### ${bloque.titulo || `Tema ${i + 1}`}\n${bloque.contenido}`);
      } else if (bloque.tipo === 'imagen_con_texto') {
        partes.push(`### ${bloque.titulo || `Imagen ${i + 1}`}\n[IMAGEN incluida en base64]\nDescripcion: ${bloque.descripcion}`);
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
// LLAMADA A LLM
// ============================================================================

async function llamarLLM(datosFormateados: string, instruccionesAdicionales?: string): Promise<{ analisis: AnalisisGemini; tokens: number }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no esta configurada en las variables de entorno');
  }

  const model = 'google/gemini-3.1-flash-lite-preview';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const userMessage = instruccionesAdicionales
    ? `${datosFormateados}\n\n## INSTRUCCIONES ADICIONALES DEL USUARIO\n${instruccionesAdicionales}`
    : datosFormateados;

  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Analiza estos datos operativos semanales y genera el JSON de analisis:\n\n${userMessage}` },
    ],
    temperature: 0.3,
    max_tokens: 4096,
    top_p: 0.8,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

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
      throw new Error('La API no respondio en 30 segundos. Intenta de nuevo.');
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
    throw new Error('La API no retorno respuesta. Posible error de contenido o limite.');
  }

  const finishReason = choice.finish_reason;
  console.log('LLM finishReason:', finishReason);

  if (finishReason === 'content_filter') {
    throw new Error('La API bloqueo la respuesta por filtros de contenido.');
  }

  const text = choice.message?.content || '';

  if (!text) {
    throw new Error('La API no genero contenido de texto en la respuesta.');
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
      resumen_ejecutivo: 'Semana operativa procesada. Consulte los datos del reporte para detalles especificos.',
      titulares: {
        personal: 'Datos de personal disponibles en esta seccion',
        labores: 'Labores programadas para la semana',
        jornales: 'Distribucion de jornales por actividad y lote',
        monitoreo: 'Estado fitosanitario de los cultivos',
        aplicaciones: 'Estado de aplicaciones fitosanitarias',
      },
      conclusiones: [
        { texto: 'Revisar los indicadores detallados en las secciones del reporte', prioridad: 'media' as const, contexto: '' },
        { texto: 'Verificar el avance de las aplicaciones en curso', prioridad: 'media' as const, contexto: '' },
        { texto: 'Monitorear la evolucion fitosanitaria en la proxima semana', prioridad: 'media' as const, contexto: '' },
      ],
      interpretacion_monitoreo: 'Consulte la seccion de monitoreo para detalles sobre las tendencias fitosanitarias.',
      interpretacion_tendencias_monitoreo: 'Sin analisis disponible para esta semana.',
    };
  }

  if (!analisis.resumen_ejecutivo) analisis.resumen_ejecutivo = 'Semana operativa procesada.';
  if (!analisis.titulares) {
    analisis.titulares = {
      personal: 'Resumen de personal',
      labores: 'Labores programadas',
      jornales: 'Distribucion de jornales',
      monitoreo: 'Estado fitosanitario',
      aplicaciones: 'Aplicaciones fitosanitarias',
    };
  }
  if (!Array.isArray(analisis.conclusiones) || analisis.conclusiones.length === 0) {
    analisis.conclusiones = [{ texto: 'Revisar los indicadores del reporte', prioridad: 'media', contexto: '' }];
  }
  if (!analisis.interpretacion_monitoreo) analisis.interpretacion_monitoreo = '';
  if (!analisis.interpretacion_tendencias_monitoreo) analisis.interpretacion_tendencias_monitoreo = '';

  const tokens = result.usage?.total_tokens || 0;
  console.log('LLM response: analysis parsed, tokens:', tokens);

  return { analisis, tokens };
}

// ============================================================================
// DESIGN SYSTEM — HELPERS
// ============================================================================

function formatCOP(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO');
}

function fmtN(n: number | null | undefined, d = 1): string {
  if (n == null || isNaN(Number(n))) return '—';
  return Number(n).toFixed(d);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function desvColor(pct: number): string {
  const a = Math.abs(pct);
  if (a <= 10) return '#16a34a';
  if (a <= 25) return '#b45309';
  return '#dc2626';
}

function desvBg(pct: number): string {
  const a = Math.abs(pct);
  if (a <= 10) return '#f0fdf4';
  if (a <= 25) return '#fffbeb';
  return '#fef2f2';
}

function incBg(inc: number | null): string {
  if (inc === null || inc === 0) return '#ffffff';
  if (inc < 10) return '#fefce8';
  if (inc < 20) return '#fff7ed';
  return '#fef2f2';
}

function hmBg(val: number, mx: number): string {
  if (val === 0 || mx === 0) return '#ffffff';
  const t = Math.min(val / mx, 1);
  // Gradient from white to brand green (#73991C = rgb(115,153,28))
  return `rgb(${Math.round(255 - t * 140)},${Math.round(255 - t * 102)},${Math.round(255 - t * 227)})`;
}

function hmTx(val: number, mx: number): string {
  return mx > 0 && (val / mx) > 0.55 ? '#ffffff' : '#172E08';
}

function tendArrow(t: string): string {
  if (t === 'subiendo') return '<span style="color:#dc2626;font-weight:700;">&#8593;</span>';
  if (t === 'bajando') return '<span style="color:#16a34a;font-weight:700;">&#8595;</span>';
  if (t === 'estable') return '<span style="color:#d97706;font-weight:700;">&#8594;</span>';
  return '';
}

function tendCell(actual: number | null, anterior: number | null, tendencia: string): string {
  if (actual === null) return '<span style="color:#d1d5db;">Sin datos</span>';
  const arrow = tendArrow(tendencia);
  if (anterior === null || tendencia === 'sin_referencia') {
    return `<span style="font-weight:600;">${fmtN(actual)}%</span>`;
  }
  return `<span style="font-weight:600;">${fmtN(actual)}%</span> ${arrow}<span style="color:#9ca3af;font-size:0.9em;">(era ${fmtN(anterior)}%)</span>`;
}

// ============================================================================
// DESIGN SYSTEM — SLIDE SHELL
// ============================================================================

const CSS = {
  hdr: 'height:38px;background:#73991C;display:flex;align-items:center;justify-content:space-between;padding:0 40px;flex-shrink:0;',
  hdrL: 'color:rgba(255,255,255,0.9);font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;',
  hdrR: 'color:rgba(255,255,255,0.55);font-size:11px;font-weight:400;',
  body: 'flex:1;display:flex;flex-direction:column;padding:20px 40px 16px;overflow:hidden;',
  h1: 'font-size:22px;font-weight:700;color:#172E08;line-height:1.35;margin:0 0 14px;',
  sub: 'font-size:12px;color:#6b7280;margin-top:-10px;margin-bottom:12px;',
  thGreen: 'padding:8px 10px;font-size:11px;font-weight:600;color:#ffffff;background:#73991C;text-align:left;border-bottom:2px solid #5f7d17;',
  thGreenC: 'padding:8px 10px;font-size:11px;font-weight:600;color:#ffffff;background:#73991C;text-align:center;border-bottom:2px solid #5f7d17;',
  thGreenR: 'padding:8px 10px;font-size:11px;font-weight:600;color:#ffffff;background:#73991C;text-align:right;border-bottom:2px solid #5f7d17;',
  td: 'padding:7px 10px;font-size:12px;color:#4D240F;border-bottom:1px solid #E7EDDD;',
  tdC: 'padding:7px 10px;font-size:12px;color:#4D240F;border-bottom:1px solid #E7EDDD;text-align:center;',
  tdR: 'padding:7px 10px;font-size:12px;color:#4D240F;border-bottom:1px solid #E7EDDD;text-align:right;',
};

function hdr(seccion: string, semana: any): string {
  return `<div style="${CSS.hdr}"><span style="${CSS.hdrL}">${seccion}</span><span style="${CSS.hdrR}">ESCOCIA HASS &middot; S${semana.numero}/${semana.ano} &middot; ${semana.inicio} — ${semana.fin}</span></div>`;
}

function slide(seccion: string, semana: any, content: string, isFirst = false): string {
  return `<div class="slide${isFirst ? '' : ' page-break'}">${hdr(seccion, semana)}<div style="${CSS.body}">${content}</div></div>`;
}

function headline(text: string): string {
  return `<div style="${CSS.h1}">${text}</div>`;
}

function kpiCard(value: string, label: string, sub: string, accent: string): string {
  return `<div style="flex:1;background:#ffffff;border-radius:8px;padding:16px 12px;text-align:center;border:1px solid #E7EDDD;border-top:2px solid ${accent};">
    <div style="font-size:28px;font-weight:800;color:${accent};line-height:1;">${value}</div>
    <div style="font-size:12px;font-weight:600;color:#4D240F;margin-top:6px;">${label}</div>
    <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${sub}</div>
  </div>`;
}

function callout(content: string, borderColor = '#73991C', bgColor = '#F8FAF5'): string {
  return `<div style="background:${bgColor};border-left:3px solid ${borderColor};border-radius:0 6px 6px 0;padding:14px 18px;font-size:13px;color:#4D240F;line-height:1.65;">${content}</div>`;
}

// ============================================================================
// SLIDE BUILDERS
// ============================================================================

function construirSlidePortada(datos: any, analisis: AnalisisGemini): string {
  const { semana, personal, jornales, aplicaciones, monitoreo } = datos;
  const totalJ = jornales?.totalGeneral?.jornales || 0;
  const costoTotal = jornales?.totalGeneral?.costo || 0;
  const trabajadores = personal?.totalTrabajadores || 0;
  const appsActivas = aplicaciones?.activas?.length || 0;
  const alertas = monitoreo?.insights?.filter((i: any) => i.tipo === 'urgente' || i.tipo === 'atencion')?.length || 0;

  const kpis = [
    kpiCard(fmtN(totalJ, 1), 'Jornales', 'trabajados', '#73991C'),
    kpiCard(formatCOP(costoTotal), 'Costo Total', 'mano de obra', '#4D240F'),
    kpiCard(String(trabajadores), 'Trabajadores', `${personal?.empleados || 0} emp &middot; ${personal?.contratistas || 0} cont`, '#4D240F'),
    kpiCard(String(appsActivas), 'Aplicaciones', 'en ejecucion', '#b45309'),
    kpiCard(String(alertas), 'Alertas', 'fitosanitarias', alertas > 0 ? '#dc2626' : '#16a34a'),
  ].join('');

  return `<div class="slide">
  <div style="background:linear-gradient(135deg,#73991C 0%,#5f7d17 50%,#73991C 100%);height:200px;display:flex;flex-direction:column;justify-content:center;padding:0 48px;">
    <div style="font-size:40px;font-weight:900;color:#ffffff;letter-spacing:1px;line-height:1;">ESCOCIA HASS</div>
    <div style="font-size:19px;font-weight:500;color:rgba(255,255,255,0.85);margin-top:10px;">Informe Semanal — Semana ${semana.numero}/${semana.ano}</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:6px;">${semana.inicio} — ${semana.fin}</div>
  </div>
  <div style="padding:20px 40px 0;">
    <div style="display:flex;gap:14px;margin-bottom:20px;">${kpis}</div>
    ${callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;">Resumen Ejecutivo</div>${analisis.resumen_ejecutivo}`)}
  </div>
</div>`;
}

function construirSlidePersonal(datos: any, analisis: AnalisisGemini): string {
  const { semana, personal } = datos;
  const p = personal || {};
  const jT = datos.jornales?.totalGeneral?.jornales || 0;
  const jP = p.jornalesPosibles || ((p.totalTrabajadores || 0) * 5.5);
  const eff = jP > 0 ? Math.round((jT / jP) * 100) : 0;

  const row1 = [
    kpiCard(String(p.totalTrabajadores || 0), 'Trabajadores', 'activos', '#73991C'),
    kpiCard(String(p.fallas || 0), 'Fallas', 'ausencias', (p.fallas || 0) > 0 ? '#dc2626' : '#16a34a'),
    kpiCard(String(p.permisos || 0), 'Permisos', 'autorizados', '#6b7280'),
    kpiCard(`${eff}%`, 'Eficiencia', `${fmtN(jT, 1)} de ${jP} jornales`, eff >= 90 ? '#16a34a' : eff >= 70 ? '#b45309' : '#dc2626'),
  ].join('');

  const row2 = [
    kpiCard(String(p.ingresos || 0), 'Ingresos', 'nuevos', '#4D240F'),
    kpiCard(String(p.retiros || 0), 'Retiros', 'salidas', (p.retiros || 0) > 0 ? '#dc2626' : '#6b7280'),
    kpiCard(fmtN(jT, 1), 'Jornales', 'trabajados', '#73991C'),
    kpiCard(String(jP), 'Posibles', 'jornales', '#6b7280'),
  ].join('');

  let detailHTML = '';
  const hasFallas = p.detalleFallas?.length > 0;
  const hasPermisos = p.detallePermisos?.length > 0;
  const detailCount = (p.detalleFallas?.length || 0) + (p.detallePermisos?.length || 0);
  const isLightContent = detailCount <= 2;

  if (hasFallas || hasPermisos) {
    const fallasHTML = hasFallas ? `<div style="flex:1;">
      <div style="font-size:11px;font-weight:700;color:#dc2626;letter-spacing:1px;margin-bottom:6px;">FALLAS (${p.detalleFallas.length})</div>
      ${p.detalleFallas.map((f: any) => `<div style="font-size:12px;color:#4D240F;padding:4px 0;border-bottom:1px solid #E7EDDD;"><strong>${f.empleado || f.nombre || '—'}</strong> <span style="color:#9ca3af;">${f.razon || f.motivo || ''}</span></div>`).join('')}
    </div>` : '';

    const permisosHTML = hasPermisos ? `<div style="flex:1;">
      <div style="font-size:11px;font-weight:700;color:#b45309;letter-spacing:1px;margin-bottom:6px;">PERMISOS (${p.detallePermisos.length})</div>
      ${p.detallePermisos.map((f: any) => `<div style="font-size:12px;color:#4D240F;padding:4px 0;border-bottom:1px solid #E7EDDD;"><strong>${f.empleado || f.nombre || '—'}</strong> <span style="color:#9ca3af;">${f.razon || f.motivo || ''}</span></div>`).join('')}
    </div>` : '';

    detailHTML = `<div style="display:flex;gap:32px;margin-top:16px;">${fallasHTML}${permisosHTML}</div>`;
  }

  const kpiPadding = isLightContent ? '24px 16px' : '16px 12px';
  const kpiValueSize = isLightContent ? '36px' : '28px';
  const kpiGap = isLightContent ? '16px' : '12px';
  const kpiMargin = isLightContent ? '16px' : '10px';

  return slide('PERSONAL', semana, `
    <div style="display:flex;flex-direction:column;${isLightContent ? 'justify-content:center;' : ''}flex:1;">
      ${headline(analisis.titulares.personal)}
      <div style="display:flex;gap:${kpiGap};margin-bottom:${kpiMargin};">
        ${row1.replace(/padding:16px 12px/g, `padding:${kpiPadding}`).replace(/font-size:28px/g, `font-size:${kpiValueSize}`)}
      </div>
      <div style="display:flex;gap:${kpiGap};">
        ${row2.replace(/padding:16px 12px/g, `padding:${kpiPadding}`).replace(/font-size:28px/g, `font-size:${kpiValueSize}`)}
      </div>
      ${detailHTML}
    </div>
  `);
}

function construirSlideLaboresProgramadas(datos: any, analisis: AnalisisGemini): string {
  const programadas = datos.labores?.programadas || [];
  if (programadas.length === 0) return '';
  const { semana } = datos;
  const terminadas = programadas.filter((l: any) => l.estado === 'Terminada').length;
  const enProceso = programadas.filter((l: any) => l.estado === 'En proceso').length;
  const porIniciar = programadas.filter((l: any) => l.estado === 'Por iniciar').length;

  const estadoBadge = (estado: string) => {
    const c: Record<string, string> = {
      'Terminada': 'background:#dcfce7;color:#166534;',
      'En proceso': 'background:#fef9c3;color:#854d0e;',
      'Por iniciar': 'background:#E7EDDD;color:#4D240F;',
    };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;${c[estado] || 'background:#E7EDDD;color:#4D240F;'}">${estado}</span>`;
  };

  const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;

  const rows = programadas.slice(0, 10).map((l: any, i: number) =>
    `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#F8FAF5'};">
      <td style="${CSS.td}font-weight:600;color:#172E08;white-space:nowrap;">${trunc(l.nombre || '', 30)}</td>
      <td style="${CSS.td}color:#6b7280;white-space:nowrap;">${trunc(l.tipoTarea || l.tipo || '—', 20)}</td>
      <td style="${CSS.tdC}white-space:nowrap;">${estadoBadge(l.estado)}</td>
      <td style="${CSS.tdC}color:#6b7280;white-space:nowrap;">${l.fechaInicio || '—'}</td>
      <td style="${CSS.tdC}color:#6b7280;white-space:nowrap;">${l.fechaFin || '—'}</td>
      <td style="${CSS.td}color:#6b7280;white-space:nowrap;">${trunc((l.lotes || []).join(', ') || '—', 30)}</td>
    </tr>`
  ).join('');

  return slide('LABORES', semana, `
    ${headline(analisis.titulares.labores)}
    <div style="display:flex;gap:16px;margin-bottom:14px;">
      <span style="font-size:14px;font-weight:700;color:#172E08;">${programadas.length} Total</span>
      <span style="font-size:14px;color:#166534;font-weight:600;">${terminadas} Terminadas</span>
      <span style="font-size:14px;color:#854d0e;font-weight:600;">${enProceso} En Proceso</span>
      ${porIniciar > 0 ? `<span style="font-size:14px;color:#4D240F;font-weight:600;">${porIniciar} Por iniciar</span>` : ''}
    </div>
    <div style="flex:1;overflow:hidden;border-radius:8px;border:1px solid #E7EDDD;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <colgroup>
          <col style="width:25%"/>
          <col style="width:16%"/>
          <col style="width:12%"/>
          <col style="width:12%"/>
          <col style="width:12%"/>
          <col style="width:23%"/>
        </colgroup>
        <thead><tr>
          <th style="${CSS.thGreen}">Nombre</th>
          <th style="${CSS.thGreen}">Tipo</th>
          <th style="${CSS.thGreenC}">Estado</th>
          <th style="${CSS.thGreenC}">Inicio</th>
          <th style="${CSS.thGreenC}">Fin</th>
          <th style="${CSS.thGreen}">Lotes</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

function construirSlidesLaboresMatriz(datos: any, analisis: AnalisisGemini): string[] {
  const jornales = datos.jornales;
  if (!jornales || !jornales.actividades || jornales.actividades.length === 0) return [];
  const { semana } = datos;
  const { actividades, filas, lotes, datos: md, totalesPorActividad, totalesPorLote, totalGeneral } = jornales;

  // Use filas (nombre+tipo) if available, fall back to actividades-only for backward compat
  const rows: Array<{ nombre: string; tipo: string }> = filas && filas.length > 0
    ? filas
    : actividades.map((a: string) => ({ nombre: a, tipo: '' }));

  let mx = 0;
  for (const row of rows) for (const lote of lotes) {
    const v = md[row.nombre]?.[lote]?.jornales || 0;
    if (v > mx) mx = v;
  }

  // Determine if charts fit on same slide (≤8 rows) or need their own slide
  const MAX_ROWS_WITH_CHARTS = 8;
  const chartsSeparate = rows.length > MAX_ROWS_WITH_CHARTS;

  // Build table header
  const hasTipo = rows.some(r => r.tipo && r.tipo !== r.nombre);
  const hCells = lotes.map((l: string) => `<th style="${CSS.thGreenC}min-width:55px;">${l}</th>`).join('');

  // Build table body rows
  let bodyRows = '';
  let prevTipo = '';
  for (const row of rows) {
    let cells = '';
    // Show tipo column with rowspan-like visual grouping
    const tipoCell = hasTipo
      ? `<td style="padding:6px 8px;font-size:11px;color:#6b7280;border-bottom:1px solid #E7EDDD;background:#F8FAF5;white-space:nowrap;${row.tipo !== prevTipo ? 'border-top:1px solid #BFD97D;' : ''}">${row.tipo !== prevTipo ? row.tipo : ''}</td>`
      : '';
    prevTipo = row.tipo;

    for (const lote of lotes) {
      const v = md[row.nombre]?.[lote]?.jornales || 0;
      cells += `<td style="padding:5px 6px;text-align:center;font-size:12px;font-weight:${v > 0 ? '600' : '400'};background:${hmBg(v, mx)};color:${hmTx(v, mx)};border-bottom:1px solid #E7EDDD;">${v > 0 ? fmtN(v) : '—'}</td>`;
    }
    const tot = totalesPorActividad[row.nombre]?.jornales || 0;
    cells += `<td style="padding:5px 6px;text-align:center;font-size:12px;font-weight:700;background:#f0fdf4;color:#172E08;border-bottom:1px solid #E7EDDD;">${fmtN(tot)}</td>`;
    const nombreTrunc = row.nombre.length > 26 ? row.nombre.slice(0, 25) + '…' : row.nombre;
    bodyRows += `<tr>${tipoCell}<td style="padding:5px 8px;font-size:12px;font-weight:600;color:#172E08;border-bottom:1px solid #E7EDDD;white-space:nowrap;">${nombreTrunc}</td>${cells}</tr>`;
  }

  // Total row
  let totCells = '';
  if (hasTipo) totCells += `<td style="padding:5px 8px;background:#E7EDDD;border-top:2px solid #73991C;"></td>`;
  for (const lote of lotes) {
    const v = totalesPorLote[lote]?.jornales || 0;
    totCells += `<td style="padding:5px 6px;text-align:center;font-size:12px;font-weight:700;background:#E7EDDD;color:#172E08;border-top:2px solid #73991C;">${fmtN(v)}</td>`;
  }
  totCells += `<td style="padding:5px 6px;text-align:center;font-size:14px;font-weight:900;background:#73991C;color:#ffffff;border-top:2px solid #5f7d17;">${fmtN(totalGeneral.jornales)}</td>`;
  bodyRows += `<tr><td style="padding:5px 8px;font-size:12px;font-weight:800;color:#73991C;background:#E7EDDD;border-top:2px solid #73991C;">TOTAL</td>${totCells}</tr>`;

  // Table header row
  const thTipo = hasTipo ? `<th style="${CSS.thGreen}min-width:90px;">Tipo</th>` : '';

  const tableHTML = `
    <div style="border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${thTipo}<th style="${CSS.thGreen}">Nombre</th>${hCells}<th style="${CSS.thGreenC}background:#5f7d17;">Total</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;

  // Bar charts
  const nameOrd = [...actividades].sort((a: string, b: string) => (totalesPorActividad[b]?.jornales || 0) - (totalesPorActividad[a]?.jornales || 0));
  const loteOrd = [...lotes].sort((a: string, b: string) => (totalesPorLote[b]?.jornales || 0) - (totalesPorLote[a]?.jornales || 0));
  const mxN = Math.max(...nameOrd.map((a: string) => totalesPorActividad[a]?.jornales || 0), 1);
  const mxL = Math.max(...loteOrd.map((l: string) => totalesPorLote[l]?.jornales || 0), 1);

  const truncLabel = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;

  const bar = (items: string[], getData: (k: string) => number, maxV: number, color: string) =>
    items.slice(0, 8).map((k: string) => {
      const v = getData(k);
      const pct = (v / maxV) * 100;
      const label = truncLabel(k, 24);
      return `<div style="display:flex;align-items:center;margin-bottom:8px;">
        <div style="width:180px;font-size:11px;font-weight:500;color:#4D240F;text-align:right;padding-right:10px;flex-shrink:0;white-space:nowrap;">${label}</div>
        <div style="flex:1;background:#E7EDDD;border-radius:3px;height:22px;position:relative;overflow:hidden;">
          <div style="background:${color};height:100%;border-radius:3px;width:${Math.max(pct, 2)}%;"></div>
          <span style="position:absolute;left:6px;top:2px;font-size:11px;font-weight:600;color:${pct > 35 ? '#fff' : '#4D240F'};">${fmtN(v, 1)}</span>
        </div>
      </div>`;
    }).join('');

  const chartsHTML = `
    <div style="display:flex;gap:32px;flex:1;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:#4D240F;letter-spacing:1px;margin-bottom:6px;">POR TAREA</div>
        ${bar(nameOrd, (a: string) => totalesPorActividad[a]?.jornales || 0, mxN, '#73991C')}
      </div>
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:700;color:#4D240F;letter-spacing:1px;margin-bottom:6px;">POR LOTE</div>
        ${bar(loteOrd, (l: string) => totalesPorLote[l]?.jornales || 0, mxL, '#73991C')}
      </div>
    </div>`;

  const slides: string[] = [];

  if (chartsSeparate) {
    // Slide 1: Table only
    slides.push(slide('JORNALES — MATRIZ', semana, `
      ${headline(analisis.titulares.jornales)}
      <div style="flex:1;overflow:hidden;">${tableHTML}</div>
    `));
    // Slide 2: Charts only
    slides.push(slide('JORNALES — DISTRIBUCIÓN', semana, `
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;">${chartsHTML}</div>
    `));
  } else {
    // Single slide: table + charts
    slides.push(slide('JORNALES', semana, `
      ${headline(analisis.titulares.jornales)}
      <div style="flex:1;display:flex;flex-direction:column;gap:16px;overflow:hidden;">
        ${tableHTML}
        ${chartsHTML}
      </div>
    `));
  }

  return slides;
}

// ============================================================================
// MONITOREO SLIDES
// ============================================================================

function monitoreoLegend(): string {
  return `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px;">
    <span style="font-size:10px;color:#6b7280;font-weight:600;">INCIDENCIA:</span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:12px;height:12px;background:#ffffff;border:1px solid #d1d5db;border-radius:2px;"></span><span style="font-size:10px;color:#6b7280;">0%</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:12px;height:12px;background:#fefce8;border-radius:2px;"></span><span style="font-size:10px;color:#6b7280;">&lt;10%</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:12px;height:12px;background:#fff7ed;border-radius:2px;"></span><span style="font-size:10px;color:#6b7280;">&lt;20%</span></span>
    <span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:12px;height:12px;background:#fef2f2;border-radius:2px;"></span><span style="font-size:10px;color:#6b7280;">&ge;20%</span></span>
    <span style="margin-left:8px;font-size:10px;color:#6b7280;font-weight:600;">TENDENCIA:</span>
    <span style="font-size:10px;color:#dc2626;">&#8593; Subiendo</span>
    <span style="font-size:10px;color:#16a34a;">&#8595; Bajando</span>
    <span style="font-size:10px;color:#d97706;">&#8594; Estable</span>
  </div>`;
}

function construirSlidesMonitoreoTendencias(datos: any, analisis: AnalisisGemini): string[] {
  const mon = datos.monitoreo;
  if (!mon) return [];
  const resumenRaw: any[] = mon.resumenGlobal || [];
  const resumen = resumenRaw.filter((r: any) =>
    r.promedioActual !== null || r.minLote !== null || r.maxLote !== null
  );
  if (resumen.length === 0 && !mon.avisoFechaDesactualizada) return [];
  const { semana } = datos;

  let fechaBanner = '';
  if (mon.avisoFechaDesactualizada) {
    fechaBanner += `<div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:6px;padding:8px 14px;margin-bottom:10px;font-size:12px;color:#92400e;font-weight:500;">${mon.avisoFechaDesactualizada}</div>`;
  }
  if (mon.fechaActual) {
    const ref = mon.fechaAnterior ? ` &middot; Referencia: ${mon.fechaAnterior}` : '';
    fechaBanner += `<div style="font-size:12px;color:#6b7280;margin-bottom:10px;">Monitoreo: <strong>${mon.fechaActual}</strong>${ref}</div>`;
  }

  const geminiText = analisis.interpretacion_monitoreo || analisis.interpretacion_tendencias_monitoreo || '';
  const analysisBox = geminiText ? callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:0.5px;margin-bottom:4px;">ANALISIS</div><div style="font-size:12px;line-height:1.5;">${geminiText}</div>`) : '';

  const MAX_ROWS = 13;
  const slides: string[] = [];

  for (let i = 0; i < resumen.length; i += MAX_ROWS) {
    const chunk = resumen.slice(i, i + MAX_ROWS);
    const isFirst = i === 0;
    const isLast = i + MAX_ROWS >= resumen.length;

    // Scale row padding based on how many rows to fill space better
    const rowPadY = chunk.length <= 6 ? '12px 10px' : chunk.length <= 9 ? '9px 10px' : '7px 10px';
    const rowFontSize = chunk.length <= 6 ? '13px' : chunk.length <= 9 ? '12px' : '11px';

    const rows = chunk.map((r: any, idx: number) => {
      const bg = incBg(r.promedioActual);
      const rango = r.minLote !== null && r.maxLote !== null ? `${fmtN(r.minLote)}%–${fmtN(r.maxLote)}%` : '—';
      return `<tr style="background:${idx % 2 === 0 ? '#ffffff' : '#F8FAF5'};">
        <td style="padding:${rowPadY};font-size:${rowFontSize};color:#172E08;font-weight:600;border-bottom:1px solid #E7EDDD;">${r.plagaNombre}</td>
        <td style="padding:${rowPadY};font-size:${rowFontSize};text-align:center;font-weight:700;background:${bg};border-bottom:1px solid #E7EDDD;">${r.promedioActual !== null ? fmtN(r.promedioActual) + '%' : '—'}</td>
        <td style="padding:${rowPadY};font-size:${rowFontSize};text-align:center;border-bottom:1px solid #E7EDDD;">${rango}</td>
        <td style="padding:${rowPadY};font-size:${rowFontSize};border-bottom:1px solid #E7EDDD;">${tendCell(r.promedioActual, r.promedioAnterior, r.tendencia)}</td>
      </tr>`;
    }).join('');

    const table = `<div style="flex:1;border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>
          <th style="${CSS.thGreen}">Plaga</th>
          <th style="${CSS.thGreenC}">Incidencia Promedio</th>
          <th style="${CSS.thGreenC}">Rango (Min–Max)</th>
          <th style="${CSS.thGreen}">Tendencia</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

    // Show analysis on any slide with spare space (few rows), not just the last
    const hasSpareSpace = chunk.length <= 8;
    const showAnalysis = isLast || (hasSpareSpace && analysisBox);

    const content = `
      ${isFirst ? headline(analisis.titulares.monitoreo) : '<div style="font-size:13px;color:#6b7280;margin-bottom:10px;">...continuacion</div>'}
      ${isFirst ? fechaBanner : ''}
      ${table}
      ${monitoreoLegend()}
      ${showAnalysis ? `<div style="margin-top:10px;">${analysisBox}</div>` : ''}
    `;
    slides.push(slide('MONITOREO', semana, content, slides.length === 0));
  }

  if (slides.length === 0 && mon.avisoFechaDesactualizada) {
    slides.push(slide('MONITOREO', semana, `
      ${headline(analisis.titulares.monitoreo)}
      ${fechaBanner}
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px;">Sin datos de monitoreo para esta semana</div>
    `));
  }

  return slides;
}

function construirSlideMonitoreoPorLote(datos: any): string {
  const mon = datos.monitoreo;
  if (!mon) return '';
  const vistas: any[] = mon.vistasPorLote || [];
  if (vistas.length === 0) return '';
  const { semana } = datos;

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

  const headerCols = vistas.map((l: any) =>
    `<th style="padding:8px 6px;font-size:10px;font-weight:600;color:#fff;background:#5f7d17;text-align:center;border-bottom:2px solid #172E08;">${l.loteNombre}</th>`
  ).join('');

  const fechaCols = vistas.map((l: any) => {
    const f = l.fechaUltimaObservacion;
    return `<td style="padding:5px 6px;text-align:center;font-size:10px;font-weight:500;color:#6b7280;background:#F8FAF5;border-bottom:1px solid #E7EDDD;">${f ? f.slice(5).replace('-', '/') : '—'}</td>`;
  }).join('');

  const plagaRows = allPlagas.map((plaga: string) => {
    const isInt = interestSet.has(plaga);
    const cells = vistas.map((lote: any) => {
      const p = (lote.plagas || []).find((x: any) => x.plagaNombre === plaga);
      if (!p || p.actual === null) return `<td style="padding:8px 6px;text-align:center;font-size:11px;border-bottom:1px solid #E7EDDD;color:#d1d5db;">—</td>`;
      const bg = incBg(p.actual);
      const arrow = p.tendencia === 'subiendo' ? ' (&#8593;)' : p.tendencia === 'bajando' ? ' (&#8595;)' : p.tendencia === 'estable' ? ' (&#8594;)' : '';
      return `<td style="padding:8px 6px;text-align:center;font-size:11px;font-weight:600;background:${bg};border-bottom:1px solid #E7EDDD;">${fmtN(p.actual)}%${arrow}</td>`;
    }).join('');
    return `<tr><td style="padding:8px 6px;font-size:11px;font-weight:${isInt ? '700' : '500'};color:#172E08;background:#F8FAF5;border-bottom:1px solid #E7EDDD;white-space:nowrap;${isInt ? 'border-left:3px solid #73991C;' : ''}">${plaga}</td>${cells}</tr>`;
  }).join('');

  return slide('MONITOREO', semana, `
    <div style="font-size:16px;font-weight:700;color:#172E08;margin-bottom:12px;">Vista por Lote</div>
    <div style="flex:1;overflow:hidden;border-radius:8px;border:1px solid #E7EDDD;">
      <table style="width:100%;table-layout:fixed;border-collapse:collapse;">
        <thead>
          <tr><th style="padding:8px 6px;font-size:10px;font-weight:600;color:#fff;background:#5f7d17;text-align:left;width:20%;border-bottom:2px solid #172E08;">Plaga</th>${headerCols}</tr>
          <tr><td style="padding:4px 6px;font-size:10px;font-weight:600;color:#6b7280;background:#F8FAF5;border-bottom:1px solid #E7EDDD;">Fecha</td>${fechaCols}</tr>
        </thead>
        <tbody>${plagaRows}</tbody>
      </table>
    </div>
  `);
}

function construirSlideMonitoreoPorSublote(loteVista: any, semana: any): string {
  if (!loteVista) return '';
  if (loteVista.sinDatos) return '';

  const sublotes: string[] = loteVista.sublotes || [];
  const plagas: string[] = loteVista.plagas || [];
  const celdas = loteVista.celdas || {};
  if (sublotes.length === 0 || plagas.length === 0) return '';

  // Skip sublote slides where ALL cells are null (no data)
  let hasAnyData = false;
  for (const plaga of plagas) {
    for (const sl of sublotes) {
      const c = celdas[plaga]?.[sl];
      if (c && c.actual !== null && c.actual !== undefined) {
        hasAnyData = true;
        break;
      }
    }
    if (hasAnyData) break;
  }
  if (!hasAnyData) return '';

  const subHeaders = sublotes.map((sl: string) =>
    `<th style="${CSS.thGreenC}min-width:80px;">${sl}</th>`
  ).join('');

  const bodyRows = plagas.map((plaga: string, i: number) => {
    const cells = sublotes.map((sl: string) => {
      const c = celdas[plaga]?.[sl];
      if (!c || c.actual === null) return `<td style="${CSS.tdC}color:#d1d5db;">—</td>`;
      const bg = incBg(c.actual);
      return `<td style="${CSS.tdC}font-weight:600;background:${bg};">${tendCell(c.actual, c.anterior, c.tendencia)}</td>`;
    }).join('');
    return `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#F8FAF5'};"><td style="${CSS.td}font-weight:600;color:#172E08;white-space:nowrap;">${plaga}</td>${cells}</tr>`;
  }).join('');

  return slide('MONITOREO', semana, `
    <div style="font-size:16px;font-weight:700;color:#172E08;margin-bottom:12px;">Sublotes — ${loteVista.loteNombre}</div>
    <div style="flex:1;overflow:hidden;border-radius:8px;border:1px solid #E7EDDD;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="${CSS.thGreen}">Plaga</th>${subHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    ${monitoreoLegend()}
  `);
}

// ============================================================================
// APLICACIONES SLIDES
// ============================================================================

function construirSlideAplicacionesActivas(datos: any, analisis: AnalisisGemini): string {
  const activas = datos.aplicaciones?.activas || [];
  if (activas.length === 0) return '';
  const { semana } = datos;

  const cards = activas.map((app: any) => {
    const pct = app.porcentajeGlobal || 0;
    const barColor = pct >= 80 ? '#16a34a' : pct >= 40 ? '#b45309' : '#dc2626';

    const lotes = app.progresoPorLote || [];
    const loteBars = lotes.map((l: any) => {
      const lp = Math.round((l.porcentaje || 0) * 10) / 10;
      return `<div style="display:flex;align-items:center;margin-bottom:16px;">
        <div style="width:180px;font-size:12px;font-weight:500;color:#4D240F;text-align:right;padding-right:10px;flex-shrink:0;">${l.loteNombre}</div>
        <div style="flex:1;background:#E7EDDD;border-radius:4px;height:32px;position:relative;overflow:hidden;">
          <div style="background:${lp >= 100 ? '#16a34a' : lp >= 50 ? '#73991C' : '#BFD97D'};height:100%;border-radius:4px;width:${Math.min(lp, 100)}%;"></div>
          <span style="position:absolute;left:8px;top:7px;font-size:12px;font-weight:600;color:${lp > 50 ? '#fff' : '#4D240F'};">${fmtN(l.ejecutado, 1)}/${fmtN(l.planeado, 1)} (${fmtN(lp)}%)</span>
        </div>
      </div>`;
    }).join('');

    return `<div style="flex:1;background:#ffffff;border-radius:8px;border:1px solid #E7EDDD;padding:20px;display:flex;flex-direction:column;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
        <div>
          <div style="font-size:18px;font-weight:700;color:#172E08;">${app.nombre}</div>
          <span style="font-size:12px;color:#6b7280;margin-top:4px;display:block;">${app.tipo} &middot; ${app.proposito || ''}</span>
        </div>
        <div style="font-size:28px;font-weight:800;color:${barColor};">${fmtN(pct)}%</div>
      </div>
      <div style="background:#E7EDDD;border-radius:4px;height:24px;overflow:hidden;position:relative;margin-bottom:20px;">
        <div style="background:${barColor};height:100%;border-radius:4px;width:${Math.min(pct, 100)}%;"></div>
        <span style="position:absolute;left:50%;top:4px;transform:translateX(-50%);font-size:12px;font-weight:600;color:${pct > 45 ? '#fff' : '#4D240F'};">${fmtN(app.totalEjecutado, 1)}/${fmtN(app.totalPlaneado, 1)} ${app.unidad}</span>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:flex-start;">${loteBars}</div>
    </div>`;
  }).join('');

  return slide('APLICACIONES', semana, `
    ${headline(analisis.titulares.aplicaciones)}
    <div style="display:flex;gap:16px;overflow:hidden;">${cards}</div>
  `);
}

function construirSlideCierreGeneral(app: any, semana: any): string {
  const g = app.general || {};
  const cP = g.canecasBultosPlaneados ?? 0;
  const cR = g.canecasBultosReales ?? 0;
  const cD = g.canecasBultosDesviacion ?? 0;
  const $P = g.costoPlaneado || 0;
  const $R = g.costoReal || 0;
  const $D = g.costoDesviacion || 0;

  const kpiBlock = (label: string, plan: string, real: string, desv: number, unit: string) => `
    <div style="flex:1;background:#ffffff;border-radius:8px;border:1px solid #E7EDDD;padding:16px;">
      <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:10px;text-transform:uppercase;">${label}</div>
      <div style="display:flex;gap:16px;align-items:flex-end;">
        <div><div style="font-size:10px;color:#9ca3af;">Plan</div><div style="font-size:22px;font-weight:800;color:#4D240F;">${plan}</div><div style="font-size:10px;color:#9ca3af;">${unit}</div></div>
        <div><div style="font-size:10px;color:#9ca3af;">Real</div><div style="font-size:22px;font-weight:800;color:#4D240F;">${real}</div><div style="font-size:10px;color:#9ca3af;">${unit}</div></div>
        <div style="background:${desvBg(desv)};border-radius:6px;padding:4px 10px;">
          <div style="font-size:10px;color:#9ca3af;">Desv.</div>
          <div style="font-size:18px;font-weight:800;color:${desvColor(desv)};">${fmtPct(desv)}</div>
        </div>
      </div>
    </div>`;

  const rows = (app.kpiPorLote || []).slice(0, 8).map((l: any, i: number) => {
    const fin = (app.financieroPorLote || [])[i] || {};
    const isT = l.loteNombre === 'TOTAL';
    return `<tr style="background:${isT ? '#E7EDDD' : i % 2 === 0 ? '#fff' : '#F8FAF5'};">
      <td style="${CSS.td}font-weight:${isT ? '800' : '600'};color:${isT ? '#73991C' : '#172E08'};">${l.loteNombre}</td>
      <td style="${CSS.tdC}">${fmtN(l.canecasPlaneadas, 1)}</td>
      <td style="${CSS.tdC}">${fmtN(l.canecasReales, 1)}</td>
      <td style="${CSS.tdC}color:${desvColor(l.canecasDesviacion ?? 0)};font-weight:600;">${fmtPct(l.canecasDesviacion)}</td>
      <td style="${CSS.tdR}">${formatCOP(fin.costoTotalPlaneado || 0)}</td>
      <td style="${CSS.tdR}">${formatCOP(fin.costoTotalReal || 0)}</td>
      <td style="${CSS.tdC}color:${desvColor(fin.costoTotalDesviacion ?? 0)};font-weight:600;">${fmtPct(fin.costoTotalDesviacion)}</td>
    </tr>`;
  }).join('');

  const insumos: any[] = app.listaInsumos || [];
  const insumosHTML = insumos.length > 0 ? `<div style="background:#F8FAF5;border-radius:6px;padding:10px 12px;border:1px solid #E7EDDD;">
    <div style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:6px;">INSUMOS UTILIZADOS</div>
    ${insumos.slice(0, 6).map((ins: any) => `<div style="font-size:11px;color:#4D240F;padding:2px 0;">${ins.nombre} <span style="color:#9ca3af;">${ins.categoria}</span></div>`).join('')}
  </div>` : '';

  return slide('CIERRE', semana, `
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:12px;">
      <div style="font-size:20px;font-weight:700;color:#172E08;">${app.nombre}</div>
      <span style="font-size:12px;color:#6b7280;">${app.tipo} &middot; ${app.fechaInicio || '—'} &rarr; ${app.fechaFin || '—'} &middot; ${app.diasEjecucion || '—'} dias</span>
    </div>
    <div style="display:flex;gap:12px;margin-bottom:12px;">
      ${kpiBlock('Canecas / Bultos', fmtN(cP, 1), fmtN(cR, 1), cD, g.unidad || 'und')}
      ${kpiBlock('Costo Total', formatCOP($P), formatCOP($R), $D, 'COP')}
    </div>
    <div style="flex:1;display:flex;gap:12px;overflow:hidden;">
      <div style="flex:1;border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="${CSS.thGreen}">Lote</th>
            <th style="${CSS.thGreenC}">Plan</th><th style="${CSS.thGreenC}">Real</th><th style="${CSS.thGreenC}">Desv%</th>
            <th style="${CSS.thGreenR}">Costo Plan</th><th style="${CSS.thGreenR}">Costo Real</th><th style="${CSS.thGreenC}">Desv%</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="flex:0 0 180px;display:flex;flex-direction:column;gap:8px;">
        ${app.proposito ? `<div style="background:#F8FAF5;border-radius:6px;padding:10px 12px;border-left:3px solid #73991C;">
          <div style="font-size:10px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">OBJETIVO</div>
          <div style="font-size:12px;color:#4D240F;line-height:1.4;">${app.proposito}</div>
        </div>` : ''}
        ${insumosHTML}
      </div>
    </div>
  `);
}

function construirSlideCierreTecnico(app: any, semana: any): string {
  const rows = (app.kpiPorLote || []).map((l: any, i: number) => {
    const isT = l.loteNombre === 'TOTAL';
    const bg = isT ? '#E7EDDD' : i % 2 === 0 ? '#fff' : '#F8FAF5';
    return `<tr style="background:${bg};">
      <td style="${CSS.td}font-weight:${isT ? '800' : '600'};color:${isT ? '#73991C' : '#172E08'};">${l.loteNombre}</td>
      <td style="${CSS.tdC}">${fmtN(l.canecasPlaneadas, 1)}</td>
      <td style="${CSS.tdC}">${fmtN(l.canecasReales, 1)}</td>
      <td style="${CSS.tdC}color:${desvColor(l.canecasDesviacion ?? 0)};font-weight:600;">${fmtPct(l.canecasDesviacion)}</td>
      <td style="${CSS.tdC}">${l.insumosPlaneados ?? '—'}</td>
      <td style="${CSS.tdC}">${l.insumosReales ?? '—'}</td>
      <td style="${CSS.tdC}color:${desvColor(l.insumosDesviacion ?? 0)};font-weight:600;">${l.insumosDesviacion !== undefined ? fmtPct(l.insumosDesviacion) : '—'}</td>
      <td style="${CSS.tdC}">${l.jornalesPlaneados ?? '—'}</td>
      <td style="${CSS.tdC}">${l.jornalesReales ?? '—'}</td>
      <td style="${CSS.tdC}color:${desvColor(l.jornalesDesviacion ?? 0)};font-weight:600;">${l.jornalesDesviacion !== undefined ? fmtPct(l.jornalesDesviacion) : '—'}</td>
    </tr>`;
  }).join('');

  return slide('CIERRE', semana, `
    <div style="font-size:20px;font-weight:700;color:#172E08;margin-bottom:14px;">Resultado Tecnico — ${app.nombre}</div>
    <div style="flex:1;border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#73991C;">
            <th rowspan="2" style="padding:6px 10px;font-size:11px;font-weight:600;color:#fff;text-align:left;border-right:1px solid #5f7d17;">Lote</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;border-right:1px solid #5f7d17;">Canecas/Bultos</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;border-right:1px solid #5f7d17;">Insumos (Kg/L)</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;">Jornales</th>
          </tr>
          <tr style="background:#5f7d17;">
            ${['Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv'].map(h => `<th style="padding:4px 6px;font-size:10px;font-weight:500;color:rgba(255,255,255,0.85);text-align:center;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${app.observaciones ? `<div style="margin-top:10px;">${callout(app.observaciones)}</div>` : ''}
  `);
}

function construirSlideCierreFinanciero(app: any, semana: any): string {
  const rows = (app.financieroPorLote || []).map((l: any, i: number) => {
    const isT = l.loteNombre === 'TOTAL';
    const bg = isT ? '#F8FAF5' : i % 2 === 0 ? '#fff' : '#F8FAF5';
    return `<tr style="background:${bg};">
      <td style="${CSS.td}font-weight:${isT ? '800' : '600'};color:${isT ? '#4D240F' : '#172E08'};">${l.loteNombre}</td>
      <td style="${CSS.tdR}">${formatCOP(l.costoInsumosPlaneado || 0)}</td>
      <td style="${CSS.tdR}">${formatCOP(l.costoInsumosReal || 0)}</td>
      <td style="${CSS.tdC}color:${desvColor(l.costoInsumosDesviacion ?? 0)};font-weight:600;">${fmtPct(l.costoInsumosDesviacion)}</td>
      <td style="${CSS.tdR}">${formatCOP(l.costoManoObraPlaneado || 0)}</td>
      <td style="${CSS.tdR}">${formatCOP(l.costoManoObraReal || 0)}</td>
      <td style="${CSS.tdC}color:${desvColor(l.costoManoObraDesviacion ?? 0)};font-weight:600;">${fmtPct(l.costoManoObraDesviacion)}</td>
      <td style="${CSS.tdR}font-weight:600;">${formatCOP(l.costoTotalPlaneado || 0)}</td>
      <td style="${CSS.tdR}font-weight:600;">${formatCOP(l.costoTotalReal || 0)}</td>
      <td style="${CSS.tdC}color:${desvColor(l.costoTotalDesviacion ?? 0)};font-weight:700;">${fmtPct(l.costoTotalDesviacion)}</td>
    </tr>`;
  }).join('');

  const totalRow = (app.financieroPorLote || []).find((l: any) => l.loteNombre === 'TOTAL');
  const costoTotal = totalRow ? (totalRow.costoTotalReal || 0) : (app.financieroPorLote || []).filter((l: any) => l.loteNombre !== 'TOTAL').reduce((s: number, l: any) => s + (l.costoTotalReal || 0), 0);
  const desvTotal = totalRow?.costoTotalDesviacion ?? app.desvCosto;

  return slide('CIERRE', semana, `
    <div style="display:flex;align-items:baseline;gap:16px;margin-bottom:14px;">
      <div style="font-size:20px;font-weight:700;color:#172E08;">Resultado Financiero — ${app.nombre}</div>
      <div style="background:#F8FAF5;border-radius:6px;padding:6px 14px;">
        <span style="font-size:11px;color:#6b7280;">COSTO TOTAL REAL</span>
        <span style="font-size:20px;font-weight:800;color:#4D240F;margin-left:8px;">${formatCOP(costoTotal)}</span>
      </div>
      ${desvTotal !== undefined ? `<div style="background:${desvBg(desvTotal)};border-radius:6px;padding:6px 14px;">
        <span style="font-size:11px;color:#6b7280;">DESVIACION</span>
        <span style="font-size:20px;font-weight:800;color:${desvColor(desvTotal)};margin-left:8px;">${fmtPct(desvTotal)}</span>
      </div>` : ''}
    </div>
    <div style="flex:1;border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#4D240F;">
            <th rowspan="2" style="padding:6px 10px;font-size:11px;font-weight:600;color:#fff;text-align:left;border-right:1px solid #5f7d17;">Lote</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;border-right:1px solid #5f7d17;">Insumos</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;border-right:1px solid #5f7d17;">Mano de Obra</th>
            <th colspan="3" style="padding:5px;font-size:11px;font-weight:600;color:#fff;text-align:center;">Total</th>
          </tr>
          <tr style="background:#4D240F;">
            ${['Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv', 'Plan', 'Real', 'Desv'].map(h => `<th style="padding:4px 6px;font-size:10px;font-weight:500;color:rgba(255,255,255,0.85);text-align:center;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}

function construirSlideAplicacionPlaneada(app: any, semana: any): string {
  const comprasRows = (app.listaCompras || []).map((item: any, i: number) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#F8FAF5'};">
    <td style="${CSS.td}font-weight:600;color:#172E08;">${item.productoNombre}</td>
    <td style="${CSS.tdC}">${item.cantidadNecesaria} ${item.unidad}</td>
    <td style="${CSS.tdC}">${item.inventarioDisponible ?? '—'}</td>
    <td style="${CSS.tdC}font-weight:600;color:${(item.cantidadAComprar || item.cantidadOrdenar || 0) > 0 ? '#dc2626' : '#16a34a'};">${item.cantidadAComprar ?? item.cantidadOrdenar ?? '—'}</td>
    <td style="${CSS.tdR}">${formatCOP(item.costoEstimado || 0)}</td>
  </tr>`).join('');

  const costoTotal = (app.listaCompras || []).reduce((s: number, i: any) => s + (i.costoEstimado || 0), 0);

  return slide('APLICACIONES', semana, `
    <div style="font-size:20px;font-weight:700;color:#172E08;margin-bottom:12px;">Plan: ${app.nombre}</div>
    <div style="flex:1;display:flex;gap:24px;overflow:hidden;">
      <div style="flex:0 0 280px;display:flex;flex-direction:column;gap:10px;">
        <div style="background:#F8FAF5;border-radius:6px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">PROPOSITO</div>
          <div style="font-size:12px;color:#4D240F;line-height:1.5;">${app.proposito || '—'}</div>
        </div>
        ${(app.blancosBiologicos || []).length > 0 ? `<div style="background:#fffbeb;border-radius:6px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#b45309;letter-spacing:1px;margin-bottom:4px;">BLANCOS BIOLOGICOS</div>
          <div style="font-size:12px;color:#4D240F;">${app.blancosBiologicos.join(' &middot; ')}</div>
        </div>` : ''}
        <div style="background:#F8FAF5;border-radius:6px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:4px;">FECHAS</div>
          <div style="font-size:12px;color:#4D240F;">Inicio: <strong>${app.fechaInicioPlaneada || '—'}</strong></div>
        </div>
        <div style="display:flex;gap:8px;">
          <div style="flex:1;background:#E7EDDD;border-radius:6px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#73991C;font-weight:700;">COSTO/${app.tipo === 'Fumigacion' ? 'L' : 'KG'}</div>
            <div style="font-size:16px;font-weight:800;color:#172E08;margin-top:2px;">${app.costoPorLitroKg ? formatCOP(app.costoPorLitroKg) : '—'}</div>
          </div>
          <div style="flex:1;background:#E7EDDD;border-radius:6px;padding:10px;text-align:center;">
            <div style="font-size:10px;color:#73991C;font-weight:700;">COSTO/ARBOL</div>
            <div style="font-size:16px;font-weight:800;color:#172E08;margin-top:2px;">${app.costoPorArbol ? formatCOP(app.costoPorArbol) : '—'}</div>
          </div>
        </div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;">
        <div style="font-size:11px;font-weight:700;color:#4D240F;letter-spacing:1px;margin-bottom:8px;">LISTA DE COMPRAS</div>
        <div style="flex:1;border-radius:8px;border:1px solid #E7EDDD;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>
              <th style="${CSS.thGreen}">Producto</th>
              <th style="${CSS.thGreenC}">Cant. Nec.</th>
              <th style="${CSS.thGreenC}">Inventario</th>
              <th style="${CSS.thGreenC}">A Ordenar</th>
              <th style="${CSS.thGreenR}">Costo Est.</th>
            </tr></thead>
            <tbody>${comprasRows}</tbody>
          </table>
        </div>
        <div style="text-align:right;margin-top:8px;font-size:14px;font-weight:700;color:#4D240F;">Total estimado: <span style="color:#73991C;">${formatCOP(costoTotal)}</span></div>
      </div>
    </div>
  `);
}

// ============================================================================
// CONCLUSIONES & ADICIONALES
// ============================================================================

function construirSlideConclusiones(analisis: AnalisisGemini, semana: any): string {
  const prioColors: Record<string, { bg: string; border: string; badge: string; badgeBg: string }> = {
    alta: { bg: '#fef2f2', border: '#dc2626', badge: '#dc2626', badgeBg: '#fecaca' },
    media: { bg: '#fffbeb', border: '#d97706', badge: '#92400e', badgeBg: '#fde68a' },
    baja: { bg: '#f0fdf4', border: '#16a34a', badge: '#166534', badgeBg: '#bbf7d0' },
  };

  const items = analisis.conclusiones.slice(0, 6).map(c => {
    const col = prioColors[c.prioridad] || prioColors.media;
    return `<div style="display:flex;align-items:flex-start;gap:14px;padding:12px 16px;background:${col.bg};border-radius:8px;border-left:4px solid ${col.border};">
      <div style="width:10px;height:10px;border-radius:50%;background:${col.border};flex-shrink:0;margin-top:3px;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#172E08;line-height:1.5;">${c.texto}</div>
        ${c.contexto ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;line-height:1.4;">${c.contexto}</div>` : ''}
      </div>
      <span style="flex-shrink:0;display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;color:${col.badge};background:${col.badgeBg};text-transform:uppercase;">${c.prioridad}</span>
    </div>`;
  }).join('');

  return slide('CONCLUSIONES', semana, `
    <div style="font-size:20px;font-weight:700;color:#172E08;margin-bottom:14px;">Conclusiones y Recomendaciones</div>
    <div style="flex:1;display:flex;flex-direction:column;gap:8px;overflow:hidden;">${items}</div>
  `);
}

function construirSlideAdicional(bloque: any, semana: any): string {
  if (!bloque) return '';
  const titulo = bloque.titulo || 'Tema Adicional';

  let contenidoHTML = '';
  if (bloque.tipo === 'texto') {
    contenidoHTML = `<div style="font-size:14px;color:#4D240F;line-height:1.8;">${(bloque.contenido || '').replace(/\n/g, '<br>')}</div>`;
  } else if (bloque.tipo === 'imagen_con_texto') {
    const imagenes = bloque.imagenesBase64 || (bloque.imagenBase64 ? [bloque.imagenBase64] : []) || bloque.imagenes || (bloque.imagen ? [bloque.imagen] : []);
    const imgsHTML = imagenes.slice(0, 2).map((img: string) => `<img src="${img}" style="max-width:${imagenes.length > 1 ? '48%' : '100%'};max-height:480px;border-radius:8px;object-fit:contain;" />`).join('');
    contenidoHTML = `<div style="display:flex;gap:20px;flex:1;overflow:hidden;">
      <div style="flex:1;display:flex;gap:12px;justify-content:center;align-items:flex-start;overflow:hidden;max-width:900px;">${imgsHTML}</div>
      ${bloque.descripcion ? `<div style="flex:0 0 280px;background:#F8FAF5;border-radius:8px;padding:14px 16px;font-size:13px;color:#4D240F;line-height:1.6;">${bloque.descripcion.replace(/\n/g, '<br>')}</div>` : ''}
    </div>`;
  }

  return slide('ADICIONALES', semana, `
    <div style="font-size:20px;font-weight:700;color:#172E08;margin-bottom:14px;">${titulo}</div>
    ${contenidoHTML}
  `);
}

// ============================================================================
// CONSTRUCTOR PRINCIPAL HTML
// ============================================================================

// ============================================================================
// NUEVAS SLIDES: CLIMA, FLORACIÓN, CE, COLMENAS
// ============================================================================

function construirSlideClima(datos: any, analisis: AnalisisGemini): string {
  const c = datos.clima;
  if (!c) return '';

  const kpis = [
    kpiCard(`${fmtN(c.tempMin, 1)}°`, 'Temp Mín', '°C', '#4D240F'),
    kpiCard(`${fmtN(c.tempMax, 1)}°`, 'Temp Máx', '°C', '#dc2626'),
    kpiCard(`${fmtN(c.tempPromedio, 1)}°`, 'Temp Prom', '°C', '#73991C'),
    kpiCard(`${fmtN(c.lluviaTotal, 1)}`, 'Lluvia', 'mm total', '#4D240F'),
    kpiCard(`${fmtN(c.humedadPromedio, 0)}%`, 'Humedad', 'promedio', '#6b7280'),
    kpiCard(`${fmtN(c.radiacionMax, 0)}`, 'Rad Máx', 'W/m²', '#b45309'),
  ].join('');

  // SVG combo chart: rainfall bars + radiation line
  const diario: any[] = c.diario || [];
  let chartHTML = '';

  if (diario.length > 0) {
    const chartW = 1100, chartH = 200, padL = 50, padR = 50, padT = 20, padB = 30;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const barW = Math.min(60, plotW / diario.length * 0.6);
    const gap = plotW / diario.length;

    const maxLluvia = Math.max(...diario.map((d: any) => d.lluviaMm), 1);
    const maxRad = Math.max(...diario.map((d: any) => d.radiacionMaxWm2), 1);

    // Bars (rainfall)
    const bars = diario.map((d: any, i: number) => {
      const x = padL + i * gap + (gap - barW) / 2;
      const h = (d.lluviaMm / maxLluvia) * plotH;
      const y = padT + plotH - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="#BFD97D" rx="3"/>`;
    }).join('');

    // Line (radiation)
    const points = diario.map((d: any, i: number) => {
      const x = padL + i * gap + gap / 2;
      const y = padT + plotH - (d.radiacionMaxWm2 / maxRad) * plotH;
      return `${x},${y}`;
    }).join(' ');
    const polyline = `<polyline points="${points}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linejoin="round"/>`;
    const dots = diario.map((d: any, i: number) => {
      const x = padL + i * gap + gap / 2;
      const y = padT + plotH - (d.radiacionMaxWm2 / maxRad) * plotH;
      return `<circle cx="${x}" cy="${y}" r="4" fill="#f59e0b"/>`;
    }).join('');

    // X labels (day names)
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const xLabels = diario.map((d: any, i: number) => {
      const x = padL + i * gap + gap / 2;
      const dt = new Date(d.fecha + 'T12:00:00');
      const label = dayNames[dt.getDay()] + ' ' + dt.getDate();
      return `<text x="${x}" y="${padT + plotH + 18}" text-anchor="middle" font-size="10" fill="#6b7280">${label}</text>`;
    }).join('');

    // Y labels left (rainfall)
    const yLeft = `<text x="${padL - 6}" y="${padT}" text-anchor="end" font-size="9" fill="#BFD97D">${maxLluvia.toFixed(0)}mm</text>
      <text x="${padL - 6}" y="${padT + plotH}" text-anchor="end" font-size="9" fill="#BFD97D">0</text>`;

    // Y labels right (radiation)
    const yRight = `<text x="${chartW - padR + 6}" y="${padT}" text-anchor="start" font-size="9" fill="#f59e0b">${maxRad.toFixed(0)}</text>
      <text x="${chartW - padR + 6}" y="${padT + plotH}" text-anchor="start" font-size="9" fill="#f59e0b">0</text>`;

    // Legend
    const legend = `<rect x="${padL}" y="${chartH + 4}" width="12" height="12" fill="#BFD97D" rx="2"/>
      <text x="${padL + 16}" y="${chartH + 14}" font-size="10" fill="#6b7280">Lluvia (mm)</text>
      <rect x="${padL + 100}" y="${chartH + 4}" width="12" height="12" fill="#f59e0b" rx="2"/>
      <text x="${padL + 116}" y="${chartH + 14}" font-size="10" fill="#6b7280">Radiación máx (W/m²)</text>`;

    chartHTML = `<div style="margin-top:12px;">
      <svg width="${chartW}" height="${chartH + 24}" viewBox="0 0 ${chartW} ${chartH + 24}" style="display:block;margin:0 auto;">
        ${bars}${polyline}${dots}${xLabels}${yLeft}${yRight}${legend}
      </svg>
    </div>`;
  }

  const interp = analisis.interpretacion_clima
    ? callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">ANÁLISIS</div>${analisis.interpretacion_clima}`)
    : '';

  return slide('RESUMEN DEL CLIMA', datos.semana, `
    ${headline(analisis.titulares.clima || 'Condiciones climáticas de la semana')}
    <div style="display:flex;gap:12px;margin-bottom:12px;">${kpis}</div>
    ${chartHTML}
    ${interp ? `<div style="margin-top:auto;">${interp}</div>` : ''}
  `);
}

function construirSlideFloracion(datos: any, analisis: AnalisisGemini): string {
  const flor = datos.floracion;
  if (!flor?.porLote?.length) return '';

  const colors: Record<string, string> = {
    sinFlor: '#d1d5db',
    brotes: '#86efac',
    florMadura: '#fbbf24',
    cuaje: '#f97316',
  };
  const labels: Record<string, string> = {
    sinFlor: 'Sin flor',
    brotes: 'Brotes',
    florMadura: 'Flor madura',
    cuaje: 'Cuaje',
  };

  // Stacked horizontal bars per lot
  const barHeight = Math.min(36, 400 / flor.porLote.length);
  const barsHTML = flor.porLote.map((l: any) => {
    const total = l.pctSinFlor + l.pctBrotes + l.pctFlorMadura + l.pctCuaje;
    const scale = total > 0 ? 100 / total : 0;
    const segments = [
      { key: 'sinFlor', pct: l.pctSinFlor * scale },
      { key: 'brotes', pct: l.pctBrotes * scale },
      { key: 'florMadura', pct: l.pctFlorMadura * scale },
      { key: 'cuaje', pct: l.pctCuaje * scale },
    ].filter(s => s.pct > 0);

    const bar = segments.map(s =>
      `<div style="width:${s.pct.toFixed(1)}%;background:${colors[s.key]};height:100%;display:inline-block;" title="${labels[s.key]}: ${s.pct.toFixed(0)}%"></div>`
    ).join('');

    return `<div style="display:flex;align-items:center;margin-bottom:4px;">
      <div style="width:120px;font-size:12px;font-weight:600;color:#4D240F;text-align:right;padding-right:12px;flex-shrink:0;">${l.loteNombre}</div>
      <div style="flex:1;height:${barHeight - 8}px;background:#E7EDDD;border-radius:4px;overflow:hidden;display:flex;">${bar}</div>
      <div style="width:200px;font-size:10px;color:#6b7280;padding-left:8px;flex-shrink:0;">${l.pctSinFlor}% / ${l.pctBrotes}% / ${l.pctFlorMadura}% / ${l.pctCuaje}%</div>
    </div>`;
  }).join('');

  // Legend
  const legendHTML = Object.entries(colors).map(([key, color]) =>
    `<span style="display:inline-flex;align-items:center;margin-right:16px;"><span style="width:10px;height:10px;background:${color};border-radius:2px;display:inline-block;margin-right:4px;"></span><span style="font-size:11px;color:#6b7280;">${labels[key]}</span></span>`
  ).join('');

  const interp = analisis.interpretacion_floracion
    ? callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">ANÁLISIS</div>${analisis.interpretacion_floracion}`)
    : '';

  return slide('MONITOREO DE FLORACIÓN', datos.semana, `
    ${headline(analisis.titulares.floracion || 'Estado de floración por lote')}
    <div style="margin-bottom:8px;">${legendHTML}</div>
    <div style="flex:1;overflow:hidden;">${barsHTML}</div>
    ${interp ? `<div style="margin-top:auto;">${interp}</div>` : ''}
  `);
}

function construirSlideConductividad(datos: any, analisis: AnalisisGemini): string {
  const ce = datos.conductividadElectrica;
  if (!ce?.porLote?.length) return '';

  const rows = ce.porLote.map((l: any) => {
    const bgBajo = l.pctBajo > 30 ? '#fef2f2' : '#ffffff';
    const bgRango = l.pctEnRango > 70 ? '#f0fdf4' : '#ffffff';
    const bgAlto = l.pctAlto > 30 ? '#fef2f2' : '#ffffff';
    const promColor = l.promedio < 0.5 ? '#dc2626' : l.promedio > 1.5 ? '#dc2626' : '#16a34a';

    return `<tr>
      <td style="${CSS.td}font-weight:600;">${l.loteNombre}</td>
      <td style="${CSS.tdC}background:${bgBajo};">${l.pctBajo}%</td>
      <td style="${CSS.tdC}background:${bgRango};font-weight:600;">${l.pctEnRango}%</td>
      <td style="${CSS.tdC}background:${bgAlto};">${l.pctAlto}%</td>
      <td style="${CSS.tdC}color:${promColor};font-weight:700;">${l.promedio.toFixed(2)}</td>
      <td style="${CSS.tdC}color:#9ca3af;">${l.totalLecturas}</td>
    </tr>`;
  }).join('');

  // Global KPIs
  const totalLecturas = ce.porLote.reduce((s: number, l: any) => s + l.totalLecturas, 0);
  const avgCE = totalLecturas > 0
    ? (ce.porLote.reduce((s: number, l: any) => s + l.promedio * l.totalLecturas, 0) / totalLecturas).toFixed(2)
    : '—';
  const avgEnRango = totalLecturas > 0
    ? Math.round(ce.porLote.reduce((s: number, l: any) => s + l.pctEnRango * l.totalLecturas, 0) / totalLecturas)
    : 0;

  const kpis = [
    kpiCard(`${avgCE}`, 'CE Promedio', 'dS/m', '#73991C'),
    kpiCard(`${avgEnRango}%`, 'En Rango', '0.5–1.5 dS/m', avgEnRango >= 70 ? '#16a34a' : '#dc2626'),
    kpiCard(String(totalLecturas), 'Lecturas', 'árboles medidos', '#6b7280'),
  ].join('');

  const interp = analisis.interpretacion_ce
    ? callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">ANÁLISIS</div>${analisis.interpretacion_ce}`)
    : '';

  return slide('CONDUCTIVIDAD ELÉCTRICA', datos.semana, `
    ${headline(analisis.titulares.conductividad_electrica || 'Estado de CE por lote')}
    <div style="display:flex;gap:12px;margin-bottom:12px;">${kpis}</div>
    <table style="width:100%;">
      <thead><tr>
        <th style="${CSS.thGreen}">Lote</th>
        <th style="${CSS.thGreenC}">% Bajo<br><span style="font-weight:400;font-size:9px;">&lt;0.5 dS/m</span></th>
        <th style="${CSS.thGreenC}">% En Rango<br><span style="font-weight:400;font-size:9px;">0.5–1.5 dS/m</span></th>
        <th style="${CSS.thGreenC}">% Alto<br><span style="font-weight:400;font-size:9px;">&gt;1.5 dS/m</span></th>
        <th style="${CSS.thGreenC}">Promedio</th>
        <th style="${CSS.thGreenC}">Lecturas</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${interp ? `<div style="margin-top:auto;">${interp}</div>` : ''}
  `);
}

function construirSlideColmenas(datos: any, analisis: AnalisisGemini): string {
  const col = datos.colmenas;
  if (!col?.porApiario?.length) return '';

  const t = col.totales;
  const pctFuertesColor = t.pctFuertes >= 80 ? '#16a34a' : t.pctFuertes >= 50 ? '#b45309' : '#dc2626';

  const kpis = [
    kpiCard(String(t.total), 'Total', 'colmenas', '#73991C'),
    kpiCard(String(t.fuertes), 'Fuertes', `${t.pctFuertes}%`, pctFuertesColor),
    kpiCard(String(t.debiles), 'Débiles', 'requieren atención', t.debiles > 0 ? '#b45309' : '#6b7280'),
    kpiCard(String(t.muertas), 'Muertas', 'pérdidas', t.muertas > 0 ? '#dc2626' : '#6b7280'),
    kpiCard(String(t.conReina), 'Con Reina', 'colmenas', '#4D240F'),
  ].join('');

  const rows = col.porApiario.map((a: any) => {
    const pctF = a.total > 0 ? Math.round((a.fuertes / a.total) * 100) : 0;
    const pctColor = pctF >= 80 ? '#16a34a' : pctF >= 50 ? '#b45309' : '#dc2626';
    return `<tr>
      <td style="${CSS.td}font-weight:600;">${a.apiarioNombre}</td>
      <td style="${CSS.tdC}color:#16a34a;font-weight:600;">${a.fuertes}</td>
      <td style="${CSS.tdC}color:${a.debiles > 0 ? '#b45309' : '#6b7280'};">${a.debiles}</td>
      <td style="${CSS.tdC}color:${a.muertas > 0 ? '#dc2626' : '#6b7280'};">${a.muertas}</td>
      <td style="${CSS.tdC}color:#4D240F;">${a.conReina}</td>
      <td style="${CSS.tdC}">${a.total}</td>
      <td style="${CSS.tdC}color:${pctColor};font-weight:700;">${pctF}%</td>
    </tr>`;
  }).join('');

  // Historical vertical stacked bar charts (last 3 dates)
  const historico: any[] = col.historico || [];
  let chartsHTML = '';

  if (historico.length > 0) {
    const barColors = { fuertes: '#16a34a', debiles: '#b45309', muertas: '#dc2626' };
    const legend = `<div style="display:flex;gap:16px;margin-bottom:6px;">
      <span style="display:inline-flex;align-items:center;"><span style="width:10px;height:10px;background:#16a34a;border-radius:2px;display:inline-block;margin-right:4px;"></span><span style="font-size:11px;color:#6b7280;">Fuertes</span></span>
      <span style="display:inline-flex;align-items:center;"><span style="width:10px;height:10px;background:#b45309;border-radius:2px;display:inline-block;margin-right:4px;"></span><span style="font-size:11px;color:#6b7280;">Débiles</span></span>
      <span style="display:inline-flex;align-items:center;"><span style="width:10px;height:10px;background:#dc2626;border-radius:2px;display:inline-block;margin-right:4px;"></span><span style="font-size:11px;color:#6b7280;">Muertas</span></span>
    </div>`;

    // Find global max for consistent Y axis
    let globalMax = 0;
    for (const h of historico) {
      for (const a of h.apiarios) {
        const t = a.fuertes + a.debiles + a.muertas;
        if (t > globalMax) globalMax = t;
      }
    }
    globalMax = Math.ceil(globalMax / 6) * 6; // Round up to nice number
    if (globalMax === 0) globalMax = 6;

    const chartW = Math.floor(1100 / historico.length);
    const padL = 30, padR = 10, padT = 24, padB = 50;
    const plotH = 140;

    const charts = historico.map((h: any) => {
      const apis = h.apiarios || [];
      const barW = Math.min(50, (chartW - padL - padR) / Math.max(apis.length, 1) * 0.7);
      const gap = (chartW - padL - padR) / Math.max(apis.length, 1);

      // Date label
      const dt = new Date(h.fecha + 'T12:00:00');
      const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const dateLabel = `${dt.getDate()} ${meses[dt.getMonth()]} ${dt.getFullYear()}`;

      // Y axis ticks
      const yTicks = [0, globalMax / 2, globalMax].map(v => {
        const y = padT + plotH - (v / globalMax) * plotH;
        return `<line x1="${padL}" y1="${y}" x2="${chartW - padR}" y2="${y}" stroke="#E7EDDD" stroke-width="1"/>
          <text x="${padL - 4}" y="${y + 3}" text-anchor="end" font-size="9" fill="#6b7280">${Math.round(v)}</text>`;
      }).join('');

      // Stacked bars per apiario
      const bars = apis.map((a: any, i: number) => {
        const total = a.fuertes + a.debiles + a.muertas;
        const x = padL + i * gap + (gap - barW) / 2;
        const hF = (a.fuertes / globalMax) * plotH;
        const hD = (a.debiles / globalMax) * plotH;
        const hM = (a.muertas / globalMax) * plotH;
        const baseY = padT + plotH;

        const rects = [
          `<rect x="${x}" y="${baseY - hF}" width="${barW}" height="${hF}" fill="${barColors.fuertes}" rx="2"/>`,
          hD > 0 ? `<rect x="${x}" y="${baseY - hF - hD}" width="${barW}" height="${hD}" fill="${barColors.debiles}" rx="0"/>` : '',
          hM > 0 ? `<rect x="${x}" y="${baseY - hF - hD - hM}" width="${barW}" height="${hM}" fill="${barColors.muertas}" rx="2"/>` : '',
        ].join('');

        // Labels
        const labelFuertes = hF > 14 ? `<text x="${x + barW / 2}" y="${baseY - hF / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#fff">${a.fuertes}</text>` : '';
        const labelDebiles = hD > 14 ? `<text x="${x + barW / 2}" y="${baseY - hF - hD / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#fff">${a.debiles}</text>` : '';
        const labelMuertas = hM > 14 ? `<text x="${x + barW / 2}" y="${baseY - hF - hD - hM / 2 + 4}" text-anchor="middle" font-size="10" font-weight="600" fill="#fff">${a.muertas}</text>` : '';

        const maxChars = Math.max(Math.floor(gap / 7), 6);
        const apiName = a.apiarioNombre.length > maxChars ? a.apiarioNombre.slice(0, maxChars - 1) + '…' : a.apiarioNombre;
        const apiLabel = `<text x="${x + barW / 2}" y="${baseY + 14}" text-anchor="middle" font-size="10" fill="#4D240F">${apiName}</text>`;
        const reinaLabel = `<text x="${x + barW / 2}" y="${baseY + 28}" text-anchor="middle" font-size="9" fill="#73991C">${a.conReina}♛</text>`;

        return rects + labelFuertes + labelDebiles + labelMuertas + apiLabel + reinaLabel;
      }).join('');

      const titleLabel = `<text x="${chartW / 2}" y="14" text-anchor="middle" font-size="12" font-weight="600" fill="#4D240F">${dateLabel}</text>`;

      return `<svg width="${chartW}" height="${plotH + padT + padB}" viewBox="0 0 ${chartW} ${plotH + padT + padB}" style="display:inline-block;">
        ${titleLabel}${yTicks}${bars}
      </svg>`;
    }).join('');

    chartsHTML = `<div style="margin-top:10px;">${legend}<div style="display:flex;">${charts}</div></div>`;
  }

  const interp = analisis.interpretacion_colmenas
    ? callout(`<div style="font-size:11px;font-weight:700;color:#73991C;letter-spacing:1px;margin-bottom:4px;">ANÁLISIS</div>${analisis.interpretacion_colmenas}`)
    : '';

  return slide('MONITOREO DE COLMENAS', datos.semana, `
    ${headline(analisis.titulares.colmenas || 'Estado de salud de apiarios')}
    <div style="display:flex;gap:12px;margin-bottom:12px;">${kpis}</div>
    <table style="width:100%;">
      <thead><tr>
        <th style="${CSS.thGreen}">Apiario</th>
        <th style="${CSS.thGreenC}">Fuertes</th>
        <th style="${CSS.thGreenC}">Débiles</th>
        <th style="${CSS.thGreenC}">Muertas</th>
        <th style="${CSS.thGreenC}">Con Reina</th>
        <th style="${CSS.thGreenC}">Total</th>
        <th style="${CSS.thGreenC}">% Fuertes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${chartsHTML}
    ${interp ? `<div style="margin-top:auto;">${interp}</div>` : ''}
  `);
}

function construirHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const { semana, secciones, aplicaciones, monitoreo, temasAdicionales } = datos;
  // Backward compat: if secciones is undefined, treat all as enabled
  const sec = secciones ?? { clima: true, monitoreoPlagas: true, floracion: true, conductividadElectrica: true, colmenas: true, aplicaciones: true };
  const cerradas = aplicaciones?.cerradas || [];
  const planeadas = aplicaciones?.planeadas || [];
  const vistasPorSublote: any[] = (monitoreo?.vistasPorSublote || []).filter(
    (v: any) => v.sublotes && v.sublotes.length > 0 && !v.sinDatos
  );
  const temasAd: any[] = temasAdicionales || [];

  const allSlides: string[] = [];

  // 1. Portada
  allSlides.push(construirSlidePortada(datos, analisis));

  // 2. Personal
  allSlides.push(construirSlidePersonal(datos, analisis));

  // 3. Clima (always right after personal)
  if (sec.clima) {
    allSlides.push(construirSlideClima(datos, analisis));
  }

  // 4. Labores
  allSlides.push(construirSlideLaboresProgramadas(datos, analisis));
  allSlides.push(...construirSlidesLaboresMatriz(datos, analisis));

  // 5. Monitoreo de plagas
  if (sec.monitoreoPlagas) {
    allSlides.push(...construirSlidesMonitoreoTendencias(datos, analisis));
    allSlides.push(construirSlideMonitoreoPorLote(datos));
    for (const v of vistasPorSublote) {
      allSlides.push(construirSlideMonitoreoPorSublote(v, semana));
    }
  }

  // 6. Floración
  if (sec.floracion) {
    allSlides.push(construirSlideFloracion(datos, analisis));
  }

  // 7. CE
  if (sec.conductividadElectrica) {
    allSlides.push(construirSlideConductividad(datos, analisis));
  }

  // 8. Colmenas
  if (sec.colmenas) {
    allSlides.push(construirSlideColmenas(datos, analisis));
  }

  // 9. Aplicaciones
  if (sec.aplicaciones) {
    allSlides.push(construirSlideAplicacionesActivas(datos, analisis));
    for (const app of cerradas) {
      allSlides.push(construirSlideCierreGeneral(app, semana));
      allSlides.push(construirSlideCierreTecnico(app, semana));
      allSlides.push(construirSlideCierreFinanciero(app, semana));
    }
    for (const app of planeadas) {
      allSlides.push(construirSlideAplicacionPlaneada(app, semana));
    }
  }

  // 10. Conclusiones
  allSlides.push(construirSlideConclusiones(analisis, semana));

  // 11. Adicionales
  for (const b of temasAd) {
    allSlides.push(construirSlideAdicional(b, semana));
  }

  const slides = allSlides.filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif; width: 1280px; margin: 0 auto; color: #172E08;background: #F8FAF5; -webkit-font-smoothing: antialiased; }
  .slide { width: 1280px; height: 720px; overflow: hidden; position: relative; background: #ffffff; display: flex; flex-direction: column; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; margin-bottom: 0; }
  .page-break { page-break-before: always; break-before: page; }
  table { border-collapse: collapse; }
  @media print { .slide { page-break-after: always; break-after: page; } body { margin: 0; width: 100%; } }
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
