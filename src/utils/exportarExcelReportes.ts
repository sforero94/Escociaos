// Export a Excel del P&G y del Flujo de Caja, en un solo libro de dos hojas.
//
// Los montos se escriben como NÚMEROS, no como texto formateado: el punto de
// bajar a Excel es poder sumar, filtrar y graficar. El formato colombiano se
// aplica con `numFmt`, así se ve igual que en pantalla y sigue siendo numérico.
//
// El adaptador se importa dinámicamente (mismo patrón que `CargaMasivaGastos.tsx`)
// para no cargarlo en el bundle inicial.

import type { ReporteFlujoCaja, ReportePyG } from '@/types/reportesFinancieros';
import type { SheetSpec } from './spreadsheet';

/** Formato colombiano: punto de miles, sin decimales. */
const FORMATO_PESOS = '#,##0';
const FORMATO_PORCENTAJE = '0.0"%"';

export async function exportarExcelReportes(
  pyg: ReportePyG,
  flujo: ReporteFlujoCaja
): Promise<void> {
  const { writeXlsx, downloadXlsx } = await import('./spreadsheet');
  const bytes = await writeXlsx([hojaPyG(pyg), hojaFlujo(flujo)]);
  const nombre = `reportes-${pyg.vista_nombre.toLowerCase().replace(/\s+/g, '-')}-${pyg.anio}.xlsx`;
  downloadXlsx(bytes, nombre);
}

function hojaPyG(pyg: ReportePyG): SheetSpec {
  const filas: (string | number | null)[][] = [];

  filas.push([`Estado de Resultados — ${pyg.vista_nombre} ${pyg.anio}`]);
  filas.push([pyg.modo === 'cosecha' ? 'Columnas por cosecha' : 'Columnas: trimestres acumulados']);
  filas.push([]);
  filas.push(['Concepto', ...pyg.periodos.map((p) => p.label)]);

  for (const linea of pyg.lineas) {
    const sangria = '  '.repeat(linea.nivel);
    const celdas = pyg.periodos.map((_, i) => {
      if (linea.tipo === 'seccion') return null;
      if (linea.sinDato?.[i]) return null;
      // El signo se materializa aquí: en Excel un costo debe restar de verdad
      // para que las fórmulas del usuario funcionen.
      return linea.esResta ? -linea.valores[i] : linea.valores[i];
    });
    filas.push([`${sangria}${linea.etiqueta}`, ...celdas]);
  }

  filas.push([]);
  filas.push(['Notas']);
  filas.push(['Solo incluye gastos confirmados.']);
  filas.push(['La compra de ganado no es gasto: es inversión en inventario.']);
  for (const adv of pyg.advertencias) filas.push([adv.mensaje]);

  return { name: 'P&G', rows: filas,
    formats: formatoNumerico(filas, i => pyg.lineas[i]?.formato === 'porcentaje' ? FORMATO_PORCENTAJE : FORMATO_PESOS, 4),
    widths: [42, ...pyg.periodos.map(() => 16)],
  };
}

function hojaFlujo(flujo: ReporteFlujoCaja): SheetSpec {
  const filas: (string | number | null)[][] = [];

  filas.push([`Flujo de Caja — ${flujo.vista_nombre} ${flujo.anio}`]);
  filas.push(['Movimientos por fecha de registro. No es una conciliación bancaria.']);
  filas.push([]);
  filas.push(['Concepto', ...flujo.meses_label, 'Total']);

  for (const linea of flujo.lineas) {
    const signo = linea.signo === 'salida' ? -1 : 1;
    filas.push([
      `${'  '.repeat(linea.nivel)}${linea.etiqueta}`,
      ...linea.meses.map((v) => signo * v),
      signo * linea.total,
    ]);
  }

  filas.push([]);
  filas.push(['Notas']);
  filas.push(['La compra de ganado es salida de caja pero no es gasto en el P&G.']);
  if (flujo.saldo_inicial_es_supuesto) {
    filas.push(['No hay saldo inicial de caja cargado: la última fila es el flujo acumulado del año.']);
  }
  for (const adv of flujo.advertencias) filas.push([adv.mensaje]);

  return { name: 'Flujo de Caja', rows: filas,
    formats: formatoNumerico(filas, () => FORMATO_PESOS, 4),
    widths: [42, ...flujo.meses_label.map(() => 14), 16],
  };
}

/**
 * Marca las celdas numéricas con el formato colombiano correspondiente.
 *
 * `formatoDeFila` recibe el índice de la línea (0 = primera línea del reporte)
 * y decide el formato. Es un callback en vez de un campo porque `LineaPyG`
 * tiene `formato` y `LineaFlujo` no: el flujo siempre son pesos.
 */
function formatoNumerico(
  filas: (string | number | null)[][],
  formatoDeFila: (indiceLinea: number) => string,
  filaInicioDatos: number
): NonNullable<SheetSpec['formats']> {
  const formats: { row: number; column: number; format: string }[] = [];
  for (let f = filaInicioDatos; f < filas.length; f++) {
    for (let c = 1; c < filas[f].length; c++) {
      if (typeof filas[f][c] === 'number') formats.push({ row: f + 1, column: c + 1, format: formatoDeFila(f - filaInicioDatos) });
    }
  }
  return formats;
}
