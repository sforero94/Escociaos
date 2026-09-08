// Regla "Fecha Servicio solo si el ciclo sigue abierto" (dueño, 2026-09-08).
// Los casos base salen de la planilla real que Martha tachó a mano antes de su
// primer chequeo en la app -- las fechas son las de producción a esa fecha.

import { describe, it, expect } from 'vitest';
import {
  esServicioVigente,
  fechaCierreCicloReproductivo,
  celdasServicioParaPlanilla,
} from '@/utils/hato/servicioVigente';

describe('fechaCierreCicloReproductivo', () => {
  it('devuelve el más reciente entre parto y aborto', () => {
    expect(
      fechaCierreCicloReproductivo({
        ultimoServicioFecha: null,
        ultimoPartoFecha: '2026-05-08',
        ultimoAbortoFecha: '2023-10-10',
      }),
    ).toBe('2026-05-08');
    expect(
      fechaCierreCicloReproductivo({
        ultimoServicioFecha: null,
        ultimoPartoFecha: '2023-01-01',
        ultimoAbortoFecha: '2026-02-02',
      }),
    ).toBe('2026-02-02');
  });

  it('tolera que falte uno de los dos, y devuelve null sin ninguno', () => {
    const base = { ultimoServicioFecha: null };
    expect(fechaCierreCicloReproductivo({ ...base, ultimoPartoFecha: '2026-05-08', ultimoAbortoFecha: null })).toBe(
      '2026-05-08',
    );
    expect(fechaCierreCicloReproductivo({ ...base, ultimoPartoFecha: null, ultimoAbortoFecha: '2026-05-08' })).toBe(
      '2026-05-08',
    );
    expect(fechaCierreCicloReproductivo({ ...base, ultimoPartoFecha: null, ultimoAbortoFecha: null })).toBeNull();
  });
});

describe('esServicioVigente', () => {
  it('un servicio posterior al parto sigue abierto (ALINA, BRIGIDA, COMETA)', () => {
    // ALINA #157: parió el 31/12/2025 y la sirvieron el 23/4/2026.
    expect(
      esServicioVigente({
        ultimoServicioFecha: '2026-04-23',
        ultimoPartoFecha: '2025-12-31',
        ultimoAbortoFecha: null,
      }),
    ).toBe(true);
  });

  it('un servicio anterior al parto está cerrado (las seis filas que Martha tachó)', () => {
    const tachadas = [
      { nombre: 'AMAPOLA', servicio: '2025-08-13', parto: '2026-05-31' },
      { nombre: 'CAMILA', servicio: '2025-08-25', parto: '2026-05-15' },
      { nombre: 'CAPERUZA', servicio: '2025-07-01', parto: '2026-05-02' },
      { nombre: 'CARLA', servicio: '2025-07-21', parto: '2026-04-27' },
      { nombre: 'FABIOLA', servicio: '2025-07-01', parto: '2026-05-11' },
      { nombre: 'VEGA', servicio: '2024-10-02', parto: '2026-06-10' },
    ];
    for (const vaca of tachadas) {
      expect(
        esServicioVigente({
          ultimoServicioFecha: vaca.servicio,
          ultimoPartoFecha: vaca.parto,
          ultimoAbortoFecha: null,
        }),
      ).toBe(false);
    }
  });

  it('el aborto también cierra el ciclo', () => {
    expect(
      esServicioVigente({
        ultimoServicioFecha: '2026-01-10',
        ultimoPartoFecha: '2024-03-01',
        ultimoAbortoFecha: '2026-04-15',
      }),
    ).toBe(false);
    // Servida DESPUÉS del aborto: ciclo nuevo, sigue abierto.
    expect(
      esServicioVigente({
        ultimoServicioFecha: '2026-05-20',
        ultimoPartoFecha: '2024-03-01',
        ultimoAbortoFecha: '2026-04-15',
      }),
    ).toBe(true);
  });

  it('el mismo día que el cierre NO cuenta como servicio abierto', () => {
    expect(
      esServicioVigente({
        ultimoServicioFecha: '2026-05-11',
        ultimoPartoFecha: '2026-05-11',
        ultimoAbortoFecha: null,
      }),
    ).toBe(false);
  });

  it('sin parto ni aborto registrado no imprime nada (decisión del dueño)', () => {
    expect(
      esServicioVigente({
        ultimoServicioFecha: '2026-04-23',
        ultimoPartoFecha: null,
        ultimoAbortoFecha: null,
      }),
    ).toBe(false);
  });

  it('sin servicio no hay nada que evaluar', () => {
    expect(
      esServicioVigente({
        ultimoServicioFecha: null,
        ultimoPartoFecha: '2026-05-11',
        ultimoAbortoFecha: null,
      }),
    ).toBe(false);
  });
});

describe('celdasServicioParaPlanilla', () => {
  it('conserva las tres celdas cuando el ciclo sigue abierto', () => {
    expect(
      celdasServicioParaPlanilla({
        ultimoServicioFecha: '2026-04-23',
        ultimoPartoFecha: '2025-12-31',
        ultimoAbortoFecha: null,
        toroNombre: 'laredo',
        tipoServicio: 'inseminacion',
      }),
    ).toEqual({ fechaServicio: '2026-04-23', toroNombre: 'laredo', tipoServicio: 'inseminacion' });
  });

  it('anula el toro y el tipo JUNTO con la fecha, nunca una mezcla', () => {
    // FABIOLA #176 imprimía `Toro Jersey` al lado de la fecha tachada.
    expect(
      celdasServicioParaPlanilla({
        ultimoServicioFecha: '2025-07-01',
        ultimoPartoFecha: '2026-05-11',
        ultimoAbortoFecha: null,
        toroNombre: 'Jersey',
        tipoServicio: 'monta',
      }),
    ).toEqual({ fechaServicio: null, toroNombre: null, tipoServicio: null });
  });
});
