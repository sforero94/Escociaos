import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { VENTANA_CAPTURA_MS } from '@/utils/hato/detallePesajeSemanal';
import {
  ligarFilasASubidas,
  mesesAlrededor,
  subidasDelMes,
  textoDescartarSubida,
  type CapturaSubida,
  type FilaSubida,
} from '@/utils/hato/subidasPesajeMes';
import { ListaSubidasMes, filasVisibles } from '@/components/hato/components/SubidasPesajeMes';

const T0 = Date.parse('2026-09-02T15:00:00.000Z');

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

function fila(parcial: Partial<FilaSubida> & Pick<FilaSubida, 'id' | 'created_at'>): FilaSubida {
  return {
    fecha: '2026-09-02',
    created_by: 'user-1',
    fuente: 'telegram',
    ...parcial,
  };
}

describe('ligar filas a una subida', () => {
  it('incluye el borde de 36 h y deja fuera un milisegundo más', () => {
    const subida = captura({ id: 'c1', creadoEn: new Date(T0).toISOString() });
    const dentro = fila({ id: 'f1', created_at: new Date(T0 + VENTANA_CAPTURA_MS).toISOString(), fecha: '2026-09-02' });
    const fuera = fila({ id: 'f2', created_at: new Date(T0 + VENTANA_CAPTURA_MS + 1).toISOString(), fecha: '2026-09-09' });
    const ligadas = ligarFilasASubidas([subida], [dentro, fuera]);
    expect(ligadas[0].filaIds).toEqual(['f1']);
    expect(ligadas[0].desde).toBe('2026-09-02');
    expect(ligadas[0].hasta).toBe('2026-09-02');
  });

  it('una fila queda en la subida más cercana, no en las dos', () => {
    const temprana = captura({ id: 'c-temprana', creadoEn: new Date(T0).toISOString() });
    const tardia = captura({ id: 'c-tardia', creadoEn: new Date(T0 + 2 * 60 * 60 * 1000).toISOString() });
    const propia = fila({
      id: 'f-tardia',
      created_at: new Date(T0 + 2 * 60 * 60 * 1000).toISOString(),
      fecha: '2026-09-16',
    });
    const ligadas = ligarFilasASubidas([temprana, tardia], [propia]);
    const deLaTardia = ligadas.find((s) => s.captura.id === 'c-tardia');
    const deLaTemprana = ligadas.find((s) => s.captura.id === 'c-temprana');
    expect(deLaTardia?.filaIds).toEqual(['f-tardia']);
    expect(deLaTemprana?.filaIds).toEqual([]);
  });

  it('en empate de tiempo gana el desenlace ok', () => {
    const fallo = captura({ id: 'c-fallo', creadoEn: new Date(T0).toISOString(), desenlace: 'ocr_fallo' });
    const ok = captura({ id: 'c-ok', creadoEn: new Date(T0).toISOString(), desenlace: 'ok' });
    const propia = fila({ id: 'f1', created_at: new Date(T0).toISOString() });
    const ligadas = ligarFilasASubidas([fallo, ok], [propia]);
    expect(ligadas.find((s) => s.captura.id === 'c-ok')?.filaIds).toEqual(['f1']);
    expect(ligadas.find((s) => s.captura.id === 'c-fallo')?.filaIds).toEqual([]);
  });

  it('una fila a mano no se liga', () => {
    const subida = captura({ id: 'c1', creadoEn: new Date(T0).toISOString() });
    const manual = fila({ id: 'f-web', created_at: new Date(T0).toISOString(), fuente: 'web' });
    expect(ligarFilasASubidas([subida], [manual])[0].filaIds).toEqual([]);
  });

  it('el mes vecino se considera al ligar y no se lista', () => {
    expect(mesesAlrededor(2026, 1).map((m) => m.mes)).toEqual([12, 1, 2]);
    const agosto = captura({ id: 'ago', anio: 2026, mes: 8, creadoEn: new Date(T0).toISOString() });
    const septiembre = captura({
      id: 'sep',
      anio: 2026,
      mes: 9,
      creadoEn: new Date(T0 + 60 * 60 * 1000).toISOString(),
    });
    const deAgosto = fila({ id: 'f-ago', created_at: new Date(T0).toISOString(), fecha: '2026-08-26' });
    const delMes = subidasDelMes(ligarFilasASubidas([agosto, septiembre], [deAgosto]), 2026, 9);
    expect(delMes.map((s) => s.captura.id)).toEqual(['sep']);
    expect(delMes[0].filaIds).toEqual([]);
  });

  it('el texto nombra los litros o dice que no hay', () => {
    expect(textoDescartarSubida(0, null, null)).toContain('No hay litros ligados');
    expect(textoDescartarSubida(2, '2 sep 2026', '16 sep 2026')).toContain('2 pesajes (2 sep 2026 a 16 sep 2026)');
    expect(textoDescartarSubida(2, '2 sep 2026', '16 sep 2026')).toContain('Las otras subidas del mes quedan');
  });
});

describe('lista de subidas del mes', () => {
  const subida = captura({
    id: 'c1',
    creadoEn: '2026-09-02T15:00:00.000Z',
    origen: 'telegram',
    desenlace: 'ocr_fallo',
    storageRutas: ['pesaje-foto/a/pagina-1.jpg', 'pesaje-foto/a/pagina-2.jpg'],
  });

  it('muestra foto, autor, estado y rango, y el descarte en rojo', () => {
    const visibles = filasVisibles(
      ligarFilasASubidas([subida], []),
      new Map([['user-1', 'Fernando Jimenez']]),
      { 'c1:pesaje-foto/a/pagina-1.jpg': 'https://ejemplo.test/mini.jpg' },
    );
    const html = renderToStaticMarkup(
      <ListaSubidasMes subidas={visibles} puedeGerencia descartando={false} onDescartar={() => undefined} />,
    );
    expect(html).toContain('https://ejemplo.test/mini.jpg');
    expect(html).toContain('Subió Fernando Jimenez');
    expect(html).toContain('Desde Telegram');
    expect(html).toContain('Falló el OCR');
    expect(html).toContain('Sin litros ligados');
    expect(html).toContain('2 fotos');
    expect(html).toContain('Descartar esta subida');
    expect(html).toContain('border-red-600');
    expect(html).toContain('text-red-600');
  });

  it('sin Gerencia no ofrece descartar', () => {
    const visibles = filasVisibles(ligarFilasASubidas([subida], []), new Map(), {});
    const html = renderToStaticMarkup(
      <ListaSubidasMes subidas={visibles} puedeGerencia={false} descartando={false} onDescartar={() => undefined} />,
    );
    expect(html).toContain('Sin autor registrado');
    expect(html).not.toContain('Descartar esta subida');
  });

  it('la semana no descarta y la página de producción lista las subidas', () => {
    const dialogo = readFileSync(join(__dirname, '../components/hato/components/DetallePesajeSemanalDialog.tsx'), 'utf8');
    const pagina = readFileSync(join(__dirname, '../components/hato/ProduccionView.tsx'), 'utf8');
    const hook = readFileSync(join(__dirname, '../components/hato/hooks/useSubidasPesajeMes.ts'), 'utf8');
    const semana = readFileSync(join(__dirname, '../components/hato/hooks/useDetallePesajeSemana.ts'), 'utf8');
    expect(dialogo).not.toContain('Descartar esta subida');
    expect(dialogo).not.toContain('Borrar este pesaje');
    expect(pagina).toContain('<SubidasPesajeMes');
    expect(hook).toContain(".from(BUCKET_PESAJES).remove(");
    expect(hook).toContain('fetchAll');
    expect(hook).toContain('siguen');
    expect(hook).not.toContain('pesajeLeche');
    expect(semana).not.toMatch(/\.remove\s*\(/);
    const sql = readFileSync(join(__dirname, '../sql/migrations/171_descartar_subida_pesaje.sql'), 'utf8');
    expect(sql).toContain('GRANT DELETE ON TABLE public.hato_capturas_foto TO authenticated');
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE)\b/);
    expect(sql).toContain("get_user_role()) = 'Gerencia'");
  });
});
