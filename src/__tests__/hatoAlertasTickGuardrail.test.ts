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

  it('ambas copias del tick retiran las alertas superadas por un cambio de regla (ESCO-93)', () => {
    // La fase (0) tiene que EXISTIR en el handler, no solo estar descrita en
    // un comentario: sin la llamada al motor, una regla re-afinada vuelve a
    // dejar sus alertas viejas escalando para siempre.
    for (const rel of COPIAS) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).toContain('alertasSuperadasPorCambioDeRegla(');
      // Se marcan descartada, nunca se borran: `hato_alertas` es historia.
      expect(fuente, rel).toMatch(/estado:\s*'descartada'/);
      expect(fuente, rel).not.toMatch(/from\('hato_alertas'\)\s*\.delete\(/);
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

const UI_QUIEN_RECIBE = [
  'src/components/hato/components/AlertasQuienRecibeTab.tsx',
  'src/components/configuracion/TelegramConfig.tsx',
];

describe('UI: gerencia no enciende secado/tratamiento en Telegram (issue #251)', () => {
  it('Quién recibe y TelegramConfig bloquean la casilla con el mismo guardrail', () => {
    for (const rel of UI_QUIEN_RECIBE) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).toContain('puedeRecibirAlertaTelegram');
      expect(fuente, rel).toContain('motivoBloqueoAlertaTelegram');
      expect(fuente, rel).toMatch(/disabled=\{!permitido/);
    }
  });

  it('los dos caminos de guardado pasan por aplicarGuardrailSuscripcion', () => {
    const routing = readFileSync(
      resolve(__dirname, '../..', 'src/components/hato/hooks/useAlertasRouting.ts'),
      'utf8',
    );
    const config = readFileSync(
      resolve(__dirname, '../..', 'src/components/configuracion/TelegramConfig.tsx'),
      'utf8',
    );
    expect(routing).toContain('aplicarGuardrailSuscripcion');
    expect(config).toContain('aplicarGuardrailSuscripcion');
  });

  it('la migración 152 deja las claves de campo solo en Fernando y no se reescribe a mano', () => {
    const sql = readFileSync(
      resolve(__dirname, '../..', 'src/sql/migrations/152_telegram_campo_solo_fernando_secado_tratamiento.sql'),
      'utf8',
    );
    expect(sql).toContain('backup_152_telegram_alertas_suscripciones_campo');
    expect(sql).toContain('hato.secado_due');
    expect(sql).toContain('hato.tratamiento_paso');
    expect(sql).toContain("%fernando%");
    expect(sql).toMatch(/rol_bot = 'campo'/);
    expect(sql).toMatch(/escalamiento = false/);
  });
});
