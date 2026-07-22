/**
 * Test de paridad frontend ⇄ edge function del motor del Hato Lechero (S2).
 *
 * `src/supabase/functions/server/calculos-hato.ts` es una copia mantenida a
 * mano de `src/utils/calculosHato.ts`: `chat.tsx` y el tick de alertas de S6
 * no pueden importar desde `src/utils/` sin cruzar la frontera del árbol de
 * despliegue de la edge function — la misma restricción que ya produjo
 * `priorizacion-scouting.ts` como copia de `priorizacionMonitoreo.ts`.
 *
 * Este test es más estricto que `priorizacionScoutingParidad.test.ts`, y puede
 * permitírselo: `calculosHato.ts` es un módulo PURO con CERO imports, así que
 * no hay ninguna razón legítima para que los cuerpos difieran ni siquiera en
 * una línea. Por eso verifica DOS cosas:
 *
 *   1. Paridad estructural — todo lo que va debajo del marcador "Tipos
 *      compartidos" es BYTE-IDÉNTICO en los tres archivos (el del frontend y
 *      las DOS copias del servidor, que CLAUDE.md exige mantener en sync).
 *   2. Paridad de comportamiento — ambas implementaciones reciben los mismos
 *      fixtures y deben devolver estructuras profundamente iguales.
 *
 * (1) sola no bastaría: detecta la deriva pero no prueba que el archivo
 * copiado siquiera compile o exporte lo mismo. (2) sola tampoco: los fixtures
 * nunca cubren el 100% de las ramas, y una divergencia en una rama no
 * ejercitada pasaría inadvertida hasta producción. Juntas cierran el hueco.
 *
 * Si este test falla: edita `src/utils/calculosHato.ts` y regenera las copias.
 * NUNCA edites las copias a mano para "arreglar" la falla.
 *
 * Los valores crudos de los fixtures son VERBATIM de las planillas reales
 * 2019-2026 (ver el doc de hallazgos de S2) — no son cadenas inventadas.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as frontend from '@/utils/calculosHato';
import * as edge from '../supabase/functions/server/calculos-hato';

// ============================================================================
// 1. Paridad estructural
// ============================================================================

const RAIZ = resolve(__dirname, '../..');
const MARCADOR = '// ============================================================================\n// Tipos compartidos';

const ARCHIVOS = {
  frontend: 'src/utils/calculosHato.ts',
  servidorFuente: 'src/supabase/functions/server/calculos-hato.ts',
  servidorDespliegue: 'supabase/functions/make-server-1ccce916/calculos-hato.ts',
} as const;

/** Devuelve el cuerpo del módulo — todo desde el marcador de "Tipos
 * compartidos" en adelante, descartando el encabezado, que SÍ debe diferir
 * (cada archivo explica su propio rol). */
function cuerpo(rutaRelativa: string): string {
  const texto = readFileSync(resolve(RAIZ, rutaRelativa), 'utf-8');
  const i = texto.indexOf(MARCADOR);
  if (i === -1) {
    throw new Error(
      `No se encontró el marcador "Tipos compartidos" en ${rutaRelativa}. ` +
        'Si moviste o renombraste esa sección, actualiza MARCADOR en este test.',
    );
  }
  return texto.slice(i);
}

describe('paridad estructural calculosHato ⇄ calculos-hato', () => {
  it('la copia del servidor es byte-idéntica al motor del frontend', () => {
    expect(cuerpo(ARCHIVOS.servidorFuente)).toBe(cuerpo(ARCHIVOS.frontend));
  });

  it('las dos copias del servidor están en sync (CLAUDE.md: ambos árboles)', () => {
    expect(cuerpo(ARCHIVOS.servidorDespliegue)).toBe(cuerpo(ARCHIVOS.servidorFuente));
  });

  it('el motor sigue siendo puro: cero imports en el cuerpo', () => {
    // Un import en la copia del servidor rompería el despliegue de Deno, y en
    // el frontend delataría que el motor dejó de ser puro.
    for (const ruta of Object.values(ARCHIVOS)) {
      const lineasImport = cuerpo(ruta)
        .split('\n')
        .filter((l) => /^\s*import\s/.test(l));
      expect(lineasImport, `${ruta} introdujo imports`).toEqual([]);
    }
  });

  it('ambas implementaciones exportan exactamente la misma API', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(edge)).toEqual(nombres(frontend));
  });
});

// ============================================================================
// 2. Paridad de comportamiento
// ============================================================================

/** Config equivalente a las 9 claves sembradas por la migración 058. */
const CONFIG: frontend.HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_rechequeo_due: 60,
};

const FECHA_REF = '2026-07-09'; // fecha real del chequeo de julio 2026

/** Celdas `F Servicio` verbatim de las planillas (doc S2 §4). */
const CELDAS_SERVICIO: unknown[] = [
  '20/04/2026/3/06/26',
  '15/05/2025//7/06/2025',
  '30/05/202520/07/2025',
  '18/04/2024/ 8 /05/24 21/06/240',
  '14/03/2024-18/04/24/1/6/24',
  '24/02/2024/2/7/2024',
  '23/04/2024/23/06/24',
  '8/05/2024/29/05/24',
  '14/05/240 11/07/2024',
  '24/02/2021/22/09/21',
  '20/06/2021/5/01/2022',
  '21/06/2021/5/1/2022 ?',
  ' 21/06/24',
  '7/09/230',
  '13/05/019',
  '22/08/20220',
  '15/015/2025',
  'PREÑADA 70%. CRIA 16%. RETRASO 14%',
  'no serv',
  'ok',
  'OK',
  'RECH',
  'vacia',
  'o+',
  'A169',
  '',
  null,
  undefined,
  42,
];

/** Celdas `SX` verbatim (doc S2 §5) — cubre las 11 familias de `TipoSX`. */
const CELDAS_SX: unknown[] = [
  'OV', 'ov', 'o v', 'AV', 'av', 'Av',
  'A210', 'A 209', 'a178', 'a 177', 'A148**151', 'A148**151?',
  'A+', 'a+', 'O+', 'o+',
  'abort', 'ABORT', 'aborto', 'ABORTO', 'AB', 'abort 27/09',
  'AV guir', 'avgir', 'a gir', 'A V GIR', 'AGIR', 'ov gir', 'OV GIR', 'oc gir',
  'gir', 'ov hlt', 'ov hol', 'OV HOL',
  '?', 'A?', 'A ?', 'AV ?', 'ao?',
  'Mv', 'gem+',
  'vacia', 'vendida', '0',
  'RICARENA', 'BRISA', 'VIKINGA', 'MAGNIFICA', ', verita',
  '', null, undefined,
];

/** Títulos r1 + nombre de hoja verbatim (doc S2 §3), incluidos los casos
 * donde el título y el nombre de la hoja se contradicen. */
const CASOS_FECHA_CHEQUEO: Array<[string, string]> = [
  ['CHEQUEO VETE 9 JULIO  2026', 'CHEQUEO JULIO 2026'],
  ['CHEQUEO SEPTIEMBRE 23 de 2025', 'CHEQUEO ASEPT 2025'],
  ['CHEQUEO:AGOSTO 11 DE 2021', 'Cheq jun 15-21'],
  ['CHEQUEO Marzo 31 de   2025', 'diciembre 20224 '],
  ['CHEQUEO VETE ENERO 1702024', 'ENERO 2024'],
  ['CHEQUEO:FEBRERO 9 DE 2021 20  DE 2020', 'Chequeo feb 2021'],
  ['CHEQUEO VETE MAYO   2024', 'CHEQUEO MAYO 20 2024'],
  ['CHEQUEO VETERINARIO septiembre 23    de  2019', 'CHEQUEO_SEP_2019'],
  ['CHE+A1:M34QUEO VETE AGOSTO1 2023', 'AGOSTI 1 2023'],
  ['PRODUCCION DE LECHE', 'PROM LECHE ABR 2025'],
  ['', 'OCT 10 2023'],
];

describe('paridad de comportamiento calculosHato ⇄ calculos-hato', () => {
  it('parseFechasServicio devuelve lo mismo en todas las celdas reales', () => {
    for (const celda of CELDAS_SERVICIO) {
      expect(edge.parseFechasServicio(celda), `celda ${JSON.stringify(celda)}`).toEqual(
        frontend.parseFechasServicio(celda),
      );
    }
  });

  it('parseSX devuelve lo mismo en las 11 familias', () => {
    for (const celda of CELDAS_SX) {
      expect(edge.parseSX(celda), `SX ${JSON.stringify(celda)}`).toEqual(
        frontend.parseSX(celda),
      );
    }
  });

  it('parseFechaChequeo devuelve lo mismo, incluidos título ⇄ hoja en conflicto', () => {
    for (const [titulo, hoja] of CASOS_FECHA_CHEQUEO) {
      expect(edge.parseFechaChequeo(titulo, hoja), `hoja ${hoja}`).toEqual(
        frontend.parseFechaChequeo(titulo, hoja),
      );
    }
  });

  it('parseValorNumerico devuelve lo mismo (incluye #VALUE! en cascada)', () => {
    for (const celda of ['#VALUE!', '16', '11.5', '0', 'ok', '', null, undefined, 18]) {
      expect(edge.parseValorNumerico(celda), `valor ${JSON.stringify(celda)}`).toEqual(
        frontend.parseValorNumerico(celda),
      );
    }
  });

  it('el motor de fechas coincide en las 4 razas y en fin de mes', () => {
    // Día 29-31 es donde el clamping tipo EDATE importa: derivar SECAR en un
    // solo paso desde F Servicio (no encadenando sobre PP) evita el doble
    // clamping. QA lo verificó sobre 1.156 filas reales.
    const servicios = ['2026-04-23', '2020-05-30', '2020-05-31', '2024-01-31', '2023-02-28'];
    const razas = ['jersey', 'holstein', 'normanda', 'gyr', null];
    for (const fecha of servicios) {
      expect(edge.calcularPartoProbable(fecha, CONFIG)).toBe(
        frontend.calcularPartoProbable(fecha, CONFIG),
      );
      for (const raza of razas) {
        expect(
          edge.calcularFechaSecar(fecha, raza, CONFIG),
          `secar ${fecha}/${raza}`,
        ).toBe(frontend.calcularFechaSecar(fecha, raza, CONFIG));
      }
      expect(edge.calcularMesesPrenez(fecha, FECHA_REF)).toBe(
        frontend.calcularMesesPrenez(fecha, FECHA_REF),
      );
    }
  });

  it('descomponerSX coincide, incluida la cadena de servicios de V7', () => {
    const casos: frontend.InputDescomposicionSX[] = [
      {
        chequeoFecha: FECHA_REF,
        sx: frontend.parseSX('A210'),
        fechasServicio: frontend.parseFechasServicio('2026-04-23').fechas,
        toroNombre: 'ins laredo',
        tipoServicio: 'inseminacion',
      },
      {
        // V7: servicio que no cuajó -> re-servicio, ambos en la misma celda.
        chequeoFecha: FECHA_REF,
        sx: frontend.parseSX('OV'),
        fechasServicio: frontend.parseFechasServicio('20/04/2026/3/06/26').fechas,
        toroNombre: 'ins marquez',
        tipoServicio: 'inseminacion',
      },
      {
        chequeoFecha: '2024-08-09',
        sx: frontend.parseSX('AV guir'),
        fechasServicio: frontend.parseFechasServicio('18/04/2024/ 8 /05/24 21/06/240').fechas,
      },
      // `O+` es ambiguo por diseño (parto con cría muerta vs aborto sin parto):
      // las tres ramas deben coincidir en ambas implementaciones.
      { chequeoFecha: FECHA_REF, sx: frontend.parseSX('o+'), fechasServicio: [] },
      {
        chequeoFecha: FECHA_REF,
        sx: frontend.parseSX('O+'),
        fechasServicio: [],
        huboPartoConfirmado: true,
      },
      {
        chequeoFecha: FECHA_REF,
        sx: frontend.parseSX('O+'),
        fechasServicio: [],
        huboPartoConfirmado: false,
      },
      { chequeoFecha: FECHA_REF, sx: frontend.parseSX('Mv'), fechasServicio: [] },
      { chequeoFecha: FECHA_REF, sx: frontend.parseSX('gem+'), fechasServicio: [] },
      { chequeoFecha: FECHA_REF, sx: frontend.parseSX(''), fechasServicio: [] },
    ];
    for (const caso of casos) {
      expect(
        edge.descomponerSX(caso as edge.InputDescomposicionSX),
        `SX ${caso.sx.crudo}`,
      ).toEqual(frontend.descomponerSX(caso));
    }
  });

  it('derivarEstadoReproductivo coincide en todos los estados', () => {
    const base: frontend.EstadoActualHatoRow = {
      etapa: 'vaca',
      raza: 'jersey',
      estado: 'activa',
      num_partos: 3,
      ultimo_chequeo_fecha: '2026-07-09',
      ultimo_servicio_fecha: null,
      ultimo_parto_fecha: null,
      ultimo_secado_real_fecha: null,
      ultima_confirmacion_prenez_fecha: null,
      ultimo_evento_fecha: null,
    };
    const filas: frontend.EstadoActualHatoRow[] = [
      base,
      { ...base, ultimo_servicio_fecha: '2026-06-25', ultimo_evento_fecha: '2026-06-25' },
      { ...base, ultimo_servicio_fecha: '2026-04-23', ultima_confirmacion_prenez_fecha: '2026-05-30', ultimo_evento_fecha: '2026-05-30' },
      { ...base, ultimo_servicio_fecha: '2025-10-07', ultima_confirmacion_prenez_fecha: '2025-11-20', ultimo_evento_fecha: '2025-11-20' },
      { ...base, ultimo_servicio_fecha: '2025-09-29', ultimo_secado_real_fecha: '2026-06-01', ultimo_evento_fecha: '2026-06-01' },
      { ...base, ultimo_parto_fecha: '2026-06-15', ultimo_evento_fecha: '2026-06-15' },
      // Parto sin servicio previo en el historial (bug real que QA expuso).
      { ...base, ultimo_servicio_fecha: null, ultimo_parto_fecha: '2026-06-15', ultimo_evento_fecha: '2026-06-15' },
      // Evento posterior sin tipificar (aborto/venta) -> 'indeterminado'.
      { ...base, ultimo_servicio_fecha: '2026-01-10', ultimo_evento_fecha: '2026-06-30' },
      // Servicio viejo sin confirmación -> alerta.
      { ...base, ultimo_servicio_fecha: '2026-01-10', ultimo_evento_fecha: '2026-01-10' },
      // Chequeo viejo -> rechequeo_due.
      { ...base, ultimo_chequeo_fecha: '2026-01-01', ultimo_evento_fecha: null },
      { ...base, num_partos: 11 },
      { ...base, etapa: 'ternera', num_partos: 0 },
      { ...base, etapa: 'novilla', num_partos: 0 },
      { ...base, raza: 'normanda', ultimo_servicio_fecha: '2025-11-03', ultima_confirmacion_prenez_fecha: '2025-12-15', ultimo_evento_fecha: '2025-12-15' },
      { ...base, raza: null, ultimo_servicio_fecha: '2025-11-03', ultimo_evento_fecha: '2025-11-03' },
      { ...base, estado: 'vendida' },
      { ...base, estado: 'muerta' },
      { ...base, estado: 'descartada' },
    ];
    for (const [i, fila] of filas.entries()) {
      expect(
        edge.derivarEstadoReproductivo(fila as edge.EstadoActualHatoRow, CONFIG, FECHA_REF),
        `fila ${i}`,
      ).toEqual(frontend.derivarEstadoReproductivo(fila, CONFIG, FECHA_REF));
    }
  });

  it('calcularProductividad coincide (sin vacas -> null, nunca 0 ni NaN)', () => {
    const casos: Array<[number, number]> = [
      [12702, 45], [12541, 44], [0, 45], [12702, 0], [9812, 43],
    ];
    for (const [litros, vacas] of casos) {
      expect(edge.calcularProductividad(litros, vacas), `${litros}/${vacas}`).toBe(
        frontend.calcularProductividad(litros, vacas),
      );
    }
  });

  it('detectarColisionesChapeta coincide en las colisiones reales de julio 2026', () => {
    // #162 ESMERALDA/VITROLA y #175 MONA/MARGARITA siguen duplicados en el
    // chequeo más reciente — el que la Épica F1 usará como "hato actual".
    const animales: frontend.AnimalEnChequeo[] = [
      { numero: 162, nombre: 'ESMERALDA' },
      { numero: 162, nombre: 'VITROLA' },
      { numero: 175, nombre: 'MONA' },
      { numero: 175, nombre: 'MARGARITA' },
      { numero: 157, nombre: 'ALINA ' },
      { numero: 157, nombre: 'ALINA' },
      { numero: 140, nombre: 'AMAPOLA' },
      { numero: 108, nombre: '' },
    ];
    expect(edge.detectarColisionesChapeta(animales)).toEqual(
      frontend.detectarColisionesChapeta(animales),
    );
  });
});
