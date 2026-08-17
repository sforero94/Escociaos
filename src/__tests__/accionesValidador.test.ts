/**
 * Tests unitarios del validador del motor de acciones recomendadas
 * (`src/utils/accionesValidador.ts`, §4.3 de
 * `docs/brief_tecnico_motor_acciones.md`).
 *
 * Este archivo prueba la MECÁNICA de cada regla en aislamiento (una acción,
 * un código). El corpus adversario completo (≥25 casos hostiles, incluidas
 * las 5 "molestas" del dueño) y el test de propiedad de R-2 viven en
 * `accionesAntiInvento.test.ts` -- son documentos distintos con propósitos
 * distintos, ambos exigidos por el brief.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_ACCIONES_POR_NEGOCIO,
  MAX_LONGITUD_PLANTILLA_RENDERIZADA,
  NUMERALES_ES,
  FECHAS_EN_LETRA,
  contieneFechaEnLetra,
  contieneNumeralEnLetra,
  validarSalidaMotor,
} from '@/utils/accionesValidador';
import {
  accionGenerada,
  hecho,
  paqueteConHechos,
  salidaMotor,
  valor,
} from './fixtures/acciones.fixture';

describe('validarSalidaMotor -- caso feliz', () => {
  it('acepta una acción bien formada y calcula su clave estable', () => {
    const h = hecho({
      id: 'hato.vacias_90d',
      negocio: 'hato_lechero',
      destinos: ['hato.lista_vacias'],
      valores: { n: valor('11', 11, 'vacas') },
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas vacías.',
        ranuras: { n: { hecho_id: 'hato.vacias_90d', campo: 'n' } },
      }),
    ]);

    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);

    expect(rechazos).toEqual([]);
    expect(aceptadas).toHaveLength(1);
    expect(aceptadas[0]).toMatchObject({
      negocio: 'hato_lechero',
      clave: 'hato_lechero.vacias_90d',
      origen: 'O1_senal',
      visibilidad: 'todos',
    });
  });

  it('la clave de un hecho O-8 (prefijo rev.) es el propio id sin el prefijo, no negocio+regla', () => {
    const h = hecho({
      id: 'rev.hato_lechero.productividad',
      negocio: 'hato_lechero',
      origen: 'O8_revision',
      destinos: ['hato.ranking_vacas'],
      fecha_limite: '2026-07-09',
      valores: {},
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['rev.hato_lechero.productividad'],
        destino_id: 'hato.ranking_vacas',
        plantilla: 'Correr análisis de productividad del hato.',
      }),
    ]);

    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos).toEqual([]);
    expect(aceptadas[0].clave).toBe('hato_lechero.productividad');
    expect(aceptadas[0].origen).toBe('O8_revision');
  });

  it('el verbo permitido, cuando el hecho lo declara, se respeta y la acción pasa', () => {
    const h = hecho({
      id: 'agu.insumo_faltante',
      negocio: 'aguacate',
      destinos: ['agu.aplicacion_detalle', 'inv.producto'],
      verbos_permitidos: ['Confirmar', 'Verificar'],
      valores: { producto: valor('Silicalmag'), falta: valor('4.694 kg', 4694, 'kg') },
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'inv.producto',
        plantilla: 'Confirmar insumos para la aplicación de la enmienda.',
      }),
    ]);

    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos).toEqual([]);
    expect(aceptadas).toHaveLength(1);
  });
});

describe('validarSalidaMotor -- reglas referenciales', () => {
  it('NEGOCIO_DESCONOCIDO -- el negocio no está entre los de esta corrida', () => {
    const h = hecho({ id: 'gan.fincas_sin_ha', negocio: 'ganado', destinos: ['gan.config_fincas'] });
    const paquete = paqueteConHechos([h], { negocios: ['hato_lechero', 'aguacate'] }); // sin 'ganado'
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'ganado',
        hecho_ids: ['gan.fincas_sin_ha'],
        destino_id: 'gan.config_fincas',
        plantilla: 'Completar las hectáreas de las fincas.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('NEGOCIO_DESCONOCIDO');
  });

  it('HECHO_DESCONOCIDO -- referencia un id que no existe en el paquete', () => {
    const paquete = paqueteConHechos([]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.no_existe'],
        destino_id: 'hato.lista_hato',
        plantilla: 'Revisar el hato.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('HECHO_DESCONOCIDO');
  });

  it('HECHO_DE_OTRO_NEGOCIO -- el hecho citado es de otro negocio', () => {
    const h = hecho({ id: 'hato.vacias_90d', negocio: 'hato_lechero', destinos: ['hato.lista_vacias'] });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'ganado',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'gan.dashboard',
        plantilla: 'Revisar el inventario.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('HECHO_DE_OTRO_NEGOCIO');
  });

  it('SIN_EVIDENCIA -- hecho_ids vacío', () => {
    const paquete = paqueteConHechos([]);
    const salida = salidaMotor([
      accionGenerada({ negocio: 'hato_lechero', hecho_ids: [], destino_id: 'hato.lista_hato', plantilla: 'Revisar el hato.' }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('SIN_EVIDENCIA');
  });

  it('SIN_EVIDENCIA -- más de 3 hechos citados', () => {
    const hechos = ['a', 'b', 'c', 'd'].map((s) =>
      hecho({ id: `hato.h_${s}`, negocio: 'hato_lechero', destinos: ['hato.lista_hato'] }),
    );
    const paquete = paqueteConHechos(hechos);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: hechos.map((h) => h.id),
        destino_id: 'hato.lista_hato',
        plantilla: 'Revisar el hato.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('SIN_EVIDENCIA');
  });

  it('DESTINO_DESCONOCIDO -- destino_id fuera del catálogo del paquete', () => {
    const h = hecho({ id: 'hato.vacias_90d', negocio: 'hato_lechero', destinos: ['hato.lista_vacias'] });
    const paquete = paqueteConHechos([h], { destinos: [] });
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las vacías.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('DESTINO_DESCONOCIDO');
  });

  it('DESTINO_NO_SOPORTADO_POR_HECHO -- el destino existe pero ningún hecho lo declara', () => {
    const h = hecho({ id: 'hato.vacias_90d', negocio: 'hato_lechero', destinos: ['hato.lista_vacias'] });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.produccion', // válido para el negocio, pero el hecho no lo lista
        plantilla: 'Revisar las vacías.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('DESTINO_NO_SOPORTADO_POR_HECHO');
  });

  it('DUPLICA_BLOQUE_1 -- el destino ya está excluido', () => {
    const h = hecho({ id: 'hato.produccion.quincena', negocio: 'hato_lechero', destinos: ['hato.produccion'] });
    const paquete = paqueteConHechos([h], {
      exclusiones: [{ destino_id: 'hato.produccion', motivo: 'ya está en Requiere tu decisión' }],
    });
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.produccion.quincena'],
        destino_id: 'hato.produccion',
        plantilla: 'Registrar la quincena de leche.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('DUPLICA_BLOQUE_1');
  });
});

describe('validarSalidaMotor -- fin.presupuesto compartido por tres negocios', () => {
  it('no dispara DESTINO_DE_OTRO_NEGOCIO cuando el mismo destino_id sirve a las tres tarjetas', () => {
    const hechos = (['aguacate', 'hato_lechero', 'ganado'] as const).map((negocio) =>
      hecho({
        id: `rev.${negocio}.ejecucion_presupuestal`,
        negocio,
        origen: 'O8_revision',
        destinos: ['fin.presupuesto'],
        fecha_limite: '2026-08-05',
        visibilidad: 'gerencia',
        valores: { periodo: valor('julio') },
      }),
    );
    const paquete = paqueteConHechos(hechos);
    const salida = salidaMotor(
      hechos.map((h) =>
        accionGenerada({
          negocio: h.negocio,
          hecho_ids: [h.id],
          destino_id: 'fin.presupuesto',
          plantilla: 'Revisar la ejecución presupuestal de {periodo}.',
          ranuras: { periodo: { hecho_id: h.id, campo: 'periodo' } },
        }),
      ),
    );

    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos).toEqual([]);
    expect(aceptadas).toHaveLength(3);
    expect(aceptadas.map((a) => a.visibilidad)).toEqual(['gerencia', 'gerencia', 'gerencia']);
  });

  it('DESTINO_DE_OTRO_NEGOCIO sigue disparando cuando de verdad no hay fila para ese negocio', () => {
    const h = hecho({ id: 'hato.vacias_90d', negocio: 'hato_lechero', destinos: ['fin.presupuesto'] });
    // Sólo se declara fin.presupuesto para 'aguacate' -- 'hato_lechero' no tiene fila.
    const paquete = paqueteConHechos([h], {
      destinos: [
        { id: 'fin.presupuesto', negocio: 'aguacate', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta' },
      ],
    });
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'fin.presupuesto',
        plantilla: 'Revisar las vacías.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('DESTINO_DE_OTRO_NEGOCIO');
  });
});

describe('validarSalidaMotor -- ranuras', () => {
  const base = hecho({
    id: 'hato.vacias_90d',
    negocio: 'hato_lechero',
    destinos: ['hato.lista_vacias'],
    valores: { n: valor('11', 11, 'vacas') },
  });

  it('RANURA_HUERFANA -- la ranura referencia un hecho que no está en hecho_ids', () => {
    const paquete = paqueteConHechos([base]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas.',
        ranuras: { n: { hecho_id: 'hato.otro_hecho', campo: 'n' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('RANURA_HUERFANA');
  });

  it('CAMPO_INEXISTENTE -- el campo referenciado no existe en hecho.valores', () => {
    const paquete = paqueteConHechos([base]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas.',
        ranuras: { n: { hecho_id: 'hato.vacias_90d', campo: 'promedio' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('CAMPO_INEXISTENTE');
  });

  it('RANURA_FALTANTE -- la plantilla usa {n} pero no hay ranura declarada', () => {
    const paquete = paqueteConHechos([base]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas.',
        ranuras: {},
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('RANURA_FALTANTE');
  });

  it('RANURA_NO_USADA -- se declara una ranura que la plantilla no usa', () => {
    const paquete = paqueteConHechos([base]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las vacas.',
        ranuras: { n: { hecho_id: 'hato.vacias_90d', campo: 'n' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('RANURA_NO_USADA');
  });
});

describe('validarSalidaMotor -- R-7 mecanizada (sin_dato / parcial)', () => {
  it('SIN_DATO_MAL_USADO -- cita un hecho sin_dato con destino que no es de captura', () => {
    const h = hecho({
      id: 'agu.jornales_semana',
      negocio: 'aguacate',
      confianza: 'sin_dato',
      destinos: ['agu.labores', 'agu.clima'],
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.jornales_semana'],
        destino_id: 'agu.clima', // consulta, no captura
        plantilla: 'Revisar el clima.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('SIN_DATO_MAL_USADO');
  });

  it('sin_dato con destino de captura SÍ pasa (R-7 permite capturar el hueco)', () => {
    const h = hecho({
      id: 'agu.jornales_semana',
      negocio: 'aguacate',
      confianza: 'sin_dato',
      destinos: ['agu.labores'],
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.jornales_semana'],
        destino_id: 'agu.labores', // captura
        plantilla: 'Registrar los jornales de la semana.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('SIN_DATO_MAL_USADO');
  });

  it('PARCIAL_SIN_ANCLA -- el primer hecho es parcial, sin ancla ok ni destino de captura', () => {
    const h = hecho({
      id: 'hato.cobertura_pesaje',
      negocio: 'hato_lechero',
      confianza: 'parcial',
      destinos: ['hato.produccion'],
      valores: { pesadas: valor('27'), total: valor('34') },
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.cobertura_pesaje'],
        destino_id: 'hato.produccion',
        plantilla: 'Atender la caída de producción.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('PARCIAL_SIN_ANCLA');
  });

  it('parcial CON un hecho ok de apoyo no dispara PARCIAL_SIN_ANCLA', () => {
    const parcial = hecho({
      id: 'hato.cobertura_pesaje',
      negocio: 'hato_lechero',
      confianza: 'parcial',
      destinos: ['hato.produccion'],
    });
    const ancla = hecho({
      id: 'hato.litros_por_vaca',
      negocio: 'hato_lechero',
      confianza: 'ok',
      destinos: ['hato.produccion'],
    });
    const paquete = paqueteConHechos([parcial, ancla]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.cobertura_pesaje', 'hato.litros_por_vaca'],
        destino_id: 'hato.produccion',
        plantilla: 'Revisar la producción de esta semana.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('PARCIAL_SIN_ANCLA');
  });
});

describe('validarSalidaMotor -- A-7(i) y A-8 mecánicos', () => {
  it('A7_YA_ATENDIDO -- el hecho que sostiene la acción ya tiene trabajo abierto', () => {
    const h = hecho({
      id: 'agu.aplicaciones_colgadas',
      negocio: 'aguacate',
      destinos: ['agu.aplicacion_cierre'],
      atendido_por: [{ tipo: 'aplicacion', referencia: 'app-1', etiqueta: 'Fumigación en curso', desde: '2026-08-01' }],
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.aplicaciones_colgadas'],
        destino_id: 'agu.aplicacion_cierre',
        plantilla: 'Cerrar las aplicaciones abiertas.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('A7_YA_ATENDIDO');
  });

  it('un hecho atendido SÍ puede citarse como segundo hecho de apoyo (A-7 sólo mira el primero)', () => {
    const sostiene = hecho({ id: 'agu.plaga.acaro', negocio: 'aguacate', destinos: ['agu.monitoreo'] });
    const apoyo = hecho({
      id: 'agu.aplicaciones_colgadas',
      negocio: 'aguacate',
      destinos: ['agu.monitoreo'],
      atendido_por: [{ tipo: 'aplicacion', referencia: 'app-1', etiqueta: 'Fumigación en curso', desde: '2026-08-01' }],
    });
    const paquete = paqueteConHechos([sostiene, apoyo]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.plaga.acaro', 'agu.aplicaciones_colgadas'],
        destino_id: 'agu.monitoreo',
        plantilla: 'Revisar el ácaro en el sublote.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('A7_YA_ATENDIDO');
  });

  it('A8_YA_VISIBLE -- todos los hechos citados son titulares del pulso', () => {
    const h = hecho({
      id: 'hato.litros_por_vaca',
      negocio: 'hato_lechero',
      destinos: ['hato.produccion'],
      titular_pulso: true,
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.litros_por_vaca'],
        destino_id: 'hato.produccion',
        plantilla: 'Revisar la producción del hato.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('A8_YA_VISIBLE');
  });

  it('no dispara A8_YA_VISIBLE si al menos uno de los hechos citados NO es titular', () => {
    const titular = hecho({ id: 'hato.litros_por_vaca', negocio: 'hato_lechero', destinos: ['hato.produccion'], titular_pulso: true });
    const noTitular = hecho({ id: 'hato.cobertura_pesaje', negocio: 'hato_lechero', destinos: ['hato.produccion'], titular_pulso: false });
    const paquete = paqueteConHechos([titular, noTitular]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.litros_por_vaca', 'hato.cobertura_pesaje'],
        destino_id: 'hato.produccion',
        plantilla: 'Revisar la cobertura de pesaje.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('A8_YA_VISIBLE');
  });
});

describe('validarSalidaMotor -- verbo fijado por el hecho', () => {
  const insumo = hecho({
    id: 'agu.insumo_faltante',
    negocio: 'aguacate',
    destinos: ['inv.producto'],
    verbos_permitidos: ['Confirmar', 'Verificar'],
    valores: { producto: valor('Silicalmag'), falta: valor('4.694 kg', 4694, 'kg') },
  });

  it('VERBO_NO_PERMITIDO_PARA_HECHO -- la plantilla no empieza por un verbo permitido', () => {
    const paquete = paqueteConHechos([insumo]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'inv.producto',
        plantilla: 'Comprar {falta} de {producto}.',
        ranuras: {
          falta: { hecho_id: 'agu.insumo_faltante', campo: 'falta' },
          producto: { hecho_id: 'agu.insumo_faltante', campo: 'producto' },
        },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    const codigos = rechazos.map((r) => r.codigo);
    expect(codigos).toContain('VERBO_NO_PERMITIDO_PARA_HECHO');
    // También lleva cifra libre: "Comprar 4.694 kg" tiene el dígito FUERA de
    // la ranura una vez sustituida -- no, aquí está dentro de la ranura, así
    // que sólo VERBO_NO_PERMITIDO_PARA_HECHO dispara (el caso con dígito
    // libre de verdad vive en accionesAntiInvento.test.ts).
    expect(codigos).not.toContain('CIFRA_LIBRE');
  });

  it('"Verificar" (el otro verbo permitido) también pasa', () => {
    const paquete = paqueteConHechos([insumo]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'inv.producto',
        plantilla: 'Verificar el stock de {producto}.',
        ranuras: { producto: { hecho_id: 'agu.insumo_faltante', campo: 'producto' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('VERBO_NO_PERMITIDO_PARA_HECHO');
  });

  it('no confunde "Confirmara" con el verbo "Confirmar" (respeta el límite de palabra)', () => {
    const paquete = paqueteConHechos([insumo]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'inv.producto',
        plantilla: 'Confirmara el stock de {producto}.',
        ranuras: { producto: { hecho_id: 'agu.insumo_faltante', campo: 'producto' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('VERBO_NO_PERMITIDO_PARA_HECHO');
  });
});

describe('validarSalidaMotor -- contenido libre (cifras, numerales, fechas)', () => {
  const h = hecho({
    id: 'hato.vacias_90d',
    negocio: 'hato_lechero',
    destinos: ['hato.lista_vacias'],
    valores: { n: valor('11', 11, 'vacas') },
  });

  it('CIFRA_LIBRE -- un dígito fuera de una ranura', () => {
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las 11 vacas vacías.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('CIFRA_LIBRE');
  });

  it('CIFRA_LIBRE -- un porcentaje fuera de ranura', () => {
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'La incidencia subió 25,5%.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('CIFRA_LIBRE');
  });

  it('NUMERAL_EN_LETRA -- "once" en vez de la ranura', () => {
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las once vacas vacías.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('NUMERAL_EN_LETRA');
  });

  it('"un"/"una"/"uno" NO disparan NUMERAL_EN_LETRA (excepción explícita del léxico)', () => {
    expect(contieneNumeralEnLetra('Registrar una quincena de leche')).toBe(false);
    expect(contieneNumeralEnLetra('Confirmar un producto')).toBe(false);
  });

  it('FECHA_EN_LETRA -- un mes escrito en letra', () => {
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar la ejecución presupuestal de julio.',
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).toContain('FECHA_EN_LETRA');
  });

  it('los números y ranuras dentro de {llaves} no cuentan -- una plantilla legítima pasa limpia', () => {
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas vacías.',
        ranuras: { n: { hecho_id: 'hato.vacias_90d', campo: 'n' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toEqual(
      expect.arrayContaining(['CIFRA_LIBRE', 'NUMERAL_EN_LETRA', 'FECHA_EN_LETRA']),
    );
  });

  it('NUMERALES_ES y FECHAS_EN_LETRA están exportados y no están vacíos', () => {
    expect(NUMERALES_ES.length).toBeGreaterThan(0);
    expect(FECHAS_EN_LETRA).toHaveLength(19); // 12 meses + 7 días
    expect(contieneFechaEnLetra('el lunes revisamos')).toBe(true);
  });
});

describe('validarSalidaMotor -- LONGITUD', () => {
  it('rechaza una plantilla renderizada de más de 90 caracteres', () => {
    const h = hecho({
      id: 'hato.vacias_90d',
      negocio: 'hato_lechero',
      destinos: ['hato.lista_vacias'],
      valores: { relleno: valor('x'.repeat(80)) },
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar esto: {relleno}',
        ranuras: { relleno: { hecho_id: 'hato.vacias_90d', campo: 'relleno' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    const rechazoLongitud = rechazos.find((r) => r.codigo === 'LONGITUD');
    expect(rechazoLongitud).toBeDefined();
  });

  it(`una plantilla de exactamente ${MAX_LONGITUD_PLANTILLA_RENDERIZADA} caracteres SÍ pasa (el límite es estricto: > 90, no >=)`, () => {
    const relleno = 'x'.repeat(MAX_LONGITUD_PLANTILLA_RENDERIZADA - 'Ver: '.length);
    const h = hecho({
      id: 'hato.vacias_90d',
      negocio: 'hato_lechero',
      destinos: ['hato.lista_vacias'],
      valores: { relleno: valor(relleno) },
    });
    const paquete = paqueteConHechos([h]);
    const salida = salidaMotor([
      accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_90d'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Ver: {relleno}',
        ranuras: { relleno: { hecho_id: 'hato.vacias_90d', campo: 'relleno' } },
      }),
    ]);
    const { rechazos } = validarSalidaMotor(salida, paquete);
    expect(rechazos.map((r) => r.codigo)).not.toContain('LONGITUD');
  });
});

describe('validarSalidaMotor -- reglas cruzadas (cupos y duplicados)', () => {
  it('EXCEDE_CUPO -- una cuarta acción para el mismo negocio se rechaza, las 3 primeras se aceptan', () => {
    // Cuatro destinos DISTINTOS a propósito -- si compartieran destino_id,
    // DESTINO_REPETIDO dispararía antes y este test dejaría de aislar
    // EXCEDE_CUPO.
    const destinosDistintos: Array<'agu.tarea_detalle' | 'agu.monitoreo' | 'agu.labores' | 'agu.clima'> = [
      'agu.tarea_detalle',
      'agu.monitoreo',
      'agu.labores',
      'agu.clima',
    ];
    const hechos = destinosDistintos.map((destino, i) =>
      hecho({ id: `agu.h${i}`, negocio: 'aguacate', destinos: [destino] }),
    );
    const paquete = paqueteConHechos(hechos);
    const salida = salidaMotor(
      hechos.map((h, i) =>
        accionGenerada({
          negocio: 'aguacate',
          hecho_ids: [h.id],
          destino_id: destinosDistintos[i],
          plantilla: 'Programar la tarea pendiente.',
        }),
      ),
    );
    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(aceptadas).toHaveLength(MAX_ACCIONES_POR_NEGOCIO);
    const rechazoExtra = rechazos.find((r) => r.codigo === 'EXCEDE_CUPO' && r.accion_indice === 3);
    expect(rechazoExtra).toBeDefined();
  });

  it('EXCEDE_CUPO_REVISION -- una segunda acción O-8 para el mismo negocio se rechaza', () => {
    const h1 = hecho({ id: 'rev.aguacate.ejecucion_presupuestal', negocio: 'aguacate', origen: 'O8_revision', destinos: ['fin.presupuesto'] });
    const h2 = hecho({ id: 'rev.aguacate.otra_revision', negocio: 'aguacate', origen: 'O8_revision', destinos: ['agu.monitoreo'] });
    const paquete = paqueteConHechos([h1, h2]);
    const salida = salidaMotor([
      accionGenerada({ negocio: 'aguacate', hecho_ids: [h1.id], destino_id: 'fin.presupuesto', plantilla: 'Revisar el presupuesto.' }),
      accionGenerada({ negocio: 'aguacate', hecho_ids: [h2.id], destino_id: 'agu.monitoreo', plantilla: 'Revisar el monitoreo pendiente.' }),
    ]);
    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(aceptadas).toHaveLength(1);
    expect(aceptadas[0].hecho_ids).toEqual([h1.id]);
    const rechazoExtra = rechazos.find((r) => r.codigo === 'EXCEDE_CUPO_REVISION' && r.accion_indice === 1);
    expect(rechazoExtra).toBeDefined();
  });

  it('DESTINO_REPETIDO -- dos acciones del mismo negocio con el mismo destino_id', () => {
    const h1 = hecho({ id: 'hato.vacias_90d', negocio: 'hato_lechero', destinos: ['hato.lista_hato'] });
    const h2 = hecho({ id: 'hato.sin_raza', negocio: 'hato_lechero', destinos: ['hato.lista_hato'] });
    const paquete = paqueteConHechos([h1, h2]);
    const salida = salidaMotor([
      accionGenerada({ negocio: 'hato_lechero', hecho_ids: [h1.id], destino_id: 'hato.lista_hato', plantilla: 'Revisar las vacías del hato.' }),
      accionGenerada({ negocio: 'hato_lechero', hecho_ids: [h2.id], destino_id: 'hato.lista_hato', plantilla: 'Revisar la raza sin registrar.' }),
    ]);
    const { aceptadas, rechazos } = validarSalidaMotor(salida, paquete);
    expect(aceptadas).toHaveLength(1);
    const rechazoExtra = rechazos.find((r) => r.codigo === 'DESTINO_REPETIDO' && r.accion_indice === 1);
    expect(rechazoExtra).toBeDefined();
  });
});

describe('validarSalidaMotor -- nunca lanza', () => {
  it('una SalidaMotor vacía produce listas vacías, sin excepción', () => {
    const paquete = paqueteConHechos([]);
    const { aceptadas, rechazos } = validarSalidaMotor(salidaMotor([]), paquete);
    expect(aceptadas).toEqual([]);
    expect(rechazos).toEqual([]);
  });
});
