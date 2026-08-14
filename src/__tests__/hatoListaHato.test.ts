// Tests de `utils/hato/listaHato.ts` -- columnas nuevas de la lista del hato
// (N18 edad, N19 próximo evento) del plan
// docs/plan_hato_telegram_estados_agosto_2026.md.

import { describe, it, expect } from 'vitest';
import {
  edadEnAnios,
  formatearEdadHato,
  proximoEventoHato,
  type EntradaProximoEvento,
} from '@/utils/hato/listaHato';
import type { EstadoReproductivoDerivado } from '@/utils/calculosHato';

const HOY = '2026-08-13';

function derivado(overrides: Partial<EstadoReproductivoDerivado> = {}): EstadoReproductivoDerivado {
  return {
    estado: 'servida',
    fecha_secar: null,
    fecha_probable_parto: null,
    dias_abiertos: null,
    tiempo_prenez_dias: null,
    tiempo_secada_dias: null,
    proxima_a_reemplazo: false,
    vacia_es_problema: null,
    senal_revision: null,
    alertas: {
      secado_due: false,
      rechequeo_due: false,
      servicio_sin_confirmacion: false,
      parto_proximo: false,
    },
    ...overrides,
  };
}

function entrada(d: Partial<EstadoReproductivoDerivado> = {}): EntradaProximoEvento {
  return { derivado: derivado(d) };
}

describe('edadEnAnios', () => {
  it('calcula años con un decimal', () => {
    expect(edadEnAnios('2022-08-13', HOY)).toBe(4);
    expect(edadEnAnios('2023-02-13', HOY)).toBe(3.5);
  });

  it('sin fecha de nacimiento devuelve null, nunca 0', () => {
    // 20 de los 65 animales activos del hato real están así.
    expect(edadEnAnios(null, HOY)).toBeNull();
  });

  it('una fecha de nacimiento futura se reporta como ausente, no como edad negativa', () => {
    expect(edadEnAnios('2027-01-01', HOY)).toBeNull();
  });
});

describe('formatearEdadHato', () => {
  it('bajo el año se expresa en meses', () => {
    expect(formatearEdadHato('2026-05-13', HOY)).toBe('3 meses');
    expect(formatearEdadHato('2026-07-20', HOY)).toBe('1 mes');
  });

  it('desde el año, años con coma decimal (estándar colombiano)', () => {
    expect(formatearEdadHato('2023-02-13', HOY)).toBe('3,5 años');
  });

  it('sin dato imprime guion', () => {
    expect(formatearEdadHato(null, HOY)).toBe('—');
  });
});

describe('proximoEventoHato', () => {
  it('elige el hito con fecha más próximo que todavía no pasó', () => {
    const r = proximoEventoHato(
      entrada({ estado: 'preñada', fecha_secar: '2026-09-01', fecha_probable_parto: '2026-11-01' }),
      HOY,
    );
    expect(r).toEqual({ tipo: 'secado', etiqueta: 'Secar', fecha: '2026-09-01', dias: 19 });
  });

  it('una vaca ya seca no vuelve a mostrar el secado: sigue el parto', () => {
    const r = proximoEventoHato(
      entrada({ estado: 'seca', fecha_secar: '2026-07-01', fecha_probable_parto: '2026-09-15' }),
      HOY,
    );
    expect(r?.tipo).toBe('parto');
  });

  it('si todos los hitos ya vencieron, gana el más reciente y los días salen negativos', () => {
    const r = proximoEventoHato(
      entrada({ estado: 'preñada', fecha_secar: '2026-06-01', fecha_probable_parto: '2026-08-01' }),
      HOY,
    );
    expect(r?.tipo).toBe('parto');
    expect(r?.dias).toBe(-12);
  });

  it('sin ninguna fecha proyectada cae al rechequeo vencido, SIN inventarle fecha', () => {
    const r = proximoEventoHato(entrada({ alertas: { ...derivado().alertas, rechequeo_due: true } }), HOY);
    expect(r).toEqual({ tipo: 'rechequeo', etiqueta: 'Rechequeo', fecha: null, dias: null });
  });

  it('una vaca vacía sin rechequeo pendiente queda "por servir", también sin fecha', () => {
    const r = proximoEventoHato(entrada({ estado: 'vacia_por_servir', vacia_es_problema: false }), HOY);
    expect(r).toEqual({ tipo: 'servir', etiqueta: 'Servir', fecha: null, dias: null });
  });

  it('sin hito alguno devuelve null: la celda queda vacía, no dice "—" por defecto', () => {
    // Cría: ni fechas proyectadas, ni rechequeo, ni "vacía" (la pregunta no
    // aplica, así que `vacia_es_problema` es null).
    expect(proximoEventoHato(entrada({ estado: 'cria' }), HOY)).toBeNull();
  });

  it('el rechequeo vencido NO desplaza a un hito con fecha real', () => {
    const r = proximoEventoHato(
      entrada({
        estado: 'preñada',
        fecha_probable_parto: '2026-09-01',
        alertas: { ...derivado().alertas, rechequeo_due: true },
      }),
      HOY,
    );
    expect(r?.tipo).toBe('parto');
  });
});
