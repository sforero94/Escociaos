import { leerFilasFijas, type ClienteDatos } from './fuente.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { FuenteLeche, PesajeLeche, QuincenaLeche, IngresoLitros } from './lecheTipos.ts';
export const COLUMNAS_LECHE = {
  hato_pesajes_leche: 'id,animal_id,fecha,litros_total,litros_am,litros_pm,fuente',
  hato_produccion_quincenal: 'id,anio,mes,quincena,fecha_inicio,fecha_fin,origen_dato,litros_total,fin_ingreso_id,num_vacas_ordeno,num_vacas_ordeno_origen',
  fin_ingresos: 'id,cantidad',
} as const;
function ids(filas: { id: string }[]) {
  if (filas.some(f => !f || !esUuid(f.id)) || new Set(filas.map(f => f.id.toLowerCase())).size !== filas.length) throw Error('leche_identidad_no_leida');
}
const numero = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v);
export function validarPesajesLeche(filas: PesajeLeche[]) {
  ids(filas);
  if (filas.some(f => !esUuid(f.animal_id) || !esFechaCalendario(f.fecha) || ![f.litros_total, f.litros_am, f.litros_pm].every(numero) || f.fuente !== null && typeof f.fuente !== 'string') || new Set(filas.map(f => `${f.animal_id.toLowerCase()}|${f.fecha}`)).size !== filas.length) throw Error('pesajes_no_leidos');
}
export function validarQuincenasLeche(filas: QuincenaLeche[]) {
  ids(filas);
  if (filas.some(f => !Number.isSafeInteger(f.anio) || f.anio < 100 || f.anio > 9999 || !Number.isInteger(f.mes) || f.mes < 1 || f.mes > 12 || ![1, 2].includes(f.quincena) || [f.fecha_inicio, f.fecha_fin].some(fecha => fecha !== null && !esFechaCalendario(fecha)) || typeof f.origen_dato !== 'string' || ![f.litros_total, f.num_vacas_ordeno].every(numero) || f.fin_ingreso_id !== null && !esUuid(f.fin_ingreso_id) || f.num_vacas_ordeno_origen !== null && typeof f.num_vacas_ordeno_origen !== 'string') || new Set(filas.map(f => `${f.anio}|${f.mes}|${f.quincena}`)).size !== filas.length) throw Error('quincenas_no_leidas');
}
export function validarIngresosLitros(filas: IngresoLitros[]) {
  ids(filas); if (filas.some(f => !numero(f.cantidad))) throw Error('cantidad_no_leida');
}
const numericas = new Set(['anio', 'mes', 'quincena', 'litros_total', 'litros_am', 'litros_pm', 'num_vacas_ordeno', 'cantidad']);
function normalizar(f: Record<string, unknown>) {
  const salida = { ...f };
  for (const [k, v] of Object.entries(salida)) {
    if (numericas.has(k) && typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) salida[k] = Number(v);
    if (['id', 'animal_id', 'fin_ingreso_id'].includes(k) && esUuid(v)) salida[k] = v.toLowerCase();
  }
  return salida;
}
export function fuenteLecheSupabase(cliente: ClienteDatos, opciones: { tamanoPagina?: number } = {}): FuenteLeche {
  return {
    async leerPesajes(c) {
      const filas = (await leerFilasFijas(cliente, 'hato_pesajes_leche', COLUMNAS_LECHE.hato_pesajes_leche, q => q.gte('fecha', c.desde).lte('fecha', c.hasta), opciones.tamanoPagina)).map(normalizar) as unknown as PesajeLeche[];
      validarPesajesLeche(filas); return filas;
    },
    async leerQuincenas(c) {
      const filas = (await leerFilasFijas(cliente, 'hato_produccion_quincenal', COLUMNAS_LECHE.hato_produccion_quincenal, q => q.gte('anio', c.desde.slice(0, 4)).lte('anio', c.hasta.slice(0, 4)), opciones.tamanoPagina)).map(normalizar) as unknown as QuincenaLeche[];
      validarQuincenasLeche(filas); return filas;
    },
    async leerIngresos(referencias) {
      if (!referencias.length) return [];
      if (referencias.some(id => !esUuid(id))) throw Error('ingresos_no_leidos');
      const filas = (await leerFilasFijas(cliente, 'fin_ingresos', COLUMNAS_LECHE.fin_ingresos, q => q.in('id', [...new Set(referencias)]), opciones.tamanoPagina)).map(normalizar) as unknown as IngresoLitros[];
      validarIngresosLitros(filas); return filas;
    },
  };
}
