const QUESTION_PREFIXES = [
  /^¿?cu[aá]nto\s+/i,
  /^¿?cu[aá]les?\s+(?:son|es|fueron?)\s+/i,
  /^¿?c[oó]mo\s+(?:est[aá]|van?|fue)\s+/i,
  /^¿?qu[eé]\s+/i,
  /^¿?dame\s+(?:un\s+)?/i,
  /^¿?mu[eé]strame\s+(?:un\s+|el\s+|la\s+|los\s+|las\s+)?/i,
  /^¿?dime\s+/i,
  /^¿?hay\s+/i,
  /^¿?tenemos\s+/i,
  /^¿?puedes\s+(?:darme|mostrarme|decirme)\s+(?:un\s+|el\s+|la\s+|los\s+|las\s+)?/i,
];

export function generarTituloInforme(pregunta: string): string {
  let titulo = pregunta.trim();

  // Strip leading ¿ and trailing ?
  titulo = titulo.replace(/^¿\s*/, '').replace(/\?+$/, '').trim();

  // Strip known question prefixes
  for (const prefix of QUESTION_PREFIXES) {
    titulo = titulo.replace(prefix, '');
  }

  titulo = titulo.trim();

  if (titulo.length < 3) return 'Resumen de consulta';

  // Capitalize first letter
  titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);

  // Truncate at word boundary
  if (titulo.length > 60) {
    titulo = titulo.slice(0, 60).replace(/\s+\S*$/, '');
  }

  return titulo;
}
