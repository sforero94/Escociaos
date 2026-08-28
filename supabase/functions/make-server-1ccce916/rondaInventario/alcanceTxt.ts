// ARCHIVO: supabase/functions/make-server-1ccce916/rondaInventario/alcanceTxt.ts
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
// DESCRIPCIÓN: El `.txt` del alcance que se manda por Telegram al abrir una
// ronda -- Fase 3 (Telegram, Uriel), §7.2 del brief técnico: "El alcance
// completo, al abrir -- replyWithDocument con las líneas de
// rondas_inventario_alcance de la ronda recién abierta (producto + cantidad
// + unidad, sin precio). Es el reemplazo literal de la hoja impresa del
// Sheet de David (§3.4/A-2 del brief de producto): Uriel lo scrollea sin
// necesitar señal".
//
// R-15/CA-13: NUNCA precio ni valor. `FilaAlcanceTxt` (el tipo de entrada de
// este módulo) directamente no tiene ninguna propiedad de precio -- no hay
// forma de que se cuele por accidente (mismo criterio D-T8 que
// `preview.ts`/`interpretarNota.ts`: la ausencia en el TIPO es la garantía,
// no una revisión a ojo).
//
// Puro, cero I/O: el llamador (el handler de Telegram, Deno-side) lee
// `rondas_inventario_alcance` y arma el arreglo de entrada; este módulo sólo
// da forma al texto.

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

export interface FilaAlcanceTxt {
  nombre: string;
  cantidad: number;
  unidad: string;
}

/**
 * Arma el texto completo del `.txt` de alcance: cabecera con el período y el
 * conteo de productos, una línea por producto (nombre: cantidad unidad),
 * ordenadas alfabéticamente por nombre -- sin importar el orden en que
 * llegaron (el llamador lee de una consulta que puede o no venir ordenada).
 * Nunca lanza ante un alcance vacío: lo dice explícito ("0 productos"), en
 * vez de un archivo silenciosamente en blanco que Uriel no sabría
 * interpretar.
 */
export function construirTextoAlcanceTxt(periodo: string, filas: readonly FilaAlcanceTxt[]): string {
  const ordenadas = [...filas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const lineas = [
    `Alcance de la ronda de ${nombrePeriodo(periodo)} -- ${ordenadas.length} producto(s) con existencia`,
    '',
    ...ordenadas.map((f) => `${f.nombre}: ${formatearCantidadAlcance(f.cantidad)} ${f.unidad}`),
  ];

  return lineas.join('\n');
}
