import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
import type { DatosReporteSemanal } from '@/types/reporteSemanal';
import {
  armarPdfReporteDesdeHtml,
  construirDocumentoReporteSemanal,
  extraerPayloadReporte,
  incrustarPayloadReporte,
  type AnalisisReportePdf,
} from '@/utils/reporteSemanalPdf';

/**
 * El PDF que salió de producción (jsPDF 3.0.4, 9 páginas de 960×540 pt) es
 * una captura html2canvas: un JPEG por página y pdftotext vacío. Estas
 * pruebas exigen lo contrario sobre el documento que arma el mismo módulo
 * que usa la descarga: capa de texto, cadenas sin espacios espurios, filas
 * de jornales completas y secciones que paginan en vez de recortarse.
 */

const LIBS = { jsPDF, autoTable };

export const ANALISIS_SEMANA_43: AnalisisReportePdf = {
  resumen_ejecutivo:
    'Semana de cosecha y clasificación. Las cuadrillas siguen activas, destacando el avance en La Vega y el rezago de la enmienda.',
  titulares: {
    personal: 'Ocho trabajadores activos, una falla de José Muñoz y la eficiencia en 86%.',
    labores: 'Labores de cosecha y mantenimiento siguen en proceso, con tanques abiertos desde enero.',
    jornales: '46.5 jornales ejecutados: 95% propios y 5% contrato en clasificación.',
    aplicaciones: 'Fumigación contra ácaro al 19.3% de avance: La Vega concentra el progreso.',
    clima: 'Lluvia por debajo del promedio y radiación alta a mitad de semana.',
    conductividad_electrica: 'CE baja en todos los lotes: más del 60% de lecturas por debajo del rango.',
  },
  conclusiones: [
    {
      texto: 'Iniciar la aplicación de materia orgánica en Piedra Paula, Salto de Tequendama, Australia y La Vega.',
      prioridad: 'alta',
      contexto: 'El suelo sigue por debajo del umbral de materia orgánica.',
    },
    {
      texto: 'Acelerar la fumigación contra ácaro en Piedra Paula y Australia.',
      prioridad: 'alta',
      contexto: 'La Vega ya concentra el avance y los otros lotes siguen en cero.',
    },
    {
      texto: 'Revisar el plan de fertilización para corregir la conductividad eléctrica.',
      prioridad: 'media',
      contexto: 'Más del 60% de las lecturas está por debajo del rango.',
    },
  ],
  interpretacion_clima: 'La precipitación de la semana quedó por debajo de las cuatro semanas previas.',
  interpretacion_ce: 'El promedio de 0.48 dS/m sugiere una deficiencia de nutrientes disponibles.',
};

function celda(jornales: number, costo = 0) {
  return { jornales, costo };
}

const LOTES = ['1. Piedra Paula', '3. Australia', '4. La Vega', 'Sin lote'] as const;

function propios() {
  const filas = [
    { nombre: 'Fumigación control ácaro octubre', tipo: 'Aplicación fitosanitaria' },
    { nombre: 'Clasificación cosecha principal', tipo: 'Clasificación' },
    { nombre: 'Recolección cosecha principal', tipo: 'Cosecha' },
    { nombre: 'Finalización guadaña Australia', tipo: 'Guadaña' },
    { nombre: 'Zanjas', tipo: 'Mantenimiento de zanjas' },
    { nombre: 'Abono orgánico', tipo: 'Otra labor' },
    { nombre: 'Apoyo caballeriza y finca', tipo: 'Otra labor' },
  ];
  const datos: Record<string, Record<string, { jornales: number; costo: number }>> = {
    'Fumigación control ácaro octubre': { '4. La Vega': celda(8.5) },
    'Clasificación cosecha principal': { 'Sin lote': celda(2.5) },
    'Recolección cosecha principal': {
      '1. Piedra Paula': celda(8.8),
      '3. Australia': celda(3.5),
    },
    'Finalización guadaña Australia': { '3. Australia': celda(8) },
    Zanjas: { '1. Piedra Paula': celda(1) },
    'Abono orgánico': { 'Sin lote': celda(10) },
    'Apoyo caballeriza y finca': { 'Sin lote': celda(1) },
  };
  const totalesPorActividad: Record<string, { jornales: number; costo: number }> = {
    'Fumigación control ácaro octubre': celda(8.5),
    'Clasificación cosecha principal': celda(2.5),
    'Recolección cosecha principal': celda(12.3),
    'Finalización guadaña Australia': celda(8),
    Zanjas: celda(1),
    'Abono orgánico': celda(10),
    'Apoyo caballeriza y finca': celda(1),
  };
  const totalesPorLote = {
    '1. Piedra Paula': celda(9.8),
    '3. Australia': celda(11.5),
    '4. La Vega': celda(8.5),
    'Sin lote': celda(13.5),
  };
  return {
    actividades: filas.map((f) => f.nombre),
    filas,
    lotes: [...LOTES],
    datos,
    totalesPorActividad,
    totalesPorLote,
    totalGeneral: celda(43.3),
  };
}

function contrato() {
  const filas = [{ nombre: 'Clasificación cosecha principal', tipo: 'Clasificación' }];
  return {
    actividades: ['Clasificación cosecha principal'],
    filas,
    lotes: ['Sin lote'],
    datos: { 'Clasificación cosecha principal': { 'Sin lote': celda(2.5) } },
    totalesPorActividad: { 'Clasificación cosecha principal': celda(2.5) },
    totalesPorLote: { 'Sin lote': celda(2.5) },
    totalGeneral: celda(2.5),
  };
}

export function datosSemana43(): DatosReporteSemanal {
  const base = propios();
  const ctr = contrato();
  return {
    semana: { inicio: '2026-10-19', fin: '2026-10-25', numero: 43, ano: 2026 },
    secciones: {
      clima: true,
      monitoreoPlagas: false,
      floracion: false,
      conductividadElectrica: true,
      colmenas: false,
      aplicaciones: true,
    },
    personal: {
      totalTrabajadores: 8,
      empleados: 6,
      contratistas: 2,
      fallas: 1,
      permisos: 0,
      ingresos: 0,
      retiros: 0,
      detalleFallas: [{ empleado: 'José Muñoz', razon: 'cita médica' }],
      detallePermisos: [],
      jornalesPosibles: 44,
      jornalesTrabajados: 43.3,
      eficienciaOperativa: 86,
    },
    labores: {
      programadas: [
        {
          id: 'lab-tanques',
          nombre: 'Mantenimiento de tanques de fertilización',
          tipoTarea: 'Mantenimiento',
          estado: 'En proceso',
          fechaInicio: '2026-01-29',
          fechaFin: '2026-12-31',
          lotes: ['4. La Vega', 'Salto de Tequendama'],
        },
        {
          id: 'lab-plateo',
          nombre: 'Plateo de árboles en producción',
          tipoTarea: 'Mantenimiento',
          estado: 'En proceso',
          fechaInicio: '2026-08-10',
          fechaFin: '2026-08-30',
          lotes: ['1. Piedra Paula', '3. Australia'],
        },
        {
          id: 'lab-recoleccion',
          nombre: 'Recolección cosecha principal',
          tipoTarea: 'Cosecha',
          estado: 'En proceso',
          fechaInicio: '2026-10-19',
          fechaFin: '2026-10-25',
          lotes: ['1. Piedra Paula', '3. Australia'],
        },
        {
          id: 'lab-clasif',
          nombre: 'Clasificación cosecha principal',
          tipoTarea: 'Clasificación',
          estado: 'En proceso',
          fechaInicio: '2026-10-20',
          fechaFin: '2026-10-25',
          lotes: ['Sin lote'],
        },
      ],
      matrizJornales: {
        ...base,
        totalGeneral: celda(45.8),
      },
      matrizJornalesPropios: base,
      matrizJornalesContrato: ctr,
    },
    jornales: {
      ...base,
      totalGeneral: celda(45.8),
    },
    aplicaciones: {
      planeadas: [
        {
          id: 'plan-enmienda',
          nombre: 'Enmienda',
          tipo: 'Fertilización',
          proposito: 'Corregir materia orgánica y conductividad en los lotes de cosecha.',
          blancosBiologicos: [],
          fechaInicioPlaneada: '2026-08-18',
          mezclas: [],
          listaCompras: [
            {
              productoNombre: 'Silicalmag',
              categoria: 'Enmienda',
              cantidadNecesaria: 4694,
              unidad: 'kg',
              costoEstimado: 3_200_000,
              inventarioDisponible: 16,
              cantidadAComprar: 4678,
            },
            {
              productoNombre: 'Compost de caballeriza',
              categoria: 'Enmienda',
              cantidadNecesaria: 800,
              unidad: 'kg',
              costoEstimado: 1_320_000,
              inventarioDisponible: 0,
              cantidadAComprar: 800,
            },
          ],
          costoTotalEstimado: 4_520_000,
          inventarioTotalDisponible: 16,
          totalPedido: 5478,
          costoPorLitroKg: 780,
          costoPorArbol: 420,
        },
      ],
      activas: [
        {
          id: 'app-acaro',
          nombre: 'Fumigación contra ácaro',
          tipo: 'Fumigación',
          proposito: 'Control de ácaro en el cultivo',
          estado: 'En ejecución',
          fechaInicio: '2026-10-15',
          totalPlaneado: 773,
          totalEjecutado: 149.2,
          porcentajeGlobal: 19.3,
          unidad: 'canecas',
          progresoPorLote: [
            { loteNombre: '1. Piedra Paula', planeado: 200, ejecutado: 0, porcentaje: 0, unidad: 'canecas' },
            { loteNombre: '3. Australia', planeado: 180, ejecutado: 0, porcentaje: 0, unidad: 'canecas' },
            { loteNombre: '4. La Vega', planeado: 393, ejecutado: 149.2, porcentaje: 38, unidad: 'canecas' },
          ],
        },
      ],
      cerradas: [],
    },
    monitoreo: {
      fechaActual: null,
      fechaAnterior: null,
      avisoFechaDesactualizada: null,
      resumenGlobal: [],
      vistasPorLote: [],
      vistasPorSublote: [],
      insights: [],
      tendencias: [],
      detallePorLote: [],
      fechasMonitoreo: [],
    },
    clima: {
      tempMin: 14.2,
      tempMax: 24.8,
      tempPromedio: 18.4,
      lluviaTotal: 12.6,
      humedadPromedio: 78,
      vientoPromedio: 6.2,
      rafagaMax: 18,
      radiacionPromedio: 420,
      radiacionMax: 890,
      radiacionSolar: {
        energiaKwhM2: 4.8,
        horasSolDia: 4.8,
        tiempoSolHoras: 5.2,
        status: 'optimo',
        statusLabel: 'Óptimo',
        deltaVs4Semanas: -0.4,
        diasEnOptimo: 4,
        diasBajoOptimo: 2,
        diasSobreOptimo: 1,
        diasCoberturaParcial: 0,
      },
      diario: [
        { fecha: '2026-10-19', lluviaMm: 4.2, radiacionMaxWm2: 640, tempMax: 23.1, tempMin: 15.0 },
        { fecha: '2026-10-20', lluviaMm: null, radiacionMaxWm2: 710, tempMax: 24.0, tempMin: 14.8 },
        { fecha: '2026-10-21', lluviaMm: 8.4, radiacionMaxWm2: 890, tempMax: 24.8, tempMin: 14.2 },
      ],
    },
    conductividadElectrica: {
      porLote: [
        { loteNombre: '1. Piedra Paula', pctBajo: 70, pctEnRango: 30, pctAlto: 0, promedio: 0.47, totalLecturas: 30 },
        { loteNombre: '2. Salto de Tequendama', pctBajo: 68, pctEnRango: 32, pctAlto: 0, promedio: 0.48, totalLecturas: 30 },
        { loteNombre: '3. Australia', pctBajo: 67, pctEnRango: 33, pctAlto: 0, promedio: 0.48, totalLecturas: 30 },
        { loteNombre: '4. La Vega', pctBajo: 60, pctEnRango: 40, pctAlto: 0, promedio: 0.49, totalLecturas: 30 },
      ],
    },
    temasAdicionales: [],
  };
}

const WIN1252: Record<number, string> = {
  0x80: '\u20ac',
  0x82: '\u201a',
  0x83: '\u0192',
  0x84: '\u201e',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02c6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017d',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201c',
  0x94: '\u201d',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02dc',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203a',
  0x9c: '\u0153',
  0x9e: '\u017e',
  0x9f: '\u0178',
};

function decodificarCadenaPdf(cruda: string): string {
  let out = '';
  for (let i = 0; i < cruda.length; i++) {
    if (cruda[i] !== '\\') {
      const code = cruda.charCodeAt(i);
      out += WIN1252[code] ?? cruda[i];
      continue;
    }
    const sig = cruda[i + 1];
    if (sig === undefined) break;
    if (sig >= '0' && sig <= '7') {
      let oct = sig;
      let j = i + 2;
      while (j < cruda.length && j < i + 4 && cruda[j] >= '0' && cruda[j] <= '7') {
        oct += cruda[j];
        j++;
      }
      const code = Number.parseInt(oct, 8);
      out += WIN1252[code] ?? String.fromCharCode(code);
      i = j - 1;
      continue;
    }
    const simple: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '\\': '\\',
      '(': '(',
      ')': ')',
    };
    out += simple[sig] ?? sig;
    i++;
  }
  return out;
}

interface FragmentoPdf {
  texto: string;
  x: number;
  y: number;
  pagina: number;
  ancho: number;
  alto: number;
}

function fragmentosDelPdf(contenido: string): FragmentoPdf[] {
  const streams = [...contenido.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]);
  const cajas = [...contenido.matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(
    (m) => ({ ancho: Number.parseFloat(m[1]), alto: Number.parseFloat(m[2]) }),
  );
  const fragmentos: FragmentoPdf[] = [];
  let pagina = 0;
  for (const stream of streams) {
    if (!stream.includes('Tj') && !stream.includes('TJ')) continue;
    const caja = cajas[pagina] ?? { ancho: 792, alto: 612 };
    pagina += 1;
    let i = 0;
    let x = 0;
    let y = 0;
    const pila: number[] = [];
    const tomarNumero = () => {
      const m = /^-?[\d.]+/.exec(stream.slice(i));
      if (!m) return false;
      pila.push(Number.parseFloat(m[0]));
      i += m[0].length;
      return true;
    };
    while (i < stream.length) {
      const c = stream[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
        i++;
        continue;
      }
      if (c === '(') {
        let j = i + 1;
        let cruda = '';
        while (j < stream.length) {
          if (stream[j] === '\\') {
            cruda += stream[j] + (stream[j + 1] ?? '');
            j += 2;
            continue;
          }
          if (stream[j] === ')') break;
          cruda += stream[j];
          j++;
        }
        const texto = decodificarCadenaPdf(cruda);
        i = j + 1;
        while (i < stream.length && /\s/.test(stream[i])) i++;
        const op = stream.slice(i, i + 2);
        if (op === 'Tj') {
          i += 2;
          fragmentos.push({ texto, x, y, pagina, ancho: caja.ancho, alto: caja.alto });
        }
        continue;
      }
      if (c === '/' ) {
        const m = /^\/F\d+\s+([\d.]+)\s+Tf/.exec(stream.slice(i));
        if (m) {
          i += m[0].length;
          pila.length = 0;
          continue;
        }
      }
      if ((c >= '0' && c <= '9') || c === '-' || c === '.') {
        if (tomarNumero()) continue;
      }
      const op = /^[A-Za-z*]+/.exec(stream.slice(i));
      if (op) {
        const nombre = op[0];
        i += nombre.length;
        if (nombre === 'Td' && pila.length >= 2) {
          x = pila[pila.length - 2];
          y = pila[pila.length - 1];
        } else if (nombre === 'Tm' && pila.length >= 6) {
          x = pila[pila.length - 2];
          y = pila[pila.length - 1];
        } else if (nombre === 'TL') {
          // leading, no cambia la posición
        }
        pila.length = 0;
        continue;
      }
      i++;
    }
  }
  return fragmentos;
}

function textoDelPdf(contenido: string): string {
  return fragmentosDelPdf(contenido)
    .map((f) => f.texto)
    .join('\n');
}

function documentoSemana43() {
  return construirDocumentoReporteSemanal(LIBS, datosSemana43(), ANALISIS_SEMANA_43);
}

describe('PDF del informe semanal — semana 43', () => {
  it('tiene capa de texto real y no es una captura JPEG', () => {
    const crudo = documentoSemana43().output();
    expect(crudo).toContain('Tj');
    expect(crudo).not.toContain('/DCTDecode');
    expect(crudo).not.toContain('/Subtype /Image');
    expect(crudo).toContain('/Title (Informe semanal Escocia Hass - Semana 43/2026)');
    const texto = textoDelPdf(crudo);
    expect(texto.length).toBeGreaterThan(200);
    expect(texto).toContain('Semana 43/2026');
  });

  it('extrae las cadenas clave sin espacios espurios ni tildes rotas', () => {
    const texto = textoDelPdf(documentoSemana43().output());
    expect(texto).toContain('Semana 43/2026');
    expect(texto).toContain('46.5 jornales');
    expect(texto).toContain('2026-01-29');
    expect(texto).toContain('2026-10-19');
    expect(texto).toContain('2026-10-25');
    expect(texto).toContain('95%');
    expect(texto).toContain('clasificación');
    expect(texto).toContain('José Muñoz');
    expect(texto).toContain('Precipitación');
    expect(texto).toContain('18.4°');
    expect(texto).toContain('86%');
    expect(texto).toContain('43.3 de 44.0');
    expect(texto).not.toContain('104%');
    expect(texto).toContain('Fumigación control ácaro octubre');
    expect(texto).toContain('Clasificación cosecha principal');
    expect(texto).toContain('Recolección cosecha principal');
    expect(texto).not.toMatch(/43 \/2026/);
    expect(texto).not.toMatch(/95 %/);
    expect(texto).not.toMatch(/2026 -\d/);
    expect(texto).not.toMatch(/\d \.\d/);
    expect(texto).not.toMatch(/activas ,/);
    expect(texto).not.toContain('…');
  });

  it('imprime cada fila y cada número de las tablas de jornales, sin recortar el nombre', () => {
    const texto = textoDelPdf(documentoSemana43().output());
    const datos = datosSemana43();
    for (const matriz of [datos.labores.matrizJornalesPropios, datos.labores.matrizJornalesContrato]) {
      for (const fila of matriz.filas) {
        expect(texto).toContain(fila.nombre);
        expect(texto).toContain(fila.tipo);
        for (const lote of matriz.lotes) {
          const v = matriz.datos[fila.nombre]?.[lote]?.jornales ?? 0;
          if (v > 0) expect(texto).toContain(v.toFixed(1));
        }
        expect(texto).toContain(matriz.totalesPorActividad[fila.nombre].jornales.toFixed(1));
      }
      for (const lote of matriz.lotes) {
        expect(texto).toContain(lote);
        expect(texto).toContain(matriz.totalesPorLote[lote].jornales.toFixed(1));
      }
      expect(texto).toContain(matriz.totalGeneral.jornales.toFixed(1));
    }
    expect(texto).toContain('8.5');
    expect(texto).toContain('12.3');
    expect(texto).toContain('2.5');
    expect(texto).toContain('10.0');
  });

  it('incluye todas las secciones y el total del plan completo, dentro de la página', () => {
    const doc = documentoSemana43();
    const crudo = doc.output();
    const texto = textoDelPdf(crudo);
    for (const seccion of [
      'RESUMEN EJECUTIVO',
      'Personal',
      'Clima',
      'Labores',
      'Jornales',
      'Conductividad eléctrica',
      'Aplicaciones',
      'Plan: Enmienda',
      'Conclusiones',
    ]) {
      expect(texto).toContain(seccion);
    }
    expect(texto).toContain('Total estimado: $4.520.000');
    expect(texto).toContain('Silicalmag');
    expect(texto).toContain('Compost de caballeriza');
    expect(texto).toContain('Mantenimiento de tanques de fertilización');

    const fragmentos = fragmentosDelPdf(crudo);
    expect(fragmentos.length).toBeGreaterThan(30);
    for (const f of fragmentos) {
      expect(f.x).toBeGreaterThanOrEqual(8);
      expect(f.y).toBeGreaterThanOrEqual(8);
      expect(f.x).toBeLessThanOrEqual(f.ancho - 8);
      expect(f.y).toBeLessThanOrEqual(f.alto - 8);
    }
    const total = fragmentos.find((f) => f.texto.includes('Total estimado'));
    expect(total).toBeTruthy();
    expect(total!.y).toBeGreaterThanOrEqual(24);
  });

  it('pagina cuando las labores no caben, y no pierde filas', () => {
    const datos = datosSemana43();
    datos.labores.programadas = Array.from({ length: 36 }, (_, i) => ({
      id: `lab-${i}`,
      nombre: `Labor de mantenimiento número ${String(i + 1).padStart(2, '0')}`,
      tipoTarea: 'Mantenimiento',
      estado: 'En proceso' as const,
      fechaInicio: '2026-01-29',
      fechaFin: '2026-12-31',
      lotes: ['4. La Vega', 'Salto de Tequendama'],
    }));
    const doc = construirDocumentoReporteSemanal(LIBS, datos, ANALISIS_SEMANA_43);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const texto = textoDelPdf(doc.output());
    for (let i = 1; i <= 36; i++) {
      expect(texto).toContain(`Labor de mantenimiento número ${String(i).padStart(2, '0')}`);
    }
    expect(texto).toContain('Página 1 de');
    expect(texto).toContain(`Página ${doc.getNumberOfPages()} de ${doc.getNumberOfPages()}`);
  });

  it('reconstruye el PDF desde el HTML que guarda el generador, sin rasterizar', () => {
    const datos = datosSemana43();
    const html = incrustarPayloadReporte('<!DOCTYPE html><html><body><p>vista</p></body></html>', datos, ANALISIS_SEMANA_43);
    expect(html).toContain('id="escocia-reporte-pdf"');
    expect(html).not.toContain('</script><script>');
    const extraido = extraerPayloadReporte(html);
    expect(extraido?.datos.semana.numero).toBe(43);
    expect(extraido?.analisis.titulares.jornales).toContain('46.5 jornales');

    const doc = armarPdfReporteDesdeHtml(LIBS, html);
    expect(textoDelPdf(doc.output())).toContain('Semana 43/2026');
    expect(() => armarPdfReporteDesdeHtml(LIBS, '<html><body>sin datos</body></html>')).toThrow(/datos/);
  });

  it('no deja que un resumen con </script> rompa el payload', () => {
    const analisis: AnalisisReportePdf = {
      ...ANALISIS_SEMANA_43,
      resumen_ejecutivo: 'nota </script><script>alert(1)</script> fin',
    };
    const html = incrustarPayloadReporte('<html><body></body></html>', datosSemana43(), analisis);
    expect(html.match(/<script/g)?.length).toBe(1);
    expect(extraerPayloadReporte(html)?.analisis.resumen_ejecutivo).toBe(analisis.resumen_ejecutivo);
  });

  it('el HTML del edge function incrusta el mismo payload que lee la descarga', () => {
    const edge = readFileSync('src/supabase/functions/server/generar-reporte-semanal.tsx', 'utf8');
    const copia = readFileSync('supabase/functions/make-server-1ccce916/generar-reporte-semanal.tsx', 'utf8');
    expect(edge).toContain('id="escocia-reporte-pdf"');
    expect(edge).toContain(".replace(/</g, '\\\\u003c')");
    expect(copia).toContain('id="escocia-reporte-pdf"');
  });
});
