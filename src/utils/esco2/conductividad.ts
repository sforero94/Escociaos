import { calcularDistribucionCE, type LecturaCE } from '../calculosConductividad.ts';
import { formatLongDate } from '../formatPuro.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { esUuid } from './aplicacionesTipos.ts';
import type { ConsultaConductividad, DatosConductividad, FilaConductividad, ResultadoConductividad } from './conductividadTipos.ts';
const idsValidos = (rows: { id: string }[]) => rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id.toLowerCase())).size === rows.length;
const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const nombre = (v: string) => v.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&');
/** Valida toda la población antes del motor: NULL no se convierte en cero. */
function lecturasValidas(v: unknown): v is LecturaCE[] {
  return Array.isArray(v) && v.length > 0 && v.every(l => l && typeof l === 'object' && !Array.isArray(l) && Number.isInteger(l.arbol) && l.arbol > 0 && (l.alta === null || numeroValido(l.alta)) && (l.baja === null || numeroValido(l.baja)))
    && new Set(v.map(l => l.arbol)).size === v.length && v.some(l => l.alta !== null || l.baja !== null);
}
export function ejecutarConductividad(consulta: ConsultaConductividad, datos: DatosConductividad, id: string, hoy: string): ResultadoConductividad {
  const base: ResultadoConductividad = { tipo: 'conductividad', id, consulta, estado: 'no_disponible', filas: [], excluidos: { padre_no_visible: 0, incompatibles: 0 }, avisos: [], fuente: 'lecturas_independientes', unidad: 'dS/m' };
  if (!consulta.desde || !consulta.hasta) return { ...base, estado: 'aclaracion', motivo: 'fecha_operativa_sin_precisar' };
  if (!esFechaCalendario(consulta.desde) || !esFechaCalendario(consulta.hasta) || consulta.desde > consulta.hasta || !esFechaCalendario(hoy)) return { ...base, motivo: 'periodo_no_valido' };
  const { lotes, rondas, registros } = datos;
  if (!Array.isArray(lotes) || !idsValidos(lotes) || lotes.some(l => typeof l.nombre !== 'string')) return { ...base, motivo: 'lotes_no_leidos' };
  const ids = [...consulta.lote_ids];
  if (ids.some(i => !lotes.some(l => l.id === i))) return { ...base, motivo: 'lote_no_visible' };
  for (const n of consulta.lotes) {
    const opciones = lotes.filter(l => normalizar(l.nombre!) === normalizar(n));
    if (opciones.length !== 1) return { ...base, estado: 'no_resuelto', motivo: 'lote_no_resuelto' };
    ids.push(opciones[0].id);
  }
  base.filtros_visibles = { lotes: lotes.filter(l => ids.includes(l.id)).map(l => l.nombre!) };
  if (!Array.isArray(registros) || !idsValidos(registros)) return { ...base, motivo: 'registros_no_leidos' };
  // Sin estos campos no se conoce la población solicitada ni el promedio guardado.
  if (registros.some(r => !esUuid(r.lote_id) || !esFechaCalendario(r.fecha_monitoreo) || r.valor_ce === undefined)) return { ...base, motivo: 'campo_registro_no_leido' };
  const rondasLeidas = Array.isArray(rondas) && idsValidos(rondas);
  const hasta = consulta.hasta > hoy ? hoy : consulta.hasta;
  if (hasta !== consulta.hasta) base.avisos.push('hasta_recortado_a_hoy');
  for (const r of registros) {
    if (ids.length && !ids.includes(r.lote_id!)) continue;
    // Los campos requeridos ya se validaron antes de seleccionar el período.
    if (!esFechaCalendario(r.fecha_monitoreo)) continue;
    if (r.fecha_monitoreo < consulta.desde || r.fecha_monitoreo > hasta) continue;
    const lote = lotes.find(l => l.id === r.lote_id);
    if (!lote) { base.excluidos.padre_no_visible++; continue; }
    const motivos: string[] = [];
    const valor_ce = numeroValido(r.valor_ce) ? r.valor_ce : null;
    if (valor_ce === null) motivos.push(r.valor_ce === null ? 'ce_null_registrado' : 'ce_incompatible');
    const calculada = lecturasValidas(r.lecturas) ? calcularDistribucionCE(r.lecturas) : null;
    // El motor compartido conserva su aritmética; un overflow no es un resultado publicable.
    const distribucion = calculada && Object.values(calculada).every(Number.isFinite) ? calculada : null;
    if (!distribucion) motivos.push(r.lecturas === undefined ? 'lecturas_no_leidas' : r.lecturas === null ? 'lecturas_null_registrado' : Array.isArray(r.lecturas) && !r.lecturas.length ? 'lecturas_vacias' : 'lecturas_no_calculables');
    const ph = numeroValido(r.ph) && r.ph <= 14 ? r.ph : null;
    if (r.ph !== null && ph === null) motivos.push(r.ph === undefined ? 'ph_no_leido' : 'ph_incompatible');
    const num_arboles = numeroValido(r.num_arboles) && Number.isInteger(r.num_arboles) ? r.num_arboles : null;
    if (r.num_arboles !== null && num_arboles === null) motivos.push(r.num_arboles === undefined ? 'num_arboles_no_leido' : 'num_arboles_incompatible');
    const ronda_estado: FilaConductividad['ronda_estado'] = r.ronda_id === null ? 'sin_vinculo' : r.ronda_id === undefined || !rondasLeidas ? 'no_leido' : rondas!.some(x => x.id === r.ronda_id) ? 'visible' : 'no_legible';
    if (ronda_estado === 'no_leido' || ronda_estado === 'no_legible') motivos.push(`ronda_${ronda_estado}`);
    if (!distribucion || valor_ce === null) base.excluidos.incompatibles++;
    base.filas.push({ id: r.id, lote_id: lote.id, lote: lote.nombre!, fecha_monitoreo: r.fecha_monitoreo, valor_ce, distribucion, ph, num_arboles, ronda_id: r.ronda_id ?? null, ronda_estado, estado: !motivos.length ? 'ok' : valor_ce === null && distribucion === null ? 'no_calculable' : 'parcial', motivos });
  }
  base.filas.sort((a, b) => a.fecha_monitoreo.localeCompare(b.fecha_monitoreo) || a.lote.localeCompare(b.lote) || a.id.localeCompare(b.id));
  base.estado = base.excluidos.padre_no_visible || base.excluidos.incompatibles || base.filas.some(f => f.estado !== 'ok') ? 'parcial' : base.filas.length ? 'ok' : 'vacio_verificado';
  return base;
}
export function renderConductividad(r: ResultadoConductividad): string {
  if (r.estado === 'aclaracion') return 'Necesito la fecha operativa o el período para consultar la conductividad eléctrica del suelo.';
  if (r.estado === 'no_resuelto') return 'Necesito precisar el lote por su nombre exacto; no puedo elegir entre nombres repetidos.';
  if (r.estado === 'no_disponible') return 'No pude leer todos los datos necesarios de conductividad eléctrica del suelo. No equivale a una medición cero.';
  const out = ['Conductividad eléctrica del suelo (CE, dS/m).', `Del ${formatLongDate(r.consulta.desde!)} al ${formatLongDate(r.consulta.hasta!)}, por fecha operativa y lote.`];
  if (r.filtros_visibles?.lotes.length) out.push(`Lotes solicitados: ${r.filtros_visibles.lotes.map(nombre).join(', ')}.`);
  if (r.estado === 'vacio_verificado') out.push('Sin medición registrada en la población visible y el período consultado.');
  for (const f of r.filas.slice(0, 20)) {
    const guardado = f.valor_ce === null ? f.motivos.includes('ce_null_registrado') ? 'NULL registrado' : 'no calculable' : `${numeroMensaje(f.valor_ce)} dS/m`;
    const ph = f.ph === null ? f.motivos.includes('ph_no_leido') ? 'no leído' : f.motivos.includes('ph_incompatible') ? 'no calculable' : 'NULL registrado' : numeroMensaje(f.ph);
    const ronda = { sin_vinculo: 'sin vínculo a ronda', visible: 'vínculo real a ronda visible', no_legible: 'vínculo a ronda no legible', no_leido: 'vínculo a ronda no leído' }[f.ronda_estado];
    out.push(`- ${nombre(f.lote)} · ${formatLongDate(f.fecha_monitoreo)}: promedio CE guardado ${guardado}; pH: ${ph}; ${ronda}.`);
    if (f.distribucion) {
      const d = f.distribucion;
      out.push(`  Distribución según las bandas del módulo sobre ${numeroMensaje(d.totalArboles)} árboles con lectura: baja ${numeroMensaje(d.pctBajo)} %, en rango ${numeroMensaje(d.pctEnRango)} %, alta ${numeroMensaje(d.pctAlto)} %. Promedio de las medias alta/baja disponibles por árbol: ${numeroMensaje(d.promedio)} dS/m.`);
    } else {
      const causa = f.motivos.includes('lecturas_null_registrado') ? 'lecturas individuales NULL registradas' : f.motivos.includes('lecturas_no_leidas') ? 'lecturas individuales no leídas' : f.motivos.includes('lecturas_vacias') ? 'arreglo de lecturas individuales vacío' : 'lecturas individuales incompatibles o sin población calculable';
      out.push(`  Distribución no calculable: ${causa}; no acredita una distribución en cero.`);
    }
    const arboles = f.num_arboles !== null ? numeroMensaje(f.num_arboles) : f.motivos.includes('num_arboles_no_leido') ? 'no leído' : f.motivos.includes('num_arboles_incompatible') ? 'no calculable' : 'NULL registrado';
    out.push(`  Número de árboles declarado: ${arboles}; no acredita completitud de las lecturas individuales.`);
    if (f.estado !== 'ok') out.push('  Registro parcial: conservo las magnitudes disponibles y separo los datos no calculables.');
  }
  if (r.filas.length > 20) out.push(`Se muestran los primeros ${numeroMensaje(Math.min(20, r.filas.length))} de ${numeroMensaje(r.filas.length)} registros; reduce el período para ver el detalle restante.`);
  if (r.excluidos.padre_no_visible) out.push(`${numeroMensaje(r.excluidos.padre_no_visible)} registros con lote no visible no se publican.`);
  if (r.excluidos.incompatibles) out.push(`${numeroMensaje(r.excluidos.incompatibles)} registros incompatibles para algún cálculo.`);
  if (r.avisos.includes('hasta_recortado_a_hoy')) out.push('La lectura se limita al día de referencia disponible.');
  out.push('Cada registro mantiene separado su promedio guardado y su distribución por árbol. El dato registrado no acredita calibración ni completitud de captura. Las tablas se leyeron por separado, sin garantía de un mismo momento de lectura.');
  return out.join('\n');
}
