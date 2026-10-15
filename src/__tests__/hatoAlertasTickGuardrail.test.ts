import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Since 2026-10-05 (owner decision) the subscriptions are the ONLY rule for
 * who receives an alert: no rol_bot filter in code. Gerencia edits them from
 * Configuración → Alertas. These guards pin that the old role filter
 * (issues #217/#251) does not come back by accident in any copy.
 */

const COPIAS = [
  'src/supabase/functions/server/hato-alertas-tick.ts',
  'supabase/functions/make-server-1ccce916/hato-alertas-tick.ts',
];

describe('tick: source-bound caller and subscription authority', () => {
  it('keeps both actual tick roots identical with no direct domain writes', () => {
    const sources=COPIAS.map(rel=>readFileSync(resolve(__dirname,'../..',rel),'utf8'));
    expect(sources[0]).toBe(sources[1]);
    for(const source of sources){
      expect(source).toContain('postReservedAlertCron');
      expect(source).toContain('dispatchCronDelivery');
      expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(source).not.toContain("from('hato_config')");
      expect(source).not.toContain("from('v_hato_estado_actual')");
    }
  });
  it('reserves manual jobs with the original JWT/UUID and current Gerencia',()=>{
    for(const rel of COPIAS){const source=readFileSync(resolve(__dirname,'../..',rel),'utf8');
      expect(source).toContain("new Set(['Gerencia'])");
      expect(source).toContain('supabase.auth.getUser(token)');
      expect(source).toContain("c.req.header('Idempotency-Key')");
      expect(source).toContain("Authorization:'Bearer '+auth.token");
      expect(source).toContain("'fn_alert_cron_web'");
    }
  });
  it('allows the stable manual key through both edge CORS boundaries',()=>{for(const file of ['src/supabase/functions/server/index.tsx','supabase/functions/make-server-1ccce916/index.ts']){const source=readFileSync(file,'utf8');expect(source).toContain('x-client-info, Idempotency-Key');expect(source).toContain('"x-client-info", "Idempotency-Key"');}});
  it('plans rule/fact retirement only from reserved source and never filters subscriptions by role',()=>{
    const source=readFileSync('src/supabase/functions/server/alertCronPlan.ts','utf8');
    expect(source).toContain('alertasSuperadasPorCambioDeRegla(');
    expect(source).toContain('alertasConHechoRegistrado(');
    expect(source).toContain("patch:{estado:'descartada'");
    expect(source).toContain("phase==='delivery'?'recibe':'escalamiento'");
    expect(source).not.toContain('rol_bot');
    expect(source).not.toContain('destinatariosTelegramPermitidos');
    expect(source).not.toContain('Date.now');
  });
});

const COPIAS_BOT = [
  'src/supabase/functions/server/telegram/bot.ts',
  'supabase/functions/make-server-1ccce916/telegram/bot.ts',
];

describe('bot: respuesta de alerta usa el protocolo preparado', () => {
  it('ambas copias delegan respuesta y efecto atómico sin reclamo directo', () => {
    for (const rel of COPIAS_BOT) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).toContain('await beginAlertResponse');
      expect(fuente, rel).toContain('await handleAlertResponseRecovery');
      expect(fuente, rel).not.toContain('payloadEventoSecadoDesdeAlerta');
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

describe('UI: Gerencia controla quién recibe sin reglas de rol en código', () => {
  it('Quién recibe y TelegramConfig no bloquean casillas por rol', () => {
    for (const rel of UI_QUIEN_RECIBE) {
      const fuente = readFileSync(resolve(__dirname, '../..', rel), 'utf8');
      expect(fuente, rel).not.toContain('puedeRecibirAlertaTelegram');
      expect(fuente, rel).not.toContain('motivoBloqueoAlertaTelegram');
      expect(fuente, rel).not.toMatch(/disabled=\{!permitido/);
    }
  });

  it('Quién recibe edita Recibe y Escala en la misma matriz', () => {
    const fuente = readFileSync(
      resolve(__dirname, '../..', 'src/components/hato/components/AlertasQuienRecibeTab.tsx'),
      'utf8',
    );
    expect(fuente).toContain('alternarRecibe');
    expect(fuente).toContain('alternarEscalamiento');
  });

  it('ningún camino de guardado reescribe lo que marcó Gerencia', () => {
    const routing = readFileSync(
      resolve(__dirname, '../..', 'src/components/hato/hooks/useAlertasRouting.ts'),
      'utf8',
    );
    const config = readFileSync(
      resolve(__dirname, '../..', 'src/components/configuracion/TelegramConfig.tsx'),
      'utf8',
    );
    expect(routing).not.toContain('aplicarGuardrailSuscripcion');
    expect(config).not.toContain('aplicarGuardrailSuscripcion');
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
