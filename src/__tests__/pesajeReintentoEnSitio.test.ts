// ARCHIVO: __tests__/pesajeReintentoEnSitio.test.ts
// DESCRIPCIÓN: guarda estática del hallazgo ESCO-123 -- un fallo del OCR en
// la carga por foto del pesaje NO puede terminar el flujo. El 2026-09-19 la
// misma persona subió la planilla dos veces con 24 segundos de diferencia,
// las dos fallaron (`hato_capturas_foto.desenlace='ocr_fallo'`, `origen='web'`)
// y no hubo un tercer intento: el pesaje del 2026-09-16 nunca entró a
// `hato_pesajes_leche`, mientras la ruta de Telegram escribía 45 filas ese
// mismo día.
//
// Esta guarda no prueba comportamiento de UI (no hay entorno de DOM en esta
// suite); fija los tres hechos del archivo que hacen recuperable el fallo, y
// que un refactor podría deshacer sin que nada más se ponga rojo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FUENTE = readFileSync(
  join(__dirname, '../components/hato/components/SubirPesajeFoto.tsx'),
  'utf-8',
);

describe('ESCO-123 — reintentar la carga por foto sin salir de la pantalla', () => {
  it('el modo es estado sembrado desde la prop, no la prop leída directo', () => {
    expect(FUENTE).toMatch(/useState<'foto' \| 'manual'>\(modoInicial\)/);
    // El cuerpo y el pie ramifican por el ESTADO: si volvieran a leer la
    // prop, pasar a la grilla en blanco exigiría cerrar el diálogo.
    expect(FUENTE).toContain("{!resultado && modo === 'manual' && (");
    expect(FUENTE).toContain("{!resultado && modo !== 'manual' && (");
    expect(FUENTE).toContain("{!resultado && modo === 'manual' ? (");
  });

  it('ofrece las dos salidas en sitio tras un error, antes de que haya resultado', () => {
    expect(FUENTE).toContain('const handleDescartarFotos = ');
    expect(FUENTE).toContain('const handleIngresarAMano = ');
    expect(FUENTE).toContain('{error && !resultado && !loading && (');
    expect(FUENTE).toContain('onClick={handleDescartarFotos}');
    expect(FUENTE).toContain('onClick={handleIngresarAMano}');
  });

  it('descartar vacía la cola de envío y limpiar el error precede a apilar fotos nuevas', () => {
    // `agregarFotos` APILA: sin descartar, el reintento reenviaba la foto
    // que acababa de fallar.
    expect(FUENTE).toMatch(/const handleDescartarFotos = \(\) => \{\s*\n\s*setFotos\(\[\]\);/);
    expect(FUENTE).toMatch(/const agregarFotos = \(nuevas: File\[\]\) => \{[\s\S]{0,400}?if \(error\) limpiar\(\);/);
  });

  it('no prefiere ningún valor: la grilla manual sigue saliendo de construirDiffPesajeManual', () => {
    // La recuperación no puede fabricar litros -- "sin dato" nunca es 0.
    expect(FUENTE).toContain('iniciarManual(');
    expect(FUENTE).not.toMatch(/litrosAm:\s*0\b/);
    expect(FUENTE).not.toMatch(/litrosPm:\s*0\b/);
  });
});
