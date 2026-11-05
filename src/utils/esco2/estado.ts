// Ephemeral, caller-bound transport. Tokens carry no client-editable scope/history.
import { validarPlan } from './registro.ts';
import { operacionesDelPlan, type PlanConsultas } from './tipos.ts';
import type { BaseFechaAplicaciones } from './aplicacionesTipos.ts';
export type BaseFechaEjecutable = Exclude<BaseFechaAplicaciones, 'sin_precisar' | 'cierre_administrativo'>;
export const OPCIONES_FECHA_APLICACIONES: { id: BaseFechaEjecutable; etiqueta: string; base_fecha: BaseFechaEjecutable }[] = [
    { id: 'fecha_inicio_planeada', etiqueta: 'Inicio planeado', base_fecha: 'fecha_inicio_planeada' },
    { id: 'fecha_movimiento', etiqueta: 'Fecha de los movimientos', base_fecha: 'fecha_movimiento' },
    { id: 'fecha_cierre_operativo', etiqueta: 'Cierre operativo registrado', base_fecha: 'fecha_cierre_operativo' },
];
export interface PendienteLabor {
    tipo?: 'labores';
    indice: number;
    termino: string;
    pregunta: string;
    opciones: { id: string; etiqueta: string; tipo: 'tarea' | 'categoria'; tarea_ids?: string[]; categorias?: string[] }[];
}
export interface PendienteFechaAplicaciones {
    tipo: 'fecha_aplicaciones';
    indice: number;
    pregunta: string;
    opciones: typeof OPCIONES_FECHA_APLICACIONES;
}
export interface EstadoTurno {
    version: 1;
    decisiones?: Record<string, 'tarea' | 'categoria'>;
    plan: PlanConsultas;
    pendiente?: PendienteLabor | PendienteFechaAplicaciones;
}
export const MAX_ESTADO_BYTES = 64 * 1024;
export const TTL_ESTADO_MS = 15 * 60 * 1000;
export const MAX_ESTADOS = 200;
const estados = new Map<string, {
    owner: string;
    vence: number;
    estado: EstadoTurno;
}>();
export function validarEstado(estado: EstadoTurno): boolean {
    try {
        if (new TextEncoder().encode(JSON.stringify(estado)).length > MAX_ESTADO_BYTES)
            return false;
        if (estado.version !== 1 || !['consultas', 'operaciones'].includes(estado.plan.tipo))
            return false;
        if (estado.plan.parcialFueraDeAlcance !== undefined && estado.plan.parcialFueraDeAlcance !== true) return false;
        const operaciones = operacionesDelPlan(estado.plan);
        if (!operaciones.length || operaciones.length > 4) return false;
        const herramientaDe: Record<string, string> = { labores: 'consultar_labores', aplicaciones: 'consultar_aplicaciones', cantidades_aplicacion: 'consultar_cantidades_aplicacion', costos_aplicacion: 'consultar_costos_aplicacion', labor_aplicacion: 'consultar_labor_aplicacion', faltantes_aplicacion: 'consultar_faltantes_aplicacion' };
        if (operaciones.some(o => !o || !Object.prototype.hasOwnProperty.call(herramientaDe, o.tipo))) return false;
        validarPlan([...operaciones.map(o => ({ nombre: herramientaDe[o.tipo], argumentos: JSON.stringify(o.consulta) })), ...(estado.plan.parcialFueraDeAlcance ? [{ nombre: 'fuera_de_alcance', argumentos: JSON.stringify({ motivo: 'parte_no_soportada' }) }] : [])]);
        if (estado.decisiones && Object.values(estado.decisiones).some(v => v !== 'tarea' && v !== 'categoria'))
            return false;
        const p = estado.pendiente;
        if (!p) return true;
        if (!Number.isInteger(p.indice) || p.indice < 0 || p.indice >= operaciones.length || typeof p.pregunta !== 'string' || p.tipo !== undefined && !['labores', 'fecha_aplicaciones'].includes(p.tipo)) return false;
        const operacion = operaciones[p.indice];
        if (p.tipo === 'fecha_aplicaciones') return operacion.tipo === 'aplicaciones' && operacion.consulta.base_fecha === 'sin_precisar' && p.opciones.length === OPCIONES_FECHA_APLICACIONES.length && p.opciones.every((o, i) => o.id === OPCIONES_FECHA_APLICACIONES[i].id && o.base_fecha === o.id && o.etiqueta === OPCIONES_FECHA_APLICACIONES[i].etiqueta);
        return operacion.tipo === 'labores' && (p.tipo === undefined || p.tipo === 'labores') && typeof p.termino === 'string' && p.opciones.length === 2 && new Set(p.opciones.map(o => o.id)).size === 2 && p.opciones.every(o => ['tarea', 'categoria'].includes(o.id) && o.id === o.tipo && (o.tipo === 'tarea' ? Array.isArray(o.tarea_ids) && o.tarea_ids.every(id => typeof id === 'string') : Array.isArray(o.categorias) && o.categorias.every(c => typeof c === 'string')));
    }
    catch {
        return false;
    }
}
export function guardarEstado(owner: string, estado: EstadoTurno, ahora: number): string | undefined {
    if (!validarEstado(estado))
        return undefined;
    for (const [token, value] of estados)
        if (value.vence <= ahora)
            estados.delete(token);
    while (estados.size >= MAX_ESTADOS)
        estados.delete(estados.keys().next().value!);
    const token = crypto.randomUUID();
    estados.set(token, { owner, vence: ahora + TTL_ESTADO_MS, estado: structuredClone(estado) });
    return token;
}
export function leerEstado(token: string, owner: string, ahora: number): EstadoTurno | undefined {
    const value = estados.get(token);
    if (!value || value.owner !== owner || value.vence <= ahora || !validarEstado(value.estado))
        return undefined;
    return structuredClone(value.estado);
}
