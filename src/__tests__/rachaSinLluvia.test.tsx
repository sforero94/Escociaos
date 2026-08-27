import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RachaSinLluvia as RachaSinLluviaDatos } from '@/utils/calculosClima';
import { RachaSinLluvia } from '@/components/dashboard/RachaSinLluvia';

function racha(overrides: Partial<RachaSinLluviaDatos>): RachaSinLluviaDatos {
  return {
    dias: 0,
    desdeFecha: null,
    hastaFecha: null,
    ultimaLluviaFecha: null,
    ultimaLluviaMm: null,
    diasSinConfirmar: 0,
    ...overrides,
  };
}

function render(r: RachaSinLluviaDatos, umbralMm = 10) {
  return renderToStaticMarkup(<RachaSinLluvia racha={r} umbralMm={umbralMm} />);
}

describe('RachaSinLluvia', () => {
  it('muestra el conteo y el umbral', () => {
    const html = render(racha({ dias: 36 }));
    expect(html).toContain('36');
    expect(html).toContain('10');
  });

  it('cuando la racha terminó en lluvia real, muestra esa fecha y su valor', () => {
    const html = render(racha({ dias: 36, ultimaLluviaFecha: '2026-07-20', ultimaLluviaMm: 15.75 }));
    // `formatearMm` no lleva decimales de 10 mm para arriba (formato colombiano)
    expect(html).toContain('16 mm');
    expect(html).toContain('20 jul 2026');
  });

  // El cambio de esta ronda: los días sin dato NO cortan el conteo ni generan
  // un bloque naranja. Se declaran al lado del número, en gris.
  it('los días sin dato se declaran discretamente, sin bloque de alarma', () => {
    const html = render(racha({ dias: 36, diasSinConfirmar: 3 }));
    expect(html).toContain('36');
    expect(html).toContain('3 sin dato');
    // Nada de la alarma naranja anterior
    expect(html).not.toContain('No se puede confirmar');
    expect(html).not.toMatch(/text-amber-\d00/);
  });

  it('sin días sin confirmar no dice nada extra', () => {
    const html = render(racha({ dias: 36, diasSinConfirmar: 0 }));
    expect(html).not.toContain('sin dato');
  });

  it('no pinta nada si no hay racha ni lluvia previa que reportar', () => {
    const html = render(racha({ dias: 0 }));
    expect(html).toBe('');
  });
});
