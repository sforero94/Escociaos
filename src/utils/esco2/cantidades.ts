// Strict saved-source preconditions, original calculator calls, ID/unit aggregation.
import { calcularFertilizacion, calcularFumigacion, unidadAplicacion } from '../calculosAplicaciones.ts';
import { formatLongDate } from '../formatPuro.ts';
import { numeroMensaje as valor } from './formatoMensaje.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import type { BaseLoteCantidad, CalculoCantidad, CantidadPorLote, ConsultaCantidadesAplicacion, DatosCantidadesAplicacion, EstadoCantidad, ProductoPlanCantidad, RecipienteGuardado, ResultadoCantidadesAplicacion, UnidadCantidad } from './cantidadesTipos.ts';

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const unidad = (v: unknown): UnidadCantidad | null => v === 'Kilos' ? 'kg' : v === 'Litros' ? 'L' : v === 'Unidades' ? 'unidades' : null;
const idsValidos = (rows: { id: string }[]) => rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id)).size === rows.length;
function dentro<T extends { id: string }>(rows: T[] | undefined, ref: keyof T, ids: Set<string>): T[] | undefined {
  return rows && rows.every(r => r && esUuid(r[ref])) ? rows.filter(r => ids.has(r[ref] as string)) : undefined;
}
function problemas(campos: Record<string, unknown>): string[] {
  return Object.entries(campos).filter(([, v]) => !numero(v)).map(([k, v]) => `${k}:${v === null ? 'null' : v === undefined ? 'no_leido' : 'invalido'}`);
}
function estadoDe(motivos: string[]): EstadoCantidad {
  return motivos.some(m => /no_leido|invalido|no_disponible/.test(m)) ? 'no_leido' : motivos.some(m => /incompatible/.test(m)) ? 'incompatible' : motivos.length ? 'sin_dato' : 'conocido';
}
function agregarFilas(filas: CantidadPorLote[]): CantidadPorLote[] {
  const grupos = new Map<string, CantidadPorLote>();
  for (const f of filas) {
    const key = JSON.stringify([f.lote_id, f.producto_id, f.unidad]);
    const prev = grupos.get(key);
    if (!prev) grupos.set(key, { ...f, motivos: [...f.motivos], fuentes: [...f.fuentes] });
    else {
      prev.cantidad = prev.cantidad === null || f.cantidad === null ? null : prev.cantidad + f.cantidad;
      prev.motivos.push(...f.motivos); prev.fuentes.push(...f.fuentes);
      if (prev.cantidad !== null && !numero(prev.cantidad)) { prev.cantidad = null; prev.motivos.push('cantidad_acumulada:invalido'); }
      prev.estado = estadoDe(prev.motivos);
    }
  }
  return [...grupos.values()];
}
function conflictosUnidad(filas: CantidadPorLote[], motivos: string[]): void {
  const unidades = new Map<string, Set<UnidadCantidad>>();
  for (const f of filas) if (f.unidad) { const xs = unidades.get(f.producto_id) ?? new Set(); xs.add(f.unidad); unidades.set(f.producto_id, xs); }
  for (const [producto, xs] of unidades) if (xs.size > 1) {
    motivos.push(`unidad_incompatible:${producto}`);
    for (const f of filas.filter(f => f.producto_id === producto)) { f.cantidad = null; f.estado = 'incompatible'; f.motivos.push('unidad_incompatible_entre_fuentes'); }
  }
}
function recipiente(lote_id: string | null, fila: { id: string; numero_canecas?: number | null; numero_bultos?: number | null }, tipo: string | null | undefined, masa?: CalculoCantidad): RecipienteGuardado {
  const valido = ['Fumigación', 'Drench', 'Fertilización'].includes(tipo!);
  const u = valido ? unidadAplicacion(tipo) : null;
  const valor = u === 'canecas' ? fila.numero_canecas : u === 'bultos' ? fila.numero_bultos : undefined;
  const motivos = valido ? problemas({ [u!]: valor }) : ['tipo_incompatible'];
  const mezcla = masa && valido ? { unidad: u === 'canecas' ? 'L de mezcla' as const : 'kg de mezcla' as const, cantidad: u === 'canecas' ? masa.litros_mezcla : masa.kilos_totales } : undefined;
  return { lote_id, unidad: u, cantidad: numero(valor) ? valor : null, estado: estadoDe(motivos), motivos, fuentes: [fila.id], ...(mezcla ? { mezcla_litros_kilos: { unidad: mezcla.unidad, cantidad: numero(mezcla.cantidad) ? mezcla.cantidad : null, estado: estadoDe(problemas({ mezcla_guardada: mezcla.cantidad })) } } : {}) };
}
function exacto(c: CalculoCantidad, b: BaseLoteCantidad | undefined, p: ProductoPlanCantidad, tipo: string | null | undefined, nombreLote?: string | null): { cantidad: number | null; motivos: string[] } {
  const motivos: string[] = [];
  if (!b) return { cantidad: null, motivos: ['base_lote:sin_fila'] };
  motivos.push(...problemas({ 'calculo.total_arboles': c.total_arboles, 'base.total_arboles': b.total_arboles }));
  if (numero(c.total_arboles) && numero(b.total_arboles) && c.total_arboles !== b.total_arboles) motivos.push('total_arboles:incoherente');
  const u = unidad(p.producto_unidad);
  if (tipo === 'Fumigación' || tipo === 'Drench') {
    motivos.push(...problemas({ calibracion_litros_arbol: b.calibracion_litros_arbol, tamano_caneca: b.tamano_caneca, dosis_por_caneca: p.dosis_por_caneca }));
    if (b.tamano_caneca === 0) motivos.push('tamano_caneca:invalido');
    if (!u) motivos.push(`unidad_producto:${p.producto_unidad === null ? 'null' : p.producto_unidad === undefined ? 'no_leido' : 'incompatible'}`);
    if (p.unidad_dosis === null || p.unidad_dosis === undefined) motivos.push(`unidad_dosis:${p.unidad_dosis === null ? 'null' : 'no_leido'}`);
    else if (u && !((u === 'L' && p.unidad_dosis === 'cc') || (u === 'kg' && (p.unidad_dosis === 'g' || p.unidad_dosis === 'gramos')))) motivos.push('unidad_dosis:incompatible');
    if (motivos.length) return { cantidad: null, motivos };
    const r = calcularFumigacion({ lote_id: c.lote_id, ...(typeof nombreLote === 'string' ? { nombre: nombreLote } : {}), conteo_arboles: { total: b.total_arboles! }, calibracion_litros_arbol: b.calibracion_litros_arbol!, tamano_caneca: b.tamano_caneca! }, { productos: [{ producto_id: p.producto_id, dosis_por_caneca: p.dosis_por_caneca! }] });
    return numero(r.productos[0].cantidad_necesaria) ? { cantidad: r.productos[0].cantidad_necesaria, motivos } : { cantidad: null, motivos: ['resultado_motor:invalido'] };
  }
  if (tipo === 'Fertilización') {
    motivos.push(...problemas({ arboles_grandes: b.arboles_grandes, arboles_medianos: b.arboles_medianos, arboles_pequenos: b.arboles_pequenos, arboles_clonales: b.arboles_clonales, dosis_grandes: p.dosis_grandes, dosis_medianos: p.dosis_medianos, dosis_pequenos: p.dosis_pequenos, dosis_clonales: p.dosis_clonales }));
    if (u !== 'kg' && u !== 'L') motivos.push(`unidad_producto:${p.producto_unidad === null ? 'null' : p.producto_unidad === undefined ? 'no_leido' : 'incompatible'}`);
    if (numero(b.arboles_grandes) && numero(b.arboles_medianos) && numero(b.arboles_pequenos) && numero(b.arboles_clonales) && b.arboles_grandes + b.arboles_medianos + b.arboles_pequenos + b.arboles_clonales !== b.total_arboles) motivos.push('clases_arboles:incoherentes');
    if (motivos.length) return { cantidad: null, motivos };
    const r = calcularFertilizacion({ lote_id: c.lote_id, ...(typeof nombreLote === 'string' ? { nombre: nombreLote } : {}), conteo_arboles: { grandes: b.arboles_grandes!, medianos: b.arboles_medianos!, pequenos: b.arboles_pequenos!, clonales: b.arboles_clonales!, total: b.total_arboles! } }, { productos: [{ producto_id: p.producto_id, dosis_grandes: p.dosis_grandes!, dosis_medianos: p.dosis_medianos!, dosis_pequenos: p.dosis_pequenos!, dosis_clonales: p.dosis_clonales! }] });
    return numero(r.productos[0].cantidad_necesaria) ? { cantidad: r.productos[0].cantidad_necesaria, motivos } : { cantidad: null, motivos: ['resultado_motor:invalido'] };
  }
  return { cantidad: null, motivos: [`tipo_aplicacion:${tipo === null ? 'null' : tipo === undefined ? 'no_leido' : 'incompatible'}`] };
}
export function ejecutarCantidadesAplicacion(consulta: ConsultaCantidadesAplicacion, d: DatosCantidadesAplicacion, id: string, hoy?: string): ResultadoCantidadesAplicacion {
  const r: ResultadoCantidadesAplicacion = { tipo: 'cantidades_aplicacion', id, consulta, estado: d.seleccion === 'no_resuelto' ? 'no_resuelto' : 'no_disponible', aplicacion: d.aplicacion, plan: { estado: 'no_leido', filas: [], totales_guardados: [], conciliacion: [], recipientes: [], motivos: [] }, ejecucion: { estado: 'no_leido', filas: [], recipientes: [], motivos: [] }, fuente: 'lecturas_independientes' };
  if (d.seleccion !== 'ok' || !d.aplicacion || !esUuid(d.aplicacion.id)) return r;
  const identidad = resolverIdentidadAplicaciones({ aplicacion_ids: consulta.aplicacion_id ? [consulta.aplicacion_id] : [], aplicaciones: consulta.aplicacion ? [consulta.aplicacion] : [] }, [d.aplicacion]);
  if (identidad.estado !== 'ok') { r.estado = identidad.estado === 'no_resuelto' ? 'no_resuelto' : 'no_disponible'; r.aplicacion = undefined; return r; }
  const app = d.aplicacion, tipo = app.tipo_aplicacion;
  const nombreLote = (lote: string | null) => lote === null ? null : d.lotes?.find(l => l.id === lote)?.nombre;
  const padres = new Set([app.id]);
  const mezclas = dentro(d.mezclas, 'aplicacion_id', padres);
  const calculos = dentro(d.calculos, 'aplicacion_id', padres);
  const bases = dentro(d.bases_lotes, 'aplicacion_id', padres);
  const mixIds = new Set(mezclas?.map(m => m.id));
  const productos = dentro(d.productos_plan, 'mezcla_id', mixIds);
  if (calculos && idsValidos(calculos) && calculos.every(c => esUuid(c.lote_id)) && new Set(calculos.map(c => c.lote_id)).size === calculos.length)
    r.plan.recipientes = calculos.map(c => recipiente(c.lote_id, c, tipo, c));
  else r.plan.motivos.push('calculos:no_leido');
  if (mezclas && idsValidos(mezclas) && productos && idsValidos(productos) && new Set(productos.map(p => `${p.mezcla_id}:${p.producto_id}`)).size === productos.length && productos.every(p => esUuid(p.producto_id))) {
    r.plan.totales_guardados = productos.map(p => {
      const motivos = problemas({ cantidad_total_necesaria: p.cantidad_total_necesaria });
      if (!unidad(p.producto_unidad)) motivos.push(`unidad_producto:${p.producto_unidad === null ? 'null' : p.producto_unidad === undefined ? 'no_leido' : 'incompatible'}`);
      return { mezcla_id: p.mezcla_id, producto_id: p.producto_id, unidad: unidad(p.producto_unidad), cantidad: motivos.length ? null : p.cantidad_total_necesaria!, estado: estadoDe(motivos), motivos };
    });
    if (tipo === 'Fertilización' && productos.some(p => unidad(p.producto_unidad) !== 'kg')) r.plan.motivos.push('mezcla_fertilizacion:unidad_fisica_no_verificada');
    if (calculos && idsValidos(calculos) && new Set(calculos.map(c => c.lote_id)).size === calculos.length && calculos.every(c => esUuid(c.lote_id)) && bases && idsValidos(bases) && bases.every(b => esUuid(b.lote_id)) && new Set(bases.map(b => b.lote_id)).size === bases.length) {
      const unmapped = calculos.filter(c => !c.mezcla_id || !mixIds.has(c.mezcla_id));
      for (const c of unmapped) r.plan.motivos.push(`mezcla_id:${c.mezcla_id === null ? 'null' : c.mezcla_id === undefined ? 'no_leido' : 'no_disponible'}:${c.id}`);
      const aportes: (CantidadPorLote & { mezcla_id: string })[] = [];
      for (const c of calculos.filter(c => c.mezcla_id && mixIds.has(c.mezcla_id))) {
        const b = bases.find(b => b.lote_id === c.lote_id);
        for (const p of productos.filter(p => p.mezcla_id === c.mezcla_id)) {
          const e = exacto(c, b, p, tipo, nombreLote(c.lote_id));
          aportes.push({ lote_id: c.lote_id, producto_id: p.producto_id, producto_nombre: p.producto_nombre, lote_nombre: nombreLote(c.lote_id), unidad: unidad(p.producto_unidad), cantidad: e.cantidad, estado: estadoDe(e.motivos), motivos: e.motivos, fuentes: [c.id, p.id, ...(b ? [b.id] : [])], mezcla_id: p.mezcla_id });
        }
      }
      r.plan.filas = agregarFilas(aportes);
      conflictosUnidad(r.plan.filas, r.plan.motivos);
      for (const g of r.plan.totales_guardados) {
        const fs = aportes.filter(f => f.mezcla_id === g.mezcla_id && f.producto_id === g.producto_id);
        const completo = !unmapped.length && fs.length > 0 && fs.every(f => f.cantidad !== null) && !r.plan.motivos.includes(`unidad_incompatible:${g.producto_id}`);
        const suma = completo ? fs.reduce((sum, f) => sum + f.cantidad!, 0) : null;
        const reconstruido = numero(suma) ? suma : null;
        const residuoMaquina = reconstruido !== null && g.cantidad !== null ? Number.EPSILON * (fs.length + 1) * Math.max(Math.abs(g.cantidad), reconstruido) : 0;
        r.plan.conciliacion.push({ mezcla_id: g.mezcla_id, producto_id: g.producto_id, unidad: g.unidad, guardado: g.cantidad, reconstruido, estado: reconstruido === null || g.cantidad === null ? 'no_verificable' : Math.abs(reconstruido - g.cantidad) <= residuoMaquina ? 'coincide' : 'discrepancia' });
      }
      const vacio = !productos.length;
      if (!vacio && !calculos.length) r.plan.motivos.push('mapeo_lotes:sin_filas');
      r.plan.estado = vacio ? 'sin_filas' : r.plan.motivos.length || r.plan.filas.some(f => f.cantidad === null) || r.plan.conciliacion.some(c => c.estado !== 'coincide') ? 'parcial' : 'conocido';
    } else { r.plan.estado = 'parcial'; r.plan.motivos.push('base_exacta:no_leido'); }
  } else r.plan.motivos.push('productos_o_mezclas:no_leido');
  const movimientos = dentro(d.movimientos, 'aplicacion_id', padres);
  if (movimientos && idsValidos(movimientos) && movimientos.every(m => m.lote_id === null || esUuid(m.lote_id))) {
    const fechasValidas = !consulta.desde || movimientos.every(m => m.fecha_movimiento === null || esFechaCalendario(m.fecha_movimiento));
    if (fechasValidas) {
      const seleccion = movimientos.filter(m => !consulta.desde || m.fecha_movimiento !== null && m.fecha_movimiento! >= consulta.desde && m.fecha_movimiento! <= consulta.hasta!);
      if (consulta.desde && movimientos.some(m => m.fecha_movimiento === null)) r.ejecucion.motivos.push('fecha_movimiento:null_excluida');
      if (hoy && seleccion.some(m => esFechaCalendario(m.fecha_movimiento) && m.fecha_movimiento > hoy)) r.ejecucion.motivos.push('fecha_movimiento:futura_registrada');
      r.ejecucion.recipientes = seleccion.map(m => recipiente(m.lote_id!, m, tipo));
      const ids = new Set(seleccion.map(m => m.id));
      const hijos = dentro(d.productos_ejecutados, 'movimiento_diario_id', ids);
      if (!seleccion.length) r.ejecucion.estado = r.ejecucion.motivos.length ? 'parcial' : 'sin_movimientos';
      else if (hijos && idsValidos(hijos) && hijos.every(p => esUuid(p.producto_id))) {
        r.ejecucion.filas = agregarFilas(hijos.map(p => {
          const m = seleccion.find(m => m.id === p.movimiento_diario_id)!;
          const motivos = problemas({ cantidad_utilizada: p.cantidad_utilizada });
          if (!unidad(p.unidad)) motivos.push(`unidad:${p.unidad === null ? 'null' : p.unidad === undefined ? 'no_leido' : 'incompatible'}`);
          return { lote_id: m.lote_id!, producto_id: p.producto_id, producto_nombre: p.producto_nombre, lote_nombre: nombreLote(m.lote_id!), unidad: unidad(p.unidad), cantidad: motivos.length ? null : p.cantidad_utilizada!, estado: estadoDe(motivos), motivos, fuentes: [m.id, p.id] };
        }));
        conflictosUnidad(r.ejecucion.filas, r.ejecucion.motivos);
        r.ejecucion.estado = r.ejecucion.motivos.length || r.ejecucion.filas.some(f => f.cantidad === null) ? 'parcial' : hijos.length ? 'conocido' : 'sin_productos';
      } else r.ejecucion.motivos.push('productos_ejecutados:no_leido');
    } else r.ejecucion.motivos.push('fecha_movimiento:no_leido');
  } else r.ejecucion.motivos.push('movimientos:no_leido');
  r.estado = r.plan.estado === 'no_leido' && r.ejecucion.estado === 'no_leido' ? 'no_disponible' : r.plan.estado === 'parcial' || r.plan.estado === 'no_leido' || r.ejecucion.estado === 'parcial' || r.ejecucion.estado === 'no_leido' ? 'parcial' : 'ok';
  return r;
}
const nombre = (v: string | null | undefined, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback).replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&');
function filasTexto(fs: CantidadPorLote[], plan: boolean): string[] {
  return fs.map(f => `- ${nombre(f.lote_nombre, f.lote_id === null ? 'Sin lote registrado' : `Lote ${f.lote_id}`)}${f.lote_id !== null ? ` [${f.lote_id}]` : ''} · ${nombre(f.producto_nombre, `Producto ${f.producto_id}`)} [${f.producto_id}]: ${f.cantidad === null ? `${plan ? 'sin dato para el plan exacto de este producto/lote' : 'cantidad ejecutada no disponible'} (${textoEstado(f.estado)})` : `${valor(f.cantidad)} ${f.unidad}`}.`);
}
const textoEstado = (estado: EstadoCantidad) => estado === 'no_leido' ? 'dato no leído' : estado === 'incompatible' ? 'unidad o tipo incompatible' : 'sin dato registrado';
function recipientesTexto(xs: RecipienteGuardado[]): string[] {
  return xs.map(x => `- ${x.lote_id === null ? 'Sin lote registrado' : `Lote ${x.lote_id}`}: ${x.cantidad === null ? `cantidad de recipientes no disponible (${textoEstado(x.estado)})` : `${valor(x.cantidad)} ${x.unidad}`} guardados${x.mezcla_litros_kilos ? `; ${x.mezcla_litros_kilos.cantidad === null ? `mezcla guardada no disponible (${textoEstado(x.mezcla_litros_kilos.estado)})` : `${valor(x.mezcla_litros_kilos.cantidad)} ${x.mezcla_litros_kilos.unidad} guardados`}` : ''}.`);
}
export function renderCantidadesAplicacion(r: ResultadoCantidadesAplicacion): string {
  if (r.estado === 'no_resuelto') return 'No pude identificar una sola aplicación entre las que puedes ver. Indica su código o su ID.';
  if (!r.aplicacion) return 'No pude leer la aplicación y sus cantidades. Esa lectura no equivale a cantidades cero.';
  const out = [`Aplicación: ${nombre(r.aplicacion.nombre_aplicacion ?? r.aplicacion.codigo_aplicacion, `ID ${r.aplicacion.id}`)}.`, '**Plan completo guardado**', 'El plan abarca la aplicación completa y no se recorta por el período de ejecución.'];
  if (r.plan.estado === 'no_leido') out.push('No pude leer los datos del plan exacto. No se interpreta como plan cero.');
  if (r.plan.estado === 'sin_filas') out.push('Sin productos planificados registrados; no equivale a cantidades cero.');
  out.push(...filasTexto(r.plan.filas, true));
  if (r.plan.motivos.length) out.push('Hay base o mapeo sin dato para el plan exacto de este producto/lote; no se repartió por canecas ni por bultos.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:null:'))) out.push('Hay lotes sin mezcla registrada en sus cálculos. No se inventó qué productos estaban planeados para esos lotes.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:no_leido:'))) out.push('No pude leer el mapeo de mezcla a lote en algunos cálculos.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:no_disponible:'))) out.push('No pude verificar la mezcla referida por algunos cálculos entre las mezclas que puedes ver.');
  if (r.plan.motivos.includes('base_exacta:no_leido')) out.push('No pude leer o verificar la base guardada necesaria para el cálculo exacto por producto/lote.');
  if (r.plan.motivos.includes('calculos:no_leido')) out.push('No pude leer o verificar los cálculos guardados por lote.');
  if (r.plan.totales_guardados.length) out.push('Totales guardados por mezcla, sin volver a sumarlos en cada lote:', ...r.plan.totales_guardados.map(g => `- Mezcla ${g.mezcla_id} · producto ${g.producto_id}: ${g.cantidad === null ? `total guardado no disponible (${textoEstado(g.estado)})` : `${valor(g.cantidad)} ${g.unidad}`}.`));
  for (const c of r.plan.conciliacion) out.push(c.estado === 'discrepancia' ? `Discrepancia de fuente en mezcla ${c.mezcla_id}, producto ${c.producto_id}: total guardado ${valor(c.guardado!)} ${c.unidad}; plan exacto reconstruido ${valor(c.reconstruido!)} ${c.unidad}. No se ajustó ni repartió la diferencia.` : c.estado === 'no_verificable' ? `No pude verificar la conciliación de mezcla ${c.mezcla_id}, producto ${c.producto_id}.` : `El plan exacto coincide con el total guardado de mezcla ${c.mezcla_id}, producto ${c.producto_id}.`);
  if (r.plan.recipientes.length) out.push('Recipientes y mezcla guardados del plan:', ...recipientesTexto(r.plan.recipientes));
  if (r.plan.motivos.includes('mezcla_fertilizacion:unidad_fisica_no_verificada')) out.push('La mezcla de fertilización contiene productos con unidades distintas de kg. Los kg de mezcla y bultos mostrados son metadatos guardados, sin conciliación física; no se sumaron kg con L ni unidades.');
  out.push('**Ejecución**', r.consulta.desde ? `Solo movimientos del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta!)}, ambas fechas incluidas.` : 'Movimientos registrados de la vida completa de la aplicación.');
  if (r.ejecucion.estado === 'no_leido') out.push('No pude leer los productos ejecutados o sus movimientos; no equivale a consumo cero.');
  if (r.ejecucion.estado === 'sin_movimientos') out.push('Sin movimientos registrados en este alcance.');
  if (r.ejecucion.estado === 'sin_productos') out.push('Sin productos registrados en esos movimientos; no prueba consumo real cero.');
  out.push(...filasTexto(r.ejecucion.filas, false));
  if (r.ejecucion.recipientes.length) out.push('Recipientes registrados en movimientos:', ...recipientesTexto(r.ejecucion.recipientes));
  if (r.ejecucion.motivos.some(m => m.includes('null_excluida'))) out.push('Hay movimientos sin fecha registrada que no pude asignar al período.');
  if (r.ejecucion.motivos.some(m => m.includes('futura_registrada'))) out.push('Hay fechas de movimiento futuras registradas; no prueban que el trabajo ya ocurrió.');
  out.push('Plan y ejecución se muestran por separado y no se suman. Las unidades de producto no son unidades de mezcla ni agua registrada.', 'Lecturas independientes con tu sesión; no se verificó un único momento entre tablas.');
  return out.join('\n');
}
