import { describe, it, expect } from 'vitest';

describe('useClimaData hook - Interface validation', () => {
  it('exports useClimaData function', async () => {
    const { useClimaData } = await import('@/hooks/useClimaData');
    expect(typeof useClimaData).toBe('function');
  });

  it('exports PERIODOS constant with correct structure', async () => {
    const { PERIODOS } = await import('@/hooks/useClimaData');
    expect(PERIODOS).toHaveLength(6);

    const labels = PERIODOS.map((p: { label: string }) => p.label);
    expect(labels).toContain('Día');
    expect(labels).toContain('Semana');
    expect(labels).toContain('Mes');
    expect(labels).toContain('Trimestre');
    expect(labels).toContain('Año a la fecha');
    expect(labels).toContain('Último año');
  });

  it('Año a la fecha has type "ytd" (not a trailing day count)', async () => {
    const { PERIODOS } = await import('@/hooks/useClimaData');
    const ytd = PERIODOS.find((p: { label: string }) => p.label === 'Año a la fecha');
    expect(ytd).toBeDefined();
    expect(ytd!.type).toBe('ytd');
  });

  it('Último año has dias: 365 (trailing)', async () => {
    const { PERIODOS } = await import('@/hooks/useClimaData');
    const lastYear = PERIODOS.find((p: { label: string }) => p.label === 'Último año');
    expect(lastYear).toBeDefined();
    expect(lastYear!.dias).toBe(365);
    expect(lastYear!.type).toBe('trailing');
  });
});
