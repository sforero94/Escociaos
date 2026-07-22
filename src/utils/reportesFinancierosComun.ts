// Piezas compartidas por el P&G y el Flujo de Caja. Lógica pura.

import type {
  AdvertenciaReporte,
  DatosCrudosReportes,
  VistaReporte,
} from '@/types/reportesFinancieros';
import {
  NEGOCIO_AGUACATE,
  NEGOCIO_GANADO,
  NEGOCIO_HATO,
  VISTAS,
} from '@/types/reportesFinancieros';

export interface AlcanceVista {
  /** Negocios cuyos gastos e ingresos entran en el reporte. */
  negocioIds: Set<string>;
  /** ¿Se incluyen las transacciones de `fin_transacciones_ganado`? */
  incluyeGanado: boolean;
  /** ¿Se incluyen los ingresos etiquetados por cosecha de aguacate? */
  incluyeAguacate: boolean;
  nombreVista: string;
  nombrePorNegocio: Map<string, string>;
}

/**
 * Traduce una vista a los negocios que la componen.
 *
 * `global` incluye TODOS los negocios, también los que no tienen vista propia
 * (Oficina Central, Caballos, Agrícola, Finca de Descanso). Decisión del
 * dueño: esos negocios existen solo dentro de Global.
 */
export function resolverAlcance(datos: DatosCrudosReportes, vista: VistaReporte): AlcanceVista {
  const nombrePorNegocio = new Map(datos.negocios.map((n) => [n.id, n.nombre]));
  const idPorNombre = new Map(datos.negocios.map((n) => [n.nombre, n.id]));
  const nombreVista = VISTAS.find((v) => v.key === vista)?.label ?? vista;

  if (vista === 'global') {
    return {
      negocioIds: new Set(datos.negocios.map((n) => n.id)),
      incluyeGanado: true,
      incluyeAguacate: true,
      nombreVista,
      nombrePorNegocio,
    };
  }

  const nombre =
    vista === 'aguacate' ? NEGOCIO_AGUACATE : vista === 'ganado' ? NEGOCIO_GANADO : NEGOCIO_HATO;
  const id = idPorNombre.get(nombre);

  return {
    negocioIds: new Set(id ? [id] : []),
    incluyeGanado: vista === 'ganado',
    incluyeAguacate: vista === 'aguacate',
    nombreVista,
    nombrePorNegocio,
  };
}

export interface DuplicadosGanado {
  ingresosExcluidos: Set<string>;
  gastosExcluidos: Set<string>;
  advertencias: AdvertenciaReporte[];
}

/**
 * Defensa permanente contra el ganado contabilizado dos veces.
 *
 * Hubo tres scripts manuales (`src/sql/cleanup_ganado_duplicates_*.sql`) que
 * borraban de `fin_gastos`/`fin_ingresos` las filas espejo de una transacción
 * de ganado. Hoy la base está limpia (verificado 2026-07-21: 0 coincidencias),
 * pero nada impide que alguien vuelva a registrar una venta de ganado por los
 * dos caminos. Si eso pasa, el reporte lo detecta y lo dice, en vez de duplicar
 * el ingreso en silencio.
 *
 * Criterio de match: misma fecha y diferencia de valor menor a $1.
 */
export function detectarDuplicadosGanado(datos: DatosCrudosReportes): DuplicadosGanado {
  const ingresosExcluidos = new Set<string>();
  const gastosExcluidos = new Set<string>();
  const advertencias: AdvertenciaReporte[] = [];
  let montoDuplicado = 0;

  for (const t of datos.ganado) {
    if (t.tipo === 'venta') {
      for (const i of datos.ingresos) {
        if (i.fecha === t.fecha && Math.abs(i.valor - t.valor_total) < 1 && !ingresosExcluidos.has(i.id)) {
          ingresosExcluidos.add(i.id);
          montoDuplicado += i.valor;
          break;
        }
      }
    } else {
      for (const g of datos.gastos) {
        if (g.fecha === t.fecha && Math.abs(g.valor - t.valor_total) < 1 && !gastosExcluidos.has(g.id)) {
          gastosExcluidos.add(g.id);
          montoDuplicado += g.valor;
          break;
        }
      }
    }
  }

  if (montoDuplicado > 0) {
    advertencias.push({
      codigo: 'ganado_posible_duplicado',
      severidad: 'warning',
      mensaje:
        `Se detectaron ${ingresosExcluidos.size + gastosExcluidos.size} registros en Gastos/Ingresos que coinciden ` +
        `en fecha y valor con transacciones de ganado. Se excluyeron del reporte para no contarlos dos veces.`,
      valor: montoDuplicado,
    });
  }

  return { ingresosExcluidos, gastosExcluidos, advertencias };
}

/** Advertencia por gastos que quedaron fuera del reporte por no estar confirmados. */
export function advertenciaPendientes(total: number, cantidad: number): AdvertenciaReporte | null {
  if (total <= 0) return null;
  return {
    codigo: 'gastos_pendientes',
    severidad: 'info',
    mensaje:
      `${cantidad} ${cantidad === 1 ? 'gasto pendiente' : 'gastos pendientes'} por confirmar no ` +
      `están incluidos en este reporte.`,
    valor: total,
  };
}

/** Suma sin sorpresas de punto flotante acumuladas en las líneas. */
export function redondearPesos(valor: number): number {
  return Math.round(valor);
}
