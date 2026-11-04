// Resolución de nombres contra el catálogo autorizado. Se hace una sola vez, en código.
// El modelo escribe los nombres como los dijo el usuario; aquí se decide a qué
// registros se refieren. Sin coincidencia o con ambigüedad no se adivina: se reporta.

import type { DatosLabores, Lote, NoResuelto, Tarea, TipoTarea } from './tipos.ts';

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\s*\d+\s*[.)-]\s*/, '') // "4. La Vega" → "la vega"
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'por', 'lote', 'lotes', 'tarea', 'tareas']);

function tokens(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((t) => t.length > 0 && !PALABRAS_VACIAS.has(t));
}

/** ¿Todas las palabras significativas del texto aparecen (como prefijo) en el nombre? */
function contieneTokens(nombre: string, texto: string): boolean {
  const nt = tokens(nombre);
  const tt = tokens(texto);
  if (tt.length === 0) return false;
  return tt.every((t) => nt.some((n) => n.startsWith(t) || (t.length >= 5 && n.startsWith(t.slice(0, -1)))));
}

function sugerir(nombres: string[], texto: string, max = 5): string[] {
  const tt = tokens(texto);
  const puntuados = nombres.map((n) => {
    const nt = tokens(n);
    const comunes = tt.filter((t) => nt.some((x) => x.startsWith(t.slice(0, 3)))).length;
    return { n, comunes };
  });
  return puntuados
    .filter((p) => p.comunes > 0)
    .sort((a, b) => b.comunes - a.comunes)
    .slice(0, max)
    .map((p) => p.n);
}

export interface ResolucionLotes {
  ids: Set<string>;
  nombres: string[];
  noResueltos: NoResuelto[];
}

/** Un lote es una entidad: cada texto debe resolver a exactamente un lote. */
export function resolverLotes(textos: string[], lotes: Lote[]): ResolucionLotes {
  const ids = new Set<string>();
  const nombres: string[] = [];
  const noResueltos: NoResuelto[] = [];
  for (const texto of textos) {
    const exactos = lotes.filter((l) => normalizar(l.nombre) === normalizar(texto));
    const candidatos = exactos.length > 0 ? exactos : lotes.filter((l) => contieneTokens(l.nombre, texto));
    if (candidatos.length === 1) {
      if (!ids.has(candidatos[0].id)) {
        ids.add(candidatos[0].id);
        nombres.push(candidatos[0].nombre);
      }
    } else {
      noResueltos.push({
        tipo: 'lote',
        texto,
        motivo: candidatos.length === 0 ? 'sin_coincidencia' : 'ambiguo',
        sugerencias: candidatos.length > 1 ? candidatos.map((l) => l.nombre) : sugerir(lotes.map((l) => l.nombre), texto),
      });
    }
  }
  return { ids, nombres, noResueltos };
}

export interface ResolucionTareas {
  ids: Set<string>;
  nombres: string[];
  noResueltos: NoResuelto[];
}

/**
 * Un texto de tarea es un filtro por nombre: puede abarcar varias tareas
 * ("cosecha" → todas las tareas de cosecha). También coincide con el tipo de
 * tarea cuando ningún nombre coincide ("erradicación" → la tarea "Socas", cuyo
 * tipo es Erradicación). Las
 * tareas abarcadas se devuelven para que la respuesta diga exactamente qué se sumó.
 */
export function resolverTareas(textos: string[], tareas: Tarea[], tipos: TipoTarea[] = []): ResolucionTareas {
  const ids = new Set<string>();
  const nombres = new Set<string>();
  const noResueltos: NoResuelto[] = [];
  const tipoNombre = new Map(tipos.map((t) => [t.id, t.nombre]));
  const coincide = (nombre: string, texto: string) => normalizar(nombre).includes(normalizar(texto)) || contieneTokens(nombre, texto);
  for (const texto of textos) {
    // Primero por nombre de tarea; el tipo solo si ningún nombre coincide, para que
    // "cosecha" no arrastre en silencio tareas de clasificación tipificadas como Cosecha.
    const porNombre = tareas.filter((t) => coincide(t.nombre, texto));
    const encontradas =
      porNombre.length > 0
        ? porNombre
        : tareas.filter((t) => {
            const tipo = t.tipo_tarea_id ? tipoNombre.get(t.tipo_tarea_id) : undefined;
            return tipo !== undefined && coincide(tipo, texto);
          });
    if (encontradas.length === 0) {
      noResueltos.push({
        tipo: 'tarea',
        texto,
        motivo: 'sin_coincidencia',
        sugerencias: sugerir([...new Set(tareas.map((t) => t.nombre.trim()))], texto),
      });
      continue;
    }
    for (const t of encontradas) {
      ids.add(t.id);
      nombres.add(t.nombre.trim());
    }
  }
  return { ids, nombres: [...nombres].sort(), noResueltos };
}

export interface ResolucionCategorias {
  tipoIds: Set<string>;
  nombres: string[];
  noResueltos: NoResuelto[];
}

export function resolverCategorias(textos: string[], datos: DatosLabores): ResolucionCategorias {
  const categorias = [...new Set(datos.tiposTareas.map((t) => t.categoria).filter((c): c is string => !!c))];
  const tipoIds = new Set<string>();
  const nombres: string[] = [];
  const noResueltos: NoResuelto[] = [];
  for (const texto of textos) {
    const exactas = categorias.filter((c) => normalizar(c) === normalizar(texto));
    const candidatas = exactas.length > 0 ? exactas : categorias.filter((c) => contieneTokens(c, texto));
    if (candidatas.length !== 1) {
      noResueltos.push({
        tipo: 'categoria',
        texto,
        motivo: candidatas.length === 0 ? 'sin_coincidencia' : 'ambiguo',
        sugerencias: candidatas.length > 1 ? candidatas : sugerir(categorias, texto),
      });
      continue;
    }
    nombres.push(candidatas[0]);
    for (const t of datos.tiposTareas) if (t.categoria === candidatas[0]) tipoIds.add(t.id);
  }
  return { tipoIds, nombres, noResueltos };
}

/** Resumen del catálogo para el planificador: nombres, sin cifras. */
export function resumenCatalogo(datos: DatosLabores): { lotes: string[]; categorias: string[]; tipos: string[]; tareas: string[] } {
  return {
    lotes: datos.lotes.map((l) => `${l.nombre} [id:${l.id}]`).sort(),
    categorias: [...new Set(datos.tiposTareas.map((t) => t.categoria).filter((c): c is string => !!c))].sort(),
    tipos: [...new Set(datos.tiposTareas.map((t) => t.nombre.trim()))].sort(),
    tareas: datos.tareas.map((t) => `${t.nombre.trim()} [id:${t.id}]`).sort(),
  };
}
