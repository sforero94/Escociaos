// Microprueba E2-06: tres llamadas sintéticas para comprobar que Luna y Sol aceptan
// el esfuerzo de razonamiento pedido y llaman herramientas. Sin datos reales.
// Uso: node scripts/esco2/microprueba.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearClienteOpenRouter, type Esfuerzo } from '../../src/utils/esco2/llm.ts';

const PRIVADO = process.env.ESCO2_PRIVADO ?? '/Users/santiagoforero/Codigo/Escociaos/docs/Esco 2.0';
const clave = /^OPENROUTER_API_KEY\s*=\s*(\S+)/m.exec(readFileSync(join(PRIVADO, '.env'), 'utf8'))?.[1]?.replace(/^["']|["']$/g, '');
if (!clave) throw new Error('Falta OPENROUTER_API_KEY');
const llm = crearClienteOpenRouter(clave);

const herramienta = [
  {
    type: 'function',
    function: {
      name: 'sumar_ficticio',
      description: 'Suma dos números ficticios.',
      parameters: { type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: { type: 'number' }, b: { type: 'number' } } },
    },
  },
];

const casos: Array<{ modelo: string; esfuerzo: Esfuerzo }> = [
  { modelo: 'openai/gpt-6-luna', esfuerzo: 'none' },
  { modelo: 'openai/gpt-6-sol', esfuerzo: 'none' },
  { modelo: 'openai/gpt-6-sol', esfuerzo: 'low' },
];

let total = 0;
for (const c of casos) {
  try {
    const r = await llm.completar({
      ...c,
      mensajes: [{ role: 'user', content: 'Usa la herramienta para sumar 2 y 3.' }],
      herramientas: herramienta,
      toolChoice: 'required',
      maxTokens: 300,
    });
    total += r.uso.costoUsd ?? 0;
    console.log(JSON.stringify({ ...c, modeloRespuesta: r.modelo, llamadas: r.llamadas, uso: r.uso, ms: r.ms, fin: r.finishReason }));
  } catch (e) {
    console.log(JSON.stringify({ ...c, error: String(e) }));
  }
}
console.log(`Costo total USD ${total.toFixed(6)}`);
