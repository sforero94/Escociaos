import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Guardas del webhook de Telegram (hallazgo de seguridad #11).
 *
 * 1. El endpoint `/make-server-1ccce916/telegram/webhook` no validaba NADA.
 *    La edge function corre con `verify_jwt=false` (lo necesitan el propio
 *    webhook y los pg_cron de 060/102/105), el handler llamaba directamente a
 *    `bot.handleUpdate(await c.req.json())`, y el middleware de auth del bot
 *    resuelve la identidad con `ctx.from.id` — un campo del JSON que manda el
 *    llamante. O sea: cualquier POST anónimo de internet podía actuar como
 *    cualquier usuario activo del bot, incluido uno de Gerencia. El arreglo es
 *    el secreto compartido `X-Telegram-Bot-Api-Secret-Token`, el encabezado
 *    que Telegram envía cuando el webhook se registró con
 *    `setWebhook(url, { secret_token })`.
 *
 * 2. Los chat ids de Telegram son datos personales de producción y este repo
 *    es público. Ya se habían filtrado a documentos y a un fixture de test.
 *    El segundo guard los mantiene fuera de todo lo que no sea una migración
 *    ya aplicada (esas no se tocan nunca — regla dura del proyecto).
 *
 * Ambos guards son estáticos: `telegram/bot.ts` importa `npm:grammy` y sólo
 * resuelve bajo Deno, así que no se puede importar desde Vitest.
 */

const RAIZ = join(__dirname, '..', '..');

const COPIAS_BOT = [
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
  'src/supabase/functions/server/telegram/bot.ts',
];

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

/** Cuerpo de `handleWebhook` — desde su firma hasta el cierre de la función. */
function extraerHandleWebhook(fuente: string): string {
  const inicio = fuente.indexOf('export async function handleWebhook');
  expect(inicio).toBeGreaterThan(-1);
  const fin = fuente.indexOf('\n}', inicio);
  expect(fin).toBeGreaterThan(inicio);
  return fuente.slice(inicio, fin + 2);
}

describe('webhook de Telegram: secreto compartido obligatorio', () => {
  for (const copia of COPIAS_BOT) {
    it(`${copia} valida el encabezado antes de procesar el update`, () => {
      const cuerpo = extraerHandleWebhook(leer(copia));

      // Lee el encabezado que manda Telegram y lo compara contra el secreto
      // de la edge function.
      expect(cuerpo).toContain('X-Telegram-Bot-Api-Secret-Token');
      expect(cuerpo).toContain("Deno.env.get(\"TELEGRAM_WEBHOOK_SECRET\")");

      // Falla cerrado: 503 si el secreto no está configurado, 401 si no
      // coincide. Nunca corre "abierto".
      expect(cuerpo).toContain('503');
      expect(cuerpo).toContain('401');

      // El gate va ANTES de tocar el update: si `handleUpdate` apareciera
      // primero, el secreto sería decorativo.
      const posSecreto = cuerpo.indexOf('TELEGRAM_WEBHOOK_SECRET');
      const posHandleUpdate = cuerpo.indexOf('handleUpdate(');
      expect(posHandleUpdate).toBeGreaterThan(posSecreto);
    });
  }

  it('la comparación del secreto es en tiempo constante', () => {
    for (const copia of COPIAS_BOT) {
      const fuente = leer(copia);
      expect(fuente).toContain('async function secretosCoinciden');
      // Digest de longitud fija + XOR acumulado: el bucle no corta en el
      // primer byte distinto, así que el tiempo no filtra el secreto.
      expect(fuente).toContain("crypto.subtle.digest(\"SHA-256\"");
      expect(fuente).toContain('diff |=');
      expect(fuente).not.toMatch(/recibido\s*===\s*secretoConfigurado/);
    }
  });

  it('las dos copias del handler están en sync', () => {
    const [a, b] = COPIAS_BOT.map((c) => extraerHandleWebhook(leer(c)));
    expect(a).toBe(b);
  });
});

// ============================================================================
// Chat ids de Telegram fuera del código y de la documentación
// ============================================================================

/** Un chat id de Telegram es un entero de ~9-11 dígitos. */
const DIGITOS = /(?<![\d.])\d{9,11}(?![\d.])/;
/** Palabras que delatan que el número de al lado es un chat id. */
const CONTEXTO = /telegram|chat[_\s-]?id/i;
/** Cuántas líneas alrededor se miran para decidir el contexto. */
const VENTANA = 2;

const DIRECTORIOS = ['src', 'docs', 'supabase', 'escociaos-po', 'scripts'];
const EXTENSIONES = ['.ts', '.tsx', '.md', '.sql', '.json', '.py'];

const EXCLUIDOS = [
  'node_modules',
  '.git',
  'build',
  'dist',
  // Las migraciones aplicadas NO se editan nunca (regla dura del proyecto):
  // la 091 y la 096 llevan el id en sus guardas y ahí se quedan.
  join('src', 'sql', 'migrations'),
  // Este mismo archivo (contiene la allowlist de abajo).
  join('src', '__tests__', 'telegramWebhookSecretoGuard.test.ts'),
];

/**
 * Números de ~10 dígitos que NO son chat ids privados y pueden quedarse.
 * Cada entrada necesita su motivo.
 */
const ALLOWLIST = new Map<string, string>([
  // Identificador de la cuenta pública del propio bot (@escociaos_bot), parte
  // del `botInfo` que Grammy necesita para arrancar sin llamar a getMe.
  ['8759479581', 'id público del bot @escociaos_bot (botInfo de Grammy)'],
]);

function recolectar(dir: string, salida: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return salida;
  }
  for (const entrada of entradas) {
    const completo = join(dir, entrada);
    const rel = relative(RAIZ, completo);
    if (EXCLUIDOS.some((e) => rel === e || rel.startsWith(e + '/'))) continue;
    if (statSync(completo).isDirectory()) {
      recolectar(completo, salida);
    } else if (EXTENSIONES.some((ext) => entrada.endsWith(ext))) {
      salida.push(completo);
    }
  }
  return salida;
}

describe('chat ids de Telegram no se publican en el repo', () => {
  it('ningún literal de 9-11 dígitos aparece junto a "telegram"/"chat_id"', () => {
    const hallazgos: string[] = [];

    for (const dir of DIRECTORIOS) {
      for (const archivo of recolectar(join(RAIZ, dir))) {
        const lineas = readFileSync(archivo, 'utf8').split('\n');
        lineas.forEach((linea, i) => {
          const global = new RegExp(DIGITOS.source, 'g');
          const numeros = linea.match(global);
          if (!numeros) return;
          const desde = Math.max(0, i - VENTANA);
          const hasta = Math.min(lineas.length, i + VENTANA + 1);
          const contexto = lineas.slice(desde, hasta).join('\n');
          if (!CONTEXTO.test(contexto)) return;
          for (const numero of numeros) {
            if (ALLOWLIST.has(numero)) continue;
            // Se reporta fichero:línea, NUNCA el valor.
            hallazgos.push(`${relative(RAIZ, archivo)}:${i + 1}`);
          }
        });
      }
    }

    expect(
      hallazgos,
      'Posible chat id de Telegram publicado en el repo (el valor se omite a propósito). ' +
        'Reemplazalo por un valor sintético o por una referencia a `telegram_usuarios`; ' +
        'si el número no es un chat id, agregalo a ALLOWLIST con su motivo.',
    ).toEqual([]);
  });
});
