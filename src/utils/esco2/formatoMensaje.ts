import { formatNumber } from '../formatPuro.ts';
/** Preserve the same unrounded numeric Spanish used by P2 factual messages. */
export function numeroMensaje(n: number): string {
  const decimals = Math.max(0, (String(n).split('.')[1]?.split('e')[0].length ?? 0) - Number(String(n).split('e')[1] ?? 0));
  return decimals > 20 ? String(n).replace('.', ',') : formatNumber(n, decimals);
}
