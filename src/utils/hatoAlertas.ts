// ARCHIVO: utils/hatoAlertas.ts
// DESCRIPCIÓN: Derivación COMPARTIDA de las 4 señales de alerta del hato
// (secado, parto, rechequeo, vacía por servir) -- Figma alignment spec
// Wave 2b, §7. El "Tablero de alertas" del Dashboard (`HatoDashboard.tsx`)
// y la Cola de alertas (`AlertasView.tsx`) consumen ESTA MISMA función +
// estos mismos helpers de metadatos/pill para que nunca puedan mostrar una
// urgencia distinta para el mismo animal/señal (refactor DRY pedido por el
// brief). Todo sigue derivado por `derivarEstadoReproductivo`
// (calculosHato.ts) vía `useHatoAnimales` -- este archivo no calcula NINGÚN
// umbral de negocio nuevo, solo particiona y colorea lo que el motor ya
// decidió (mismo contrato que hatoUi.ts).
//
// Esto NO es la cola Telegram de S6 (Enviada/Confirmada/Escalada, backend
// no construido todavía): solo se deriva/colorea la urgencia (hoy/vencido/
// N d), nunca un estado de entrega inventado -- ver el banner en
// `AlertasView.tsx`.

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

export type TipoAlertaHato = 'secado' | 'parto' | 'rechequeo' | 'servir';

export interface AlertaHatoFila {
  tipo: TipoAlertaHato;
  animal: AnimalHatoDerivado;
}

export interface AlertasHatoDerivadas {
  proximasASecar: AnimalHatoDerivado[];
  proximasAParir: AnimalHatoDerivado[];
  rechequeoPendiente: AnimalHatoDerivado[];
  vaciasPorServir: AnimalHatoDerivado[];
  /** Las 4 listas anteriores aplanadas en el orden secado→parto→rechequeo→
   * servir -- el orden que ya usaban el tablero del Dashboard y que replica
   * la Cola de alertas. */
  filas: AlertaHatoFila[];
}

/** Metadatos visuales/textuales por tipo de alerta -- ícono, tinte del
 * badge circular, mensaje corto (usado inline junto al nombre del animal,
 * p. ej. "#47 Estrella — se debe secar") y `tipoLabel` (columna "Tipo" de
 * la Cola de alertas). Compartido para que el Dashboard y la Cola de
 * alertas nunca diverjan en cómo se ve la misma señal. */
export const ALERTA_META: Record<
  TipoAlertaHato,
  { tipoLabel: string; mensaje: string; icon: LucideIcon; tono: string }
> = {
  secado: { tipoLabel: 'Secado', mensaje: 'se debe secar', icon: Droplet, tono: 'bg-amber-50 text-amber-700' },
  parto: { tipoLabel: 'Parto', mensaje: 'próxima a parir', icon: Baby, tono: 'bg-green-50 text-green-700' },
  rechequeo: { tipoLabel: 'Rechequeo', mensaje: 'rechequeo vencido', icon: Stethoscope, tono: 'bg-red-50 text-red-700' },
  servir: { tipoLabel: 'Servicio', mensaje: 'vacía, por servir', icon: Syringe, tono: 'bg-amber-50 text-amber-700' },
};

/** Un mismo helper de pill para las listas de acción del Dashboard, su
 * tablero de alertas Y la Cola de alertas -- así nunca pueden mostrar una
 * urgencia distinta para el mismo animal/señal. "Secado" y "parto" tienen
 * fecha objetivo real (fecha_secar/fecha_probable_parto) -> `chipDiasRestantes`.
 * "Rechequeo" no tiene fecha de vencimiento en la vista, solo el último
 * chequeo (pasado) -- el motor ya decidió que está vencido, así que se
 * muestra `chipVencimiento` con los días transcurridos como dato
 * informativo. "Servir" no tiene ninguna fecha objetivo honesta -- se usa
 * la señal de negocio ya derivada (`vacia_es_problema`, V14) en vez de
 * inventar un umbral de días. */
export const PILL_ALERTA: Record<TipoAlertaHato, (animal: AnimalHatoDerivado, hoy: string) => ChipEstilo> = {
  secado: (a, hoy) => (a.derivado.fecha_secar ? chipDiasRestantes(a.derivado.fecha_secar, hoy) : chipVencimiento(null)),
  parto: (a, hoy) =>
    a.derivado.fecha_probable_parto ? chipDiasRestantes(a.derivado.fecha_probable_parto, hoy) : chipVencimiento(null),
  rechequeo: (a, hoy) => chipVencimiento(a.ultimoChequeoFecha ? diferenciaEnDias(a.ultimoChequeoFecha, hoy) : null),
  servir: (a) =>
    a.derivado.vacia_es_problema !== null
      ? chipVaciaEsProblema(a.derivado.vacia_es_problema)!
      : chipEstadoReproductivo('vacia_por_servir'),
};

/** Identidad del animal en filas de lista/alerta: lidera con el NOMBRE
 * cuando la chapeta es provisional (800-999, migración 066 -- spec §0c),
 * y siempre expone el número/caravana como secundario para que el chip
 * "provisional" (`chipNumeroProvisional`) tenga sentido junto a él. */
export function nombreAnimalAlerta(a: AnimalHatoDerivado): { principal: string; secundario: string | null } {
  if (a.numeroEsProvisional || a.numero == null) {
    return { principal: a.nombre ?? 'Sin nombre', secundario: a.numero != null ? `#${a.numero}` : null };
  }
  return { principal: `#${a.numero}`, secundario: a.nombre };
}

/** Fecha ancla honesta para la columna "Señal / fecha" de la Cola de
 * alertas -- SOLO cuando el motor ya calculó una fecha real para esa
 * señal (mismas fechas que alimentan `PILL_ALERTA`). "Servir" no tiene
 * ninguna fecha objetivo honesta (ver el comentario de `PILL_ALERTA.servir`
 * arriba), así que devuelve `null` -- la vista debe mostrar solo el
 * mensaje, nunca una fecha inventada. */
export function fechaSenalAlerta(fila: AlertaHatoFila): string | null {
  switch (fila.tipo) {
    case 'secado':
      return fila.animal.derivado.fecha_secar;
    case 'parto':
      return fila.animal.derivado.fecha_probable_parto;
    case 'rechequeo':
      return fila.animal.ultimoChequeoFecha;
    case 'servir':
      return null;
    default: {
      const _exhaustivo: never = fila.tipo;
      return _exhaustivo;
    }
  }
}

/** Deriva las 4 señales de alerta del hato activo a partir de los animales
 * YA resueltos por `useHatoAnimales` (motor puro `derivarEstadoReproductivo`
 * ya corrido) -- única fuente para el Dashboard y la Cola de alertas.
 * "Vacías por servir" se calcula SOLO sobre el hato en ordeño
 * (`categoria === 'hato'`), igual que el resto de las listas de acción de
 * la Épica E1. */
export function derivarAlertasHato(animales: AnimalHatoDerivado[]): AlertasHatoDerivadas {
  const enOrdeno = animales.filter((a) => a.categoria === 'hato');
  const proximasASecar = animales.filter((a) => a.derivado.alertas.secado_due || a.derivado.estado === 'proxima_a_secar');
  const proximasAParir = animales.filter((a) => a.derivado.alertas.parto_proximo);
  const rechequeoPendiente = animales.filter((a) => a.derivado.alertas.rechequeo_due);
  const vaciasPorServir = enOrdeno.filter((a) => a.derivado.estado === 'vacia_por_servir');

  const filas: AlertaHatoFila[] = [];
  for (const animal of proximasASecar) filas.push({ tipo: 'secado', animal });
  for (const animal of proximasAParir) filas.push({ tipo: 'parto', animal });
  for (const animal of rechequeoPendiente) filas.push({ tipo: 'rechequeo', animal });
  for (const animal of vaciasPorServir) filas.push({ tipo: 'servir', animal });

  return { proximasASecar, proximasAParir, rechequeoPendiente, vaciasPorServir, filas };
}
