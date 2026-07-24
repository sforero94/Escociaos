/**
 * Test de paridad frontend ⇄ edge function del motor de alertas del Hato
 * Lechero (S6, endpoint `POST .../hato/alertas/tick`).
 *
 * `src/supabase/functions/server/hato-alertas.ts` y
 * `supabase/functions/make-server-1ccce916/hato-alertas.ts` son copias
 * GENERADAS (nunca a mano) de `src/utils/hatoAlertas.ts` por
 * `docs/hato/regenerar-copias-hato-alertas.py` -- necesarias porque el tick
 * corre en el árbol de despliegue de la edge function y no puede importar
 * desde `src/utils/` (misma restricción que ya produjo `calculos-hato.ts` y
 * las copias de `importHato/`).
 *
 * Igual que `importHatoParidadServidor.test.ts`: `hatoAlertas.ts` SÍ importa
 * (`@/utils/calculosHato`, `@/utils/importHato/overridesChapeta`), así que la
 * paridad estructural no puede ser "byte a byte" -- es "el generador, corrido
 * AHORA MISMO, produce exactamente lo que hay en el árbol" (sección 1). La
 * sección 2 prueba, además, que ambas implementaciones se comportan IGUAL
 * sobre los mismos datos.
 *
 * Si este test falla: editá `src/utils/hatoAlertas.ts` y corré
 * `python3 docs/hato/regenerar-copias-hato-alertas.py`. NUNCA edites una
 * copia a mano para "arreglar" la falla.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import * as frontend from '@/utils/hatoAlertas';
import * as edge from '../supabase/functions/server/hato-alertas';
import type { HatoConfig } from '@/utils/calculosHato';

const RAIZ = resolve(__dirname, '../..');

// ============================================================================
// 1. Paridad estructural: el generador, corrido ahora, no produce ningún diff.
// ============================================================================

describe('paridad estructural hatoAlertas ⇄ hato-alertas (server)', () => {
  it('las copias Deno están al día con docs/hato/regenerar-copias-hato-alertas.py --check', () => {
    execFileSync('python3', ['docs/hato/regenerar-copias-hato-alertas.py', '--check'], {
      cwd: RAIZ,
      stdio: 'pipe',
    });
  });

  it('ambas implementaciones exportan exactamente la misma API', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(edge)).toEqual(nombres(frontend));
  });
});

// ============================================================================
// 2. Paridad de comportamiento
// ============================================================================

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60,
  dias_rechequeo_due: 60,
};

const FECHA_REF = '2026-07-23';

const ANIMALES: frontend.AnimalHatoParaAlertas[] = [
  {
    animal_id: 'animal-1',
    numero: 47,
    nombre: 'ESTRELLA',
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 3,
    ultimo_chequeo_fecha: '2026-05-01',
    ultimo_servicio_fecha: '2025-12-01',
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: '2025-12-01',
    ultimo_estado_chequeo: null,
  },
  // Chapeta provisional -- ejercita la regla "lidera con el nombre".
  {
    animal_id: 'animal-2',
    numero: 999,
    nombre: 'ESMERALDA',
    etapa: 'vaca',
    raza: 'holstein',
    estado: 'activa',
    num_partos: 2,
    ultimo_chequeo_fecha: '2026-07-20',
    ultimo_servicio_fecha: '2025-10-25',
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: '2025-10-25',
    ultimo_estado_chequeo: null,
  },
];

const PASOS: frontend.PasoTratamientoPendienteInput[] = [
  {
    paso_id: 'paso-1',
    animal_id: 'animal-1',
    numero: 47,
    nombre: 'ESTRELLA',
    fecha_programada: '2026-07-20',
    descripcion: 'Aplicar estrumate',
  },
];

describe('paridad de comportamiento generarAlertasPendientes', () => {
  it('produce exactamente las mismas alertas en ambas implementaciones', () => {
    const alertasFrontend = frontend.generarAlertasPendientes(ANIMALES, PASOS, CONFIG, new Set(), FECHA_REF);
    const alertasEdge = edge.generarAlertasPendientes(
      ANIMALES as unknown as edge.AnimalHatoParaAlertas[],
      PASOS as unknown as edge.PasoTratamientoPendienteInput[],
      CONFIG,
      new Set(),
      FECHA_REF,
    );
    expect(alertasEdge).toEqual(alertasFrontend);
    // Sanity check: el fixture debe ejercitar más de un tipo de alerta o esta
    // prueba de paridad no estaría probando gran cosa.
    const tipos = new Set(alertasFrontend.map((a) => a.tipo));
    expect(tipos.size).toBeGreaterThan(1);
  });
});

describe('paridad de comportamiento nombrePresentacionAnimal / construirMensajeAlerta', () => {
  it('coincide con chapeta real y con chapeta provisional', () => {
    expect(edge.nombrePresentacionAnimal('ESTRELLA', 47)).toBe(frontend.nombrePresentacionAnimal('ESTRELLA', 47));
    expect(edge.nombrePresentacionAnimal('ESMERALDA', 999)).toBe(frontend.nombrePresentacionAnimal('ESMERALDA', 999));
    expect(edge.nombrePresentacionAnimal(null, null)).toBe(frontend.nombrePresentacionAnimal(null, null));
  });

  it('los 5 tipos de mensaje coinciden', () => {
    const ctxBase = { nombre: 'ESTRELLA', numero: 47 };
    const casos: frontend.ContextoMensajeAlerta[] = [
      { tipo: 'secado_due', ...ctxBase, fecha_secar: '2026-07-23' },
      { tipo: 'tratamiento_paso', ...ctxBase, descripcion_paso: 'Aplicar estrumate', fecha_programada: '2026-07-23' },
      { tipo: 'rechequeo_due', ...ctxBase, ultimo_chequeo_fecha: '2026-05-01' },
      { tipo: 'servicio_sin_confirmacion', ...ctxBase, fecha_servicio: '2026-06-01' },
      { tipo: 'parto_proximo', ...ctxBase, fecha_probable_parto: '2026-07-25' },
    ];
    for (const ctx of casos) {
      expect(edge.construirMensajeAlerta(ctx as edge.ContextoMensajeAlerta), ctx.tipo).toBe(
        frontend.construirMensajeAlerta(ctx),
      );
    }
  });
});

describe('paridad de comportamiento debeReenviar / decidirAccionEscalamiento', () => {
  it('debeReenviar coincide en los casos límite', () => {
    const casos: Array<[frontend.EstadoAlertaHato, number, string | null, string]> = [
      ['pendiente', 0, null, '2026-07-23T10:00:00.000Z'],
      ['enviada', 1, null, '2026-07-23T10:00:00.000Z'],
      ['enviada', 1, '2026-07-22T10:00:00.000Z', '2026-07-23T10:00:00.000Z'],
      ['enviada', 1, '2026-07-21T10:00:00.000Z', '2026-07-23T10:00:00.000Z'],
      ['enviada', 3, '2026-07-01T10:00:00.000Z', '2026-07-23T10:00:00.000Z'],
    ];
    for (const [estado, intentos, ultimoIntento, ahora] of casos) {
      const alerta = { estado, intentos, ultimo_intento_en: ultimoIntento };
      expect(edge.debeReenviar(alerta, ahora), `${estado}/${intentos}/${ultimoIntento}`).toBe(
        frontend.debeReenviar(alerta, ahora),
      );
    }
  });

  it('decidirAccionEscalamiento coincide en los casos límite', () => {
    // [estado, fecha_programada, anchorEnvio, horasEscalamiento, ahora]
    const casos: Array<[frontend.EstadoAlertaHato, string, string | null, number, string]> = [
      ['enviada', '2026-07-20', '2026-07-21T10:00:00.000Z', 48, '2026-07-23T10:00:00.000Z'],
      ['enviada', '2026-07-20', '2026-07-23T00:00:00.000Z', 48, '2026-07-23T10:00:00.000Z'],
      ['pendiente', '2026-07-01', null, 48, '2026-07-23T10:00:00.000Z'],
      ['pendiente', '2026-07-09', null, 48, '2026-07-23T10:00:00.000Z'],
      ['respondida', '2026-01-01', '2026-01-01T00:00:00.000Z', 48, '2026-07-23T10:00:00.000Z'],
      // 'enviada' sin anchor (dato legado ausente) -- nunca escala.
      ['enviada', '2026-07-20', null, 48, '2026-07-23T10:00:00.000Z'],
      // 'pendiente' con un anchor "viejo" (el fallback del tick a fecha_programada) -- sigue sin escalar.
      ['pendiente', '2026-07-20', '2026-07-01T00:00:00.000Z', 48, '2026-07-23T10:00:00.000Z'],
    ];
    for (const [estado, fechaProgramada, anchorEnvio, horasEscalamiento, ahora] of casos) {
      const alerta = { estado, fecha_programada: fechaProgramada };
      expect(
        edge.decidirAccionEscalamiento(alerta, anchorEnvio, horasEscalamiento, ahora),
        `${estado}/${fechaProgramada}/${anchorEnvio}`,
      ).toBe(frontend.decidirAccionEscalamiento(alerta, anchorEnvio, horasEscalamiento, ahora));
    }
  });
});
