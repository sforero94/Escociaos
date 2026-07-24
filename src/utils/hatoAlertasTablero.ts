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
  proximasASecar: AnimalHatoDerivado[];
  proximasAParir: AnimalHatoDerivado[];
  rechequeoPendiente: AnimalHatoDerivado[];
  vaciasPorServir: AnimalHatoDerivado[];
  /** Las 4 listas anteriores aplanadas en el orden secado→parto→rechequeo→
   * servir -- el orden del tablero del Dashboard. */
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

/** Deriva las 4 señales de alerta del hato activo a partir de los animales
 * YA resueltos por `useHatoAnimales`. "Vacías por servir" se calcula SOLO
 * sobre el hato en ordeño (`categoria === 'hato'`), igual que el resto de
 * las listas de acción de la Épica E1. */
export function derivarAlertasTablero(animales: AnimalHatoDerivado[]): AlertasTableroDerivadas {
  const enOrdeno = animales.filter((a) => a.categoria === 'hato');
  const proximasASecar = animales.filter((a) => a.derivado.alertas.secado_due || a.derivado.estado === 'proxima_a_secar');
  const proximasAParir = animales.filter((a) => a.derivado.alertas.parto_proximo);
  const rechequeoPendiente = animales.filter((a) => a.derivado.alertas.rechequeo_due);
  const vaciasPorServir = enOrdeno.filter((a) => a.derivado.estado === 'vacia_por_servir');

  const filas: AlertaTableroFila[] = [];
  for (const animal of proximasASecar) filas.push({ tipo: 'secado', animal });
  for (const animal of proximasAParir) filas.push({ tipo: 'parto', animal });
  for (const animal of rechequeoPendiente) filas.push({ tipo: 'rechequeo', animal });
  for (const animal of vaciasPorServir) filas.push({ tipo: 'servir', animal });

  return { proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filas };
}
