// P4 approved query-language contract. Types and closed catalogs only; no SQL compiler here.
// Both the edge mapper and PostgreSQL validate this structure independently.
export const LIMITES_CONSULTA = {
  sqlCaracteres: 12000,
  irBytes: 65536,
  nodos: 256,
  profundidad: 12,
  ctes: 4,
  relaciones: 8,
  proyecciones: 32,
  parametros: 200,
  textoParametroCaracteres: 4000,
  filas: 500,
  offset: 100000,
} as const;

export const TIPOS_PARAMETRO = [
  'boolean',
  'integer',
  'bigint',
  'numeric',
  'text',
  'date',
  'timestamp',
  'timestamptz',
  'uuid',
  'interval',
] as const;
export type TipoParametro = (typeof TIPOS_PARAMETRO)[number];
export type TipoColumna = Exclude<TipoParametro, 'interval'> | 'interval';
export type TipoCast = Exclude<TipoParametro, 'interval'>;
export const UNIDADES_INTERVALO = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
] as const;
export type UnidadIntervalo = (typeof UNIDADES_INTERVALO)[number];
export const UNIDADES_FECHA = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
] as const;
export type UnidadFecha = (typeof UNIDADES_FECHA)[number];
export const CAMPOS_EXTRACT = [
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'dow',
  'doy',
  'hour',
  'minute',
  'second',
  'epoch',
] as const;
export type CampoExtract = (typeof CAMPOS_EXTRACT)[number];

/** Numeric values preserve their source decimal representation, never a lossy JS float. */
export type ParametroConsulta =
  | { type: 'boolean'; value: boolean }
  | { type: 'integer' | 'bigint' | 'numeric'; value: string }
  | { type: 'text' | 'date' | 'timestamp' | 'timestamptz' | 'uuid'; value: string }
  | { type: 'interval'; value: { quantity: string; unit: UnidadIntervalo } };

export const OPERADORES_BINARIOS = [
  '=',
  '<>',
  '<',
  '<=',
  '>',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  'and',
  'or',
  'like',
  'not like',
  'ilike',
  'not ilike',
] as const;
export type OperadorBinario = (typeof OPERADORES_BINARIOS)[number];
export const FUNCIONES_ESCALARES = [
  'abs',
  'round',
  'lower',
  'upper',
  'btrim',
  'coalesce',
  'nullif',
] as const;
export type FuncionEscalar = (typeof FUNCIONES_ESCALARES)[number];
export const AGREGADOS_CONSULTA = ['count', 'sum', 'avg', 'min', 'max'] as const;
export type AgregadoConsulta = (typeof AGREGADOS_CONSULTA)[number];

export type ExprNode =
  | { kind: 'column'; source: string; name: string }
  | { kind: 'output'; name: string }
  | { kind: 'param'; index: number }
  | { kind: 'null' }
  | { kind: 'binary'; op: OperadorBinario; left: ExprNode; right: ExprNode }
  | { kind: 'unary'; op: 'not' | '+' | '-'; arg: ExprNode }
  | { kind: 'is_null'; arg: ExprNode; not: boolean }
  | { kind: 'in'; arg: ExprNode; values: ExprNode[]; not: boolean }
  | { kind: 'case'; branches: { when: ExprNode; then: ExprNode }[]; else: ExprNode }
  | { kind: 'call'; fn: FuncionEscalar; args: ExprNode[] }
  | {
      kind: 'aggregate';
      fn: AgregadoConsulta;
      args: ExprNode[];
      star: boolean;
      distinct: boolean;
      filter?: ExprNode;
    }
  | { kind: 'cast'; arg: ExprNode; to: TipoCast }
  | { kind: 'date_trunc'; unit: UnidadFecha; arg: ExprNode }
  | { kind: 'extract'; field: CampoExtract; arg: ExprNode };

export type FuenteConsulta =
  | { kind: 'view'; name: string; alias: string }
  | { kind: 'cte'; name: string; alias: string }
  | { kind: 'subquery'; query: QueryNode; alias: string };
export interface ProyeccionConsulta {
  expr: ExprNode;
  alias: string;
}
export interface JoinConsulta {
  type: 'inner' | 'left';
  source: FuenteConsulta;
  on: ExprNode;
}
export interface OrdenConsulta {
  expr: ExprNode;
  direction: 'asc' | 'desc';
  nulls: 'first' | 'last';
}
export interface CteConsulta {
  name: string;
  query: QueryNode;
}
export interface SelectNode {
  kind: 'select';
  distinct: boolean;
  columns: ProyeccionConsulta[];
  from?: FuenteConsulta;
  joins: JoinConsulta[];
  where?: ExprNode;
  groupBy: ExprNode[];
  having?: ExprNode;
}
export interface UnionAllNode {
  kind: 'union_all';
  left: QueryNode;
  right: QueryNode;
}
export interface QueryNode {
  with: CteConsulta[];
  body: SelectNode | UnionAllNode;
  orderBy: OrdenConsulta[];
  limit?: number;
  offset?: number;
}
export interface ConsultaSegura {
  version: 1;
  query: QueryNode;
  params: ParametroConsulta[];
}

/** Public schema metadata only. sql_type is diagnostic metadata, never executable input. */
export interface ColumnaCatalogoConsulta {
  name: string;
  type: TipoColumna;
  sql_type: string;
}
export interface VistaCatalogoConsulta {
  name: string;
  columns: ColumnaCatalogoConsulta[];
}
export interface CatalogoConsulta {
  version: 1;
  views: VistaCatalogoConsulta[];
}
export type CodigoConsultaSegura =
  | 'sql_invalido'
  | 'version_no_admitida'
  | 'nodo_no_admitido'
  | 'relacion_no_admitida'
  | 'columna_no_admitida'
  | 'tipo_no_admitido'
  | 'limite_excedido';
