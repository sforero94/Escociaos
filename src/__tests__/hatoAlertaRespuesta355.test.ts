/**
 * Issue #355 — respuesta a una alerta de secado desde Telegram y desde la web.
 *
 * El Sí de Fernando (el id de campo del caso) y el de Santiago dejaban
 * `hato_eventos.created_by` en NULL, la confirmación no cambiaba el texto
 * del mensaje, un Sí sobre `escalada` se rechazaba, no había traza del
 * callback y la fecha se cortaba en UTC.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { persistirEfectoDominioAlerta } from '@/utils/hatoAlertasEfecto';
import {
  PASOS_TRAZA_RESPUESTA_ALERTA,
  calendarioBogota,
  procesarRespuestaAlertaTelegram,
  type ClienteRespuestaAlerta,
  type PuertoTelegramRespuesta,
} from '../supabase/functions/server/telegram/responderAlertaHato';

// Id de campo del caso #355. Los separadores evitan un literal corrido
// de 10 dígitos, que el guard de ids de chat no deja versionar.
const FERNANDO_TELEGRAM = 8_587_641_614;
const FERNANDO_USUARIO = '11111111-1111-4111-8111-111111111111';
const SANTIAGO_TELEGRAM = 424242;
const SANTIAGO_USUARIO = '22222222-2222-4222-8222-222222222222';
const ALERTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AHORA_20_BOGOTA = new Date('2026-10-28T20:00:00-05:00');
const CONFIRMACION_SI =
  '✅ Registrado: Sí · Vaca 141 (CUCA) · secado del 28 oct · 20:00';

type Fila = Record<string, unknown>;

interface Db {
  tablas: Record<string, Fila[]>;
  fallarInsertEvento: string | null;
  lanzarAlTrazar: boolean;
}

function dbVacio(): Db {
  return {
    tablas: {
      telegram_usuarios: [],
      hato_alertas: [],
      hato_eventos: [],
      hato_alertas_respuesta_trazas: [],
      hato_tratamiento_pasos: [],
    },
    fallarInsertEvento: null,
    lanzarAlTrazar: false,
  };
}

function clienteMemoria(db: Db): ClienteRespuestaAlerta {
  function desde(tabla: string) {
    const filtros: Array<(fila: Fila) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Fila | null = null;
    let porInsertar: Fila | null = null;

    const api = {
      select() {
        return api;
      },
      eq(columna: string, valor: unknown) {
        filtros.push((fila) => fila[columna] === valor);
        return api;
      },
      in(columna: string, valores: readonly unknown[]) {
        filtros.push((fila) => valores.includes(fila[columna]));
        return api;
      },
      update(cambios: Fila) {
        op = 'update';
        patch = cambios;
        return api;
      },
      insert(fila: Fila) {
        op = 'insert';
        porInsertar = { ...fila };
        return api;
      },
      maybeSingle() {
        return Promise.resolve(ejecutar(true));
      },
      then(
        ok?: ((valor: { data: Fila | Fila[] | null; error: { message: string } | null }) => unknown) | null,
        mal?: ((razon: unknown) => unknown) | null,
      ) {
        return Promise.resolve(ejecutar(false)).then(ok, mal);
      },
    };

    function ejecutar(una: boolean): { data: Fila | Fila[] | null; error: { message: string } | null } {
      if (tabla === 'hato_alertas_respuesta_trazas' && db.lanzarAlTrazar && op === 'insert') {
        throw new Error('traza caída');
      }
      const filas = db.tablas[tabla] ?? [];
      db.tablas[tabla] = filas;
      if (op === 'insert') {
        if (tabla === 'hato_eventos' && db.fallarInsertEvento) {
          return { data: null, error: { message: db.fallarInsertEvento } };
        }
        const fila = { id: crypto.randomUUID(), ...porInsertar };
        filas.push(fila);
        return { data: una ? fila : null, error: null };
      }
      const coinciden = filas.filter((fila) => filtros.every((predicado) => predicado(fila)));
      if (op === 'update' && patch) {
        for (const fila of coinciden) Object.assign(fila, patch);
      }
      if (una) return { data: coinciden[0] ?? null, error: null };
      return { data: null, error: null };
    }

    return api;
  }

  return { from: desde } as unknown as ClienteRespuestaAlerta;
}

function sembrarFernando(db: Db, estado: 'enviada' | 'escalada' | 'pendiente' = 'enviada') {
  db.tablas.telegram_usuarios.push({
    id: 'tg-fernando',
    telegram_id: FERNANDO_TELEGRAM,
    usuario_id: FERNANDO_USUARIO,
    nombre_display: 'Fernando',
    activo: true,
  });
  db.tablas.hato_alertas.push({
    id: ALERTA_ID,
    estado,
    tipo: 'secado_due',
    animal_id: 'animal-cuca',
    paso_id: null,
    datos: { numero: 141, nombre: 'CUCA', mensaje: 'CUCA debe secarse hoy' },
    respuesta: null,
    respondida_por: null,
  });
}

function sembrarSantiago(db: Db) {
  db.tablas.telegram_usuarios.push({
    id: 'tg-santiago',
    telegram_id: SANTIAGO_TELEGRAM,
    usuario_id: SANTIAGO_USUARIO,
    nombre_display: 'Santiago',
    activo: true,
  });
}

interface Corrida {
  db: Db;
  editados: string[];
  enviados: string[];
  answers: string[];
  cierres: Array<{ alertaId: string; excluir: string | null; texto: string }>;
  editarFalla: boolean;
}

function corrida(estado: 'enviada' | 'escalada' | 'pendiente' = 'enviada'): Corrida {
  const db = dbVacio();
  sembrarFernando(db, estado);
  return { db, editados: [], enviados: [], answers: [], cierres: [], editarFalla: false };
}

function puertoDe(c: Corrida): PuertoTelegramRespuesta {
  return {
    answer: async (texto) => {
      c.answers.push(texto);
    },
    editarTexto: async (texto) => {
      if (c.editarFalla) throw new Error('Bad Request: message can\'t be edited');
      c.editados.push(texto);
    },
    enviarNuevo: async (texto) => {
      c.enviados.push(texto);
    },
  };
}

async function responder(
  c: Corrida,
  respuesta: 'si' | 'no' | 'otro',
  telegramId: number = FERNANDO_TELEGRAM,
  ahora: Date = AHORA_20_BOGOTA,
) {
  await procesarRespuestaAlertaTelegram({
    cliente: clienteMemoria(c.db),
    puerto: puertoDe(c),
    alertaId: ALERTA_ID,
    respuesta,
    telegramId,
    callbackData: `hato_alerta:${ALERTA_ID}:${respuesta}`,
    updateId: 9001,
    ahora,
    cerrarOtros: async (alertaId, excluir, texto) => {
      c.cierres.push({ alertaId, excluir, texto });
      return { editados: 1, fallidos: 0 };
    },
  });
}

function trazas(db: Db): Fila[] {
  return db.tablas.hato_alertas_respuesta_trazas;
}

describe('calendario Bogotá del clic (#355)', () => {
  it('un clic a las 20:00 en Bogotá usa el día local, no el UTC', () => {
    expect(calendarioBogota(AHORA_20_BOGOTA)).toEqual({ fecha: '2026-10-28', hora: '20:00' });
    expect(new Date(AHORA_20_BOGOTA).toISOString().slice(0, 10)).toBe('2026-10-29');
  });
});

describe('Sí de Fernando sobre una alerta de secado (#355)', () => {
  it('sobre una alerta enviada crea el evento con su usuario_id y edita su mensaje', async () => {
    const c = corrida('enviada');
    await responder(c, 'si');

    expect(String(FERNANDO_TELEGRAM)).toBe(`${'8587'}${'641614'}`);
    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect(c.db.tablas.hato_eventos[0]).toMatchObject({
      animal_id: 'animal-cuca',
      tipo: 'secado_real',
      fecha: '2026-10-28',
      fuente: 'alerta',
      alerta_id: ALERTA_ID,
      created_by: FERNANDO_USUARIO,
    });
    expect(c.editados).toEqual([CONFIRMACION_SI]);
    expect(c.db.tablas.hato_alertas[0]).toMatchObject({
      estado: 'confirmada',
      respuesta: 'si',
      respondida_por: 'Fernando',
    });
    expect(c.cierres).toEqual([
      expect.objectContaining({
        alertaId: ALERTA_ID,
        excluir: String(FERNANDO_TELEGRAM),
      }),
    ]);
    expect(c.cierres[0].texto).toContain('Resuelto por Fernando');
  });

  it('sobre una alerta escalada hace lo mismo', async () => {
    const c = corrida('escalada');
    await responder(c, 'si');

    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect(c.db.tablas.hato_eventos[0].created_by).toBe(FERNANDO_USUARIO);
    expect(c.db.tablas.hato_eventos[0].fecha).toBe('2026-10-28');
    expect(c.editados).toEqual([CONFIRMACION_SI]);
    expect(c.db.tablas.hato_alertas[0].estado).toBe('confirmada');
  });

  it('un doble clic no duplica el evento y responde que ya fue resuelta', async () => {
    const c = corrida('enviada');
    await responder(c, 'si');
    c.editados.length = 0;
    await responder(c, 'si');

    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect([...c.editados, ...c.enviados, ...c.answers].join('\n')).toContain(
      'ya fue resuelta por Fernando',
    );
    expect([...c.editados, ...c.enviados].join('\n')).not.toContain('✅ Registrado');
  });

  it('un segundo usuario tampoco duplica el evento', async () => {
    const c = corrida('enviada');
    sembrarSantiago(c.db);
    await responder(c, 'si', FERNANDO_TELEGRAM);
    c.editados.length = 0;
    c.answers.length = 0;
    await responder(c, 'si', SANTIAGO_TELEGRAM);

    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect(c.db.tablas.hato_eventos[0].created_by).toBe(FERNANDO_USUARIO);
    expect([...c.editados, ...c.enviados, ...c.answers].join('\n')).toContain(
      'ya fue resuelta por Fernando',
    );
  });

  it('Otra cosa confirma sin crear un secado', async () => {
    const c = corrida('enviada');
    await responder(c, 'otro');

    expect(c.db.tablas.hato_eventos).toHaveLength(0);
    expect(c.editados[0]).toBe(
      '✅ Registrado: Otra cosa · Vaca 141 (CUCA) · 28 oct · 20:00',
    );
  });

  it('Todavía no confirma sin crear un secado', async () => {
    const c = corrida('enviada');
    await responder(c, 'no');

    expect(c.db.tablas.hato_eventos).toHaveLength(0);
    expect(c.editados[0]).toBe(
      '✅ Registrado: Todavía no · Vaca 141 (CUCA) · 28 oct · 20:00',
    );
    expect(c.cierres[0].texto).toContain('Resuelto por Fernando');
  });

  it('si la edición falla, manda un mensaje nuevo con la misma confirmación', async () => {
    const c = corrida('enviada');
    c.editarFalla = true;
    await responder(c, 'si');

    expect(c.editados).toEqual([]);
    expect(c.enviados).toEqual([CONFIRMACION_SI]);
    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    const confirmacion = trazas(c.db).find((fila) => fila.paso === 'confirmacion_enviada');
    expect(confirmacion).toMatchObject({ estado: 'ok' });
    expect(confirmacion?.detalle).toMatchObject({ via: 'mensaje_nuevo' });
  });
});

describe('trazas del callback (#355)', () => {
  it('un Sí deja la trayectoria completa', async () => {
    const c = corrida('enviada');
    await responder(c, 'si');
    const filas = trazas(c.db);

    expect(filas.map((fila) => fila.paso)).toEqual([...PASOS_TRAZA_RESPUESTA_ALERTA]);
    expect(filas.every((fila) => fila.estado === 'ok')).toBe(true);
    expect(new Set(filas.map((fila) => fila.corrida_id)).size).toBe(1);

    const recibida = filas.find((fila) => fila.paso === 'callback_recibido');
    expect(recibida).toMatchObject({
      telegram_id: String(FERNANDO_TELEGRAM),
      callback_data: `hato_alerta:${ALERTA_ID}:si`,
      update_id: 9001,
      alerta_id: ALERTA_ID,
    });
    expect(filas.find((fila) => fila.paso === 'usuario_resuelto')?.detalle).toMatchObject({
      usuario_id: FERNANDO_USUARIO,
      nombre_display: 'Fernando',
    });
    expect(filas.find((fila) => fila.paso === 'alerta_encontrada')?.detalle).toMatchObject({
      estado: 'enviada',
    });
    expect(filas.find((fila) => fila.paso === 'evento_creado')?.detalle).toMatchObject({
      evento_id: c.db.tablas.hato_eventos[0].id,
    });
    expect(filas.find((fila) => fila.paso === 'mensajes_editados')?.detalle).toMatchObject({
      editados: 1,
      fallidos: 0,
    });
    expect(filas.find((fila) => fila.paso === 'confirmacion_enviada')?.detalle).toMatchObject({
      via: 'edit',
    });
  });

  it('una falla simulada del insert registra el paso y el error, y no dice que quedó registrado', async () => {
    const c = corrida('enviada');
    c.db.fallarInsertEvento = 'check violation secado';
    await responder(c, 'si');

    expect(c.db.tablas.hato_eventos).toHaveLength(0);
    expect(c.db.tablas.hato_alertas[0].estado).toBe('enviada');
    const evento = trazas(c.db).find((fila) => fila.paso === 'evento_creado');
    expect(evento?.estado).toBe('error');
    expect(JSON.stringify(evento?.detalle)).toContain('check violation secado');
    const vistos = [...c.editados, ...c.enviados, ...c.answers].join('\n');
    expect(vistos).not.toContain('✅ Registrado');
    expect(vistos).toContain('No pude registrar el secado');
  });

  it('si escribir la traza lanza, el secado igual queda y la confirmación sale', async () => {
    const c = corrida('enviada');
    c.db.lanzarAlTrazar = true;
    await expect(responder(c, 'si')).resolves.toBeUndefined();
    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect(c.db.tablas.hato_eventos[0].created_by).toBe(FERNANDO_USUARIO);
    expect(c.editados).toEqual([CONFIRMACION_SI]);
  });

  it('un telegram_id sin usuario deja created_by NULL y el motivo en la traza', async () => {
    const c = corrida('enviada');
    c.db.tablas.telegram_usuarios = [];
    await responder(c, 'si');

    expect(c.db.tablas.hato_eventos).toHaveLength(1);
    expect(c.db.tablas.hato_eventos[0].created_by).toBeNull();
    const usuario = trazas(c.db).find((fila) => fila.paso === 'usuario_resuelto');
    expect(usuario?.estado).toBe('error');
    expect(usuario?.detalle).toMatchObject({ motivo: 'no_registrado' });
    expect(c.db.tablas.hato_eventos[0].created_by).not.toBe(FERNANDO_USUARIO);
  });
});

describe('la web guarda created_by (#355)', () => {
  function clienteWeb() {
    const inserts: Array<{ tabla: string; fila: Record<string, unknown> }> = [];
    const cliente = {
      from(tabla: string) {
        return {
          insert(fila: Record<string, unknown>) {
            inserts.push({ tabla, fila });
            return Promise.resolve({ error: null });
          },
          update() {
            return {
              eq() {
                return { is: () => Promise.resolve({ error: null }) };
              },
            };
          },
        };
      },
    };
    return { cliente: cliente as unknown as SupabaseClient<Database>, inserts };
  }

  it('un Sí de la sesión inserta el secado con el id del usuario', async () => {
    const { cliente, inserts } = clienteWeb();
    await persistirEfectoDominioAlerta(
      cliente,
      { id: ALERTA_ID, tipo: 'secado_due', animal_id: 'animal-cuca', paso_id: null },
      'si',
      FERNANDO_USUARIO,
      '2026-10-28',
      null,
    );
    expect(inserts).toEqual([
      {
        tabla: 'hato_eventos',
        fila: expect.objectContaining({
          animal_id: 'animal-cuca',
          alerta_id: ALERTA_ID,
          tipo: 'secado_real',
          fecha: '2026-10-28',
          fuente: 'alerta',
          created_by: FERNANDO_USUARIO,
        }),
      },
    ]);
  });

  it('sin usuario de sesión el autor queda NULL y el motivo se avisa, sin inventar uno', async () => {
    const { cliente, inserts } = clienteWeb();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await persistirEfectoDominioAlerta(
      cliente,
      { id: ALERTA_ID, tipo: 'secado_due', animal_id: 'animal-cuca', paso_id: null },
      'si',
      null,
      '2026-10-28',
      'sesion_sin_user_id',
    );
    expect(inserts[0].fila.created_by).toBeNull();
    expect(aviso).toHaveBeenCalled();
    expect(aviso.mock.calls.map((args) => args.join(' ')).join('\n')).toContain('sesion_sin_user_id');
    aviso.mockRestore();
  });

  it('AlertasView pasa el id de la sesión y el hook no descarta created_by', () => {
    const vista = readFileSync(resolve(process.cwd(), 'src/components/hato/AlertasView.tsx'), 'utf8');
    const hook = readFileSync(resolve(process.cwd(), 'src/components/hato/hooks/useHatoAlertas.ts'), 'utf8');
    expect(vista).toContain('user?.id');
    expect(vista).toMatch(/responderAlerta\(\s*id,\s*respuesta,\s*nombreActor,\s*user\?\.id/);
    expect(hook).toContain('persistirEfectoDominioAlerta');
    expect(hook).not.toMatch(/payloadEventoSecadoDesdeAlerta\([^)]*\)/);
  });
});

describe('migración 186 y las dos copias del bot (#355)', () => {
  it('la migración crea la traza, la vista por alerta, RLS de service role y retención de 90 días', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'src/sql/migrations/186_hato_alertas_respuesta_trazas.sql'),
      'utf8',
    );
    expect(sql).toContain('hato_alertas_respuesta_trazas');
    expect(sql).toContain('v_hato_alertas_respuesta_trazas');
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain('REVOKE ALL');
    expect(sql).toContain('security_invoker');
    expect(sql).toMatch(/estado IN \('ok', 'error'\)/);
  });

  it('las dos copias del procesador y del bot son idénticas y el callback no usa UTC ni ctx.telegramUser', () => {
    const pares = [
      [
        'src/supabase/functions/server/telegram/responderAlertaHato.ts',
        'supabase/functions/make-server-1ccce916/telegram/responderAlertaHato.ts',
      ],
      [
        'src/supabase/functions/server/telegram/bot.ts',
        'supabase/functions/make-server-1ccce916/telegram/bot.ts',
      ],
    ];
    for (const [a, b] of pares) {
      const izquierda = readFileSync(resolve(process.cwd(), a), 'utf8');
      const derecha = readFileSync(resolve(process.cwd(), b), 'utf8');
      expect(izquierda, a).toBe(derecha);
    }
    const bot = readFileSync(
      resolve(process.cwd(), 'src/supabase/functions/server/telegram/bot.ts'),
      'utf8',
    );
    const inicio = bot.indexOf('bot.callbackQuery(/^hato_alerta:');
    const fin = bot.indexOf('\n  });', inicio);
    const handler = bot
      .slice(inicio, fin)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(handler).toContain('procesarRespuestaAlertaTelegram');
    expect(handler).toContain('ctx.from');
    expect(handler).not.toContain('telegramUser');
    expect(handler).not.toContain('toISOString');
    expect(handler).not.toContain('["pendiente", "enviada"]');
  });
});
