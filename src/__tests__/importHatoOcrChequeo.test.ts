// ARCHIVO: __tests__/importHatoOcrChequeo.test.ts
// DESCRIPCIÓN: Fase 3b de `docs/plan_chequeo_captura_foto.md` -- la ruta de
// carga del chequeo POR FOTO. `ocrChequeo.ts` es puro: no llama al modelo de
// visión ni toca Supabase. Recibe la respuesta YA des-serializada del modelo
// (los fixtures de este archivo son exactamente eso) más el roster de vacas
// activas, y devuelve la matriz cruda que el pipeline existente consume.
//
// Lo que estos tests protegen, en orden de importancia:
//   1. ANTI-ROW-DRIFT: una fila cuya ancla (`#` + `Nombre` impresos) no cuadra
//      con el roster NUNCA se procesa ni se desplaza.
//   2. "SIN DATO, NUNCA 0" EN LA LECTURA: una celda `baja`/`ilegible` entra
//      vacía y marcada, jamás adivinada.
//   3. El reporte de vacas del roster que no aparecieron en ninguna foto (el
//      detector de "faltó una página").
//   4. Que la matriz cruda atraviese el MISMO pipeline (`normalizarHojas`) y
//      el MISMO `construirDiffChequeo` que la ruta `.xlsx`, sin un segundo
//      parser de celdas.

import { describe, it, expect } from 'vitest';
import {
  COLUMNAS_OCR,
  ENCABEZADOS_HOJA_OCR,
  ENCABEZADO_POR_COLUMNA_OCR,
  aplicarFechaChequeo,
  construirPromptOcr,
  construirRosterPlanilla,
  distanciaEdicionAcotada,
  esquemaJsonOcr,
  normalizarNombreParaCotejo,
  parsearRespuestaModeloOcr,
  procesarLecturaOcr,
  sugerirFechaChequeo,
  validarAnclaFila,
  type AnimalRosterPlanilla,
  type CeldaOcr,
  type ColumnaOcr,
  type FilaOcr,
} from '@/utils/importHato/ocrChequeo';
import { ENCABEZADOS_PLANILLA_CHEQUEO } from '@/utils/hato/exportarPlanillaChequeo';
import { normalizarHojas } from '@/utils/importHato/normalizar';
import { construirDiffChequeo } from '@/utils/importHato/diffChequeo';
import type { AnimalHatoActual } from '@/utils/importHato/diffChequeo';
import type { HatoConfig } from '@/utils/calculosHato';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda', 'gyr'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_rechequeo_due: 60,
  dias_espera_voluntaria_post_parto: 60,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
};

const ROSTER_BASE: AnimalRosterPlanilla[] = [
  { id: 'uuid-101', numero: 101, nombre: 'ALINA' },
  { id: 'uuid-102', numero: 102, nombre: 'GALLEGA' },
  { id: 'uuid-103', numero: 103, nombre: 'CAMILA' },
];

/** Construye una celda leída. Por defecto confianza `alta`: los tests que
 * ejercitan la degradación la piden explícitamente. */
function celda(texto: string, confianza: CeldaOcr['confianza'] = 'alta'): CeldaOcr {
  return { texto, confianza };
}

function celdas(parcial: Partial<Record<ColumnaOcr, CeldaOcr>> = {}): Record<ColumnaOcr, CeldaOcr> {
  const salida = {} as Record<ColumnaOcr, CeldaOcr>;
  for (const col of COLUMNAS_OCR) salida[col] = parcial[col] ?? celda('');
  return salida;
}

function filaOcr(datos: Partial<FilaOcr> & { numeroImpreso: string; nombreImpreso: string }): FilaOcr {
  return {
    pagina: datos.pagina ?? 1,
    orden: datos.orden ?? 1,
    numeroImpreso: datos.numeroImpreso,
    nombreImpreso: datos.nombreImpreso,
    celdas: datos.celdas ?? celdas(),
  };
}

/** Respuesta cruda del modelo, tal cual llega del `response_format` json_schema
 * (ya des-serializada). Este es el fixture que reemplaza la llamada real, que
 * no se puede hacer en el contenedor de CI (no hay OPENROUTER_API_KEY). */
function respuestaModelo(filas: Array<Record<string, unknown>>, tituloLeido = '') {
  return { titulo_leido: tituloLeido, filas };
}

function celdasJson(parcial: Record<string, { texto: string; confianza: string }>) {
  const salida: Record<string, { texto: string; confianza: string }> = {};
  for (const col of COLUMNAS_OCR) {
    salida[col] = parcial[col] ?? { texto: '', confianza: 'alta' };
  }
  return salida;
}

const OPCIONES_HOJA = { archivo: 'planilla-chequeo-foto', hoja: 'CHEQUEO FOTO', titulo: '' };

// ---------------------------------------------------------------------------
// 1. El vocabulario de columnas no puede desincronizarse de la planilla real
// ---------------------------------------------------------------------------

describe('vocabulario de columnas', () => {
  it('los encabezados de la matriz OCR son IDÉNTICOS a los de la planilla impresa', () => {
    // Si esto se rompe, el colmap de `grilla.ts` deja columnas sin mapear y la
    // carga por foto pierde datos EN SILENCIO. `ocrChequeo.ts` no puede
    // importar el módulo de exportación (rompería el espejo Deno), así que el
    // acople lo garantiza este test y no la buena fe.
    expect([...ENCABEZADOS_HOJA_OCR]).toEqual([...ENCABEZADOS_PLANILLA_CHEQUEO]);
  });

  it('cada columna OCR tiene un encabezado impreso declarado', () => {
    for (const col of COLUMNAS_OCR) {
      expect(ENCABEZADO_POR_COLUMNA_OCR[col]).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Parseo de la respuesta del modelo
// ---------------------------------------------------------------------------

describe('parsearRespuestaModeloOcr', () => {
  it('convierte una respuesta bien formada en una lectura de página', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo(
        [
          {
            numero_impreso: '101',
            nombre_impreso: 'ALINA',
            celdas: celdasJson({ pl: { texto: '18', confianza: 'alta' } }),
          },
        ],
        'CHEQUEO 12 AGOSTO 2026',
      ),
      1,
    );
    expect(lectura.pagina).toBe(1);
    expect(lectura.tituloLeido).toBe('CHEQUEO 12 AGOSTO 2026');
    expect(lectura.filas).toHaveLength(1);
    expect(lectura.filas[0].celdas.pl).toEqual({ texto: '18', confianza: 'alta' });
    expect(lectura.filas[0].orden).toBe(1);
  });

  it('degrada a ilegible una confianza que no reconoce, y lo deja por escrito', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({ toro: { texto: 'NITRO', confianza: 'muy alta' } }),
        },
      ]),
      1,
    );
    expect(lectura.filas[0].celdas.toro.confianza).toBe('ilegible');
    expect(lectura.avisos.join(' ')).toContain("confianza 'muy alta' no reconocida");
  });

  it('una columna ausente en la respuesta queda ilegible, no "vacía en el papel"', () => {
    const celdasParciales = celdasJson({});
    delete (celdasParciales as Record<string, unknown>).tratamiento;
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([{ numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasParciales }]),
      1,
    );
    expect(lectura.filas[0].celdas.tratamiento).toEqual({ texto: '', confianza: 'ilegible' });
  });

  it('explota si la respuesta no trae el arreglo de filas (0 filas en silencio sería peor)', () => {
    expect(() => parsearRespuestaModeloOcr({ titulo_leido: '' }, 2)).toThrow(/no trae el arreglo/);
    expect(() => parsearRespuestaModeloOcr('no es json', 1)).toThrow(/no es un objeto/);
  });
});

// ---------------------------------------------------------------------------
// 3. Roster y ancla (anti-row-drift)
// ---------------------------------------------------------------------------

describe('construirRosterPlanilla', () => {
  it('indexa por chapeta y aparta los animales que no pueden anclar una fila', () => {
    const roster = construirRosterPlanilla([
      ...ROSTER_BASE,
      { id: 'uuid-sin-numero', numero: null, nombre: 'SIN CARAVANA' },
      { id: 'uuid-sin-nombre', numero: 200, nombre: '  ' },
    ]);
    expect(roster.entradas).toHaveLength(3);
    expect(roster.porNumero.get(102)?.nombre).toBe('GALLEGA');
    expect(roster.sinAncla.map((a) => a.id)).toEqual(['uuid-sin-numero', 'uuid-sin-nombre']);
  });

  it('marca ambigua una chapeta compartida por dos vacas activas', () => {
    const roster = construirRosterPlanilla([
      ...ROSTER_BASE,
      { id: 'uuid-101-bis', numero: 101, nombre: 'OTRA ALINA' },
    ]);
    expect(roster.numerosAmbiguos.has(101)).toBe(true);
  });
});

describe('validarAnclaFila (anti-row-drift)', () => {
  const roster = construirRosterPlanilla(ROSTER_BASE);

  it('acepta la fila cuando # y Nombre impresos corresponden al mismo animal', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '102', nombreImpreso: 'GALLEGA' }), roster);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.entrada.id).toBe('uuid-102');
      expect(resultado.avisos).toEqual([]);
    }
  });

  it('ignora tildes, mayúsculas y puntuación al cotejar el nombre', () => {
    const rosterAcentos = construirRosterPlanilla([{ id: 'x', numero: 7, nombre: 'MARÍA-JOSÉ' }]);
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '7', nombreImpreso: 'maria jose' }), rosterAcentos);
    expect(resultado.ok).toBe(true);
    expect(normalizarNombreParaCotejo('MARÍA-JOSÉ')).toBe('MARIA JOSE');
  });

  it('RECHAZA la fila cuando el nombre leído es el de OTRA vaca del roster (firma del corrimiento)', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '102', nombreImpreso: 'CAMILA' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('nombre_no_corresponde');
      expect(resultado.detalle).toContain('#103');
      expect(resultado.detalle).toContain('corrimiento');
    }
  });

  it('rechaza una chapeta que no está en el roster impreso', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '777', nombreImpreso: 'NOVILLA NUEVA' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('numero_fuera_del_roster');
  });

  it('rechaza una chapeta ilegible en vez de adivinarla', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '1O2', nombreImpreso: 'GALLEGA' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('numero_ilegible');
  });

  it('rechaza una chapeta ambigua en el roster en vez de adjudicarla', () => {
    const rosterAmbiguo = construirRosterPlanilla([
      ...ROSTER_BASE,
      { id: 'uuid-101-bis', numero: 101, nombre: 'OTRA ALINA' },
    ]);
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '101', nombreImpreso: 'ALINA' }), rosterAmbiguo);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('chapeta_ambigua_en_roster');
  });

  it('tolera UNA letra de diferencia en el nombre impreso, pero lo deja anotado', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '101', nombreImpreso: 'ALINE' }), roster);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.avisos).toHaveLength(1);
      expect(resultado.avisos[0].motivo).toContain('una letra de diferencia');
    }
  });

  it('no tolera dos o más letras de diferencia', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '101', nombreImpreso: 'ALTURA' }), roster);
    expect(resultado.ok).toBe(false);
  });

  it('rechaza la fila si no se leyó ningún nombre impreso (falta la segunda ancla)', () => {
    const resultado = validarAnclaFila(filaOcr({ numeroImpreso: '101', nombreImpreso: '' }), roster);
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('nombre_no_corresponde');
  });

  it('distanciaEdicionAcotada corta apenas supera el máximo', () => {
    expect(distanciaEdicionAcotada('ALINA', 'ALINA', 1)).toBe(0);
    expect(distanciaEdicionAcotada('ALINA', 'ALINE', 1)).toBe(1);
    expect(distanciaEdicionAcotada('ALINA', 'CAMILA', 1)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Orquestación: matriz cruda, confianza y faltantes
// ---------------------------------------------------------------------------

describe('procesarLecturaOcr', () => {
  const roster = construirRosterPlanilla(ROSTER_BASE);

  it('arma la matriz cruda con título, encabezado y una fila por vaca confirmada', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({
            pl: { texto: '18', confianza: 'alta' },
            fecha_servicio: { texto: '5/6/2026', confianza: 'alta' },
            toro: { texto: 'Ins NITRO', confianza: 'alta' },
            sexo_cria: { texto: 'A 206', confianza: 'alta' },
          }),
        },
        {
          numero_impreso: '102',
          nombre_impreso: 'GALLEGA',
          celdas: celdasJson({ estado: { texto: 'ok', confianza: 'alta' } }),
        },
      ]),
      1,
    );

    const resultado = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);

    expect(resultado.hoja.filas[0]).toEqual(['']);
    expect(resultado.hoja.filas[1]).toEqual([...ENCABEZADOS_HOJA_OCR]);
    expect(resultado.hoja.filas).toHaveLength(4);
    // Las anclas se escriben con el valor CANÓNICO del roster, no con lo leído.
    expect(resultado.hoja.filas[2][0]).toBe('101');
    expect(resultado.hoja.filas[2][1]).toBe('ALINA');
    // El código SX viaja VERBATIM: acá no se interpreta nada.
    expect(resultado.hoja.filas[2]).toContain('A 206');
    expect(resultado.filasConfirmadas.map((f) => f.filaExcel)).toEqual([3, 4]);
  });

  it('una celda de baja confianza entra VACÍA y queda marcada -- nunca adivinada', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({
            toro: { texto: 'NITRO?', confianza: 'baja' },
            tratamiento: { texto: '', confianza: 'ilegible' },
            pl: { texto: '18', confianza: 'alta' },
          }),
        },
      ]),
      1,
    );

    const resultado = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);
    const filaMatriz = resultado.hoja.filas[2];
    const idxToro = ENCABEZADOS_HOJA_OCR.indexOf('Toro');
    const idxTtto = ENCABEZADOS_HOJA_OCR.indexOf('Tratamiento');
    const idxPl = ENCABEZADOS_HOJA_OCR.indexOf('PL');

    expect(filaMatriz[idxToro]).toBe('');
    expect(filaMatriz[idxTtto]).toBe('');
    expect(filaMatriz[idxPl]).toBe('18');

    const confirmada = resultado.filasConfirmadas[0];
    expect(confirmada.celdasNoConfiables).toEqual(expect.arrayContaining(['toro', 'tratamiento']));
    // El texto dudoso NO se pierde: viaja en la respuesta para que el humano
    // lo vea en la ventana de corrección.
    expect(confirmada.celdas.toro).toEqual({ texto: 'NITRO?', confianza: 'baja' });
  });

  it('una fila con ancla que no cuadra se reporta no leída y NO desplaza a las demás', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({ pl: { texto: '18', confianza: 'alta' } }),
        },
        {
          // Row drift simulado: la chapeta de GALLEGA con el nombre de CAMILA.
          numero_impreso: '102',
          nombre_impreso: 'CAMILA',
          celdas: celdasJson({ pl: { texto: '9', confianza: 'alta' } }),
        },
        {
          numero_impreso: '103',
          nombre_impreso: 'CAMILA',
          celdas: celdasJson({ pl: { texto: '12', confianza: 'alta' } }),
        },
      ]),
      1,
    );

    const resultado = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);

    expect(resultado.filasConfirmadas.map((f) => f.numero)).toEqual([101, 103]);
    expect(resultado.filasNoLeidas).toHaveLength(1);
    expect(resultado.filasNoLeidas[0].motivo).toBe('nombre_no_corresponde');
    // El PL de la fila rechazada NO aparece en la matriz: nada se corrió de fila.
    const plsEnMatriz = resultado.hoja.filas.slice(2).map((f) => f[ENCABEZADOS_HOJA_OCR.indexOf('PL')]);
    expect(plsEnMatriz).toEqual(['18', '12']);
    // Y su contenido tampoco se pierde: viaja íntegro en `filasNoLeidas`.
    expect(resultado.filasNoLeidas[0].celdas.pl.texto).toBe('9');
    // Las filas confirmadas quedan numeradas de forma contigua tras el descarte.
    expect(resultado.filasConfirmadas.map((f) => f.filaExcel)).toEqual([3, 4]);
  });

  it('reporta las vacas del roster que no aparecieron en ninguna foto', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([{ numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasJson({}) }]),
      1,
    );
    const resultado = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);

    expect(resultado.vacasSinLeer.map((v) => v.numero).sort()).toEqual([102, 103]);
    expect(resultado.vacasSinLeer.every((v) => v.motivo === 'no_aparecio_en_ninguna_foto')).toBe(true);
  });

  it('reporta también a las vacas del roster que no tenían ancla imprimible', () => {
    const rosterConHuecos = construirRosterPlanilla([
      ...ROSTER_BASE,
      { id: 'uuid-sin-numero', numero: null, nombre: 'SIN CARAVANA' },
    ]);
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        { numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasJson({}) },
        { numero_impreso: '102', nombre_impreso: 'GALLEGA', celdas: celdasJson({}) },
        { numero_impreso: '103', nombre_impreso: 'CAMILA', celdas: celdasJson({}) },
      ]),
      1,
    );
    const resultado = procesarLecturaOcr([lectura], rosterConHuecos, OPCIONES_HOJA);
    expect(resultado.vacasSinLeer).toHaveLength(1);
    expect(resultado.vacasSinLeer[0].motivo).toBe('sin_ancla_en_el_roster');
  });

  it('dos fotos con la MISMA lectura de una vaca conservan una sola fila', () => {
    const mismaFila = {
      numero_impreso: '101',
      nombre_impreso: 'ALINA',
      celdas: celdasJson({ pl: { texto: '18', confianza: 'alta' } }),
    };
    const p1 = parsearRespuestaModeloOcr(respuestaModelo([mismaFila]), 1);
    const p2 = parsearRespuestaModeloOcr(respuestaModelo([mismaFila]), 2);
    const resultado = procesarLecturaOcr([p1, p2], roster, OPCIONES_HOJA);

    expect(resultado.filasConfirmadas).toHaveLength(1);
    expect(resultado.advertencias.join(' ')).toContain('MISMA lectura');
  });

  it('dos fotos que se contradicen sobre la misma vaca no adjudican ninguna', () => {
    const p1 = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({ pl: { texto: '18', confianza: 'alta' } }),
        },
      ]),
      1,
    );
    const p2 = parsearRespuestaModeloOcr(
      respuestaModelo([
        {
          numero_impreso: '101',
          nombre_impreso: 'ALINA',
          celdas: celdasJson({ pl: { texto: '20', confianza: 'alta' } }),
        },
      ]),
      2,
    );
    const resultado = procesarLecturaOcr([p1, p2], roster, OPCIONES_HOJA);

    expect(resultado.filasConfirmadas).toHaveLength(0);
    expect(resultado.filasNoLeidas.every((f) => f.motivo === 'lectura_repetida_divergente')).toBe(true);
    expect(resultado.filasNoLeidas).toHaveLength(2);
    expect(resultado.vacasSinLeer.map((v) => v.numero)).toContain(101);
  });

  it('avisa cuando las chapetas de una foto no vienen en el orden impreso', () => {
    const lectura = parsearRespuestaModeloOcr(
      respuestaModelo([
        { numero_impreso: '103', nombre_impreso: 'CAMILA', celdas: celdasJson({}) },
        { numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasJson({}) },
      ]),
      1,
    );
    const resultado = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);
    expect(resultado.advertencias.join(' ')).toContain('no vienen en orden ascendente');
    // Aviso, no corrección: el orden leído se respeta tal cual.
    expect(resultado.filasConfirmadas.map((f) => f.numero)).toEqual([103, 101]);
  });
});

// ---------------------------------------------------------------------------
// 5. La matriz cruda atraviesa el pipeline EXISTENTE sin un segundo parser
// ---------------------------------------------------------------------------

describe('la matriz OCR entra al pipeline de normalización existente', () => {
  const roster = construirRosterPlanilla(ROSTER_BASE);

  function normalizarDesdeFoto(filasJson: Array<Record<string, unknown>>) {
    const lectura = parsearRespuestaModeloOcr(respuestaModelo(filasJson), 1);
    const ocr = procesarLecturaOcr([lectura], roster, OPCIONES_HOJA);
    return { ocr, salida: normalizarHojas([ocr.hoja], '2026-08-12T10:00:00.000Z', CONFIG) };
  }

  it('normalizarHojas interpreta las celdas con los parsers de siempre', () => {
    const { ocr, salida } = normalizarDesdeFoto([
      {
        numero_impreso: '101',
        nombre_impreso: 'ALINA',
        celdas: celdasJson({
          pl: { texto: '18', confianza: 'alta' },
          num_partos: { texto: '3', confianza: 'alta' },
          fecha_servicio: { texto: '5/6/2026', confianza: 'alta' },
          toro: { texto: 'Ins NITRO', confianza: 'alta' },
          sexo_cria: { texto: 'A 206', confianza: 'alta' },
          estado: { texto: 'ok', confianza: 'alta' },
        }),
      },
    ]);

    expect(salida.chequeos).toHaveLength(1);
    const fila = salida.chequeos[0];
    expect(fila.numero).toBe(101);
    expect(fila.nombre).toBe('ALINA');
    expect(fila.pl).toBe(18);
    expect(fila.numPartos).toBe(3);
    // `parseFechasServicio`, `parseToro`, `parseSX` y `parseEstado` -- los
    // únicos intérpretes del repo -- hicieron su trabajo sin ayuda del OCR.
    expect(fila.fechasServicio).toEqual(['2026-06-05']);
    expect(fila.toroNombre).toBe('NITRO');
    expect(fila.tipoServicio).toBe('inseminacion');
    expect(fila.sx?.tipo).toBe('a_n');
    expect(fila.sx?.numeroCria).toBe(206);
    expect(fila.estado).toBe('vacia_apta');
    // La capa cruda conserva el texto verbatim de la foto.
    expect(fila.raw.sx).toBe('A 206');
    // El join confianza ↔ fila normalizada es por número de fila.
    expect(fila.fila).toBe(ocr.filasConfirmadas[0].filaExcel);
  });

  it('sin fecha fijada por un humano, chequeoFecha queda en null (nunca "hoy")', () => {
    const { salida } = normalizarDesdeFoto([
      { numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasJson({}) },
    ]);
    expect(salida.chequeos[0].chequeoFecha).toBeNull();
    expect(salida.chequeos[0].chequeoFechaConfianza).toBe('desconocida');
  });

  it('aplicarFechaChequeo estampa la fecha decidida por el humano sin mutar la entrada', () => {
    const { salida } = normalizarDesdeFoto([
      { numero_impreso: '101', nombre_impreso: 'ALINA', celdas: celdasJson({}) },
    ]);
    const conFecha = aplicarFechaChequeo(salida.chequeos, '2026-08-12');
    expect(conFecha[0].chequeoFecha).toBe('2026-08-12');
    expect(conFecha[0].chequeoFechaConfianza).toBe('exacta');
    expect(salida.chequeos[0].chequeoFecha).toBeNull();
  });

  it('el diff clasifica las filas leídas igual que la ruta .xlsx', () => {
    const { salida } = normalizarDesdeFoto([
      {
        numero_impreso: '101',
        nombre_impreso: 'ALINA',
        celdas: celdasJson({ pl: { texto: '18', confianza: 'alta' } }),
      },
      {
        numero_impreso: '102',
        nombre_impreso: 'GALLEGA',
        celdas: celdasJson({ pl: { texto: '9', confianza: 'alta' } }),
      },
    ]);

    const animales: AnimalHatoActual[] = [
      { id: 'uuid-101', numero: 101, nombre: 'ALINA', etapa: 'vaca', estado: 'activa' },
    ];
    const diff = construirDiffChequeo(aplicarFechaChequeo(salida.chequeos, '2026-08-12'), animales, []);

    const porNumero = new Map(diff.filas.map((f) => [f.numero, f]));
    // 101 sí tiene ficha y no tenía chequeo previo -> 'cambio', con el PL
    // leído en la foto como diferencia concreta a aprobar.
    expect(porNumero.get(101)?.clasificacion).toBe('cambio');
    expect(porNumero.get(101)?.animalId).toBe('uuid-101');
    expect(porNumero.get(101)?.diferencias.map((d) => d.campo)).toContain('PL');
    // 102 no tiene ficha en `hato_animales` -> 'nuevo': la ventana de
    // corrección tiene que crear la ficha, el commit nunca la inventa.
    expect(porNumero.get(102)?.clasificacion).toBe('nuevo');
    expect(porNumero.get(102)?.animalId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Fecha sugerida, prompt y esquema
// ---------------------------------------------------------------------------

describe('sugerirFechaChequeo', () => {
  it('deriva una sugerencia del título leído usando el parser de siempre', () => {
    const sugerida = sugerirFechaChequeo(['CHEQUEO 12 AGOSTO 2026']);
    expect(sugerida?.fechaIso).toBe('2026-08-12');
    expect(sugerida?.textoLeido).toBe('CHEQUEO 12 AGOSTO 2026');
  });

  it('devuelve null cuando no hay título interpretable -- no inventa una fecha', () => {
    expect(sugerirFechaChequeo([])).toBeNull();
    expect(sugerirFechaChequeo(['', '   '])).toBeNull();
    expect(sugerirFechaChequeo(['planilla'])).toBeNull();
  });
});

/** Vista mínima del JSON Schema, solo para navegarlo en los tests sin `any`. */
interface NodoEsquema {
  properties: Record<string, NodoEsquema>;
  items: NodoEsquema;
  required: string[];
  enum: string[];
}

describe('prompt y esquema del modelo', () => {
  it('el esquema exige texto + confianza en TODAS las columnas', () => {
    const esquema = esquemaJsonOcr() as unknown as NodoEsquema;
    const celdasSchema = esquema.properties.filas.items.properties.celdas;
    expect(celdasSchema.required).toEqual([...COLUMNAS_OCR]);
    for (const col of COLUMNAS_OCR) {
      expect(celdasSchema.properties[col].required).toEqual(['texto', 'confianza']);
      expect(celdasSchema.properties[col].properties.confianza.enum).toEqual(['alta', 'baja', 'ilegible']);
    }
    expect(esquema.properties.filas.items.required).toEqual(['numero_impreso', 'nombre_impreso', 'celdas']);
  });

  it('el prompt lleva el vocabulario cerrado y prohíbe adivinar', () => {
    const prompt = construirPromptOcr({ toros: ['NITRO', 'STEEM', 'FABACE'] });
    expect(prompt).toContain('NITRO, STEEM, FABACE');
    expect(prompt).toContain('día/mes/año');
    expect(prompt).toContain('OV');
    expect(prompt).toContain('rech');
    expect(prompt).toContain('NUNCA adivines');
    for (const encabezado of ENCABEZADOS_HOJA_OCR) {
      expect(prompt).toContain(encabezado);
    }
  });

  it('el prompt NO lleva la lista de vacas esperadas (el cotejo no puede ser circular)', () => {
    const prompt = construirPromptOcr({ toros: ['NITRO'] });
    for (const vaca of ROSTER_BASE) {
      expect(prompt).not.toContain(vaca.nombre!);
    }
  });
});
