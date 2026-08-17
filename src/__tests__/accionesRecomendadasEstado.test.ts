import { describe, it, expect } from 'vitest';
import {
  elegirCorridaVigente,
  filtrarPorVisibilidad,
  separarPorCotejo,
  renderizarFila,
  agruparPorNegocio,
  negocioConMasAcciones,
  vigenteHastaSilencio,
  NEGOCIOS_ORDEN,
  HORAS_FRESCURA_CORRIDA,
  DIAS_SILENCIO_POR_DEFECTO,
} from '@/utils/accionesRecomendadasEstado';
import type { FilaAccionCorrida, FilaAccionRecomendada, AccionParaMostrar } from '@/types/acciones';
import type { Hecho } from '@/utils/accionesTipos';
import type { EntradaSelectores } from '@/utils/accionesHechos';

/**
 * Orquestación pura del hook `useAccionesRecomendadas` (Fase 4, §9.2 del plan
 * del tablero). Separado del hook para poder probarlo sin Supabase ni React
 * -- el hook es sólo el pegamento de I/O.
 */

function corrida(overrides: Partial<FilaAccionCorrida> = {}): FilaAccionCorrida {
  return { id: 'c1', generado_at: '2026-08-17T10:50:00-05:00', estado: 'ok', ...overrides };
}

function hechoSinCotejo(id = 'hato.vacias_90d', negocio: Hecho['negocio'] = 'hato_lechero'): Hecho {
  return {
    id,
    negocio,
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto: '11 de 65 vacas — v_hato_estado_actual, hoy',
    valores: { n: { crudo: 11, render: '11', unidad: 'vacas' } },
    fuente: 'v_hato_estado_actual',
    fecha_dato: '2026-08-17',
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.lista_vacias'],
    cotejo: { tipo: 'sin_cotejo' },
    atendido_por: [],
    titular_pulso: false,
    fecha_limite: null,
    dias_esperando: null,
    tamano_conjunto: 11,
    visibilidad: 'todos',
  };
}

function filaBase(overrides: Partial<FilaAccionRecomendada> = {}): FilaAccionRecomendada {
  return {
    id: 'a1',
    corrida_id: 'c1',
    negocio: 'hato_lechero',
    clave: 'hato_lechero.vacias_90d',
    origen: 'O1_senal',
    visibilidad: 'todos',
    orden: 1,
    plantilla: 'Revisar las {n} vacas vacías',
    ranuras: { n: { hecho_id: 'hato.vacias_90d', campo: 'n' } },
    hecho_ids: ['hato.vacias_90d'],
    hechos_snapshot: [hechoSinCotejo()],
    destino_id: 'hato.lista_vacias',
    destino_ruta: '/hato-lechero/hato?filtro=vacias_90d',
    destino_etiqueta: 'Ver las vacías',
    caducada_at: null,
    ...overrides,
  };
}

const entradaVacia: EntradaSelectores = {
  animalesHato: null,
  priorizacion: null,
  ganado: null,
  config: null,
  hoy: '2026-08-17',
};

describe('elegirCorridaVigente', () => {
  const ahoraIso = '2026-08-17T15:00:00-05:00';

  it('elige la corrida más reciente con estado ok o parcial dentro de 48h', () => {
    const corridas = [
      corrida({ id: 'nueva', generado_at: '2026-08-17T10:50:00-05:00', estado: 'ok' }),
      corrida({ id: 'vieja', generado_at: '2026-08-16T10:50:00-05:00', estado: 'ok' }),
    ];
    expect(elegirCorridaVigente(corridas, ahoraIso)?.id).toBe('nueva');
  });

  it('acepta parcial, no sólo ok', () => {
    const corridas = [corrida({ id: 'c', estado: 'parcial' })];
    expect(elegirCorridaVigente(corridas, ahoraIso)?.id).toBe('c');
  });

  it('salta una corrida con estado fallo y usa la siguiente si está dentro de 48h', () => {
    const corridas = [
      corrida({ id: 'fallida', generado_at: '2026-08-17T10:50:00-05:00', estado: 'fallo' }),
      corrida({ id: 'buena_de_ayer', generado_at: '2026-08-16T10:50:00-05:00', estado: 'ok' }),
    ];
    expect(elegirCorridaVigente(corridas, ahoraIso)?.id).toBe('buena_de_ayer');
  });

  it(`null si la corrida más reciente ok/parcial tiene más de ${HORAS_FRESCURA_CORRIDA}h`, () => {
    const corridas = [corrida({ id: 'vieja', generado_at: '2026-08-14T10:50:00-05:00', estado: 'ok' })];
    expect(elegirCorridaVigente(corridas, ahoraIso)).toBeNull();
  });

  it('null con lista vacía', () => {
    expect(elegirCorridaVigente([], ahoraIso)).toBeNull();
  });

  it('null si sólo hay corridas en fallo', () => {
    expect(elegirCorridaVigente([corrida({ estado: 'fallo' })], ahoraIso)).toBeNull();
  });
});

describe('filtrarPorVisibilidad', () => {
  it('un Administrador (no Gerencia) no ve visibilidad=gerencia', () => {
    const filas = [filaBase({ id: 'todos', visibilidad: 'todos' }), filaBase({ id: 'ger', visibilidad: 'gerencia' })];
    const visibles = filtrarPorVisibilidad(filas, false);
    expect(visibles.map((f) => f.id)).toEqual(['todos']);
  });

  it('Gerencia ve ambas', () => {
    const filas = [filaBase({ id: 'todos', visibilidad: 'todos' }), filaBase({ id: 'ger', visibilidad: 'gerencia' })];
    const visibles = filtrarPorVisibilidad(filas, true);
    expect(visibles.map((f) => f.id).sort()).toEqual(['ger', 'todos']);
  });
});

describe('separarPorCotejo', () => {
  it('mantiene vigentes las filas cuyos hechos citados no fallan el cotejo', () => {
    const filas = [filaBase({ id: 'a', hechos_snapshot: [hechoSinCotejo()] })];
    const { vigentes, idsACaducar } = separarPorCotejo(filas, entradaVacia);
    expect(vigentes.map((f) => f.id)).toEqual(['a']);
    expect(idsACaducar).toEqual([]);
  });

  it('mueve a idsACaducar las filas cuya evidencia dejó de ser cierta', () => {
    const hechoCaduco: Hecho = {
      ...hechoSinCotejo(),
      cotejo: { tipo: 'existe', selector: 'gan.pendientes' },
    };
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      ganado: {
        total: { cabezas: 0, novillos: 0, toros: 0 },
        por_finca: [],
        variacion_30_dias: { entradas: 0, salidas: 0, neto: 0 },
        pendientes_confirmacion: { total: 0 },
      },
    };
    const filas = [filaBase({ id: 'muerta', hechos_snapshot: [hechoCaduco] })];
    const { vigentes, idsACaducar } = separarPorCotejo(filas, entrada);
    expect(vigentes).toEqual([]);
    expect(idsACaducar).toEqual(['muerta']);
  });

  it('indeterminada (selector null) se conserva vigente para mostrar', () => {
    const hechoIndeterminado: Hecho = {
      ...hechoSinCotejo(),
      cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 },
    };
    const filas = [filaBase({ id: 'a', hechos_snapshot: [hechoIndeterminado] })];
    const { vigentes, idsACaducar } = separarPorCotejo(filas, entradaVacia);
    expect(vigentes.map((f) => f.id)).toEqual(['a']);
    expect(idsACaducar).toEqual([]);
  });
});

describe('renderizarFila', () => {
  it('sustituye las ranuras con hecho.valores[campo].render y usa hecho.texto como evidencia', () => {
    const fila = filaBase();
    const resultado = renderizarFila(fila);
    expect(resultado.frase).toBe('Revisar las 11 vacas vacías');
    expect(resultado.evidencia).toEqual(['11 de 65 vacas — v_hato_estado_actual, hoy']);
    expect(resultado.boton).toEqual({ etiqueta: 'Ver las vacías', ruta: '/hato-lechero/hato?filtro=vacias_90d' });
    expect(resultado.id).toBe(fila.id);
    expect(resultado.clave).toBe(fila.clave);
    expect(resultado.negocio).toBe(fila.negocio);
  });
});

describe('agruparPorNegocio', () => {
  it('agrupa en el orden fijo del pulso (hato, aguacate, ganado), filtrado a los negocios habilitados', () => {
    const acciones: AccionParaMostrar[] = [
      { id: 'g1', clave: 'ganado.x', negocio: 'ganado', frase: 'x', evidencia: [], boton: { etiqueta: '', ruta: '' } },
      { id: 'h1', clave: 'hato_lechero.x', negocio: 'hato_lechero', frase: 'x', evidencia: [], boton: { etiqueta: '', ruta: '' } },
    ];
    const grupos = agruparPorNegocio(acciones, ['ganado', 'hato_lechero']);
    expect(grupos.map((g) => g.negocio)).toEqual(['hato_lechero', 'ganado']);
    expect(grupos[0].acciones.map((a) => a.id)).toEqual(['h1']);
    expect(grupos[1].acciones.map((a) => a.id)).toEqual(['g1']);
  });

  it('un negocio habilitado sin acciones aparece con lista vacía (vacío honesto, no desaparece)', () => {
    const grupos = agruparPorNegocio([], ['aguacate']);
    expect(grupos).toEqual([{ negocio: 'aguacate', acciones: [] }]);
  });

  it('no reordena dentro del negocio -- preserva el orden de llegada (ya viene ordenado por `orden` de la query)', () => {
    const acciones: AccionParaMostrar[] = [
      { id: 'segunda', clave: 'a', negocio: 'ganado', frase: '', evidencia: [], boton: { etiqueta: '', ruta: '' } },
      { id: 'primera', clave: 'b', negocio: 'ganado', frase: '', evidencia: [], boton: { etiqueta: '', ruta: '' } },
    ];
    const grupos = agruparPorNegocio(acciones, ['ganado']);
    expect(grupos[0].acciones.map((a) => a.id)).toEqual(['segunda', 'primera']);
  });

  it('respeta NEGOCIOS_ORDEN aunque `negocios` llegue en otro orden', () => {
    expect(NEGOCIOS_ORDEN).toEqual(['hato_lechero', 'aguacate', 'ganado']);
    const grupos = agruparPorNegocio([], ['ganado', 'aguacate', 'hato_lechero']);
    expect(grupos.map((g) => g.negocio)).toEqual(['hato_lechero', 'aguacate', 'ganado']);
  });
});

describe('negocioConMasAcciones', () => {
  it('elige el negocio con más acciones', () => {
    const grupos = [
      { negocio: 'hato_lechero' as const, acciones: [] as AccionParaMostrar[] },
      { negocio: 'aguacate' as const, acciones: [{ id: '1' } as AccionParaMostrar, { id: '2' } as AccionParaMostrar] },
      { negocio: 'ganado' as const, acciones: [{ id: '3' } as AccionParaMostrar] },
    ];
    expect(negocioConMasAcciones(grupos)).toBe('aguacate');
  });

  it('empate ⇒ gana el primero en el orden del pulso', () => {
    const grupos = [
      { negocio: 'hato_lechero' as const, acciones: [{ id: '1' } as AccionParaMostrar] },
      { negocio: 'aguacate' as const, acciones: [{ id: '2' } as AccionParaMostrar] },
    ];
    expect(negocioConMasAcciones(grupos)).toBe('hato_lechero');
  });

  it('null si no hay grupos', () => {
    expect(negocioConMasAcciones([])).toBeNull();
  });
});

describe('vigenteHastaSilencio', () => {
  it(`suma DIAS_SILENCIO_POR_DEFECTO (${DIAS_SILENCIO_POR_DEFECTO}) días a la fecha dada`, () => {
    const ahora = new Date('2026-08-17T10:00:00.000Z');
    const resultado = vigenteHastaSilencio(ahora);
    const esperado = new Date(ahora.getTime() + DIAS_SILENCIO_POR_DEFECTO * 24 * 60 * 60 * 1000).toISOString();
    expect(resultado).toBe(esperado);
  });
});
