/** La autorización humana usa el perfil vigente, nunca metadata del JWT. */
export function perfilAplicacionActivo(
  filas: unknown,
  userId: string,
  rolesPermitidos: readonly string[],
): boolean {
  if (!Array.isArray(filas) || filas.length !== 1) return false;
  const fila = filas[0];
  if (fila === null || typeof fila !== 'object') return false;
  const perfil = fila as Record<string, unknown>;
  return perfil.id === userId
    && perfil.activo === true
    && typeof perfil.rol === 'string'
    && rolesPermitidos.includes(perfil.rol);
}
