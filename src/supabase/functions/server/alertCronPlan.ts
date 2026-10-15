import {
  alertasSuperadasPorCambioDeRegla, alertasConHechoRegistrado,
  generarAlertasPendientes, resumirCoberturaAlertas, decidirAccionEscalamiento, decidirExpiracionTerminal,
  ESTADOS_ALERTA_RESPONSIBLES,
  type AnimalHatoParaAlertas, type PasoTratamientoPendienteInput,
  type AlertaAbiertaConHecho, type EventoHatoParaRetiro, type EstadoAlertaHato,
} from './hato-alertas.ts';
import { construirHatoConfigDesdeFilas } from './hato-config-desde-tabla.ts';

export type JsonRow = Record<string, unknown>;
export const cronObject = (x: unknown): x is JsonRow => !!x && typeof x === 'object' && !Array.isArray(x);
export const cronUuid = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
export function cronRows(x: unknown): JsonRow[] {
  if (!Array.isArray(x) || !x.every(cronObject)) throw Error('Original reserved rows required.');
  return x;
}
export interface CronPlan {
  generate: Array<{tipo: string; animal_id: string | null; paso_id: string | null; regla_clave: string; fecha_programada: string; datos: JsonRow}>;
  updates: Array<{id: string; patch: {estado: string; datos?: JsonRow}}>;
  deliveries: Array<{reglaClave: string; registrationId: string; phase: 'delivery' | 'escalation'; text: string}>;
}
/** Pure planning: only the reserved source and server time, never a fresh read or wall clock. */
export function analyzeAlertCron(source: unknown, referenceAt: string) {
  if (!cronObject(source) || !cronObject(source.domain) || !Number.isFinite(Date.parse(referenceAt))) throw Error('Original reserved source/time required.');
  const domain = source.domain;
  const alerts = cronRows(domain.alerts), animals = cronRows(domain.animals);
  const headers = cronRows(domain.headers), steps = cronRows(domain.steps);
  const events = cronRows(domain.events);
  const view = cronRows(source.animalsView), configRows = cronRows(source.config);
  const config = construirHatoConfigDesdeFilas(configRows.map(r => {
    if (typeof r.clave !== 'string') throw Error('Reserved configuration key required.');
    return {clave:r.clave, valor:r.valor};
  }));
  const alertConfig = cronRows(source.alertConfig), subscriptions = cronRows(source.subscriptions);
  const registrations = cronRows(source.registrations), profiles = cronRows(source.profiles);
  const date = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(referenceAt));
  const pending: PasoTratamientoPendienteInput[] = [];
  for (const step of steps) {
    if (step.fecha_ejecutada !== null) continue;
    const header = headers.find(h => h.id === step.tratamiento_id && h.estado === 'activo');
    const animal = header && animals.find(a => a.id === header.animal_id);
    if (!header || !animal) continue;
    if (!cronUuid(step.id) || !cronUuid(animal.id) || typeof step.fecha_programada !== 'string') throw Error('Reserved pending step required.');
    pending.push({paso_id:step.id, animal_id:animal.id, numero:animal.numero as number|null, nombre:animal.nombre as string|null, fecha_programada:step.fecha_programada, descripcion:step.descripcion as string|null});
  }
  const generated = generarAlertasPendientes(view as unknown as AnimalHatoParaAlertas[], pending, config, new Set(alerts.map(a => String(a.regla_clave))), date);
  const plan: CronPlan = {generate:generated.map(a => ({tipo:a.tipo, animal_id:a.animal_id, paso_id:a.tipo==='tratamiento_paso'?String(a.datos.paso_id):null, regla_clave:a.regla_clave, fecha_programada:a.fecha_programada, datos:{...a.datos,mensaje:a.mensaje}})), updates:[], deliveries:[]};
  const open = alerts.filter(a => ESTADOS_ALERTA_RESPONSIBLES.includes(a.estado as EstadoAlertaHato));
  // Never spread a historical scalar/array into replacement JSONB.
  const editable = open.filter(a => a.datos === null || cronObject(a.datos));
  const retired = alertasSuperadasPorCambioDeRegla(editable as unknown as AlertaAbiertaConHecho[], referenceAt);
  const ids = new Set(retired.map(a => a.id));
  const byFact = alertasConHechoRegistrado(editable.filter(a => !ids.has(String(a.id))) as unknown as AlertaAbiertaConHecho[], events as unknown as EventoHatoParaRetiro[], referenceAt);
  for (const a of [...retired,...byFact]) { ids.add(a.id); plan.updates.push({id:a.id,patch:{estado:'descartada',datos:a.datos}}); }
  function recipients(type: string, phase: 'delivery'|'escalation') {
    const found = new Map<string,JsonRow>();
    for (const sub of subscriptions) {
      if (sub.alerta_clave !== 'hato.'+type || sub[phase==='delivery'?'recibe':'escalamiento'] !== true) continue;
      const reg = registrations.find(r => r.id === sub.telegram_usuario_id);
      if (!reg || reg.activo !== true || !Array.isArray(reg.modulos_permitidos) || !reg.modulos_permitidos.includes('hato_produccion') || !Number.isSafeInteger(reg.telegram_id) || Number(reg.telegram_id)<=0) continue;
      if (reg.usuario_id !== null && !profiles.some(p => p.id === reg.usuario_id && p.activo === true)) continue;
      if (!cronUuid(reg.id)) throw Error('Reserved registration required.');
      found.set(reg.id,reg);
    }
    return [...found.keys()];
  }
  const candidates: JsonRow[] = [...alerts, ...plan.generate.map(a => ({...a,estado:'pendiente',intentos:0,updated_at:referenceAt}))];
  for (const a of candidates) {
    if (ids.has(String(a.id))) continue;
    const cfg = alertConfig.find(c => c.tipo === a.tipo);
    if (decidirExpiracionTerminal(a as unknown as Parameters<typeof decidirExpiracionTerminal>[0], referenceAt)) {
      if (!cronUuid(a.id)) throw Error('Original lifecycle ID required.');
      plan.updates.push({id:a.id,patch:{estado:'expirada'}}); continue;
    }
    if (a.estado !== 'pendiente' && a.estado !== 'enviada') continue;
    // Expiration applies even in shadow mode; disabled configuration never authorizes sending.
    const data = cronObject(a.datos) ? a.datos : null;
    const hours = cfg?.horas_escalamiento;
    if (cfg && (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0)) throw Error('Reserved escalation threshold required.');
    const action = decidirAccionEscalamiento(a as unknown as Parameters<typeof decidirAccionEscalamiento>[0], typeof data?.enviada_en==='string'?data.enviada_en:null, typeof hours==='number'?hours:Number.MAX_SAFE_INTEGER, referenceAt);
    if (action==='expirar') {
      if (!cronUuid(a.id)) throw Error('Original expiration ID required.');
      plan.updates.push({id:a.id,patch:{estado:'expirada'}}); continue;
    }
    if (!cfg || cfg.activo !== true) continue;
    let phase: 'delivery'|'escalation' = 'delivery';
    if (action==='escalar') {
      if (!cronUuid(a.id)) throw Error('Original escalation ID required.');
      plan.updates.push({id:a.id,patch:{estado:'escalada'}}); phase='escalation';
    } else {
      if (!Number.isInteger(a.intentos) || Number(a.intentos)<0) throw Error('Reserved attempt budget required.');
      if (Number(a.intentos)>=3 || (Number(a.intentos)>0 && (typeof a.updated_at!=='string' || Date.parse(referenceAt)-Date.parse(a.updated_at)<48*3600000 || !Number.isFinite(Date.parse(a.updated_at))))) continue;
    }
    const text = typeof data?.mensaje==='string' ? data.mensaje : 'Alerta de hato pendiente. Revise la alerta original.';
    const body = phase==='escalation' ? `⏰ Sin respuesta hace más de ${hours}h -- ${text}` : text;
    for (const registrationId of recipients(String(a.tipo),phase)) plan.deliveries.push({reglaClave:String(a.regla_clave),registrationId,phase,text:body});
  }
  if (plan.generate.length>500 || plan.updates.length>500 || plan.deliveries.length>1000 || plan.deliveries.some(d => d.text.length<1||d.text.length>3500)) throw Error('Reserved plan exceeds atomic bounds; no partial tick is allowed.');
  return {plan,coverage:resumirCoberturaAlertas(view as unknown as AnimalHatoParaAlertas[],pending,config,new Map(alerts.map(a=>[String(a.regla_clave),a.estado as EstadoAlertaHato])),date)};
}

export function planAlertCron(source:unknown,referenceAt:string):CronPlan{return analyzeAlertCron(source,referenceAt).plan;}
