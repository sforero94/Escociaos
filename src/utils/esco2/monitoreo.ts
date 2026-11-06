// D38/D42: incidencia y gravedad ponderadas por observaciones; no árboles únicos.
import { calcularIncidencia, clasificarGravedad } from '../calculosMonitoreo.ts';
import { formatLongDate } from '../formatPuro.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { ConsultaMonitoreo, DatosMonitoreo, FilaMonitoreo, NombreMonitoreo, ObservacionMonitoreo, ResultadoMonitoreo, SubloteMonitoreo } from './monitoreoTipos.ts';

const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const idsValidos = (rows: { id: string }[]) => rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id.toLowerCase())).size === rows.length;
type Seleccion = { estado: 'ok'; ids: string[] } | { estado: 'no_resuelto' | 'no_disponible' };
/** Nombres resuelven opciones, nunca son claves de asociación ni desempates. */
function seleccionar(ids: string[], nombres: string[], catalogo: NombreMonitoreo[]): Seleccion {
  if (ids.some(id => !catalogo.some(r => r.id === id))) return { estado: 'no_disponible' };
  const elegidos = [...ids];
  for (const nombre of nombres) {
    const opciones = catalogo.filter(r => typeof r.nombre === 'string' && normalizar(r.nombre) === normalizar(nombre));
    if (opciones.length !== 1) return { estado: 'no_resuelto' };
    elegidos.push(opciones[0].id);
  }
  return { estado: 'ok', ids: [...new Set(elegidos)] };
}
/** Sublotes con el mismo nombre en lotes distintos: el lote pedido acota los nombres, nunca los IDs. */
function seleccionarSublotes(consulta: ConsultaMonitoreo, sublotes: SubloteMonitoreo[], lotes: Seleccion): Seleccion {
  const porId = seleccionar(consulta.sublote_ids, [], sublotes);
  if (porId.estado !== 'ok' || !consulta.sublotes.length) return porId;
  const ambito = lotes.estado === 'ok' && lotes.ids.length ? sublotes.filter(s => lotes.ids.includes(s.lote_id!)) : sublotes;
  const porNombre = seleccionar([], consulta.sublotes, ambito);
  return porNombre.estado !== 'ok' ? porNombre : { estado: 'ok', ids: [...new Set([...porId.ids, ...porNombre.ids])] };
}
const nombre = (v: string | null | undefined, base: string) => (v ?? base).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&') || base;
const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
const contadoresValidos = (r: ObservacionMonitoreo) => numeroValido(r.arboles_afectados) && numeroValido(r.arboles_monitoreados) && r.arboles_monitoreados > 0 && r.arboles_afectados >= 0 && r.arboles_afectados <= r.arboles_monitoreados;

export function ejecutarMonitoreo(consulta: ConsultaMonitoreo, datos: DatosMonitoreo, id: string, hoy: string): ResultadoMonitoreo {
  const base: ResultadoMonitoreo = { tipo: 'monitoreo', id, consulta, estado: 'no_disponible', filas: [], excluidos: { sin_ronda: 0, padre_no_visible: 0, incompatibles: 0 }, avisos: [], fuente: 'lecturas_independientes', unidad: 'observaciones de árboles muestreados' };
  const fallo = (motivo: string): ResultadoMonitoreo => ({ ...base, motivo });
  if (!consulta.ronda_ids.length && !consulta.rondas.length && !consulta.desde && !consulta.seleccion_ronda) return { ...base, estado: 'aclaracion', motivo: 'ronda_sin_precisar' };
  const { rondas, lotes, sublotes, plagas } = datos;
  if (!rondas || !lotes || !sublotes || !plagas || [rondas, lotes, sublotes, plagas].some(rs => !idsValidos(rs))) return fallo('catalogo_no_leido');
  if (rondas.some(r => r.nombre === undefined || !esFechaCalendario(r.fecha_inicio) || r.fecha_fin === undefined || r.fecha_fin !== null && (!esFechaCalendario(r.fecha_fin) || r.fecha_fin < r.fecha_inicio!)) || [...lotes, ...sublotes, ...plagas].some(r => typeof r.nombre !== 'string') || sublotes.some(r => r.lote_id === undefined || r.lote_id === null)) return fallo('campo_catalogo_no_leido');
  const selecciones = [
    seleccionar(consulta.ronda_ids, consulta.rondas, rondas), seleccionar(consulta.lote_ids, consulta.lotes, lotes),
    seleccionarSublotes(consulta, sublotes, seleccionar(consulta.lote_ids, consulta.lotes, lotes)), seleccionar(consulta.plaga_ids, consulta.plagas, plagas),
  ];
  const problema = selecciones.find(s => s.estado !== 'ok');
  if (problema) return { ...base, estado: problema.estado, motivo: 'seleccion_no_resuelta' };
  const [rondaIds, loteIds, subloteIds, plagaIds] = selecciones.map(s => s.estado === 'ok' ? s.ids : []);
  if (subloteIds.some(s => !lotes.some(l => l.id === sublotes.find(x => x.id === s)!.lote_id))) return fallo('padre_sublote_no_visible');
  if (loteIds.length && subloteIds.some(s => !loteIds.includes(sublotes.find(x => x.id === s)!.lote_id!))) return { ...base, estado: 'no_resuelto', motivo: 'lote_sublote_incompatible' };
  base.filtros_visibles = { lotes: lotes.filter(l => loteIds.includes(l.id)).map(l => l.nombre!), sublotes: sublotes.filter(s => subloteIds.includes(s.id)).map(s => s.nombre!), plagas: plagas.filter(p => plagaIds.includes(p.id)).map(p => p.nombre!) };
  let rondasElegidas = rondas.filter(r => (!rondaIds.length || rondaIds.includes(r.id)) && (!consulta.desde || r.fecha_inicio! >= consulta.desde && r.fecha_inicio! <= consulta.hasta!));
  if (consulta.seleccion_ronda === 'ultima_global') {
    rondasElegidas = rondasElegidas.filter(r => r.fecha_inicio! <= hoy);
    const ultima = rondasElegidas.map(r => r.fecha_inicio!).sort().slice(-1)[0];
    rondasElegidas = rondasElegidas.filter(r => r.fecha_inicio === ultima);
    if (rondasElegidas.length > 1) return { ...base, estado: 'aclaracion', motivo: 'ultima_ronda_ambigua' };
  }
  if (!rondasElegidas.length) return { ...base, estado: 'vacio_verificado', motivo: 'sin_rondas_visibles' };
  const observaciones = datos.observaciones;
  if (!Array.isArray(observaciones) || !idsValidos(observaciones)) return fallo('observaciones_no_leidas');
  const campos = ['ronda_id', 'fecha_monitoreo', 'lote_id', 'sublote_id', 'plaga_enfermedad_id'] as const;
  if (observaciones.some(r => campos.some(k => r[k] === undefined))) return fallo('campo_observacion_no_leido');
  const contadorNoLeido = observaciones.some(r => r.arboles_afectados === undefined || r.arboles_monitoreados === undefined);
  const rondasSeleccionadas = new Set(rondasElegidas.map(r => r.id));
  const lotesVisibles = new Set(lotes.map(r => r.id)), plagasVisibles = new Set(plagas.map(r => r.id));
  const sublotesPorId = new Map(sublotes.map(r => [r.id, r]));
  const candidatas: { r: ObservacionMonitoreo; incompatible: boolean }[] = [];
  const noLegibles: { ronda_id: string; lote_id: string; plaga_id: string }[] = [];
  for (const r of observaciones) {
    // Filtrar por IDs conocidos conserva el alcance sin usar nombres ni fechas como joins.
    if (loteIds.length && !loteIds.includes(r.lote_id!) || subloteIds.length && !subloteIds.includes(r.sublote_id!) || plagaIds.length && !plagaIds.includes(r.plaga_enfermedad_id!)) continue;
    if (r.ronda_id === null) { base.excluidos.sin_ronda++; continue; }
    if (!rondasSeleccionadas.has(r.ronda_id!)) continue;
    if (!lotesVisibles.has(r.lote_id!) || !plagasVisibles.has(r.plaga_enfermedad_id!) || r.sublote_id !== null && !sublotesPorId.has(r.sublote_id!)) {
      base.excluidos.padre_no_visible++;
      if (lotesVisibles.has(r.lote_id!) && plagasVisibles.has(r.plaga_enfermedad_id!)) noLegibles.push({ ronda_id: r.ronda_id!, lote_id: r.lote_id!, plaga_id: r.plaga_enfermedad_id! });
      continue;
    }
    const subloteAjeno = r.sublote_id !== null && sublotesPorId.get(r.sublote_id!)!.lote_id !== r.lote_id;
    const incompatible = subloteAjeno || !contadoresValidos(r) || !esFechaCalendario(r.fecha_monitoreo);
    if (incompatible) base.excluidos.incompatibles++;
    candidatas.push({ r, incompatible });
  }
  const agrupacionLote = consulta.agrupar_por.includes('lote'), agrupacionSublote = consulta.agrupar_por.includes('sublote');
  const plagasElegidas = plagas.filter(p => plagaIds.length ? plagaIds.includes(p.id) : candidatas.some(x => x.r.plaga_enfermedad_id === p.id));
  const grupos: { lote_id: string | null; sublote_id: string | null }[] = [];
  if (agrupacionSublote) {
    for (const s of sublotes.filter(s => lotesVisibles.has(s.lote_id!) && (!loteIds.length || loteIds.includes(s.lote_id!)) && (!subloteIds.length || subloteIds.includes(s.id)))) grupos.push({ lote_id: s.lote_id!, sublote_id: s.id });
    if (!subloteIds.length) for (const l of lotes.filter(l => (!loteIds.length || loteIds.includes(l.id)) && candidatas.some(x => x.r.lote_id === l.id && x.r.sublote_id === null))) grupos.push({ lote_id: l.id, sublote_id: null });
  } else if (agrupacionLote) {
    for (const l of lotes.filter(l => (!loteIds.length || loteIds.includes(l.id)) && (!subloteIds.length || sublotes.some(s => s.lote_id === l.id && subloteIds.includes(s.id))))) grupos.push({ lote_id: l.id, sublote_id: null });
  } else grupos.push({ lote_id: null, sublote_id: null });
  for (const ronda of rondasElegidas) for (const plaga of plagasElegidas) for (const grupo of grupos) {
    const miembros = candidatas.filter(x => x.r.ronda_id === ronda.id && x.r.plaga_enfermedad_id === plaga.id && (!agrupacionLote && !agrupacionSublote || x.r.lote_id === grupo.lote_id) && (!agrupacionSublote || x.r.sublote_id === grupo.sublote_id));
    const invalidas = miembros.filter(x => x.incompatible).length;
    const sinLectura = !miembros.length && noLegibles.some(x => x.ronda_id === ronda.id && x.plaga_id === plaga.id && (!agrupacionLote && !agrupacionSublote || x.lote_id === grupo.lote_id));
    const validas = miembros.filter(x => !x.incompatible).map(x => x.r);
    // Solo miembros compatibles y una misma plaga: no se promedian porcentajes.
    const afectados = validas.reduce((s, r) => s + r.arboles_afectados!, 0), muestreados = validas.reduce((s, r) => s + r.arboles_monitoreados!, 0);
    const calculable = !!miembros.length && !invalidas && Number.isSafeInteger(afectados) && Number.isSafeInteger(muestreados) && muestreados > 0;
    const incidencia = calculable ? calcularIncidencia(afectados, muestreados) : null;
    const fila: FilaMonitoreo = {
      ronda_id: ronda.id, ronda: ronda.nombre || 'Ronda sin nombre registrado', ronda_inicio: ronda.fecha_inicio!, ronda_fin: ronda.fecha_fin!,
      ...grupo, lote: grupo.lote_id ? lotes.find(l => l.id === grupo.lote_id)!.nombre! : null, sublote: grupo.sublote_id ? sublotesPorId.get(grupo.sublote_id)!.nombre! : null,
      plaga_id: plaga.id, plaga: plaga.nombre!, estado: !miembros.length && !sinLectura ? 'no_revisado' : calculable ? 'ok' : 'no_calculable',
      afectados: calculable ? afectados : null, muestreados: calculable ? muestreados : null, observaciones: miembros.length,
      fechas: [...new Set(miembros.flatMap(x => esFechaCalendario(x.r.fecha_monitoreo) ? [x.r.fecha_monitoreo] : []))].sort(), incidencia, gravedad: incidencia === null ? null : clasificarGravedad(incidencia).texto, no_calculables: invalidas,
    };
    base.filas.push(fila);
  }
  if (base.excluidos.padre_no_visible) base.avisos.push('Solo publico observaciones con padres visibles; el subtotal no acredita el total completo.');
  if (base.excluidos.sin_ronda) base.avisos.push('Hay observaciones sin ronda vinculada. Se mantienen separadas; no se les asignó una ronda por fecha.');
  if (base.excluidos.incompatibles) base.avisos.push('Hay observaciones incompatibles o sin denominador válido. Sus grupos quedan no calculables.');
  if (consulta.seleccion_ronda === 'ultima_global') base.avisos.push('La selección es la última ronda global visible, no la última lectura disponible de cada combinación.');
  return { ...base, estado: contadorNoLeido ? 'no_disponible' : base.excluidos.padre_no_visible || base.excluidos.incompatibles || base.filas.some(f => f.estado === 'no_calculable') ? 'parcial' : 'ok' };
}

const MAX_FILAS_MONITOREO = 30;
// La incidencia se trunca a un decimal: redondear haría ver 9,96 % como «10 % · Baja», contra las bandas 10/30.
export function renderMonitoreo(r: ResultadoMonitoreo): string {
  if (r.estado === 'aclaracion') return r.motivo === 'ultima_ronda_ambigua' ? 'Hay varias rondas con la misma fecha de inicio más reciente. Indica qué ronda quieres consultar.' : '¿Qué ronda o período de inicio de rondas quieres consultar? Puedes pedir la última ronda global.';
  if (r.estado === 'no_resuelto') return 'No pude identificar una única ronda, lote, sublote o plaga. Indica el nombre exacto que aparece en la app; si hay nombres repetidos, precisa la identidad.';
  if (r.estado === 'no_disponible') return 'No pude leer los datos necesarios de monitoreo. No equivale a una ronda vacía, una incidencia de cero ni ausencia de plaga.';
  if (r.estado === 'vacio_verificado') return 'No hay rondas visibles con esa selección. No demuestra que no haya plagas.';
  const out = ['Monitoreo por ronda: incidencia y gravedad. La incidencia es una razón ponderada de observaciones de árboles muestreados; no acredita un censo de la finca.'];
  if (r.filtros_visibles?.lotes.length) out.push(`Lotes seleccionados: ${r.filtros_visibles.lotes.map(l => nombre(l, 'Lote sin nombre')).join(', ')}.`);
  if (r.filtros_visibles?.sublotes.length) out.push(`Sublotes seleccionados: ${r.filtros_visibles.sublotes.map(s => nombre(s, 'Sublote sin nombre')).join(', ')}.`);
  if (r.consulta.desde) out.push(`Rondas con inicio del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta!)}, ambas fechas incluidas.`);
  for (const f of r.filas.slice(0, MAX_FILAS_MONITOREO)) {
    const alcance = [nombre(f.ronda, 'Ronda sin nombre'), ...(f.lote ? [nombre(f.lote, 'Lote sin nombre')] : []), ...(f.sublote ? [nombre(f.sublote, 'Sublote sin nombre')] : []), nombre(f.plaga, 'Plaga sin nombre')].join(' · ');
    const intervalo = `Ronda: inicio ${formatLongDate(f.ronda_inicio)}; fin ${f.ronda_fin ? formatLongDate(f.ronda_fin) : 'sin fecha registrada'}.`;
    if (f.estado === 'no_revisado') out.push(`- ${alcance}: no revisado, sin observación registrada. No equivale a incidencia cero. ${intervalo}`);
    else if (f.estado === 'no_calculable') out.push(`- ${alcance}: incidencia y gravedad sin dato calculable. Hay observaciones incompatibles, un denominador inválido o vínculos no legibles; no se publica cero. ${intervalo}`);
    else out.push(`- ${alcance}: incidencia ${numeroMensaje(Math.floor(f.incidencia! * 10 + 1e-9) / 10)} %; gravedad ${nombre(f.gravedad, 'sin dato')}. ${numeroMensaje(f.afectados!)} observaciones afectadas de ${numeroMensaje(f.muestreados!)} observaciones de árboles muestreados, en ${numeroMensaje(f.observaciones)} registros. ${intervalo} Fechas de observación: ${f.fechas.map(d => formatLongDate(d)).join(', ')}.`);
  }
  if (r.filas.length > MAX_FILAS_MONITOREO) out.push(`Se muestran ${MAX_FILAS_MONITOREO} de ${numeroMensaje(r.filas.length)} filas; acota por ronda, lote, sublote o plaga para ver el resto.`);
  if (!r.filas.length) out.push('No hay observaciones de plagas con padres visibles en las rondas seleccionadas. Sin dato de incidencia; no equivale a cero.');
  out.push(...r.avisos);
  if (r.excluidos.padre_no_visible) out.push(`${numeroMensaje(r.excluidos.padre_no_visible)} observaciones no se incorporaron por vínculos no legibles.`);
  if (r.excluidos.incompatibles) out.push(`${numeroMensaje(r.excluidos.incompatibles)} observaciones incompatibles conservadas como no calculables.`);
  if (r.excluidos.sin_ronda) out.push(`${numeroMensaje(r.excluidos.sin_ronda)} observaciones sin ronda vinculada quedaron separadas.`);
  out.push('Las tablas se leyeron por separado, sin garantía de un mismo momento de lectura.');
  return out.join('\n');
}
