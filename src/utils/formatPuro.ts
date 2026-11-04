// Shared pure formatting for browser and Deno callers. Defaults preserve the existing UI.
/**
 * Utilidades de formato para el Dashboard de Escocia Hass
 *
 * Este archivo contiene funciones para formatear:
 * - Moneda (COP)
 * - Números con separador de miles
 * - Pesos (kg/toneladas)
 * - Tiempo relativo
 */
/**
 * Formatea un número como moneda colombiana.
 *
 * No anexa "COP": la moneda es implícita en la UI (regla de CLAUDE.md).
 *
 * @example
 * formatCurrency(4250000) // "$4.250.000"
 * formatCurrency(1500000) // "$1.500.000"
 * formatCurrency(0) // "$0"
 */
export function formatCurrency(value: number): string {
    const formatted = new Intl.NumberFormat('es-CO', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
    return `$${formatted}`;
}
/**
 * Formatea un número con separador de miles
 *
 * @param value - Valor numérico a formatear
 * @param decimals - Número de decimales (opcional, default: 0)
 * @returns String formateado como "X,XXX,XXX"
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234.567, 2) // "1,234.57"
 * formatNumber(100) // "100"
 */
export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}
/**
 * `true` si `value` es un string de fecha SIN hora, `YYYY-MM-DD` -- el
 * único shape para el que `new Date(string)` se interpreta como UTC
 * medianoche y por tanto puede desplazarse un día al renderizarse en la
 * zona horaria de Bogotá (UTC-5). Un ISO con hora (`...T...`) no matchea
 * esta regex y sigue el camino normal, sin cambios de comportamiento.
 */
function esFechaSolaISO(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
/**
 * Parsea `date` preservando el día calendario cuando es un string
 * `YYYY-MM-DD` puro, construyendo la fecha en hora LOCAL en vez de UTC.
 *
 * Bug repo-wide (docs/hato/qa-produccion-rework.md, FIX 1): `new
 * Date('2026-07-22')` es UTC medianoche; en Bogotá (UTC-5) eso renderiza
 * como "21 de julio" -- un día antes, y en frontera de año/mes puede
 * incluso mover el año (`'2026-01-01'` -> "31 de diciembre de 2025").
 * Cualquier otro shape (objeto `Date` ya construido, o un string con hora)
 * sigue exactamente el mismo camino que antes -- NO se le agrega
 * `timeZone: 'UTC'` al `Intl` que consume el resultado, eso cambiaría
 * también cómo se renderizan timestamps reales, que hoy son correctos.
 */
export function parsearFecha(date: Date | string): Date {
    if (typeof date === 'string' && esFechaSolaISO(date)) {
        const [anio, mes, dia] = date.split('-').map(Number);
        return new Date(anio, mes - 1, dia);
    }
    return typeof date === 'string' ? new Date(date) : date;
}
/**
 * Formatea una fecha completa en español
 *
 * @param date - Fecha a formatear
 * @returns String formateado como "DD de MMMM de YYYY"
 *
 * @example
 * formatLongDate(new Date('2024-01-15')) // "15 de enero de 2024"
 */
export function formatLongDate(date: Date | string, opciones: {
    timeZone?: string;
} = {}): string {
    const d = opciones.timeZone && typeof date === 'string' && esFechaSolaISO(date) ? new Date(`${date}T12:00:00Z`) : parsearFecha(date);
    return new Intl.DateTimeFormat('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        ...opciones,
    }).format(d);
}
/**
 * Formatea dinero abreviado a millones con coma decimal COLOMBIANA -- lo que
 * pide CLAUDE.md ("$95M", "usa formato 2.000M — nunca billones") y lo que
 * pide el diseño del bloque "Dinero" del Centro de Control
 * (`docs/plan_dashboard_centro_control.md` §9.1: "$66,5M").
 *
 * `formatCompact` NO sirve para esto: usa `.toFixed(1)`, que produce coma
 * inglesa ("66.5M"), no colombiana ("66,5M") -- el bug que este formateador
 * existe para evitar. Siempre un decimal por debajo de 1.000M (nunca se
 * redondea "$0,5M" a "$1M"); por encima, sin decimales y con separador de
 * miles con punto, para no cruzar nunca a la escala de "billones" (Colombia
 * no la usa).
 *
 * @example
 * formatMillonesCOP(66_529_769) // "$66,5M"
 * formatMillonesCOP(2_000_000_000) // "$2.000M"
 */
export function formatMillonesCOP(value: number, decimales?: number): string {
    const millones = value / 1000000;
    const abs = Math.abs(millones);
    const formatted = decimales !== undefined ? new Intl.NumberFormat('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(millones) : abs >= 1000
        ? new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(millones)
        : new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(millones);
    return `$${formatted}M`;
}
