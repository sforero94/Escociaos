import { describe, it, expect } from 'vitest';
import {
  construirEventoVentaHato,
  construirEventoMuerteHato,
  estadoTrasSalida,
  esFechaFutura,
} from '@/utils/hatoSalida';

describe('hatoSalida', () => {
  describe('construirEventoVentaHato', () => {
    it('arma el evento venta con la fecha y el vínculo financiero de la transacción', () => {
      const evento = construirEventoVentaHato('animal-1', '2026-07-23', 'tx-1');
      expect(evento).toEqual({
        animal_id: 'animal-1',
        tipo: 'venta',
        fecha: '2026-07-23',
        fecha_confianza: 'exacta',
        transaccion_ganado_id: 'tx-1',
        datos: null,
        fuente: 'web',
      });
    });
  });

  describe('construirEventoMuerteHato', () => {
    it('arma el evento muerte con causa cuando se provee', () => {
      const evento = construirEventoMuerteHato('animal-1', '2026-07-23', 'timpanismo');
      expect(evento.tipo).toBe('muerte');
      expect(evento.transaccion_ganado_id).toBeNull();
      expect(evento.datos).toEqual({ causa: 'timpanismo' });
    });

    it('sin causa guarda datos como null, nunca un objeto con causa vacía', () => {
      const evento = construirEventoMuerteHato('animal-1', '2026-07-23');
      expect(evento.datos).toBeNull();
    });

    it('causa solo espacios se trata como ausente', () => {
      const evento = construirEventoMuerteHato('animal-1', '2026-07-23', '   ');
      expect(evento.datos).toBeNull();
    });

    it('recorta espacios en la causa provista', () => {
      const evento = construirEventoMuerteHato('animal-1', '2026-07-23', '  parto distocico  ');
      expect(evento.datos).toEqual({ causa: 'parto distocico' });
    });
  });

  describe('estadoTrasSalida', () => {
    it('venta -> vendida', () => {
      expect(estadoTrasSalida('venta')).toBe('vendida');
    });

    it('muerte -> muerta', () => {
      expect(estadoTrasSalida('muerte')).toBe('muerta');
    });
  });

  describe('esFechaFutura', () => {
    it('fecha posterior a la referencia es futura', () => {
      expect(esFechaFutura('2026-07-24', '2026-07-23')).toBe(true);
    });

    it('fecha igual a la referencia no es futura', () => {
      expect(esFechaFutura('2026-07-23', '2026-07-23')).toBe(false);
    });

    it('fecha anterior a la referencia no es futura', () => {
      expect(esFechaFutura('2026-07-22', '2026-07-23')).toBe(false);
    });
  });
});
