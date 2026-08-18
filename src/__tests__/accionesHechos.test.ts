/**
 * Tests unitarios de `src/utils/accionesHechos.ts` -- §3.3, §3.3 bis,
 * §3.3 ter y §6.2 de `docs/brief_tecnico_motor_acciones.md`.
 *
 * Los datos de `agu.insumo_faltante` y `agu.tarea_atascada` reproducen los
 * casos reales de producción (2026-08-16/17) que motivaron el hecho
 * bloqueante y su corrección de estado (ver el header del módulo, puente 3).
 */

import { describe, expect, it } from 'vitest';
import {
  UMBRAL_FALTANTE_RELATIVO,
  VENTANA_APLICACION_CALCULADA_DIAS,
  VENTANA_APLICACION_ARRANCA_DIAS,
  DIAS_APLICACION_COLGADA_UMBRAL,
  evaluarSelector,
  evaluarSelectorFecha,
  evaluarDisparo,
  construirHechoVaciasLargas,
  construirHechoSecadoVencido,
  construirHechoProximasASecar,
  construirHechoRechequeoVencido,
  construirHechoUltimoChequeo,
  construirHechoCoberturaPesaje,
  construirHechoLitrosPorVaca,
  construirHechoServicios90d,
  construirHechoSinRaza,
  construirHechosPlaga,
  construirHechoRondaEdad,
  construirHechoCoberturaRonda,
  construirHechosInsumoFaltante,
  construirHechoTareaAtascada,
  construirHechoAplicacionesColgadas,
  construirHechosAplicacionArranca,
  construirHechoJornalesSemana,
  construirHechoLluviaConfianza,
  construirHechoGanadoInventario,
  construirHechoGanadoVariacion30d,
  construirHechoGanadoFincasSinHa,
  construirHechoGanadoConcentracion,
  construirHechoRevisionPeriodica,
  type AnimalHatoParaAcciones,
  type EntradaSelectores,
  type FilaAplicacionInsumo,
  type FilaTareaAtascada,
  type RevisionPeriodicaFila,
} from '@/utils/accionesHechos';

const HOY = '2026-08-16';

function animal(overrides: Partial<AnimalHatoParaAcciones> & Pick<AnimalHatoParaAcciones, 'animalId'>): AnimalHatoParaAcciones {
  return {
    numero: null,
    nombre: null,
    estadoAnimal: 'activa',
    ultimoPartoFecha: null,
    ultimoChequeoFecha: null,
    derivado: {
      estado: 'servida',
      fecha_secar: null,
      alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false },
    },
    ...overrides,
  };
}

function entradaVacia(overrides: Partial<EntradaSelectores> = {}): EntradaSelectores {
  return {
    animalesHato: null,
    priorizacion: null,
    ganado: null,
    config: null,
    hoy: HOY,
    ...overrides,
  };
}

// ============================================================================
// §6.2 -- evaluarSelector / evaluarSelectorFecha
// ============================================================================

describe('evaluarSelector', () => {
  it('null cuando el negocio no cargó (nunca 0 por defecto)', () => {
    expect(evaluarSelector('hato.vacias_90d', entradaVacia())).toBeNull();
    expect(evaluarSelector('hato.secado_vencido', entradaVacia())).toBeNull();
    expect(evaluarSelector('agu.plaga_sobre_umbral', entradaVacia())).toBeNull();
    expect(evaluarSelector('gan.pendientes', entradaVacia())).toBeNull();
    expect(evaluarSelector('gan.fincas_sin_ha', entradaVacia())).toBeNull();
  });

  it('hato.vacias_90d replica la regla de vaciasMasDeNDias: activa + estado vacío + ultimoPartoFecha >= umbral', () => {
    const animales: AnimalHatoParaAcciones[] = [
      animal({ animalId: '1', estadoAnimal: 'activa', ultimoPartoFecha: '2026-05-01', derivado: { estado: 'parida_reciente', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }), // 107 días
      animal({ animalId: '2', estadoAnimal: 'activa', ultimoPartoFecha: '2026-08-01', derivado: { estado: 'vacia_por_servir', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }), // 15 días, no llega
      animal({ animalId: '3', estadoAnimal: 'activa', ultimoPartoFecha: null, derivado: { estado: 'vacia_por_servir', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }), // sin fecha -- no entra
      animal({ animalId: '4', estadoAnimal: 'vendida', ultimoPartoFecha: '2026-01-01', derivado: { estado: 'vacia_por_servir', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }), // no activa
      animal({ animalId: '5', estadoAnimal: 'activa', ultimoPartoFecha: '2026-01-01', derivado: { estado: 'preñada', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }), // preñada, no vacía
    ];
    const entrada = entradaVacia({ animalesHato: animales, config: { dias_espera_voluntaria_post_parto: 90 } });
    expect(evaluarSelector('hato.vacias_90d', entrada)).toBe(1);
  });

  it('hato.secado_vencido / hato.rechequeo_vencido cuentan la bandera booleana ya derivada', () => {
    const animales: AnimalHatoParaAcciones[] = [
      animal({ animalId: '1', derivado: { estado: 'proxima_a_secar', fecha_secar: '2026-08-01', alertas: { secado_due: true, rechequeo_due: false, parto_proximo: false } } }),
      animal({ animalId: '2', derivado: { estado: 'preñada', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: true, parto_proximo: false } } }),
      animal({ animalId: '3', derivado: { estado: 'servida', fecha_secar: null, alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }),
    ];
    const entrada = entradaVacia({ animalesHato: animales });
    expect(evaluarSelector('hato.secado_vencido', entrada)).toBe(1);
    expect(evaluarSelector('hato.rechequeo_vencido', entrada)).toBe(1);
  });

  it('agu.plaga_sobre_umbral cuenta tier A + estadoUmbral over', () => {
    const entrada = entradaVacia({
      priorizacion: [
        { sublote_id: 's1', lote_id: 'l1', pest_id: 'p1', pest_nombre: 'Ácaro', tier: 'A', estadoUmbral: 'over', incidenciaActual: 20, tendencia: 'subiendo', numRondas: 3 },
        { sublote_id: 's2', lote_id: 'l1', pest_id: 'p2', pest_nombre: 'Trips', tier: 'A', estadoUmbral: 'approaching', incidenciaActual: 8, tendencia: 'estable', numRondas: 3 },
        { sublote_id: 's3', lote_id: 'l1', pest_id: 'p3', pest_nombre: 'Beneficos', tier: 'B', incidenciaActual: 5, tendencia: 'bajando', numRondas: 3 },
      ],
    });
    expect(evaluarSelector('agu.plaga_sobre_umbral', entrada)).toBe(1);
  });

  it('gan.pendientes / gan.fincas_sin_ha leen el resumen ya cargado', () => {
    const entrada = entradaVacia({
      ganado: {
        total: { cabezas: 369, novillos: 300, toros: 69 },
        por_finca: [
          { finca: 'A', hectareas: 0, cabezas: 100, novillos: 90, toros: 10 },
          { finca: 'B', hectareas: 0, cabezas: 269, novillos: 210, toros: 59 },
        ],
        variacion_30_dias: { entradas: 5, salidas: 2, neto: 3 },
        pendientes_confirmacion: { total: 2 },
      },
    });
    expect(evaluarSelector('gan.pendientes', entrada)).toBe(2);
    expect(evaluarSelector('gan.fincas_sin_ha', entrada)).toBe(2);
  });

  it('los cuatro selectores fuera del alcance de EntradaSelectores devuelven null, nunca inventan un conteo', () => {
    const entrada = entradaVacia({ animalesHato: [], priorizacion: [], ganado: null, config: { dias_espera_voluntaria_post_parto: 90 } });
    expect(evaluarSelector('hato.sin_pesar', entrada)).toBeNull();
    expect(evaluarSelector('agu.aplicaciones_colgadas', entrada)).toBeNull();
    expect(evaluarSelector('agu.insumo_faltante', entrada)).toBeNull();
    expect(evaluarSelector('agu.tarea_atascada', entrada)).toBeNull();
  });
});

describe('evaluarSelectorFecha', () => {
  it('hato.ultimo_chequeo_fecha es el máximo ultimoChequeoFecha entre animales', () => {
    const entrada = entradaVacia({
      animalesHato: [
        animal({ animalId: '1', ultimoChequeoFecha: '2026-06-01' }),
        animal({ animalId: '2', ultimoChequeoFecha: '2026-07-09' }),
        animal({ animalId: '3', ultimoChequeoFecha: null }),
      ],
    });
    expect(evaluarSelectorFecha('hato.ultimo_chequeo_fecha', entrada)).toBe('2026-07-09');
  });

  it('null cuando no hay animales o ninguno tiene chequeo', () => {
    expect(evaluarSelectorFecha('hato.ultimo_chequeo_fecha', entradaVacia())).toBeNull();
    expect(evaluarSelectorFecha('hato.ultimo_chequeo_fecha', entradaVacia({ animalesHato: [animal({ animalId: '1' })] }))).toBeNull();
  });

  it('cualquier otro id devuelve null -- no es un selector de fecha', () => {
    expect(evaluarSelectorFecha('hato.vacias_90d', entradaVacia())).toBeNull();
  });
});

// ============================================================================
// Hato Lechero
// ============================================================================

describe('construirHechoVaciasLargas', () => {
  it('agrega cantidad/dias_esperando/tamano_conjunto sobre el conjunto ya filtrado', () => {
    const vacias = [
      animal({ animalId: '1', numero: 47, nombre: 'Estrella', ultimoPartoFecha: '2026-04-01' }), // 137 días
      animal({ animalId: '2', numero: 12, nombre: null, ultimoPartoFecha: '2026-05-01' }), // 107 días
    ];
    const h = construirHechoVaciasLargas(vacias, 90, 35, HOY);
    expect(h).not.toBeNull();
    expect(h!.id).toBe('hato.vacias_90d');
    expect(h!.negocio).toBe('hato_lechero');
    expect(h!.destinos).toEqual(['hato.lista_vacias']);
    expect(h!.confianza).toBe('ok');
    expect(h!.valores.cantidad.crudo).toBe(2);
    expect(h!.valores.total_hato.crudo).toBe(35);
    expect(h!.valores.dias_umbral.crudo).toBe(90);
    expect(h!.valores.nombres.render).toContain('Estrella');
    expect(h!.valores.nombres.render).toContain('#12');
    expect(h!.dias_esperando).toBe(137);
    expect(h!.tamano_conjunto).toBe(2);
    expect(h!.fecha_limite).toBeNull();
  });

  it('null cuando el conjunto ya filtrado está vacío -- 0 vacías no es una acción', () => {
    expect(construirHechoVaciasLargas([], 90, 35, HOY)).toBeNull();
  });

  it('trunca la lista de nombres a 5 + "y N más" (§3.6)', () => {
    const vacias = Array.from({ length: 7 }, (_, i) =>
      animal({ animalId: String(i), numero: i, ultimoPartoFecha: '2026-05-01' }),
    );
    const h = construirHechoVaciasLargas(vacias, 90, 35, HOY)!;
    expect(h.valores.nombres.render).toContain('y 2 más');
  });

  it('defecto 1, caso AMBIGUO: NO expone `valores.unidad` -- el hecho mezcla \'vacas\' y \'días\', un campo único sería el mismo defecto disfrazado', () => {
    const vacias = [animal({ animalId: '1', numero: 47, ultimoPartoFecha: '2026-04-01' })];
    const h = construirHechoVaciasLargas(vacias, 90, 35, HOY)!;
    expect(h.valores.cantidad.unidad).toBe('vacas');
    expect(h.valores.dias_umbral.unidad).toBe('días');
    expect(h.valores.unidad).toBeUndefined();
  });
});

describe('construirHechoSecadoVencido / construirHechoProximasASecar', () => {
  it('secado vencido usa la fecha_secar más antigua como fecha_limite y dias_max_vencido', () => {
    const animales = [
      animal({ animalId: '1', numero: 5, derivado: { estado: 'proxima_a_secar', fecha_secar: '2026-08-01', alertas: { secado_due: true, rechequeo_due: false, parto_proximo: false } } }),
      animal({ animalId: '2', numero: 6, derivado: { estado: 'proxima_a_secar', fecha_secar: '2026-08-10', alertas: { secado_due: true, rechequeo_due: false, parto_proximo: false } } }),
    ];
    const h = construirHechoSecadoVencido(animales, HOY)!;
    expect(h.id).toBe('hato.secado_vencido');
    expect(h.destinos).toEqual(['hato.lista_secado']);
    expect(h.fecha_limite).toBe('2026-08-01');
    expect(h.valores.dias_max_vencido.crudo).toBe(diasEntreParaTest('2026-08-01', HOY));
    expect(h.tamano_conjunto).toBe(2);
  });

  it('null sin animales', () => {
    expect(construirHechoSecadoVencido([], HOY)).toBeNull();
    expect(construirHechoProximasASecar([], HOY)).toBeNull();
  });

  it('próximas a secar usa la fecha más cercana como fecha_limite', () => {
    const animales = [
      animal({ animalId: '1', derivado: { estado: 'proxima_a_secar', fecha_secar: '2026-09-01', alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }),
      animal({ animalId: '2', derivado: { estado: 'proxima_a_secar', fecha_secar: '2026-08-20', alertas: { secado_due: false, rechequeo_due: false, parto_proximo: false } } }),
    ];
    const h = construirHechoProximasASecar(animales, HOY)!;
    expect(h.fecha_limite).toBe('2026-08-20');
  });
});

describe('construirHechoRechequeoVencido', () => {
  it('cantidad + dias_esperando desde el último chequeo más antiguo', () => {
    const animales = [
      animal({ animalId: '1', ultimoChequeoFecha: '2026-06-01' }),
      animal({ animalId: '2', ultimoChequeoFecha: '2026-07-01' }),
    ];
    const h = construirHechoRechequeoVencido(animales, HOY)!;
    expect(h.id).toBe('hato.rechequeo_vencido');
    expect(h.destinos).toEqual(['hato.chequeos']);
    expect(h.valores.cantidad.crudo).toBe(2);
    expect(h.dias_esperando).toBe(diasEntreParaTest('2026-06-01', HOY));
  });

  it('null sin animales', () => {
    expect(construirHechoRechequeoVencido([], HOY)).toBeNull();
  });

  it('defecto 1, caso de UNA sola unidad: SÍ expone `valores.unidad` -- referenciable por una ranura {unidad}', () => {
    const animales = [animal({ animalId: '1', ultimoChequeoFecha: '2026-06-01' })];
    const h = construirHechoRechequeoVencido(animales, HOY)!;
    expect(h.valores.cantidad.unidad).toBe('vacas');
    expect(h.valores.unidad).toBeDefined();
    expect(h.valores.unidad.crudo).toBe('vacas');
    expect(h.valores.unidad.render).toBe('vacas');
  });
});

describe('construirHechoUltimoChequeo', () => {
  it('sin_dato + "nunca" cuando no hay chequeo', () => {
    const h = construirHechoUltimoChequeo(null, HOY);
    expect(h.confianza).toBe('sin_dato');
    expect(h.texto).toContain('nunca');
    expect(h.valores.fecha.render).toBe('s/d');
  });

  it('ok con fecha y días cuando sí hay chequeo', () => {
    const h = construirHechoUltimoChequeo('2026-07-09', HOY);
    expect(h.confianza).toBe('ok');
    expect(h.valores.fecha.crudo).toBe('2026-07-09');
    expect(h.valores.dias.crudo).toBe(diasEntreParaTest('2026-07-09', HOY));
    expect(h.dias_esperando).toBe(diasEntreParaTest('2026-07-09', HOY));
  });
});

describe('construirHechoCoberturaPesaje', () => {
  it('parcial siempre que falte al menos una vaca, aunque sea una sola (§3.3)', () => {
    const h = construirHechoCoberturaPesaje(27, 34, '2026-08-12', HOY)!;
    expect(h.confianza).toBe('parcial');
    expect(h.valores.pesadas.crudo).toBe(27);
    expect(h.valores.total.crudo).toBe(34);
    expect(h.tamano_conjunto).toBe(7);
    expect(h.destinos).toEqual(['hato.pesaje']);
  });

  it('null cuando la cobertura está completa -- no es una acción', () => {
    expect(construirHechoCoberturaPesaje(34, 34, '2026-08-12', HOY)).toBeNull();
  });

  it('null cuando el denominador es 0', () => {
    expect(construirHechoCoberturaPesaje(0, 0, null, HOY)).toBeNull();
  });
});

describe('construirHechoLitrosPorVaca', () => {
  it('null sin pesajes (§3.3: "sin pesajes ⇒ no se emite")', () => {
    expect(construirHechoLitrosPorVaca(null, null, null, HOY)).toBeNull();
  });

  it('ok con denominador, parcial sin denominador', () => {
    const ok = construirHechoLitrosPorVaca(12.5, '2026-08-12', 27, HOY)!;
    expect(ok.confianza).toBe('ok');
    expect(ok.valores.litros.crudo).toBe(12.5);
    expect(ok.destinos).toEqual(['hato.produccion']);

    const parcial = construirHechoLitrosPorVaca(12.5, '2026-08-12', null, HOY)!;
    expect(parcial.confianza).toBe('parcial');
  });
});

describe('construirHechoServicios90d', () => {
  it('confianza parcial SIEMPRE (§3.3, regla explícita)', () => {
    const h = construirHechoServicios90d(9, 4, 27, HOY)!;
    expect(h.confianza).toBe('parcial');
    expect(h.valores.servicios.crudo).toBe(9);
    expect(h.valores.prenadas.crudo).toBe(4);
    expect(h.valores.total_ordeno.crudo).toBe(27);
  });

  it('null sin denominador', () => {
    expect(construirHechoServicios90d(0, 0, 0, HOY)).toBeNull();
  });
});

describe('construirHechoSinRaza', () => {
  it('cuenta y null cuando es 0', () => {
    expect(construirHechoSinRaza(0, HOY)).toBeNull();
    const h = construirHechoSinRaza(3, HOY)!;
    expect(h.valores.cantidad.crudo).toBe(3);
    expect(h.confianza).toBe('sin_dato');
  });
});

// ============================================================================
// Aguacate Hass
// ============================================================================

describe('construirHechosPlaga', () => {
  it('un Hecho por entrada, id con slug del nombre de la plaga', () => {
    const hechos = construirHechosPlaga(
      [
        { sublote_id: 's1', sublote_nombre: 'El Salto Alto', lote_id: 'l1', lote_nombre: 'El Salto', pest_id: 'p1', pest_nombre: 'Huevos de Ácaro', tier: 'A', estadoUmbral: 'over', umbralPct: 15, incidenciaActual: 22.5, tendencia: 'subiendo', numRondas: 4 },
      ],
      '2026-08-10',
      HOY,
    );
    expect(hechos).toHaveLength(1);
    expect(hechos[0].id).toBe('agu.plaga.huevos_de_acaro');
    expect(hechos[0].valores.incidencia.crudo).toBe(22.5);
    expect(hechos[0].valores.umbral_pct?.crudo).toBe(15);
    expect(hechos[0].valores.sublote.render).toBe('El Salto Alto');
    expect(hechos[0].destinos).toEqual(['agu.monitoreo', 'agu.monitoreo_sublote']);
  });

  it('sin umbral (tier B) no incluye umbral_pct', () => {
    const hechos = construirHechosPlaga(
      [{ sublote_id: 's1', lote_id: 'l1', pest_id: 'p2', pest_nombre: 'Beneficos', tier: 'B', incidenciaActual: 4, tendencia: 'estable', numRondas: 2 }],
      '2026-08-10',
      HOY,
    );
    expect(hechos[0].valores.umbral_pct).toBeUndefined();
  });
});

describe('construirHechoRondaEdad', () => {
  it('sin_dato sin rondas', () => {
    const h = construirHechoRondaEdad(null, HOY);
    expect(h.confianza).toBe('sin_dato');
  });
  it('ok con fecha', () => {
    const h = construirHechoRondaEdad('2026-08-10', HOY);
    expect(h.valores.dias.crudo).toBe(diasEntreParaTest('2026-08-10', HOY));
  });
});

describe('construirHechoCoberturaRonda', () => {
  it('parcial cuando faltan sublotes por revisar', () => {
    const h = construirHechoCoberturaRonda(10, 12, ['Sublote X', 'Sublote Y'], HOY)!;
    expect(h.confianza).toBe('parcial');
    expect(h.tamano_conjunto).toBe(2);
  });
  it('null con cobertura completa', () => {
    expect(construirHechoCoberturaRonda(12, 12, [], HOY)).toBeNull();
  });
});

describe('construirHechosInsumoFaltante -- caso de oro (producción 2026-08-16/17)', () => {
  const filaEnmienda: FilaAplicacionInsumo = {
    aplicacionId: 'app-enmienda',
    aplicacionNombre: 'Aplicacion Enmienda',
    aplicacionEstado: 'Calculada',
    fechaInicioPlaneada: '2026-08-18',
    productoId: 'prod-silicalmag',
    productoNombre: 'Silicalmag',
    productoUnidad: 'Kilos',
    cantidadNecesaria: 12694,
    cantidadDisponible: 8000,
  };
  const filaAcondicionador: FilaAplicacionInsumo = {
    aplicacionId: 'app-en-curso-1',
    aplicacionNombre: 'Fumigacion en curso 1',
    aplicacionEstado: 'En ejecución',
    fechaInicioPlaneada: '2026-08-01',
    productoId: 'prod-acondicionador',
    productoNombre: 'Acondicionador sys',
    productoUnidad: 'Litros',
    cantidadNecesaria: 3.05,
    cantidadDisponible: 2.85,
  };
  const filaMagister: FilaAplicacionInsumo = {
    aplicacionId: 'app-en-curso-2',
    aplicacionNombre: 'Fumigacion en curso 2',
    aplicacionEstado: 'En ejecución',
    fechaInicioPlaneada: '2026-08-01',
    productoId: 'prod-magister',
    productoNombre: 'Magister',
    productoUnidad: 'Litros',
    cantidadNecesaria: 9.13,
    cantidadDisponible: 9.0,
  };
  const filaProxam: FilaAplicacionInsumo = {
    ...filaMagister,
    productoId: 'prod-proxam',
    productoNombre: 'Proxam 200 EC',
  };

  it('12.694 necesarios / 8.000 disponibles -> falta 4.694, confianza ok, verbo Confirmar/Verificar', () => {
    const hechos = construirHechosInsumoFaltante([filaEnmienda], HOY);
    expect(hechos).toHaveLength(1);
    const h = hechos[0];
    expect(h.id).toBe('agu.insumo_faltante.aplicacion_enmienda.silicalmag');
    expect(h.confianza).toBe('ok');
    expect(h.valores.necesario.crudo).toBe(12694);
    expect(h.valores.disponible.crudo).toBe(8000);
    expect(h.valores.falta.crudo).toBe(4694);
    expect(h.valores.falta.unidad).toBe('kg');
    expect(h.fecha_limite).toBe('2026-08-18');
    expect(h.verbos_permitidos).toEqual(['Confirmar', 'Verificar']);
    expect(h.destinos).toEqual(['agu.aplicacion_detalle', 'inv.producto']);
  });

  it('defecto 1 (verificación visual 2026-08-17): {unidad} es una ranura referenciable que renderiza "kg", sin pisar el render del número', () => {
    const hechos = construirHechosInsumoFaltante([filaEnmienda], HOY);
    const h = hechos[0];
    // necesario/disponible/falta comparten la MISMA unidad ('kg') -- el
    // caso exacto que reprodujo la pantalla real ("Confirmar 4.694 12.694
    // de Silicalmag"): antes de este fix no existía un campo `unidad` al
    // que una ranura `{unidad}` pudiera apuntar.
    expect(h.valores.unidad).toBeDefined();
    expect(h.valores.unidad.crudo).toBe('kg');
    expect(h.valores.unidad.render).toBe('kg');
    // El render del número NUNCA lleva la unidad pegada -- si la llevara,
    // una plantilla "{falta} {unidad}" acabaría en "4.694 kg kg".
    expect(h.valores.falta.render).toBe('4.694');
    expect(h.valores.falta.render).not.toContain('kg');
    expect(h.valores.necesario.render).not.toContain('kg');
  });

  it('defecto 1: la unidad sigue siendo referenciable en la rama sin_dato (disponible/falta en s/d)', () => {
    const filaSinStock: FilaAplicacionInsumo = { ...filaEnmienda, cantidadDisponible: null };
    const hechos = construirHechosInsumoFaltante([filaSinStock], HOY);
    const h = hechos[0];
    expect(h.confianza).toBe('sin_dato');
    expect(h.valores.unidad?.render).toBe('kg');
  });

  it('el piso de ruido del 2% filtra Magister y Proxam (1,4% de faltante) pero no Acondicionador sys (6,6%)', () => {
    const relativoMagister = (9.13 - 9.0) / 9.13;
    expect(relativoMagister).toBeLessThan(UMBRAL_FALTANTE_RELATIVO);
    const relativoAcondicionador = (3.05 - 2.85) / 3.05;
    expect(relativoAcondicionador).toBeGreaterThan(UMBRAL_FALTANTE_RELATIVO);

    const hechos = construirHechosInsumoFaltante([filaAcondicionador, filaMagister, filaProxam], HOY);
    expect(hechos).toHaveLength(1);
    expect(hechos[0].valores.producto.crudo).toBe('Acondicionador sys');
  });

  it('agrega los cuatro casos reales: Enmienda pasa entera, sólo Acondicionador sys de las tres menores', () => {
    const hechos = construirHechosInsumoFaltante([filaEnmienda, filaAcondicionador, filaMagister, filaProxam], HOY);
    const productos = hechos.map((h) => h.valores.producto.crudo);
    expect(productos).toEqual(['Silicalmag', 'Acondicionador sys']);
  });

  it('cantidad_actual NULL ⇒ sin_dato, texto "sin stock registrado", nunca "faltan N"', () => {
    const filaSinStock: FilaAplicacionInsumo = { ...filaEnmienda, cantidadDisponible: null };
    const hechos = construirHechosInsumoFaltante([filaSinStock], HOY);
    expect(hechos).toHaveLength(1);
    expect(hechos[0].confianza).toBe('sin_dato');
    expect(hechos[0].texto).toContain('sin stock registrado');
    expect(hechos[0].texto).not.toMatch(/faltan/i);
    expect(hechos[0].valores.disponible.crudo).toBeNull();
  });

  it('una aplicación Calculada fuera de la ventana de 14 días no produce hecho', () => {
    const lejana: FilaAplicacionInsumo = {
      ...filaEnmienda,
      fechaInicioPlaneada: `2026-${String(Number(HOY.slice(5, 7)) + 3).padStart(2, '0')}-01`,
    };
    expect(construirHechosInsumoFaltante([lejana], HOY)).toEqual([]);
  });

  it('en el borde de la ventana (14 días exactos) sí produce hecho', () => {
    const enElBorde: FilaAplicacionInsumo = { ...filaEnmienda, fechaInicioPlaneada: '2026-08-30' }; // hoy + 14
    expect(diasEntreParaTest(HOY, '2026-08-30')).toBe(VENTANA_APLICACION_CALCULADA_DIAS);
    expect(construirHechosInsumoFaltante([enElBorde], HOY)).toHaveLength(1);
  });

  it('faltante <= 0 no produce hecho (sobra stock, no falta)', () => {
    const sobra: FilaAplicacionInsumo = { ...filaEnmienda, cantidadDisponible: 20000 };
    expect(construirHechosInsumoFaltante([sobra], HOY)).toEqual([]);
  });

  it('A-7(i): un atendido_por ya poblado por el llamador viaja al Hecho', () => {
    const atendido = { 'app-enmienda|prod-silicalmag': [{ tipo: 'compra' as const, referencia: 'c1', etiqueta: 'Compra de Silicalmag', desde: '2026-08-15' }] };
    const hechos = construirHechosInsumoFaltante([filaEnmienda], HOY, atendido);
    expect(hechos[0].atendido_por).toHaveLength(1);
  });
});

describe('construirHechoTareaAtascada -- caso de oro (Hércules, microbiología)', () => {
  it('estado "En Proceso" SÍ cuenta (puente 3 del header: el brief dice Banco/Programada, el caso real está En Proceso)', () => {
    const tareas: FilaTareaAtascada[] = [
      {
        id: 't1',
        nombre: 'Preparación y aplicación microbiología',
        estado: 'En Proceso',
        fechaEstimadaInicio: '2026-01-29',
        createdAt: '2026-01-20T10:00:00Z',
      },
    ];
    const h = construirHechoTareaAtascada(tareas, HOY)!;
    expect(h).not.toBeNull();
    expect(h.id).toBe('agu.tarea_atascada');
    // ~200 días de atraso (dato aproximado del encargo); el valor exacto,
    // calendario en mano, es 199 -- se fija contra el cálculo, no contra el
    // redondeo aproximado del encargo.
    expect(h.valores.dias_max.crudo).toBe(diasEntreParaTest('2026-01-29', HOY));
    expect(h.dias_esperando).toBe(diasEntreParaTest('2026-01-29', HOY));
    expect(h.fecha_limite).toBeNull(); // sin fecha encima, sólo antigüedad (ver accionesOrden.test.ts)
    expect(h.valores.nombres.render).toContain('Preparación y aplicación microbiología');
  });

  it('usa created_at como fallback cuando fecha_estimada_inicio es null', () => {
    const tareas: FilaTareaAtascada[] = [
      { id: 't2', nombre: 'Sin fecha estimada', estado: 'Banco', fechaEstimadaInicio: null, createdAt: '2026-06-01T00:00:00Z' },
    ];
    const h = construirHechoTareaAtascada(tareas, HOY)!;
    expect(h.dias_esperando).toBe(diasEntreParaTest('2026-06-01', HOY));
  });

  it('Completada/Cancelada nunca cuentan', () => {
    const tareas: FilaTareaAtascada[] = [
      { id: 't3', nombre: 'Ya cerrada', estado: 'Completada', fechaEstimadaInicio: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' },
      { id: 't4', nombre: 'Cancelada', estado: 'Cancelada', fechaEstimadaInicio: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' },
    ];
    expect(construirHechoTareaAtascada(tareas, HOY)).toBeNull();
  });

  it('null sin tareas atascadas', () => {
    expect(construirHechoTareaAtascada([], HOY)).toBeNull();
  });

  it('una tarea con reloj futuro (todavía no atrasada) no cuenta', () => {
    const tareas: FilaTareaAtascada[] = [
      { id: 't5', nombre: 'Aún no empieza', estado: 'Programada', fechaEstimadaInicio: '2026-09-01', createdAt: '2026-08-01T00:00:00Z' },
    ];
    expect(construirHechoTareaAtascada(tareas, HOY)).toBeNull();
  });
});

describe('construirHechoAplicacionesColgadas', () => {
  it('A-7(ii): el hecho se atiende a sí mismo -- atendido_por nunca queda vacío cuando hay colgadas', () => {
    const h = construirHechoAplicacionesColgadas(
      [{ id: 'a1', nombre: 'Fumigación X', createdAt: '2026-08-01T00:00:00Z' }],
      HOY,
    )!;
    expect(h.atendido_por.length).toBeGreaterThan(0);
    expect(h.atendido_por[0].tipo).toBe('aplicacion');
  });

  it('respeta el umbral de días colgada', () => {
    const recienCreada = { id: 'a2', nombre: 'Recién empezada', createdAt: `${HOY}T00:00:00Z` };
    expect(construirHechoAplicacionesColgadas([recienCreada], HOY)).toBeNull();
    expect(DIAS_APLICACION_COLGADA_UMBRAL).toBeGreaterThan(0);
  });
});

describe('construirHechosAplicacionArranca', () => {
  it('sólo las aplicaciones dentro de la ventana', () => {
    const hechos = construirHechosAplicacionArranca(
      [
        { id: 'app1', nombre: 'Aplicacion Enmienda', fechaInicioPlaneada: '2026-08-18' },
        { id: 'app2', nombre: 'Muy lejana', fechaInicioPlaneada: '2026-12-01' },
      ],
      HOY,
    );
    expect(hechos).toHaveLength(1);
    expect(hechos[0].id).toBe('agu.aplicacion_arranca.aplicacion_enmienda');
    expect(hechos[0].fecha_limite).toBe('2026-08-18');
    expect(VENTANA_APLICACION_ARRANCA_DIAS).toBeGreaterThanOrEqual(2);
  });
});

describe('construirHechoJornalesSemana', () => {
  it('sin_dato + texto literal cuando no hay jornales esta semana', () => {
    const h = construirHechoJornalesSemana(null, 40, '2026-08-01', HOY);
    expect(h.confianza).toBe('sin_dato');
    expect(h.texto).toBe('Sin jornales registrados esta semana — registros_trabajo');
  });

  it('calcula variacion_pct contra la semana previa', () => {
    const h = construirHechoJornalesSemana(30, 40, '2026-08-15', HOY);
    expect(h.valores.variacion_pct.crudo).toBeCloseTo(-25, 5);
  });
});

describe('construirHechoLluviaConfianza', () => {
  it('null cuando ningún día está congelado', () => {
    expect(construirHechoLluviaConfianza(10, 10, 0, HOY)).toBeNull();
  });
  it('parcial cuando hay días congelados', () => {
    const h = construirHechoLluviaConfianza(7, 10, 3, HOY)!;
    expect(h.confianza).toBe('parcial');
    expect(h.tamano_conjunto).toBe(3);
  });
});

// ============================================================================
// Ganado
// ============================================================================

describe('construirHechoGanadoInventario', () => {
  it('369 cabezas, 300 novillos, 69 toros', () => {
    const h = construirHechoGanadoInventario(369, 300, 69, HOY);
    expect(h.valores.cabezas.crudo).toBe(369);
    expect(h.tamano_conjunto).toBe(369);
  });
});

describe('construirHechoGanadoVariacion30d', () => {
  it('null sin movimiento', () => {
    expect(construirHechoGanadoVariacion30d(0, 0, 0, HOY)).toBeNull();
  });
  it('con movimiento', () => {
    const h = construirHechoGanadoVariacion30d(5, 2, 3, HOY)!;
    expect(h.valores.neto.crudo).toBe(3);
  });
});

describe('construirHechoGanadoFincasSinHa -- caso de oro (6 fincas en 0,00 ha)', () => {
  it('cabezas/ha no es calculable ⇒ el hecho refleja el hueco, nunca un 0', () => {
    const fincas = ['Finca 1', 'Finca 2', 'Finca 3', 'Finca 4', 'Finca 5', 'Finca 6'];
    const h = construirHechoGanadoFincasSinHa(fincas, HOY)!;
    expect(h.confianza).toBe('sin_dato');
    expect(h.valores.cantidad.crudo).toBe(6);
    expect(h.destinos).toEqual(['gan.config_fincas']);
  });

  it('null sin fincas afectadas', () => {
    expect(construirHechoGanadoFincasSinHa([], HOY)).toBeNull();
  });
});

describe('construirHechoGanadoConcentracion', () => {
  it('calcula pct_del_total de la finca con más cabezas', () => {
    const h = construirHechoGanadoConcentracion(
      [
        { finca: 'La Grande', cabezas: 200 },
        { finca: 'La Chica', cabezas: 169 },
      ],
      369,
      HOY,
    )!;
    expect(h.valores.finca.crudo).toBe('La Grande');
    expect(h.valores.pct_del_total.crudo).toBeCloseTo((200 / 369) * 100, 5);
  });

  it('null sin cabezas', () => {
    expect(construirHechoGanadoConcentracion([], 0, HOY)).toBeNull();
  });
});

// ============================================================================
// §3.3 ter -- O-8
// ============================================================================

function revision(overrides: Partial<RevisionPeriodicaFila> & Pick<RevisionPeriodicaFila, 'clave' | 'negocio' | 'disparo'>): RevisionPeriodicaFila {
  return {
    nombre: 'Revisión de prueba',
    destinoId: 'fin.presupuesto',
    activa: true,
    cadenciaDias: null,
    periodo: null,
    diasGracia: 0,
    eventoSelector: null,
    ultimaRevisionAt: null,
    ...overrides,
  };
}

describe('evaluarDisparo / construirHechoRevisionPeriodica', () => {
  it('activa=false nunca vence (G-1: sin fila activa, la revisión no existe)', () => {
    const r = revision({ clave: 'x', negocio: 'aguacate', disparo: 'cada_n_dias', cadenciaDias: 30, activa: false });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(false);
    expect(construirHechoRevisionPeriodica(r, resultado, HOY)).toBeNull();
  });

  it('al_cerrar_periodo mensual: julio cierra el 31, con dias_gracia=5 vence el 5 de agosto -- vencida el 16', () => {
    const r = revision({
      clave: 'aguacate.ejecucion_presupuestal',
      negocio: 'aguacate',
      disparo: 'al_cerrar_periodo',
      periodo: 'mensual',
      diasGracia: 5,
      destinoId: 'fin.presupuesto',
      ultimaRevisionAt: null,
    });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(true);
    expect(resultado.fechaLimite).toBe('2026-08-05');
    expect(resultado.periodo?.render).toBe('julio');
    expect(resultado.diasEsperando).toBe(diasEntreParaTest('2026-08-05', HOY));

    const h = construirHechoRevisionPeriodica(r, resultado, HOY)!;
    expect(h.id).toBe('rev.aguacate.ejecucion_presupuestal');
    expect(h.origen).toBe('O8_revision');
    expect(h.categoria).toBe('revision');
    expect(h.destinos).toEqual(['fin.presupuesto']);
    expect(h.fecha_limite).toBe('2026-08-05');
    expect(h.valores.periodo?.render).toBe('julio');
    expect(h.texto).toContain('Julio');
  });

  it('al_cerrar_periodo: ya revisado dentro del período cerrado no vence de nuevo', () => {
    const r = revision({
      clave: 'aguacate.ejecucion_presupuestal',
      negocio: 'aguacate',
      disparo: 'al_cerrar_periodo',
      periodo: 'mensual',
      diasGracia: 5,
      ultimaRevisionAt: '2026-08-02T10:00:00Z', // ya se revisó julio (>= 2026-07-31)
    });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(false);
  });

  it('al_ocurrir_evento: hato.ultimo_chequeo_fecha posterior a ultima_revision dispara con fecha_limite = fecha del evento', () => {
    const r = revision({
      clave: 'hato_lechero.productividad',
      negocio: 'hato_lechero',
      disparo: 'al_ocurrir_evento',
      eventoSelector: 'hato.ultimo_chequeo_fecha',
      destinoId: 'hato.ranking_vacas',
      ultimaRevisionAt: '2026-06-01T00:00:00Z',
    });
    const entrada = entradaVacia({ animalesHato: [animal({ animalId: '1', ultimoChequeoFecha: '2026-07-09' })] });
    const resultado = evaluarDisparo(r, entrada, HOY);
    expect(resultado.vencida).toBe(true);
    expect(resultado.fechaLimite).toBe('2026-07-09');
    expect(resultado.evento?.crudo).toBe('2026-07-09');

    const h = construirHechoRevisionPeriodica(r, resultado, HOY)!;
    expect(h.fecha_limite).toBe('2026-07-09');
    expect(h.valores.evento?.crudo).toBe('2026-07-09');
  });

  it('al_ocurrir_evento: sin evento disponible, nunca "vencida hace mucho" (§7.5)', () => {
    const r = revision({
      clave: 'hato_lechero.productividad',
      negocio: 'hato_lechero',
      disparo: 'al_ocurrir_evento',
      eventoSelector: 'hato.ultimo_chequeo_fecha',
      ultimaRevisionAt: null,
    });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(false);
    expect(resultado.fechaLimite).toBeNull();
  });

  it('al_ocurrir_evento: evento anterior o igual a la última revisión no dispara', () => {
    const r = revision({
      clave: 'hato_lechero.productividad',
      negocio: 'hato_lechero',
      disparo: 'al_ocurrir_evento',
      eventoSelector: 'hato.ultimo_chequeo_fecha',
      ultimaRevisionAt: '2026-07-09T00:00:00Z',
    });
    const entrada = entradaVacia({ animalesHato: [animal({ animalId: '1', ultimoChequeoFecha: '2026-07-09' })] });
    expect(evaluarDisparo(r, entrada, HOY).vencida).toBe(false);
  });

  it('cada_n_dias: nunca revisada ⇒ vencida sin fecha ancla', () => {
    const r = revision({ clave: 'x.generico', negocio: 'ganado', disparo: 'cada_n_dias', cadenciaDias: 30, ultimaRevisionAt: null, destinoId: 'gan.dashboard' });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(true);
    expect(resultado.fechaLimite).toBeNull();
  });

  it('cada_n_dias: con ancla, vence exactamente a los N días', () => {
    const r = revision({ clave: 'x.generico', negocio: 'ganado', disparo: 'cada_n_dias', cadenciaDias: 30, ultimaRevisionAt: '2026-07-17T00:00:00Z', destinoId: 'gan.dashboard' });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(resultado.vencida).toBe(true);
    expect(resultado.fechaLimite).toBe('2026-08-16');
  });

  it('cada_n_dias: dentro de la cadencia, no vence', () => {
    const r = revision({ clave: 'x.generico', negocio: 'ganado', disparo: 'cada_n_dias', cadenciaDias: 30, ultimaRevisionAt: '2026-08-01T00:00:00Z', destinoId: 'gan.dashboard' });
    expect(evaluarDisparo(r, entradaVacia(), HOY).vencida).toBe(false);
  });

  it('no vencida ⇒ construirHechoRevisionPeriodica devuelve null (nada que publicar)', () => {
    const r = revision({ clave: 'x', negocio: 'ganado', disparo: 'cada_n_dias', cadenciaDias: 30, ultimaRevisionAt: HOY + 'T00:00:00Z' });
    const resultado = evaluarDisparo(r, entradaVacia(), HOY);
    expect(construirHechoRevisionPeriodica(r, resultado, HOY)).toBeNull();
  });
});

// ============================================================================
// Helper de test -- réplica minúscula de la diferencia de días con signo que
// usa el propio módulo, para no depender de su función interna no exportada.
// ============================================================================
function diasEntreParaTest(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}
