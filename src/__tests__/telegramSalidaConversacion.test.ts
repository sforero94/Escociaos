import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guarda estructural: el comando de cancelar SIEMPRE saca al usuario de una
 * conversación, esté donde esté.
 *
 * INCIDENTE 2026-09-08 — «Telegram dejó de funcionar». Dos usuarios quedaron con
 * una conversación `/evento` abierta y el bot dejó de contestarles a TODO. El
 * diagnóstico costó lo que cuesta un fallo sin señal: el webhook devolvía 200 en
 * 1-3 s, la sesión se leía y se escribía bien, y no había ni un error en los
 * registros. La evidencia estaba en `telegram_conversations`, no en los logs.
 *
 * CAUSA. `conversation.waitForCallbackQuery([...])` de
 * `@grammyjs/conversations@2` DESCARTA la actualización que no encaja con el
 * filtro: no la pasa al middleware de abajo. Mientras una conversación espera un
 * botón, el bot se come cada mensaje de ese usuario. Y `bot.command("cancelar")`
 * estaba registrado DESPUÉS de los `createConversation`, o sea que la única
 * salida documentada era inalcanzable justo cuando hacía falta.
 *
 * El usuario que perdía de vista el teclado —mensaje viejo, chat limpiado, otro
 * dispositivo, un despliegue en medio del flujo— quedaba encerrado para siempre.
 * Uno de los dos llevaba cinco días así.
 *
 * LA REGLA. El registro de `cancelar` va entre `conversations()` (que instala
 * `ctx.conversation`) y el primer `createConversation()` (que es el que reanuda
 * la conversación y se traga la actualización). Ni antes ni después.
 *
 * Se comprueba en los DOS árboles de edge function: el que se despliega es
 * `supabase/functions/make-server-1ccce916/`, así que arreglar solo `src/` deja
 * el defecto vivo en producción.
 */

const ARBOLES = [
  'src/supabase/functions/server/telegram/bot.ts',
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
];

const REGISTRO_CANCELAR = 'bot.command("cancelar"';
const INSTALA_API = 'bot.use(conversations({';
const PRIMERA_CONVERSACION = 'bot.use(createConversation(';

describe('salida de conversación del bot de Telegram', () => {
  for (const ruta of ARBOLES) {
    describe(ruta, () => {
      const texto = readFileSync(resolve(process.cwd(), ruta), 'utf-8');

      it('registra el comando de cancelar exactamente una vez', () => {
        const veces = texto.split(REGISTRO_CANCELAR).length - 1;
        expect(veces).toBe(1);
      });

      it('lo registra ANTES del primer createConversation', () => {
        const cancelar = texto.indexOf(REGISTRO_CANCELAR);
        const primera = texto.indexOf(PRIMERA_CONVERSACION);
        expect(cancelar).toBeGreaterThan(-1);
        expect(primera).toBeGreaterThan(-1);
        // Estrictamente antes: un createConversation por delante ya reanuda la
        // conversación y descarta la actualización.
        expect(cancelar).toBeLessThan(primera);
      });

      it('lo registra DESPUÉS de instalar el plugin, o `ctx.conversation` no existe', () => {
        const instala = texto.indexOf(INSTALA_API);
        const cancelar = texto.indexOf(REGISTRO_CANCELAR);
        expect(instala).toBeGreaterThan(-1);
        expect(cancelar).toBeGreaterThan(instala);
      });

      it('la salida llama a ctx.conversation.exit()', () => {
        const desde = texto.indexOf(REGISTRO_CANCELAR);
        const cuerpo = texto.slice(desde, desde + 400);
        expect(cuerpo).toContain('ctx.conversation.exit()');
      });
    });
  }

  it('los dos árboles son idénticos', () => {
    const [a, b] = ARBOLES.map((r) => readFileSync(resolve(process.cwd(), r), 'utf-8'));
    expect(a).toBe(b);
  });
});
