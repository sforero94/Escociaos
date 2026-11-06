import { etiquetaEstadoReproductivo, type HatoConfig } from '../calculosHato.ts';
import { clasificarAnimalHato, construirUmbralesCategoriaHatoDesdeFilas, type FilaClasificacionHato, type UmbralesCategoriaHato } from '../hatoCategorias.ts';
import { construirHatoConfigDesdeFilas } from '../hatoConfigDesdeTabla.ts';
import { esNumeroProvisional } from '../importHato/overridesChapeta.ts';
import { formatLongDate } from '../formatPuro.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import type { AnimalHato, ConsultaHato, DatosHato, HechosReproduccionHato, ParienteHato, RegistroVistaHato, ReproduccionHato, ResultadoHato } from './hatoTipos.ts';
const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const nombre = (v: string | null | undefined, base = 'Animal sin nombre registrado') => (v ?? base).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&') || base;
const idsValidos = (rs: { id: string }[]) => rs.every(r => r && esUuid(r.id)) && new Set(rs.map(r => r.id.toLowerCase())).size === rs.length;
const entero = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const texto = (v: unknown) => v === null ? null : typeof v === 'string' ? v : undefined;
const fecha = (v: unknown) => v === null ? null : esFechaCalendario(v) ? v : undefined;
const referencia = (v: unknown) => v === null ? null : esUuid(v) ? v.toLowerCase() : undefined;
const opcion = (v: unknown, valores: readonly string[], nullable = true) => v === null && nullable ? null : typeof v === 'string' && valores.includes(v) ? v : undefined;
const ETAPAS = ['ternera', 'novilla', 'vaca', 'toro'];
const ESTADOS = ['activa', 'vendida', 'muerta', 'descartada'];
/** Lista cerrada también en el ejecutor puro: ningún campo libre del transporte se publica. */
function fichaSegura(a: AnimalHato): Omit<AnimalHato, 'id'> {
  return {
    nombre: texto(a.nombre), numero: a.numero === null ? null : entero(a.numero) ? a.numero : undefined,
    sexo: opcion(a.sexo, ['hembra', 'macho']), etapa: opcion(a.etapa, ETAPAS, false), raza: texto(a.raza), estado: opcion(a.estado, ESTADOS, false),
    fecha_estado: fecha(a.fecha_estado), fecha_nacimiento: fecha(a.fecha_nacimiento), fecha_nacimiento_confianza: opcion(a.fecha_nacimiento_confianza, ['exacta', 'aproximada', 'desconocida'], false),
    madre_id: referencia(a.madre_id), padre_id: referencia(a.padre_id), padre_toro_id: referencia(a.padre_toro_id), finca_id: referencia(a.finca_id),
    origen: opcion(a.origen, ['nacimiento', 'compra', 'importacion_historica']), confianza: opcion(a.confianza, ['alta', 'media', 'baja'], false), etapa_forzada: typeof a.etapa_forzada === 'boolean' ? a.etapa_forzada : undefined,
  };
}
function pariente(id: string | null | undefined, catalogo: { id: string; nombre?: string | null; numero?: number | null }[] | undefined): ParienteHato {
  if (id === null) return { estado: 'sin_vinculo' };
  if (id === undefined || !Array.isArray(catalogo) || !idsValidos(catalogo)) return { estado: 'no_leido' };
  const p = catalogo.find(x => x.id === id);
  if (!p) return { estado: 'no_legible' };
  if (p.nombre === undefined || p.nombre !== null && typeof p.nombre !== 'string') return { estado: 'no_leido' };
  return { estado: 'visible', nombre: p.nombre, ...(p.numero === null || entero(p.numero) ? { numero: p.numero } : {}) };
}
const FECHAS_VISTA = ['ultimo_chequeo_fecha', 'ultimo_servicio_fecha', 'ultimo_parto_fecha', 'ultimo_secado_real_fecha', 'ultima_confirmacion_prenez_fecha', 'ultimo_evento_fecha', 'ultimo_aborto_fecha', 'fecha_nacimiento'] as const;
function vistaValida(r: RegistroVistaHato, a: Omit<AnimalHato, 'id'>, hoy: string): r is RegistroVistaHato & FilaClasificacionHato {
  if (!entero(r.num_partos) || !ETAPAS.includes(r.etapa as string) || !ESTADOS.includes(r.estado as string) || typeof r.etapa_forzada !== 'boolean' || r.raza !== null && typeof r.raza !== 'string') return false;
  if (FECHAS_VISTA.some(k => r[k] !== null && !esFechaCalendario(r[k]))) return false;
  // Los hechos futuros no acreditan un estado actual. Nacimiento conserva el fallback del motor.
  if (FECHAS_VISTA.some(k => k !== 'fecha_nacimiento' && typeof r[k] === 'string' && (r[k] as string) > hoy)) return false;
  if (r.ultima_confirmacion_prenez_metodo !== null && !['presuncion', 'palpacion'].includes(r.ultima_confirmacion_prenez_metodo as string)) return false;
  if (r.ultimo_estado_chequeo !== null && !['vacia_apta', 'vacia_problema', 'fecha_heredada', 'desconocido', 'vacio'].includes(r.ultimo_estado_chequeo as string)) return false;
  // Las lecturas son independientes: una discrepancia no se resuelve eligiendo una fuente.
  return (['etapa', 'estado', 'raza', 'etapa_forzada', 'fecha_nacimiento'] as const).every(k => r[k] === a[k]);
}
/** Hechos ya proyectados por la vista; no agrega historial ni completa fechas ausentes. */
function hechosRegistrados(vista: RegistroVistaHato | undefined): HechosReproduccionHato | null {
  if (!vista) return null;
  const metodo = vista.ultima_confirmacion_prenez_metodo;
  const estadoChequeo = opcion(vista.ultimo_estado_chequeo, ['vacia_apta', 'vacia_problema', 'fecha_heredada', 'desconocido', 'vacio']);
  return {
    ultimo_parto_fecha: fecha(vista.ultimo_parto_fecha), ultimo_servicio_fecha: fecha(vista.ultimo_servicio_fecha),
    ultima_confirmacion_prenez_fecha: fecha(vista.ultima_confirmacion_prenez_fecha),
    ultima_confirmacion_prenez_metodo: metodo === null || metodo === 'presuncion' || metodo === 'palpacion' ? metodo : undefined,
    ultimo_secado_real_fecha: fecha(vista.ultimo_secado_real_fecha), ultimo_aborto_fecha: fecha(vista.ultimo_aborto_fecha),
    ultimo_chequeo_fecha: fecha(vista.ultimo_chequeo_fecha), ultimo_evento_fecha: fecha(vista.ultimo_evento_fecha),
    ultimo_estado_chequeo: estadoChequeo as HechosReproduccionHato['ultimo_estado_chequeo'],
  };
}
function finitos(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(finitos);
  return !v || typeof v !== 'object' || Object.values(v).every(finitos);
}
function configValida(datos: DatosHato): { config: HatoConfig; umbrales: UmbralesCategoriaHato } | null {
  const filas = datos.config;
  if (!Array.isArray(filas) || filas.some(f => !f || typeof f.clave !== 'string' || !f.clave.trim() || f.valor === undefined) || new Set(filas.map(f => f.clave)).size !== filas.length) return null;
  try {
    const config = construirHatoConfigDesdeFilas(filas), umbrales = construirUmbralesCategoriaHatoDesdeFilas(filas);
    return finitos(config) && finitos(umbrales) ? { config, umbrales } : null;
  } catch { return null; }
}
export function ejecutarHato(consulta: ConsultaHato, datos: DatosHato, id: string, hoy: string): ResultadoHato {
  const base: ResultadoHato = { tipo: 'hato', id, consulta, fecha_referencia: hoy, estado: 'no_disponible', filas: [], fuente: 'lecturas_independientes' };
  if (!consulta.animal_ids.length && !consulta.nombres.length && !consulta.chapetas.length) return { ...base, estado: 'aclaracion', motivo: 'animal_sin_precisar' };
  if (!esFechaCalendario(hoy) || !Array.isArray(datos.animales) || !idsValidos(datos.animales)) return { ...base, motivo: 'fichas_no_leidas' };
  const animales = datos.animales;
  if (consulta.nombres.length && animales.some(a => a.nombre === undefined) || consulta.chapetas.length && animales.some(a => a.numero === undefined)) return { ...base, motivo: 'selector_no_leido' };
  const ids = [...consulta.animal_ids];
  if (ids.some(i => !animales.some(a => a.id === i))) return { ...base, motivo: 'animal_no_visible' };
  for (const [valores, coincide] of [
    [consulta.nombres, (a: AnimalHato, v: string | number) => typeof a.nombre === 'string' && normalizar(a.nombre) === normalizar(String(v))],
    [consulta.chapetas, (a: AnimalHato, v: string | number) => a.numero === v],
  ] as const) for (const valor of valores) {
    const opciones = animales.filter(a => coincide(a, valor));
    if (opciones.length !== 1) return { ...base, estado: 'no_resuelto', motivo: 'animal_ambiguo_o_ausente' };
    ids.push(opciones[0].id);
  }
  const configuracion = configValida(datos);
  const estadosLeidos = Array.isArray(datos.estados) && datos.estados.every(r => r && esUuid(r.animal_id)) && new Set(datos.estados.map(r => r.animal_id.toLowerCase())).size === datos.estados.length;
  for (const a of animales.filter(a => ids.includes(a.id))) {
    const ficha = fichaSegura(a);
    const parentescos = { madre: pariente(ficha.madre_id, animales), padre: pariente(ficha.padre_id, animales), padre_toro: pariente(ficha.padre_toro_id, datos.toros) };
    const campos_no_leidos = Object.entries(ficha).filter(([, v]) => v === undefined).map(([k]) => k);
    const vista = estadosLeidos ? datos.estados!.find(r => r.animal_id === a.id) : undefined;
    const num_partos_estado: ReproduccionHato['num_partos_estado'] = !vista ? estadosLeidos ? 'sin_fila' : 'no_leido' : vista.num_partos === undefined ? 'no_leido' : vista.num_partos === null ? 'null_registrado' : entero(vista.num_partos) ? 'valor' : 'no_calculable';
    const reproduccion: ReproduccionHato = { estado: 'no_disponible', hechos: hechosRegistrados(vista), num_partos_estado, num_partos: vista && entero(vista.num_partos) ? vista.num_partos : null, derivado: null, categoria: null, categoria_origen: null, subetapa_ternera: null };
    if (!vista) reproduccion.motivo = estadosLeidos ? 'sin_fila_vista' : 'vista_no_leida';
    else if (!vistaValida(vista, ficha, hoy)) reproduccion.motivo = 'hechos_no_calculables';
    else if (!configuracion) reproduccion.motivo = 'config_no_disponible';
    else try {
      const clasificado = clasificarAnimalHato(vista, configuracion.config, configuracion.umbrales, hoy);
      const d = clasificado.derivado;
      if (!finitos(clasificado) || [d.fecha_secar, d.fecha_probable_parto, d.senal_revision?.fecha ?? null].some(f => f !== null && !esFechaCalendario(f))) throw Error('derivado_no_calculable');
      Object.assign(reproduccion, { estado: 'ok', derivado: d, categoria: clasificado.categoria, categoria_origen: clasificado.categoriaOrigen, subetapa_ternera: clasificado.subetapaTernera });
    } catch { reproduccion.motivo = 'derivado_no_calculable'; }
    const incompleta = campos_no_leidos.length > 0 || Object.values(parentescos).some(p => p.estado === 'no_leido' || p.estado === 'no_legible') || reproduccion.estado !== 'ok';
    base.filas.push({ animal_id: a.id, nombre: ficha.nombre ?? null, numero: ficha.numero ?? null, numero_provisional: esNumeroProvisional(ficha.numero ?? null), ficha: { ...ficha, campos_no_leidos, parentescos }, reproduccion, estado: incompleta ? 'parcial' : 'ok' });
  }
  base.estado = base.filas.some(f => f.estado === 'parcial') ? 'parcial' : base.filas.length ? 'ok' : 'vacio_verificado';
  return base;
}
function etiquetaPariente(p: ParienteHato): string {
  if (p.estado !== 'visible') return { sin_vinculo: 'sin vínculo registrado', no_legible: 'vínculo presente, animal no legible', no_leido: 'vínculo o catálogo no leído' }[p.estado];
  const chapeta = p.numero === undefined ? '' : p.numero === null ? ' · sin chapeta registrada' : esNumeroProvisional(p.numero) ? ` · número provisional ${numeroMensaje(p.numero)}` : ` · chapeta ${numeroMensaje(p.numero)}`;
  return `${nombre(p.nombre)}${chapeta}`;
}
export function renderHato(r: ResultadoHato): string {
  if (r.estado === 'aclaracion') return 'Necesito precisar el animal: indica su nombre exacto, su chapeta o su identificador.';
  if (r.estado === 'no_resuelto') return 'Necesito precisar el animal: el nombre o la chapeta no resuelve una única ficha visible. No puedo elegir entre nombres o chapetas repetidos.';
  if (r.estado === 'no_disponible') return 'No pude leer la ficha solicitada del hato. No equivale a un animal ausente ni a cero partos.';
  const out = [`Hato lechero: ficha y estado reproductivo actual al ${formatLongDate(r.fecha_referencia)} (Bogotá).`];
  for (const f of r.filas.slice(0, 20)) {
    const a = f.ficha;
    const chapeta = a.numero === undefined ? 'chapeta no leída' : f.numero === null ? 'sin chapeta registrada' : f.numero_provisional ? `número provisional ${numeroMensaje(f.numero)} (número de trabajo)` : `chapeta ${numeroMensaje(f.numero)}`;
    out.push(`- ${a.nombre === undefined ? 'Nombre no leído' : nombre(f.nombre)} · ${chapeta}.`);
    const campo = (v: string | null | undefined) => v === undefined ? 'no leído' : v === null ? 'NULL registrado' : nombre(v);
    out.push(`  Ficha registrada: estado ${campo(a.estado)}; etapa manual ${campo(a.etapa)}${a.etapa_forzada === true ? ' (forzada explícitamente)' : ''}; sexo ${campo(a.sexo)}; raza ${campo(a.raza)}.`);
    const nacimiento = a.fecha_nacimiento === undefined ? 'no leído' : a.fecha_nacimiento === null ? 'sin fecha registrada' : formatLongDate(a.fecha_nacimiento);
    out.push(`  Nacimiento: ${nacimiento}; confianza de fecha: ${campo(a.fecha_nacimiento_confianza)}. Origen: ${campo(a.origen)}; confianza de identidad: ${campo(a.confianza)}.`);
    out.push(`  Madre: ${etiquetaPariente(a.parentescos.madre)}. Padre del hato: ${etiquetaPariente(a.parentescos.padre)}. Toro padre: ${etiquetaPariente(a.parentescos.padre_toro)}.`);
    const repro = f.reproduccion;
    const disponibilidadPartos = { valor: '', null_registrado: 'NULL registrado', no_leido: 'campo no leído', sin_fila: 'sin fila visible tras lectura completa', no_calculable: 'dato no calculable' }[repro.num_partos_estado];
    out.push(repro.num_partos === null ? `  Partos registrados: ${disponibilidadPartos}; no representa cero.` : `  Partos registrados en la vista: ${numeroMensaje(repro.num_partos)}.`);
    if (repro.hechos) {
      const h = repro.hechos;
      const fechas: [string, string | null | undefined][] = [
        ['Último parto registrado', h.ultimo_parto_fecha], ['Último servicio registrado', h.ultimo_servicio_fecha],
        ['Última marca de preñez registrada', h.ultima_confirmacion_prenez_fecha], ['Último secado real registrado', h.ultimo_secado_real_fecha],
        ['Último aborto registrado', h.ultimo_aborto_fecha], ['Último chequeo registrado', h.ultimo_chequeo_fecha], ['Último evento registrado', h.ultimo_evento_fecha],
      ];
      for (const [etiqueta, value] of fechas) {
        const registrado = value === undefined ? 'no leído' : value === null ? 'NULL registrado (sin fecha registrada)' : `${formatLongDate(value)}${value > r.fecha_referencia ? ' (posterior al corte; no se usa para derivar el estado actual)' : ''}`;
        out.push(`  ${etiqueta}: ${registrado}.`);
      }
      const metodo = h.ultima_confirmacion_prenez_metodo === undefined ? 'no leído' : h.ultima_confirmacion_prenez_metodo === null ? 'NULL registrado (sin método registrado)' : h.ultima_confirmacion_prenez_metodo === 'palpacion' ? 'palpación' : 'presunción';
      out.push(`  Método registrado de la marca de preñez: ${metodo}.`);
      out.push(`  Estado del último chequeo registrado: ${campo(h.ultimo_estado_chequeo)}.`);
    }
    if (repro.estado !== 'ok' || !repro.derivado) {
      const motivo = repro.motivo === 'sin_fila_vista' ? 'sin fila visible en la vista leída' : repro.motivo === 'vista_no_leida' ? 'vista no leída' : repro.motivo === 'config_no_disponible' ? 'configuración no disponible o incompatible' : 'hechos no leídos o no calculables';
      out.push(`  Estado reproductivo derivado no disponible: ${motivo}. La ficha conserva sus datos registrados.`);
      continue;
    }
    const d = repro.derivado;
    const estado = d.estado === 'servida' ? 'Servida (presunción)' : `${etiquetaEstadoReproductivo(d.estado)}${d.estado === 'parida_reciente' ? ' (posparto; parida reciente)' : ''}`;
    out.push(`  Estado reproductivo derivado: ${estado}; categoría ${repro.categoria ?? 'fuera del inventario activo'}${repro.categoria_origen ? ` (${repro.categoria_origen === 'calculado' ? 'calculada' : 'etapa manual'})` : ''}${repro.subetapa_ternera ? `; subetapa ${repro.subetapa_ternera}` : ''}.`);
    if (d.fecha_probable_parto) out.push(`  Parto probable calculado: ${formatLongDate(d.fecha_probable_parto)}.`);
    if (d.fecha_secar) out.push(`  Fecha de secado prevista por el motor: ${formatLongDate(d.fecha_secar)}.`);
    if (d.dias_abiertos !== null) out.push(`  Días abiertos: ${numeroMensaje(d.dias_abiertos)}.`);
    if (d.tiempo_prenez_dias !== null) out.push(`  Tiempo de preñez derivado: ${numeroMensaje(d.tiempo_prenez_dias)} días.`);
    if (d.tiempo_secada_dias !== null) out.push(`  Tiempo desde secado real: ${numeroMensaje(d.tiempo_secada_dias)} días.`);
    if (d.senal_revision) out.push(`  Señal de revisión del motor: ${d.senal_revision.tipo === 'aborto' ? 'aborto registrado' : 'evento posterior al ciclo clasificado'}, ${formatLongDate(d.senal_revision.fecha)}.`);
    if (d.vacia_es_problema !== null) out.push(`  Clasificación del módulo para la vacía: ${d.vacia_es_problema ? 'señal de problema' : 'sin señal de problema'}.`);
  }
  if (r.filas.length > 20) out.push(`Se muestran ${numeroMensaje(Math.min(20, r.filas.length))} de ${numeroMensaje(r.filas.length)} fichas; reduce la selección para ver el resto.`);
  out.push('Las fechas probables son cálculos del módulo, no hechos confirmados. La vista describe el estado actual; no reconstruye un estado histórico ni acredita completitud de captura. Las tablas se leyeron por separado, sin garantía de un mismo momento de lectura.');
  return out.join('\n');
}
