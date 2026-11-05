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

/** D43 summary is unchanged. An approximation additionally carries the original numeric
 * value in pesos, with no rounding, so a reader can reconcile it with the source result. */
export function dineroConDetalleMensaje(n: number): string {
  if (!Number.isFinite(n)) throw new Error('dinero_no_finito');
  const resumen = dineroMensaje(n);
  if (!resumen.startsWith('aprox. ')) return resumen;
  // Expand the shortest round-trip decimal rather than rounding through Intl's digit cap.
  const [mantisa, exponente = '0'] = String(Math.abs(n)).split('e');
  const [entero, fraccion = ''] = mantisa.split('.');
  const digitos = entero + fraccion;
  const posicion = entero.length + Number(exponente);
  const decimal = posicion <= 0 ? `0.${'0'.repeat(-posicion)}${digitos}`
    : posicion >= digitos.length ? digitos + '0'.repeat(posicion - digitos.length)
    : `${digitos.slice(0, posicion)}.${digitos.slice(posicion)}`;
  const [pesos, decimales] = decimal.split('.');
  const exacto = `${n < 0 ? '-' : ''}$${pesos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${decimales ? `,${decimales}` : ''}`;
  return `${resumen} (valor exacto: ${exacto})`;
}
