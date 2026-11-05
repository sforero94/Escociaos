// Fuente de datos de labores. El núcleo no sabe si lee un snapshot congelado o
// Supabase con el JWT del usuario: las dos cumplen esta interfaz.
//
// Dos fases, porque el planificador necesita el catálogo (nombres) antes de planear y
// los registros solo hacen falta después, para el rango de fechas que el plan pide.
//
// Lectura de Supabase:
//  - Columnas fijas. Nunca `select('*')`: una columna nueva no entra sola al modelo.
//  - Paginada con `range`, ordenada por `id`. PostgREST corta en silencio a 1.000 filas;
//    aquí se pide el conteo exacto en la primera página y se sigue leyendo hasta
//    alcanzarlo. Si lo leído no coincide con él, la lectura falla. Nunca se responde
//    con datos recortados.
//  - El cliente se crea con el JWT del usuario: RLS aplica a cada lectura.
import { esFechaCalendario } from './fechaCalendario.ts';
import type { Aplicacion, DatosLabores, Lote, RegistroTrabajo, Tarea, TipoTarea } from './tipos.ts';
export type CatalogoLabores = Pick<DatosLabores, 'tareas' | 'tiposTareas' | 'lotes' | 'aplicaciones' | 'fuente'>;
export interface FuenteLabores {
    catalogo(): Promise<CatalogoLabores>;
    /** Registros con `fecha_trabajo` entre desde y hasta, inclusivos. */
    registros(desde: string, hasta: string): Promise<RegistroTrabajo[]>;
}
export class ErrorDatos extends Error {
}
export function fuenteEnMemoria(datos: DatosLabores): FuenteLabores {
    return {
        async catalogo() {
            return { tareas: datos.tareas, tiposTareas: datos.tiposTareas, lotes: datos.lotes, aplicaciones: datos.aplicaciones, fuente: datos.fuente };
        },
        async registros(desde, hasta) {
            return datos.registros.filter((r) => !esFechaCalendario(r.fecha_trabajo) || r.fecha_trabajo >= desde && r.fecha_trabajo <= hasta);
        },
    };
}
// --- Supabase -------------------------------------------------------------------
/** Subconjunto estructural del query builder de supabase-js que esta fuente usa. */
export interface RespuestaPostgrest {
    data: unknown[] | null;
    error: {
        message: string;
    } | null;
    count?: number | null;
}
export interface FiltroPostgrest extends PromiseLike<RespuestaPostgrest> {
    eq(columna: string, valor: string): FiltroPostgrest;
    gte(columna: string, valor: string): FiltroPostgrest;
    lte(columna: string, valor: string): FiltroPostgrest;
    in(columna: string, valores: string[]): FiltroPostgrest;
    order(columna: string, opciones?: {
        ascending?: boolean;
    }): FiltroPostgrest;
    range(desde: number, hasta: number): FiltroPostgrest;
}
export interface ClienteDatos {
    from(tabla: string): {
        select(columnas: string, opciones?: {
            count?: 'exact';
        }): FiltroPostgrest;
    };
}
export const COLUMNAS = {
    registros_trabajo: 'id,tarea_id,lote_id,fecha_trabajo,fraccion_jornal,costo_jornal',
    tareas: 'id,nombre,estado,tipo_tarea_id,jornales_estimados,lote_ids,fecha_estimada_inicio,fecha_estimada_fin,fecha_inicio_real,fecha_fin_real',
    tipos_tareas: 'id,nombre,categoria',
    lotes: 'id,nombre,activo,total_arboles,area_hectareas',
    aplicaciones: 'id,tarea_id,codigo_aplicacion,nombre_aplicacion,estado',
} as const;
export const TAMANO_PAGINA = 1000;
/** Tope de páginas por lectura: 50.000 filas. Más que eso es una consulta que no se debe correr así. */
export const MAX_PAGINAS = 50;
type Tabla = keyof typeof COLUMNAS;
async function leerTodo(cliente: ClienteDatos, tabla: Tabla, filtrar: (q: FiltroPostgrest) => FiltroPostgrest = (q) => q, tamanoPagina = TAMANO_PAGINA): Promise<Record<string, unknown>[]> {
    return leerFilasFijas(cliente, tabla, COLUMNAS[tabla], filtrar, tamanoPagina);
}
/** Shared exact-count pagination. Callers supply a closed, literal projection. */
export async function leerFilasFijas(cliente: ClienteDatos, tabla: string, columnas: string, filtrar: (q: FiltroPostgrest) => FiltroPostgrest = (q) => q, tamanoPagina = TAMANO_PAGINA): Promise<Record<string, unknown>[]> {
    if (!Number.isInteger(tamanoPagina) || tamanoPagina < 1 || tamanoPagina > TAMANO_PAGINA)
        throw new ErrorDatos('tamano_pagina_no_valido');
    const filas: Record<string, unknown>[] = [];
    let esperado: number | null = null;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        // El desplazamiento avanza por lo recibido, no por el tamaño pedido: si el servidor
        // corta por debajo de la página (`max-rows`), la siguiente página sigue donde quedó.
        const inicio = filas.length;
        const base = cliente.from(tabla).select(columnas, pagina === 0 ? { count: 'exact' } : undefined);
        const { data, error, count } = await filtrar(base).order('id', { ascending: true }).range(inicio, inicio + tamanoPagina - 1);
        if (error)
            throw new ErrorDatos(`${tabla}: ${error.message}`);
        if (!Array.isArray(data))
            throw new ErrorDatos(`${tabla}: respuesta sin filas`);
        if (pagina === 0) {
            if (typeof count !== 'number' || !Number.isInteger(count) || count < 0)
                throw new ErrorDatos(`${tabla}: sin conteo exacto, no se puede comprobar la lectura completa`);
            esperado = count;
        }
        filas.push(...(data as Record<string, unknown>[]));
        if (filas.length >= (esperado ?? 0) || data.length === 0)
            break;
    }
    if (filas.length !== esperado) {
        throw new ErrorDatos(`${tabla}: lectura incompleta (${filas.length} de ${esperado} filas)`);
    }
    return filas;
}
function texto(v: unknown, campo: string): string {
    if (typeof v !== 'string')
        throw new ErrorDatos(`${campo} no es texto`);
    return v;
}
function textoONulo(v: unknown, campo: string): string | null {
    if (v === undefined)
        throw new ErrorDatos(`${campo}: campo no leído`);
    return v === null ? null : texto(v, campo);
}
function fechaONula(v: unknown, campo: string): string | null {
    const t = textoONulo(v, campo);
    if (t !== null && !esFechaCalendario(t))
        throw new ErrorDatos(`${campo}: fecha inválida`);
    return t;
}
function numero(v: unknown, campo: string): number {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
    if (!Number.isFinite(n))
        throw new ErrorDatos(`${campo} no es número: ${String(v)}`);
    return n;
}
function numeroONulo(v: unknown, campo: string): number | null {
    if (v === undefined)
        throw new ErrorDatos(`${campo}: campo no leído`);
    return v === null ? null : numero(v, campo);
}
function opcional<T>(leer: () => T): T | undefined { try {
    return leer();
}
catch {
    return undefined;
} }
export function aRegistro(f: Record<string, unknown>): RegistroTrabajo {
    const fecha = texto(f.fecha_trabajo, 'registros_trabajo.fecha_trabajo');
    if (!esFechaCalendario(fecha))
        throw new ErrorDatos('registros_trabajo.fecha_trabajo: fecha inválida');
    return {
        id: texto(f.id, 'registros_trabajo.id'),
        tarea_id: texto(f.tarea_id, 'registros_trabajo.tarea_id'),
        lote_id: textoONulo(f.lote_id, 'registros_trabajo.lote_id'),
        fecha_trabajo: fecha,
        // ENUM `fraccion_jornal` ('0.25' | '0.5' | '0.75' | '1.0'): llega como texto.
        fraccion_jornal: numero(f.fraccion_jornal, 'registros_trabajo.fraccion_jornal'),
        // NULL ≠ 0: un costo ausente se conserva ausente.
        costo_jornal: (f.costo_jornal === undefined ? undefined : opcional(() => numeroONulo(f.costo_jornal, 'registros_trabajo.costo_jornal'))) as RegistroTrabajo['costo_jornal'],
    };
}
function aTarea(f: Record<string, unknown>): Tarea {
    return {
        id: texto(f.id, 'tareas.id'),
        nombre: texto(f.nombre, 'tareas.nombre'),
        estado: (f.estado === undefined ? undefined : opcional(() => textoONulo(f.estado, 'tareas.estado'))) as Tarea['estado'],
        tipo_tarea_id: (f.tipo_tarea_id === undefined ? undefined : textoONulo(f.tipo_tarea_id, 'tareas.tipo_tarea_id')) as Tarea['tipo_tarea_id'],
        jornales_estimados: (f.jornales_estimados === undefined ? undefined : opcional(() => numeroONulo(f.jornales_estimados, 'tareas.jornales_estimados'))) as Tarea['jornales_estimados'],
        ...(Object.prototype.hasOwnProperty.call(f, 'lote_ids') ? { lote_ids: f.lote_ids as string[] | null } : {}),
        ...(Object.prototype.hasOwnProperty.call(f, 'fecha_estimada_inicio') ? { fecha_estimada_inicio: opcional(() => fechaONula(f.fecha_estimada_inicio, 'tareas.fecha_estimada_inicio')) } : {}),
        ...(Object.prototype.hasOwnProperty.call(f, 'fecha_estimada_fin') ? { fecha_estimada_fin: opcional(() => fechaONula(f.fecha_estimada_fin, 'tareas.fecha_estimada_fin')) } : {}),
        ...(Object.prototype.hasOwnProperty.call(f, 'fecha_inicio_real') ? { fecha_inicio_real: opcional(() => fechaONula(f.fecha_inicio_real, 'tareas.fecha_inicio_real')) } : {}),
        ...(Object.prototype.hasOwnProperty.call(f, 'fecha_fin_real') ? { fecha_fin_real: opcional(() => fechaONula(f.fecha_fin_real, 'tareas.fecha_fin_real')) } : {}),
    };
}
// `aplicaciones.tarea_id` admite NULL en la base. Una aplicación sin tarea no se puede ligar a
// ninguna fila de labores, así que se omite. Lanzar aquí haría fallar el catálogo entero, y con
// él todo turno de Esco, por un dato que no cambia ninguna respuesta.
function aAplicacion(f: Record<string, unknown>): Aplicacion | null {
    if (f.tarea_id === null)
        return null;
    return {
        id: texto(f.id, 'aplicaciones.id'),
        tarea_id: texto(f.tarea_id, 'aplicaciones.tarea_id'),
        codigo_aplicacion: textoONulo(f.codigo_aplicacion, 'aplicaciones.codigo_aplicacion'),
        nombre_aplicacion: textoONulo(f.nombre_aplicacion, 'aplicaciones.nombre_aplicacion')?.trim() ?? null,
        estado: textoONulo(f.estado, 'aplicaciones.estado'),
    };
}
function aTipo(f: Record<string, unknown>): TipoTarea {
    return { id: texto(f.id, 'tipos_tareas.id'), nombre: texto(f.nombre, 'tipos_tareas.nombre'), categoria: (f.categoria === undefined ? undefined : opcional(() => textoONulo(f.categoria, 'tipos_tareas.categoria'))) as TipoTarea['categoria'] };
}
function aLote(f: Record<string, unknown>): Lote {
    return {
        id: texto(f.id, 'lotes.id'),
        nombre: texto(f.nombre, 'lotes.nombre'),
        activo: f.activo === null || f.activo === undefined ? null : f.activo === true,
        // NULL ≠ 0: un lote sin árboles o sin área registrados no tiene razón por árbol/hectárea.
        total_arboles: opcional(() => numeroONulo(f.total_arboles, 'lotes.total_arboles')),
        area_hectareas: opcional(() => numeroONulo(f.area_hectareas, 'lotes.area_hectareas')),
    };
}
export function fuenteSupabase(cliente: ClienteDatos, opciones: {
    tamanoPagina?: number;
} = {}): FuenteLabores {
    const tp = opciones.tamanoPagina ?? TAMANO_PAGINA;
    return {
        async catalogo() {
            const [tareas, tipos, lotes, aplicaciones] = await Promise.all([
                leerTodo(cliente, 'tareas', undefined, tp),
                leerTodo(cliente, 'tipos_tareas', undefined, tp),
                leerTodo(cliente, 'lotes', undefined, tp),
                leerTodo(cliente, 'aplicaciones', undefined, tp).then(rows => rows.map(aAplicacion).filter((a): a is Aplicacion => a !== null)).catch(() => undefined),
            ]);
            return { tareas: tareas.map(aTarea), tiposTareas: tipos.map(aTipo), lotes: lotes.map(aLote), aplicaciones, fuente: { consistencia: 'lecturas_independientes' } };
        },
        async registros(desde, hasta) {
            const filas = await leerTodo(cliente, 'registros_trabajo', (q) => q.gte('fecha_trabajo', desde).lte('fecha_trabajo', hasta), tp);
            return filas.map(aRegistro);
        },
    };
}
