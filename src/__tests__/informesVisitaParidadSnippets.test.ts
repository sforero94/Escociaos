/**
 * Paridad del parser de snippets: el frontend y la copia Deno tienen que
 * anclar igual (tirar sin cita, tirar insumo inventado).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsearRespuestaSnippets as parseFront, citaEstaEnTexto as citaFront } from '@/utils/informesVisita/snippets';
import { extraerCabecera as cabFront } from '@/utils/informesVisita/cabecera';
import {
  parsearRespuestaSnippets as parseEdge,
  citaEstaEnTexto as citaEdge,
  extraerCabecera as cabEdge,
} from '../supabase/functions/server/informes-visita-snippets';

const TEXTO = `Finca: Finca Ejemplo
Fecha de visita: 28 de julio de 2026
Agrónoma: Ana Ejemplo
Proxam 2 cc/L. Periodo de carencia 15 días. Blanco: Phytophthora.
Este sector presenta árboles con clorosis.`;

const BRUTO = {
  cabecera: {
    fecha_visita: '2026-07-28',
    agronoma: 'Ana Ejemplo',
    finca: 'Finca Ejemplo',
    especie: '',
    fenologia: '',
    materia_seca: '',
    proyeccion_cosecha: '',
  },
  snippets: [
    {
      texto: 'Drench de Proxam contra Phytophthora.',
      cita_word: 'Proxam 2 cc/L. Periodo de carencia 15 días.',
      tipo: 'rec_drench',
      insumo: 'Proxam',
      plaga: 'Phytophthora',
      foto_indice: -1,
    },
    {
      texto: 'Idea sin ancla.',
      cita_word: 'esto no está en el word xyz',
      tipo: '',
      insumo: '',
      plaga: '',
      foto_indice: -1,
    },
    {
      texto: 'Insumo inventado.',
      cita_word: 'Este sector presenta árboles con clorosis.',
      tipo: 'observacion',
      insumo: 'Glifosato',
      plaga: '',
      foto_indice: -1,
    },
  ],
};

describe('paridad parser snippets', () => {
  it('frontend y Deno descartan las mismas propuestas', () => {
    const a = parseFront(BRUTO, TEXTO, 0, '2026-01-01');
    const b = parseEdge(BRUTO, TEXTO, 0, '2026-01-01');
    expect(b).toEqual(a);
    expect(a.snippets).toHaveLength(1);
    expect(a.descartadosPorCita).toBe(2);
    expect(a.cabecera.fecha_visita).toBe('2026-07-28');
  });

  it('citaEstaEnTexto y extraerCabecera coinciden', () => {
    expect(citaEdge('Proxam 2 cc/L. Periodo de carencia 15 días.', TEXTO)).toBe(
      citaFront('Proxam 2 cc/L. Periodo de carencia 15 días.', TEXTO),
    );
    expect(cabEdge(TEXTO, '2026-09-03')).toEqual(cabFront(TEXTO, '2026-09-03'));
  });

  it('extraerCabecera lee tabla Word (pipe) igual en ambas copias', () => {
    const texto = [
      'Fecha de visita | 28 de julio de 2026',
      'Agrónoma | Ana Ejemplo',
      'Finca | Finca Ejemplo',
    ].join('\n');
    expect(cabEdge(texto, '2026-09-03')).toEqual(cabFront(texto, '2026-09-03'));
    expect(cabFront(texto, '2026-09-03').fecha_visita).toBe('2026-07-28');
  });

  it('las dos copias Deno del parser están en sync', () => {
    const raiz = resolve(__dirname, '../..');
    const a = readFileSync(resolve(raiz, 'src/supabase/functions/server/informes-visita-snippets.ts'), 'utf-8');
    const b = readFileSync(resolve(raiz, 'supabase/functions/make-server-1ccce916/informes-visita-snippets.ts'), 'utf-8');
    expect(b).toBe(a);
  });

  it('las dos copias del endpoint proponer están en sync', () => {
    const raiz = resolve(__dirname, '../..');
    const a = readFileSync(resolve(raiz, 'src/supabase/functions/server/informes-visita-proponer.ts'), 'utf-8');
    const b = readFileSync(resolve(raiz, 'supabase/functions/make-server-1ccce916/informes-visita-proponer.ts'), 'utf-8');
    expect(b).toBe(a);
  });
});
