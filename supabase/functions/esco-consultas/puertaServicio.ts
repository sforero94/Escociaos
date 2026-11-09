// La puerta de servicio nunca acepta una claim de rol sin verificar la credencial.
export interface ConfiguracionPuertaTelegram {
  credencialServicio?: string;
  secretoTelegram?: string;
}
export type ResultadoPuertaTelegram =
  | { tipo: 'web' }
  | { tipo: 'servicio' }
  | { tipo: 'error'; estado: 401 | 503 };

function iguales(a: string, b: string): boolean {
  const izquierda = new TextEncoder().encode(a);
  const derecha = new TextEncoder().encode(b);
  let diferencia = izquierda.length ^ derecha.length;
  for (let i = 0; i < Math.max(izquierda.length, derecha.length); i++) {
    diferencia |= (izquierda[i] ?? 0) ^ (derecha[i] ?? 0);
  }
  return diferencia === 0;
}

export function validarPuertaTelegram(jwt: string, secreto: string | null, config: ConfiguracionPuertaTelegram): ResultadoPuertaTelegram {
  const usaCredencialServicio = Boolean(config.credencialServicio && iguales(jwt, config.credencialServicio));
  if (secreto === null && !usaCredencialServicio) return { tipo: 'web' };
  if (!config.credencialServicio || !config.secretoTelegram) return { tipo: 'error', estado: 503 };
  if (!usaCredencialServicio || secreto === null || !iguales(secreto, config.secretoTelegram)) return { tipo: 'error', estado: 401 };
  return { tipo: 'servicio' };
}
