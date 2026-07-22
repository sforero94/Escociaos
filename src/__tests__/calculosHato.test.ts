import { describe, it, expect } from 'vitest';
import {
  parseFechasServicio,
  parseSX,
  parseFechaChequeo,
  parseValorNumerico,
  parseEstado,
  calcularPartoProbable,
  calcularFechaSecar,
  calcularMesesPrenez,
  descomponerSX,
  derivarEstadoReproductivo,
  calcularProductividad,
  detectarColisionesChapeta,
  type HatoConfig,
  type EstadoActualHatoRow,
} from '@/utils/calculosHato';

/**
 * Fixtures crudas verbatim de las 8 planillas reales del hato (2019-2026),
 * extraídas con openpyxl antes de escribir el motor -- ver el análisis de
 * hallazgos que sustenta S2. Se usan tal cual, sin limpiar, porque ese es
 * precisamente el punto: el motor debe sobrevivir estos valores, no una
 * versión idealizada de ellos.
 */

const CONFIG_BASE: HatoConfig = {
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

describe('parseFechasServicio', () => {
  it('celda vacía o null no produce fechas ni issues', () => {
    expect(parseFechasServicio('')).toEqual({ fechas: [], issues: [] });
    expect(parseFechasServicio(null)).toEqual({ fechas: [], issues: [] });
    expect(parseFechasServicio(undefined)).toEqual({ fechas: [], issues: [] });
  });

  it('nunca lanza para ningún valor crudo real de F Servicio (doc S2 §4)', () => {
    const valores = [
      '20/04/2026/3/06/26',
      '15/05/2025//7/06/2025',
      '30/05/202520/07/2025',
      '18/04/2024/ 8 /05/24 21/06/240',
      '14/03/2024-18/04/24/1/6/24',
      '24/02/2024/2/7/2024',
      '23/04/2024/23/06/24',
      '8/05/2024/29/05/24',
      '14/05/240 11/07/2024',
      '24/02/2021/22/09/21',
      '20/06/2021/5/01/2022',
      '21/06/2021/5/1/2022 ?',
      ' 21/06/24',
      '7/09/230',
      '13/05/019',
      '22/08/20220',
      '14/05/240',
      '21/06/240',
      '15/015/2025',
      'ok',
      'OK',
      '0k',
      'RECH',
      'no serv',
      'vacia',
      'o+',
      'A169',
      'PREÑADA 70%. CRIA 16%. RETRASO 14%',
    ];
    for (const v of valores) {
      expect(() => parseFechasServicio(v)).not.toThrow();
    }
  });

  it('separadores /, //, espacio: extrae 2 fechas limpias', () => {
    expect(parseFechasServicio('20/04/2026/3/06/26').fechas).toEqual(['2026-04-20', '2026-06-03']);
    expect(parseFechasServicio('15/05/2025//7/06/2025').fechas).toEqual(['2025-05-15', '2025-06-07']);
  });

  it('fechas concatenadas sin separador recupera 2 fechas via año+día pegados', () => {
    const r = parseFechasServicio('30/05/202520/07/2025');
    expect(r.fechas).toEqual(['2025-05-30', '2025-07-20']);
  });

  it('hasta 3 servicios en una celda con separadores mixtos (espacio + guion)', () => {
    expect(parseFechasServicio('18/04/2024/ 8 /05/24 21/06/240').fechas).toEqual([
      '2024-04-18',
      '2024-05-08',
      '2024-06-21',
    ]);
    expect(parseFechasServicio('14/03/2024-18/04/24/1/6/24').fechas).toEqual([
      '2024-03-14',
      '2024-04-18',
      '2024-06-01',
    ]);
  });

  it('año de 2 dígitos se interpreta como 20xx', () => {
    expect(parseFechasServicio(' 21/06/24').fechas).toEqual(['2024-06-21']);
    expect(parseFechasServicio('24/02/2021/22/09/21').fechas).toEqual(['2021-02-24', '2021-09-22']);
  });

  it('año de 3 dígitos con cero de más al final se recupera con issue de revisión', () => {
    const r1 = parseFechasServicio('7/09/230');
    expect(r1.fechas).toEqual(['2023-09-07']);
    expect(r1.issues.length).toBeGreaterThan(0);

    const r2 = parseFechasServicio('14/05/240 11/07/2024');
    expect(r2.fechas).toEqual(['2024-05-14', '2024-07-11']);
    expect(r2.issues.some((i) => /240/.test(i.motivo))).toBe(true);

    const r3 = parseFechasServicio('21/06/240');
    expect(r3.fechas).toEqual(['2024-06-21']);
  });

  it("año de 3 dígitos con '2' inicial perdido se recupera con issue de revisión", () => {
    const r = parseFechasServicio('13/05/019');
    expect(r.fechas).toEqual(['2019-05-13']);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('año de 5 dígitos (cero de más) recupera la fecha completa y deja resto como issue', () => {
    const r = parseFechasServicio('22/08/20220');
    expect(r.fechas).toEqual(['2022-08-22']);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('mes inválido (3 dígitos) no produce fecha, queda como issue', () => {
    const r = parseFechasServicio('15/015/2025');
    expect(r.fechas).toEqual([]);
    expect(r.issues.some((i) => /mes/i.test(i.motivo))).toBe(true);
  });

  it('marcador de incertidumbre "?" se conserva como issue sin bloquear las fechas', () => {
    const r = parseFechasServicio('21/06/2021/5/1/2022 ?');
    expect(r.fechas).toEqual(['2021-06-21', '2022-01-05']);
    expect(r.issues.some((i) => i.motivo.includes('?'))).toBe(true);
  });

  it('texto libre sin fecha (ok/RECH/vacia/o+) no produce fecha, sí issue con el crudo intacto', () => {
    for (const v of ['ok', 'OK', 'RECH', 'vacia', 'o+']) {
      const r = parseFechasServicio(v);
      expect(r.fechas).toEqual([]);
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0].crudo).toBe(v);
    }
  });

  it("'no serv' es una afirmación EXPLÍCITA de ausencia -- no genera issue (evidencia QA: NONA, dos hojas distintas)", () => {
    for (const v of ['no serv', 'NO SERV', 'no servicio']) {
      expect(parseFechasServicio(v)).toEqual({ fechas: [], issues: [] });
    }
  });

  it("'A169' y '0k' no forman fecha (dígitos insuficientes/sin triada), quedan como issue", () => {
    expect(parseFechasServicio('A169').fechas).toEqual([]);
    expect(parseFechasServicio('0k').fechas).toEqual([]);
  });

  it("texto con porcentajes ('PREÑADA 70%. CRIA 16%. RETRASO 14%') no produce una fecha inválida", () => {
    const r = parseFechasServicio('PREÑADA 70%. CRIA 16%. RETRASO 14%');
    expect(r.fechas).toEqual([]);
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe('parseSX', () => {
  it('celda vacía => tipo vacio, sin issues (ausencia de dato, nunca "0")', () => {
    expect(parseSX('')).toEqual({ crudo: '', tipo: 'vacio', incierto: false, issues: [] });
    expect(parseSX(null).tipo).toBe('vacio');
  });

  it('familia OV (macho vendido) con variantes de mayúscula/espacio', () => {
    for (const v of ['OV', 'ov', 'o v', 'Ov']) {
      expect(parseSX(v).tipo).toBe('ov');
    }
  });

  it('familia AV (hembra vendida)', () => {
    for (const v of ['AV', 'av', 'Av']) {
      expect(parseSX(v).tipo).toBe('av');
    }
  });

  it('familia A{n} (retenida) extrae el número de cría', () => {
    expect(parseSX('A210').numeroCria).toBe(210);
    expect(parseSX('A 209').numeroCria).toBe(209);
    expect(parseSX('a178').numeroCria).toBe(178);
    expect(parseSX('a 177').numeroCria).toBe(177);
    for (const v of ['A210', 'A 209', 'a178', 'a 177']) {
      expect(parseSX(v).issues).toEqual([]);
    }
  });

  it("caso raro 'A148**151' (dos números): usa el primero, flag del segundo", () => {
    const r = parseSX('A148**151');
    expect(r.tipo).toBe('a_n');
    expect(r.numeroCria).toBe(148);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("'A148**151?' -- mismo caso con marcador de incertidumbre: no elige arbitrariamente, deja ambos candidatos en issues", () => {
    // Evidencia QA: VICTORINA, tres hojas distintas -- no es un caso único.
    const r = parseSX('A148**151?');
    expect(r.tipo).toBe('a_n');
    expect(r.numeroCria).toBe(148);
    expect(r.incierto).toBe(true);
    expect(r.issues.some((i) => /151/.test(i.motivo))).toBe(true);
  });

  it("'A' bare (sin número) es retenida con issue de número faltante", () => {
    const r = parseSX('A');
    expect(r.tipo).toBe('a_n');
    expect(r.numeroCria).toBeUndefined();
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('familia A+/O+ (cría muerta)', () => {
    expect(parseSX('A+').tipo).toBe('a_mas');
    expect(parseSX('a+').tipo).toBe('a_mas');
    expect(parseSX('O+').tipo).toBe('o_mas');
    expect(parseSX('o+').tipo).toBe('o_mas');
  });

  it('aborto explícito: abort, ABORT, aborto, ABORTO, AB', () => {
    for (const v of ['abort', 'ABORT', 'aborto', 'ABORTO', 'AB']) {
      expect(parseSX(v).tipo).toBe('aborto');
    }
  });

  it("'abort 27/09' es aborto con el texto sobrante preservado en un issue", () => {
    const r = parseSX('abort 27/09');
    expect(r.tipo).toBe('aborto');
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('sufijo de raza pegado al código: gir (Gyr) y hol/hlt (Holstein)', () => {
    expect(parseSX('AV guir')).toMatchObject({ tipo: 'av', raza: 'gyr' });
    expect(parseSX('avgir')).toMatchObject({ tipo: 'av', raza: 'gyr' });
    expect(parseSX('a gir')).toMatchObject({ tipo: 'a_n', raza: 'gyr' });
    expect(parseSX('A V GIR')).toMatchObject({ tipo: 'av', raza: 'gyr' });
    expect(parseSX('AGIR')).toMatchObject({ tipo: 'a_n', raza: 'gyr' });
    expect(parseSX('ov gir')).toMatchObject({ tipo: 'ov', raza: 'gyr' });
    expect(parseSX('OV GIR')).toMatchObject({ tipo: 'ov', raza: 'gyr' });
    expect(parseSX('oc gir')).toMatchObject({ tipo: 'ov', raza: 'gyr' });
    expect(parseSX('ov hlt')).toMatchObject({ tipo: 'ov', raza: 'holstein' });
    expect(parseSX('ov hol')).toMatchObject({ tipo: 'ov', raza: 'holstein' });
    expect(parseSX('OV HOL')).toMatchObject({ tipo: 'ov', raza: 'holstein' });
  });

  it("'gir' solo (sin código de evento) es desconocido con la raza detectada", () => {
    const r = parseSX('gir');
    expect(r.tipo).toBe('desconocido');
    expect(r.raza).toBe('gyr');
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("marcadores de incertidumbre '?': A?, A ?, AV ?, ao?", () => {
    expect(parseSX('A?')).toMatchObject({ tipo: 'a_n', incierto: true });
    expect(parseSX('A ?')).toMatchObject({ tipo: 'a_n', incierto: true });
    expect(parseSX('AV ?')).toMatchObject({ tipo: 'av', incierto: true });
    const ao = parseSX('ao?');
    expect(ao.incierto).toBe(true);
    expect(ao.tipo).toBe('desconocido');
  });

  it("'Mv' es la marca personal de Martha: reconocida e ignorada, sin issue (dueño, 2026-07-22)", () => {
    const mv = parseSX('Mv');
    expect(mv.tipo).toBe('mv');
    expect(mv.crudo).toBe('Mv');
    // Ya no es pregunta abierta -- reconocerla sin issue es el punto.
    expect(mv.issues).toEqual([]);
  });

  it("'gem+' es parto GEMELAR (dueño, 2026-07-22)", () => {
    const gem = parseSX('gem+');
    expect(gem.tipo).toBe('gemelar');
    expect(gem.crudo).toBe('gem+');
    expect(gem.issues).toEqual([]);
  });

  it('gemelar genera UN evento de parto con datos.gemelar, y un issue sobre el destino de las crías', () => {
    const r = descomponerSX({ chequeoFecha: '2022-09-06', sx: parseSX('gem+'), fechasServicio: [] });
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0].tipo).toBe('parto');
    expect(r.eventos[0].datos).toEqual({ gemelar: true });
    // El destino de las crías no está en la planilla: se documenta, no se inventa.
    expect(r.eventos[0].cria_destino).toBeUndefined();
    expect(r.issues.some((i) => /GEMELAR/i.test(i.motivo))).toBe(true);
  });

  it('nombres de vaca mal digitados en la columna SX quedan como desconocido, crudo intacto', () => {
    for (const v of ['RICARENA', 'BRISA', 'VIKINGA', 'MAGNIFICA', ', verita']) {
      const r = parseSX(v);
      expect(r.tipo).toBe('desconocido');
      expect(r.crudo).toBe(v);
    }
  });

  it("estado, no evento: 'vacia', 'vendida', '0'", () => {
    expect(parseSX('vacia').tipo).toBe('vacia');
    expect(parseSX('vendida').tipo).toBe('vendida');
    const cero = parseSX('0');
    expect(cero.tipo).toBe('cero');
    expect(cero.issues.length).toBeGreaterThan(0);
  });

  it('nunca lanza para ningún valor crudo real de SX (doc S2 §5)', () => {
    const valores = [
      'OV', 'ov', 'AV', 'av', 'O+', 'o+', 'o v', 'A', 'Mv', 'A136', 'a+', 'A+', 'abort',
      'A210', 'A 209', 'a178', 'a 177', 'A148**151', 'AV guir', 'avgir', 'a gir', 'A V GIR',
      'AGIR', 'ov gir', 'OV GIR', 'oc gir', 'gir', 'ov hlt', 'ov hol', 'OV HOL', '?', 'A?',
      'A ?', 'AV ?', 'ao?', 'vacia', 'vendida', '0', 'RICARENA', 'BRISA', 'VIKINGA',
      'MAGNIFICA', ', verita', 'gem+', 'abort 27/09', 'ABORT', 'ABORTO', 'AB',
    ];
    for (const v of valores) {
      expect(() => parseSX(v)).not.toThrow();
    }
  });
});

describe('parseFechaChequeo', () => {
  it("título completo autosuficiente: 'CHEQUEO SEPTIEMBRE 23 de 2025' / hoja 'CHEQUEO ASEPT 2025'", () => {
    const r = parseFechaChequeo('CHEQUEO SEPTIEMBRE 23 de 2025', 'CHEQUEO ASEPT 2025');
    expect(r.fecha).toBe('2025-09-23');
    expect(r.confianza).toBe('alta');
  });

  it("nombre de hoja no coincide con el título: 'Cheq jun 15-21' / título agosto", () => {
    const r = parseFechaChequeo('CHEQUEO:AGOSTO 11 DE 2021', 'Cheq jun 15-21');
    expect(r.fecha).toBe('2021-08-11');
    expect(r.confianza).toBe('baja');
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("hoja copiada con título duplicado de otro chequeo: 'diciembre 20224' / título marzo", () => {
    const r = parseFechaChequeo('CHEQUEO Marzo 31 de 2025', 'diciembre 20224 ');
    expect(r.fecha).toBe('2025-03-31');
    expect(r.confianza).toBe('baja');
  });

  it("título garabateado sin separadores: 'CHEQUEO VETE ENERO 1702024' -> ene 17 2024", () => {
    const r = parseFechaChequeo('CHEQUEO VETE ENERO 1702024', 'ENERO 2024');
    expect(r.fecha).toBe('2024-01-17');
    expect(r.confianza).toBe('media');
  });

  it("dos fechas en el título: 'CHEQUEO:FEBRERO 9 DE 2021 20 DE 2020'", () => {
    const r = parseFechaChequeo('CHEQUEO:FEBRERO 9 DE 2021 20 DE 2020', 'Chequeo feb 2021');
    expect(r.fecha).toBe('2021-02-09');
    expect(r.issues.some((i) => /adicional/.test(i.motivo))).toBe(true);
  });

  it("sin día en el título: 'CHEQUEO VETE MAYO   2024' cae al día del nombre de hoja", () => {
    const r = parseFechaChequeo('CHEQUEO VETE MAYO   2024', 'CHEQUEO MAYO 20 2024');
    expect(r.fecha).toBe('2024-05-20');
    expect(r.confianza).toBe('media');
  });

  it('nunca lanza y siempre devuelve confianza baja cuando no hay mes reconocible', () => {
    const r = parseFechaChequeo('sin mes aquí', 'tampoco aquí');
    expect(() => r).not.toThrow();
    expect(r.fecha).toBeNull();
    expect(r.confianza).toBe('baja');
  });
});

describe('parseValorNumerico', () => {
  it('número plano', () => {
    expect(parseValorNumerico('12.5')).toEqual({ valor: 12.5, issues: [] });
    expect(parseValorNumerico(12.5)).toEqual({ valor: 12.5, issues: [] });
  });

  it('coma decimal se normaliza a punto', () => {
    expect(parseValorNumerico('12,5').valor).toBe(12.5);
  });

  it('#VALUE! no propaga error, produce null + issue', () => {
    const r = parseValorNumerico('#VALUE!');
    expect(r.valor).toBeNull();
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('texto no numérico produce null + issue, nunca NaN', () => {
    const r = parseValorNumerico('rech');
    expect(r.valor).toBeNull();
    expect(Number.isNaN(r.valor)).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it('celda vacía/null no es un issue -- ausencia de dato', () => {
    expect(parseValorNumerico('')).toEqual({ valor: null, issues: [] });
    expect(parseValorNumerico(null)).toEqual({ valor: null, issues: [] });
    expect(parseValorNumerico(undefined)).toEqual({ valor: null, issues: [] });
  });
});

describe('parseEstado', () => {
  it('celda vacía => tipo vacio, sin issues', () => {
    expect(parseEstado('')).toEqual({ crudo: '', tipo: 'vacio', incierto: false, issues: [] });
    expect(parseEstado(null).tipo).toBe('vacio');
  });

  it("V14 (confirmado por el dueño): 'ok'/'0k'/'OK' es VACÍA NORMAL, no un problema", () => {
    for (const v of ['ok', 'OK', '0k', 'Ok']) {
      const r = parseEstado(v);
      expect(r.tipo).toBe('vacia_apta');
      expect(r.issues).toEqual([]);
    }
  });

  it("'rech'/'rechq'/'rec'/'r' es VACÍA PROBLEMA -- requiere rechequeo", () => {
    for (const v of ['rech', 'RECH', 'rechq', 'rec', 'r']) {
      expect(parseEstado(v).tipo).toBe('vacia_problema');
    }
  });

  it("'r?' es problema con incertidumbre marcada", () => {
    const r = parseEstado('r?');
    expect(r.tipo).toBe('vacia_problema');
    expect(r.incierto).toBe(true);
  });

  it("'ok rech' (2 casos reales, ambas señales en una celda) resuelve a PROBLEMA -- prevalece la señal cautelosa", () => {
    expect(parseEstado('ok rech').tipo).toBe('vacia_problema');
  });

  it('una fecha en ESTADO/OBS (residuo de SEC REAL/parto real de Gen 1) se preserva como fecha_heredada, no como código', () => {
    const casos: Array<[string, string]> = [
      ['2021-10-08', '2021-10-08'],
      ['2019-09-09', '2019-09-09'],
      ['2025-09-23', '2025-09-23'],
      ['**9/09/2019', '2019-09-09'],
      ['30/06//19', '2019-06-30'],
      ['5/10/19 sec', '2019-10-05'],
    ];
    for (const [crudo, esperada] of casos) {
      const r = parseEstado(crudo);
      expect(r.tipo, `crudo: ${crudo}`).toBe('fecha_heredada');
      expect(r.fecha, `crudo: ${crudo}`).toBe(esperada);
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it("códigos no reconocidos ('momia', '3m') quedan como desconocido, nunca se inventa semántica", () => {
    for (const v of ['momia', '3m']) {
      const r = parseEstado(v);
      expect(r.tipo).toBe('desconocido');
      expect(r.issues.length).toBeGreaterThan(0);
    }
  });

  it('nunca lanza para ningún valor crudo real de ESTADO/OBS (doc S2 §7)', () => {
    const valores = [
      'ok', 'OK', '0k', 'rech', 'RECH', '0k', 'r', 'rec', '3m', 'momia', 'rechq', 'ok rech', 'r?',
      '2021-10-08', '2019-09-09', '2025-09-23', '**9/09/2019', '30/06//19', '5/10/19 sec',
      '', null, undefined,
    ];
    for (const v of valores) {
      expect(() => parseEstado(v)).not.toThrow();
    }
  });
});

describe('motor de fechas (calcularPartoProbable / calcularFechaSecar / calcularMesesPrenez)', () => {
  it('PP = servicio + meses_gestacion_default', () => {
    expect(calcularPartoProbable('2024-05-14', CONFIG_BASE)).toBe('2025-02-14');
  });

  it('SECAR se deriva DIRECTO de F Servicio (+7 meses jersey/holstein, +6 normanda), no encadenado sobre PP', () => {
    const fechaServicio = '2024-05-14';
    expect(calcularFechaSecar(fechaServicio, 'jersey', CONFIG_BASE)).toBe('2024-12-14');
    expect(calcularFechaSecar(fechaServicio, 'holstein', CONFIG_BASE)).toBe('2024-12-14');
    expect(calcularFechaSecar(fechaServicio, 'normanda', CONFIG_BASE)).toBe('2024-11-14');
    // normanda debe dar un resultado DISTINTO a jersey/holstein.
    expect(calcularFechaSecar(fechaServicio, 'normanda', CONFIG_BASE)).not.toBe(
      calcularFechaSecar(fechaServicio, 'jersey', CONFIG_BASE),
    );
  });

  it('raza desconocida/nula cae al _default de meses_secado_por_raza', () => {
    const fechaServicio = '2024-05-14';
    expect(calcularFechaSecar(fechaServicio, null, CONFIG_BASE)).toBe('2024-12-14');
    expect(calcularFechaSecar(fechaServicio, 'brahman', CONFIG_BASE)).toBe('2024-12-14');
    expect(calcularFechaSecar(fechaServicio, undefined, CONFIG_BASE)).toBe('2024-12-14');
  });

  it('raza es tolerante a mayúsculas y espacios', () => {
    const fechaServicio = '2024-05-14';
    expect(calcularFechaSecar(fechaServicio, ' Normanda ', CONFIG_BASE)).toBe('2024-11-14');
    expect(calcularFechaSecar(fechaServicio, 'JERSEY', CONFIG_BASE)).toBe('2024-12-14');
  });

  it('meses_secado_por_raza es 100% parametrizado -- cambiar config cambia el resultado', () => {
    const fechaServicio = '2024-05-14';
    const configAlterna: HatoConfig = {
      ...CONFIG_BASE,
      meses_secado_por_raza: { jersey: 3, holstein: 3, normanda: 4, _default: 3 },
    };
    expect(calcularFechaSecar(fechaServicio, 'jersey', CONFIG_BASE)).not.toBe(
      calcularFechaSecar(fechaServicio, 'jersey', configAlterna),
    );
  });

  it('PP y SECAR CLAMPAN al último día del mes destino cuando F Servicio cae en día 29-31 (nunca ruedan al mes siguiente)', () => {
    // Evidencia real (QA, verificado sobre 1.156 filas): CAPELA, F Servicio =
    // 2020-05-30. PP real en la planilla = 2021-02-28 (feb no tiene día 30 --
    // clampa, NO rueda a 2021-03-02). SECAR real = 2020-12-30 (dic sí tiene
    // día 30, deriva EXACTO desde F Servicio+7, no desde "PP-2" ya clampado --
    // esa cadena daría 2020-12-28, dos días antes del valor real).
    expect(calcularPartoProbable('2020-05-30', CONFIG_BASE)).toBe('2021-02-28');
    expect(calcularFechaSecar('2020-05-30', 'jersey', CONFIG_BASE)).toBe('2020-12-30');
  });

  it('calcularMesesPrenez cuenta meses calendario completos, no lee la columna TP', () => {
    // Evidencia real: ALINA servicio 2026-04-23, chequeo 2026-07-09 -- 2 meses
    // completos transcurridos (el día 9 aún no llega al 23 del mes de julio).
    expect(calcularMesesPrenez('2026-04-23', '2026-07-09')).toBe(2);
    // Mismo día del mes: exactamente N meses completos.
    expect(calcularMesesPrenez('2024-01-15', '2024-04-15')).toBe(3);
    // Antes de cumplir el primer mes: 0, nunca negativo.
    expect(calcularMesesPrenez('2024-06-20', '2024-06-25')).toBe(0);
  });
});

describe('descomponerSX', () => {
  it('OV: parto con cría macho vendido', () => {
    const r = descomponerSX({
      chequeoFecha: '2024-08-09',
      sx: parseSX('OV'),
      fechasServicio: [],
    });
    expect(r.eventos).toEqual([
      expect.objectContaining({ tipo: 'parto', cria_destino: 'macho_vendido', fecha: '2024-08-09' }),
    ]);
  });

  it('AV: parto con cría hembra vendida', () => {
    const r = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX('AV'), fechasServicio: [] });
    expect(r.eventos[0]).toMatchObject({ tipo: 'parto', cria_destino: 'hembra_vendida' });
  });

  it('A{n}: parto con cría retenida y número de cría en datos', () => {
    const r = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX('A210'), fechasServicio: [] });
    expect(r.eventos[0]).toMatchObject({ tipo: 'parto', cria_destino: 'retenida', datos: { numero_cria: 210 } });
  });

  it('A+/O+: parto con cría muerta por defecto, con issue de ambigüedad cuando no se especifica', () => {
    const rAMas = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX('A+'), fechasServicio: [] });
    expect(rAMas.eventos[0]).toMatchObject({ tipo: 'parto', cria_destino: 'muerta' });

    const rOMas = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX('O+'), fechasServicio: [] });
    expect(rOMas.eventos[0]).toMatchObject({ tipo: 'parto', cria_destino: 'muerta' });
    expect(rOMas.issues.some((i) => /ambiguo/.test(i.motivo))).toBe(true);
  });

  it("O+ con huboPartoConfirmado=false se registra como aborto, sin la advertencia de ambigüedad", () => {
    const r = descomponerSX({
      chequeoFecha: '2024-08-09',
      sx: parseSX('O+'),
      fechasServicio: [],
      huboPartoConfirmado: false,
    });
    expect(r.eventos[0]).toMatchObject({ tipo: 'aborto' });
    expect(r.issues.some((i) => /ambiguo/.test(i.motivo))).toBe(false);
  });

  it('V7: varios servicios en una celda generan varios eventos servicio encadenados, en orden', () => {
    const r = descomponerSX({
      chequeoFecha: '2024-08-09',
      sx: parseSX('vacia'),
      fechasServicio: ['2024-03-14', '2024-04-18', '2024-06-01'],
      tipoServicio: 'monta',
      toroNombre: 'Toro X',
    });
    const servicios = r.eventos.filter((e) => e.tipo === 'servicio');
    expect(servicios.map((e) => e.fecha)).toEqual(['2024-03-14', '2024-04-18', '2024-06-01']);
    expect(servicios.every((e) => e.tipo_servicio === 'monta' && e.toro_nombre === 'Toro X')).toBe(true);
  });

  it("vacia/cero/desconocido/vacio no generan ningún evento reproductivo", () => {
    for (const raw of ['vacia', '0', 'Mv', '']) {
      const r = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX(raw), fechasServicio: [] });
      expect(r.eventos).toEqual([]);
    }
  });

  it("vendida no genera evento (se registra por el flujo de finanzas), pero deja issue de verificación", () => {
    const r = descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX('vendida'), fechasServicio: [] });
    expect(r.eventos).toEqual([]);
    expect(r.issues.some((i) => /vendida/.test(i.motivo))).toBe(true);
  });

  it('nunca lanza para ninguna combinación de tipo SX', () => {
    for (const raw of ['OV', 'AV', 'A210', 'A+', 'O+', 'abort', 'vacia', 'vendida', '0', 'Mv', '']) {
      expect(() =>
        descomponerSX({ chequeoFecha: '2024-08-09', sx: parseSX(raw), fechasServicio: [] }),
      ).not.toThrow();
    }
  });
});

describe('derivarEstadoReproductivo', () => {
  const filaBase: EstadoActualHatoRow = {
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 2,
    ultimo_chequeo_fecha: '2024-08-09',
    ultimo_servicio_fecha: null,
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultimo_estado_chequeo: null,
  };

  it('novilla sin servicio nunca registrado', () => {
    const r = derivarEstadoReproductivo({ ...filaBase, etapa: 'novilla' }, CONFIG_BASE, '2024-08-09');
    expect(r.estado).toBe('novilla');
    expect(r.alertas.secado_due).toBe(false);
    expect(r.alertas.parto_proximo).toBe(false);
    // Una novilla nunca entró al ciclo reproductivo -- la pregunta "¿normal
    // o problema?" (V14) no aplica todavía.
    expect(r.vacia_es_problema).toBeNull();
  });

  it('vaca servida recientemente, lejos de secar: estado servida', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_servicio_fecha: '2024-08-01' };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
    expect(r.estado).toBe('servida');
    expect(r.fecha_probable_parto).toBe('2025-05-01');
    expect(r.fecha_secar).toBe('2025-03-01'); // jersey: PP - 2 meses
    // Preñez activa no es un estado "vacía" -- V14 no aplica aquí.
    expect(r.vacia_es_problema).toBeNull();
  });

  it('dentro de la ventana de secado (config): estado proxima_a_secar y alerta secado_due', () => {
    // Servicio 2024-05-14 -> PP 2025-02-14 -> Secar (jersey) 2024-12-14.
    // Con referencia dentro de la ventana de 30 días antes de esa fecha.
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_servicio_fecha: '2024-05-14' };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-12-01');
    expect(r.estado).toBe('proxima_a_secar');

    const rDespuesDeSecar = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-12-20');
    expect(rDespuesDeSecar.estado).toBe('proxima_a_secar');
    expect(rDespuesDeSecar.alertas.secado_due).toBe(true);
  });

  it('secado_real registrado: estado seca, sin alerta de secado pendiente', () => {
    const fila: EstadoActualHatoRow = {
      ...filaBase,
      ultimo_servicio_fecha: '2024-05-14',
      ultimo_secado_real_fecha: '2024-12-10',
    };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-12-20');
    expect(r.estado).toBe('seca');
    expect(r.alertas.secado_due).toBe(false);
  });

  it('parto reciente sin nuevo servicio: estado parida_reciente, días abiertos cuenta desde el parto', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_parto_fecha: '2024-07-01' };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-10');
    expect(r.estado).toBe('parida_reciente');
    expect(r.dias_abiertos).toBe(40);
  });

  it('V14: dias_abiertos en preñez activa = días entre el último parto y el servicio que la concibió, nunca null solo por estar preñada', () => {
    // Parió 2024-01-10, se sirvió de nuevo 2024-03-05 (55 días abiertos) --
    // antes esta rama devolvía null incondicionalmente.
    const fila: EstadoActualHatoRow = {
      ...filaBase,
      ultimo_parto_fecha: '2024-01-10',
      ultimo_servicio_fecha: '2024-03-05',
    };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-04-01');
    expect(r.estado).toBe('servida');
    expect(r.dias_abiertos).toBe(55);
  });

  it('dias_abiertos es null (nunca 0) cuando no hay parto previo conocido, incluso con servicio activo', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_servicio_fecha: '2024-03-05' };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-04-01');
    expect(r.dias_abiertos).toBeNull();
  });

  it('dias_abiertos es null cuando el único servicio conocido es ANTERIOR al parto conocido (no se puede anclar con estos datos)', () => {
    const fila: EstadoActualHatoRow = {
      ...filaBase,
      ultimo_servicio_fecha: '2023-01-01',
      ultimo_parto_fecha: '2023-10-01',
      ultimo_secado_real_fecha: '2024-07-01', // fuerza masReciente != 'parto'
    };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-01');
    expect(r.dias_abiertos).toBeNull();
  });

  describe('V14 -- vacia_es_problema (confirmado por el dueño: ok=normal, rech=problema)', () => {
    it("ESTADO='vacia_apta' (ok/0k) sobre una vaca sin servicio activo => vacia_es_problema=false", () => {
      const fila: EstadoActualHatoRow = { ...filaBase, ultimo_estado_chequeo: 'vacia_apta' };
      const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
      expect(r.estado).toBe('vacia_por_servir');
      expect(r.vacia_es_problema).toBe(false);
    });

    it("ESTADO='vacia_problema' (rech) sobre una vaca sin servicio activo => vacia_es_problema=true", () => {
      const fila: EstadoActualHatoRow = { ...filaBase, ultimo_estado_chequeo: 'vacia_problema' };
      const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
      expect(r.estado).toBe('vacia_por_servir');
      expect(r.vacia_es_problema).toBe(true);
    });

    it('sin señal de ESTADO y sin parto que ancle el tiempo, vacia_es_problema es null (nunca se adivina)', () => {
      const r = derivarEstadoReproductivo(filaBase, CONFIG_BASE, '2024-08-09');
      expect(r.estado).toBe('vacia_por_servir');
      expect(r.vacia_es_problema).toBeNull();
    });

    it('parida_reciente: sin señal de ESTADO, usa dias_espera_voluntaria_post_parto como proxy', () => {
      const filaReciente: EstadoActualHatoRow = { ...filaBase, ultimo_parto_fecha: '2024-07-01' };
      // 40 días desde el parto (< 60) -> todavía dentro del período de espera
      // voluntario: vacía NORMAL, no problema.
      const rNormal = derivarEstadoReproductivo(filaReciente, CONFIG_BASE, '2024-08-10');
      expect(rNormal.estado).toBe('parida_reciente');
      expect(rNormal.vacia_es_problema).toBe(false);

      // 60 días exactos (== el umbral) -> ya cuenta como problema.
      const rLimite = derivarEstadoReproductivo(filaReciente, CONFIG_BASE, '2024-08-30');
      expect(rLimite.vacia_es_problema).toBe(true);

      // El umbral viene de su PROPIA clave: cambiar
      // dias_servicio_sin_confirmacion (que cuenta desde el SERVICIO, no
      // desde el parto) no debe mover esta clasificación. Es la regresión que
      // motivó la migración 062.
      const configOtroUmbral: HatoConfig = { ...CONFIG_BASE, dias_servicio_sin_confirmacion: 5 };
      const rIndiferente = derivarEstadoReproductivo(filaReciente, configOtroUmbral, '2024-08-10');
      expect(rIndiferente.vacia_es_problema).toBe(false);
    });

    it('la señal de ESTADO explícita prevalece sobre el proxy de tiempo, en cualquier dirección', () => {
      const filaReciente: EstadoActualHatoRow = { ...filaBase, ultimo_parto_fecha: '2024-07-01' };
      // 60 días (el proxy de tiempo diría "problema"), pero el chequeo dijo 'ok'.
      const r = derivarEstadoReproductivo(
        { ...filaReciente, ultimo_estado_chequeo: 'vacia_apta' },
        CONFIG_BASE,
        '2024-08-30',
      );
      expect(r.vacia_es_problema).toBe(false);
    });

    it('vacia_es_problema es null para cría, preñez activa, indeterminado y estados terminales', () => {
      expect(
        derivarEstadoReproductivo({ ...filaBase, etapa: 'ternera' }, CONFIG_BASE, '2024-08-09').vacia_es_problema,
      ).toBeNull();
      expect(
        derivarEstadoReproductivo(
          { ...filaBase, ultimo_servicio_fecha: '2026-01-10', ultimo_evento_fecha: '2026-06-30' },
          CONFIG_BASE,
          '2026-07-09',
        ).vacia_es_problema,
      ).toBeNull();
      expect(
        derivarEstadoReproductivo({ ...filaBase, estado: 'vendida' }, CONFIG_BASE, '2024-08-09').vacia_es_problema,
      ).toBeNull();
    });
  });

  it('servicio_sin_confirmacion se activa solo al pasar el umbral de config (45 días default)', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_servicio_fecha: '2024-05-14' };
    const antes = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-06-01'); // 18 días
    expect(antes.alertas.servicio_sin_confirmacion).toBe(false);
    const despues = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-07-15'); // 62 días
    expect(despues.alertas.servicio_sin_confirmacion).toBe(true);

    const configMasEstricta: HatoConfig = { ...CONFIG_BASE, dias_servicio_sin_confirmacion: 10 };
    const conConfigDistinta = derivarEstadoReproductivo(fila, configMasEstricta, '2024-06-01');
    expect(conConfigDistinta.alertas.servicio_sin_confirmacion).toBe(true);
  });

  it('rechequeo_due se activa según dias_rechequeo_due de config, no un valor fijo', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_chequeo_fecha: '2024-06-01' };
    const r59dias = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-07-30');
    expect(r59dias.alertas.rechequeo_due).toBe(false);
    const r61dias = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-01');
    expect(r61dias.alertas.rechequeo_due).toBe(true);
  });

  it('parto_proximo se activa dentro de dias_parto_proximo_alerta de config (14 días default)', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, ultimo_servicio_fecha: '2024-05-14' }; // PP 2025-02-14
    const lejos = derivarEstadoReproductivo(fila, CONFIG_BASE, '2025-01-01');
    expect(lejos.alertas.parto_proximo).toBe(false);
    const cerca = derivarEstadoReproductivo(fila, CONFIG_BASE, '2025-02-05');
    expect(cerca.alertas.parto_proximo).toBe(true);
  });

  it('proxima_a_reemplazo usa umbral_partos_reemplazo de config (default 9), no un valor fijo', () => {
    const fila8Partos: EstadoActualHatoRow = { ...filaBase, num_partos: 8 };
    expect(derivarEstadoReproductivo(fila8Partos, CONFIG_BASE, '2024-08-09').proxima_a_reemplazo).toBe(false);

    const fila9Partos: EstadoActualHatoRow = { ...filaBase, num_partos: 9 };
    expect(derivarEstadoReproductivo(fila9Partos, CONFIG_BASE, '2024-08-09').proxima_a_reemplazo).toBe(true);

    const configLaxa: HatoConfig = { ...CONFIG_BASE, umbral_partos_reemplazo: 12 };
    expect(derivarEstadoReproductivo(fila9Partos, configLaxa, '2024-08-09').proxima_a_reemplazo).toBe(false);
  });

  it('estados terminales (vendida/muerta/descartada) no generan alertas ni proxima_a_reemplazo', () => {
    for (const estado of ['vendida', 'muerta', 'descartada'] as const) {
      const fila: EstadoActualHatoRow = { ...filaBase, estado, num_partos: 12 };
      const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
      expect(r.estado).toBe(estado);
      expect(r.proxima_a_reemplazo).toBe(false);
      expect(r.alertas).toEqual({
        secado_due: false,
        rechequeo_due: false,
        servicio_sin_confirmacion: false,
        parto_proximo: false,
      });
    }
  });

  it('etapa ternera: estado cria, no aplica ciclo reproductivo', () => {
    const fila: EstadoActualHatoRow = { ...filaBase, etapa: 'ternera', ultimo_servicio_fecha: null };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
    expect(r.estado).toBe('cria');
  });

  it('un evento posterior no clasificado (ej. aborto) vuelve el estado indeterminado, nunca sigue proyectando preñez', () => {
    // Evidencia real QA: MONA, SX='aborto', F Servicio=2023-05-16 -- SECAR/PP
    // seguían "vigentes" en la fila cruda de la planilla pese al aborto.
    // `v_hato_estado_actual` no expone una columna dedicada de "último
    // aborto"; la salvaguarda usa `ultimo_evento_fecha` (MAX genérico).
    const fila: EstadoActualHatoRow = {
      ...filaBase,
      ultimo_servicio_fecha: '2023-05-16',
      ultimo_evento_fecha: '2024-01-10', // el aborto (u otro evento) es más reciente que el servicio
    };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09');
    expect(r.estado).toBe('indeterminado');
    expect(r.fecha_secar).toBeNull();
    expect(r.fecha_probable_parto).toBeNull();
    expect(r.alertas.secado_due).toBe(false);
    expect(r.alertas.parto_proximo).toBe(false);
  });

  it('ultimo_evento_fecha igual o anterior al servicio no dispara indeterminado (el servicio sigue siendo lo más reciente)', () => {
    const fila: EstadoActualHatoRow = {
      ...filaBase,
      ultimo_servicio_fecha: '2024-05-14',
      ultimo_evento_fecha: '2024-05-14',
    };
    const r = derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-06-01');
    expect(r.estado).not.toBe('indeterminado');
  });

  it('nunca lanza para ninguna combinación razonable de hechos', () => {
    const combinaciones: EstadoActualHatoRow[] = [
      filaBase,
      { ...filaBase, etapa: 'novilla' },
      { ...filaBase, etapa: 'ternera' },
      { ...filaBase, ultimo_servicio_fecha: '2024-01-01' },
      { ...filaBase, ultimo_parto_fecha: '2024-01-01' },
      { ...filaBase, estado: 'vendida' },
      { ...filaBase, ultimo_chequeo_fecha: null },
      { ...filaBase, raza: null },
      { ...filaBase, ultimo_servicio_fecha: '2024-01-01', ultimo_evento_fecha: '2024-06-01' },
    ];
    for (const fila of combinaciones) {
      expect(() => derivarEstadoReproductivo(fila, CONFIG_BASE, '2024-08-09')).not.toThrow();
    }
  });
});

describe('calcularProductividad', () => {
  it('litros / vacas en ordeño', () => {
    expect(calcularProductividad(1200, 40)).toBe(30);
  });

  it('devuelve null (nunca 0/NaN) cuando falta un dato o no hay vacas', () => {
    expect(calcularProductividad(null, 40)).toBeNull();
    expect(calcularProductividad(undefined, 40)).toBeNull();
    expect(calcularProductividad(1200, null)).toBeNull();
    expect(calcularProductividad(1200, 0)).toBeNull();
    expect(calcularProductividad(1200, -1)).toBeNull();
  });
});

describe('detectarColisionesChapeta', () => {
  it('detecta #162 (ESMERALDA/VITROLA) y #175 (MONA/MARGARITA) en el chequeo más reciente (evidencia real QA)', () => {
    const colisiones = detectarColisionesChapeta([
      { numero: 162, nombre: 'ESMERALDA' },
      { numero: 175, nombre: 'MARGARITA' },
      { numero: 175, nombre: 'MONA' },
      { numero: 162, nombre: 'VITROLA' },
      { numero: 30, nombre: 'CAPELA' },
    ]);
    expect(colisiones).toEqual([
      { numero: 162, nombres: ['ESMERALDA', 'VITROLA'] },
      { numero: 175, nombres: ['MARGARITA', 'MONA'] },
    ]);
  });

  it('el mismo nombre repetido para el mismo número no es una colisión', () => {
    const colisiones = detectarColisionesChapeta([
      { numero: 43, nombre: 'CUÑA' },
      { numero: 43, nombre: 'CUÑA' },
    ]);
    expect(colisiones).toEqual([]);
  });

  it('nunca decide cuál nombre es el correcto -- solo reporta, nunca desempata', () => {
    const colisiones = detectarColisionesChapeta([
      { numero: 43, nombre: 'CUÑA' },
      { numero: 43, nombre: 'MONTAÑA' },
    ]);
    expect(colisiones).toHaveLength(1);
    expect(colisiones[0].nombres).toEqual(['CUÑA', 'MONTAÑA']);
  });

  it('sin animales o sin colisiones, devuelve un arreglo vacío', () => {
    expect(detectarColisionesChapeta([])).toEqual([]);
    expect(detectarColisionesChapeta([{ numero: 1, nombre: 'A' }])).toEqual([]);
  });
});
