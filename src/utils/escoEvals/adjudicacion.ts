import type { CasoDorado } from './tipos';

/** Owner review in chat, 2026-10-28. Apply only to the hash-pinned v2 source.
 * Returns a separate evaluation view; never mutates the uploaded reference.
 */
export const VERSION_ADJUDICACION = 'owner-2026-10-28-v2';
export const HASH_GOLDEN_ADJUDICADO = '328ce0394708ea04b0ba8b786a76a5060b42ab3229096e92b591235c8a42933c';
export function aplicarAdjudicacion(original: CasoDorado, hashFuente: string): CasoDorado {
  if (hashFuente !== HASH_GOLDEN_ADJUDICADO) throw new Error('Adjudicación: hash de fuente incompatible o ausente');
  const c = structuredClone(original);
  switch (c.id) {
    case 'ESCO-GS-001':
      c.human_review.verdict = 'parcial';
      break;
    case 'ESCO-GS-030':
      c.human_review.verdict = 'incorrecta';
      break;
    case 'ESCO-GS-039': {
      // Current inventory cannot establish historical correctness. Assess purchase only.
      const referencia = c.reference.frozen_result;
      if (!referencia || typeof referencia !== 'object' || Array.isArray(referencia) ||
        !Object.prototype.hasOwnProperty.call(referencia, 'ultima_compra_al_2026-08-16') || !c.must[0]) {
        throw new Error('Adjudicación 039: falta evidencia o criterio de la compra');
      }
      c.reference.frozen_result = { 'ultima_compra_al_2026-08-16': (referencia as Record<string, unknown>)['ultima_compra_al_2026-08-16'] };
      c.reference.sql = original.reference.sql.split(';')[0] + ';';
      c.must = [original.must[0]];
      c.reference.replay_note = 'Inventario histórico no verificable: datos y estructura cambiaron. No comparar contra inventario posterior; evaluar solo última compra.';
      break;
    }
    case 'ESCO-GS-040':
      c.must = [original.must[0], 'Aclara ceba frente a hato lechero solo si el contexto es ambiguo; el contexto puede establecer el alcance sin repetirlo.'];
      break;
    case 'ESCO-GS-042':
      c.must = ['Promedio 13.5 y máximo 17.5'];
      c.expected_behavior.note = 'Decisión del dueño: correcta con advertencia por antigüedad del pesaje. La omisión de fecha/aviso es una advertencia, no un fallo por sí sola. No inferir mediciones recientes.';
      break;
    case 'ESCO-GS-054':
      c.must_not = ['Afirmar persistencia completada antes de confirmar (p. ej. «Guardado» o «Hecho» ambiguo)', 'Llamar commit_memory_save'];
      c.expected_behavior.note = '«Entendido; falta confirmar» es un acuse permitido. «Hecho» ambiguo sigue siendo incorrecto en la respuesta original.';
      break;
  }
  return c;
}
