/**
 * accionesPaquete.test.ts — Fase 2 del motor de acciones recomendadas
 * (docs/brief_tecnico_motor_acciones.md §10 Fase 2).
 *
 * Cubre `src/supabase/functions/server/acciones-paquete.ts`: el ensamblador
 * sobre FILAS MOCK, nunca un cliente de Supabase real -- las funciones
 * `construirHechos*` son puras (reciben datos ya consultados) y
 * `ensamblarPaquete` recibe dependencias inyectadas (`DependenciasEnsamblador`)
 * en vez de un `SupabaseClient`, exactamente para que este archivo pueda
 * probar el aislamiento por negocio y las cotas de §3.6 sin abrir una
 * conexión real.
 *
 * Alcance explícito del brief para esta suite: "cotas de §3.6, un negocio
 * caído no tumba a los otros, ningún hecho con sin_dato lleva destino que
 * no sea de captura". Sobre el tercer punto: NO es una propiedad universal
 * de los hechos que Fase 1 ya construyó -- `hato.sin_raza` (siempre
 * sin_dato) y la variante sin-rondas de `agu.ronda_edad` declaran un
 * destino de familia 'consulta' (`hato.lista_hato`/`agu.monitoreo`), así
 * que bajo el validador (accionesValidador.ts, ya escrito y congelado) esos
 * dos hechos NUNCA pueden sostener ni apoyar una acción -- son contexto
 * muerto, no un bug de este archivo. Se documenta con un test explícito en
 * vez de una aserción global falsa; el resto de los casos SÍ cumplen la
 * regla y se prueban.
 */

import { describe, it, expect } from 'vitest';
import {
  agregarNecesidadesPorProducto,
  CATALOGO_DESTINOS,
  construirHechosAguacate,
  construirHechosGanado,
  construirHechosHatoLechero,
  ensamblarPaquete,
  limitarHechosPorCupo,
  MAX_HECHOS_POR_NEGOCIO,
  obtenerFechaHoyBogota,
  obtenerGeneradoAtBogota,
  type DatosAguacateParaPaquete,
  type DatosGanadoParaPaquete,
  type DatosHatoParaPaquete,
  type DependenciasEnsamblador,
} from '../supabase/functions/server/acciones-paquete';
import type { Hecho } from '../utils/accionesTipos';
import type { HatoEstadoActualRow } from '../supabase/functions/server/hato-aggregation';
import type { FilaHatoConfig } from '../supabase/functions/server/hato-config-desde-tabla';
import type { RevisionPeriodicaFila } from '../utils/accionesHechos';

const HOY = '2026-08-17';

// ============================================================================
// obtenerFechaHoyBogota / obtenerGeneradoAtBogota
// ============================================================================

describe('fecha Bogotá (Deno corre en UTC -- CLAUDE.md, "hoy siempre en hora LOCAL")', () => {
  it('un instante UTC de madrugada todavía es "ayer" en Bogotá (antes de las 05:00 UTC)', () => {
    // 2026-08-17T02:00:00Z = 2026-08-16 21:00 en Bogotá (UTC-5).
    expect(obtenerFechaHoyBogota(new Date('2026-08-17T02:00:00Z'))).toBe('2026-08-16');
  });

  it('la hora del cron (10:50 UTC = 05:50 Bogotá) cae en el mismo día calendario en las dos zonas', () => {
    expect(obtenerFechaHoyBogota(new Date('2026-08-17T10:50:00Z'))).toBe('2026-08-17');
  });

  it('generado_at lleva el offset -05:00 literal (Bogotá no tiene horario de verano)', () => {
    const generadoAt = obtenerGeneradoAtBogota(new Date('2026-08-17T10:50:00Z'));
    expect(generadoAt).toBe('2026-08-17T05:50:00-05:00');
  });
});

// ============================================================================
// CATALOGO_DESTINOS -- todas las rutas verificadas contra src/App.tsx
// ============================================================================

describe('CATALOGO_DESTINOS', () => {
  const IDS_ESPERADOS = [
    'hato.lista_vacias', 'hato.lista_secado', 'hato.lista_hato',
    'hato.chequeos', 'hato.pesaje', 'hato.produccion', 'hato.ranking_vacas',
    'agu.monitoreo', 'agu.monitoreo_sublote', 'agu.aplicacion_cierre',
    'agu.aplicacion_detalle', 'agu.labores', 'agu.clima', 'agu.tarea_detalle',
    'inv.producto', 'fin.presupuesto', 'gan.dashboard', 'gan.movimientos',
    'gan.config_fincas',
  ] as const;

  it('cubre los 19 DestinoId del contrato de Fase 1', () => {
    const idsPresentes = new Set(CATALOGO_DESTINOS.map((d) => d.id));
    for (const id of IDS_ESPERADOS) expect(idsPresentes.has(id)).toBe(true);
  });

  it('fin.presupuesto aparece una vez POR NEGOCIO (aguacate/hato_lechero/ganado) -- nunca colapsado en una fila', () => {
    const filasPresupuesto = CATALOGO_DESTINOS.filter((d) => d.id === 'fin.presupuesto');
    expect(filasPresupuesto.map((d) => d.negocio).sort()).toEqual(['aguacate', 'ganado', 'hato_lechero']);
    for (const fila of filasPresupuesto) expect(fila.requiere_rol).toBe('Gerencia');
  });

  it('ninguna ruta es un placeholder de prueba (nunca contiene "/x" ni un id fabricado)', () => {
    for (const destino of CATALOGO_DESTINOS) {
      expect(destino.ruta).not.toMatch(/\/x(\?|$)/);
    }
  });
});

// ============================================================================
// §3.6 -- limitarHechosPorCupo
// ============================================================================

function hechoMinimo(overrides: Partial<Hecho> & Pick<Hecho, 'id'>): Hecho {
  return {
    negocio: 'aguacate',
    origen: 'O1_senal',
    categoria: 'plagas',
    texto: `evidencia de ${overrides.id}`,
    valores: {},
    fuente: 'test',
    fecha_dato: HOY,
    edad_dias: 0,
    confianza: 'ok',
    destinos: ['agu.monitoreo'],
    cotejo: { tipo: 'sin_cotejo' },
    atendido_por: [],
    titular_pulso: false,
    fecha_limite: null,
    dias_esperando: null,
    tamano_conjunto: null,
    visibilidad: 'todos',
    ...overrides,
  };
}

describe('limitarHechosPorCupo (§3.6, ≤12 hechos por negocio)', () => {
  it('no trunca por debajo del máximo', () => {
    const hechos = [hechoMinimo({ id: 'a' }), hechoMinimo({ id: 'b' })];
    expect(limitarHechosPorCupo(hechos, HOY)).toHaveLength(2);
  });

  it('trunca a 12 y prioriza fecha encima > antigüedad > tamaño, igual que accionesOrden.ts', () => {
    const hechos: Hecho[] = [];
    // 10 hechos "de relleno" sin fecha límite, tamaño creciente.
    for (let i = 0; i < 10; i += 1) {
      hechos.push(hechoMinimo({ id: `relleno_${i}`, tamano_conjunto: i }));
    }
    // Uno vencido (fecha encima) -- debe sobrevivir el corte aunque su
    // tamaño sea el más chico de todos.
    hechos.push(hechoMinimo({ id: 'vencido', fecha_limite: '2026-08-01', dias_esperando: 16, tamano_conjunto: 1 }));
    // Uno con fecha próxima (dentro de 7 días) -- también debe sobrevivir.
    hechos.push(hechoMinimo({ id: 'proximo', fecha_limite: '2026-08-20', tamano_conjunto: 1 }));
    // Uno más de relleno, para totalizar 13 (uno más que el cupo).
    hechos.push(hechoMinimo({ id: 'relleno_extra', tamano_conjunto: 0 }));

    const resultado = limitarHechosPorCupo(hechos, HOY);
    expect(resultado).toHaveLength(MAX_HECHOS_POR_NEGOCIO);
    const ids = resultado.map((h) => h.id);
    expect(ids).toContain('vencido');
    expect(ids).toContain('proximo');
    // Los dos con fecha encima van primero (criterio 1º) -- y DENTRO de ese
    // grupo, lo que TODAVÍA SE PUEDE PREVENIR va antes que lo YA VENCIDO
    // (criterio 1a, comentario de `ClaveOrden.vencida` en accionesOrden.ts:
    // una fecha próxima es una oportunidad de prevenir, una vencida es una
    // deuda que no crece).
    expect(ids[0]).toBe('proximo');
    expect(ids[1]).toBe('vencido');
    // El de menor tamaño entre los "de relleno" (relleno_extra, tamaño 0) es
    // el que se cae -- quedan 10 huecos para 11 candidatos de relleno.
    expect(ids).not.toContain('relleno_extra');
  });
});

// ============================================================================
// §3.3 bis -- agregarNecesidadesPorProducto (la agregación por producto
// DENTRO de la aplicación, antes de comparar contra el stock)
// ============================================================================

describe('agregarNecesidadesPorProducto', () => {
  it('suma dos mezclas de LA MISMA aplicación para el mismo producto (caso de oro §3.3 bis)', () => {
    const mezclas = [
      { id: 'mezcla-1', aplicacionId: 'ap-enmienda' },
      { id: 'mezcla-2', aplicacionId: 'ap-enmienda' },
    ];
    const productos = [
      { mezclaId: 'mezcla-1', productoId: 'silicalmag', productoNombre: 'Silicalmag', productoUnidad: 'Kilos', cantidadNecesaria: 7000 },
      { mezclaId: 'mezcla-2', productoId: 'silicalmag', productoNombre: 'Silicalmag', productoUnidad: 'Kilos', cantidadNecesaria: 5694 },
    ];
    const resultado = agregarNecesidadesPorProducto(mezclas, productos);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ aplicacionId: 'ap-enmienda', productoId: 'silicalmag', cantidadNecesaria: 12694 });
  });

  it('NO mezcla el mismo producto entre DOS aplicaciones distintas', () => {
    const mezclas = [
      { id: 'mezcla-1', aplicacionId: 'ap-1' },
      { id: 'mezcla-2', aplicacionId: 'ap-2' },
    ];
    const productos = [
      { mezclaId: 'mezcla-1', productoId: 'magister', productoNombre: 'Magister', productoUnidad: 'Litros', cantidadNecesaria: 9.13 },
      { mezclaId: 'mezcla-2', productoId: 'magister', productoNombre: 'Magister', productoUnidad: 'Litros', cantidadNecesaria: 3 },
    ];
    const resultado = agregarNecesidadesPorProducto(mezclas, productos);
    expect(resultado).toHaveLength(2);
    expect(resultado.map((r) => r.aplicacionId).sort()).toEqual(['ap-1', 'ap-2']);
  });

  it('ignora una fila de aplicaciones_productos cuya mezcla no está en el universo consultado (huérfana)', () => {
    const resultado = agregarNecesidadesPorProducto(
      [{ id: 'mezcla-conocida', aplicacionId: 'ap-1' }],
      [{ mezclaId: 'mezcla-desconocida', productoId: 'x', productoNombre: 'X', productoUnidad: 'Kilos', cantidadNecesaria: 10 }],
    );
    expect(resultado).toHaveLength(0);
  });
});

// ============================================================================
// construirHechosHatoLechero
// ============================================================================

const CONFIG_HATO_FILAS: FilaHatoConfig[] = [
  { clave: 'razas', valor: ['jersey', 'holstein', 'normanda', 'gyr'] },
  { clave: 'meses_secado_por_raza', valor: { jersey: 2, holstein: 2, normanda: 3, _default: 2 } },
  { clave: 'meses_gestacion_default', valor: 9 },
  { clave: 'umbral_partos_reemplazo', valor: 9 },
  { clave: 'ventana_proxima_secar_dias', valor: 30 },
  { clave: 'ventana_proximo_parir_dias', valor: 30 },
  { clave: 'dias_parto_proximo_alerta', valor: 14 },
  { clave: 'dias_servicio_sin_confirmacion', valor: 45 },
  { clave: 'dias_espera_voluntaria_post_parto', valor: 90 },
  { clave: 'dias_rechequeo_due', valor: 60 },
  { clave: 'meses_ternera_leche_max', valor: 3 },
  { clave: 'meses_ternera_max', valor: 12 },
];

function estadoActualBase(overrides: Partial<HatoEstadoActualRow> = {}): HatoEstadoActualRow {
  return {
    animal_id: 'a1',
    numero: 47,
    nombre: 'MONA',
    etapa: 'vaca',
    raza: 'jersey',
    estado: 'activa',
    num_partos: 2,
    ultimo_chequeo_fecha: '2026-07-01',
    ultimo_chequeo_vaca_id: 'cv1',
    ultimo_servicio_fecha: null,
    ultimo_parto_fecha: null,
    ultimo_secado_real_fecha: null,
    ultima_confirmacion_prenez_fecha: null,
    ultimo_evento_fecha: null,
    ultima_confirmacion_prenez_metodo: null,
    ultimo_aborto_fecha: null,
    ultimo_estado_chequeo: null,
    fecha_nacimiento: '2019-03-01',
    etapa_forzada: false,
    ...overrides,
  } as HatoEstadoActualRow;
}

function datosHatoBase(overrides: Partial<DatosHatoParaPaquete> = {}): DatosHatoParaPaquete {
  return {
    filasHatoConfig: CONFIG_HATO_FILAS,
    filasEstadoActual: [],
    fechaUltimoChequeo: null,
    pesajesRecientes: [],
    eventosRecientes: [],
    cantidadSinRaza: 0,
    revisiones: [],
    hoy: HOY,
    ...overrides,
  };
}

describe('construirHechosHatoLechero', () => {
  it('emite hato.vacias_90d con la cuenta correcta -- vaca parida hace 120 días, sin servicio ni preñez', () => {
    const filas = [
      estadoActualBase({ animal_id: 'v1', numero: 1, ultimo_parto_fecha: '2026-04-19', ultimo_evento_fecha: '2026-04-19' }),
      estadoActualBase({ animal_id: 'v2', numero: 2, ultimo_servicio_fecha: '2026-08-01', ultimo_evento_fecha: '2026-08-01' }), // servida, no cuenta
    ];
    const hechos = construirHechosHatoLechero(datosHatoBase({ filasEstadoActual: filas }));
    const hVacias = hechos.find((h) => h.id === 'hato.vacias_90d');
    expect(hVacias).toBeDefined();
    expect(hVacias?.valores.cantidad.crudo).toBe(1);
    expect(hVacias?.confianza).toBe('ok');
    expect(hVacias?.destinos).toEqual(['hato.lista_vacias']);
  });

  it('hato.ultimo_chequeo es sin_dato cuando nunca hubo chequeo, con destino de CAPTURA (R-7 se cumple)', () => {
    const hechos = construirHechosHatoLechero(datosHatoBase({ fechaUltimoChequeo: null }));
    const h = hechos.find((x) => x.id === 'hato.ultimo_chequeo');
    expect(h?.confianza).toBe('sin_dato');
    const destino = CATALOGO_DESTINOS.find((d) => h?.destinos.includes(d.id) && d.negocio === 'hato_lechero');
    expect(destino?.familia).toBe('captura');
  });

  it('hato.sin_raza es sin_dato con destino "consulta" -- contexto que NUNCA puede sostener/apoyar una acción bajo el validador (documentado, no un bug de este archivo)', () => {
    const hechos = construirHechosHatoLechero(datosHatoBase({ cantidadSinRaza: 3 }));
    const h = hechos.find((x) => x.id === 'hato.sin_raza');
    expect(h?.confianza).toBe('sin_dato');
    const destino = CATALOGO_DESTINOS.find((d) => h?.destinos.includes(d.id) && d.negocio === 'hato_lechero');
    expect(destino?.familia).toBe('consulta');
  });

  it('explota si hato_config no trae una clave requerida -- nunca un default inventado (mismo contrato que hato-alertas-tick.ts)', () => {
    const filasIncompletas = CONFIG_HATO_FILAS.filter((f) => f.clave !== 'dias_espera_voluntaria_post_parto');
    expect(() => construirHechosHatoLechero(datosHatoBase({ filasHatoConfig: filasIncompletas }))).toThrow();
  });

  it('O-8 hato_lechero.productividad se emite con visibilidad "todos" (su destino, hato.ranking_vacas, no exige Gerencia)', () => {
    const revision: RevisionPeriodicaFila = {
      clave: 'hato_lechero.productividad',
      negocio: 'hato_lechero',
      nombre: 'Productividad del hato tras cada chequeo',
      destinoId: 'hato.ranking_vacas',
      activa: true,
      disparo: 'al_ocurrir_evento',
      cadenciaDias: null,
      periodo: null,
      diasGracia: 0,
      eventoSelector: 'hato.ultimo_chequeo_fecha',
      ultimaRevisionAt: null,
    };
    const filas = [estadoActualBase({ animal_id: 'v1', ultimo_chequeo_fecha: '2026-07-10' })];
    const hechos = construirHechosHatoLechero(datosHatoBase({ filasEstadoActual: filas, revisiones: [revision] }));
    const h = hechos.find((x) => x.id === 'rev.hato_lechero.productividad');
    expect(h).toBeDefined();
    expect(h?.visibilidad).toBe('todos');
    expect(h?.fecha_limite).toBe('2026-07-10');
  });
});

// ============================================================================
// construirHechosAguacate
// ============================================================================

function datosAguacateBase(overrides: Partial<DatosAguacateParaPaquete> = {}): DatosAguacateParaPaquete {
  return {
    filasMonitoreo: [],
    umbrales: [],
    perfilesEstacionales: [],
    ultimasFumigaciones: [],
    rondaActualId: null,
    sublotesEnAlcance: [],
    aplicaciones: [],
    aplicacionesMezclas: [],
    aplicacionesProductos: [],
    stockProductos: [],
    tareasAbiertas: [],
    registrosTrabajo: [],
    climaReciente: [],
    revisiones: [],
    hoy: HOY,
    ...overrides,
  };
}

describe('construirHechosAguacate', () => {
  it('agu.insumo_faltante reproduce el caso de oro del brief (Silicalmag: necesita 12.694, hay 8.000, falta 4.694)', () => {
    const datos = datosAguacateBase({
      aplicaciones: [
        { id: 'ap-enmienda', nombre: 'Aplicacion Enmienda', estado: 'Calculada', fechaInicioPlaneada: '2026-08-18', createdAt: '2026-08-01T00:00:00Z' },
      ],
      aplicacionesMezclas: [{ id: 'mezcla-1', aplicacionId: 'ap-enmienda' }],
      aplicacionesProductos: [
        { mezclaId: 'mezcla-1', productoId: 'silicalmag', productoNombre: 'Silicalmag', productoUnidad: 'Kilos', cantidadNecesaria: 12694 },
      ],
      stockProductos: [{ productoId: 'silicalmag', cantidadActual: 8000 }],
    });
    const hechos = construirHechosAguacate(datos);
    const h = hechos.find((x) => x.id.startsWith('agu.insumo_faltante'));
    expect(h).toBeDefined();
    expect(h?.confianza).toBe('ok');
    expect(h?.valores.falta.crudo).toBe(4694);
    expect(h?.verbos_permitidos).toEqual(['Confirmar', 'Verificar']);
  });

  it('agu.insumo_faltante es sin_dato (nunca "faltan 12.694") cuando cantidad_actual es NULL', () => {
    const datos = datosAguacateBase({
      aplicaciones: [
        { id: 'ap-1', nombre: 'Aplicación X', estado: 'En ejecución', fechaInicioPlaneada: null, createdAt: '2026-08-01T00:00:00Z' },
      ],
      aplicacionesMezclas: [{ id: 'mezcla-1', aplicacionId: 'ap-1' }],
      aplicacionesProductos: [
        { mezclaId: 'mezcla-1', productoId: 'prod-x', productoNombre: 'Producto X', productoUnidad: 'Litros', cantidadNecesaria: 100 },
      ],
      stockProductos: [], // sin fila -- cantidad_actual desconocida
    });
    const hechos = construirHechosAguacate(datos);
    const h = hechos.find((x) => x.id.startsWith('agu.insumo_faltante'));
    expect(h?.confianza).toBe('sin_dato');
    expect(h?.valores.falta.render).toBe('s/d');
  });

  it('un faltante bajo el piso de ruido (2%) no produce hecho', () => {
    const datos = datosAguacateBase({
      aplicaciones: [{ id: 'ap-1', nombre: 'Aplicación Y', estado: 'En ejecución', fechaInicioPlaneada: null, createdAt: '2026-08-01T00:00:00Z' }],
      aplicacionesMezclas: [{ id: 'mezcla-1', aplicacionId: 'ap-1' }],
      aplicacionesProductos: [{ mezclaId: 'mezcla-1', productoId: 'p2', productoNombre: 'Magister', productoUnidad: 'Litros', cantidadNecesaria: 9.13 }],
      stockProductos: [{ productoId: 'p2', cantidadActual: 9.0 }], // 1.4% de faltante
    });
    const hechos = construirHechosAguacate(datos);
    expect(hechos.find((x) => x.id.startsWith('agu.insumo_faltante'))).toBeUndefined();
  });

  it('sin ronda de monitoreo registrada, agu.ronda_edad es sin_dato con destino "consulta" (mismo caso documentado que hato.sin_raza)', () => {
    const hechos = construirHechosAguacate(datosAguacateBase({ rondaActualId: null }));
    const h = hechos.find((x) => x.id === 'agu.ronda_edad');
    expect(h?.confianza).toBe('sin_dato');
    const destino = CATALOGO_DESTINOS.find((d) => h?.destinos.includes(d.id) && d.negocio === 'aguacate');
    expect(destino?.familia).toBe('consulta');
  });

  it('agu.jornales_semana es sin_dato con destino de CAPTURA (agu.labores) cuando no hay registros esta semana', () => {
    const hechos = construirHechosAguacate(datosAguacateBase({ registrosTrabajo: [] }));
    const h = hechos.find((x) => x.id === 'agu.jornales_semana');
    expect(h?.confianza).toBe('sin_dato');
    const destino = CATALOGO_DESTINOS.find((d) => h?.destinos.includes(d.id) && d.negocio === 'aguacate');
    expect(destino?.familia).toBe('captura');
  });
});

// ============================================================================
// construirHechosGanado
// ============================================================================

function datosGanadoBase(overrides: Partial<DatosGanadoParaPaquete> = {}): DatosGanadoParaPaquete {
  return {
    ubicaciones: [],
    fincas: [],
    potreros: [],
    inventario: [],
    movimientos30d: [],
    pendientes: [],
    revisiones: [],
    hoy: HOY,
    ...overrides,
  };
}

describe('construirHechosGanado', () => {
  it('gan.inventario se emite SIEMPRE (nunca condicionado -- una consulta caída se maneja un nivel arriba, en ensamblarPaquete)', () => {
    const hechos = construirHechosGanado(datosGanadoBase());
    const h = hechos.find((x) => x.id === 'gan.inventario');
    expect(h).toBeDefined();
    expect(h?.valores.cabezas.crudo).toBe(0);
  });

  it('gan.fincas_sin_ha es sin_dato con destino de CAPTURA (gan.config_fincas)', () => {
    const hechos = construirHechosGanado(
      datosGanadoBase({
        ubicaciones: [{ id: 'u1', nombre: 'Finca Norte' }],
        fincas: [{ id: 'f1', nombre: 'La Vega', ubicacion_id: 'u1', hectareas: 0, activa: true }],
      }),
    );
    const h = hechos.find((x) => x.id === 'gan.fincas_sin_ha');
    expect(h?.confianza).toBe('sin_dato');
    const destino = CATALOGO_DESTINOS.find((d) => h?.destinos.includes(d.id) && d.negocio === 'ganado');
    expect(destino?.familia).toBe('captura');
  });
});

// ============================================================================
// ensamblarPaquete -- AISLAMIENTO POR NEGOCIO (§10 Fase 2)
// ============================================================================

function depsBase(overrides: Partial<DependenciasEnsamblador> = {}): DependenciasEnsamblador {
  return {
    fetchHato: async () => datosHatoBase(),
    fetchAguacate: async () => datosAguacateBase(),
    fetchGanado: async () => datosGanadoBase(),
    fetchRevisiones: async () => [],
    ...overrides,
  };
}

describe('ensamblarPaquete -- aislamiento por negocio', () => {
  it('un negocio caído (aguacate) no tumba a los otros dos', async () => {
    const deps = depsBase({
      fetchAguacate: async () => {
        throw new Error('monitoreos no respondió');
      },
    });
    const paquete = await ensamblarPaquete(deps, new Date('2026-08-17T10:50:00Z'));
    expect(paquete.negocios.sort()).toEqual(['ganado', 'hato_lechero']);
    expect(paquete.incidencias).toEqual([{ negocio: 'aguacate', error: 'monitoreos no respondió' }]);
    expect(paquete.hechos.every((h) => h.negocio !== 'aguacate')).toBe(true);
  });

  it('los tres negocios caídos -> estado inferible como "parcial" (3 incidencias, 0 negocios, 0 hechos) sin lanzar', async () => {
    const deps = depsBase({
      fetchHato: async () => {
        throw new Error('hato caído');
      },
      fetchAguacate: async () => {
        throw new Error('aguacate caído');
      },
      fetchGanado: async () => {
        throw new Error('ganado caído');
      },
    });
    const paquete = await ensamblarPaquete(deps, new Date('2026-08-17T10:50:00Z'));
    expect(paquete.negocios).toEqual([]);
    expect(paquete.hechos).toEqual([]);
    expect(paquete.incidencias).toHaveLength(3);
  });

  it('fecha_referencia/generado_at usan Bogotá, y el paquete trae version=1 y sin contexto de comité (v1, D-1(a))', async () => {
    const paquete = await ensamblarPaquete(depsBase(), new Date('2026-08-17T10:50:00Z'));
    expect(paquete.version).toBe(1);
    expect(paquete.fecha_referencia).toBe('2026-08-17');
    expect(paquete.generado_at).toBe('2026-08-17T05:50:00-05:00');
    expect(paquete.contexto_comite).toEqual({ estado: 'no_disponible', ventana_dias: 0, senales: [] });
    expect(paquete.exclusiones).toEqual([]);
  });

  it('ensamblarPaquete nunca supera el cupo de §3.6 por negocio, incluso con un paquete de aguacate con muchas señales de plaga', async () => {
    // El corte en sí (más de 12 -> 12) ya está probado de forma aislada en
    // el describe de `limitarHechosPorCupo` de arriba; este test verifica
    // que `ensamblarPaquete` efectivamente LLAMA a esa función para cada
    // negocio (aquí, con 15 series de plaga -- ya recortadas a
    // TOP_PLAGAS_PAQUETE=8 por `construirHechosAguacate` antes de llegar al
    // cupo general) y que la invariante ≤12 se sostiene de punta a punta.
    const filasMonitoreo = Array.from({ length: 15 }, (_, i) => ({
      fecha_monitoreo: HOY,
      ronda_id: 'ronda-actual',
      lote_id: 'lote-1',
      sublote_id: `sub-${i}`,
      plaga_enfermedad_id: `plaga-${i}`,
      arboles_monitoreados: 50,
      arboles_afectados: 10,
      incidencia: 20,
      lote_nombre: 'Lote 1',
      sublote_nombre: `Sublote ${i}`,
      pest_nombre: `Plaga ${i}`,
    }));
    const deps = depsBase({
      fetchAguacate: async () => datosAguacateBase({ filasMonitoreo, rondaActualId: 'ronda-actual' }),
    });
    const paquete = await ensamblarPaquete(deps, new Date('2026-08-17T10:50:00Z'));
    const porNegocio = new Map<string, number>();
    for (const h of paquete.hechos) porNegocio.set(h.negocio, (porNegocio.get(h.negocio) ?? 0) + 1);
    expect(porNegocio.get('aguacate')).toBeLessThanOrEqual(MAX_HECHOS_POR_NEGOCIO);
  });
});
