import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { metricas } from './ejecutor.ts';
import { esUuid, type AplicacionInventario } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import { formatCurrency, formatLongDate } from '../formatPuro.ts';
import type { RegistroTrabajo } from './tipos.ts';
import type { ConsultaLaborAplicacion, DatosLaborAplicacion, FilaLaborAplicacion, ResultadoLaborAplicacion, TotalLaborAplicacion } from './laborAplicacionTipos.ts';
const desconocido = (): TotalLaborAplicacion => ({ jornales: null, costo: null, costo_registrado: null, completo: false });
const limpiar = (n: number) => Number(n.toPrecision(12));
function total(registros: RegistroTrabajo[]): TotalLaborAplicacion {
  const v = metricas(registros);
  const costo = limpiar(registros.reduce((s, r) => s + (r.costo_jornal ?? 0), 0));
  if (!Number.isFinite(v.jornales) || !Number.isFinite(v.costo ?? 0) || !Number.isFinite(costo)) return desconocido();
  return { jornales: v.jornales!, costo: v.costo ?? null, costo_registrado: costo, completo: v.costo !== null };
}
function validos<T extends { id: string }>(rows: T[]): boolean { return rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id)).size === rows.length; }
export function ejecutarLaborAplicacion(c: ConsultaLaborAplicacion, d: DatosLaborAplicacion, id: string, _hoy: string): ResultadoLaborAplicacion {
  const r: ResultadoLaborAplicacion = { tipo: 'labor_aplicacion', id, estado: d.seleccion === 'no_resuelto' ? 'no_resuelto' : 'no_disponible', consulta: c, filas: [], total: desconocido(), fuente: 'lecturas_independientes' };
  if (d.seleccion !== 'ok' || !d.aplicaciones?.length || !validos(d.aplicaciones)) return r;
  const resueltas = resolverIdentidadAplicaciones(c, d.aplicaciones_visibles ?? d.aplicaciones);
  if (resueltas.estado !== 'ok' || resueltas.aplicaciones.length !== d.aplicaciones.length || d.aplicaciones.some(a => !resueltas.aplicaciones.some(v => v.id === a.id))) return r;
  const tareasValidas = d.tareas && validos(d.tareas);
  const registrosValidos = d.registros && validos(d.registros) && d.registros.every(x => esUuid(x.tarea_id) && (x.lote_id === null || esUuid(x.lote_id)) && esFechaCalendario(x.fecha_trabajo) && [0.25, 0.5, 0.75, 1].includes(x.fraccion_jornal));
  const porTarea = new Map<string, AplicacionInventario[]>();
  for (const a of d.aplicaciones) {
    if (!esUuid(a.tarea_id)) { r.filas.push({ tarea_id: null, aplicaciones: [a], estado: a.tarea_id === null ? 'sin_tarea_vinculada' : 'vinculo_no_leido', total: desconocido(), lotes: [], compartida: false }); continue; }
    porTarea.set(a.tarea_id, [...porTarea.get(a.tarea_id) ?? [], a]);
  }
  const acumulados: RegistroTrabajo[] = [];
  let coberturaCompleta = true;
  for (const [tareaId, apps] of porTarea) {
    const tarea = tareasValidas ? d.tareas!.find(t => t.id === tareaId) : undefined;
    const asociadas = d.aplicaciones_visibles?.filter(a => a.tarea_id === tareaId) ?? apps;
    const f: FilaLaborAplicacion = { tarea_id: tareaId, tarea_nombre: tarea?.nombre, aplicaciones: asociadas, compartida: asociadas.length > 1, estado: tarea ? registrosValidos ? 'ok' : 'registros_no_leidos' : tareasValidas ? 'tarea_no_disponible' : 'vinculo_no_leido', total: desconocido(), lotes: [] };
    if (f.estado === 'ok') {
      const registros = d.registros!.filter(x => x.tarea_id === tareaId && (!c.desde || x.fecha_trabajo >= c.desde) && (!c.hasta || x.fecha_trabajo <= c.hasta));
      // An unread/invalid cost preserves jornales, but cannot certify a complete cost.
      const seguros = registros.map(x => ({ ...x, costo_jornal: typeof x.costo_jornal === 'number' && Number.isFinite(x.costo_jornal) && x.costo_jornal >= 0 ? x.costo_jornal : null }));
      acumulados.push(...seguros);
      f.total = total(seguros);
      if (!seguros.length) f.estado = 'sin_jornales_registrados';
      for (const loteId of new Set(seguros.map(x => x.lote_id))) f.lotes.push({ lote_id: loteId, lote_nombre: d.lotes?.find(l => l.id === loteId)?.nombre, total: total(seguros.filter(x => x.lote_id === loteId)) });
    } else coberturaCompleta = false;
    r.filas.push(f);
  }
  coberturaCompleta &&= r.filas.every(f => f.estado === 'ok' || f.estado === 'sin_jornales_registrados');
  const conocido = total(acumulados);
  r.total = coberturaCompleta ? conocido : { ...conocido, jornales: null, costo: null, costo_registrado: acumulados.length ? conocido.costo_registrado : null, completo: false };
  r.estado = coberturaCompleta && conocido.completo ? 'ok' : 'parcial';
  return r;
}
function texto(v: string | null | undefined): string { return (v ?? '').replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&'); }
function etiqueta(id: string, nombre: string | null | undefined, universo: { id: string; nombre?: string | null }[]): string { const n=texto(nombre); return !n ? id : universo.some(x => x.id !== id && texto(x.nombre) === n) ? `${n} (${id})` : n; }
function valores(t: TotalLaborAplicacion): string { return `${t.jornales === null ? 'jornales no verificados' : `${numeroMensaje(limpiar(t.jornales))} ${t.jornales === 1 ? 'jornal registrado' : 'jornales registrados'}`}; ${t.costo === null ? `costo laboral incompleto${t.costo_registrado !== null ? ` (subtotal registrado: ${formatCurrency(t.costo_registrado)})` : ''}` : `costo laboral registrado: ${formatCurrency(t.costo)}`}`; }
export function renderLaborAplicacion(r: ResultadoLaborAplicacion): string {
  if (r.estado === 'no_resuelto') return 'No pude resolver las aplicaciones indicadas. Precisa su nombre o código.';
  if (r.estado === 'no_disponible') return 'No pude leer las aplicaciones para verificar su vínculo laboral.';
  const apps = r.filas.flatMap(f => f.aplicaciones).map(a => ({ id: a.id, nombre: a.nombre_aplicacion || a.codigo_aplicacion }));
  const tareas = r.filas.filter(f => f.tarea_id).map(f => ({id:f.tarea_id!,nombre:f.tarea_nombre}));
  const lotes = r.filas.flatMap(f=>f.lotes).filter(l=>l.lote_id).map(l=>({id:l.lote_id!,nombre:l.lote_nombre}));
  const out = ['Labor registrada de la tarea vinculada.', r.consulta.desde && r.consulta.hasta ? `Por fecha de trabajo del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta)}.` : 'Registros de vida completa.'];
  const estados = {sin_tarea_vinculada:'aplicación sin tarea vinculada',vinculo_no_leido:'vínculo no leído',tarea_no_disponible:'tarea vinculada no disponible',registros_no_leidos:'no pude leer los jornales de la tarea',sin_jornales_registrados:'sin jornales registrados',ok:''};
  for(const f of r.filas) {
    const nombres=f.aplicaciones.map(a=>etiqueta(a.id,a.nombre_aplicacion||a.codigo_aplicacion,apps)).join(', ');
    const tareaEtiqueta=f.tarea_id ? etiqueta(f.tarea_id,f.tarea_nombre,tareas) : '';
    // A task named exactly like its only application adds no information.
    const tarea=f.aplicaciones.length===1&&tareaEtiqueta===nombres ? '' : tareaEtiqueta;
    out.push(`${nombres}${tarea ? ` · ${tarea}` : ''}: ${f.compartida ? 'costo común de la tarea; sin atribución exclusiva; ' : ''}${estados[f.estado] || valores(f.total)}.`);
    for(const l of f.lotes) out.push(`${l.lote_id === null ? 'Sin lote' : etiqueta(l.lote_id,l.lote_nombre,lotes)}: ${valores(l.total)}.`);
  }
  out.push(`Total de tareas vinculadas, contado una vez por tarea: ${valores(r.total)}.`, 'No modifica el costo congelado al cierre. Lecturas independientes; sin garantía de snapshot conjunto.');
  return out.join('\n');
}
