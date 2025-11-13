/**
 * Utilidades para manejo de fechas en formato dd/mm/aaaa con horario local
 * Todo el proyecto debe usar estas funciones para consistencia
 */

/**
 * Formatea una fecha a dd/mm/aaaa
 * @param fecha - Date object, string ISO, o null
 * @returns String en formato dd/mm/aaaa o string vacío si es null
 */
export function formatearFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  
  // Obtener día, mes, año en hora local
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  
  return `${dia}/${mes}/${anio}`;
}

/**
 * Formatea una fecha a aaaa-mm-dd (para inputs tipo date)
 * @param fecha - Date object, string ISO, o null
 * @returns String en formato aaaa-mm-dd o string vacío
 */
export function formatearFechaInput(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  
  // Obtener día, mes, año en hora local
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  
  return `${anio}-${mes}-${dia}`;
}

/**
 * Convierte string dd/mm/aaaa a Date object en hora local
 * @param fechaStr - String en formato dd/mm/aaaa
 * @returns Date object o null si es inválido
 */
export function parsearFechaDDMMAAAA(fechaStr: string): Date | null {
  if (!fechaStr) return null;
  
  const partes = fechaStr.split('/');
  if (partes.length !== 3) return null;
  
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1; // Los meses en JS son 0-indexed
  const anio = parseInt(partes[2], 10);
  
  if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return null;
  
  // Crear fecha en hora local
  return new Date(anio, mes, dia);
}

/**
 * Convierte Date object a string ISO date (aaaa-mm-dd) para guardar en BD
 * Usa hora local para evitar cambios de fecha por timezone
 * @param fecha - Date object
 * @returns String ISO date (aaaa-mm-dd)
 */
export function fechaAISODate(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  
  return `${anio}-${mes}-${dia}`;
}

/**
 * Obtiene la fecha actual en hora local como string ISO date
 * @returns String en formato aaaa-mm-dd
 */
export function obtenerFechaHoy(): string {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, '0');
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const anio = hoy.getFullYear();
  
  return `${anio}-${mes}-${dia}`;
}

/**
 * Obtiene la fecha actual formateada en dd/mm/aaaa
 * @returns String en formato dd/mm/aaaa
 */
export function obtenerFechaHoyFormateada(): string {
  const hoy = new Date();
  return formatearFecha(hoy);
}

/**
 * Formatea una fecha con hora a dd/mm/aaaa HH:mm
 * @param fecha - Date object, string ISO, o null
 * @returns String en formato dd/mm/aaaa HH:mm
 */
export function formatearFechaHora(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
  
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  const horas = String(date.getHours()).padStart(2, '0');
  const minutos = String(date.getMinutes()).padStart(2, '0');
  
  return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
}

/**
 * Calcula diferencia en días entre dos fechas
 * @param fecha1 - Primera fecha
 * @param fecha2 - Segunda fecha
 * @returns Número de días de diferencia
 */
export function diferenciaEnDias(fecha1: Date | string, fecha2: Date | string): number {
  const d1 = typeof fecha1 === 'string' ? new Date(fecha1 + 'T00:00:00') : fecha1;
  const d2 = typeof fecha2 === 'string' ? new Date(fecha2 + 'T00:00:00') : fecha2;
  
  const diff = Math.abs(d1.getTime() - d2.getTime());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Valida si una fecha es válida
 * @param fecha - Date object o string
 * @returns true si es válida, false si no
 */
export function esFechaValida(fecha: Date | string | null | undefined): boolean {
  if (!fecha) return false;
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Calcula una fecha X días antes o después de hoy
 * @param dias - Número de días (positivo = futuro, negativo = pasado)
 * @returns String en formato aaaa-mm-dd
 */
export function obtenerFechaRelativa(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return fechaAISODate(fecha);
}

/**
 * Formatea fecha con nombre de mes completo
 * @param fecha - Date object, string ISO, o null
 * @returns String en formato "1 de enero de 2024"
 */
export function formatearFechaLarga(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  
  const dia = date.getDate();
  const mes = meses[date.getMonth()];
  const anio = date.getFullYear();
  
  return `${dia} de ${mes} de ${anio}`;
}

/**
 * Formatea fecha con nombre de mes corto
 * @param fecha - Date object, string ISO, o null
 * @returns String en formato "1 ene 2024"
 */
export function formatearFechaCorta(fecha: Date | string | null | undefined): string {
  if (!fecha) return '';
  
  const date = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  
  const mesesCortos = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
  ];
  
  const dia = date.getDate();
  const mes = mesesCortos[date.getMonth()];
  const anio = date.getFullYear();
  
  return `${dia} ${mes} ${anio}`;
}