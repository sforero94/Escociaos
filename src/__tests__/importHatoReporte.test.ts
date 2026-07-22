import { describe, it, expect } from 'vitest';
import { resolverIdentidadHato } from '@/utils/importHato/resolver';
import { generarResolutionReport } from '@/utils/importHato/reporte';
import { FIXTURE_NORMALIZADO } from './fixtures/importHatoNormalizado.fixture';

describe('reporte.ts -- resolution-report.md (S3)', () => {
  const resultado = resolverIdentidadHato(FIXTURE_NORMALIZADO, '2026-07-22T00:00:00.000Z');
  const md = generarResolutionReport(resultado);

  it('es una función pura: la misma entrada produce el mismo markdown', () => {
    expect(generarResolutionReport(resultado)).toBe(md);
  });

  // Se matchea por el TEXTO de la sección, no por su número: el número cambia
  // cada vez que se inserta una sección nueva y eso no debe romper un test.
  it('ordena las secciones: lo que bloquea primero, las decisiones ya tomadas después, el resumen automático al final', () => {
    const idxDecisiones = md.indexOf('Decisiones que bloquean la carga');
    const idxTomadas = md.indexOf('Decisiones ya tomadas por el dueño');
    const idxResumenAuto = md.indexOf('Lo que el sistema resolvió solo');
    expect(idxDecisiones).toBeGreaterThan(-1);
    expect(idxTomadas).toBeGreaterThan(idxDecisiones);
    expect(idxResumenAuto).toBeGreaterThan(idxTomadas);
  });

  it('D5: los cierres presuntos se resuelven solos -- aparecen en el resumen automático, no como pregunta abierta', () => {
    expect(md).toContain('Lo que el sistema resolvió solo');
    const idxResumenAuto = md.indexOf('Lo que el sistema resolvió solo');
    const idxCierre = md.indexOf('Numero 111 (PIONERA)');
    expect(idxCierre).toBeGreaterThan(idxResumenAuto);
  });

  it('D8: la venta inferida de CHISPA (899, sin match en este fixture) aparece en el resumen automático', () => {
    expect(md).toContain('CHISPA');
    expect(md).toContain('899');
  });

  it('documenta ambas colisiones vigentes (162 y 175) con sus desempates provisionales', () => {
    // Tras la decisión del 2026-07-22 ya no BLOQUEAN, pero siguen siendo
    // provisionales: tienen que aparecer con nombre, número de trabajo y el
    // aviso de que la chapeta física quedó sin dueño.
    expect(md).toContain('Chapeta 162 (según la planilla)');
    expect(md).toContain('Chapeta 175 (según la planilla)');
    expect(md).toContain('ESMERALDA');
    expect(md).toContain('VITROLA');
    expect(md).toContain('999');
    expect(md).toContain('998');
  });

  it('avisa que los números provisionales no son chapetas físicas', () => {
    expect(md).toContain('Ninguno de los números de esta sección es una chapeta física real.');
    expect(md).toContain('no salgas a buscar la');
  });

  it('con todas las colisiones cubiertas, declara 0 decisiones bloqueantes y no dice que esté bloqueada', () => {
    expect(md).toContain('Decisiones que TODAVÍA bloquean la carga: 0');
    expect(md).not.toContain('La carga está BLOQUEADA.');
  });

  it('incluye la sección de nombre bajo varios números (FABIOLA)', () => {
    expect(md).toContain('FABIOLA');
    expect(md).toContain('300, 301');
  });

  it('nunca omite una fila sin número: la lista de comentarios aparece en el reporte', () => {
    expect(md).toContain('VENDIDAS CORNELIA Y COQUETA');
  });

  it('no revienta con un resultado vacío (sin colisiones, sin animales)', () => {
    const vacio = resolverIdentidadHato(
      { generadoEn: 'x', hojas: [], chequeos: [], terneras: [], subtablas: [] },
      '2026-01-01T00:00:00.000Z',
    );
    const mdVacio = generarResolutionReport(vacio);
    expect(mdVacio).toContain('No queda ninguna colisión vigente sin resolver');
    expect(typeof mdVacio).toBe('string');
  });
});
