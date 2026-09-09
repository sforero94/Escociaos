// Peso y destare de una venta de ganado de ceba (issue #215).
// Puro: sin Supabase. kilos_pagados de la fila financiera ES el neto.

import {
  validarRepartoConfirmacion,
  type RepartoFila,
} from '@/utils/calculosGanado';

/** Chips de destare kg/cabeza. Ninguno es default: el usuario elige o deja vacío. */
export const DESTARE_CHIPS_KG_CABEZA = [10, 15] as const;

export function calcularDestareTotalKg(
  destareKgCabeza: number,
  cantidadCabezas: number
): number {
  return destareKgCabeza * cantidadCabezas;
}

/** kilos_pagados: peso de báscula menos destare total. */
export function calcularPesoNetoKg(pesoTotalKg: number, destareTotalKg: number): number {
  return pesoTotalKg - destareTotalKg;
}

/** Valor financiero por defecto: neto × precio. El formulario puede sobreescribirlo. */
export function calcularValorVentaDesdeNeto(pesoNetoKg: number, precioKilo: number): number {
  return Math.round(pesoNetoKg * precioKilo);
}

export interface EntradaPesosVentaGanado {
  pesoTotalKg: number | null;
  destareKgCabeza: number | null;
  cantidadCabezas: number;
  precioKilo: number | null;
}

export interface ResultadoPesosVentaGanado {
  destareTotalKg: number | null;
  pesoNetoKg: number | null;
  valorCalculado: number | null;
}

/**
 * Destare vacío = 0 kg de merma (no se inventa 10 ni 15).
 * Sin peso total no hay neto ni valor calculado.
 */
export function calcularPesosVentaGanado(
  entrada: EntradaPesosVentaGanado
): ResultadoPesosVentaGanado {
  const { pesoTotalKg, destareKgCabeza, cantidadCabezas, precioKilo } = entrada;
  const destareTotalKg =
    destareKgCabeza == null || !Number.isFinite(destareKgCabeza)
      ? pesoTotalKg == null
        ? null
        : 0
      : calcularDestareTotalKg(destareKgCabeza, cantidadCabezas);
  const pesoNetoKg =
    pesoTotalKg == null || destareTotalKg == null
      ? null
      : calcularPesoNetoKg(pesoTotalKg, destareTotalKg);
  const valorCalculado =
    pesoNetoKg == null || precioKilo == null || !Number.isFinite(precioKilo)
      ? null
      : calcularValorVentaDesdeNeto(pesoNetoKg, precioKilo);
  return { destareTotalKg, pesoNetoKg, valorCalculado };
}

/**
 * Destare inválido: negativo, o merma mayor que el peso de báscula.
 * Destare vacío es válido.
 */
export function errorDestareVenta(entrada: EntradaPesosVentaGanado): string | null {
  const { pesoTotalKg, destareKgCabeza, cantidadCabezas } = entrada;
  if (pesoTotalKg != null && (!Number.isFinite(pesoTotalKg) || pesoTotalKg < 0)) {
    return 'El peso total no puede ser negativo';
  }
  if (destareKgCabeza == null) return null;
  if (!Number.isFinite(destareKgCabeza) || destareKgCabeza < 0) {
    return 'El destare por cabeza no puede ser negativo';
  }
  if (pesoTotalKg == null) {
    return 'Indica el peso total de báscula para aplicar destare';
  }
  const destareTotal = calcularDestareTotalKg(destareKgCabeza, cantidadCabezas);
  if (destareTotal > pesoTotalKg) {
    return 'El destare no puede superar el peso total';
  }
  return null;
}

export interface EntradaPotreroOrigenVenta {
  tipo: 'compra' | 'venta';
  esHato: boolean;
  esEdicion: boolean;
  filas: RepartoFila[];
  cantidadCabezas: number;
}

/**
 * Una venta de ceba nueva no se guarda sin potrero de origen.
 * Compra, edición y venta del hato lechero no usan esta guarda
 * (compras siguen el pendiente; el hato no toca gan_inventario).
 */
export function errorPotreroOrigenVenta(entrada: EntradaPotreroOrigenVenta): string | null {
  if (entrada.tipo !== 'venta' || entrada.esHato || entrada.esEdicion) return null;
  const hayPotrero = entrada.filas.some((f) => Boolean(f.potrero_id));
  if (!hayPotrero) {
    return 'El potrero de origen es requerido para una venta';
  }
  return validarRepartoConfirmacion(entrada.filas, entrada.cantidadCabezas);
}
