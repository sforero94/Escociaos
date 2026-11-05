import { formatNumber } from '../formatPuro.ts';
/** Preserve the same unrounded numeric Spanish used by P2 factual messages. */
export function numeroMensaje(n: number): string {
  const decimals = Math.max(0, (String(n).split('.')[1]?.split('e')[0].length ?? 0) - Number(String(n).split('e')[1] ?? 0));
  return decimals > 20 ? String(n).replace('.', ',') : formatNumber(n, decimals);
}
/** Owner's Esco money rule: whole amounts below 1M, one decimal in [1M,100M), whole
 * millions from 100M. Colombian separators (dot thousands, comma decimal), the same as
 * quantities, so one message never mixes two conventions. Bands use the original absolute
 * amount: rounding across a boundary never changes notation. */
export function dineroMensaje(n: number): string {
  const abs = Math.abs(n);
  const divisor = abs < 1000000 ? 1 : 1000000;
  const decimales = abs >= 1000000 && abs < 100000000 ? 1 : 0;
  const exacto = abs % (divisor / (decimales ? 10 : 1)) === 0;
  const cifra = new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(abs / divisor);
  return `${exacto ? '' : 'aprox. '}${n < 0 ? '-' : ''}$${cifra}${divisor === 1000000 ? 'M' : ''}`;
}
