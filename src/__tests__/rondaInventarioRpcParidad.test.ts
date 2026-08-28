/**
 * Paridad TS ⇄ SQL de la re-derivación de `via_propuesta` -- Fase 2 (RPC) de
 * `docs/brief_tecnico_verificacion_inventario.md` §6.2/§5.5.
 *
 * `fn_ronda_confirmar_hallazgos` (migración `126_ronda_inventario_rpcs.sql`)
 * IGNORA cualquier vía que mande el cliente y vuelve a derivarla en SQL,
 * contra `inventario_causas_raiz`, con la MISMA regla que
 * `derivarVia()` de `src/utils/rondaInventario/interpretarNota.ts` (§5.5 del
 * brief técnico, precedente `reportesFinancierosParidad.test.ts`: dos
 * lenguajes implementando la misma regla, verificados con las mismas
 * entradas). Si alguien cambia una de las dos derivaciones sin la otra, este
 * archivo se pone rojo.
 *
 * `derivarViaSql()` de más abajo es un espejo en TypeScript, LITERAL, de los
 * pasos que ejecuta el `plpgsql` de `fn_ronda_confirmar_hallazgos` -- no es
 * una segunda implementación independiente, es una transcripción para poder
 * correr el mismo battery de casos sin abrir una conexión a Postgres desde
 * Vitest (que mockea Supabase, nunca corre contra una base real -- ver
 * CLAUDE.md "Testing"). El comportamiento real de la función SQL se verificó
 * aparte, contra un Postgres 17 real en Docker, durante la implementación de
 * esta migración (ver el reporte de la sesión) -- lo que este archivo
 * defiende hacia adelante es que nadie edite una de las dos copias de la
 * regla sin la otra.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CAUSAS_RAIZ, type CausaRaiz } from '@/utils/rondaInventario/causasRaiz';
import { derivarVia, type ConfianzaInterprete } from '@/utils/rondaInventario/interpretarNota';

const RUTA_MIGRACION = resolve(__dirname, '../sql/migrations/126_ronda_inventario_rpcs.sql');
const SQL_126 = readFileSync(RUTA_MIGRACION, 'utf-8');

function extraerCuerpoFuncion(nombre: string): string {
  const inicio = SQL_126.indexOf(`CREATE FUNCTION ${nombre}`);
  if (inicio === -1) {
    throw new Error(`No se encontró "CREATE FUNCTION ${nombre}" en 126_ronda_inventario_rpcs.sql -- ¿cambió el nombre o la forma de la función?`);
  }
  // El cuerpo plpgsql termina en el primer "END $$;" después del CREATE.
  const fin = SQL_126.indexOf('END $$;', inicio);
  if (fin === -1) {
    throw new Error(`No se encontró el cierre "END $$;" de ${nombre} -- revisar el parser.`);
  }
  return SQL_126.slice(inicio, fin + 'END $$;'.length);
}

/**
 * Espejo TS, literal, de la re-derivación de `via_propuesta` dentro de
 * `fn_ronda_confirmar_hallazgos` (126, sección "RE-DERIVACIÓN DE
 * via_propuesta EN SQL"):
 *
 *   v_via := NULL;
 *   IF v_causa_confianza = 'alta' AND v_causa_clave IS NOT NULL THEN
 *     SELECT via INTO v_via FROM inventario_causas_raiz
 *      WHERE clave = v_causa_clave AND activo;
 *   END IF;
 *   IF v_via IS NULL THEN
 *     v_via := 'aprobacion_gerencia';
 *   END IF;
 *
 * Nunca lee `via` del payload -- ni siquiera existe esa ranura (CA-34).
 */
function derivarViaSql(
  causaClave: string | null,
  causaConfianza: ConfianzaInterprete,
  catalogo: readonly CausaRaiz[],
): 'captura_david' | 'aprobacion_gerencia' | 'ninguna' {
  let via: string | null = null;
  if (causaConfianza === 'alta' && causaClave !== null) {
    const fila = catalogo.find((c) => c.clave === causaClave && c.activo);
    via = fila ? fila.via : null;
  }
  return (via ?? 'aprobacion_gerencia') as 'captura_david' | 'aprobacion_gerencia' | 'ninguna';
}

describe('paridad TS ⇄ SQL de via_propuesta (derivarVia ⇄ fn_ronda_confirmar_hallazgos)', () => {
  it('fn_ronda_confirmar_hallazgos re-deriva via_propuesta contra inventario_causas_raiz, nunca la lee del payload', () => {
    const cuerpo = extraerCuerpoFuncion('fn_ronda_confirmar_hallazgos');
    // Las cuatro señales de la re-derivación deben estar en el cuerpo real --
    // no basta con que el RPC "funcione", tiene que seguir siendo ESTA regla.
    expect(cuerpo).toContain("v_causa_confianza = 'alta' AND v_causa_clave IS NOT NULL");
    expect(cuerpo).toContain('FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo');
    expect(cuerpo).toContain("v_via := 'aprobacion_gerencia'");
    // CA-34: el modelo/cliente nunca puede mandar una vía que el RPC use tal
    // cual -- no debe existir una lectura de "via"/"via_propuesta" del payload.
    expect(cuerpo).not.toMatch(/payload\s*->>?\s*'via/i);
  });

  it.each([
    ['movimiento_no_capturado', 'alta', 'captura_david'],
    ['consumo_no_registrado', 'alta', 'captura_david'],
    ['error_captura_previa', 'alta', 'captura_david'],
    ['perdida_o_dano', 'alta', 'aprobacion_gerencia'],
    ['sustraccion', 'alta', 'aprobacion_gerencia'],
    ['error_de_conteo', 'alta', 'ninguna'],
    ['otro', 'alta', 'aprobacion_gerencia'], // R-18, no una decisión propia de "otro"
  ] as const)('causa=%s, confianza=%s -> via=%s, IGUAL en TS y en el espejo SQL', (clave, confianza, esperado) => {
    const hallazgo = { causaClave: clave, causaConfianza: confianza };
    expect(derivarVia(hallazgo)).toBe(esperado);
    expect(derivarViaSql(clave, confianza, CAUSAS_RAIZ)).toBe(esperado);
    expect(derivarVia(hallazgo)).toBe(derivarViaSql(clave, confianza, CAUSAS_RAIZ));
  });

  it.each([
    ['confianza baja degrada a aprobacion_gerencia aunque la clave sea válida', 'perdida_o_dano', 'baja'],
    ['confianza ninguna degrada a aprobacion_gerencia', 'sustraccion', 'ninguna'],
    ['clave vacía (el modelo no la determinó) degrada a aprobacion_gerencia', '', 'alta'],
    ['clave que no existe en el catálogo degrada a aprobacion_gerencia (R-18, nunca se inventa)', 'perdida_total_inventada', 'alta'],
  ] as const)('R-18 -- %s', (_desc, clave, confianza) => {
    const claveOTNull = clave === '' ? '' : clave;
    const hallazgo = { causaClave: claveOTNull, causaConfianza: confianza };
    expect(derivarVia(hallazgo)).toBe('aprobacion_gerencia');
    // El espejo SQL trata la clave vacía como NULL (payload ->> 'causa_clave'
    // pasado por NULLIF(..., '') en la función real) -- se replica acá con la
    // misma normalización antes de comparar.
    const claveParaSql = claveOTNull === '' ? null : claveOTNull;
    expect(derivarViaSql(claveParaSql, confianza, CAUSAS_RAIZ)).toBe('aprobacion_gerencia');
  });

  it('el caso base del propio ejemplo de Santiago (§11.1 brief de producto): "Silicalmag" mal oído como "Silicio" no cambia la vía por sí solo -- la vía depende de la causa, no del producto', () => {
    // resolverProducto (D-T7) es quien decide "no_identificado" para
    // "Silicio" -- derivarVia ni se entera de qué producto es. Lo que este
    // caso fija es que, aun con una causa de confianza alta, un producto no
    // identificado nunca llega a confirmarse (CA-32, cubierto por
    // rondaInventarioRpcAutorizacion.test.ts), y la vía en sí sigue la MISMA
    // regla de la causa.
    const hallazgo = { causaClave: 'error_captura_previa', causaConfianza: 'alta' } as const;
    expect(derivarVia(hallazgo)).toBe('captura_david');
    expect(derivarViaSql('error_captura_previa', 'alta', CAUSAS_RAIZ)).toBe('captura_david');
  });
});
