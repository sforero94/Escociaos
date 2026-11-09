// Esco SQL — dinero en el texto de la respuesta, en formato colombiano abreviado (F1).
//
// El prompt le pide al modelo `$95M`, pero el modelo escribe pesos completos ($95.343.110) con
// frecuencia (evaluación en producción 2026-11-09: 6 de 26 respuestas). Una regla de prompt no es
// una garantía, así que la respuesta pasa por este formateador determinista antes de salir. Usa la
// MISMA regla de dinero de Esco que el resto de la aplicación (`dineroMensaje`): bajo $1M, pesos
// enteros; de $1M a $100M, un decimal; desde $100M, millones enteros; y si la abreviatura redondea,
// va con «aprox.» para que nadie la lea como la cifra exacta (la exacta queda en «Consultas usadas»).
//
// Solo toca importes con el signo `$`. Lo que ya viene abreviado ($95M, $2.000M) o es menor de
// $1M se deja tal cual. Una cantidad sin `$` (kilos, litros, jornales) jamás se toca.

import { dineroMensaje } from '../esco2/formatoMensaje.ts';

/**
 * `-?$` + número en formato es-CO: con puntos de miles (1.234.567), con coma decimal opcional, o
 * solo dígitos. Se exige que NO siga una abreviatura (M/K) ni otro dígito: `$95M`, `$50,4M` y
 * `$2.000M` ya están en el formato final.
 */
const IMPORTE = /(-?)\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?![\d.,]*\d)(?!\s?(?:M|K|mil\b|millones\b))(\s?COP\b)?/g;

export function abreviarDineroEnTexto(texto: string): string {
  return texto.replace(IMPORTE, (completo, signo: string, entero: string, decimales: string | undefined) => {
    const valor = Number(`${entero.replace(/\./g, '')}${decimales ? `.${decimales}` : ''}`);
    if (!Number.isFinite(valor)) return completo;
    // Bajo $1M ya está en el formato final; solo se quita el sufijo COP y los decimales no se tocan.
    if (valor < 1_000_000) return completo.replace(/\s?COP\b/, '');
    return dineroMensaje(signo ? -valor : valor);
  });
}
