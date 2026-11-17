import { construirBloque, type Bloque, type FuenteVisual } from './escoSql/bloques';
import { formatearValor } from './escoSql/formato';
import { leerRespuestaFinal, type Aclaracion } from './escoSql/respuesta';
import { leerReciboTurnoSql, leerUsoTurnoSql, type ReciboTurnoSql, type UsoTurnoSql } from './escoSql/turno';
import type { ConsultaSql } from './escoSql/loop';
import type { ChartSpec, PasoTraza } from '@/types/chat';
import type { ContentBlock } from '@/components/chat/ChatMessage';

export interface RespuestaSqlWeb { texto: string; bloques: Bloque[]; sugerencias: string[]; aclaracion?: Aclaracion; consultas: Omit<ConsultaSql, 'filas_muestra'>[]; ms: number; uso?: UsoTurnoSql | null; recibo?: ReciboTurnoSql }
export interface MetadataSql extends RespuestaSqlWeb { motor: 'sql'; snapshot_at: string }
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const motorSqlWebHabilitado = (valor: unknown): boolean => valor === 'sql';

function bloquePersistido(valor: unknown): Bloque | null {
  if (!objeto(valor) || !Number.isInteger(valor.consulta) || Number(valor.consulta) < 1 || Number(valor.consulta) > 4) return null;
  const { tipo, consulta, titulo, columnas, forma, x, y, formato, items } = valor;
  const filas = tipo === 'tabla' ? valor.filas : tipo === 'grafica' ? valor.datos : tipo === 'tarjeta' && Array.isArray(items) ? [Object.fromEntries(items.filter(objeto).map((i) => [i.columna, i.valor]))] : null;
  if (!Array.isArray(filas) || filas.some((f) => !objeto(f))) return null;
  const spec = tipo === 'tabla' ? { tipo, consulta, titulo, columnas } : tipo === 'grafica' ? { tipo, consulta, titulo, forma, x, y, formato } : { tipo, consulta, items: Array.isArray(items) ? items.filter(objeto).map(({ columna, etiqueta, formato }) => ({ columna, etiqueta, formato })) : items };
  const fuentes: FuenteVisual[] = Array.from({ length: Number(consulta) }, () => ({ filas: [], n_filas: null as number | null, truncado: false }));
  fuentes[Number(consulta) - 1] = { filas, n_filas: typeof valor.total_filas === 'number' ? valor.total_filas : filas.length, truncado: valor.truncado === true };
  const r = construirBloque(spec, fuentes);
  return 'bloque' in r ? r.bloque : null;
}
export function leerRespuestaSqlWeb(valor: unknown): RespuestaSqlWeb | null {
  if (!objeto(valor) || typeof valor.texto !== 'string') return null;
  const recibo = valor.recibo === undefined ? undefined : leerReciboTurnoSql(valor.recibo);
  if (valor.recibo !== undefined && (!recibo || recibo.estado !== 'completado')) return null;
  const uso = valor.uso === undefined ? undefined : valor.uso === null ? null : leerUsoTurnoSql(valor.uso);
  if (recibo && (valor.uso === undefined || (recibo.uso === null ? valor.uso !== null : !uso || JSON.stringify(uso) !== JSON.stringify(recibo.uso)))) return null;
  const final = leerRespuestaFinal(JSON.stringify({ texto: valor.texto, sugerencias: valor.sugerencias, aclaracion: valor.aclaracion }));
  const consultas = Array.isArray(valor.consultas) ? valor.consultas.filter(objeto).slice(0, 4).map((c) => ({ sql: typeof c.sql === 'string' ? c.sql : '', proposito: typeof c.proposito === 'string' ? c.proposito : '', n_filas: typeof c.n_filas === 'number' ? c.n_filas : null, truncado: c.truncado === true, error: typeof c.error === 'string' ? c.error : null, ms: typeof c.ms === 'number' ? c.ms : 0 })) : [];
  const bloques = Array.isArray(valor.bloques) ? valor.bloques.slice(0, 4).map(bloquePersistido).filter((b): b is Bloque => b !== null) : [];
  return { ...final, consultas, bloques, ms: typeof valor.ms === 'number' ? valor.ms : 0, ...(uso !== undefined ? { uso } : {}), ...(recibo ? { recibo } : {}) };
}
export function metadataRespuestaSql(valor: RespuestaSqlWeb, snapshot_at: string): MetadataSql {
  const limpia = leerRespuestaSqlWeb(valor);
  if (!limpia) throw new Error('Respuesta SQL inválida');
  return { ...limpia, motor: 'sql', snapshot_at };
}
export function leerMetadataSql(valor: unknown): MetadataSql | null {
  if (!objeto(valor) || valor.motor !== 'sql') return null;
  const respuesta = leerRespuestaSqlWeb({ texto: '', ...valor });
  return respuesta ? { ...respuesta, motor: 'sql', snapshot_at: typeof valor.snapshot_at === 'string' ? valor.snapshot_at : '' } : null;
}
export function trazaSql(consultas: RespuestaSqlWeb['consultas']): PasoTraza[] {
  return consultas.map((c, i) => ({ index: i + 1, tool: 'consultar_sql', args: { proposito: c.proposito }, ms: c.ms, ok: c.error === null }));
}
export function graficaSql(b: Extract<Bloque, { tipo: 'grafica' }>): ChartSpec {
  return { type: b.forma, title: b.titulo, data: b.datos, xKey: b.x, yKey: b.y, formatoSql: b.formato };
}
const celda = (v: string) => v.replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function bloquesParaExportar(texto: string, bloques: Bloque[]): ContentBlock[] {
  return [{ type: 'text', value: texto }, ...bloques.map((b): ContentBlock => {
    if (b.tipo === 'grafica') return { type: 'chart', spec: graficaSql(b) };
    const aviso = b.aviso ? `\n\n${b.aviso}` : '';
    if (b.tipo === 'tarjeta') return { type: 'text', value: b.items.map((i) => `**${i.etiqueta}:** ${formatearValor(i.valor, i.formato)}`).join('\n') + aviso };
    return { type: 'text', value: `### ${b.titulo}\n\n| ${b.columnas.map((c) => celda(c.etiqueta)).join(' | ')} |\n| ${b.columnas.map(() => '---').join(' | ')} |\n${b.filas.map((f) => `| ${b.columnas.map((c) => celda(formatearValor(f[c.columna], c.formato))).join(' | ')} |`).join('\n')}${aviso}` };
  })];
}
