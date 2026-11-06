import { lluviaConfiableDeResumen, esCotaInferior } from '../escoClimaCalidad.ts';
import { wm2ToEnergiaDiaria } from '../calculosRadiacion.ts';
import { aFechaUTC, esFechaCalendario } from './fechaCalendario.ts';
import { validarFilasClima } from './climaFuente.ts';
import type { ConsultaClima, FilaClima, ResumenClima, ResumenDiarioClima, ResultadoClima, VariableClima } from './climaTipos.ts';
const CONFIANZAS = new Set(['ok', 'contador_congelado', 'sin_time_piezo', 'cobertura_parcial', 'reconstruido']);
const suma = (valores: number[]): number | null => valores.length ? valores.reduce((a, b) => a + b, 0) : null;
function filaObservada(f: ResumenDiarioClima, variables: VariableClima[]): FilaClima {
  const cobertura_temporal = f.cobertura_hueco_max_min === null ? 'desconocida' : f.cobertura_hueco_max_min <= 45 ? 'completa' : 'parcial';
  const fila: FilaClima = { fecha: f.fecha, station_id: f.station_id, lluvia_confianza: f.lluvia_confianza, cobertura_temporal, valores: {}, estados: {}, contradicciones: [], raw: { ...f } };
  if (f.horas_sol_duracion !== null && cobertura_temporal === 'parcial') fila.contradicciones.push('horas_sol_duracion_con_hueco_temporal');
  if (f.lluvia_total_mm !== null && lluviaConfiableDeResumen(f) !== null && !esCotaInferior(f) && cobertura_temporal === 'parcial') fila.contradicciones.push('lluvia_con_cobertura_temporal_parcial');
  for (const variable of variables) {
    const crudo = variable === 'energia_kwh_m2' ? f.radiacion_wm2_avg : f[variable];
    let valor = crudo;
    if (variable === 'lluvia_total_mm') valor = CONFIANZAS.has(f.lluvia_confianza) ? lluviaConfiableDeResumen(f) : null;
    if (variable === 'horas_sol_duracion' && (cobertura_temporal === 'parcial' || valor !== null && (valor < 0 || valor > 24))) valor = null;
    if (variable === 'energia_kwh_m2') valor = crudo !== null && crudo >= 0 && cobertura_temporal === 'completa' ? wm2ToEnergiaDiaria(crudo) : null;
    if (variable !== 'temp_c_min' && variable !== 'temp_c_max' && variable !== 'temp_c_avg' && valor !== null && valor < 0) valor = null;
    if (variable.startsWith('humedad_pct_') && valor !== null && valor > 100) valor = null;
    if (variable === 'viento_dir_predominante' && valor !== null && valor > 360) valor = null;
    fila.valores[variable] = valor;
    fila.estados[variable] = crudo === null ? 'null_registrado' : valor === null ? 'no_usable' : 'usable';
  }
  return fila;
}
function resumir(station_id: string | null, filas: FilaClima[], variables: VariableClima[], solicitados: number): ResumenClima {
  const huecos = filas.flatMap(f => f.raw.cobertura_hueco_max_min === null ? [] : [f.raw.cobertura_hueco_max_min]);
  const resumen: ResumenClima = { station_id, cobertura_temporal: { completa: filas.filter(f => f.cobertura_temporal === 'completa').length, parcial: filas.filter(f => f.cobertura_temporal === 'parcial').length, desconocida: filas.filter(f => f.cobertura_temporal === 'desconocida').length, hueco_max_min: huecos.length ? Math.max(...huecos) : null }, variables: {}, lluvia: { subtotal_dias_completos: null, cota_inferior_medida: null, dias_completos: 0, dias_cota_inferior: 0, dias_sin_dato: solicitados, dias_calidad_desconocida: 0, subtotal_observado_calidad_desconocida: null, dias_temporales_parciales: 0, subtotal_observado_temporal_parcial: null } };
  for (const variable of variables) {
    const valores = filas.flatMap(f => typeof f.valores[variable] === 'number' ? [f.valores[variable] as number] : []);
    const agregar = variable !== 'lluvia_total_mm' && variable !== 'viento_dir_predominante';
    resumen.variables[variable] = { promedio: agregar && valores.length ? suma(valores)! / valores.length : null, min: agregar && valores.length ? Math.min(...valores) : null, max: agregar && valores.length ? Math.max(...valores) : null, cobertura: { solicitados, usables: valores.length, nulos_no_usables: filas.length - valores.length, sin_fila: solicitados - filas.length, calidad_desconocida: filas.filter(f => f.cobertura_temporal === 'desconocida' || !CONFIANZAS.has(f.lluvia_confianza) && variable === 'lluvia_total_mm').length } };
  }
  if (variables.includes('lluvia_total_mm')) {
    const usables = filas.filter(f => f.valores.lluvia_total_mm !== null && f.valores.lluvia_total_mm !== undefined);
    const cotas = usables.filter(f => esCotaInferior(f));
    const completos = usables.filter(f => !esCotaInferior(f) && f.cobertura_temporal === 'completa');
    const parciales = usables.filter(f => !esCotaInferior(f) && f.cobertura_temporal === 'parcial');
    const desconocidos = usables.filter(f => !esCotaInferior(f) && f.cobertura_temporal === 'desconocida');
    resumen.lluvia = { subtotal_dias_completos: suma(completos.map(f => f.valores.lluvia_total_mm!)), cota_inferior_medida: suma(cotas.map(f => f.valores.lluvia_total_mm!)), dias_completos: completos.length, dias_cota_inferior: cotas.length, dias_sin_dato: solicitados - usables.length, dias_calidad_desconocida: desconocidos.length, subtotal_observado_calidad_desconocida: suma(desconocidos.map(f => f.valores.lluvia_total_mm!)), dias_temporales_parciales: parciales.length, subtotal_observado_temporal_parcial: suma(parciales.map(f => f.valores.lluvia_total_mm!)) };
  }
  return resumen;
}
/** Observaciones disponibles: el hueco global nunca acredita completitud del sensor. */
export function ejecutarClima(consulta: ConsultaClima, datos: ResumenDiarioClima[] | undefined, id: string, hoy: string): ResultadoClima {
  const hasta = consulta.hasta > hoy ? hoy : consulta.hasta;
  const r: ResultadoClima = { tipo: 'clima', id, consulta, estado: 'no_disponible', alcance: { desde: consulta.desde, hasta, hasta_recortado_a_hoy: hasta !== consulta.hasta }, filas: [], resumen: [], estaciones: [], avisos: [], fuente: 'clima_resumen_diario' };
  if (!esFechaCalendario(consulta.desde) || !esFechaCalendario(hasta) || consulta.desde > hasta) return { ...r, motivo: 'periodo_sin_historia' };
  if (hasta !== consulta.hasta) r.avisos.push('El período se recortó a hoy en Bogotá; no incluye pronósticos.');
  if (!Array.isArray(datos)) return { ...r, motivo: 'resumen_no_leido' };
  try { validarFilasClima(datos); } catch { return { ...r, motivo: 'resumen_no_leido' }; }
  const seleccion = datos.filter(f => f.fecha >= consulta.desde && f.fecha <= hasta && (!consulta.station_id || f.station_id === consulta.station_id));
  r.estaciones = [...new Set(seleccion.map(f => f.station_id))].sort();
  if (!consulta.station_id) {
    const fechas = new Set<string>();
    if (seleccion.some(f => { if (fechas.has(f.fecha)) return true; fechas.add(f.fecha); return false; })) return { ...r, estado: 'aclaracion', motivo: 'estaciones_solapadas' };
  }
  r.filas = seleccion.map(f => filaObservada(f, consulta.variables)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.station_id.localeCompare(b.station_id));
  const dias = Math.round((aFechaUTC(hasta).getTime() - aFechaUTC(consulta.desde).getTime()) / 86400000) + 1;
  const estaciones = consulta.station_id ? [consulta.station_id] : r.estaciones.length ? r.estaciones : [null];
  r.resumen = estaciones.map(estacion => resumir(estacion, r.filas.filter(f => f.station_id === estacion), consulta.variables, dias));
  r.estado = !r.filas.length ? 'vacio_verificado' : r.resumen.some(s => Object.values(s.variables).some(v => v.cobertura.nulos_no_usables || v.cobertura.sin_fila || v.cobertura.calidad_desconocida)) || r.filas.some(f => f.cobertura_temporal !== 'completa') ? 'parcial' : 'ok';
  return r;
}
const ETIQUETAS: Record<VariableClima, string> = { temp_c_min: 'Temperatura mínima (°C)', temp_c_max: 'Temperatura máxima (°C)', temp_c_avg: 'Temperatura media (°C)', humedad_pct_min: 'Humedad mínima (%)', humedad_pct_max: 'Humedad máxima (%)', humedad_pct_avg: 'Humedad media (%)', viento_kmh_avg: 'Viento medio (km/h)', rafaga_kmh_max: 'Ráfaga máxima (km/h)', viento_dir_predominante: 'Dirección predominante del viento (grados)', lluvia_total_mm: 'Lluvia (mm)', radiacion_wm2_avg: 'Radiación media (W/m²)', radiacion_wm2_max: 'Radiación máxima (W/m²)', uv_index_max: 'Índice UV (sin unidad)', horas_sol_duracion: 'Duración de sol (h)', energia_kwh_m2: 'Energía solar diaria (kWh/m²)' };
const numero = (n: number | null) => n === null ? 'sin dato' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
const texto = (s: string) => s.replace(/\s+/g, ' ').replace(/[\\`*_[\]|<>]/g, '\\$&');
export function renderClima(r: ResultadoClima): string {
  if (r.estado === 'aclaracion') return `Hay estaciones con fechas solapadas. Indica la estación que quieres consultar: ${r.estaciones.map(texto).join(', ')}.`;
  if (r.estado === 'no_disponible') return 'No pude leer el resumen climático diario para ese período; no hay una observación verificada disponible.';
  const partes = [`Observaciones climáticas del ${r.alcance.desde} al ${r.alcance.hasta}, ambas fechas incluidas. Fuente: resumen diario.`, ...r.avisos];
  for (const resumen of r.resumen) {
    partes.push(`Estación: ${resumen.station_id === null ? 'sin filas disponibles' : texto(resumen.station_id)}.`);
    const temporal = resumen.cobertura_temporal;
    partes.push(`Cobertura temporal: ${temporal.completa} días con muestreo completo, ${temporal.parcial} con cobertura temporal parcial y ${temporal.desconocida} desconocida; hueco máximo global observado ${numero(temporal.hueco_max_min)} minutos. Un hueco mayor de 45 minutos indica día truncado; el número de muestras no define esta cobertura.`);
    for (const [clave, v] of Object.entries(resumen.variables)) {
      const variable = clave as VariableClima, c = v.cobertura;
      const cobertura = `Cobertura: ${c.usables} usables, ${c.nulos_no_usables} con fila NULL/no usable y ${c.sin_fila} sin fila de ${c.solicitados} días. Calidad desconocida: ${c.calidad_desconocida} días (se superponen a esos estados).`;
      if (variable === 'lluvia_total_mm') { partes.push(`${ETIQUETAS[variable]}: ${cobertura}`); continue; }
      if (variable === 'viento_dir_predominante') {
        const observadas = r.filas.filter(f => f.station_id === resumen.station_id && f.valores.viento_dir_predominante !== null).map(f => `${f.fecha}: ${numero(f.valores.viento_dir_predominante ?? null)}°`);
        partes.push(`${ETIQUETAS[variable]}: direcciones diarias observadas ${observadas.join('; ') || 'sin dato'}. ${cobertura} Sin agregación angular.`); continue;
      }
      partes.push(`${ETIQUETAS[variable]}: promedio de ${c.usables} días con dato ${numero(v.promedio)}; mínimo observado ${numero(v.min)}, máximo observado ${numero(v.max)}. ${cobertura}`);
    }
    if (r.consulta.variables.includes('lluvia_total_mm')) {
      const l = resumen.lluvia;
      partes.push(`Lluvia: subtotal de ${l.dias_completos} días con cobertura temporal completa: ${numero(l.subtotal_dias_completos)} mm; cota inferior medida de ${l.dias_cota_inferior} días: ${l.cota_inferior_medida === null ? 'sin dato' : `al menos ${numero(l.cota_inferior_medida)} mm`}; ${l.dias_sin_dato} días sin dato usable. Las cotas no son totales completos; una cota de cero no acredita ausencia de precipitación.`);
      if (l.dias_temporales_parciales) partes.push(`Lluvia observada en ${l.dias_temporales_parciales} días de cobertura temporal parcial: ${numero(l.subtotal_observado_temporal_parcial)} mm. La etiqueta de lluvia no acredita estos días como completos; se conserva la contradicción y este subtotal separado.`);
      if (l.dias_calidad_desconocida) partes.push(`Lluvia observada de ${l.dias_calidad_desconocida} días con calidad temporal desconocida: ${numero(l.subtotal_observado_calidad_desconocida)} mm, separada del subtotal completo.`);
      const causas = [...new Set(r.filas.filter(f => f.station_id === resumen.station_id).map(f => f.lluvia_confianza))];
      partes.push(`Procedencia de lluvia registrada: ${causas.map(texto).join(', ') || 'sin fila'}.`);
    }
  }
  if (r.filas.some(f => f.contradicciones.includes('horas_sol_duracion_con_hueco_temporal'))) partes.push('Hay duración solar contradictoria con huecos temporales; se conserva el registro y se excluye de las horas usables.');
  partes.push('Son observaciones disponibles con cobertura explícita; el hueco temporal global no prueba completitud por sensor. Energía solar y duración de sol son magnitudes distintas.');
  return partes.join('\n');
}
