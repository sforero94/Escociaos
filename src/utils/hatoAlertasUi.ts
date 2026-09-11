// ARCHIVO: utils/hatoAlertasUi.ts
// DESCRIPCIÓN: Lógica pura de presentación/derivación para AlertasView
// (`/hato-lechero/alertas`, S6/V11, plan §6 Épica C, §7.5). Traduce las
// filas crudas de `hato_alertas` (migración 056) a lo que la vista necesita
// para ordenar, filtrar y agrupar por tema (`agruparAlertasPorTipo`) -- NUNCA
// decide reglas de negocio nuevas
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
import {
  DIAS_EXPIRACION_ALERTA,
  decidirExpiracionTerminal,
  type TipoAlertaHato,
  type EstadoAlertaHato,
} from '@/utils/hatoAlertas';

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

/** Un grupo de la cola por tema (`tipo`). Solo se emite si hay filas -- un
 * tema vacío no aparece (misma regla "sin dato, nunca 0"). El orden de
 * grupos sigue `TIPOS_ALERTA_HATO`; dentro de cada grupo se reusa
 * `ordenarAlertasHato` (urgentes primero). */
export interface GrupoAlertasPorTipo<T extends AlertaFiltrable & AlertaOrdenable> {
  tipo: TipoAlertaHato;
  label: string;
  alertas: T[];
}

/** Agrupa la cola por tema para que la vista pueda colapsar cada tipo y no
 * mostrar todas las filas de golpe. No muta el arreglo de entrada. */
export function agruparAlertasPorTipo<T extends AlertaFiltrable & AlertaOrdenable>(
  alertas: readonly T[],
): GrupoAlertasPorTipo<T>[] {
  const porTipo = new Map<TipoAlertaHato, T[]>();
  for (const a of alertas) {
    const lista = porTipo.get(a.tipo);
    if (lista) lista.push(a);
    else porTipo.set(a.tipo, [a]);
  }

  const grupos: GrupoAlertasPorTipo<T>[] = [];
  for (const tipo of TIPOS_ALERTA_HATO) {
    const filas = porTipo.get(tipo);
    if (!filas || filas.length === 0) continue;
    grupos.push({
      tipo,
      label: LABEL_TIPO_ALERTA_HATO[tipo],
      alertas: ordenarAlertasHato(filas),
    });
  }
  return grupos;
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

/** Identidad de una alerta DE HATO en la cola (`animal_id === null`, hoy solo
 * `rechequeo_due` desde 2026-09-08). No cuelga de ningún animal, así que la
 * fila no puede decir "sin caravana" -- diría que falta un dato que nunca
 * debió existir. `vacasCount` sale de `hato_alertas.datos.vacas_count`; si no
 * viene (alerta de hato de otro origen, o `datos` incompleto) se rotula el
 * alcance sin inventar un número, misma regla de "sin dato, nunca 0" que rige
 * todo el módulo. */
export function etiquetaAlcanceHato(vacasCount: number | null): string {
  if (vacasCount === null || !Number.isFinite(vacasCount) || vacasCount < 0) return 'Todo el hato';
  return vacasCount === 1 ? '1 vaca del hato' : `${vacasCount} vacas del hato`;
}

export { chipEstadoAlerta };

// ============================================================================
// Expiración automática de alertas "atascadas" (T3a, ronda agosto 2026;
// S6/D-24 llevó la MISMA regla al tick diario -- ver nota abajo)
// ============================================================================
//
// Hasta S6, el motor del tick (`decidirAccionEscalamiento`, `hatoAlertas.ts`)
// solo podía escalar o expirar alertas en `pendiente`/`enviada` -- una vez
// que una alerta llegaba a `escalada` (48h sin respuesta) o `respondida`
// (Fernando contestó "no"/"otro"), NINGÚN mecanismo automático volvía a
// tocarla; se quedaba ahí para siempre salvo que un humano la cerrara a mano
// desde "Revisión semanal". Con `hato_alertas_config.destinatario_telegram_id`
// en NULL desde julio (CLAUDE.md, "LAZO ABIERTO"), eso es exactamente lo que
// pasó: 39 alertas `escalada` acumuladas sin que nadie las revisara.
//
// Esta regla identifica esas alertas "vencidas" para que la vista pueda
// ofrecer "Expirar automáticamente" como una ACCIÓN EXPLÍCITA y reversible
// -- reversible en el sentido de que requiere una confirmación humana antes
// de escribir nada, nunca se dispara sola al cargar la página.
//
// D-24 (docs/plan_hato_ronda_agosto_2026.md §0, S6): la MISMA regla ahora
// también corre sola en el tick diario -- `decidirExpiracionTerminal`
// (`hatoAlertas.ts`, el motor protegido por paridad de 3 copias). Esta
// función DELEGA en esa (una sola definición de "atascada" en todo el
// módulo, nunca dos que puedan divergir) en vez de reimplementar el cálculo
// de días como antes de D-24 -- el botón manual de esta vista sigue
// existiendo para lo que el tick automático deje pendiente entre corridas
// (o para adelantarse a la próxima), pero ya no es el ÚNICO camino.

export interface AlertaParaExpiracionAutomatica {
  id: string;
  estado: EstadoAlertaHato;
  escalada_at: string | null;
  updated_at: string;
}

/** Alertas `escalada`/`respondida` que llevan más de `diasUmbral` días
 * (default `DIAS_EXPIRACION_ALERTA`, el mismo del motor) sin que nadie las
 * cierre. `pendiente`/`enviada` quedan fuera a propósito: esas SÍ las cubre
 * el tick diario (`decidirAccionEscalamiento`) -- esta regla es solo para
 * los dos estados terminales. */
export function alertasVencidasParaExpirar<T extends AlertaParaExpiracionAutomatica>(
  alertas: readonly T[],
  fechaHoraReferencia: string,
  diasUmbral: number = DIAS_EXPIRACION_ALERTA,
): T[] {
  return alertas.filter((a) => decidirExpiracionTerminal(a, fechaHoraReferencia, diasUmbral));
}
