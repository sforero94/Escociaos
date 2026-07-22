import { describe, it, expect } from 'vitest';
import { parseToro, esCodigoEstadoEnColumnaToro } from '@/utils/importHato/parseToro';
import type { HatoConfig } from '@/utils/calculosHato';

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

describe('parseToro', () => {
  it('celda vacía -> sin tipo de servicio, sin nombre, sin estadoMarcador, sin issues', () => {
    expect(parseToro('', CONFIG)).toEqual({ crudo: '', toroNombre: null, tipoServicio: null, estadoMarcador: null, issues: [] });
    expect(parseToro(null, CONFIG)).toEqual({ crudo: '', toroNombre: null, tipoServicio: null, estadoMarcador: null, issues: [] });
  });

  it('nunca lanza para ningún valor real observado en la columna Toro', () => {
    const valores = [
      'ins laredo',
      'ins marquez',
      'toro holst',
      'INS MER',
      'hol',
      'hols',
      'HOLST',
      'h t',
      'hins',
      'jers',
      'jer',
      'JERSEY',
      'TJ',
      'norm',
      'nor',
      'gir',
      'GIR',
      'ok',
      'OK',
      '0k',
      'rech',
      'rec',
      'T',
      'Toro',
      'inook',
      'INOOK',
      'nitro',
      'steem',
      'FABA',
      'htoro',
      'jjerico',
      'insj',
      '6 mes',
      '2 mes',
      '7',
      'ins /toro hol',
      'toro jer-insem corone/otra vez',
      'recomendación, dar sal en comida para mejorar ovarios',
    ];
    for (const v of valores) {
      expect(() => parseToro(v, CONFIG)).not.toThrow();
    }
  });

  describe('prefijos de tipo de servicio', () => {
    it("'ins laredo' -> inseminación, toroNombre='laredo'", () => {
      const r = parseToro('ins laredo', CONFIG);
      expect(r.tipoServicio).toBe('inseminacion');
      expect(r.toroNombre).toBe('laredo');
      expect(r.estadoMarcador).toBeNull();
    });
    it("'ins marquez' -> inseminación, toroNombre='marquez'", () => {
      const r = parseToro('ins marquez', CONFIG);
      expect(r.tipoServicio).toBe('inseminacion');
      expect(r.toroNombre).toBe('marquez');
    });
    it("'INS MER' -> inseminación, toroNombre='MER'", () => {
      const r = parseToro('INS MER', CONFIG);
      expect(r.tipoServicio).toBe('inseminacion');
      expect(r.toroNombre).toBe('MER');
    });
    it("'T' sola -> monta, sin nombre", () => {
      const r = parseToro('T', CONFIG);
      expect(r.tipoServicio).toBe('monta');
      expect(r.toroNombre).toBeNull();
    });
    it("'Toro' sola -> monta, sin nombre", () => {
      const r = parseToro('Toro', CONFIG);
      expect(r.tipoServicio).toBe('monta');
      expect(r.toroNombre).toBeNull();
    });
    it("'ins' sola -> inseminación, sin nombre", () => {
      const r = parseToro('ins', CONFIG);
      expect(r.tipoServicio).toBe('inseminacion');
      expect(r.toroNombre).toBeNull();
    });
  });

  describe('D6 (decisión del dueño, 2026-07-22) -- la raza-como-nombre AHORA SÍ resuelve toroNombre', () => {
    // Revierte la regla original de S3 ("una raza JAMÁS aterriza en
    // toroNombre"). Owner's canonical table: Gyr/Holstein/Jersey/Normando.
    const casos: Array<[string, string]> = [
      ['hol', 'Holstein'],
      ['hols', 'Holstein'],
      ['HOLST', 'Holstein'],
      ['h t', 'Holstein'],
      ['hins', 'Holstein'],
      ['jers', 'Jersey'],
      ['jer', 'Jersey'],
      ['JERSEY', 'Jersey'],
      ['TJ', 'Jersey'],
      ['norm', 'Normando'],
      ['nor', 'Normando'],
      ['norman', 'Normando'],
      ['normando', 'Normando'],
      ['normanda', 'Normando'],
    ];
    for (const [crudo, nombreEsperado] of casos) {
      it(`'${crudo}' -> toroNombre='${nombreEsperado}' (D6), tipoServicio=null`, () => {
        const r = parseToro(crudo, CONFIG);
        expect(r.toroNombre).toBe(nombreEsperado);
        expect(r.tipoServicio).toBeNull();
        expect(r.estadoMarcador).toBeNull();
        // holstein/jersey/normanda SÍ están en HatoConfig.razas (058) -- sin issue.
        expect(r.issues).toEqual([]);
      });
    }

    it("'toro holst' -> monta (prefijo), Y raza-como-nombre: toroNombre='Holstein', sin issue", () => {
      const r = parseToro('toro holst', CONFIG);
      expect(r.tipoServicio).toBe('monta');
      expect(r.toroNombre).toBe('Holstein');
      expect(r.issues).toEqual([]);
    });
  });

  describe('gyr -- raza real pero fuera de HatoConfig.razas (058) -- D6: SÍ resuelve toroNombre, con issue informativo', () => {
    it("'gir' -> toroNombre='Gyr', issue explícito de que gyr no está en el catálogo configurado", () => {
      const r = parseToro('gir', CONFIG);
      expect(r.toroNombre).toBe('Gyr');
      expect(r.tipoServicio).toBeNull();
      expect(r.issues[0].motivo).toContain('gyr');
      expect(r.issues[0].motivo.toLowerCase()).toContain('fuera del catálogo');
    });
    it("'GIR' (mayúsculas) también se reconoce", () => {
      const r = parseToro('GIR', CONFIG);
      expect(r.toroNombre).toBe('Gyr');
      expect(r.issues[0].motivo).toContain('gyr');
    });
    it('NUNCA mapea gyr a otra raza del config -- toroNombre nunca queda como "Holstein"/"Jersey"/"Normando"', () => {
      const r = parseToro('gir', CONFIG);
      expect(['Holstein', 'Jersey', 'Normando']).not.toContain(r.toroNombre);
    });
    it('cuando HatoConfig.razas SÍ incluye gyr, no hay issue', () => {
      const configConGyr: HatoConfig = { ...CONFIG, razas: [...CONFIG.razas, 'gyr'] };
      const r = parseToro('gir', configConGyr);
      expect(r.toroNombre).toBe('Gyr');
      expect(r.issues).toEqual([]);
    });
  });

  describe('D6 -- códigos de ESTADO filtrados a la columna Toro: NUNCA un toro, NUNCA una raza, sin importar mayúsculas/minúsculas', () => {
    for (const crudo of ['ok', 'OK', '0k', 'inook', 'INOOK', 'Inook']) {
      it(`'${crudo}' -> estadoMarcador='vacia_apta' ("vaca ok"), toroNombre=null`, () => {
        const r = parseToro(crudo, CONFIG);
        expect(r.toroNombre).toBeNull();
        expect(r.tipoServicio).toBeNull();
        expect(r.estadoMarcador).toBe('vacia_apta');
        expect(r.issues.length).toBe(1);
      });
    }
    for (const crudo of ['rech', 'rechq', 'rec', 'r']) {
      it(`'${crudo}' -> estadoMarcador='vacia_problema' ("rechequeo"), toroNombre=null`, () => {
        const r = parseToro(crudo, CONFIG);
        expect(r.toroNombre).toBeNull();
        expect(r.estadoMarcador).toBe('vacia_problema');
        expect(r.issues.length).toBe(1);
      });
    }
  });

  describe('esCodigoEstadoEnColumnaToro -- reutilizado por construirCatalogoToros (resolver.ts)', () => {
    it('reconoce todos los códigos filtrados, sin importar mayúsculas/espacios', () => {
      for (const v of ['ok', 'OK', '0k', 'inook', 'INOOK', 'rech', 'REC', 'rechq', 'r']) {
        expect(esCodigoEstadoEnColumnaToro(v)).toBe(true);
      }
    });
    it('NO reconoce un nombre de toro real ni una raza', () => {
      expect(esCodigoEstadoEnColumnaToro('nitro')).toBe(false);
      expect(esCodigoEstadoEnColumnaToro('hol')).toBe(false);
    });
  });

  describe('D6 -- FABA es alias de Fabace (mismo toro que D7 en la columna Padre de TERNERAS)', () => {
    it("'FABA' -> toroNombre='Fabace'", () => {
      const r = parseToro('FABA', CONFIG);
      expect(r.toroNombre).toBe('Fabace');
      expect(r.issues).toEqual([]);
    });
    it("'faba' (minúsculas) también resuelve a 'Fabace'", () => {
      expect(parseToro('faba', CONFIG).toroNombre).toBe('Fabace');
    });
  });

  describe('duración/anotación numérica filtrada -- nunca un toro (doc S2 §7)', () => {
    for (const crudo of ['7', '6 mes', '2 mes']) {
      it(`'${crudo}' -> toroNombre=null con issue, estadoMarcador=null`, () => {
        const r = parseToro(crudo, CONFIG);
        expect(r.toroNombre).toBeNull();
        expect(r.estadoMarcador).toBeNull();
        expect(r.issues.length).toBe(1);
      });
    }
  });

  describe('oración de texto libre -- nunca un toro (doc S2, "incluida una oración completa")', () => {
    it("'recomendación, dar sal en comida para mejorar ovarios' -> null + issue, crudo preservado", () => {
      const crudo = 'recomendación, dar sal en comida para mejorar ovarios';
      const r = parseToro(crudo, CONFIG);
      expect(r.toroNombre).toBeNull();
      expect(r.crudo).toBe(crudo);
      expect(r.issues.length).toBe(1);
    });
  });

  describe('señal doble (inseminación Y monta a la vez) -- ambiguo, no se adivina; D6: sigue detectando raza en el resto', () => {
    it("'ins /toro hol' -> tipoServicio=null (ambiguo), pero D6: raza holstein -> toroNombre='Holstein'", () => {
      const r = parseToro('ins /toro hol', CONFIG);
      expect(r.tipoServicio).toBeNull();
      expect(r.toroNombre).toBe('Holstein');
      expect(r.issues.some((i) => i.motivo.includes('inseminación Y monta'))).toBe(true);
    });
  });

  describe('nombres reales de toro -- se preservan sin issue (INOOK/TJ/FABA excluidos de este grupo por D6, ver arriba)', () => {
    for (const nombre of ['nitro', 'steem']) {
      it(`'${nombre}' se preserva como toroNombre`, () => {
        const r = parseToro(nombre, CONFIG);
        expect(r.toroNombre).toBe(nombre);
        expect(r.tipoServicio).toBeNull();
        expect(r.estadoMarcador).toBeNull();
      });
    }
  });

  describe('compuestos ambiguos garabateados -- se preservan íntegros, nunca se adivina una separación', () => {
    it("'toro jer-insem corone/otra vez' -> se trata como anotación, no se asegura tipoServicio", () => {
      const r = parseToro('toro jer-insem corone/otra vez', CONFIG);
      expect(r.toroNombre).toBeNull();
      expect(r.issues.length).toBeGreaterThan(0);
    });
  });
});
