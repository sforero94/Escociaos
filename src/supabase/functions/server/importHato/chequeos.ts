// ARCHIVO: src/supabase/functions/server/importHato/chequeos.ts
// GENERADO por docs/hato/regenerar-copias-importhato.py -- NUNCA edites este
// archivo a mano. Editá `src/utils/importHato/chequeos.ts` y volvé a correr el script.
//
// POR QUÉ EXISTE ESTE DUPLICADO: el endpoint B0/V10 (`POST
// .../hato/chequeo/preview`, `hato-chequeo-preview.ts`) corre en el árbol de
// despliegue de la edge function y no puede importar desde `src/utils/` --
// cruzaría la frontera del árbol de despliegue de Deno. Misma restricción
// que ya produjo `priorizacion-scouting.ts` y `calculos-hato.ts`.
//
// Contenido idéntico al original salvo los especificadores de import
// (reescritos para Deno: `@/utils/calculosHato` -> `../calculos-hato.ts`,
// `./xxx` -> `./xxx.ts`). `src/__tests__/importHatoParidadServidor.test.ts`
// corre este mismo script en modo `--check` y falla si alguien hand-editó
// una copia en vez de regenerarla.

// ARCHIVO: utils/importHato/chequeos.ts
// DESCRIPCIÓN: Orquesta la normalización de UNA hoja de chequeo física (ya
// clasificada como tal por `grilla.ts`): resuelve grilla (encabezado/offset/
// filas fantasma/sub-tabla) y aplica los parsers de celda de
// `calculosHato.ts` + `parseToro.ts` a cada fila de animal. Puro, cero I/O.

import type { HatoConfig, ParseIssue } from '../calculos-hato.ts';
import {
  parseFechasServicio,
  parseSX,
  parseFechaChequeo,
  parseValorNumerico,
  parseEstado,
  calcularPartoProbable,
  calcularFechaSecar,
} from '../calculos-hato.ts';
import type {
  HojaCruda,
  FilaChequeoNormalizada,
  FilaSubtablaNormalizada,
  ManifiestoHoja,
  ConfianzaFecha,
  CrudoFilaChequeo,
} from './tipos.ts';
import {
  construirColmapConEncabezado,
  localizarFilaEncabezado,
  extraerTituloHoja,
  sniffearOffsetHeaderless,
  esFilaVacia,
  esFilaEncabezadoRepetido,
  esMarcadorSubtabla,
  type ColmapChequeo,
  type GeneracionEncabezado,
} from './grilla.ts';
import { valorCeldaATexto, valorFechaATexto } from './celdas.ts';
import { parseToro } from './parseToro.ts';

/** Prefija cada issue con el nombre del campo del que vino -- con ~12 campos
 * por fila, un issue sin contexto ("texto no numérico") es ambiguo dentro de
 * `issues[]`; el crudo ya viene en el issue, pero no el CAMPO. */
function conCampo(campo: string, issues: ParseIssue[]): ParseIssue[] {
  return issues.map((i) => ({ ...i, motivo: `[${campo}] ${i.motivo}` }));
}

/** Mapea la confianza de `parseFechaChequeo` ('alta'/'media'/'baja', de
 * `calculosHato.ts`) a la del contrato S3 (`ConfianzaFecha`). `desconocida`
 * es específicamente "no se pudo resolver, fecha null" (doc tipos.ts) -- una
 * fecha `baja` mm RESUELTA (ej. completada por heurística de nombre de hoja)
 * es `aproximada`, no `desconocida`. */
function mapearConfianzaFecha(fecha: string | null, confianza: 'alta' | 'media' | 'baja'): ConfianzaFecha {
  if (fecha === null) return 'desconocida';
  return confianza === 'alta' ? 'exacta' : 'aproximada';
}

interface ResultadoProcesarChequeo {
  manifest: ManifiestoHoja;
  filas: FilaChequeoNormalizada[];
  subtablas: FilaSubtablaNormalizada[];
}

const CRUDO_VACIO: CrudoFilaChequeo = {
  pl: null,
  np: null,
  ultimaCria: null,
  sx: null,
  fechaServicio: null,
  toro: null,
  tp: null,
  estado: null,
  secar: null,
  pp: null,
  ttto: null,
};

function celda(fila: unknown[], idx: number | null): unknown {
  return idx === null ? null : fila[idx];
}

/**
 * Procesa UNA hoja física ya clasificada como 'chequeo'. `duplicadaDe` del
 * manifiesto sale null aquí a propósito -- el dedupe entre hojas (que
 * necesita ver TODAS las hojas del archivo a la vez) es responsabilidad de
 * `dedupe.ts`, llamado por `normalizar.ts` después de procesar cada hoja de
 * forma independiente.
 */
export function procesarHojaChequeo(hoja: HojaCruda, config: HatoConfig): ResultadoProcesarChequeo {
  const titulo = extraerTituloHoja(hoja.filas);
  const resultadoFecha = parseFechaChequeo(titulo, hoja.hoja);
  const chequeoFecha = resultadoFecha.fecha;
  const chequeoFechaConfianza = mapearConfianzaFecha(resultadoFecha.fecha, resultadoFecha.confianza);

  const filaEncabezadoIdx = localizarFilaEncabezado(hoja.filas);

  let colmap: ColmapChequeo;
  let generacion: GeneracionEncabezado;
  let columnasExtra: number[] = [];
  let offsetColumnas: number | null = null;
  const notasHoja: string[] = [];
  let filaInicioDatos: number;
  let encabezadoFisico: unknown[] | null = null;

  if (filaEncabezadoIdx !== null) {
    encabezadoFisico = hoja.filas[filaEncabezadoIdx];
    const resultadoColmap = construirColmapConEncabezado(encabezadoFisico);
    colmap = resultadoColmap.colmap;
    generacion = resultadoColmap.generacion;
    columnasExtra = resultadoColmap.columnasExtra;
    notasHoja.push(...resultadoColmap.notas);
    filaInicioDatos = filaEncabezadoIdx + 1;
  } else {
    const filasDatosCandidatas = hoja.filas.slice(1);
    const resultadoOffset = sniffearOffsetHeaderless(filasDatosCandidatas);
    colmap = resultadoOffset.colmap;
    generacion = 'sin_encabezado';
    offsetColumnas = resultadoOffset.offset;
    if (resultadoOffset.nota) notasHoja.push(resultadoOffset.nota);
    filaInicioDatos = 1;
  }

  const filasNormalizadas: FilaChequeoNormalizada[] = [];
  const subtablas: FilaSubtablaNormalizada[] = [];
  const descartesPorMotivo: Record<string, number> = {};
  let filasTotales = 0;
  let filasAnimal = 0;
  let enSubtabla = false;

  const sumarDescarte = (motivo: string) => {
    descartesPorMotivo[motivo] = (descartesPorMotivo[motivo] ?? 0) + 1;
  };

  for (let i = filaInicioDatos; i < hoja.filas.length; i++) {
    const filaFisica = hoja.filas[i];
    const numeroExcel = i + 1;
    filasTotales++;

    if (esFilaEncabezadoRepetido(filaFisica, colmap)) {
      sumarDescarte('encabezado_repetido');
      continue;
    }
    if (esFilaVacia(filaFisica, colmap)) {
      sumarDescarte('fantasma');
      continue;
    }
    if (!enSubtabla && colmap.nombre !== null && esMarcadorSubtabla(celda(filaFisica, colmap.nombre))) {
      enSubtabla = true;
      sumarDescarte('titulo_subtabla');
      continue;
    }

    filasAnimal++;

    if (enSubtabla) {
      const indiceRes = parseValorNumerico(celda(filaFisica, colmap.numero));
      const numeroRes = parseValorNumerico(celda(filaFisica, colmap.nombre));
      subtablas.push({
        archivo: hoja.archivo,
        hoja: hoja.hoja,
        fila: numeroExcel,
        indice: indiceRes.valor,
        numero: numeroRes.valor,
        nombre: valorCeldaATexto(celda(filaFisica, colmap.pl)),
        madreRaw: valorCeldaATexto(celda(filaFisica, colmap.sx)),
        issues: [...conCampo('índice', indiceRes.issues), ...conCampo('numero', numeroRes.issues)],
      });
      continue;
    }

    const issues: ParseIssue[] = [];

    const numeroRes = parseValorNumerico(celda(filaFisica, colmap.numero));
    issues.push(...conCampo('numero', numeroRes.issues));
    const nombre = valorCeldaATexto(celda(filaFisica, colmap.nombre));

    const plRes = parseValorNumerico(celda(filaFisica, colmap.pl));
    issues.push(...conCampo('PL', plRes.issues));
    const npRes = parseValorNumerico(celda(filaFisica, colmap.np));
    issues.push(...conCampo('#P2', npRes.issues));

    const ultimaCriaTexto = valorFechaATexto(celda(filaFisica, colmap.ultimaCria));

    const sxCruda = celda(filaFisica, colmap.sx);
    const sxRes = parseSX(sxCruda);
    issues.push(...conCampo('SX', sxRes.issues));

    const fechaServicioTexto = valorFechaATexto(celda(filaFisica, colmap.fechaServicio));
    const fechasServicioRes = parseFechasServicio(fechaServicioTexto);
    issues.push(...conCampo('F Servicio', fechasServicioRes.issues));

    const toroCruda = celda(filaFisica, colmap.toro);
    const toroRes = parseToro(toroCruda, config);
    issues.push(...conCampo('Toro', toroRes.issues));

    // D6 (decisión del dueño, 2026-07-22, resolution-report.md §6): un
    // código de ESTADO filtrado a la columna Toro NUNCA es un toro, "sin
    // excepción" -- incluso si la fila SÍ trae una fecha de servicio real.
    // `parseToro` ya deja `toroNombre=null` en ese caso (no depende de esta
    // fila cruzarse con F Servicio), así que aquí solo se deja constancia
    // explícita de la combinación: se conserva la fecha, el toro sigue null.
    if (toroRes.estadoMarcador !== null && fechasServicioRes.fechas.length > 0) {
      issues.push(
        ...conCampo('Toro', [
          {
            crudo: toroRes.crudo,
            motivo: `fila trae fecha de servicio Y un código de ESTADO en la columna Toro ('${toroRes.crudo}') -- se conserva la fecha de servicio, toro=null (decisión del dueño 2026-07-22: "no es un toro" es una regla absoluta, incluso con fecha).`,
          },
        ]),
      );
    }

    const tpTexto = valorCeldaATexto(celda(filaFisica, colmap.tp)); // NUNCA fecha-convertido: TP no es un serial (regla dura, ver calculosHato.ts)
    const secarTexto = valorFechaATexto(celda(filaFisica, colmap.secar));
    const ppTexto = valorFechaATexto(celda(filaFisica, colmap.pp));

    // ESTADO puede traer una fecha heredada de Gen1 (columna "SEC REAL"/
    // "parto real" en la MISMA posición histórica que OBS -- doc QA §2.10),
    // así que igual que F Servicio/SECAR/PP se textifica primero por si la
    // celda es un serial de Excel, nunca se pasa el número crudo a
    // `parseEstado` (perdería el patrón día/mes/año, ver celdas.ts).
    const estadoTexto = valorFechaATexto(celda(filaFisica, colmap.estado));
    const estadoRes = parseEstado(estadoTexto);
    issues.push(...conCampo('ESTADO', estadoRes.issues));

    const tttoTexto = valorCeldaATexto(celda(filaFisica, colmap.ttto));

    // Columnas con encabezado real pero sin rol asignado (Gen1: 'I',
    // 'SEC REAL'/'parto real' -- QA §2.10). Se preservan por fila, nunca se
    // interpretan.
    if (encabezadoFisico) {
      for (const idxExtra of columnasExtra) {
        const valorExtra = filaFisica[idxExtra];
        if (valorExtra === null || valorExtra === undefined || valorExtra === '') continue;
        const nombreColumna = valorCeldaATexto(encabezadoFisico[idxExtra]) ?? `col.física ${idxExtra}`;
        issues.push({
          crudo: valorFechaATexto(valorExtra) ?? String(valorExtra),
          motivo: `columna extra sin mapear en el encabezado ('${nombreColumna}') -- documenta un ciclo/evento distinto al de esta fila, no se interpreta (QA §2.10)`,
        });
      }
    }

    // SECAR/PP normalizados: SIEMPRE RE-DERIVADOS desde el último F Servicio
    // (nunca leídos de raw.secar/raw.pp -- regla dura, ver calculosHato.ts
    // `calcularFechaSecar`). Extract+Normalize no conoce la raza confirmada
    // del animal todavía (eso es identidad, responsabilidad de Resolve) --
    // se deriva con raza=null (cae al `_default` de `HatoConfig`); Resolve
    // puede recalcular con la raza real una vez resuelta la identidad.
    const fechaServicioVigente = fechasServicioRes.fechas.at(-1) ?? null;
    const fechaSecar = fechaServicioVigente ? calcularFechaSecar(fechaServicioVigente, null, config) : null;
    const fechaProbableParto = fechaServicioVigente ? calcularPartoProbable(fechaServicioVigente, config) : null;

    const raw: CrudoFilaChequeo = {
      ...CRUDO_VACIO,
      pl: valorCeldaATexto(celda(filaFisica, colmap.pl)),
      np: valorCeldaATexto(celda(filaFisica, colmap.np)),
      ultimaCria: ultimaCriaTexto,
      sx: valorCeldaATexto(sxCruda),
      fechaServicio: fechaServicioTexto,
      toro: valorCeldaATexto(toroCruda),
      tp: tpTexto,
      estado: estadoTexto,
      secar: secarTexto,
      pp: ppTexto,
      ttto: tttoTexto,
    };

    filasNormalizadas.push({
      archivo: hoja.archivo,
      hoja: hoja.hoja,
      fila: numeroExcel,
      generacionEncabezado: generacion,
      numero: numeroRes.valor,
      nombre,
      chequeoFecha,
      chequeoFechaConfianza,
      raw,
      pl: plRes.valor,
      numPartos: npRes.valor,
      fechasServicio: fechasServicioRes.fechas,
      sx: sxRes,
      estado: estadoRes.tipo,
      fechaSecar,
      fechaProbableParto,
      toroNombre: toroRes.toroNombre,
      tipoServicio: toroRes.tipoServicio,
      issues,
    });
  }

  const manifestIssues: ParseIssue[] = [
    ...resultadoFecha.issues,
    ...notasHoja.map((motivo) => ({ crudo: titulo, motivo })),
  ];

  const manifest: ManifiestoHoja = {
    archivo: hoja.archivo,
    hoja: hoja.hoja,
    chequeoFecha,
    chequeoFechaConfianza,
    generacionEncabezado: generacion,
    filaEncabezado: filaEncabezadoIdx,
    offsetColumnas,
    colmap,
    filasTotales,
    filasAnimal,
    filasDescartadas: filasTotales - filasAnimal,
    descartesPorMotivo,
    duplicadaDe: null,
    issues: manifestIssues,
  };

  return { manifest, filas: filasNormalizadas, subtablas };
}
