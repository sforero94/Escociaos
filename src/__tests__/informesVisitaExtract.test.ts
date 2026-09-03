import { describe, expect, it } from 'vitest';
import { extraerDocx, extraerTextoDeDocumentXml, esDocx } from '@/utils/informesVisita/docx';
import { extraerCabecera } from '@/utils/informesVisita/cabecera';
import {
  aplicarDecisiones,
  ConfirmacionIncompletaError,
  snippetsListosParaPersistir,
} from '@/utils/informesVisita/confirmar';
import { construirDocxSintetico } from '@/utils/informesVisita/fixture';
import { MENSAJE_SIN_TEXTO, type SnippetPropuesto } from '@/types/informesVisita';
import { parsearFechaInforme } from '@/utils/informesVisita/fechasInforme';
import {
  citaEstaEnTexto,
  insumoEstaEnSnippet,
  parsearRespuestaSnippets,
} from '@/utils/informesVisita/snippets';
import { MENSAJE_ENDPOINT_NO_DESPLEGADO, propuestaVacia } from '@/utils/informesVisita/clienteProponer';
import {
  FUENTE_INFORME_VISITA,
  formatearRespuestaEsco,
  insumoEstaEnFuente,
} from '@/utils/informesVisita/esco';
import { persistirInforme } from '@/utils/informesVisita/persistir';
import { proponerTemas, sanitizarTemas, TEMAS_INFORME } from '@/utils/informesVisita/temas';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURE_MODELO = {
  cabecera: {
    fecha_visita: '2026-07-28',
    agronoma: 'Ana Ejemplo',
    finca: 'Finca Ejemplo',
    especie: 'Aguacate Hass',
    fenologia: 'llenado de fruto',
    materia_seca: '21%',
    proyeccion_cosecha: '40 toneladas',
  },
  snippets: [
    {
      texto: 'Hay ácaro con incidencia 12% y severidad baja.',
      cita_word: 'Ácaro. Incidencia 12%. Severidad baja.',
      tipo: 'monitoreo',
      insumo: '',
      plaga: 'Ácaro',
      foto_indice: -1,
    },
    {
      texto: 'Aplicar Proxam 2 cc/L en drench contra Phytophthora, carencia 15 días.',
      cita_word: 'Proxam 2 cc/L. Periodo de carencia 15 días.',
      tipo: 'rec_drench',
      insumo: 'Proxam',
      plaga: 'Phytophthora',
      foto_indice: -1,
    },
    {
      texto: 'Inventé una recomendación que no está en el Word.',
      cita_word: 'frase que no existe xyzzy12345',
      tipo: 'observacion',
      insumo: '',
      plaga: '',
      foto_indice: -1,
    },
    {
      texto: 'Usar SuperInventado 5 kg porque sí.',
      cita_word: 'Este sector presenta árboles con clorosis.',
      tipo: 'observacion',
      insumo: 'SuperInventado',
      plaga: '',
      foto_indice: -1,
    },
  ],
};

describe('esDocx', () => {
  it('acepta .docx y rechaza .doc y pdf', () => {
    expect(esDocx({ name: 'informe.docx' })).toBe(true);
    expect(esDocx({ name: 'informe.doc' })).toBe(false);
    expect(esDocx({ name: 'informe.pdf' })).toBe(false);
  });
});

describe('parsearFechaInforme', () => {
  it('lee 28 de julio de 2026 y 9 jul 2026', () => {
    expect(parsearFechaInforme('28 de julio de 2026')).toBe('2026-07-28');
    expect(parsearFechaInforme('9 de julio de 2026')).toBe('2026-07-09');
    expect(parsearFechaInforme('09/07/2026')).toBe('2026-07-09');
  });
});

describe('extractor .docx sintético', () => {
  it('saca texto, Proxam y una foto con pie', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    expect(extraido.sinTexto).toBe(false);
    expect(extraido.texto).toContain('Proxam');
    expect(extraido.texto).toContain('Finca Ejemplo');
    expect(extraido.fotos).toHaveLength(1);
    expect(extraido.fotos[0].pieDeFoto).toMatch(/deficiencia/i);
    expect(extraido.fotos[0].bytes.byteLength).toBeGreaterThan(10);
  });

  it('sin texto extraíble no inventa contenido', async () => {
    const buf = await construirDocxSintetico({ sinTexto: true, conFoto: true });
    const extraido = await extraerDocx(buf);
    expect(extraido.sinTexto).toBe(true);
    expect(extraido.texto).toBe('');
    expect(MENSAJE_SIN_TEXTO).toBe('sin texto para extraer');
  });
});

describe('cabecera barata', () => {
  it('lee fecha, agrónoma y finca del fixture, no el fallback de hoy', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const cab = extraerCabecera(extraido.texto, '2026-09-03');
    expect(cab.fecha_visita).toBe('2026-07-28');
    expect(cab.finca).toBe('Finca Ejemplo');
    expect(cab.agronoma).toBe('Ana Ejemplo');
    expect(cab.materia_seca).toBe('21%');
  });

  it('lee etiquetas de tabla Word (pipe) y no cae al día de hoy', () => {
    const texto = [
      'INFORME TÉCNICO AGRONÓMICO',
      'Fecha de visita | 28 de julio de 2026',
      'Agrónoma | Ana Ejemplo',
      'Finca | Finca Ejemplo',
    ].join('\n');
    const cab = extraerCabecera(texto, '2026-09-03');
    expect(cab.fecha_visita).toBe('2026-07-28');
    expect(cab.agronoma).toBe('Ana Ejemplo');
    expect(cab.finca).toBe('Finca Ejemplo');
  });

  it('si no hay etiqueta Fecha, usa la primera fecha del cuerpo', () => {
    const texto = 'Visita realizada el 9 de julio de 2026 en aguacate Hass.';
    const cab = extraerCabecera(texto, '2026-09-03');
    expect(cab.fecha_visita).toBe('2026-07-09');
  });

  it('un mes en el título no inventa un día', () => {
    const texto = 'INFORME TÉCNICO AGRONÓMICO JULIO 2026';
    const cab = extraerCabecera(texto, '2026-09-03');
    expect(cab.fecha_visita).toBe('2026-09-03');
  });
});

describe('endpoint de propuestas', () => {
  it('nombra el redespliegue cuando el servidor responde 404', () => {
    expect(MENSAJE_ENDPOINT_NO_DESPLEGADO).toMatch(/informes-visita-proponer/);
  });
});

describe('ancla de cita e insumo', () => {
  it('acepta una frase literal y rechaza una inventada', () => {
    const texto = 'Proxam 2 cc/L. Periodo de carencia 15 días.';
    expect(citaEstaEnTexto('Proxam 2 cc/L. Periodo de carencia 15 días.', texto)).toBe(true);
    expect(citaEstaEnTexto('frase que no existe xyzzy', texto)).toBe(false);
    expect(insumoEstaEnSnippet('Proxam', 'aplicar drench', 'Proxam 2 cc/L')).toBe(true);
    expect(insumoEstaEnSnippet('SuperInventado', 'clorosis en este sector', 'clorosis en este sector')).toBe(false);
  });
});

describe('parsearRespuestaSnippets', () => {
  it('conserva ideas ancladas y tira las sin cita o con insumo inventado', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const parsed = parsearRespuestaSnippets(FIXTURE_MODELO, extraido.texto, extraido.fotos.length, '2026-01-01');
    expect(parsed.cabecera.fecha_visita).toBe('2026-07-28');
    expect(parsed.snippets).toHaveLength(2);
    expect(parsed.descartadosPorCita).toBe(2);
    expect(parsed.snippets.map((s) => s.insumo)).toEqual([null, 'Proxam']);
    expect(parsed.snippets.every((s) => s.origen === 'informe')).toBe(true);
  });

  it('sin texto no inventa snippets', () => {
    const vacia = propuestaVacia('', '2026-07-28');
    expect(vacia.snippets).toEqual([]);
    const parsed = parsearRespuestaSnippets({ cabecera: {}, snippets: FIXTURE_MODELO.snippets }, '', 0, '2026-07-28');
    expect(parsed.snippets).toEqual([]);
    expect(parsed.descartadosPorCita).toBeGreaterThan(0);
  });
});

function snip(parcial: Partial<SnippetPropuesto> & { clave: string; texto: string }): SnippetPropuesto {
  return {
    cita_word: 'cita',
    origen: 'informe',
    tipo: null,
    insumo: null,
    plaga: null,
    foto_indice: null,
    ...parcial,
  };
}

describe('puerta confirmar antes de persistir', () => {
  it('descarta una, edita una y confirma el resto', () => {
    const propuestas = [
      snip({ clave: 'a', texto: 'A' }),
      snip({ clave: 'b', texto: 'B' }),
      snip({ clave: 'c', texto: 'C' }),
    ];
    const decisiones = [
      { clave: 'a', accion: 'descartar' as const },
      { clave: 'b', accion: 'confirmar' as const, edicion: { insumo: 'Proxam editado' } },
      { clave: 'c', accion: 'confirmar' as const },
    ];
    const { confirmadas, descartadas, pendientes } = aplicarDecisiones(propuestas, decisiones);
    expect(pendientes).toEqual([]);
    expect(descartadas).toEqual(['a']);
    expect(confirmadas).toHaveLength(2);
    expect(confirmadas[0].insumo).toBe('Proxam editado');

    const listas = snippetsListosParaPersistir(propuestas, decisiones);
    expect(listas.some((f) => f.clave === 'a')).toBe(false);
    expect(listas).toHaveLength(2);
    expect(listas.every((f) => f.origen === 'informe')).toBe(true);
  });

  it('lanza si se intenta persistir propuestas sin decidir', () => {
    const propuestas = [snip({ clave: 'a', texto: 'A' }), snip({ clave: 'b', texto: 'B' })];
    expect(() => snippetsListosParaPersistir(propuestas, [])).toThrow(ConfirmacionIncompletaError);
    expect(() => snippetsListosParaPersistir(propuestas, [
      { clave: 'a', accion: 'confirmar' },
    ])).toThrow(ConfirmacionIncompletaError);
  });

  it('sin propuestas, la puerta deja persistir solo la cabecera', () => {
    expect(snippetsListosParaPersistir([], [])).toEqual([]);
  });

  it('persistirInforme no escribe si las propuestas no están decididas', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    await expect(persistirInforme({
      archivo: new File([buf], 'fixture.docx'),
      archivoBytes: buf,
      cabecera: extraerCabecera(extraido.texto, '2026-07-28'),
      propuestas: [snip({ clave: 'a', texto: 'A' })],
      decisiones: [],
      temas: [],
      notas: '',
      fotos: extraido.fotos,
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
    })).rejects.toThrow(ConfirmacionIncompletaError);
  });
});

describe('ESCO — fuente y citas', () => {
  it('cita informe y snippet, lista insumos de chips y no mezcla con rondas', () => {
    const r = formatearRespuestaEsco({
      informes: [{
        id: 'inf-1',
        fecha_visita: '2026-07-28',
        agronoma: 'Ana Ejemplo',
        finca: 'Finca Ejemplo',
        especie: 'Aguacate Hass',
        fenologia: 'llenado',
        materia_seca: '21%',
        proyeccion_cosecha: '40 t',
        temas: ['fumigación', 'monitoreo'],
        notas: 'Se habló de riego en el lote 3.',
        sin_texto: false,
        texto_extraido: 'Proxam 2 cc/L carencia 15 días',
      }],
      snippets: [{
        id: 'snip-1',
        informe_id: 'inf-1',
        texto: 'Aplicar Proxam 2 cc/L en drench contra Phytophthora.',
        cita_word: 'Proxam 2 cc/L. Periodo de carencia 15 días.',
        origen: 'informe',
        tipo: 'rec_drench',
        insumo: 'Proxam',
        plaga: 'Phytophthora',
        foto_id: null,
      }],
      fotos: [{ id: 'foto-1', informe_id: 'inf-1', pie_de_foto: 'clorosis en este sector', orden: 0 }],
    });

    expect(r.fuente).toBe(FUENTE_INFORME_VISITA);
    expect(r.advertencia).toContain('ronda_monitoreo');
    expect(r.snippets[0].cita).toEqual({ informe_id: 'inf-1', snippet_id: 'snip-1' });
    expect(r.informes[0].cita).toEqual({ informe_id: 'inf-1' });
    expect(r.informes[0].temas).toEqual(['fumigación', 'monitoreo']);
    expect(r.informes[0].extracto_notas).toContain('riego');
    expect(r.insumos_en_fuente).toEqual(['Proxam']);
    expect(insumoEstaEnFuente('Proxam', r, [])).toBe(true);
    expect(insumoEstaEnFuente('Glifosato', r, [])).toBe(false);
    expect(r.ventana_completa).toBe(false);
  });
});

describe('temas de visita', () => {
  it('preselecciona fertilización, monitoreo y observaciones desde el texto y los tipos', () => {
    const temas = proponerTemas(
      'Fertilización edáfica. Incidencia de ácaro 12%. Observación de clorosis.',
      [{ tipo: 'monitoreo', texto: 'Ácaro 12%' }, { tipo: 'rec_drench', texto: 'Proxam en drench' }],
    );
    expect(temas).toContain('fertilización');
    expect(temas).toContain('monitoreo');
    expect(temas).toContain('observaciones');
    expect(temas.every((t) => (TEMAS_INFORME as readonly string[]).includes(t))).toBe(true);
  });

  it('no inventa un tema que no está en el catálogo', () => {
    expect(sanitizarTemas(['monitoreo', 'ganado', 'planeacion labores', 'monitoreo'])).toEqual([
      'monitoreo',
      'planeacion labores',
    ]);
  });
});

describe('sin embeddings', () => {
  it('la 134 no crea observaciones_agronomicas ni columnas vector', () => {
    const sql = readFileSync(resolve(__dirname, '../sql/migrations/134_informes_visita_agronomicos.sql'), 'utf-8');
    expect(sql).toMatch(/CREATE TABLE public\.informes_visita_snippets/);
    expect(sql).toMatch(/temas\s+TEXT\[\]/);
    expect(sql).toMatch(/planeacion labores/);
    expect(sql).not.toMatch(/CREATE TABLE public\.observaciones_agronomicas/);
    expect(sql).not.toMatch(/CREATE TYPE public\.tipo_observacion_agronomica/);
    expect(sql).not.toMatch(/CREATE EXTENSION/i);
    expect(sql).not.toMatch(/\bvector\s*\(/i);
  });
});

describe('extraerTextoDeDocumentXml', () => {
  it('vuelve tablas w:tbl a líneas, porque el Word real suele llegar como párrafos', () => {
    const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Proxam</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>2 cc/L</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      </w:body>
    </w:document>`;
    const texto = extraerTextoDeDocumentXml(xml);
    expect(texto).toContain('Proxam');
    expect(texto).toContain('2 cc/L');
  });
});
