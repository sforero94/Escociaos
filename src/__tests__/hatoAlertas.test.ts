/**
 * Tests del motor puro de alertas del Hato Lechero (S6, plan §7.3).
 *
 * Cubre: cada una de las 5 reglas disparando y NO disparando, estabilidad y
 * formato de `regla_clave`, idempotencia (mismo input dos veces -> mismas
 * claves, sin duplicar), umbrales de escalamiento/expiración, política de
 * reenvío, la regla del dueño de "el mensaje lidera con el nombre cuando la
 * chapeta es provisional o nula", y que los umbrales de negocio (leídos de
 * `HatoConfig`) mueven el resultado cuando cambian.
 */

import { describe, it, expect } from 'vitest';
import {
  generarAlertasPendientes,
  resumirCoberturaAlertas,
  construirMensajeAlerta,
  nombrePresentacionAnimal,
  debeReenviar,
  decidirAccionEscalamiento,
  decidirExpiracionTerminal,
  HORAS_MINIMAS_REENVIO,
  INTENTOS_MAXIMOS_REENVIO,
  DIAS_EXPIRACION_ALERTA,
  claveAlertaCatalogo,
  agruparSuscriptoresPorClave,
  etiquetaRespuestaAlerta,
  construirMensajeAlertaYaResuelta,
  construirMensajeCierreAlertaBroadcast,
  type AnimalHatoParaAlertas,
  type PasoTratamientoPendienteInput,
  type FilaSuscripcionAlerta,
  type EstadoAlertaHato,
  type TipoAlertaHato,
} from '@/utils/hatoAlertas';
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

const FECHA_REF = '2026-07-23';

function animalBase(overrides: Partial<AnimalHatoParaAlertas> = {}): AnimalHatoParaAlertas {
  return {
    animal_id: 'animal-1',
    numero: 47,
    nombre: 'ESTRELLA',
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 3,
    ultimo_chequeo_fecha: '2026-07-09',
    ultimo_servicio_fecha: null,
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultima_confirmacion_prenez_metodo: null,
    ultimo_aborto_fecha: null,
    ultimo_estado_chequeo: null,
    ...overrides,
  };
}

describe('generarAlertasPendientes — secado_due', () => {
  it('dispara cuando la fecha de secado ya venció (servicio antiguo, sin secado real)', () => {
    // jersey: secado = servicio + (9-2) = 7 meses. 2025-12-01 + 7m = 2026-07-01, ya vencido.
    const fila = animalBase({ ultimo_servicio_fecha: '2025-12-01', ultimo_evento_fecha: '2025-12-01' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    const secado = alertas.find((a) => a.tipo === 'secado_due');
    expect(secado).toBeDefined();
    expect(secado!.regla_clave).toBe('secado:animal-1:2025-12-01');
    expect(secado!.animal_id).toBe('animal-1');
    expect(secado!.mensaje).toContain('secar');
  });

  it('NO dispara cuando el servicio es reciente (secado todavía lejos)', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2026-07-20', ultimo_evento_fecha: '2026-07-20' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'secado_due')).toBeUndefined();
  });
});

describe('generarAlertasPendientes — rechequeo_due', () => {
  it('dispara cuando pasaron >= dias_rechequeo_due desde el último chequeo', () => {
    const fila = animalBase({ ultimo_chequeo_fecha: '2026-05-01' }); // 83 días antes de FECHA_REF
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    const rechq = alertas.find((a) => a.tipo === 'rechequeo_due');
    expect(rechq).toBeDefined();
    expect(rechq!.regla_clave).toBe('rechq:animal-1:2026-05-01');
  });

  it('NO dispara si el último chequeo es reciente', () => {
    const fila = animalBase({ ultimo_chequeo_fecha: '2026-07-20' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'rechequeo_due')).toBeUndefined();
  });
});

describe('generarAlertasPendientes — servicio_sin_confirmacion', () => {
  it('dispara cuando pasaron >= dias_servicio_sin_confirmacion sin confirmación/parto/secado posterior', () => {
    // 45 días de config. 2026-06-01 -> 2026-07-23 son 52 días.
    const fila = animalBase({ ultimo_servicio_fecha: '2026-06-01', ultimo_evento_fecha: '2026-06-01' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    const servconf = alertas.find((a) => a.tipo === 'servicio_sin_confirmacion');
    expect(servconf).toBeDefined();
    expect(servconf!.regla_clave).toBe('servconf:animal-1:2026-06-01');
  });

  it('NO dispara si ya hay confirmación de preñez posterior al servicio', () => {
    const fila = animalBase({
      ultimo_servicio_fecha: '2026-06-01',
      ultima_confirmacion_prenez_fecha: '2026-06-15',
      ultimo_evento_fecha: '2026-06-15',
    });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'servicio_sin_confirmacion')).toBeUndefined();
  });
});

describe('generarAlertasPendientes — parto_proximo', () => {
  it('dispara cuando el parto probable cae dentro de la ventana de dias_parto_proximo_alerta', () => {
    // PP = servicio + 9 meses. 2025-10-25 + 9m = 2026-07-25 (2 días desde FECHA_REF, <= 14).
    const fila = animalBase({ ultimo_servicio_fecha: '2025-10-25', ultimo_evento_fecha: '2025-10-25' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    const parto = alertas.find((a) => a.tipo === 'parto_proximo');
    expect(parto).toBeDefined();
    expect(parto!.regla_clave).toBe('parto:animal-1:2025-10-25');
  });

  it('NO dispara cuando el parto probable está lejos', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2026-07-01', ultimo_evento_fecha: '2026-07-01' });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'parto_proximo')).toBeUndefined();
  });
});

describe('generarAlertasPendientes — S3 §2.2, sin regresión con secado_real/confirmacion sin servicio ancla', () => {
  // docs/plan_hato_ciclo_manual_override.md §2.1: el cambio en
  // `derivarEstadoReproductivo` que hace que estas filas dejen de ser
  // 'indeterminado' no debe generar NINGUNA alerta nueva (criterio de
  // aceptación #7). `secado_due`/`parto_proximo`/`servicio_sin_confirmacion`
  // ya exigen `fila.ultimo_servicio_fecha` en este mismo archivo -- estas
  // filas nunca lo tienen -- pero se prueba el resultado observable, no la
  // guarda interna, para que un refactor futuro no lo pierda en silencio.
  it('secado_real sin servicio ancla: sin alerta secado_due (aunque el estado ahora sea "seca")', () => {
    const fila = animalBase({
      ultimo_chequeo_fecha: '2026-07-09',
      ultimo_servicio_fecha: null,
      ultimo_secado_real_fecha: '2026-07-20',
    });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'secado_due')).toBeUndefined();
  });

  it('confirmacion_prenez sin servicio ancla: sin alerta parto_proximo ni servicio_sin_confirmacion (aunque el estado ahora sea "preñada")', () => {
    const fila = animalBase({
      ultimo_chequeo_fecha: '2026-07-09',
      ultimo_servicio_fecha: null,
      ultima_confirmacion_prenez_fecha: '2026-07-10',
    });
    const alertas = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(alertas.find((a) => a.tipo === 'parto_proximo')).toBeUndefined();
    expect(alertas.find((a) => a.tipo === 'servicio_sin_confirmacion')).toBeUndefined();
  });
});

describe('generarAlertasPendientes — tratamiento_paso', () => {
  const paso: PasoTratamientoPendienteInput = {
    paso_id: 'paso-1',
    animal_id: 'animal-2',
    numero: 12,
    nombre: 'CAMPANA',
    fecha_programada: '2026-07-20',
    descripcion: 'Aplicar estrumate',
  };

  it('dispara cuando la fecha programada ya llegó', () => {
    const alertas = generarAlertasPendientes([], [paso], CONFIG, new Set(), FECHA_REF);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'tratamiento_paso', animal_id: 'animal-2' });
    expect(alertas[0].regla_clave).toBe('ttto:paso-1');
    expect(alertas[0].mensaje).toContain('Aplicar estrumate');
  });

  it('NO dispara cuando la fecha programada es futura', () => {
    const pasoFuturo = { ...paso, fecha_programada: '2026-08-01' };
    const alertas = generarAlertasPendientes([], [pasoFuturo], CONFIG, new Set(), FECHA_REF);
    expect(alertas).toHaveLength(0);
  });
});

describe('regla_clave — estabilidad e idempotencia', () => {
  it('el mismo input produce exactamente las mismas regla_clave en dos corridas', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2025-12-01', ultimo_evento_fecha: '2025-12-01' });
    const primeraCorrida = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    const segundaCorrida = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(segundaCorrida.map((a) => a.regla_clave).sort()).toEqual(
      primeraCorrida.map((a) => a.regla_clave).sort(),
    );
  });

  it('una regla_clave ya existente (persistida en hato_alertas) no se regenera', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2025-12-01', ultimo_evento_fecha: '2025-12-01' });
    const primeraCorrida = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(primeraCorrida.length).toBeGreaterThan(0);

    const reglasYaEnBd = new Set(primeraCorrida.map((a) => a.regla_clave));
    const segundaCorrida = generarAlertasPendientes([fila], [], CONFIG, reglasYaEnBd, FECHA_REF);
    expect(segundaCorrida).toEqual([]);
  });

  it('usa animal_id (identidad real), no numero, en la clave -- estable ante una renumeración', () => {
    const filaConChapetaVieja = animalBase({
      animal_id: 'animal-9',
      numero: 47,
      ultimo_servicio_fecha: '2025-12-01',
      ultimo_evento_fecha: '2025-12-01',
    });
    const filaConChapetaNueva = animalBase({
      animal_id: 'animal-9',
      numero: 5, // Martha re-numeró el mismo animal
      ultimo_servicio_fecha: '2025-12-01',
      ultimo_evento_fecha: '2025-12-01',
    });
    const claveAntes = generarAlertasPendientes([filaConChapetaVieja], [], CONFIG, new Set(), FECHA_REF)
      .find((a) => a.tipo === 'secado_due')!.regla_clave;
    const claveDespues = generarAlertasPendientes([filaConChapetaNueva], [], CONFIG, new Set(), FECHA_REF)
      .find((a) => a.tipo === 'secado_due')!.regla_clave;
    expect(claveAntes).toBe(claveDespues);
    expect(claveAntes).toBe('secado:animal-9:2025-12-01');
  });
});

describe('config-driven: los umbrales de HatoConfig mueven el resultado', () => {
  it('subir dias_servicio_sin_confirmacion apaga una alerta que antes disparaba', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2026-06-01', ultimo_evento_fecha: '2026-06-01' });
    const conConfigOriginal = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(conConfigOriginal.find((a) => a.tipo === 'servicio_sin_confirmacion')).toBeDefined();

    const configMasLaxa: HatoConfig = { ...CONFIG, dias_servicio_sin_confirmacion: 90 };
    const conConfigMasLaxa = generarAlertasPendientes([fila], [], configMasLaxa, new Set(), FECHA_REF);
    expect(conConfigMasLaxa.find((a) => a.tipo === 'servicio_sin_confirmacion')).toBeUndefined();
  });

  it('bajar dias_rechequeo_due enciende una alerta que antes no disparaba', () => {
    const fila = animalBase({ ultimo_chequeo_fecha: '2026-07-01' }); // 22 días antes de FECHA_REF
    const conConfigOriginal = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF);
    expect(conConfigOriginal.find((a) => a.tipo === 'rechequeo_due')).toBeUndefined();

    const configMasEstricta: HatoConfig = { ...CONFIG, dias_rechequeo_due: 20 };
    const conConfigMasEstricta = generarAlertasPendientes([fila], [], configMasEstricta, new Set(), FECHA_REF);
    expect(conConfigMasEstricta.find((a) => a.tipo === 'rechequeo_due')).toBeDefined();
  });

  it('cambiar meses_secado_por_raza mueve la fecha_programada de secado_due', () => {
    const fila = animalBase({
      raza: 'normanda',
      ultimo_servicio_fecha: '2025-11-01',
      ultimo_evento_fecha: '2025-11-01',
    });
    const secadoOriginal = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF)
      .find((a) => a.tipo === 'secado_due');

    const configSecadoMasLargo: HatoConfig = {
      ...CONFIG,
      meses_secado_por_raza: { ...CONFIG.meses_secado_por_raza, normanda: 5 },
    };
    const secadoConfigNueva = generarAlertasPendientes([fila], [], configSecadoMasLargo, new Set(), FECHA_REF)
      .find((a) => a.tipo === 'secado_due');

    // Con más meses de secado, la fecha de secado es más temprana (PP - más meses).
    if (secadoOriginal && secadoConfigNueva) {
      expect(secadoConfigNueva.fecha_programada).not.toBe(secadoOriginal.fecha_programada);
      expect(secadoConfigNueva.fecha_programada < secadoOriginal.fecha_programada).toBe(true);
    } else {
      // Al menos uno de los dos debe existir para que el assert de arriba sea relevante.
      expect(secadoOriginal || secadoConfigNueva).toBeDefined();
    }
  });
});

describe('resumirCoberturaAlertas — instrumentación del tick (hallazgo #4, PO 2026-08-24)', () => {
  const SIN_REGLAS = new Map<string, EstadoAlertaHato>();

  function generadasDe(resumen: ReturnType<typeof resumirCoberturaAlertas>, tipo: TipoAlertaHato): number {
    return resumen.por_tipo[tipo].generadas;
  }
  function omitidasDe(
    resumen: ReturnType<typeof resumirCoberturaAlertas>,
    tipo: TipoAlertaHato,
    razon: keyof ReturnType<typeof resumirCoberturaAlertas>['por_tipo'][TipoAlertaHato]['omitidas'],
  ): number {
    return resumen.por_tipo[tipo].omitidas[razon];
  }

  it('cuenta animales evaluados y sin raza (dato de diagnóstico, no un motivo de omisión)', () => {
    const conRaza = animalBase({ animal_id: 'a1', raza: 'jersey' });
    const sinRaza = animalBase({ animal_id: 'a2', raza: null });
    const resumen = resumirCoberturaAlertas([conRaza, sinRaza], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(resumen.animales_evaluados).toBe(2);
    expect(resumen.animales_sin_raza).toBe(1);
  });

  it('sin raza NO es un motivo de omisión -- calcularFechaSecar cae a _default, la alerta se genera igual', () => {
    const filaConRaza = animalBase({
      animal_id: 'a1',
      raza: 'jersey',
      ultimo_servicio_fecha: '2025-12-01',
      ultimo_evento_fecha: '2025-12-01',
    });
    const filaSinRaza = animalBase({
      animal_id: 'a2',
      raza: null,
      ultimo_servicio_fecha: '2025-12-01',
      ultimo_evento_fecha: '2025-12-01',
    });
    const resumen = resumirCoberturaAlertas([filaConRaza, filaSinRaza], [], CONFIG, SIN_REGLAS, FECHA_REF);
    // Ambas vencen secado_due igual (jersey y `_default` valen 2 meses en CONFIG) -- las dos se generan.
    expect(generadasDe(resumen, 'secado_due')).toBe(2);
  });

  it('no_activa: un animal vendida/muerta/descartada no genera ninguna de las 4 reglas reproductivas', () => {
    const vendida = animalBase({
      estado: 'vendida',
      ultimo_servicio_fecha: '2025-12-01',
      ultimo_chequeo_fecha: '2026-01-01',
    });
    const resumen = resumirCoberturaAlertas([vendida], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'secado_due', 'no_activa')).toBe(1);
    expect(omitidasDe(resumen, 'servicio_sin_confirmacion', 'no_activa')).toBe(1);
    expect(omitidasDe(resumen, 'parto_proximo', 'no_activa')).toBe(1);
    expect(omitidasDe(resumen, 'rechequeo_due', 'no_activa')).toBe(1);
  });

  it('sin_ciclo_reproductivo: una ternera (o una vaca que nunca tuvo servicio/parto/secado/confirmación) no compite por las 3 reglas ancladas al ciclo', () => {
    const ternera = animalBase({ etapa: 'ternera', ultimo_servicio_fecha: null, ultimo_chequeo_fecha: null });
    const resumenTernera = resumirCoberturaAlertas([ternera], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumenTernera, 'secado_due', 'sin_ciclo_reproductivo')).toBe(1);
    expect(omitidasDe(resumenTernera, 'servicio_sin_confirmacion', 'sin_ciclo_reproductivo')).toBe(1);
    expect(omitidasDe(resumenTernera, 'parto_proximo', 'sin_ciclo_reproductivo')).toBe(1);
    // rechequeo_due no depende del ciclo -- sin ultimo_chequeo_fecha cae en 'sin_chequeo', no en 'sin_ciclo_reproductivo'.
    expect(omitidasDe(resumenTernera, 'rechequeo_due', 'sin_chequeo')).toBe(1);

    const vacaSinCiclo = animalBase({
      etapa: 'vaca',
      ultimo_servicio_fecha: null,
      ultimo_parto_fecha: null,
      ultimo_secado_real_fecha: null,
      ultima_confirmacion_prenez_fecha: null,
    });
    const resumenVaca = resumirCoberturaAlertas([vacaSinCiclo], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumenVaca, 'secado_due', 'sin_ciclo_reproductivo')).toBe(1);
  });

  it('evento_no_clasificado: un evento posterior al servicio que no es aborto (indeterminado) no compite por las 3 reglas ancladas al ciclo', () => {
    // Mismo fixture que calculosHato.test.ts para 'indeterminado' (evidencia MONA).
    const fila = animalBase({
      ultimo_servicio_fecha: '2025-05-16',
      ultimo_evento_fecha: '2026-01-10',
      ultimo_aborto_fecha: null,
    });
    const resumen = resumirCoberturaAlertas([fila], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'secado_due', 'evento_no_clasificado')).toBe(1);
    expect(omitidasDe(resumen, 'servicio_sin_confirmacion', 'evento_no_clasificado')).toBe(1);
    expect(omitidasDe(resumen, 'parto_proximo', 'evento_no_clasificado')).toBe(1);
  });

  it('sin_servicio_ancla: secado_real/confirmación sin ultimo_servicio_fecha (S3 §2.2) no compite por las 3 reglas ancladas al ciclo', () => {
    const fila = animalBase({
      ultimo_servicio_fecha: null,
      ultimo_secado_real_fecha: '2026-07-20',
    });
    const resumen = resumirCoberturaAlertas([fila], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'secado_due', 'sin_servicio_ancla')).toBe(1);
    expect(omitidasDe(resumen, 'servicio_sin_confirmacion', 'sin_servicio_ancla')).toBe(1);
    expect(omitidasDe(resumen, 'parto_proximo', 'sin_servicio_ancla')).toBe(1);
  });

  it('sin_chequeo: solo rechequeo_due usa este motivo, cuando el animal nunca tuvo un chequeo', () => {
    const fila = animalBase({ ultimo_chequeo_fecha: null });
    const resumen = resumirCoberturaAlertas([fila], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'rechequeo_due', 'sin_chequeo')).toBe(1);
  });

  it('bajo_umbral: ciclo anclado y dato presente, pero todavía no cruza el umbral configurado', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2026-07-20', ultimo_evento_fecha: '2026-07-20' });
    const resumen = resumirCoberturaAlertas([fila], [], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'secado_due', 'bajo_umbral')).toBe(1);
    expect(omitidasDe(resumen, 'servicio_sin_confirmacion', 'bajo_umbral')).toBe(1);
    expect(omitidasDe(resumen, 'parto_proximo', 'bajo_umbral')).toBe(1);
  });

  it('fecha_futura: solo tratamiento_paso usa este motivo, para un paso programado a futuro', () => {
    const pasoFuturo: PasoTratamientoPendienteInput = {
      paso_id: 'paso-1',
      animal_id: 'animal-2',
      numero: 12,
      nombre: 'CAMPANA',
      fecha_programada: '2026-08-01',
      descripcion: 'Aplicar estrumate',
    };
    const resumen = resumirCoberturaAlertas([], [pasoFuturo], CONFIG, SIN_REGLAS, FECHA_REF);
    expect(omitidasDe(resumen, 'tratamiento_paso', 'fecha_futura')).toBe(1);
    expect(generadasDe(resumen, 'tratamiento_paso')).toBe(0);
  });

  it('ya_generada vs silenciada: misma regla ya existente, distinta según el estado -- descartada es la única que cuenta como "silenciada"', () => {
    const fila = animalBase({ ultimo_servicio_fecha: '2025-12-01', ultimo_evento_fecha: '2025-12-01' });
    const clave = generarAlertasPendientes([fila], [], CONFIG, new Set(), FECHA_REF)
      .find((a) => a.tipo === 'secado_due')!.regla_clave;

    const yaEnviada = new Map<string, EstadoAlertaHato>([[clave, 'enviada']]);
    const resumenEnviada = resumirCoberturaAlertas([fila], [], CONFIG, yaEnviada, FECHA_REF);
    expect(omitidasDe(resumenEnviada, 'secado_due', 'ya_generada')).toBe(1);
    expect(omitidasDe(resumenEnviada, 'secado_due', 'silenciada')).toBe(0);

    const yaDescartada = new Map<string, EstadoAlertaHato>([[clave, 'descartada']]);
    const resumenDescartada = resumirCoberturaAlertas([fila], [], CONFIG, yaDescartada, FECHA_REF);
    expect(omitidasDe(resumenDescartada, 'secado_due', 'silenciada')).toBe(1);
    expect(omitidasDe(resumenDescartada, 'secado_due', 'ya_generada')).toBe(0);
  });

  it('tratamiento_paso también distingue ya_generada de silenciada', () => {
    const paso: PasoTratamientoPendienteInput = {
      paso_id: 'paso-9',
      animal_id: 'animal-2',
      numero: 12,
      nombre: 'CAMPANA',
      fecha_programada: '2026-07-01',
      descripcion: 'Aplicar estrumate',
    };
    const yaDescartado = new Map<string, EstadoAlertaHato>([['ttto:paso-9', 'descartada']]);
    const resumen = resumirCoberturaAlertas([], [paso], CONFIG, yaDescartado, FECHA_REF);
    expect(omitidasDe(resumen, 'tratamiento_paso', 'silenciada')).toBe(1);
  });

  describe('consistencia cruzada con generarAlertasPendientes — el conteo de "generadas" nunca puede divergir de lo que de verdad se generaría', () => {
    const ANIMALES: AnimalHatoParaAlertas[] = [
      animalBase({ animal_id: 'v1', ultimo_servicio_fecha: '2025-12-01', ultimo_evento_fecha: '2025-12-01' }), // secado_due
      animalBase({ animal_id: 'v2', ultimo_chequeo_fecha: '2026-05-01' }), // rechequeo_due
      animalBase({ animal_id: 'v3', ultimo_servicio_fecha: '2026-06-01', ultimo_evento_fecha: '2026-06-01' }), // servicio_sin_confirmacion
      animalBase({ animal_id: 'v4', ultimo_servicio_fecha: '2025-10-25', ultimo_evento_fecha: '2025-10-25' }), // parto_proximo
      animalBase({ animal_id: 'v5', estado: 'vendida' }), // no_activa
      animalBase({ animal_id: 'v6', etapa: 'ternera', ultimo_chequeo_fecha: null }), // sin_ciclo_reproductivo + sin_chequeo
      animalBase({
        animal_id: 'v7',
        ultimo_servicio_fecha: '2025-05-16',
        ultimo_evento_fecha: '2026-01-10',
      }), // evento_no_clasificado
      animalBase({ animal_id: 'v8', ultimo_servicio_fecha: null, ultimo_secado_real_fecha: '2026-07-20' }), // sin_servicio_ancla
      animalBase({ animal_id: 'v9', ultimo_servicio_fecha: '2026-07-20', ultimo_evento_fecha: '2026-07-20' }), // bajo_umbral
    ];
    const PASOS: PasoTratamientoPendienteInput[] = [
      { paso_id: 'p1', animal_id: 'v1', numero: 1, nombre: 'A', fecha_programada: '2026-07-20', descripcion: null },
      { paso_id: 'p2', animal_id: 'v2', numero: 2, nombre: 'B', fecha_programada: '2026-08-01', descripcion: null },
    ];

    it('la corrida "en frío" (sin reglas previas) coincide exactamente, tipo por tipo', () => {
      const alertas = generarAlertasPendientes(ANIMALES, PASOS, CONFIG, new Set(), FECHA_REF);
      const resumen = resumirCoberturaAlertas(ANIMALES, PASOS, CONFIG, SIN_REGLAS, FECHA_REF);

      const tipos: TipoAlertaHato[] = [
        'secado_due',
        'rechequeo_due',
        'servicio_sin_confirmacion',
        'parto_proximo',
        'tratamiento_paso',
      ];
      for (const tipo of tipos) {
        const esperado = alertas.filter((a) => a.tipo === tipo).length;
        expect(generadasDe(resumen, tipo), tipo).toBe(esperado);
      }
      expect(Object.values(resumen.por_tipo).reduce((acc, r) => acc + r.generadas, 0)).toBe(alertas.length);
      // Sanity: el fixture debe ejercitar más de un tipo o esta prueba no probaría gran cosa.
      expect(alertas.length).toBeGreaterThan(1);
    });

    it('la corrida "tibia" (todo lo generado antes ya existe) reduce "generadas" a 0 y las mueve a ya_generada', () => {
      const primeraCorrida = generarAlertasPendientes(ANIMALES, PASOS, CONFIG, new Set(), FECHA_REF);
      expect(primeraCorrida.length).toBeGreaterThan(0);

      const reglasExistentes = new Map<string, EstadoAlertaHato>(
        primeraCorrida.map((a) => [a.regla_clave, 'pendiente' as EstadoAlertaHato]),
      );
      const reglasComoSet = new Set(reglasExistentes.keys());

      const segundaCorrida = generarAlertasPendientes(ANIMALES, PASOS, CONFIG, reglasComoSet, FECHA_REF);
      expect(segundaCorrida).toEqual([]);

      const resumen = resumirCoberturaAlertas(ANIMALES, PASOS, CONFIG, reglasExistentes, FECHA_REF);
      expect(Object.values(resumen.por_tipo).reduce((acc, r) => acc + r.generadas, 0)).toBe(0);
      const totalYaGenerada = Object.values(resumen.por_tipo).reduce((acc, r) => acc + r.omitidas.ya_generada, 0);
      expect(totalYaGenerada).toBe(primeraCorrida.length);
    });
  });
});

describe('nombrePresentacionAnimal — regla del dueño (lidera con el nombre)', () => {
  it('chapeta real: número y nombre van juntos', () => {
    expect(nombrePresentacionAnimal('ESTRELLA', 47)).toBe('Vaca 47 (ESTRELLA)');
  });

  it('chapeta real sin nombre registrado: solo el número', () => {
    expect(nombrePresentacionAnimal(null, 47)).toBe('Vaca 47');
  });

  it('chapeta provisional (900-999): lidera con el nombre, nunca con el número', () => {
    const texto = nombrePresentacionAnimal('ESMERALDA', 999);
    expect(texto).toBe('ESMERALDA');
    expect(texto).not.toContain('999');
  });

  it('chapeta provisional (800-899): lidera con el nombre', () => {
    const texto = nombrePresentacionAnimal('CHISPA', 899);
    expect(texto).toBe('CHISPA');
    expect(texto).not.toContain('899');
  });

  it('sin número y sin nombre: texto explícito de "sin identificar", nunca vacío', () => {
    expect(nombrePresentacionAnimal(null, null)).toContain('sin identificar');
  });

  it('chapeta provisional sin nombre: no inventa un nombre, pero tampoco lidera con el número', () => {
    const texto = nombrePresentacionAnimal(null, 950);
    expect(texto).toContain('provisional');
    expect(texto.startsWith('950')).toBe(false);
  });
});

describe('construirMensajeAlerta', () => {
  it('secado_due incluye la presentación provisional-safe y la fecha de secado', () => {
    const msg = construirMensajeAlerta({ tipo: 'secado_due', nombre: 'ESMERALDA', numero: 999, fecha_secar: '2026-07-23' });
    expect(msg).toContain('ESMERALDA');
    expect(msg).not.toContain('999');
    expect(msg).toContain('2026-07-23');
  });

  it('tratamiento_paso incluye la descripción del paso cuando existe', () => {
    const msg = construirMensajeAlerta({
      tipo: 'tratamiento_paso',
      nombre: 'CAMPANA',
      numero: 12,
      descripcion_paso: 'Aplicar estrumate',
      fecha_programada: '2026-07-20',
    });
    expect(msg).toContain('Aplicar estrumate');
  });

  it('cada tipo produce un texto distinto (no hay una plantilla genérica compartida por error)', () => {
    const base = { nombre: 'ESTRELLA', numero: 47 };
    const mensajes = new Set([
      construirMensajeAlerta({ tipo: 'secado_due', ...base, fecha_secar: '2026-07-23' }),
      construirMensajeAlerta({ tipo: 'tratamiento_paso', ...base, fecha_programada: '2026-07-23' }),
      construirMensajeAlerta({ tipo: 'rechequeo_due', ...base, ultimo_chequeo_fecha: '2026-05-01' }),
      construirMensajeAlerta({ tipo: 'servicio_sin_confirmacion', ...base, fecha_servicio: '2026-06-01' }),
      construirMensajeAlerta({ tipo: 'parto_proximo', ...base, fecha_probable_parto: '2026-07-25' }),
    ]);
    expect(mensajes.size).toBe(5);
  });
});

describe('debeReenviar — política de reenvío', () => {
  const AHORA = '2026-07-23T10:00:00.000Z';

  it('no reenvía una alerta que sigue pendiente (nunca se envió)', () => {
    expect(debeReenviar({ estado: 'pendiente', intentos: 0, ultimo_intento_en: null }, AHORA)).toBe(false);
  });

  it('reenvía una alerta enviada sin reintentos previos, sin importar el tiempo', () => {
    expect(debeReenviar({ estado: 'enviada', intentos: 1, ultimo_intento_en: null }, AHORA)).toBe(true);
  });

  it(`no reenvía si pasaron menos de ${HORAS_MINIMAS_REENVIO}h desde el último intento`, () => {
    const hace24h = '2026-07-22T10:00:00.000Z';
    expect(debeReenviar({ estado: 'enviada', intentos: 1, ultimo_intento_en: hace24h }, AHORA)).toBe(false);
  });

  it(`reenvía justo al cumplirse ${HORAS_MINIMAS_REENVIO}h desde el último intento`, () => {
    const hace48h = '2026-07-21T10:00:00.000Z';
    expect(debeReenviar({ estado: 'enviada', intentos: 1, ultimo_intento_en: hace48h }, AHORA)).toBe(true);
  });

  it(`no reenvía si ya se alcanzó el máximo de ${INTENTOS_MAXIMOS_REENVIO} intentos, aunque haya pasado tiempo de sobra`, () => {
    const haceUnaSemana = '2026-07-16T10:00:00.000Z';
    expect(
      debeReenviar({ estado: 'enviada', intentos: INTENTOS_MAXIMOS_REENVIO, ultimo_intento_en: haceUnaSemana }, AHORA),
    ).toBe(false);
  });

  it('no reenvía alertas ya resueltas (respondida/confirmada/descartada)', () => {
    const haceUnaSemana = '2026-07-16T10:00:00.000Z';
    for (const estado of ['respondida', 'confirmada', 'descartada', 'escalada', 'expirada'] as const) {
      expect(debeReenviar({ estado, intentos: 1, ultimo_intento_en: haceUnaSemana }, AHORA)).toBe(false);
    }
  });
});

describe('decidirAccionEscalamiento — escalamiento y expiración', () => {
  const AHORA = '2026-07-23T10:00:00.000Z';

  it('no hace nada si aún no se cumplen las horas de escalamiento configuradas (contadas desde el envío)', () => {
    const enviadaHace10h = '2026-07-23T00:00:00.000Z';
    const accion = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: '2026-07-20' },
      enviadaHace10h,
      48,
      AHORA,
    );
    expect(accion).toBe('ninguna');
  });

  it('escala al cumplirse exactamente las horas_escalamiento configuradas, contadas desde el envío', () => {
    const enviadaHace48h = '2026-07-21T10:00:00.000Z';
    const accion = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: '2026-07-20' },
      enviadaHace48h,
      48,
      AHORA,
    );
    expect(accion).toBe('escalar');
  });

  it('el umbral de horas_escalamiento es configurable por tipo -- 24h escala antes que 48h', () => {
    const enviadaHace30h = '2026-07-22T04:00:00.000Z';
    const con48h = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: '2026-07-20' },
      enviadaHace30h,
      48,
      AHORA,
    );
    const con24h = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: '2026-07-20' },
      enviadaHace30h,
      24,
      AHORA,
    );
    expect(con48h).toBe('ninguna');
    expect(con24h).toBe('escalar');
  });

  it('una alerta pendiente (nunca despachada -- modo sombra, sin destinatario) NUNCA escala, sin importar el anchor recibido', () => {
    // Incluso si el caller pasara un anchor "viejo" (ej. el fallback a
    // fecha_programada que hace el tick para filas legacy), una `pendiente`
    // no debe escalar jamás: no hay nadie a quien se le haya enviado nada,
    // así que no hay "sin respuesta" que medir.
    const accionSinAnchor = decidirAccionEscalamiento(
      { estado: 'pendiente', fecha_programada: '2026-07-20' },
      null,
      48,
      AHORA,
    );
    const accionConAnchorViejo = decidirAccionEscalamiento(
      { estado: 'pendiente', fecha_programada: '2026-07-20' },
      '2026-07-01T00:00:00.000Z',
      48,
      AHORA,
    );
    expect(accionSinAnchor).toBe('ninguna');
    expect(accionConAnchorViejo).toBe('ninguna');
  });

  it('una alerta enviada sin anchor de envío (dato legado ausente) tampoco escala', () => {
    const accion = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: '2026-07-20' }, // dentro de la ventana de expiración (14 días)
      null,
      48,
      AHORA,
    );
    expect(accion).toBe('ninguna');
  });

  it(`expira una alerta (pendiente o enviada) cuando pasan más de ${DIAS_EXPIRACION_ALERTA} días desde fecha_programada`, () => {
    const fechaVieja = '2026-07-01'; // 22 días antes de AHORA
    const pendienteVieja = decidirAccionEscalamiento(
      { estado: 'pendiente', fecha_programada: fechaVieja },
      null,
      48,
      AHORA,
    );
    const enviadaVieja = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: fechaVieja },
      '2026-07-01T10:00:00.000Z',
      48,
      AHORA,
    );
    expect(pendienteVieja).toBe('expirar');
    expect(enviadaVieja).toBe('expirar');
  });

  it('no expira exactamente al límite de 14 días (el corte es estrictamente >14)', () => {
    const fechaLimite = '2026-07-09'; // exactamente 14 días antes de AHORA
    const accion = decidirAccionEscalamiento(
      { estado: 'pendiente', fecha_programada: fechaLimite },
      null,
      48,
      AHORA,
    );
    expect(accion).toBe('ninguna');
  });

  it('no hace nada sobre alertas en estado terminal', () => {
    for (const estado of ['respondida', 'confirmada', 'descartada', 'escalada', 'expirada'] as const) {
      const accion = decidirAccionEscalamiento(
        { estado, fecha_programada: '2026-01-01' },
        '2026-01-01T00:00:00.000Z',
        48,
        AHORA,
      );
      expect(accion).toBe('ninguna');
    }
  });

  it('caso real: secado_due con fecha_programada muy en el pasado (tick con lag) NO escala el mismo día del primer envío', () => {
    // Reproduce exactamente el escenario que motivó este fix: fecha_secar
    // (fecha_programada de una alerta secado_due) puede quedar en el pasado
    // por varios días si el tick estuvo caído -- eso NO debe traducirse en
    // un escalamiento inmediato apenas se envía por primera vez. El anchor
    // correcto es el instante del envío (ahora mismo), no fecha_programada.
    const fechaSecarVieja = '2026-07-10'; // 13 días antes de AHORA -- dentro de la ventana de 14 días de expiración
    const enviadaAhoraMismo = AHORA; // primer envío ocurre en este mismo tick
    const accion = decidirAccionEscalamiento(
      { estado: 'enviada', fecha_programada: fechaSecarVieja },
      enviadaAhoraMismo,
      48,
      AHORA,
    );
    expect(accion).toBe('ninguna');
  });
});

describe('decidirExpiracionTerminal — D-24 (docs/plan_hato_ronda_agosto_2026.md §0)', () => {
  // Lleva al tick la misma regla que S2 construyó como botón manual
  // (`alertasVencidasParaExpirar`, hatoAlertasUi.ts): decidirAccionEscalamiento
  // devuelve 'ninguna' para CUALQUIER estado terminal, incluida 'escalada'
  // -- por eso hay alertas escaladas atascadas para siempre sin esta regla.
  const AHORA = '2026-07-23T10:00:00.000Z';

  it('no hace nada sobre pendiente/enviada -- esas las cubre decidirAccionEscalamiento, no esta función', () => {
    for (const estado of ['pendiente', 'enviada'] as const) {
      expect(
        decidirExpiracionTerminal({ estado, escalada_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }, AHORA),
      ).toBe(false);
    }
  });

  it('no hace nada sobre confirmada/descartada/expirada -- ya están resueltas o ya expiraron', () => {
    for (const estado of ['confirmada', 'descartada', 'expirada'] as const) {
      expect(
        decidirExpiracionTerminal({ estado, escalada_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }, AHORA),
      ).toBe(false);
    }
  });

  it('expira una escalada vieja (más de 14 días desde escalada_at)', () => {
    const escaladaHace20Dias = '2026-07-03T10:00:00.000Z';
    expect(
      decidirExpiracionTerminal({ estado: 'escalada', escalada_at: escaladaHace20Dias, updated_at: escaladaHace20Dias }, AHORA),
    ).toBe(true);
  });

  it('no expira una escalada reciente (menos de 14 días)', () => {
    const escaladaHace5Dias = '2026-07-18T10:00:00.000Z';
    expect(
      decidirExpiracionTerminal({ estado: 'escalada', escalada_at: escaladaHace5Dias, updated_at: escaladaHace5Dias }, AHORA),
    ).toBe(false);
  });

  it('no expira exactamente al límite de 14 días (el corte es estrictamente >14, mismo criterio que decidirAccionEscalamiento)', () => {
    const escaladaHaceExacto14Dias = '2026-07-09T10:00:00.000Z';
    expect(
      decidirExpiracionTerminal({ estado: 'escalada', escalada_at: escaladaHaceExacto14Dias, updated_at: escaladaHaceExacto14Dias }, AHORA),
    ).toBe(false);
  });

  it('expira una respondida vieja (más de 14 días desde updated_at)', () => {
    const respondidaHace20Dias = '2026-07-03T10:00:00.000Z';
    expect(
      decidirExpiracionTerminal({ estado: 'respondida', escalada_at: null, updated_at: respondidaHace20Dias }, AHORA),
    ).toBe(true);
  });

  it('usa updated_at como respaldo si escalada_at falta (fila tocada a mano, no debería pasar pero no debe reventar)', () => {
    const hace20Dias = '2026-07-03T10:00:00.000Z';
    expect(decidirExpiracionTerminal({ estado: 'escalada', escalada_at: null, updated_at: hace20Dias }, AHORA)).toBe(true);
  });

  it('el umbral es configurable (parámetro diasUmbral), default DIAS_EXPIRACION_ALERTA', () => {
    const escaladaHace5Dias = '2026-07-18T10:00:00.000Z';
    expect(
      decidirExpiracionTerminal({ estado: 'escalada', escalada_at: escaladaHace5Dias, updated_at: escaladaHace5Dias }, AHORA, 3),
    ).toBe(true);
    expect(DIAS_EXPIRACION_ALERTA).toBe(14);
  });
});

// ============================================================================
// Suscripciones por usuario de Telegram (migración 096)
// ============================================================================

describe('claveAlertaCatalogo', () => {
  it('concatena modulo.tipo', () => {
    expect(claveAlertaCatalogo('hato', 'secado_due')).toBe('hato.secado_due');
    expect(claveAlertaCatalogo('aguacate', 'algo')).toBe('aguacate.algo');
  });
});

describe('agruparSuscriptoresPorClave', () => {
  function fila(overrides: Partial<FilaSuscripcionAlerta> = {}): FilaSuscripcionAlerta {
    return {
      alerta_clave: 'hato.secado_due',
      recibe: true,
      escalamiento: false,
      telegram_id: '111',
      ...overrides,
    };
  }

  it('agrupa por clave, separando recibe de escalamiento', () => {
    const filas: FilaSuscripcionAlerta[] = [
      fila({ telegram_id: '111', recibe: true, escalamiento: true }),
      fila({ telegram_id: '222', recibe: true, escalamiento: false }),
      fila({ telegram_id: '333', recibe: false, escalamiento: true }),
    ];
    const mapa = agruparSuscriptoresPorClave(filas);
    const entrada = mapa.get('hato.secado_due');
    expect(entrada).toBeDefined();
    expect(entrada!.recibe.sort()).toEqual(['111', '222']);
    expect(entrada!.escalamiento.sort()).toEqual(['111', '333']);
  });

  it('un mismo telegram_id puede recibir y escalar a la vez', () => {
    const mapa = agruparSuscriptoresPorClave([fila({ telegram_id: '111', recibe: true, escalamiento: true })]);
    const entrada = mapa.get('hato.secado_due')!;
    expect(entrada.recibe).toEqual(['111']);
    expect(entrada.escalamiento).toEqual(['111']);
  });

  it('claves distintas no se mezclan', () => {
    const mapa = agruparSuscriptoresPorClave([
      fila({ alerta_clave: 'hato.secado_due', telegram_id: '111' }),
      fila({ alerta_clave: 'hato.parto_proximo', telegram_id: '222' }),
    ]);
    expect(mapa.get('hato.secado_due')!.recibe).toEqual(['111']);
    expect(mapa.get('hato.parto_proximo')!.recibe).toEqual(['222']);
  });

  it('ni recibe ni escalamiento -- la clave existe pero ambas listas quedan vacías', () => {
    const mapa = agruparSuscriptoresPorClave([fila({ recibe: false, escalamiento: false })]);
    expect(mapa.get('hato.secado_due')).toEqual({ recibe: [], escalamiento: [] });
  });

  it('lista vacía produce un mapa vacío', () => {
    expect(agruparSuscriptoresPorClave([]).size).toBe(0);
  });
});

describe('etiquetaRespuestaAlerta', () => {
  it('traduce las 3 respuestas posibles', () => {
    expect(etiquetaRespuestaAlerta('si')).toBe('Sí');
    expect(etiquetaRespuestaAlerta('no')).toBe('Todavía no');
    expect(etiquetaRespuestaAlerta('otro')).toBe('Otra cosa');
  });
});

describe('construirMensajeAlertaYaResuelta — broadcast, cierre por el primero', () => {
  it('con respondida_por y respuesta conocidos, nombra a quién y qué respondió', () => {
    const texto = construirMensajeAlertaYaResuelta('confirmada', 'Fernando', 'si');
    expect(texto).toContain('Fernando');
    expect(texto).toContain('Sí');
  });

  it('sin respondida_por (dato legado o estado terminal sin respuesta), cae al genérico con el estado', () => {
    const texto = construirMensajeAlertaYaResuelta('expirada', null, null);
    expect(texto).toContain('expirada');
    expect(texto).not.toContain('null');
  });
});

describe('construirMensajeCierreAlertaBroadcast — edición del mensaje de los demás suscritos', () => {
  it('conserva el mensaje original y antepone quién resolvió y cómo', () => {
    const original = 'Vaca 47 (ESTRELLA) se debe secar hoy. ¿Ya se secó?';
    const texto = construirMensajeCierreAlertaBroadcast(original, 'Martha', 'si');
    expect(texto).toContain('Martha');
    expect(texto).toContain('Sí');
    expect(texto).toContain(original);
  });

  it('las 3 respuestas producen etiquetas distintas', () => {
    const textos = (['si', 'no', 'otro'] as const).map((r) => construirMensajeCierreAlertaBroadcast('X', 'Martha', r));
    expect(new Set(textos).size).toBe(3);
  });
});
