// ARCHIVO: utils/hatoAlertasTablero.ts
// DESCRIPCIÓN: Derivación de las 4 señales de alerta del hato (secado,
// parto, rechequeo, vacía por servir) para el "Tablero de alertas" del
// Dashboard (`HatoDashboard.tsx`) -- Figma alignment spec §7.
//
// OJO -- NO confundir con `utils/hatoAlertas.ts` (S6): ese es el motor REAL
// de la cola Telegram (generarAlertasPendientes / escalamiento / reenvío,
// alimenta `AlertasView.tsx` vía `useHatoAlertas`). ESTE archivo solo
// deriva/colorea señales client-side para el panel de vistazo del Dashboard
// a partir de lo que `derivarEstadoReproductivo` (calculosHato.ts) ya
// decidió vía `useHatoAnimales` -- no calcula ningún umbral nuevo, no toca
// `hato_alertas`, no sabe de estados de entrega. Es un resumen derivado,
// no la cola gestionada. (Follow-up razonable: unificar el panel del
// Dashboard para que lea las alertas reales de S6 en vez de derivarlas.)

import type { LucideIcon } from 'lucide-react';
import { Droplet, Baby, Stethoscope, Syringe } from 'lucide-react';
import type { AnimalHatoDerivado } from '@/components/hato/hooks/useHatoAnimales';
import type { HatoConfig } from '@/utils/calculosHato';
import {
  chipEstadoReproductivo,
  chipVaciaEsProblema,
  chipDiasRestantes,
  chipVencimiento,
  type ChipEstilo,
} from '@/utils/hatoUi';
import { diferenciaEnDias } from '@/utils/fechas';

export type TipoAlertaTablero = 'secado' | 'parto' | 'rechequeo' | 'servir';

export interface AlertaTableroFila {
  tipo: TipoAlertaTablero;
  animal: AnimalHatoDerivado;
}

export interface AlertasTableroDerivadas {
  /** `fecha_secar` YA PASÓ (`derivado.alertas.secado_due`) -- exige acción
   * HOY. Separado de `proximasASecar` en la Fase 0a del motor de acciones
   * (docs/brief_tecnico_motor_acciones.md §3.3/§10 0a): antes de esta fase
   * `derivarAlertasTablero` mezclaba ambas señales en una sola lista
   * (`estado === 'proxima_a_secar' || secado_due`), lo que hacía imposible
   * que el motor dijera "N vacas con secado vencido" sin contar también las
   * que solo están dentro de la ventana de aviso. Disjunto de
   * `proximasASecar` por construcción. */
  secadoVencido: AnimalHatoDerivado[];
  /** Dentro de la ventana de aviso (`estado === 'proxima_a_secar'`) pero
   * TODAVÍA NO vencida -- planificación, no acción inmediata. Disjunto de
   * `secadoVencido` (ver arriba): ambos filtros parten de mutuamente
   * excluyentes sobre `alertas.secado_due`. */
  proximasASecar: AnimalHatoDerivado[];
  proximasAParir: AnimalHatoDerivado[];
  rechequeoPendiente: AnimalHatoDerivado[];
  vaciasPorServir: AnimalHatoDerivado[];
  /** Las 5 listas anteriores aplanadas en el orden secado (vencido primero,
   * luego próximo)→parto→rechequeo→servir -- el orden del tablero del
   * Dashboard. `secadoVencido` y `proximasASecar` comparten el `tipo`
   * `'secado'`: la distinción vive en el dato (`AlertasTableroDerivadas`),
   * no en el aplanado visual del panel -- el pill (`chipDiasRestantes`/
   * `chipVencimiento`) ya distingue "Vencido" de "Faltan N días" por
   * animal. */
  filas: AlertaTableroFila[];
}

/** Metadatos visuales/textuales por tipo de alerta del tablero -- ícono,
 * tinte del badge circular y mensaje corto (inline junto al nombre, p. ej.
 * "#47 Estrella — se debe secar"). */
export const ALERTA_META_TABLERO: Record<
  TipoAlertaTablero,
  { tipoLabel: string; mensaje: string; icon: LucideIcon; tono: string }
> = {
  secado: { tipoLabel: 'Secado', mensaje: 'se debe secar', icon: Droplet, tono: 'bg-amber-50 text-amber-700' },
  parto: { tipoLabel: 'Parto', mensaje: 'próxima a parir', icon: Baby, tono: 'bg-green-50 text-green-700' },
  rechequeo: { tipoLabel: 'Rechequeo', mensaje: 'rechequeo vencido', icon: Stethoscope, tono: 'bg-red-50 text-red-700' },
  servir: { tipoLabel: 'Servicio', mensaje: 'vacía, por servir', icon: Syringe, tono: 'bg-amber-50 text-amber-700' },
};

/** Un mismo helper de pill para las listas de acción del Dashboard Y su
 * tablero de alertas -- así nunca muestran una urgencia distinta para el
 * mismo animal/señal. "Secado" y "parto" tienen fecha objetivo real
 * (fecha_secar/fecha_probable_parto) -> `chipDiasRestantes`. "Rechequeo" no
 * tiene fecha de vencimiento en la vista, solo el último chequeo (pasado) --
 * el motor ya decidió que está vencido, así que se muestra `chipVencimiento`
 * con los días transcurridos. "Servir" no tiene ninguna fecha objetivo
 * honesta -- se usa la señal de negocio ya derivada (`vacia_es_problema`,
 * V14) en vez de inventar un umbral de días. */
export const PILL_ALERTA_TABLERO: Record<TipoAlertaTablero, (animal: AnimalHatoDerivado, hoy: string) => ChipEstilo> = {
  secado: (a, hoy) => (a.derivado.fecha_secar ? chipDiasRestantes(a.derivado.fecha_secar, hoy) : chipVencimiento(null)),
  parto: (a, hoy) =>
    a.derivado.fecha_probable_parto ? chipDiasRestantes(a.derivado.fecha_probable_parto, hoy) : chipVencimiento(null),
  rechequeo: (a, hoy) => chipVencimiento(a.ultimoChequeoFecha ? diferenciaEnDias(a.ultimoChequeoFecha, hoy) : null),
  servir: (a) =>
    a.derivado.vacia_es_problema !== null
      ? chipVaciaEsProblema(a.derivado.vacia_es_problema)!
      : chipEstadoReproductivo('vacia_por_servir'),
};

/** Identidad del animal en filas del tablero: lidera con el NOMBRE cuando la
 * chapeta es provisional (800-999, migración 066 -- spec §0c), y expone el
 * número como secundario para que el chip "provisional" tenga sentido. */
export function nombreAnimalTablero(a: AnimalHatoDerivado): { principal: string; secundario: string | null } {
  if (a.numeroEsProvisional || a.numero == null) {
    return { principal: a.nombre ?? 'Sin nombre', secundario: a.numero != null ? `#${a.numero}` : null };
  }
  return { principal: `#${a.numero}`, secundario: a.nombre };
}

/** Deriva las 5 señales de alerta del hato activo a partir de los animales
 * YA resueltos por `useHatoAnimales`. "Vacías por servir" se calcula SOLO
 * sobre el hato en ordeño (`categoria === 'hato'`), igual que el resto de
 * las listas de acción de la Épica E1.
 *
 * `secadoVencido`/`proximasASecar` se calculan por separado (Fase 0a) a
 * partir de la MISMA fuente que antes las mezclaba: `secado_due` es
 * mutuamente excluyente de "`proxima_a_secar` sin vencer" porque un animal
 * solo puede tener un `derivado.estado`, y `secado_due` (en
 * `calculosHato.ts::derivarEstadoReproductivo`) solo es `true` cuando ese
 * estado YA es `'proxima_a_secar'` -- así que filtrar el mismo conjunto por
 * `secado_due` primero y por su negación después no puede solapar ni dejar
 * huecos frente al filtro combinado que existía antes. */
export function derivarAlertasTablero(animales: AnimalHatoDerivado[]): AlertasTableroDerivadas {
  const enOrdeno = animales.filter((a) => a.categoria === 'hato');
  const secadoVencido = animales.filter((a) => a.derivado.alertas.secado_due);
  const proximasASecar = animales.filter(
    (a) => a.derivado.estado === 'proxima_a_secar' && !a.derivado.alertas.secado_due,
  );
  const proximasAParir = animales.filter((a) => a.derivado.alertas.parto_proximo);
  const rechequeoPendiente = animales.filter((a) => a.derivado.alertas.rechequeo_due);
  const vaciasPorServir = enOrdeno.filter((a) => a.derivado.estado === 'vacia_por_servir');

  const filas: AlertaTableroFila[] = [];
  for (const animal of secadoVencido) filas.push({ tipo: 'secado', animal });
  for (const animal of proximasASecar) filas.push({ tipo: 'secado', animal });
  for (const animal of proximasAParir) filas.push({ tipo: 'parto', animal });
  for (const animal of rechequeoPendiente) filas.push({ tipo: 'rechequeo', animal });
  for (const animal of vaciasPorServir) filas.push({ tipo: 'servir', animal });

  return { secadoVencido, proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filas };
}

/** Vacas ACTIVAS cuyo último parto conocido lleva `dias_espera_voluntaria_
 * post_parto` días o más (90 desde la migración 084) sin un nuevo servicio
 * ni preñez confirmada -- las dos únicas `EstadoReproductivo` "efectivamente
 * vacía" que el motor reconoce (V14, `calculosHato.ts`): `parida_reciente`
 * (parió y sigue sin servir) y `vacia_por_servir` (p. ej. tras un aborto).
 * Un animal `servida`/`preñada`/`proxima_a_secar`/`seca` NUNCA entra aquí
 * aunque su último parto sea viejo -- ya hay progreso reproductivo desde
 * entonces, así que ya no es "vacía".
 *
 * Regla dura (sin dato = sin dato, nunca se infiere): un animal SIN
 * `ultimoPartoFecha` no entra.
 *
 * Prerrequisito bloqueante de la Fase 1 del motor de acciones recomendadas
 * (docs/brief_tecnico_motor_acciones.md §3.3, hecho `hato.vacias_90d`):
 * el resultado es disjunto de `secadoVencido`/`proximasASecar` por
 * construcción -- ningún animal puede tener a la vez
 * `estado === 'proxima_a_secar'` y `estado === 'parida_reciente' |
 * 'vacia_por_servir'`, son ramas mutuamente excluyentes de
 * `derivarEstadoReproductivo`. */
export function vaciasMasDeNDias(
  animales: AnimalHatoDerivado[],
  config: Pick<HatoConfig, 'dias_espera_voluntaria_post_parto'>,
  hoy: string,
): AnimalHatoDerivado[] {
  return animales.filter((a) => {
    if (a.estadoAnimal !== 'activa') return false;
    if (a.derivado.estado !== 'parida_reciente' && a.derivado.estado !== 'vacia_por_servir') return false;
    if (!a.ultimoPartoFecha) return false;
    return diferenciaEnDias(a.ultimoPartoFecha, hoy) >= config.dias_espera_voluntaria_post_parto;
  });
}
