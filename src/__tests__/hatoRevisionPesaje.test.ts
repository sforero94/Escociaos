// ARCHIVO: __tests__/hatoRevisionPesaje.test.ts
// DESCRIPCIÓN: Lógica pura de la grilla de revisión post-OCR del pesaje
// (`utils/hato/revisionPesaje.ts`), el ajuste del dueño de 2026-08-11:
// agregar y quitar vacas además de editar celdas.
//
// Lo que protegen estos tests, en orden de importancia:
//   1. Quitar una vaca BORRA sus litros. Es el peor bug posible de este
//      diálogo: una fila que ya no está en pantalla pero cuyos valores
//      siguen viajando en el commit.
//   2. El payload sale de LA GRILLA, no del diff del OCR -- una fila
//      agregada a mano no existe en el diff, y una quitada sí sigue ahí.
//   3. "Disponibles para agregar" = roster menos grilla, siempre, en las dos
//      direcciones: agregar saca de la lista, quitar devuelve a ella.

import { describe, it, expect } from 'vitest';
import {
  agregarFilaRevision,
  celdasParaCommitDesdeGrilla,
  claveCeldaPesaje,
  filasInicialesRevision,
  quitarFilaRevision,
  rosterCompletoRevision,
  vacasDisponiblesParaAgregar,
  type CeldaEditablePesaje,
  type FilaRevisionPesaje,
} from '@/utils/hato/revisionPesaje';
import type { CeldaDiffPesaje, SemanaPesaje } from '@/utils/importHato/ocrPesaje';

const FECHAS_5: Record<SemanaPesaje, string | null> = {
  1: '2026-07-01',
  2: '2026-07-08',
  3: '2026-07-15',
  4: '2026-07-22',
  5: '2026-07-29',
};

const FECHAS_4: Record<SemanaPesaje, string | null> = {
  1: '2026-08-05',
  2: '2026-08-12',
  3: '2026-08-19',
  4: '2026-08-26',
  5: null, // agosto 2026 solo tiene 4 miércoles
};

function celdaDiff(animalId: string, nombre: string, semana: SemanaPesaje, fecha: string): CeldaDiffPesaje {
  return {
    animalId,
    nombre,
    semana,
    fecha,
    litrosAm: 7,
    litrosPm: 6,
    litrosTotal: 13,
    clasificacion: 'nuevo',
    noConfiable: false,
    soloUnOrdeno: false,
    existenteId: null,
  } as CeldaDiffPesaje;
}

function valores(entradas: Array<[string, SemanaPesaje, number | undefined, number | undefined]>): Map<string, CeldaEditablePesaje> {
  const mapa = new Map<string, CeldaEditablePesaje>();
  for (const [animalId, semana, am, pm] of entradas) {
    mapa.set(claveCeldaPesaje(animalId, semana), { litrosAm: am, litrosPm: pm, noConfiable: false });
  }
  return mapa;
}

const MONZA: FilaRevisionPesaje = { animalId: 'id-monza', nombre: 'MONZA' };
const ALINA: FilaRevisionPesaje = { animalId: 'id-alina', nombre: 'ALINA' };

describe('filasInicialesRevision', () => {
  it('una fila por vaca aunque el diff traiga varias semanas de la misma', () => {
    const diff = [
      celdaDiff('id-alina', 'ALINA', 1, '2026-07-01'),
      celdaDiff('id-alina', 'ALINA', 2, '2026-07-08'),
      celdaDiff('id-monza', 'MONZA', 1, '2026-07-01'),
    ];
    expect(filasInicialesRevision(diff)).toEqual([ALINA, MONZA]);
  });

  it('ordena alfabéticamente, igual que la planilla impresa', () => {
    const diff = [celdaDiff('id-z', 'ZULEMA', 1, '2026-07-01'), celdaDiff('id-a', 'ÁGUEDA', 1, '2026-07-01')];
    expect(filasInicialesRevision(diff).map((f) => f.nombre)).toEqual(['ÁGUEDA', 'ZULEMA']);
  });

  it('un diff vacío da una grilla vacía, no revienta', () => {
    expect(filasInicialesRevision([])).toEqual([]);
  });
});

describe('rosterCompletoRevision', () => {
  // `vacasSinLeer` es, por definición, el complemento de lo que el OCR ancló
  // -- así que la unión reconstruye el roster impreso sin consultar nada.
  it('une lo leído con lo no leído, sin duplicar', () => {
    const diff = [celdaDiff('id-alina', 'ALINA', 1, '2026-07-01')];
    expect(rosterCompletoRevision(diff, [MONZA])).toEqual([ALINA, MONZA]);
  });

  it('sin vacas sin leer, el roster es lo que leyó el OCR', () => {
    const diff = [celdaDiff('id-alina', 'ALINA', 1, '2026-07-01')];
    expect(rosterCompletoRevision(diff, [])).toEqual([ALINA]);
  });
});

describe('vacasDisponiblesParaAgregar', () => {
  const roster = [ALINA, MONZA];

  it('el caso MONZA: la que el OCR saltó es justo la que ofrece el menú', () => {
    expect(vacasDisponiblesParaAgregar(roster, [ALINA])).toEqual([MONZA]);
  });

  it('con la grilla completa no queda nada por agregar', () => {
    expect(vacasDisponiblesParaAgregar(roster, roster)).toEqual([]);
  });

  it('agregar la saca de la lista y quitarla la devuelve -- las dos direcciones', () => {
    const conMonza = agregarFilaRevision([ALINA], MONZA);
    expect(vacasDisponiblesParaAgregar(roster, conMonza)).toEqual([]);

    const { filas: sinMonza } = quitarFilaRevision(conMonza, new Map(), MONZA.animalId);
    expect(vacasDisponiblesParaAgregar(roster, sinMonza)).toEqual([MONZA]);
  });
});

describe('agregarFilaRevision', () => {
  it('inserta en orden alfabético, no al final', () => {
    expect(agregarFilaRevision([MONZA], ALINA)).toEqual([ALINA, MONZA]);
  });

  it('es idempotente -- un doble toque en el móvil no duplica la fila', () => {
    const una = agregarFilaRevision([ALINA], MONZA);
    expect(agregarFilaRevision(una, MONZA)).toEqual([ALINA, MONZA]);
  });
});

describe('quitarFilaRevision', () => {
  it('borra la fila Y todos sus valores -- ninguna semana sobrevive', () => {
    const previos = valores([
      ['id-monza', 1, 7, 6],
      ['id-monza', 3, 8, undefined],
      ['id-alina', 1, 5, 5],
    ]);
    const { filas, valores: restantes } = quitarFilaRevision([ALINA, MONZA], previos, 'id-monza');

    expect(filas).toEqual([ALINA]);
    expect([...restantes.keys()].some((k) => k.startsWith('id-monza'))).toBe(false);
    // La otra vaca queda intacta.
    expect(restantes.get(claveCeldaPesaje('id-alina', 1))).toEqual({ litrosAm: 5, litrosPm: 5, noConfiable: false });
  });

  it('no muta lo que recibe -- el estado previo de React queda intacto', () => {
    const previos = valores([['id-monza', 1, 7, 6]]);
    const filasPrevias = [ALINA, MONZA];
    quitarFilaRevision(filasPrevias, previos, 'id-monza');

    expect(filasPrevias).toEqual([ALINA, MONZA]);
    expect(previos.size).toBe(1);
  });

  it('quitar una vaca que no está no rompe nada', () => {
    const { filas } = quitarFilaRevision([ALINA], new Map(), 'id-inexistente');
    expect(filas).toEqual([ALINA]);
  });
});

describe('celdasParaCommitDesdeGrilla', () => {
  it('una vaca AGREGADA a mano sí llega al commit, aunque no exista en el diff', () => {
    const celdas = celdasParaCommitDesdeGrilla([MONZA], valores([['id-monza', 2, 9, 8]]), FECHAS_5);
    expect(celdas).toEqual([{ animalId: 'id-monza', fecha: '2026-07-08', litrosAm: 9, litrosPm: 8 }]);
  });

  it('una vaca QUITADA no llega, aunque el OCR la hubiera leído', () => {
    const previos = valores([
      ['id-monza', 1, 7, 6],
      ['id-alina', 1, 5, 5],
    ]);
    const { filas, valores: restantes } = quitarFilaRevision([ALINA, MONZA], previos, 'id-monza');
    const celdas = celdasParaCommitDesdeGrilla(filas, restantes, FECHAS_5);

    expect(celdas.some((c) => c.animalId === 'id-monza')).toBe(false);
    expect(celdas).toHaveLength(1);
  });

  it('una celda en blanco es "no se pesó" y NO se escribe -- nunca un 0', () => {
    const celdas = celdasParaCommitDesdeGrilla(
      [ALINA],
      valores([
        ['id-alina', 1, undefined, undefined],
        ['id-alina', 2, 7, undefined],
      ]),
      FECHAS_5,
    );
    expect(celdas).toEqual([{ animalId: 'id-alina', fecha: '2026-07-08', litrosAm: 7, litrosPm: null }]);
  });

  it('un solo ordeño escrito sí entra, con el otro en null', () => {
    const celdas = celdasParaCommitDesdeGrilla([ALINA], valores([['id-alina', 1, undefined, 6]]), FECHAS_5);
    expect(celdas).toEqual([{ animalId: 'id-alina', fecha: '2026-07-01', litrosAm: null, litrosPm: 6 }]);
  });

  it('una semana que ese mes no existe nunca se escribe, aunque tenga valores', () => {
    // Agosto 2026 tiene 4 miércoles: la semana 5 no tiene fecha real.
    const celdas = celdasParaCommitDesdeGrilla([ALINA], valores([['id-alina', 5, 7, 6]]), FECHAS_4);
    expect(celdas).toEqual([]);
  });

  it('una grilla vacía produce un payload vacío', () => {
    expect(celdasParaCommitDesdeGrilla([], valores([['id-alina', 1, 7, 6]]), FECHAS_5)).toEqual([]);
  });
});
