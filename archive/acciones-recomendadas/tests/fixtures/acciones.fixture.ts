// ARCHIVO: __tests__/fixtures/acciones.fixture.ts
// DESCRIPCIÓN: Fixtures compartidas del motor de acciones recomendadas
// (docs/brief_tecnico_motor_acciones.md), usadas por accionesValidador.test.ts,
// accionesOrden.test.ts y accionesAntiInvento.test.ts. Construye un
// `PaqueteAcciones` mínimo pero representativo -- catálogo de destinos
// completo (§3.5) con la clasificación `familia` ya resuelta, y factories
// de `Hecho`/`AccionGenerada` con defaults sensatos que cada test sobrescribe
// sólo en lo que le importa.

import type {
  AccionGenerada,
  Destino,
  DestinoId,
  Hecho,
  PaqueteAcciones,
  SalidaMotor,
  ValorHecho,
} from '@/utils/accionesTipos';

export const FECHA_REFERENCIA = '2026-08-16';

export function valor(render: string, crudo: number | string | null = null, unidad: string | null = null): ValorHecho {
  return { crudo: crudo === null ? render : crudo, render, unidad };
}

/** Catálogo de destinos (§3.5), con `familia` resuelta según la lectura del
 *  brief documentada en `src/utils/accionesTipos.ts` (destinos con
 *  `familia: 'captura'`: `hato.pesaje`, `hato.chequeos`, `agu.labores`,
 *  `inv.producto`, `gan.config_fincas` -- el resto es `'consulta'`).
 *  `fin.presupuesto` aparece TRES veces, una por negocio (§3.3 ter: la
 *  ejecución presupuestal es una revisión por negocio, verificado contra la
 *  siembra real de la migración 097) -- ver la nota en accionesValidador.ts
 *  sobre por qué eso importa para la resolución de destino. */
export const CATALOGO_DESTINOS: Destino[] = [
  { id: 'hato.lista_vacias', negocio: 'hato_lechero', etiqueta_boton: 'Ver las vacías', ruta: '/hato-lechero/hato?filtro=vacias_90d', familia: 'consulta' },
  { id: 'hato.lista_secado', negocio: 'hato_lechero', etiqueta_boton: 'Ver secado', ruta: '/hato-lechero/hato?filtro=secado', familia: 'consulta' },
  { id: 'hato.lista_hato', negocio: 'hato_lechero', etiqueta_boton: 'Ver el hato', ruta: '/hato-lechero/hato', familia: 'consulta' },
  { id: 'hato.chequeos', negocio: 'hato_lechero', etiqueta_boton: 'Ir a chequeos', ruta: '/hato-lechero/chequeos', familia: 'captura' },
  { id: 'hato.pesaje', negocio: 'hato_lechero', etiqueta_boton: 'Registrar pesaje', ruta: '/hato-lechero/produccion?tab=pesaje', familia: 'captura' },
  { id: 'hato.produccion', negocio: 'hato_lechero', etiqueta_boton: 'Ver producción', ruta: '/hato-lechero/produccion', familia: 'consulta', es_titular_pulso: true },
  { id: 'hato.ranking_vacas', negocio: 'hato_lechero', etiqueta_boton: 'Ver ranking', ruta: '/hato-lechero?tab=ranking', familia: 'consulta' },
  { id: 'agu.monitoreo', negocio: 'aguacate', etiqueta_boton: 'Ir a monitoreo', ruta: '/monitoreo', familia: 'consulta' },
  { id: 'agu.monitoreo_sublote', negocio: 'aguacate', etiqueta_boton: 'Ver sublote', ruta: '/monitoreo?sublote=x', familia: 'consulta' },
  { id: 'agu.aplicacion_cierre', negocio: 'aguacate', etiqueta_boton: 'Ir al cierre', ruta: '/aplicaciones', familia: 'consulta' },
  { id: 'agu.aplicacion_detalle', negocio: 'aguacate', etiqueta_boton: 'Ver aplicación', ruta: '/aplicaciones', familia: 'consulta' },
  { id: 'agu.labores', negocio: 'aguacate', etiqueta_boton: 'Ir a labores', ruta: '/labores', familia: 'captura' },
  { id: 'agu.clima', negocio: 'aguacate', etiqueta_boton: 'Ver clima', ruta: '/clima', familia: 'consulta' },
  { id: 'agu.tarea_detalle', negocio: 'aguacate', etiqueta_boton: 'Ver tarea', ruta: '/labores', familia: 'consulta' },
  { id: 'inv.producto', negocio: 'aguacate', etiqueta_boton: 'Ver producto', ruta: '/inventario/producto/x', familia: 'captura' },
  { id: 'fin.presupuesto', negocio: 'aguacate', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'fin.presupuesto', negocio: 'hato_lechero', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'fin.presupuesto', negocio: 'ganado', etiqueta_boton: 'Ir al presupuesto', ruta: '/finanzas/presupuesto', familia: 'consulta', requiere_rol: 'Gerencia' },
  { id: 'gan.dashboard', negocio: 'ganado', etiqueta_boton: 'Ver ganado', ruta: '/ganado', familia: 'consulta' },
  { id: 'gan.movimientos', negocio: 'ganado', etiqueta_boton: 'Ver movimientos', ruta: '/ganado/movimientos', familia: 'consulta' },
  { id: 'gan.config_fincas', negocio: 'ganado', etiqueta_boton: 'Configurar fincas', ruta: '/configuracion/ganado', familia: 'captura' },
];

/** Factory de `Hecho` con defaults 'ok'/sin restricciones -- cada test sólo
 *  sobrescribe lo que le importa probar. */
export function hecho(overrides: Partial<Hecho> & Pick<Hecho, 'id' | 'negocio' | 'destinos'>): Hecho {
  return {
    origen: 'O1_senal',
    categoria: 'captura',
    texto: `Evidencia de ${overrides.id}`,
    valores: {},
    fuente: 'fixture',
    fecha_dato: FECHA_REFERENCIA,
    edad_dias: 0,
    confianza: 'ok',
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

export function paqueteConHechos(hechos: Hecho[], overrides: Partial<PaqueteAcciones> = {}): PaqueteAcciones {
  const destinosIds = new Set<DestinoId>();
  for (const h of hechos) for (const d of h.destinos) destinosIds.add(d);

  return {
    version: 1,
    generado_at: `${FECHA_REFERENCIA}T05:50:00-05:00`,
    fecha_referencia: FECHA_REFERENCIA,
    negocios: ['hato_lechero', 'aguacate', 'ganado'],
    hechos,
    destinos: CATALOGO_DESTINOS,
    exclusiones: [],
    contexto_comite: { estado: 'no_disponible', ventana_dias: 21, senales: [] },
    incidencias: [],
    ...overrides,
  };
}

export function accionGenerada(
  overrides: Partial<AccionGenerada> & Pick<AccionGenerada, 'negocio' | 'hecho_ids' | 'destino_id' | 'plantilla'>,
): AccionGenerada {
  return { ranuras: {}, ...overrides };
}

export function salidaMotor(acciones: AccionGenerada[]): SalidaMotor {
  return { acciones };
}
