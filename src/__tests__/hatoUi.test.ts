// ARCHIVO: __tests__/hatoUi.test.ts
// DESCRIPCIÓN: TDD de los helpers de chip semántico del módulo hato
// (`utils/hatoUi.ts`, S4) -- solo traducción estado->{label,className},
// nunca cálculo de negocio (eso ya lo prueba calculosHato.test.ts).

import { describe, it, expect } from 'vitest';
import {
  chipEstadoReproductivo,
  chipVaciaEsProblema,
  chipClasificacionDiff,
  chipCategoriaHato,
  chipDiasRestantes,
  chipVencimiento,
  chipTipoEstado,
  chipEstadoTratamiento,
  chipStockPajillas,
} from '../utils/hatoUi';
import type { EstadoReproductivo, TipoEstado } from '../utils/calculosHato';
import type { ClasificacionFilaDiff } from '../utils/importHato/diffChequeo';
import type { CategoriaHato } from '../utils/hatoCategorias';

describe('chipEstadoReproductivo', () => {
  it('devuelve un label y una clase no vacíos para cada EstadoReproductivo posible', () => {
    const estados: EstadoReproductivo[] = [
      'cria', 'novilla', 'servida', 'preñada', 'proxima_a_secar', 'seca',
      'parida_reciente', 'vacia_por_servir', 'indeterminado', 'vendida', 'muerta', 'descartada',
    ];
    for (const estado of estados) {
      const chip = chipEstadoReproductivo(estado);
      expect(chip.label.length).toBeGreaterThan(0);
      expect(chip.className.length).toBeGreaterThan(0);
    }
  });

  it('usa la paleta ámbar (atención) para "próxima a secar"', () => {
    expect(chipEstadoReproductivo('proxima_a_secar').className).toContain('amber');
  });

  it('usa la paleta verde (saludable) para "preñada"', () => {
    expect(chipEstadoReproductivo('preñada').className).toContain('green');
  });
});

describe('chipVaciaEsProblema', () => {
  it('devuelve null cuando no hay señal (nunca se inventa un color)', () => {
    expect(chipVaciaEsProblema(null)).toBeNull();
  });

  it('colorea rojo cuando es un problema', () => {
    expect(chipVaciaEsProblema(true)?.className).toContain('red');
  });

  it('colorea verde cuando es normal', () => {
    expect(chipVaciaEsProblema(false)?.className).toContain('green');
  });
});

describe('chipClasificacionDiff', () => {
  it('devuelve un chip distinto para cada clasificación del diff B0', () => {
    const clasificaciones: ClasificacionFilaDiff[] = ['nuevo', 'sin_cambio', 'cambio', 'no_reconocido'];
    const chips = clasificaciones.map((c) => chipClasificacionDiff(c));
    const labels = new Set(chips.map((c) => c.label));
    expect(labels.size).toBe(4);
  });

  it('marca "no_reconocido" en rojo -- nunca se aprueba en silencio', () => {
    expect(chipClasificacionDiff('no_reconocido').className).toContain('red');
  });
});

describe('chipCategoriaHato', () => {
  it('devuelve un chip para cada una de las 3 categorías del inventario', () => {
    const categorias: CategoriaHato[] = ['ternera', 'hato', 'horro'];
    for (const categoria of categorias) {
      const chip = chipCategoriaHato(categoria);
      expect(chip.label.length).toBeGreaterThan(0);
    }
  });
});

describe('chipDiasRestantes', () => {
  it('marca "Vencido" en rojo cuando la fecha ya pasó', () => {
    const chip = chipDiasRestantes('2026-07-10', '2026-07-24');
    expect(chip.label).toBe('Vencido');
    expect(chip.className).toContain('red');
  });

  it('marca "Hoy" en ámbar cuando la fecha es la fecha de referencia', () => {
    const chip = chipDiasRestantes('2026-07-24', '2026-07-24');
    expect(chip.label).toBe('Hoy');
    expect(chip.className).toContain('amber');
  });

  it('marca en ámbar los días dentro del umbral urgente (default 7)', () => {
    const chip = chipDiasRestantes('2026-07-27', '2026-07-24');
    expect(chip.label).toBe('3 d');
    expect(chip.className).toContain('amber');
  });

  it('marca en gris los días fuera del umbral urgente', () => {
    const chip = chipDiasRestantes('2026-08-17', '2026-07-24');
    expect(chip.label).toBe('24 d');
    expect(chip.className).toContain('gray');
  });

  it('respeta un umbral urgente distinto cuando se provee', () => {
    const chip = chipDiasRestantes('2026-07-29', '2026-07-24', 3);
    expect(chip.label).toBe('5 d');
    expect(chip.className).toContain('gray');
  });

  it('nunca decide el umbral de negocio -- solo colorea una diferencia de días ya calculada', () => {
    // Mismo día exacto de distancia (7), justo en el borde del umbral default:
    // el borde es inclusive (ámbar), documentando el criterio sin ambigüedad.
    const chip = chipDiasRestantes('2026-07-31', '2026-07-24');
    expect(chip.label).toBe('7 d');
    expect(chip.className).toContain('amber');
  });
});

describe('chipVencimiento', () => {
  it('siempre colorea rojo -- se llama solo cuando el signal ya está activo', () => {
    expect(chipVencimiento(12).className).toContain('red');
    expect(chipVencimiento(null).className).toContain('red');
  });

  it('incluye los días transcurridos en el label cuando se conocen', () => {
    expect(chipVencimiento(12).label).toBe('Vencido (12 d)');
  });

  it('devuelve un label genérico cuando no hay conteo de días disponible', () => {
    expect(chipVencimiento(null).label).toBe('Vencido');
  });
});

describe('chipTipoEstado', () => {
  it('devuelve un label y una clase no vacíos para cada TipoEstado posible', () => {
    const tipos: TipoEstado[] = ['vacia_apta', 'vacia_problema', 'fecha_heredada', 'desconocido', 'vacio'];
    for (const tipo of tipos) {
      const chip = chipTipoEstado(tipo);
      expect(chip.label.length).toBeGreaterThan(0);
      expect(chip.className.length).toBeGreaterThan(0);
    }
  });

  it('colorea verde "vacia_apta" -- vacía normal, nunca un problema', () => {
    expect(chipTipoEstado('vacia_apta').className).toContain('green');
  });

  it('colorea rojo "vacia_problema" -- requiere rechequeo', () => {
    expect(chipTipoEstado('vacia_problema').className).toContain('red');
  });

  it('marca en ámbar "desconocido" -- código no reconocido, ni sano ni problema por defecto', () => {
    expect(chipTipoEstado('desconocido').className).toContain('amber');
  });
});

describe('chipEstadoTratamiento', () => {
  it('devuelve un chip distinto para cada estado de tratamiento', () => {
    const estados: ('activo' | 'completado' | 'cancelado')[] = ['activo', 'completado', 'cancelado'];
    const chips = estados.map((e) => chipEstadoTratamiento(e));
    const labels = new Set(chips.map((c) => c.label));
    expect(labels.size).toBe(3);
  });

  it('colorea verde "completado"', () => {
    expect(chipEstadoTratamiento('completado').className).toContain('green');
  });
});

describe('chipStockPajillas (G3, S10)', () => {
  it('devuelve null cuando el stock es positivo -- no se muestra ningún chip', () => {
    expect(chipStockPajillas(5)).toBeNull();
    expect(chipStockPajillas(1)).toBeNull();
  });

  it('advierte en ámbar (nunca rojo/bloqueante) cuando el stock llega a 0', () => {
    const chip = chipStockPajillas(0);
    expect(chip).not.toBeNull();
    expect(chip?.className).toContain('amber');
    expect(chip?.label).toBe('Sin stock');
  });

  it('advierte en ámbar cuando el stock queda negativo, mostrando el número', () => {
    const chip = chipStockPajillas(-3);
    expect(chip).not.toBeNull();
    expect(chip?.className).toContain('amber');
    expect(chip?.label).toContain('-3');
  });

  it('nunca usa rojo -- el stock en 0/negativo advierte pero nunca bloquea (G3)', () => {
    expect(chipStockPajillas(0)?.className).not.toContain('red');
    expect(chipStockPajillas(-5)?.className).not.toContain('red');
  });
});
