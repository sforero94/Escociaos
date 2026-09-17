import { describe, it, expect } from 'vitest';
import { agruparNovedades } from '@/utils/novedades/agrupar';
import { frasearRegistrosTrabajo } from '@/utils/novedades/frases';
import type { NovedadCruda } from '@/utils/novedades/tipos';

/**
 * `agrupar.ts` es el motor de agrupamiento de "Novedades" (issue #266) --
 * las fixtures de acá replican, con datos más chicos, los casos reales de
 * producción que el plan técnico exige verificar literalmente (§13.1):
 * la sesión con jornales fraccionarios y fechas repartidas, el año que
 * salta cuando difiere del de captura, dos autores el mismo día que NUNCA
 * se funden, una ronda que cruza dos días naturales en una sola línea, y
 * una fila sin autor.
 */

function cruda(sobrescribir: Partial<NovedadCruda>): NovedadCruda {
  return {
    fuente: 'fin_gastos',
    modulo: 'finanzas',
    tipoHecho: 'gasto',
    claveGrano: 'clave-por-defecto',
    autorId: 'autor-1',
    autorTextoLibre: null,
    canal: null,
    capturadoEn: '2026-09-12T10:00:00Z',
    fechaHecho: '2026-09-12',
    objetoNombre: null,
    tamano: { filas: 1 },
    ruta: null,
    ...sobrescribir,
  };
}

const HOY = '2026-09-16';

describe('agruparNovedades — fusión por claveGrano', () => {
  it('funde una sesión de registros_trabajo: suma jornales fraccionarios, cuenta personas DISTINTAS, junta fechas', () => {
    // `tamano.personas` (no `objetos`, desde el guardrail 2026-09-17 que
    // reserva `objetos`/`objetosNombre` para nombrar la LABOR).
    const clave = 'aguacate|registros_trabajo|jornal|autor-1|2026-09-12';
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        capturadoEn: '2026-09-12T13:00:00Z', fechaHecho: '2026-09-07',
        tamano: { filas: 1.0, personas: 1 }, // primera vez de p1
      }),
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        capturadoEn: '2026-09-12T13:01:00Z', fechaHecho: '2026-09-07',
        tamano: { filas: 0.5, personas: 1 }, // primera vez de p2
      }),
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        capturadoEn: '2026-09-12T13:02:00Z', fechaHecho: '2026-09-12',
        tamano: { filas: 0.25, personas: undefined }, // p1 de nuevo -- NO vuelve a sumar
      }),
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        capturadoEn: '2026-09-12T13:03:00Z', fechaHecho: '2026-09-12',
        tamano: { filas: 1.0, personas: 1 }, // primera vez de p3
      }),
    ];

    const { grupos } = agruparNovedades(filas, HOY);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].novedades).toHaveLength(1);
    const [n] = grupos[0].novedades;
    expect(n.tamano.filas).toBeCloseTo(2.75);
    expect(n.tamano.personas).toBe(3); // p1, p2, p3 -- nunca 4
    expect(n.fechasHecho).toEqual(['2026-09-07', '2026-09-12']);
    expect(n.capturadoEn).toBe('2026-09-12T13:03:00Z'); // el más reciente del grupo
  });

  it('reproduce el caso real de producción del 12-sep: 66 filas se funden en UNA línea de 43,5 jornales / 9 personas / rango 7→12 de septiembre (§1 y §13.1 del plan técnico)', () => {
    const AUTOR = 'david';
    const clave = 'aguacate|registros_trabajo|jornal|david|2026-09-12';
    const PERSONAS = Array.from({ length: 9 }, (_, i) => `persona-${i + 1}`);
    const FECHAS = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12'];

    // 42 filas de 0,75 + 24 filas de 0,5 = 66 filas / 43,5 jornales exactos --
    // mismo criterio que registrosTrabajo.ts: `tamano.personas = 1` sólo en
    // la PRIMERA aparición de cada persona dentro de la sesión (campo
    // separado de `objetos` desde el guardrail 2026-09-17: `objetoNombre`
    // ahora nombra la LABOR, así que el conteo de personas no puede vivir en
    // el mismo campo que la regla genérica de `agrupar.ts` deriva de él).
    // Nombre real de producción (verificado en vivo 2026-09-17).
    const LABOR = 'Recolección cosecha principal 2027';
    const personasVistas = new Set<string>();
    const filas: NovedadCruda[] = Array.from({ length: 66 }, (_, i) => {
      const persona = PERSONAS[i % 9];
      const fecha = FECHAS[i % 6];
      const fraccion = i < 42 ? 0.75 : 0.5;
      const esPrimeraVez = !personasVistas.has(persona);
      if (esPrimeraVez) personasVistas.add(persona);
      return cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        autorId: AUTOR,
        capturadoEn: `2026-09-12T${String(8 + Math.floor(i / 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
        fechaHecho: fecha,
        objetoNombre: LABOR,
        tamano: { filas: fraccion, personas: esPrimeraVez ? 1 : undefined },
      });
    });

    const { grupos } = agruparNovedades(filas, HOY, new Map([[AUTOR, 'David García']]));
    expect(grupos.flatMap((g) => g.novedades)).toHaveLength(1);
    const [n] = grupos.flatMap((g) => g.novedades);
    expect(n.tamano.filas).toBeCloseTo(43.5);
    expect(n.tamano.personas).toBe(9);
    expect(n.fechasHecho).toEqual(FECHAS);

    // Fixture → agrupador → plantilla, extremo a extremo: la frase literal
    // que el brief (§4.1) y el plan técnico (§13.1) exigen ver en pantalla,
    // ahora con la labor nombrada (guardrail 2026-09-17).
    const { texto, detalle } = frasearRegistrosTrabajo(n);
    expect(texto).toBe('David García registró 43,5 jornales en Recolección cosecha principal 2027 para 9 personas');
    expect(detalle).toBe('trabajo del 7 de septiembre al 12 de septiembre');
  });

  it('imprime el año en la fila con fecha de trabajo del año pasado (el caso del 15-sep)', () => {
    const clave = 'aguacate|registros_trabajo|jornal|david|2026-09-15';
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        autorId: 'david', capturadoEn: '2026-09-15T08:37:00Z', fechaHecho: '2025-09-14',
        tamano: { filas: 1.0, objetos: 1 },
      }),
      cruda({
        fuente: 'registros_trabajo', modulo: 'aguacate', tipoHecho: 'jornal', claveGrano: clave,
        autorId: 'david', capturadoEn: '2026-09-15T08:38:00Z', fechaHecho: '2026-09-14',
        tamano: { filas: 1.0, objetos: 1 },
      }),
    ];

    const { grupos } = agruparNovedades(filas, HOY);
    const [n] = grupos[0].novedades;
    expect(n.fechasHecho).toEqual(['2025-09-14', '2026-09-14']);
  });

  it('marca conFechaFutura cuando la fecha del hecho es posterior a hoy (Bogotá)', () => {
    const filas: NovedadCruda[] = [
      cruda({ claveGrano: 'gasto-futuro', capturadoEn: '2026-09-16T01:00:00Z', fechaHecho: '2026-09-20' }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    expect(grupos[0].novedades[0].conFechaFutura).toBe(true);
  });

  it('no marca conFechaFutura cuando la fecha del hecho es hoy o antes', () => {
    const filas: NovedadCruda[] = [
      cruda({ claveGrano: 'gasto-hoy', capturadoEn: '2026-09-16T01:00:00Z', fechaHecho: HOY }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    expect(grupos[0].novedades[0].conFechaFutura).toBe(false);
  });

  it('conserva el denominador del pesaje sin sumarlo entre filas (52 de 65, nunca 130 de 130)', () => {
    const clave = 'hato_pesajes_leche|2026-08-27';
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'hato_pesajes_leche', modulo: 'hato_lechero', tipoHecho: 'pesaje', claveGrano: clave,
        capturadoEn: '2026-08-27T20:00:00Z', fechaHecho: '2026-08-27', tamano: { filas: 1, denominador: 65 },
      }),
      cruda({
        fuente: 'hato_pesajes_leche', modulo: 'hato_lechero', tipoHecho: 'pesaje', claveGrano: clave,
        capturadoEn: '2026-08-27T20:05:00Z', fechaHecho: '2026-08-27', tamano: { filas: 1, denominador: 65 },
      }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    const [n] = grupos[0].novedades;
    expect(n.tamano.filas).toBe(2);
    expect(n.tamano.denominador).toBe(65);
  });

  // Guardrail 2026-09-17 (Santiago): `montoTotal` es una SUMA llana (cada
  // gasto es distinto, nada que deduplicar) -- a diferencia de `denominador`
  // arriba, que se conserva, y de `personas`/`objetos`, que son marginales.
  it('suma montoTotal de una sesión de fin_gastos (15 gastos, $547.900)', () => {
    const clave = 'finanzas|fin_gastos|gasto|consuelito|2026-09-11';
    const valores = [50_000, 120_000, 89_900, 47_500, 240_500];
    const filas: NovedadCruda[] = valores.map((valor, i) =>
      cruda({
        fuente: 'fin_gastos', modulo: 'finanzas', tipoHecho: 'gasto', claveGrano: clave,
        capturadoEn: `2026-09-11T1${i}:00:00Z`, fechaHecho: '2026-09-11',
        tamano: { filas: 1, montoTotal: valor },
      }),
    );
    const { grupos } = agruparNovedades(filas, HOY);
    const [n] = grupos[0].novedades;
    expect(n.tamano.filas).toBe(5);
    expect(n.tamano.montoTotal).toBe(547_900);
  });

  it('una ronda de monitoreo que cruza dos días naturales es UNA línea, nunca dos', () => {
    const clave = 'monitoreos|ronda|ronda-29-agosto';
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'monitoreos', modulo: 'aguacate', tipoHecho: 'ronda', claveGrano: clave,
        capturadoEn: '2026-08-29T15:00:00Z', fechaHecho: '2026-08-29', objetoNombre: 'Efrain',
        tamano: { filas: 1 },
      }),
      cruda({
        fuente: 'monitoreos', modulo: 'aguacate', tipoHecho: 'ronda', claveGrano: clave,
        capturadoEn: '2026-08-30T09:00:00Z', fechaHecho: '2026-08-30', objetoNombre: 'Efrain',
        tamano: { filas: 1 },
      }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    expect(grupos.flatMap((g) => g.novedades)).toHaveLength(1);
    const [n] = grupos.flatMap((g) => g.novedades);
    expect(n.tamano.filas).toBe(2);
    expect(n.fechasHecho).toEqual(['2026-08-29', '2026-08-30']);
    expect(n.objetosNombre).toEqual(['Efrain']);
  });

  it('dos autores el mismo día y el mismo tipo NUNCA se funden', () => {
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'hato_eventos', modulo: 'hato_lechero', tipoHecho: 'parto',
        claveGrano: 'hato_lechero|hato_eventos|parto|martha|2026-09-10', autorId: 'martha',
        capturadoEn: '2026-09-10T20:00:00Z', fechaHecho: '2026-09-10',
      }),
      cruda({
        fuente: 'hato_eventos', modulo: 'hato_lechero', tipoHecho: 'parto',
        claveGrano: 'hato_lechero|hato_eventos|parto|fernando|2026-09-10', autorId: 'fernando',
        capturadoEn: '2026-09-10T21:00:00Z', fechaHecho: '2026-09-10',
      }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    expect(grupos.flatMap((g) => g.novedades)).toHaveLength(2);
  });

  it('una fila sin autor produce autorId/autorNombre null, nunca un nombre inventado', () => {
    const filas: NovedadCruda[] = [
      cruda({
        fuente: 'hato_eventos', modulo: 'hato_lechero', tipoHecho: 'servicio',
        claveGrano: 'hato_lechero|hato_eventos|servicio|sin-autor|2026-09-10', autorId: null,
        capturadoEn: '2026-09-10T20:00:00Z', fechaHecho: '2026-09-10',
      }),
    ];
    const autores = new Map([['martha', 'Martha Vega']]); // deliberadamente sin la clave null
    const { grupos } = agruparNovedades(filas, HOY, autores);
    const [n] = grupos[0].novedades;
    expect(n.autorId).toBeNull();
    expect(n.autorNombre).toBeNull();
  });

  it('resuelve autorNombre desde el mapa de autores por id', () => {
    const filas: NovedadCruda[] = [cruda({ claveGrano: 'gasto-1', autorId: 'consuelito' })];
    const autores = new Map([['consuelito', 'Consuelo Ramírez']]);
    const { grupos } = agruparNovedades(filas, HOY, autores);
    expect(grupos[0].novedades[0].autorNombre).toBe('Consuelo Ramírez');
  });
});

describe('agruparNovedades — orden y encabezados de día', () => {
  it('ordena SIEMPRE por capturadoEn descendente, sin excepciones', () => {
    const filas: NovedadCruda[] = [
      cruda({ claveGrano: 'a', capturadoEn: '2026-09-14T10:00:00Z' }),
      cruda({ claveGrano: 'b', capturadoEn: '2026-09-16T10:00:00Z' }),
      cruda({ claveGrano: 'c', capturadoEn: '2026-09-15T10:00:00Z' }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    const orden = grupos.flatMap((g) => g.novedades).map((n) => n.id);
    expect(orden).toEqual(['b', 'c', 'a']);
  });

  it('rotula Hoy / Ayer — <día> / <día> plano según la distancia a "hoy"', () => {
    const filas: NovedadCruda[] = [
      cruda({ claveGrano: 'hoy', capturadoEn: '2026-09-16T10:00:00Z' }),
      cruda({ claveGrano: 'ayer', capturadoEn: '2026-09-15T10:00:00Z' }),
      cruda({ claveGrano: 'antier', capturadoEn: '2026-09-13T10:00:00Z' }),
    ];
    const { grupos } = agruparNovedades(filas, HOY);
    const encabezados = grupos.map((g) => g.encabezado);
    expect(encabezados).toEqual(['Hoy', 'Ayer — martes 15 de septiembre', 'domingo 13 de septiembre']);
  });

  it('respeta el tope duro de 20 líneas y deja un pie con el resto', () => {
    const filas: NovedadCruda[] = Array.from({ length: 25 }, (_, i) =>
      cruda({ claveGrano: `linea-${i}`, capturadoEn: `2026-09-1${i % 6}T10:00:00Z` }),
    );
    const { grupos, notaPie } = agruparNovedades(filas, HOY);
    expect(grupos.flatMap((g) => g.novedades)).toHaveLength(20);
    expect(notaPie).toBe('y 5 más en los últimos 7 días');
  });

  it('no deja pie cuando el total no supera el tope', () => {
    const filas: NovedadCruda[] = [cruda({ claveGrano: 'una-sola' })];
    const { notaPie } = agruparNovedades(filas, HOY);
    expect(notaPie).toBeNull();
  });
});
