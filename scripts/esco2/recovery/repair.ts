// A: retain ResultadoParte for metric facts; sidecar adds only missing semantics.
import { calcularNativo, denegada, permiso, prepararEntrada, proyectarClaims, seguridad, type ResultadoNativo } from './shared.ts';
import type { EntradaExperimento, SalidaExperimento } from './contracts.ts';
/** Direct legacy+sidecar renderer. It never reads a typed claim's metric value. */
export function renderRepair(natives: ResultadoNativo[]): string {
    return natives.map(n => {
        const o = n.obligacion;
        const lines = [`${o.id}: ${n.disposicion}${n.motivo ? ` (${n.motivo})` : ''}`];
        // This formatter takes primitive native fields, not a normalized claim object.
        const line = (entity: {
            tipo: string;
            id: string;
            nombre: string;
        }, metric: string, value: unknown, state?: string) => {
            const unit = metric === 'costo' ? 'moneda' : metric === 'miembros' || metric === 'asociaciones' ? 'ids' : metric === 'estado_actual' ? 'estado' : 'jornales';
            const status = state ?? (value === null ? 'nulo' : 'conocido');
            const rendered = status === 'conocido' || status === 'vacio_verificado' ? JSON.stringify(value) : status;
            lines.push(`${entity.nombre} [${entity.tipo}:${entity.id}] ${metric}: ${rendered}; unidad=${unit}; cohorte=${o.cohorte}; fecha=${o.baseFecha}; ${o.consulta.desde} a ${n.legado?.alcance.hasta ?? o.consulta.hasta}; ${n.calificadores.join(', ')}`);
        };
        const total = { tipo: 'total', id: 'total', nombre: 'Total' };
        if (n.legado) {
            if (o.requeridos.includes('metricas')) {
                for (const metric of o.consulta.metricas)
                    line(total, metric, n.legado.total[metric] ?? null);
                for (const row of n.filas)
                    for (const metric of o.consulta.metricas)
                        line(row.entidad, metric, row.fila[metric] ?? null);
            }
            if (n.miembros !== undefined)
                line(total, 'miembros', n.miembros, n.miembros.length ? 'conocido' : 'vacio_verificado');
            for (const task of n.tareas) {
                const entity = { tipo: 'tarea', id: task.id, nombre: task.nombre };
                if (o.requeridos.includes('estado_actual'))
                    line(entity, 'estado_actual', task.estado);
                if (o.requeridos.includes('asociaciones'))
                    line(entity, 'asociaciones', task.aplicaciones ?? null, !task.asociacionDisponible ? 'no_disponible' : task.aplicaciones!.length ? 'conocido' : 'vacio_verificado');
            }
            if (o.requeridos.includes('estimados') && n.estimado !== undefined)
                line(total, 'jornales_estimados', n.estimado);
            if (n.reconciliacion !== undefined)
                line(total, 'reconciliacion', n.reconciliacion);
        }
        lines.push(`Alcance: ${n.calificadores.join(', ')}`);
        return lines.join('\n');
    }).join('\n\n');
}
/** Native runtime benchmark path excludes the QA-only normalization below. */
export function executeRepairNative(input: EntradaExperimento) {
    if (!permiso(input))
        return { salida: denegada(input, 'repair'), natives: [] as ResultadoNativo[], entrada: input };
    const { entrada, estado, bloqueadas } = prepararEntrada(input);
    const natives = entrada.obligaciones.map(o => calcularNativo(entrada, o, bloqueadas.has(o.id)));
    const salida = { variante: 'repair' as const, resultados: [], texto: renderRepair(natives), estado, seguridad: seguridad(input, natives) };
    return { salida, natives, entrada };
}
export function executeRepair(input: EntradaExperimento): SalidaExperimento {
    const { salida, natives, entrada } = executeRepairNative(input);
    // Normalized claims are an evaluation/export boundary only, after native rendering.
    return { ...salida, resultados: natives.map(n => proyectarClaims(n, entrada)) };
}
export async function runRepair(input: EntradaExperimento): Promise<SalidaExperimento> { return executeRepair(input); }
