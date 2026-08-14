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
  textoCeldaEstadoRegistrado,
  type FilaPlanillaChequeo,
} from '@/utils/hato/exportarPlanillaChequeo';
import {
  etiquetaSexoCria,
  construirFilasPlanillaPDF,
  textoCeldaNumero,
  hayNumerosProvisionales,
  construirDocumentoPlanillaChequeoPDF,
  ANCHOS_COLUMNAS_PDF_MM,
  ANCHO_UTIL_CARTA_HORIZONTAL_MM,
  COLUMNAS_A_DILIGENCIAR,
  COLUMNAS_PRELLENADAS,
  INDICES_COLUMNAS_A_DILIGENCIAR,
  FUENTE_DATOS_PT,
  ALTO_MINIMO_FILA_MM,
  NOTA_OPERATIVA_PLANILLA,
  MARGENES_PDF_MM,
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
    estadoRegistrado: overrides.estadoRegistrado ?? null,
    estado: overrides.estado ?? null,
    secar: overrides.secar ?? null,
    partoProbable: overrides.partoProbable ?? null,
    tratamiento: overrides.tratamiento ?? null,
  };
}

describe('etiquetaSexoCria (D-E: el PDF imprime lenguaje claro, no el código crudo)', () => {
  // Desde el 2026-08-14 esta etiqueta lleva SÓLO EL SEXO, por decisión del
  // dueño viendo la planilla impresa ("reduce sexo cría a la mitad, sólo
  // necesitamos que quepa Macho/Hembra o M/H"). Antes combinaba sexo + destino
  // + chapeta de la cría, y por eso era la columna más ancha de la hoja.
  // El destino y la chapeta NO se pierden: siguen en `hato_eventos` y en el
  // `.xlsx`, que emite `sx_raw` verbatim. Ver la nota de la función.

  it('macho -> "Macho", con o sin destino (el destino ya no se imprime)', () => {
    expect(
      etiquetaSexoCria({ sexoCria: 'macho', criaDestino: 'macho_vendido', sexoCriaRaw: 'OV' }),
    ).toBe('Macho');
    expect(etiquetaSexoCria({ sexoCria: 'macho', criaDestino: null, sexoCriaRaw: 'OV' })).toBe('Macho');
  });

  it('hembra -> "Hembra", y la chapeta de la cría ya NO va al papel', () => {
    expect(
      etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'retenida', sexoCriaRaw: 'A 206' }),
    ).toBe('Hembra');
    expect(
      etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'hembra_vendida', sexoCriaRaw: 'AV' }),
    ).toBe('Hembra');
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'muerta', sexoCriaRaw: 'A+' })).toBe(
      'Hembra',
    );
    expect(etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: null, sexoCriaRaw: null })).toBe('Hembra');
  });

  // Los tres casos SIN sexo no se borran junto con el destino: hubo un hecho
  // real y una celda vacía diría "no hay dato". Van en una palabra corta para
  // no volver a ensanchar la columna.
  it('cría muerta SIN sexo legible -> "Murió" (`cria_destino=muerta` viene tanto de A+ como de O+)', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'muerta', sexoCriaRaw: null })).toBe('Murió');
  });

  it('destino conocido pero sexo no determinable -> "Cría": hubo cría, no se le inventa sexo', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'retenida', sexoCriaRaw: 'A 206' })).toBe('Cría');
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'hembra_vendida', sexoCriaRaw: null })).toBe('Cría');
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: 'macho_vendido', sexoCriaRaw: null })).toBe('Cría');
  });

  it('parto gemelar (`gem+`): no hay sexo de cada gemelo, pero el hecho SÍ es dato -> "Gemelar"', () => {
    expect(etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: 'gem+' })).toBe('Gemelar');
  });

  it('"Gemelar" es la etiqueta más larga y por eso fija el ancho de la columna', () => {
    const todas = [
      etiquetaSexoCria({ sexoCria: 'hembra', criaDestino: 'retenida', sexoCriaRaw: 'A 206' }),
      etiquetaSexoCria({ sexoCria: 'macho', criaDestino: 'macho_vendido', sexoCriaRaw: 'OV' }),
      etiquetaSexoCria({ sexoCria: null, criaDestino: 'muerta', sexoCriaRaw: null }),
      etiquetaSexoCria({ sexoCria: null, criaDestino: 'retenida', sexoCriaRaw: 'A 206' }),
      etiquetaSexoCria({ sexoCria: null, criaDestino: null, sexoCriaRaw: 'gem+' }),
    ].filter((e): e is string => e !== null);
    // Ninguna supera 7 caracteres: es lo que permite que la columna quepa en
    // 14,5mm en vez de los 25,5 que necesitaba `H retenida #206`.
    expect(Math.max(...todas.map((e) => e.length))).toBe('Gemelar'.length);
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
        estadoRegistrado: 'Servida',
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
      'Servida',
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
    expect(celdas.slice(2)).toEqual(['', '', '', '', '', '', '', '', '', '', '']);
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

  it('los márgenes no bajan del piso imprimible (el presupuesto de ancho NO protege esto)', () => {
    // El test de arriba compara la suma de anchos contra `ANCHO_UTIL_CARTA_
    // HORIZONTAL_MM`, que a su vez SE DERIVA de `MARGENES_PDF_MM`. O sea que
    // encoger el margen sube el techo y el test sigue pasando: es
    // autorreferencial en ese eje y no puede atrapar "los márgenes quedaron
    // más chicos de lo que una impresora puede imprimir".
    //
    // Pasó de verdad al meter la 13ª columna ("Estado registrado", D-E): los
    // márgenes bajaron de 10mm a 8mm y quedaron 0,2mm de holgura. 8mm sigue
    // por encima del área no imprimible típica (~5mm, hasta 6,35mm en las
    // más restrictivas), pero es el piso: por debajo, la planilla sale
    // cortada en el papel aunque el PDF se vea bien en pantalla.
    const PISO_IMPRIMIBLE_MM = 8;
    expect(MARGENES_PDF_MM.left).toBeGreaterThanOrEqual(PISO_IMPRIMIBLE_MM);
    expect(MARGENES_PDF_MM.right).toBeGreaterThanOrEqual(PISO_IMPRIMIBLE_MM);
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
    // "Estado registrado" (D-E, B5.4) es la más nueva de este grupo: gris,
    // de solo referencia, nadie la diligencia -- la columna de al lado
    // ("Estado") sigue siendo la que Martha verifica.
    expect([...COLUMNAS_PRELLENADAS].sort()).toEqual(
      ['#', '# Partos', 'Estado registrado', 'Nombre', 'Parto Probable', 'Secar', 'Última Cría'].sort(),
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

  it('la letra de los datos no baja de 9pt, y el alto de fila deja espacio para escribir', () => {
    // Este test pedía >=11pt hasta el 2026-08-14, por un requisito explícito
    // del dueño. Lo REVOCÓ él mismo viendo la planilla de 13 columnas
    // renderizada ("el texto está muy grande, se puede condensar para abrir
    // espacio"): a 11pt la planilla estaba sobre-suscrita y lo pagaban las dos
    // columnas que se escriben a mano. Ver la nota de `FUENTE_DATOS_PT`.
    //
    // El piso pasa a 9pt, y sigue siendo un piso de verdad: por debajo la
    // planilla deja de leerse en el corral, que es la razón original de la
    // regla y no cambió. Si hiciera falta más espacio, la salida es una página
    // más o una columna menos -- nunca letra más chica.
    expect(FUENTE_DATOS_PT).toBeGreaterThanOrEqual(9);
    // El alto NO es cuestión de que quepa el texto impreso sino la MANO de
    // Martha: se queda en 9mm aunque la letra bajara, así que ahora hay más
    // espacio libre dentro del recuadro, no menos.
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
      // El caso más largo NO es la chapeta más alta del corpus (442) sino un
      // número provisional CON su marca: `999*`. Se deriva de la función real.
      '#': textoCeldaNumero(999),
      Nombre: 'BRILLANTINA',
      PL: '18',
      '# Partos': '12',
      'Última Cría': '22/12/2026',
      // Derivada de la función REAL, nunca un literal: si alguien cambia la
      // redacción de la etiqueta, el ancho requerido se recalcula solo y este
      // test sigue midiendo la salida verdadera. Con un literal, la etiqueta y
      // su presupuesto de ancho se desincronizan en silencio (pasó al acortar
      // la etiqueta el 2026-07-29: el fixture seguía pidiendo 43,86mm).
      'Sexo cría': etiquetaSexoCria({
        sexoCria: 'hembra',
        criaDestino: 'retenida',
        sexoCriaRaw: 'A 206',
      })!,
      'Fecha Servicio': '22/12/2026',
      Toro: 'Ins Holstein',
      // "Confirmada" es la más larga de las 5 etiquetas del vocabulario de
      // D-D -- derivada de la función REAL (`textoCeldaEstadoRegistrado`),
      // mismo criterio que 'Sexo cría' arriba: nunca un literal desincronizable.
      'Estado registrado': textoCeldaEstadoRegistrado('preñada')!,
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

describe('números provisionales (800-999): la planilla NUNCA los presenta como caravana física', () => {
  it('marca el número provisional con asterisco y conserva el número (sigue siendo el ancla de fila del OCR)', () => {
    expect(textoCeldaNumero(984)).toBe('984*');
    expect(textoCeldaNumero(800)).toBe('800*');
    expect(textoCeldaNumero(999)).toBe('999*');
  });

  it('un número real sale limpio, sin marca', () => {
    expect(textoCeldaNumero(154)).toBe('154');
    expect(textoCeldaNumero(799)).toBe('799');
  });

  it('sin caravana -> celda vacía, nunca "0" ni "sin número"', () => {
    expect(textoCeldaNumero(null)).toBe('');
  });

  it('la nota al pie solo aparece si la planilla LLEVA alguna fila provisional', () => {
    const camila = fila({ numero: 154, nombre: 'CAMILA' });
    const ricarena = fila({ numero: 88, nombre: 'RICARENA' });
    const fabiola = fila({ numero: 984, nombre: 'FABIOLA' });
    expect(hayNumerosProvisionales([camila, ricarena])).toBe(false);
    expect(hayNumerosProvisionales([camila, fabiola])).toBe(true);
    // Una vaca sin caravana tampoco dispara la nota: "sin número" no es lo
    // mismo que "número provisional".
    expect(hayNumerosProvisionales([{ ...camila, numero: null }])).toBe(false);
  });

  it('la marca llega a la celda armada de la fila', () => {
    expect(construirFilasPlanillaPDF([fila({ numero: 986, nombre: 'MONA' })])[0][0]).toBe('986*');
  });
});

describe('construirDocumentoPlanillaChequeoPDF -- documento real con jspdf + jspdf-autotable', () => {
  /** 35 vacas activas: el universo real de la planilla (D-A del plan).
   *
   * Las etiquetas de `Sexo cría` se DERIVAN de `etiquetaSexoCria`, nunca se
   * escriben a mano: se intercala la más larga (`retenida` con chapeta) con una
   * corta para que la medición de páginas refleje el peor caso REAL. Con
   * literales, este fixture medía una etiqueta que la función ya no produce y
   * el conteo de páginas dejaba de significar nada. */
  const etiquetaLarga = etiquetaSexoCria({
    sexoCria: 'hembra',
    criaDestino: 'retenida',
    sexoCriaRaw: 'A 206',
  })!;
  const etiquetaCorta = etiquetaSexoCria({
    sexoCria: 'macho',
    criaDestino: 'macho_vendido',
    sexoCriaRaw: 'OV',
  })!;
  const filas35: FilaPlanillaChequeo[] = Array.from({ length: 35 }, (_, i) =>
    fila({
      numero: 100 + i,
      nombre: i % 2 === 0 ? 'BRILLANTINA' : 'MONA',
      pl: 18,
      numPartos: 4,
      ultimaCria: '22/7/2026',
      sexoCria: i % 3 === 0 ? etiquetaLarga : etiquetaCorta,
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
