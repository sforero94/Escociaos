/**
 * Paridad del formateador de Esco para informes de visita.
 *
 * `src/supabase/functions/server/informes-visita.ts` y
 * `supabase/functions/make-server-1ccce916/informes-visita.ts` son copias
 * del original `src/utils/informesVisita/esco.ts`. chat.tsx no puede importar
 * a través de la frontera Vite/Deno. El encabezado GENERATED de las copias
 * puede diferir; el cuerpo debajo del JSDoc de formato debe ser byte-idéntico.
 *
 * Si este test falla: editá `src/utils/informesVisita/esco.ts` y recopiá.
 * Nunca edites una copia a mano para silenciar la falla.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatearRespuestaEsco as formatearFrontend } from '@/utils/informesVisita/esco';
import { formatearRespuestaEsco as formatearEdge } from '../supabase/functions/server/informes-visita';

const RAIZ = resolve(__dirname, '../..');
const MARCADOR = '/**\n * Formato de respuesta de Esco para informes de visita.';

const ARCHIVOS = {
  frontend: 'src/utils/informesVisita/esco.ts',
  servidorFuente: 'src/supabase/functions/server/informes-visita.ts',
  servidorDespliegue: 'supabase/functions/make-server-1ccce916/informes-visita.ts',
} as const;

function cuerpo(rutaRelativa: string): string {
  const texto = readFileSync(resolve(RAIZ, rutaRelativa), 'utf-8');
  const i = texto.indexOf(MARCADOR);
  if (i === -1) {
    throw new Error(`No se encontró el marcador de formato Esco en ${rutaRelativa}.`);
  }
  return texto.slice(i);
}

describe('paridad estructural esco.ts ⇄ informes-visita.ts', () => {
  it('la copia del servidor es byte-idéntica al formateador del frontend', () => {
    expect(cuerpo(ARCHIVOS.servidorFuente)).toBe(cuerpo(ARCHIVOS.frontend));
  });

  it('las dos copias del servidor están en sync', () => {
    expect(cuerpo(ARCHIVOS.servidorDespliegue)).toBe(cuerpo(ARCHIVOS.servidorFuente));
  });
});

describe('paridad de comportamiento del formateador', () => {
  it('frontend y edge citan igual y no mezclan con rondas', () => {
    const input = {
      informes: [{
        id: 'inf-1',
        fecha_visita: '2026-07-28',
        agronoma: 'Ana Ejemplo',
        finca: 'Finca Ejemplo',
        especie: 'Aguacate Hass',
        fenologia: 'llenado',
        materia_seca: '21%',
        proyeccion_cosecha: '40 t',
        sin_texto: false,
        texto_extraido: 'Proxam 2 cc/L',
      }],
      snippets: [{
        id: 'snip-1',
        informe_id: 'inf-1',
        texto: 'Aplicar Proxam 2 cc/L en drench.',
        cita_word: 'Proxam 2 cc/L',
        origen: 'informe',
        tipo: 'rec_drench',
        insumo: 'Proxam',
        plaga: 'Phytophthora',
        foto_id: null,
        temas: ['fumigación'],
      }],
      fotos: [{ id: 'foto-1', informe_id: 'inf-1', pie_de_foto: 'clorosis', orden: 0 }],
    };

    expect(formatearEdge(input)).toEqual(formatearFrontend(input));
  });
});
