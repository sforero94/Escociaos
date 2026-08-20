import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative } from 'path';

/**
 * Guarda estructural: nadie pinta `lecturaActual` sin pasarla por la reja de
 * frescura.
 *
 * `lecturaActual()` (`calculosClima.ts`) es un `max by timestamp` y nada más:
 * no sabe si la lectura que devuelve es de hace 5 minutos o de anoche. Una
 * pantalla que la renderiza sin mirar la edad presenta la lectura vieja como
 * si fuera actual, y en este proyecto eso no es un detalle de UI — la finca
 * planea aplicaciones e irrigación contra esos números.
 *
 * **Ya ocurrió:** el 2026-08-19 a las 21:05 Bogotá la finca se quedó sin luz.
 * Durante ~14 h la estación no envió una sola lectura (Ecowitt respondía HTTP
 * 200 con `{"message":"No data available"}`, así que ni el cron ni el log de
 * la edge function se pusieron rojos) y el Tablero General siguió mostrando
 * 19,5 °C / 0 W/m² / 0 km/h bajo el rótulo **"Ahora"**. Peor: a las ~24 h el
 * cron de la migración 036 poda `clima_lecturas`, `lecturaActual` pasa a
 * `null` y la tarjeta **desaparecía** del tablero en vez de decir "sin dato"
 * — lo contrario del contrato "sin dato ≠ 0" del proyecto.
 *
 * La causa fue un corte de luz, o sea que **se repite**. Por eso esto es una
 * prueba y no un comentario.
 *
 * Para agregar un archivo a la lista blanca tiene que ser genuinamente un
 * sitio que no PINTA la lectura (la produce, la tipa, o la pasa hacia abajo).
 */

const SRC = resolve(__dirname, '..');

/** Funciones que cuentan como "pasó por la reja". */
const HELPERS_FRESCURA = [
  'clasificarFrescuraLectura',
  'lecturaEsReciente',
  'minutosDesdeLectura',
];

/** Archivos que mencionan `lecturaActual` pero no la pintan, con el motivo. */
const LISTA_BLANCA: Record<string, string> = {
  'utils/calculosClima.ts':
    'Define lecturaActual() y las propias funciones de frescura.',
  'hooks/useClimaData.ts':
    'Produce la lectura y la expone; no renderiza nada. La reja va en cada consumidor, que es quien decide qué decir.',
  'components/clima/ClimaDashboard.tsx':
    'Sólo pasa la prop a ClimaKPICards, que sí tiene la reja. No pinta ningún valor de la lectura.',
};

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '__tests__') continue;
    const ruta = resolve(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosFuente(ruta, acc);
    else if (/\.tsx?$/.test(entrada)) acc.push(ruta);
  }
  return acc;
}

function mencionanLecturaActual(): { rel: string; contenido: string }[] {
  return archivosFuente(SRC)
    .map((f) => ({ rel: relative(SRC, f).split('\\').join('/'), contenido: readFileSync(f, 'utf8') }))
    .filter(({ contenido }) => contenido.includes('lecturaActual'));
}

describe('todo consumidor de lecturaActual pasa por la reja de frescura', () => {
  it('ningún componente nuevo renderiza la lectura sin mirar su edad', () => {
    const infractores = mencionanLecturaActual()
      .filter(({ rel }) => !(rel in LISTA_BLANCA))
      .filter(({ contenido }) => !HELPERS_FRESCURA.some((h) => contenido.includes(h)))
      .map(({ rel }) => rel);

    expect(infractores).toEqual([]);
  });

  it('la lista blanca no tiene entradas muertas', () => {
    const todos = mencionanLecturaActual().map(({ rel }) => rel);
    const muertas = Object.keys(LISTA_BLANCA).filter((k) => !todos.includes(k));
    expect(muertas).toEqual([]);
  });

  it('los dos sitios que hoy la pintan siguen teniendo la reja', () => {
    // Regresión explícita: si alguien borra la reja de uno de estos dos, la
    // prueba de arriba lo agarra igual, pero este caso nombra el archivo.
    for (const rel of [
      'components/dashboard/ClimaCard.tsx',
      'components/clima/components/ClimaKPICards.tsx',
    ]) {
      const contenido = readFileSync(resolve(SRC, rel), 'utf8');
      expect(HELPERS_FRESCURA.some((h) => contenido.includes(h))).toBe(true);
    }
  });

  it('la tarjeta del Tablero no puede volver a desaparecer por falta de lectura', () => {
    const card = readFileSync(resolve(SRC, 'components/dashboard/ClimaCard.tsx'), 'utf8');
    // El único `return null` admisible es el de "la estación nunca existió".
    const retornosNulos = card.match(/return null;/g) ?? [];
    expect(retornosNulos.length).toBe(1);
    expect(card).toContain('if (!estacionConfigurada) {');
    expect(card).toContain('Sin dato reciente del clima');
  });

  it('los umbrales viven en UN solo lugar (UMBRAL_FRESCURA_LECTURA)', () => {
    const clima = readFileSync(resolve(SRC, 'utils/calculosClima.ts'), 'utf8');
    expect(clima).toContain('export const UMBRAL_FRESCURA_LECTURA');

    // Nadie más define sus propios minutos de frescura: ni las tarjetas ni la
    // señal "Estación" de Salud de los datos.
    for (const rel of [
      'components/dashboard/ClimaCard.tsx',
      'components/clima/components/ClimaKPICards.tsx',
      'utils/calculosSaludDatos.ts',
      'components/dashboard/hooks/useSaludDatos.ts',
    ]) {
      const contenido = readFileSync(resolve(SRC, rel), 'utf8');
      expect(contenido).not.toMatch(/const\s+UMBRAL_FRESCURA/);
    }
  });
});
