import { esNumeroProvisional } from '../importHato/overridesChapeta.ts';
import { rangoQuincena } from '../calculosHato.ts';
import { resolverLitrosQuincenal } from '../hato/litrosQuincenalesPuro.ts';
import { turnoIncompleto } from '../hato/turnoPesaje.ts';
import { resolverSeleccionAnimalesHato } from './hato.ts';
import { validarPesajesLeche, validarQuincenasLeche, validarIngresosLitros } from './lecheFuente.ts';
import { aFechaUTC, esFechaCalendario } from './fechaCalendario.ts';
import type { ConsultaPesajesLeche, DatosPesajesLeche, ResultadoPesajesLeche, FilaPesajeLeche, ConsultaLitrosQuincenales, DatosLitrosQuincenales, ResultadoLitrosQuincenales, FilaLitrosQuincenales, SubtotalesLeche, QuincenaLeche, PesajeLeche } from './lecheTipos.ts';
const suma = (vs: number[]): number | null => {
  if (!vs.length) return null;
  const total = vs.reduce((s, v) => s + v, 0);
  return Number.isFinite(total) ? total : null;
};
const noNegativo = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function filaPesaje(f: PesajeLeche): FilaPesajeLeche {
  const base = { id: f.id, animal_id: f.animal_id, fecha: f.fecha, litros_total: f.litros_total, litros_am: f.litros_am, litros_pm: f.litros_pm, fuente: f.fuente, estado: 'no_calculable' as FilaPesajeLeche['estado'], litros_usable: null as number | null };
  if (!noNegativo(f.litros_total) || [f.litros_am, f.litros_pm].some(v => v !== null && !noNegativo(v))) return base;
  if (turnoIncompleto(f)) return { ...base, estado: 'turno_incompleto' };
  if (f.litros_am !== null && f.litros_pm !== null && Math.abs(f.litros_am + f.litros_pm - f.litros_total) > Number.EPSILON * Math.max(1, f.litros_total, f.litros_am, f.litros_pm) * 8) return base;
  return { ...base, estado: f.litros_am === null ? 'historico_total' : 'completo', litros_usable: f.litros_total };
}
export function ejecutarPesajesLeche(consulta: ConsultaPesajesLeche, datos: DatosPesajesLeche, id: string, hoy: string): ResultadoPesajesLeche {
  const hasta = consulta.hasta > hoy ? hoy : consulta.hasta;
  const r: ResultadoPesajesLeche = { tipo: 'pesajes_leche', id, consulta, estado: 'no_disponible', filas: [], resumen: [], alcance: { desde: consulta.desde, hasta, hasta_recortado_a_hoy: hasta !== consulta.hasta }, avisos: [], fuente: 'lecturas_independientes' };
  const seleccion = resolverSeleccionAnimalesHato(consulta, datos.animales);
  if (seleccion.estado !== 'ok') return { ...r, estado: seleccion.estado, motivo: seleccion.motivo };
  if (!esFechaCalendario(consulta.desde) || !esFechaCalendario(hasta) || consulta.desde > hasta) return { ...r, motivo: 'periodo_sin_observaciones' };
  if (!Array.isArray(datos.pesajes)) return { ...r, motivo: 'pesajes_no_leidos' };
  try { validarPesajesLeche(datos.pesajes); } catch { return { ...r, motivo: 'pesajes_no_leidos' }; }
  const ids = seleccion.animales.map(a => a.id);
  r.filas = datos.pesajes.filter(f => ids.includes(f.animal_id) && f.fecha >= consulta.desde && f.fecha <= hasta).map(filaPesaje).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.animal_id.localeCompare(b.animal_id));
  const dias = Math.round((aFechaUTC(hasta).getTime() - aFechaUTC(consulta.desde).getTime()) / 86400000) + 1;
  r.resumen = seleccion.animales.map(a => {
    const filas = r.filas.filter(f => f.animal_id === a.id), usables = filas.flatMap(f => f.litros_usable === null ? [] : [f.litros_usable]);
    const total = suma(usables);
    if (usables.length && total === null) r.avisos.push('Suma y promedio de muestras no calculables: el agregado excede la representación numérica finita. Las filas observadas se conservan.');
    return { animal_id: a.id, nombre: a.nombre ?? null, numero: a.numero ?? null, suma_muestras: total, promedio_dias_pesados: total === null ? null : total / usables.length, cobertura: { dias_solicitados: dias, dias_con_pesaje: filas.length, dias_sin_fila: dias - filas.length, completos: filas.filter(f => f.estado === 'completo').length, historicos_total: filas.filter(f => f.estado === 'historico_total').length, incompletos: filas.filter(f => f.estado === 'turno_incompleto').length, no_calculables: filas.filter(f => f.estado === 'no_calculable').length } };
  });
  r.estado = !r.filas.length ? 'vacio_verificado' : r.filas.some(f => f.litros_usable === null) || r.avisos.length ? 'parcial' : 'ok';
  if (r.alcance.hasta_recortado_a_hoy) r.avisos.push('El período de pesajes se recortó a hoy en Bogotá.');
  return r;
}
const vacio = (): SubtotalesLeche => ({ medido: { litros: null, quincenas: 0 }, derivado_mensual: { litros: null, quincenas: 0 } });
export function periodoQuincenalAlineado(c: ConsultaLitrosQuincenales): boolean {
  if (!esFechaCalendario(c.desde) || !esFechaCalendario(c.hasta) || c.desde > c.hasta) return false;
  const [anio, mes, dia] = c.hasta.split('-').map(Number);
  return ['01', '16'].includes(c.desde.slice(8)) && (dia === 15 || c.hasta === rangoQuincena(anio, mes, 2).fechaFin);
}
export function quincenasSolicitadas(c: ConsultaLitrosQuincenales): { anio: number; mes: number; quincena: 1 | 2; fechaInicio: string; fechaFin: string }[] {
  if (!periodoQuincenalAlineado(c)) return [];
  const filas = []; let anio = Number(c.desde.slice(0, 4)), mes = Number(c.desde.slice(5, 7));
  while (`${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01` <= c.hasta) {
    for (const quincena of [1, 2] as const) { const rango = rangoQuincena(anio, mes, quincena); if (rango.fechaInicio >= c.desde && rango.fechaFin <= c.hasta) filas.push({ anio, mes, quincena, ...rango }); }
    mes++; if (mes === 13) { mes = 1; anio++; }
  }
  return filas;
}
export function seleccionarQuincenasLeche(c: ConsultaLitrosQuincenales, filas: QuincenaLeche[]): QuincenaLeche[] {
  const claves = new Set(quincenasSolicitadas(c).map(q => `${q.anio}|${q.mes}|${q.quincena}`));
  return filas.filter(f => claves.has(`${f.anio}|${f.mes}|${f.quincena}`));
}
export function ejecutarLitrosQuincenales(consulta: ConsultaLitrosQuincenales, datos: DatosLitrosQuincenales, id: string, hoy: string): ResultadoLitrosQuincenales {
  const r: ResultadoLitrosQuincenales = { tipo: 'litros_quincenales', id, consulta, estado: 'no_disponible', filas: [], subtotales: vacio(), subtotales_abiertos: vacio(), avisos: [], fuente: 'lecturas_independientes' };
  if (!periodoQuincenalAlineado(consulta)) return { ...r, estado: 'aclaracion', motivo: 'granularidad_quincenal' };
  if (!Array.isArray(datos.quincenas) || !esFechaCalendario(hoy)) return { ...r, motivo: 'quincenas_no_leidas' };
  try { validarQuincenasLeche(datos.quincenas); } catch { return { ...r, motivo: 'quincenas_no_leidas' }; }
  let ingresosLeidos = Array.isArray(datos.ingresos);
  if (ingresosLeidos) try { validarIngresosLitros(datos.ingresos!); } catch { ingresosLeidos = false; }
  const seleccion = seleccionarQuincenasLeche(consulta, datos.quincenas);
  for (const periodo of quincenasSolicitadas(consulta)) {
    const f = seleccion.find(f => f.anio === periodo.anio && f.mes === periodo.mes && f.quincena === periodo.quincena);
    const fila: FilaLitrosQuincenales = { id: f?.id ?? null, anio: periodo.anio, mes: periodo.mes, quincena: periodo.quincena, fecha_inicio: periodo.fechaInicio, fecha_fin: periodo.fechaFin, fecha_inicio_registrada: f?.fecha_inicio ?? null, fecha_fin_registrada: f?.fecha_fin ?? null, abierta: periodo.fechaInicio <= hoy && periodo.fechaFin >= hoy, futura: periodo.fechaInicio > hoy, origen_dato: f?.origen_dato ?? null, litros: null, estado: f ? 'no_calculable' : 'sin_fila', vinculo_estado: 'no_aplica', fin_ingreso_id: f?.fin_ingreso_id ?? null, num_vacas_ordeno: f?.num_vacas_ordeno ?? null, num_vacas_ordeno_origen: f?.num_vacas_ordeno_origen ?? null };
    if (f) {
      const ingreso = ingresosLeidos ? datos.ingresos!.find(i => i.id === f.fin_ingreso_id) : undefined;
      if (f.origen_dato === 'medido') fila.vinculo_estado = f.fin_ingreso_id === null ? 'sin_vinculo' : !ingresosLeidos ? 'no_leido' : !ingreso ? 'no_legible' : ingreso.cantidad === null ? 'null_registrado' : 'visible';
      const incoherente = (f.fecha_inicio !== null && f.fecha_inicio !== periodo.fechaInicio) || (f.fecha_fin !== null && f.fecha_fin !== periodo.fechaFin) || !['medido', 'derivado_mensual'].includes(f.origen_dato) || (f.origen_dato === 'medido' ? f.litros_total !== null : !noNegativo(f.litros_total)) || (f.origen_dato === 'medido' && f.fin_ingreso_id !== null && seleccion.filter(q => q.origen_dato === 'medido' && q.fin_ingreso_id === f.fin_ingreso_id).length > 1);
      if (incoherente || fila.futura) fila.motivo = fila.futura ? 'quincena_futura' : 'quincena_incompatible';
      else if (f.origen_dato === 'derivado_mensual') {
        fila.litros = resolverLitrosQuincenal({ origen_dato: 'derivado_mensual', litros_total: f.litros_total, fin_ingreso: null }); fila.estado = 'usable';
      } else {
        fila.estado = 'no_disponible';
        if (fila.vinculo_estado === 'visible' && ingreso) {
          if (noNegativo(ingreso.cantidad)) { fila.litros = resolverLitrosQuincenal({ origen_dato: 'medido', litros_total: f.litros_total, fin_ingreso: { cantidad: ingreso.cantidad } }); fila.estado = 'usable'; }
          else fila.estado = 'no_calculable';
        }
      }
    }
    r.filas.push(fila);
  }
  for (const origen of ['medido', 'derivado_mensual'] as const) for (const abierta of [false, true]) {
    const usables = r.filas.filter(f => f.origen_dato === origen && f.estado === 'usable' && f.abierta === abierta && !f.futura);
    const total = suma(usables.map(f => f.litros!));
    (abierta ? r.subtotales_abiertos : r.subtotales)[origen] = { litros: total, quincenas: usables.length };
    if (usables.length && total === null) r.avisos.push(`Subtotal ${origen} ${abierta ? 'abierto' : 'cerrado'} no calculable: el agregado excede la representación numérica finita. Las filas y los otros subtotales se conservan.`);
  }
  r.estado = r.filas.every(f => f.estado === 'sin_fila') ? 'vacio_verificado' : r.filas.some(f => f.estado !== 'usable' || f.abierta || f.futura) || r.avisos.length ? 'parcial' : 'ok';
  return r;
}
const nombre = (v: string | null) => (v ?? 'Animal sin nombre registrado').replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&');
const numero = (v: number | null) => v === null ? 'sin dato' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(v);
const etiquetaAnimal = (s: {nombre:string|null;numero:number|null}) => `${nombre(s.nombre)}${s.numero===null?'':esNumeroProvisional(s.numero)?` · número provisional ${numero(s.numero)} (número de trabajo)`:` · chapeta ${numero(s.numero)}`}`;
export function renderPesajesLeche(r: ResultadoPesajesLeche): string {
  if (r.estado === 'aclaracion' || r.estado === 'no_resuelto') return 'Necesito precisar un animal por nombre exacto, chapeta o identificador. Los nombres o chapetas repetidos no permiten elegir una ficha.';
  if (r.estado === 'no_disponible') return 'No pude leer los pesajes o la identidad del animal solicitado. No equivale a ausencia ni a cero litros.';
  const out = [`Pesajes de leche del ${r.alcance.desde} al ${r.alcance.hasta}, ambas fechas incluidas.`, ...r.avisos];
  for (const s of r.resumen) { const c = s.cobertura; out.push(`${etiquetaAnimal(s)}: suma de muestras fechadas ${numero(s.suma_muestras)} L; promedio de días pesados ${numero(s.promedio_dias_pesados)} L en ${c.completos + c.historicos_total} días con pesaje usable. Cobertura de ${c.dias_solicitados} días calendario: ${c.dias_con_pesaje} con fila, ${c.dias_sin_fila} sin fila; ${c.completos} con ambos turnos, ${c.historicos_total} históricos de solo total, ${c.incompletos} incompletos y ${c.no_calculables} no calculables.`); }
  for (const f of r.filas.slice(0, 30)) out.push(`${etiquetaAnimal(r.resumen.find(s=>s.animal_id===f.animal_id)!)} · ${f.fecha}: AM ${numero(f.litros_am)} L, PM ${numero(f.litros_pm)} L, total registrado ${numero(f.litros_total)} L; ${f.estado === 'turno_incompleto' ? 'turno incompleto, excluido de la suma' : f.estado === 'historico_total' ? 'jornada histórica de solo total' : f.estado === 'no_calculable' ? 'registro incompatible, excluido de la suma' : 'ambos turnos completos'}; fuente ${nombre(f.fuente)}.`);
  if (r.filas.length > 30) out.push('Se muestran hasta treinta registros; reduce el período para ver más detalle.');
  out.push('Son muestras fechadas; no son ventas ni una serie continua de producción. Un día sin fila no representa cero ni prueba una jornada programada incumplida; el turno NULL no es cero.'); return out.join('\n');
}
export function renderLitrosQuincenales(r: ResultadoLitrosQuincenales): string {
  if (r.estado === 'aclaracion') return 'La fuente tiene granularidad de quincenas completas. Indica un período que empiece el día 1 o 16 y termine el 15 o el último día del mes; no prorrateo litros para un rango parcial.';
  if (r.estado === 'no_disponible') return 'No pude leer las quincenas de leche. No equivale a cero litros ni a un período sin producción.';
  const out = [`Litros de leche quincenales del ${r.consulta.desde} al ${r.consulta.hasta}; períodos completos, sin prorrateo.`,...r.avisos];
  for (const origen of ['medido', 'derivado_mensual'] as const) { const s = r.subtotales[origen], a = r.subtotales_abiertos[origen], label = origen === 'medido' ? 'medidos del ingreso vinculado' : 'derivados de la partición mensual'; out.push(`Litros ${label}: subtotal de ${s.quincenas} quincenas cerradas ${numero(s.litros)} L; observado de ${a.quincenas} quincenas abiertas ${numero(a.litros)} L, separado del subtotal cerrado.`); }
  const estados = { visible: 'ingreso vinculado visible', sin_vinculo: 'sin vínculo registrado', no_legible: 'vínculo presente, ingreso no legible', no_leido: 'ingreso no leído', null_registrado: 'cantidad NULL registrada', no_aplica: 'partición local o sin fila de quincena' };
  for (const f of r.filas.slice(0, 30)) out.push(`${f.fecha_inicio} a ${f.fecha_fin}: ${f.origen_dato === 'medido' ? 'medido' : f.origen_dato === 'derivado_mensual' ? 'derivado mensual' : 'sin origen usable'}, ${numero(f.litros)} L; ${f.estado === 'sin_fila' ? 'sin fila' : f.estado === 'no_calculable' ? 'registro no calculable' : f.estado === 'no_disponible' ? 'dato no disponible' : 'dato observado'}${f.abierta ? ', quincena abierta' : ''}${f.futura ? ', período futuro' : ''}; ${estados[f.vinculo_estado]}${f.motivo === 'quincena_incompatible' ? '; período, origen o vínculo incompatible' : ''}.`);
  if (r.filas.length > 30) out.push('Se muestran hasta treinta quincenas; reduce el período para ver más detalle.');
  out.push('Un período faltante o abierto no representa producción cero ni permite una comparación negativa. Los orígenes permanecen separados y no se suman con pesajes. El número de vacas ausente permanece sin dato.'); return out.join('\n');
}
