// ARCHIVO: src/supabase/functions/server/rondaInventario/alcanceTxt.ts
// GENERADO por docs/inventario/regenerar-copias-ronda-inventario.py -- NUNCA
// edites este archivo a mano. Editá `src/utils/rondaInventario/alcanceTxt.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el pipeline de voz de la ronda de
// inventario (`ronda-voz-pipeline.ts`, `ronda-inventario-tick.ts` -- de una
// fase posterior) corre en el árbol de despliegue de la edge function y no
// puede importar desde `src/utils/` -- cruzaría la frontera del árbol de
// despliegue de Deno. Misma restricción que ya produjo `calculos-hato.ts`,
// `priorizacion-scouting.ts` y `importHato/*`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `./xxx` -> `./xxx.ts`).
// `src/__tests__/rondaInventarioParidadServidor.test.ts` corre este mismo
// script en modo `--check` y falla si alguien hand-editó una copia en vez de
// regenerarla.

// ARCHIVO: utils/rondaInventario/alcanceTxt.ts
// DESCRIPCIÓN: El archivo del alcance completo que se manda por Telegram al
// abrir una ronda -- Fase 3 (Telegram, Uriel), §7.2 del brief técnico: "El
// alcance completo, al abrir -- replyWithDocument con las líneas de
// rondas_inventario_alcance de la ronda recién abierta (producto + cantidad
// + unidad, sin precio)". Es el reemplazo literal de la hoja impresa del
// Sheet de David (§3.4/A-2 del brief de producto): Uriel lo scrollea sin
// necesitar señal.
//
// Formato Markdown en tabla, agrupado por categoría -- pedido de Santiago
// probando en vivo en producción (2026-08-28): "en la bodega los
// agroquímicos están en un lado, la herramienta en otro, y los fertilizantes
// en otro". El nombre del archivo (`alcanceTxt.ts`) quedó desactualizado a
// propósito -- no vale la pena el churn de renombrarlo (y actualizar el
// generador + los imports) por un mismatch cosmético; lo que importa es el
// nombre de la función exportada, `construirAlcanceMd`.
//
// R-15/CA-13: NUNCA precio ni valor. `FilaAlcanceMd` (el tipo de entrada de
// este módulo) directamente no tiene ninguna propiedad de precio -- no hay
// forma de que se cuele por accidente (mismo criterio D-T8 que
// `preview.ts`/`interpretarNota.ts`: la ausencia en el TIPO es la garantía,
// no una revisión a ojo).
//
// Puro, cero I/O: el llamador (el handler de Telegram, Deno-side) lee
// `rondas_inventario_alcance` + `productos.categoria` y arma el arreglo de
// entrada; este módulo sólo da forma al texto.

/** Formato colombiano de cantidades -- MISMO criterio y misma
 * reimplementación local que `preview.ts::formatearCantidad` (este módulo
 * también se espeja a los dos árboles de edge function y no puede importar
 * `@/utils/format`, precedente `acciones-hechos.ts`). Se reimplementa acá en
 * vez de importar de `./preview` para que `alcanceTxt.ts` no dependa de un
 * módulo cuya razón de existir es el ciclo de preview de la nota de voz --
 * son dos conceptos distintos que hoy comparten formato por coincidencia,
 * no por acoplamiento. */
function formatearCantidadAlcance(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 1;
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** `periodo` es 'AAAA-MM-01' (primer día del mes que cubre la ronda, R-5) --
 * nunca se parsea con `new Date(...)` (desfase de zona horaria, la trampa
 * documentada en el CLAUDE.md raíz): se parte el string a mano. */
function nombrePeriodo(periodoIso: string): string {
  const partes = periodoIso.split('-');
  const mesIdx = Number(partes[1]) - 1;
  const mes = MESES[mesIdx] ?? partes[1] ?? periodoIso;
  return `${mes} ${partes[0] ?? ''}`.trim();
}

// ---------------------------------------------------------------------------
// Orden de categorías -- agrupa las 18 categorías reales de
// `productos.categoria` (ENUM) en el mismo orden en que Santiago recorre la
// bodega: fertilizantes/enmiendas primero, agroquímicos (fungicidas,
// insecticidas, herbicidas, biológicos, etc.) después, herramienta/equipo al
// final antes de "Otros". La tabla queda PLANA -- una fila por producto, con
// la categoría como columna, tal como se pidió -- pero el orden hace que las
// tres zonas físicas queden juntas al scrollear, sin necesitar subtítulos.
// Una categoría nueva que el catálogo agregue después (no está en esta
// lista) cae al final, antes de "Otros" no -- después de todo lo conocido --
// nunca se pierde ni rompe el ordenamiento.
// ---------------------------------------------------------------------------

const ORDEN_CATEGORIA: readonly string[] = [
  'Fertilizante', 'Enmienda', 'Enmienda - regulador',
  'Fungicida', 'Insecticida', 'Insecticida - Acaricida', 'Acaricida', 'Herbicida',
  'Biocontrolador', 'Biológicos', 'Coadyuvante', 'Regulador', 'Fitorregulador', 'Desinfectante',
  'Herramienta', 'Equipo', 'Maquinaria',
  'Otros',
];

function rangoCategoria(categoria: string): number {
  const idx = ORDEN_CATEGORIA.indexOf(categoria);
  return idx === -1 ? ORDEN_CATEGORIA.length : idx;
}

/** Una celda de tabla Markdown no puede llevar un `|` literal sin escapar --
 * ningún nombre de producto/categoría del catálogo real lo tiene hoy, pero
 * un dato de bodega es texto libre y algún día podría; mejor una `-` rara
 * que una tabla rota. */
function escaparCeldaMd(valor: string): string {
  return valor.replace(/\|/g, '-');
}

export interface FilaAlcanceMd {
  categoria: string;
  nombre: string;
  cantidad: number;
  unidad: string;
}

/**
 * Arma el `.md` completo del alcance: cabecera con el período y el conteo de
 * productos, y una tabla con columnas Categoría / Insumo / Cantidad en
 * sistema / Unidad -- ordenada por categoría (agrupando las tres zonas de la
 * bodega) y, dentro de cada categoría, alfabéticamente por nombre. Nunca
 * lanza ante un alcance vacío: lo dice explícito ("0 producto(s)"), en vez
 * de un archivo silenciosamente en blanco que Uriel no sabría interpretar.
 */
export function construirAlcanceMd(periodo: string, filas: readonly FilaAlcanceMd[]): string {
  const ordenadas = [...filas].sort((a, b) => {
    const porCategoria = rangoCategoria(a.categoria) - rangoCategoria(b.categoria);
    return porCategoria !== 0 ? porCategoria : a.nombre.localeCompare(b.nombre, 'es');
  });

  const lineas = [
    `# Alcance de la ronda de ${nombrePeriodo(periodo)}`,
    '',
    `${ordenadas.length} producto(s) con existencia.`,
    '',
    '| Categoría | Insumo | Cantidad en sistema | Unidad |',
    '|---|---|---|---|',
    ...ordenadas.map(
      (f) =>
        `| ${escaparCeldaMd(f.categoria)} | ${escaparCeldaMd(f.nombre)} | ${formatearCantidadAlcance(f.cantidad)} | ${escaparCeldaMd(f.unidad)} |`,
    ),
  ];

  return lineas.join('\n');
}
