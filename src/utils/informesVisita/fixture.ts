import JSZip from 'jszip';

const PNG_1X1 = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
), (c) => c.charCodeAt(0));

function p(texto: string): string {
  const esc = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<w:p><w:r><w:t xml:space="preserve">${esc}</w:t></w:r></w:p>`;
}

function drawingConPie(pie: string): string {
  const esc = pie.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<w:p><w:r><w:drawing><wp:inline>
    <wp:docPr id="1" name="foto1" descr="${esc}"/>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline></w:drawing></w:r></w:p>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`;

const NS = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`;

/**
 * .docx sintético de prueba. Datos ficticios: no usa fincas, personas ni
 * fotos reales (issue #189).
 */
export async function construirDocxSintetico(opts?: {
  sinTexto?: boolean;
  conFoto?: boolean;
}): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS);

  const conFoto = opts?.conFoto !== false;
  const cuerpo = opts?.sinTexto
    ? (conFoto ? drawingConPie('imagen sin pie util') : '')
    : [
      p('INFORME TÉCNICO AGRONÓMICO'),
      p('Finca: Finca Ejemplo'),
      p('Fecha de visita: 28 de julio de 2026'),
      p('Agrónoma: Ana Ejemplo'),
      p('Especie: Aguacate Hass'),
      p('Fenología: llenado de fruto'),
      p('Materia seca: 21%'),
      p('Proyección de cosecha: 40 toneladas'),
      p('MONITOREO DE PLAGAS'),
      p('Fecha de monitoreo: 9 de julio de 2026'),
      p('Ácaro. Incidencia 12%. Severidad baja.'),
      p('FERTILIZACIÓN EDÁFICA'),
      p('Nutrimon 15-15-15 200 g/árbol. Vía suelo.'),
      p('FOLIAR'),
      p('Borozinco 1.5 cc/L. Carencia 0 días. Vía foliar.'),
      p('DRENCH'),
      p('Proxam 2 cc/L. Periodo de carencia 15 días. Blanco: Phytophthora. Vía drench.'),
      p('SITUACIÓN ENCONTRADA'),
      p('Este sector presenta árboles con clorosis.'),
      conFoto ? drawingConPie('Árbol con deficiencia en este sector.') : '',
      conFoto ? p('Árbol con deficiencia en este sector.') : '',
    ].join('');

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${cuerpo}</w:body></w:document>`,
  );

  if (conFoto) {
    zip.file('word/_rels/document.xml.rels', DOC_RELS);
    zip.file('word/media/image1.png', PNG_1X1);
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}
