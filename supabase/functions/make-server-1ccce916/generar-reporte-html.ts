// generar-reporte-html.ts
// Template HTML determinístico para el reporte semanal de Escocia OS.
// Recibe datos estructurados + análisis de Gemini → genera HTML con diseño consistente.
//
// Diseño: Escocia OS design system
//   Fuente:  Visby CF (cdnfonts.com)
//   Colores: #F8FAF5 fondo | #73991C primario | #BFD97D secundario | #172E08 texto
//   Radio:   1rem
//   Formato: A4, optimizado para impresión con html2pdf.js

import type { AnalisisGemini } from './generar-reporte-semanal.ts';

// ============================================================================
// UTILIDADES DE FORMATO
// ============================================================================

function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString('es-CO')} COP`;
}

function formatNum(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================================
// ESTILOS CSS (inline, A4-optimizado, compatible con html2pdf.js)
// ============================================================================

const CSS = `
  @import url('https://fonts.cdnfonts.com/css/visby-cf');

  /* =========================================================
     VARIABLES — Escocia OS design system
     ========================================================= */
  :root {
    --bg:          #F8FAF5;
    --bg-card:     #ffffff;
    --primary:     #73991C;
    --primary-d:   #5a7a14;
    --secondary:   #BFD97D;
    --muted:       #E7EDDD;
    --text:        #172E08;
    --text-2:      #4a5e2a;
    --text-muted:  #9CA3AF;
    --border:      rgba(115,153,28,0.15);
    --radius:      0.75rem;
    --warn:        #FFC107;
    --danger:      #DC3545;
    --ok:          #73991C;
  }

  /* =========================================================
     RESET & BASE
     ========================================================= */
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Visby CF', -apple-system, 'Segoe UI', sans-serif;
    font-size: 10pt;
    font-weight: 400;
    line-height: 1.55;
    color: var(--text);
    background: var(--bg);
    -webkit-font-smoothing: antialiased;
  }

  /* =========================================================
     PAGE WRAPPER — A4 (210mm × 297mm), 15mm margins
     ========================================================= */
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    padding: 15mm 15mm 12mm;
    background: var(--bg);
  }

  /* =========================================================
     TYPOGRAPHY
     ========================================================= */
  h1 { font-size: 22pt; font-weight: 700; line-height: 1.2; color: var(--text); }
  h2 { font-size: 13pt; font-weight: 600; line-height: 1.3; color: var(--text); }
  h3 { font-size: 10.5pt; font-weight: 600; color: var(--text-2); }
  p  { font-size: 9.5pt; color: var(--text); line-height: 1.6; }

  /* =========================================================
     HEADER — Portada
     ========================================================= */
  .report-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 6mm;
    padding-bottom: 5mm;
    border-bottom: 2.5px solid var(--primary);
  }

  .report-header__brand {
    display: flex;
    align-items: center;
    gap: 3mm;
  }

  .report-header__logo {
    width: 10mm;
    height: 10mm;
    background: var(--primary);
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .report-header__logo svg { display: block; }

  .report-header__brand-name {
    font-size: 14pt;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: -0.3px;
  }

  .report-header__brand-sub {
    font-size: 8pt;
    color: var(--text-muted);
    font-weight: 400;
  }

  .report-header__meta {
    text-align: right;
    font-size: 8pt;
    color: var(--text-muted);
    line-height: 1.6;
  }

  .report-header__week {
    font-size: 10pt;
    font-weight: 600;
    color: var(--text-2);
  }

  /* =========================================================
     COVER SECTION
     ========================================================= */
  .cover-title-row {
    display: flex;
    align-items: baseline;
    gap: 3mm;
    margin-bottom: 4mm;
  }

  .cover-title-row h1 { flex: 1; }

  .badge {
    display: inline-block;
    padding: 1mm 3.5mm;
    border-radius: 999px;
    font-size: 7.5pt;
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }

  .badge--primary   { background: var(--secondary); color: var(--primary-d); }
  .badge--ok        { background: #d4edda; color: #155724; }
  .badge--warn      { background: #fff3cd; color: #856404; }
  .badge--danger    { background: #f8d7da; color: #721c24; }
  .badge--muted     { background: var(--muted); color: var(--text-2); }

  .executive-summary {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-left: 4px solid var(--primary);
    border-radius: var(--radius);
    padding: 4mm 5mm;
    margin-bottom: 4mm;
  }

  .executive-summary p {
    font-size: 9.5pt;
    line-height: 1.65;
    color: var(--text);
  }

  .highlights-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2mm;
    margin-bottom: 6mm;
  }

  .highlight-chip {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5mm 3mm;
    font-size: 8pt;
    color: var(--text-2);
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }

  .highlight-chip::before {
    content: '✦';
    color: var(--primary);
    font-size: 7pt;
  }

  /* =========================================================
     ALERTAS
     ========================================================= */
  .alertas-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    margin-bottom: 5mm;
  }

  .alerta-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3mm 4mm;
    display: flex;
    gap: 2.5mm;
  }

  .alerta-card--urgente { border-left: 4px solid var(--danger); }
  .alerta-card--atencion { border-left: 4px solid var(--warn); }
  .alerta-card--ok { border-left: 4px solid var(--ok); }

  .alerta-card__icon { font-size: 11pt; line-height: 1; margin-top: 0.5mm; }
  .alerta-card__body { flex: 1; }
  .alerta-card__titulo { font-size: 8.5pt; font-weight: 600; color: var(--text); margin-bottom: 0.5mm; }
  .alerta-card__desc { font-size: 8pt; color: var(--text-2); line-height: 1.45; }
  .alerta-card__accion { font-size: 7.5pt; color: var(--primary-d); font-weight: 500; margin-top: 1mm; }

  /* =========================================================
     SECTION WRAPPER
     ========================================================= */
  .section {
    margin-bottom: 8mm;
    page-break-inside: avoid;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 2.5mm;
    margin-bottom: 3mm;
    padding-bottom: 1.5mm;
    border-bottom: 1.5px solid var(--muted);
  }

  .section-number {
    background: var(--primary);
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    width: 5.5mm;
    height: 5.5mm;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .section-label { font-size: 9pt; color: var(--text-muted); }

  .analysis-block {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3.5mm 4.5mm;
    margin-top: 3mm;
  }

  .analysis-block p {
    font-size: 9pt;
    color: var(--text-2);
    font-style: italic;
    line-height: 1.6;
  }

  /* =========================================================
     PERSONAL — STAT BOXES
     ========================================================= */
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3mm;
  }

  .stat-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3mm 3.5mm;
    text-align: center;
  }

  .stat-box__value {
    font-size: 18pt;
    font-weight: 700;
    color: var(--primary);
    line-height: 1.1;
  }

  .stat-box__value--warn { color: var(--warn); }
  .stat-box__value--danger { color: var(--danger); }

  .stat-box__label {
    font-size: 7.5pt;
    color: var(--text-muted);
    margin-top: 1mm;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* =========================================================
     TABLES
     ========================================================= */
  .table-wrap {
    overflow: hidden;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    margin-top: 2mm;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }

  thead th {
    background: var(--primary);
    color: #fff;
    font-weight: 600;
    padding: 2.5mm 3mm;
    text-align: left;
    white-space: nowrap;
    font-size: 8pt;
  }

  thead th:not(:first-child) { text-align: right; }

  tbody tr:nth-child(even) { background: var(--muted); }
  tbody tr:nth-child(odd) { background: var(--bg-card); }

  tbody td {
    padding: 2mm 3mm;
    color: var(--text);
    vertical-align: middle;
    border-bottom: 1px solid var(--border);
  }

  tbody td:not(:first-child) {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  tfoot td {
    background: var(--secondary);
    color: var(--primary-d);
    font-weight: 700;
    padding: 2.5mm 3mm;
    font-size: 8.5pt;
  }

  tfoot td:not(:first-child) { text-align: right; }

  .td-name { font-weight: 500; }

  /* Severity badges in tables */
  .sev-baja   { color: var(--ok); font-weight: 600; }
  .sev-media  { color: #856404; font-weight: 600; }
  .sev-alta   { color: var(--danger); font-weight: 600; }

  /* =========================================================
     PROGRESS BARS
     ========================================================= */
  .progress-container {
    display: flex;
    align-items: center;
    gap: 2mm;
  }

  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--muted);
    border-radius: 999px;
    overflow: hidden;
  }

  .progress-bar__fill {
    height: 100%;
    background: var(--primary);
    border-radius: 999px;
    min-width: 2px;
  }

  .progress-bar__fill--warn { background: var(--warn); }

  .progress-pct {
    font-size: 8pt;
    font-weight: 600;
    color: var(--text-2);
    white-space: nowrap;
    min-width: 6mm;
    text-align: right;
  }

  /* =========================================================
     APLICACIONES
     ========================================================= */
  .app-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3.5mm 4.5mm;
    margin-bottom: 3mm;
  }

  .app-card__header {
    display: flex;
    align-items: center;
    gap: 2mm;
    margin-bottom: 2.5mm;
  }

  .app-card__name { font-size: 10pt; font-weight: 600; flex: 1; }
  .app-card__meta { font-size: 8pt; color: var(--text-muted); margin-bottom: 2.5mm; }

  .app-progress-label {
    font-size: 8pt;
    color: var(--text-muted);
    margin-bottom: 1mm;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  /* =========================================================
     RECOMENDACIONES
     ========================================================= */
  .rec-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2mm;
  }

  .rec-list li {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2.5mm 4mm;
    font-size: 9pt;
    display: flex;
    align-items: flex-start;
    gap: 2mm;
  }

  .rec-list li::before {
    content: '→';
    color: var(--primary);
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 0.5mm;
  }

  /* =========================================================
     FOOTER
     ========================================================= */
  .report-footer {
    margin-top: 8mm;
    padding-top: 3mm;
    border-top: 1px solid var(--muted);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7.5pt;
    color: var(--text-muted);
  }

  /* =========================================================
     PRINT OPTIMIZATION
     ========================================================= */
  @media print {
    body { background: white; }
    .page { padding: 10mm 12mm; }
    .section { page-break-inside: avoid; }
    .page-break { page-break-before: always; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }

    /* Remove backgrounds on print for ink saving */
    .stat-box { border: 1px solid #ccc; }
    .table-wrap { border: 1px solid #ccc; }
    thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .progress-bar__fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .section-number { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .alerta-card { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    tfoot td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// ============================================================================
// GENERADORES DE SECCIONES
// ============================================================================

function renderHeader(datos: any): string {
  const { semana } = datos;
  return `
  <div class="report-header">
    <div class="report-header__brand">
      <div class="report-header__logo">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="11" cy="14" rx="6" ry="5" fill="white" opacity="0.9"/>
          <path d="M11 4 C11 4 6 8 6 11 C6 14 8 16 11 16 C14 16 16 14 16 11 C16 8 11 4 11 4Z" fill="white" opacity="0.6"/>
          <circle cx="11" cy="11" r="2.5" fill="white"/>
        </svg>
      </div>
      <div>
        <div class="report-header__brand-name">Escocia OS</div>
        <div class="report-header__brand-sub">Sistema de Gestión Agrícola</div>
      </div>
    </div>
    <div class="report-header__meta">
      <div class="report-header__week">Semana ${semana.numero} · ${semana.ano}</div>
      <div>${formatDate(semana.inicio)} — ${formatDate(semana.fin)}</div>
      <div>Generado: ${formatDate(new Date().toISOString().split('T')[0])}</div>
    </div>
  </div>`;
}

function renderCover(datos: any, analisis: AnalisisGemini): string {
  const highlights = (analisis.highlights || [])
    .map(h => `<div class="highlight-chip">${escapeHtml(h)}</div>`)
    .join('');

  return `
  <div class="section" style="margin-bottom:6mm">
    <div class="cover-title-row">
      <h1>Reporte Semanal</h1>
      <span class="badge badge--primary">S${datos.semana.numero}</span>
    </div>

    <div class="executive-summary">
      <p>${escapeHtml(analisis.resumen_ejecutivo)}</p>
    </div>

    ${highlights ? `<div class="highlights-row">${highlights}</div>` : ''}
  </div>`;
}

function renderAlertas(analisis: AnalisisGemini): string {
  if (!analisis.alertas || analisis.alertas.length === 0) return '';

  const cards = analisis.alertas.map(a => {
    const icon = a.nivel === 'urgente' ? '🔴' : a.nivel === 'atencion' ? '⚠️' : '✅';
    const cls = `alerta-card alerta-card--${a.nivel}`;
    const accion = a.accion
      ? `<div class="alerta-card__accion">→ ${escapeHtml(a.accion)}</div>`
      : '';
    return `
    <div class="${cls}">
      <div class="alerta-card__icon">${icon}</div>
      <div class="alerta-card__body">
        <div class="alerta-card__titulo">${escapeHtml(a.titulo)}</div>
        <div class="alerta-card__desc">${escapeHtml(a.descripcion)}</div>
        ${accion}
      </div>
    </div>`;
  }).join('');

  return `
  <div class="section">
    <div class="section-header">
      <div class="section-number">!</div>
      <h2>Alertas y Novedades</h2>
    </div>
    <div class="alertas-grid">
      ${cards}
    </div>
  </div>`;
}

function renderPersonal(datos: any, analisis: AnalisisGemini): string {
  const p = datos.personal;
  const fallasClass = p.fallas > 2 ? 'stat-box__value--danger' : p.fallas > 0 ? 'stat-box__value--warn' : '';
  return `
  <div class="section">
    <div class="section-header">
      <div class="section-number">1</div>
      <h2>Personal</h2>
      <span class="section-label">Semana ${datos.semana.numero}</span>
    </div>
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-box__value">${p.totalTrabajadores}</div>
        <div class="stat-box__label">Total</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__value">${p.empleados}</div>
        <div class="stat-box__label">Empleados</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__value">${p.contratistas}</div>
        <div class="stat-box__label">Contratistas</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__value ${fallasClass}">${p.fallas}</div>
        <div class="stat-box__label">Fallas</div>
      </div>
      <div class="stat-box">
        <div class="stat-box__value">${p.permisos}</div>
        <div class="stat-box__label">Permisos</div>
      </div>
    </div>
  </div>`;
}

function renderJornales(datos: any, analisis: AnalisisGemini): string {
  if (!datos.jornales) return '';
  const { actividades, lotes, datos: matrizDatos, totalesPorActividad, totalesPorLote, totalGeneral } = datos.jornales;

  // Table header
  const thLotes = lotes.map((l: string) =>
    `<th>${escapeHtml(l)}</th>`
  ).join('');

  // Table rows
  const rows = actividades.map((act: string) => {
    const celdas = lotes.map((lote: string) => {
      const celda = matrizDatos[act]?.[lote];
      const val = celda ? celda.jornales : 0;
      return `<td>${val > 0 ? formatNum(val) : '—'}</td>`;
    }).join('');
    const total = totalesPorActividad[act]?.jornales || 0;
    return `
    <tr>
      <td class="td-name">${escapeHtml(act)}</td>
      ${celdas}
      <td><strong>${formatNum(total)}</strong></td>
    </tr>`;
  }).join('');

  // Footer totals
  const footerLotes = lotes.map((lote: string) => {
    const total = totalesPorLote[lote]?.jornales || 0;
    return `<td>${formatNum(total)}</td>`;
  }).join('');

  return `
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">2</div>
      <h2>Distribución de Jornales</h2>
      <span class="section-label">${formatNum(totalGeneral.jornales)} jornales · ${formatCOP(totalGeneral.costo)}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Actividad</th>
            ${thLotes}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td>TOTAL</td>
            ${footerLotes}
            <td>${formatNum(totalGeneral.jornales)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="analysis-block">
      <p>${escapeHtml(analisis.analisis_jornales)}</p>
    </div>
  </div>`;
}

function renderAplicaciones(datos: any, analisis: AnalisisGemini): string {
  const planeadas = datos.aplicaciones?.planeadas || [];
  const activas = datos.aplicaciones?.activas || [];
  if (planeadas.length === 0 && activas.length === 0) return '';

  let content = '';

  // Active applications
  if (activas.length > 0) {
    const cards = activas.map((app: any) => {
      const pct = Math.min(100, app.porcentajeGlobal || 0);
      const fillClass = pct < 50 ? 'progress-bar__fill--warn' : '';
      const lotesProgress = app.progresoPorLote.map((lote: any) => {
        const lPct = Math.min(100, lote.porcentaje || 0);
        return `
        <tr>
          <td class="td-name">${escapeHtml(lote.loteNombre)}</td>
          <td>${lote.ejecutado} / ${lote.planeado} ${lote.unidad}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar"><div class="progress-bar__fill ${lPct < 50 ? 'progress-bar__fill--warn' : ''}" style="width:${lPct}%"></div></div>
              <span class="progress-pct">${lPct}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');

      return `
      <div class="app-card">
        <div class="app-card__header">
          <div class="app-card__name">${escapeHtml(app.nombre)}</div>
          <span class="badge badge--muted">${escapeHtml(app.tipo)}</span>
          <span class="badge badge--warn">En ejecución</span>
        </div>
        <div class="app-card__meta">Inicio: ${formatDate(app.fechaInicio)} · Propósito: ${escapeHtml(app.proposito)}</div>
        <div class="app-progress-label">Progreso global — ${app.totalEjecutado}/${app.totalPlaneado} ${app.unidad}</div>
        <div class="progress-container" style="margin-bottom:3mm">
          <div class="progress-bar"><div class="progress-bar__fill ${fillClass}" style="width:${pct}%"></div></div>
          <span class="progress-pct">${pct}%</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lote</th><th>Avance</th><th>Progreso</th></tr></thead>
            <tbody>${lotesProgress}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');
    content += `<h3 style="margin-bottom:2mm;color:var(--text-muted);font-size:8.5pt;text-transform:uppercase;letter-spacing:0.4px;">En Ejecución</h3>${cards}`;
  }

  // Planned applications
  if (planeadas.length > 0) {
    const cards = planeadas.map((app: any) => {
      const compras = app.listaCompras.map((item: any) => `
        <tr>
          <td class="td-name">${escapeHtml(item.productoNombre)}</td>
          <td><span class="badge badge--muted">${escapeHtml(item.categoria)}</span></td>
          <td>${item.cantidadNecesaria} ${escapeHtml(item.unidad)}</td>
          <td>${formatCOP(item.costoEstimado)}</td>
        </tr>`).join('');

      return `
      <div class="app-card">
        <div class="app-card__header">
          <div class="app-card__name">${escapeHtml(app.nombre)}</div>
          <span class="badge badge--muted">${escapeHtml(app.tipo)}</span>
          <span class="badge badge--primary">Planeada</span>
        </div>
        <div class="app-card__meta">
          Fecha planeada: ${formatDate(app.fechaInicioPlaneada)} ·
          Costo estimado: ${formatCOP(app.costoTotalEstimado)} ·
          Blancos: ${escapeHtml(app.blancosBiologicos.join(', '))}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Producto</th><th>Categoría</th><th>Cantidad</th><th>Costo Est.</th></tr></thead>
            <tbody>${compras}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');
    content += `<h3 style="margin-bottom:2mm;margin-top:4mm;color:var(--text-muted);font-size:8.5pt;text-transform:uppercase;letter-spacing:0.4px;">Planeadas</h3>${cards}`;
  }

  const analysisBlock = analisis.analisis_aplicaciones
    ? `<div class="analysis-block"><p>${escapeHtml(analisis.analisis_aplicaciones)}</p></div>`
    : '';

  return `
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">3</div>
      <h2>Aplicaciones</h2>
    </div>
    ${content}
    ${analysisBlock}
  </div>`;
}

function renderMonitoreo(datos: any, analisis: AnalisisGemini): string {
  if (!datos.monitoreo) return '';
  const { tendencias, detallePorLote, fechasMonitoreo } = datos.monitoreo;

  // Tendencias table
  let tendenciasHtml = '';
  if (tendencias && tendencias.length > 0) {
    // Group by pest
    const porPlaga = new Map<string, any[]>();
    tendencias.forEach((t: any) => {
      if (!porPlaga.has(t.plagaNombre)) porPlaga.set(t.plagaNombre, []);
      porPlaga.get(t.plagaNombre)!.push(t);
    });

    const thFechas = fechasMonitoreo.map((f: string) => `<th>${escapeHtml(f)}</th>`).join('');
    const rows = Array.from(porPlaga.entries()).map(([plaga, vals]) => {
      const sorted = vals.sort((a: any, b: any) => a.fecha.localeCompare(b.fecha));
      const celdas = fechasMonitoreo.map((f: string) => {
        const v = sorted.find((t: any) => t.fecha === f);
        if (!v) return '<td>—</td>';
        const pct = v.incidenciaPromedio;
        const cls = pct >= 30 ? 'sev-alta' : pct >= 20 ? 'sev-media' : 'sev-baja';
        return `<td class="${cls}">${pct.toFixed(1)}%</td>`;
      }).join('');
      return `<tr><td class="td-name">${escapeHtml(plaga)}</td>${celdas}</tr>`;
    }).join('');

    tendenciasHtml = `
    <div class="table-wrap" style="margin-bottom:3mm">
      <table>
        <thead><tr><th>Plaga / Enfermedad</th>${thFechas}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // Detail per lot
  let detalleHtml = '';
  if (detallePorLote && detallePorLote.length > 0) {
    const rows = detallePorLote.flatMap((lote: any) =>
      lote.sublotes.map((s: any, i: number) => {
        const sevClass = s.gravedad === 'Alta' ? 'sev-alta' : s.gravedad === 'Media' ? 'sev-media' : 'sev-baja';
        return `
        <tr>
          <td class="td-name">${i === 0 ? escapeHtml(lote.loteNombre) : ''}</td>
          <td>${escapeHtml(s.subloteNombre)}</td>
          <td>${escapeHtml(s.plagaNombre)}</td>
          <td class="${sevClass}">${s.incidencia.toFixed(1)}%</td>
          <td class="${sevClass}">${escapeHtml(s.gravedad)}</td>
          <td>${s.arboresAfectados} / ${s.arboresMonitoreados}</td>
        </tr>`;
      })
    ).join('');

    detalleHtml = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Lote</th><th>Sublote</th><th>Plaga</th><th>Incidencia</th><th>Gravedad</th><th>Árboles afectados</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  return `
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">4</div>
      <h2>Monitoreo Fitosanitario</h2>
      <span class="section-label">Últimas ${fechasMonitoreo.length} fechas</span>
    </div>
    ${tendenciasHtml}
    ${detalleHtml}
    <div class="analysis-block">
      <p>${escapeHtml(analisis.analisis_monitoreo)}</p>
    </div>
  </div>`;
}

function renderTemasAdicionales(datos: any): string {
  const temas = datos.temasAdicionales || [];
  if (temas.length === 0) return '';

  const bloques = temas.map((bloque: any, i: number) => {
    const titulo = bloque.titulo || `Tema ${i + 1}`;
    if (bloque.tipo === 'texto') {
      return `
      <div class="app-card">
        <h3 style="margin-bottom:2mm">${escapeHtml(titulo)}</h3>
        <p style="font-size:9pt;line-height:1.6">${escapeHtml(bloque.contenido).replace(/\n/g, '<br>')}</p>
      </div>`;
    } else if (bloque.tipo === 'imagen_con_texto') {
      return `
      <div class="app-card">
        <h3 style="margin-bottom:2mm">${escapeHtml(titulo)}</h3>
        <img src="${bloque.imagenBase64}" style="max-width:100%;max-height:60mm;border-radius:0.5rem;margin-bottom:2mm;display:block" alt="${escapeHtml(titulo)}" />
        <p style="font-size:9pt;color:var(--text-2)">${escapeHtml(bloque.descripcion)}</p>
      </div>`;
    }
    return '';
  }).join('');

  return `
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">5</div>
      <h2>Temas Adicionales</h2>
    </div>
    ${bloques}
  </div>`;
}

function renderRecomendaciones(analisis: AnalisisGemini): string {
  if (!analisis.recomendaciones || analisis.recomendaciones.length === 0) return '';

  const items = analisis.recomendaciones
    .map(r => `<li>${escapeHtml(r)}</li>`)
    .join('');

  const narrativa = analisis.narrativa_semana
    ? `<div class="analysis-block" style="margin-top:4mm"><p>${escapeHtml(analisis.narrativa_semana)}</p></div>`
    : '';

  return `
  <div class="section page-break">
    <div class="section-header">
      <div class="section-number">→</div>
      <h2>Recomendaciones para la Próxima Semana</h2>
    </div>
    <ul class="rec-list">${items}</ul>
    ${narrativa}
  </div>`;
}

function renderFooter(datos: any): string {
  return `
  <div class="report-footer">
    <div>Escocia OS · Reporte Semanal S${datos.semana.numero}/${datos.semana.ano}</div>
    <div>Generado con IA · ${formatDate(new Date().toISOString().split('T')[0])}</div>
  </div>`;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

/**
 * Genera el HTML completo del reporte semanal usando el diseño Escocia OS.
 * Toma datos estructurados + el análisis de Gemini y produce HTML imprimible.
 */
export function generarHTMLReporte(datos: any, analisis: AnalisisGemini): string {
  const header = renderHeader(datos);
  const cover = renderCover(datos, analisis);
  const alertas = renderAlertas(analisis);
  const personal = renderPersonal(datos, analisis);
  const jornales = renderJornales(datos, analisis);
  const aplicaciones = renderAplicaciones(datos, analisis);
  const monitoreo = renderMonitoreo(datos, analisis);
  const temasAdicionales = renderTemasAdicionales(datos);
  const recomendaciones = renderRecomendaciones(analisis);
  const footer = renderFooter(datos);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Semanal S${datos.semana.numero} · ${datos.semana.ano} · Escocia OS</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    ${header}
    ${cover}
    ${alertas}
    ${personal}
    ${jornales}
    ${aplicaciones}
    ${monitoreo}
    ${temasAdicionales}
    ${recomendaciones}
    ${footer}
  </div>
</body>
</html>`;
}
