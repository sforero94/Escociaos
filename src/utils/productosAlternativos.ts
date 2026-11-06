// utils/productosAlternativos.ts
// Lógica pura de los productos alternativos de una línea del plan (ESCO-170, parte F2 de
// ESCO-165; tabla `aplicaciones_productos_alternativos`, migración 189).
//
// Un alternativo es una OPCIÓN, no plan: el principal sigue siendo lo planeado. Nada de
// este archivo toca necesidades, costos ni lista de compras.
//
// La calculadora guarda borrando y reinsertando `aplicaciones_productos`, y la tabla de
// alternativos cuelga de esas líneas con ON DELETE CASCADE. Por eso las filas se
// construyen contra el id NUEVO de cada línea, nunca contra uno guardado.

import type {
  Mezcla,
  ProductoAlternativo,
  ProductoCatalogo,
  TipoAplicacionLocal,
  UnidadMedida,
} from '../types/aplicaciones';

/** Fila a insertar en `aplicaciones_productos_alternativos`. */
export interface InsertAlternativo {
  aplicacion_producto_id: string;
  producto_id: string;
  dosis_por_caneca: number | null;
  unidad_dosis: string | null;
  dosis_grandes: number | null;
  dosis_medianos: number | null;
  dosis_pequenos: number | null;
  dosis_clonales: number | null;
}

/** Fila leída de `aplicaciones_productos_alternativos` con el producto embebido. */
export interface FilaAlternativoBD extends InsertAlternativo {
  productos: { nombre: string; categoria: string; unidad_medida: UnidadMedida } | null;
}

const usaDosisPorCaneca = (tipo: TipoAplicacionLocal | undefined): boolean =>
  tipo === 'fumigacion' || tipo === 'drench';

const CAMPOS_TAMANO = ['dosis_grandes', 'dosis_medianos', 'dosis_pequenos', 'dosis_clonales'] as const;

/** Una dosis sólo se escribe si es > 0: la tabla tiene CHECK (dosis IS NULL OR dosis > 0). */
const dosisONull = (valor: number | undefined): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null;

const nullAUndefined = (valor: number | null): number | undefined => (valor === null ? undefined : valor);

/** Alternativo nuevo con dosis vacía, en la misma forma de dosis que la línea. */
export function crearAlternativo(producto: ProductoCatalogo, porCaneca: boolean): ProductoAlternativo {
  const base = {
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    producto_categoria: producto.categoria,
    producto_unidad: producto.unidad_medida,
  };
  if (porCaneca) {
    return {
      ...base,
      dosis_por_caneca: 0,
      unidad_dosis: producto.estado_fisico === 'liquido' ? 'cc' : 'gramos',
    };
  }
  return { ...base, dosis_grandes: 0, dosis_medianos: 0, dosis_pequenos: 0, dosis_clonales: 0 };
}

/**
 * Devuelve el primer error de alternativos, o null si todo es válido. Reglas: un
 * alternativo no puede ser el principal de su línea ni repetirse en la misma línea, y
 * debe tener dosis (> 0, ninguna negativa) en la forma de la línea.
 */
export function validarAlternativos(mezclas: Mezcla[], tipo: TipoAplicacionLocal | undefined): string | null {
  const porCaneca = usaDosisPorCaneca(tipo);
  for (const mezcla of mezclas) {
    for (const linea of mezcla.productos) {
      const vistos = new Set<string>();
      for (const alt of linea.alternativos ?? []) {
        if (alt.producto_id === linea.producto_id) {
          return `${linea.producto_nombre}: un alternativo no puede ser el mismo producto principal.`;
        }
        if (vistos.has(alt.producto_id)) {
          return `${linea.producto_nombre}: el alternativo ${alt.producto_nombre} está repetido.`;
        }
        vistos.add(alt.producto_id);

        if (porCaneca) {
          if (!alt.dosis_por_caneca || alt.dosis_por_caneca <= 0) {
            return `${linea.producto_nombre}: el alternativo ${alt.producto_nombre} necesita dosis por caneca.`;
          }
        } else {
          const valores = CAMPOS_TAMANO.map((c) => alt[c] ?? 0);
          if (valores.some((v) => v < 0) || !valores.some((v) => v > 0)) {
            return `${linea.producto_nombre}: el alternativo ${alt.producto_nombre} necesita al menos una dosis por tamaño mayor que 0.`;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Construye las filas de alternativos de UNA mezcla contra las líneas recién insertadas.
 * Empareja por `producto_id` del principal (la mezcla no admite un producto dos veces,
 * ver `agregarProducto` en PasoMezcla.tsx). Si una línea con alternativos no volvió del
 * INSERT, lanza: escribir sus alternativos en otra línea sería peor que no guardar.
 */
export function construirFilasAlternativos(
  productos: Mezcla['productos'],
  lineasInsertadas: { id: string; producto_id: string }[],
  tipo: TipoAplicacionLocal | undefined,
): InsertAlternativo[] {
  const porCaneca = usaDosisPorCaneca(tipo);
  const filas: InsertAlternativo[] = [];

  for (const linea of productos) {
    const alternativos = linea.alternativos ?? [];
    if (alternativos.length === 0) continue;

    const coincidencias = lineasInsertadas.filter((l) => l.producto_id === linea.producto_id);
    if (coincidencias.length !== 1) {
      throw new Error(
        `No se pudo ubicar la línea guardada de ${linea.producto_nombre} para guardar sus alternativos.`,
      );
    }
    const aplicacionProductoId = coincidencias[0].id;

    for (const alt of alternativos) {
      filas.push({
        aplicacion_producto_id: aplicacionProductoId,
        producto_id: alt.producto_id,
        dosis_por_caneca: porCaneca ? dosisONull(alt.dosis_por_caneca) : null,
        unidad_dosis: porCaneca ? (alt.unidad_dosis ?? null) : null,
        dosis_grandes: porCaneca ? null : dosisONull(alt.dosis_grandes),
        dosis_medianos: porCaneca ? null : dosisONull(alt.dosis_medianos),
        dosis_pequenos: porCaneca ? null : dosisONull(alt.dosis_pequenos),
        dosis_clonales: porCaneca ? null : dosisONull(alt.dosis_clonales),
      });
    }
  }
  return filas;
}

/** Rehidrata los alternativos guardados, agrupados por id de línea (`aplicaciones_productos.id`). */
export function agruparAlternativosPorLinea(filas: FilaAlternativoBD[]): Map<string, ProductoAlternativo[]> {
  const mapa = new Map<string, ProductoAlternativo[]>();
  for (const fila of filas) {
    const alt: ProductoAlternativo = {
      producto_id: fila.producto_id,
      producto_nombre: fila.productos?.nombre ?? 'Producto sin nombre',
      producto_categoria: fila.productos?.categoria ?? '',
      producto_unidad: fila.productos?.unidad_medida ?? 'Unidades',
      dosis_por_caneca: nullAUndefined(fila.dosis_por_caneca),
      unidad_dosis:
        fila.unidad_dosis === 'cc' || fila.unidad_dosis === 'gramos' ? fila.unidad_dosis : undefined,
      dosis_grandes: nullAUndefined(fila.dosis_grandes),
      dosis_medianos: nullAUndefined(fila.dosis_medianos),
      dosis_pequenos: nullAUndefined(fila.dosis_pequenos),
      dosis_clonales: nullAUndefined(fila.dosis_clonales),
    };
    const lista = mapa.get(fila.aplicacion_producto_id);
    if (lista) lista.push(alt);
    else mapa.set(fila.aplicacion_producto_id, [alt]);
  }
  return mapa;
}
