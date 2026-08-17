/**
 * accionesMotor.test.ts — Fase 3 del motor de acciones recomendadas
 * (docs/brief_tecnico_motor_acciones.md §4.1, §7, §9, §10 Fase 3).
 *
 * Dos capas, molde `esco-evals.test.ts`:
 *
 *  1. Tier A — aserciones ESTRUCTURALES: lee `acciones-motor.ts` y
 *     `acciones-tick.ts` como texto y confirma que R-5 (§1.2 del brief) se
 *     sostiene ("acciones-motor.ts no importa el cliente de Supabase"),
 *     que la llamada a OpenRouter no lleva `tools`, que `strict: true` está
 *     presente, que el prompt de sistema trae los delimitadores de
 *     contexto externo de §9, y que `acciones-tick.ts` de verdad conecta
 *     el motor con el validador (§10 Fase 3: "conectar motor + validador
 *     dentro de acciones-tick.ts").
 *  2. Tier B — comportamiento con FIXTURES DE RESPUESTA DEL MODELO, nunca
 *     una llamada real: `fetch` global mockeado con `vi.stubGlobal`, mismo
 *     patrón que `generarReporteSemanal.test.ts`. Cubre la salida buena, la
 *     que trae una cifra libre, la que referencia un hecho inexistente, la
 *     que se pasa del cupo, y la respuesta malformada (dos variantes:
 *     sintaxis inválida y forma inválida) -- las cinco que pide el encargo
 *     de esta sesión. Las cuatro primeras se verifican EN COMBINACIÓN con
 *     `validarSalidaMotor` (ya probado en `accionesValidador.test.ts`),
 *     porque `acciones-motor.ts` deliberadamente NO revalida semántica --
 *     sólo forma mínima (ver el comentario de `interpretarRespuestaCruda`).
 *
 * Ninguna llamada de red: `fetch` está `stubGlobal`eado ANTES de importar
 * el módulo bajo prueba (no hace falta -- `acciones-motor.ts` llama a
 * `fetch` en tiempo de ejecución, no al importar -- pero se deja así para
 * que quede imposible de pasar por alto).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  construirPromptSistema,
  construirEsquemaSalidaMotor,
  construirMensajeUsuario,
  interpretarRespuestaCruda,
  invocarModeloAcciones,
  debeReintentar,
  sumarCostosUsd,
  MODELO_ACCIONES_DEFAULT,
  MARCADOR_INICIO_CONTEXTO,
  MARCADOR_FIN_CONTEXTO,
  MAX_TOKENS_SALIDA,
  TEMPERATURA_INICIAL,
  TEMPERATURA_REINTENTO,
  type LlamadaMotorResultado,
} from '../supabase/functions/server/acciones-motor';
import { validarSalidaMotor } from '../supabase/functions/server/acciones-validador';
import type { PaqueteAcciones } from '../supabase/functions/server/acciones-tipos';
import { hecho, paqueteConHechos, valor } from './fixtures/acciones.fixture';

// ============================================================================
// Tier A — aserciones estructurales (molde esco-evals.test.ts)
// ============================================================================

const motorSourcePath = resolve(__dirname, '../supabase/functions/server/acciones-motor.ts');
const motorSource = readFileSync(motorSourcePath, 'utf-8');
const motorMirrorPath = resolve(__dirname, '../../supabase/functions/make-server-1ccce916/acciones-motor.ts');

const tickSourcePath = resolve(__dirname, '../supabase/functions/server/acciones-tick.ts');
const tickSource = readFileSync(tickSourcePath, 'utf-8');
const tickMirrorPath = resolve(__dirname, '../../supabase/functions/make-server-1ccce916/acciones-tick.ts');

/** Quita comentarios de bloque y de línea antes de buscar patrones de
 *  CÓDIGO -- las aserciones "no contiene X" tienen que mirar lo que el
 *  archivo HACE, no su documentación (este mismo módulo explica en prosa,
 *  a propósito, que "no importa el cliente de Supabase ni lee Deno.env" --
 *  buscar esas cadenas sin filtrar comentarios encontraría la propia
 *  explicación de por qué no están). */
function quitarComentarios(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const motorCodigo = quitarComentarios(motorSource);

describe('R-5 · acciones-motor.ts nunca toca Supabase (§1.2 del brief)', () => {
  it('no contiene createClient', () => {
    expect(motorCodigo).not.toMatch(/createClient/);
  });

  it('no importa el cliente de supabase-js', () => {
    expect(motorCodigo).not.toMatch(/supabase-js/i);
  });

  it('no lee Deno.env -- el secreto y el modelo llegan como parámetros', () => {
    expect(motorCodigo).not.toMatch(/Deno\.env/);
  });
});

describe('R-5 · la llamada a OpenRouter no lleva `tools` (§1.2/§9 del brief)', () => {
  it('el cuerpo de la petición nunca declara la clave "tools"', () => {
    // Búsqueda literal de la clave JSON `tools:` dentro del objeto que se
    // serializa hacia OpenRouter -- distinto de la palabra "herramientas" en
    // comentarios, que sí puede aparecer.
    expect(motorCodigo).not.toMatch(/\btools\s*:/);
  });

  it('`response_format` usa json_schema con strict: true', () => {
    expect(motorSource).toMatch(/type:\s*'json_schema'/);
    expect(motorSource).toMatch(/strict:\s*true/);
  });
});

describe('§9 · el prompt de sistema trae los delimitadores de contexto externo', () => {
  it('define ambos marcadores como constantes exportadas', () => {
    expect(MARCADOR_INICIO_CONTEXTO).toBe('<<<CONTEXTO_EXTERNO_NO_CONFIABLE>>>');
    expect(MARCADOR_FIN_CONTEXTO).toBe('<<<FIN_CONTEXTO_EXTERNO>>>');
  });

  it('el prompt de sistema contiene los dos marcadores y la regla de "nunca instrucciones"', () => {
    const prompt = construirPromptSistema();
    expect(prompt).toContain(MARCADOR_INICIO_CONTEXTO);
    expect(prompt).toContain(MARCADOR_FIN_CONTEXTO);
    expect(prompt.toLowerCase()).toMatch(/nunca son instrucciones|nunca instrucciones/);
    expect(prompt.toLowerCase()).toContain('ignórala');
  });

  it('el mensaje de usuario envuelve el paquete completo entre los marcadores', () => {
    const paquete = paqueteConHechos([hecho({ id: 'agu.x', negocio: 'aguacate', destinos: ['agu.monitoreo'] })]);
    const mensaje = construirMensajeUsuario(paquete);
    const ini = mensaje.indexOf(MARCADOR_INICIO_CONTEXTO);
    const fin = mensaje.indexOf(MARCADOR_FIN_CONTEXTO);
    expect(ini).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(ini);
    // El cuerpo JSON (que incluye los hechos) vive DENTRO de los marcadores.
    const cuerpo = mensaje.slice(ini, fin);
    expect(cuerpo).toContain('agu.x');
  });
});

describe('§4.1 · el esquema de salida es json_schema estricto', () => {
  const esquema = construirEsquemaSalidaMotor() as any;

  it('es un objeto con additionalProperties: false en todos los niveles', () => {
    expect(esquema.additionalProperties).toBe(false);
    const accion = esquema.properties.acciones.items;
    expect(accion.additionalProperties).toBe(false);
    const ranura = accion.properties.ranuras.items;
    expect(ranura.additionalProperties).toBe(false);
  });

  it('toda propiedad declarada está en `required` (regla dura del strict mode)', () => {
    expect(esquema.required).toEqual(Object.keys(esquema.properties));
    const accion = esquema.properties.acciones.items;
    expect(accion.required.sort()).toEqual(Object.keys(accion.properties).sort());
    const ranura = accion.properties.ranuras.items;
    expect(ranura.required.sort()).toEqual(Object.keys(ranura.properties).sort());
  });

  it('`ranuras` es un ARREGLO, no un objeto de claves dinámicas (no representable en strict mode)', () => {
    const accion = esquema.properties.acciones.items;
    expect(accion.properties.ranuras.type).toBe('array');
  });

  it('`orden` NO aparece en el esquema -- lo calcula ordenarAcciones, nunca el modelo (revisión 2 del brief)', () => {
    const accion = esquema.properties.acciones.items;
    expect(Object.keys(accion.properties)).not.toContain('orden');
  });

  it('cupos declarados en el propio esquema: máximo 9 acciones, 1..3 hechos por acción', () => {
    expect(esquema.properties.acciones.maxItems).toBe(9);
    const accion = esquema.properties.acciones.items;
    expect(accion.properties.hecho_ids.minItems).toBe(1);
    expect(accion.properties.hecho_ids.maxItems).toBe(3);
  });

  it('el catálogo de 19 destino_id y los 3 negocios van como enum cerrado', () => {
    const accion = esquema.properties.acciones.items;
    expect(accion.properties.negocio.enum).toEqual(['hato_lechero', 'aguacate', 'ganado']);
    expect(accion.properties.destino_id.enum).toHaveLength(19);
    expect(accion.properties.destino_id.enum).toContain('inv.producto');
  });
});

describe('Conexión motor + validador dentro de acciones-tick.ts (§10 Fase 3, literal)', () => {
  it('importa invocarModeloAcciones de acciones-motor.ts', () => {
    expect(tickSource).toMatch(/invocarModeloAcciones/);
    expect(tickSource).toMatch(/from '\.\/acciones-motor\.ts'/);
  });

  it('importa validarSalidaMotor de acciones-validador.ts y lo llama', () => {
    expect(tickSource).toMatch(/import\s*\{[^}]*validarSalidaMotor/);
    expect(tickSource).toMatch(/validarSalidaMotor\(/);
  });

  it('importa ordenarAcciones y lo llama -- el orden nunca lo decide el modelo', () => {
    expect(tickSource).toContain('ordenarAcciones(');
  });

  it('respeta el tope de §7.4: nunca más de 2 llamadas por corrida (una constante de reintento, no un bucle)', () => {
    expect(tickSource).toContain('debeReintentar');
    // No debe existir un bucle (`for`/`while`) alrededor de la llamada al
    // modelo -- el brief es explícito: "nunca más de 2 llamadas por
    // corrida", así que la segunda llamada es un `if`, no una repetición.
    const region = tickSource.slice(tickSource.indexOf('invocarModeloAcciones'), tickSource.indexOf('ordenarAcciones('));
    expect(region).not.toMatch(/\bwhile\s*\(/);
  });

  it('lee OPENROUTER_API_KEY y responde con estado degradado si falta, sin lanzar (§7.5)', () => {
    expect(tickSource).toContain("Deno.env.get('OPENROUTER_API_KEY')");
    expect(tickSource).toContain('sin_api_key');
  });

  it('el bloque que llama al motor está envuelto en try/catch (defensa en profundidad)', () => {
    const inicio = tickSource.indexOf('invocarModeloAcciones(paquete');
    const antes = tickSource.slice(Math.max(0, inicio - 400), inicio);
    expect(antes).toContain('try {');
  });
});

describe('Espejo — acciones-motor.ts y acciones-tick.ts son byte-idénticos en el árbol Deno', () => {
  it('acciones-motor.ts', () => {
    expect(readFileSync(motorMirrorPath, 'utf-8')).toBe(motorSource);
  });

  it('acciones-tick.ts', () => {
    expect(readFileSync(tickMirrorPath, 'utf-8')).toBe(tickSource);
  });
});

// ============================================================================
// Tier B — comportamiento puro (schema/mensaje/conversión), sin red
// ============================================================================

describe('interpretarRespuestaCruda — forma mínima, nunca semántica', () => {
  it('convierte ranuras (arreglo wire) a Record<clave, RanuraRef>', () => {
    const salida = interpretarRespuestaCruda({
      acciones: [
        {
          negocio: 'aguacate',
          hecho_ids: ['agu.insumo_faltante'],
          destino_id: 'agu.aplicacion_detalle',
          plantilla: 'Confirmar {producto} para la aplicación.',
          ranuras: [{ clave: 'producto', hecho_id: 'agu.insumo_faltante', campo: 'producto' }],
        },
      ],
    });
    expect(salida.acciones).toHaveLength(1);
    expect(salida.acciones[0].ranuras).toEqual({
      producto: { hecho_id: 'agu.insumo_faltante', campo: 'producto' },
    });
  });

  it('acepta un arreglo de acciones vacío (el caso bueno de §7.5)', () => {
    expect(interpretarRespuestaCruda({ acciones: [] })).toEqual({ acciones: [] });
  });

  it('lanza si falta la clave "acciones"', () => {
    expect(() => interpretarRespuestaCruda({ foo: 'bar' })).toThrow();
  });

  it('lanza si "acciones" no es un arreglo', () => {
    expect(() => interpretarRespuestaCruda({ acciones: 'no-array' })).toThrow();
  });

  it('lanza si una acción no trae hecho_ids como arreglo', () => {
    expect(() =>
      interpretarRespuestaCruda({
        acciones: [{ negocio: 'aguacate', hecho_ids: 'x', destino_id: 'agu.monitoreo', plantilla: 'x', ranuras: [] }],
      }),
    ).toThrow();
  });

  it('lanza si una acción no trae ranuras como arreglo', () => {
    expect(() =>
      interpretarRespuestaCruda({
        acciones: [{ negocio: 'aguacate', hecho_ids: ['x'], destino_id: 'agu.monitoreo', plantilla: 'x', ranuras: {} }],
      }),
    ).toThrow();
  });

  it('última clave duplicada gana (la validación semántica de la ambigüedad es del validador, no de este módulo)', () => {
    const salida = interpretarRespuestaCruda({
      acciones: [
        {
          negocio: 'aguacate',
          hecho_ids: ['h1'],
          destino_id: 'agu.monitoreo',
          plantilla: '{n}',
          ranuras: [
            { clave: 'n', hecho_id: 'h1', campo: 'primero' },
            { clave: 'n', hecho_id: 'h1', campo: 'segundo' },
          ],
        },
      ],
    });
    expect(salida.acciones[0].ranuras.n.campo).toBe('segundo');
  });
});

describe('debeReintentar — política de §7.4, sin red', () => {
  function resultado(overrides: Partial<LlamadaMotorResultado>): LlamadaMotorResultado {
    return {
      ok: true,
      salidaCruda: {},
      salida: { acciones: [] },
      tokensPrompt: 0,
      tokensCompletion: 0,
      costoUsd: null,
      error: null,
      ...overrides,
    };
  }

  it('reintenta si la llamada no fue ok (condiciones a/b)', () => {
    expect(debeReintentar(resultado({ ok: false, salida: null }), 0)).toBe(true);
  });

  it('reintenta si el modelo propuso acciones pero el validador rechazó TODAS (condición c)', () => {
    const r = resultado({ salida: { acciones: [{ negocio: 'aguacate' } as any] } });
    expect(debeReintentar(r, 0)).toBe(true);
  });

  it('NO reintenta si el modelo propuso legítimamente cero acciones (§7.5: es el caso bueno)', () => {
    const r = resultado({ salida: { acciones: [] } });
    expect(debeReintentar(r, 0)).toBe(false);
  });

  it('NO reintenta si al menos una acción fue aceptada', () => {
    const r = resultado({ salida: { acciones: [{ negocio: 'aguacate' } as any] } });
    expect(debeReintentar(r, 1)).toBe(false);
  });
});

describe('sumarCostosUsd — §7.2, "el costo REAL reportado, nunca estimado"', () => {
  it('si ningún intento reportó costo, el resultado es null (no se inventa un $0)', () => {
    expect(sumarCostosUsd([null, null])).toBeNull();
  });

  it('si al menos uno reportó, los null cuentan como 0', () => {
    expect(sumarCostosUsd([0.0012, null])).toBeCloseTo(0.0012);
  });

  it('suma los costos de los dos intentos cuando ambos reportan', () => {
    expect(sumarCostosUsd([0.0012, 0.0009])).toBeCloseTo(0.0021);
  });
});

// ============================================================================
// Tier B — invocarModeloAcciones con fetch mockeado (fixtures de respuesta
// del modelo). CERO llamadas de red: `mockFetch` nunca pega a internet.
// ============================================================================

function respuestaOpenRouter(contenidoObjeto: unknown, usage: Record<string, number> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(contenidoObjeto) } }],
      usage: { prompt_tokens: 1500, completion_tokens: 120, cost: 0.0031, ...usage },
    }),
    text: async () => '',
  };
}

const PAQUETE_FIXTURE: PaqueteAcciones = paqueteConHechos([
  hecho({
    id: 'agu.insumo_faltante',
    negocio: 'aguacate',
    destinos: ['agu.aplicacion_detalle'],
    texto: 'La aplicación necesita 12.694 kg y en inventario hay 8.000',
    fecha_limite: '2026-08-18',
    verbos_permitidos: ['Confirmar', 'Verificar'],
    valores: {
      faltante: valor('4.694', 4694, 'kg'),
      producto: valor('Silicalmag'),
      dias: valor('1', 1, 'días'),
    },
  }),
  hecho({
    id: 'hato.vacias_largas',
    negocio: 'hato_lechero',
    destinos: ['hato.lista_vacias'],
    texto: '11 vacas sin preñez confirmada · la más rezagada, 142 días',
    dias_esperando: 142,
    tamano_conjunto: 11,
    valores: { n: valor('11', 11) },
  }),
]) as unknown as PaqueteAcciones;

describe('invocarModeloAcciones — fixtures de respuesta, sin red', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('la petición no lleva `tools`, pide strict:true y usage.include, y usa el modelo por defecto', async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaOpenRouter({
        acciones: [
          {
            negocio: 'aguacate',
            hecho_ids: ['agu.insumo_faltante'],
            destino_id: 'agu.aplicacion_detalle',
            plantilla: 'Confirmar {producto} antes de la aplicación de {dias} días.',
            ranuras: [
              { clave: 'producto', hecho_id: 'agu.insumo_faltante', campo: 'producto' },
              { clave: 'dias', hecho_id: 'agu.insumo_faltante', campo: 'dias' },
            ],
          },
        ],
      }),
    );

    await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'test-key' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(MODELO_ACCIONES_DEFAULT);
    expect(body.temperature).toBe(TEMPERATURA_INICIAL);
    expect(body.max_tokens).toBe(MAX_TOKENS_SALIDA);
    expect(body.tools).toBeUndefined();
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.usage).toEqual({ include: true });
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('la temperatura y el modelo son configurables (§7.1, §7.4)', async () => {
    mockFetch.mockResolvedValueOnce(respuestaOpenRouter({ acciones: [] }));
    await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k', modelo: 'otro/modelo', temperatura: TEMPERATURA_REINTENTO });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe('otro/modelo');
    expect(body.temperature).toBe(0);
  });

  // -- FIXTURE 1: la salida buena ------------------------------------------
  it('salida buena: ok=true, tokens/costo extraídos, y validarSalidaMotor la acepta', async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaOpenRouter(
        {
          acciones: [
            {
              negocio: 'aguacate',
              hecho_ids: ['agu.insumo_faltante'],
              destino_id: 'agu.aplicacion_detalle',
              plantilla: 'Confirmar {producto} antes de la aplicación de {dias} días.',
              ranuras: [
                { clave: 'producto', hecho_id: 'agu.insumo_faltante', campo: 'producto' },
                { clave: 'dias', hecho_id: 'agu.insumo_faltante', campo: 'dias' },
              ],
            },
          ],
        },
        { prompt_tokens: 4123, completion_tokens: 88, cost: 0.0036 },
      ),
    );

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);
    expect(resultado.error).toBeNull();
    expect(resultado.tokensPrompt).toBe(4123);
    expect(resultado.tokensCompletion).toBe(88);
    expect(resultado.costoUsd).toBeCloseTo(0.0036);
    expect(resultado.salida?.acciones).toHaveLength(1);

    const { aceptadas, rechazos } = validarSalidaMotor(resultado.salida!, PAQUETE_FIXTURE);
    expect(rechazos).toEqual([]);
    expect(aceptadas).toHaveLength(1);
    expect(aceptadas[0].clave).toBe('aguacate.insumo_faltante');
  });

  // -- FIXTURE 2: cifra libre ------------------------------------------------
  it('cifra libre en la plantilla: el motor la deja pasar (no revalida semántica), el validador la rechaza con CIFRA_LIBRE', async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaOpenRouter({
        acciones: [
          {
            negocio: 'hato_lechero',
            hecho_ids: ['hato.vacias_largas'],
            destino_id: 'hato.lista_vacias',
            plantilla: 'Revisar las 11 vacas vacías largas.',
            ranuras: [],
          },
        ],
      }),
    );

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);

    const { aceptadas, rechazos } = validarSalidaMotor(resultado.salida!, PAQUETE_FIXTURE);
    expect(aceptadas).toEqual([]);
    expect(rechazos.map((r) => r.codigo)).toContain('CIFRA_LIBRE');
  });

  // -- FIXTURE 3: referencia un hecho inexistente ----------------------------
  it('hecho inexistente: el motor lo deja pasar, el validador lo rechaza con HECHO_DESCONOCIDO', async () => {
    mockFetch.mockResolvedValueOnce(
      respuestaOpenRouter({
        acciones: [
          {
            negocio: 'aguacate',
            hecho_ids: ['agu.hecho_que_no_existe'],
            destino_id: 'agu.aplicacion_detalle',
            plantilla: 'Confirmar el insumo antes de la aplicación.',
            ranuras: [],
          },
        ],
      }),
    );

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);

    const { aceptadas, rechazos } = validarSalidaMotor(resultado.salida!, PAQUETE_FIXTURE);
    expect(aceptadas).toEqual([]);
    expect(rechazos.map((r) => r.codigo)).toContain('HECHO_DESCONOCIDO');
  });

  // -- FIXTURE 4: se pasa del cupo -------------------------------------------
  it('4 acciones para el mismo negocio (cupo es 3): el motor las deja pasar todas, el validador rechaza la excedente con EXCEDE_CUPO', async () => {
    const destinosAguacate = ['agu.monitoreo', 'agu.labores', 'agu.clima', 'agu.aplicacion_cierre'];
    mockFetch.mockResolvedValueOnce(
      respuestaOpenRouter({
        acciones: destinosAguacate.map((destino_id) => ({
          negocio: 'aguacate',
          hecho_ids: ['agu.insumo_faltante'],
          destino_id,
          plantilla: 'Confirmar el insumo antes de la aplicación.',
          ranuras: [],
        })),
      }),
    );

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);
    expect(resultado.salida?.acciones).toHaveLength(4);

    // El hecho fixture sólo declara `agu.aplicacion_detalle` entre sus
    // destinos, así que 3 de las 4 ya caen por DESTINO_NO_SOPORTADO_POR_HECHO
    // -- se arma un paquete local donde el hecho SÍ soporta los 4, para que
    // la única razón de rechazo posible sea el cupo.
    const paqueteConCuatroDestinos = paqueteConHechos([
      hecho({
        id: 'agu.insumo_faltante',
        negocio: 'aguacate',
        destinos: destinosAguacate as any,
        valores: { producto: valor('Silicalmag') },
      }),
    ]) as unknown as PaqueteAcciones;

    const { aceptadas, rechazos } = validarSalidaMotor(resultado.salida!, paqueteConCuatroDestinos);
    expect(aceptadas).toHaveLength(3);
    expect(rechazos.map((r) => r.codigo)).toContain('EXCEDE_CUPO');
  });

  // -- FIXTURE 5: respuesta malformada ---------------------------------------
  it('malformada (a): JSON sintácticamente inválido -> ok=false, error explícito', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{ "acciones": [ esto no es json ' } }],
        usage: {},
      }),
      text: async () => '',
    });

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.salida).toBeNull();
    expect(resultado.error).toMatch(/no parseó/);
  });

  it('malformada (b): JSON válido pero con forma inválida (falta "acciones") -> ok=false, salidaCruda preservado', async () => {
    mockFetch.mockResolvedValueOnce(respuestaOpenRouter({ resultado: 'no tiene la clave acciones' }));

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.salida).toBeNull();
    expect(resultado.error).toMatch(/forma de la salida no es válida/);
    // La salida cruda SÍ se preserva -- es lo que acciones-tick.ts persiste
    // en acciones_corridas.salida_cruda para el diagnóstico (§5.2 del brief).
    expect(resultado.salidaCruda).toEqual({ resultado: 'no tiene la clave acciones' });
  });

  it('malformada (c): el modelo envuelve el JSON en un bloque markdown -- se tolera igual (extraerJson)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '```json\n{"acciones": []}\n```' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      text: async () => '',
    });

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);
    expect(resultado.salida).toEqual({ acciones: [] });
  });

  it('HTTP no-ok (429): ok=false con el status en el mensaje', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
      text: async () => 'rate limited',
    });

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/429/);
    expect(resultado.tokensPrompt).toBe(0);
    expect(resultado.costoUsd).toBeNull();
  });

  it('respuesta vacía (content vacío): ok=false, no revienta', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '' } }], usage: {} }),
      text: async () => '',
    });

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/vacía/);
  });

  it('la llamada revienta por red (fetch rechaza): ok=false, mensaje del error original', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain('network down');
  });

  it('timeout (AbortError): ok=false, mensaje menciona el límite de tiempo', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);
    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/45s|no respondió/);
  });

  it('sin usage.cost en la respuesta: costoUsd es null, nunca una estimación inventada (§7.2)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ acciones: [] }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 10 }, // sin `cost`
      }),
      text: async () => '',
    });

    const resultado = await invocarModeloAcciones(PAQUETE_FIXTURE, { apiKey: 'k' });
    expect(resultado.ok).toBe(true);
    expect(resultado.costoUsd).toBeNull();
  });
});
