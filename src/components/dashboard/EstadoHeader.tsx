import { formatearFechaLarga, obtenerFechaHoy } from '@/utils/fechas';

export interface EstadoHeaderProps {
  /**
   * Conteo de filas de "Requiere tu decisión" (Bloque 1). Lo calcula
   * `useRequiereDecision` en paralelo -- este componente NUNCA lo consulta,
   * para que el número de la barra y el de la bandeja no puedan divergir
   * (docs/plan_dashboard_centro_control.md §4 Bloque 0).
   *
   * `null` = todavía no se sabe (loading real). Nunca se interpreta como
   * "0 pendientes".
   */
  conteoDecision: number | null;
  /**
   * 0 a 3 hechos breves, ya redactados por quien compone la pantalla (ej.
   * "Sin lluvia hace 2 días", "Última ronda de monitoreo hace 13 días").
   * Este componente sólo los pinta -- no consulta clima ni monitoreo, para
   * no duplicar lo que ya arman ClimaCard y el pulso por negocio.
   */
  hechos?: string[];
  /** Nombre para el saludo de la derecha. Sin nombre, el saludo queda genérico. */
  nombreUsuario?: string | null;
}

function saludoPorHora(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function fraseConteo(n: number): string {
  if (n <= 0) return 'Nada pendiente de ti';
  return `${n} ${n === 1 ? 'cosa espera' : 'cosas esperan'} tu decisión`;
}

/**
 * EstadoHeader — Barra de estado (Bloque 0 del Centro de Control,
 * `docs/plan_dashboard_centro_control.md` §4/§9.2). Una sola línea que
 * responde "¿tengo que leer esta pantalla hoy?": punto de estado, conteo de
 * pendientes en negrita, hasta 3 hechos breves separados por punto medio, y
 * un saludo discreto a la derecha con la fecha larga en español.
 *
 * Reemplaza la versión anterior (contaba `alertas` sin distinguir
 * "pendiente con dueño" de "observación") — la sustituye por completo, no la
 * extiende.
 */
export function EstadoHeader({ conteoDecision, hechos = [], nombreUsuario }: EstadoHeaderProps) {
  if (conteoDecision === null) {
    return <div className="h-9 w-full max-w-sm bg-gray-200 rounded-full animate-pulse" />;
  }

  const hora = new Date().getHours();
  const saludo = `${saludoPorHora(hora)}${nombreUsuario ? `, ${nombreUsuario}` : ''}`;
  const fechaLarga = formatearFechaLarga(obtenerFechaHoy());
  const hayPendientes = conteoDecision > 0;
  const hechosVisibles = hechos.slice(0, 3);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-full bg-primary/5 border border-primary/10 px-4 py-2.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <span
          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${hayPendientes ? 'bg-destructive' : 'bg-primary'}`}
          aria-hidden="true"
        />
        <span className={hayPendientes ? 'font-bold text-foreground' : 'font-medium text-primary'}>
          {fraseConteo(conteoDecision)}
        </span>
        {hechosVisibles.map((hecho, i) => (
          <span key={i} className="text-brand-brown/70">
            {' · '}
            {hecho}
          </span>
        ))}
      </p>
      <p className="text-xs text-brand-brown/60 whitespace-nowrap">
        {saludo} · {fechaLarga}
      </p>
    </div>
  );
}
