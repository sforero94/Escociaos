import { verificarIntencionPlan } from './intencion.ts';
// Inventario declarado de la solicitud. Valida correspondencia, nunca exhaustividad semántica.
import type { OperacionConsulta, Plan, ResultadoConsulta } from './tipos.ts';
import { resolverIdentidadAplicaciones } from './aplicacionesIdentidad.ts';

export const CAPACIDADES_PARTE = ['labores', 'aplicaciones', 'cantidades_aplicacion', 'costos_aplicacion', 'labor_aplicacion', 'faltantes_aplicacion', 'monitoreo', 'conductividad', 'clima', 'hato', 'pesajes_leche', 'litros_quincenales', 'fuera_de_contrato'] as const;
export const DISPOSICIONES_DECLARADAS = ['consultar', 'aclarar', 'fuera_de_contrato'] as const;
export type CapacidadParte = typeof CAPACIDADES_PARTE[number];
export interface ParteDeclarada { id: string; texto: string; capacidad: CapacidadParte; disposicion: typeof DISPOSICIONES_DECLARADAS[number] }
export interface InventarioDeclarado { version: 1; partes: ParteDeclarada[] }
export interface CoberturaPlan extends InventarioDeclarado { pregunta: string }
export type ModoCobertura = 'obligatoria' | 'legado_sin_certificar';
export interface ParteCubierta {
  id: string; texto: string; capacidad: CapacidadParte;
  disposicion: 'respondida' | 'fuente_no_disponible' | 'aclarar' | 'fuera_de_contrato';
  resultado_ids: string[]; parcial?: true;
  verificacion?: {obligacion_id:string;poblacion:'seleccionada'|'desconocida';medidas:'completas'|'parciales';detalle:{filas_totales:number;filas_mostradas:number;completo:boolean}};
}
export interface CoberturaTurno {
  version: 1; estado: 'declarada_validada' | 'no_certificada';
  exhaustividad: 'no_certificada'; partes: ParteCubierta[];
  pendientes_intencion?: {inicio:number;fin:number;motivo:'ambiguo'|'no_soportado'|'no_interpretado'}[];
}
export const coberturaNoCertificada = (): CoberturaTurno => ({ version: 1, estado: 'no_certificada', exhaustividad: 'no_certificada', partes: [] });
export const ESQUEMA_COBERTURA = {
  type: 'object', additionalProperties: false, required: ['version', 'partes'], properties: {
    version: { type: 'integer', enum: [1] },
    partes: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['id', 'texto', 'capacidad', 'disposicion'], properties: {
      id: { type: 'string', pattern: '^s[1-8]$' }, texto: { type: 'string', minLength: 1, maxLength: 300 },
      capacidad: { type: 'string', enum: [...CAPACIDADES_PARTE] }, disposicion: { type: 'string', enum: [...DISPOSICIONES_DECLARADAS] },
    } } },
  },
};
export const ESQUEMA_PARTE_IDS = { type: 'array', maxItems: 8, uniqueItems: true, items: { type: 'string', pattern: '^s[1-8]$' } };
const objeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const fallar = (motivo = 'cobertura_no_valida'): never => { throw new Error(motivo); };
/** Case-, accent-, punctuation- and space-insensitive form. A part must still quote the question. */
export const normalizarTextoParte = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[¿?¡!.,;:«»"“”'‘’()]/g, ' ').replace(/\s+/g, ' ').trim();
export function validarInventarioDeclarado(valor: unknown, pregunta: string): CoberturaPlan {
  if (!objeto(valor) || Object.keys(valor).some(k => !['version', 'partes'].includes(k)) || valor.version !== 1 || !Array.isArray(valor.partes) || !valor.partes.length || valor.partes.length > 8 || typeof pregunta !== 'string') return fallar('inventario_forma');
  const preguntaNormal = normalizarTextoParte(pregunta);
  const partes = valor.partes.map((p: unknown, indice): ParteDeclarada => {
    if (!objeto(p) || Object.keys(p).some(k => !['id', 'texto', 'capacidad', 'disposicion'].includes(k)) || p.id !== `s${indice + 1}`) return fallar('parte_forma');
    if (typeof p.texto !== 'string' || !p.texto.trim() || p.texto.length > 300 || !normalizarTextoParte(p.texto) || !preguntaNormal.includes(normalizarTextoParte(p.texto))) return fallar('texto_no_literal');
    if (!CAPACIDADES_PARTE.includes(p.capacidad as CapacidadParte) || !DISPOSICIONES_DECLARADAS.includes(p.disposicion as ParteDeclarada['disposicion'])) return fallar('parte_forma');
    if ((p.disposicion === 'fuera_de_contrato') !== (p.capacidad === 'fuera_de_contrato')) return fallar('fuera_de_contrato_inconsistente');
    return { id: p.id, texto: p.texto, capacidad: p.capacidad as CapacidadParte, disposicion: p.disposicion as ParteDeclarada['disposicion'] };
  });
  return { version: 1, pregunta, partes };
}
export function validarCorrespondenciaPlan(cobertura: CoberturaPlan, operaciones: OperacionConsulta[]): void {
  validarInventarioDeclarado({ version: cobertura.version, partes: cobertura.partes }, cobertura.pregunta);
  if (operaciones.length > 4) return fallar('limite');
  for (const o of operaciones) {
    if (!Array.isArray(o.parte_ids) || !o.parte_ids.length || o.parte_ids.length > 8 || new Set(o.parte_ids).size !== o.parte_ids.length) return fallar('parte_ids_forma');
    for (const id of o.parte_ids) {
      const parte = cobertura.partes.find(p => p.id === id);
      if (!parte) return fallar('parte_id_inexistente');
      if (parte.disposicion !== 'consultar') return fallar('vinculo_a_parte_no_consultar');
      if (parte.capacidad !== o.tipo) return fallar('capacidad_no_coincide');
    }
  }
  for (const p of cobertura.partes) {
    const cantidad = operaciones.filter(o => o.parte_ids?.includes(p.id)).length;
    if (p.disposicion === 'consultar' && cantidad === 0) return fallar('parte_consultar_sin_operacion');
    if (p.disposicion !== 'consultar' && cantidad > 0) return fallar('vinculo_a_parte_no_consultar');
  }
}
/** Ordena claves para comparar consultas, sin transformar sus valores. */
const canonico = (v: unknown): string => JSON.stringify(v, (_k, x) => objeto(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
function validarResultado(o: OperacionConsulta, r: ResultadoConsulta, indice: number, hoy?: string): void {
  if (!r || r.id !== `p${indice + 1}` || ('tipo' in r ? r.tipo : 'labores') !== o.tipo) return fallar();
  if ('consulta' in r && canonico(r.consulta) !== canonico(o.consulta)) return fallar();
  if ((o.tipo === 'cantidades_aplicacion' || o.tipo === 'costos_aplicacion') && 'aplicacion' in r && r.aplicacion) {
    const identidad = resolverIdentidadAplicaciones({ aplicacion_ids: o.consulta.aplicacion_id ? [o.consulta.aplicacion_id] : [], aplicaciones: o.consulta.aplicacion ? [o.consulta.aplicacion] : [] }, [r.aplicacion]);
    if (identidad.estado !== 'ok') return fallar();
  }
  if (o.tipo === 'labores' && !('tipo' in r) && r.estado !== 'no_disponible' && r.estado !== 'no_resuelto') {
    const hasta = o.consulta.cohorte === 'tarea_programada' || !hoy || o.consulta.hasta <= hoy ? o.consulta.hasta : hoy;
    const tieneLotes = !!o.consulta.lotes.length || !!o.consulta.lote_ids?.length;
    if (r.alcance.desde !== o.consulta.desde || r.alcance.hasta !== hasta || r.alcance.hasta_recortado_a_hoy !== (hasta !== o.consulta.hasta) || r.alcance.sin_lote !== (tieneLotes ? 'excluir' : o.consulta.sin_lote)) return fallar();
    for (const [solicitados, presentes, textos] of [[o.consulta.tarea_ids, r.alcance.tarea_ids, o.consulta.tareas], [o.consulta.lote_ids, r.alcance.lote_ids, o.consulta.lotes]] as const)
      if (solicitados?.length && (!presentes || presentes.some(id => !solicitados.includes(id)) || !textos.length && canonico([...solicitados].sort()) !== canonico([...presentes].sort()) || r.estado === 'ok' && !presentes.length)) return fallar();
  }
}
function disposicionResultado(r: ResultadoConsulta, o: OperacionConsulta): Pick<ParteCubierta, 'disposicion' | 'parcial'> {
  const semantica = !('tipo' in r) ? r.semantica?.disposicion : undefined;
  if (r.estado === 'no_resuelto' || r.estado === 'aclaracion' || semantica === 'aclaracion') return { disposicion: 'aclarar' };
  if (r.estado === 'no_soportada' || semantica === 'no_soportada') return { disposicion: 'fuera_de_contrato' };
  // La historia con cobertura explícita responde aun con NULL o días sin fila.
  if (o.tipo === 'clima' && r.estado === 'parcial') return { disposicion: 'respondida' };
  if (r.estado === 'parcial') return { disposicion: 'fuente_no_disponible', parcial: true };
  if (r.estado === 'no_disponible' || semantica === 'fuente_no_disponible') return { disposicion: 'fuente_no_disponible' };
  if (o.tipo === 'labores' && !('tipo' in r)) {
    const faltaMetrica = r.estado !== 'sin_registros' && o.consulta.metricas.some(m => r.total[m] === null || r.total[m] === undefined || r.filas.some(f => f[m] === null || f[m] === undefined));
    const faltaEstimado = !!o.consulta.categorias.length && (!r.estimados || !!r.estimados.tareas_sin_estimado || !!r.estimados.tareas_estimado_no_disponible);
    const faltaMetadato = o.consulta.incluir_estado_tarea && r.filas.some(f => !!f.campos_no_disponibles?.length || f.estado_tarea === null || f.estado_tarea === undefined || f.asociaciones?.estado === 'no_disponible');
    if (faltaMetrica || faltaEstimado || faltaMetadato) return { disposicion: 'fuente_no_disponible', parcial: true };
  }
  if (!['ok', 'sin_registros', 'vacio_verificado'].includes(r.estado)) return fallar();
  return { disposicion: 'respondida' };
}
export function construirCoberturaFinal(plan: Plan | null, resultados: ResultadoConsulta[], hoy?: string): CoberturaTurno {
  if (!plan?.cobertura) return coberturaNoCertificada();
  if(plan.intencion) verificarIntencionPlan(plan.intencion,plan);
  const operaciones: OperacionConsulta[] = plan.tipo === 'operaciones' ? plan.operaciones : plan.tipo === 'consultas' ? plan.consultas.map(consulta => ({ tipo: 'labores' as const, consulta })) : [];
  validarCorrespondenciaPlan(plan.cobertura, operaciones);
  if (resultados.length !== operaciones.length || new Set(resultados.map(r => r.id)).size !== resultados.length) return fallar();
  operaciones.forEach((o, i) => validarResultado(o, resultados[i], i, hoy));
  const partes = plan.cobertura.partes.map((p): ParteCubierta => {
    const propios = resultados.filter((_r, i) => operaciones[i].parte_ids?.includes(p.id));
    if (p.disposicion !== 'consultar') return { ...p, resultado_ids: [], disposicion: p.disposicion };
    const estados = resultados.flatMap((r, i) => operaciones[i].parte_ids?.includes(p.id) ? [disposicionResultado(r, operaciones[i])] : []);
    let disposicion: ParteCubierta['disposicion'] = estados.some(e => e.disposicion === 'aclarar') ? 'aclarar' : estados.some(e => e.disposicion === 'fuera_de_contrato') ? 'fuera_de_contrato' : estados.some(e => e.disposicion === 'fuente_no_disponible') ? 'fuente_no_disponible' : 'respondida';
    const ob=plan.intencion?.obligaciones.find(o=>`s${o.id.slice(1)}`===p.id);
    let verificacion:ParteCubierta['verificacion'];
    if(ob){
      const detalles=propios.map(r=>ob.ranking&&!('tipo' in r)&&!r.analisis?{filas_totales:r.filas.length,filas_mostradas:r.filas.length}:detalleResultado(r));
      const medidasCompletas=propios.every(r=>medidasDisponibles(r,ob.metricas));
      const poblacionConocida=propios.every(r=>!('tipo' in r&&r.tipo==='aplicaciones'&&(r.excluidos.sin_fecha||r.excluidos.sin_estado))&&r.estado!=='no_disponible');
      const detalle={filas_totales:detalles.reduce((n,d)=>n+d.filas_totales,0),filas_mostradas:detalles.reduce((n,d)=>n+d.filas_mostradas,0),completo:detalles.every(d=>d.filas_totales===d.filas_mostradas)};
      verificacion={obligacion_id:ob.id,poblacion:poblacionConocida?'seleccionada':'desconocida',medidas:medidasCompletas?'completas':'parciales',detalle};
      if(disposicion==='fuente_no_disponible'&&verificacion.poblacion==='seleccionada'&&medidasCompletas&&propios.every(r=>r.estado==='ok'||r.estado==='parcial'||r.estado==='vacio_verificado'||r.estado==='sin_registros'))disposicion='respondida';
      if(disposicion==='respondida'&&(!medidasCompletas||!poblacionConocida||ob.detalle==='exhaustivo'&&!detalle.completo))disposicion='fuente_no_disponible';
    }
    return { id: p.id, texto: p.texto, capacidad: p.capacidad, disposicion, resultado_ids: propios.map(r => r.id), ...(verificacion?{verificacion}:{}), ...(disposicion === 'fuente_no_disponible' && (estados.some(e => e.parcial)||!!verificacion) ? { parcial: true as const } : {}) };
  });
  return { version: 1, estado: 'declarada_validada', exhaustividad: 'no_certificada', partes, ...(plan.intencion?{pendientes_intencion:structuredClone(plan.intencion.residuales)}:{}) };
}
export function validarCoberturaFinal(cobertura: CoberturaTurno, plan: Plan | null, resultados: ResultadoConsulta[], hoy?: string): boolean {
  try { return canonico(cobertura) === canonico(construirCoberturaFinal(plan, resultados, hoy)); } catch { return false; }
}
export function validarFormaCoberturaFinal(c: CoberturaTurno, resultados: ResultadoConsulta[]): void {
  if (!objeto(c) || Object.keys(c).some(k => !['version', 'estado', 'exhaustividad', 'partes', 'pendientes_intencion'].includes(k)) || c.version !== 1 || c.exhaustividad !== 'no_certificada' || !Array.isArray(c.partes)) return fallar();
  if (c.estado === 'no_certificada') { if (c.partes.length) return fallar(); return; }
  if (c.estado !== 'declarada_validada' || !c.partes.length || c.partes.length > 8) return fallar();
  const usados = new Set<string>();
  c.partes.forEach((p, i) => {
    if (!objeto(p) || Object.keys(p).some(k => !['id', 'texto', 'capacidad', 'disposicion', 'resultado_ids', 'parcial', 'verificacion'].includes(k)) || p.id !== `s${i + 1}` || typeof p.texto !== 'string' || !p.texto.trim() || p.texto.length > 300 || !CAPACIDADES_PARTE.includes(p.capacidad) || !['respondida', 'fuente_no_disponible', 'aclarar', 'fuera_de_contrato'].includes(p.disposicion) || p.parcial !== undefined && p.parcial !== true || !Array.isArray(p.resultado_ids) || new Set(p.resultado_ids).size !== p.resultado_ids.length) return fallar();
    if (p.disposicion === 'respondida' && !p.resultado_ids.length || p.parcial && p.disposicion !== 'fuente_no_disponible') return fallar();
    for (const id of p.resultado_ids) {
      const r = resultados.find(r => r.id === id);
      if (!r || ('tipo' in r ? r.tipo : 'labores') !== p.capacidad) return fallar();
      usados.add(id);
    }
  });
  if (resultados.some(r => !usados.has(r.id))) return fallar();
}

function detalleResultado(r:ResultadoConsulta):{filas_totales:number;filas_mostradas:number}{
 if(r.analisis)return {filas_totales:r.analisis.detalle.filas_totales,filas_mostradas:r.analisis.detalle.filas_mostradas};
 if(!('tipo' in r))return {filas_totales:r.cobertura.grupos_totales,filas_mostradas:r.cobertura.grupos_mostrados};
 if(r.tipo==='monitoreo'&&r.detalle)return r.detalle;
 if(r.tipo==='hato')return {filas_totales:r.filas.length,filas_mostradas:Math.min(20,r.filas.length)};
 if(r.tipo==='pesajes_leche'||r.tipo==='litros_quincenales'||r.tipo==='clima')return {filas_totales:r.filas.length,filas_mostradas:Math.min(30,r.filas.length)};
 if(r.tipo==='conductividad')return {filas_totales:r.filas.length,filas_mostradas:Math.min(20,r.filas.length)};
 if('filas' in r)return {filas_totales:r.filas.length,filas_mostradas:r.filas.length};
 if(r.resultados_poblacion){const ds=r.resultados_poblacion.map(detalleResultado);return {filas_totales:ds.reduce((n,d)=>n+d.filas_totales,0),filas_mostradas:ds.reduce((n,d)=>n+d.filas_mostradas,0)};}
 return {filas_totales:1,filas_mostradas:1};
}
function medidasDisponibles(r:ResultadoConsulta,metricas:string[]):boolean{
 if(r.analisis){
  if(r.analisis.estado==='no_disponible'||r.analisis.estado==='no_soportado')return false;
  const requeridas=new Set([...metricas,...(r.analisis.comparacion?[r.analisis.comparacion.metrica]:[])]);
  if(r.analisis.filas.some(f=>f.seleccion==='indeterminado'||[...requeridas].some(m=>f.metricas[m]&&f.metricas[m].estado!=='completo'))||r.analisis.comparacion?.delta===null)return false;
 }
 if('tipo' in r&&r.tipo==='conductividad')return ['ok','parcial','vacio_verificado'].includes(r.estado)&&r.filas.every(f=>metricas.every(m=>m==='distribucion'?f.distribucion!==null:m==='valor_ce'?f.valor_ce!==null:m==='ph'?f.ph!==null:false));
 if('tipo' in r&&r.tipo==='hato')return ['ok','parcial','vacio_verificado'].includes(r.estado)&&r.filas.every(f=>metricas.every(m=>m==='ficha'?f.ficha.campos_no_leidos.length===0&&Object.values(f.ficha.parentescos).every(p=>p.estado==='visible'||p.estado==='sin_vinculo'):m==='reproduccion'?f.reproduccion.estado==='ok':false));
 if('tipo' in r&&r.tipo==='clima')return r.resumen.every(s=>metricas.every(m=>{const v=s.variables[m as keyof typeof s.variables];return !!v&&v.cobertura.usables===v.cobertura.solicitados&&v.cobertura.calidad_desconocida===0&&s.cobertura_temporal.parcial===0&&s.cobertura_temporal.desconocida===0;}));
 return !['parcial','no_disponible','no_resuelto','aclaracion'].includes(r.estado);
}
