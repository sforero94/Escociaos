// ARCHIVO: __tests__/hatoFechaLocalGuard.test.ts
// DESCRIPCIÓN: Guard estático + regresión de un bug que SÍ corrompía datos
// guardados (a diferencia del off-by-one de `format.ts`, que solo mentía al
// renderizar).
//
// `new Date().toISOString().slice(0, 10)` NO es "hoy": es la fecha UTC. En
// Bogotá (UTC-5), entre las 19:00 y la medianoche ya es el día SIGUIENTE en
// UTC. Verificado en vivo el 2026-07-28 (martes, hora local):
//
//   obtenerFechaHoy()                    -> 2026-07-28   local, correcto
//   new Date().toISOString().slice(0,10) -> 2026-07-29   UTC, mañana
//
// Como 2026-07-29 ES miércoles, `calcularFechaUltimoDiaPesaje(hoy, 3)`
// devolvía ese mismo día con `retroceso = 0`, y la grilla de pesaje ofrecía
// -- y `guardarPesajes` PERSISTÍA -- una fecha futura. Una pesada digitada un
// miércoles por la noche quedaba archivada el jueves, y con ella se corría de
// semana en el tracker y en el ranking.
//
// El helper correcto ya existía en el repo: `obtenerFechaHoy()`
// (`src/utils/fechas.ts`), que arma el string desde getFullYear/getMonth/
// getDate LOCALES. El módulo hato simplemente no lo usaba.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { obtenerFechaHoy, calcularRangoFechasPorPeriodo, fechaAISODate } from '@/utils/fechas';

/** Árboles de código de NAVEGADOR cubiertos por el guard. Las edge functions
 * (`src/supabase/functions/`) quedan FUERA a propósito: corren en Deno sobre un
 * servidor en UTC, donde `obtenerFechaHoy()` -- que lee getFullYear/getMonth/
 * getDate LOCALES -- devolvería igualmente UTC. Ahí el arreglo no es este
 * helper sino convertir explícitamente a America/Bogota. */
const RAICES_CUBIERTAS = [
  join(process.cwd(), 'src', 'components'),
  join(process.cwd(), 'src', 'utils'),
];

/** Patrón prohibido: recortar un `toISOString()` a `AAAA-MM-DD`.
 *
 * Cubre las TRES formas de recortar (`slice(0,10)`, `split('T')[0]`,
 * `substring(0,10)`) y -- desde 2026-08-10 -- **cualquier receptor**, no solo
 * el literal `new Date()`.
 *
 * Historia de los tres modos de falla de este mismo guard:
 *   1. Solo miraba `.slice(0, 10)` -> no vio 36 `.split('T')[0]`.
 *   2. Exigía el literal `new Date().toISOString()` -> salió VERDE con 29
 *      apariciones vivas escritas como `now.toISOString().split('T')[0]`,
 *      `hace30.toISOString()...`, `new Date(Date.now() - N).toISOString()...`
 *      Un `const now = new Date()` una línea antes bastaba para esconder el bug.
 *   3. (este) Ya no mira quién llama: prohíbe el recorte en sí.
 *
 * `toISOString()` SIEMPRE devuelve UTC. Recortarlo a 10 caracteres da el día
 * calendario UTC, que en Bogotá (UTC-5) es MAÑANA desde las 19:00 -- da igual
 * si la Date venía del reloj directo o de una variable. Por eso el patrón ya
 * no intenta adivinar el receptor: los pocos usos legítimos van en la lista
 * blanca de abajo, cerrada y contada. */
const PATRON_UTC_HOY =
  /\.toISOString\(\)\s*\.\s*(?:slice\(0,\s*10\)|split\('T'\)\[0\]|substring\(0,\s*10\))/g;

/** Lista blanca CERRADA Y CONTADA de usos legítimos del recorte.
 *
 * No basta con nombrar el archivo: se declara cuántas apariciones puede tener.
 * Si alguien agrega una línea nueva al archivo el conteo deja de cuadrar y el
 * guard falla igual -- que es justo lo que un whitelist por archivo suelto no
 * consigue en un archivo de 1.900 líneas.
 *
 * El caso legítimo es SIEMPRE el mismo: una Date construida en UTC a
 * propósito (`new Date('AAAA-MM-DDT00:00:00Z')`, o `new Date('AAAA-MM-DD')`,
 * que el motor parsea como medianoche UTC) sobre la que se hace aritmética y
 * se vuelve a leer en UTC. Ahí el ida y vuelta se cancela y `toISOString()` es
 * el lector CORRECTO -- pasarlas a `fechaAISODate()` (que lee getters LOCALES)
 * les correría un día hacia atrás en UTC-5. */
const LISTA_BLANCA_UTC: { archivo: string; ocurrencias: number; razon: string }[] = [
  {
    archivo: 'src/components/hato/components/EventoTimeline.tsx',
    ocurrencias: 1,
    razon:
      'fechaCorteTimeline() construye la Date desde `${fechaHoy}T00:00:00Z` y hace ' +
      'setUTCMonth(); el recorte UTC es la lectura correcta y el mensaje de error de ' +
      'este mismo guard ya lo citaba como el patrón a imitar.',
  },
  {
    archivo: 'src/utils/fetchDatosReporteSemanal.ts',
    ocurrencias: 3,
    razon:
      'restarDias() y el cálculo de histInicio parsean `new Date(fechaISO)` -> medianoche ' +
      'UTC; enumerarFechas() itera con cursor. Los tres son ida y vuelta UTC coherente.',
  },
  {
    archivo: 'src/utils/accionesHechos.ts',
    ocurrencias: 1,
    razon:
      'sumarDias() construye la Date explícitamente vía Date.UTC(y, m-1, d+dias) a ' +
      'partir de un `AAAA-MM-DD` ya parseado -- nunca del reloj -- y la vuelve a leer con ' +
      'toISOString().slice(0,10); ida y vuelta UTC coherente, mismo patrón que ' +
      'fechaCorteTimeline (EventoTimeline.tsx). Módulo puro y espejado a Deno (motor de ' +
      'acciones recomendadas): no puede importar `fechaAISODate`/`obtenerFechaHoy` de ' +
      '`@/utils/fechas` (sin copia en el árbol Deno), así que toda su aritmética de fecha ' +
      'es local a este archivo, igual que el `diasEntre` de `accionesOrden.ts`.',
  },
];

/** Quita comentarios antes de buscar el patrón. Varios archivos DOCUMENTAN el
 * antipatrón en prosa ("NUNCA `new Date().toISOString().slice(0, 10)`") y esas
 * notas son justamente lo que queremos conservar -- sin este filtro el guard se
 * dispararía contra su propia explicación. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function archivosTs(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) out.push(...archivosTs(ruta));
    else if (/\.tsx?$/.test(entrada)) out.push(ruta);
  }
  return out;
}

describe('obtenerFechaHoy — contrato de fecha LOCAL', () => {
  it('devuelve el día calendario local, no el UTC', () => {
    const ahora = new Date();
    const local = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
      ahora.getDate(),
    ).padStart(2, '0')}`;
    expect(obtenerFechaHoy()).toBe(local);
  });

  it('no delega en toISOString (que devolvería el día UTC) -- caso de pared de reloj, no determinístico por sí solo', () => {
    // Este assert solo DIVERGE cuando la hora local y la UTC caen en días
    // distintos; el resto del tiempo es trivialmente cierto. Por eso el caso
    // de abajo (reloj fijo + TZ fija) es la defensa REAL de mutación -- este
    // solo documenta el porqué contra el reloj de verdad.
    const ahora = new Date();
    const local = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
      ahora.getDate(),
    ).padStart(2, '0')}`;
    if (local !== ahora.toISOString().slice(0, 10)) {
      expect(obtenerFechaHoy()).not.toBe(ahora.toISOString().slice(0, 10));
    }
    expect(obtenerFechaHoy()).toBe(local);
  });

  // ==========================================================================
  // Caso determinístico (mutation-check real): reloj del sistema Y timezone
  // del proceso FIJOS a un instante conocido de "noche en Bogotá / madrugada
  // UTC" -- reproduce EXACTAMENTE el escenario verificado en vivo (martes
  // 2026-07-28 23:30 Bogotá == miércoles 2026-07-29 04:30 UTC), sin depender
  // de la hora de pared ni de la TZ del entorno donde corre el test. Si
  // `obtenerFechaHoy()` alguna vez vuelve a delegar en
  // `toISOString().slice(0, 10)`, este caso falla SIEMPRE, no solo entre las
  // 19:00 y la medianoche.
  // ==========================================================================
  describe('caso determinístico -- reloj + TZ fijos (2026-07-28T23:30:00-05:00 Bogotá)', () => {
    const TZ_ORIGINAL = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'America/Bogota';
      vi.useFakeTimers();
      // 2026-07-28T23:30:00-05:00 (Bogotá) == 2026-07-29T04:30:00Z (UTC) --
      // el mismo instante que el dueño verificó en vivo.
      vi.setSystemTime(new Date('2026-07-28T23:30:00-05:00'));
    });

    afterEach(() => {
      vi.useRealTimers();
      process.env.TZ = TZ_ORIGINAL;
    });

    it('obtenerFechaHoy() es el día calendario LOCAL (2026-07-28), no el UTC (2026-07-29)', () => {
      expect(obtenerFechaHoy()).toBe('2026-07-28');
    });

    it('NO coincide con new Date().toISOString().slice(0, 10) -- ese es "mañana" en UTC', () => {
      expect(new Date().toISOString().slice(0, 10)).toBe('2026-07-29');
      expect(obtenerFechaHoy()).not.toBe(new Date().toISOString().slice(0, 10));
    });
  });
});

// ============================================================================
// Regresión del caso Consuelito (2026-08-03, 21:13 Bogotá).
//
// El bug NO era que un lado estuviera mal en abstracto: era que los dos lados
// de la misma pantalla usaban relojes DISTINTOS. El formulario de gasto ponía
// la fecha por defecto con `toISOString()` (UTC -> 2026-08-04) y el historial
// filtraba con el periodo `ytd`, cuyo `fecha_hasta` sale de `obtenerFechaHoy()`
// (LOCAL -> 2026-08-03). El `.lte('fecha', fecha_hasta)` dejaba fuera los 5
// gastos recién guardados: quedaban en la base (confirmado en producción) e
// invisibles en pantalla.
//
// Este test fija el invariante real: la fecha que el formulario propone SIEMPRE
// tiene que caer dentro de la ventana que la lista abre por defecto.
// ============================================================================
describe('regresión: el default del formulario cae dentro de la ventana por defecto de la lista', () => {
  const TZ_ORIGINAL = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Bogota';
    vi.useFakeTimers();
    // El instante exacto en que Consuelito guardó el primero de los 5 gastos.
    vi.setSystemTime(new Date('2026-08-03T21:13:25-05:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ_ORIGINAL;
  });

  it('un gasto capturado a las 21:13 de Bogotá es visible en el periodo `ytd`', () => {
    const fechaPorDefectoDelFormulario = obtenerFechaHoy();
    const { fecha_desde, fecha_hasta } = calcularRangoFechasPorPeriodo('ytd');

    expect(fechaPorDefectoDelFormulario).toBe('2026-08-03');
    expect(fechaPorDefectoDelFormulario >= fecha_desde).toBe(true);
    // Este es el assert que fallaba: el default era 2026-08-04 y el tope 2026-08-03.
    expect(fechaPorDefectoDelFormulario <= fecha_hasta).toBe(true);
  });

  it('el antipatrón UTC habría quedado FUERA de la ventana -- prueba de que el bug era real', () => {
    const defaultViejoEnUTC = new Date().toISOString().split('T')[0];
    const { fecha_hasta } = calcularRangoFechasPorPeriodo('ytd');

    expect(defaultViejoEnUTC).toBe('2026-08-04');
    expect(defaultViejoEnUTC <= fecha_hasta).toBe(false);
  });
});

// ============================================================================
// Regresión del sitio con impacto VISIBLE de la barrida 2026-08-10.
//
// `useInventoryDashboard.getAlertasVencimiento()` marcaba
// `vencido: fecha_vencimiento <= hoyStr`, con `hoyStr` recortado de
// `hoy.toISOString()`. `hoy` es `new Date()` (hora de pared), así que desde las
// 19:00 en Bogotá el string era el día SIGUIENTE y un producto que vence MAÑANA
// aparecía como YA VENCIDO en el tablero de Inventario.
//
// El guard estático no alcanzaba a ver este sitio: estaba escrito como
// `hoy.toISOString()`, con la Date en una variable, y el patrón viejo exigía el
// literal `new Date().toISOString()`.
// ============================================================================
describe('regresión: un producto que vence MAÑANA no se marca vencido de noche', () => {
  const TZ_ORIGINAL = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Bogota';
    vi.useFakeTimers();
    // 2026-08-03T21:13:25-05:00 (Bogotá) == 2026-08-04T02:13:25Z (UTC).
    vi.setSystemTime(new Date('2026-08-03T21:13:25-05:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ_ORIGINAL;
  });

  it('fechaAISODate(new Date()) da el día LOCAL, así que `vence mañana` sigue vigente', () => {
    const hoy = new Date();
    const hoyStr = fechaAISODate(hoy);
    const venceManana = '2026-08-04';

    expect(hoyStr).toBe('2026-08-03');
    expect(venceManana <= hoyStr).toBe(false); // vigente, que es lo correcto
  });

  it('el antipatrón lo habría marcado vencido -- prueba de que el bug era real', () => {
    const hoyStrViejo = new Date().toISOString().split('T')[0];
    const venceManana = '2026-08-04';

    expect(hoyStrViejo).toBe('2026-08-04');
    expect(venceManana <= hoyStrViejo).toBe(true); // falso positivo de "vencido"
  });

  it('fechaAISODate coincide con obtenerFechaHoy() cuando la Date es el reloj', () => {
    expect(fechaAISODate(new Date())).toBe(obtenerFechaHoy());
  });
});

/** Cuenta apariciones del patrón en un archivo, ignorando comentarios. */
function contarInfracciones(ruta: string): number {
  const fuente = sinComentarios(readFileSync(ruta, 'utf-8'));
  return fuente.match(new RegExp(PATRON_UTC_HOY.source, 'g'))?.length ?? 0;
}

describe('guard estático: el código de navegador nunca toma "hoy" en UTC', () => {
  it('ningún archivo bajo src/components/ ni src/utils/ toma "hoy" del reloj en UTC', () => {
    const permitidos = new Map(LISTA_BLANCA_UTC.map((e) => [e.archivo, e.ocurrencias]));

    const infractores = RAICES_CUBIERTAS.flatMap(archivosTs)
      .map((ruta) => ({ rel: ruta.replace(process.cwd() + '/', ''), n: contarInfracciones(ruta) }))
      .filter(({ rel, n }) => n > 0 && n !== (permitidos.get(rel) ?? 0))
      .map(({ rel, n }) => `${rel} (${n} apariciones, permitidas ${permitidos.get(rel) ?? 0})`);

    expect(
      infractores,
      'Estos archivos toman "hoy" del reloj en UTC, así que después de las 19:00 en ' +
        'Bogotá devuelven MAÑANA. Un formulario que guarda esa fecha persiste un día ' +
        'futuro, y la lista que lo muestra filtra por `fecha <= hoy` LOCAL -- así que el ' +
        'registro se guarda bien y desaparece de la pantalla (ver el caso Consuelito, ' +
        '2026-08-03 21:13 Bogotá: 5 gastos guardados con fecha 2026-08-04). Usa ' +
        '`obtenerFechaHoy()` de `@/utils/fechas` para "hoy", o `fechaAISODate(d)` para ' +
        'cualquier Date derivada -- los dos ya existen y ya son local-correctos. Si de ' +
        'verdad necesitas un día calendario UTC, construye la Date explícitamente desde ' +
        'un string `AAAA-MM-DDT00:00:00Z` como hace `fechaCorteTimeline` en ' +
        'EventoTimeline.tsx, y agrega el archivo a LISTA_BLANCA_UTC con su conteo.',
    ).toEqual([]);
  });

  // Una lista blanca que se queda vieja es peor que no tenerla: sigue tapando
  // el archivo aunque el uso legítimo ya no exista. Este caso la obliga a
  // describir la realidad exacta.
  it('la lista blanca está viva: cada entrada existe y tiene EXACTAMENTE las apariciones declaradas', () => {
    const desfases = LISTA_BLANCA_UTC.filter(
      ({ archivo, ocurrencias }) => contarInfracciones(join(process.cwd(), archivo)) !== ocurrencias,
    ).map(
      ({ archivo, ocurrencias }) =>
        `${archivo}: declaradas ${ocurrencias}, reales ${contarInfracciones(join(process.cwd(), archivo))}`,
    );

    expect(
      desfases,
      'LISTA_BLANCA_UTC quedó desactualizada. Si eliminaste un uso legítimo, baja el ' +
        'conteo o borra la entrada; nunca la subas para silenciar un sitio nuevo.',
    ).toEqual([]);
  });
});
