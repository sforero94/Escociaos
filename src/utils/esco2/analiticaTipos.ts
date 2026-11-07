export const AGRUPACIONES_ANALITICAS = ['dia', 'semana', 'mes', 'lote', 'animal', 'plaga', 'sublote'] as const;
export const OPERADORES_ANALITICOS = ['gt', 'gte', 'lt', 'lte', 'eq'] as const;
export interface AnalisisConsulta {
    agrupar_por?: (typeof AGRUPACIONES_ANALITICAS[number])[];
    ultima_por_entidad?: boolean;
    condiciones?: {
        metrica: string;
        operador: typeof OPERADORES_ANALITICOS[number];
        valor: number;
        unidad: string;
    }[];
    comparacion?: {
        metrica: string;
        izquierda: string;
        derecha: string;
    };
}
export interface MedidaAnalisis {
    valor: number | null;
    observado: number | null;
    unidad: string;
    base: string;
    estado: 'completo' | 'parcial' | 'sin_dato';
    esperados: number;
    usables: number;
}
export interface FilaAnalisis {
    clave: string;
    etiqueta: string;
    miembros: string[];
    periodo: {
        desde: string;
        hasta: string;
    };
    metricas: Record<string, MedidaAnalisis>;
    seleccion: 'seleccionado' | 'excluido' | 'indeterminado';
}
export interface ResultadoAnalisis {
    resultado_id: string;
    estado: 'ok' | 'parcial' | 'no_soportado' | 'no_disponible';
    filas: FilaAnalisis[];
    comparacion?: {
        metrica: string;
        izquierda: string;
        derecha: string;
        delta: number | null;
        porcentaje: number | null;
        unidad: string;
        motivo?: string;
    };
    detalle: {
        filas_totales: number;
        filas_mostradas: number;
        limitado: boolean;
    };
    avisos: string[];
}
