import { describe, it, expect } from 'vitest';
import { cotejarHecho, cotejarAccion } from '@/utils/accionesCotejo';
import type { Hecho } from '@/utils/accionesTipos';
import type { EntradaSelectores } from '@/utils/accionesHechos';

/**
 * El cotejo al pintar (§6 del brief técnico del motor de acciones
 * recomendadas). Antes de mostrar una acción se comprueba contra datos
 * frescos que el hecho que la sostiene siga siendo cierto -- reutilizando
 * `evaluarSelector` (Fase 1, ya espejado), nunca reimplementando la lógica
 * del pulso.
 */

function hechoBase(overrides: Partial<Hecho> = {}): Hecho {
  return {
    id: 'hato.vacias_90d',
    negocio: 'hato_lechero',
    origen: 'O1_senal',
    categoria: 'reproduccion',
    texto: '11 de 65 vacas llevan 90 días o más vacías — v_hato_estado_actual, hoy',
    valores: { cantidad: { crudo: 11, render: '11', unidad: 'vacas' } },
    fuente: 'v_hato_estado_actual',
    fecha_dato: '2026-08-16',
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['hato.lista_vacias'],
    cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 },
    atendido_por: [],
    titular_pulso: false,
    fecha_limite: null,
    dias_esperando: null,
    tamano_conjunto: 11,
    visibilidad: 'todos',
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

describe('cotejarHecho', () => {
  it('sin_cotejo siempre es vigente -- es un hecho estructural, el reloj no se invalida solo', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'sin_cotejo' } });
    expect(cotejarHecho(hecho, entradaVacia)).toBe('vigente');
  });

  it('el negocio no cargó (selector devuelve null) ⇒ indeterminada, NUNCA caducada', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 } });
    // `entradaVacia.animalesHato` es null -- evaluarSelector('hato.vacias_90d', ...) devuelve null
    expect(cotejarHecho(hecho, entradaVacia)).toBe('indeterminada');
  });

  it('conteo_min vigente cuando el conteo fresco sigue por encima del mínimo', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 } });
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      config: { dias_espera_voluntaria_post_parto: 90 },
      animalesHato: [
        {
          animalId: 'a1',
          numero: 1,
          nombre: 'Luna',
          estadoAnimal: 'activa',
          ultimoPartoFecha: '2026-01-01',
          ultimoChequeoFecha: null,
          derivado: { estado: 'vacia_por_servir', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } },
        },
      ],
      hoy: '2026-08-17',
    };
    expect(cotejarHecho(hecho, entrada)).toBe('vigente');
  });

  it('conteo_min caducada cuando el conteo fresco cae por debajo del mínimo (Martha ya marcó preñada)', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 } });
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      config: { dias_espera_voluntaria_post_parto: 90 },
      animalesHato: [], // ya no queda ninguna vacía larga
      hoy: '2026-08-17',
    };
    expect(cotejarHecho(hecho, entrada)).toBe('caducada');
  });

  it('existe vigente cuando el selector devuelve > 0', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'existe', selector: 'gan.pendientes' } });
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      ganado: {
        total: { cabezas: 10, novillos: 8, toros: 2 },
        por_finca: [],
        variacion_30_dias: { entradas: 0, salidas: 0, neto: 0 },
        pendientes_confirmacion: { total: 3 },
      },
    };
    expect(cotejarHecho(hecho, entrada)).toBe('vigente');
  });

  it('existe caducada cuando el selector devuelve 0', () => {
    const hecho = hechoBase({ cotejo: { tipo: 'existe', selector: 'gan.pendientes' } });
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      ganado: {
        total: { cabezas: 10, novillos: 8, toros: 2 },
        por_finca: [],
        variacion_30_dias: { entradas: 0, salidas: 0, neto: 0 },
        pendientes_confirmacion: { total: 0 },
      },
    };
    expect(cotejarHecho(hecho, entrada)).toBe('caducada');
  });

  it('un selector no reconocido por evaluarSelector se trata como indeterminada, nunca lanza', () => {
    // Defensivo: `Hecho.cotejo.selector` está tipado como `string` abierto en
    // accionesTipos.ts, mientras que `evaluarSelector` usa la unión cerrada de
    // accionesHechos.ts -- un id fuera de esa unión no debe hacer caer el cotejo.
    const hecho = hechoBase({ cotejo: { tipo: 'existe', selector: 'algo.que.no.existe' } });
    expect(cotejarHecho(hecho, entradaVacia)).toBe('indeterminada');
  });
});

describe('cotejarAccion', () => {
  it('vigente cuando todos los hechos citados están vigentes', () => {
    const hechos = [hechoBase({ cotejo: { tipo: 'sin_cotejo' } })];
    expect(cotejarAccion(hechos, entradaVacia)).toBe('vigente');
  });

  it('caducada si ALGÚN hecho citado falla su cotejo -- la acción se sostiene en su evidencia completa', () => {
    const hechos = [
      hechoBase({ id: 'a', cotejo: { tipo: 'sin_cotejo' } }),
      hechoBase({
        id: 'b',
        cotejo: { tipo: 'existe', selector: 'gan.pendientes' },
      }),
    ];
    const entrada: EntradaSelectores = {
      ...entradaVacia,
      ganado: {
        total: { cabezas: 0, novillos: 0, toros: 0 },
        por_finca: [],
        variacion_30_dias: { entradas: 0, salidas: 0, neto: 0 },
        pendientes_confirmacion: { total: 0 },
      },
    };
    expect(cotejarAccion(hechos, entrada)).toBe('caducada');
  });

  it('indeterminada si algún selector devolvió null y ninguno falló ⇒ se muestra', () => {
    const hechos = [
      hechoBase({ id: 'a', cotejo: { tipo: 'sin_cotejo' } }),
      hechoBase({ id: 'b', cotejo: { tipo: 'conteo_min', selector: 'hato.vacias_90d', minimo: 1 } }),
    ];
    expect(cotejarAccion(hechos, entradaVacia)).toBe('indeterminada');
  });

  it('acción sin hechos citados (caso defensivo, no debería ocurrir tras el validador) es vigente por vacuidad', () => {
    expect(cotejarAccion([], entradaVacia)).toBe('vigente');
  });
});
