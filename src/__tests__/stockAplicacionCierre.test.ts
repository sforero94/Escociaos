import { describe, expect, it } from 'vitest';
import { calcularFaltantesCierre, consolidarConsumoRegistrado } from '@/utils/stockAplicacion';
import { construirPayloadCierreAplicacion } from '@/utils/calculosCierreAplicacion';

// ESCO-165: bloquear el cierre ANTES de llamar a fn_cerrar_aplicacion cuando el consumo
// registrado supera el saldo. Precedente ESCO-129: 59,60 kg registrados contra 59,00 de saldo.

const nutrifeed = (cantidad: number) => ({ producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor', cantidad_utilizada: cantidad });

describe('consolidarConsumoRegistrado', () => {
  it('suma por producto y redondea a 4 decimales igual que el payload del cierre', () => {
    const movimientos = Array.from({ length: 596 }, () => nutrifeed(0.1));
    const [consumo] = consolidarConsumoRegistrado(movimientos);
    expect(consumo.cantidad).toBe(59.6);

    const payload = construirPayloadCierreAplicacion({
      aplicacionId: 'a',
      registrosEditados: [],
      datosFinales: { fechaInicioReal: '2026-09-01', fechaFinReal: '2026-09-02', observaciones: '' },
      lotes: [],
      movimientos: movimientos.map((m) => ({ ...m, costo_unitario: 1 })),
    });
    expect(payload.insumos_aplicados[0].cantidad).toBe(consumo.cantidad);
  });

  it('conserva un producto por fila, en orden de aparición', () => {
    const consumo = consolidarConsumoRegistrado([
      nutrifeed(1),
      { producto_id: 'b', producto_nombre: 'B', cantidad_utilizada: 2 },
      nutrifeed(0.5),
    ]);
    expect(consumo).toEqual([
      { producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor', cantidad: 1.5 },
      { producto_id: 'b', producto_nombre: 'B', cantidad: 2 },
    ]);
  });
});

describe('calcularFaltantesCierre', () => {
  const consumo = (cantidad: number) => [{ producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor', cantidad }];

  it('59,60 registrado contra 59,00 de saldo bloquea y lista el producto (ESCO-129)', () => {
    expect(calcularFaltantesCierre(consumo(59.6), new Map([['nutrifeed', 59]]))).toEqual([
      { producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor', registrado: 59.6, saldo: 59 },
    ]);
  });

  it('registrado igual al saldo pasa', () => {
    expect(calcularFaltantesCierre(consumo(59.6), new Map([['nutrifeed', 59.6]]))).toEqual([]);
  });

  it.each([59.599999999999994, 59.60000000000001])(
    'compara tras redondear a 4 decimales: %s contra 59,60 pasa',
    (registrado) => {
      expect(calcularFaltantesCierre(consumo(registrado), new Map([['nutrifeed', 59.6]]))).toEqual([]);
    },
  );

  it('la suma real en coma flotante contra el saldo exacto pasa, en cualquier orden de filas', () => {
    const grandes = Array.from({ length: 16 }, () => nutrifeed(3.5));
    const chicos = Array.from({ length: 6 }, () => nutrifeed(0.1));
    for (const movimientos of [[...grandes, ...chicos], [...chicos, ...grandes]]) {
      expect(calcularFaltantesCierre(consolidarConsumoRegistrado(movimientos), new Map([['nutrifeed', 56.6]]))).toEqual([]);
    }
    const crudo = [...grandes, ...chicos].reduce((s, m) => s + m.cantidad_utilizada, 0);
    expect(crudo).toBeGreaterThan(56.6); // 56.60000000000001: sin redondeo, bloquearía en falso
  });

  it('un exceso real de una diezmilésima sí bloquea', () => {
    expect(calcularFaltantesCierre(consumo(59.6001), new Map([['nutrifeed', 59.6]]))).toHaveLength(1);
  });

  it('saldo desconocido bloquea con saldo null, nunca 0', () => {
    expect(calcularFaltantesCierre(consumo(1), new Map())).toEqual([
      { producto_id: 'nutrifeed', producto_nombre: 'Nutrifeed menor', registrado: 1, saldo: null },
    ]);
    expect(calcularFaltantesCierre(consumo(1), new Map([['nutrifeed', null]]))[0].saldo).toBeNull();
  });

  it('un consumo de cero no exige saldo', () => {
    expect(calcularFaltantesCierre(consumo(0), new Map())).toEqual([]);
  });
});
