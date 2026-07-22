// Construcción de los períodos (columnas) del P&G. Lógica pura, sin Supabase.
//
// Dos ejes:
//   • trimestres — acumulados: Q1 ⊂ Q1–Q2 ⊂ Q1–Q3 ⊂ Año
//   • cosecha    — solo aguacate: Principal / Traviesa, con los egresos
//                  asignados por semestre (regla aprobada por el dueño)
//
// Todas las fechas son strings 'YYYY-MM-DD' y se comparan/cortan como texto.
// NUNCA `new Date(fecha).getMonth()`: `fechas.ts` parsea en hora local y una
// fecha de fin de mes puede correrse un día según la zona horaria del cliente.

import type { PeriodoDef, ModoReporte } from '@/types/reportesFinancieros';

/**
 * Desfase de año entre una cosecha Principal y el semestre de egresos que
 * carga. `Principal 2026` se vende entre nov-2025 y abr-2026 (migración 043),
 * así que el semestre en que se trabajó esa fruta es jul–dic de 2025.
 *
 * Decisión del dueño (2026-07-21): el semestre INMEDIATAMENTE ANTERIOR a la
 * venta. Con esta regla cada semestre de gastos se usa en exactamente una
 * cosecha, sin huecos ni repeticiones.
 *
 * Cambiar este valor a 0 mueve la asignación al mismo año calendario.
 */
export const DESFASE_ANIO_PRINCIPAL = -1;

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Mes 1–12 de una fecha 'YYYY-MM-DD', por corte de string. */
export function mesDeFecha(fecha: string): number {
  return parseInt(fecha.substring(5, 7), 10);
}

/** Año de una fecha 'YYYY-MM-DD', por corte de string. */
export function anioDeFecha(fecha: string): number {
  return parseInt(fecha.substring(0, 4), 10);
}

/**
 * ¿La fecha cae dentro del rango, inclusive en ambos extremos?
 * Las fechas ISO se comparan lexicográficamente sin ambigüedad.
 */
export function fechaEnRango(fecha: string, desde: string, hasta: string): boolean {
  return fecha >= desde && fecha <= hasta;
}

/** Último día del mes, como string de dos dígitos. Solo se usan meses de fin de trimestre. */
function ultimoDia(anio: number, mes: number): string {
  const dias = new Date(anio, mes, 0).getDate();
  return String(dias).padStart(2, '0');
}

function rangoAcumulado(anio: number, mesFinal: number) {
  const mm = String(mesFinal).padStart(2, '0');
  return {
    desde: `${anio}-01-01`,
    hasta: `${anio}-${mm}-${ultimoDia(anio, mesFinal)}`,
  };
}

/**
 * Trimestres acumulados del año: Q1, Q1–Q2, Q1–Q3, Año.
 * Cada columna arranca siempre el 1 de enero — son acumulados, no trimestres
 * sueltos, que es como el dueño lee el resultado del negocio.
 */
export function periodosTrimestrales(anio: number): PeriodoDef[] {
  const defs: { key: string; label: string; mesFinal: number }[] = [
    { key: 'Q1', label: 'Q1', mesFinal: 3 },
    { key: 'Q1-Q2', label: 'Q1–Q2', mesFinal: 6 },
    { key: 'Q1-Q3', label: 'Q1–Q3', mesFinal: 9 },
    { key: 'ANIO', label: `Año ${anio}`, mesFinal: 12 },
  ];

  return defs.map(({ key, label, mesFinal }) => {
    const rango = rangoAcumulado(anio, mesFinal);
    return {
      key,
      label,
      egresos: rango,
      ingresos: { modo: 'fecha', desde: rango.desde, hasta: rango.hasta },
      descripcion: `Acumulado de enero a ${MESES_CORTOS[mesFinal - 1].toLowerCase()} de ${anio}`,
    };
  });
}

/**
 * Períodos por cosecha (solo aguacate), en orden cronológico de venta.
 *
 *   Principal N — se vende nov (N−1) → abr (N); carga egresos de jul–dic (N−1)
 *   Traviesa  N — se vende may → oct (N);       carga egresos de ene–jun (N)
 *
 * Los ingresos se seleccionan por la etiqueta `fin_ingresos.cosecha`, no por
 * fecha: la etiqueta es la que ya calcula `fn_cosecha_aguacate()` en la base.
 */
export function periodosCosecha(anio: number): PeriodoDef[] {
  const anioPrincipal = anio + DESFASE_ANIO_PRINCIPAL;

  return [
    {
      key: `Principal ${anio}`,
      label: `Principal ${anio}`,
      egresos: { desde: `${anioPrincipal}-07-01`, hasta: `${anioPrincipal}-12-31` },
      ingresos: { modo: 'cosecha', etiqueta: `Principal ${anio}` },
      descripcion: `Ventas etiquetadas «Principal ${anio}» · egresos de jul–dic ${anioPrincipal}`,
    },
    {
      key: `Traviesa ${anio}`,
      label: `Traviesa ${anio}`,
      egresos: { desde: `${anio}-01-01`, hasta: `${anio}-06-30` },
      ingresos: { modo: 'cosecha', etiqueta: `Traviesa ${anio}` },
      descripcion: `Ventas etiquetadas «Traviesa ${anio}» · egresos de ene–jun ${anio}`,
    },
  ];
}

export function construirPeriodos(anio: number, modo: ModoReporte): PeriodoDef[] {
  return modo === 'cosecha' ? periodosCosecha(anio) : periodosTrimestrales(anio);
}

/**
 * Rango de fechas de gastos que hay que traer de la base para poder construir
 * estos períodos. En modo cosecha se extiende al año anterior.
 */
export function rangoDeCarga(periodos: PeriodoDef[]): { desde: string; hasta: string } {
  const desde = periodos.reduce((min, p) => (p.egresos.desde < min ? p.egresos.desde : min), periodos[0].egresos.desde);
  const hasta = periodos.reduce((max, p) => (p.egresos.hasta > max ? p.egresos.hasta : max), periodos[0].egresos.hasta);
  return { desde, hasta };
}

export const MESES_LABEL = MESES_CORTOS;
