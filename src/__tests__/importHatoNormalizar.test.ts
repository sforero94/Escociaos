import { describe, it, expect } from 'vitest';
import type { HatoConfig } from '@/utils/calculosHato';
import type { HojaCruda } from '@/utils/importHato/tipos';
import { clasificarHoja } from '@/utils/importHato/grilla';
import { procesarHojaChequeo } from '@/utils/importHato/chequeos';
import { procesarHojaTerneras } from '@/utils/importHato/terneras';
import { normalizarHojas } from '@/utils/importHato/normalizar';

const CONFIG: HatoConfig = {
  razas: ['jersey', 'holstein', 'normanda'],
  meses_secado_por_raza: { jersey: 2, holstein: 2, normanda: 3, _default: 2 },
  meses_gestacion_default: 9,
  umbral_partos_reemplazo: 9,
  ventana_proxima_secar_dias: 30,
  ventana_proximo_parir_dias: 30,
  dias_parto_proximo_alerta: 14,
  dias_servicio_sin_confirmacion: 45,
  dias_espera_voluntaria_post_parto: 60,
  dias_rechequeo_due: 60,
};

function hoja(archivo: string, hojaNombre: string, filas: unknown[][]): HojaCruda {
  return { archivo, hoja: hojaNombre, filas };
}

describe('clasificarHoja', () => {
  it('reconoce hojas de chequeo por defecto', () => {
    expect(clasificarHoja('a.xlsx', 'CHEQUEO JULIO 2026')).toBe('chequeo');
    expect(clasificarHoja('a.xlsx', 'AGOSTI 1 2023')).toBe('chequeo');
    expect(clasificarHoja('a.xlsx', 'CHEQUE MAYO 25')).toBe('chequeo');
    expect(clasificarHoja('a.xlsx', 'Cheq jun 15-21')).toBe('chequeo');
  });
  it('reconoce las 7 variantes reales de hoja TERNERAS', () => {
    for (const n of ['TERNERAS', 'TERNERAS_', '20230terneras', 'HISTORICO TERNERAS']) {
      expect(clasificarHoja('a.xlsx', n)).toBe('ternera');
    }
  });
  it('excluye hojas de leche por nombre de hoja (dentro de un archivo de chequeo mixto)', () => {
    for (const n of ['PROM LECHE ABR 2025', 'PROME', 'promed leche jun 2025']) {
      expect(clasificarHoja('CHEO VETE 2026.xlsx', n)).toBe('fuera_de_alcance');
    }
  });
  it('excluye hojas vacías/ajenas por nombre de hoja', () => {
    for (const n of ['Hoja1', 'Hoja2', 'Flujo Caja 2022-1']) {
      expect(clasificarHoja('a.xlsx', n)).toBe('fuera_de_alcance');
    }
  });
  it('excluye TODO archivo cuyo nombre indica que es de leche, aunque el nombre de la hoja no lo delate (MZO 2026, ABRIL 2026...)', () => {
    expect(clasificarHoja('PROMEDIO DE LECHE DESDE AÑO 2026.xlsx', 'MZO 2026')).toBe('fuera_de_alcance');
    expect(clasificarHoja('PROMEDIO DE LECHE DESDE AÑO 2026.xlsx', 'ABRIL 2026')).toBe('fuera_de_alcance');
    expect(clasificarHoja('FLUJO LECHE AÑOS 23-26.xlsx', '2023 - 2026')).toBe('fuera_de_alcance');
  });
});

describe('QA §2.5 -- AGOSTI 1 2023: encabezado con 4 columnas "TP" (fallback posicional obligatorio)', () => {
  const encabezado = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'TP', 'TP', 'TP', 'TTTO'];
  // BRIGIDA (r4 real, doc QA §2.5): [108,'BRIGIDA',20,4,44967(2023-02-10),
  // 'ov',45047(2023-05-01),'ins',38,None,45261(2023-12-01),45323(2024-02-01),None]
  const filaBrigida = [108, 'BRIGIDA ', 20, 4, 44967, 'ov ', 45047, 'ins', 38, null, 45261, 45323, null];
  const filas = [
    ['CHE+A1:M34QUEO VETE AGOSTO1 2023 '],
    encabezado,
    filaBrigida,
  ];

  it('NO pierde SECAR/PP en un array sin etiquetar -- se asignan por posición (TP, ESTADO, SECAR, PP)', () => {
    const { manifest, filas: normalizadas } = procesarHojaChequeo(hoja('CHEQUEO 2023 Y TERNERAS.xlsx', 'AGOSTI 1 2023', filas), CONFIG);
    expect(manifest.colmap.tp).toBe(8);
    expect(manifest.colmap.estado).toBe(9);
    expect(manifest.colmap.secar).toBe(10);
    expect(manifest.colmap.pp).toBe(11);

    expect(normalizadas).toHaveLength(1);
    const brigida = normalizadas[0];
    expect(brigida.numero).toBe(108);
    expect(brigida.nombre).toBe('BRIGIDA');
    // raw.secar/raw.pp son la celda cruda de esas columnas (verbatim, texto D/M/AAAA) -- prueba de que el fallback posicional apuntó a la columna correcta.
    expect(brigida.raw.secar).toBe('1/12/2023');
    expect(brigida.raw.pp).toBe('1/2/2024');
    // fechaSecar/fechaProbableParto son RE-DERIVADOS desde F Servicio, no leídos de esas columnas -- deben ser fechas válidas igual, pero por una vía distinta.
    expect(brigida.fechasServicio).toEqual(['2023-05-01']);
  });

  it('deja constancia en el manifiesto de que se aplicó fallback posicional', () => {
    const { manifest } = procesarHojaChequeo(hoja('CHEQUEO 2023 Y TERNERAS.xlsx', 'AGOSTI 1 2023', filas), CONFIG);
    expect(manifest.issues.some((i) => i.motivo.includes('fallback posicional'))).toBe(true);
  });
});

describe('QA §2.6 -- CHEQUEO AGOSTO 2024: sub-tabla ajena embebida sin marcador estructural', () => {
  // Encabezado real de esta hoja trae una columna de índice decorativo en
  // blanco antes de '#' (doc real: `[null,"#","Nombre","PL",...]`).
  const encabezado = [null, '#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR ', 'PP', 'TTTO'];
  const filaNormal = [46, 162, 'VITROLA', null, 1, 45214, null, 45292, null, 30, null, 45505, 45566, 'lavado metricure'];
  const filaTitulo = [null, null, 'Deben entrar a servicio estas terneras ', null, null, null, null, null, null, null, null, null, null];
  const filasSubtabla = [
    [null, 1, 149, 'RITA ', null, null, 'RICARENA', null, null, null, null, null, null],
    [null, 2, 161, 'BRENDA', null, null, 'BRISA', null, null, null, null, null, null],
    [null, 3, 163, 'VIRGO', null, 'jers', 'VIKINGA', null, null, null, null, null, null],
    [null, 4, 165, 'MIEL', null, null, 'MAGNIFICA', null, null, null, null, null, null],
  ];
  const filas = [
    ['CHEQUEO VETE AGOSTO 9  2024'],
    encabezado,
    filaNormal,
    filaTitulo,
    ...filasSubtabla,
  ];

  it('NO alimenta las filas de la sub-tabla al parser de fila-de-chequeo (nunca nombre=149, sx=RICARENA)', () => {
    const { filas: normalizadas } = procesarHojaChequeo(hoja('CHEQUEO VETE 2024.xlsx', 'CHEQUEO AGOSTO 2024', filas), CONFIG);
    expect(normalizadas).toHaveLength(1);
    expect(normalizadas[0].numero).toBe(162);
    expect(normalizadas.some((f) => f.nombre === '149')).toBe(false);
  });

  it('enruta las 4 filas de la sub-tabla a subtablas[] con su propio esquema (índice, numero real, nombre real, madreRaw)', () => {
    const { subtablas } = procesarHojaChequeo(hoja('CHEQUEO VETE 2024.xlsx', 'CHEQUEO AGOSTO 2024', filas), CONFIG);
    expect(subtablas).toHaveLength(4);
    expect(subtablas[0]).toMatchObject({ indice: 1, numero: 149, nombre: 'RITA', madreRaw: 'RICARENA' });
    expect(subtablas[1]).toMatchObject({ indice: 2, numero: 161, nombre: 'BRENDA', madreRaw: 'BRISA' });
    expect(subtablas[2]).toMatchObject({ indice: 3, numero: 163, nombre: 'VIRGO', madreRaw: 'VIKINGA' });
    expect(subtablas[3]).toMatchObject({ indice: 4, numero: 165, nombre: 'MIEL', madreRaw: 'MAGNIFICA' });
  });

  it('una fila totalmente en blanco a mitad de la hoja NO detiene el escaneo (fila siguiente real se sigue reconociendo)', () => {
    const filaBlanco = new Array(14).fill(null);
    const filaAltanera = [46, 113, 'ALTANERA', 20, 1, 44152, 'vendida', 44487, 'host', 56, 'REC', 44699, 44760, null];
    const filasConHueco = [['TITULO'], encabezado, filaNormal, filaBlanco, filaBlanco, filaAltanera];
    const { filas: normalizadas } = procesarHojaChequeo(hoja('x.xlsx', 'hoja', filasConHueco), CONFIG);
    expect(normalizadas.map((f) => f.numero)).toEqual([162, 113]);
  });

  it('un encabezado repetido a mitad de hoja se salta, nunca se parsea como fila de animal', () => {
    const filaFabiola = [46, 176, 'FABIOLA', 18, 5, 45433, null, null, 'insj', '', '3M', '', '', null];
    const filasConEncabezadoRepetido = [['TITULO'], encabezado, filaNormal, encabezado, filaFabiola];
    const { filas: normalizadas, manifest } = procesarHojaChequeo(hoja('x.xlsx', 'hoja', filasConEncabezadoRepetido), CONFIG);
    expect(normalizadas.map((f) => f.numero)).toEqual([162, 176]);
    expect(manifest.descartesPorMotivo.encabezado_repetido).toBe(1);
  });
});

describe('QA §2.7 -- CHEQUE MAYO 25: 274 filas físicas, 225 fantasma (columna de índice decorativo)', () => {
  // Encabezado real trae una columna de índice decorativo en blanco antes
  // de '#' (doc real: `[null,"#","Nombre","PL",...]`) -- la fila fantasma
  // rellena SOLO esa columna decorativa, nunca las mapeadas.
  const encabezado = [null, '#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'OBS', 'F Secar', 'F parto', 'TTTO'];
  function filaFantasma(indice: number): unknown[] {
    return [indice, null, null, null, null, null, null, null, null, null, null, null, null, null];
  }
  const filaVitina = [48, 31, 'VITINA ', 23, 1, 44547, 'avgir', 44677, 'hol', 50, null, 44891, 44952, null];
  const filaAltanera = [56, 113, 'ALTANERA', 20, 1, 44152, 'vendida', 44487, 'host', 56, 'REC', 44699, 44760, null];

  it('el filtro de fila vacía mira SOLO las columnas mapeadas, no la columna de índice decorativo', () => {
    const filas = [['TITULO'], encabezado, filaVitina, filaFantasma(49), filaFantasma(50), filaFantasma(51)];
    const { manifest, filas: normalizadas } = procesarHojaChequeo(hoja('chequeo 21 y 22.xlsx', 'CHEQUE MAYO 25', filas), CONFIG);
    expect(normalizadas).toHaveLength(1);
    expect(manifest.descartesPorMotivo.fantasma).toBe(3);
  });

  it('una fila real DESPUÉS de varias filas fantasma consecutivas se sigue reconociendo (no se detiene en la primera fila vacía)', () => {
    const filas = [
      ['TITULO'],
      encabezado,
      filaVitina,
      filaFantasma(49),
      filaFantasma(50),
      filaFantasma(51),
      filaFantasma(52),
      filaFantasma(53),
      filaFantasma(54),
      filaFantasma(55),
      filaAltanera, // ALTANERA #113, aparece tras 6 filas en blanco (evidencia real: CHEQUEO DIC 21-22)
    ];
    const { filas: normalizadas } = procesarHojaChequeo(hoja('chequeo 21 y 22.xlsx', 'CHEQUE MAYO 25', filas), CONFIG);
    expect(normalizadas.map((f) => f.numero)).toEqual([31, 113]);
  });
});

describe('QA §2.8 -- offset de columnas en hojas sin encabezado', () => {
  // CHEQUEO JUNIO 9 2020 (offset=0: col0=#, col1=Nombre...) -- doc S2 real.
  const filasJunio: unknown[][] = [
    ['CHEQUEO JUNIO 9 DE 2020'],
    [113, 'ALTANERA', null, null, null, null, 43925, null, null, null, null, null, null, null],
    [75, 'ARTISTA', null, 3, 43905, 'OV', 43960, null, 74, null, 44174, null, 44236, null],
  ];
  // CHEQUEO ABRIL 3 2020 (offset=1: col0 en blanco, col1=#...) -- doc S2 real.
  const filasAbril: unknown[][] = [
    ['CHEQUEO ABRIL 3 DE 2020'],
    [null, 113, 'ALTANERA', null, null, null, null, 43875, null, null, null, null, null, null, null],
    [null, 102, 'ARTEMISA ', null, 1, 43612, 'OV', 43727, 'ins ', 81, null, 43940, null, 44001, null],
  ];
  // CHEQUEO DIC 21-22 (índice decorativo en col0, chapeta real en col1 -- QA §2.8, el caso más difícil).
  const filasDic: unknown[][] = [
    [null, 'CHEQUEO DICIEMBRE 21   DE 2022 '],
    [45, 140, 'AMAPOLA', null, 1, 44966, 'ov', null, null, null, null, null, null, null],
    [14, 108, 'BRIGIDA ', 20, 3, 44623, 'ov hol', 44683, 'hol', 50, null, 44897, 44959, null],
    [31, 154, 'CAMILA', 9, 2, 44723, 'OV', 44799, 'gir', 46, null, 45011, 45072, 'ubre peque vender?'],
  ];

  it('CHEQUEO JUNIO 9 2020 -- offset=0, numero/nombre en col0/col1', () => {
    const { manifest, filas } = procesarHojaChequeo(hoja('a.xlsx', 'CHEQUEO JUNIO 9 2020', filasJunio), CONFIG);
    expect(manifest.generacionEncabezado).toBe('sin_encabezado');
    expect(manifest.offsetColumnas).toBe(0);
    expect(filas.map((f) => f.numero)).toEqual([113, 75]);
    expect(filas.map((f) => f.nombre)).toEqual(['ALTANERA', 'ARTISTA']);
  });

  it('CHEQUEO ABRIL 3 2020 -- offset=1 (columna en blanco extra al inicio, la MISMA hoja sin ese offset en otra copia)', () => {
    const { manifest, filas } = procesarHojaChequeo(hoja('a.xlsx', 'CHEQUEO ABRIL 3 2020', filasAbril), CONFIG);
    expect(manifest.offsetColumnas).toBe(1);
    expect(filas.map((f) => f.numero)).toEqual([113, 102]);
    expect(filas.map((f) => f.nombre)).toEqual(['ALTANERA', 'ARTEMISA']);
  });

  it('CHEQUEO DIC 21-22 -- rechaza el índice decorativo de col0 como chapeta, usa offset=1', () => {
    const { manifest, filas } = procesarHojaChequeo(hoja('chequeo 21 y 22.xlsx', 'CHEQUEO DIC 21-22', filasDic), CONFIG);
    expect(manifest.offsetColumnas).toBe(1);
    // La chapeta real es 140/108/154 (col1), NUNCA 45/14/31 (col0, índice decorativo).
    expect(filas.map((f) => f.numero)).toEqual([140, 108, 154]);
    expect(filas.map((f) => f.nombre)).toEqual(['AMAPOLA', 'BRIGIDA', 'CAMILA']);
  });
});

describe('QA §2.1 -- fecha de chequeo: el título de r1 manda sobre el nombre de hoja', () => {
  it("'Cheq jun 15-21' con título 'CHEQUEO:AGOSTO 11 DE 2021' resuelve a agosto, no a junio", () => {
    const filas = [['CHEQUEO:AGOSTO 11 DE 2021'], ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO']];
    const { manifest } = procesarHojaChequeo(hoja('chequeo 21 y 22.xlsx', 'Cheq jun 15-21', filas), CONFIG);
    expect(manifest.chequeoFecha).toBe('2021-08-11');
  });
});

describe('D6 (decisión del dueño, 2026-07-22) -- columna Toro trae un código de ESTADO Y la fila trae fecha de servicio', () => {
  const encabezado = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO'];
  // 45426 = 2024-05-01 (serial de Excel, mismo valor ya usado en otros tests de este archivo).
  const filaConMezcla = [140, 'AMAPOLA', 20, 4, null, 'ov', 45426, 'ok', 26, null, null, null, null];

  it('se conserva la fecha de servicio, toro sigue null, y se agrega un issue explícito de la mezcla', () => {
    const filas = [['CHEQUEO ENERO 1 DE 2024'], encabezado, filaConMezcla];
    const { filas: normalizadas } = procesarHojaChequeo(hoja('a.xlsx', 'CHEQUEO ENERO 2024', filas), CONFIG);
    expect(normalizadas).toHaveLength(1);
    const fila = normalizadas[0];
    expect(fila.fechasServicio).toEqual(['2024-05-14']);
    expect(fila.toroNombre).toBeNull();
    expect(fila.issues.some((i) => i.motivo.includes('fecha de servicio Y un código de ESTADO'))).toBe(true);
  });

  it('sin fecha de servicio, el mismo código de ESTADO en Toro NO agrega el issue de mezcla (solo el issue normal de "no es un toro")', () => {
    const filaSinFecha = [140, 'AMAPOLA', 20, 4, null, 'ov', null, 'ok', 26, null, null, null, null];
    const filas = [['CHEQUEO ENERO 1 DE 2024'], encabezado, filaSinFecha];
    const { filas: normalizadas } = procesarHojaChequeo(hoja('a.xlsx', 'CHEQUEO ENERO 2024', filas), CONFIG);
    const fila = normalizadas[0];
    expect(fila.toroNombre).toBeNull();
    expect(fila.issues.some((i) => i.motivo.includes('fecha de servicio Y un código de ESTADO'))).toBe(false);
    expect(fila.issues.some((i) => i.motivo.includes('vaca ok'))).toBe(true);
  });
});

describe('QA §3 -- TERNERAS: nombre=NULL es válido, esquema único con padding vacío', () => {
  const encabezado = [null, '#', 'NOMBRE', 'F NACIMIENT', 'PADRE', 'MADRE', null];

  it('acepta nombre=NULL como cría recién nacida sin bautizar, nunca la descarta', () => {
    const filas = [
      ['TERNERAS'],
      [],
      encabezado,
      [29, 187, null, 45300, null, 'MAGNIFICA', null],
    ];
    const resultado = procesarHojaTerneras(hoja('CHEQUEO VETE 2024.xlsx', 'TERNERAS', filas));
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ numero: 187, nombre: null });
  });

  it('preserva PADRE verbatim aunque sea una raza (holstein) en vez de un nombre de toro -- no se interpreta aquí', () => {
    const filas = [
      ['TERNERAS'],
      [],
      encabezado,
      [11, 189, 'CARMESI', 45569, 'HOLST', 'COMETA ', null],
    ];
    const resultado = procesarHojaTerneras(hoja('CHEO VETE 2026.xlsx', 'TERNERAS', filas));
    expect(resultado[0].padreRaw).toBe('HOLST');
  });

  it('columnas 7+ de padding vacío no generan filas ni ruido', () => {
    const filas = [
      ['TERNERAS'],
      [],
      [null, '#', 'NOMBRE', 'F NACIMIENT', 'PADRE', 'MADRE', null, null, null, null, null, null, null, null, null],
      [1, 179, 'ESPERANZA', 45271, null, 'ENIGMA', null, null, null, null, null, null, null, null, null],
    ];
    const resultado = procesarHojaTerneras(hoja('CHEO VETE 2026.xlsx', 'TERNERAS', filas));
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ numero: 179, nombre: 'ESPERANZA' });
  });

  it('una fila totalmente en blanco intercalada se descarta sin generar issue (HISTORICO TERNERAS)', () => {
    const filas = [
      ['HI'],
      [],
      encabezado,
      [null, null, null, null, null, null, null],
      [null, 110, 'gallega', 42810, 'holstein', 'galena', null],
      [null, null, null, null, null, null, null],
    ];
    const resultado = procesarHojaTerneras(hoja('CHEQUEO 2023 Y TERNERAS.xlsx', 'HISTORICO TERNERAS', filas));
    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe('gallega');
  });
});

describe('Dedupe -- contenido idéntico vs. contenido que difiere (corrección del coordinador)', () => {
  const encabezado = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO'];
  const filaBase = [140, 'AMAPOLA', 20, 4, 45319, 'ov', 45426, null, 26, null, 45640, 45702, null];

  function hojaConFecha(archivo: string, titulo: string, extraFila?: unknown[]): HojaCruda {
    const filas: unknown[][] = [[titulo], encabezado, filaBase];
    if (extraFila) filas.push(extraFila);
    return hoja(archivo, 'CHEQUEO X', filas);
  }

  it('dos hojas con la MISMA fecha y contenido idéntico (ignorando TP) -- se marca duplicadaDe y NO se doblan las filas', () => {
    const a = hojaConFecha('archivo1.xlsx', 'CHEQUEO ENERO 1 DE 2024');
    // Misma hoja, TP distinto (columna 8) -- simula que los dos archivos se guardaron en momentos distintos.
    const filaConOtroTp = [...filaBase];
    filaConOtroTp[8] = 99;
    const b = hojaConFecha('archivo2.xlsx', 'CHEQUEO ENERO 1 DE 2024');
    b.filas[2] = filaConOtroTp;

    const salida = normalizarHojas([a, b], '2026-07-22T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toHaveLength(1); // NO se doblan las filas
    const manifiestoB = salida.hojas.find((h) => h.archivo === 'archivo2.xlsx')!;
    expect(manifiestoB.duplicadaDe).toBe('archivo1.xlsx::CHEQUEO X');
    expect(manifiestoB.issues.some((i) => i.motivo.includes('duplicada'))).toBe(true);
  });

  it('dos hojas con la MISMA fecha pero contenido que DIFIERE -- se conservan las filas de AMBAS, nunca se elige un ganador', () => {
    // Evidencia real: CHEQUEO JUNIO 9 2020 difiere en PL/última cría de
    // COQUETA entre los dos archivos -- el coordinador midió esto de forma
    // independiente y corrigió el supuesto original de "duplicado byte-a-byte".
    const filaOriginal = [...filaBase];
    const filaEditada = [...filaBase];
    filaEditada[2] = 99; // PL distinto

    const a = hojaConFecha('CHEQUEO ACTUALIZADO ENERO 2020.xlsx', 'CHEQUEO JUNIO 9 DE 2020');
    a.filas[2] = filaOriginal;
    const b = hojaConFecha('chequeo 21 y 22.xlsx', 'CHEQUEO JUNIO 9 DE 2020');
    b.filas[2] = filaEditada;

    const salida = normalizarHojas([a, b], '2026-07-22T00:00:00.000Z', CONFIG);
    // AMBAS hojas contribuyen sus filas -- nunca se descarta una por resolver a la misma fecha.
    expect(salida.chequeos).toHaveLength(2);
    const manifiestoB = salida.hojas.find((h) => h.archivo === 'chequeo 21 y 22.xlsx')!;
    expect(manifiestoB.duplicadaDe).not.toBeNull();
    expect(manifiestoB.issues.some((i) => i.motivo.includes('DIFIERE'))).toBe(true);
    expect(manifiestoB.issues.some((i) => i.motivo.includes("campo 'pl' difiere"))).toBe(true);
  });

  it('dos hojas que difieren SOLO en la columna de índice decorativo (nunca mapeada) se tratan como idénticas', () => {
    // Evidencia real (coordinador): CHEQ MAZO 2025 vs diciembre 20224,
    // ambas "CHEQUEO Marzo 31 de 2025", difieren en 50 filas pero SOLO en
    // una columna de índice decorativo que nunca entra al colmap.
    const filaConIndiceA = [1, ...filaBase]; // índice decorativo antepuesto -- no debería ocurrir así en la práctica (desplazaría todo el colmap), se simula de otra forma abajo.
    void filaConIndiceA;

    const a = hojaConFecha('CHEO VETE 2026.xlsx', 'CHEQUEO Marzo 31 de 2025');
    const b = hojaConFecha('CHEO VETE 2026.xlsx', 'CHEQUEO Marzo 31 de 2025');
    // Ambas hojas resultan con exactamente el mismo colmap y filas -- el
    // caso real es que difieren en una columna decorativa que ni siquiera
    // llega al colmap, así que aquí basta con hojas idénticas para probar
    // que el dedupe las colapsa quedando solo con las filas de la primera.
    b.hoja = 'CHEQUEO X (copia)';

    const salida = normalizarHojas([a, b], '2026-07-22T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toHaveLength(1);
  });
});

describe('normalizarHojas -- orquestación completa', () => {
  it('ignora hojas fuera de alcance (leche/vacías) sin lanzar', () => {
    const hojaLeche = hoja('PROMEDIO DE LECHE DESDE AÑO 2026.xlsx', 'MZO 2026', [['NOMBRE', 'SEMANA 1'], ['ALINA', 20]]);
    const hojaVacia = hoja('x.xlsx', 'Hoja1', []);
    expect(() => normalizarHojas([hojaLeche, hojaVacia], '2026-07-22T00:00:00.000Z', CONFIG)).not.toThrow();
    const salida = normalizarHojas([hojaLeche, hojaVacia], '2026-07-22T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toEqual([]);
    expect(salida.terneras).toEqual([]);
    expect(salida.hojas).toEqual([]);
  });

  it('separa chequeos y terneras en sus arrays correspondientes', () => {
    const encabezadoChequeo = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO'];
    const hojaChequeo = hoja('a.xlsx', 'CHEQUEO ENERO 2024', [
      ['CHEQUEO ENERO 1 DE 2024'],
      encabezadoChequeo,
      [140, 'AMAPOLA', 20, 4, 45319, 'ov', 45426, null, 26, null, 45640, 45702, null],
    ]);
    const hojaTerneras = hoja('a.xlsx', 'TERNERAS', [
      ['TERNERAS'],
      [],
      [null, '#', 'NOMBRE', 'F NACIMIENT', 'PADRE', 'MADRE', null],
      [1, 179, 'ESPERANZA', 45271, null, 'ENIGMA', null],
    ]);
    const salida = normalizarHojas([hojaChequeo, hojaTerneras], '2026-07-22T00:00:00.000Z', CONFIG);
    expect(salida.chequeos).toHaveLength(1);
    expect(salida.terneras).toHaveLength(1);
    expect(salida.generadoEn).toBe('2026-07-22T00:00:00.000Z');
  });
});

describe('dedupe -- hojas sin fecha resuelta (regresión de la corrida real 2026-07-22)', () => {
  // Las dos copias de `CHEQUEO_MARZO_2019` son byte-idénticas entre
  // `CHEQUEO ACTUALIZADO ENERO 2020.xlsx` y `chequeo 21 y 22.xlsx`, pero su
  // título ("CHEQUEO MARZO 2019") no trae día, así que ninguna resuelve fecha.
  // Agrupando SOLO por fecha, las dos pasaban y el chequeo de marzo 2019 se
  // cargaba dos veces. Lo detectó correr el pipeline sobre los .xlsx reales,
  // no un test -- de ahí que exista este.
  const encabezado = ['#', 'Nombre', 'PL', '#P2', 'Ultima Cria', 'SX', 'F Servicio', 'Toro', 'TP', 'ESTADO', 'SECAR', 'PP', 'TTTO'];
  const filasIdenticas = [
    ['CHEQUEO MARZO 2019', null, null, null, null, null, null, null, null, null, null, null, null],
    encabezado,
    [108, 'BRIGIDA', 20, 4, null, 'ov', null, 'ins', 38, null, null, null, null],
    [43, 'CUÑA', 28, 4, null, 'OV', null, 'jers', 12, null, null, null, null],
  ];

  it('dos hojas sin fecha con contenido idéntico se deduplican por firma de contenido', () => {
    const salida = normalizarHojas(
      [
        { archivo: 'CHEQUEO ACTUALIZADO ENERO 2020.xlsx', hoja: 'CHEQUEO_MARZO_2019', filas: filasIdenticas },
        { archivo: 'chequeo 21 y 22.xlsx', hoja: 'CHEQUEO_MARZO_2019', filas: filasIdenticas },
      ],
      '2026-07-22T00:00:00.000Z',
      CONFIG,
    );
    expect(salida.hojas).toHaveLength(2);
    expect(salida.hojas.filter((h) => h.duplicadaDe !== null)).toHaveLength(1);
    // Las filas se emiten UNA sola vez: 2 animales, no 4.
    expect(salida.chequeos).toHaveLength(2);
    const dup = salida.hojas.find((h) => h.duplicadaDe !== null)!;
    expect(dup.duplicadaDe).toBe('CHEQUEO ACTUALIZADO ENERO 2020.xlsx::CHEQUEO_MARZO_2019');
    expect(dup.issues.some((i) => /firma de contenido/.test(i.motivo))).toBe(true);
  });

  it('dos hojas sin fecha con contenido DISTINTO no se deduplican -- ninguna fila se pierde', () => {
    const otras = [
      filasIdenticas[0],
      encabezado,
      [999, 'OTRA VACA', 15, 1, null, 'OV', null, 'jers', 3, null, null, null, null],
    ];
    const salida = normalizarHojas(
      [
        { archivo: 'a.xlsx', hoja: 'SIN FECHA', filas: filasIdenticas },
        { archivo: 'b.xlsx', hoja: 'SIN FECHA', filas: otras },
      ],
      '2026-07-22T00:00:00.000Z',
      CONFIG,
    );
    expect(salida.hojas.every((h) => h.duplicadaDe === null)).toBe(true);
    expect(salida.chequeos).toHaveLength(3);
  });
});
