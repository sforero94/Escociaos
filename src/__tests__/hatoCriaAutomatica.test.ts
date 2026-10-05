/**
 * ESCO-135 — ficha automática de la ternera retenida al registrar un parto.
 *
 * Decisión del dueño (Santiago, 2026-10-02): cuando un parto se registra con
 * `cria_destino = 'retenida'`, el sistema crea la ficha de la cría en
 * `hato_animales` con `nombre = 'SIN NOMBRE'` y la chapeta siguiente de la
 * serie («215, 216, etc»).
 */

import { describe, it, expect } from 'vitest';
import {
  CHAPETA_PROVISIONAL_DESDE,
  NOMBRE_CRIA_SIN_NOMBRE,
  ORIGEN_CRIA_AUTOMATICA,
  calcularSiguienteChapetaCria,
  construirFichaCria,
  crearFichaCriaConReintento,
  debeCrearFichaCria,
  decidirDeshacerCria,
  elegirToroDelServicio,
  mensajeCriaCreada,
  type FichaCriaInsert,
  type ResultadoInsertCria,
} from '@/utils/hato/criaAutomatica';

// Padrón real (2026-10-02, solo lectura): VIKINGA #215 es la activa más
// alta bajo 800; 239/251/442 están vendidas; 800-999 son provisionales y
// FLACA #5182 / PACHA #5202 son atípicas activas.
const PADRON_REAL = [
  { numero: 215, estado: 'activa' },
  { numero: 214, estado: 'activa' },
  { numero: 100, estado: 'activa' },
  { numero: 239, estado: 'vendida' },
  { numero: 251, estado: 'vendida' },
  { numero: 442, estado: 'vendida' },
  { numero: 812, estado: 'activa' },
  { numero: 950, estado: 'activa' },
  { numero: 5182, estado: 'activa' },
  { numero: 5202, estado: 'activa' },
  { numero: null, estado: 'activa' },
  { numero: 600, estado: 'muerta' },
];

describe('debeCrearFichaCria', () => {
  it('solo la hembra retenida crea ficha', () => {
    expect(debeCrearFichaCria('retenida')).toBe(true);
    expect(debeCrearFichaCria('hembra_vendida')).toBe(false);
    expect(debeCrearFichaCria('macho_vendido')).toBe(false);
    expect(debeCrearFichaCria('muerta')).toBe(false);
    expect(debeCrearFichaCria('aborto')).toBe(false);
    expect(debeCrearFichaCria(null)).toBe(false);
    expect(debeCrearFichaCria(undefined)).toBe(false);
  });
});

describe('calcularSiguienteChapetaCria', () => {
  it('con el padrón real, la siguiente es 216', () => {
    expect(calcularSiguienteChapetaCria(PADRON_REAL)).toBe(216);
  });

  it('las vendidas/muertas con número más alto no mueven la serie', () => {
    expect(
      calcularSiguienteChapetaCria([
        { numero: 10, estado: 'activa' },
        { numero: 700, estado: 'vendida' },
        { numero: 701, estado: 'muerta' },
        { numero: 702, estado: 'descartada' },
      ]),
    ).toBe(11);
  });

  it('las provisionales (800-999) y las atípicas (5xxx) no mueven la serie', () => {
    expect(
      calcularSiguienteChapetaCria([
        { numero: 50, estado: 'activa' },
        { numero: CHAPETA_PROVISIONAL_DESDE, estado: 'activa' },
        { numero: 5182, estado: 'activa' },
      ]),
    ).toBe(51);
  });

  it('sin ninguna activa bajo 800 falla en vez de inventar un número', () => {
    expect(() => calcularSiguienteChapetaCria([{ numero: 900, estado: 'activa' }])).toThrow(
      /chapeta/i,
    );
    expect(() => calcularSiguienteChapetaCria([])).toThrow(/chapeta/i);
  });

  it('falla si la siguiente caería en el rango provisional', () => {
    expect(() => calcularSiguienteChapetaCria([{ numero: 799, estado: 'activa' }])).toThrow(
      /800/,
    );
  });
});

describe('elegirToroDelServicio', () => {
  const PARTO = '2026-09-20';

  it('toma el toro del servicio dentro de la ventana de gestación', () => {
    expect(
      elegirToroDelServicio(
        [
          { fecha: '2025-12-15', toro_id: 'toro-a' }, // 279 días antes
          { fecha: '2025-01-10', toro_id: 'toro-viejo' },
        ],
        PARTO,
      ),
    ).toBe('toro-a');
  });

  it('un servicio demasiado reciente no es el que dio este parto', () => {
    expect(elegirToroDelServicio([{ fecha: '2026-08-01', toro_id: 'toro-a' }], PARTO)).toBeNull();
  });

  it('un servicio demasiado viejo tampoco', () => {
    expect(elegirToroDelServicio([{ fecha: '2025-06-01', toro_id: 'toro-a' }], PARTO)).toBeNull();
  });

  it('dos toros distintos en la ventana: no se adivina', () => {
    expect(
      elegirToroDelServicio(
        [
          { fecha: '2025-12-15', toro_id: 'toro-a' },
          { fecha: '2026-01-05', toro_id: 'toro-b' },
        ],
        PARTO,
      ),
    ).toBeNull();
  });

  it('el mismo toro repetido en la ventana sí se acepta', () => {
    expect(
      elegirToroDelServicio(
        [
          { fecha: '2025-12-15', toro_id: 'toro-a' },
          { fecha: '2026-01-05', toro_id: 'toro-a' },
        ],
        PARTO,
      ),
    ).toBe('toro-a');
  });

  it('un servicio sin toro en la ventana deja el padre en NULL', () => {
    expect(elegirToroDelServicio([{ fecha: '2025-12-15', toro_id: null }], PARTO)).toBeNull();
    expect(
      elegirToroDelServicio(
        [
          { fecha: '2025-12-15', toro_id: null },
          { fecha: '2026-01-05', toro_id: 'toro-a' },
        ],
        PARTO,
      ),
    ).toBeNull();
  });

  it('sin servicios, NULL', () => {
    expect(elegirToroDelServicio([], PARTO)).toBeNull();
  });
});

describe('construirFichaCria', () => {
  it('arma la fila con SIN NOMBRE, ternera, nacimiento y la madre', () => {
    const fila = construirFichaCria({
      numero: 216,
      madreId: 'madre-1',
      fincaId: 'finca-1',
      fechaParto: '2026-09-20',
      fechaPartoConfianza: 'exacta',
      padreToroId: 'toro-a',
      createdBy: 'user-1',
      fuente: 'telegram',
    });
    expect(fila).toEqual<FichaCriaInsert>({
      numero: 216,
      nombre: NOMBRE_CRIA_SIN_NOMBRE,
      sexo: 'hembra',
      etapa: 'ternera',
      estado: 'activa',
      fecha_nacimiento: '2026-09-20',
      fecha_nacimiento_confianza: 'exacta',
      madre_id: 'madre-1',
      padre_toro_id: 'toro-a',
      finca_id: 'finca-1',
      origen: 'nacimiento',
      import_meta: {
        origen: ORIGEN_CRIA_AUTOMATICA,
        fuente: 'telegram',
        madre_id: 'madre-1',
        fecha_parto: '2026-09-20',
        ticket: 'ESCO-135',
      },
      notas: expect.stringContaining('ESCO-135') as unknown as string,
      created_by: 'user-1',
    });
    expect(NOMBRE_CRIA_SIN_NOMBRE).toBe('SIN NOMBRE');
  });

  it('hereda la confianza aproximada del parto, sin raza inventada', () => {
    const fila = construirFichaCria({
      numero: 216,
      madreId: 'm',
      fincaId: null,
      fechaParto: '2026-09-20',
      fechaPartoConfianza: 'aproximada',
      padreToroId: null,
      createdBy: null,
      fuente: 'web',
    });
    expect(fila.fecha_nacimiento_confianza).toBe('aproximada');
    expect(fila.padre_toro_id).toBeNull();
    expect(fila.finca_id).toBeNull();
    expect('raza' in fila).toBe(false);
  });
});

describe('crearFichaCriaConReintento', () => {
  const base = {
    madreId: 'madre-1',
    fincaId: 'finca-1',
    fechaParto: '2026-09-20',
    fechaPartoConfianza: 'exacta' as const,
    padreToroId: null,
    createdBy: 'user-1',
    fuente: 'telegram' as const,
  };

  it('inserta con la siguiente chapeta a la primera', async () => {
    const insertadas: FichaCriaInsert[] = [];
    const r = await crearFichaCriaConReintento(
      {
        leerChapetasActivas: async () => PADRON_REAL,
        insertar: async (fila) => {
          insertadas.push(fila);
          return { id: 'cria-1' };
        },
      },
      base,
    );
    expect(r).toEqual({ id: 'cria-1', numero: 216 });
    expect(insertadas).toHaveLength(1);
  });

  it('ante 23505 recalcula y reintenta UNA vez', async () => {
    let lecturas = 0;
    const numeros: number[] = [];
    const r = await crearFichaCriaConReintento(
      {
        leerChapetasActivas: async () => {
          lecturas += 1;
          return lecturas === 1
            ? PADRON_REAL
            : [...PADRON_REAL, { numero: 216, estado: 'activa' }];
        },
        insertar: async (fila): Promise<ResultadoInsertCria> => {
          numeros.push(fila.numero);
          return fila.numero === 216
            ? { error: { code: '23505', message: 'duplicate key' } }
            : { id: 'cria-2' };
        },
      },
      base,
    );
    expect(numeros).toEqual([216, 217]);
    expect(r).toEqual({ id: 'cria-2', numero: 217 });
  });

  it('dos 23505 seguidos: falla con mensaje claro', async () => {
    await expect(
      crearFichaCriaConReintento(
        {
          leerChapetasActivas: async () => PADRON_REAL,
          insertar: async () => ({ error: { code: '23505', message: 'duplicate key' } }),
        },
        base,
      ),
    ).rejects.toThrow(/chapeta/i);
  });

  it('otro error no se reintenta', async () => {
    let intentos = 0;
    await expect(
      crearFichaCriaConReintento(
        {
          leerChapetasActivas: async () => PADRON_REAL,
          insertar: async () => {
            intentos += 1;
            return { error: { code: '42501', message: 'permission denied' } };
          },
        },
        base,
      ),
    ).rejects.toThrow(/permission denied/);
    expect(intentos).toBe(1);
  });
});

describe('mensajeCriaCreada', () => {
  it('dice la chapeta y el nombre', () => {
    expect(mensajeCriaCreada(216)).toBe('Ternera creada: #216 SIN NOMBRE');
  });
});

describe('decidirDeshacerCria', () => {
  const criaIntacta = {
    id: 'cria-1',
    madre_id: 'madre-1',
    nombre: 'SIN NOMBRE',
    estado: 'activa',
    import_meta: { origen: ORIGEN_CRIA_AUTOMATICA },
  };

  it('sin cría vinculada no hay nada que borrar', () => {
    expect(
      decidirDeshacerCria({ cria: null, madreId: 'madre-1', referencias: 0 }),
    ).toEqual({ accion: 'sin_cria' });
  });

  it('borra la cría intacta creada por este flujo', () => {
    expect(
      decidirDeshacerCria({ cria: criaIntacta, madreId: 'madre-1', referencias: 0 }),
    ).toEqual({ accion: 'borrar', criaId: 'cria-1' });
  });

  it('rechaza si la cría no la creó el flujo automático', () => {
    const r = decidirDeshacerCria({
      cria: { ...criaIntacta, import_meta: null },
      madreId: 'madre-1',
      referencias: 0,
    });
    expect(r.accion).toBe('rechazar');
  });

  it('rechaza si la madre no coincide', () => {
    expect(
      decidirDeshacerCria({ cria: criaIntacta, madreId: 'otra', referencias: 0 }).accion,
    ).toBe('rechazar');
  });

  it('rechaza si ya la bautizaron', () => {
    expect(
      decidirDeshacerCria({
        cria: { ...criaIntacta, nombre: 'ESTRELLA' },
        madreId: 'madre-1',
        referencias: 0,
      }).accion,
    ).toBe('rechazar');
  });

  it('rechaza si ya no está activa', () => {
    expect(
      decidirDeshacerCria({
        cria: { ...criaIntacta, estado: 'vendida' },
        madreId: 'madre-1',
        referencias: 0,
      }).accion,
    ).toBe('rechazar');
  });

  it('rechaza si la cría ya tiene registros propios', () => {
    expect(
      decidirDeshacerCria({ cria: criaIntacta, madreId: 'madre-1', referencias: 1 }).accion,
    ).toBe('rechazar');
  });
});
