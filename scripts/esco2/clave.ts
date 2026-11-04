// Lee OPENROUTER_API_KEY de un archivo local ignorado por git. Nunca la imprime.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.ESCO2_RAIZ ?? '/Users/santiagoforero/Codigo/Escociaos';

export function leerClaveOpenRouter(): string {
  const candidatos = [process.env.ESCO2_ENV, join(RAIZ, 'docs/Esco 2.0/.env'), join(RAIZ, '.env.local')].filter((p): p is string => !!p);
  for (const ruta of candidatos) {
    if (!existsSync(ruta)) continue;
    const m = /^OPENROUTER_API_KEY\s*=\s*(\S+)/m.exec(readFileSync(ruta, 'utf8'));
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error(`Falta OPENROUTER_API_KEY en: ${candidatos.join(', ')}`);
}
