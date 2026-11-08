/**
 * Cobertura de las líneas con productos alternativos de una aplicación — armado puro (ESCO-171).
 *
 * Recibe las filas ya leídas de la base y devuelve, por cada línea que tiene alternativos, el
 * resultado de `calcularCoberturaLinea` (fórmulas del PRD §5 en `stockAplicacion.ts`). Una línea
 * SIN alternativos no aparece: se comporta como siempre.
 *
 * Qué es de qué, porque es fácil confundirlo (ver el CLAUDE.md del módulo):
 * - El plan real de una mezcla vive en `aplicaciones_calculos` (`numero_canecas`/`numero_bultos`,
 *   mapeo mezcla↔lote en `mezcla_id`), NUNCA en `aplicaciones_lotes_planificado`, que está vacía.
 * - Lo registrado se atribuye a la mezcla del lote del movimiento: un mismo producto puede estar
 *   en dos mezclas y no debe contarse dos veces.
 */

import {
  calcularCoberturaLinea,
  requerimientoDeLinea,
  type DosisProducto,
  type OpcionCobertura,
  type ResultadoCoberturaLinea,
} from './stockAplicacion';

export interface FilaLineaPlan extends DosisProducto {
  id: string;
  mezcla_id: string;
  producto_id: string;
  producto_nombre: string;
  cantidad_total_necesaria: number | null;
}

export interface FilaAlternativoPlan extends DosisProducto {
  aplicacion_producto_id: string;
  producto_id: string;
  producto_nombre: string;
}

export interface FilaCalculoPlan {
  mezcla_id: string | null;
  lote_id: string;
  numero_canecas: number | null;
  numero_bultos: number | null;
}

export interface FilaArbolesLote {
  lote_id: string;
  arboles_grandes: number | null;
  arboles_medianos: number | null;
  arboles_pequenos: number | null;
  arboles_clonales: number | null;
}

/** Lo registrado en un movimiento diario, ya en L / kg. */
export interface RegistroConsumo {
  lote_id: string;
  producto_id: string;
  cantidad_base: number;
}

export interface DatosCoberturaAplicacion {
  /** `aplicaciones.tipo_aplicacion` tal como está en la base ('Fumigación' | 'Fertilización' | 'Drench'). */
  tipoAplicacion: string;
  lineas: FilaLineaPlan[];
  alternativos: FilaAlternativoPlan[];
  calculos: FilaCalculoPlan[];
  arbolesPorLote: FilaArbolesLote[];
  /** `productos.cantidad_actual` por producto; ausente o null = sin dato. */
  saldos: ReadonlyMap<string, number | null>;
  consumos: RegistroConsumo[];
}

export interface CoberturaAplicacion {
  lineas: ResultadoCoberturaLinea[];
  /** Ids de `aplicaciones_productos` que tienen alternativos (también las no calculables). */
  idsLineasConAlternativos: Set<string>;
  /**
   * Productos (principal y alternativos) de esas líneas. Su consumo NO se compara producto por
   * producto contra el plan: el plan repite la misma necesidad bajo cada uno y lo realmente usado
   * puede ser un alternativo (PRD §4.5: «solo registro, nada de comparar»).
   */
  productosEnLineasConAlternativos: Set<string>;
}

export function armarCoberturaAplicacion(d: DatosCoberturaAplicacion): CoberturaAplicacion {
  const alternativosPorLinea = new Map<string, FilaAlternativoPlan[]>();
  for (const alt of d.alternativos) {
    const lista = alternativosPorLinea.get(alt.aplicacion_producto_id) ?? [];
    lista.push(alt);
    alternativosPorLinea.set(alt.aplicacion_producto_id, lista);
  }

  const idsLineasConAlternativos = new Set(
    d.lineas.filter((l) => (alternativosPorLinea.get(l.id)?.length ?? 0) > 0).map((l) => l.id),
  );
  const productosEnLineasConAlternativos = new Set<string>();
  for (const linea of d.lineas) {
    const alts = alternativosPorLinea.get(linea.id);
    if (!alts || alts.length === 0) continue;
    productosEnLineasConAlternativos.add(linea.producto_id);
    alts.forEach((a) => productosEnLineasConAlternativos.add(a.producto_id));
  }
  if (idsLineasConAlternativos.size === 0) {
    return { lineas: [], idsLineasConAlternativos, productosEnLineasConAlternativos };
  }

  const porCaneca = d.tipoAplicacion !== 'Fertilización';
  const mezclasDelPlan = new Set(d.lineas.map((l) => l.mezcla_id));
  const unicaMezcla = mezclasDelPlan.size === 1 ? [...mezclasDelPlan][0] : null;

  // lote → mezcla. Con una sola mezcla el mapeo es estructural aunque `mezcla_id` venga NULL
  // (aplicaciones viejas); con varias, un cálculo sin `mezcla_id` no se adivina.
  const mezclaDeLote = new Map<string, string>();
  for (const c of d.calculos) {
    const mezcla = c.mezcla_id ?? unicaMezcla;
    if (mezcla) mezclaDeLote.set(c.lote_id, mezcla);
  }
  const arbolesDeLote = new Map(d.arbolesPorLote.map((a) => [a.lote_id, a]));

  const resultados: ResultadoCoberturaLinea[] = [];

  for (const linea of d.lineas) {
    const alternativos = alternativosPorLinea.get(linea.id);
    if (!alternativos || alternativos.length === 0) continue;

    const calculosMezcla = d.calculos.filter((c) => (c.mezcla_id ?? unicaMezcla) === linea.mezcla_id);
    const unidadesPlaneadas = calculosMezcla.reduce(
      (suma, c) => suma + ((porCaneca ? c.numero_canecas : c.numero_bultos) ?? 0),
      0,
    );
    // Sin plan guardado para la mezcla no hay con qué medir: sin dato, nunca un aviso inventado.
    if (!(unidadesPlaneadas > 0)) continue;

    const arboles = { grandes: 0, medianos: 0, pequenos: 0, clonales: 0 };
    for (const c of calculosMezcla) {
      const a = arbolesDeLote.get(c.lote_id);
      if (!a) continue;
      arboles.grandes += a.arboles_grandes ?? 0;
      arboles.medianos += a.arboles_medianos ?? 0;
      arboles.pequenos += a.arboles_pequenos ?? 0;
      arboles.clonales += a.arboles_clonales ?? 0;
    }
    const base = { canecas: unidadesPlaneadas, arboles };

    const registradoDe = (productoId: string): number =>
      d.consumos
        .filter((r) => r.producto_id === productoId && mezclaDeLote.get(r.lote_id) === linea.mezcla_id)
        .reduce((suma, r) => suma + r.cantidad_base, 0);

    const opciones: OpcionCobertura[] = [
      {
        producto_id: linea.producto_id,
        producto_nombre: linea.producto_nombre,
        // El principal usa el total guardado en el plan, no una cifra recalculada.
        requerimiento: linea.cantidad_total_necesaria ?? 0,
        saldo: d.saldos.get(linea.producto_id) ?? null,
        registrado: registradoDe(linea.producto_id),
      },
      ...alternativos.map((alt) => ({
        producto_id: alt.producto_id,
        producto_nombre: alt.producto_nombre,
        requerimiento: requerimientoDeLinea(porCaneca, alt, base),
        saldo: d.saldos.get(alt.producto_id) ?? null,
        registrado: registradoDe(alt.producto_id),
      })),
    ];

    resultados.push(
      calcularCoberturaLinea({
        linea_id: linea.id,
        unidad: porCaneca ? 'canecas' : 'bultos',
        unidadesPlaneadas,
        opciones,
        nombre: linea.producto_nombre,
      }),
    );
  }

  return { lineas: resultados, idsLineasConAlternativos, productosEnLineasConAlternativos };
}

/** Texto del aviso de una línea que no alcanza. Una sola redacción para el modal y el tablero. */
export function describirFaltanteCobertura(r: ResultadoCoberturaLinea, formatear: (n: number) => string): string {
  const base =
    `${r.nombre} (y sus alternativos): quedan por hacer ${formatear(r.pendientes)} ${r.unidad} ` +
    `y la bodega cubre ${formatear(r.cobertura)}; faltan ${formatear(r.faltan)} ${r.unidad}.`;
  const sinSaldo = r.productosSinSaldo.length > 0 ? ` Sin saldo conocido: ${r.productosSinSaldo.join(', ')}.` : '';
  return base + sinSaldo;
}
