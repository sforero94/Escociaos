// Contexto generativo compartido; nunca identidad, permiso, filas ni metadata arbitraria.
export const MAX_HISTORIAL_SQL = 10;
export const MAX_TEXTO_HISTORIAL_SQL = 4000;
export interface MensajeHistorialSql { rol: 'user' | 'assistant'; texto: string }
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const invalido = (): never => { throw new Error('ESCO_SQL_HISTORY_INVALID'); };

/** Mantiene la precisión submilisegundo que Postgres usa en el desempate temporal. */
function instante(valor: unknown): bigint {
  if (typeof valor !== 'string') return invalido();
  const m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(valor);
  if (!m) return invalido();
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const ms = Date.parse(valor);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || !Number.isFinite(ms)) return invalido();
  return BigInt(ms) * 1000000n + BigInt((m[7] ?? '').padEnd(9, '0').slice(3));
}

export function textoHistorialSql(texto: string, consultas: readonly { sql: string }[]): string {
  if (!consultas.length) return texto.slice(0, MAX_TEXTO_HISTORIAL_SQL);
  const cabecera = '\n\n[Consultas SQL que usé en este turno]\n';
  const separador = '\n---\n';
  const disponibles = consultas.slice(0, 4).map(c => c.sql).filter(sql => typeof sql === 'string' && sql.trim().length > 0);
  const reservaProsa = Math.min(200, texto.length);
  const todas = cabecera + disponibles.join(separador);
  if (disponibles.length === consultas.length && todas.length + reservaProsa <= MAX_TEXTO_HISTORIAL_SQL) return texto.slice(0, MAX_TEXTO_HISTORIAL_SQL - todas.length) + todas;
  const marcador = (n: number) => `\n[Consultas SQL omitidas por límite: ${n}]`;
  const espacio = MAX_TEXTO_HISTORIAL_SQL - reservaProsa - cabecera.length - marcador(consultas.length).length;
  const incluidas: string[] = [];
  let largo = 0;
  for (const sql of disponibles) {
    const incremento = sql.length + (incluidas.length ? separador.length : 0);
    if (largo + incremento <= espacio) { incluidas.push(sql); largo += incremento; }
  }
  const omitidas = consultas.length - incluidas.length;
  const sufijo = (incluidas.length ? cabecera + incluidas.join(separador) : '') + (omitidas ? marcador(omitidas) : '');
  return texto.slice(0, MAX_TEXTO_HISTORIAL_SQL - sufijo.length) + sufijo;
}

export function normalizarHistorialEfectivoSql(historial: readonly unknown[]): MensajeHistorialSql[] {
  return historial.map(m => {
    if (!objeto(m) || (typeof m.rol !== 'string' || !['user', 'assistant'].includes(m.rol)) || typeof m.texto !== 'string') return invalido();
    return { rol: m.rol as 'user' | 'assistant', texto: m.texto.slice(0, MAX_TEXTO_HISTORIAL_SQL) };
  }).slice(-MAX_HISTORIAL_SQL);
}

export function construirHistorialSql(filas: readonly unknown[]): MensajeHistorialSql[] {
  const ids = new Set<string>();
  const elegibles = filas.filter(objeto).filter(f => (f.role === 'user' || f.role === 'assistant') && objeto(f.metadata) && f.metadata.motor === 'sql').map(f => {
    if (typeof f.id !== 'string' || !f.id.trim() || ids.has(f.id) || typeof f.content !== 'string') return invalido();
    ids.add(f.id);
    return { fila: f, id: f.id, fecha: instante(f.created_at) };
  });
  elegibles.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return normalizarHistorialEfectivoSql(elegibles.slice(-MAX_HISTORIAL_SQL).map(({ fila }) => {
    const metadata = fila.metadata as Record<string, unknown>;
    const consultas = Array.isArray(metadata.consultas) ? metadata.consultas.filter(objeto).filter(c => typeof c.sql === 'string').map(c => ({ sql: c.sql as string })) : [];
    return { rol: fila.role, texto: fila.role === 'assistant' ? textoHistorialSql(fila.content as string, consultas) : fila.content };
  }));
}
