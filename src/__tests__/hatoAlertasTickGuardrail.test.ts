import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Issue #217: a bad subscription must not Telegram-spam Fernando with
 * gerencia types. The filter lives in hatoAlertas.ts; both tick copies
 * must actually CALL it on the broadcast list (recibe AND escalamiento).
 * A comment is not enough — that is how the 068 climate gate was "fixed"
 * without changing the table.
 */

const COPIAS = [
  'src/supabase/functions/server/hato-alertas-tick.ts',
  'supabase/functions/make-server-1ccce916/hato-alertas-tick.ts',
];

describe('tick: guardrail Telegram campo (issue #217)', () => {
  it('ambas copias del tick filtran destinatarios con destinatariosTelegramPermitidos', () => {
    for (const rel of COPIAS) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).toContain('destinatariosTelegramPermitidos');
      expect(fuente, rel).toMatch(/rol_bot/);
      const usos = fuente.split('destinatariosTelegramPermitidos(').length - 1;
      expect(usos, `${rel} debe filtrar recibe y escalamiento`).toBeGreaterThanOrEqual(2);
    }
  });

  it('las dos copias del tick siguen siendo idénticas en el filtro', () => {
    const [a, b] = COPIAS.map((rel) => readFileSync(resolve(__dirname, '../..', rel), 'utf8'));
    expect(a).toBe(b);
  });
});

const COPIAS_BOT = [
  'src/supabase/functions/server/telegram/bot.ts',
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
];

describe('bot: respuesta de alerta usa los helpers del motor (issue #217)', () => {
  it('ambas copias del bot delegan estado y efecto de dominio', () => {
    for (const rel of COPIAS_BOT) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).toContain('estadoTrasRespuestaAlerta');
      expect(fuente, rel).toContain('efectoDominioRespuestaAlerta');
      expect(fuente, rel).toContain('payloadEventoSecadoDesdeAlerta');
    }
  });

  it('las dos copias del bot siguen siendo idénticas en el handler de alerta', () => {
    const [a, b] = COPIAS_BOT.map((rel) => readFileSync(resolve(__dirname, '../..', rel), 'utf8'));
    expect(a).toBe(b);
  });
});
