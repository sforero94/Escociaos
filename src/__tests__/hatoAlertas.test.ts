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
  construirMensajeAlerta,
  nombrePresentacionAnimal,
  debeReenviar,
  decidirAccionEscalamiento,
  HORAS_MINIMAS_REENVIO,
  INTENTOS_MAXIMOS_REENVIO,
  DIAS_EXPIRACION_ALERTA,
  type AnimalHatoParaAlertas,
  type PasoTratamientoPendienteInput,
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
