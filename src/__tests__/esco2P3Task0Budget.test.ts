import { describe, expect, it, vi } from 'vitest';
import { limitarPresupuestoDesarrollo } from '@/utils/esco2/presupuestoDesarrollo';
import type { ClienteLLM, RespuestaLLM, SolicitudLLM } from '@/utils/esco2/llm';

const solicitud: SolicitudLLM = { modelo: 'synthetic', esfuerzo: 'none', mensajes: [], maxTokens: 1 };
const respuesta = (costoUsd: number | null): RespuestaLLM => ({
  texto: '', llamadas: [], modelo: 'synthetic', ms: 1, finishReason: 'stop',
  uso: { entrada: 1, salida: 1, razonamiento: 0, costoUsd },
});
function crear(costoUsd: number | null) {
  const completar = vi.fn<ClienteLLM['completar']>(async () => respuesta(costoUsd));
  const presupuesto = limitarPresupuestoDesarrollo({ completar }, { limiteUsd: 0.25, gastoPrevioUsd: 0.2, reservaPorLlamadaUsd: 0.025 });
  return { completar, presupuesto };
}
describe('development call budget', () => {
  it('checks the remaining reservation before every model call', async () => {
    const { completar, presupuesto } = crear(0.02);
    await presupuesto.cliente.completar(solicitud);
    await presupuesto.cliente.completar(solicitud);
    await expect(presupuesto.cliente.completar(solicitud)).rejects.toThrow('presupuesto_agotado');
    expect(completar).toHaveBeenCalledTimes(2);
    expect(presupuesto.estado()).toMatchObject({ gastoConocidoUsd: 0.04, motivoDetencion: 'presupuesto_agotado' });
  });
  it.each([null, Number.NaN, Infinity, -1])('stops permanently on unknown or invalid receipt %s', async costo => {
    const { completar, presupuesto } = crear(costo);
    const recibo = await presupuesto.cliente.completar(solicitud);
    expect(recibo.uso.costoUsd).toBe(costo);
    await expect(presupuesto.cliente.completar(solicitud)).rejects.toThrow('costo_no_disponible');
    expect(completar).toHaveBeenCalledTimes(1);
    expect(presupuesto.estado()).toMatchObject({ gastoConocidoUsd: 0, gastoUsd: null, motivoDetencion: 'costo_no_disponible' });
  });
  it('records an over-reservation receipt but stops before another call', async () => {
    const { completar, presupuesto } = crear(0.03);
    await presupuesto.cliente.completar(solicitud);
    await expect(presupuesto.cliente.completar(solicitud)).rejects.toThrow('reserva_excedida');
    expect(completar).toHaveBeenCalledTimes(1);
    expect(presupuesto.estado()).toMatchObject({ gastoUsd: 0.03, motivoDetencion: 'reserva_excedida' });
  });
  it('stops after an uncertain transport call without treating spend as zero', async () => {
    const completar = vi.fn<ClienteLLM['completar']>(async () => { throw new Error('uncertain'); });
    const presupuesto = limitarPresupuestoDesarrollo({ completar }, { limiteUsd: 0.25, gastoPrevioUsd: 0, reservaPorLlamadaUsd: 0.025 });
    await expect(presupuesto.cliente.completar(solicitud)).rejects.toThrow('llamada_incierta');
    await expect(presupuesto.cliente.completar(solicitud)).rejects.toThrow('llamada_incierta');
    expect(completar).toHaveBeenCalledTimes(1);
    expect(presupuesto.estado().gastoUsd).toBeNull();
  });
  it.each([
    { limiteUsd: Number.NaN, gastoPrevioUsd: 0, reservaPorLlamadaUsd: 0.025 },
    { limiteUsd: 0.25, gastoPrevioUsd: -1, reservaPorLlamadaUsd: 0.025 },
    { limiteUsd: 0.25, gastoPrevioUsd: 0, reservaPorLlamadaUsd: 0 },
    { limiteUsd: 0.25, gastoPrevioUsd: 0.3, reservaPorLlamadaUsd: 0.025 },
  ])('rejects malformed budget %#', opciones => {
    expect(() => limitarPresupuestoDesarrollo({ completar: vi.fn() }, opciones)).toThrow('presupuesto_no_valido');
  });
});
