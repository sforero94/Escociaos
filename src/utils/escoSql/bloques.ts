// El modelo elige columnas; solo el servidor pone valores en un visual.
import { FORMATOS, type Formato, type Valor } from './formato.ts';

export const MAX_BLOQUES = 4;
export const MAX_FILAS_SQL = 500;
export const MAX_PUNTOS_GRAFICA = 60;
export type Fila = Record<string, Valor>;
export interface Columna { columna: string; etiqueta: string; formato: Formato }
interface BaseBloque { consulta: number; truncado: boolean; aviso?: string }
export type Bloque =
  | (BaseBloque & { tipo: 'tabla'; titulo: string; columnas: Columna[]; filas: Fila[]; total_filas: number })
  | (BaseBloque & { tipo: 'grafica'; titulo: string; forma: 'bar' | 'line' | 'pie' | 'area'; x: string; y: string[]; formato: Formato; datos: Fila[] })
  | (BaseBloque & { tipo: 'tarjeta'; items: { etiqueta: string; columna: string; formato: Formato; valor: number | string | null }[] });

export interface FuenteVisual { filas: Record<string, unknown>[]; n_filas: number | null; truncado: boolean; error?: string | null }
export type ErrorVisual = 'especificacion_invalida' | 'consulta_inexistente' | 'consulta_fallida' | 'columna_inexistente' | 'valor_invalido' | 'serie_no_numerica' | 'demasiados_puntos' | 'tarjeta_no_escalar';
export type ResultadoBloque = { bloque: Bloque } | { error: ErrorVisual };
type Objeto = Record<string, unknown>;
const objeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 120;
const formato = (v: unknown): v is Formato => FORMATOS.includes(v as Formato);
const claves = (v: Objeto, permitidas: string[]) => Object.keys(v).every((k) => permitidas.includes(k));
const escalar = (v: unknown): v is Valor => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
function columna(v: unknown): v is Columna {
  return objeto(v) && claves(v, ['columna', 'etiqueta', 'formato']) && texto(v.columna) && texto(v.etiqueta) && formato(v.formato);
}

/** Una consulta se numera desde 1. No acepta valores, filas ni series escritos por el modelo. */
export function construirBloque(spec: unknown, fuentes: readonly FuenteVisual[]): ResultadoBloque {
  const fallo = (error: ErrorVisual): ResultadoBloque => ({ error });
  if (!objeto(spec) || !Number.isInteger(spec.consulta) || (spec.consulta as number) < 1) return fallo('especificacion_invalida');
  const consulta = spec.consulta as number;
  const fuente = fuentes[consulta - 1];
  if (!fuente) return fallo('consulta_inexistente');
  if (fuente.error || fuente.n_filas === null) return fallo('consulta_fallida');
  if (fuente.filas.length > MAX_FILAS_SQL) return fallo('valor_invalido');
  const base: BaseBloque = { consulta, truncado: fuente.truncado };
  if (fuente.truncado) base.aviso = 'Consulta truncada: estos datos no son el conjunto completo.';
  let seleccion: string[];
  if (spec.tipo === 'tabla') {
    if (!claves(spec, ['tipo', 'titulo', 'consulta', 'columnas']) || !texto(spec.titulo) || !Array.isArray(spec.columnas) || !spec.columnas.length || spec.columnas.length > 12 || !spec.columnas.every(columna)) return fallo('especificacion_invalida');
    seleccion = spec.columnas.map((c) => c.columna);
  } else if (spec.tipo === 'grafica') {
    if (!claves(spec, ['tipo', 'titulo', 'consulta', 'forma', 'x', 'y', 'formato']) || !texto(spec.titulo) || !['bar', 'line', 'pie', 'area'].includes(spec.forma as string) || !texto(spec.x) || !Array.isArray(spec.y) || !spec.y.length || spec.y.length > 6 || !spec.y.every(texto) || !formato(spec.formato)) return fallo('especificacion_invalida');
    if (fuente.filas.length > MAX_PUNTOS_GRAFICA) return fallo('demasiados_puntos');
    seleccion = [spec.x, ...spec.y];
  } else if (spec.tipo === 'tarjeta') {
    if (!claves(spec, ['tipo', 'consulta', 'items']) || !Array.isArray(spec.items) || !spec.items.length || spec.items.length > 8 || !spec.items.every(columna)) return fallo('especificacion_invalida');
    if (fuente.filas.length !== 1) return fallo('tarjeta_no_escalar');
    seleccion = spec.items.map((c) => c.columna);
  } else return fallo('especificacion_invalida');
  if (new Set(seleccion).size !== seleccion.length) return fallo('especificacion_invalida');
  // Con cero filas no hay metadatos de columnas: no se adivina un esquema.
  if (!fuente.filas.length || fuente.filas.some((fila) => seleccion.some((key) => !Object.prototype.hasOwnProperty.call(fila, key)))) return fallo('columna_inexistente');
  if (fuente.filas.some((fila) => seleccion.some((key) => !escalar(fila[key])))) return fallo('valor_invalido');
  const filas = fuente.filas.map((fila) => Object.fromEntries(seleccion.map((key) => [key, fila[key]])) as Fila);
  if (spec.tipo === 'tabla') return { bloque: { ...base, tipo: 'tabla', titulo: spec.titulo as string, columnas: spec.columnas as Columna[], filas, total_filas: fuente.n_filas } };
  if (spec.tipo === 'grafica') {
    const y = spec.y as string[];
    if (filas.some((fila) => y.some((key) => fila[key] !== null && typeof fila[key] !== 'number')) || y.some((key) => !filas.some((fila) => typeof fila[key] === 'number'))) return fallo('serie_no_numerica');
    return { bloque: { ...base, tipo: 'grafica', titulo: spec.titulo as string, forma: spec.forma as 'bar' | 'line' | 'pie' | 'area', x: spec.x as string, y, formato: spec.formato as Formato, datos: filas } };
  }
  const items = spec.items as Columna[];
  if (items.some((item) => typeof filas[0][item.columna] === 'boolean')) return fallo('valor_invalido');
  return { bloque: { ...base, tipo: 'tarjeta', items: items.map((item) => ({ ...item, valor: filas[0][item.columna] as number | string | null })) } };
}

/** El contrato conserva hasta 500 filas proyectadas para CSV; cada canal limita su dibujo. */
export function filasTablaParaCanal(bloque: Extract<Bloque, { tipo: 'tabla' }>, canal: 'web' | 'telegram'): Fila[] {
  return bloque.filas.slice(0, canal === 'web' ? 50 : 15);
}
