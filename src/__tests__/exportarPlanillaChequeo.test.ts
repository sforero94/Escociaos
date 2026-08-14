// ARCHIVO: __tests__/exportarPlanillaChequeo.test.ts
// DESCRIPCIÓN: B5.1/B5.2 (docs/hato/sesiones-b5-d7-e3.md, Session A). TDD de
// `utils/hato/exportarPlanillaChequeo.ts` -- el armador PURO del AOA/libro de
// la planilla de chequeo -- y de la parte B5.3 que vive en `grilla.ts`
// (`construirColmapConEncabezado` reconoce los headers en palabra completa
// de NUESTRO PROPIO formato). El round-trip completo (exportar -> volver a
// subir -> diff vacío) vive en `exportarPlanillaChequeoRoundTrip.test.ts`.

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { construirColmapConEncabezado } from '@/utils/importHato/grilla';
import { parseEstado } from '@/utils/calculosHato';
import {
  ENCABEZADOS_PLANILLA_CHEQUEO,
  FILA_ENCABEZADO_PLANILLA,
  construirAOAPlanillaChequeo,
  construirTituloHojaChequeo,
  construirNombreHojaChequeo,
  isoATextoDDMMYYYY,
  textoCeldaToro,
  textoCeldaEstado,
  textoCeldaEstadoRegistrado,
  construirLibroPlanillaChequeo,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';

function filaVacia(overrides: Partial<FilaPlanillaChequeo> & { numero: number; nombre: string }): FilaPlanillaChequeo {
  return {
    numero: overrides.numero,
    nombre: overrides.nombre,
    pl: overrides.pl ?? null,
    numPartos: overrides.numPartos ?? null,
    ultimaCria: overrides.ultimaCria ?? null,
    sexoCria: overrides.sexoCria ?? null,
    fechaServicio: overrides.fechaServicio ?? null,
    toro: overrides.toro ?? null,
    estadoRegistrado: overrides.estadoRegistrado ?? null,
    estado: overrides.estado ?? null,
    secar: overrides.secar ?? null,
    partoProbable: overrides.partoProbable ?? null,
    tratamiento: overrides.tratamiento ?? null,
  };
}

describe('construirTituloHojaChequeo / construirNombreHojaChequeo', () => {
  it('arma un título con día + mes en palabra + año -- la forma que parseFechaChequeo resuelve con confianza alta', () => {
    expect(construirTituloHojaChequeo('2026-07-22')).toBe('CHEQUEO 22 JULIO 2026');
    expect(construirTituloHojaChequeo('2026-01-05')).toBe('CHEQUEO 5 ENERO 2026');
  });

  it('el nombre de hoja usa el mismo mes/año que el título (nunca los contradice) y respeta el límite de 31 caracteres de Excel', () => {
    const nombre = construirNombreHojaChequeo('2026-07-22');
    expect(nombre).toBe('CHEQUEO JULIO 2026');
    expect(nombre.length).toBeLessThanOrEqual(31);
    expect(nombre).not.toMatch(/[:\\/?*[\]]/);
  });
});

describe('isoATextoDDMMYYYY', () => {
  it('convierte una fecha ISO a D/M/AAAA, el mismo formato que escribe Martha a mano', () => {
    expect(isoATextoDDMMYYYY('2026-07-22')).toBe('22/7/2026');
    expect(isoATextoDDMMYYYY('2026-01-05')).toBe('5/1/2026');
  });

  it('null/undefined -> null (celda vacía, nunca una fecha inventada)', () => {
    expect(isoATextoDDMMYYYY(null)).toBeNull();
    expect(isoATextoDDMMYYYY(undefined)).toBeNull();
  });
});

describe('textoCeldaToro', () => {
  it('antepone "Toro "/"Ins " según el tipo de servicio conocido -- el mismo prefijo que parseToro reconoce', () => {
    expect(textoCeldaToro('Nitro', 'monta')).toBe('Toro Nitro');
    expect(textoCeldaToro('Nitro', 'inseminacion')).toBe('Ins Nitro');
  });

  it('sin tipo de servicio conocido, deja el nombre solo -- nunca inventa un prefijo', () => {
    expect(textoCeldaToro('Nitro', null)).toBe('Nitro');
  });

  it('sin nombre de toro, la celda queda vacía', () => {
    expect(textoCeldaToro(null, 'monta')).toBeNull();
  });
});

describe('textoCeldaEstado (Fase 1 de docs/plan_chequeo_captura_foto.md)', () => {
  it('vacia_apta/vacia_problema vuelven a parsear al MISMO tipo -- round-trip exacto con parseEstado', () => {
    expect(textoCeldaEstado('vacia_apta')).toBe('ok');
    expect(textoCeldaEstado('vacia_problema')).toBe('rech');
    expect(parseEstado(textoCeldaEstado('vacia_apta')).tipo).toBe('vacia_apta');
    expect(parseEstado(textoCeldaEstado('vacia_problema')).tipo).toBe('vacia_problema');
  });

  it('fecha_heredada y desconocido dejan la celda vacía -- su significado vive solo en el crudo, que la vista no expone', () => {
    expect(textoCeldaEstado('fecha_heredada')).toBeNull();
    expect(textoCeldaEstado('desconocido')).toBeNull();
  });

  it('vacio/null/undefined -> celda vacía, nunca un código inventado', () => {
    expect(textoCeldaEstado('vacio')).toBeNull();
    expect(textoCeldaEstado(null)).toBeNull();
    expect(textoCeldaEstado(undefined)).toBeNull();
  });
});

describe('textoCeldaEstadoRegistrado (D-E, B5.4 -- N21/N22 del plan de agosto 2026)', () => {
  it('devuelve la MISMA etiqueta de 5 estados que el resto de la app (chipEstadoReproductivo)', () => {
    expect(textoCeldaEstadoRegistrado('servida')).toBe('Servida');
    expect(textoCeldaEstadoRegistrado('preñada')).toBe('Confirmada');
    expect(textoCeldaEstadoRegistrado('proxima_a_secar')).toBe('Por secar');
    expect(textoCeldaEstadoRegistrado('seca')).toBe('Seca');
    expect(textoCeldaEstadoRegistrado('vacia_por_servir')).toBe('Vacía');
    expect(textoCeldaEstadoRegistrado('parida_reciente')).toBe('Vacía');
  });

  it('null/undefined -> celda vacía, nunca un texto inventado', () => {
    expect(textoCeldaEstadoRegistrado(null)).toBeNull();
    expect(textoCeldaEstadoRegistrado(undefined)).toBeNull();
  });
});

describe('construirAOAPlanillaChequeo', () => {
  it('arma título (fila 0) + encabezado (fila 1, UNA sola vez) + filas de datos, una tabla continua', () => {
    const filas = [
      filaVacia({ numero: 101, nombre: 'LUCERO' }),
      filaVacia({ numero: 205, nombre: 'ESTRELLA' }),
    ];
    const aoa = construirAOAPlanillaChequeo('CHEQUEO 22 JULIO 2026', filas);

    expect(aoa).toHaveLength(4); // título + encabezado + 2 filas
    expect(aoa[0]).toEqual(['CHEQUEO 22 JULIO 2026']);
    expect(aoa[FILA_ENCABEZADO_PLANILLA]).toEqual([...ENCABEZADOS_PLANILLA_CHEQUEO]);
    expect(aoa[2][0]).toBe(101);
    expect(aoa[2][1]).toBe('LUCERO');
    expect(aoa[3][0]).toBe(205);

    // El encabezado aparece EXACTAMENTE una vez -- requisito duro de B5.1
    // ("nunca repetir la fila de header, rompe la extracción del parser").
    const filasQueSonElEncabezado = aoa.filter(
      (fila) => JSON.stringify(fila) === JSON.stringify([...ENCABEZADOS_PLANILLA_CHEQUEO]),
    );
    expect(filasQueSonElEncabezado).toHaveLength(1);
  });

  it('el template tiene 13 columnas -- las 13 históricas menos TP, más "Estado registrado" (D-E, B5.4)', () => {
    expect(ENCABEZADOS_PLANILLA_CHEQUEO).toHaveLength(13);
    expect(ENCABEZADOS_PLANILLA_CHEQUEO).not.toContain('TP');
    expect(ENCABEZADOS_PLANILLA_CHEQUEO).toContain('Estado registrado');
  });
});

describe('construirLibroPlanillaChequeo -- ensamblado real con xlsx', () => {
  it('escribe anchos de columna, márgenes angostos y Print Titles apuntando a la fila de encabezado (paginado de impresión)', () => {
    const filas = [filaVacia({ numero: 101, nombre: 'LUCERO' })];
    const libro = construirLibroPlanillaChequeo(XLSX, {
      tituloHoja: 'CHEQUEO 22 JULIO 2026',
      nombreHoja: 'CHEQUEO JULIO 2026',
      filas,
    });

    const hoja = libro.Sheets['CHEQUEO JULIO 2026'];
    expect(hoja['!cols']).toBeDefined();
    expect(hoja['!cols']).toHaveLength(ENCABEZADOS_PLANILLA_CHEQUEO.length);
    expect(hoja['!margins']).toMatchObject({ left: 0.4, right: 0.4 });

    const printTitles = libro.Workbook?.Names?.find((n) => n.Name === '_xlnm.Print_Titles');
    expect(printTitles).toBeDefined();
    expect(printTitles?.Sheet).toBe(0);
    // Fila de encabezado 0-based = 1 -> fila de Excel (1-indexada) = 2.
    expect(printTitles?.Ref).toBe("'CHEQUEO JULIO 2026'!$2:$2");
  });

  it('el libro escrito a bytes y vuelto a leer conserva el encabezado exactamente una vez (round-trip estructural)', () => {
    const filas = [filaVacia({ numero: 101, nombre: 'LUCERO' }), filaVacia({ numero: 205, nombre: 'ESTRELLA' })];
    const libro = construirLibroPlanillaChequeo(XLSX, {
      tituloHoja: 'CHEQUEO 22 JULIO 2026',
      nombreHoja: 'CHEQUEO JULIO 2026',
      filas,
    });

    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const libroLeido = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const hojaLeida = libroLeido.Sheets[libroLeido.SheetNames[0]];
    const aoaLeido = XLSX.utils.sheet_to_json(hojaLeida, { header: 1, defval: null }) as unknown[][];

    expect(aoaLeido[0][0]).toBe('CHEQUEO 22 JULIO 2026');
    expect(aoaLeido[1].slice(0, 2)).toEqual(['#', 'Nombre']);
    expect(aoaLeido).toHaveLength(4);
  });
});

describe('B5.3/B5.4 -- grilla.ts reconoce los headers en palabra completa de nuestro propio formato', () => {
  it('construirColmapConEncabezado mapea las 13 columnas del template sin ambigüedad y sin columna TP', () => {
    const { colmap, generacion, columnasExtra, notas } = construirColmapConEncabezado([...ENCABEZADOS_PLANILLA_CHEQUEO]);

    expect(colmap).toEqual({
      numero: 0,
      nombre: 1,
      pl: 2,
      np: 3,
      ultimaCria: 4,
      sx: 5,
      fechaServicio: 6,
      toro: 7,
      estadoRegistrado: 8, // "Estado registrado" (D-E, B5.4) -- exclusiva de nuestro formato
      tp: null, // TP se elimina del template -- nunca se lee (regla dura del motor)
      estado: 9,
      secar: 10,
      pp: 11,
      ttto: 12,
    });
    expect(generacion).toBe(3);
    expect(columnasExtra).toEqual([]);
    expect(notas).toEqual([]);
  });

  it('sigue reconociendo los headers históricos de las 3 generaciones (no se rompió ningún alias existente)', () => {
    const gen2 = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'OBS', 'F Secar', 'F parto', 'TTTO'];
    const { colmap, generacion } = construirColmapConEncabezado(gen2);
    expect(colmap.np).toBe(3);
    expect(colmap.ultimaCria).toBe(4);
    expect(colmap.sx).toBe(5);
    expect(colmap.fechaServicio).toBe(6);
    expect(colmap.tp).toBe(8);
    expect(colmap.estado).toBe(9);
    expect(generacion).toBe(2);
    // Ninguna generación histórica trae "Estado registrado" (B5.4 es
    // exclusiva de nuestro propio formato) -- alias aditivo, nunca inventado.
    expect(colmap.estadoRegistrado).toBeNull();
  });
});
