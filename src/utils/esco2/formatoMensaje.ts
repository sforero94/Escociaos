import { formatCurrency, formatMillonesCOP, formatNumber } from '../formatPuro.ts';
/** Preserve the same unrounded numeric Spanish used by P2 factual messages. */
export function numeroMensaje(n: number): string {
  const decimals = Math.max(0, (String(n).split('.')[1]?.split('e')[0].length ?? 0) - Number(String(n).split('e')[1] ?? 0));
  return decimals > 20 ? String(n).replace('.', ',') : formatNumber(n, decimals);
}
// Under $10M a whole-million figure can be off by up to 40 %, so one decimal is kept there
// ("aprox. $1,4M"). From $10M up, whole millions. Any rounding is labeled "aprox.".
/** Esco money in Colombian format: no decimals, no COP suffix, millions abbreviated. */
export function dineroMensaje(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000000)
    return `${Number.isInteger(n) ? '' : 'aprox. '}${formatCurrency(n)}`;
  const decimales = n % 1000000 !== 0 && Math.round(abs / 100000) < 100 ? 1 : 0;
  const exacto = n % (decimales ? 100000 : 1000000) === 0;
  return `${exacto ? '' : 'aprox. '}${formatMillonesCOP(n, decimales)}`;
}
