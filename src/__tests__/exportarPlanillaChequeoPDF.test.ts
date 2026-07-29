// ARCHIVO: __tests__/exportarPlanillaChequeoPDF.test.ts
// DESCRIPCIÓN: Fase 2 de `docs/plan_chequeo_captura_foto.md` -- el PDF
// IMPRIMIBLE de la planilla de chequeo. Cubre:
//
//   1. `etiquetaSexoCria` -- todas las ramas de la tabla de decisión (D-E del
//      plan), incluido el caso "sin sexo y sin destino -> celda VACÍA", que es
//      el contrato "sin dato, nunca 0" del módulo.
//   2. `construirFilasPlanillaPDF` -- el armado de filas: orden idéntico al
//      del template y `null -> ''`.
//   3. El presupuesto de layout (anchos vs. ancho útil de carta horizontal) y
//      la clasificación exhaustiva de columnas: si mañana alguien agrega una
//      columna a `ENCABEZADOS_PLANILLA_CHEQUEO`, estos tests fallan antes de
//      que salga un PDF con una columna sin clasificar o desbordada.
//   4. El documento REAL armado con jspdf + jspdf-autotable (inyectadas, mismo
//      patrón que el test hermano inyecta `xlsx`): 35 filas caben en 2 páginas
//      a 11pt y el pie dice "Página 1 de 2".

import { describe, it, expect } from 'vitest';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ENCABEZADOS_PLANILLA_CHEQUEO,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';
import {
  etiquetaSexoCria,
  construirFilasPlanillaPDF,
  construirDocumentoPlanillaChequeoPDF,
  ANCHOS_COLUMNAS_PDF_MM,
  ANCHO_UTIL_CARTA_HORIZONTAL_MM,
  COLUMNAS_A_DILIGENCIAR,
  COLUMNAS_PRELLENADAS,
  INDICES_COLUMNAS_A_DILIGENCIAR,
  FUENTE_DATOS_PT,
  ALTO_MINIMO_FILA_MM,
  NOTA_OPERATIVA_PLANILLA,
} from '@/utils/hato/exportarPlanillaChequeoPDF';

function fila(overrides: Partial<FilaPlanillaChequeo> & { numero: number; nombre: string }): FilaPlanillaChequeo {
  return {
    numero: overrides.numero,
    nombre: overrides.nombre,
    pl: overrides.pl ?? null,
    numPartos: overrides.numPartos ?? null,
    ultimaCria: overrides.ultimaCria ?? null,
    sexoCria: overrides.sexoCria ?? null,
    fechaServicio: overrides.fechaServicio ?? null,
    toro: overrides.toro ?? null,
    estado: overrides.estado ?? null,
    secar: overrides.secar ?? null,
    partoProbable: overrides.partoProbable ?? null,
    tratamiento: overrides.tratamiento ?? null,
  };
}

describe('etiquetaSexoCria (D-E: el PDF imprime lenguaje claro, no el código crudo)', () => {
  it('macho vendido -> "Macho (vendido)" (el crudo era `OV`)', () => {
    expect(
      etiquetaSexoCria({ sexoCria: 'macho', criaDestino: 'macho_vendido', sexoCriaRaw: 'OV' }),
    ).toBe('Macho (vendido)');
  });

  it('hembra retenida con chapeta -> "Hembra (retenida #206)" (el crudo era `A 206`)', () => {
    expect(
      etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'retenida', sexoCriaRaw: 'A 206' }),
    ).toBe('Hembra (retenida #206)');
  });

  it('hembra retenida SIN número en la celda SX -> omite la chapeta, jamás la inventa', () => {
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'retenida', sexoCriaRaw: 'A' })).toBe(
      'Hembra (retenida)',
    );
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'retenida', sexoCriaRaw: null })).toBe(
      'Hembra (retenida)',
    );
  });

  it('hembra vendida -> "Hembra (vendida)" (el crudo era `AV`)', () => {
    expect(
      etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'hembra_vendida', sexoCriaRaw: 'AV' }),
    ).toBe('Hembra (vendida)');
  });

  it('cría muerta CON sexo legible (`A+` -> la letra sí dice hembra) -> "Hembra (murió)"', () => {
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'muerta', sexoCriaRaw: 'A+' })).toBe(
      'Hembra (murió)',
    );
    expect(etiquetaSexoCria({ sexoCria: 'macho', criaDestino: 'muerta', sexoCriaRaw: 'O+' })).toBe(
      'Macho (murió)',
    );
  });

  it('cría muerta SIN sexo legible -> "Cría muerta" (es el caso real: `cria_destino=muerta` viene tanto de A+ como de O+)', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'muerta', sexoCriaRaw: null })).toBe(
      'Cría muerta',
    );
  });

  it('sexo conocido pero destino sin registrar -> solo el sexo (es dato real, no se rellena el resto)', () => {
    expect(etiquetaSexoCria({ sexoCria: 'macho', criaDestino: null, sexoCriaRaw: 'OV' })).toBe('Macho');
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: null, sexoCriaRaw: null })).toBe('Hembra');
  });

  it('destino conocido pero sexo no determinable -> se describe la cría sin inventarle sexo', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'retenida', sexoCriaRaw: 'A 206' })).toBe(
      'Cría retenida #206',
    );
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'hembra_vendida', sexoCriaRaw: null })).toBe(
      'Cría vendida',
    );
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'macho_vendido', sexoCriaRaw: null })).toBe(
      'Cría vendido',
    );
  });

  it('parto gemelar (`gem+`): no hay sexo de cada gemelo, pero el hecho SÍ es dato -> "Parto gemelar"', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: 'gem+' })).toBe(
      'Parto gemelar',
    );
  });

  it('aborto: no hay cría que describir -> celda VACÍA', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'aborto', sexoCriaRaw: 'aborto' })).toBeNull();
  });

  it('REGLA DURA: sin sexo y sin destino -> null (celda vacía), nunca "N/D" ni un texto inventado', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: null })).toBeNull();
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: '' })).toBeNull();
    // Código SX no reconocido (nombre de vaca mal digitado en la columna):
    // `parseSX` lo deja en `desconocido` y aquí no se adivina nada.
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: 'LUCERO' })).toBeNull();
    // `Mv` = marca personal de Martha, sin significado para el sistema.
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: 'Mv' })).toBeNull();
  });

  it('la etiqueta legible NUNCA es el código crudo -- el .xlsx sigue siendo el artefacto re-parseable', () => {
    const etiqueta = etiquetaSexoCria({ sexoCria: 'macho', criaDestino: 'macho_vendido', sexoCriaRaw: 'OV' });
    expect(etiqueta).not.toBe('OV');
  });
});

describe('construirFilasPlanillaPDF', () => {
  it('respeta el orden de ENCABEZADOS_PLANILLA_CHEQUEO y produce una celda por columna', () => {
    const filas = construirFilasPlanillaPDF([
      fila({
        numero: 157,
        nombre: 'ALINA',
        pl: 18,
        numPartos: 4,
        ultimaCria: '22/7/2026',
        sexoCria: 'Hembra (retenida #206)',
        fechaServicio: '5/1/2026',
        toro: 'Ins Nitro',
        estado: 'ok',
        secar: '1/9/2026',
        partoProbable: '1/11/2026',
        tratamiento: 'Estrumate',
      }),
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toHaveLength(ENCABEZADOS_PLANILLA_CHEQUEO.length);
    expect(filas[0]).toEqual([
      '157',
      'ALINA',
      '18',
      '4',
      '22/7/2026',
      'Hembra (retenida #206)',
      '5/1/2026',
      'Ins Nitro',
      'ok',
      '1/9/2026',
      '1/11/2026',
      'Estrumate',
    ]);
  });

  it('null -> celda vacía (nunca "0", nunca "N/D") -- contrato "sin dato" del módulo', () => {
    const [celdas] = construirFilasPlanillaPDF([fila({ numero: 101, nombre: 'LUCERO' })]);
    expect(celdas[0]).toBe('101');
    expect(celdas[1]).toBe('LUCERO');
    // Todo lo demás sin dato previo: vacío, no cero.
    expect(celdas.slice(2)).toEqual(['', '', '', '', '', '', '', '', '', '']);
    expect(celdas).not.toContain('0');
  });

  it('un 0 REAL sí se imprime como "0" -- vacío y cero no se confunden en ninguna dirección', () => {
    const [celdas] = construirFilasPlanillaPDF([fila({ numero: 101, nombre: 'LUCERO', numPartos: 0 })]);
    expect(celdas[3]).toBe('0');
  });
});

describe('layout del PDF -- presupuesto de ancho y clasificación de columnas', () => {
  it('hay un ancho por columna del template, y la suma cabe en el ancho útil de carta HORIZONTAL', () => {
    expect(ANCHOS_COLUMNAS_PDF_MM).toHaveLength(ENCABEZADOS_PLANILLA_CHEQUEO.length);
    const suma = ANCHOS_COLUMNAS_PDF_MM.reduce((a, b) => a + b, 0);
    expect(suma).toBeLessThanOrEqual(ANCHO_UTIL_CARTA_HORIZONTAL_MM);
    // Y no cabría en vertical (215,9 − 20 = 195,9mm útiles): de ahí el
    // requisito de orientación horizontal, no es una preferencia estética.
    expect(suma).toBeGreaterThan(215.9 - 20);
  });

  it('TODA columna del template está clasificada como "se diligencia" o "pre-llenada", sin solapamiento', () => {
    const total = COLUMNAS_A_DILIGENCIAR.size + COLUMNAS_PRELLENADAS.length;
    expect(total).toBe(ENCABEZADOS_PLANILLA_CHEQUEO.length);
    for (const encabezado of ENCABEZADOS_PLANILLA_CHEQUEO) {
      const seDiligencia = COLUMNAS_A_DILIGENCIAR.has(encabezado);
      const esPrellenada = COLUMNAS_PRELLENADAS.includes(encabezado);
      expect(seDiligencia !== esPrellenada).toBe(true);
    }
  });

  it('las columnas que Martha escribe son exactamente las que pueden cambiar en un chequeo', () => {
    expect([...COLUMNAS_A_DILIGENCIAR].sort()).toEqual(
      ['Estado', 'Fecha Servicio', 'PL', 'Sexo cría', 'Toro', 'Tratamiento'].sort(),
    );
    // Identidad/referencia: el sistema las calcula, nadie las escribe.
    expect([...COLUMNAS_PRELLENADAS].sort()).toEqual(
      ['#', '# Partos', 'Nombre', 'Parto Probable', 'Secar', 'Última Cría'].sort(),
    );
  });

  it('los índices de columnas a diligenciar apuntan a los encabezados correctos', () => {
    expect(INDICES_COLUMNAS_A_DILIGENCIAR.map((i) => ENCABEZADOS_PLANILLA_CHEQUEO[i])).toEqual([
      'PL',
      'Sexo cría',
      'Fecha Servicio',
      'Toro',
      'Estado',
      'Tratamiento',
    ]);
  });

  it('la letra de los datos es >= 11pt (requisito duro del dueño) y el alto de fila deja espacio para escribir', () => {
    expect(FUENTE_DATOS_PT).toBeGreaterThanOrEqual(11);
    // Una línea de 11pt ocupa ~3,9mm: 9mm de fila dejan ~5mm libres dentro
    // del recuadro para la escritura a mano.
    expect(ALTO_MINIMO_FILA_MM).toBeGreaterThanOrEqual(8);
  });

  it('cada columna es lo bastante ancha para su contenido real a 11pt -- ninguna celda se envuelve', () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(FUENTE_DATOS_PT);
    const PADDING_HORIZONTAL_MM = 3; // 1,5 a cada lado, ver `styles.cellPadding`
    // Contenido más largo esperado por columna, medido con la misma métrica
    // que usa jsPDF al maquetar. Si alguien angosta una columna, esto falla
    // antes de que salga un PDF con dos líneas por celda.
    const contenidoMasLargo: Record<string, string> = {
      '#': '442', // chapeta real más alta del corpus
      Nombre: 'BRILLANTINA',
      PL: '18',
      '# Partos': '12',
      'Última Cría': '22/12/2026',
      'Sexo cría': 'Hembra (retenida #206)',
      'Fecha Servicio': '22/12/2026',
      Toro: 'Ins Holstein',
      Estado: 'rech',
      Secar: '22/12/2026',
      'Parto Probable': '22/12/2026',
      Tratamiento: 'Estrumate',
    };
    ENCABEZADOS_PLANILLA_CHEQUEO.forEach((encabezado, i) => {
      const necesario = doc.getTextWidth(contenidoMasLargo[encabezado]) + PADDING_HORIZONTAL_MM;
      expect(
        ANCHOS_COLUMNAS_PDF_MM[i],
        `la columna "${encabezado}" necesita ${necesario.toFixed(2)}mm`,
      ).toBeGreaterThanOrEqual(necesario);
    });
  });
});

describe('construirDocumentoPlanillaChequeoPDF -- documento real con jspdf + jspdf-autotable', () => {
  /** 35 vacas activas: el universo real de la planilla (D-A del plan). Se
   * intercala la etiqueta LARGA de `Sexo cría` para que la medición de páginas
   * refleje el peor caso realista (esas celdas se envuelven a dos líneas). */
  const filas35: FilaPlanillaChequeo[] = Array.from({ length: 35 }, (_, i) =>
    fila({
      numero: 100 + i,
      nombre: i % 2 === 0 ? 'BRILLANTINA' : 'MONA',
      pl: 18,
      numPartos: 4,
      ultimaCria: '22/7/2026',
      sexoCria: i % 3 === 0 ? 'Hembra (retenida #206)' : 'Macho (vendido)',
      fechaServicio: '5/1/2026',
      toro: 'Ins Nitro',
      estado: 'ok',
      secar: '1/9/2026',
      partoProbable: '1/11/2026',
    }),
  );

  it('carta HORIZONTAL: el ancho de página es mayor que el alto', () => {
    const doc = construirDocumentoPlanillaChequeoPDF(
      { jsPDF, autoTable },
      { tituloDocumento: 'CHEQUEO 29 JULIO 2026', filas: [fila({ numero: 101, nombre: 'LUCERO' })] },
    );
    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();
    expect(ancho).toBeGreaterThan(alto);
    expect(Math.round(ancho)).toBe(279); // carta horizontal
    expect(Math.round(alto)).toBe(216);
  });

  it('35 filas a 11pt caben en 2 páginas (la referencia del dueño)', () => {
    const doc = construirDocumentoPlanillaChequeoPDF(
      { jsPDF, autoTable },
      { tituloDocumento: 'CHEQUEO 29 JULIO 2026', subtitulo: '35 vacas', filas: filas35 },
    );
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('una sola fila cabe en una sola página (no se pagina de más)', () => {
    const doc = construirDocumentoPlanillaChequeoPDF(
      { jsPDF, autoTable },
      { tituloDocumento: 'CHEQUEO 29 JULIO 2026', filas: [fila({ numero: 101, nombre: 'LUCERO' })] },
    );
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('el título va en CADA página, y cada página lleva su "Página i de N" y la regla operativa', () => {
    const doc = construirDocumentoPlanillaChequeoPDF(
      { jsPDF, autoTable },
      { tituloDocumento: 'CHEQUEO 29 JULIO 2026', filas: filas35 },
    );
    // El texto crudo del PDF generado (jsPDF no comprime por defecto) permite
    // verificar lo IMPRESO, no solo que la función no lanzó.
    const contenido = doc.output();
    expect(doc.getNumberOfPages()).toBe(2);
    expect(contenido).toContain('Página 1 de 2');
    expect(contenido).toContain('Página 2 de 2');
    // El título aparece dos veces: una por página.
    expect(contenido.split('CHEQUEO 29 JULIO 2026').length - 1).toBe(2);
    expect(contenido).toContain(NOTA_OPERATIVA_PLANILLA.slice(0, 30));
  });

  it('el encabezado de columnas se repite en la segunda página (showHead: everyPage)', () => {
    const doc = construirDocumentoPlanillaChequeoPDF(
      { jsPDF, autoTable },
      { tituloDocumento: 'CHEQUEO 29 JULIO 2026', filas: filas35 },
    );
    const contenido = doc.output();
    // "Parto Probable" solo existe en la fila de encabezado: si aparece dos
    // veces, el encabezado se dibujó en las dos páginas.
    expect(contenido.split('Probable').length - 1).toBeGreaterThanOrEqual(2);
  });
});
