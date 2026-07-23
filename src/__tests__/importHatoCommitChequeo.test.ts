/**
 * Tests del commit path del chequeo (B0/V10, paso "Aprobar" -- CLAUDE.md
 * "B0/V10 endpoint"). `src/utils/importHato/commitChequeo.ts` es puro y cero
 * I/O -- estos tests nunca tocan Supabase, mismo patrón que
 * `importHatoDiffChequeo.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { parseSX } from '@/utils/calculosHato';
import {
  validarFilasCommit,
  construirFilasVacas,
  derivarEventosDeChequeo,
  construirPayloadCommit,
  type FilaChequeoAprobada,
} from '@/utils/importHato/commitChequeo';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';
import type { AnimalHatoActual, FilaDiffChequeo, ResultadoDiffChequeo, UltimoChequeoVacaActual } from '@/utils/importHato/diffChequeo';
import { construirDiffChequeo } from '@/utils/importHato/diffChequeo';

// ============================================================================
// Fixtures
// ============================================================================

function filaBase(overrides: Partial<FilaChequeoNormalizada> = {}): FilaChequeoNormalizada {
  return {
    archivo: 'CHEQUEO_JULIO_2026.xlsx',
    hoja: 'CHEQUEO JULIO 2026',
    fila: 3,
    generacionEncabezado: 3,
    numero: 162,
    nombre: 'ESMERALDA',
    chequeoFecha: '2026-07-09',
    chequeoFechaConfianza: 'exacta',
    raw: {
      pl: '16',
      np: '2',
      ultimaCria: null,
      sx: null,
      fechaServicio: '23/04/2026',
      toro: 'ins laredo',
      tp: null,
      estado: 'ok',
      secar: null,
      pp: null,
      ttto: null,
    },
    pl: 16,
    numPartos: 2,
    fechasServicio: ['2026-04-23'],
    sx: null,
    estado: 'vacia_apta',
    fechaSecar: '2027-01-23',
    fechaProbableParto: '2027-01-23',
    toroNombre: 'ins laredo',
    tipoServicio: 'inseminacion',
    issues: [],
    ...overrides,
  };
}

function animalActual(overrides: Partial<AnimalHatoActual> = {}): AnimalHatoActual {
  return { id: 'animal-esmeralda', numero: 162, nombre: 'ESMERALDA', etapa: 'vaca', estado: 'activa', ...overrides };
}

/** Construye un diff fresco de UNA sola fila usando el motor real de
 * `diffChequeo.ts` -- evita duplicar a mano la forma de `FilaDiffChequeo` en
 * cada test y así los tests de `commitChequeo.ts` ejercitan la integración
 * real con el diff, no una versión inventada de su salida. */
function diffDeUnaFila(fila: FilaChequeoNormalizada, animal: AnimalHatoActual | null, ultimo?: UltimoChequeoVacaActual): ResultadoDiffChequeo {
  return construirDiffChequeo([fila], animal ? [animal] : [], ultimo ? [ultimo] : []);
}

// ============================================================================
// validarFilasCommit -- regla dura de alcance
// ============================================================================

describe('validarFilasCommit', () => {
  it('acepta una fila sin_cambio con animalId', () => {
    const fila = filaBase();
    const animal = animalActual();
    const ultimo: UltimoChequeoVacaActual = {
      animalId: animal.id,
      chequeoFecha: '2026-05-01',
      pl: 16,
      numPartos: 2,
      fechaServicio: '2026-04-23',
      toro: 'ins laredo',
      tipoServicio: 'inseminacion',
      fechaSecar: '2027-01-23',
      fechaProbableParto: '2027-01-23',
      estado: 'vacia_apta',
    };
    const diff = diffDeUnaFila(fila, animal, ultimo);
    expect(diff.filas[0].clasificacion).toBe('sin_cambio');

    const { aceptadas, rechazadas } = validarFilasCommit([fila], diff);
    expect(rechazadas).toEqual([]);
    expect(aceptadas).toEqual([{ fila, animalId: 'animal-esmeralda' }]);
  });

  it('acepta una fila cambio con animalId', () => {
    const fila = filaBase({ pl: 20 });
    const animal = animalActual();
    const diff = diffDeUnaFila(fila, animal); // sin último chequeo -> pl anterior null != 20 -> cambio
    expect(diff.filas[0].clasificacion).toBe('cambio');

    const { aceptadas, rechazadas } = validarFilasCommit([fila], diff);
    expect(rechazadas).toEqual([]);
    expect(aceptadas).toHaveLength(1);
  });

  it('rechaza una fila que degradó a nuevo en el estado fresco (chapeta sin ficha)', () => {
    const fila = filaBase();
    const diff = diffDeUnaFila(fila, null); // animal ya no existe / nunca existió
    expect(diff.filas[0].clasificacion).toBe('nuevo');

    const { aceptadas, rechazadas } = validarFilasCommit([fila], diff);
    expect(aceptadas).toEqual([]);
    expect(rechazadas).toEqual([
      {
        fila: fila.fila,
        numero: 162,
        motivo: expect.stringContaining("clasificarse como 'nuevo'"),
      },
    ]);
  });

  it('rechaza una fila sin número (no_reconocido) -- nunca se escribe', () => {
    const fila = filaBase({ numero: null });
    const diff = diffDeUnaFila(fila, null);
    expect(diff.filas[0].clasificacion).toBe('no_reconocido');

    const { aceptadas, rechazadas } = validarFilasCommit([fila], diff);
    expect(aceptadas).toEqual([]);
    expect(rechazadas[0].motivo).toContain('no_reconocido');
  });

  it('rechaza una fila con número provisional (900-999) -- nunca se escribe', () => {
    const fila = filaBase({ numero: 950 });
    const animal = animalActual({ numero: 950 });
    const diff = diffDeUnaFila(fila, animal);
    expect(diff.filas[0].clasificacion).toBe('no_reconocido');

    const { aceptadas, rechazadas } = validarFilasCommit([fila], diff);
    expect(aceptadas).toEqual([]);
    expect(rechazadas).toHaveLength(1);
  });

  it('rechaza una fila que ya no aparece en el diff fresco', () => {
    const filaEnviada = filaBase({ fila: 99 });
    const otraFila = filaBase({ fila: 3 });
    const diff = diffDeUnaFila(otraFila, animalActual());

    const { aceptadas, rechazadas } = validarFilasCommit([filaEnviada], diff);
    expect(aceptadas).toEqual([]);
    expect(rechazadas).toEqual([
      { fila: 99, numero: 162, motivo: expect.stringContaining('no aparece en el diff recalculado') },
    ]);
  });

  it('rechaza una colisión de chapeta dentro de la hoja (ambas filas no_reconocido)', () => {
    const filaA = filaBase({ fila: 3, numero: 175, nombre: 'MONA' });
    const filaB = filaBase({ fila: 4, numero: 175, nombre: 'MARGARITA' });
    const diff = construirDiffChequeo([filaA, filaB], [], []);
    expect(diff.filas.every((f) => f.clasificacion === 'no_reconocido')).toBe(true);

    const { aceptadas, rechazadas } = validarFilasCommit([filaA, filaB], diff);
    expect(aceptadas).toEqual([]);
    expect(rechazadas).toHaveLength(2);
  });
});

// ============================================================================
// construirFilasVacas -- fila aprobada -> forma insertable
// ============================================================================

describe('construirFilasVacas', () => {
  it('copia la capa cruda (*_raw) VERBATIM desde fila.raw', () => {
    const fila = filaBase({
      raw: {
        pl: '16', np: '2', ultimaCria: '01/2025', sx: 'A210', fechaServicio: '23/04/2026',
        toro: 'ins laredo', tp: '#VALUE!', estado: 'ok', secar: null, pp: null, ttto: 'penicilina',
      },
    });
    const aprobadas: FilaChequeoAprobada[] = [{ fila, animalId: 'animal-1' }];
    const [vaca] = construirFilasVacas(aprobadas);

    expect(vaca.pl_raw).toBe('16');
    expect(vaca.np_raw).toBe('2');
    expect(vaca.ultima_cria_raw).toBe('01/2025');
    expect(vaca.sx_raw).toBe('A210');
    expect(vaca.fecha_servicio_raw).toBe('23/04/2026');
    expect(vaca.toro_raw).toBe('ins laredo');
    expect(vaca.tp_raw).toBe('#VALUE!');
    expect(vaca.estado_raw).toBe('ok');
    expect(vaca.secar_raw).toBeNull();
    expect(vaca.pp_raw).toBeNull();
    expect(vaca.ttto_raw).toBe('penicilina');
    expect(vaca.animal_id).toBe('animal-1');
  });

  it('#VALUE!/celdas vacías se preservan en la capa cruda y la normalizada queda null -- la fila nunca se descarta', () => {
    const fila = filaBase({
      raw: { pl: '#VALUE!', np: null, ultimaCria: null, sx: null, fechaServicio: null, toro: null, tp: null, estado: null, secar: null, pp: null, ttto: null },
      pl: null,
      numPartos: null,
      fechasServicio: [],
      fechaSecar: null,
      fechaProbableParto: null,
      toroNombre: null,
      tipoServicio: null,
      estado: 'vacio',
    });
    const [vaca] = construirFilasVacas([{ fila, animalId: 'animal-1' }]);

    expect(vaca.pl_raw).toBe('#VALUE!');
    expect(vaca.pl).toBeNull();
    expect(vaca.fecha_servicio).toBeNull();
    expect(vaca.estado).toBeNull(); // 'vacio' del motor -> NULL de la BD, nunca 'vacia_apta' por defecto
  });

  it('estado normalizado real (no vacio) se preserva tal cual', () => {
    const fila = filaBase({ estado: 'vacia_problema' });
    const [vaca] = construirFilasVacas([{ fila, animalId: 'a1' }]);
    expect(vaca.estado).toBe('vacia_problema');
  });

  it('fecha_servicio es la ÚLTIMA fecha de la lista (V7: servicio vigente)', () => {
    const fila = filaBase({ fechasServicio: ['2026-01-10', '2026-03-15', '2026-05-20'] });
    const [vaca] = construirFilasVacas([{ fila, animalId: 'a1' }]);
    expect(vaca.fecha_servicio).toBe('2026-05-20');
  });

  it('propaga issues de normalización a normalizacion_issues, o null si no hay ninguno', () => {
    const conIssues = filaBase({ issues: [{ crudo: 'xx', motivo: 'no interpretable' }] });
    const [vacaConIssues] = construirFilasVacas([{ fila: conIssues, animalId: 'a1' }]);
    expect(vacaConIssues.normalizacion_issues).toEqual([{ crudo: 'xx', motivo: 'no interpretable' }]);

    const sinIssues = filaBase({ issues: [] });
    const [vacaSinIssues] = construirFilasVacas([{ fila: sinIssues, animalId: 'a1' }]);
    expect(vacaSinIssues.normalizacion_issues).toBeNull();
  });

  it('mantiene el orden de entrada (necesario para alinear vacaIndice de los eventos)', () => {
    const filaA = filaBase({ fila: 3, numero: 162 });
    const filaB = filaBase({ fila: 4, numero: 175 });
    const vacas = construirFilasVacas([
      { fila: filaA, animalId: 'a-162' },
      { fila: filaB, animalId: 'a-175' },
    ]);
    expect(vacas.map((v) => v.animal_id)).toEqual(['a-162', 'a-175']);
  });
});

// ============================================================================
// derivarEventosDeChequeo -- reusa descomponerSX, nunca un segundo motor
// ============================================================================

describe('derivarEventosDeChequeo', () => {
  it('emite un evento servicio por cada fecha de F Servicio, en orden, con el vacaIndice correcto', () => {
    const fila = filaBase({
      fechasServicio: ['2026-01-10', '2026-03-15'],
      sx: parseSX('vacia'),
      toroNombre: 'nitro',
      tipoServicio: 'monta',
    });
    const { eventos } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    const servicios = eventos.filter((e) => e.tipo === 'servicio');
    expect(servicios).toHaveLength(2);
    expect(servicios.map((e) => e.fecha)).toEqual(['2026-01-10', '2026-03-15']);
    expect(servicios.every((e) => e.vacaIndice === 0)).toBe(true);
    expect(servicios[0].toro_nombre).toBe('nitro');
  });

  it('SX=OV produce un evento parto con cria_destino macho_vendido', () => {
    const fila = filaBase({ sx: parseSX('OV'), fechasServicio: [] });
    const { eventos } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'parto', cria_destino: 'macho_vendido', vacaIndice: 0 }),
    ]);
  });

  it('SX=gem+ produce un evento parto gemelar', () => {
    const fila = filaBase({ sx: parseSX('gem+'), fechasServicio: [] });
    const { eventos, issues } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos).toEqual([
      expect.objectContaining({ tipo: 'parto', datos: { gemelar: true }, vacaIndice: 0 }),
    ]);
    expect(issues.length).toBeGreaterThan(0); // destino de las crías no registrado -- issue, nunca inventado
  });

  it('SX=vacia no produce ningún evento (estado, no evento)', () => {
    const fila = filaBase({ sx: parseSX('vacia'), fechasServicio: [] });
    const { eventos } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos).toEqual([]);
  });

  it('fila.sx === null (celda SX vacía) no produce eventos y no lanza', () => {
    const fila = filaBase({ sx: null, fechasServicio: [] });
    const { eventos, issues } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('fila.chequeoFecha === null no produce eventos aunque haya SX -- sin ancla temporal', () => {
    const fila = filaBase({ sx: parseSX('OV'), chequeoFecha: null, fechasServicio: [] });
    const { eventos } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos).toEqual([]);
  });

  it('alinea vacaIndice con la posición dentro del arreglo de aprobadas, no con fila.fila', () => {
    const filaSinEvento = filaBase({ fila: 10, sx: parseSX('vacia'), fechasServicio: [] });
    const filaConEvento = filaBase({ fila: 20, sx: parseSX('OV'), fechasServicio: [] });
    const { eventos } = derivarEventosDeChequeo([
      { fila: filaSinEvento, animalId: 'a1' },
      { fila: filaConEvento, animalId: 'a2' },
    ]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].vacaIndice).toBe(1); // segunda posición del arreglo, no fila.fila=20
  });

  it('multi-servicio + parto en la misma fila produce ambos, ordenados cronológicamente', () => {
    const fila = filaBase({
      fechasServicio: ['2025-10-01'],
      sx: parseSX('A2'),
      chequeoFecha: '2026-07-09',
    });
    const { eventos } = derivarEventosDeChequeo([{ fila, animalId: 'a1' }]);
    expect(eventos.map((e) => e.tipo)).toEqual(['servicio', 'parto']);
    expect(eventos[1]).toMatchObject({ cria_destino: 'retenida', datos: { numero_cria: 2 } });
  });
});

// ============================================================================
// construirPayloadCommit -- determinismo
// ============================================================================

describe('construirPayloadCommit', () => {
  it('resuelve toro_id desde toroIdPorNombre por clave normalizada (trim + lowercase)', () => {
    const fila = filaBase({ fechasServicio: ['2026-01-10'], toroNombre: 'Nitro', sx: parseSX('vacia') });
    const aprobadas: FilaChequeoAprobada[] = [{ fila, animalId: 'a1' }];
    const vacas = construirFilasVacas(aprobadas);
    const { eventos } = derivarEventosDeChequeo(aprobadas);

    const payload = construirPayloadCommit(
      { fecha: '2026-07-09', veterinario: 'Dr. Pérez' },
      vacas,
      eventos,
      new Map([['nitro', 'toro-uuid-1']]),
    );

    expect(payload.chequeo).toEqual({ fecha: '2026-07-09', veterinario: 'Dr. Pérez' });
    expect(payload.eventos[0]).toMatchObject({ vaca_index: 0, tipo: 'servicio', toro_id: 'toro-uuid-1' });
  });

  it('toro_id es null cuando el toro no está en el mapa resuelto (nunca inventa un id)', () => {
    const fila = filaBase({ fechasServicio: ['2026-01-10'], toroNombre: 'Desconocido', sx: parseSX('vacia') });
    const aprobadas: FilaChequeoAprobada[] = [{ fila, animalId: 'a1' }];
    const vacas = construirFilasVacas(aprobadas);
    const { eventos } = derivarEventosDeChequeo(aprobadas);

    const payload = construirPayloadCommit({ fecha: '2026-07-09' }, vacas, eventos, new Map());
    expect(payload.eventos[0].toro_id).toBeNull();
  });

  it('veterinario ausente se normaliza a null (nunca undefined en el payload)', () => {
    const payload = construirPayloadCommit({ fecha: '2026-07-09' }, [], [], new Map());
    expect(payload.chequeo.veterinario).toBeNull();
  });

  it('es determinístico: la misma entrada produce siempre el mismo payload', () => {
    const fila = filaBase({ fechasServicio: ['2026-01-10', '2026-03-01'], toroNombre: 'nitro', sx: parseSX('OV') });
    const aprobadas: FilaChequeoAprobada[] = [{ fila, animalId: 'a1' }];
    const vacas = construirFilasVacas(aprobadas);
    const { eventos } = derivarEventosDeChequeo(aprobadas);
    const toroMapa = new Map([['nitro', 'toro-uuid-1']]);

    const payload1 = construirPayloadCommit({ fecha: '2026-07-09', veterinario: 'Dr. X' }, vacas, eventos, toroMapa);
    const payload2 = construirPayloadCommit({ fecha: '2026-07-09', veterinario: 'Dr. X' }, vacas, eventos, toroMapa);
    expect(payload1).toEqual(payload2);
    expect(JSON.stringify(payload1)).toEqual(JSON.stringify(payload2));
  });
});
