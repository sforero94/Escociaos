export interface ValidatedToolCall {
  id: string;
  function: { name: string; arguments: string };
  args: Record<string, unknown>;
}
// Validate the complete round before any tool executes, including write proposals.
export function validateToolRound(value: unknown, knownNames: ReadonlySet<string>, alreadyExecuted: number): ValidatedToolCall[] {
  if (!Array.isArray(value) || value.length > 8 || alreadyExecuted + value.length > 24) {
    throw new Error('La respuesta de Esco excede el límite de herramientas.');
  }
  const ids = new Set<string>();
  return value.map(call => {
    if (!call || typeof call !== 'object' || typeof call.id !== 'string' || !call.id || call.id.length > 256
      || ids.has(call.id) || call.type !== 'function' || !call.function
      || typeof call.function.name !== 'string' || !knownNames.has(call.function.name)
      || typeof call.function.arguments !== 'string'
      || new TextEncoder().encode(call.function.arguments).byteLength > 16 * 1024) {
      throw new Error('Esco devolvió una herramienta inválida.');
    }
    ids.add(call.id);
    let args: unknown;
    try { args = JSON.parse(call.function.arguments); }
    catch { throw new Error('Esco devolvió argumentos inválidos.'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error('Esco devolvió argumentos inválidos.');
    }
    return { id: call.id, function: call.function, args: args as Record<string, unknown> };
  });
}
