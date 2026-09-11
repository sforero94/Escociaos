// ARCHIVO: __tests__/umbralGravedadContract.test.ts
// DESCRIPCIÓN: El corte de gravedad de una plaga es 10 % / 30 % sobre la
// incidencia (Baja < 10 ≤ Media < 30 ≤ Alta). Es contrato del proyecto, vive en
// `clasificarGravedad` (`src/utils/calculosMonitoreo.ts`) y el CLAUDE.md raíz
// prohíbe re-derivarlo en línea.
//
// POR QUÉ EXISTE ESTE GUARD — y por qué busca por FORMA y no por nombre:
//
// El corte se ha duplicado dos veces y las dos veces el mecanismo de detección
// falló, siempre por la misma razón: buscaba el NOMBRE `clasificarGravedad`.
//
//   1. `CargaMasiva.tsx` llevaba su propia copia con un corte de 15 %. Etiquetó
//      mal 48 filas de `monitoreos`; la migración 117 corrigió el dato y el
//      PR #151 el código.
//   2. El bot de Telegram llevaba una TERCERA implementación llamada
//      `calcularGravedad` (`telegram/conversations/monitoreo.ts`, más su espejo
//      en `supabase/functions/make-server-1ccce916/`). Escribía `gravedad_texto`
//      y `gravedad_numerica` en filas reales de `monitoreos`.
//      `grep -rn calcularGravedad src/__tests__/` devolvía CERO: ninguna guarda,
//      ningún test de paridad y ninguna barrida la veían. Comprobado antes de
//      cerrarla: cambiarle el corte de 10 a 15 — el defecto exacto del punto 1 —
//      dejaba la suite entera en verde (172 ficheros, 3.713 tests).
//
// Por eso este guard no busca un identificador. Barre `src/` y `supabase/` y
// encuentra CUALQUIER sitio que compare un número contra un rótulo de gravedad,
// se llame como se llame, y falla ante cualquier fichero que no esté en el
// inventario de abajo. Es el mismo patrón de `jornalDivisorContract.test.ts`,
// que existe porque el divisor del jornal vivía en tres árboles que no pueden
// importarse entre sí. **Buscar por nombre es lo que falló acá.**
//
// LO QUE ESTE GUARD NO HACE: no opina sobre los valores 10 y 30. Son una
// decisión del dueño; el guard sólo exige que haya UNA copia y que las demás la
// importen.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { clasificarGravedad } from '@/utils/calculosMonitoreo';
import { clasificarGravedad as clasificarEdge } from '../supabase/functions/server/priorizacion-scouting';

const RAIZ = join(__dirname, '..', '..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf-8');

// ---------------------------------------------------------------------------
// Inventario — todo sitio del repo que roza el corte de gravedad
// ---------------------------------------------------------------------------

/**
 * Todo fichero que la barrida de abajo encuentra, con su papel:
 *
 * - `declara`: tiene el corte escrito. Son los ÚNICOS tres ficheros que pueden
 *   tenerlo, uno por árbol, porque los tres árboles no pueden importarse entre
 *   sí (navegador, edge function `src/supabase/...`, copia desplegada
 *   `supabase/functions/...`).
 * - `otro`: usa los rótulos Alta/Media/Baja para algo que NO es derivar la
 *   gravedad de una plaga a partir de un número — prioridad de una tarea,
 *   colorear un valor ya clasificado, o agregar el `gravedad_texto` que la base
 *   ya tiene guardado.
 *
 * Un fichero que aparezca en la barrida y no esté acá hace fallar el test. Eso
 * es deliberado: la única forma de agregarlo es decidir cuál de los dos papeles
 * cumple, que es exactamente la decisión que nadie tomó con el bot de Telegram.
 */
type Papel = 'declara' | 'otro';

const INVENTARIO: Record<string, Papel> = {
  // La fuente de verdad.
  'src/utils/calculosMonitoreo.ts': 'declara',
  // Puerto Deno + su copia desplegada. `priorizacion-scouting.ts` no tiene NI UN
  // import, así que cualquier módulo del árbol edge puede tomarle el corte.
  'src/supabase/functions/server/priorizacion-scouting.ts': 'declara',
  'supabase/functions/make-server-1ccce916/priorizacion-scouting.ts': 'declara',

  // Pinta el resultado de `clasificarGravedad`; el `> 0` que la barrida ve es
  // un guardia de render, no un corte.
  'src/components/monitoreo/RegistroMonitoreo.tsx': 'otro',
  'src/components/monitoreo/DashboardMonitoreoV3.tsx': 'otro',
  // Prioridad de una tarea de Labores, no gravedad de una plaga.
  'src/components/dashboard/AlertList.tsx': 'otro',
  // Agrega `gravedad_texto` ya guardado en `monitoreos`; nunca lo deriva.
  'src/supabase/functions/server/chat.tsx': 'otro',
  'supabase/functions/make-server-1ccce916/chat.tsx': 'otro',
};

/**
 * Ficheros que clasifican la gravedad y DEBEN importar el corte, nunca
 * reescribirlo. Esta lista sí va por nombre, y ése es justamente su límite: es
 * una comprobación secundaria. La que de verdad cierra el agujero es la barrida
 * por forma, porque un quinto sitio con otro nombre no estaría acá.
 */
const CONSUMIDORES = [
  'src/components/monitoreo/RegistroMonitoreo.tsx',
  'src/components/monitoreo/DashboardMonitoreoV3.tsx',
  'src/components/monitoreo/CargaMasiva.tsx',
  'src/components/monitoreo/MapaCalorIncidencias.tsx',
  'src/supabase/functions/server/telegram/conversations/monitoreo.ts',
  'supabase/functions/make-server-1ccce916/telegram/conversations/monitoreo.ts',
];

// ---------------------------------------------------------------------------
// Barrida
// ---------------------------------------------------------------------------

const DIRS_RAIZ = ['src', 'supabase'];
const SALTAR = new Set(['node_modules', 'build', 'dist', '.git', '__tests__']);

function ficherosDeCodigo(): string[] {
  const out: string[] = [];
  const caminar = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      if (SALTAR.has(entrada)) continue;
      const p = join(dir, entrada);
      if (statSync(p).isDirectory()) caminar(p);
      else if (/\.(ts|tsx)$/.test(entrada)) out.push(p);
    }
  };
  for (const d of DIRS_RAIZ) caminar(join(RAIZ, d));
  return out;
}

const ROTULO = /['"`](Baja|Media|Alta)['"`]/;

/** Un corte es un número comparado, o una cota nombrada de una tabla de rangos. */
const EXPRESIONES_DE_CORTE = [
  /(?:>=|<=|>|<)\s*(\d+(?:\.\d+)?)/g,
  /\b(?:min|max|minimo|maximo|desde|hasta|umbral|corte|limite)\s*[:=]\s*(\d+(?:\.\d+)?)/gi,
];

/** Cuántas líneas alrededor del rótulo se miran para encontrar su corte. */
const VENTANA = 3;

/**
 * Red 1 — la FORMA del clasificador: un número comparado cerca de un rótulo de
 * gravedad. Independiente del nombre de la función, del `if`/`switch`/ternario
 * que se use y de si el fichero exporta o no.
 */
function cortesAdyacentesARotulo(contenido: string): string[] {
  const lineas = contenido.split('\n');
  const cortes = new Set<string>();
  lineas.forEach((linea, i) => {
    if (!ROTULO.test(linea)) return;
    const ventana = lineas.slice(Math.max(0, i - VENTANA), i + VENTANA + 1).join('\n');
    for (const re of EXPRESIONES_DE_CORTE) {
      for (const m of ventana.matchAll(re)) cortes.add(m[1]);
    }
  });
  return [...cortes].sort();
}

/**
 * Red 2 — más ancha y más tonta, para las formas que la red 1 no ve (una tabla
 * de rangos sin operadores, por ejemplo): los tres rótulos y los dos números en
 * el mismo fichero.
 */
function tieneRotulosYAmbosNumeros(contenido: string): boolean {
  const tresRotulos = ['Baja', 'Media', 'Alta'].every((l) =>
    new RegExp(`['"\`]${l}['"\`]`).test(contenido),
  );
  if (!tresRotulos) return false;
  return /(?<![\w.])10(?![\w.])/.test(contenido) && /(?<![\w.])30(?![\w.])/.test(contenido);
}

const IMPORTA_EL_CORTE =
  /import\s*(?:type\s*)?\{[^}]*\bclasificarGravedad\b[^}]*\}\s*from\s*['"][^'"]*(?:calculosMonitoreo|priorizacion-scouting)(?:\.ts)?['"]/;

interface Hallazgo {
  rel: string;
  cortes: string[];
  redAncha: boolean;
}

const HALLAZGOS: Hallazgo[] = ficherosDeCodigo()
  .map((abs) => {
    const contenido = readFileSync(abs, 'utf-8');
    return {
      rel: relative(RAIZ, abs).split('\\').join('/'),
      cortes: cortesAdyacentesARotulo(contenido),
      redAncha: tieneRotulosYAmbosNumeros(contenido),
    };
  })
  .filter((h) => h.cortes.length > 0 || h.redAncha);

const porRel = (rel: string) => HALLAZGOS.find((h) => h.rel === rel);

// ---------------------------------------------------------------------------

describe('umbral de gravedad — el corte 10 % / 30 %', () => {
  it('los límites son exactos y cerrados por abajo', () => {
    expect(clasificarGravedad(0)).toEqual({ texto: 'Baja', numerica: 1 });
    expect(clasificarGravedad(9.99)).toEqual({ texto: 'Baja', numerica: 1 });
    expect(clasificarGravedad(10)).toEqual({ texto: 'Media', numerica: 2 });
    expect(clasificarGravedad(29.99)).toEqual({ texto: 'Media', numerica: 2 });
    expect(clasificarGravedad(30)).toEqual({ texto: 'Alta', numerica: 3 });
  });

  it('el puerto Deno contesta lo mismo que el navegador', () => {
    for (const inc of [0, 9.99, 10, 14.9, 15, 29.99, 30, 100]) {
      expect(clasificarEdge(inc), `incidencia ${inc}`).toEqual(clasificarGravedad(inc));
    }
  });

  it('el corte viejo de 15 % ya no clasifica a nadie como Baja', () => {
    // Es el defecto que costó las 48 filas de la migración 117.
    expect(clasificarGravedad(12.5).texto).toBe('Media');
    expect(clasificarEdge(12.5).texto).toBe('Media');
  });
});

describe('guard estático — toda copia del corte, encontrada por FORMA', () => {
  it('la barrida ve algo: el detector no está roto en silencio', () => {
    // Sin esto, un cambio que rompa las expresiones regulares dejaría el guard
    // en verde permanente sin mirar un solo fichero.
    expect(HALLAZGOS.length).toBeGreaterThanOrEqual(3);
    expect(porRel('src/utils/calculosMonitoreo.ts')?.cortes).toEqual(['10', '30']);
  });

  it('ningún fichero fuera del inventario compara un número contra un rótulo de gravedad', () => {
    const intrusos = HALLAZGOS.filter((h) => h.cortes.length > 0 && !(h.rel in INVENTARIO)).map(
      (h) => `${h.rel} (cortes: ${h.cortes.join(', ')})`,
    );
    expect(
      intrusos,
      'Copia no inventariada del corte de gravedad. Si deriva la gravedad de un ' +
        'número, importá `clasificarGravedad` en vez de reescribirla; si usa los ' +
        'rótulos para otra cosa, agregala al INVENTARIO como `otro`.',
    ).toEqual([]);
  });

  it('ningún fichero fuera del inventario junta los tres rótulos con 10 y 30', () => {
    const intrusos = HALLAZGOS.filter((h) => h.redAncha && !(h.rel in INVENTARIO)).map((h) => h.rel);
    expect(intrusos, 'Posible tabla de rangos con el corte de gravedad escrito a mano.').toEqual([]);
  });

  it('el inventario no tiene entradas muertas', () => {
    const muertas = Object.keys(INVENTARIO).filter((rel) => !porRel(rel));
    expect(
      muertas,
      'Estas entradas ya no aparecen en la barrida: borralas del INVENTARIO para que no lo pudran.',
    ).toEqual([]);
  });

  const DECLARAN = Object.entries(INVENTARIO)
    .filter(([, papel]) => papel === 'declara')
    .map(([rel]) => rel);

  it('sólo tres ficheros declaran el corte, uno por árbol', () => {
    expect(DECLARAN).toHaveLength(3);
  });

  it.each(DECLARAN)('%s declara exactamente 10 y 30, ningún otro corte', (rel) => {
    expect(porRel(rel)!.cortes, `${rel} cambió el corte de gravedad`).toEqual(['10', '30']);
  });

  const OTROS = Object.entries(INVENTARIO)
    .filter(([, papel]) => papel === 'otro')
    .map(([rel]) => rel);

  it.each(OTROS)('%s no reescribe los cortes 10 y 30 junto a un rótulo', (rel) => {
    const cortes = porRel(rel)?.cortes ?? [];
    expect(
      cortes.filter((c) => c === '10' || c === '30'),
      `${rel} pasó de usar los rótulos a derivar la gravedad: importá clasificarGravedad`,
    ).toEqual([]);
  });

  it.each(CONSUMIDORES)('%s importa el corte en vez de reescribirlo', (rel) => {
    expect(
      IMPORTA_EL_CORTE.test(leer(rel)),
      `${rel} clasifica la gravedad pero no importa clasificarGravedad`,
    ).toBe(true);
  });

  it('las dos copias del árbol de edge function coinciden', () => {
    // El espejo `supabase/functions/make-server-1ccce916/` se mantiene a mano.
    // Sólo difieren en la primera línea, la cabecera `// ARCHIVO:`.
    const sinCabecera = (rel: string) => leer(rel).split('\n').slice(1).join('\n');
    for (const rel of [
      'telegram/conversations/monitoreo.ts',
      'priorizacion-scouting.ts',
    ]) {
      expect(
        sinCabecera(`src/supabase/functions/server/${rel}`),
        `${rel} derivó entre los dos árboles de edge function`,
      ).toBe(sinCabecera(`supabase/functions/make-server-1ccce916/${rel}`));
    }
  });
});
