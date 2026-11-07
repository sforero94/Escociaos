// Strict saved-source preconditions, original calculator calls, ID/unit aggregation.
import { calcularFertilizacion, calcularFumigacion, unidadAplicacion } from '../calculosAplicaciones.ts';
import { formatLongDate } from '../formatPuro.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { resumirCantidadesAplicacion, resumirRecipientes } from './cantidadesResumen.ts';
import type { BaseLoteCantidad, CalculoCantidad, CantidadPorLote, ConsultaCantidadesAplicacion, DatosCantidadesAplicacion, EstadoCantidad, ProductoPlanCantidad, RecipienteGuardado, ResultadoCantidadesAplicacion, TotalResumenCantidad, UnidadCantidad } from './cantidadesTipos.ts';

const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const unidad = (v: unknown): UnidadCantidad | null => v === 'Kilos' ? 'kg' : v === 'Litros' ? 'L' : v === 'Unidades' ? 'unidades' : null;
const idsValidos = (rows: { id: string }[]) => rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r => r.id)).size === rows.length;
function dentro<T extends { id: string }>(rows: T[] | undefined, ref: keyof T, ids: Set<string>): T[] | undefined {
  return rows && rows.every(r => r && esUuid(r[ref])) ? rows.filter(r => ids.has(r[ref] as string)) : undefined;
}
function problemas(campos: Record<string, unknown>): string[] {
  return Object.entries(campos).filter(([, v]) => !numero(v)).map(([k, v]) => `${k}:${v === null ? 'null' : v === undefined ? 'no_leido' : 'invalido'}`);
}
/** The calculator rounds every per-lot amount and every saved total up to 0.01 (`Math.ceil(x * 100) / 100`). */
const PASO_REDONDEO = 0.01;
const MOTIVO_NO_CONCILIA = 'conciliacion:no_coincide';
const AVISO_CC_G = 'equivalencia_cc_g:';
/** Keep finite source precision through grouping and valuation. Calculator tolerance is separate. */
const limpiarSuma = (n: number) => n;
const valor = (n: number) => numeroMensaje(n);
function estadoDe(motivos: string[]): EstadoCantidad {
  return motivos.some(m => /no_leido|invalido|no_disponible/.test(m)) ? 'no_leido' : motivos.some(m => /incompatible/.test(m)) ? 'incompatible' : motivos.includes(MOTIVO_NO_CONCILIA) ? 'no_concilia' : motivos.length ? 'sin_dato' : 'conocido';
}
function agregarFilas(filas: CantidadPorLote[]): CantidadPorLote[] {
  const grupos = new Map<string, CantidadPorLote>();
  for (const f of filas) {
    const key = JSON.stringify([f.lote_id, f.producto_id, f.unidad]);
    const prev = grupos.get(key);
    if (!prev) grupos.set(key, { ...f, motivos: [...f.motivos], fuentes: [...f.fuentes] });
    else {
      prev.cantidad = prev.cantidad === null || f.cantidad === null ? null : limpiarSuma(prev.cantidad + f.cantidad);
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
function exacto(c: CalculoCantidad, b: BaseLoteCantidad | undefined, p: ProductoPlanCantidad, tipo: string | null | undefined, nombreLote?: string | null): { cantidad: number | null; motivos: string[]; avisos?: string[] } {
  const motivos: string[] = [];
  const avisos: string[] = [];
  if (!b) return { cantidad: null, motivos: ['base_lote:sin_fila'] };
  motivos.push(...problemas({ 'calculo.total_arboles': c.total_arboles, 'base.total_arboles': b.total_arboles }));
  if (numero(c.total_arboles) && numero(b.total_arboles) && c.total_arboles !== b.total_arboles) motivos.push('total_arboles:incoherente');
  const u = unidad(p.producto_unidad);
  if (tipo === 'Fumigación' || tipo === 'Drench') {
    motivos.push(...problemas({ calibracion_litros_arbol: b.calibracion_litros_arbol, tamano_caneca: b.tamano_caneca, dosis_por_caneca: p.dosis_por_caneca }));
    if (b.tamano_caneca === 0) motivos.push('tamano_caneca:invalido');
    if (!u) motivos.push(`unidad_producto:${p.producto_unidad === null ? 'null' : p.producto_unidad === undefined ? 'no_leido' : 'incompatible'}`);
    const dosis = p.unidad_dosis;
    if (dosis === null || dosis === undefined) motivos.push(`unidad_dosis:${dosis === null ? 'null' : 'no_leido'}`);
    else if ((dosis !== 'cc' && dosis !== 'g' && dosis !== 'gramos') || u === 'unidades') motivos.push('unidad_dosis:incompatible');
    // Owner decision 2026-11-05: a cc dose on a kg product (or g on L) is computed as the
    // calculator does, 1 cc = 1 g, and the answer discloses it.
    else if (u && (u === 'kg') === (dosis === 'cc')) avisos.push(`${AVISO_CC_G}${p.producto_id}`);
    if (motivos.length) return { cantidad: null, motivos };
    const r = calcularFumigacion({ lote_id: c.lote_id, ...(typeof nombreLote === 'string' ? { nombre: nombreLote } : {}), conteo_arboles: { total: b.total_arboles! }, calibracion_litros_arbol: b.calibracion_litros_arbol!, tamano_caneca: b.tamano_caneca! }, { productos: [{ producto_id: p.producto_id, dosis_por_caneca: p.dosis_por_caneca! }] });
    return numero(r.productos[0].cantidad_necesaria) ? { cantidad: r.productos[0].cantidad_necesaria, motivos, avisos } : { cantidad: null, motivos: ['resultado_motor:invalido'] };
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
  const r: ResultadoCantidadesAplicacion = { tipo: 'cantidades_aplicacion', id, consulta, estado: d.seleccion === 'no_resuelto' ? 'no_resuelto' : 'no_disponible', aplicacion: d.aplicacion, plan: { estado: 'no_leido', filas: [], totales_guardados: [], conciliacion: [], recipientes: [], motivos: [], avisos: [] }, ejecucion: { estado: 'no_leido', filas: [], recipientes: [], motivos: [] }, fuente: 'lecturas_independientes' };
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
    r.plan.recipientes = calculos.map(c => ({ ...recipiente(c.lote_id, c, tipo, c), lote_nombre: nombreLote(c.lote_id) }));
  else r.plan.motivos.push('calculos:no_leido');
  if (mezclas && idsValidos(mezclas) && productos && idsValidos(productos) && new Set(productos.map(p => `${p.mezcla_id}:${p.producto_id}`)).size === productos.length && productos.every(p => esUuid(p.producto_id))) {
    const nombreMezcla = new Map(mezclas.map(m => [m.id, typeof m.nombre_mezcla === 'string' && m.nombre_mezcla.trim() ? m.nombre_mezcla : numero(m.numero_mezcla) ? `Mezcla ${m.numero_mezcla}` : null]));
    r.plan.totales_guardados = productos.map(p => {
      const motivos = problemas({ cantidad_total_necesaria: p.cantidad_total_necesaria });
      if (!unidad(p.producto_unidad)) motivos.push(`unidad_producto:${p.producto_unidad === null ? 'null' : p.producto_unidad === undefined ? 'no_leido' : 'incompatible'}`);
      return { mezcla_id: p.mezcla_id, producto_id: p.producto_id, producto_nombre: p.producto_nombre, mezcla_nombre: nombreMezcla.get(p.mezcla_id) ?? null, unidad: unidad(p.producto_unidad), cantidad: motivos.length ? null : p.cantidad_total_necesaria!, estado: estadoDe(motivos), motivos };
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
          for (const a of e.avisos ?? []) if (!r.plan.avisos.includes(a)) r.plan.avisos.push(a);
          aportes.push({ lote_id: c.lote_id, producto_id: p.producto_id, producto_nombre: p.producto_nombre, lote_nombre: nombreLote(c.lote_id), unidad: unidad(p.producto_unidad), cantidad: e.cantidad, estado: estadoDe(e.motivos), motivos: e.motivos, fuentes: [c.id, p.id, ...(b ? [b.id] : [])], mezcla_id: p.mezcla_id });
        }
      }
      conflictosUnidad(aportes, r.plan.motivos);
      for (const g of r.plan.totales_guardados) {
        const fs = aportes.filter(f => f.mezcla_id === g.mezcla_id && f.producto_id === g.producto_id);
        const completo = !unmapped.length && fs.length > 0 && fs.every(f => f.cantidad !== null) && !r.plan.motivos.includes(`unidad_incompatible:${g.producto_id}`);
        const suma = completo ? fs.reduce((sum, f) => sum + f.cantidad!, 0) : null;
        const reconstruido = numero(suma) ? limpiarSuma(suma) : null;
        const residuoMaquina = reconstruido !== null && g.cantidad !== null ? Number.EPSILON * (fs.length + 1) * Math.max(Math.abs(g.cantidad), reconstruido) : 0;
        // One calculator rounding step: the saved total is itself ceil'd, so a float sum such as
        // 12.340000000000002 is stored as 12.35. Anything wider is a real discrepancy.
        const estado = reconstruido === null || g.cantidad === null ? 'no_verificable' : Math.abs(reconstruido - g.cantidad) <= PASO_REDONDEO + residuoMaquina ? 'coincide' : 'discrepancia';
        r.plan.conciliacion.push({ mezcla_id: g.mezcla_id, producto_id: g.producto_id, producto_nombre: g.producto_nombre, mezcla_nombre: g.mezcla_nombre, unidad: g.unidad, guardado: g.cantidad, reconstruido, estado });
        // A per-lot calculation that does not add up to its saved total is never published as exact.
        if (estado === 'discrepancia') for (const f of fs) if (f.cantidad !== null) { f.cantidad = null; f.motivos.push(MOTIVO_NO_CONCILIA); f.estado = estadoDe(f.motivos); }
      }
      r.plan.filas = agregarFilas(aportes);
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
      r.ejecucion.recipientes = seleccion.map(m => ({ ...recipiente(m.lote_id!, m, tipo), lote_nombre: nombreLote(m.lote_id!) }));
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
  r.resumen = resumirCantidadesAplicacion(r);
  if (r.estado === 'ok' && (r.resumen.plan.estado === 'parcial' || r.resumen.ejecucion.estado === 'parcial')) r.estado = 'parcial';
  return r;
}
const escapar = (v: string) => v.replace(/\s+/g, ' ').trim().replace(/[\\`*_[\]|<>]/g, '\\$&');
/** Name first. The UUID appears only when two different IDs share a visible name, or when there is no name. */
function etiquetas(items: { id: string | null; nombre?: string | null }[], sinNombre: string): (id: string | null) => string {
  const nombres = new Map<string, string>();
  for (const it of items) if (it.id !== null && !nombres.has(it.id) && typeof it.nombre === 'string' && it.nombre.trim()) nombres.set(it.id, escapar(it.nombre));
  const usos = new Map<string, number>();
  for (const n of nombres.values()) usos.set(n.toLocaleLowerCase('es'), (usos.get(n.toLocaleLowerCase('es')) ?? 0) + 1);
  return id => {
    if (id === null) return 'Sin lote registrado';
    const n = nombres.get(id);
    return !n ? `${sinNombre} [${id}]` : (usos.get(n.toLocaleLowerCase('es')) ?? 0) > 1 ? `${n} [${id}]` : n;
  };
}
const textoEstado = (estado: EstadoCantidad) => estado === 'no_leido' ? 'dato no leído' : estado === 'incompatible' ? 'unidad o tipo incompatible' : estado === 'no_concilia' ? 'no cuadra con el total guardado' : 'sin dato registrado';
function textoTotalResumen(row: TotalResumenCantidad): string {
  const u = row.unidad ?? 'unidad no disponible';
  const singular = row.cantidad === 1 && ['canecas', 'bultos', 'unidades'].includes(u) ? u === 'unidades' ? 'unidad' : u.slice(0, -1) : u;
  if (row.cantidad !== null) return `${valor(row.cantidad)} ${singular}${row.estado === 'no_concilia' ? ' (no cuadra por lote)' : ''}`;
  const estado = row.estado === 'parcial' ? 'parcial' : textoEstado(row.estado);
  return row.subtotal_conocido !== null ? `subtotal conocido ${valor(row.subtotal_conocido)} ${u}; total no disponible (${estado})` : `${u} sin dato (${estado})`;
}
function resumenRecipientes(xs: RecipienteGuardado[], ejecucion: boolean): string {
  if (!xs.length) return '';
  const partes: string[] = ejecucion ? [`${xs.length} ${xs.length === 1 ? 'movimiento' : 'movimientos'}`] : [];
  const s = resumirRecipientes(xs);
  partes.push(...s.recipientes.map(textoTotalResumen), ...s.mezcla.map(textoTotalResumen));
  return ` (${partes.join('; ')})`;
}
/** One line per lot: containers in parentheses, then each product and its amount. */
function porLote(filas: CantidadPorLote[], recipientes: RecipienteGuardado[], ejecucion: boolean, lote: (id: string | null) => string, producto: (id: string | null) => string): string[] {
  const orden: (string | null)[] = [];
  for (const id of [...recipientes.map(x => x.lote_id), ...filas.map(f => f.lote_id)]) if (!orden.includes(id)) orden.push(id);
  return orden.map(id => {
    const fs = filas.filter(f => f.lote_id === id);
    const productos = fs.map(f => `${producto(f.producto_id)} ${f.cantidad === null ? `${ejecucion ? 'cantidad no disponible' : 'sin plan exacto'} (${textoEstado(f.estado)})` : `${valor(f.cantidad)} ${f.unidad}`}`);
    return `- ${lote(id)}${resumenRecipientes(recipientes.filter(x => x.lote_id === id), ejecucion)}: ${productos.length ? productos.join('; ') : ejecucion ? 'sin productos registrados' : 'sin productos asociados'}.`;
  });
}
export function renderCantidadesAplicacion(r: ResultadoCantidadesAplicacion): string {
  if(r.resultados_poblacion){
    if(r.seleccion?.estado==='no_disponible')return 'No pude verificar la población de aplicaciones seleccionada. No equivale a cantidades cero.';
    if(!r.resultados_poblacion.length)return 'La selección anterior verificó una población vacía de aplicaciones. No se ejecutaron consultas singulares ni se infieren cantidades de otra población.';
    const out=[`Cantidades de ${numeroMensaje(r.resultados_poblacion.length)} aplicaciones seleccionadas por sus IDs visibles. Plan y ejecución permanecen separados.`];
    for(const [base,label] of [['plan','Plan completo guardado'],['ejecucion','Ejecución registrada']] as const)for(const p of r.resumen?.[base].productos??[])out.push(`${label}, ${escapar(p.producto_nombre??p.producto_id)}: ${textoTotalResumen(p)}.`);
    return [...out,...r.resultados_poblacion.map(renderCantidadesAplicacion)].join('\n\n');
  }

  if (r.estado === 'no_resuelto') return 'No pude identificar una sola aplicación entre las que puedes ver. Indica su código o su ID.';
  if (!r.aplicacion) return 'No pude leer la aplicación y sus cantidades. Esa lectura no equivale a cantidades cero.';
  const filas = [...r.plan.filas, ...r.ejecucion.filas];
  const lote = etiquetas([...filas, ...r.plan.recipientes, ...r.ejecucion.recipientes].map(x => ({ id: x.lote_id, nombre: x.lote_nombre })), 'Lote sin nombre');
  const producto = etiquetas([...filas, ...r.plan.totales_guardados].map(x => ({ id: x.producto_id, nombre: x.producto_nombre })), 'Producto sin nombre');
  const mezcla = etiquetas(r.plan.totales_guardados.map(g => ({ id: g.mezcla_id, nombre: g.mezcla_nombre })), 'Mezcla sin nombre');
  const variasMezclas = new Set(r.plan.totales_guardados.map(g => g.mezcla_id)).size > 1;
  const enMezcla = (mezclaId: string, productoId: string) => variasMezclas ? `${producto(productoId)} (${mezcla(mezclaId)})` : producto(productoId);
  const resumen = r.resumen ?? resumirCantidadesAplicacion(r);
  const lineaResumen = (titulo: string, bloque: typeof resumen.plan, recipientes: RecipienteGuardado[], ejecucion: boolean) => `${titulo}${resumenRecipientes(recipientes, ejecucion)}: ${bloque.productos.length ? bloque.productos.map(p => `${producto(p.producto_id)} ${textoTotalResumen(p)}`).join('; ') : bloque.estado === 'no_leido' ? 'productos no leídos' : 'sin productos registrados; no equivale a consumo cero'}.`;
  const nombreApp = r.aplicacion.nombre_aplicacion ?? r.aplicacion.codigo_aplicacion;
  const out = [`Aplicación: ${typeof nombreApp === 'string' && nombreApp.trim() ? escapar(nombreApp) : `ID ${r.aplicacion.id}`}.`, '**Plan completo guardado**', 'El plan abarca la aplicación completa y no se recorta por el período de ejecución.'];
  out.push(lineaResumen('Resumen del plan guardado', resumen.plan, r.plan.recipientes, false));
  if (r.plan.estado === 'no_leido') out.push('No pude leer los datos del plan exacto. No se interpreta como plan cero.');
  if (r.plan.estado === 'sin_filas') out.push('Sin productos planificados registrados; no equivale a cantidades cero.');
  if (r.plan.totales_guardados.length) out.push('Totales guardados:', ...r.plan.totales_guardados.map(g => `- ${enMezcla(g.mezcla_id, g.producto_id)}: ${g.cantidad === null ? `total no disponible (${textoEstado(g.estado)})` : `${valor(g.cantidad)} ${g.unidad}`}.`));
  const conc = r.plan.conciliacion;
  if (conc.length) {
    out.push(`El cálculo por lote cuadra con el total guardado en ${conc.filter(c => c.estado === 'coincide').length} de ${conc.length} ${conc.length === 1 ? 'producto' : 'productos'} (se acepta el redondeo de 0,01 de la calculadora).`);
    for (const c of conc) if (c.estado === 'discrepancia') out.push(`- No cuadra ${enMezcla(c.mezcla_id, c.producto_id)}: total guardado ${valor(c.guardado!)} ${c.unidad}; el cálculo por lote da ${valor(c.reconstruido!)} ${c.unidad}. No publico su plan por lote ni ajusto la diferencia.`);
    const sinVerificar = conc.filter(c => c.estado === 'no_verificable');
    if (sinVerificar.length) out.push(`- Sin verificar por falta de datos: ${sinVerificar.map(c => enMezcla(c.mezcla_id, c.producto_id)).join(', ')}.`);
  }
  const equivalencias = [...new Set(r.plan.avisos.filter(a => a.startsWith(AVISO_CC_G)).map(a => a.slice(AVISO_CC_G.length)))];
  if (equivalencias.length) out.push(`Dosis en cc para un producto en kg, o en g para un producto en L: ${equivalencias.map(producto).join(', ')}. Lo calculé como la calculadora de aplicaciones: 1 cc = 1 g.`);
  const lineasPlan = porLote(r.plan.filas, r.plan.recipientes, false, lote, producto);
  if (lineasPlan.length) out.push('Plan por lote:', ...lineasPlan);
  if (r.plan.filas.some(f => f.cantidad === null && f.estado !== 'no_concilia')) out.push('Donde falta el plan exacto de un producto en un lote, no lo reparto por canecas ni por bultos.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:null:'))) out.push('Hay lotes sin mezcla registrada en sus cálculos. No se inventó qué productos estaban planeados para esos lotes.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:no_leido:'))) out.push('No pude leer el mapeo de mezcla a lote en algunos cálculos.');
  if (r.plan.motivos.some(m => m.startsWith('mezcla_id:no_disponible:'))) out.push('No pude verificar la mezcla referida por algunos cálculos entre las mezclas que puedes ver.');
  if (r.plan.motivos.includes('base_exacta:no_leido')) out.push('No pude leer o verificar la base guardada necesaria para el cálculo exacto por producto/lote.');
  if (r.plan.motivos.includes('calculos:no_leido')) out.push('No pude leer o verificar los cálculos guardados por lote.');
  if (r.plan.motivos.includes('mezcla_fertilizacion:unidad_fisica_no_verificada')) out.push('La mezcla de fertilización contiene productos con unidades distintas de kg. Los kg de mezcla y bultos mostrados son metadatos guardados, sin conciliación física; no se sumaron kg con L ni unidades.');
  out.push('**Ejecución**', r.consulta.desde ? `Solo movimientos del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta!)}, ambas fechas incluidas.` : 'Movimientos registrados de la vida completa de la aplicación.');
  out.push(lineaResumen('Resumen de ejecución', resumen.ejecucion, r.ejecucion.recipientes, true));
  if (r.ejecucion.estado === 'no_leido') out.push('No pude leer los productos ejecutados o sus movimientos; no equivale a consumo cero.');
  if (r.ejecucion.estado === 'sin_movimientos') out.push('Sin movimientos registrados en este alcance.');
  if (r.ejecucion.estado === 'sin_productos') out.push('Sin productos registrados en esos movimientos; no prueba consumo real cero.');
  out.push(...porLote(r.ejecucion.filas, r.ejecucion.recipientes, true, lote, producto));
  if (r.ejecucion.motivos.some(m => m.includes('null_excluida'))) out.push('Hay movimientos sin fecha registrada que no pude asignar al período.');
  if (r.ejecucion.motivos.some(m => m.includes('futura_registrada'))) out.push('Hay fechas de movimiento futuras registradas; no prueban que el trabajo ya ocurrió.');
  out.push('Plan y ejecución se muestran por separado y no se suman. Las unidades de producto no son unidades de mezcla ni agua registrada.', 'Agua utilizada: sin registro directo en las fuentes de esta consulta. No puedo determinarla a partir de las canecas ni del volumen de mezcla; no equivale a agua cero.', 'Lecturas independientes con tu sesión; no se verificó un único momento entre tablas.');
  return out.join('\n');
}
