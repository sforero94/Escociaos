/**
 * ESCO-61 parte C -- la vía CON respaldo (`captura_david`) también reconfirma
 * el CONTEO FÍSICO, como la 132 ya hizo con `/proponer`.
 *
 * EL HUECO QUE CIERRA. La 132 obliga a reteclear la cantidad física antes de
 * proponer un ajuste sin respaldo, y su cabecera daba por cubierta la otra
 * mitad porque «la vía CON respaldo YA exige que David teclee la cantidad
 * real a mano (CA-8)». Eso es cierto de un número DISTINTO: David teclea la
 * cantidad del MOVIMIENTO (el delta), no el conteo físico. Por ese camino
 * `rondas_excepciones.cantidad_fisica` conservaba el número del intérprete de
 * voz hasta el informe de cierre.
 *
 * EL CASO REAL, corregido a mano por la 145: «tres bultos de 15-15-15 de 50
 * kilos» quedó como `cantidad_fisica = 3` mientras David capturaba, bien, una
 * Entrada de 150,00 kilos. El informe de cierre imprimió las dos cifras, 3 y
 * 150, sobre el mismo hecho.
 *
 * Esta suite es ESTRUCTURAL, igual que `rondaInventarioRpcAutorizacion.test.ts`:
 * lee la migración 146 y las DOS copias de `excepcionDavid.ts`. Vitest mockea
 * Supabase y nunca abre una conexión a Postgres (CLAUDE.md "Testing"), así
 * que lo que defiende hacia adelante es que nadie borre la guarda ni el paso
 * de la conversación sin que algo se ponga rojo.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = resolve(__dirname, '../..');

const RUTA_146 = resolve(
  __dirname,
  '../sql/migrations/146_fn_ronda_resolver_con_captura_cantidad_confirmada.sql',
);

const COPIAS_CONVERSACION = [
  'src/supabase/functions/server/telegram/conversations/excepcionDavid.ts',
  'supabase/functions/make-server-1ccce916/telegram/conversations/excepcionDavid.ts',
] as const;

let SQL_146: string;

beforeAll(() => {
  SQL_146 = readFileSync(RUTA_146, 'utf-8');
});

/** Cuerpo plpgsql de la función reemplazada, sin la cabecera de comentarios
 * ni los bloques DO de guardas -- para que ninguna comprobación pase sólo
 * porque el texto aparece en un comentario que la explica. */
function cuerpoFuncion(): string {
  const inicio = SQL_146.indexOf('CREATE OR REPLACE FUNCTION fn_ronda_resolver_con_captura');
  expect(inicio).toBeGreaterThan(-1);
  const fin = SQL_146.indexOf('END $$;', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return SQL_146.slice(inicio, fin + 'END $$;'.length);
}

describe('migración 146 -- fn_ronda_resolver_con_captura exige el conteo físico', () => {
  it('lee cantidad_fisica_confirmada del payload, con el MISMO nombre de clave que la 132', () => {
    expect(cuerpoFuncion()).toContain(
      "v_cantidad_fisica_confirmada NUMERIC := (payload ->> 'cantidad_fisica_confirmada')::NUMERIC;",
    );
  });

  it('rechaza el payload si el campo falta -- nunca conserva el valor del intérprete en silencio', () => {
    const cuerpo = cuerpoFuncion();
    expect(cuerpo).toContain('IF v_cantidad_fisica_confirmada IS NULL THEN');
    expect(cuerpo).toContain('cantidad_fisica_confirmada es requerida');
  });

  it('rechaza un conteo negativo, pero 0 es un valor válido (nunca <=)', () => {
    const cuerpo = cuerpoFuncion();
    expect(cuerpo).toContain('IF v_cantidad_fisica_confirmada < 0 THEN');
    // «No queda nada» es una respuesta real, no un dato faltante -- mismo
    // criterio que la 132. Un `<= 0` convertiría el cero en un error.
    expect(cuerpo).not.toContain('v_cantidad_fisica_confirmada <= 0');
  });

  it('sobrescribe rondas_excepciones.cantidad_fisica con el valor confirmado', () => {
    expect(cuerpoFuncion()).toContain('cantidad_fisica = v_cantidad_fisica_confirmada,');
  });

  it('el conteo físico NUNCA se deriva de la cantidad del movimiento, ni al revés', () => {
    const cuerpo = cuerpoFuncion();
    // El movimiento sigue usando su propia variable en los saldos.
    expect(cuerpo).toContain('v_saldo_nuevo := v_saldo_anterior + v_cantidad;');
    expect(cuerpo).toContain('v_saldo_nuevo := v_saldo_anterior - v_cantidad;');
    // Y el conteo físico no entra en ningún saldo ni en el movimiento.
    expect(cuerpo).not.toContain('v_saldo_nuevo := v_saldo_anterior + v_cantidad_fisica_confirmada');
    expect(cuerpo).not.toContain('v_saldo_nuevo := v_saldo_anterior - v_cantidad_fisica_confirmada');
  });

  it('conserva lo heredado de 126/143: CA-38, CA-8, autorización y fn_ronda_actor_correo', () => {
    const cuerpo = cuerpoFuncion();
    expect(cuerpo).toContain("v_excepcion.estado <> 'explicada'");
    expect(cuerpo).toContain("PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');");
    expect(cuerpo).toContain("v_tipo NOT IN ('Entrada', 'Salida por Aplicación', 'Salida Otros')");
    expect(cuerpo).toContain('fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram)');
    // La 143 separó los dos contratos: el helper de PRESENTACIÓN no vuelve acá.
    expect(cuerpo).not.toContain('fn_ronda_actor_nombre(');
  });

  it('sigue SECURITY INVOKER con search_path pineado (nunca DEFINER)', () => {
    const cuerpo = cuerpoFuncion();
    expect(cuerpo).toContain('LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp');
    expect(cuerpo).not.toContain('SECURITY DEFINER');
  });

  it('nunca edita 126/130/132/143 ni toca datos: sin UPDATE/DELETE/ALTER/DROP de dominio', () => {
    const cuerpo = cuerpoFuncion();
    // Los dos únicos UPDATE son los que la función ya hacía, dentro de su
    // propia transacción -- no hay DML de migración fuera del cuerpo.
    const fueraDelCuerpo = SQL_146.replace(cuerpo, '');
    expect(fueraDelCuerpo).not.toMatch(/^\s*(UPDATE|DELETE|ALTER|DROP)\s/im);
  });

  it('fija el md5 del cuerpo vivo revisado antes de sobrescribir (lección de la 143)', () => {
    expect(SQL_146).toContain("md5(v_src) <> 'e2b4878c163624f971b194075e0bb774'");
  });

  it('aborta si la migración ya se aplicó', () => {
    expect(SQL_146).toContain("v_src ILIKE '%cantidad_fisica_confirmada%'");
  });
});

describe('excepcionDavid.ts -- la conversación pide el conteo físico antes de capturar', () => {
  for (const fichero of COPIAS_CONVERSACION) {
    describe(fichero, () => {
      let fuente: string;

      beforeAll(() => {
        fuente = readFileSync(resolve(RAIZ, fichero), 'utf-8');
      });

      it('manda cantidad_fisica_confirmada en el payload de fn_ronda_resolver_con_captura', () => {
        expect(fuente).toContain("sb.rpc('fn_ronda_resolver_con_captura'");
        expect(fuente).toContain('cantidad_fisica_confirmada: cantidadFisicaConfirmada,');
      });

      it('pregunta el conteo físico ANTES de llamar al RPC', () => {
        const posPregunta = fuente.indexOf('¿Cuánto hay FÍSICAMENTE de');
        const posRpc = fuente.indexOf("sb.rpc('fn_ronda_resolver_con_captura'");
        expect(posPregunta).toBeGreaterThan(-1);
        expect(posRpc).toBeGreaterThan(-1);
        expect(posPregunta).toBeLessThan(posRpc);
      });

      it('muestra lo que el intérprete entendió, CON la unidad de medida (parte A del mismo hallazgo)', () => {
        expect(fuente).toContain('El sistema había entendido ${fisicoInterpretado}');
        expect(fuente).toContain(
          "const fisicoInterpretado = `${formatearCantidad(excepcion.cantidad_fisica)}${unidadProducto ? ` ${unidadProducto}` : ''}`;",
        );
      });

      it('exige teclear el número: no hay botón de "confirmar lo que dice ahí"', () => {
        // Un botón de confirmación aceptaría el número del modelo con un
        // toque, que es exactamente lo que dejó pasar el «3» de los bultos.
        expect(fuente).not.toContain('expl_fisico_confirmar');
        expect(fuente).toContain('cantidadFisicaConfirmada = parsed;');
      });

      it('acepta 0 como conteo físico válido, y lo distingue de la cantidad del movimiento', () => {
        expect(fuente).toContain('function parseCantidadFisicaConfirmada');
        expect(fuente).toMatch(/parseCantidadFisicaConfirmada[\s\S]{0,260}num >= 0/);
        // El movimiento real sigue exigiendo > 0 -- son dos parsers distintos
        // a propósito.
        expect(fuente).toContain('function parseCantidadPositiva');
        expect(fuente).toMatch(/parseCantidadPositiva[\s\S]{0,260}num > 0/);
      });

      it('el resumen de confirmación separa el conteo físico de la cantidad del movimiento', () => {
        expect(fuente).toContain('- Conteo físico: ${formatearCantidad(cantidadFisicaConfirmada)}');
        expect(fuente).toContain('- Cantidad del movimiento: ${formatearCantidad(cantidad)}');
      });
    });
  }

  it('las dos copias del árbol de edge function son idénticas', () => {
    const [a, b] = COPIAS_CONVERSACION.map((f) => readFileSync(resolve(RAIZ, f), 'utf-8'));
    expect(a).toBe(b);
  });
});
