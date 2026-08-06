// ARCHIVO: __tests__/hatoCicloManual.test.ts
// DESCRIPCIÓN: TDD de T4a (S3, docs/plan_hato_ciclo_manual_override.md §3 y
// §7 "Criterios de aceptación — T4a — captura"). Cubre construcción de
// eventos, validación (bloqueos vs. advertencias) y la proyección
// "Estado actual → quedará".

import { describe, it, expect } from 'vitest';
import {
  construirEventosMarcaCiclo,
  derivarFechaServicioDesdeMesesPrenez,
  necesitaAnclaServicio,
  proyectarEstadoTrasMarca,
  validarMarcaCiclo,
  type InputMarcaCiclo,
} from '@/utils/hatoCicloManual';
import { derivarEstadoReproductivo, type EstadoActualHatoRow, type HatoConfig } from '@/utils/calculosHato';

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_rechequeo_due: 60,
  dias_espera_voluntaria_post_parto: 90,
};

const HOY = '2026-08-06';

function fila(datos: Partial<EstadoActualHatoRow> = {}): EstadoActualHatoRow {
  return {
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 2,
    ultimo_chequeo_fecha: null,
    ultimo_servicio_fecha: null,
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultimo_estado_chequeo: null,
    ...datos,
  };
}

function contexto(rol = 'Gerencia', hoy = HOY) {
  return { rol, hoy };
}

// ============================================================================
// construirEventosMarcaCiclo
// ============================================================================

describe('construirEventosMarcaCiclo', () => {
  it('parida -> un evento parto con cria_destino y datos.origen', () => {
    const input: InputMarcaCiclo = {
      marca: 'parida',
      fecha: '2026-08-06',
      fechaConfianza: 'exacta',
      criaDestino: 'retenida',
    };
    const eventos = construirEventosMarcaCiclo(input);
    expect(eventos).toEqual([
      {
        tipo: 'parto',
        fecha: '2026-08-06',
        fecha_confianza: 'exacta',
        cria_destino: 'retenida',
        datos: { origen: 'marca_manual' },
        fuente: 'web',
      },
    ]);
  });

  it('parida con nota -> la nota viaja en datos', () => {
    const eventos = construirEventosMarcaCiclo({
      marca: 'parida',
      fecha: '2026-08-06',
      fechaConfianza: 'aproximada',
      criaDestino: 'muerta',
      nota: '  cría nació muerta  ',
    });
    expect(eventos[0].datos).toEqual({ origen: 'marca_manual', nota: 'cría nació muerta' });
  });

  it('seca -> un evento secado_real, sin cria_destino', () => {
    const eventos = construirEventosMarcaCiclo({ marca: 'seca', fecha: '2026-08-06', fechaConfianza: 'exacta' });
    expect(eventos).toEqual([
      { tipo: 'secado_real', fecha: '2026-08-06', fecha_confianza: 'exacta', datos: { origen: 'marca_manual' }, fuente: 'web' },
    ]);
  });

  it('preñada sin ancla -> un solo evento confirmacion_prenez con metodo=presuncion', () => {
    const eventos = construirEventosMarcaCiclo({
      marca: 'preñada',
      fecha: '2026-08-06',
      fechaConfianza: 'exacta',
      ancla: { modo: 'ninguna' },
    });
    expect(eventos).toEqual([
      {
        tipo: 'confirmacion_prenez',
        fecha: '2026-08-06',
        fecha_confianza: 'exacta',
        datos: { origen: 'marca_manual', metodo: 'presuncion' },
        fuente: 'web',
      },
    ]);
  });

  it('confirmada sin ancla -> metodo=palpacion (D-20: mismo tipo, distinta evidencia)', () => {
    const eventos = construirEventosMarcaCiclo({ marca: 'confirmada', fecha: '2026-08-06', fechaConfianza: 'exacta' });
    expect(eventos[0].tipo).toBe('confirmacion_prenez');
    expect((eventos[0].datos as Record<string, unknown>).metodo).toBe('palpacion');
  });

  it('preñada con fecha de servicio conocida -> DOS eventos: servicio (exacta) + confirmacion_prenez', () => {
    const eventos = construirEventosMarcaCiclo({
      marca: 'preñada',
      fecha: '2026-08-06',
      fechaConfianza: 'exacta',
      ancla: { modo: 'fecha_conocida', fechaServicio: '2026-05-01' },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toEqual({
      tipo: 'servicio',
      fecha: '2026-05-01',
      fecha_confianza: 'exacta',
      datos: { origen: 'marca_manual' },
      fuente: 'web',
    });
    expect(eventos[1].tipo).toBe('confirmacion_prenez');
  });

  it('preñada con "meses de preñez = 3" -> DOS eventos, servicio con fecha_confianza=aproximada y fecha = marca − 3×30.44 días (criterio 11)', () => {
    const eventos = construirEventosMarcaCiclo({
      marca: 'preñada',
      fecha: '2026-08-06',
      fechaConfianza: 'exacta',
      ancla: { modo: 'meses_prenez', mesesPrenez: 3 },
    });
    expect(eventos).toHaveLength(2);
    expect(eventos[0].tipo).toBe('servicio');
    expect(eventos[0].fecha_confianza).toBe('aproximada');
    expect(eventos[0].fecha).toBe(derivarFechaServicioDesdeMesesPrenez('2026-08-06', 3));
  });

  it('preñada sin ancla ni datos -> se escribe UN evento (criterio 12)', () => {
    const eventos = construirEventosMarcaCiclo({ marca: 'preñada', fecha: '2026-08-06', fechaConfianza: 'exacta' });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe('confirmacion_prenez');
  });
});

describe('derivarFechaServicioDesdeMesesPrenez', () => {
  it('resta meses × 30.44 días, redondeado', () => {
    // 3 meses = 91.32 días -> redondea a 91.
    expect(derivarFechaServicioDesdeMesesPrenez('2026-08-06', 3)).toBe('2026-05-07');
  });

  it('9 meses de preñez se acerca a la aritmética de gestación real', () => {
    const fecha = derivarFechaServicioDesdeMesesPrenez('2026-08-06', 9);
    // 9 × 30.44 = 273.96 -> 274 días antes.
    expect(fecha).toBe('2025-11-05');
  });
});

// ============================================================================
// necesitaAnclaServicio
// ============================================================================

describe('necesitaAnclaServicio', () => {
  it('sin ningún servicio -> true', () => {
    expect(necesitaAnclaServicio(fila())).toBe(true);
  });

  it('servicio anterior al último parto (ciclo ya cerrado) -> true', () => {
    expect(
      necesitaAnclaServicio(fila({ ultimo_servicio_fecha: '2025-01-01', ultimo_parto_fecha: '2025-10-01' })),
    ).toBe(true);
  });

  it('servicio posterior al último parto (ciclo vigente) -> false', () => {
    expect(
      necesitaAnclaServicio(fila({ ultimo_servicio_fecha: '2026-01-01', ultimo_parto_fecha: '2025-10-01' })),
    ).toBe(false);
  });

  it('servicio sin ningún parto conocido -> false (el servicio es la única evidencia que hay)', () => {
    expect(necesitaAnclaServicio(fila({ ultimo_servicio_fecha: '2026-01-01', ultimo_parto_fecha: null }))).toBe(false);
  });
});

// ============================================================================
// validarMarcaCiclo — bloqueos B1-B3 (criterios 8-9)
// ============================================================================

describe('validarMarcaCiclo — bloqueos', () => {
  it('B1: fecha futura contra "hoy" local -> bloqueo, sin importar el resto', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: '2026-08-07', fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto('Gerencia', '2026-08-06'));
    expect(r.bloqueos).toContain('No se registran hechos futuros.');
  });

  it('B1: fecha de hoy exacta NO bloquea', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto());
    expect(r.bloqueos).not.toContain('No se registran hechos futuros.');
  });

  it('B2: animal no activa -> bloqueo', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila({ estado: 'vendida' }), CONFIG, contexto());
    expect(r.bloqueos).toContain('Un animal vendido/muerto no tiene ciclo.');
  });

  it('B3: rol distinto de Gerencia -> bloqueo (D-7), el gate es el ROL', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto('Administrador'));
    expect(r.bloqueos).toContain('Solo Gerencia puede marcar el ciclo reproductivo.');
  });

  it('sin ningún bloqueo cuando todo es válido', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(
      input,
      fila({ ultimo_servicio_fecha: '2026-01-01', ultimo_parto_fecha: '2025-01-01' }),
      CONFIG,
      contexto(),
    );
    expect(r.bloqueos).toEqual([]);
  });
});

// ============================================================================
// validarMarcaCiclo — advertencias A1-A4 (criterio 10: ninguna bloquea)
// ============================================================================

describe('validarMarcaCiclo — advertencias', () => {
  it('A1: marca parida con un parto reciente (< meses_gestacion_default) -> advertencia, nunca bloqueo', () => {
    const input: InputMarcaCiclo = { marca: 'parida', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila({ ultimo_parto_fecha: '2026-06-01' }), CONFIG, contexto());
    expect(r.bloqueos).toEqual([]);
    expect(r.advertencias.some((a) => a.includes('Ya hay un parto registrado el 2026-06-01'))).toBe(true);
  });

  it('A1: marca parida con un parto lejano (>= meses_gestacion_default) -> sin advertencia A1', () => {
    const input: InputMarcaCiclo = { marca: 'parida', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila({ ultimo_parto_fecha: '2025-01-01' }), CONFIG, contexto());
    expect(r.advertencias.some((a) => a.includes('biológicamente posibles'))).toBe(false);
  });

  it('A2: marca seca sin señal de preñez -> advertencia', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto());
    expect(r.advertencias).toContain('No hay preñez registrada para esta vaca. Se marcará como seca de todos modos.');
  });

  it('A2: marca seca CON servicio posterior al último parto -> sin advertencia A2', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(
      input,
      fila({ ultimo_parto_fecha: '2025-01-01', ultimo_servicio_fecha: '2026-01-01' }),
      CONFIG,
      contexto(),
    );
    expect(r.advertencias).not.toContain('No hay preñez registrada para esta vaca. Se marcará como seca de todos modos.');
  });

  it('A3: evento posterior a la fecha de la marca -> advertencia con tipo y fecha, y el estado NO cambia (criterio 18)', () => {
    const input: InputMarcaCiclo = { marca: 'seca', fecha: '2026-01-01', fechaConfianza: 'exacta' };
    const filaConServicioPosterior = fila({ ultimo_servicio_fecha: '2026-03-01' });
    const r = validarMarcaCiclo(input, filaConServicioPosterior, CONFIG, contexto());
    expect(r.bloqueos).toEqual([]);
    expect(r.advertencias.some((a) => a.includes('servicio registrado el 2026-03-01'))).toBe(true);

    const { antes, despues } = proyectarEstadoTrasMarca(filaConServicioPosterior, 'seca', '2026-01-01', CONFIG, HOY);
    expect(despues).toBe(antes);
  });

  it('A4: preñada sin ancla de servicio y sin que Martha aporte una -> advertencia', () => {
    const input: InputMarcaCiclo = { marca: 'preñada', fecha: HOY, fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto());
    expect(
      r.advertencias.some((a) =>
        a.includes('Sin fecha de servicio no se puede calcular fecha probable de parto ni de secado'),
      ),
    ).toBe(true);
  });

  it('A4: preñada CON ancla aportada -> sin advertencia A4', () => {
    const input: InputMarcaCiclo = {
      marca: 'preñada',
      fecha: HOY,
      fechaConfianza: 'exacta',
      ancla: { modo: 'fecha_conocida', fechaServicio: '2026-05-01' },
    };
    const r = validarMarcaCiclo(input, fila(), CONFIG, contexto());
    expect(r.advertencias.some((a) => a.includes('Sin fecha de servicio'))).toBe(false);
  });

  it('ninguna advertencia bloquea nunca -- bloqueos y advertencias son listas independientes', () => {
    // Combinación adversarial: dispara A1, A3 y A4 a la vez, sin ningún B.
    const input: InputMarcaCiclo = { marca: 'parida', fecha: '2026-01-01', fechaConfianza: 'exacta' };
    const filaAdversarial = fila({
      ultimo_parto_fecha: '2025-12-01',
      ultimo_servicio_fecha: '2026-06-01',
    });
    const r = validarMarcaCiclo(input, filaAdversarial, CONFIG, contexto());
    expect(r.bloqueos).toEqual([]);
    expect(r.advertencias.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// proyectarEstadoTrasMarca (criterio 14: coincide con derivarEstadoReproductivo)
// ============================================================================

describe('proyectarEstadoTrasMarca', () => {
  it('novilla nunca servida -> marca preñada -> queda preñada', () => {
    const { antes, despues } = proyectarEstadoTrasMarca(
      fila({ etapa: 'novilla', num_partos: 0 }),
      'preñada',
      HOY,
      CONFIG,
      HOY,
    );
    expect(antes).toBe('novilla');
    expect(despues).toBe('preñada');
  });

  it('vacía por servir -> marca confirmada -> queda preñada (D-20: mismo estado que preñada)', () => {
    const { despues } = proyectarEstadoTrasMarca(fila(), 'confirmada', HOY, CONFIG, HOY);
    expect(despues).toBe('preñada');
  });

  it('servida (ya con servicio) -> marca seca -> queda seca, cierra el lazo de ordeño (D-5)', () => {
    const filaServida = fila({ ultimo_servicio_fecha: '2026-05-01' });
    const antesDerivado = proyectarEstadoTrasMarca(filaServida, 'seca', HOY, CONFIG, HOY);
    expect(antesDerivado.antes).toBe('servida');
    expect(antesDerivado.despues).toBe('seca');
  });

  it('seca -> marca parida -> queda parida_reciente', () => {
    const filaSeca = fila({ ultimo_secado_real_fecha: '2026-06-01', ultimo_servicio_fecha: '2026-01-01' });
    const { despues } = proyectarEstadoTrasMarca(filaSeca, 'parida', HOY, CONFIG, HOY);
    expect(despues).toBe('parida_reciente');
  });

  it('coincide con derivarEstadoReproductivo real tras aplicar los eventos construidos (round-trip)', () => {
    const filaInicial = fila({ ultimo_servicio_fecha: '2026-05-01' });
    const { despues } = proyectarEstadoTrasMarca(filaInicial, 'seca', HOY, CONFIG, HOY);
    // Simula lo que la vista devolvería tras el INSERT real de un evento secado_real.
    const filaTrasGuardar = fila({ ultimo_servicio_fecha: '2026-05-01', ultimo_secado_real_fecha: HOY, ultimo_evento_fecha: HOY });
    expect(derivarEstadoReproductivo(filaTrasGuardar, CONFIG, HOY).estado).toBe(despues);
  });
});

// ============================================================================
// Falsificación de "gana el evento más reciente" (encargo explícito a QA,
// criterio 15-18) -- estos casos ejercitan el motor (calculosHato.ts), no
// este archivo, pero se repiten aquí porque `validarMarcaCiclo`/
// `proyectarEstadoTrasMarca` son la superficie que la UI realmente consulta.
// ============================================================================

describe('marca retroactiva (fecha anterior a un evento existente)', () => {
  it('A3 se muestra ANTES de guardar y el estado derivado efectivamente no cambia (criterio 18)', () => {
    const filaConSecadoReciente = fila({
      ultimo_servicio_fecha: '2026-01-01',
      ultimo_secado_real_fecha: '2026-08-01',
      ultimo_evento_fecha: '2026-08-01',
    });
    const input: InputMarcaCiclo = { marca: 'preñada', fecha: '2026-07-01', fechaConfianza: 'exacta' };
    const r = validarMarcaCiclo(input, filaConSecadoReciente, CONFIG, contexto());
    expect(r.advertencias.some((a) => a.includes('posterior a esta marca'))).toBe(true);

    const { antes, despues } = proyectarEstadoTrasMarca(filaConSecadoReciente, 'preñada', '2026-07-01', CONFIG, HOY);
    expect(despues).toBe(antes);
    expect(despues).toBe('seca');
  });
});
