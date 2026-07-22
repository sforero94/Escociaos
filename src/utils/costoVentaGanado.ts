// Costo de venta del ganado (COGS). Lógica pura, sin Supabase.
//
// Regla contable aprobada: comprar un animal no es un gasto, es cambiar plata
// por un activo. La compra NUNCA entra al P&G — solo el costo de las cabezas
// efectivamente vendidas cruza la línea.
//
// Método: promedio ponderado MÓVIL por cabeza. Cada compra recalcula el costo
// unitario del inventario; cada venta consume a ese costo.
//
// Por cabeza y no por kilo: el animal se compra flaco y se vende gordo.
// Costear los kilos vendidos a precio de compra cobraría el engorde dos veces,
// porque la alimentación y el veterinario ya están en `fin_gastos` como costo
// directo del período.
//
// El cálculo es PATH-DEPENDENT: recortar la serie de transacciones cambia el
// resultado. Por eso el hook trae el histórico completo, nunca solo el año.

import type {
  AdvertenciaReporte,
  TransaccionGanadoCruda,
} from '@/types/reportesFinancieros';

export interface InventarioInicialGanado {
  cabezas: number;
  costoPorCabeza: number;
}

export interface EventoVentaCosteada {
  transaccion_id: string;
  fecha: string;
  cabezas: number;
  /** Costo de las cabezas vendidas, en pesos. */
  cogs: number;
}

/** Estado del inventario después de procesar cada transacción. */
export interface SnapshotInventario {
  fecha: string;
  cabezas: number;
  valorInventario: number;
}

export interface ResultadoCosteoGanado {
  ventas: EventoVentaCosteada[];
  /** Un snapshot por transacción, en orden cronológico. Permite valorizar el inventario a cualquier fecha de corte. */
  historial: SnapshotInventario[];
  /** Estado del inventario al final de la serie. */
  cabezasFinales: number;
  valorInventarioFinal: number;
  costoPromedioFinal: number;
  /** Cabezas vendidas que no tenían inventario detrás y se costearon al promedio de compras. */
  cabezasSinRespaldo: number;
  /** Promedio ponderado de todas las compras registradas. Fallback de costeo. */
  promedioCompras: number;
  advertencias: AdvertenciaReporte[];
}

/** Orden determinista: por fecha y, a igual fecha, por id. */
function ordenar(transacciones: TransaccionGanadoCruda[]): TransaccionGanadoCruda[] {
  return [...transacciones].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Promedio ponderado de todas las compras de la serie. 0 si no hay compras. */
export function promedioPonderadoCompras(transacciones: TransaccionGanadoCruda[]): number {
  let cabezas = 0;
  let valor = 0;
  for (const t of transacciones) {
    if (t.tipo !== 'compra') continue;
    cabezas += t.cantidad_cabezas;
    valor += t.valor_total;
  }
  return cabezas > 0 ? valor / cabezas : 0;
}

/**
 * Recorre la serie completa aplicando promedio ponderado móvil.
 *
 * Cuando una venta consume más cabezas de las que hay en inventario, el
 * faltante se costea al promedio ponderado de las compras y se contabiliza en
 * `cabezasSinRespaldo`. Costearlo a cero — que sería lo "fácil" — subestimaría
 * el costo de venta e inflaría el margen, que es exactamente el error que un
 * reporte financiero no puede cometer en silencio.
 */
export function costearVentasGanado(
  transacciones: TransaccionGanadoCruda[],
  inventarioInicial: InventarioInicialGanado | null
): ResultadoCosteoGanado {
  const promedioCompras = promedioPonderadoCompras(transacciones);
  const advertencias: AdvertenciaReporte[] = [];

  let cabezas = inventarioInicial?.cabezas ?? 0;
  let valorInventario = (inventarioInicial?.cabezas ?? 0) * (inventarioInicial?.costoPorCabeza ?? 0);

  const ventas: EventoVentaCosteada[] = [];
  const historial: SnapshotInventario[] = [];
  let cabezasSinRespaldo = 0;

  for (const t of ordenar(transacciones)) {
    if (t.tipo === 'compra') {
      cabezas += t.cantidad_cabezas;
      valorInventario += t.valor_total;
    } else {
      const costoUnitario = cabezas > 0 ? valorInventario / cabezas : promedioCompras;
      const conRespaldo = Math.min(t.cantidad_cabezas, cabezas);
      const faltante = t.cantidad_cabezas - conRespaldo;

      const cogs = conRespaldo * costoUnitario + faltante * promedioCompras;

      cabezas -= conRespaldo;
      valorInventario = Math.max(0, valorInventario - conRespaldo * costoUnitario);
      cabezasSinRespaldo += faltante;

      ventas.push({
        transaccion_id: t.id,
        fecha: t.fecha,
        cabezas: t.cantidad_cabezas,
        cogs,
      });
    }

    historial.push({ fecha: t.fecha, cabezas, valorInventario });
  }

  if (cabezasSinRespaldo > 0) {
    advertencias.push(
      inventarioInicial
        ? {
            codigo: 'ganado_venta_sin_inventario',
            severidad: 'warning',
            mensaje:
              `Se vendieron ${cabezasSinRespaldo} cabezas más de las que el inventario registrado respalda. ` +
              `Se costearon al promedio de compras (${Math.round(promedioCompras).toLocaleString('es-CO')} por cabeza).`,
            valor: cabezasSinRespaldo,
            formatoValor: 'unidades',
          }
        : {
            codigo: 'ganado_sin_costo_inicial',
            severidad: 'warning',
            mensaje:
              `No hay inventario inicial de ganado cargado. ${cabezasSinRespaldo} cabezas vendidas se costearon al ` +
              `promedio de las compras registradas (${Math.round(promedioCompras).toLocaleString('es-CO')} por cabeza). ` +
              `Cárgalo en Configuración → Finanzas para que el costo de venta sea exacto.`,
            valor: cabezasSinRespaldo,
            formatoValor: 'unidades',
          }
    );
  }

  return {
    ventas,
    historial,
    cabezasFinales: cabezas,
    valorInventarioFinal: valorInventario,
    costoPromedioFinal: cabezas > 0 ? valorInventario / cabezas : 0,
    cabezasSinRespaldo,
    promedioCompras,
    advertencias,
  };
}

/**
 * Valor del inventario de semovientes a una fecha de corte, según el historial
 * del costeo. Antes de la primera transacción devuelve el inventario inicial.
 */
export function valorInventarioAFecha(
  resultado: ResultadoCosteoGanado,
  hasta: string,
  inventarioInicial: InventarioInicialGanado | null
): { cabezas: number; valor: number } {
  let ultimo: SnapshotInventario | null = null;
  for (const s of resultado.historial) {
    if (s.fecha > hasta) break;
    ultimo = s;
  }
  if (!ultimo) {
    return {
      cabezas: inventarioInicial?.cabezas ?? 0,
      valor: (inventarioInicial?.cabezas ?? 0) * (inventarioInicial?.costoPorCabeza ?? 0),
    };
  }
  return { cabezas: ultimo.cabezas, valor: ultimo.valorInventario };
}

/**
 * Lee el inventario inicial de los parámetros financieros.
 * Devuelve null si falta cualquiera de los dos valores — un inventario a
 * medio configurar se trata como no configurado, no como cero.
 */
export function leerInventarioInicial(
  parametros: { clave: string; valor: number }[]
): InventarioInicialGanado | null {
  const cabezas = parametros.find((p) => p.clave === 'cabezas_inventario_inicial')?.valor;
  const costo = parametros.find((p) => p.clave === 'costo_cabeza_inventario_inicial')?.valor;
  if (cabezas == null || costo == null || cabezas <= 0) return null;
  return { cabezas, costoPorCabeza: costo };
}
