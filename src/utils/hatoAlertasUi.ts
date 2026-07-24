// ARCHIVO: utils/hatoAlertasUi.ts
// DESCRIPCIÓN: Lógica pura de presentación/derivación para AlertasView
// (`/hato-lechero/alertas`, S6/V11, plan §6 Épica C, §7.5). Traduce las
// filas crudas de `hato_alertas` (migración 056) a lo que la vista necesita
// para ordenar, filtrar y agrupar -- NUNCA decide reglas de negocio nuevas
// (esas viven en la edge function del tick diario, §7.3): este archivo solo
// etiqueta y ordena lo que la cola ya contiene.
//
// La paleta de color de los chips semánticos vive en `utils/hatoUi.ts`
// ("fuente única de la paleta", ver su cabecera) -- este archivo importa
// `chipEstadoAlerta` de ahí en vez de reinventar clases de color, y se
// limita a labels de texto y a las funciones de orden/filtro/conteo que sí
// son específicas de la cola de alertas.
//
// `TipoAlertaHato`/`EstadoAlertaHato` se reexportan de `utils/hatoAlertas.ts`
// (el motor puro del tick diario, S6/§7.3) en vez de redefinirse aquí --
// mismo patrón que `hatoCategorias.ts` reexportando `EstadoReproductivo` de
// `calculosHato.ts`: una sola fuente de verdad para el espejo del CHECK de
// `hato_alertas` (migración 056), nunca dos uniones de tipo que puedan
// divergir.

import { chipEstadoAlerta, type ChipEstilo } from '@/utils/hatoUi';
import type { TipoAlertaHato, EstadoAlertaHato } from '@/utils/hatoAlertas';

export type { TipoAlertaHato, EstadoAlertaHato };

export const TIPOS_ALERTA_HATO: readonly TipoAlertaHato[] = [
  'secado_due',
  'tratamiento_paso',
  'rechequeo_due',
  'servicio_sin_confirmacion',
  'parto_proximo',
];

export const ESTADOS_ALERTA_HATO: readonly EstadoAlertaHato[] = [
  'pendiente',
  'enviada',
  'respondida',
  'confirmada',
  'descartada',
  'escalada',
  'expirada',
];

/** Etiqueta en español para cada tipo de alerta (plan §6 Épica C, C1-C5). */
export const LABEL_TIPO_ALERTA_HATO: Record<TipoAlertaHato, string> = {
  secado_due: 'Secado',
  tratamiento_paso: 'Paso de tratamiento',
  rechequeo_due: 'Rechequeo pendiente',
  servicio_sin_confirmacion: 'Servicio sin confirmar',
  parto_proximo: 'Parto próximo',
};

/** Etiqueta en español para cada estado de la cola. */
export const LABEL_ESTADO_ALERTA_HATO: Record<EstadoAlertaHato, string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  respondida: 'Respondida',
  confirmada: 'Confirmada',
  descartada: 'Descartada',
  escalada: 'Escalada',
  expirada: 'Expirada',
};

/** Prioridad de orden: lo urgente/sin resolver primero, lo cerrado al final.
 * Números más bajos = más arriba en la cola. Precedente: `clasificarGravedad`
 * en calculosMonitoreo.ts usa el mismo patrón de "traducir un estado ya
 * calculado a un orden de exhibición", nunca al revés. */
const PRIORIDAD_ESTADO: Record<EstadoAlertaHato, number> = {
  escalada: 0,
  pendiente: 1,
  enviada: 2,
  respondida: 3,
  expirada: 4,
  confirmada: 5,
  descartada: 6,
};

export interface AlertaOrdenable {
  estado: EstadoAlertaHato;
  fecha_programada: string;
}

/** Ordena la cola: primero lo urgente/sin resolver (escalada > pendiente >
 * enviada > respondida > expirada > confirmada > descartada), y dentro de
 * cada grupo, lo más antiguo primero (una alerta vencida hace más tiempo
 * pesa más que una recién programada). No muta el arreglo de entrada. */
export function ordenarAlertasHato<T extends AlertaOrdenable>(alertas: readonly T[]): T[] {
  return [...alertas].sort((a, b) => {
    const prioridadDiff = PRIORIDAD_ESTADO[a.estado] - PRIORIDAD_ESTADO[b.estado];
    if (prioridadDiff !== 0) return prioridadDiff;
    return a.fecha_programada.localeCompare(b.fecha_programada);
  });
}

export interface AlertaFiltrable {
  estado: EstadoAlertaHato;
  tipo: TipoAlertaHato;
}

/** Filtra la cola por estado y/o tipo (ambos opcionales -- `undefined`/`''`
 * significa "todos"). Usado por los selects de la vista, análogo al
 * `tipoFilter`/`fincaFilter` de `GanadoMovimientos.tsx`. */
export function filtrarAlertasHato<T extends AlertaFiltrable>(
  alertas: readonly T[],
  filtros: { estado?: EstadoAlertaHato | ''; tipo?: TipoAlertaHato | '' },
): T[] {
  return alertas.filter((a) => {
    if (filtros.estado && a.estado !== filtros.estado) return false;
    if (filtros.tipo && a.tipo !== filtros.tipo) return false;
    return true;
  });
}

/** Cuenta por estado -- solo lo que existe, nunca una fila inventada para
 * un estado sin alertas (regla "sin dato, nunca 0" del módulo: un KPI de
 * cola vacía se explica con el estado vacío de la sección, no con un 0
 * fantasma en un estado que jamás tuvo una fila). */
export function contarAlertasPorEstado<T extends { estado: EstadoAlertaHato }>(
  alertas: readonly T[],
): Partial<Record<EstadoAlertaHato, number>> {
  const conteo: Partial<Record<EstadoAlertaHato, number>> = {};
  for (const a of alertas) {
    conteo[a.estado] = (conteo[a.estado] ?? 0) + 1;
  }
  return conteo;
}

/** V11 (plan §6 C4): "el resumen a Martha se reserva para lo vencido/
 * escalado" -- además de `respondida` (esp. `respuesta='no'`, la que el
 * task pide explícitamente para la revisión semanal), una alerta
 * `escalada` (48h sin respuesta) o `expirada` (>14 días) también exige
 * decisión humana. `confirmada`/`descartada` ya están resueltas;
 * `pendiente`/`enviada` todavía están en su ciclo normal de reintento y no
 * necesitan a Martha todavía. */
export function requiereRevisionSemanal(estado: EstadoAlertaHato): boolean {
  return estado === 'respondida' || estado === 'escalada' || estado === 'expirada';
}

/** Chip de la respuesta libre (`hato_alertas.respuesta`). `null`/vacío no se
 * colorea -- "sin respuesta todavía" no es lo mismo que una respuesta
 * negativa. Un valor `'no'` (case-insensitive, la convención de C1: "¿Ya se
 * secó?" [Sí / Todavía no / Otra cosa]) se resalta en rojo porque siempre
 * exige seguimiento; cualquier otro texto se muestra neutro. */
export function chipRespuestaAlerta(respuesta: string | null): ChipEstilo | null {
  if (!respuesta || !respuesta.trim()) return null;
  const normalizado = respuesta.trim().toLowerCase();
  if (normalizado === 'no' || normalizado.startsWith('todavía no') || normalizado.startsWith('todavia no')) {
    return { label: respuesta, className: 'bg-red-50 text-red-700 border-red-200' };
  }
  return { label: respuesta, className: 'bg-gray-100 text-gray-600 border-gray-200' };
}

export { chipEstadoAlerta };
