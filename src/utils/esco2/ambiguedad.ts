// Regla D26 (decisión de Santiago, 2026-11-03): una palabra que es a la vez categoría
// de tarea y fragmento de nombres de tarea ("cosecha") no se interpreta por intuición
// del modelo. El código decide:
//   - nombrada junto a otras tareas      → filtro de tarea;
//   - nombrada junto a otras categorías  → filtro de categoría;
//   - sin señal (o con señales opuestas) → se pregunta al usuario.
// La señal se toma de todo el plan del turno (todas las partes), porque "cosecha y
// guadaña" puede llegar como dos consultas de una sola entidad cada una.
// Una elección exacta del estado validado por el servidor resuelve la ambigüedad.
// El historial del cliente nunca prueba que el usuario contestó.

import { normalizar, resolverCategorias, resolverTareas } from './catalogo.ts';
import type { ConsultaLabores, DatosLabores, MensajeHistorial, Plan } from './tipos.ts';

type Catalogo = Pick<DatosLabores, 'tareas' | 'tiposTareas'>;

export interface TerminoDoble {
  texto: string;
  categoria: string;
  tareas: string[];
}

/** ¿El texto resuelve a exactamente una categoría y además a alguna tarea? */
export function terminoDoble(texto: string, catalogo: Catalogo): TerminoDoble | null {
  const datos = { ...catalogo, registros: [], lotes: [] };
  const cat = resolverCategorias([texto], datos);
  if (cat.noResueltos.length > 0 || cat.nombres.length !== 1) return null;
  const tar = resolverTareas([texto], catalogo.tareas, catalogo.tiposTareas);
  if (tar.ids.size === 0) return null;
  return { texto, categoria: cat.nombres[0], tareas: tar.nombres };
}

export const MARCA = 'puede ser la categoría';

export function preguntaDoble(d: TerminoDoble): string {
  const muestra = d.tareas.slice(0, 6).join(', ') + (d.tareas.length > 6 ? ' y otras' : '');
  return `«${d.texto}» ${MARCA} ${d.categoria} o las tareas cuyo nombre contiene «${d.texto}» (${muestra}). ¿Cuál de las dos quieres consultar?`;
}

export interface ResultadoReglaDoble {
  plan: Plan;
  /** Qué movió la regla, para la traza del turno. */
  ajustes: string[];
}

export function aplicarReglaDoble(plan: Plan, catalogo: Catalogo, _historial: MensajeHistorial[] = [], decisiones:Record<string,'tarea'|'categoria'> = {}): ResultadoReglaDoble {
  if (plan.tipo !== 'consultas') return { plan, ajustes: [] };

  const cache = new Map<string, TerminoDoble | null>();
  const esDoble = (t: string): TerminoDoble | null => {
    const clave = normalizar(t);
    if (!cache.has(clave)) cache.set(clave, terminoDoble(t, catalogo));
    return cache.get(clave) ?? null;
  };

  let otrasTareas = 0;
  let otrasCategorias = 0;
  for (const c of plan.consultas) {
    otrasTareas += c.tareas.filter((t) => !esDoble(t)).length;
    otrasCategorias += c.categorias.filter((t) => !esDoble(t)).length;
  }

  const sinResolver: TerminoDoble[] = [];
  const ajustes: string[] = [];
  const consultas: ConsultaLabores[] = plan.consultas.map((c, indice) => {
    const tareas: string[] = [];
    const categorias: string[] = [];
    const colocar = (t: string, dondeLoPuso: 'tarea' | 'categoria') => {
      const d = esDoble(t);
      if (!d) {
        (dondeLoPuso === 'tarea' ? tareas : categorias).push(t);
        return;
      }
      let destino: 'tarea' | 'categoria' | null;
      if (decisiones[`${indice}:${normalizar(t)}`]) destino = decisiones[`${indice}:${normalizar(t)}`];
      else if (otrasTareas > 0 && otrasCategorias === 0) destino = 'tarea';
      else if (otrasCategorias > 0 && otrasTareas === 0) destino = 'categoria';
      else destino = null;
      if (destino === null) {
        if (!sinResolver.some((s) => normalizar(s.texto) === normalizar(t))) sinResolver.push(d);
        return;
      }
      if (destino !== dondeLoPuso) ajustes.push(`D26: «${t}» pasó de ${dondeLoPuso} a ${destino}`);
      (destino === 'tarea' ? tareas : categorias).push(t);
    };
    for (const t of c.tareas) colocar(t, 'tarea');
    for (const t of c.categorias) colocar(t, 'categoria');
    return { ...c, tareas, categorias };
  });

  if (sinResolver.length > 0) {
    return {
      plan: {
        tipo: 'aclaracion',
        aclaracion: {
          pregunta: sinResolver.map(preguntaDoble).join('\n'),
          motivo: `D26: sin señal para ${sinResolver.map((s) => `«${s.texto}»`).join(', ')}`,
        },
      },
      ajustes: [`D26: aclaración por ${sinResolver.map((s) => s.texto).join(', ')}`],
    };
  }
  return { plan: { ...plan, consultas }, ajustes };
}
