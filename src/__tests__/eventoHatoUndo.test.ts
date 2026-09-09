/**
 * Deshacer de /evento (issue #204, incidente 2026-09-08).
 *
 * El botón llevaba `hato_ev_undo:${eventoUuid}:${usoUuid}` (~86 bytes).
 * Telegram corta `callback_data` a 64 bytes: la escritura ya había
 * ocurrido y el usuario veía "Error registrando el evento".
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LIMITE_BYTES_CALLBACK_TELEGRAM,
  atribucionDesdeFilaTelegram,
  bytesCallbackData,
  callbackDeshacerEventoLegacy,
  construirCallbackDeshacerEvento,
  construirCallbackDeshacerTratamiento,
  elegirUsoIdParaDeshacer,
  parsearCallbackDeshacerEvento,
  parsearCallbackDeshacerTratamiento,
  usoIdDesdeDatosEvento,
} from '../supabase/functions/server/telegram/eventoHatoUndo';

const EVENTO_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USO_ID = '11111111-2222-3333-4444-555555555555';
const USO_OTRO = '99999999-8888-7777-6666-555555555555';

const COPIAS_HELPER = [
  'src/supabase/functions/server/telegram/eventoHatoUndo.ts',
  'supabase/functions/make-server-1ccce916/telegram/eventoHatoUndo.ts',
];

const COPIAS_CONVERSACION = [
  'src/supabase/functions/server/telegram/conversations/eventoHato.ts',
  'supabase/functions/make-server-1ccce916/telegram/conversations/eventoHato.ts',
];

const COPIAS_BOT = [
  'src/supabase/functions/server/telegram/bot.ts',
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
];

const RAIZ = resolve(__dirname, '../..');

function leer(ruta: string): string {
  return readFileSync(resolve(RAIZ, ruta), 'utf8');
}

describe('callback_data de Deshacer ≤ 64 bytes', () => {
  it('el formato viejo con usoId supera el límite de Telegram (la hipótesis del incidente)', () => {
    const viejo = callbackDeshacerEventoLegacy(EVENTO_ID, USO_ID);
    expect(bytesCallbackData(viejo)).toBeGreaterThan(LIMITE_BYTES_CALLBACK_TELEGRAM);
    expect(viejo.length).toBeGreaterThan(64);
  });

  it('el formato viejo sin usoId cabía (por eso monta/parto no fallaban)', () => {
    const viejoSinUso = callbackDeshacerEventoLegacy(EVENTO_ID, null);
    expect(bytesCallbackData(viejoSinUso)).toBeLessThanOrEqual(LIMITE_BYTES_CALLBACK_TELEGRAM);
  });

  it('el callback nuevo (solo evento) cabe, con o sin pajilla detrás', () => {
    const callback = construirCallbackDeshacerEvento(EVENTO_ID);
    expect(bytesCallbackData(callback)).toBeLessThanOrEqual(LIMITE_BYTES_CALLBACK_TELEGRAM);
    expect(callback).toBe(`hato_ev_undo:${EVENTO_ID}`);
    expect(callback).not.toContain(USO_ID);
  });

  it('rechaza un eventoId que no es UUID', () => {
    expect(() => construirCallbackDeshacerEvento('no-es-uuid')).toThrow(/inválido/);
  });
});

describe('parsearCallbackDeshacerEvento', () => {
  it('acepta el formato nuevo (solo evento)', () => {
    expect(parsearCallbackDeshacerEvento(`hato_ev_undo:${EVENTO_ID}`)).toEqual({
      eventoId: EVENTO_ID,
      usoId: null,
    });
  });

  it('acepta el formato viejo con uso y el de monta (`:-`)', () => {
    expect(parsearCallbackDeshacerEvento(`hato_ev_undo:${EVENTO_ID}:${USO_ID}`)).toEqual({
      eventoId: EVENTO_ID,
      usoId: USO_ID,
    });
    expect(parsearCallbackDeshacerEvento(`hato_ev_undo:${EVENTO_ID}:-`)).toEqual({
      eventoId: EVENTO_ID,
      usoId: null,
    });
  });

  it('rechaza basura', () => {
    expect(parsearCallbackDeshacerEvento('hato_ev_undo:foo')).toBeNull();
    expect(parsearCallbackDeshacerEvento('ronda_undo:' + EVENTO_ID)).toBeNull();
  });
});

describe('elegirUsoIdParaDeshacer', () => {
  const evento = {
    animal_id: 'vaca-1',
    fecha: '2026-08-11',
    created_at: '2026-09-08T14:00:00.000Z',
  };
  const usoCercano = {
    id: USO_ID,
    animal_id: 'vaca-1',
    fecha_uso: '2026-08-11',
    created_at: '2026-09-08T14:00:00.400Z',
  };
  const usoLejano = {
    id: USO_OTRO,
    animal_id: 'vaca-1',
    fecha_uso: '2026-08-11',
    created_at: '2026-09-08T14:02:10.000Z',
  };

  it('el id del callback viejo gana', () => {
    expect(
      elegirUsoIdParaDeshacer({
        usoIdCallback: USO_OTRO,
        datosEvento: { pajilla_uso_id: USO_ID },
        evento,
        usos: [usoCercano, usoLejano],
      }),
    ).toBe(USO_OTRO);
  });

  it('si el callback no trae uso, lee datos.pajilla_uso_id', () => {
    expect(usoIdDesdeDatosEvento({ origen: 'telegram', pajilla_uso_id: USO_ID })).toBe(USO_ID);
    expect(
      elegirUsoIdParaDeshacer({
        usoIdCallback: null,
        datosEvento: { pajilla_uso_id: USO_ID },
        evento,
        usos: [],
      }),
    ).toBe(USO_ID);
  });

  it('sin anotación, elige el uso de la misma vaca y fecha más cercano al evento', () => {
    expect(
      elegirUsoIdParaDeshacer({
        usoIdCallback: null,
        datosEvento: { origen: 'telegram' },
        evento,
        usos: [usoLejano, usoCercano],
      }),
    ).toBe(USO_ID);
  });

  it('no inventa un uso de otra vaca u otra fecha', () => {
    expect(
      elegirUsoIdParaDeshacer({
        usoIdCallback: null,
        datosEvento: null,
        evento,
        usos: [
          { ...usoCercano, animal_id: 'otra-vaca' },
          { ...usoCercano, id: USO_OTRO, fecha_uso: '2026-08-10' },
        ],
      }),
    ).toBeNull();
  });
});

describe('atribucionDesdeFilaTelegram', () => {
  it('copia usuario_id y nombre_display cuando la fila está vinculada', () => {
    expect(
      atribucionDesdeFilaTelegram({
        usuario_id: 'user-martha',
        nombre_display: 'Martha Vega',
      }),
    ).toEqual({ usuarioId: 'user-martha', nombreDisplay: 'Martha Vega' });
  });

  it('queda null si no hay fila (cuenta sin vincular)', () => {
    expect(atribucionDesdeFilaTelegram(null)).toEqual({
      usuarioId: null,
      nombreDisplay: null,
    });
  });
});

describe('las dos copias del árbol de edge functions están en sync', () => {
  it('eventoHatoUndo.ts es byte-idéntico', () => {
    expect(leer(COPIAS_HELPER[0])).toBe(leer(COPIAS_HELPER[1]));
  });

  it('eventoHato.ts es byte-idéntico', () => {
    expect(leer(COPIAS_CONVERSACION[0])).toBe(leer(COPIAS_CONVERSACION[1]));
  });

  it('el handler hato_ev_undo de bot.ts es byte-idéntico', () => {
    const cuerpos = COPIAS_BOT.map((ruta) => {
      const fuente = leer(ruta);
      const inicio = fuente.indexOf("bot.callbackQuery(/^hato_ev_undo:");
      expect(inicio).toBeGreaterThan(-1);
      const fin = fuente.indexOf("bot.callbackQuery(/^hato_alerta:", inicio);
      expect(fin).toBeGreaterThan(inicio);
      return fuente.slice(inicio, fin);
    });
    expect(cuerpos[0]).toBe(cuerpos[1]);
  });
});

// ===========================================================================
// Deshacer de un TRATAMIENTO (migración 138, 2026-09-09)
// ===========================================================================

describe('Deshacer de un tratamiento', () => {
  const TRATAMIENTO_ID = '0192837a-bcde-4f01-8234-56789abcdef0';

  it('el callback cabe en el límite de Telegram', () => {
    const callback = construirCallbackDeshacerTratamiento(TRATAMIENTO_ID);
    expect(bytesCallbackData(callback)).toBeLessThanOrEqual(LIMITE_BYTES_CALLBACK_TELEGRAM);
  });

  it('va y vuelve', () => {
    const callback = construirCallbackDeshacerTratamiento(TRATAMIENTO_ID.toUpperCase());
    expect(parsearCallbackDeshacerTratamiento(callback)).toEqual({
      tratamientoId: TRATAMIENTO_ID,
    });
  });

  it('rechaza un id que no es UUID', () => {
    expect(() => construirCallbackDeshacerTratamiento('12')).toThrow();
    expect(parsearCallbackDeshacerTratamiento('hato_tr_undo:12')).toBeNull();
    expect(parsearCallbackDeshacerTratamiento('basura')).toBeNull();
  });

  // Los dos botones se ven iguales y borran de tablas distintas. Si un
  // prefijo aceptara el callback del otro, tocar "Deshacer" en un evento
  // buscaría el id en `hato_tratamientos` (o al revés) y respondería "ya no
  // existe" -- una mentira distinta del caso real, y el usuario no sabría
  // si borró algo o no.
  it('los dos prefijos no se cruzan', () => {
    const deTratamiento = construirCallbackDeshacerTratamiento(TRATAMIENTO_ID);
    const deEvento = construirCallbackDeshacerEvento(EVENTO_ID);
    expect(parsearCallbackDeshacerEvento(deTratamiento)).toBeNull();
    expect(parsearCallbackDeshacerTratamiento(deEvento)).toBeNull();
  });
});

describe('contrato del tratamiento en el código', () => {
  for (const ruta of COPIAS_CONVERSACION) {
    it(`${ruta} escribe el tratamiento por el RPC, nunca con inserts sueltos`, () => {
      const fuente = leer(ruta);
      expect(fuente).toContain('fn_hato_registrar_tratamiento');
      // La cabecera y su paso son dos filas en dos tablas: un insert suelto
      // que falle deja el tratamiento guardado y el recordatorio inexistente.
      expect(fuente).not.toMatch(/from\("hato_tratamiento_pasos"\)/);
      expect(fuente).not.toMatch(/from\("hato_tratamientos"\)/);
    });

    it(`${ruta} no mete el tratamiento en hato_eventos`, () => {
      const fuente = leer(ruta);
      // Decisión del dueño: el tratamiento NO entra a la línea de tiempo, y
      // el CHECK de `hato_eventos.tipo` (053) no lo admite. Un `tipo` nuevo
      // sin decidir cómo lo clasifica `derivarEstadoReproductivo` tira al
      // animal a `indeterminado` (trampa documentada en S3/T4a).
      expect(fuente).toMatch(/tratamiento:\s*\{[^}]*tipo:\s*null/);
      // El insert de `hato_eventos` toma su tipo de `def.tipo`, así que con
      // `tipo: null` no hay forma de que el tratamiento llegue ahí -- pero
      // solo si el camino del RPC RETORNA antes de ese insert.
      const idxRpc = fuente.indexOf('fn_hato_registrar_tratamiento');
      const idxRetorno = fuente.indexOf('return { tratamientoId: idTratamiento', idxRpc);
      const idxInsertEventos = fuente.indexOf('animal_id: vaca!.animal_id,\n          tipo: def.tipo,');
      expect(idxRpc).toBeGreaterThan(-1);
      expect(idxRetorno).toBeGreaterThan(idxRpc);
      expect(idxInsertEventos).toBeGreaterThan(idxRetorno);
      // La verificación de duplicados de la 139 consulta `hato_eventos` por
      // `def.tipo`, que para el tratamiento es `null`: `tipo=eq.null` no es
      // `is.null` y no responde nada útil. Tiene que saltarse.
      expect(fuente).toContain('def.esTratamiento ? null : await conversation.external');
    });

    it(`${ruta} lee la próxima fecha hacia ADELANTE, no hacia atrás`, () => {
      const fuente = leer(ruta);
      // `leerFecha` retrocede un año cuando la lectura cae en el futuro,
      // porque un hecho registrado ya ocurrió. Un paso programado es lo
      // contrario: reusarla acá guardaría un "20/09" escrito en octubre en
      // el año en curso, con la alerta vencida el mismo día que se creó.
      expect(fuente).toContain('leerFechaFutura');
      const idxParse = fuente.indexOf('leerFechaFutura(texto, hoy, { requiereAnio: true })');
      const idxAsigna = fuente.indexOf('fechaProximoPaso = elegida');
      expect(idxParse).toBeGreaterThan(-1);
      expect(idxAsigna).toBeGreaterThan(idxParse);
      // Y la ambigüedad se pregunta igual que en el paso de fecha: que la
      // fecha sea futura no vuelve menos ambiguo un "5/9".
      expect(fuente).toContain('prox_amb_0');
    });

    it(`${ruta} exige año en las dos fechas del tratamiento (issue #213)`, () => {
      const fuente = leer(ruta);
      // Fecha del hecho: la bandera viaja con `def.esTratamiento`, no un
      // chequeo de string suelto. Monta/parto siguen aceptando DD/MM.
      expect(fuente).toContain(
        'leerFecha(texto, hoy, "pasado", {\n          requiereAnio: Boolean(def.esTratamiento),\n        })',
      );
      expect(fuente).toContain('leerFechaFutura(texto, hoy, { requiereAnio: true })');
      // El prompt de próxima dosis ya no muestra el ejemplo sin año.
      const idxProx = fuente.indexOf('¿Qué día?');
      expect(idxProx).toBeGreaterThan(-1);
      const promptProx = fuente.slice(idxProx, idxProx + 180);
      expect(promptProx).toContain('DD/MM/AAAA');
      expect(promptProx).not.toMatch(/ej: 20\/09\)/);
    });
  }

  for (const ruta of COPIAS_BOT) {
    it(`${ruta} solo deshace tratamientos propios y sin pasos ya ejecutados`, () => {
      const fuente = leer(ruta);
      const inicio = fuente.indexOf('bot.callbackQuery(/^hato_tr_undo:/');
      expect(inicio).toBeGreaterThan(-1);
      const handler = fuente.slice(inicio, inicio + 2600);
      // Un callback_data se puede reenviar: la autorización va en el handler,
      // nunca en el botón.
      expect(handler).toContain('tratamiento.fuente !== "telegram"');
      // El paso cuelga con ON DELETE CASCADE: borrar la cabecera se lleva un
      // paso que alguien ya marcó como hecho desde la alerta.
      expect(handler).toContain('fecha_ejecutada');
    });
  }
});

describe('contrato en el código (no volver al callback largo ni al catch mentiroso)', () => {
  for (const ruta of COPIAS_CONVERSACION) {
    it(`${ruta} no concatena usoId en el callback`, () => {
      const fuente = leer(ruta);
      expect(fuente).not.toMatch(/hato_ev_undo:\$\{[^}]+\}:\$\{/);
      expect(fuente).toContain('construirCallbackDeshacerEvento');
    });

    it(`${ruta} resuelve telegram_usuarios en el instante de escribir`, () => {
      const fuente = leer(ruta);
      expect(fuente).toContain('ctx.from?.id');
      expect(fuente).toContain('telegram_usuarios');
      expect(fuente).toContain('atribucionDesdeFilaTelegram');
      // La lectura al entrar al flujo es la que dejaba created_by en NULL
      // cuando el plugin replayaba sin ctx.telegramUser.
      expect(fuente).not.toMatch(/const usuarioId = ctx\.telegramUser/);
    });

    it(`${ruta} no trata un fallo del reply de éxito como fallo de escritura`, () => {
      const fuente = leer(ruta);
      expect(fuente).toContain('let escrito = false');
      // Copia actualizada el 2026-09-09: el flujo tambien registra
      // tratamientos, que NO son eventos del ciclo, asi que el mensaje pasó
      // de "El evento" a "El registro". La guarda sigue siendo el literal
      // exacto a proposito -- lo que protege es que ese mensaje exista y
      // salga DESPUES de `escrito = true`, nunca el catch de error.
      expect(fuente).toContain('El registro quedó guardado');
      const idxEscrito = fuente.indexOf('escrito = true');
      const idxReply = fuente.lastIndexOf('ctx.reply(textoExito');
      const idxCatch = fuente.lastIndexOf('Error registrando el evento');
      expect(idxEscrito).toBeGreaterThan(-1);
      expect(idxReply).toBeGreaterThan(idxEscrito);
      expect(idxCatch).toBeGreaterThan(idxReply);
    });
  }

  for (const ruta of COPIAS_BOT) {
    it(`${ruta} busca el uso por evento cuando el callback no lo trae`, () => {
      const fuente = leer(ruta);
      expect(fuente).toContain('elegirUsoIdParaDeshacer');
      expect(fuente).toContain('hato_pajillas_uso');
      expect(fuente).toContain('pajilla_uso_id');
    });
  }
});
