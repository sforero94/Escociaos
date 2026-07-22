/**
 * Test de paridad frontend ⇄ edge function del pipeline de importación del
 * Hato Lechero (S3, endpoint B0/V10 `POST .../hato/chequeo/preview`).
 *
 * `src/supabase/functions/server/importHato/` y
 * `supabase/functions/make-server-1ccce916/importHato/` son copias
 * GENERADAS (nunca a mano) de `src/utils/importHato/` por
 * `docs/hato/regenerar-copias-importhato.py` -- necesarias porque el
 * endpoint corre en el árbol de despliegue de la edge function y no puede
 * importar desde `src/utils/` (misma restricción que ya produjo
 * `calculos-hato.ts`/`priorizacion-scouting.ts`).
 *
 * A diferencia de `calculosHatoParidad.test.ts` (motor sin imports, copia
 * byte-idéntica), estos módulos SÍ importan entre sí, así que la paridad
 * estructural no puede ser "byte a byte" -- es "el generador, corrido AHORA
 * MISMO, produce exactamente lo que hay en el árbol". Eso es lo que valida
 * la primera sección corriendo el script en modo `--check`. La segunda
 * sección prueba, además, que las dos implementaciones (frontend y la copia
 * del servidor) se comportan IGUAL sobre los mismos datos -- (1) sola no
 * demuestra que la copia siquiera compile/exporte lo mismo.
 *
 * Si este test falla: editá el original en `src/utils/importHato/` y corré
 * `python3 docs/hato/regenerar-copias-importhato.py`. NUNCA edites una copia
 * a mano para "arreglar" la falla.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import * as normalizarFrontend from '@/utils/importHato/normalizar';
import * as normalizarEdge from '../supabase/functions/server/importHato/normalizar';
import * as diffFrontend from '@/utils/importHato/diffChequeo';
import * as diffEdge from '../supabase/functions/server/importHato/diffChequeo';
import type { HojaCruda } from '@/utils/importHato/tipos';
import type { HatoConfig } from '@/utils/calculosHato';

const RAIZ = resolve(__dirname, '../..');

// ============================================================================
// 1. Paridad estructural: el generador, corrido ahora, no produce ningún diff.
// ============================================================================

describe('paridad estructural importHato ⇄ importHato (server)', () => {
  it('las copias Deno están al día con docs/hato/regenerar-copias-importhato.py --check', () => {
    // Lanza si el script sale con código != 0 (stdio 'pipe' para no ensuciar
    // la salida de la suite; si falla, el mensaje del script queda en el
    // stderr adjunto al error de Vitest).
    execFileSync('python3', ['docs/hato/regenerar-copias-importhato.py', '--check'], {
      cwd: RAIZ,
      stdio: 'pipe',
    });
  });

  it('ambas implementaciones exportan exactamente la misma API (normalizar.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(normalizarEdge)).toEqual(nombres(normalizarFrontend));
  });

  it('ambas implementaciones exportan exactamente la misma API (diffChequeo.ts)', () => {
    const nombres = (m: object) => Object.keys(m).sort();
    expect(nombres(diffEdge)).toEqual(nombres(diffFrontend));
  });
});

// ============================================================================
// 2. Paridad de comportamiento.
// ============================================================================

/** Config equivalente a las 10 claves sembradas por las migraciones 058 + 062. */
const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
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

const GENERADO_EN = '2026-08-10T12:00:00.000Z';

/** Hoja sintética Gen3 con los casos que ejercitan grilla + celda a la vez:
 * encabezado con 2 filas de preámbulo, una colisión de chapeta vigente
 * (162/175, evidencia real de julio 2026), fechas de servicio múltiples
 * (V7), y una fila fantasma. */
const HOJA_CHEQUEO: HojaCruda = {
  archivo: 'PARIDAD.xlsx',
  hoja: 'CHEQUEO JULIO 2026',
  filas: [
    ['CHEQUEO VETE 9 JULIO  2026'],
    ['#', 'NOMBRE', 'PL', '#P2', 'UC', 'SX', 'F SERVICIO', 'TORO', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO'],
    [162, 'ESMERALDA', 16, 2, null, 'A210', '23/04/2026', 'ins laredo', null, 'ok', null, null, null],
    [175, 'MONA', null, 1, null, 'OV', '20/04/2026/3/06/26', 'toro wagner', null, 'rech', null, null, null],
    [175, 'MARGARITA', null, null, null, null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null],
  ],
};

const HOJA_TERNERAS: HojaCruda = {
  archivo: 'PARIDAD.xlsx',
  hoja: 'TERNERAS',
  filas: [
    ['TERNERAS'],
    ['#', 'NOMBRE', 'F NACIMIENTO', 'PADRE', 'MADRE'],
    [190, 'FABIOLA JR', '10/02/2026', 'fabace', 'CAMPESINA'],
    [187, null, '01/05/2024', 'yaguen', 'MONTAÑA'],
  ],
};

const HOJAS: HojaCruda[] = [HOJA_CHEQUEO, HOJA_TERNERAS];

describe('paridad de comportamiento normalizarHojas', () => {
  it('produce la misma SalidaNormalizado en ambas implementaciones', () => {
    const salidaFrontend = normalizarFrontend.normalizarHojas(HOJAS, GENERADO_EN, CONFIG);
    const salidaEdge = normalizarEdge.normalizarHojas(HOJAS, GENERADO_EN, CONFIG);
    expect(salidaEdge).toEqual(salidaFrontend);

    // Sanity check de que el fixture realmente ejercita lo que dice: si esto
    // deja de cumplirse el fixture cambió de forma silenciosa y el test de
    // paridad de arriba dejaría de probar nada interesante.
    expect(salidaFrontend.chequeos).toHaveLength(3);
    expect(salidaFrontend.terneras).toHaveLength(2);
  });
});

describe('paridad de comportamiento construirDiffChequeo', () => {
  it('produce el mismo diff en ambas implementaciones sobre las mismas filas + estado de BD', () => {
    const salida = normalizarFrontend.normalizarHojas(HOJAS, GENERADO_EN, CONFIG);

    const animales: diffFrontend.AnimalHatoActual[] = [
      { id: 'animal-esmeralda', numero: 162, nombre: 'ESMERALDA', etapa: 'vaca', estado: 'activa' },
    ];
    const ultimos: diffFrontend.UltimoChequeoVacaActual[] = [
      {
        animalId: 'animal-esmeralda',
        chequeoFecha: '2026-05-01',
        pl: 10,
        numPartos: 1,
        fechaServicio: null,
        toro: null,
        tipoServicio: null,
        fechaSecar: null,
        fechaProbableParto: null,
        estado: 'vacia_apta',
      },
    ];

    const diffFrontendResultado = diffFrontend.construirDiffChequeo(salida.chequeos, animales, ultimos);
    const diffEdgeResultado = diffEdge.construirDiffChequeo(salida.chequeos, animales, ultimos);
    expect(diffEdgeResultado).toEqual(diffFrontendResultado);

    // La colisión #175 (MARGARITA/MONA) debe aparecer en ambas.
    expect(diffFrontendResultado.colisionesEnHoja).toEqual([{ numero: 175, nombres: ['MARGARITA', 'MONA'] }]);
  });

  it('seleccionarUltimoChequeoPorAnimal coincide en ambas implementaciones', () => {
    const historico: diffFrontend.FilaChequeoVacaHistorico[] = [
      {
        animalId: 'a1',
        chequeoFecha: '2026-01-10',
        createdAt: '2026-01-10T10:00:00Z',
        pl: 10,
        numPartos: 1,
        fechaServicio: null,
        toro: null,
        tipoServicio: null,
        fechaSecar: null,
        fechaProbableParto: null,
        estado: null,
      },
      {
        animalId: 'a1',
        chequeoFecha: '2026-06-10',
        createdAt: '2026-06-10T10:00:00Z',
        pl: 18,
        numPartos: 2,
        fechaServicio: '2026-05-01',
        toro: 'inook',
        tipoServicio: 'inseminacion',
        fechaSecar: null,
        fechaProbableParto: null,
        estado: 'vacia_apta',
      },
    ];
    expect(diffEdge.seleccionarUltimoChequeoPorAnimal(historico)).toEqual(
      diffFrontend.seleccionarUltimoChequeoPorAnimal(historico),
    );
  });
});
