import { describe, it, expect } from 'vitest';
import {
  ESTADO_EXCEPCION_INFO,
  GRUPO_DESENLACE_POR_ESTADO,
  calcularResumenDesenlaces,
  formatearPeriodoRonda,
  etiquetaEstadoProductoRonda,
  resolverActor,
  textoObservacionLibre,
} from '@/utils/rondaInventarioUi';
import type { EstadoExcepcionInventario } from '@/types/rondaInventario';

/**
 * Fase 6 -- Historial web (docs/brief_tecnico_verificacion_inventario.md §9,
 * D-T10). Estas son las piezas PURAS del contrato CA-10 y R-2/R-3/CA-15/CA-16:
 * qué grupo visual le corresponde a cada estado de excepción, y cómo se
 * agregan sin fundir los tres desenlaces terminales.
 */

describe('rondaInventarioUi -- grupo de desenlace (CA-10)', () => {
  it('cerrada_sin_ajuste, resuelta_con_captura y la familia ajuste_* caen en TRES grupos distintos', () => {
    expect(GRUPO_DESENLACE_POR_ESTADO.cerrada_sin_ajuste).toBe('sin_ajuste');
    expect(GRUPO_DESENLACE_POR_ESTADO.resuelta_con_captura).toBe('captura');
    expect(GRUPO_DESENLACE_POR_ESTADO.ajuste_aprobado).toBe('ajuste');
    expect(GRUPO_DESENLACE_POR_ESTADO.ajuste_aplicado).toBe('ajuste');
    expect(GRUPO_DESENLACE_POR_ESTADO.ajuste_desestimado).toBe('ajuste');

    const grupos = new Set([
      GRUPO_DESENLACE_POR_ESTADO.cerrada_sin_ajuste,
      GRUPO_DESENLACE_POR_ESTADO.resuelta_con_captura,
      GRUPO_DESENLACE_POR_ESTADO.ajuste_aprobado,
    ]);
    expect(grupos.size).toBe(3);
  });

  it('los estados no terminales (reportada, explicacion_precargada, explicada, ajuste_propuesto) son "en_curso", nunca un desenlace', () => {
    const noTerminales: EstadoExcepcionInventario[] = [
      'reportada',
      'explicacion_precargada',
      'explicada',
      'ajuste_propuesto',
    ];
    for (const estado of noTerminales) {
      expect(GRUPO_DESENLACE_POR_ESTADO[estado]).toBe('en_curso');
      expect(ESTADO_EXCEPCION_INFO[estado].esTerminal).toBe(false);
    }
  });

  it('cada uno de los 9 estados tiene etiqueta y clase de color propias, y NINGUNA se repite entre las tres familias terminales', () => {
    const terminales: EstadoExcepcionInventario[] = [
      'cerrada_sin_ajuste',
      'resuelta_con_captura',
      'ajuste_aplicado',
      'ajuste_desestimado',
    ];
    const etiquetas = terminales.map((e) => ESTADO_EXCEPCION_INFO[e].etiqueta);
    const clases = terminales.map((e) => ESTADO_EXCEPCION_INFO[e].badgeClassName);
    expect(new Set(etiquetas).size).toBe(terminales.length);
    expect(new Set(clases).size).toBe(terminales.length);
  });

  it('las 9 etiquetas del enum tienen entrada -- ninguna queda sin mapear', () => {
    const todos: EstadoExcepcionInventario[] = [
      'reportada',
      'explicacion_precargada',
      'explicada',
      'cerrada_sin_ajuste',
      'resuelta_con_captura',
      'ajuste_propuesto',
      'ajuste_aprobado',
      'ajuste_desestimado',
      'ajuste_aplicado',
    ];
    for (const estado of todos) {
      expect(ESTADO_EXCEPCION_INFO[estado]).toBeDefined();
      expect(ESTADO_EXCEPCION_INFO[estado].etiqueta.length).toBeGreaterThan(0);
    }
  });
});

describe('rondaInventarioUi -- calcularResumenDesenlaces (CA-10, agregación sin fundir)', () => {
  it('cuenta cada familia por separado -- una excepción resuelta_con_captura NUNCA suma al bucket de ajuste', () => {
    const resumen = calcularResumenDesenlaces([
      { estado: 'cerrada_sin_ajuste' },
      { estado: 'cerrada_sin_ajuste' },
      { estado: 'resuelta_con_captura' },
      { estado: 'ajuste_aprobado' },
      { estado: 'ajuste_aplicado' },
      { estado: 'ajuste_desestimado' },
      { estado: 'reportada' },
    ]);

    expect(resumen.sinAjuste).toBe(2);
    expect(resumen.captura).toBe(1);
    expect(resumen.ajustePendiente).toBe(1);
    expect(resumen.ajusteAplicado).toBe(1);
    expect(resumen.ajusteDesestimado).toBe(1);
    expect(resumen.enCurso).toBe(1);
    expect(resumen.total).toBe(7);
  });

  it('lista vacía -- todos los conteos en 0, nunca undefined', () => {
    const resumen = calcularResumenDesenlaces([]);
    expect(resumen.sinAjuste).toBe(0);
    expect(resumen.captura).toBe(0);
    expect(resumen.ajustePendiente).toBe(0);
    expect(resumen.ajusteAplicado).toBe(0);
    expect(resumen.ajusteDesestimado).toBe(0);
    expect(resumen.enCurso).toBe(0);
    expect(resumen.total).toBe(0);
  });
});

describe('rondaInventarioUi -- formatearPeriodoRonda', () => {
  it('formatea el primer día del mes como "Mes AAAA", capitalizado, sin desfase de zona horaria', () => {
    expect(formatearPeriodoRonda('2026-08-01')).toBe('Agosto 2026');
    expect(formatearPeriodoRonda('2026-01-01')).toBe('Enero 2026');
    // Caso trampa del repo: 'YYYY-MM-DD' parseado como UTC medianoche se lee
    // un día antes en Bogotá y puede mover el mes/año en el borde.
    expect(formatearPeriodoRonda('2026-12-01')).toBe('Diciembre 2026');
  });
});

describe('rondaInventarioUi -- etiquetaEstadoProductoRonda (R-2/R-3/CA-15/CA-16)', () => {
  it('conforme dice "conforme dentro del alcance declarado", nunca "contado"', () => {
    const info = etiquetaEstadoProductoRonda('conforme');
    expect(info.texto.toLowerCase()).toContain('conforme');
    expect(info.texto.toLowerCase()).toContain('alcance declarado');
    expect(info.texto.toLowerCase()).not.toContain('contado');
  });

  it('fuera_de_alcance se muestra como "no verificado", nunca como conforme ni como 0', () => {
    const info = etiquetaEstadoProductoRonda('fuera_de_alcance');
    expect(info.texto.toLowerCase()).toContain('no verificado');
    expect(info.texto).not.toBe('0');
    expect(info.texto.toLowerCase()).not.toContain('conforme');
  });

  it('conforme y fuera_de_alcance nunca comparten texto ni clase', () => {
    const conforme = etiquetaEstadoProductoRonda('conforme');
    const fuera = etiquetaEstadoProductoRonda('fuera_de_alcance');
    expect(conforme.texto).not.toBe(fuera.texto);
    expect(conforme.className).not.toBe(fuera.className);
  });

  it('con_excepcion es un tercer texto/clase, distinto de los otros dos', () => {
    const conExcepcion = etiquetaEstadoProductoRonda('con_excepcion');
    const conforme = etiquetaEstadoProductoRonda('conforme');
    const fuera = etiquetaEstadoProductoRonda('fuera_de_alcance');
    expect(conExcepcion.texto).not.toBe(conforme.texto);
    expect(conExcepcion.texto).not.toBe(fuera.texto);
  });
});

describe('rondaInventarioUi -- resolverActor', () => {
  const usuarios = new Map([['u1', 'Santiago Forero']]);
  const telegram = new Map([['t1', 'Uriel (campo)']]);

  it('prioriza el usuario web cuando ambos ids vienen presentes (no debería pasar en la práctica, pero no debe reventar)', () => {
    const actor = resolverActor('u1', 't1', usuarios, telegram);
    expect(actor).toEqual({ nombre: 'Santiago Forero', canal: 'web' });
  });

  it('resuelve por Telegram cuando no hay usuario web', () => {
    const actor = resolverActor(null, 't1', usuarios, telegram);
    expect(actor).toEqual({ nombre: 'Uriel (campo)', canal: 'telegram' });
  });

  it('devuelve null cuando ningún actor está presente -- nunca "Sistema" inventado', () => {
    expect(resolverActor(null, null, usuarios, telegram)).toBeNull();
  });

  it('id presente pero no encontrado en el mapa -- etiqueta explícita de "desconocido", nunca revienta', () => {
    const actor = resolverActor('u-inexistente', null, usuarios, telegram);
    expect(actor?.canal).toBe('web');
    expect(actor?.nombre.toLowerCase()).toContain('desconocido');
  });
});

describe('rondaInventarioUi -- textoObservacionLibre (R-16/CA-14, forma del jsonb no está fijada)', () => {
  it('un string plano se muestra tal cual', () => {
    expect(textoObservacionLibre('Encontré un bidón sin etiqueta en la bodega')).toBe(
      'Encontré un bidón sin etiqueta en la bodega',
    );
  });

  it('un objeto con .texto se muestra por ese campo', () => {
    expect(textoObservacionLibre({ texto: 'Producto no catalogado' })).toBe('Producto no catalogado');
  });

  it('un objeto con .observacion (nombre alterno) también se reconoce', () => {
    expect(textoObservacionLibre({ observacion: 'Otro nombre de campo' })).toBe('Otro nombre de campo');
  });

  it('una forma desconocida no revienta -- cae a una representación legible, nunca "[object Object]"', () => {
    const texto = textoObservacionLibre({ algoInesperado: true });
    expect(texto).not.toBe('[object Object]');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('null/undefined no revientan -- texto vacío', () => {
    expect(textoObservacionLibre(null)).toBe('');
    expect(textoObservacionLibre(undefined)).toBe('');
  });
});
