// D34: frozen closure values and today's input valuation remain separate monetary bases.
import { ejecutarCantidadesAplicacion } from './cantidades.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';
import { esUuid } from './aplicacionesTipos.ts';
import { esFechaCalendario } from './fechaCalendario.ts';
import { formatLongDate } from '../formatPuro.ts';
import { dineroConDetalleMensaje as dineroMensaje, numeroMensaje } from './formatoMensaje.ts';
import type { EstadoCantidad, UnidadCantidad } from './cantidadesTipos.ts';
import type { BloqueCongelado, BloqueValoracion, ConsultaCostosAplicacion, DatosCostosAplicacion, EstadoDatoCosto, FilaValorada, ResultadoCostosAplicacion } from './costosTipos.ts';
const numero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const limpiar = (n: number) => Number(n.toPrecision(12));
const unidad = (u: unknown): UnidadCantidad | null => u === 'Kilos' ? 'kg' : u === 'Litros' ? 'L' : u === 'Unidades' ? 'unidades' : null;
const estadoNumero = (n: unknown): EstadoDatoCosto => numero(n) ? 'conocido' : n === null ? 'sin_dato' : 'no_leido';
const validos = (rows: { id: string }[]) => rows.every(x => x && esUuid(x.id)) && new Set(rows.map(x => x.id)).size === rows.length;
function congelar(d: DatosCostosAplicacion): BloqueCongelado {
  const b: BloqueCongelado = { estado:'no_verificado',fecha_cierre:null,insumos:null,mano_obra:null,total:null,total_guardado:null,estados_campos:{insumos:'no_verificado',mano_obra:'no_verificado',total:'no_verificado'},motivos:[] };
  if (!d.cierres || !validos(d.cierres) || d.cierres.length !== 1 || d.cierres[0].aplicacion_id !== d.aplicacion!.id || !esFechaCalendario(d.cierres[0].fecha_cierre)) { b.motivos.push('cierre:no_verificado'); return b; }
  b.fecha_cierre = d.cierres[0].fecha_cierre;
  const c = d.costos;
  if (!c || c.id !== d.aplicacion!.id || c.estado !== 'Cerrada') { b.motivos.push('costos:no_leido'); return b; }
  b.estados_campos={insumos:estadoNumero(c.costo_total_insumos),mano_obra:estadoNumero(c.costo_total_mano_obra),total:estadoNumero(c.costo_total)};
  b.insumos=numero(c.costo_total_insumos)?c.costo_total_insumos:null;
  b.mano_obra=numero(c.costo_total_mano_obra)?c.costo_total_mano_obra:null;
  b.total_guardado=numero(c.costo_total)?c.costo_total:null;
  const completo=Object.values(b.estados_campos).every(x=>x==='conocido');
  const discrepancia=completo && Math.abs(limpiar(b.insumos!+b.mano_obra!)-limpiar(b.total_guardado!)) > Number.EPSILON * 4 * Math.max(1,b.total_guardado!,b.insumos!,b.mano_obra!);
  b.estado=discrepancia?'discrepancia':completo?'conocido':'parcial';
  if(discrepancia)b.motivos.push('componentes:no_concilian');
  if(completo&&!discrepancia)b.total=b.total_guardado;
  return b;
}
type Aporte = { producto_id: string; producto_nombre?: string | null; unidad: UnidadCantidad | null; cantidad: number | null; estado: EstadoCantidad };
function valorizar(aportes: Aporte[], completo: boolean, motivos: string[], precios: DatosCostosAplicacion['precios'], hoy: string): BloqueValoracion {
  const b: BloqueValoracion={estado:'no_leido',total:null,subtotal_conocido:null,fecha_consulta:hoy,filas:[],motivos:[...motivos]};
  const grupos=new Map<string,FilaValorada>();
  for(const a of aportes){
    const p=grupos.get(a.producto_id);
    if(!p)grupos.set(a.producto_id,{producto_id:a.producto_id,producto_nombre:a.producto_nombre,unidad:a.unidad,cantidad:a.cantidad,precio_unitario:null,costo:null,estado:a.estado==='conocido'?'conocido':a.estado==='incompatible'?'incompatible':a.estado==='sin_dato'?'sin_dato':'no_leido',motivos:[]});
    else if(p.unidad!==a.unidad){p.cantidad=null;p.estado='incompatible';}
    else if(p.cantidad===null||a.cantidad===null){p.cantidad=null;p.estado=a.estado==='incompatible'?'incompatible':a.estado==='sin_dato'?'sin_dato':'no_leido';}
    else {p.cantidad=limpiar(p.cantidad+a.cantidad);if(!numero(p.cantidad)){p.cantidad=null;p.estado='no_leido';}}
  }
  const catalogo=precios && validos(precios) ? new Map(precios.map(p=>[p.id,p])) : undefined;
  for(const f of grupos.values()){
    const p=catalogo?.get(f.producto_id);
    if(f.estado!=='conocido')f.motivos.push('cantidad:no_valorizable');
    else if(!catalogo){f.estado='no_leido';f.motivos.push('precios:no_leido');}
    else if(!p){f.estado='inventario_no_disponible';f.motivos.push('producto:no_visible');}
    else if(!unidad(p.unidad_medida)||unidad(p.unidad_medida)!==f.unidad){f.estado=p.unidad_medida===undefined?'no_leido':p.unidad_medida===null?'sin_dato':'incompatible';f.motivos.push('unidad:no_compatible');}
    else if(!numero(p.precio_unitario)){f.estado=estadoNumero(p.precio_unitario);f.motivos.push('precio:no_valorizable');}
    else {f.precio_unitario=p.precio_unitario;f.costo=limpiar(f.cantidad!*p.precio_unitario);if(!numero(f.costo)){f.costo=null;f.estado='no_leido';f.motivos.push('valoracion:invalida');}}
    if(!f.producto_nombre && p?.nombre)f.producto_nombre=p.nombre;
    b.filas.push(f);
  }
  const conocidos=b.filas.filter(f=>f.costo!==null);
  const suma=limpiar(conocidos.reduce((s,f)=>s+f.costo!,0));
  if(conocidos.length&&numero(suma))b.subtotal_conocido=suma;
  if(completo&&b.filas.length&&conocidos.length===b.filas.length&&numero(suma)){b.total=suma;b.estado='conocido';}
  else b.estado=b.filas.length?'parcial':completo?'sin_filas':'no_leido';
  return b;
}
export function ejecutarCostosAplicacion(consulta: ConsultaCostosAplicacion,d: DatosCostosAplicacion,id: string,hoy: string): ResultadoCostosAplicacion {
  const r: ResultadoCostosAplicacion={tipo:'costos_aplicacion',id,consulta,estado:d.seleccion==='no_resuelto'?'no_resuelto':'no_disponible',motivos:[],fuente:'lecturas_independientes'};
  if(d.seleccion!=='ok'||!d.aplicacion||!esUuid(d.aplicacion.id))return r;
  const identidad=resolverIdentidadAplicaciones({aplicacion_ids:consulta.aplicacion_id?[consulta.aplicacion_id]:[],aplicaciones:consulta.aplicacion?[consulta.aplicacion]:[]},[d.aplicacion]);
  if(identidad.estado!=='ok'){r.estado=identidad.estado==='no_resuelto'?'no_resuelto':'no_disponible';return r;}
  r.aplicacion=d.aplicacion;r.aplicacion_nombre_repetido=d.aplicacion_nombre_repetido;
  const estado=d.aplicacion.estado;
  if(estado!=='Cerrada'&&estado!=='Calculada'&&estado!=='En ejecución'){r.motivos.push(estado===null?'estado:sin_dato':'estado:no_leido');return r;}
  if(estado==='Cerrada')r.congelado=congelar(d);
  if(estado!=='Cerrada'||consulta.incluir_plan){
    const datos=d.cantidades?.seleccion==='ok'&&d.cantidades.aplicacion?.id===d.aplicacion.id&&d.cantidades.aplicacion.estado===estado?d.cantidades:{seleccion:'no_leido' as const};
    const q=ejecutarCantidadesAplicacion(consulta,datos,id,hoy);
    if(estado!=='Cerrada'){
      const movimientos=datos.movimientos?.filter(m=>m.aplicacion_id===d.aplicacion!.id&&(!consulta.desde||typeof m.fecha_movimiento==='string'&&m.fecha_movimiento>=consulta.desde&&m.fecha_movimiento<=consulta.hasta!));
      const hijos=new Set(datos.productos_ejecutados?.map(p=>p.movimiento_diario_id));
      const sinProductos=movimientos?.some(m=>!hijos.has(m.id))??true;
      r.ejecucion=valorizar(q.ejecucion.filas,(q.ejecucion.estado==='conocido'||q.ejecucion.estado==='sin_movimientos')&&!sinProductos,[...q.ejecucion.motivos,...(sinProductos?['movimiento:sin_productos']:[])],d.precios,hoy);
    }
    if(consulta.incluir_plan){
      // Saved mix-product rows, once each. Per-lot reconstruction is a different, separately verified fact.
      const completo=q.plan.totales_guardados.length>0&&q.plan.totales_guardados.every(p=>p.estado==='conocido');
      r.plan=valorizar(q.plan.totales_guardados,completo,completo?[]:['plan_guardado:no_completo'],d.precios,hoy);
    }
  }
  const bloques=[r.congelado,r.ejecucion,r.plan].filter(x=>x!==undefined);
  r.estado=bloques.every(b=>b.estado==='conocido')?'ok':'parcial';
  return r;
}
const escapar=(s:string)=>s.replace(/\s+/g,' ').trim().replace(/[\\`*_[\]|<>]/g,'\\$&');
const valor=(n:number)=>numeroMensaje(limpiar(n));
const dinero=(n:number)=>dineroMensaje(n);
const textos:Record<EstadoDatoCosto,string>={conocido:'verificado',sin_dato:'sin dato registrado',no_leido:'dato no leído',incompatible:'unidad incompatible',inventario_no_disponible:'inventario no disponible',no_verificado:'sin costo de cierre verificado',discrepancia:'los componentes no cuadran con el total guardado',sin_filas:'sin cantidades registradas'};
function renderValoracion(b:BloqueValoracion,titulo:string):string[]{
  const nombres=new Map(b.filas.map(f=>[f.producto_id,f.producto_nombre?.trim()?escapar(f.producto_nombre):null]));
  const nombre=(f:FilaValorada)=>{const n=nombres.get(f.producto_id);return !n?`Producto sin nombre [${f.producto_id}]`:[...nombres.values()].filter(x=>x?.toLocaleLowerCase('es')===n.toLocaleLowerCase('es')).length>1?`${n} [${f.producto_id}]`:n;};
  const out=[`**${titulo}** · consulta ${formatLongDate(b.fecha_consulta)} (Bogotá).`];
  for(const f of b.filas)out.push(`- ${nombre(f)}: ${f.cantidad===null?'cantidad no valorizable':`${valor(f.cantidad)} ${f.unidad??'unidad no disponible'}`}; ${f.costo===null?`no valorizable (${textos[f.estado]})`:`${dinero(f.costo)}${f.precio_unitario===0?' (precio cero registrado)':` a ${dinero(f.precio_unitario!)}/${f.unidad}`}`}.`);
  if(b.estado==='sin_filas'){out.push('Aún no hay ejecución registrada: no hay insumos ejecutados que valorizar.');return out;}
  if(b.total!==null)out.push(`Subtotal de insumos completo: ${dinero(b.total)}.`);
  else {out.push('Sin total completo de insumos: las cantidades o los precios no están completos y compatibles.');if(b.subtotal_conocido!==null)out.push(`Subtotal conocido de productos valorizables: ${dinero(b.subtotal_conocido)}.`);if(!b.filas.length)out.push('Sin cantidades completas registradas; esto no prueba costo real cero.');}
  return out;
}
export function renderCostosAplicacion(r:ResultadoCostosAplicacion):string {
  if(r.estado==='no_resuelto')return 'No pude resolver una única aplicación visible. Indica su nombre, código o ID.';
  if(!r.aplicacion)return 'No pude leer la aplicación ni verificar sus costos.';
  const nombre=r.aplicacion.nombre_aplicacion?.trim()?escapar(r.aplicacion.nombre_aplicacion):r.aplicacion.codigo_aplicacion?.trim()?escapar(r.aplicacion.codigo_aplicacion):`Aplicación sin nombre [${r.aplicacion.id}]`;
  const out=[`**Costos de ${nombre}${r.aplicacion_nombre_repetido?` [${r.aplicacion.id}]`:''}**`];
  if(r.estado==='no_disponible')return [...out,'No pude verificar el estado actual de la aplicación. No publico un costo congelado ni una valorización abierta.'].join('\n');
  if(r.congelado){
    const b=r.congelado;
    out.push(`**Costo congelado al cierre** · aplicación completa${b.fecha_cierre?`; cierre operativo ${formatLongDate(b.fecha_cierre)}`:''}.`);
    if(b.estado==='no_verificado')out.push('Sin costo de cierre verificado.');
    else {
      out.push(`Insumos: ${b.insumos===null?textos[b.estados_campos.insumos]:dinero(b.insumos)}; mano de obra: ${b.mano_obra===null?textos[b.estados_campos.mano_obra]:dinero(b.mano_obra)}; ${b.total===null?'sin total completo verificado':`total: ${dinero(b.total)}`}.`);
      if(b.total===null&&b.total_guardado!==null)out.push(`Total guardado: ${dinero(b.total_guardado)}; ${b.estado==='discrepancia'?textos.discrepancia:'faltan componentes verificados'}.`);
    }
    out.push('Advertencia de calidad de origen: hay cierres afectados por precios mal capturados. No se corrigen ni se certifican aquí.');
  }
  if(r.ejecucion){out.push(...renderValoracion(r.ejecucion,'Ejecución: subtotal de insumos a precio de hoy'));out.push(r.consulta.desde?`Ejecución del ${formatLongDate(r.consulta.desde)} al ${formatLongDate(r.consulta.hasta!)}, ambas fechas incluidas.`:'Ejecución de vida completa.');out.push('No es costo histórico ni costo total de la aplicación.');}
  if(r.plan){out.push(...renderValoracion(r.plan,'Plan guardado a precio de hoy'));out.push('Plan completo guardado, separado de la ejecución y del costo congelado. No verifica el plan exacto por lote.');}
  out.push('Lecturas independientes de los datos visibles; no garantizan un mismo momento entre tablas.');
  return out.join('\n');
}
