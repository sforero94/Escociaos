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
    cortadaPorFaltaDeDato: false,
    fechaFaltaDeDato: null,
    ...overrides,
  };
}

function render(r: RachaSinLluviaDatos, umbralMm = 10) {
  return renderToStaticMarkup(<RachaSinLluvia racha={r} umbralMm={umbralMm} />);
}

describe('RachaSinLluvia', () => {
  it('muestra el conteo y el umbral', () => {
    const html = render(racha({ dias: 12 }));
    expect(html).toContain('12');
    expect(html).toContain('10');
  });

  it('cuando la racha terminó en lluvia real, muestra esa fecha y su valor', () => {
    const html = render(racha({ dias: 3, ultimaLluviaFecha: '2026-08-12', ultimaLluviaMm: 15 }));
    expect(html).toContain('15');
    expect(html).not.toContain('No se puede confirmar');
  });

  it('cuando la racha se cortó por falta de dato, avisa en vez de mostrar el número como si fuera confiable', () => {
    const html = render(racha({ dias: 2, cortadaPorFaltaDeDato: true, fechaFaltaDeDato: '2026-08-12' }));
    expect(html).toContain('No se puede confirmar');
    // La fecha del hueco aparece en el aviso, no se esconde
    expect(html).toContain('ago');
  });

  it('no pinta nada si no hay racha y tampoco hay hueco de dato que reportar', () => {
    const html = render(racha({ dias: 0, cortadaPorFaltaDeDato: false }));
    expect(html).toBe('');
  });
});
