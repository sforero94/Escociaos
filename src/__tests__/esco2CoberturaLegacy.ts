// TEST ONLY. Existing operation fixtures do not declare an independent question-part oracle.
// Their execution remains useful regression evidence, never certified semantic coverage.
import { responderTurnoDesdeFuente } from '../utils/esco2/nucleo.ts';

export function responderTurnoDesdeFuenteLegadoSinCertificar(args: Parameters<typeof responderTurnoDesdeFuente>[0]): ReturnType<typeof responderTurnoDesdeFuente> {
  return responderTurnoDesdeFuente({ ...args, modoCobertura: 'legado_sin_certificar' });
}
