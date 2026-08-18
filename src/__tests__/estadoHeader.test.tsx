import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EstadoHeader } from '@/components/dashboard/EstadoHeader';

/**
 * Barra de estado (Bloque 0 del Centro de Control,
 * docs/plan_dashboard_centro_control.md §4/§9.2). Una sola línea que
 * responde "¿tengo que leer esta pantalla hoy?".
 *
 * El conteo de "Requiere tu decisión" llega SIEMPRE por prop
 * (`conteoDecision`) -- este componente nunca lo consulta, para que no
 * pueda divergir del número real de la bandeja (lo arma `useRequiereDecision`
 * en paralelo). `null` es el estado "todavía no se sabe": nunca se debe
 * confundir con 0 pendientes.
 */

const TZ_ORIGINAL = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'America/Bogota';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = TZ_ORIGINAL;
});

describe('EstadoHeader — Bloque 0', () => {
  it('conteoDecision null: esqueleto de una línea, nunca "0 pendientes" antes de saberlo', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(<EstadoHeader conteoDecision={null} nombreUsuario="Santiago" />);
    expect(html).toContain('animate-pulse');
    expect(html).not.toMatch(/pendient/i);
    expect(html).not.toContain('>0<');
    expect(html).not.toContain('Santiago');
  });

  it('conteoDecision 0: línea verde, "Nada pendiente de ti" -- igual que el vacío del bloque 1', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(<EstadoHeader conteoDecision={0} nombreUsuario="Santiago" />);
    expect(html).toContain('Nada pendiente de ti');
    expect(html).toContain('bg-primary');
    expect(html).not.toContain('bg-destructive');
  });

  it('conteoDecision 1: singular ("1 cosa espera"), punto rojo, conteo en negrita', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(<EstadoHeader conteoDecision={1} nombreUsuario="Santiago" />);
    expect(html).toContain('1 cosa espera tu decisión');
    expect(html).toContain('bg-destructive');
    expect(html).toMatch(/font-bold[^>]*>1 cosa espera tu decisión/);
  });

  it('conteoDecision 3: plural ("3 cosas esperan"), y hasta 3 hechos separados por punto medio', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(
      <EstadoHeader
        conteoDecision={3}
        hechos={['Sin lluvia hace 2 días', 'Última ronda de monitoreo hace 13 días']}
        nombreUsuario="Santiago"
      />,
    );
    expect(html).toContain('3 cosas esperan tu decisión');
    expect(html).toContain('Sin lluvia hace 2 días');
    expect(html).toContain('Última ronda de monitoreo hace 13 días');
    expect(html).toContain('·');
  });

  it('recorta a un máximo de 3 hechos aunque lleguen más', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(
      <EstadoHeader conteoDecision={2} hechos={['Hecho 1', 'Hecho 2', 'Hecho 3', 'Hecho 4']} />,
    );
    expect(html).toContain('Hecho 1');
    expect(html).toContain('Hecho 2');
    expect(html).toContain('Hecho 3');
    expect(html).not.toContain('Hecho 4');
  });

  it('saludo por hora: mañana, tarde y noche -- con fecha larga en español', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    expect(renderToStaticMarkup(<EstadoHeader conteoDecision={0} nombreUsuario="Santiago" />)).toContain(
      'Buenos días, Santiago',
    );

    vi.setSystemTime(new Date('2026-08-17T14:00:00-05:00'));
    expect(renderToStaticMarkup(<EstadoHeader conteoDecision={0} nombreUsuario="Santiago" />)).toContain(
      'Buenas tardes, Santiago',
    );

    vi.setSystemTime(new Date('2026-08-17T20:00:00-05:00'));
    const htmlNoche = renderToStaticMarkup(<EstadoHeader conteoDecision={0} nombreUsuario="Santiago" />);
    expect(htmlNoche).toContain('Buenas noches, Santiago');
    expect(htmlNoche).toContain('17 de agosto de 2026');
  });

  it('sin nombreUsuario, saludo genérico sin coma', () => {
    vi.setSystemTime(new Date('2026-08-17T06:00:00-05:00'));
    const html = renderToStaticMarkup(<EstadoHeader conteoDecision={0} />);
    expect(html).toContain('Buenos días');
    expect(html).not.toContain('Buenos días,');
  });
});
