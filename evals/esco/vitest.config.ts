// Configuración de Vitest SOLO para las evaluaciones de Esco.
// No se mezcla con `npm test`: los archivos son *.eval.ts (el glob por defecto de
// Vitest busca *.test.* y *.spec.*, así que `npm test` nunca los corre).
//
//   npm run eval:esco            → plan (no llama a nada)
//   EVAL_MODO=live npm run eval:esco
//
// Las variables salen del entorno o de un archivo `.env.eval` (ignorado por git).

import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(() => {
  const env = loadEnv('eval', process.cwd(), '');
  return {
    test: {
      include: [env.EVAL_MODO === 'frozen' ? 'evals/esco/frozen.eval.ts' : 'evals/esco/run.eval.ts'],
      environment: 'node',
      env,
      // Una corrida de Esco hace hasta 3 rondas de LLM más el juez.
      testTimeout: 5 * 60 * 1000,
      hookTimeout: 60 * 1000,
      // Se fija `Date` y `fetch` globales por corrida: las corridas no pueden solaparse.
      fileParallelism: false,
      sequence: { concurrent: false },
      reporters: ['default'],
    },
  };
});
