import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ContentBlock {
  type: 'text' | 'chart';
  value?: string;
  chartImage?: string; // base64 PNG
  chartTitle?: string;
}

export interface InformeEscoData {
  titulo: string;
  bloques: ContentBlock[];
  fechaGeneracion: Date;
}

const COLOR_PRIMARY: [number, number, number] = [115, 153, 28];
const COLOR_DARK: [number, number, number] = [77, 36, 15];
const COLOR_GRAY: [number, number, number] = [120, 120, 120];
const PAGE_WIDTH = 210;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

function formatFechaLarga(date: Date): string {
  return `${date.getDate()} de ${MESES_ES[date.getMonth()]} de ${date.getFullYear()}`;
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_GRAY);
    doc.setFont('helvetica', 'normal');
    doc.text('Generado por Escocia OS', MARGIN, 285);
    doc.text(`${i} / ${pageCount}`, PAGE_WIDTH - MARGIN, 285, { align: 'right' });
    // Separator line
    doc.setDrawColor(...COLOR_DARK);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 282, PAGE_WIDTH - MARGIN, 282);
  }
}

function checkPageBreak(doc: jsPDF, yPosition: number, needed: number): number {
  if (yPosition + needed > 275) {
    doc.addPage();
    return 25;
  }
  return yPosition;
}

function parseMarkdownTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text.trim().split('\n');
  const tableLines: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith('|')) tableLines.push(line.trim());
  }
  if (tableLines.length < 3) return null; // header + separator + at least 1 row

  const parseLine = (line: string) =>
    line.split('|').map((c) => c.trim()).filter((c) => c.length > 0);

  const headers = parseLine(tableLines[0]);
  // Skip separator line (index 1)
  const rows = tableLines.slice(2).map(parseLine);
  if (headers.length === 0) return null;

  return { headers, rows };
}

function renderTextBlock(doc: jsPDF, text: string, yPos: number): number {
  let y = yPos;
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      y += 3;
      continue;
    }

    // Heading (### or ## or #)
    if (trimmed.startsWith('#')) {
      const headingText = trimmed.replace(/^#+\s*/, '');
      y = checkPageBreak(doc, y, 10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...COLOR_DARK);
      const wrapped = doc.splitTextToSize(headingText, CONTENT_WIDTH);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 5 + 3;
      continue;
    }

    // Bold line (**text**)
    const isBold = /^\*\*.*\*\*$/.test(trimmed);
    const cleanText = trimmed.replace(/\*\*/g, '').replace(/\*/g, '');

    y = checkPageBreak(doc, y, 6);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);

    // Bullet point
    if (cleanText.startsWith('- ') || cleanText.startsWith('• ')) {
      const bulletText = cleanText.replace(/^[-•]\s*/, '');
      const wrapped = doc.splitTextToSize(bulletText, CONTENT_WIDTH - 8);
      doc.text('•', MARGIN + 2, y);
      doc.text(wrapped, MARGIN + 8, y);
      y += wrapped.length * 4.5 + 2;
    } else {
      const wrapped = doc.splitTextToSize(cleanText, CONTENT_WIDTH);
      doc.text(wrapped, MARGIN, y);
      y += wrapped.length * 4.5 + 2;
    }
  }

  return y;
}

export function generarPDFInformeEsco(data: InformeEscoData): void {
  const doc = new jsPDF();
  let y = 20;

  // ── Header ──
  doc.setDrawColor(...COLOR_PRIMARY);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLOR_PRIMARY);
  const titleLines = doc.splitTextToSize(data.titulo, CONTENT_WIDTH);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 8 + 4;

  // Metadata
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_GRAY);
  doc.text(`Finca Escocia  ·  ${formatFechaLarga(data.fechaGeneracion)}`, MARGIN, y);
  y += 4;
  doc.text('Fuente: Asistente Esco', MARGIN, y);
  y += 6;

  // Separator
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 10;

  // ── Content blocks ──
  for (const bloque of data.bloques) {
    if (bloque.type === 'text' && bloque.value) {
      const text = bloque.value.trim();
      if (!text) continue;

      // Check if the text contains a markdown table
      const table = parseMarkdownTable(text);
      if (table) {
        // Render text before the table
        const beforeTable = text.split('\n').filter((l) => !l.trim().startsWith('|')).join('\n').trim();
        if (beforeTable) {
          y = renderTextBlock(doc, beforeTable, y);
        }

        y = checkPageBreak(doc, y, 20);
        autoTable(doc, {
          head: [table.headers],
          body: table.rows,
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          styles: { fontSize: 9, cellPadding: 3 },
          headStyles: {
            fillColor: COLOR_PRIMARY,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          alternateRowStyles: { fillColor: [245, 248, 240] },
          theme: 'grid',
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      } else {
        y = renderTextBlock(doc, text, y);
      }
    }

    if (bloque.type === 'chart' && bloque.chartImage) {
      // Chart title
      if (bloque.chartTitle) {
        y = checkPageBreak(doc, y, 8);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...COLOR_DARK);
        doc.text(bloque.chartTitle, MARGIN, y);
        y += 6;
      }

      // Chart image — fit to content width, maintain aspect ratio
      const imgProps = doc.getImageProperties(bloque.chartImage);
      const imgWidth = CONTENT_WIDTH;
      const imgHeight = (imgProps.height / imgProps.width) * imgWidth;

      y = checkPageBreak(doc, y, imgHeight + 10);

      // Light border around chart
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(MARGIN - 1, y - 1, imgWidth + 2, imgHeight + 2);

      doc.addImage(bloque.chartImage, 'PNG', MARGIN, y, imgWidth, imgHeight);
      y += imgHeight + 10;
    }
  }

  // ── Footer on all pages ──
  addFooter(doc);

  // ── Download ──
  const fecha = data.fechaGeneracion;
  const sanitized = data.titulo
    .replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 40);
  const mes = MESES_CORTOS[fecha.getMonth()];
  const fileName = `Informe_${sanitized}_${fecha.getDate()}${mes}${fecha.getFullYear()}.pdf`;

  doc.save(fileName);
}
