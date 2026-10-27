// PDF del informe semanal, en las mismas diapositivas 16:9 que la pantalla.
//
// La captura html2canvas (1280×720, JPEG, sin texto) partía los números y
// recortaba lo que no cabía en overflow:hidden. Un rediseño en carta se
// apartó de ese mazo y Santiago lo rechazó. Este módulo dibuja cada
// diapositiva con jsPDF, en píxeles de 1280×720 (el hotfix px_scaling la
// deja en 960×540 pt), con el mismo encabezado, tarjetas y tablas. El texto
// es seleccionable. Si una tabla no cabe, sigue en otra diapositiva con el
// mismo encabezado, en vez de cortarse.

import type { DatosReporteSemanal, SeccionesReporte } from '@/types/reporteSemanal';

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

const W = 1280;
const H = 720;
const MARGIN_X = 40;
const BOTTOM = 704;
const CONTENT_W = W - MARGIN_X * 2;

const VERDE: Rgb = [115, 153, 28];
const VERDE_OSCURO: Rgb = [95, 125, 23];
const VERDE_CLARO: Rgb = [184, 212, 127];
const VERDE_BARRA: Rgb = [191, 217, 125];
const TINTA: Rgb = [23, 46, 8];
const CAFE: Rgb = [77, 36, 15];
const LINEA: Rgb = [231, 237, 221];
const GRIS: Rgb = [107, 114, 128];
const GRIS_SUAVE: Rgb = [156, 163, 175];
const FONDO: Rgb = [248, 250, 245];
const BLANCO: Rgb = [255, 255, 255];
const AMBAR: Rgb = [180, 83, 9];
const ROJO: Rgb = [220, 38, 38];
const OK: Rgb = [22, 163, 74];

type Rgb = [number, number, number];

interface Motor {
  doc: DocumentoPDF;
  y: number;
  semana: DatosReporteSemanal['semana'];
  seccion: string;
  abierta: boolean;
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

interface Columna {
  titulo: string;
  ancho: number;
  align?: 'left' | 'center' | 'right';
}

interface Celda {
  texto: string;
  fill?: Rgb;
  color?: Rgb;
  bold?: boolean;
}

const SECCIONES_ON: SeccionesReporte = {
  clima: true,
  monitoreoPlagas: true,
  floracion: true,
  conductividadElectrica: true,
  colmenas: true,
  aplicaciones: true,
};

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
  const re = new RegExp(`<script type="application/json" id="${ID_PAYLOAD}">([\\s\\S]*?)</script>`);
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
    unit: 'px',
    format: [W, H],
    hotfixes: ['px_scaling'],
    compress: false,
  });
  const semana = datos.semana;
  doc.setProperties({
    title: `Informe semanal Escocia Hass - Semana ${semana.numero}/${semana.ano}`,
    subject: `${semana.inicio} - ${semana.fin}`,
    creator: 'Escocia OS',
  });
  const motor: Motor = { doc, y: 0, semana, seccion: '', abierta: false };
  const sec = datos.secciones ?? SECCIONES_ON;

  portada(motor, datos, analisis);
  slidePersonal(motor, datos, analisis);
  if (sec.clima && datos.clima) slideClima(motor, datos, analisis);
  slideLabores(motor, datos, analisis);
  slideJornales(motor, datos, analisis);
  if (sec.monitoreoPlagas) slidesMonitoreo(motor, datos, analisis);
  if (sec.floracion && datos.floracion?.porLote?.length) slideFloracion(motor, datos, analisis);
  if (sec.conductividadElectrica && datos.conductividadElectrica?.porLote?.length) {
    slideConductividad(motor, datos, analisis);
  }
  if (sec.colmenas && datos.colmenas?.porApiario?.length) slideColmenas(motor, datos, analisis);
  if (sec.aplicaciones) slidesAplicaciones(motor, datos, analisis);
  slideConclusiones(motor, analisis);
  slideAdicionales(motor, datos);
  return doc;
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

function lineasDe(doc: DocumentoPDF, texto: string, ancho: number): string[] {
  const r = doc.splitTextToSize(sanear(texto) || ' ', Math.max(8, ancho));
  return (Array.isArray(r) ? r : [r]).filter((l) => l.length > 0);
}

function abrir(motor: Motor, seccion: string): void {
  if (motor.abierta) motor.doc.addPage();
  motor.abierta = true;
  motor.seccion = seccion;
  const { doc, semana } = motor;
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLANCO);
  doc.setCharSpace(1.4);
  doc.text(seccion, MARGIN_X, 24);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(214, 224, 186);
  const derecha = `ESCOCIA HASS  ·  S${semana.numero}/${semana.ano}  ·  ${semana.inicio} — ${semana.fin}`;
  doc.text(derecha, W - MARGIN_X, 24, { align: 'right' });
  motor.y = 58;
}

function continuarSi(motor: Motor, alto: number): void {
  if (motor.y + alto <= BOTTOM) return;
  abrir(motor, motor.seccion);
}

function titular(motor: Motor, texto: string, tamano = 22): void {
  const limpio = sanear(texto).trim();
  if (!limpio) return;
  const { doc } = motor;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(tamano);
  const lineas = lineasDe(doc, limpio, CONTENT_W);
  const alto = lineas.length * (tamano + 4) + 8;
  continuarSi(motor, alto);
  doc.setTextColor(...TINTA);
  lineas.forEach((linea, i) => {
    doc.text(linea, MARGIN_X, motor.y + tamano + i * (tamano + 4));
  });
  motor.y += alto;
}

interface Kpi {
  valor: string;
  etiqueta: string;
  detalle: string;
  color: Rgb;
}

function tarjetas(motor: Motor, items: Kpi[], alto = 96): void {
  if (items.length === 0) return;
  continuarSi(motor, alto);
  const gap = 12;
  const w = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const { doc } = motor;
  const y0 = motor.y;
  items.forEach((item, i) => {
    const x = MARGIN_X + i * (w + gap);
    doc.setFillColor(...BLANCO);
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(1);
    doc.roundedRect(x, y0, w, alto, 8, 8, 'FD');
    doc.setFillColor(...item.color);
    doc.rect(x + 1, y0 + 1, w - 2, 3, 'F');
    doc.setFont('helvetica', 'bold');
    let size = items.length >= 6 ? 22 : 28;
    doc.setFontSize(size);
    while (size > 12 && doc.getTextWidth(sanear(item.valor)) > w - 12) {
      size -= 1;
      doc.setFontSize(size);
    }
    doc.setTextColor(...item.color);
    doc.text(sanear(item.valor), x + w / 2, y0 + 40, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(...CAFE);
    doc.text(sanear(item.etiqueta), x + w / 2, y0 + 60, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRIS_SUAVE);
    const subs = lineasDe(doc, item.detalle, w - 12).slice(0, 2);
    subs.forEach((linea, k) => {
      doc.text(linea, x + w / 2, y0 + 76 + k * 12, { align: 'center' });
    });
  });
  motor.y = y0 + alto + 14;
}

function llamada(motor: Motor, titulo: string, cuerpo: string): void {
  const limpio = sanear(cuerpo).trim();
  if (!limpio) return;
  const { doc } = motor;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  const lineas = lineasDe(doc, limpio, CONTENT_W - 36);
  const alto = 28 + lineas.length * 18 + 10;
  continuarSi(motor, alto);
  const y0 = motor.y;
  doc.setFillColor(...FONDO);
  doc.roundedRect(MARGIN_X, y0, CONTENT_W, alto, 4, 4, 'F');
  doc.setFillColor(...VERDE);
  doc.rect(MARGIN_X, y0, 3, alto, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...VERDE);
  doc.setCharSpace(0.8);
  doc.text(titulo, MARGIN_X + 16, y0 + 18);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...CAFE);
  lineas.forEach((linea, i) => {
    doc.text(linea, MARGIN_X + 16, y0 + 38 + i * 18);
  });
  motor.y = y0 + alto + 10;
}

function anchoColumnas(pesos: number[]): number[] {
  const suma = pesos.reduce((s, n) => s + n, 0);
  return pesos.map((p) => (CONTENT_W * p) / suma);
}

function medirFila(doc: DocumentoPDF, celdas: Celda[], columnas: Columna[], font: number): number {
  doc.setFontSize(font);
  let lineas = 1;
  celdas.forEach((celda, i) => {
    doc.setFont('helvetica', celda.bold ? 'bold' : 'normal');
    const n = lineasDe(doc, celda.texto, columnas[i].ancho - 8).length;
    if (n > lineas) lineas = n;
  });
  return Math.max(24, lineas * (font + 3) + 8);
}

function pintarCeldas(
  doc: DocumentoPDF,
  x0: number,
  y: number,
  h: number,
  columnas: Columna[],
  celdas: Celda[],
  font: number,
  encabezado = false,
): void {
  let x = x0;
  columnas.forEach((col, i) => {
    const celda = celdas[i] ?? { texto: '' };
    const fill = celda.fill ?? (encabezado ? VERDE : BLANCO);
    const color = celda.color ?? (encabezado ? BLANCO : CAFE);
    doc.setFillColor(...fill);
    doc.rect(x, y, col.ancho, h, 'F');
    doc.setDrawColor(...(encabezado ? VERDE_OSCURO : LINEA));
    doc.setLineWidth(0.6);
    doc.rect(x, y, col.ancho, h, 'S');
    doc.setFont('helvetica', encabezado || celda.bold ? 'bold' : 'normal');
    doc.setFontSize(font);
    doc.setTextColor(...color);
    const lineas = lineasDe(doc, celda.texto, col.ancho - 8);
    const lineH = font + 3;
    const bloque = lineas.length * lineH;
    let ty = y + (h - bloque) / 2 + font * 0.75;
    const align = col.align ?? 'left';
    for (const linea of lineas) {
      const tw = doc.getTextWidth(linea);
      let tx = x + 5;
      if (align === 'center') tx = x + (col.ancho - tw) / 2;
      if (align === 'right') tx = x + col.ancho - tw - 5;
      doc.text(linea, tx, ty);
      ty += lineH;
    }
    x += col.ancho;
  });
}

function tabla(motor: Motor, columnas: Columna[], filas: Celda[][], font = 11): void {
  const cabeza: Celda[] = columnas.map((c) => ({ texto: c.titulo, bold: true }));
  const pintarCabeza = () => {
    const h = 28;
    continuarSi(motor, h + 24);
    pintarCeldas(motor.doc, MARGIN_X, motor.y, h, columnas, cabeza, font, true);
    motor.y += h;
  };
  pintarCabeza();
  for (const fila of filas) {
    const h = medirFila(motor.doc, fila, columnas, font);
    if (motor.y + h > BOTTOM) {
      abrir(motor, motor.seccion);
      pintarCabeza();
    }
    pintarCeldas(motor.doc, MARGIN_X, motor.y, h, columnas, fila, font, false);
    motor.y += h;
  }
  motor.y += 12;
}

function portada(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  motor.abierta = true;
  const { doc, semana } = motor;
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, W, 200, 'F');
  doc.setFillColor(...VERDE_OSCURO);
  doc.rect(0, 140, W, 60, 'F');
  doc.setFillColor(...VERDE);
  doc.rect(0, 0, W, 150, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(40);
  doc.setTextColor(...BLANCO);
  doc.text('ESCOCIA HASS', 48, 86);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(19);
  doc.setTextColor(235, 242, 220);
  doc.text(`Informe Semanal — Semana ${semana.numero}/${semana.ano}`, 48, 118);
  doc.setFontSize(13);
  doc.setTextColor(214, 224, 186);
  doc.text(`${semana.inicio} — ${semana.fin}`, 48, 142);

  const jornales = datos.jornales?.totalGeneral?.jornales ?? datos.labores?.matrizJornales?.totalGeneral?.jornales ?? 0;
  const costo = datos.jornales?.totalGeneral?.costo ?? datos.labores?.matrizJornales?.totalGeneral?.costo ?? 0;
  const personal = datos.personal;
  const activas = datos.aplicaciones?.activas?.length ?? 0;
  const alertas = (datos.monitoreo?.insights || []).filter((i) => i.tipo === 'urgente' || i.tipo === 'atencion').length;
  motor.y = 220;
  tarjetas(motor, [
    { valor: fmtN(jornales, 1), etiqueta: 'Jornales', detalle: 'trabajados', color: VERDE },
    { valor: formatCOP(costo || 0), etiqueta: 'Costo Total', detalle: 'mano de obra', color: CAFE },
    {
      valor: String(personal?.totalTrabajadores ?? 0),
      etiqueta: 'Trabajadores',
      detalle: `${personal?.empleados ?? 0} emp · ${personal?.contratistas ?? 0} cont`,
      color: CAFE,
    },
    { valor: String(activas), etiqueta: 'Aplicaciones', detalle: 'en ejecucion', color: AMBAR },
    { valor: String(alertas), etiqueta: 'Alertas', detalle: 'fitosanitarias', color: alertas > 0 ? ROJO : OK },
  ]);
  llamada(motor, 'RESUMEN EJECUTIVO', analisis.resumen_ejecutivo || '');
}

function slidePersonal(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const p = datos.personal;
  if (!p) return;
  abrir(motor, 'PERSONAL');
  if (analisis.titulares.personal) titular(motor, analisis.titulares.personal);
  const jT = datos.jornales?.totalGeneral?.jornales || 0;
  const jP = p.jornalesPosibles || (p.totalTrabajadores || 0) * 5.5;
  const eff = jP > 0 ? Math.round((jT / jP) * 100) : 0;
  tarjetas(motor, [
    { valor: String(p.totalTrabajadores || 0), etiqueta: 'Trabajadores', detalle: 'activos', color: VERDE },
    { valor: String(p.fallas || 0), etiqueta: 'Fallas', detalle: 'ausencias', color: (p.fallas || 0) > 0 ? ROJO : OK },
    { valor: String(p.permisos || 0), etiqueta: 'Permisos', detalle: 'autorizados', color: GRIS },
    { valor: `${eff}%`, etiqueta: 'Eficiencia', detalle: `${fmtN(jT, 1)} de ${jP} jornales`, color: eff >= 90 ? OK : eff >= 70 ? AMBAR : ROJO },
  ], 100);
  tarjetas(motor, [
    { valor: String(p.ingresos || 0), etiqueta: 'Ingresos', detalle: 'nuevos', color: CAFE },
    { valor: String(p.retiros || 0), etiqueta: 'Retiros', detalle: 'salidas', color: (p.retiros || 0) > 0 ? ROJO : GRIS },
    { valor: fmtN(jT, 1), etiqueta: 'Jornales', detalle: 'trabajados', color: VERDE },
    { valor: String(jP), etiqueta: 'Posibles', detalle: 'jornales', color: GRIS },
  ], 100);
  const fallas = p.detalleFallas || [];
  const permisos = p.detallePermisos || [];
  if (fallas.length === 0 && permisos.length === 0) return;
  continuarSi(motor, 40);
  const { doc } = motor;
  const colW = (CONTENT_W - 32) / 2;
  if (fallas.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ROJO);
    doc.setCharSpace(0.8);
    doc.text(`FALLAS (${fallas.length})`, MARGIN_X, motor.y + 12);
    doc.setCharSpace(0);
    let y = motor.y + 28;
    for (const f of fallas) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...CAFE);
      const nombre = sanear(f.empleado);
      const anchoNombre = doc.getTextWidth(nombre);
      doc.text(nombre, MARGIN_X, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...GRIS_SUAVE);
      const motivo = sanear(f.razon || '');
      if (motivo) doc.text(motivo, MARGIN_X + anchoNombre + doc.getTextWidth(' '), y);
      y += 18;
    }
  }
  if (permisos.length > 0) {
    const x = MARGIN_X + colW + 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...AMBAR);
    doc.text(`PERMISOS (${permisos.length})`, x, motor.y + 12);
    let y = motor.y + 28;
    for (const f of permisos) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...CAFE);
      doc.text(`${sanear(f.empleado)}  ${sanear(f.razon || '')}`, x, y);
      y += 18;
    }
  }
}

function slideClima(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const c = datos.clima;
  if (!c) return;
  abrir(motor, 'RESUMEN DEL CLIMA');
  titular(motor, analisis.titulares.clima || 'Condiciones climáticas de la semana');
  const rs = c.radiacionSolar;
  const energia = rs?.energiaKwhM2 != null ? String(rs.energiaKwhM2) : rs?.horasSolDia != null ? String(rs.horasSolDia) : '—';
  const sol = rs?.tiempoSolHoras != null ? String(rs.tiempoSolHoras) : '—';
  tarjetas(motor, [
    { valor: `${fmtN(c.tempPromedio, 1)}°`, etiqueta: 'Temperatura', detalle: `${fmtN(c.tempMin, 1)}–${fmtN(c.tempMax, 1)} °C`, color: VERDE },
    { valor: `${fmtN(c.humedadPromedio, 0)}%`, etiqueta: 'Humedad', detalle: 'promedio', color: GRIS },
    { valor: fmtN(c.lluviaTotal, 1), etiqueta: 'Precipitación', detalle: c.diasSinDatoLluvia ? `mm · ${c.diasSinDatoLluvia}d sin dato` : 'mm total', color: CAFE },
    { valor: energia, etiqueta: 'Energía solar', detalle: `kWh/m²/día${rs?.statusLabel ? ' · ' + rs.statusLabel : ''}`, color: AMBAR },
    { valor: sol, etiqueta: 'Tiempo de sol', detalle: `h >=120 W/m²`, color: [234, 88, 12] },
    { valor: fmtN(c.vientoPromedio, 1), etiqueta: 'Viento', detalle: c.rafagaMax != null ? `km/h · ráfaga ${fmtN(c.rafagaMax, 0)}` : 'km/h promedio', color: [15, 118, 110] },
  ], 108);
  graficoClima(motor, c.diario || []);
  if (analisis.interpretacion_clima) llamada(motor, 'ANÁLISIS', analisis.interpretacion_clima);
}

function graficoClima(motor: Motor, diario: NonNullable<DatosReporteSemanal['clima']>['diario']): void {
  if (!diario || diario.length === 0) return;
  const alto = 230;
  continuarSi(motor, alto);
  const { doc } = motor;
  const x0 = MARGIN_X + 20;
  const y0 = motor.y;
  const chartW = CONTENT_W - 40;
  const chartH = 180;
  const padL = 44;
  const padR = 44;
  const padT = 16;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;
  const maxLluvia = Math.max(...diario.map((d) => d.lluviaMm ?? 0), 1);
  const maxRad = Math.max(...diario.map((d) => d.radiacionMaxWm2 || 0), 1);
  const gap = plotW / diario.length;
  const barW = Math.min(48, gap * 0.45);
  const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.6);
  doc.line(x0 + padL, y0 + padT, x0 + padL, y0 + padT + plotH);
  doc.line(x0 + padL, y0 + padT + plotH, x0 + padL + plotW, y0 + padT + plotH);

  diario.forEach((d, i) => {
    const cx = x0 + padL + i * gap + gap / 2;
    if (d.lluviaMm == null) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS_SUAVE);
      doc.text('s/d', cx, y0 + padT + plotH - 6, { align: 'center' });
    } else {
      const h = (d.lluviaMm / maxLluvia) * plotH;
      doc.setFillColor(...VERDE_BARRA);
      doc.roundedRect(cx - barW / 2, y0 + padT + plotH - h, barW, Math.max(h, 1), 2, 2, 'F');
    }
    const dt = new Date(`${d.fecha}T12:00:00`);
    const marca = d.coberturaParcial ? '*' : '';
    doc.setFontSize(10);
    doc.setTextColor(...(d.coberturaParcial ? AMBAR : GRIS));
    doc.text(`${dias[dt.getDay()]} ${dt.getDate()}${marca}`, cx, y0 + padT + plotH + 16, { align: 'center' });
  });

  doc.setDrawColor(245, 158, 11);
  doc.setLineWidth(1.6);
  const puntos = diario.map((d, i) => {
    const x = x0 + padL + i * gap + gap / 2;
    const y = y0 + padT + plotH - ((d.radiacionMaxWm2 || 0) / maxRad) * plotH;
    return { x, y };
  });
  for (let i = 1; i < puntos.length; i++) {
    doc.line(puntos[i - 1].x, puntos[i - 1].y, puntos[i].x, puntos[i].y);
  }
  doc.setFillColor(245, 158, 11);
  for (const p of puntos) doc.circle(p.x, p.y, 3, 'F');

  doc.setFontSize(9);
  doc.setTextColor(...VERDE_BARRA);
  doc.text(`${maxLluvia.toFixed(0)} mm`, x0 + padL - 6, y0 + padT + 4, { align: 'right' });
  doc.text('0', x0 + padL - 6, y0 + padT + plotH, { align: 'right' });
  doc.setTextColor(245, 158, 11);
  doc.text(maxRad.toFixed(0), x0 + padL + plotW + 6, y0 + padT + 4);
  doc.text('0', x0 + padL + plotW + 6, y0 + padT + plotH);

  const leyendaY = y0 + chartH + 8;
  doc.setFillColor(...VERDE_BARRA);
  doc.roundedRect(x0 + padL, leyendaY, 12, 12, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...GRIS);
  doc.text('Lluvia (mm)', x0 + padL + 16, leyendaY + 10);
  doc.setFillColor(245, 158, 11);
  doc.roundedRect(x0 + padL + 110, leyendaY, 12, 12, 2, 2, 'F');
  doc.text('Radiación máx (W/m²)', x0 + padL + 126, leyendaY + 10);
  motor.y = leyendaY + 22;

  const sinDato = diario.filter((d) => d.lluviaMm == null).length;
  if (sinDato > 0) {
    doc.setFontSize(10);
    doc.setTextColor(...AMBAR);
    const nota = `${sinDato} día(s) sin dato confiable de lluvia (el pluviómetro no reinició su contador) — excluidos del total.`;
    const lineas = lineasDe(doc, nota, CONTENT_W);
    lineas.forEach((linea, i) => doc.text(linea, MARGIN_X, motor.y + 12 + i * 12));
    motor.y += lineas.length * 12 + 8;
  }
}

function slideLabores(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const programadas = datos.labores?.programadas || [];
  if (programadas.length === 0) return;
  abrir(motor, 'LABORES');
  if (analisis.titulares.labores) titular(motor, analisis.titulares.labores);
  const terminadas = programadas.filter((l) => l.estado === 'Terminada').length;
  const enProceso = programadas.filter((l) => l.estado === 'En proceso').length;
  const porIniciar = programadas.filter((l) => l.estado === 'Por iniciar').length;
  continuarSi(motor, 22);
  const { doc } = motor;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...TINTA);
  doc.text(`${programadas.length} Total`, MARGIN_X, motor.y + 14);
  doc.setTextColor(22, 101, 52);
  doc.text(`${terminadas} Terminadas`, MARGIN_X + 110, motor.y + 14);
  doc.setTextColor(133, 77, 14);
  doc.text(`${enProceso} En Proceso`, MARGIN_X + 250, motor.y + 14);
  if (porIniciar > 0) {
    doc.setTextColor(...CAFE);
    doc.text(`${porIniciar} Por iniciar`, MARGIN_X + 390, motor.y + 14);
  }
  motor.y += 28;
  const anchos = anchoColumnas([28, 15, 12, 12, 12, 21]);
  const columnas: Columna[] = [
    { titulo: 'Nombre', ancho: anchos[0] },
    { titulo: 'Tipo', ancho: anchos[1] },
    { titulo: 'Estado', ancho: anchos[2], align: 'center' },
    { titulo: 'Inicio', ancho: anchos[3], align: 'center' },
    { titulo: 'Fin', ancho: anchos[4], align: 'center' },
    { titulo: 'Lotes', ancho: anchos[5] },
  ];
  const estadoColor = (estado: string): Rgb => {
    if (estado === 'Terminada') return OK;
    if (estado === 'En proceso') return [133, 77, 14];
    return CAFE;
  };
  const filas: Celda[][] = programadas.map((l, i) => {
    const fondo = i % 2 === 0 ? BLANCO : FONDO;
    return [
      { texto: l.nombre || '', fill: fondo, color: TINTA, bold: true },
      { texto: l.tipoTarea || '—', fill: fondo, color: GRIS },
      { texto: l.estado || '', fill: fondo, color: estadoColor(l.estado), bold: true },
      { texto: l.fechaInicio || '—', fill: fondo, color: GRIS },
      { texto: l.fechaFin || '—', fill: fondo, color: GRIS },
      { texto: (l.lotes || []).join(', ') || '—', fill: fondo, color: GRIS },
    ];
  });
  tabla(motor, columnas, filas, 12);
}

function filasMatriz(matriz: MatrizJornales): Array<{ nombre: string; tipo: string }> {
  if (matriz.filas && matriz.filas.length > 0) return matriz.filas;
  return (matriz.actividades || []).map((nombre) => ({ nombre, tipo: '' }));
}

function valorJornal(matriz: MatrizJornales, nombre: string, lote: string): number {
  return Number(matriz.datos?.[nombre]?.[lote]?.jornales || 0);
}

function hm(val: number, mx: number): { fill: Rgb; color: Rgb } {
  if (val <= 0 || mx <= 0) return { fill: BLANCO, color: GRIS_SUAVE };
  const t = Math.min(val / mx, 1);
  const fill: Rgb = [Math.round(255 - t * 140), Math.round(255 - t * 102), Math.round(255 - t * 227)];
  return { fill, color: t > 0.55 ? BLANCO : TINTA };
}

function etiqueta(motor: Motor, texto: string): void {
  continuarSi(motor, 16);
  const { doc } = motor;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...CAFE);
  doc.setCharSpace(0.7);
  doc.text(texto, MARGIN_X, motor.y + 10);
  doc.setCharSpace(0);
  motor.y += 16;
}

function tablaJornales(motor: Motor, matriz: MatrizJornales, titulo: string): void {
  const filas = filasMatriz(matriz);
  const lotes = matriz.lotes || [];
  if (filas.length === 0) return;
  etiqueta(motor, titulo);
  let max = 0;
  for (const fila of filas) for (const lote of lotes) max = Math.max(max, valorJornal(matriz, fila.nombre, lote));
  const conTipo = filas.some((f) => f.tipo && f.tipo !== f.nombre);
  const pesos = [...(conTipo ? [14] : []), 22, ...lotes.map(() => 10), 8];
  const anchos = anchoColumnas(pesos);
  const columnas: Columna[] = [
    ...(conTipo ? [{ titulo: 'Tipo', ancho: anchos[0] }] : []),
    { titulo: 'Nombre', ancho: anchos[conTipo ? 1 : 0] },
    ...lotes.map((lote, i) => ({ titulo: lote, ancho: anchos[(conTipo ? 2 : 1) + i], align: 'center' as const })),
    { titulo: 'Total', ancho: anchos[anchos.length - 1], align: 'center' as const },
  ];
  let prevTipo = '';
  const cuerpo: Celda[][] = filas.map((fila) => {
    const tipoTexto = conTipo && fila.tipo !== prevTipo ? fila.tipo : '';
    prevTipo = fila.tipo;
    const celdas: Celda[] = [];
    if (conTipo) celdas.push({ texto: tipoTexto, fill: FONDO, color: GRIS });
    celdas.push({ texto: fila.nombre, fill: BLANCO, color: TINTA, bold: true });
    for (const lote of lotes) {
      const v = valorJornal(matriz, fila.nombre, lote);
      const tono = hm(v, max);
      celdas.push({ texto: v > 0 ? fmtN(v) : '—', fill: tono.fill, color: v > 0 ? tono.color : GRIS_SUAVE, bold: v > 0 });
    }
    const total = Number(matriz.totalesPorActividad?.[fila.nombre]?.jornales || 0);
    celdas.push({ texto: fmtN(total), fill: [240, 253, 244], color: TINTA, bold: true });
    return celdas;
  });
  const totalFila: Celda[] = [];
  if (conTipo) totalFila.push({ texto: '', fill: LINEA });
  totalFila.push({ texto: 'TOTAL', fill: LINEA, color: VERDE, bold: true });
  for (const lote of lotes) {
    totalFila.push({ texto: fmtN(Number(matriz.totalesPorLote?.[lote]?.jornales || 0)), fill: LINEA, color: TINTA, bold: true });
  }
  totalFila.push({ texto: fmtN(Number(matriz.totalGeneral?.jornales || 0)), fill: VERDE, color: BLANCO, bold: true });
  cuerpo.push(totalFila);
  tabla(motor, columnas, cuerpo, 11);
}

function slideJornales(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const propios = datos.labores?.matrizJornalesPropios as MatrizJornales | undefined;
  const contrato = datos.labores?.matrizJornalesContrato as MatrizJornales | undefined;
  const combinado = (datos.jornales || datos.labores?.matrizJornales) as MatrizJornales | undefined;
  const hay = (m?: MatrizJornales) => (m?.actividades?.length || m?.filas?.length || 0) > 0;
  if (!hay(propios) && !hay(contrato) && !hay(combinado)) return;
  abrir(motor, 'JORNALES');
  if (analisis.titulares.jornales) titular(motor, analisis.titulares.jornales);
  if (hay(propios)) tablaJornales(motor, propios as MatrizJornales, 'JORNALES PROPIOS');
  if (hay(contrato)) tablaJornales(motor, contrato as MatrizJornales, 'JORNALES POR CONTRATO');
  if (!hay(propios) && !hay(contrato) && hay(combinado)) tablaJornales(motor, combinado as MatrizJornales, 'JORNALES');
  barrasJornales(motor, propios, contrato, combinado);
}

function barrasJornales(
  motor: Motor,
  propios: MatrizJornales | undefined,
  contrato: MatrizJornales | undefined,
  combinado: MatrizJornales | undefined,
): void {
  const nombres = combinado?.actividades?.length
    ? combinado.actividades
    : [...new Set([...(propios?.actividades || []), ...(contrato?.actividades || [])])];
  const lotes = combinado?.lotes?.length
    ? combinado.lotes
    : [...new Set([...(propios?.lotes || []), ...(contrato?.lotes || [])])];
  const tareas = nombres
    .map((nombre) => ({
      etiqueta: nombre,
      propio: Number(propios?.totalesPorActividad?.[nombre]?.jornales || 0),
      contrato: Number(contrato?.totalesPorActividad?.[nombre]?.jornales || 0),
    }))
    .filter((t) => t.propio + t.contrato > 0)
    .sort((a, b) => b.propio + b.contrato - (a.propio + a.contrato));
  const porLote = lotes
    .map((nombre) => ({
      etiqueta: nombre,
      propio: Number(propios?.totalesPorLote?.[nombre]?.jornales || 0),
      contrato: Number(contrato?.totalesPorLote?.[nombre]?.jornales || 0),
    }))
    .filter((t) => t.propio + t.contrato > 0)
    .sort((a, b) => b.propio + b.contrato - (a.propio + a.contrato));
  if (tareas.length === 0 && porLote.length === 0) return;
  const alto = 18 + Math.max(tareas.length, porLote.length) * 20;
  if (motor.y + alto > BOTTOM) abrir(motor, 'JORNALES');
  const { doc } = motor;
  doc.setFillColor(...VERDE);
  doc.roundedRect(MARGIN_X, motor.y, 10, 10, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(...CAFE);
  doc.text('Propios', MARGIN_X + 14, motor.y + 9);
  doc.setFillColor(...VERDE_CLARO);
  doc.roundedRect(MARGIN_X + 80, motor.y, 10, 10, 2, 2, 'F');
  doc.text('Contrato', MARGIN_X + 94, motor.y + 9);
  motor.y += 18;
  const columna = (titulo: string, items: Array<{ etiqueta: string; propio: number; contrato: number }>, x: number, w: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...CAFE);
    doc.setCharSpace(0.7);
    doc.text(titulo, x, motor.y + 10);
    doc.setCharSpace(0);
    const max = Math.max(...items.map((i) => i.propio + i.contrato), 1);
    const labelW = 176;
    items.forEach((item, i) => {
      const y = motor.y + 18 + i * 20;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...CAFE);
      const etiquetaCompleta = sanear(item.etiqueta);
      let size = 10;
      doc.setFontSize(size);
      while (size > 7 && doc.getTextWidth(etiquetaCompleta) > labelW - 8) {
        size -= 0.5;
        doc.setFontSize(size);
      }
      doc.text(etiquetaCompleta, x + labelW, y + 11, { align: 'right' });
      const xBarra = x + labelW + 8;
      const anchoBarra = w - labelW - 16;
      doc.setFillColor(...LINEA);
      doc.roundedRect(xBarra, y + 2, anchoBarra, 14, 2, 2, 'F');
      const total = item.propio + item.contrato;
      const propioW = (item.propio / max) * anchoBarra;
      const contratoW = (item.contrato / max) * anchoBarra;
      if (propioW > 0) {
        doc.setFillColor(...VERDE);
        doc.rect(xBarra, y + 2, propioW, 14, 'F');
      }
      if (contratoW > 0) {
        doc.setFillColor(...VERDE_CLARO);
        doc.rect(xBarra + propioW, y + 2, contratoW, 14, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...(total / max > 0.35 ? BLANCO : CAFE));
      doc.text(fmtN(total, 1), xBarra + 6, y + 13);
    });
  };
  const mitad = (CONTENT_W - 24) / 2;
  const yCharts = motor.y;
  columna('POR TAREA', tareas, MARGIN_X, mitad);
  const yDespuesTareas = motor.y;
  motor.y = yCharts;
  columna('POR LOTE', porLote, MARGIN_X + mitad + 24, mitad);
  motor.y = Math.max(yDespuesTareas, motor.y) + Math.max(tareas.length, porLote.length) * 20 + 8;
}

function slidesMonitoreo(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const mon = datos.monitoreo;
  if (!mon) return;
  const resumen = (mon.resumenGlobal || []).filter((r) => r.promedioActual != null || r.minLote != null || r.maxLote != null);
  const porLote = (mon.vistasPorLote || []).filter((v) => !v.sinDatos && v.plagas?.length);
  const porSublote = (mon.vistasPorSublote || []).filter((v) => v.sublotes?.length && !v.sinDatos);
  if (resumen.length === 0 && porLote.length === 0 && porSublote.length === 0) return;
  abrir(motor, 'MONITOREO');
  if (analisis.titulares.monitoreo) titular(motor, analisis.titulares.monitoreo);
  if (mon.avisoFechaDesactualizada) {
    continuarSi(motor, 20);
    motor.doc.setFontSize(12);
    motor.doc.setTextColor(146, 64, 14);
    motor.doc.text(sanear(mon.avisoFechaDesactualizada), MARGIN_X, motor.y + 12);
    motor.y += 20;
  }
  if (resumen.length > 0) {
    const anchos = anchoColumnas([34, 22, 22, 22]);
    tabla(
      motor,
      [
        { titulo: 'Plaga', ancho: anchos[0] },
        { titulo: 'Incidencia Promedio', ancho: anchos[1], align: 'center' },
        { titulo: 'Rango (Min–Max)', ancho: anchos[2], align: 'center' },
        { titulo: 'Tendencia', ancho: anchos[3] },
      ],
      resumen.map((r) => [
        { texto: r.plagaNombre, bold: true, color: TINTA },
        { texto: r.promedioActual == null ? '—' : `${fmtN(r.promedioActual)}%`, bold: true },
        { texto: r.minLote != null && r.maxLote != null ? `${fmtN(r.minLote)}%–${fmtN(r.maxLote)}%` : '—' },
        { texto: textoTendencia(r.tendencia, r.promedioActual, r.promedioAnterior) },
      ]),
    );
  }
  for (const vista of porLote) {
    if (motor.y > BOTTOM - 80) abrir(motor, 'MONITOREO');
    etiqueta(motor, vista.loteNombre);
    const anchos = anchoColumnas([40, 20, 20, 20]);
    tabla(
      motor,
      [
        { titulo: 'Plaga', ancho: anchos[0] },
        { titulo: 'Actual', ancho: anchos[1], align: 'center' },
        { titulo: 'Anterior', ancho: anchos[2], align: 'center' },
        { titulo: 'Tendencia', ancho: anchos[3] },
      ],
      vista.plagas.map((p) => [
        { texto: p.plagaNombre, bold: true, color: TINTA },
        { texto: p.actual == null ? '—' : `${fmtN(p.actual)}%` },
        { texto: p.anterior == null ? '—' : `${fmtN(p.anterior)}%` },
        { texto: textoTendencia(p.tendencia, p.actual, p.anterior) },
      ]),
    );
  }
  for (const vista of porSublote) {
    if (motor.y > BOTTOM - 80) abrir(motor, 'MONITOREO');
    etiqueta(motor, `${vista.loteNombre} por sublote`);
    const pesos = [20, ...vista.sublotes.map(() => 10)];
    const anchos = anchoColumnas(pesos);
    tabla(
      motor,
      [
        { titulo: 'Plaga', ancho: anchos[0] },
        ...vista.sublotes.map((sub, i) => ({ titulo: sub, ancho: anchos[i + 1], align: 'center' as const })),
      ],
      vista.plagas.map((plaga) => [
        { texto: plaga, bold: true, color: TINTA },
        ...vista.sublotes.map((sub) => {
          const celda = vista.celdas?.[plaga]?.[sub];
          return { texto: celda?.actual == null ? '—' : `${fmtN(celda.actual)}%` };
        }),
      ]),
    );
  }
  const texto = analisis.interpretacion_monitoreo || analisis.interpretacion_tendencias_monitoreo;
  if (texto) llamada(motor, 'ANÁLISIS', texto);
}

function textoTendencia(tendencia: string, actual: number | null, anterior: number | null): string {
  if (actual == null) return 'Sin datos';
  if (anterior == null || tendencia === 'sin_referencia') return `${fmtN(actual)}%`;
  const dir = tendencia === 'subiendo' ? 'sube' : tendencia === 'bajando' ? 'baja' : tendencia === 'estable' ? 'estable' : tendencia;
  return `${fmtN(actual)}% (${dir}, era ${fmtN(anterior)}%)`;
}

function slideFloracion(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const flor = datos.floracion;
  if (!flor?.porLote?.length) return;
  abrir(motor, 'MONITOREO DE FLORACIÓN');
  titular(motor, analisis.titulares.floracion || 'Estado de floración por lote');
  const anchos = anchoColumnas([22, 14, 14, 16, 14, 20]);
  tabla(
    motor,
    [
      { titulo: 'Lote', ancho: anchos[0] },
      { titulo: 'Sin flor', ancho: anchos[1], align: 'center' },
      { titulo: 'Brotes', ancho: anchos[2], align: 'center' },
      { titulo: 'Flor madura', ancho: anchos[3], align: 'center' },
      { titulo: 'Cuaje', ancho: anchos[4], align: 'center' },
      { titulo: 'Distribución', ancho: anchos[5] },
    ],
    flor.porLote.map((l) => [
      { texto: l.loteNombre, bold: true, color: TINTA },
      { texto: `${fmtN(l.pctSinFlor, 0)}%` },
      { texto: `${fmtN(l.pctBrotes, 0)}%` },
      { texto: `${fmtN(l.pctFlorMadura, 0)}%` },
      { texto: `${fmtN(l.pctCuaje, 0)}%` },
      { texto: `${l.pctSinFlor}% / ${l.pctBrotes}% / ${l.pctFlorMadura}% / ${l.pctCuaje}%` },
    ]),
  );
  if (analisis.interpretacion_floracion) llamada(motor, 'ANÁLISIS', analisis.interpretacion_floracion);
}

function slideConductividad(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const ce = datos.conductividadElectrica;
  if (!ce?.porLote?.length) return;
  abrir(motor, 'CONDUCTIVIDAD ELÉCTRICA');
  titular(motor, analisis.titulares.conductividad_electrica || 'Estado de CE por lote');
  const totalLecturas = ce.porLote.reduce((s, l) => s + l.totalLecturas, 0);
  const avgCE = totalLecturas > 0 ? ce.porLote.reduce((s, l) => s + l.promedio * l.totalLecturas, 0) / totalLecturas : null;
  const avgEnRango = totalLecturas > 0
    ? Math.round(ce.porLote.reduce((s, l) => s + l.pctEnRango * l.totalLecturas, 0) / totalLecturas)
    : 0;
  tarjetas(motor, [
    { valor: avgCE == null ? '—' : avgCE.toFixed(2), etiqueta: 'CE Promedio', detalle: 'dS/m', color: VERDE },
    { valor: `${avgEnRango}%`, etiqueta: 'En Rango', detalle: '0.5–1.5 dS/m', color: avgEnRango >= 70 ? OK : ROJO },
    { valor: String(totalLecturas), etiqueta: 'Lecturas', detalle: 'árboles medidos', color: GRIS },
  ], 100);
  const anchos = anchoColumnas([22, 16, 16, 14, 16, 16]);
  tabla(
    motor,
    [
      { titulo: 'Lote', ancho: anchos[0] },
      { titulo: '% Bajo <0.5', ancho: anchos[1], align: 'center' },
      { titulo: '% En Rango', ancho: anchos[2], align: 'center' },
      { titulo: '% Alto >1.5', ancho: anchos[3], align: 'center' },
      { titulo: 'Promedio', ancho: anchos[4], align: 'center' },
      { titulo: 'Lecturas', ancho: anchos[5], align: 'center' },
    ],
    ce.porLote.map((l) => [
      { texto: l.loteNombre, bold: true, color: TINTA },
      { texto: `${l.pctBajo}%`, fill: l.pctBajo > 30 ? [254, 242, 242] : BLANCO },
      { texto: `${l.pctEnRango}%`, fill: l.pctEnRango > 70 ? [240, 253, 244] : BLANCO, bold: true },
      { texto: `${l.pctAlto}%`, fill: l.pctAlto > 30 ? [254, 242, 242] : BLANCO },
      { texto: l.promedio.toFixed(2), color: l.promedio < 0.5 || l.promedio > 1.5 ? ROJO : OK, bold: true },
      { texto: String(l.totalLecturas), color: GRIS_SUAVE },
    ]),
    12,
  );
  if (analisis.interpretacion_ce) llamada(motor, 'ANÁLISIS', analisis.interpretacion_ce);
}

function slideColmenas(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const col = datos.colmenas;
  if (!col?.porApiario?.length) return;
  abrir(motor, 'MONITOREO DE COLMENAS');
  titular(motor, analisis.titulares.colmenas || 'Estado de salud de apiarios');
  const t = col.totales;
  if (t) {
    tarjetas(motor, [
      { valor: String(t.total), etiqueta: 'Total', detalle: 'colmenas', color: VERDE },
      { valor: String(t.fuertes), etiqueta: 'Fuertes', detalle: `${t.pctFuertes}%`, color: t.pctFuertes >= 80 ? OK : AMBAR },
      { valor: String(t.debiles), etiqueta: 'Débiles', detalle: 'requieren atención', color: t.debiles > 0 ? AMBAR : GRIS },
      { valor: String(t.muertas), etiqueta: 'Muertas', detalle: 'pérdidas', color: t.muertas > 0 ? ROJO : GRIS },
      { valor: String(t.conReina), etiqueta: 'Con Reina', detalle: 'colmenas', color: CAFE },
    ]);
  }
  const anchos = anchoColumnas([22, 13, 13, 13, 13, 12, 14]);
  tabla(
    motor,
    [
      { titulo: 'Apiario', ancho: anchos[0] },
      { titulo: 'Fuertes', ancho: anchos[1], align: 'center' },
      { titulo: 'Débiles', ancho: anchos[2], align: 'center' },
      { titulo: 'Muertas', ancho: anchos[3], align: 'center' },
      { titulo: 'Con Reina', ancho: anchos[4], align: 'center' },
      { titulo: 'Total', ancho: anchos[5], align: 'center' },
      { titulo: '% Fuertes', ancho: anchos[6], align: 'center' },
    ],
    col.porApiario.map((a) => {
      const pctF = a.total > 0 ? Math.round((a.fuertes / a.total) * 100) : 0;
      return [
        { texto: a.apiarioNombre, bold: true, color: TINTA },
        { texto: String(a.fuertes), color: OK, bold: true },
        { texto: String(a.debiles), color: a.debiles > 0 ? AMBAR : GRIS },
        { texto: String(a.muertas), color: a.muertas > 0 ? ROJO : GRIS },
        { texto: String(a.conReina) },
        { texto: String(a.total) },
        { texto: `${pctF}%`, bold: true, color: pctF >= 80 ? OK : AMBAR },
      ];
    }),
  );
  if (analisis.interpretacion_colmenas) llamada(motor, 'ANÁLISIS', analisis.interpretacion_colmenas);
}

function slidesAplicaciones(motor: Motor, datos: DatosReporteSemanal, analisis: AnalisisReportePdf): void {
  const apps = datos.aplicaciones;
  if (!apps) return;
  const activas = apps.activas || [];
  if (activas.length > 0) {
    abrir(motor, 'APLICACIONES');
    if (analisis.titulares.aplicaciones) titular(motor, analisis.titulares.aplicaciones);
    for (const app of activas) {
      const pct = app.porcentajeGlobal || 0;
      const color = pct >= 80 ? OK : pct >= 40 ? AMBAR : ROJO;
      continuarSi(motor, 70);
      const { doc } = motor;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(...TINTA);
      doc.text(sanear(app.nombre), MARGIN_X, motor.y + 18);
      doc.setFontSize(28);
      doc.setTextColor(...color);
      doc.text(`${fmtN(pct)}%`, W - MARGIN_X, motor.y + 22, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(...GRIS);
      doc.text(sanear(`${app.tipo} · ${app.proposito || ''}`), MARGIN_X, motor.y + 38);
      motor.y += 48;
      const barraW = CONTENT_W;
      const lleno = Math.max(0, Math.min(100, pct)) / 100 * barraW;
      doc.setFillColor(...LINEA);
      doc.roundedRect(MARGIN_X, motor.y, barraW, 24, 4, 4, 'F');
      if (lleno > 0) {
        doc.setFillColor(...color);
        doc.roundedRect(MARGIN_X, motor.y, Math.max(lleno, 8), 24, 4, 4, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...(pct > 45 ? BLANCO : CAFE));
      doc.text(`${fmtN(app.totalEjecutado, 1)}/${fmtN(app.totalPlaneado, 1)} ${app.unidad}`, MARGIN_X + barraW / 2, motor.y + 16, { align: 'center' });
      motor.y += 40;
      for (const lote of app.progresoPorLote || []) {
        continuarSi(motor, 36);
        const lp = Math.round((lote.porcentaje || 0) * 10) / 10;
        const tono = lp >= 100 ? OK : lp >= 50 ? VERDE : VERDE_BARRA;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.setTextColor(...CAFE);
        doc.text(sanear(lote.loteNombre), MARGIN_X + 180, motor.y + 18, { align: 'right' });
        const xBarra = MARGIN_X + 192;
        const wBarra = CONTENT_W - 192;
        doc.setFillColor(...LINEA);
        doc.roundedRect(xBarra, motor.y + 4, wBarra, 24, 4, 4, 'F');
        const wLleno = Math.max(0, Math.min(100, lp)) / 100 * wBarra;
        if (wLleno > 0) {
          doc.setFillColor(...tono);
          doc.rect(xBarra, motor.y + 4, wLleno, 24, 'F');
        }
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(lp > 50 ? BLANCO : CAFE));
        doc.text(`${fmtN(lote.ejecutado, 1)}/${fmtN(lote.planeado, 1)} (${fmtN(lp)}%)`, xBarra + 8, motor.y + 20);
        motor.y += 36;
      }
      motor.y += 8;
    }
  }
  for (const app of apps.cerradas || []) slideCierre(motor, app);
  for (const app of apps.planeadas || []) slidePlan(motor, app);
}

function slideCierre(motor: Motor, app: DatosReporteSemanal['aplicaciones'] extends infer A ? A extends { cerradas: infer C } ? C extends Array<infer I> ? I : never : never : never): void {
  abrir(motor, 'CIERRE');
  titular(motor, app.nombre, 20);
  const g = app.general;
  if (g) {
    continuarSi(motor, 36);
    motor.doc.setFontSize(12);
    motor.doc.setTextColor(...CAFE);
    motor.doc.text(
      `Canecas/bultos plan ${fmtN(g.canecasBultosPlaneados, 1)} · real ${fmtN(g.canecasBultosReales, 1)} · costo real ${formatCOP(g.costoReal || 0)}`,
      MARGIN_X,
      motor.y + 14,
    );
    motor.y += 28;
  }
  if (app.kpiPorLote?.length) {
    const anchos = anchoColumnas([18, 12, 12, 14, 14, 14, 16]);
    tabla(motor, [
      { titulo: 'Lote', ancho: anchos[0] },
      { titulo: 'Plan', ancho: anchos[1], align: 'center' },
      { titulo: 'Real', ancho: anchos[2], align: 'center' },
      { titulo: 'Desv. canecas', ancho: anchos[3], align: 'center' },
      { titulo: 'Jornales plan', ancho: anchos[4], align: 'center' },
      { titulo: 'Jornales real', ancho: anchos[5], align: 'center' },
      { titulo: 'Insumos', ancho: anchos[6] },
    ], app.kpiPorLote.map((l) => [
      { texto: l.loteNombre, bold: true, color: TINTA },
      { texto: fmtN(l.canecasPlaneadas, 1) },
      { texto: fmtN(l.canecasReales, 1) },
      { texto: l.canecasDesviacion == null ? '—' : `${fmtN(l.canecasDesviacion)}%` },
      { texto: l.jornalesPlaneados == null ? '—' : fmtN(l.jornalesPlaneados, 1) },
      { texto: l.jornalesReales == null ? '—' : fmtN(l.jornalesReales, 1) },
      { texto: l.insumosReales == null ? '—' : String(l.insumosReales) },
    ]));
  }
  if (app.financieroPorLote?.length) {
    etiqueta(motor, 'RESULTADO FINANCIERO');
    const anchos = anchoColumnas([20, 20, 20, 20, 20]);
    tabla(motor, [
      { titulo: 'Lote', ancho: anchos[0] },
      { titulo: 'Insumos plan', ancho: anchos[1], align: 'right' },
      { titulo: 'Insumos real', ancho: anchos[2], align: 'right' },
      { titulo: 'Mano de obra real', ancho: anchos[3], align: 'right' },
      { titulo: 'Costo real', ancho: anchos[4], align: 'right' },
    ], app.financieroPorLote.map((l) => [
      { texto: l.loteNombre, bold: true, color: TINTA },
      { texto: formatCOP(l.costoInsumosPlaneado || 0) },
      { texto: formatCOP(l.costoInsumosReal || 0) },
      { texto: formatCOP(l.costoManoObraReal || 0) },
      { texto: formatCOP(l.costoTotalReal || 0), bold: true },
    ]));
  }
  if (app.listaInsumos?.length) {
    continuarSi(motor, 20);
    motor.doc.setFontSize(11);
    motor.doc.setTextColor(...CAFE);
    const texto = `Insumos: ${app.listaInsumos.map((i) => i.nombre).join(', ')}`;
    const lineas = lineasDe(motor.doc, texto, CONTENT_W);
    lineas.forEach((linea, i) => motor.doc.text(linea, MARGIN_X, motor.y + 12 + i * 14));
    motor.y += lineas.length * 14 + 8;
  }
}

function slidePlan(motor: Motor, app: DatosReporteSemanal['aplicaciones']['planeadas'][number]): void {
  abrir(motor, 'APLICACIONES');
  titular(motor, `Plan: ${app.nombre}`, 20);
  const { doc } = motor;
  const colIzq = 280;
  const xDer = MARGIN_X + colIzq + 24;
  const wDer = CONTENT_W - colIzq - 24;
  const y0 = motor.y;
  const bloque = (y: number, tituloBloque: string, cuerpo: string, alto: number, fondo: Rgb = FONDO): number => {
    doc.setFillColor(...fondo);
    doc.roundedRect(MARGIN_X, y, colIzq, alto, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...VERDE);
    doc.setCharSpace(0.6);
    doc.text(tituloBloque, MARGIN_X + 12, y + 16);
    doc.setCharSpace(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...CAFE);
    const lineas = lineasDe(doc, cuerpo, colIzq - 24);
    lineas.forEach((linea, i) => doc.text(linea, MARGIN_X + 12, y + 34 + i * 14));
    return y + alto + 8;
  };
  let y = bloque(y0, 'PROPOSITO', app.proposito || '—', 72);
  if ((app.blancosBiologicos || []).length > 0) {
    y = bloque(y, 'BLANCOS BIOLOGICOS', app.blancosBiologicos.join(' · '), 56, [255, 251, 235]);
  }
  y = bloque(y, 'FECHAS', `Inicio: ${app.fechaInicioPlaneada || '—'}`, 48);
  doc.setFillColor(...LINEA);
  doc.roundedRect(MARGIN_X, y, (colIzq - 8) / 2, 48, 6, 6, 'F');
  doc.roundedRect(MARGIN_X + (colIzq + 8) / 2, y, (colIzq - 8) / 2, 48, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...VERDE);
  doc.text(app.tipo === 'Fumigacion' ? 'COSTO/L' : 'COSTO/KG', MARGIN_X + 10, y + 16);
  doc.text('COSTO/ARBOL', MARGIN_X + (colIzq + 8) / 2 + 10, y + 16);
  doc.setFontSize(14);
  doc.setTextColor(...TINTA);
  doc.text(app.costoPorLitroKg ? formatCOP(app.costoPorLitroKg) : '—', MARGIN_X + 10, y + 36);
  doc.text(app.costoPorArbol ? formatCOP(app.costoPorArbol) : '—', MARGIN_X + (colIzq + 8) / 2 + 10, y + 36);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...CAFE);
  doc.setCharSpace(0.7);
  doc.text('LISTA DE COMPRAS', xDer, y0 + 12);
  doc.setCharSpace(0);
  const compras = app.listaCompras || [];
  const pesos = [28, 18, 16, 16, 22];
  const suma = pesos.reduce((s, n) => s + n, 0);
  const anchos = pesos.map((p) => (wDer * p) / suma);
  const columnas: Columna[] = [
    { titulo: 'Producto', ancho: anchos[0] },
    { titulo: 'Cant. Nec.', ancho: anchos[1], align: 'center' },
    { titulo: 'Inventario', ancho: anchos[2], align: 'center' },
    { titulo: 'A Ordenar', ancho: anchos[3], align: 'center' },
    { titulo: 'Costo Est.', ancho: anchos[4], align: 'right' },
  ];
  const filas: Celda[][] = compras.map((item, i) => {
    const fondo = i % 2 === 0 ? BLANCO : FONDO;
    const ordenar = item.cantidadAComprar ?? 0;
    return [
      { texto: item.productoNombre, fill: fondo, bold: true, color: TINTA },
      { texto: `${item.cantidadNecesaria} ${item.unidad}`, fill: fondo },
      { texto: item.inventarioDisponible == null ? '—' : String(item.inventarioDisponible), fill: fondo },
      { texto: item.cantidadAComprar == null ? '—' : String(item.cantidadAComprar), fill: fondo, color: ordenar > 0 ? ROJO : OK, bold: true },
      { texto: formatCOP(item.costoEstimado || 0), fill: fondo },
    ];
  });
  const yTabla = y0 + 20;
  const guardar = motor.y;
  motor.y = yTabla;
  const cabeza: Celda[] = columnas.map((c) => ({ texto: c.titulo, bold: true }));
  let xTabla = xDer;
  pintarCeldas(doc, xTabla, motor.y, 28, columnas, cabeza, 11, true);
  motor.y += 28;
  for (const fila of filas) {
    const h = medirFila(doc, fila, columnas, 11);
    if (motor.y + h > BOTTOM - 28) {
      abrir(motor, 'APLICACIONES');
      xTabla = MARGIN_X;
      pintarCeldas(doc, xTabla, motor.y, 28, columnas, cabeza, 11, true);
      motor.y += 28;
    }
    pintarCeldas(doc, xTabla, motor.y, h, columnas, fila, 11, false);
    motor.y += h;
  }
  const total = compras.reduce((s, i) => s + (i.costoEstimado || 0), 0);
  const yTotal = Math.max(motor.y, y) + 16;
  if (yTotal + 18 > BOTTOM) {
    abrir(motor, 'APLICACIONES');
  }
  const yPie = motor.y > yTotal ? motor.y + 8 : yTotal;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...CAFE);
  const etiquetaTotal = `Total estimado: ${formatCOP(total)}`;
  doc.text(etiquetaTotal, W - MARGIN_X, yPie, { align: 'right' });
  motor.y = Math.max(guardar, yPie + 10);
}

function slideConclusiones(motor: Motor, analisis: AnalisisReportePdf): void {
  const items = analisis.conclusiones || [];
  if (items.length === 0) return;
  abrir(motor, 'CONCLUSIONES');
  titular(motor, 'Conclusiones y Recomendaciones', 20);
  const colores: Record<string, { fondo: Rgb; borde: Rgb }> = {
    alta: { fondo: [254, 242, 242], borde: ROJO },
    media: { fondo: [255, 251, 235], borde: [217, 119, 6] },
    baja: { fondo: [240, 253, 244], borde: OK },
  };
  for (const item of items) {
    const color = colores[item.prioridad] ?? colores.media;
    const { doc } = motor;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    const lineas = lineasDe(doc, item.texto, CONTENT_W - 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const contexto = item.contexto ? lineasDe(doc, item.contexto, CONTENT_W - 120) : [];
    const alto = 16 + lineas.length * 16 + contexto.length * 14 + 10;
    if (motor.y + alto > BOTTOM) {
      abrir(motor, 'CONCLUSIONES');
      titular(motor, 'Conclusiones y Recomendaciones', 20);
    }
    const y0 = motor.y;
    doc.setFillColor(...color.fondo);
    doc.roundedRect(MARGIN_X, y0, CONTENT_W, alto, 8, 8, 'F');
    doc.setFillColor(...color.borde);
    doc.rect(MARGIN_X, y0, 4, alto, 'F');
    doc.circle(MARGIN_X + 18, y0 + 18, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TINTA);
    lineas.forEach((linea, i) => doc.text(linea, MARGIN_X + 30, y0 + 22 + i * 16));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GRIS);
    contexto.forEach((linea, i) => doc.text(linea, MARGIN_X + 30, y0 + 22 + lineas.length * 16 + 4 + i * 14));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...color.borde);
    doc.text(sanear(item.prioridad).toUpperCase(), W - MARGIN_X - 16, y0 + 22, { align: 'right' });
    motor.y = y0 + alto + 8;
  }
}

function slideAdicionales(motor: Motor, datos: DatosReporteSemanal): void {
  const bloques = datos.temasAdicionales || [];
  if (bloques.length === 0) return;
  for (const bloque of bloques) {
    abrir(motor, 'ADICIONALES');
    titular(motor, bloque.titulo || 'Tema Adicional', 20);
    if (bloque.tipo === 'texto' && bloque.contenido) {
      const { doc } = motor;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.setTextColor(...CAFE);
      const lineas = lineasDe(doc, bloque.contenido, CONTENT_W);
      for (const linea of lineas) {
        continuarSi(motor, 20);
        doc.text(linea, MARGIN_X, motor.y + 14);
        motor.y += 20;
      }
    } else if (bloque.tipo === 'imagen_con_texto' && bloque.descripcion) {
      titular(motor, bloque.descripcion, 13);
    }
  }
}
