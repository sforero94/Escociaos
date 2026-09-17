/**
 * `ordenarAcciones` -- el orden es una función pura, no juicio del modelo
 * (§4.6 de `docs/brief_tecnico_motor_acciones.md`).
 *
 * Revisión 2 del brief saca `orden` del esquema de salida del modelo:
 * ahora lo calcula el data layer con tres criterios, evaluados DENTRO de
 * cada negocio y NUNCA entre negocios (una tarjeta -- hato_lechero,
 * aguacate o ganado -- nunca compite contra otra):
 *
 *   1º fecha encima    `hecho.fecha_limite != null` y dentro de 7 días o
 *                       vencida -- asc por fecha_limite (lo más vencido /
 *                       lo más cercano primero).
 *   2º antigüedad       `hecho.dias_esperando` -- desc.
 *   3º tamaño           `hecho.tamano_conjunto` NORMALIZADO dentro del
 *                       negocio (`n / max(n del negocio)`) -- desc.
 *
 * Se evalúa sobre el PRIMER hecho de la acción -- el que la sostiene.
 * Desempate final: `clave` alfabética (nunca el orden en que llegó del
 * modelo -- sin esto dos corridas con los mismos datos podrían pintar
 * distinto).
 *
 * Función PURA: sin red, sin Supabase, sin LLM. Espejada byte-idéntica en
 * `src/supabase/functions/server/acciones-orden.ts` y
 * `supabase/functions/make-server-1ccce916/acciones-orden.ts`, guardada por
 * `accionesOrdenParidad.test.ts`.
 */

import type { AccionValidada } from './accionesValidador';
import type { Hecho, NegocioAccion, PaqueteAcciones } from './accionesTipos';

/** Ventana de "fecha encima": vencida (cualquier fecha pasada) o dentro de
 *  estos días desde `fecha_referencia`. Constante nombrada -- §4.6. */
export const DIAS_VENTANA_FECHA_ENCIMA = 7;

/** Diferencia en días de calendario entre dos fechas `AAAA-MM-DD`
 *  (`hasta` - `desde`). Positivo = `hasta` está en el futuro. Ambas fechas
 *  ya son strings de calendario Bogotá (vienen de `paquete.fecha_referencia`
 *  y de `hecho.fecha_limite`, nunca de `new Date()` en este módulo), así
 *  que comparar en UTC de ambos lados es seguro y no reintroduce el bug de
 *  "hoy en UTC" que documenta CLAUDE.md -- ese bug es sobre DERIVAR "hoy",
 *  no sobre restar dos fechas ya conocidas. */
function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function tieneFechaEncima(hecho: Hecho | undefined, fechaReferencia: string): boolean {
  if (!hecho?.fecha_limite) return false;
  return diasEntre(fechaReferencia, hecho.fecha_limite) <= DIAS_VENTANA_FECHA_ENCIMA;
}

interface ClaveOrden {
  fechaEncima: boolean;
  /**
   * Dentro de "tiene fecha encima", separa lo que TODAVÍA SE PUEDE PREVENIR de
   * lo que YA SE VENCIÓ. No es un detalle de implementación: es la resolución
   * de una ambigüedad real del brief (§4.6 decía sólo "asc por fecha_limite") y
   * el orden correcto NO es el que sale de ordenar por fecha a secas.
   *
   * Ordenar ascendente sin más pone primero lo más vencido, y contra el set de
   * referencia del dueño eso da `presupuesto de julio → enmienda`, al revés de
   * lo que él ordenó. La razón por la que su orden es el bueno:
   *
   *   - La enmienda vence MAÑANA. Si mañana no está el Silicalmag, la
   *     aplicación no corre o corre corta, y eso no se recupera en ese ciclo.
   *     La ventana se está cerrando: hoy todavía se puede evitar.
   *   - La revisión del presupuesto de julio lleva 12 días vencida. Que pase a
   *     13 no cuesta nada: la ventana ya se cerró y no vuelve a cerrarse.
   *
   * O sea que la distancia a hoy no es lo que ordena — lo que ordena es si el
   * plazo todavía es evitable. Una fecha próxima es una oportunidad de
   * prevenir; una vencida es una deuda que no crece.
   *
   * NO "simplificar" esto a un `sort` por fecha: rompe el criterio de
   * aceptación de `accionesOrden.test.ts` y, peor, invierte la prioridad justo
   * en el caso que más plata cuesta.
   */
  vencida: boolean;
  fechaLimite: string | null;
  diasEsperando: number;
  tamanoNormalizado: number;
  clave: string;
}

/**
 * `ordenarAcciones(aceptadas, paquete) → AccionValidada[]`.
 *
 * Recibe la salida de `validarSalidaMotor` (`aceptadas`) y el paquete cerrado
 * (para leer `hecho.fecha_limite` / `dias_esperando` / `tamano_conjunto` del
 * hecho sustentador y `paquete.fecha_referencia`). Devuelve el mismo array,
 * reordenado. La persistencia (Fase 2) asigna el `SMALLINT orden` de
 * `acciones_recomendadas` por POSICIÓN en este array -- esta función no
 * escribe un campo `orden` en el objeto.
 *
 * El orden ENTRE negocios (en qué secuencia aparecen las tarjetas) sigue
 * `paquete.negocios` tal cual llega -- es un dato de entrada explícito, no
 * un efecto colateral del orden de inserción de `aceptadas`.
 */
export function ordenarAcciones(aceptadas: AccionValidada[], paquete: PaqueteAcciones): AccionValidada[] {
  const hechosById = new Map(paquete.hechos.map((h) => [h.id, h] as const));

  const maxTamanoPorNegocio = new Map<NegocioAccion, number>();
  for (const accion of aceptadas) {
    const hecho = hechosById.get(accion.hecho_ids[0]);
    const tamano = hecho?.tamano_conjunto ?? 0;
    if (tamano > (maxTamanoPorNegocio.get(accion.negocio) ?? 0)) {
      maxTamanoPorNegocio.set(accion.negocio, tamano);
    }
  }

  function claveOrden(accion: AccionValidada): ClaveOrden {
    const hecho = hechosById.get(accion.hecho_ids[0]);
    const maxNegocio = maxTamanoPorNegocio.get(accion.negocio) || 1;
    return {
      fechaEncima: tieneFechaEncima(hecho, paquete.fecha_referencia),
      vencida: hecho?.fecha_limite ? hecho.fecha_limite < paquete.fecha_referencia : false,
      fechaLimite: hecho?.fecha_limite ?? null,
      diasEsperando: hecho?.dias_esperando ?? -Infinity,
      tamanoNormalizado: (hecho?.tamano_conjunto ?? 0) / maxNegocio,
      clave: accion.clave,
    };
  }

  function comparar(a: AccionValidada, b: AccionValidada): number {
    const ca = claveOrden(a);
    const cb = claveOrden(b);

    // 1º -- fecha encima gana sobre todo lo demás.
    if (ca.fechaEncima !== cb.fechaEncima) return ca.fechaEncima ? -1 : 1;
    if (ca.fechaEncima && cb.fechaEncima) {
      // 1a -- lo que todavía se puede prevenir antes que lo ya vencido.
      //       Ver el comentario de `vencida` en ClaveOrden: es la parte
      //       contraintuitiva y la que no se debe "simplificar".
      if (ca.vencida !== cb.vencida) return ca.vencida ? 1 : -1;
      // 1b -- dentro de cada grupo, asc por fecha: lo más inminente primero
      //       entre las próximas, lo más antiguo primero entre las vencidas.
      if (ca.fechaLimite !== cb.fechaLimite) {
        return (ca.fechaLimite ?? '') < (cb.fechaLimite ?? '') ? -1 : 1;
      }
    }

    // 2º -- antigüedad, desc.
    if (ca.diasEsperando !== cb.diasEsperando) return cb.diasEsperando - ca.diasEsperando;

    // 3º -- tamaño normalizado dentro del negocio, desc.
    if (ca.tamanoNormalizado !== cb.tamanoNormalizado) return cb.tamanoNormalizado - ca.tamanoNormalizado;

    // Desempate final: clave alfabética -- estable entre corridas idénticas.
    return ca.clave.localeCompare(cb.clave);
  }

  const porNegocio = new Map<NegocioAccion, AccionValidada[]>();
  for (const accion of aceptadas) {
    const lista = porNegocio.get(accion.negocio) ?? [];
    lista.push(accion);
    porNegocio.set(accion.negocio, lista);
  }

  const negociosEnOrden = paquete.negocios.filter((n) => porNegocio.has(n));
  // Por si `aceptadas` trae un negocio que no está en `paquete.negocios`
  // (no debería pasar tras el validador, pero esta función no lanza):
  // se agrega al final, en vez de perder acciones silenciosamente.
  for (const negocio of porNegocio.keys()) {
    if (!negociosEnOrden.includes(negocio)) negociosEnOrden.push(negocio);
  }

  const resultado: AccionValidada[] = [];
  for (const negocio of negociosEnOrden) {
    const lista = porNegocio.get(negocio) ?? [];
    resultado.push(...[...lista].sort(comparar));
  }
  return resultado;
}
