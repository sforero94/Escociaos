// ARCHIVO: utils/horarioAlertas.ts
// DESCRIPCIÓN: Lógica pura del horario de envío de alertas (migración 175).
// La hora vive en pg_cron, no en el código: Gerencia la cambia desde
// Configuración → Alertas a través de `fn_alertas_horario_cambiar`. Este
// módulo sólo valida la entrada y pone nombres; la base vuelve a validar
// todo (el navegador da el mensaje claro, la base garantiza).

/** Procesos programados que mandan alertas por Telegram. Lista literal,
 * igual a la de la migración 175: los crons de clima no mandan alertas y
 * no se pueden mover desde la pantalla. */
export const JOBS_HORARIO_ALERTAS = ['hato-alertas-tick', 'ronda-inventario-tick'] as const;

export type JobHorarioAlertas = (typeof JOBS_HORARIO_ALERTAS)[number];

export const ETIQUETA_JOB_HORARIO: Record<JobHorarioAlertas, { titulo: string; descripcion: string }> = {
  'hato-alertas-tick': {
    titulo: 'Alertas del hato',
    descripcion: 'Genera y envía secado, parto próximo, servicio sin confirmar, rechequeo y pasos de tratamiento.',
  },
  'ronda-inventario-tick': {
    titulo: 'Ronda de inventario',
    descripcion: 'Recordatorio del mes, revisión del día 15 y reporte de cierre.',
  },
};

export interface FilaHorarioAlertas {
  jobname: string;
  /** 'HH:MM' en hora de Colombia, o null si el schedule no es diario. */
  hora_bogota: string | null;
  activo: boolean;
}

const RE_HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Mensaje en español si la hora no sirve; null si sirve. */
export function validarHoraAlertas(hora: string): string | null {
  if (!RE_HORA.test(hora.trim())) return 'Usa una hora entre 00:00 y 23:59 (formato HH:MM).';
  return null;
}

export function esJobHorarioAlertas(jobname: string): jobname is JobHorarioAlertas {
  return (JOBS_HORARIO_ALERTAS as readonly string[]).includes(jobname);
}

/** '07:30' → '7:30 a. m.'; '19:05' → '7:05 p. m.'. Null queda como «sin hora». */
export function formatearHoraAlertas(hora: string | null): string {
  if (hora == null || !RE_HORA.test(hora)) return 'sin hora';
  const [h, m] = hora.split(':').map(Number);
  const sufijo = h < 12 ? 'a. m.' : 'p. m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** True cuando el error de la RPC significa que la migración 175 todavía no
 * está aplicada (la función no existe), para no mostrarlo como un fallo. */
export function esFuncionHorarioAusente(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === 'PGRST202' || err.code === '42883') return true;
  return /fn_alertas_horario_(listar|cambiar)/.test(err.message ?? '') && /not find|does not exist|no existe/i.test(err.message ?? '');
}
