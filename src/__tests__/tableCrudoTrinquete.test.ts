import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Trinquete de la migración a `ui/table.tsx` (docs/sistema-visual.md §3-ter, paso 3).
 *
 * `src/components/ui/table.tsx` es el recurso tabla compartido. Migrar las ~43 tablas escritas a
 * mano es un proyecto (paso 4, "el resto, cuando se toquen por otra razón"); esta guarda es el
 * paso 3: **impedir que el número crezca** mientras esa migración avanza a su ritmo.
 *
 * Dos reglas, no una:
 *
 *  1. Un archivo con `<table>` crudo que NO está en `DEUDA_TABLA_CRUDA` (abajo) → falla. Sin
 *     esto, cualquiera podría escribir una tabla nueva a mano y nada lo detendría.
 *  2. Un archivo que SÍ está en `DEUDA_TABLA_CRUDA` pero YA NO tiene `<table>` crudo → también
 *     falla, pidiendo sacarlo de la lista. **Esta es la regla que convierte la lista en un
 *     trinquete de verdad.** Sin ella, la lista es de solo-agregar: cada vez que alguien migra un
 *     archivo, la lista sigue mencionándolo, dejó de reflejar la realidad, y con el tiempo nadie
 *     la mira -- exactamente el defecto de las 4 guardas de inventario congelado que F1 retiró
 *     (verificaban pertenencia a una lista que el mundo dejó atrás). Aquí la lista solo puede
 *     encoger porque CUALQUIER cambio en cualquier dirección -- agregar deuda nueva sin marcarla,
 *     o dejar una entrada obsoleta -- tira este archivo a rojo. Migrar una tabla y no tocar esta
 *     lista es imposible sin que el test lo grite.
 *
 * Qué SÍ cubre: un `<table` HTML literal (minúscula, la etiqueta real) en cualquier `.ts`/`.tsx`
 * bajo `src/`, ignorando comentarios de bloque (`/* … *\/`, incluyendo los comentarios JSX
 * `{/* … *\/}`, que usan la misma sintaxis por dentro) para no marcar en falso un comentario que
 * solo MENCIONA `<table>` -- ver el caso real de `PresupuestoTable.tsx` más abajo. No distingue
 * si el archivo también usa piezas del primitivo (`TableHeader`/`TableRow`/…) junto al `<table>`
 * crudo -- ver el caso de `MapaCalorIncidencias.tsx` más abajo, que hace exactamente eso.
 *
 * Qué NO cubre (límites explícitos, para no generar falsa confianza):
 *  - **Comentarios de línea** (`// …`). Ninguno de los ~43 archivos de deuda de hoy produce ese
 *    falso positivo (verificado con grep antes de escribir esta guarda), pero un `<table` dentro
 *    de un comentario `//` pasaría como si fuera código real -- no se detectaría como excepción,
 *    solo se sumaría de más a la deuda si el archivo no estuviera ya declarado. Es un fallo hacia
 *    el lado seguro (sobre-reporta, nunca deja pasar deuda real sin marcar), pero no es perfecto.
 *  - **Una tabla construida dinámicamente** -- `React.createElement('table', …)`, un nombre de
 *    tag armado en una variable (`const Tag = 'table'; <Tag />`), o un `dangerouslySetInnerHTML`
 *    con una cadena `'<table>...'`. Ninguno de esos escribe el texto literal `<table` seguido de
 *    espacio/`>` en el código fuente, así que esta guarda no los ve.
 *  - **Una tabla hecha con `<div>`s** que imita visualmente una tabla (grid CSS, roles ARIA
 *    `role="table"/"row"/"cell"`). Esta guarda busca la etiqueta HTML `<table>`, no el patrón
 *    visual -- una tabla-con-divs nunca aparecería aquí ni como deuda ni como violación.
 *  - **Archivos fuera de `src/`** -- la copia gemela de la función de borde
 *    `supabase/functions/make-server-1ccce916/generar-reporte-semanal.tsx` vive fuera de `src/`
 *    y nunca se recorre (igual que el resto de las guardas de este directorio, que están
 *    ancladas en `src/`).
 *
 * Directorios excluidos del barrido, y por qué:
 *  - `src/components/ui/table.tsx` -- es el primitivo mismo, no deuda. Se excluye por ruta
 *    exacta, no listándolo (nunca podría "migrar a sí mismo").
 *  - `src/__tests__/` -- mismo criterio que ya usa `dialogRawSizingGuard.test.ts`. El único
 *    archivo de este directorio con `<table` real es `uiTableCanonico.test.tsx`, que envuelve
 *    `TableHead`/`TableCell` en un `<table>/<thead>/<tbody>` a mano a propósito, para poder
 *    probar esas piezas AISLADAS del wrapper `<Table>` (ver el docstring de ese archivo) -- es
 *    infraestructura de prueba del propio primitivo, no una pantalla de la app con deuda visual.
 *  - `src/supabase/` -- el árbol de la función de borde (Deno). Ya está fuera de `npm run lint`
 *    (`eslint.config.js` → `ignores`) y de `tsconfig` de la app. Su único consumidor de `<table`,
 *    `generar-reporte-semanal.tsx`, arma HTML como texto plano dentro de un template string para
 *    un correo/reporte -- no es JSX que React renderiza, es exactamente el caso que el enunciado
 *    de esta tarea señala como "no la misma clase de problema" (un generador de HTML para
 *    PDF/correo). Migrarlo a `ui/table.tsx` no tendría sentido: ese recurso es un componente
 *    React, y este código nunca corre en un árbol de React.
 *
 * Caso real que prueba que el guardián de comentarios funciona:
 * `PresupuestoTable.tsx` fue migrado en esta misma ronda de trabajo pero conserva, en un
 * comentario, la frase `` `<table>` original `` explicando la migración -- sin el guardián de
 * comentarios, esta guarda lo marcaría como deuda que nunca existió como código.
 *
 * Caso real que prueba que la regla 2 tiene mordida: `MapaCalorIncidencias.tsx` fue una de las
 * tres migraciones que motivaron esta tarea, y SIGUE en `DEUDA_TABLA_CRUDA` -- reutiliza
 * `TableHeader`/`TableRow`/`TableHead`/`TableBody` pero mantiene un `<table>` raíz escrito a mano
 * porque necesita encabezado pegado en scroll VERTICAL además de columna congelada en scroll
 * horizontal, y `ui/table.tsx` hoy solo resuelve el eje horizontal (ver el comentario en esa
 * pantalla, línima ~516). El día que el primitivo gane esa variante y el `<table>` a mano
 * desaparezca de ese archivo, la regla 2 de ESTA guarda obliga a sacarlo de la lista -- no queda
 * como cadáver.
 */

const SRC = join(__dirname, '..');
const UI_TABLE_REL = 'components/ui/table.tsx';

/**
 * Deuda declarada. Alfabético (para que el diff de esta lista sea legible) y sin duplicados --
 * ambas propiedades las verifica un test más abajo, no solo esta nota.
 *
 * Agregar una entrada aquí declara deuda NUEVA a sabiendas -- no es la vía para silenciar una
 * violación real de la regla 1 sin haber decidido conscientemente que ese archivo la necesita.
 * Sacar una entrada de aquí sin haber quitado el `<table>` crudo del archivo hace fallar la
 * regla 1 en su lugar (deuda real, sin declarar). Las únicas dos formas de tocar esta lista sin
 * romper el test son: declarar debidamente un `<table>` crudo nuevo, o migrar un archivo y
 * borrar su entrada en el mismo cambio.
 */
const DEUDA_TABLA_CRUDA: readonly string[] = [
  'components/configuracion/TelegramConfig.tsx',
  'components/configuracion/UsuariosConfig.tsx',
  'components/finanzas/components/GastosBatchTable.tsx',
  'components/finanzas/components/IngresosBatchTable.tsx',
  'components/finanzas/dashboard/components/DetalleGastosExpandible.tsx',
  'components/finanzas/dashboard/components/PivotTableGastos.tsx',
  'components/finanzas/reportes/TablaFlujoCaja.tsx',
  'components/finanzas/reportes/TablaPyG.tsx',
  'components/ganado/components/AjusteMasivoDialog.tsx',
  'components/ganado/components/InventarioInicialDialog.tsx',
  'components/hato/AnimalesList.tsx',
  'components/hato/ChequeoDetalle.tsx',
  'components/hato/ChequeosList.tsx',
  'components/hato/HojaDeVida.tsx',
  'components/hato/PajillasView.tsx',
  'components/hato/components/ChequeoDiffReview.tsx',
  'components/hato/components/ProduccionQuincenalDialog.tsx',
  'components/hato/components/RankingVacas.tsx',
  'components/hato/components/RevisionPesajeFoto.tsx',
  'components/inventory/InventoryList.tsx',
  'components/inventory/PurchaseHistory.tsx',
  'components/inventory/dashboard/components/ConsumoAplicacionesTable.tsx',
  'components/inventory/dashboard/components/InversionPorLoteSection.tsx',
  'components/inventory/dashboard/components/PivotCategoriaTable.tsx',
  'components/monitoreo/CatalogoPlagas.tsx',
  'components/monitoreo/DashboardMonitoreoV3.tsx',
  // Deliberado, no descuido: ver "Caso real que prueba que la regla 2 tiene mordida" arriba.
  'components/monitoreo/MapaCalorIncidencias.tsx',
  'components/monitoreo/RegistroConductividad.tsx',
  'components/monitoreo/TablaMonitoreos.tsx',
  'components/monitoreo/tablas/TablaColmenas.tsx',
  'components/monitoreo/tablas/TablaConductividad.tsx',
  'components/produccion/components/CapturaCosechaGrid.tsx',
  'components/produccion/components/RentabilidadTab.tsx',
  'components/shared/JornalFractionMatrix.tsx',
];

/** Vacía comentarios de bloque `/* … *\/` preservando saltos de línea (para que los números de
 * línea de cualquier fallo futuro que se agregue sigan siendo correctos), igual que
 * `globalsCssTailwindCollisionGuard.test.ts` hace para `globals.css`. Cubre también los
 * comentarios JSX `{/* … *\/}`, que son `/* … *\/` con llaves alrededor -- no una sintaxis
 * distinta. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

/** `<table` real: exige que lo siguiente sea espacio/salto de línea/`>` -- así no confunde un
 * hipotético `<table-legacy>` (otra etiqueta) con la etiqueta HTML `<table>`, y nunca coincide
 * con `<Table` (el componente, mayúscula) ni con `<TableHead`/`<TableBody`/etc. */
const RAW_TABLE_TAG = /<table(?=[\s\n>])/;

function hasRawTable(source: string): boolean {
  return RAW_TABLE_TAG.test(stripBlockComments(source));
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'supabase') continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function toRel(full: string): string {
  return relative(SRC, full).replace(/\\/g, '/');
}

/** Lee el estado real del repo a un mapa ruta-relativa → contenido, excluyendo el primitivo
 * mismo por ruta exacta (nunca se le exige "migrarse a sí mismo"). */
function loadRealFileSources(): Map<string, string> {
  const files = collectSourceFiles(SRC).filter((f) => toRel(f) !== UI_TABLE_REL);
  const map = new Map<string, string>();
  for (const f of files) {
    map.set(toRel(f), readFileSync(f, 'utf-8'));
  }
  return map;
}

/** Regla 1: todo archivo con `<table>` crudo que no esté en `declared` es un ofensor. Ordenado
 * para que un mensaje de fallo sea determinístico. */
function findRule1Offenders(
  fileSources: ReadonlyMap<string, string>,
  declared: ReadonlySet<string>,
): string[] {
  const offenders: string[] = [];
  for (const [rel, source] of fileSources) {
    if (declared.has(rel)) continue;
    if (hasRawTable(source)) offenders.push(rel);
  }
  return offenders.sort();
}

/** Regla 2: toda entrada declarada cuyo archivo ya no tiene `<table>` crudo (o ya no existe) es
 * una entrada obsoleta que hay que sacar de la lista. */
function findRule2Stale(
  declared: readonly string[],
  fileSources: ReadonlyMap<string, string>,
): string[] {
  const stale: string[] = [];
  for (const rel of declared) {
    const source = fileSources.get(rel);
    if (source === undefined || !hasRawTable(source)) stale.push(rel);
  }
  return stale;
}

function formatRule1Message(offenders: string[]): string {
  return (
    `${offenders.length} archivo(s) escriben <table> a mano y NO están declarados en ` +
    `DEUDA_TABLA_CRUDA (src/__tests__/tableCrudoTrinquete.test.ts):\n\n` +
    offenders
      .map(
        (rel) =>
          `  ${rel}\n` +
          `    Qué hacer: usa el recurso tabla compartido -- <Table>/<TableHeader>/<TableBody>/\n` +
          `    <TableRow>/<TableHead>/<TableCell> de "@/components/ui/table"\n` +
          `    (docs/sistema-visual.md §3-ter). Mira\n` +
          `    src/components/clima/components/ClimaPeriodosTable.tsx como ejemplo de una\n` +
          `    migración limpia (tabla-lista simple) ya hecha en este repo.\n` +
          `    Si de verdad no puedes usar <Table> (por ejemplo necesitas encabezado pegado en\n` +
          `    scroll VERTICAL además de columna congelada, que el primitivo hoy no resuelve --\n` +
          `    ver el comentario en MapaCalorIncidencias.tsx), agrega "${rel}" a\n` +
          `    DEUDA_TABLA_CRUDA en vez de silenciar este test de otra forma.`,
      )
      .join('\n\n')
  );
}

function formatRule2Message(stale: string[]): string {
  return (
    `${stale.length} archivo(s) están en DEUDA_TABLA_CRUDA pero ya NO tienen <table> crudo (o ` +
    `ya no existen) -- sácalos de la lista:\n\n` +
    stale.map((rel) => `  ${rel}`).join('\n') +
    `\n\nPor qué esto es un fallo y no un aviso: la lista de deuda solo sirve si SOLO puede ` +
    `encoger. Una entrada que se queda después de migrar su archivo hace que la lista deje de ` +
    `reflejar la realidad -- el mismo defecto de las 4 guardas de inventario congelado que F1 ` +
    `retiró.`
  );
}

describe('trinquete: <table> crudo solo se permite si está declarado en DEUDA_TABLA_CRUDA', () => {
  describe('la lista declarada en sí', () => {
    it('está ordenada alfabéticamente (para que su diff sea legible)', () => {
      expect(DEUDA_TABLA_CRUDA).toEqual([...DEUDA_TABLA_CRUDA].sort());
    });

    it('no tiene duplicados', () => {
      expect(new Set(DEUDA_TABLA_CRUDA).size).toBe(DEUDA_TABLA_CRUDA.length);
    });

    it('nunca declara el primitivo mismo (ui/table.tsx) como deuda', () => {
      expect(DEUDA_TABLA_CRUDA).not.toContain(UI_TABLE_REL);
    });
  });

  describe('estado real del repo', () => {
    const realSources = loadRealFileSources();

    it('el barrido encuentra archivos de sobra para ser una prueba real', () => {
      // Guarda de cordura del propio escáner: si cae a 0 (p.ej. `SRC` mal calculado), el resto
      // de este bloque pasaría en verde por nada.
      expect(realSources.size).toBeGreaterThan(200);
    });

    it('ui/table.tsx queda fuera del barrido por ruta exacta, no por estar en la lista', () => {
      expect(realSources.has(UI_TABLE_REL)).toBe(false);
    });

    it('el conteo de deuda real de hoy es 34 (visible en el diff si alguien lo cambia sin querer)', () => {
      // Bajó de 35 a 34: Fase 6 de docs/plan_verificacion_inventario.md borró
      // `components/inventory/NuevaVerificacion.tsx` (D-T11 del brief técnico
      // -- creaba 226 renglones sin selección posible, fuera de alcance del
      // rediseño; su reemplazo, `fn_ronda_abrir`, no tiene UI de conteo
      // producto-por-producto).
      expect(DEUDA_TABLA_CRUDA.length).toBe(34);
    });

    it('regla 1 — ningún archivo con <table> crudo fuera de la lista declarada', () => {
      const offenders = findRule1Offenders(realSources, new Set(DEUDA_TABLA_CRUDA));
      expect(offenders, formatRule1Message(offenders)).toEqual([]);
    });

    it('regla 2 — todo archivo declarado todavía tiene <table> crudo', () => {
      const stale = findRule2Stale(DEUDA_TABLA_CRUDA, realSources);
      expect(stale, formatRule2Message(stale)).toEqual([]);
    });
  });

  describe('el guardián puede fallar de verdad (pruebas con archivos inyectados, no de disco)', () => {
    it('regla 1 SÍ marca un archivo nuevo con <table> crudo que no está en la lista', () => {
      const files = new Map([
        ['components/foo/TablaNueva.tsx', '<table className="w-full">\n<tbody></tbody>\n</table>'],
      ]);
      expect(findRule1Offenders(files, new Set())).toEqual(['components/foo/TablaNueva.tsx']);
    });

    it('regla 1 NO marca ese mismo archivo si está declarado', () => {
      const files = new Map([
        ['components/foo/TablaNueva.tsx', '<table className="w-full">\n<tbody></tbody>\n</table>'],
      ]);
      expect(
        findRule1Offenders(files, new Set(['components/foo/TablaNueva.tsx'])),
      ).toEqual([]);
    });

    it('regla 1 NO marca un comentario que solo MENCIONA <table> sin escribirlo (caso real: PresupuestoTable.tsx)', () => {
      const files = new Map([
        [
          'components/foo/Comentada.tsx',
          '{/* `table-fixed` reproduce el `<table>` original */}\n<Table><TableBody /></Table>',
        ],
      ]);
      expect(findRule1Offenders(files, new Set())).toEqual([]);
    });

    it('regla 1 NO confunde <Table>/<TableHead> (el componente) con <table> (la etiqueta)', () => {
      const files = new Map([
        [
          'components/foo/Migrada.tsx',
          '<Table><TableHeader><TableRow><TableHead>x</TableHead></TableRow></TableHeader></Table>',
        ],
      ]);
      expect(findRule1Offenders(files, new Set())).toEqual([]);
    });

    it('regla 2 SÍ marca un archivo declarado que ya fue migrado (ya no tiene <table> crudo)', () => {
      const declared = ['components/foo/YaMigrado.tsx'];
      const files = new Map([['components/foo/YaMigrado.tsx', '<Table><TableBody /></Table>']]);
      expect(findRule2Stale(declared, files)).toEqual(['components/foo/YaMigrado.tsx']);
    });

    it('regla 2 NO marca un archivo declarado que SIGUE con <table> crudo (caso real: MapaCalorIncidencias.tsx)', () => {
      const declared = ['components/foo/SigueCrudo.tsx'];
      const files = new Map([
        ['components/foo/SigueCrudo.tsx', '<table>\n<TableHeader />\n</table>'],
      ]);
      expect(findRule2Stale(declared, files)).toEqual([]);
    });

    it('regla 2 SÍ marca un archivo declarado que fue borrado del todo', () => {
      const declared = ['components/foo/Borrado.tsx'];
      const files = new Map<string, string>();
      expect(findRule2Stale(declared, files)).toEqual(['components/foo/Borrado.tsx']);
    });
  });
});
