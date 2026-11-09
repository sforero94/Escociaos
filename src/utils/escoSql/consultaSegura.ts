// SQL visible al modelo; solo una estructura de catálogo llega al ejecutor.
import { parse } from 'pgsql-ast-parser';
import catalogoFijo from './catalogoConsulta.json' with { type: 'json' };
import {
  AGREGADOS_CONSULTA,
  CAMPOS_EXTRACT,
  FUNCIONES_ESCALARES,
  LIMITES_CONSULTA,
  OPERADORES_BINARIOS,
  UNIDADES_FECHA,
  UNIDADES_INTERVALO,
  type CatalogoConsulta,
  type CodigoConsultaSegura,
  type ConsultaSegura,
  type ExprNode,
  type FuenteConsulta,
  type JoinConsulta,
  type ParametroConsulta,
  type ProyeccionConsulta,
  type QueryNode,
  type TipoCast,
  type TipoParametro,
} from './contratoConsulta.ts';

type Ast = Record<string, unknown>;
type Tipo = TipoParametro | null;
interface Columna {
  name: string;
  type: Tipo;
}
interface Fuente {
  alias: string;
  columns: Columna[];
}
type Ambito = Map<string, Fuente>;
interface ResultadoExpr {
  node: ExprNode;
  type: Tipo;
}
interface ResultadoQuery {
  query: QueryNode;
  columns: Columna[];
}

export class ErrorConsultaSegura extends Error {
  constructor(readonly codigo: CodigoConsultaSegura) {
    super(codigo);
    this.name = 'ErrorConsultaSegura';
  }
}
const fallo = (codigo: CodigoConsultaSegura): never => {
  throw new ErrorConsultaSegura(codigo);
};
const obj = (v: unknown): Ast =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Ast) : fallo('nodo_no_admitido');
const lista = (v: unknown): unknown[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v : fallo('nodo_no_admitido');
const nombre = (v: unknown): string =>
  typeof v === 'string' &&
  v.length > 0 &&
  new TextEncoder().encode(v).length <= 63 &&
  !Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    ? v
    : fallo('nodo_no_admitido');
const claves = (v: Ast, admitidas: string[]) => {
  if (Object.keys(v).some((k) => k !== '_location' && !admitidas.includes(k)))
    fallo('nodo_no_admitido');
};
const numerico = (t: Tipo) => t === 'integer' || t === 'bigint' || t === 'numeric';
function comun(tipos: Tipo[]): Tipo {
  const presentes = tipos.filter((t): t is TipoParametro => t !== null);
  if (!presentes.length) return null;
  if (presentes.every(numerico))
    return presentes.includes('numeric')
      ? 'numeric'
      : presentes.includes('bigint')
        ? 'bigint'
        : 'integer';
  return presentes.every((t) => t === presentes[0]) ? presentes[0] : fallo('tipo_no_admitido');
}
function tipoCast(v: unknown): TipoParametro {
  const a = obj(v);
  claves(a, ['name', 'schema', 'kind', 'doubleQuoted', 'config']);
  if (
    a.kind !== undefined ||
    a.config !== undefined ||
    a.doubleQuoted ||
    (a.schema !== undefined && a.schema !== 'pg_catalog')
  )
    fallo('tipo_no_admitido');
  const tipos: Record<string, TipoParametro> = {
    int: 'integer',
    int4: 'integer',
    integer: 'integer',
    int8: 'bigint',
    bigint: 'bigint',
    decimal: 'numeric',
    numeric: 'numeric',
    bool: 'boolean',
    boolean: 'boolean',
    text: 'text',
    date: 'date',
    timestamp: 'timestamp',
    'timestamp without time zone': 'timestamp',
    timestamptz: 'timestamptz',
    'timestamp with time zone': 'timestamptz',
    uuid: 'uuid',
    interval: 'interval',
  };
  return Object.prototype.hasOwnProperty.call(tipos, String(a.name))
    ? tipos[String(a.name)]
    : fallo('tipo_no_admitido');
}
function validarEscalar(valor: string, tipo: TipoParametro): void {
  if (valor.length > LIMITES_CONSULTA.textoParametroCaracteres || valor.includes('\0'))
    fallo('limite_excedido');
  if (tipo === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) fallo('tipo_no_admitido');
    const [y, m, d] = valor.split('-').map(Number);
    const fecha = new Date(0);
    fecha.setUTCFullYear(y, m - 1, d);
    if (
      y < 1 ||
      fecha.getUTCFullYear() !== y ||
      fecha.getUTCMonth() !== m - 1 ||
      fecha.getUTCDate() !== d
    )
      fallo('tipo_no_admitido');
  } else if (tipo === 'timestamp') {
    const partes = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?$/.exec(valor);
    if (!partes) return fallo('tipo_no_admitido');
    validarEscalar(partes[1], 'date');
    if (Number(partes[2]) > 23 || Number(partes[3]) > 59 || Number(partes[4]) > 59)
      fallo('tipo_no_admitido');
  } else if (
    tipo === 'uuid' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
  )
    fallo('tipo_no_admitido');
  else if (
    tipo === 'timestamptz' &&
    (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(valor) ||
      !Number.isFinite(Date.parse(valor)))
  )
    fallo('tipo_no_admitido');
}
function numero(valor: string): { value: string; type: 'integer' | 'bigint' | 'numeric' } {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(valor)) fallo('tipo_no_admitido');
  const value = valor.replace(/^([+-]?)\./, '$10.').replace(/\.$/, '.0');
  const digitos = value.replace(/[^0-9]/g, '');
  if (value.length > 100 || digitos.length > 100 || (value.split('.')[1]?.length ?? 0) > 40)
    fallo('limite_excedido');
  if (value.includes('.')) return { value, type: 'numeric' };
  const n = BigInt(value);
  return {
    value,
    type:
      n >= -2147483648n && n <= 2147483647n
        ? 'integer'
        : n >= -9223372036854775808n && n <= 9223372036854775807n
          ? 'bigint'
          : 'numeric',
  };
}

class Mapeador {
  readonly params: ParametroConsulta[] = [];
  readonly vistas = new Map<string, Columna[]>();
  constructor(
    readonly sql: string,
    catalogo: CatalogoConsulta,
  ) {
    for (const v of catalogo.views)
      this.vistas.set(
        v.name,
        v.columns.map((c) => ({ name: c.name, type: c.type })),
      );
  }
  literalNumero(a: Ast): ReturnType<typeof numero> {
    const l = obj(a._location);
    if (!Number.isInteger(l.start) || !Number.isInteger(l.end)) return fallo('tipo_no_admitido');
    return numero(this.sql.slice(Number(l.start), Number(l.end)).trim());
  }
  parametro(value: string | boolean, type: TipoParametro): ResultadoExpr {
    if (this.params.length >= LIMITES_CONSULTA.parametros) fallo('limite_excedido');
    const index = this.params.length;
    if (type === 'boolean') {
      if (typeof value === 'string' && value !== 'true' && value !== 'false')
        fallo('tipo_no_admitido');
      this.params.push({ type, value: value === true || value === 'true' });
    } else if (type === 'interval') {
      const texto = typeof value === 'string' ? value : fallo('tipo_no_admitido');
      const m =
        /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s+(years?|months?|weeks?|days?|hours?|minutes?|seconds?)$/i.exec(
          texto.trim(),
        ) ?? fallo('tipo_no_admitido');
      const unit = m[2].toLowerCase().replace(/s$/, '') as (typeof UNIDADES_INTERVALO)[number];
      const cantidad = numero(m[1]).value;
      if (cantidad.length > 50 || Math.abs(Number(cantidad)) > 1_000_000) fallo('limite_excedido');
      this.params.push({ type, value: { quantity: cantidad, unit } });
    } else {
      const texto = typeof value === 'string' ? value : fallo('tipo_no_admitido');
      if (numerico(type)) {
        const n = numero(texto);
        if (
          type !== 'numeric' &&
          (n.type === 'numeric' || (type === 'integer' && n.type !== 'integer'))
        )
          fallo('tipo_no_admitido');
        this.params.push({ type: type as 'integer' | 'bigint' | 'numeric', value: n.value });
      } else {
        validarEscalar(texto, type);
        this.params.push({
          type: type as 'text' | 'date' | 'timestamp' | 'timestamptz' | 'uuid',
          value: texto,
        });
      }
    }
    return { node: { kind: 'param', index }, type };
  }
  referencia(a: Ast, ambito: Ambito): { source: string; name: string; type: Tipo } {
    claves(a, ['type', 'name', 'table']);
    const key = nombre(a.name);
    let fuentes: Fuente[];
    if (a.table !== undefined) {
      const t = obj(a.table);
      claves(t, ['name']);
      const encontrada = ambito.get(nombre(t.name));
      if (!encontrada) return fallo('columna_no_admitida');
      fuentes = [encontrada];
    } else fuentes = [...ambito.values()];
    const candidatas = fuentes.flatMap((f) =>
      f.columns
        .filter((c) => c.name === key)
        .map((c) => ({ source: f.alias, name: c.name, type: c.type })),
    );
    if (candidatas.length !== 1) return fallo('columna_no_admitida');
    return candidatas[0];
  }
  inferir(bruto: unknown, ambito: Ambito): Tipo {
    const a = obj(bruto);
    switch (a.type) {
      case 'ref':
        return this.referencia(a, ambito).type;
      case 'integer':
      case 'numeric':
        return this.literalNumero(a).type;
      case 'boolean':
        return 'boolean';
      case 'cast':
        return tipoCast(a.to);
      case 'constant':
        return tipoCast(a.dataType);
      case 'unary':
        return String(a.op).startsWith('IS ') || a.op === 'NOT'
          ? 'boolean'
          : this.inferir(a.operand, ambito);
      case 'binary': {
        const op = String(a.op).toLowerCase();
        if (!['+', '-', '*', '/', '%'].includes(op)) return 'boolean';
        const l = this.inferir(a.left, ambito),
          r = this.inferir(a.right, ambito);
        if (l === 'date' && r === 'interval') return 'timestamp';
        if ((l === 'timestamp' || l === 'timestamptz') && r === 'interval') return l;
        if (l === 'date' && r === 'date' && op === '-') return 'integer';
        if (l === 'date' && (r === 'integer' || r === 'bigint')) return l;
        return comun([l, r]);
      }
      case 'extract':
        return 'numeric';
      case 'call': {
        const f = String(obj(a.function).name).toLowerCase();
        if (f === 'count') return 'bigint';
        if (f === 'avg' || f === 'round') return 'numeric';
        if (['lower', 'upper', 'btrim'].includes(f)) return 'text';
        if (f === 'date_trunc')
          return this.inferir(lista(a.args)[1], ambito) === 'timestamp'
            ? 'timestamp'
            : 'timestamptz';
        const tipos = lista(a.args).map((x) => this.inferir(x, ambito));
        if (f === 'sum') return tipos[0] === 'integer' ? 'bigint' : 'numeric';
        return comun(tipos);
      }
      case 'case':
        return comun([
          ...lista(a.whens).map((w) => this.inferir(obj(w).value, ambito)),
          ...(a.else ? [this.inferir(a.else, ambito)] : []),
        ]);
      default:
        return null;
    }
  }
  expresion(bruto: unknown, ambito: Ambito, esperado?: Tipo): ResultadoExpr {
    const a = obj(bruto);
    if (a.type === 'ref') {
      const r = this.referencia(a, ambito);
      return { node: { kind: 'column', source: r.source, name: r.name }, type: r.type };
    }
    if (a.type === 'integer' || a.type === 'numeric') {
      claves(a, ['type', 'value']);
      const n = this.literalNumero(a);
      return this.parametro(n.value, n.type);
    }
    if (a.type === 'string') {
      claves(a, ['type', 'value']);
      return this.parametro(
        typeof a.value === 'string' ? a.value : fallo('tipo_no_admitido'),
        esperado ?? 'text',
      );
    }
    if (a.type === 'boolean') {
      claves(a, ['type', 'value']);
      return this.parametro(
        typeof a.value === 'boolean' ? a.value : fallo('tipo_no_admitido'),
        'boolean',
      );
    }
    if (a.type === 'null') {
      claves(a, ['type']);
      return { node: { kind: 'null' }, type: null };
    }
    if (a.type === 'constant') {
      claves(a, ['type', 'value', 'dataType']);
      const tipo = tipoCast(a.dataType);
      return this.parametro(
        typeof a.value === 'string' ? a.value : fallo('tipo_no_admitido'),
        tipo,
      );
    }
    if (a.type === 'cast') {
      claves(a, ['type', 'to', 'operand']);
      const to = tipoCast(a.to);
      if (to === 'interval') {
        const operand = obj(a.operand);
        return this.parametro(
          typeof operand.value === 'string' ? operand.value : fallo('tipo_no_admitido'),
          'interval',
        );
      }
      const arg = this.expresion(a.operand, ambito, to);
      return { node: { kind: 'cast', arg: arg.node, to: to as TipoCast }, type: to };
    }
    if (a.type === 'unary') {
      claves(a, ['type', 'op', 'operand', 'opSchema']);
      if (a.opSchema !== undefined) fallo('nodo_no_admitido');
      const op = String(a.op).toLowerCase();
      if (op === 'is null' || op === 'is not null')
        return {
          node: {
            kind: 'is_null',
            arg: this.expresion(a.operand, ambito).node,
            not: op === 'is not null',
          },
          type: 'boolean',
        };
      if (op === 'is true' || op === 'is false' || op === 'is not true' || op === 'is not false') {
        const v = op.includes('true');
        const bool = this.parametro(v, 'boolean');
        const cmp: ExprNode = {
          kind: 'binary',
          op: '=',
          left: this.expresion(a.operand, ambito, 'boolean').node,
          right: bool.node,
        };
        const noNulo: ExprNode = {
          kind: 'call',
          fn: 'coalesce',
          args: [cmp, this.parametro(false, 'boolean').node],
        };
        return {
          node: op.includes('not') ? { kind: 'unary', op: 'not', arg: noNulo } : noNulo,
          type: 'boolean',
        };
      }
      if (!['not', '+', '-'].includes(op)) fallo('nodo_no_admitido');
      const arg = this.expresion(a.operand, ambito, op === 'not' ? 'boolean' : esperado);
      return {
        node: { kind: 'unary', op: op as 'not' | '+' | '-', arg: arg.node },
        type: op === 'not' ? 'boolean' : arg.type,
      };
    }
    if (a.type === 'binary') {
      claves(a, ['type', 'op', 'left', 'right', 'opSchema']);
      if (a.opSchema !== undefined) fallo('nodo_no_admitido');
      const op = String(a.op).toLowerCase().replace('!=', '<>');
      if (op === 'in' || op === 'not in') {
        const derecha = obj(a.right);
        claves(derecha, ['type', 'expressions']);
        if (derecha.type !== 'list') fallo('nodo_no_admitido');
        const arg = this.expresion(a.left, ambito);
        return {
          node: {
            kind: 'in',
            arg: arg.node,
            values: lista(derecha.expressions).map((v) => this.expresion(v, ambito, arg.type).node),
            not: op === 'not in',
          },
          type: 'boolean',
        };
      }
      if (!(OPERADORES_BINARIOS as readonly string[]).includes(op)) fallo('nodo_no_admitido');
      const lt = this.inferir(a.left, ambito),
        rt = this.inferir(a.right, ambito);
      const left = this.expresion(a.left, ambito, ['and', 'or'].includes(op) ? 'boolean' : rt),
        right = this.expresion(a.right, ambito, ['and', 'or'].includes(op) ? 'boolean' : lt);
      return {
        node: {
          kind: 'binary',
          op: op as (typeof OPERADORES_BINARIOS)[number],
          left: left.node,
          right: right.node,
        },
        type: this.inferir(a, ambito),
      };
    }
    if (a.type === 'case') {
      claves(a, ['type', 'value', 'whens', 'else']);
      const tipo = this.inferir(a, ambito) ?? esperado;
      const branches = lista(a.whens).map((w) => {
        const item = obj(w);
        claves(item, ['when', 'value']);
        const condicion = a.value
          ? {
              kind: 'binary' as const,
              op: '=' as const,
              left: this.expresion(a.value, ambito, this.inferir(item.when, ambito)).node,
              right: this.expresion(item.when, ambito, this.inferir(a.value, ambito)).node,
            }
          : this.expresion(item.when, ambito, 'boolean').node;
        return { when: condicion, then: this.expresion(item.value, ambito, tipo).node };
      });
      return {
        node: {
          kind: 'case',
          branches,
          else: a.else ? this.expresion(a.else, ambito, tipo).node : { kind: 'null' },
        },
        type: tipo ?? null,
      };
    }
    if (a.type === 'extract') {
      claves(a, ['type', 'field', 'from']);
      const f = obj(a.field);
      claves(f, ['name']);
      const field = String(f.name).toLowerCase();
      if (!(CAMPOS_EXTRACT as readonly string[]).includes(field)) fallo('nodo_no_admitido');
      return {
        node: {
          kind: 'extract',
          field: field as (typeof CAMPOS_EXTRACT)[number],
          arg: this.expresion(a.from, ambito).node,
        },
        type: 'numeric',
      };
    }
    if (a.type === 'call') {
      claves(a, [
        'type',
        'function',
        'args',
        'distinct',
        'filter',
        'over',
        'orderBy',
        'withinGroup',
      ]);
      if (a.over || a.orderBy || a.withinGroup) fallo('nodo_no_admitido');
      const f = obj(a.function);
      claves(f, ['name', 'schema']);
      if (f.schema !== undefined && f.schema !== 'pg_catalog') fallo('nodo_no_admitido');
      const fn = String(f.name).toLowerCase();
      const args = lista(a.args);
      if (fn === 'date_trunc') {
        if (args.length !== 2 || a.filter || a.distinct) fallo('nodo_no_admitido');
        const u = obj(args[0]);
        claves(u, ['type', 'value']);
        const unit = String(u.value).toLowerCase();
        if (u.type !== 'string' || !(UNIDADES_FECHA as readonly string[]).includes(unit))
          fallo('nodo_no_admitido');
        return {
          node: {
            kind: 'date_trunc',
            unit: unit as (typeof UNIDADES_FECHA)[number],
            arg: this.expresion(args[1], ambito).node,
          },
          type: this.inferir(a, ambito),
        };
      }
      if ((AGREGADOS_CONSULTA as readonly string[]).includes(fn)) {
        const star = args.length === 1 && obj(args[0]).type === 'ref' && obj(args[0]).name === '*';
        if (
          (star && fn !== 'count') ||
          (!star && args.length !== 1) ||
          (a.distinct !== undefined && a.distinct !== 'all' && a.distinct !== 'distinct')
        )
          fallo('nodo_no_admitido');
        return {
          node: {
            kind: 'aggregate',
            fn: fn as (typeof AGREGADOS_CONSULTA)[number],
            args: star ? [] : args.map((v) => this.expresion(v, ambito).node),
            star,
            distinct: a.distinct === 'distinct',
            ...(a.filter ? { filter: this.expresion(a.filter, ambito, 'boolean').node } : {}),
          },
          type: this.inferir(a, ambito),
        };
      }
      if (!(FUNCIONES_ESCALARES as readonly string[]).includes(fn) || a.filter || a.distinct)
        fallo('nodo_no_admitido');
      const aridad =
        fn === 'coalesce'
          ? args.length >= 1
          : fn === 'nullif'
            ? args.length === 2
            : fn === 'round' || fn === 'btrim'
              ? args.length === 1 || args.length === 2
              : args.length === 1;
      if (!aridad) fallo('nodo_no_admitido');
      const tipo = this.inferir(a, ambito) ?? esperado;
      const mapped = args.map(
        (v, i) =>
          this.expresion(
            v,
            ambito,
            fn === 'round'
              ? i === 0
                ? 'numeric'
                : 'integer'
              : ['lower', 'upper', 'btrim'].includes(fn)
                ? 'text'
                : tipo,
          ).node,
      );
      return {
        node: { kind: 'call', fn: fn as (typeof FUNCIONES_ESCALARES)[number], args: mapped },
        type: tipo ?? null,
      };
    }
    return fallo('nodo_no_admitido');
  }
  fuente(
    bruto: unknown,
    ambito: Ambito,
    ctes: Map<string, Columna[]>,
    futuras: Set<string>,
  ): FuenteConsulta {
    const a = obj(bruto);
    let resultado: FuenteConsulta;
    let columnas: Columna[];
    let alias: string;
    if (a.type === 'table') {
      claves(a, ['type', 'name', 'join', 'lateral']);
      if (a.lateral) fallo('nodo_no_admitido');
      const n = obj(a.name);
      claves(n, ['name', 'schema', 'alias', 'columnNames']);
      if (n.columnNames || (n.schema !== undefined && n.schema !== 'public'))
        fallo('relacion_no_admitida');
      const name = nombre(n.name);
      alias = nombre(n.alias ?? name);
      if (n.schema === undefined && futuras.has(name)) fallo('relacion_no_admitida');
      const esCte = n.schema === undefined && ctes.has(name);
      columnas = (esCte ? ctes.get(name) : this.vistas.get(name)) ?? fallo('relacion_no_admitida');
      resultado = { kind: esCte ? 'cte' : 'view', name, alias };
    } else if (a.type === 'statement') {
      claves(a, ['type', 'statement', 'alias', 'columnNames', 'db', 'join', 'lateral']);
      if (a.lateral || a.columnNames || a.db) fallo('nodo_no_admitido');
      alias = nombre(a.alias);
      const sub = this.query(a.statement, ctes, futuras);
      columnas = sub.columns;
      resultado = { kind: 'subquery', query: sub.query, alias };
    } else return fallo('relacion_no_admitida');
    if (ambito.has(alias)) fallo('columna_no_admitida');
    ambito.set(alias, { alias, columns: columnas });
    return resultado;
  }
  limite(bruto: unknown, max: number): number {
    const a = obj(bruto);
    if (a.type !== 'integer') return fallo('limite_excedido');
    claves(a, ['type', 'value']);
    const raw = this.literalNumero(a).value;
    if (!/^\d+$/.test(raw)) return fallo('limite_excedido');
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > max) return fallo('limite_excedido');
    return n;
  }
  query(
    bruto: unknown,
    anteriores = new Map<string, Columna[]>(),
    futuras = new Set<string>(),
  ): ResultadoQuery {
    const a = obj(bruto);
    if (a.type === 'with') {
      claves(a, ['type', 'bind', 'in']);
      const ctes = new Map(anteriores),
        bindings = lista(a.bind);
      const pendientes = new Set([
        ...futuras,
        ...bindings.map((b) => nombre(obj(obj(b).alias).name)),
      ]);
      const withs = [];
      for (const b of bindings) {
        const binding = obj(b);
        claves(binding, ['alias', 'statement']);
        const n = obj(binding.alias);
        claves(n, ['name']);
        const name = nombre(n.name);
        if (ctes.has(name)) fallo('columna_no_admitida');
        const r = this.query(binding.statement, ctes, pendientes);
        ctes.set(name, r.columns);
        pendientes.delete(name);
        withs.push({ name, query: r.query });
      }
      const r = this.query(a.in, ctes, pendientes);
      return { query: { ...r.query, with: [...withs, ...r.query.with] }, columns: r.columns };
    }
    if (a.type === 'union all') {
      claves(a, ['type', 'left', 'right']);
      const l = this.query(a.left, anteriores, futuras),
        r = this.query(a.right, anteriores, futuras);
      if (l.columns.length !== r.columns.length) fallo('tipo_no_admitido');
      const columns = l.columns.map((c, i) => ({
        name: c.name,
        type: comun([c.type, r.columns[i].type]),
      }));
      return {
        query: {
          with: [],
          body: { kind: 'union_all', left: l.query, right: r.query },
          orderBy: [],
        },
        columns,
      };
    }
    if (a.type !== 'select') return fallo('nodo_no_admitido');
    claves(a, [
      'type',
      'columns',
      'from',
      'where',
      'groupBy',
      'having',
      'limit',
      'orderBy',
      'distinct',
    ]);
    if (
      a.distinct !== undefined &&
      a.distinct !== null &&
      a.distinct !== 'distinct' &&
      a.distinct !== 'all'
    )
      fallo('nodo_no_admitido');
    const ambito: Ambito = new Map();
    const fuentes = lista(a.from);
    let from: FuenteConsulta | undefined;
    const joins: JoinConsulta[] = [];
    for (const [i, s] of fuentes.entries()) {
      const source = this.fuente(s, ambito, anteriores, futuras),
        j = obj(s).join;
      if (i === 0) {
        if (j) fallo('nodo_no_admitido');
        from = source;
        continue;
      }
      if (!j) fallo('nodo_no_admitido');
      const join = obj(j);
      claves(join, ['type', 'on', 'using']);
      if (join.using || !join.on || !['INNER JOIN', 'LEFT JOIN'].includes(String(join.type)))
        fallo('nodo_no_admitido');
      joins.push({
        type: join.type === 'LEFT JOIN' ? 'left' : 'inner',
        source,
        on: this.expresion(join.on, ambito, 'boolean').node,
      });
    }
    const columns: ProyeccionConsulta[] = [];
    const tipos: Columna[] = [];
    for (const c of lista(a.columns)) {
      const column = obj(c);
      claves(column, ['expr', 'alias']);
      const expr = obj(column.expr);
      if (expr.type === 'ref' && expr.name === '*') {
        if (column.alias) fallo('columna_no_admitida');
        claves(expr, ['type', 'table', 'name']);
        let seleccion = [...ambito.values()];
        if (expr.table !== undefined) {
          const t = obj(expr.table);
          claves(t, ['name']);
          const f = ambito.get(nombre(t.name)) ?? fallo('columna_no_admitida');
          seleccion = [f];
        }
        if (!seleccion.length) fallo('columna_no_admitida');
        for (const f of seleccion)
          for (const n of f.columns) {
            columns.push({
              alias: n.name,
              expr: { kind: 'column', source: f.alias, name: n.name },
            });
            tipos.push(n);
          }
      } else {
        const mapped = this.expresion(expr, ambito);
        let alias: string;
        if (column.alias !== undefined) {
          const n = obj(column.alias);
          claves(n, ['name']);
          alias = nombre(n.name);
        } else
          alias =
            expr.type === 'ref'
              ? nombre(expr.name)
              : expr.type === 'call'
                ? nombre(obj(expr.function).name)
                : expr.type === 'cast'
                  ? 'cast'
                  : expr.type === 'extract'
                    ? 'extract'
                    : `columna_${columns.length + 1}`;
        columns.push({ alias, expr: mapped.node });
        tipos.push({ name: alias, type: mapped.type });
      }
    }
    if (
      !columns.length ||
      columns.length > LIMITES_CONSULTA.proyecciones ||
      new Set(columns.map((c) => c.alias)).size !== columns.length
    )
      fallo('columna_no_admitida');
    const porSalida = new Map(columns.map((c) => [c.alias, c.expr]));
    const mapAgrupacion = (v: unknown): ExprNode => {
      const n = obj(v);
      if (n.type === 'integer') {
        const ordinal = this.limite(n, columns.length);
        if (!ordinal) fallo('columna_no_admitida');
        return columns[ordinal - 1].expr;
      }
      if (
        n.type === 'ref' &&
        n.table === undefined &&
        porSalida.has(String(n.name)) &&
        ![...ambito.values()].some((f) => f.columns.some((c) => c.name === n.name))
      )
        return porSalida.get(String(n.name))!;
      return this.expresion(v, ambito).node;
    };
    const orderBy = lista(a.orderBy).map((v) => {
      const o = obj(v);
      claves(o, ['by', 'order', 'nulls']);
      const n = obj(o.by);
      let expr: ExprNode;
      if (n.type === 'ref' && n.table === undefined && porSalida.has(String(n.name)))
        expr = { kind: 'output', name: String(n.name) };
      else if (n.type === 'integer') {
        const ordinal = this.limite(n, columns.length);
        if (!ordinal) fallo('columna_no_admitida');
        expr = { kind: 'output', name: columns[ordinal - 1].alias };
      } else expr = this.expresion(n, ambito).node;
      if (o.order !== undefined && o.order !== null && o.order !== 'ASC' && o.order !== 'DESC')
        fallo('nodo_no_admitido');
      if (o.nulls !== undefined && o.nulls !== null && o.nulls !== 'FIRST' && o.nulls !== 'LAST')
        fallo('nodo_no_admitido');
      const direction = o.order === 'DESC' ? ('desc' as const) : ('asc' as const);
      return {
        expr,
        direction,
        nulls:
          o.nulls === 'FIRST'
            ? ('first' as const)
            : o.nulls === 'LAST'
              ? ('last' as const)
              : direction === 'desc'
                ? ('first' as const)
                : ('last' as const),
      };
    });
    const limit = a.limit ? obj(a.limit) : {};
    claves(limit, ['limit', 'offset']);
    const query: QueryNode = {
      with: [],
      body: {
        kind: 'select',
        distinct: a.distinct === 'distinct',
        columns,
        ...(from ? { from } : {}),
        joins,
        ...(a.where ? { where: this.expresion(a.where, ambito, 'boolean').node } : {}),
        groupBy: lista(a.groupBy).map(mapAgrupacion),
        ...(a.having ? { having: this.expresion(a.having, ambito, 'boolean').node } : {}),
      },
      orderBy,
      ...(limit.limit !== undefined && limit.limit !== null
        ? { limit: this.limite(limit.limit, LIMITES_CONSULTA.filas) }
        : {}),
      ...(limit.offset !== undefined && limit.offset !== null
        ? { offset: this.limite(limit.offset, LIMITES_CONSULTA.offset) }
        : {}),
    };
    return { query, columns: tipos };
  }
}

function comprobarLimites(consulta: ConsultaSegura): void {
  let nodos = 0,
    ctes = 0,
    relaciones = 0;
  // Mismo presupuesto estructural que PostgreSQL: objetos de todo el documento,
  // profundidad +1 por propiedad; los elementos de una lista mantienen su nivel.
  const visitar = (v: unknown, profundidad: number): void => {
    if (profundidad > LIMITES_CONSULTA.profundidad) fallo('limite_excedido');
    if (Array.isArray(v)) {
      for (const x of v) visitar(x, profundidad);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const a = v as Ast;
    nodos++;
    if (nodos > LIMITES_CONSULTA.nodos) fallo('limite_excedido');
    if (a.kind === 'view' || a.kind === 'cte' || a.kind === 'subquery') {
      relaciones++;
      if (relaciones > LIMITES_CONSULTA.relaciones) fallo('limite_excedido');
    }
    if (Array.isArray(a.with)) {
      ctes += a.with.length;
      if (ctes > LIMITES_CONSULTA.ctes) fallo('limite_excedido');
    }
    for (const x of Object.values(a)) visitar(x, profundidad + 1);
  };
  visitar(consulta, 0);
  if (new TextEncoder().encode(JSON.stringify(consulta)).length > LIMITES_CONSULTA.irBytes)
    fallo('limite_excedido');
}
export function convertirSqlSeguro(
  sql: string,
  catalogo: CatalogoConsulta = catalogoFijo as CatalogoConsulta,
): ConsultaSegura {
  if (typeof sql !== 'string' || sql.length > LIMITES_CONSULTA.sqlCaracteres)
    fallo('limite_excedido');
  if (!sql.trim()) fallo('sql_invalido');
  let ast: unknown[];
  try {
    ast = parse(sql, { locationTracking: true });
  } catch {
    return fallo('sql_invalido');
  }
  if (ast.length !== 1) fallo('sql_invalido');
  try {
    const m = new Mapeador(sql, catalogo);
    const r = m.query(ast[0]);
    const consulta: ConsultaSegura = { version: 1, query: r.query, params: m.params };
    comprobarLimites(consulta);
    return consulta;
  } catch (e) {
    if (e instanceof ErrorConsultaSegura) throw e;
    return fallo('nodo_no_admitido');
  }
}
