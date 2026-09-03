import { describe, expect, it } from 'vitest';
import { extraerDocx, extraerTextoDeDocumentXml, esDocx } from '@/utils/informesVisita/docx';
import { proponerInforme } from '@/utils/informesVisita/proponer';
import {
  aplicarDecisiones,
  ConfirmacionIncompletaError,
  filasListasParaPersistir,
} from '@/utils/informesVisita/confirmar';
import { construirDocxSintetico } from '@/utils/informesVisita/fixture';
import { MENSAJE_SIN_TEXTO } from '@/types/informesVisita';
import { resolverLoteId } from '@/utils/informesVisita/lotes';
import { parsearFechaInforme } from '@/utils/informesVisita/fechasInforme';
import {
  FUENTE_INFORME_VISITA,
  formatearRespuestaEsco,
  insumoEstaEnFuente,
} from '@/utils/informesVisita/esco';
import { persistirInforme } from '@/utils/informesVisita/persistir';

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

describe('proponerInforme', () => {
  it('arma cabecera y filas de monitoreo, edáfica, foliar y drench', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const propuesta = proponerInforme({
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
      fotos: extraido.fotos,
      fechaFallback: '2026-01-01',
    });

    expect(propuesta.cabecera.fecha_visita).toBe('2026-07-28');
    expect(propuesta.cabecera.finca).toBe('Finca Ejemplo');
    expect(propuesta.cabecera.agronoma).toBe('Ana Ejemplo');
    expect(propuesta.cabecera.materia_seca).toBe('21%');

    const tipos = propuesta.filas.map((f) => f.tipo);
    expect(tipos).toContain('monitoreo');
    expect(tipos).toContain('rec_edafica');
    expect(tipos).toContain('rec_foliar');
    expect(tipos).toContain('rec_drench');
    expect(tipos).toContain('observacion');

    const acaro = propuesta.filas.find((f) => f.plaga_enfermedad?.toLowerCase().includes('caro'));
    expect(acaro?.fecha_contexto).toBe('2026-07-09');
    expect(acaro?.incidencia).toMatch(/12/);

    const proxam = propuesta.filas.find((f) => f.insumo?.toLowerCase().includes('proxam'));
    expect(proxam?.dosis).toBe(2);
    expect(proxam?.periodo_carencia_dias).toBe(15);
    expect(proxam?.via).toBe('drench');
    expect(proxam?.plaga_enfermedad?.toLowerCase()).toContain('phytophthora');
  });

  it('sin texto no inventa filas', async () => {
    const buf = await construirDocxSintetico({ sinTexto: true });
    const extraido = await extraerDocx(buf);
    const propuesta = proponerInforme({
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
      fotos: extraido.fotos,
      fechaFallback: '2026-07-28',
    });
    expect(propuesta.sinTexto).toBe(true);
    expect(propuesta.filas).toEqual([]);
  });
});

describe('puerta confirmar antes de persistir', () => {
  it('descarta una, edita una y confirma el resto', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const propuesta = proponerInforme({
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
      fotos: extraido.fotos,
      fechaFallback: '2026-07-28',
    });
    expect(propuesta.filas.length).toBeGreaterThan(3);

    const [a, b, ...resto] = propuesta.filas;
    const decisiones = [
      { clave: a.clave, accion: 'descartar' as const },
      { clave: b.clave, accion: 'confirmar' as const, edicion: { insumo: 'Proxam editado' } },
      ...resto.map((f) => ({ clave: f.clave, accion: 'confirmar' as const })),
    ];

    const { confirmadas, descartadas, pendientes } = aplicarDecisiones(propuesta.filas, decisiones);
    expect(pendientes).toEqual([]);
    expect(descartadas).toEqual([a.clave]);
    expect(confirmadas).toHaveLength(propuesta.filas.length - 1);
    expect(confirmadas[0].insumo).toBe('Proxam editado');

    const listas = filasListasParaPersistir(propuesta.filas, decisiones);
    expect(listas.some((f) => f.clave === a.clave)).toBe(false);
    expect(listas).toHaveLength(confirmadas.length);
  });

  it('lanza si se intenta persistir propuestas sin decidir', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const propuesta = proponerInforme({
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
      fotos: extraido.fotos,
      fechaFallback: '2026-07-28',
    });
    expect(() => filasListasParaPersistir(propuesta.filas, [])).toThrow(ConfirmacionIncompletaError);
    expect(() => filasListasParaPersistir(propuesta.filas, [
      { clave: propuesta.filas[0].clave, accion: 'confirmar' },
    ])).toThrow(ConfirmacionIncompletaError);
  });

  it('sin propuestas, la puerta deja persistir solo la cabecera', () => {
    expect(filasListasParaPersistir([], [])).toEqual([]);
  });

  it('persistirInforme no escribe si las propuestas no están decididas', async () => {
    const buf = await construirDocxSintetico();
    const extraido = await extraerDocx(buf);
    const propuesta = proponerInforme({
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
      fotos: extraido.fotos,
      fechaFallback: '2026-07-28',
    });
    await expect(persistirInforme({
      archivo: new File([buf], 'fixture.docx'),
      archivoBytes: buf,
      cabecera: propuesta.cabecera,
      propuestas: propuesta.filas,
      decisiones: [],
      fotos: extraido.fotos,
      texto: extraido.texto,
      sinTexto: extraido.sinTexto,
    })).rejects.toThrow(ConfirmacionIncompletaError);
  });
});

describe('resolverLoteId', () => {
  const lotes = [
    { id: 'l1', nombre: 'La Cumbre' },
    { id: 'l2', nombre: 'El Bosque' },
  ];

  it('solo empareja igualdad clara', () => {
    expect(resolverLoteId('La Cumbre', lotes)).toBe('l1');
    expect(resolverLoteId('lote la cumbre', lotes)).toBe('l1');
    expect(resolverLoteId('La Cumbre Norte', lotes)).toBeNull();
    expect(resolverLoteId('Cumbre', lotes)).toBeNull();
    expect(resolverLoteId('este sector presenta clorosis', lotes)).toBeNull();
    expect(resolverLoteId(null, lotes)).toBeNull();
  });
});

describe('ESCO — fuente y citas', () => {
  it('cita informe y fila, lista insumos de la tabla y no mezcla con rondas', () => {
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
        sin_texto: false,
        texto_extraido: 'Proxam 2 cc/L carencia 15 días',
      }],
      observaciones: [{
        id: 'obs-1',
        informe_id: 'inf-1',
        fecha: '2026-07-28',
        fecha_contexto: null,
        tipo: 'rec_drench',
        lote: null,
        plaga_enfermedad: 'Phytophthora',
        accion: 'drench',
        insumo: 'Proxam',
        dosis: 2,
        unidad: 'cc/L',
        periodo_carencia_dias: 15,
        via: 'drench',
        incidencia: null,
        severidad: null,
        notas: 'Proxam 2 cc/L',
        foto_id: null,
      }],
      fotos: [{ id: 'foto-1', informe_id: 'inf-1', pie_de_foto: 'clorosis en este sector', orden: 0 }],
    });

    expect(r.fuente).toBe(FUENTE_INFORME_VISITA);
    expect(r.advertencia).toContain('ronda_monitoreo');
    expect(r.observaciones[0].cita).toEqual({ informe_id: 'inf-1', observacion_id: 'obs-1' });
    expect(r.informes[0].cita).toEqual({ informe_id: 'inf-1' });
    expect(r.insumos_en_fuente).toEqual(['Proxam']);
    expect(insumoEstaEnFuente('Proxam', r, ['Proxam 2 cc/L'])).toBe(true);
    expect(insumoEstaEnFuente('Glifosato', r, ['Proxam 2 cc/L'])).toBe(false);
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
