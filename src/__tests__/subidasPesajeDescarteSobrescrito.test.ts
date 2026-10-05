// Descartar una subida de pesaje NO puede borrar litros que otra subida
// sobrescribió. El commit de pesaje (`hato-pesaje-pipeline.ts`) hace
// UPDATE-por-id sobre una fila que ya existe, y el UPDATE no mueve
// `created_at`: la fila se queda ligada a la subida que la INSERTÓ aunque sus
// litros sean ya los de la subida posterior.
//
// Caso vivo (producción, 2026-10-05): la subida del 2026-10-01 (septiembre,
// Telegram) escribió 94 filas y solo creó 60 — las otras 34 eran filas del
// 2026-09-02 y 2026-09-09 creadas por la subida del 2026-09-19. Descartar la
// del 19 borraba esas 34 filas con los litros del 1 de octubre; descartar la
// del 1 de octubre dejaba las 34 con valores de una subida descartada.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ligarFilasASubidas,
  motivoBloqueoDescarte,
  type CapturaSubida,
  type FilaSubida,
} from '@/utils/hato/subidasPesajeMes';

const T19 = Date.parse('2026-09-19T16:02:02.000Z');
const T01 = Date.parse('2026-10-01T19:20:34.000Z');

function captura(parcial: Partial<CapturaSubida> & Pick<CapturaSubida, 'id' | 'creadoEn'>): CapturaSubida {
  return {
    anio: 2026,
    mes: 9,
    createdBy: 'user-1',
    origen: 'telegram',
    desenlace: 'ok',
    storageBucket: 'hato-pesajes-fotos',
    storageRutas: ['pesaje-foto/a/pagina-1.jpg'],
    storageOk: true,
    ...parcial,
  };
}

function fila(id: string, instante: number, fecha: string): FilaSubida {
  return { id, created_at: new Date(instante).toISOString(), fecha, created_by: 'user-1', fuente: 'telegram' };
}

const del19 = captura({ id: 'c-19', creadoEn: new Date(T19).toISOString(), filasEscritas: 3 });
const del01 = captura({ id: 'c-01', creadoEn: new Date(T01).toISOString(), filasEscritas: 4 });
// c-19 creó f1..f3; c-01 creó f4, f5 y ACTUALIZÓ f1, f2 (4 escritas, 2 propias).
const filas = [
  fila('f1', T19 + 1000, '2026-09-02'),
  fila('f2', T19 + 1000, '2026-09-02'),
  fila('f3', T19 + 1000, '2026-09-09'),
  fila('f4', T01 + 1000, '2026-09-16'),
  fila('f5', T01 + 1000, '2026-09-23'),
];

describe('descartar una subida cuyas filas otra subida sobrescribió', () => {
  const ligadas = ligarFilasASubidas([del19, del01], filas);

  it('la liga sigue por created_at: c-19 se queda con f1..f3', () => {
    expect(ligadas.find((s) => s.captura.id === 'c-19')?.filaIds).toEqual(['f1', 'f2', 'f3']);
    expect(ligadas.find((s) => s.captura.id === 'c-01')?.filaIds).toEqual(['f4', 'f5']);
  });

  it('bloquea descartar la subida anterior: borraría litros de la posterior', () => {
    expect(motivoBloqueoDescarte(ligadas, 'c-19')).toMatch(/subida posterior/);
  });

  it('bloquea descartar la subida posterior: sus actualizaciones no se revierten', () => {
    expect(motivoBloqueoDescarte(ligadas, 'c-01')).toMatch(/actualizó 2 pesajes/);
  });

  it('no bloquea cuando cada subida escribió solo las filas que creó', () => {
    const limpias = ligarFilasASubidas(
      [captura({ id: 'c-19', creadoEn: new Date(T19).toISOString(), filasEscritas: 3 }),
        captura({ id: 'c-01', creadoEn: new Date(T01).toISOString(), filasEscritas: 2 })],
      filas,
    );
    expect(motivoBloqueoDescarte(limpias, 'c-19')).toBeNull();
    expect(motivoBloqueoDescarte(limpias, 'c-01')).toBeNull();
  });

  it('un OCR fallido (filas_escritas NULL, sin litros) siempre se puede descartar', () => {
    const fallo = captura({
      id: 'c-fallo',
      creadoEn: new Date(T19 + 13 * 3600 * 1000).toISOString(),
      desenlace: 'ocr_fallo',
      origen: 'web',
      filasEscritas: null,
    });
    const conFallo = ligarFilasASubidas([del19, fallo, del01], filas);
    expect(motivoBloqueoDescarte(conFallo, 'c-fallo')).toBeNull();
  });

  it('una subida posterior que no escribió nada no bloquea a la anterior', () => {
    const vacia = ligarFilasASubidas(
      [captura({ id: 'c-19', creadoEn: new Date(T19).toISOString(), filasEscritas: 3 }),
        captura({ id: 'c-01', creadoEn: new Date(T01).toISOString(), filasEscritas: null, desenlace: 'pendiente' })],
      filas.slice(0, 3),
    );
    expect(motivoBloqueoDescarte(vacia, 'c-19')).toBeNull();
  });
});

describe('el hook consulta el bloqueo antes de borrar nada', () => {
  const fuente = readFileSync(
    join(__dirname, '..', 'components', 'hato', 'hooks', 'useSubidasPesajeMes.ts'),
    'utf8',
  );

  it('lee filas_escritas de hato_capturas_foto', () => {
    expect(fuente).toMatch(/SELECT_CAPTURA\s*=[\s\S]*filas_escritas/);
  });

  it('el bloqueo va antes del borrado de la foto y de los litros', () => {
    const cuerpo = fuente.slice(fuente.indexOf('const descartar = useCallback'));
    expect(cuerpo).toContain('bloqueos.get(capturaId)');
    expect(cuerpo).toContain('.remove(rutas)');
    expect(cuerpo).toContain(".from('hato_pesajes_leche')");
    const bloqueo = cuerpo.indexOf('bloqueos.get(capturaId)');
    expect(bloqueo).toBeLessThan(cuerpo.indexOf('.remove(rutas)'));
    expect(bloqueo).toBeLessThan(cuerpo.indexOf(".from('hato_pesajes_leche')"));
  });
});
