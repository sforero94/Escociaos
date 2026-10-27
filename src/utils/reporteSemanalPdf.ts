// PDF vectorial del informe semanal.
//
// La descarga anterior rasterizaba cada slide de 1280×720 con html2canvas
// (escala 2) y pegaba el JPEG en una página jsPDF de [1280, 720] px. Con el
// hotfix `px_scaling` eso mide 960×540 pt y no tiene operadores de texto:
// pdftotext sale vacío. html2canvas 1.4.1 parte el texto con
// `Intl.Segmenter` (granularidad "word") y pinta cada segmento en el rect
// de `Range.getClientRects()`; en Chrome el punto, la coma, la barra, el
// guion y el % quedan como segmento propio y se dibujan con un hueco
// ("8 .5", "95 %", "Semana 43 /2026", "2026 -01-29"). El mismo motor no
// respeta flex ni el alto real de las celdas, así que los números quedan
// cortados por el borde de la fila y el pie ("Total estimado") cae fuera
// de los 720 px con `overflow: hidden`.
//
// Este módulo maqueta con jsPDF + autoTable: texto seleccionable, nombres
// completos que saltan de renglón, y otra página cuando no cabe.

import type { DatosReporteSemanal } from '@/types/reporteSemanal';

export type JsPDFConstructor = typeof import('jspdf').default;
export type AutoTableFn = typeof import('jspdf-autotable').default;

export interface LibreriasPdfReporte {
  jsPDF: JsPDFConstructor;
  autoTable: AutoTableFn;
}

type DocumentoPDF = InstanceType<JsPDFConstructor>;

export interface AnalisisReportePdf {
  resumen_ejecutivo: string;
  titulares: {
    personal?: string;
    labores?: string;
    jornales?: string;
    monitoreo?: string;
    aplicaciones?: string;
    clima?: string;
    floracion?: string;
    conductividad_electrica?: string;
    colmenas?: string;
  };
  conclusiones: Array<{
    texto: string;
    prioridad: string;
    contexto?: string;
  }>;
  interpretacion_monitoreo?: string;
  interpretacion_tendencias_monitoreo?: string;
  interpretacion_clima?: string;
  interpretacion_floracion?: string;
  interpretacion_ce?: string;
  interpretacion_colmenas?: string;
}

export interface PayloadReportePdf {
  v: 1;
  datos: DatosReporteSemanal;
  analisis: AnalisisReportePdf;
}

const ID_PAYLOAD = 'escocia-reporte-pdf';

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN_X = 32;
const MARGIN_TOP = 44;
const MARGIN_BOTTOM = 36;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const VERDE: [number, number, number] = [115, 153, 28];
const VERDE_OSCURO: [number, number, number] = [95, 125, 23];
const VERDE_CLARO: [number, number, number] = [184, 212, 127];
const TINTA: [number, number, number] = [23, 46, 8];
const CAFE: [number, number, number] = [77, 36, 15];
const LINEA: [number, number, number] = [231, 237, 221];
const GRIS: [number, number, number] = [107, 114, 128];
const FONDO: [number, number, number] = [248, 250, 245];

type Rgb = [number, number, number];

interface Motor {
  doc: DocumentoPDF;
  y: number;
  cromado: Set<number>;
  datos: DatosReporteSemanal;
}

interface MatrizJornales {
  actividades?: string[];
  filas?: Array<{ nombre: string; tipo: string }>;
  lotes?: string[];
  datos?: Record<string, Record<string, { jornales?: number; costo?: number }>>;
  totalesPorActividad?: Record<string, { jornales?: number; costo?: number }>;
  totalesPorLote?: Record<string, { jornales?: number; costo?: number }>;
  totalGeneral?: { jornales?: number; costo?: number };
}

export function incrustarPayloadReporte(
  html: string,
  datos: DatosReporteSemanal,
  analisis: AnalisisReportePdf,
): string {
  const json = JSON.stringify({ v: 1, datos, analisis } satisfies PayloadReportePdf).replace(/</g, '\\u003c');
  const etiqueta = `<script type="application/json" id="${ID_PAYLOAD}">${json}</script>`;
  if (html.includes('</body>')) return html.replace('</body>', `${etiqueta}\n</body>`);
  return `${html}\n${etiqueta}`;
}

export function extraerPayloadReporte(html: string): PayloadReportePdf | null {
  const re = new RegExp(
    `<script type="application/json" id="${ID_PAYLOAD}">([\\s\\S]*?)</script>`,
  );
  const coincidencia = html.match(re);
  if (!coincidencia) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(coincidencia[1]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const payload = parsed as Partial<PayloadReportePdf>;
  if (payload.v !== 1 || !payload.datos || !payload.analisis) return null;
  return payload as PayloadReportePdf;
}

export function armarPdfReporteDesdeHtml(libs: LibreriasPdfReporte, html: string): DocumentoPDF {
  const payload = extraerPayloadReporte(html);
  if (!payload) {
    throw new Error(
      'El HTML de este reporte no trae los datos del PDF. Genera el informe de nuevo para descargarlo.',
    );
  }
  return construirDocumentoReporteSemanal(libs, payload.datos, payload.analisis);
}

export function construirDocumentoReporteSemanal(
  libs: LibreriasPdfReporte,
  datos: DatosReporteSemanal,
  analisis: AnalisisReportePdf,
): DocumentoPDF {
  const doc = new libs.jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'letter',
    compress: false,
  });
  const semana = datos.semana;
  doc.setProperties({
    // ASCII a propósito: un em dash en setProperties hace que jsPDF 3.0.4
    // escriba el diccionario Info como UTF-16 mal formado (BOM en UTF-8 y
    // un byte suelto) y poppler reporta "Illegal character".
    title: `Informe semanal Escocia Hass - Semana ${semana.numero}/${semana.ano}`,
    subject: `${semana.inicio} - ${semana.fin}`,
    creator: 'Escocia OS',
  });

  const motor: Motor = { doc, y: MARGIN_TOP, cromado: new Set(), datos };
  pintarCromado(motor);

  portada(libs, motor, analisis);
  seccionPersonal(libs, motor, analisis);
  if (seccionActiva(datos, 'clima') && datos.clima) seccionClima(libs, motor, analisis);
  seccionLabores(libs, motor, analisis);
  seccionJornales(libs, motor, analisis);
  if (seccionActiva(datos, 'monitoreoPlagas')) seccionMonitoreo(libs, motor, analisis);
  if (seccionActiva(datos, 'floracion') && datos.floracion?.porLote?.length) seccionFloracion(libs, motor, analisis);
  if (seccionActiva(datos, 'conductividadElectrica') && datos.conductividadElectrica?.porLote?.length) {
    seccionConductividad(libs, motor, analisis);
  }
  if (seccionActiva(datos, 'colmenas') && datos.colmenas?.porApiario?.length) seccionColmenas(libs, motor, analisis);
  if (seccionActiva(datos, 'aplicaciones')) seccionAplicaciones(libs, motor, analisis);
  seccionConclusiones(libs, motor, analisis);
  seccionAdicionales(libs, motor);

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Página ${i} de ${total}`, MARGIN_X, PAGE_H - 16);
  }
  return doc;
}

function seccionActiva(datos: DatosReporteSemanal, clave: keyof DatosReporteSemanal['secciones']): boolean {
  return datos.secciones?.[clave] !== false;
}

function sanear(valor: unknown): string {
  if (valor == null) return '';
  return String(valor)
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u2191/g, '^')
    .replace(/\u2193/g, 'v')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
}

function fmtN(n: number | null | undefined, d = 1): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(d);
}

function formatCOP(n: number): string {
  const negativo = n < 0;
  const digitos = Math.round(Math.abs(n)).toString();
  const agrupado = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negativo ? '-' : ''}$${agrupado}`;
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${fmtN(n, 1)}%`;
}

function lineasDe(doc: DocumentoPDF, texto: string, ancho: number): string[] {
  const r = doc.splitTextToSize(sanear(texto), ancho);
  return Array.isArray(r) ? r : [r];
}

function paginaActual(doc: DocumentoPDF): number {
  return doc.getCurrentPageInfo().pageNumber;
}

function pintarCromado(motor: Motor): void {
  const n = paginaActual(motor.doc);
  if (motor.cromado.has(n)) return;
  motor.cromado.add(n);
  const { doc, datos } = motor;
  const semana = datos.semana;
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, PAGE_W, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('ESCOCIA HASS', MARGIN_X, 17);
  doc.setFont('helvetica', 'normal');
  const derecha = `Informe semanal  ·  Semana ${semana.numero}/${semana.ano}  ·  ${semana.inicio} — ${semana.fin}`;
  const ancho = doc.getTextWidth(derecha);
  doc.text(derecha, PAGE_W - MARGIN_X - ancho, 17);
}

function asegurar(motor: Motor, alto: number): void {
  if (motor.y + alto <= PAGE_H - MARGIN_BOTTOM) return;
  motor.doc.addPage();
  pintarCromado(motor);
  motor.y = MARGIN_TOP;
}

function titulo(motor: Motor, texto: string): void {
  asegurar(motor, 32);
  const { doc } = motor;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...TINTA);
  doc.text(sanear(texto), MARGIN_X, motor.y + 14);
  doc.setDrawColor(...VERDE);
  doc.setLineWidth(1.4);
  doc.line(MARGIN_X, motor.y + 20, MARGIN_X + CONTENT_W, motor.y + 20);
  motor.y += 30;
}

function parrafo(motor: Motor, texto: string, tamano = 11, color: Rgb = CAFE): void {
  const limpio = sanear(texto).trim();
  if (!limpio) return;
  const { doc } = motor;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tamano);
  const lineas = lineasDe(doc, limpio, CONTENT_W);
  for (const linea of lineas) {
    asegurar(motor, tamano + 4);
    doc.setTextColor(...color);
    doc.text(linea, MARGIN_X, motor.y + tamano);
    motor.y += tamano + 3;
  }
  motor.y += 4;
}

function llamada(motor: Motor, encabezado: string, cuerpo: string): void {
  const limpio = sanear(cuerpo).trim();
  if (!limpio) return;
  const { doc } = motor;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lineas = lineasDe(doc, limpio, CONTENT_W - 22);
  const alto = 18 + lineas.length * 13 + 8;
  asegurar(motor, alto);
  const y0 = motor.y;
  doc.setFillColor(...FONDO);
  doc.rect(MARGIN_X, y0, CONTENT_W, alto, 'F');
  doc.setFillColor(...VERDE);
  doc.rect(MARGIN_X, y0, 3, alto, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...VERDE);
  doc.text(sanear(encabezado).toUpperCase(), MARGIN_X + 12, y0 + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...CAFE);
  lineas.forEach((linea, i) => {
    doc.text(linea, MARGIN_X + 12, y0 + 28 + i * 13);
  });
  motor.y = y0 + alto + 10;
}

interface Kpi {
  valor: string;
  etiqueta: string;
  detalle: string;
  color?: Rgb;
}

function tarjetas(motor: Motor, items: Kpi[]): void {
  if (items.length === 0) return;
  const gap = 8;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const h = 56;
  asegurar(motor, h);
  const { doc } = motor;
  const y0 = motor.y;
  items.forEach((item, i) => {
    const x = MARGIN_X + i * (w + gap);
    const color = item.color ?? VERDE;
    doc.setDrawColor(...LINEA);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y0, w, h, 3, 3, 'FD');
    doc.setFillColor(...color);
    doc.rect(x, y0, w, 3, 'F');
    doc.setFont('helvetica', 'bold');
    let tamano = 14;
    doc.setFontSize(tamano);
    while (tamano > 8 && doc.getTextWidth(sanear(item.valor)) > w - 10) {
      tamano -= 1;
      doc.setFontSize(tamano);
    }
    doc.setTextColor(...color);
    doc.text(sanear(item.valor), x + w / 2, y0 + 24, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(...CAFE);
    doc.text(sanear(item.etiqueta), x + w / 2, y0 + 38, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(sanear(item.detalle), x + w / 2, y0 + 49, { align: 'center' });
  });
  motor.y = y0 + h + 12;
}

interface OpcionesTabla {
  heatmapDesde?: number;
  maxHeat?: number;
  filaTotal?: boolean;
}

function tabla(libs: LibreriasPdfReporte, motor: Motor, head: string[], body: string[][], opciones: OpcionesTabla = {}): void {
  if (body.length === 0) return;
  asegurar(motor, 40);
  const fontSize = head.length > 9 ? 7.5 : head.length > 7 ? 8 : 9;
  libs.autoTable(motor.doc, {
    startY: motor.y,
    head: [head.map(sanear)],
    body: body.map((fila) => fila.map(sanear)),
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    tableWidth: CONTENT_W,
    margin: { top: MARGIN_TOP, right: MARGIN_X, bottom: MARGIN_BOTTOM, left: MARGIN_X },
    styles: {
      font: 'helvetica',
      fontSize,
      textColor: CAFE,
      lineColor: LINEA,
      lineWidth: 0.3,
      cellPadding: 3,
      overflow: 'linebreak',
      valign: 'middle',
      minCellHeight: fontSize + 8,
    },
    headStyles: {
      fillColor: VERDE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize,
      valign: 'middle',
      halign: 'center',
    },
    didDrawPage: () => pintarCromado(motor),
    didParseCell: (data) => {
      if (data.section === 'head') {
        if (data.column.index === 0) data.cell.styles.halign = 'left';
        return;
      }
      if (data.section !== 'body') return;
      const esTotal = opciones.filaTotal === true && data.row.index === body.length - 1;
      if (esTotal) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = data.column.index === head.length - 1 ? VERDE_OSCURO : [231, 237, 221];
        if (data.column.index === head.length - 1) data.cell.styles.textColor = [255, 255, 255];
      }
      if (data.column.index === 0) data.cell.styles.halign = 'left';
      else data.cell.styles.halign = 'center';
      const desde = opciones.heatmapDesde ?? -1;
      if (!esTotal && data.column.index >= desde && data.column.index < head.length - 1 && opciones.maxHeat) {
        const texto = (data.cell.text || []).join('');
        const valor = Number.parseFloat(texto);
        if (!Number.isNaN(valor) && valor > 0) {
          const t = Math.min(valor / opciones.maxHeat, 1);
          data.cell.styles.fillColor = [
            Math.round(255 - t * 140),
            Math.round(255 - t * 102),
            Math.round(255 - t * 227),
          ];
          data.cell.styles.textColor = t > 0.55 ? [255, 255, 255] : TINTA;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  const conTabla = motor.doc as DocumentoPDF & { lastAutoTable?: { finalY: number } };
  motor.y = (conTabla.lastAutoTable?.finalY ?? motor.y) + 12;
}

function portada(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const { doc, datos } = motor;
  void libs;
  asegurar(motor, 28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...TINTA);
  doc.text('Informe semanal', MARGIN_X, motor.y + 16);
  motor.y += 28;
  const jornales = datos.jornales?.totalGeneral?.jornales ?? datos.labores?.matrizJornales?.totalGeneral?.jornales ?? 0;
  const costo = datos.jornales?.totalGeneral?.costo ?? datos.labores?.matrizJornales?.totalGeneral?.costo ?? 0;
  const personal = datos.personal;
  const activas = datos.aplicaciones?.activas?.length ?? 0;
  const alertas = (datos.monitoreo?.insights || []).filter((i) => i.tipo === 'urgente' || i.tipo === 'atencion').length;
  tarjetas(motor, [
    { valor: fmtN(jornales, 1), etiqueta: 'Jornales', detalle: 'trabajados' },
    { valor: formatCOP(costo || 0), etiqueta: 'Costo', detalle: 'mano de obra', color: CAFE },
    {
      valor: String(personal?.totalTrabajadores ?? 0),
      etiqueta: 'Trabajadores',
      detalle: `${personal?.empleados ?? 0} emp · ${personal?.contratistas ?? 0} cont`,
      color: CAFE,
    },
    { valor: String(activas), etiqueta: 'Aplicaciones', detalle: 'en ejecución', color: [180, 83, 9] },
    {
      valor: String(alertas),
      etiqueta: 'Alertas',
      detalle: 'fitosanitarias',
      color: alertas > 0 ? [220, 38, 38] : [22, 163, 74],
    },
  ]);
  llamada(motor, 'Resumen ejecutivo', analisis.resumen_ejecutivo || '');
}

function seccionPersonal(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  void libs;
  const p = motor.datos.personal;
  if (!p) return;
  titulo(motor, 'Personal');
  if (analisis.titulares.personal) parrafo(motor, analisis.titulares.personal, 12, TINTA);
  // La ficha de Personal del asistente muestra estos dos campos, no el
  // total de la matriz (propios + contrato). Usar la matriz aquí pintaba
  // 104% al lado de un texto que dice 86%.
  const trabajados = p.jornalesTrabajados ?? 0;
  const posibles = p.jornalesPosibles || (p.totalTrabajadores || 0) * 5.5;
  const eff = p.eficienciaOperativa;
  tarjetas(motor, [
    { valor: String(p.totalTrabajadores ?? 0), etiqueta: 'Trabajadores', detalle: 'activos' },
    { valor: String(p.fallas ?? 0), etiqueta: 'Fallas', detalle: 'ausencias', color: (p.fallas ?? 0) > 0 ? [220, 38, 38] : [22, 163, 74] },
    { valor: String(p.permisos ?? 0), etiqueta: 'Permisos', detalle: 'autorizados', color: GRIS },
    { valor: `${eff}%`, etiqueta: 'Eficiencia', detalle: `${fmtN(trabajados, 1)} de ${fmtN(posibles, 1)}`, color: eff >= 90 ? [22, 163, 74] : [180, 83, 9] },
  ]);
  const filas: string[][] = [];
  for (const f of p.detalleFallas || []) filas.push(['Falla', sanear(f.empleado), sanear(f.razon || '')]);
  for (const f of p.detallePermisos || []) filas.push(['Permiso', sanear(f.empleado), sanear(f.razon || '')]);
  if (filas.length > 0) tabla(libs, motor, ['Tipo', 'Persona', 'Detalle'], filas);
}

function seccionClima(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const c = motor.datos.clima;
  if (!c) return;
  titulo(motor, 'Clima');
  if (analisis.titulares.clima) parrafo(motor, analisis.titulares.clima, 12, TINTA);
  const rs = c.radiacionSolar;
  tarjetas(motor, [
    { valor: `${fmtN(c.tempPromedio, 1)}°`, etiqueta: 'Temperatura', detalle: `${fmtN(c.tempMin, 1)}–${fmtN(c.tempMax, 1)} °C` },
    { valor: `${fmtN(c.humedadPromedio, 0)}%`, etiqueta: 'Humedad', detalle: 'promedio', color: GRIS },
    { valor: fmtN(c.lluviaTotal, 1), etiqueta: 'Precipitación', detalle: 'mm en la semana', color: CAFE },
    { valor: fmtN(rs?.energiaKwhM2 ?? rs?.horasSolDia, 1), etiqueta: 'Energía solar', detalle: 'kWh/m²/día', color: [180, 83, 9] },
    { valor: fmtN(rs?.tiempoSolHoras, 1), etiqueta: 'Tiempo de sol', detalle: 'horas >= 120 W/m²', color: [234, 88, 12] },
    { valor: fmtN(c.vientoPromedio, 1), etiqueta: 'Viento', detalle: c.rafagaMax != null ? `ráfaga ${fmtN(c.rafagaMax, 0)} km/h` : 'km/h', color: [15, 118, 110] },
  ]);
  const filas = (c.diario || []).map((d) => [
    d.fecha,
    d.lluviaMm == null ? 's/d' : fmtN(d.lluviaMm, 1),
    fmtN(d.tempMin, 1),
    fmtN(d.tempMax, 1),
    fmtN(d.radiacionMaxWm2, 0),
  ]);
  tabla(libs, motor, ['Fecha', 'Lluvia (mm)', 'Temp mín', 'Temp máx', 'Radiación máx'], filas);
  if ((c.diario || []).some((d) => d.lluviaMm == null) || c.diasSinDatoLluvia) {
    parrafo(
      motor,
      's/d: ese día no hay lluvia confiable (el pluviómetro no reinició el contador). No se cuenta como cero.',
      9,
      GRIS,
    );
  }
  if (analisis.interpretacion_clima) llamada(motor, 'Análisis', analisis.interpretacion_clima);
}

function seccionLabores(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const programadas = motor.datos.labores?.programadas || [];
  if (programadas.length === 0) return;
  titulo(motor, 'Labores');
  if (analisis.titulares.labores) parrafo(motor, analisis.titulares.labores, 12, TINTA);
  const terminadas = programadas.filter((l) => l.estado === 'Terminada').length;
  const enProceso = programadas.filter((l) => l.estado === 'En proceso').length;
  const porIniciar = programadas.filter((l) => l.estado === 'Por iniciar').length;
  parrafo(
    motor,
    `${programadas.length} en total · ${terminadas} terminadas · ${enProceso} en proceso · ${porIniciar} por iniciar`,
    11,
    TINTA,
  );
  const filas = programadas.map((l) => [
    l.nombre || '',
    l.tipoTarea || '',
    l.estado || '',
    l.fechaInicio || '—',
    l.fechaFin || '—',
    (l.lotes || []).join(', ') || '—',
  ]);
  tabla(libs, motor, ['Nombre', 'Tipo', 'Estado', 'Inicio', 'Fin', 'Lotes'], filas);
}

function filasMatriz(matriz: MatrizJornales): Array<{ nombre: string; tipo: string }> {
  if (matriz.filas && matriz.filas.length > 0) return matriz.filas;
  return (matriz.actividades || []).map((nombre) => ({ nombre, tipo: '' }));
}

function valorJornal(matriz: MatrizJornales, nombre: string, lote: string): number {
  return Number(matriz.datos?.[nombre]?.[lote]?.jornales || 0);
}

function textoJornal(n: number): string {
  return n > 0 ? fmtN(n, 1) : '—';
}

function tablaJornales(libs: LibreriasPdfReporte, motor: Motor, matriz: MatrizJornales | undefined, encabezado: string): void {
  if (!matriz || !(matriz.actividades?.length || matriz.filas?.length)) return;
  const filas = filasDeSeguras(matriz);
  const lotes = matriz.lotes || [];
  if (filas.length === 0) return;
  parrafo(motor, encabezado, 10, CAFE);
  let max = 0;
  for (const fila of filas) {
    for (const lote of lotes) max = Math.max(max, valorJornal(matriz, fila.nombre, lote));
  }
  const conTipo = filas.some((f) => f.tipo && f.tipo !== f.nombre);
  const head = [...(conTipo ? ['Tipo'] : []), 'Nombre', ...lotes, 'Total'];
  const body = filas.map((fila) => {
    const celdas = lotes.map((lote) => textoJornal(valorJornal(matriz, fila.nombre, lote)));
    const total = Number(matriz.totalesPorActividad?.[fila.nombre]?.jornales || 0);
    return [...(conTipo ? [fila.tipo || ''] : []), fila.nombre, ...celdas, fmtN(total, 1)];
  });
  const totales = lotes.map((lote) => fmtN(Number(matriz.totalesPorLote?.[lote]?.jornales || 0), 1));
  body.push([
    ...(conTipo ? [''] : []),
    'TOTAL',
    ...totales,
    fmtN(Number(matriz.totalGeneral?.jornales || 0), 1),
  ]);
  tabla(libs, motor, head, body, {
    heatmapDesde: conTipo ? 2 : 1,
    maxHeat: max || 1,
    filaTotal: true,
  });
}

function filasDeSeguras(matriz: MatrizJornales): Array<{ nombre: string; tipo: string }> {
  return filasMatriz(matriz);
}

function seccionJornales(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const propios = motor.datos.labores?.matrizJornalesPropios;
  const contrato = motor.datos.labores?.matrizJornalesContrato;
  const combinado = motor.datos.jornales || motor.datos.labores?.matrizJornales;
  const hay = (m?: MatrizJornales) => (m?.actividades?.length || m?.filas?.length || 0) > 0;
  if (!hay(propios) && !hay(contrato) && !hay(combinado)) return;
  titulo(motor, 'Jornales');
  if (analisis.titulares.jornales) parrafo(motor, analisis.titulares.jornales, 12, TINTA);
  if (hay(propios)) tablaJornales(libs, motor, propios, 'Jornales propios');
  if (hay(contrato)) tablaJornales(libs, motor, contrato, 'Jornales por contrato');
  if (!hay(propios) && !hay(contrato) && hay(combinado)) tablaJornales(libs, motor, combinado, 'Jornales');
  barrasJornales(motor, propios, contrato, combinado);
}

function barrasJornales(
  motor: Motor,
  propios: MatrizJornales | undefined,
  contrato: MatrizJornales | undefined,
  combinado: MatrizJornales | undefined,
): void {
  const nombres = new Set<string>([
    ...(combinado?.actividades || []),
    ...(propios?.actividades || []),
    ...(contrato?.actividades || []),
  ]);
  if (nombres.size === 0) return;
  const tareas = [...nombres].map((nombre) => ({
    etiqueta: nombre,
    propio: Number(propios?.totalesPorActividad?.[nombre]?.jornales || 0),
    contrato: Number(contrato?.totalesPorActividad?.[nombre]?.jornales || 0),
  }));
  const lotesNombres = combinado?.lotes || [
    ...new Set([...(propios?.lotes || []), ...(contrato?.lotes || [])]),
  ];
  const lotes = lotesNombres.map((nombre) => ({
    etiqueta: nombre,
    propio: Number(propios?.totalesPorLote?.[nombre]?.jornales || 0),
    contrato: Number(contrato?.totalesPorLote?.[nombre]?.jornales || 0),
  }));
  parrafo(motor, 'Propios y contrato', 10, CAFE);
  dibujarLeyenda(motor);
  parrafo(motor, 'Por tarea', 10, TINTA);
  dibujarBarras(motor, tareas);
  parrafo(motor, 'Por lote', 10, TINTA);
  dibujarBarras(motor, lotes);
}

function dibujarLeyenda(motor: Motor): void {
  asegurar(motor, 16);
  const { doc } = motor;
  const y = motor.y;
  doc.setFillColor(...VERDE);
  doc.rect(MARGIN_X, y, 10, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...CAFE);
  doc.text('Propios', MARGIN_X + 14, y + 9);
  doc.setFillColor(...VERDE_CLARO);
  doc.rect(MARGIN_X + 80, y, 10, 10, 'F');
  doc.text('Contrato', MARGIN_X + 94, y + 9);
  motor.y += 18;
}

function dibujarBarras(motor: Motor, items: Array<{ etiqueta: string; propio: number; contrato: number }>): void {
  const utiles = items.filter((i) => i.propio + i.contrato > 0);
  if (utiles.length === 0) return;
  const max = Math.max(...utiles.map((i) => i.propio + i.contrato), 1);
  const { doc } = motor;
  const etiquetaAncho = 210;
  const valorAncho = 42;
  const barraAncho = CONTENT_W - etiquetaAncho - valorAncho - 8;
  for (const item of utiles) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lineas = lineasDe(doc, item.etiqueta, etiquetaAncho - 8);
    const alto = Math.max(16, lineas.length * 11);
    asegurar(motor, alto + 4);
    const yTexto = motor.y + 10;
    doc.setTextColor(...CAFE);
    lineas.forEach((linea, i) => doc.text(linea, MARGIN_X, yTexto + i * 11));
    const yBarra = motor.y + 2;
    const xBarra = MARGIN_X + etiquetaAncho;
    doc.setFillColor(...LINEA);
    doc.roundedRect(xBarra, yBarra, barraAncho, 12, 2, 2, 'F');
    const propioW = (item.propio / max) * barraAncho;
    const contratoW = (item.contrato / max) * barraAncho;
    if (propioW > 0) {
      doc.setFillColor(...VERDE);
      doc.rect(xBarra, yBarra, propioW, 12, 'F');
    }
    if (contratoW > 0) {
      doc.setFillColor(...VERDE_CLARO);
      doc.rect(xBarra + propioW, yBarra, contratoW, 12, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TINTA);
    doc.text(fmtN(item.propio + item.contrato, 1), xBarra + barraAncho + 6, yBarra + 10);
    motor.y += alto + 4;
  }
}

function seccionMonitoreo(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const mon = motor.datos.monitoreo;
  if (!mon) return;
  const resumen = (mon.resumenGlobal || []).filter((r) => r.promedioActual != null || r.minLote != null || r.maxLote != null);
  const porLote = (mon.vistasPorLote || []).filter((v) => !v.sinDatos && v.plagas?.length);
  const porSublote = (mon.vistasPorSublote || []).filter((v) => v.sublotes?.length && !v.sinDatos);
  if (resumen.length === 0 && porLote.length === 0 && porSublote.length === 0 && !mon.avisoFechaDesactualizada) return;
  titulo(motor, 'Monitoreo');
  if (analisis.titulares.monitoreo) parrafo(motor, analisis.titulares.monitoreo, 12, TINTA);
  if (mon.avisoFechaDesactualizada) parrafo(motor, mon.avisoFechaDesactualizada, 10, [146, 64, 14]);
  if (mon.fechaActual) parrafo(motor, `Monitoreo: ${mon.fechaActual}${mon.fechaAnterior ? ` · referencia ${mon.fechaAnterior}` : ''}`, 10, GRIS);
  if (resumen.length > 0) {
    parrafo(motor, 'Resumen por plaga', 10, CAFE);
    tabla(
      libs,
      motor,
      ['Plaga', 'Promedio', 'Mínimo', 'Máximo', 'Tendencia'],
      resumen.map((r) => [
        r.plagaNombre,
        r.promedioActual == null ? '—' : pct(r.promedioActual),
        r.minLote == null ? '—' : pct(r.minLote),
        r.maxLote == null ? '—' : pct(r.maxLote),
        textoTendencia(r.tendencia, r.promedioActual, r.promedioAnterior),
      ]),
    );
  }
  for (const vista of porLote) {
    parrafo(motor, vista.loteNombre, 11, TINTA);
    tabla(
      libs,
      motor,
      ['Plaga', 'Actual', 'Anterior', 'Tendencia'],
      vista.plagas.map((p) => [
        p.plagaNombre,
        p.actual == null ? '—' : pct(p.actual),
        p.anterior == null ? '—' : pct(p.anterior),
        textoTendencia(p.tendencia, p.actual, p.anterior),
      ]),
    );
  }
  for (const vista of porSublote) {
    parrafo(motor, `${vista.loteNombre} por sublote`, 11, TINTA);
    const head = ['Plaga', ...vista.sublotes];
    const body = vista.plagas.map((plaga) => [
      plaga,
      ...vista.sublotes.map((sub) => {
        const celda = vista.celdas?.[plaga]?.[sub];
        return celda?.actual == null ? '—' : pct(celda.actual);
      }),
    ]);
    tabla(libs, motor, head, body);
  }
  if (analisis.interpretacion_monitoreo) llamada(motor, 'Análisis', analisis.interpretacion_monitoreo);
  if (analisis.interpretacion_tendencias_monitoreo) llamada(motor, 'Tendencias', analisis.interpretacion_tendencias_monitoreo);
}

function textoTendencia(tendencia: string, actual: number | null, anterior: number | null): string {
  if (actual == null) return 'Sin datos';
  if (anterior == null || tendencia === 'sin_referencia') return pct(actual);
  const dir = tendencia === 'subiendo' ? 'sube' : tendencia === 'bajando' ? 'baja' : tendencia === 'estable' ? 'estable' : tendencia;
  return `${pct(actual)} (${dir}, era ${pct(anterior)})`;
}

function seccionFloracion(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const flor = motor.datos.floracion;
  if (!flor?.porLote?.length) return;
  titulo(motor, 'Floración');
  if (analisis.titulares.floracion) parrafo(motor, analisis.titulares.floracion, 12, TINTA);
  tabla(
    libs,
    motor,
    ['Lote', 'Sin flor', 'Brotes', 'Flor madura', 'Cuaje'],
    flor.porLote.map((l) => [l.loteNombre, pct(l.pctSinFlor), pct(l.pctBrotes), pct(l.pctFlorMadura), pct(l.pctCuaje)]),
  );
  if (analisis.interpretacion_floracion) llamada(motor, 'Análisis', analisis.interpretacion_floracion);
}

function seccionConductividad(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const ce = motor.datos.conductividadElectrica;
  if (!ce?.porLote?.length) return;
  titulo(motor, 'Conductividad eléctrica');
  if (analisis.titulares.conductividad_electrica) parrafo(motor, analisis.titulares.conductividad_electrica, 12, TINTA);
  const promedios = ce.porLote.map((l) => l.promedio).filter((n) => n != null);
  const promedio = promedios.length ? promedios.reduce((s, n) => s + n, 0) / promedios.length : null;
  if (promedio != null) {
    tarjetas(motor, [
      { valor: fmtN(promedio, 2), etiqueta: 'CE promedio', detalle: 'dS/m', color: CAFE },
      {
        valor: `${Math.round(ce.porLote.reduce((s, l) => s + (l.pctEnRango || 0), 0) / ce.porLote.length)}%`,
        etiqueta: 'En rango',
        detalle: 'promedio de lotes',
      },
    ]);
  }
  tabla(
    libs,
    motor,
    ['Lote', '% bajo', '% en rango', '% alto', 'Promedio', 'Lecturas'],
    ce.porLote.map((l) => [l.loteNombre, pct(l.pctBajo), pct(l.pctEnRango), pct(l.pctAlto), fmtN(l.promedio, 2), String(l.totalLecturas)]),
  );
  if (analisis.interpretacion_ce) llamada(motor, 'Análisis', analisis.interpretacion_ce);
}

function seccionColmenas(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const col = motor.datos.colmenas;
  if (!col?.porApiario?.length) return;
  titulo(motor, 'Colmenas');
  if (analisis.titulares.colmenas) parrafo(motor, analisis.titulares.colmenas, 12, TINTA);
  tabla(
    libs,
    motor,
    ['Apiario', 'Fuertes', 'Débiles', 'Muertas', 'Con reina', 'Total', '% fuertes'],
    col.porApiario.map((a) => [
      a.apiarioNombre,
      String(a.fuertes),
      String(a.debiles),
      String(a.muertas),
      String(a.conReina),
      String(a.total),
      a.total > 0 ? pct((a.fuertes / a.total) * 100) : '—',
    ]),
  );
  if (analisis.interpretacion_colmenas) llamada(motor, 'Análisis', analisis.interpretacion_colmenas);
}

function seccionAplicaciones(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  const apps = motor.datos.aplicaciones;
  if (!apps) return;
  const hay = (apps.activas?.length || 0) + (apps.planeadas?.length || 0) + (apps.cerradas?.length || 0) > 0;
  if (!hay) return;
  titulo(motor, 'Aplicaciones');
  if (analisis.titulares.aplicaciones) parrafo(motor, analisis.titulares.aplicaciones, 12, TINTA);
  for (const app of apps.activas || []) {
    parrafo(motor, `${app.nombre} · ${app.tipo || ''} · ${pct(app.porcentajeGlobal)}`, 12, TINTA);
    if (app.proposito) parrafo(motor, app.proposito, 10, GRIS);
    parrafo(
      motor,
      `${fmtN(app.totalEjecutado, 1)} / ${fmtN(app.totalPlaneado, 1)} ${app.unidad || ''}`.trim(),
      11,
      CAFE,
    );
    tabla(
      libs,
      motor,
      ['Lote', 'Ejecutado', 'Planeado', 'Avance'],
      (app.progresoPorLote || []).map((l) => [
        l.loteNombre,
        fmtN(l.ejecutado, 1),
        fmtN(l.planeado, 1),
        pct(l.porcentaje),
      ]),
    );
  }
  for (const app of apps.cerradas || []) {
    parrafo(motor, `Cierre: ${app.nombre}`, 12, TINTA);
    const g = app.general;
    if (g) {
      parrafo(
        motor,
        `Canecas/bultos plan ${fmtN(g.canecasBultosPlaneados, 1)} · real ${fmtN(g.canecasBultosReales, 1)} · costo real ${formatCOP(g.costoReal || 0)}`,
        10,
        CAFE,
      );
    }
    if (app.kpiPorLote?.length) {
      tabla(
        libs,
        motor,
        ['Lote', 'Plan', 'Real', 'Desv. canecas', 'Jornales plan', 'Jornales real'],
        app.kpiPorLote.map((l) => [
          l.loteNombre,
          fmtN(l.canecasPlaneadas, 1),
          fmtN(l.canecasReales, 1),
          l.canecasDesviacion == null ? '—' : pct(l.canecasDesviacion),
          l.jornalesPlaneados == null ? '—' : fmtN(l.jornalesPlaneados, 1),
          l.jornalesReales == null ? '—' : fmtN(l.jornalesReales, 1),
        ]),
      );
    }
    if (app.financieroPorLote?.length) {
      tabla(
        libs,
        motor,
        ['Lote', 'Insumos plan', 'Insumos real', 'Mano de obra real', 'Costo real'],
        app.financieroPorLote.map((l) => [
          l.loteNombre,
          formatCOP(l.costoInsumosPlaneado || 0),
          formatCOP(l.costoInsumosReal || 0),
          formatCOP(l.costoManoObraReal || 0),
          formatCOP(l.costoTotalReal || 0),
        ]),
      );
    }
    if (app.listaInsumos?.length) {
      parrafo(motor, `Insumos: ${app.listaInsumos.map((i) => i.nombre).join(', ')}`, 10, CAFE);
    }
  }
  for (const app of apps.planeadas || []) {
    titulo(motor, `Plan: ${app.nombre}`);
    if (app.proposito) parrafo(motor, app.proposito, 11, CAFE);
    const meta = [
      app.tipo ? `Tipo: ${app.tipo}` : '',
      app.fechaInicioPlaneada ? `Inicio: ${app.fechaInicioPlaneada}` : '',
      (app.blancosBiologicos || []).length ? `Blancos: ${app.blancosBiologicos.join(', ')}` : '',
      app.costoPorLitroKg ? `Costo por kg/L: ${formatCOP(app.costoPorLitroKg)}` : '',
      app.costoPorArbol ? `Costo por árbol: ${formatCOP(app.costoPorArbol)}` : '',
    ].filter(Boolean);
    if (meta.length) parrafo(motor, meta.join(' · '), 10, GRIS);
    const filas = (app.listaCompras || []).map((item) => [
      item.productoNombre,
      `${item.cantidadNecesaria} ${item.unidad}`,
      item.inventarioDisponible == null ? '—' : String(item.inventarioDisponible),
      item.cantidadAComprar == null ? '—' : String(item.cantidadAComprar),
      formatCOP(item.costoEstimado || 0),
    ]);
    tabla(libs, motor, ['Producto', 'Cantidad necesaria', 'Inventario', 'A ordenar', 'Costo est.'], filas);
    const total = (app.listaCompras || []).reduce((s, i) => s + (i.costoEstimado || 0), 0);
    asegurar(motor, 22);
    motor.doc.setFont('helvetica', 'bold');
    motor.doc.setFontSize(12);
    motor.doc.setTextColor(...CAFE);
    const etiqueta = `Total estimado: ${formatCOP(total)}`;
    const ancho = motor.doc.getTextWidth(etiqueta);
    motor.doc.text(etiqueta, MARGIN_X + CONTENT_W - ancho, motor.y + 14);
    motor.y += 24;
  }
}

function seccionConclusiones(libs: LibreriasPdfReporte, motor: Motor, analisis: AnalisisReportePdf): void {
  void libs;
  const items = analisis.conclusiones || [];
  if (items.length === 0) return;
  titulo(motor, 'Conclusiones');
  parrafo(motor, 'Conclusiones y recomendaciones', 12, TINTA);
  const colores: Record<string, Rgb> = {
    alta: [220, 38, 38],
    media: [217, 119, 6],
    baja: [22, 163, 74],
  };
  for (const item of items) {
    const color = colores[item.prioridad] ?? colores.media;
    const { doc } = motor;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lineas = lineasDe(doc, item.texto, CONTENT_W - 78);
    const contexto = item.contexto ? lineasDe(doc, item.contexto, CONTENT_W - 78) : [];
    const alto = 16 + lineas.length * 13 + contexto.length * 12 + 8;
    asegurar(motor, alto);
    const y0 = motor.y;
    doc.setFillColor(item.prioridad === 'alta' ? 254 : item.prioridad === 'baja' ? 240 : 255, item.prioridad === 'alta' ? 242 : item.prioridad === 'baja' ? 253 : 251, item.prioridad === 'alta' ? 242 : item.prioridad === 'baja' ? 244 : 235);
    doc.roundedRect(MARGIN_X, y0, CONTENT_W, alto, 3, 3, 'F');
    doc.setFillColor(...color);
    doc.rect(MARGIN_X, y0, 4, alto, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TINTA);
    lineas.forEach((linea, i) => doc.text(linea, MARGIN_X + 12, y0 + 16 + i * 13));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    contexto.forEach((linea, i) => doc.text(linea, MARGIN_X + 12, y0 + 16 + lineas.length * 13 + 2 + i * 12));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...color);
    doc.text(sanear(item.prioridad).toUpperCase(), MARGIN_X + CONTENT_W - 40, y0 + 16);
    motor.y = y0 + alto + 8;
  }
}

function seccionAdicionales(libs: LibreriasPdfReporte, motor: Motor): void {
  void libs;
  const bloques = motor.datos.temasAdicionales || [];
  if (bloques.length === 0) return;
  titulo(motor, 'Adicionales');
  for (const bloque of bloques) {
    parrafo(motor, bloque.titulo || 'Tema adicional', 12, TINTA);
    if (bloque.tipo === 'texto') parrafo(motor, bloque.contenido || '');
    else {
      if (bloque.descripcion) parrafo(motor, bloque.descripcion);
      const n = bloque.imagenesBase64?.length || (bloque.imagenBase64 ? 1 : 0);
      if (n > 0) parrafo(motor, `Este bloque incluye ${n} imagen(es), visibles en la presentación del reporte.`, 9, GRIS);
    }
  }
}
