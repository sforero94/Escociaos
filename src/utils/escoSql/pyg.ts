// Esco SQL — herramienta consultar_pyg (ESCO-180, opción B de Santiago, 2026-11-14).
//
// Un P&G NO es ingresos − gastos: la compra de ganado es inventario y solo el costo de las
// cabezas vendidas (promedio ponderado móvil por cabeza, sobre TODA la historia) entra como
// costo. Esco SQL respondía «PyG» restando v_esco_gastos de v_esco_ingresos y daba ~4× la
// utilidad real de Ganado.
//
// Esta herramienta corre el MISMO motor de la pantalla /finanzas/reportes: `construirPyG`
// (calculosPyG.ts) con `construirPeriodos` (periodosReporte.ts). No es un port ni una copia:
// es el mismo archivo, importado por ruta relativa para que entre en el bundle de Deno.
//
// Puro: las filas crudas llegan inyectadas (el manejador las lee con el JWT del usuario,
// así que la RLS Gerencia-only de fin_* aplica). Aquí solo se mapean y se calculan.

import { construirPyG } from '../calculosPyG.ts';
import { construirPeriodos } from '../periodosReporte.ts';
import type {
  DatosCrudosReportes,
  GastoCrudo,
  IngresoCrudo,
  ModoReporte,
  ReportePyG,
  TransaccionGanadoCruda,
  VistaReporte,
} from '../../types/reportesFinancieros.ts';

export type { ReportePyG };

export interface ArgumentosPyG {
  vista: VistaReporte;
  anio: number;
  modo: ModoReporte;
}

/** Filas tal como salen de PostgREST, sin mapear. */
export interface FilasCrudasPyG {
  negocios: Record<string, unknown>[];
  categoriasGastos: Record<string, unknown>[];
  conceptos: Record<string, unknown>[];
  categoriasIngresos: Record<string, unknown>[];
  /** fin_gastos de anio−1 y anio (el modo cosecha necesita el 2º semestre del anterior). */
  gastos: Record<string, unknown>[];
  ingresos: Record<string, unknown>[];
  /** fin_transacciones_ganado con es_hato = false, historia COMPLETA. */
  ganado: Record<string, unknown>[];
  parametros: Record<string, unknown>[];
}

export const VISTAS_PYG: readonly VistaReporte[] = ['global', 'aguacate', 'ganado', 'hato'];

export const HERRAMIENTA_CONSULTAR_PYG = {
  type: 'function',
  function: {
    name: 'consultar_pyg',
    description:
      'P&G oficial (el mismo cálculo de /finanzas/reportes): ingresos, costos directos (incluye el costo de venta del ganado), margen de contribución, gastos indirectos y utilidad operativa. Úsalo SIEMPRE para utilidad, PyG, P&G, margen, rentabilidad o "cuánto ganó/perdió". Columnas acumuladas por trimestre (Q1, Q1–Q2, Q1–Q3, Año) o por cosecha (solo aguacate). Cuenta como una consulta.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vista: { type: 'string', enum: VISTAS_PYG, description: 'global = todos los negocios; aguacate, ganado o hato.' },
        anio: { type: 'integer', minimum: 2020, maximum: 2100 },
        modo: { type: 'string', enum: ['trimestres', 'cosecha'], description: 'cosecha solo aplica a aguacate.' },
      },
      required: ['vista', 'anio'],
    },
  },
} as const;

/** null si los argumentos no sirven. El modo cosecha solo vale en aguacate (como en la pantalla y el clásico). */
export function leerArgumentosPyG(bruto: string): ArgumentosPyG | null {
  let a: { vista?: unknown; anio?: unknown; modo?: unknown };
  try { a = JSON.parse(bruto) as typeof a; } catch { return null; }
  if (typeof a.vista !== 'string' || !(VISTAS_PYG as readonly string[]).includes(a.vista)) return null;
  const anio = Number(a.anio);
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) return null;
  const vista = a.vista as VistaReporte;
  const modo: ModoReporte = a.modo === 'cosecha' && vista === 'aguacate' ? 'cosecha' : 'trimestres';
  return { vista, anio, modo };
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const textoONull = (v: unknown): string | null => (v == null ? null : String(v));
const tipoCosto = (v: unknown): 'directo' | 'indirecto' | null =>
  v === 'directo' || v === 'indirecto' ? v : null;

/** Las filas crudas con la forma que espera construirPyG (la misma que arma la pantalla). */
export function armarDatosPyG(anio: number, c: FilasCrudasPyG): DatosCrudosReportes {
  const catGastos = new Map(c.categoriasGastos.map((x) => [String(x.id), x]));
  const conceptos = new Map(c.conceptos.map((x) => [String(x.id), x]));
  const catIngresos = new Map(c.categoriasIngresos.map((x) => [String(x.id), x]));
  return {
    anio,
    negocios: c.negocios.map((n) => ({ id: String(n.id), nombre: String(n.nombre) })),
    gastos: c.gastos.map((g): GastoCrudo => {
      const cat = catGastos.get(String(g.categoria_id));
      const con = conceptos.get(String(g.concepto_id));
      return {
        id: String(g.id),
        fecha: String(g.fecha),
        negocio_id: String(g.negocio_id),
        valor: num(g.valor),
        estado: textoONull(g.estado),
        categoria_id: textoONull(g.categoria_id),
        categoria_nombre: textoONull(cat?.nombre),
        concepto_id: textoONull(g.concepto_id),
        concepto_nombre: textoONull(con?.nombre),
        categoria_tipo_costo: tipoCosto(cat?.tipo_costo),
        concepto_tipo_costo: tipoCosto(con?.tipo_costo),
      };
    }),
    ingresos: c.ingresos.map((i): IngresoCrudo => ({
      id: String(i.id),
      fecha: String(i.fecha),
      negocio_id: String(i.negocio_id),
      valor: num(i.valor),
      categoria_id: textoONull(i.categoria_id),
      categoria_nombre: textoONull(catIngresos.get(String(i.categoria_id))?.nombre),
      cosecha: textoONull(i.cosecha),
      cantidad: numONull(i.cantidad),
    })),
    ganado: c.ganado
      // Defensa en profundidad: el manejador ya filtra es_hato = false, pero una vaca del hato
      // nunca se compró y costearla al promedio de la ceba infla el COGS.
      .filter((t) => t.es_hato !== true && (t.tipo === 'compra' || t.tipo === 'venta'))
      .map((t): TransaccionGanadoCruda => ({
        id: String(t.id),
        fecha: String(t.fecha),
        tipo: t.tipo as 'compra' | 'venta',
        cantidad_cabezas: num(t.cantidad_cabezas),
        kilos_pagados: numONull(t.kilos_pagados),
        valor_total: num(t.valor_total),
      })),
    parametros: c.parametros.map((p) => ({
      clave: String(p.clave),
      anio: p.anio == null ? null : Number(p.anio),
      negocio_id: textoONull(p.negocio_id),
      valor: num(p.valor),
    })),
    truncado: false,
  };
}

export function calcularPyG(args: ArgumentosPyG, crudas: FilasCrudasPyG): ReportePyG {
  return construirPyG(armarDatosPyG(args.anio, crudas), construirPeriodos(args.anio, args.modo), { vista: args.vista, modo: args.modo });
}

/**
 * Filas para mostrar_visual y para el modelo: una por línea del P&G (sin los encabezados de
 * sección) y una columna por período (su `key`). Una celda sin dato calculable va en null,
 * nunca en 0: es la diferencia entre "el margen fue 0%" y "no hubo ventas".
 */
export function filasPyG(r: ReportePyG): Record<string, unknown>[] {
  return r.lineas
    .filter((l) => l.tipo !== 'seccion')
    .map((l) => {
      const f: Record<string, unknown> = { tipo: l.tipo, concepto: l.etiqueta, formato: l.formato, resta: l.esResta };
      r.periodos.forEach((p, i) => { f[p.key] = l.sinDato?.[i] ? null : l.valores[i] ?? null; });
      return f;
    });
}

/** Lo que ve el modelo: periodos, líneas y advertencias del mismo cálculo de la pantalla. */
export function textoResultadoPyG(n: number, r: ReportePyG): string {
  const periodos = r.periodos.map((p) => `${p.key} = ${p.label} (${p.descripcion})`).join('; ');
  const advertencias = r.advertencias.length ? ` Advertencias: ${r.advertencias.map((a) => a.mensaje).join(' | ')}.` : '';
  return `Resultado de la consulta ${n} (consultar_pyg, P&G oficial de ${r.vista_nombre} ${r.anio}). Columnas: ${periodos}. Las columnas de trimestre son ACUMULADAS. Los valores son siempre positivos: "resta": true significa que la línea se resta. Los costos directos ya incluyen el costo de venta del ganado; la compra de ganado no es gasto. null = sin dato calculable (nunca lo conviertas en 0). Las filas quedan disponibles para mostrar_visual (columnas tipo, concepto, ${r.periodos.map((p) => p.key).join(', ')}).${advertencias}\n${JSON.stringify({ totales: r.totales, lineas: filasPyG(r) })}`;
}
