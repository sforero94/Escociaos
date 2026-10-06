// ARCHIVO: components/configuracion/AlertasConfig.tsx
// DESCRIPCIÓN: Configuración → Alertas (Gerencia). Un solo lugar para todo lo
// que decide qué alerta sale, a quién y a qué hora (decisión del dueño,
// 2026-10-05: "que todas las alertas sean modificables ... desde la pagina
// de configuraciones"). Nada de esto vive en el código:
//   - Horario      → pg_cron, vía las funciones de la migración 175.
//   - Quién recibe → telegram_alertas_suscripciones (recibe + escala), la
//                    ÚNICA regla de destinatarios: el tick no filtra por rol.
//   - Tipos        → hato_alertas_config (activo + horas de escalamiento).
//   - Umbrales     → hato_config, en la pestaña Hato de esta misma página.

import type { ReactNode } from 'react';
import { AlertasHorario } from './AlertasHorario';
import { AlertasQuienRecibeTab } from '../hato/components/AlertasQuienRecibeTab';
import { AlertasTiposTab } from '../hato/components/AlertasTiposTab';
import { useAuth } from '@/contexts/AuthContext';

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-4 lg:p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
      <h2 className="text-base font-semibold text-foreground mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

export function AlertasConfig() {
  const { profile } = useAuth();
  const esGerencia = profile?.rol === 'Gerencia';

  return (
    <div className="space-y-6">
      <Seccion titulo="Horario de envío">
        <AlertasHorario />
      </Seccion>
      <Seccion titulo="Quién recibe cada alerta">
        <AlertasQuienRecibeTab canGerencia={esGerencia} updatedBy={profile?.id ?? null} />
      </Seccion>
      <Seccion titulo="Tipos de alerta del hato">
        <AlertasTiposTab canWrite={esGerencia} />
      </Seccion>
      <p className="text-xs text-brand-brown/60">
        Los días de anticipación de cada alerta del hato (parto próximo, servicio sin confirmar, rechequeo) se
        editan en la pestaña Hato de esta misma página.
      </p>
    </div>
  );
}
