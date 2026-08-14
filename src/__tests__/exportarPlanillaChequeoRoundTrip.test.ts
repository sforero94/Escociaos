// ARCHIVO: __tests__/exportarPlanillaChequeoRoundTrip.test.ts
// DESCRIPCIÓN: B5.3 (docs/hato/sesiones-b5-d7-e3.md, requisito D-4). Prueba
// que exportar + volver a subir un chequeo son operaciones INVERSAS:
//
//   estado actual (BD) -> exportar planilla (B5.2, `filaPlanillaDesdeChequeoVaca`
//   en `ChequeoDetalle.tsx`) -> escribir .xlsx real -> leer .xlsx real (mismo
//   lector celda-por-celda que `extract.ts`/`hato-chequeo-preview.ts`) ->
//   `normalizarHojas` -> `construirDiffChequeo` contra el MISMO estado actual
//   -> diff VACÍO.
//
// Esto es exactamente el flujo D-4 ("app PRINTS -> vet llena en papel ->
// alguien actualiza el .xlsx -> se sube -> se parsea/diffea") aplicado al
// caso límite "nada cambió" -- si el exportador y el parser no fueran
// inversos exactos, re-subir un chequeo sin cambios mostraría diffs
// fantasma en CADA campo, todas las semanas.
//
// Las filas de la planilla se construyen igual que `filaPlanillaDesdeChequeoVaca`
// (`ChequeoDetalle.tsx`, B5.2): pasando el texto CRUDO (`*_raw`) verbatim --
// nunca reformateando los valores normalizados -- porque ese crudo es
// exactamente lo que ya se normalizó una vez para llegar al estado actual
// que este test usa como "lo que hay en la base".

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import type { HatoConfig } from '@/utils/calculosHato';
import {
  parseValorNumerico,
  parseFechasServicio,
  parseEstado,
  calcularFechaSecar,
  calcularPartoProbable,
  type TipoEstado,
} from '@/utils/calculosHato';
import { parseToro } from '@/utils/importHato/parseToro';
import type { HojaCruda } from '@/utils/importHato/tipos';
import { normalizarHojas } from '@/utils/importHato/normalizar';
import {
  construirDiffChequeo,
  type AnimalHatoActual,
  type UltimoChequeoVacaActual,
} from '@/utils/importHato/diffChequeo';
import {
  construirLibroPlanillaChequeo,
  construirTituloHojaChequeo,
  construirNombreHojaChequeo,
  isoATextoDDMMYYYY,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
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

const FECHA_CHEQUEO_ACTUAL = '2026-07-22';
const ARCHIVO = 'chequeo-2026-07-22.xlsx';

/**
 * Mismo lector celda-por-celda que `scripts/import-hato/extract.ts` y
 * `src/supabase/functions/server/hato-chequeo-preview.ts` -- `cellDates:
 * false`, error de Excel preservado como TEXTO (nunca su código numérico),
 * NUNCA `sheet_to_json`. Se reimplementa acá (no se extrae a un módulo
 * compartido nuevo): mismo patrón de pequeña duplicación ya existente entre
 * esos dos archivos, alcance de esta sesión es el exportador, no una tercera
 * abstracción de este lector.
 */
function hojaAMatriz(ws: XLSX.WorkSheet): unknown[][] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const rango = XLSX.utils.decode_range(ref);
  const filas: unknown[][] = [];
  for (let r = rango.s.r; r <= rango.e.r; r++) {
    const fila: unknown[] = [];
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (celda === undefined || celda.v === undefined || celda.v === null) {
        fila.push(null);
        continue;
      }
      if (celda.t === 'e') {
        fila.push(celda.w ?? '#VALUE!');
        continue;
      }
      fila.push(celda.v);
    }
    filas.push(fila);
  }
  return filas;
}

interface AnimalFixture {
  id: string;
  numero: number;
  nombre: string;
  plRaw: number | null;
  numPartosRaw: number | null;
  fechaServicioRaw: string | null;
  toroRaw: string | null;
  estadoRaw: string | null;
  ultimaCriaRaw: string | null;
  sxRaw: string | null;
  tttoRaw: string | null;
}

/**
 * "Lo que hay en la base" para un animal: aplica los MISMOS parsers puros
 * que usa el pipeline real (`chequeos.ts`) sobre el texto crudo elegido,
 * para construir el estado normalizado ACTUAL -- y arma también la fila de
 * planilla (B5.2: texto crudo verbatim) que se exportaría hoy. Si el
 * exportador y el parser fueran inconsistentes entre sí, este helper no
 * cambiaría nada (sigue siendo el "antes" correcto); lo que prueba el test
 * es que reparsear la planilla exportada reproduce EXACTAMENTE este mismo
 * "antes".
 */
function construirFixture(a: AnimalFixture): {
  animal: AnimalHatoActual;
  ultimo: UltimoChequeoVacaActual;
  fila: FilaPlanillaChequeo;
} {
  const pl = parseValorNumerico(a.plRaw);
  const numPartos = parseValorNumerico(a.numPartosRaw);
  const servicio = parseFechasServicio(a.fechaServicioRaw);
  const fechaServicioVigente = servicio.fechas.at(-1) ?? null;
  const toro = parseToro(a.toroRaw, CONFIG);
  const estadoParseado = parseEstado(a.estadoRaw);
  const estadoNorm: TipoEstado | null = estadoParseado.tipo === 'vacio' ? null : estadoParseado.tipo;
  const fechaSecar = fechaServicioVigente ? calcularFechaSecar(fechaServicioVigente, null, CONFIG) : null;
  const fechaProbableParto = fechaServicioVigente ? calcularPartoProbable(fechaServicioVigente, CONFIG) : null;

  return {
    animal: { id: a.id, numero: a.numero, nombre: a.nombre, etapa: 'vaca', estado: 'activa' },
    ultimo: {
      animalId: a.id,
      chequeoFecha: '2026-05-20', // chequeo anterior -- solo informativo, no se compara
      pl: pl.valor,
      numPartos: numPartos.valor,
      fechaServicio: fechaServicioVigente,
      toro: toro.toroNombre,
      tipoServicio: toro.tipoServicio,
      fechaSecar,
      fechaProbableParto,
      estado: estadoNorm,
    },
    fila: {
      numero: a.numero,
      nombre: a.nombre,
      // B5.2 (`filaPlanillaDesdeChequeoVaca`, ChequeoDetalle.tsx): texto
      // crudo verbatim, nunca reconstruido a partir de lo normalizado.
      pl: a.plRaw,
      numPartos: a.numPartosRaw,
      ultimaCria: a.ultimaCriaRaw,
      sexoCria: a.sxRaw,
      fechaServicio: a.fechaServicioRaw,
      toro: a.toroRaw,
      estado: a.estadoRaw,
      // Secar/Parto Probable son referencia de solo-lectura -- el parser de
      // subida los IGNORA y siempre re-deriva desde Fecha Servicio (ver
      // `chequeos.ts`), así que su presencia/formato no debe afectar el
      // diff en absoluto.
      secar: isoATextoDDMMYYYY(fechaSecar),
      partoProbable: isoATextoDDMMYYYY(fechaProbableParto),
      tratamiento: a.tttoRaw,
    },
  };
}

describe('B5.3 -- round-trip: exportar un chequeo existente y volver a subirlo sin cambios produce diff vacío', () => {
  it('LUCERO (servicio con toro por monta, estado ok) y ESTRELLA (sin servicio, estado rech) -- ambas sin_cambio', () => {
    const lucero = construirFixture({
      id: 'animal-lucero',
      numero: 101,
      nombre: 'LUCERO',
      plRaw: 18.5,
      numPartosRaw: 3,
      fechaServicioRaw: '10/5/2026',
      toroRaw: 'Toro Nitro',
      estadoRaw: 'ok',
      ultimaCriaRaw: '1/2/2025',
      sxRaw: 'ov',
      tttoRaw: null,
    });
    const estrella = construirFixture({
      id: 'animal-estrella',
      numero: 205,
      nombre: 'ESTRELLA',
      plRaw: 12,
      numPartosRaw: 1,
      fechaServicioRaw: null,
      toroRaw: null,
      estadoRaw: 'rech',
      ultimaCriaRaw: null,
      sxRaw: null,
      tttoRaw: 'Vit ADE',
    });

    // ---- exportar (B5.2) ----
    const libro = construirLibroPlanillaChequeo(XLSX, {
      tituloHoja: construirTituloHojaChequeo(FECHA_CHEQUEO_ACTUAL),
      nombreHoja: construirNombreHojaChequeo(FECHA_CHEQUEO_ACTUAL),
      filas: [lucero.fila, estrella.fila],
    });
    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    // ---- volver a "subir" (mismo lector que hato-chequeo-preview.ts) ----
    const libroLeido = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const nombreHojaLeida = libroLeido.SheetNames[0];
    const hojaCruda: HojaCruda = {
      archivo: ARCHIVO,
      hoja: nombreHojaLeida,
      filas: hojaAMatriz(libroLeido.Sheets[nombreHojaLeida]),
    };

    const salida = normalizarHojas([hojaCruda], '2026-07-24T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toHaveLength(2);
    // Confianza alta en la fecha del chequeo -- el título round-tripeó exacto.
    expect(salida.chequeos[0].chequeoFecha).toBe(FECHA_CHEQUEO_ACTUAL);
    expect(salida.chequeos[0].chequeoFechaConfianza).toBe('exacta');
    // Ninguna fila con issues de normalización -- fidelidad completa.
    expect(salida.chequeos.every((f) => f.issues.length === 0)).toBe(true);

    // ---- diffear contra el mismo estado actual ----
    const diff = construirDiffChequeo(
      salida.chequeos,
      [lucero.animal, estrella.animal],
      [lucero.ultimo, estrella.ultimo],
    );

    expect(diff.colisionesEnHoja).toEqual([]);
    expect(diff.resumen).toEqual({
      totalFilas: 2,
      nuevos: 0,
      sinCambio: 2,
      cambios: 0,
      noReconocidos: 0,
      conIssues: 0,
      conConflictoEstadoRegistrado: 0,
    });
    for (const fila of diff.filas) {
      expect(fila.clasificacion).toBe('sin_cambio');
      expect(fila.diferencias).toEqual([]);
      // Sin `estadosRegistrados` (el 4º parámetro, opcional) el diff nunca
      // fabrica un conflicto -- mismo contrato de "sin dato antes que dato
      // inventado" del resto del módulo.
      expect(fila.conflictoEstadoRegistrado).toBeNull();
    }
  });

  it('D-E/B5.4 -- "Estado registrado" (columna 13) round-tripea VERBATIM: exportar, re-leer, y compararlo contra lo que el sistema cree hoy detecta el conflicto explícito (N23)', () => {
    const vaca = construirFixture({
      id: 'animal-vaca',
      numero: 300,
      nombre: 'VACA',
      plRaw: 15,
      numPartosRaw: 2,
      fechaServicioRaw: '10/8/2026',
      toroRaw: 'Toro Jersey',
      estadoRaw: null,
      ultimaCriaRaw: null,
      sxRaw: null,
      tttoRaw: null,
    });
    // "Estado registrado" es la MISMA etiqueta que ve el resto de la app
    // (chipEstadoReproductivo/etiquetaEstadoReproductivo) -- impresa cuando
    // se exportó esta planilla.
    const filaImpresa: FilaPlanillaChequeo = { ...vaca.fila, estadoRegistrado: 'Servida' };

    const libro = construirLibroPlanillaChequeo(XLSX, {
      tituloHoja: construirTituloHojaChequeo(FECHA_CHEQUEO_ACTUAL),
      nombreHoja: construirNombreHojaChequeo(FECHA_CHEQUEO_ACTUAL),
      filas: [filaImpresa],
    });
    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const libroLeido = XLSX.read(buf, { type: 'buffer', cellDates: false });
    const nombreHojaLeida = libroLeido.SheetNames[0];
    const hojaCruda: HojaCruda = {
      archivo: ARCHIVO,
      hoja: nombreHojaLeida,
      filas: hojaAMatriz(libroLeido.Sheets[nombreHojaLeida]),
    };

    const salida = normalizarHojas([hojaCruda], '2026-08-20T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toHaveLength(1);
    // Round-trip VERBATIM: lo que se imprimió vuelve a leerse exactamente igual.
    expect(salida.chequeos[0].estadoRegistrado).toBe('Servida');
    expect(salida.chequeos[0].raw.estadoRegistrado).toBe('Servida');

    // El sistema, al momento de aprobar, ahora cree OTRA cosa (p. ej. Martha
    // ya la confirmó preñada por palpación en el ínterin) -- eso es
    // exactamente el conflicto que N23 pide mostrar ANTES de aprobar.
    const diffConConflicto = construirDiffChequeo(
      salida.chequeos,
      [vaca.animal],
      [vaca.ultimo],
      [{ animalId: 'animal-vaca', estado: 'Confirmada' }],
    );
    expect(diffConConflicto.filas[0].conflictoEstadoRegistrado).toEqual({
      impreso: 'Servida',
      actual: 'Confirmada',
    });
    expect(diffConConflicto.resumen.conConflictoEstadoRegistrado).toBe(1);

    // Si en cambio el sistema sigue creyendo lo mismo que se imprimió, no hay
    // conflicto que mostrar -- nunca se fabrica una alerta de la nada.
    const diffSinConflicto = construirDiffChequeo(
      salida.chequeos,
      [vaca.animal],
      [vaca.ultimo],
      [{ animalId: 'animal-vaca', estado: 'Servida' }],
    );
    expect(diffSinConflicto.filas[0].conflictoEstadoRegistrado).toBeNull();
  });
});
