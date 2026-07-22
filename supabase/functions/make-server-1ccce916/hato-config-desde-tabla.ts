// hato-config-desde-tabla.ts — traduce las filas crudas de `hato_config`
// (clave/valor jsonb, migraciones 058 + 062) al `HatoConfig` tipado que
// consume el motor puro (`calculos-hato.ts`) y el pipeline de importación
// (`importHato/normalizar.ts`). Sin imports de Deno para que sea testeable
// desde Vitest -- mismo patrón que `ganado-inventario.ts`/`cost-aggregation.ts`.
//
// El endpoint de subida de chequeo (`hato-chequeo-preview.ts`) hace la
// consulta a Supabase (`SELECT clave, valor FROM hato_config`) y le pasa el
// resultado a `construirHatoConfigDesdeFilas`. Este módulo nunca ve un
// cliente de Supabase.
//
// Regla dura (CLAUDE.md, "no business constant lives in the engine"): si
// falta una clave, esto FALLA explícito. El runner offline
// (`scripts/import-hato/extract.ts`) documenta por qué SÍ copia los defaults
// a mano (no tiene sesión de Supabase); el endpoint SÍ la tiene, así que acá
// no hay excusa para un fallback silencioso -- eso reintroduciría la misma
// constante de negocio escondida en código que la migración 058 existe para
// evitar.

import type { HatoConfig } from './calculos-hato.ts';

/** Una fila cruda de `hato_config`: `clave text`, `valor jsonb` (heterogéneo
 * a propósito -- lista, mapa o escalar según la clave). */
export interface FilaHatoConfig {
  clave: string;
  valor: unknown;
}

/** Las 10 claves que `HatoConfig` necesita, sembradas por 058 (9) + 062
 * (`dias_espera_voluntaria_post_parto`). Espejo de la lista de claves de
 * `scripts/import-hato/extract.ts` -- si esa lista cambia, esta debe
 * cambiar en el mismo commit. */
const CLAVES_NUMERICAS: ReadonlyArray<
  Exclude<keyof HatoConfig, 'razas' | 'meses_secado_por_raza'>
> = [
  'meses_gestacion_default',
  'umbral_partos_reemplazo',
  'ventana_proxima_secar_dias',
  'ventana_proximo_parir_dias',
  'dias_parto_proximo_alerta',
  'dias_servicio_sin_confirmacion',
  'dias_rechequeo_due',
  'dias_espera_voluntaria_post_parto',
];

function leerNumero(valor: unknown, clave: string, errores: string[]): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    errores.push(`hato_config.${clave} debería ser numérico, llegó: ${JSON.stringify(valor)}`);
    return 0;
  }
  return valor;
}

function leerRazas(valor: unknown, errores: string[]): string[] {
  if (!Array.isArray(valor) || !valor.every((v) => typeof v === 'string')) {
    errores.push(`hato_config.razas debería ser un arreglo de strings, llegó: ${JSON.stringify(valor)}`);
    return [];
  }
  return valor;
}

function leerMesesSecadoPorRaza(valor: unknown, errores: string[]): Record<string, number> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    errores.push(`hato_config.meses_secado_por_raza debería ser un objeto, llegó: ${JSON.stringify(valor)}`);
    return { _default: 2 };
  }
  const mapa = valor as Record<string, unknown>;
  if (!('_default' in mapa) || typeof mapa._default !== 'number') {
    errores.push('hato_config.meses_secado_por_raza debe traer la clave "_default" (numérica) -- el motor la usa cuando la raza del animal es desconocida.');
  }
  const resultado: Record<string, number> = {};
  for (const [raza, meses] of Object.entries(mapa)) {
    if (typeof meses !== 'number') {
      errores.push(`hato_config.meses_secado_por_raza.${raza} debería ser numérico, llegó: ${JSON.stringify(meses)}`);
      continue;
    }
    resultado[raza] = meses;
  }
  return resultado;
}

/**
 * Construye `HatoConfig` a partir de las filas de `hato_config`. Lanza un
 * único `Error` que lista TODAS las claves faltantes/mal tipadas de una vez
 * (no solo la primera) -- quien lea el mensaje en el log del endpoint no
 * tiene que corregir y re-desplegar 10 veces para ver el siguiente problema.
 */
export function construirHatoConfigDesdeFilas(filas: FilaHatoConfig[]): HatoConfig {
  const porClave = new Map<string, unknown>(filas.map((f) => [f.clave, f.valor]));
  const errores: string[] = [];

  const clavesFaltantes = ['razas', 'meses_secado_por_raza', ...CLAVES_NUMERICAS].filter((c) => !porClave.has(c));
  if (clavesFaltantes.length > 0) {
    throw new Error(
      `hato_config no trae ${clavesFaltantes.length} clave(s) requerida(s) por el motor: ${clavesFaltantes.join(', ')}. ` +
        'Verificar que las migraciones 058 y 062 se aplicaron en este entorno -- el endpoint nunca usa un default inventado en código.',
    );
  }

  const razas = leerRazas(porClave.get('razas'), errores);
  const mesesSecadoPorRaza = leerMesesSecadoPorRaza(porClave.get('meses_secado_por_raza'), errores);

  const numeros = {} as Record<(typeof CLAVES_NUMERICAS)[number], number>;
  for (const clave of CLAVES_NUMERICAS) {
    numeros[clave] = leerNumero(porClave.get(clave), clave, errores);
  }

  if (errores.length > 0) {
    throw new Error(`hato_config tiene valores inválidos:\n- ${errores.join('\n- ')}`);
  }

  return {
    razas,
    meses_secado_por_raza: mesesSecadoPorRaza,
    ...numeros,
  };
}
