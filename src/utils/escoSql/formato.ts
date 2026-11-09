// Contrato de presentación común para web y Telegram. Las cifras crudas quedan en el bloque.
import { formatCurrency, formatLongDate, formatNumber } from '../formatPuro.ts';

export const FORMATOS = ['moneda', 'numero', 'porcentaje', 'kg', 'litros', 'mm', 'fecha', 'texto'] as const;
export type Formato = typeof FORMATOS[number];
export type Valor = number | string | boolean | null;

export function formatearValor(valor: Valor, formato: Formato): string {
  if (valor === null) return 'Sin dato';
  if (formato === 'texto') return String(valor);
  if (formato === 'fecha') {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return 'Sin dato';
    const [anio, mes, dia] = valor.split('-').map(Number);
    const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
    if (!Number.isFinite(fecha.getTime()) || fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return 'Sin dato';
    return formatLongDate(valor);
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'Sin dato';
  if (formato === 'moneda') {
    if (Math.abs(valor) < 1_000_000) return formatCurrency(valor);
    return `$${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(valor / 1_000_000)}M`;
  }
  const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
  if (formato === 'numero') return numero;
  if (formato === 'porcentaje') return `${numero} %`;
  return `${formatNumber(valor, 1)} ${formato}`;
}
