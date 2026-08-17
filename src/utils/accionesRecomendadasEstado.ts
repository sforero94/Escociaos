/**
 * Orquestación PURA del bloque "Acciones recomendadas" (Fase 4 -- Interfaz --
 * de `docs/brief_tecnico_motor_acciones.md` §10, especificación visual en
 * `docs/plan_dashboard_centro_control.md` §4 Bloque 4 / §9).
 *
 * Separado del hook `useAccionesRecomendadas` (que sólo hace I/O contra
 * Supabase) para poder probarlo sin React ni red -- mismo criterio que el
 * resto del motor ("lo que se puede computar, se computa; lo que se puede
 * probar sin red, se prueba sin red").
 *
 * NO se mirroriza a Deno: todo lo de aquí es exclusivamente de lectura y
 * pintado en el navegador (elegir qué corrida mostrar, agrupar por negocio,
 * renderizar con `renderizarAccion`). El ensamblador Deno no necesita nada
 * de este archivo.
 */

import type { Destino, NegocioAccion, PaqueteAcciones } from './accionesTipos';
import type { AccionValidada } from './accionesValidador';
import { renderizarAccion } from './accionesRender';
import { cotejarAccion } from './accionesCotejo';
import type { EntradaSelectores } from './accionesHechos';
import type { AccionParaMostrar, FilaAccionCorrida, FilaAccionRecomendada } from '@/types/acciones';

/** §7.5 del brief: "pasada 48h ⇒ línea gris" -- una acción rancia sobre
 *  datos que ya cambiaron es peor que ninguna. */
export const HORAS_FRESCURA_CORRIDA = 48;

/** §5.2 del brief: un silencio puntual, no una supresión permanente. */
export const DIAS_SILENCIO_POR_DEFECTO = 30;

/** Mismo orden que las tarjetas del pulso (bloque 3, §3.1/3.2/3.3 del plan
 *  del tablero) -- "la columna del hato queda justo debajo de la del hato". */
export const NEGOCIOS_ORDEN: NegocioAccion[] = ['hato_lechero', 'aguacate', 'ganado'];

/**
 * La corrida cuyas acciones se muestran: la más reciente con `estado` en
 * ('ok'|'parcial') dentro de las últimas `HORAS_FRESCURA_CORRIDA` horas.
 * Una corrida `fallo` se salta -- "se conserva la corrida anterior si tiene
 * < 48h" (§7.5). `null` ⇒ el bloque entero se comporta como "no disponible".
 */
export function elegirCorridaVigente(corridas: FilaAccionCorrida[], ahoraIso: string): FilaAccionCorrida | null {
  const limiteMs = new Date(ahoraIso).getTime() - HORAS_FRESCURA_CORRIDA * 60 * 60 * 1000;
  const candidata = corridas.find(
    (c) => (c.estado === 'ok' || c.estado === 'parcial') && new Date(c.generado_at).getTime() >= limiteMs,
  );
  return candidata ?? null;
}

/** R-4/§8 del plan: una acción con `visibilidad='gerencia'` sólo se pinta a
 *  Gerencia -- el gate del dato viaja con el dato, no con el sitio donde se
 *  pinta (defensa en profundidad: el RLS de SELECT ya es abierto a
 *  `authenticated`, así que este filtro es el que de verdad decide). */
export function filtrarPorVisibilidad(filas: FilaAccionRecomendada[], esGerencia: boolean): FilaAccionRecomendada[] {
  return filas.filter((f) => f.visibilidad !== 'gerencia' || esGerencia);
}

/** §6: separa las filas en las que siguen vigentes (o indeterminadas -- se
 *  muestran igual) y los ids que hay que marcar `caducada_at`. */
export function separarPorCotejo(
  filas: FilaAccionRecomendada[],
  entrada: EntradaSelectores,
): { vigentes: FilaAccionRecomendada[]; idsACaducar: string[] } {
  const vigentes: FilaAccionRecomendada[] = [];
  const idsACaducar: string[] = [];
  for (const fila of filas) {
    const resultado = cotejarAccion(fila.hechos_snapshot, entrada);
    if (resultado === 'caducada') {
      idsACaducar.push(fila.id);
    } else {
      vigentes.push(fila);
    }
  }
  return { vigentes, idsACaducar };
}

/**
 * Renderiza una fila persistida reutilizando `renderizarAccion` (§4.4) --
 * nunca reimplementa la sustitución de ranuras. Construye un `PaqueteAcciones`
 * MÍNIMO de un solo hecho/destino a partir de lo que la fila ya trae congelado
 * (`hechos_snapshot`, `destino_ruta`, `destino_etiqueta`): la fila persistida
 * ya es autosuficiente para renderizarse (§5.2 de la migración -- "para que
 * pintar una acción sea UNA lectura, no dos").
 */
export function renderizarFila(fila: FilaAccionRecomendada): AccionParaMostrar {
  const accion: AccionValidada = {
    negocio: fila.negocio,
    clave: fila.clave,
    origen: fila.origen as AccionValidada['origen'],
    visibilidad: fila.visibilidad,
    hecho_ids: fila.hecho_ids,
    destino_id: fila.destino_id as AccionValidada['destino_id'],
    plantilla: fila.plantilla,
    ranuras: fila.ranuras,
  };

  const destino: Destino = {
    id: fila.destino_id as Destino['id'],
    negocio: fila.negocio,
    etiqueta_boton: fila.destino_etiqueta,
    ruta: fila.destino_ruta,
    familia: 'consulta',
  };

  const paquete: PaqueteAcciones = {
    version: 1,
    generado_at: '',
    fecha_referencia: '',
    negocios: [fila.negocio],
    hechos: fila.hechos_snapshot,
    destinos: [destino],
    exclusiones: [],
    contexto_comite: { estado: 'no_disponible', ventana_dias: 0, senales: [] },
    incidencias: [],
  };

  const render = renderizarAccion(accion, paquete);
  return {
    id: fila.id,
    clave: fila.clave,
    negocio: fila.negocio,
    frase: render.frase,
    evidencia: render.evidencia,
    boton: render.boton,
  };
}

/**
 * Agrupa por negocio en el orden fijo del pulso, filtrado a los negocios
 * habilitados por `modulos_acceso` (§8 del plan). Un negocio habilitado sin
 * acciones SIGUE apareciendo con lista vacía -- es el "vacío honesto" de
 * §4.3, la tarjeta no desaparece. Nunca reordena dentro de un negocio: el
 * orden ya lo fijó `orden` en SQL, no el navegador (§4.3 del plan: "la
 * interfaz no lo reordena").
 */
export function agruparPorNegocio(
  acciones: AccionParaMostrar[],
  negocios: NegocioAccion[],
): Array<{ negocio: NegocioAccion; acciones: AccionParaMostrar[] }> {
  return NEGOCIOS_ORDEN.filter((n) => negocios.includes(n)).map((negocio) => ({
    negocio,
    acciones: acciones.filter((a) => a.negocio === negocio),
  }));
}

/** Patrón B móvil (§9.2): el `<Select>` arranca en el negocio con más
 *  acciones; si hay empate, en el orden del pulso (que ya es el orden de
 *  `grupos`, así que basta con el primer máximo). */
export function negocioConMasAcciones(
  grupos: Array<{ negocio: NegocioAccion; acciones: AccionParaMostrar[] }>,
): NegocioAccion | null {
  if (grupos.length === 0) return null;
  let mejor = grupos[0];
  for (const grupo of grupos.slice(1)) {
    if (grupo.acciones.length > mejor.acciones.length) mejor = grupo;
  }
  return mejor.negocio;
}

/** §5.2: `vigente_hasta` de un silencio nuevo -- `DIAS_SILENCIO_POR_DEFECTO`
 *  días desde el momento del descarte, puesto explícitamente por la app
 *  (nunca un `DEFAULT` de SQL, para que la decisión se vea en el código). */
export function vigenteHastaSilencio(ahora: Date): string {
  return new Date(ahora.getTime() + DIAS_SILENCIO_POR_DEFECTO * 24 * 60 * 60 * 1000).toISOString();
}
