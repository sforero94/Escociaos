/**
 * Líneas del plan en el formulario de movimiento diario — lógica pura (ESCO-171, PRD §4.2).
 *
 * Una línea del plan (`aplicaciones_productos`) puede traer alternativos. Reglas del formulario:
 * - Se ofrece el principal y los alternativos ordenados ALFABÉTICAMENTE, cada uno con su saldo.
 *   No hay sugerencia, ranking ni opción preseleccionada: David escoge a criterio (Santiago,
 *   2026-11-02: «que quede libre porque lo usan a criterio en la finca»).
 * - Un movimiento diario (un lote, un día) registra UN solo producto por línea. Si un lote se
 *   completa con otro producto, va en otro día.
 * - Una línea sin alternativos se comporta exactamente como antes: una fila fija, sin selector.
 */

import { ordenarOpcionesAlfabeticamente } from './stockAplicacion';

export interface OpcionProductoLinea {
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  /** `productos.unidad_medida` (Litros | Kilos | Unidades). */
  producto_unidad: string;
  /** `productos.cantidad_actual`; null = sin dato. */
  saldo: number | null;
  /** Solo fertilización: kg por bulto. */
  presentacion_kg_l?: number;
}

export interface LineaPlanMovimiento {
  linea_id: string;
  principal: OpcionProductoLinea;
  alternativos: OpcionProductoLinea[];
}

export interface FilaLineaMovimiento {
  linea_id?: string;
  /** Producto escogido. Cadena vacía = línea con alternativos donde todavía no se escoge. */
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  cantidad_utilizada: string;
  unidad_producto: string;
  presentacion_kg_l?: number;
  /** Solo en líneas con alternativos: principal + alternativos, en orden alfabético. */
  opciones?: OpcionProductoLinea[];
  /** Nombre del principal del plan, para rotular la línea mientras no hay producto escogido. */
  linea_nombre?: string;
}

/** Principal + alternativos en orden alfabético. Sin alternativos devuelve solo el principal. */
export function opcionesDeLinea(linea: LineaPlanMovimiento): OpcionProductoLinea[] {
  const sinRepetir = new Map<string, OpcionProductoLinea>();
  for (const o of [linea.principal, ...linea.alternativos]) {
    if (!sinRepetir.has(o.producto_id)) sinRepetir.set(o.producto_id, o);
  }
  return ordenarOpcionesAlfabeticamente([...sinRepetir.values()]);
}

const camposDe = (o: OpcionProductoLinea) => ({
  producto_id: o.producto_id,
  producto_nombre: o.producto_nombre,
  producto_categoria: o.producto_categoria,
  unidad_producto: o.producto_unidad,
  presentacion_kg_l: o.presentacion_kg_l,
});

/**
 * Fila del formulario para una línea. Conserva lo ya digitado: la cantidad y, si hay alternativos,
 * el producto ya escogido (se busca por `linea_id`; en borradores viejos, por `producto_id`).
 */
export function construirFilaLinea(linea: LineaPlanMovimiento, previas: readonly FilaLineaMovimiento[]): FilaLineaMovimiento {
  const opciones = opcionesDeLinea(linea);
  const previa = previas.find((p) => p.linea_id === linea.linea_id) ?? previas.find((p) => !p.linea_id && opciones.some((o) => o.producto_id === p.producto_id));
  const cantidad = previa?.cantidad_utilizada ?? '';

  if (opciones.length === 1) {
    return { linea_id: linea.linea_id, ...camposDe(linea.principal), cantidad_utilizada: cantidad };
  }

  const escogida = previa ? opciones.find((o) => o.producto_id === previa.producto_id) : undefined;
  return {
    linea_id: linea.linea_id,
    linea_nombre: linea.principal.producto_nombre,
    opciones,
    cantidad_utilizada: cantidad,
    ...(escogida
      ? camposDe(escogida)
      : {
          producto_id: '',
          producto_nombre: linea.principal.producto_nombre,
          producto_categoria: linea.principal.producto_categoria,
          unidad_producto: linea.principal.producto_unidad,
          presentacion_kg_l: undefined,
        }),
  };
}

/** Cambia el producto escogido de una línea con alternativos. Si el id no es una opción, no hace nada. */
export function seleccionarOpcionLinea(fila: FilaLineaMovimiento, productoId: string): FilaLineaMovimiento {
  const opcion = fila.opciones?.find((o) => o.producto_id === productoId);
  return opcion ? { ...fila, ...camposDe(opcion) } : fila;
}

/**
 * Primer error de selección o null. Cubre lo que el selector ya impide, porque un borrador viejo
 * restaurado o un estado inconsistente no deben llegar al INSERT: dos filas de la misma línea,
 * una línea con alternativos sin producto escogido, o un producto que no es opción de su línea.
 */
export function validarSeleccionLineas(filas: readonly FilaLineaMovimiento[]): string | null {
  const vistas = new Set<string>();
  for (const f of filas) {
    if (f.linea_id) {
      if (vistas.has(f.linea_id)) {
        return `${f.linea_nombre ?? f.producto_nombre}: un movimiento diario solo admite un producto por línea. Si el lote se completa con otro producto, regístralo en otro día.`;
      }
      vistas.add(f.linea_id);
    }
    if (f.opciones && f.opciones.length > 1) {
      if (!f.producto_id) return `Escoge el producto de la línea ${f.linea_nombre ?? f.producto_nombre}.`;
      if (!f.opciones.some((o) => o.producto_id === f.producto_id)) {
        return `${f.producto_nombre} no es una opción de la línea ${f.linea_nombre ?? f.producto_nombre}.`;
      }
    }
  }
  return null;
}
