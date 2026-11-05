// Inventory membership and canonical Spanish. No quantities, money or labor attribution.
import { formatLongDate, formatNumber } from '../formatPuro.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { normalizarAplicacionInventario } from './aplicacionesFuente.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { esUuid, ESTADOS_APLICACION, type AplicacionInventario, type ConsultaAplicaciones, type DatosInventarioAplicaciones, type ResultadoAplicaciones } from './aplicacionesTipos.ts';

function idsValidos(rows: { id: string }[]): boolean {
  return rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id)).size === rows.length;
}
export function ejecutarInventarioAplicaciones(consulta: ConsultaAplicaciones, datos: DatosInventarioAplicaciones, id: string, hoy?: string): ResultadoAplicaciones {
  const base: ResultadoAplicaciones = { tipo: 'aplicaciones', id, consulta, estado: 'no_disponible', filas: [], conteo: null, excluidos: { sin_fecha: 0, sin_cierre: 0, sin_estado: 0 }, fuente: 'lecturas_independientes' };
  const fallo = (motivo: ResultadoAplicaciones['motivo']): ResultadoAplicaciones => ({ ...base, motivo });
  if (consulta.base_fecha === 'sin_precisar') return { ...base, estado: 'aclaracion', motivo: 'base_sin_precisar' };
  if (consulta.base_fecha === 'cierre_administrativo') return { ...base, estado: 'no_soportada', motivo: 'cierre_administrativo_no_registrado' };
  if (!Array.isArray(datos.aplicaciones)) return fallo('fuente_no_disponible');
  if (!idsValidos(datos.aplicaciones)) return fallo('identidad_no_disponible');
  const apps = datos.aplicaciones.map(normalizarAplicacionInventario);
  const visibles = new Set(apps.map(a => a.id));
  const identidad = resolverIdentidadAplicaciones(consulta, apps);
  if (identidad.estado !== 'ok') return identidad.estado === 'no_disponible' ? fallo('identidad_no_disponible') : { ...base, estado: 'no_resuelto', motivo: 'seleccion_no_resuelta' };
  const candidatas = identidad.aplicaciones;
  const fechas = new Map<string, (string | null)[]>();
  if (consulta.base_fecha === 'fecha_inicio_planeada') {
    for (const a of candidatas) {
      if (a.fecha_inicio_planeada !== null && !esFechaCalendario(a.fecha_inicio_planeada)) return fallo('fecha_no_leida');
      fechas.set(a.id, [a.fecha_inicio_planeada!]);
    }
  } else {
    const rows = consulta.base_fecha === 'fecha_movimiento' ? datos.movimientos : datos.cierres;
    if (!Array.isArray(rows)) return fallo('fuente_no_disponible');
    if (rows.some(r => !r || !esUuid(r.aplicacion_id))) return fallo('identidad_no_disponible');
    // A permissive child policy does not make a parent visible.
    const hijos = rows.filter(r => visibles.has(r.aplicacion_id));
    if (!idsValidos(hijos)) return fallo('identidad_no_disponible');
    if (consulta.base_fecha === 'fecha_cierre_operativo' && new Set(hijos.map(r => r.aplicacion_id)).size !== hijos.length) return fallo('identidad_no_disponible');
    const seleccion = new Set(candidatas.map(a => a.id));
    for (const row of hijos.filter(r => seleccion.has(r.aplicacion_id))) {
      const fecha = consulta.base_fecha === 'fecha_movimiento' ? (row as { fecha_movimiento?: string | null }).fecha_movimiento : (row as { fecha_cierre?: string | null }).fecha_cierre;
      if (fecha !== null && !esFechaCalendario(fecha)) return fallo('fecha_no_leida');
      fechas.set(row.aplicacion_id, [...(fechas.get(row.aplicacion_id) ?? []), fecha!]);
    }
  }
  const filas: ResultadoAplicaciones['filas'] = [];
  for (const a of candidatas) {
    const ds = fechas.get(a.id) ?? [];
    if (ds.some(d => d === null)) base.excluidos.sin_fecha++;
    if (!ds.length && consulta.base_fecha === 'fecha_cierre_operativo') base.excluidos.sin_cierre++;
    if (!ds.some(d => d !== null && d >= consulta.desde && d <= consulta.hasta)) continue;
    if (consulta.estados.length) {
      if (a.estado === undefined || a.estado !== null && !ESTADOS_APLICACION.includes(a.estado)) return fallo('estado_no_leido');
      if (a.estado === null) { base.excluidos.sin_estado++; continue; }
      if (!consulta.estados.includes(a.estado)) continue;
    }
    const fechasSeleccion = [...new Set(ds.filter((d): d is string => d !== null && d >= consulta.desde && d <= consulta.hasta))].sort();
    if (hoy && fechasSeleccion.some(d => d > hoy)) base.fechas_futuras = true;
    filas.push({ ...a, fechas_seleccion: fechasSeleccion });
  }
  return { ...base, estado: filas.length ? 'ok' : 'vacio_verificado', filas, conteo: filas.length };
}
function nombre(v: string | null | undefined, fallback: string): string {
  return (v ?? fallback).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&') || fallback;
}
function etiquetaInventario(a: AplicacionInventario): string {
  const conocido = [a.nombre_aplicacion, a.codigo_aplicacion].find(v => typeof v === 'string' && v.trim());
  return nombre(conocido, a.nombre_aplicacion === undefined || a.codigo_aplicacion === undefined ? 'Aplicación con nombre o código no leído' : 'Aplicación sin nombre registrado');
}
export function renderAplicaciones(r: ResultadoAplicaciones): string {
  if (r.estado === 'aclaracion') return '¿Quieres seleccionar las aplicaciones por su inicio planeado, por la fecha de sus movimientos o por el cierre operativo registrado?' + (r.requiere_eleccion ? '\nElige una de las opciones para continuar.' : '');
  if (r.estado === 'no_soportada') return 'No tengo evidencia de la fecha del trámite administrativo de cierre. La fecha de cierre operativo registrada corresponde al fin real enviado al cierre.';
  if (r.estado === 'no_disponible') return 'No pude leer los datos necesarios para seleccionar las aplicaciones. Esa lectura no equivale a una lista vacía.';
  if (r.estado === 'no_resuelto') return 'No pude identificar la aplicación dentro de las que puedes ver. Indica su código o su nombre en la app.';
  const bases = { fecha_inicio_planeada: 'inicio planeado', fecha_movimiento: 'fecha de los movimientos', fecha_cierre_operativo: 'cierre operativo registrado', sin_precisar: '', cierre_administrativo: '' };
  const out = [r.conteo === 0 ? 'No hay aplicaciones con esa base de fecha en el período consultado entre las que puedes ver.' : `Hay ${formatNumber(r.conteo!, 0)} ${r.conteo === 1 ? 'aplicación' : 'aplicaciones'} entre las que puedes ver.`, `Selección por ${bases[r.consulta.base_fecha]}. Del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta)}, ambas fechas incluidas.`, 'Los estados son los registrados ahora: estado actual, no estado histórico.'];
  const nombres = r.filas.map(etiquetaInventario);
  if (new Set(nombres).size < nombres.length) out.push('Hay nombres repetidos; cada aplicación se mantiene separada por su identidad.');
  for (const a of r.filas) {
    const estado = a.estado === null ? 'sin estado registrado' : a.estado === undefined ? 'estado no leído' : a.estado === 'Calculada' ? 'Planificada' : a.estado;
    const label = etiquetaInventario(a);
    const duplicado = nombres.filter(n => n === label).length > 1;
    const codigo = nombre(a.codigo_aplicacion, '');
    const codigoUnico = codigo && r.filas.filter(otra => etiquetaInventario(otra) === label && nombre(otra.codigo_aplicacion, '') === codigo).length === 1;
    const distintivo = duplicado ? ` (${codigoUnico ? codigo : `ID ${a.id}`})` : '';
    out.push(`- ${label}${distintivo}: ${estado}. ${bases[r.consulta.base_fecha]}: ${a.fechas_seleccion.map(d => formatLongDate(d)).join(', ')}.`);
  }
  if (r.excluidos.sin_fecha) out.push(`${formatNumber(r.excluidos.sin_fecha, 0)} aplicaciones tienen datos sin fecha registrada en la base consultada; esas fechas no se imputaron.`);
  if (r.excluidos.sin_cierre) out.push(`${formatNumber(r.excluidos.sin_cierre, 0)} aplicaciones no tienen cierre registrado entre los datos que puedes ver.`);
  if (r.excluidos.sin_estado) out.push(`${formatNumber(r.excluidos.sin_estado, 0)} aplicaciones sin estado registrado quedaron fuera del filtro de estado actual.`);
  if (r.consulta.estados.length) out.push(`Filtro de estado actual: ${r.consulta.estados.map(e => e === 'Calculada' ? 'Planificada' : e).join(', ')}.`);
  if (r.consulta.base_fecha === 'fecha_cierre_operativo') out.push('El cierre operativo registrado no prueba la fecha del trámite administrativo.');
  if (r.fechas_futuras && r.consulta.base_fecha !== 'fecha_inicio_planeada') out.push('Hay fechas registradas posteriores a hoy. Esas fechas no prueban que la ejecución o el cierre ya hayan ocurrido.');
  out.push('Las tablas se leyeron por separado; no verifiqué un mismo momento de lectura entre ellas.');
  return out.join('\n');
}
