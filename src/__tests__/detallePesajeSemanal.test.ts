import { describe, expect, it } from 'vitest';
import { proyectarHato } from '@/utils/hatoProduccion';
import {
  VENTANA_CAPTURA_MS,
  borradorInicial,
  elegirCaptura,
  listarPesajesDeSemana,
  parseLitrosCampo,
  planBorrarPesaje,
  planGuardarBorrador,
  rangoSemanaMedida,
  textoLitros,
  type CapturaPesajeCandidata,
  type FilaPesajeSemana,
} from '@/utils/hato/detallePesajeSemanal';

const REF = '2026-07-28';

function fila(parcial: Partial<FilaPesajeSemana> & Pick<FilaPesajeSemana, 'id' | 'fecha'>): FilaPesajeSemana {
  return {
    animal_id: parcial.animal_id ?? parcial.id,
    litros_total: parcial.litros_total ?? 0,
    litros_am: parcial.litros_am ?? null,
    litros_pm: parcial.litros_pm ?? null,
    fuente: parcial.fuente ?? 'foto',
    created_at: parcial.created_at ?? '2026-07-15T19:00:00.000Z',
    created_by: parcial.created_by ?? null,
    ...parcial,
  };
}

function captura(parcial: Partial<CapturaPesajeCandidata> & Pick<CapturaPesajeCandidata, 'id'>): CapturaPesajeCandidata {
  return {
    anio: 2026,
    mes: 7,
    storageBucket: 'hato-pesajes-fotos',
    storageRutas: ['pesaje-foto/a/pagina-1.jpg'],
    storageOk: true,
    createdBy: 'user-1',
    creadoEn: '2026-07-15T19:00:00.000Z',
    origen: 'web',
    desenlace: 'ok',
    ...parcial,
  };
}

describe('rangoSemanaMedida', () => {
  it('coincide con la ventana que suma proyectarHato', () => {
    const esperados: Record<number, { inicio: string; fin: string }> = {
      0: { inicio: '2026-07-22', fin: '2026-07-28' },
      [-1]: { inicio: '2026-07-15', fin: '2026-07-21' },
      [-2]: { inicio: '2026-07-08', fin: '2026-07-14' },
      [-3]: { inicio: '2026-07-01', fin: '2026-07-07' },
    };
    const pesajes = [
      { animal_id: 'fuera', fecha: '2026-06-30', litros_total: 100 },
    ];
    for (const [semanaTexto, rango] of Object.entries(esperados)) {
      const semana = Number(semanaTexto);
      expect(rangoSemanaMedida(REF, semana)).toEqual(rango);
      pesajes.push(
        { animal_id: `a${semana}`, fecha: rango.inicio, litros_total: 3 },
        { animal_id: `b${semana}`, fecha: rango.fin, litros_total: 4 },
      );
    }
    const serie = proyectarHato({
      pesajes,
      fechaReferencia: REF,
      horizonteSemanas: 0,
      ventanaMedidaSemanas: 4,
    });
    for (const semana of [0, -1, -2, -3]) {
      expect(serie.find((s) => s.semana === semana)?.litrosDia).toBe(7);
    }
  });

  it('rechaza una semana proyectada', () => {
    expect(() => rangoSemanaMedida(REF, 1)).toThrow(/semana medida inválida/);
  });
});

describe('listarPesajesDeSemana', () => {
  it('abre mañana y tarde cuando la fecha trae turno', () => {
    const pesajes = listarPesajesDeSemana([
      fila({ id: '1', fecha: '2026-07-15', litros_am: 10, litros_pm: 8, litros_total: 18 }),
    ]);
    expect(pesajes.map((p) => p.etiqueta)).toEqual(['Mañana', 'Tarde']);
    expect(pesajes.map((p) => p.clave)).toEqual(['2026-07-15|am', '2026-07-15|pm']);
  });

  it('una jornada cuando nadie tiene mañana ni tarde', () => {
    const pesajes = listarPesajesDeSemana([
      fila({ id: '1', fecha: '2026-07-15', litros_total: 18 }),
      fila({ id: '2', fecha: '2026-07-15', litros_total: 12, animal_id: 'b' }),
    ]);
    expect(pesajes).toHaveLength(1);
    expect(pesajes[0].etiqueta).toBe('Pesaje');
    expect(pesajes[0].turno).toBeNull();
  });

  it('no junta dos fechas en un solo pesaje', () => {
    const pesajes = listarPesajesDeSemana([
      fila({ id: '1', fecha: '2026-07-15', litros_total: 10 }),
      fila({ id: '2', fecha: '2026-07-16', litros_total: 11 }),
    ]);
    expect(pesajes.map((p) => p.fecha)).toEqual(['2026-07-15', '2026-07-16']);
  });
});

describe('elegirCaptura', () => {
  const filas = [fila({ id: '1', fecha: '2026-07-15', created_at: '2026-07-15T19:00:00.000Z', created_by: 'martha' })];
  const meses = [{ anio: 2026, mes: 7 }];

  it('acepta el borde de 36 h y rechaza un milisegundo más', () => {
    const dentro = captura({
      id: 'dentro',
      creadoEn: new Date(Date.parse('2026-07-15T19:00:00.000Z') + VENTANA_CAPTURA_MS).toISOString(),
    });
    const fuera = captura({
      id: 'fuera',
      creadoEn: new Date(Date.parse('2026-07-15T19:00:00.000Z') + VENTANA_CAPTURA_MS + 1).toISOString(),
      storageRutas: ['pesaje-foto/b/pagina-1.jpg'],
    });
    const fotos = elegirCaptura([dentro, fuera], filas, meses);
    expect(fotos.ligada?.id).toBe('dentro');
    expect(fotos.delMes.map((c) => c.id)).toEqual(['fuera']);
  });

  it('prefiere ok, luego el mismo autor, luego la más cercana', () => {
    const pendienteCerca = captura({
      id: 'pendiente',
      desenlace: 'pendiente',
      creadoEn: '2026-07-15T19:10:00.000Z',
      createdBy: 'otro',
    });
    const okLejosMismoAutor = captura({
      id: 'ok-autor',
      desenlace: 'ok',
      creadoEn: '2026-07-16T18:00:00.000Z',
      createdBy: 'martha',
    });
    const okCercaOtroAutor = captura({
      id: 'ok-otro',
      desenlace: 'ok',
      creadoEn: '2026-07-15T20:00:00.000Z',
      createdBy: 'otro',
    });
    expect(elegirCaptura([pendienteCerca, okLejosMismoAutor, okCercaOtroAutor], filas, meses).ligada?.id).toBe(
      'ok-autor',
    );
  });

  it('sin liga, deja las fotos del mes', () => {
    const vieja = captura({ id: 'vieja', creadoEn: '2026-06-01T00:00:00.000Z', mes: 7, anio: 2026 });
    const fotos = elegirCaptura([vieja], filas, meses);
    expect(fotos.ligada).toBeNull();
    expect(fotos.delMes.map((c) => c.id)).toEqual(['vieja']);
  });
});

describe('parseLitrosCampo', () => {
  it('lee coma, cero y vacío, y rechaza negativo', () => {
    expect(parseLitrosCampo('12,5')).toEqual({ ok: true, valor: 12.5 });
    expect(parseLitrosCampo('0')).toEqual({ ok: true, valor: 0 });
    expect(parseLitrosCampo('')).toEqual({ ok: true, valor: null });
    expect(parseLitrosCampo('-1').ok).toBe(false);
    expect(textoLitros(0)).toBe('0');
    expect(textoLitros(null)).toBe('');
  });
});

describe('planBorrarPesaje', () => {
  it('anula la mañana y conserva la tarde', () => {
    const plan = planBorrarPesaje(
      [
        fila({ id: 'ambas', fecha: '2026-07-15', litros_am: 10, litros_pm: 4, litros_total: 14 }),
        fila({ id: 'solo-am', fecha: '2026-07-15', litros_am: 8, litros_total: 8 }),
        fila({ id: 'solo-pm', fecha: '2026-07-15', litros_pm: 5, litros_total: 5 }),
      ],
      'am',
    );
    expect(plan.actualizaciones).toEqual([
      { id: 'ambas', litros_am: null, litros_pm: 4, litros_total: 4 },
    ]);
    expect(plan.borrarIds).toEqual(['solo-am']);
    expect(Object.keys(plan).sort()).toEqual(['actualizaciones', 'borrarIds']);
  });

  it('la jornada borra por id y no toca otra cosa', () => {
    const plan = planBorrarPesaje(
      [fila({ id: 'a', fecha: '2026-07-15', litros_total: 10 }), fila({ id: 'b', fecha: '2026-07-15', litros_total: 3 })],
      null,
    );
    expect(plan.actualizaciones).toEqual([]);
    expect(plan.borrarIds).toEqual(['a', 'b']);
  });
});

describe('planGuardarBorrador', () => {
  it('recalcula el total al editar la mañana y borra la fila si no queda tarde', () => {
    const conTarde = fila({ id: 'a', fecha: '2026-07-15', litros_am: 10, litros_pm: 4, litros_total: 14 });
    const soloManana = fila({ id: 'b', fecha: '2026-07-15', litros_am: 8, litros_total: 8 });
    const plan = planGuardarBorrador(
      [conTarde, soloManana],
      [
        { ...borradorInicial(conTarde), litros_am: '11' },
        { ...borradorInicial(soloManana), litros_am: '' },
      ],
      'am',
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.actualizaciones).toEqual([
      { id: 'a', litros_am: 11, litros_pm: 4, litros_total: 15 },
    ]);
    expect(plan.plan.borrarIds).toEqual(['b']);
  });

  it('en jornada el cero se guarda y el vacío no', () => {
    const original = fila({ id: 'a', fecha: '2026-07-15', litros_total: 10 });
    const cero = planGuardarBorrador([original], [{ ...borradorInicial(original), litros_total: '0' }], null);
    expect(cero.ok).toBe(true);
    if (cero.ok) expect(cero.plan.actualizaciones[0].litros_total).toBe(0);
    const vacio = planGuardarBorrador([original], [{ ...borradorInicial(original), litros_total: '' }], null);
    expect(vacio.ok).toBe(false);
  });
});
