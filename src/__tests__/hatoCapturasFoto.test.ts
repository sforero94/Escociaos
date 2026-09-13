import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import {
  describirUltimaCaptura,
  normalizarCapturaFoto,
  type CapturaFotoResumen,
  type FilaCapturaFotoDb,
} from '../utils/hato/capturasFoto';

/**
 * Registro de cargas por foto del hato — hallazgo ESCO-76 (migración 146,
 * `hato_capturas_foto`).
 *
 * **El defecto.** Las dos rutas de foto del módulo guardaban la imagen en
 * Storage y devolvían un diff, sin dejar rastro de qué pasaba después.
 * Medido contra producción el 2026-09-13: 9 cargas de pesaje en
 * `storage.objects` (2026-08-11 → 2026-09-04) y ningún `hato_pesajes_leche`
 * con `fuente='foto'` escrito después del 2026-08-29 — el pesaje semanal
 * del 2026-09-02 se perdió sin señal. Una foto guardada sin filas al lado
 * podía ser "el OCR no leyó nada", "el usuario no aprobó", "falló el
 * servidor" o "sí escribió, en otro mes": las cuatro idénticas desde
 * afuera.
 *
 * Dos contratos que esta prueba fija:
 *  1. El registro del intento se inserta DESPUÉS de guardar la foto y
 *     ANTES de llamar al modelo de visión, en los dos árboles de edge
 *     function. Registrar después del OCR dejaría invisible justo el caso
 *     que motivó el hallazgo.
 *  2. La línea de la tarjeta dice "sin dato" cuando no hay dato y nunca un
 *     0 fabricado — pero sí muestra un 0 MEDIDO, que es información.
 */

// ---------------------------------------------------------------------------
// 1. Lógica pura de la descripción
// ---------------------------------------------------------------------------

function captura(parcial: Partial<CapturaFotoResumen> = {}): CapturaFotoResumen {
  return {
    id: 'c1',
    tipo: 'pesaje',
    desenlace: 'ok',
    creadoEn: '2026-09-04T14:03:00.000Z',
    celdasLeidasOcr: null,
    celdasConfirmadas: null,
    filasEscritas: null,
    fotosRecibidas: 2,
    storageOk: true,
    detalle: null,
    ...parcial,
  };
}

describe('describirUltimaCaptura', () => {
  it('sin ninguna captura dice "sin dato", nunca 0', () => {
    const d = describirUltimaCaptura(null, '');
    expect(d.texto).toBe('Última captura: sin dato');
    expect(d.texto).not.toMatch(/\b0\b/);
    expect(d.tono).toBe('neutro');
  });

  it('una carga que escribió muestra cuántas filas entraron', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'ok', filasEscritas: 34 }), '4 sept 2026');
    expect(d.texto).toBe('Última captura: 4 sept 2026, 34 pesajes guardados');
    expect(d.tono).toBe('neutro');
  });

  it('singulariza una sola fila', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'ok', filasEscritas: 1 }), '4 sept 2026');
    expect(d.texto).toContain('1 pesaje guardado');
  });

  it('un cero MEDIDO sí se muestra, y en tono de alerta', () => {
    // Aprobó y no entró nada: es un hecho y es un problema. Distinto de
    // "no se sabe", que es la rama de arriba.
    const d = describirUltimaCaptura(captura({ desenlace: 'ok', filasEscritas: 0 }), '4 sept 2026');
    expect(d.texto).toBe('Última captura: 4 sept 2026, no guardó celdas');
    expect(d.tono).toBe('alerta');
  });

  it('una carga guardada sin conteo conocido no inventa un número', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'ok', filasEscritas: null }), '4 sept 2026');
    expect(d.texto).toBe('Última captura: 4 sept 2026, guardada');
    expect(d.texto).not.toMatch(/\d+ pesaje/);
  });

  it('el fallo de OCR se nombra tal cual — es el caso del hallazgo', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'ocr_fallo' }), '4 sept 2026');
    expect(d.texto).toBe('Última captura: 4 sept 2026, el OCR no leyó ninguna celda');
    expect(d.tono).toBe('alerta');
  });

  it('una carga pendiente con celdas leídas dice que nadie la aprobó', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'pendiente', celdasLeidasOcr: 12 }), '4 sept 2026');
    expect(d.texto).toBe('Última captura: 4 sept 2026, 12 celdas leídas sin aprobar');
    expect(d.tono).toBe('alerta');
  });

  it('una carga pendiente con CERO celdas leídas es un fallo de lectura, no un "sin aprobar"', () => {
    const d = describirUltimaCaptura(captura({ desenlace: 'pendiente', celdasLeidasOcr: 0 }), '4 sept 2026');
    expect(d.texto).toContain('el OCR no leyó ninguna celda');
    expect(d.tono).toBe('alerta');
  });

  it('el chequeo habla de filas, no de celdas', () => {
    const d = describirUltimaCaptura(captura({ tipo: 'chequeo', desenlace: 'ocr_fallo' }), '9 sept 2026');
    expect(d.texto).toContain('ninguna fila');
    const ok = describirUltimaCaptura(captura({ tipo: 'chequeo', desenlace: 'ok', filasEscritas: 2 }), '9 sept 2026');
    expect(ok.texto).toContain('2 filas guardadas');
  });

  it('error y abandono nunca se leen como éxito', () => {
    expect(describirUltimaCaptura(captura({ desenlace: 'error' }), 'x').tono).toBe('alerta');
    expect(describirUltimaCaptura(captura({ desenlace: 'abandonado' }), 'x').tono).toBe('alerta');
  });
});

describe('normalizarCapturaFoto', () => {
  const fila: FilaCapturaFotoDb = {
    id: 'c1',
    tipo: 'pesaje',
    desenlace: 'ok',
    creado_en: '2026-09-04T14:03:00.000Z',
    celdas_leidas_ocr: 30,
    celdas_confirmadas: 30,
    filas_escritas: 28,
    fotos_recibidas: 2,
    storage_ok: true,
    detalle: null,
  };

  it('convierte la fila cruda a la forma del dominio', () => {
    const c = normalizarCapturaFoto(fila);
    expect(c).not.toBeNull();
    expect(c!.filasEscritas).toBe(28);
    expect(c!.tipo).toBe('pesaje');
  });

  it('devuelve null ante ausencia de fila', () => {
    expect(normalizarCapturaFoto(null)).toBeNull();
    expect(normalizarCapturaFoto(undefined)).toBeNull();
  });

  it('devuelve null ante un tipo/desenlace fuera del contrato, en vez de adivinar', () => {
    expect(normalizarCapturaFoto({ ...fila, tipo: 'liquidacion' })).toBeNull();
    expect(normalizarCapturaFoto({ ...fila, desenlace: 'quien_sabe' })).toBeNull();
  });

  it('conserva el 0 medido y no lo confunde con ausencia', () => {
    const c = normalizarCapturaFoto({ ...fila, filas_escritas: 0 });
    expect(c!.filasEscritas).toBe(0);
    const sinDato = normalizarCapturaFoto({ ...fila, filas_escritas: null });
    expect(sinDato!.filasEscritas).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Guardas estáticas sobre los dos árboles de edge function
// ---------------------------------------------------------------------------

const ARBOLES = ['src/supabase/functions/server', 'supabase/functions/make-server-1ccce916'];

function leer(ruta: string): string {
  return readFileSync(resolve(__dirname, '../..', ruta), 'utf-8');
}

describe('rutas de foto — el intento se registra ANTES del OCR', () => {
  it.each(ARBOLES)('%s/hato-pesaje-pipeline.ts', (arbol) => {
    const fuente = leer(`${arbol}/hato-pesaje-pipeline.ts`);
    const iRegistro = fuente.indexOf('registrarCapturaFoto({');
    const iModelo = fuente.indexOf('fotos.map((foto) => leerFotoConModelo');
    expect(iRegistro).toBeGreaterThan(-1);
    expect(iModelo).toBeGreaterThan(-1);
    expect(
      iRegistro,
      'el registro del intento tiene que insertarse ANTES de llamar al modelo de visión: si se registra después, un fallo del OCR (el caso que motivó ESCO-76) no deja ninguna fila y la carga vuelve a ser invisible.',
    ).toBeLessThan(iModelo);
    // Y después de subir la foto: la capa cruda primero, siempre.
    expect(fuente.indexOf('.from(BUCKET_FOTOS_PESAJE)')).toBeLessThan(iRegistro);
  });

  it.each(ARBOLES)('%s/hato-chequeo-foto.ts', (arbol) => {
    const fuente = leer(`${arbol}/hato-chequeo-foto.ts`);
    const iRegistro = fuente.indexOf('registrarCapturaFoto({');
    const iModelo = fuente.indexOf('fotos.map((foto) => leerFotoConModelo');
    expect(iRegistro).toBeGreaterThan(-1);
    expect(iModelo).toBeGreaterThan(-1);
    expect(iRegistro).toBeLessThan(iModelo);
    expect(fuente.indexOf('.from(BUCKET_FOTOS)')).toBeLessThan(iRegistro);
  });

  it.each(ARBOLES)('%s cierra la captura en el commit de pesaje', (arbol) => {
    const fuente = leer(`${arbol}/hato-pesaje-pipeline.ts`);
    expect(fuente).toContain("desenlace: 'ok'");
    expect(fuente).toContain('capturaId');
  });

  it.each(ARBOLES)('%s cierra la captura en el commit de chequeo', (arbol) => {
    const fuente = leer(`${arbol}/hato-chequeo-commit.ts`);
    expect(fuente).toContain("desenlace: 'ok'");
    expect(fuente).toContain('filasEscritas: resultado.filasEscritas');
  });

  it('los dos árboles quedan idénticos en los ficheros tocados', () => {
    const FICHEROS = [
      'hato-capturas-foto.ts',
      'hato-pesaje-pipeline.ts',
      'hato-pesaje-foto.ts',
      'hato-pesaje-commit.ts',
      'hato-chequeo-foto.ts',
      'hato-chequeo-commit.ts',
      'telegram/conversations/pesajeLeche.ts',
    ];
    for (const fichero of FICHEROS) {
      const a = leer(`${ARBOLES[0]}/${fichero}`);
      const b = leer(`${ARBOLES[1]}/${fichero}`);
      expect(
        b,
        `${fichero} difiere entre los dos árboles de edge function — se despliega UNO solo, así que una divergencia acá es código que nadie ejecuta o, peor, un comportamiento distinto al revisado.`,
      ).toBe(a);
    }
  });
});

describe('migración 146 — hato_capturas_foto', () => {
  const RUTA = join(__dirname, '../sql/migrations/146_hato_capturas_foto.sql');

  it('existe', () => {
    expect(existsSync(RUTA)).toBe(true);
  });

  it('declara los cinco desenlaces y los dos tipos', () => {
    const sql = readFileSync(RUTA, 'utf-8');
    for (const desenlace of ['pendiente', 'ok', 'ocr_fallo', 'abandonado', 'error']) {
      expect(sql).toContain(`'${desenlace}'`);
    }
    expect(sql).toMatch(/tipo\s+TEXT NOT NULL CHECK \(tipo IN \('pesaje', 'chequeo'\)\)/);
  });

  it('deja los tres conteos NULLables — "sin dato" y "cero medido" no son lo mismo', () => {
    const sql = readFileSync(RUTA, 'utf-8');
    for (const columna of ['celdas_leidas_ocr', 'celdas_confirmadas', 'filas_escritas']) {
      expect(sql).toMatch(new RegExp(`${columna}\\s+INTEGER CHECK`));
      expect(sql).not.toMatch(new RegExp(`${columna}\\s+INTEGER NOT NULL`));
    }
  });

  it('enciende RLS, no crea política de DELETE y revoca la escritura del navegador', () => {
    const sql = readFileSync(RUTA, 'utf-8');
    expect(sql).toContain('ALTER TABLE hato_capturas_foto ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE hato_capturas_foto FROM anon');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE hato_capturas_foto FROM authenticated');
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]{0,120}FOR DELETE/);
  });

  it('es aditiva: no altera ni borra nada preexistente', () => {
    const sql = readFileSync(RUTA, 'utf-8');
    // Solo se permiten ALTER/DROP sobre la tabla nueva (RLS + política
    // idempotente). Cualquier otro objeto sería alcance ajeno.
    const peligrosas = sql
      .split('\n')
      .filter((l) => /^\s*(ALTER TABLE|DROP |UPDATE |DELETE FROM|TRUNCATE)/i.test(l))
      .filter((l) => !/hato_capturas_foto/i.test(l));
    expect(peligrosas).toEqual([]);
  });
});
