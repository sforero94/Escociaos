import JSZip from 'jszip';
import type { ExtraccionDocx, FotoExtraida } from '@/types/informesVisita';

const MIME_POR_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  emf: 'image/emf',
  wmf: 'image/wmf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

function decodificarXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function textosDeWt(xml: string): string[] {
  const out: string[] = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodificarXml(m[1]));
  }
  return out;
}

function extraerPiesDeFoto(xml: string): string[] {
  const pies: string[] = [];
  const re = /<wp:docPr\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const descr = /descr="([^"]*)"/.exec(tag)?.[1];
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const pie = (descr && descr.trim()) || (name && name.trim()) || '';
    if (pie && !/^imagen?\s*\d*$/i.test(pie) && !/^picture\s*\d*$/i.test(pie)) {
      pies.push(decodificarXml(pie));
    }
  }
  return pies;
}

function filaTablaComoLinea(trXml: string): string {
  const celdas: string[] = [];
  const tcRe = /<w:tc[\s>][\s\S]*?<\/w:tc>/g;
  let m: RegExpExecArray | null;
  while ((m = tcRe.exec(trXml)) !== null) {
    celdas.push(textosDeWt(m[0]).join(' ').replace(/\s+/g, ' ').trim());
  }
  return celdas.filter(Boolean).join(' | ');
}

function tablasComoParrafos(xml: string): string {
  return xml.replace(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g, (tabla) => {
    const filas: string[] = [];
    const trRe = /<w:tr[\s>][\s\S]*?<\/w:tr>/g;
    let m: RegExpExecArray | null;
    while ((m = trRe.exec(tabla)) !== null) {
      const linea = filaTablaComoLinea(m[0]);
      if (linea) filas.push(linea);
    }
    return filas.map((l) => `<w:p><w:r><w:t>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`).join('');
  });
}

export function extraerTextoDeDocumentXml(xml: string): string {
  const conTablas = tablasComoParrafos(xml);
  const lineas: string[] = [];
  const pRe = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(conTablas)) !== null) {
    const texto = textosDeWt(m[0]).join('').replace(/\s+/g, ' ').trim();
    if (texto) lineas.push(texto);
  }
  return lineas.join('\n').trim();
}

function mimeDeNombre(nombre: string): string {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  return MIME_POR_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Abre un .docx (ZIP) y saca texto + imágenes. No hay OCR: las fotos son evidencia.
 * Si document.xml no trae texto extraíble, `sinTexto` queda true y `texto` vacío.
 */
export async function extraerDocx(buffer: ArrayBuffer): Promise<ExtraccionDocx> {
  const zip = await JSZip.loadAsync(buffer);
  const docFile = zip.file('word/document.xml');
  const xml = docFile ? await docFile.async('string') : '';
  const texto = xml ? extraerTextoDeDocumentXml(xml) : '';
  const pies = xml ? extraerPiesDeFoto(xml) : [];

  const fotos: FotoExtraida[] = [];
  const media = Object.keys(zip.files)
    .filter((p) => p.startsWith('word/media/') && !zip.files[p].dir)
    .sort();

  for (let i = 0; i < media.length; i += 1) {
    const path = media[i];
    const bytes = await zip.files[path].async('uint8array');
    fotos.push({
      nombre: path.replace(/^word\/media\//, ''),
      mime: mimeDeNombre(path),
      bytes,
      pieDeFoto: pies[i] ?? null,
      orden: i,
    });
  }

  return {
    texto,
    sinTexto: texto.length === 0,
    fotos,
  };
}

export function esDocx(file: { name: string; type?: string }): boolean {
  const nombre = file.name.toLowerCase();
  if (!nombre.endsWith('.docx')) return false;
  if (nombre.endsWith('.doc') && !nombre.endsWith('.docx')) return false;
  const tipo = (file.type ?? '').toLowerCase();
  if (!tipo) return true;
  return (
    tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || tipo === 'application/octet-stream'
    || tipo === 'application/zip'
  );
}
