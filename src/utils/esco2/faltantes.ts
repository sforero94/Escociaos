import { acumularProductosMezclas, calcularFaltanteProducto } from '../calculosNecesidadProductos.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { numeroMensaje } from './formatoMensaje.ts';
import { formatLongDate } from '../formatPuro.ts';
import type { UnidadCantidad } from './cantidadesTipos.ts';
import type { ConsultaFaltantesAplicacion, DatosFaltantesAplicacion, FilaFaltantesAplicacion, ResultadoFaltantesAplicacion } from './faltantesTipos.ts';
const unidad = (v: unknown): UnidadCantidad | null => v === 'Kilos' || v === 'kg' ? 'kg' : v === 'Litros' || v === 'L' ? 'L' : v === 'Unidades' || v === 'unidades' ? 'unidades' : null;
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const limpiar = (v: number) => Number(v.toPrecision(12));
const unicos = (rows: { id: string }[]) => rows.every(r => r && esUuid(r.id)) && new Set(rows.map(r=>r.id)).size === rows.length;
export function ejecutarFaltantesAplicacion(c: ConsultaFaltantesAplicacion, d: DatosFaltantesAplicacion, id: string, hoy: string): ResultadoFaltantesAplicacion {
  const r: ResultadoFaltantesAplicacion = { tipo: 'faltantes_aplicacion', id, estado: d.seleccion === 'no_resuelto' ? 'no_resuelto' : 'no_disponible', consulta: c, aplicaciones: d.aplicaciones ?? [], filas: [], completo: false, fecha_consulta: hoy, motivos: [], fuente: 'lecturas_independientes' };
  if (d.seleccion !== 'ok' || !d.aplicaciones?.length || !unicos(d.aplicaciones)) return r;
  const seleccion = resolverIdentidadAplicaciones(c, d.aplicaciones);
  if(seleccion.estado !== 'ok' || seleccion.aplicaciones.length !== d.aplicaciones.length) return r;
  if(!d.mezclas || !d.productos_plan) {r.motivos.push('plan_no_leido');return r;}
  const apps=new Set(d.aplicaciones.map(a=>a.id));
  const mezclas=new Set(d.mezclas.map(m=>m.id));
  if(!unicos(d.mezclas)||d.mezclas.some(m=>!apps.has(m.aplicacion_id))||!unicos(d.productos_plan)||d.productos_plan.some(p=>!esUuid(p.producto_id)||!mezclas.has(p.mezcla_id))) {r.motivos.push('referencia_plan_no_valida');return r;}
  if(new Set(d.productos_plan.map(p=>`${p.mezcla_id}:${p.producto_id}`)).size!==d.productos_plan.length) {r.motivos.push('producto_mezcla_duplicado');return r;}
  const planCompleto=d.aplicaciones.every(a=>d.mezclas!.some(m=>m.aplicacion_id===a.id)) && d.mezclas.every(m=>d.productos_plan!.some(p=>p.mezcla_id===m.id));
  if(!planCompleto) r.motivos.push('sin_productos_registrados_en_parte_del_plan');
  const inventarioValido=d.inventario && unicos(d.inventario);
  for(const productoId of new Set(d.productos_plan.map(p=>p.producto_id))) {
    const productos=d.productos_plan.filter(p=>p.producto_id===productoId), unidades=new Set(productos.map(p=>unidad(p.producto_unidad)));
    const f: FilaFaltantesAplicacion={producto_id:productoId,producto_nombre:productos.find(p=>p.producto_nombre)?.producto_nombre,unidad:unidades.size===1 ? [...unidades][0] : null,necesidad:null,stock:null,faltante:null,estado:'conocido',motivos:[]};
    if(!f.unidad){f.estado='incompatible';f.motivos.push('unidades_plan_incompatibles');}
    if(productos.some(p=>!numero(p.cantidad_total_necesaria))){f.estado=productos.some(p=>p.cantidad_total_necesaria===undefined)?'no_leido':'sin_dato';f.motivos.push('necesidad_sin_base_completa');}
    if(f.estado==='conocido') {
      // Validated source rows enter once, grouped by their actual mix; no lot/calculation join.
      const mezclasProducto=d.mezclas.map(m=>({productos:productos.filter(p=>p.mezcla_id===m.id).map(p=>({producto_id:productoId,cantidad_total_necesaria:p.cantidad_total_necesaria!}))}));
      const n=acumularProductosMezclas(mezclasProducto)[0]?.cantidad_total_necesaria;
      if(numero(n)) f.necesidad=limpiar(n); else {f.estado='sin_dato';f.motivos.push('necesidad_no_finita');}
    }
    if(!planCompleto) { f.estado='no_leido'; f.necesidad=null; f.motivos.push('plan_incompleto'); }
    const stock=inventarioValido ? d.inventario!.find(p=>p.id===productoId) : undefined;
    if(!inventarioValido){f.estado='no_leido';f.motivos.push('inventario_no_leido');}
    else if(!stock){f.estado='inventario_no_disponible';f.motivos.push('inventario_no_disponible');}
    else {
      if(stock.nombre)f.producto_nombre=stock.nombre;
      if(!unidad(stock.unidad_medida)||unidad(stock.unidad_medida)!==f.unidad){f.estado='incompatible';f.motivos.push('unidad_inventario_incompatible');}
      if(!numero(stock.cantidad_actual)){f.estado=stock.cantidad_actual===undefined?'no_leido':'sin_dato';f.motivos.push('stock_sin_dato');}
      else f.stock=limpiar(stock.cantidad_actual);
    }
    if(f.estado==='conocido'&&f.necesidad!==null&&f.stock!==null)f.faltante=limpiar(calcularFaltanteProducto(f.necesidad,f.stock));
    r.filas.push(f);
  }
  r.completo=planCompleto && r.filas.length>0 && r.filas.every(f=>f.estado==='conocido');
  r.estado=r.completo?'ok':'parcial';
  return r;
}
function texto(v: string | null | undefined):string{return (v??'').replace(/\s+/g,' ').trim().replace(/[\\`*_[\]|<>]/g,'\\$&');}
export function renderFaltantesAplicacion(r: ResultadoFaltantesAplicacion): string {
  if(r.estado==='no_resuelto')return 'No pude resolver las aplicaciones indicadas. Precisa su nombre o código.';
  if(r.estado==='no_disponible')return 'No pude leer el plan completo para verificar los faltantes vigentes.';
  const out=[`Faltantes vigentes. Fecha de consulta en Bogotá: ${formatLongDate(r.fecha_consulta)}.`];
  out.push(`Aplicaciones: ${r.aplicaciones.map(a=>{const n=texto(a.nombre_aplicacion||a.codigo_aplicacion);return !n?a.id:r.aplicaciones.some(b=>b.id!==a.id&&texto(b.nombre_aplicacion||b.codigo_aplicacion)===n)?`${n} (${a.id})`:n;}).join(', ')}.`);
  const cerradas=r.aplicaciones.filter(a=>a.estado==='Cerrada');
  if(cerradas.length)out.push(`${cerradas.length===r.aplicaciones.length?'Todas las aplicaciones indicadas están cerradas':`${cerradas.length===1?'Una aplicación indicada está cerrada':`${cerradas.length} aplicaciones indicadas están cerradas`}`}: su plan ya se ejecutó, así que su necesidad no es una compra pendiente.`);
  const estados={sin_dato:'sin dato completo',no_leido:'dato no leído',inventario_no_disponible:'inventario no disponible',incompatible:'unidad incompatible',conocido:''};
  const valor=(v:number|null,u:string|null)=>v===null?'sin dato':`${numeroMensaje(limpiar(v))}${u?` ${u}`:''}`;
  for(const f of r.filas){const n=texto(f.producto_nombre),nombre=!n?f.producto_id:r.filas.some(p=>p.producto_id!==f.producto_id&&texto(p.producto_nombre)===n)?`${n} (${f.producto_id})`:n;out.push(`${nombre}: necesidad ${valor(f.necesidad,f.unidad)}; stock ${f.motivos.includes('unidad_inventario_incompatible') ? 'unidad incompatible' : valor(f.stock,f.unidad)}; ${f.estado==='conocido'?`faltante ${valor(f.faltante,f.unidad)}`:estados[f.estado]}.`);}
  if(r.completo&&r.filas.every(f=>f.faltante===0))out.push('Alcanza el inventario registrado hoy.');
  if(!r.completo)out.push('Necesidad o stock sin verificación completa; disponibilidad sin confirmar.');
  out.push('Necesidad del plan guardado; no descuenta ejecución. Stock contado una vez por producto. Lecturas independientes, sin reserva garantizada.');
  return out.join('\n');
}
