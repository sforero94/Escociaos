import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
import type { CeldaComparativa, DatosReporteSemanal, TendenciaDir } from '@/types/reporteSemanal';
import {
  armarPdfReporteDesdeHtml,
  construirDocumentoReporteSemanal,
  extraerPayloadReporte,
  incrustarPayloadReporte,
  type AnalisisReportePdf,
} from '@/utils/reporteSemanalPdf';

/**
 * El PDF de producción es el mismo mazo de diapositivas 16:9 (1280×720,
 * 960×540 pt) que se ve en pantalla. Estas pruebas exigen ese formato y
 * ese orden, más texto seleccionable, sin huecos en números ni fechas, y
 * sin recortar filas: lo que no cabe sigue en otra diapositiva igual.
 */

const ANCHO_SLIDE = 960;
const ALTO_SLIDE = 540;

function cajasDelPdf(contenido: string): Array<{ ancho: number; alto: number }> {
  return [...contenido.matchAll(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(
    (m) => ({ ancho: Number.parseFloat(m[1]), alto: Number.parseFloat(m[2]) }),
  );
}

function assertDiapositivas(contenido: string): void {
  const cajas = cajasDelPdf(contenido);
  expect(cajas.length).toBeGreaterThan(0);
  for (const caja of cajas) {
    expect(caja.ancho).toBeCloseTo(ANCHO_SLIDE, 0);
    expect(caja.alto).toBeCloseTo(ALTO_SLIDE, 0);
    expect(caja.ancho / caja.alto).toBeCloseTo(16 / 9, 2);
  }
}

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

function paginasDeTexto(contenido: string): string[] {
  const porPagina = new Map<number, string[]>();
  for (const f of fragmentosDelPdf(contenido)) {
    const lista = porPagina.get(f.pagina) ?? [];
    lista.push(f.texto);
    porPagina.set(f.pagina, lista);
  }
  return [...porPagina.keys()].sort((a, b) => a - b).map((n) => (porPagina.get(n) ?? []).join('\n'));
}

function documentoSemana43() {
  return construirDocumentoReporteSemanal(LIBS, datosSemana43(), ANALISIS_SEMANA_43);
}

function separacionFalla(contenido: string): { hueco: number; espacio: number } {
  const fragmentos = fragmentosDelPdf(contenido);
  const nombre = fragmentos.find((f) => f.texto === 'José Muñoz');
  const motivo = fragmentos.find((f) => f.texto === 'cita médica');
  expect(nombre, 'nombre de la falla').toBeTruthy();
  expect(motivo, 'motivo de la falla').toBeTruthy();
  expect(motivo!.pagina).toBe(nombre!.pagina);
  expect(Math.abs(motivo!.y - nombre!.y)).toBeLessThan(1);

  const metro = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: [1280, 720],
    hotfixes: ['px_scaling'],
  });
  metro.setFont('helvetica', 'bold');
  metro.setFontSize(12);
  const anchoNombre = metro.getTextWidth('José Muñoz') * 0.75;
  metro.setFont('helvetica', 'normal');
  const espacio = metro.getTextWidth(' ') * 0.75;
  return { hueco: motivo!.x - (nombre!.x + anchoNombre), espacio };
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
    const falla = separacionFalla(documentoSemana43().output());
    // En pantalla el nombre va en negrita y el motivo, en gris, con un espacio
    // entre los dos. Medir el nombre en regular deja el motivo pegado.
    expect(falla.hueco).toBeGreaterThanOrEqual(falla.espacio - 0.05);
    expect(texto).toContain('Precipitación');
    expect(texto).toContain('18.4°');
    expect(texto).toContain('86%');
    // La diapositiva de Personal calcula la eficiencia como el HTML:
    // jornales totales / posibles, no el campo de la ficha del asistente.
    expect(texto).toContain('104%');
    expect(texto).toContain('45.8 de 44');
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
      'PERSONAL',
      'RESUMEN DEL CLIMA',
      'LABORES',
      'JORNALES',
      'JORNALES PROPIOS',
      'JORNALES POR CONTRATO',
      'POR TAREA',
      'POR LOTE',
      'CONDUCTIVIDAD ELÉCTRICA',
      'APLICACIONES',
      'LISTA DE COMPRAS',
      'Plan: Enmienda',
      'Conclusiones y Recomendaciones',
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
    assertDiapositivas(doc.output());
    const paginas = paginasDeTexto(doc.output());
    const deLabores = paginas.filter((p) => p.includes('LABORES'));
    expect(deLabores.length).toBeGreaterThan(1);
    for (const pagina of deLabores) {
      expect(pagina).toContain('Nombre');
      expect(pagina).toContain('2026-01-29');
    }
  });

  it('arma el mismo mazo 16:9 y en el mismo orden que las diapositivas de pantalla', () => {
    const crudo = documentoSemana43().output();
    assertDiapositivas(crudo);
    const paginas = paginasDeTexto(crudo);
    const marcas = [
      'RESUMEN EJECUTIVO',
      'PERSONAL',
      'RESUMEN DEL CLIMA',
      'LABORES',
      'JORNALES',
      'CONDUCTIVIDAD ELÉCTRICA',
      'APLICACIONES',
      'Plan: Enmienda',
      'Conclusiones y Recomendaciones',
    ];
    expect(paginas).toHaveLength(marcas.length);
    marcas.forEach((marca, i) => {
      expect(paginas[i], `diapositiva ${i + 1}`).toContain(marca);
    });
    expect(paginas[0]).toContain('ESCOCIA HASS');
    expect(paginas[0]).toContain('Informe Semanal');
    expect(paginas[0]).not.toContain('PERSONAL');
    expect(paginas[4]).toContain('JORNALES PROPIOS');
    expect(paginas[4]).toContain('POR TAREA');
    expect(paginas[4]).toContain('POR LOTE');
    expect(paginas[6]).not.toContain('Plan: Enmienda');
    expect(paginas[7]).toContain('LISTA DE COMPRAS');
    expect(paginas[7]).toContain('Total estimado: $4.520.000');
    expect(paginas[7]).toContain('APLICACIONES');
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

/**
 * Monitoreo en el PDF: las mismas diapositivas que el HTML
 * (incidencia, vista por lote, un lote de sublotes por página).
 * Los cubos de color salen de incBg() y las flechas de tendArrow(),
 * no de una paleta nueva.
 */
function coloresIncidenciaDelHtml(): Record<'cero' | 'bajo' | 'medio' | 'alto', [number, number, number]> {
  const src = readFileSync('src/supabase/functions/server/generar-reporte-semanal.tsx', 'utf8');
  const cuerpo = src.slice(src.indexOf('function incBg'), src.indexOf('function hmBg'));
  const hex = [...cuerpo.matchAll(/return '(#[0-9a-fA-F]{6})'/g)].map((m) => m[1]);
  if (hex.length !== 4) throw new Error(`incBg debería devolver 4 colores y devolvió ${hex.join(',')}`);
  const rgb = (h: string): [number, number, number] => {
    const n = Number.parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return { cero: rgb(hex[0]), bajo: rgb(hex[1]), medio: rgb(hex[2]), alto: rgb(hex[3]) };
}

function coloresFlechaDelHtml(): Record<'subiendo' | 'bajando' | 'estable', [number, number, number]> {
  const src = readFileSync('src/supabase/functions/server/generar-reporte-semanal.tsx', 'utf8');
  const cuerpo = src.slice(src.indexOf('function tendArrow'), src.indexOf('function tendCell'));
  const hex = [...cuerpo.matchAll(/color:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
  if (hex.length !== 3) throw new Error(`tendArrow debería declarar 3 colores y declaró ${hex.join(',')}`);
  const rgb = (h: string): [number, number, number] => {
    const n = Number.parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  return { subiendo: rgb(hex[0]), bajando: rgb(hex[1]), estable: rgb(hex[2]) };
}

interface RectPdf {
  pagina: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  r: number;
  g: number;
  b: number;
}

interface FlechaPdf {
  pagina: number;
  xs: number[];
  ys: number[];
  r: number;
  g: number;
  b: number;
}

interface GrafismosPdf {
  rects: RectPdf[];
  flechas: FlechaPdf[];
  rellenos: Array<{ pagina: number; r: number; g: number; b: number }>;
}

function grafismosDelPdf(contenido: string): GrafismosPdf {
  const streams = [...contenido.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((m) => m[1]);
  const rects: RectPdf[] = [];
  const flechas: FlechaPdf[] = [];
  const rellenos: GrafismosPdf['rellenos'] = [];
  let pagina = 0;
  for (const stream of streams) {
    if (!stream.includes('Tj') && !stream.includes('TJ')) continue;
    pagina += 1;
    let i = 0;
    const pila: number[] = [];
    let fill: [number, number, number] = [0, 0, 0];
    let path: Array<{ x: number; y: number }> = [];
    let curva = false;
    let pendiente: { x: number; y: number; w: number; h: number } | null = null;
    const tomarNumero = () => {
      const m = /^-?[\d.]+/.exec(stream.slice(i));
      if (!m) return false;
      pila.push(Number.parseFloat(m[0]));
      i += m[0].length;
      return true;
    };
    const soltar = (n: number) => pila.splice(pila.length - n, n);
    const cerrarRelleno = () => {
      if (pendiente) {
        const y1 = Math.min(pendiente.y, pendiente.y + pendiente.h);
        const y2 = Math.max(pendiente.y, pendiente.y + pendiente.h);
        const x1 = Math.min(pendiente.x, pendiente.x + pendiente.w);
        const x2 = Math.max(pendiente.x, pendiente.x + pendiente.w);
        rects.push({ pagina, x1, y1, x2, y2, r: fill[0], g: fill[1], b: fill[2] });
        pendiente = null;
      } else if (!curva) {
        const vistos = new Set<string>();
        const puntos = path.filter((p) => {
          const k = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });
        if (puntos.length === 3) {
          flechas.push({
            pagina,
            xs: puntos.map((p) => p.x),
            ys: puntos.map((p) => p.y),
            r: fill[0],
            g: fill[1],
            b: fill[2],
          });
        }
      }
      rellenos.push({ pagina, r: fill[0], g: fill[1], b: fill[2] });
      path = [];
      curva = false;
    };
    while (i < stream.length) {
      const c = stream[i];
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t') {
        i++;
        continue;
      }
      if (c === '(') {
        let j = i + 1;
        while (j < stream.length) {
          if (stream[j] === '\\') {
            j += 2;
            continue;
          }
          if (stream[j] === ')') break;
          j++;
        }
        i = j + 1;
        continue;
      }
      if (c === '/') {
        while (i < stream.length && stream[i] !== ' ' && stream[i] !== '\n' && stream[i] !== '\r') i++;
        continue;
      }
      if ((c >= '0' && c <= '9') || c === '-' || c === '.') {
        if (tomarNumero()) continue;
      }
      const op = /^[A-Za-z*]+/.exec(stream.slice(i));
      if (!op) {
        i++;
        continue;
      }
      const nombre = op[0];
      i += nombre.length;
      if (nombre === 'rg' && pila.length >= 3) {
        const [r, g, b] = soltar(3);
        fill = [r, g, b];
      } else if (nombre === 'g' && pila.length >= 1) {
        const [gris] = soltar(1);
        fill = [gris, gris, gris];
      } else if (nombre === 're' && pila.length >= 4) {
        const [x, y, w, h] = soltar(4);
        pendiente = { x, y, w, h };
        path = [];
        curva = false;
      } else if (nombre === 'm' && pila.length >= 2) {
        const [x, y] = soltar(2);
        path = [{ x, y }];
        curva = false;
      } else if (nombre === 'l' && pila.length >= 2) {
        const [x, y] = soltar(2);
        path.push({ x, y });
      } else if (nombre === 'c') {
        curva = true;
        pila.length = 0;
      } else if (nombre === 'f' || nombre === 'f*' || nombre === 'b' || nombre === 'B') {
        cerrarRelleno();
      } else if (nombre === 'S' || nombre === 's' || nombre === 'n') {
        pendiente = null;
        path = [];
        curva = false;
      }
      if (!['rg', 'g', 're', 'm', 'l'].includes(nombre)) pila.length = 0;
    }
  }
  return { rects, flechas, rellenos };
}

function distanciaColor(rgb: { r: number; g: number; b: number }, objetivo: [number, number, number]): number {
  const dr = rgb.r - objetivo[0] / 255;
  const dg = rgb.g - objetivo[1] / 255;
  const db = rgb.b - objetivo[2] / 255;
  return Math.hypot(dr, dg, db);
}

function cuboDe(
  rgb: { r: number; g: number; b: number } | null,
  cubos: ReturnType<typeof coloresIncidenciaDelHtml>,
): 'cero' | 'bajo' | 'medio' | 'alto' | null {
  if (!rgb) return null;
  let mejor: 'cero' | 'bajo' | 'medio' | 'alto' | null = null;
  let mejorD = 0.06;
  for (const clave of ['cero', 'bajo', 'medio', 'alto'] as const) {
    const d = distanciaColor(rgb, cubos[clave]);
    if (d < mejorD) {
      mejorD = d;
      mejor = clave;
    }
  }
  return mejor;
}

function rellenoDelTexto(frag: FragmentoPdf, rects: RectPdf[]): { r: number; g: number; b: number } | null {
  const candidatos = rects.filter(
    (rc) => rc.pagina === frag.pagina && frag.x >= rc.x1 - 1 && frag.x <= rc.x2 + 1 && frag.y >= rc.y1 - 2 && frag.y <= rc.y2 + 2,
  );
  candidatos.sort((a, b) => (a.x2 - a.x1) * (a.y2 - a.y1) - (b.x2 - b.x1) * (b.y2 - b.y1));
  const rc = candidatos[0];
  return rc ? { r: rc.r, g: rc.g, b: rc.b } : null;
}

function flechaJunto(frag: FragmentoPdf, flechas: FlechaPdf[], lado: 'izquierda' | 'derecha'): FlechaPdf | undefined {
  return flechas.find((f) => {
    if (f.pagina !== frag.pagina) return false;
    const dy = Math.min(...f.ys.map((y) => Math.abs(y - frag.y)));
    if (dy > 14) return false;
    if (lado === 'izquierda') {
      const xs = f.xs.filter((x) => x <= frag.x + 3);
      if (xs.length === 0) return false;
      const dx = frag.x - Math.max(...xs);
      return dx < 28;
    }
    const xs = f.xs.filter((x) => x >= frag.x - 2);
    if (xs.length === 0) return false;
    const dx = Math.min(...xs) - frag.x;
    return dx > 4 && dx < 55;
  });
}

function cmpMon(actual: number | null, anterior: number | null): CeldaComparativa {
  let tendencia: TendenciaDir = 'sin_referencia';
  if (actual != null && anterior != null) {
    const diff = actual - anterior;
    tendencia = Math.abs(diff) < 0.5 ? 'estable' : diff > 0 ? 'subiendo' : 'bajando';
  }
  return { actual, anterior, tendencia };
}

function plagaLote(nombre: string, interes: boolean, actual: number | null, anterior: number | null) {
  return { plagaNombre: nombre, esPlaga_interes: interes, ...cmpMon(actual, anterior) };
}

const SUBS = ['Sublote 1', 'Sublote 2', 'Sublote 3'] as const;

function filaSub(valores: Array<[number | null, number | null]>): Record<string, CeldaComparativa> {
  const fila: Record<string, CeldaComparativa> = {};
  valores.forEach((par, i) => {
    fila[SUBS[i]] = cmpMon(par[0], par[1]);
  });
  return fila;
}

const AVISO_S43 = 'Datos del monitoreo del 2026-10-14. No se realizó monitoreo en la semana del reporte.';
const ANALISIS_MONITOREO_S43 =
  'La situación fitosanitaria es preocupante debido al aumento sostenido de ácaro y sus huevos. La incidencia en La Vega es crítica, lo que exige una intervención inmediata para evitar daños mayores en la cosecha.';

function monitoreoS43(): DatosReporteSemanal['monitoreo'] {
  const sublotes = [...SUBS];
  return {
    fechaActual: '2026-10-14',
    fechaAnterior: '2026-10-07',
    avisoFechaDesactualizada: AVISO_S43,
    resumenGlobal: [
      { plagaNombre: 'Ácaro', esPlaga_interes: true, promedioActual: 25.5, minLote: 7.6, maxLote: 51.4, promedioAnterior: 10, tendencia: 'subiendo' },
      { plagaNombre: 'Ácaro Cristalino', esPlaga_interes: true, promedioActual: 5.7, minLote: 6.7, maxLote: 16.2, promedioAnterior: null, tendencia: 'sin_referencia' },
      { plagaNombre: 'Monalonion', esPlaga_interes: true, promedioActual: 1, minLote: 1, maxLote: 1, promedioAnterior: 1, tendencia: 'estable' },
      { plagaNombre: 'Huevos de acaro', esPlaga_interes: false, promedioActual: 12.4, minLote: 3.8, maxLote: 30.5, promedioAnterior: 1.2, tendencia: 'subiendo' },
      { plagaNombre: 'H-acaro Cristalino', esPlaga_interes: false, promedioActual: 3.8, minLote: 5.7, maxLote: 9.5, promedioAnterior: null, tendencia: 'sin_referencia' },
      { plagaNombre: 'Beneficos', esPlaga_interes: false, promedioActual: 0.5, minLote: 1.9, maxLote: 1.9, promedioAnterior: 1.4, tendencia: 'bajando' },
      { plagaNombre: 'Mulita/Vaquita', esPlaga_interes: false, promedioActual: 0.2, minLote: 1, maxLote: 1, promedioAnterior: 1.2, tendencia: 'bajando' },
    ],
    vistasPorLote: [
      {
        loteId: 'pp',
        loteNombre: '1. Piedra Paula',
        sinDatos: false,
        fechaUltimaObservacion: '2026-10-14',
        nivelAlerta: 'amarilla',
        plagas: [
          plagaLote('Ácaro', true, 7.6, 3.8),
          plagaLote('Monalonion', true, 1, 3.8),
          plagaLote('Huevos de acaro', false, 3.8, null),
          plagaLote('Mulita/Vaquita', false, 1, 1),
        ],
      },
      {
        loteId: 'st',
        loteNombre: '2. Salto de Tequendama',
        sinDatos: false,
        fechaUltimaObservacion: '2026-10-14',
        nivelAlerta: 'amarilla',
        plagas: [
          plagaLote('Ácaro', true, 8.6, 5.7),
          plagaLote('Monalonion', true, 1, null),
          plagaLote('Huevos de acaro', false, 3.8, null),
          plagaLote('Mulita/Vaquita', false, null, 1),
          plagaLote('Beneficos', false, null, 1),
        ],
      },
      {
        loteId: 'au',
        loteNombre: '3. Australia',
        sinDatos: false,
        fechaUltimaObservacion: '2026-10-15',
        nivelAlerta: 'roja',
        plagas: [
          plagaLote('Ácaro', true, 34.3, 9.5),
          plagaLote('Ácaro Cristalino', true, 6.7, null),
          plagaLote('Monalonion', true, 1, null),
          plagaLote('Huevos de acaro', false, 11.4, 1),
          plagaLote('H-acaro Cristalino', false, 9.5, null),
          plagaLote('Mulita/Vaquita', false, null, 2.9),
          plagaLote('Beneficos', false, null, 1.9),
        ],
      },
      {
        loteId: 'lv',
        loteNombre: '4. La Vega',
        sinDatos: false,
        fechaUltimaObservacion: '2026-10-15',
        nivelAlerta: 'roja',
        plagas: [
          plagaLote('Ácaro', true, 51.4, 21),
          plagaLote('Ácaro Cristalino', true, 16.2, null),
          plagaLote('Monalonion', true, 1, null),
          plagaLote('Huevos de acaro', false, 30.5, 3.8),
          plagaLote('H-acaro Cristalino', false, 5.7, null),
          plagaLote('Beneficos', false, 1.9, 2.9),
          plagaLote('Chancro', false, null, 1),
        ],
      },
    ],
    vistasPorSublote: [
      {
        loteId: 'pp',
        loteNombre: '1. Piedra Paula',
        sinDatos: false,
        sublotes,
        plagas: ['Ácaro', 'Monalonion', 'Huevos de acaro', 'Mulita/Vaquita'],
        tieneDatosSemanaActual: false,
        celdas: {
          Ácaro: filaSub([[8.6, 2.9], [5.7, 8.6], [8.6, null]]),
          Monalonion: filaSub([[null, null], [2.9, null], [null, null]]),
          'Huevos de acaro': filaSub([[5.7, null], [null, null], [5.7, null]]),
          'Mulita/Vaquita': filaSub([[null, null], [2.9, null], [null, null]]),
        },
      },
      {
        loteId: 'st',
        loteNombre: '2. Salto de Tequendama',
        sinDatos: false,
        sublotes,
        plagas: ['Ácaro', 'Monalonion', 'Beneficos', 'Huevos de acaro', 'Mulita/Vaquita'],
        tieneDatosSemanaActual: false,
        celdas: {
          Ácaro: filaSub([[5.7, null], [5.7, null], [14.3, null]]),
          Monalonion: filaSub([[null, null], [2.9, null], [null, null]]),
          Beneficos: filaSub([[null, null], [null, null], [null, null]]),
          'Huevos de acaro': filaSub([[5.7, null], [2.9, null], [2.9, null]]),
          'Mulita/Vaquita': filaSub([[null, null], [null, null], [null, null]]),
        },
      },
      {
        loteId: 'au',
        loteNombre: '3. Australia',
        sinDatos: false,
        sublotes,
        plagas: ['Ácaro', 'Ácaro Cristalino', 'Monalonion', 'Beneficos', 'H-acaro Cristalino', 'Huevos de acaro', 'Mulita/Vaquita'],
        tieneDatosSemanaActual: false,
        celdas: {
          Ácaro: filaSub([[31.4, null], [40, null], [31.4, null]]),
          'Ácaro Cristalino': filaSub([[null, null], [17.1, null], [2.9, null]]),
          Monalonion: filaSub([[null, null], [null, null], [2.9, null]]),
          Beneficos: filaSub([[null, null], [null, null], [null, null]]),
          'H-acaro Cristalino': filaSub([[null, null], [5.7, null], [22.9, null]]),
          'Huevos de acaro': filaSub([[2.9, null], [11.4, null], [20, null]]),
          'Mulita/Vaquita': filaSub([[null, null], [null, null], [null, null]]),
        },
      },
      {
        loteId: 'lv',
        loteNombre: '4. La Vega',
        sinDatos: false,
        sublotes,
        plagas: ['Ácaro', 'Ácaro Cristalino', 'Monalonion', 'Beneficos', 'Chancro', 'H-acaro Cristalino', 'Huevos de acaro'],
        tieneDatosSemanaActual: false,
        celdas: {
          Ácaro: filaSub([[65.7, 5.7], [31.4, 31.4], [57.1, 35.7]]),
          'Ácaro Cristalino': filaSub([[17.1, null], [8.6, null], [22.9, null]]),
          Monalonion: filaSub([[null, null], [null, null], [2.9, null]]),
          Beneficos: filaSub([[null, null], [5.7, null], [null, null]]),
          Chancro: filaSub([[null, null], [null, null], [null, null]]),
          'H-acaro Cristalino': filaSub([[null, null], [17.1, null], [null, null]]),
          'Huevos de acaro': filaSub([[31.4, 2.9], [34.3, 2.9], [25.7, 5.7]]),
        },
      },
    ],
    insights: [],
    tendencias: [],
    detallePorLote: [],
    fechasMonitoreo: ['2026-10-07', '2026-10-14'],
  };
}

export function datosSemana43ConMonitoreo(): DatosReporteSemanal {
  const datos = datosSemana43();
  datos.secciones = { ...datos.secciones, monitoreoPlagas: true, colmenas: true };
  datos.monitoreo = monitoreoS43();
  datos.colmenas = {
    porApiario: [
      { apiarioNombre: 'El Bosque', fuertes: 8, debiles: 1, muertas: 14, conReina: 9, total: 23 },
      { apiarioNombre: 'Quebrada', fuertes: 12, debiles: 1, muertas: 7, conReina: 12, total: 20 },
    ],
    historico: [],
    totales: { fuertes: 20, debiles: 2, muertas: 21, conReina: 21, total: 43, pctFuertes: 47 },
  };
  return datos;
}

export function analisisConMonitoreo(): AnalisisReportePdf {
  return {
    ...ANALISIS_SEMANA_43,
    titulares: {
      ...ANALISIS_SEMANA_43.titulares,
      monitoreo: 'Incidencia de ácaro en La Vega alcanza el 51.4%, superando umbrales críticos.',
      colmenas: '43 colmenas totales con 49% de mortalidad, afectando la capacidad de polinización.',
    },
    interpretacion_monitoreo: ANALISIS_MONITOREO_S43,
  };
}

function documentoMonitoreoS43() {
  return construirDocumentoReporteSemanal(LIBS, datosSemana43ConMonitoreo(), analisisConMonitoreo());
}

const LOTES_S43 = ['1. Piedra Paula', '2. Salto de Tequendama', '3. Australia', '4. La Vega'] as const;

describe('PDF del informe semanal — monitoreo S43, una diapositiva por página', () => {
  it('arma 16 diapositivas y el bloque de monitoreo es incidencia, vista por lote y un lote por página', () => {
    const crudo = documentoMonitoreoS43().output();
    assertDiapositivas(crudo);
    const paginas = paginasDeTexto(crudo);
    expect(paginas).toHaveLength(16);
    expect(paginas[0]).toContain('RESUMEN EJECUTIVO');
    expect(paginas[1]).toContain('PERSONAL');
    expect(paginas[2]).toContain('RESUMEN DEL CLIMA');
    expect(paginas[3]).toContain('LABORES');
    expect(paginas[4]).toContain('JORNALES PROPIOS');
    expect(paginas[11]).toContain('CONDUCTIVIDAD ELÉCTRICA');
    expect(paginas[12]).toContain('MONITOREO DE COLMENAS');
    expect(paginas[13]).toContain('APLICACIONES');
    expect(paginas[14]).toContain('Plan: Enmienda');
    expect(paginas[15]).toContain('Conclusiones y Recomendaciones');

    const dePlagas = paginas.filter((p) => p.split('\n')[0] === 'MONITOREO');
    expect(dePlagas).toHaveLength(1 + 1 + LOTES_S43.length);

    const incidencia = paginas[5];
    expect(incidencia.split('\n')[0]).toBe('MONITOREO');
    expect(incidencia).toContain(AVISO_S43);
    expect(incidencia).toContain('Monitoreo: 2026-10-14');
    expect(incidencia).toContain('Referencia: 2026-10-07');
    expect(incidencia).toContain('Incidencia Promedio');
    expect(incidencia).toContain('Rango (Min–Max)');
    expect(incidencia).toContain('Tendencia');
    expect(incidencia).toContain('ANÁLISIS');
    expect(incidencia).toContain(ANALISIS_MONITOREO_S43.slice(0, 40));
    expect(incidencia).toContain('INCIDENCIA');
    expect(incidencia).toContain('0%');
    expect(incidencia).toContain('<10%');
    expect(incidencia).toContain('<20%');
    expect(incidencia).toMatch(/>=20%|≥20%/);
    expect(incidencia).toContain('TENDENCIA');
    expect(incidencia).toContain('Subiendo');
    expect(incidencia).toContain('Bajando');
    expect(incidencia).toContain('Estable');
    expect(incidencia).toContain('(era 10.0%)');
    expect(incidencia).toContain('(era 1.4%)');
    expect(incidencia).toContain('(era 1.0%)');
    expect(incidencia).not.toMatch(/\(sube,/);
    expect(incidencia).not.toContain('sube, era');
    expect(incidencia).not.toContain('Vista por Lote');
    expect(incidencia).not.toContain('Sublotes');

    const vista = paginas[6];
    expect(vista).toContain('Vista por Lote');
    expect(vista).toContain('Fecha');
    expect(vista).not.toContain('Incidencia Promedio');
    expect(vista).not.toContain('Sublotes');
    expect(vista).not.toContain('(era ');
    expect(vista).not.toMatch(/\(sube,/);
    const pos = (s: string) => vista.indexOf(s);
    expect(pos('Vista por Lote')).toBeLessThan(pos('1. Piedra Paula'));
    expect(pos('1. Piedra Paula')).toBeLessThan(pos('2. Salto de Tequendama'));
    expect(pos('2. Salto de Tequendama')).toBeLessThan(pos('3. Australia'));
    expect(pos('3. Australia')).toBeLessThan(pos('4. La Vega'));
    expect(pos('4. La Vega')).toBeLessThan(pos('Fecha'));
    expect(pos('Fecha')).toBeLessThan(pos('10/14'));
    expect(pos('10/14')).toBeLessThan(pos('10/15'));
    expect(pos('10/15')).toBeLessThan(pos('Ácaro Cristalino'));
    expect(pos('Ácaro Cristalino')).toBeLessThan(pos('Monalonion'));
    expect(pos('Monalonion')).toBeLessThan(pos('Beneficos'));
    expect(pos('Beneficos')).toBeLessThan(pos('Chancro'));
    expect(pos('Chancro')).toBeLessThan(pos('H-acaro Cristalino'));
    expect(pos('H-acaro Cristalino')).toBeLessThan(pos('Huevos de acaro'));
    expect(pos('Huevos de acaro')).toBeLessThan(pos('Mulita/Vaquita'));

    LOTES_S43.forEach((lote, i) => {
      const pagina = paginas[7 + i];
      expect(pagina, lote).toContain(`Sublotes — ${lote}`);
      expect(pagina).toContain('Sublote 1');
      expect(pagina).toContain('Sublote 2');
      expect(pagina).toContain('Sublote 3');
      for (const otro of LOTES_S43) {
        if (otro !== lote) expect(pagina, lote).not.toContain(otro);
      }
      expect(pagina).not.toContain('Vista por Lote');
      expect(pagina).not.toContain('Incidencia Promedio');
      expect((pagina.match(/Sublotes/g) ?? []).length).toBe(1);
    });
    expect(paginas[7]).toContain('(era 2.9%)');
    expect(paginas[10]).toContain('(era 5.7%)');
    expect(paginas[10]).not.toMatch(/\(sube,/);
  });

  it('pinta los cubos de incBg y la flecha de tendArrow, no la prosa (sube, era)', () => {
    const cubos = coloresIncidenciaDelHtml();
    const flechasColor = coloresFlechaDelHtml();
    const crudo = documentoMonitoreoS43().output();
    const fragmentos = fragmentosDelPdf(crudo);
    const { rects, flechas } = grafismosDelPdf(crudo);
    const paginas = paginasDeTexto(crudo);
    const nIncidencia = paginas.findIndex((p) => p.includes('Incidencia Promedio')) + 1;
    const nVista = paginas.findIndex((p) => p.includes('Vista por Lote')) + 1;
    const nLaVega = paginas.findIndex((p) => p.includes('Sublotes — 4. La Vega')) + 1;

    const cubosDe = (texto: string, pagina: number) =>
      fragmentos
        .filter((f) => f.pagina === pagina && f.texto === texto)
        .map((f) => cuboDe(rellenoDelTexto(f, rects), cubos));

    expect(cubosDe('25.5%', nIncidencia)).toEqual(expect.arrayContaining(['alto', 'cero']));
    expect(cubosDe('12.4%', nIncidencia)).toEqual(expect.arrayContaining(['medio']));
    expect(cubosDe('1.0%', nIncidencia)).toEqual(expect.arrayContaining(['bajo']));
    expect(cubosDe('0.5%', nIncidencia)).toEqual(expect.arrayContaining(['bajo']));
    expect(cubosDe('0.2%', nIncidencia)).toEqual(expect.arrayContaining(['bajo']));
    expect(cubosDe('51.4%', nVista)).toEqual(['alto']);
    expect(cubosDe('16.2%', nVista)).toEqual(['medio']);
    expect(cubosDe('6.7%', nVista)).toEqual(['bajo']);
    expect(cubosDe('65.7%', nLaVega)).toContain('alto');

    const colorDe = (f: FlechaPdf | undefined) => {
      expect(f, 'flecha junto al texto').toBeTruthy();
      let mejor: keyof typeof flechasColor | null = null;
      let mejorD = 0.06;
      for (const clave of ['subiendo', 'bajando', 'estable'] as const) {
        const d = distanciaColor(f!, flechasColor[clave]);
        if (d < mejorD) {
          mejorD = d;
          mejor = clave;
        }
      }
      return mejor;
    };
    const nota = (texto: string, pagina: number) => fragmentos.find((f) => f.pagina === pagina && f.texto === texto);
    expect(colorDe(flechaJunto(nota('(era 10.0%)', nIncidencia)!, flechas, 'izquierda'))).toBe('subiendo');
    expect(colorDe(flechaJunto(nota('(era 1.4%)', nIncidencia)!, flechas, 'izquierda'))).toBe('bajando');
    expect(colorDe(flechaJunto(nota('(era 1.0%)', nIncidencia)!, flechas, 'izquierda'))).toBe('estable');
    const celdaVega = fragmentos.find((f) => f.pagina === nVista && f.texto === '51.4%');
    expect(colorDe(flechaJunto(celdaVega!, flechas, 'derecha'))).toBe('subiendo');
    const celdaEstable = fragmentos.find((f) => f.pagina === nVista && f.texto === '7.6%');
    expect(colorDe(flechaJunto(celdaEstable!, flechas, 'derecha'))).toBe('subiendo');
    const eraLaVega = nota('(era 5.7%)', nLaVega);
    expect(colorDe(flechaJunto(eraLaVega!, flechas, 'izquierda'))).toBe('subiendo');

    for (const f of fragmentos) {
      expect(f.x).toBeGreaterThanOrEqual(8);
      expect(f.y).toBeGreaterThanOrEqual(8);
      expect(f.x).toBeLessThanOrEqual(f.ancho - 8);
      expect(f.y).toBeLessThanOrEqual(f.alto - 8);
    }
  });

  it('solo parte una tabla que no cabe, y no mezcla dos diapositivas en la continuación', () => {
    const datos = datosSemana43ConMonitoreo();
    for (let i = 0; i < 28; i++) {
      datos.monitoreo.resumenGlobal.push({
        plagaNombre: `Plaga de desborde número ${String(i + 1).padStart(2, '0')}`,
        esPlaga_interes: false,
        promedioActual: 4.2,
        minLote: 1,
        maxLote: 8,
        promedioAnterior: 3,
        tendencia: 'subiendo',
      });
    }
    const crudo = construirDocumentoReporteSemanal(LIBS, datos, analisisConMonitoreo()).output();
    const paginas = paginasDeTexto(crudo);
    const indicesInc = paginas.map((p, i) => (p.includes('Incidencia Promedio') ? i : -1)).filter((i) => i >= 0);
    const idxVista = paginas.findIndex((p) => p.includes('Vista por Lote'));
    const idxAnalisis = paginas.findIndex((p) => p.includes('situación fitosanitaria'));
    expect(indicesInc.length).toBeGreaterThan(1);
    expect(idxVista).toBeGreaterThan(indicesInc[indicesInc.length - 1]);
    expect(idxAnalisis).toBeGreaterThanOrEqual(indicesInc[0]);
    expect(idxAnalisis).toBeLessThan(idxVista);
    expect(paginas[idxAnalisis]).not.toContain('Vista por Lote');
    for (let i = 1; i <= 28; i++) {
      expect(paginas.join('\n')).toContain(`Plaga de desborde número ${String(i).padStart(2, '0')}`);
    }
    const marcas = [
      'Incidencia Promedio',
      'Vista por Lote',
      ...LOTES_S43.map((lote) => `Sublotes — ${lote}`),
    ];
    for (const pagina of paginas) {
      const presentes = marcas.filter((m) => pagina.includes(m));
      expect(presentes.length, presentes.join(' + ')).toBeLessThanOrEqual(1);
    }
    LOTES_S43.forEach((lote) => {
      const propias = paginas.filter((p) => p.includes(`Sublotes — ${lote}`));
      expect(propias).toHaveLength(1);
    });
    expect(paginas.filter((p) => p.includes('Vista por Lote'))).toHaveLength(1);
    for (const i of indicesInc) expect(paginas[i].split('\n')[0]).toBe('MONITOREO');
  });
});
