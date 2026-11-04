// Ephemeral, caller-bound transport. Tokens carry no client-editable scope/history.
import { validarPlan } from './registro.ts';
import type { Plan } from './tipos.ts';
export interface EstadoTurno {
    version: 1;
    decisiones?: Record<string, 'tarea' | 'categoria'>;
    plan: Extract<Plan, {
        tipo: 'consultas';
    }>;
    pendiente?: {
        indice: number;
        termino: string;
        pregunta: string;
        opciones: {
            id: string;
            etiqueta: string;
            tipo: 'tarea' | 'categoria';
            tarea_ids?: string[];
            categorias?: string[];
        }[];
    };
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
        if (estado.version !== 1 || estado.plan.tipo !== 'consultas' || !estado.plan.consultas.length || estado.plan.consultas.length > 4)
            return false;
        validarPlan(estado.plan.consultas.map(c => ({ nombre: 'consultar_labores', argumentos: JSON.stringify(c) })));
        if (estado.decisiones && Object.values(estado.decisiones).some(v => v !== 'tarea' && v !== 'categoria'))
            return false;
        const p = estado.pendiente;
        return !p || (Number.isInteger(p.indice) && p.indice >= 0 && p.indice < estado.plan.consultas.length && typeof p.termino === 'string' && p.opciones.length === 2 && p.opciones.every(o => ['tarea', 'categoria'].includes(o.id) && o.id === o.tipo && (o.tipo === 'tarea' ? Array.isArray(o.tarea_ids) && o.tarea_ids.every(id => typeof id === 'string') : Array.isArray(o.categorias) && o.categorias.every(c => typeof c === 'string'))));
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
