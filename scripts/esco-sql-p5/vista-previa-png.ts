// Synthetic previews only. No configuration, credentials, network or Telegram calls.
import { renderizarGraficaPng, renderizarGraficaSvg } from '../../src/supabase/functions/server/telegram/escoSqlPng.ts';
import type { Bloque } from '../../src/utils/escoSql/bloques.ts';
const out = Deno.args[0];
if (!out) throw new Error('Indica un directorio temporal para las vistas sintéticas.');
await Deno.mkdir(out, { recursive: true });
type Grafica = Extract<Bloque, { tipo: 'grafica' }>;
const ejemplos: Array<[string, Grafica]> = [
  ['barras-maximo', { tipo: 'grafica', consulta: 1, truncado: false, titulo: 'Columnas sintéticas: 60 categorías y 6 series', forma: 'bar', x: 'categoria', y: Array.from({ length: 6 }, (_, i) => `Serie ${i + 1}`), formato: 'numero', datos: Array.from({ length: 60 }, (_, i) => ({ categoria: `Categoría ${i + 1}`, ...Object.fromEntries(Array.from({ length: 6 }, (_, j) => [`Serie ${j + 1}`, (i * 37 + j * 17) % 350])) })) }],
  ['pie-maximo', { tipo: 'grafica', consulta: 1, truncado: true, titulo: '60 sectores sintéticos · datos truncados', forma: 'pie', x: 'categoria', y: ['valor'], formato: 'numero', datos: Array.from({ length: 60 }, (_, i) => ({ categoria: `Categoría ${i + 1}`, valor: i + 1 })) }],
  ['linea-null-cero', { tipo: 'grafica', consulta: 1, truncado: false, titulo: 'Sin dato es un hueco; cero conserva su posición', forma: 'line', x: 'dia', y: ['Litros'], formato: 'litros', datos: [3, 4, null, 0, 2].map((v, i) => ({ dia: `Día ${i + 1}`, Litros: v })) }],
  ['area-negativos', { tipo: 'grafica', consulta: 1, truncado: false, titulo: 'Serie sintética con valores positivos y negativos', forma: 'area', x: 'periodo', y: ['Variación'], formato: 'porcentaje', datos: [-3, 1, 4, -2, null, 2].map((v, i) => ({ periodo: `Período ${i + 1}`, Variación: v })) }],
];
for (const [name, block] of ejemplos) {
  await Deno.writeFile(`${out}/${name}.png`, await renderizarGraficaPng(block));
  await Deno.writeTextFile(`${out}/${name}.svg`, renderizarGraficaSvg(block, 'Esco Sans Subset'));
  console.log(name);
}
