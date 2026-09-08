// Fallo real de produccion (2026-09-08): tras un despliegue, una pestania
// abierta desde antes no pudo generar la planilla de chequeo. La causa no
// estaba en la planilla -- el chunk de `jspdf` ya no existia. El `catch {}`
// pelado mostraba un mensaje fijo, asi que todos los modos de fallo se veian
// iguales. Estas pruebas fijan las redacciones REALES de los navegadores.

import { describe, it, expect } from 'vitest';
import {
  esFalloDeCargaDiferida,
  mensajeErrorCargaDiferida,
  textoDeError,
  MENSAJE_PAGINA_DESACTUALIZADA,
} from '@/utils/errorCargaDiferida';

const REDACCIONES_REALES = [
  // Chrome / Edge
  'Failed to fetch dynamically imported module: https://app.escocia.com/assets/jspdf.es.min-CcVdK9wv.js',
  // Firefox
  'error loading dynamically imported module',
  // Safari
  'Importing a module script failed.',
  // Los tres, cuando la reescritura SPA de vercel.json devuelve index.html
  // en vez de un 404: el navegador se queja del tipo MIME, no del 404.
  'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
  // Vite, precargando la hoja de estilos de un chunk
  'Unable to preload CSS for /assets/ChequeosList-Co9wbPwU.css',
  // Nomenclatura webpack, por si la trae alguna dependencia
  'ChunkLoadError: Loading chunk 42 failed.',
];

describe('esFalloDeCargaDiferida', () => {
  it('reconoce las redacciones reales de los navegadores', () => {
    for (const mensaje of REDACCIONES_REALES) {
      expect(esFalloDeCargaDiferida(new Error(mensaje)), mensaje).toBe(true);
    }
  });

  it('NO confunde un "Failed to fetch" pelado con una pagina vieja', () => {
    // Es el error generico de `fetch`: lo produce cualquier consulta caida a
    // Supabase. Mandar a recargar no arregla la red ni la base, y decirle al
    // usuario que lo haga es peor que un mensaje neutro.
    expect(esFalloDeCargaDiferida(new TypeError('Failed to fetch'))).toBe(false);
    expect(esFalloDeCargaDiferida(new Error('NetworkError when attempting to fetch resource.'))).toBe(false);
  });

  it('no marca errores de dominio ni de permisos', () => {
    expect(esFalloDeCargaDiferida(new Error('permission denied for table fin_gastos'))).toBe(false);
    expect(esFalloDeCargaDiferida(new Error('falta la clave dia_pesaje_semanal en hato_config'))).toBe(false);
    expect(esFalloDeCargaDiferida(null)).toBe(false);
    expect(esFalloDeCargaDiferida(undefined)).toBe(false);
  });

  it('tolera lo que no es un Error', () => {
    expect(esFalloDeCargaDiferida('Failed to load module script')).toBe(true);
    expect(esFalloDeCargaDiferida({ raro: true })).toBe(false);
    expect(textoDeError(42)).toBe('42');
  });
});

describe('mensajeErrorCargaDiferida', () => {
  it('ante una pagina vieja dice que recargue, sin jerga del navegador', () => {
    const msg = mensajeErrorCargaDiferida(
      new Error('Failed to fetch dynamically imported module: https://x/assets/jspdf.js'),
      'No se pudo generar el PDF de la planilla',
    );
    expect(msg).toBe(`No se pudo generar el PDF de la planilla: ${MENSAJE_PAGINA_DESACTUALIZADA}`);
    expect(msg).not.toContain('dynamically');
    expect(msg).not.toContain('assets/');
  });

  it('ante cualquier otro error conserva la causa REAL', () => {
    expect(mensajeErrorCargaDiferida(new Error('permission denied'), 'No se pudo generar el PDF')).toBe(
      'No se pudo generar el PDF: permission denied',
    );
  });
});
