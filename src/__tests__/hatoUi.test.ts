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
  chipStockPajillas,
} from '../utils/hatoUi';
import type { EstadoReproductivo } from '../utils/calculosHato';
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
