// hato-aggregation.ts — agregación/forma pura para las 3 herramientas de
// Esco del módulo Hato Lechero (S7, plan §7.2 "Esco: 3 herramientas nuevas").
// Sin imports de Deno/Supabase (mismo patrón que `ganado-inventario.ts`,
// `cost-aggregation.ts`, `reportes-financieros.ts`) para que sea testeable
// desde Vitest sin cruzar la frontera del árbol de despliegue.
//
// Sí importa `./calculos-hato.ts` y `./importHato/overridesChapeta.ts`:
// ambos son también TypeScript puro sin imports de Deno, así que la cadena
// completa sigue siendo importable desde Node/Vitest.
//
// Reglas de dominio que este módulo respeta (CLAUDE.md, "Hato Lechero
// Module"):
// - Ausencia de fila = "no visto", NUNCA 0 (misma regla que monitoreo). Una
//   vaca sin pesaje en el rango simplemente no aparece en `por_vaca` — no se
//   sintetiza una fila con `litros_total: 0`.
// - Ningún umbral de negocio vive hardcodeado aquí — todo llega vía
//   `HatoConfig` (leído en vivo de `hato_config` por el caller).
// - Un `numero` en el rango 800–999 es un número de trabajo provisional
//   (`esNumeroProvisional`), nunca una chapeta física — se marca explícito
//   en la ficha para que Esco nunca lo presente como caravana real.

import {
  derivarEstadoReproductivo,
  calcularProductividad,
  type HatoConfig,
  type EstadoActualHatoRow,
  type EstadoReproductivo,
  type EstadoReproductivoDerivado,
} from './calculos-hato.ts';
import { esNumeroProvisional } from './importHato/overridesChapeta.ts';

// ============================================================================
// Tipos de fila cruda (forma ya tipada de lo que el caller trae de Supabase)
// ============================================================================

export interface HatoAnimalRow {
  id: string;
  numero: number | null;
  nombre: string | null;
  sexo: 'hembra' | 'macho' | null;
  etapa: 'ternera' | 'novilla' | 'vaca' | 'toro';
  raza: string | null;
  estado: 'activa' | 'vendida' | 'muerta' | 'descartada';
  fecha_estado: string | null;
  fecha_nacimiento: string | null;
  fecha_nacimiento_confianza: 'exacta' | 'aproximada' | 'desconocida';
  madre_id: string | null;
  padre_toro_id: string | null;
  padre_id: string | null;
  origen: string | null;
  confianza: 'alta' | 'media' | 'baja';
  notas: string | null;
}

export interface HatoToroRow {
  id: string;
  nombre: string;
  tipo: string | null;
  raza: string | null;
  activo: boolean;
}

export interface HatoEventoRow {
  tipo: string;
  fecha: string;
  fecha_confianza: string;
  tipo_servicio: string | null;
  cria_destino: string | null;
  /** Embed `toro:hato_toros(nombre)` — null cuando el evento no tiene toro
   * asociado (ej. parto, aborto). */
  toro: { nombre: string } | null;
  datos: unknown;
}

/**
 * Fila real de `v_hato_estado_actual` (migraciones 056/062). `EstadoActualHatoRow`
 * (de `calculos-hato.ts`) solo declara el subconjunto de columnas que
 * `derivarEstadoReproductivo` consume -- esta interfaz agrega las columnas de
 * identidad/navegación que la vista también trae (`animal_id`, `numero`,
 * `nombre`, `ultimo_chequeo_vaca_id`) y que este módulo necesita para
 * construir la ficha y las listas del panorama reproductivo. El tipado
 * estructural de TS permite pasar una fila de este tipo donde se pide
 * `EstadoActualHatoRow` sin conversión.
 */
export interface HatoEstadoActualRow extends EstadoActualHatoRow {
  animal_id: string;
  numero: number | null;
  nombre: string | null;
  ultimo_chequeo_vaca_id: string | null;
}

export interface HatoChequeoVacaDetalleRow {
  pl: number | null;
  num_partos: number | null;
  fecha_servicio: string | null;
  toro: string | null;
  tipo_servicio: string | null;
  meses_prenez: number | null;
  fecha_secar: string | null;
  fecha_probable_parto: string | null;
  estado: string | null;
  estado_raw: string | null;
  normalizacion_issues: unknown;
  /** Embed `hato_chequeos(fecha)` ya resuelto por el caller. */
  chequeo_fecha: string | null;
}

// ============================================================================
// get_hato_animal — ficha individual
// ============================================================================

export interface AnimalMatchResumen {
  id: string;
  numero: number | null;
  nombre: string | null;
  etapa: string;
  estado: string;
}

/** Da forma a la lista de coincidencias cuando la búsqueda por nombre
 * devuelve más de un animal — Esco debe pedir precisión, nunca adivinar
 * cuál quiso decir el usuario. */
export function shapeAnimalMatches(animales: HatoAnimalRow[]): AnimalMatchResumen[] {
  return animales.map((a) => ({
    id: a.id,
    numero: a.numero,
    nombre: a.nombre,
    etapa: a.etapa,
    estado: a.estado,
  }));
}

export interface AnimalFicha {
  encontrado: true;
  id: string;
  numero: number | null;
  numero_es_provisional: boolean;
  nombre: string | null;
  sexo: string | null;
  etapa: string;
  raza: string | null;
  estado: string;
  fecha_estado: string | null;
  fecha_nacimiento: string | null;
  fecha_nacimiento_confianza: string;
  confianza_identidad: string;
  origen: string | null;
  notas: string | null;
  genealogia: {
    madre: { numero: number | null; nombre: string | null; numero_es_provisional: boolean } | null;
    padre_toro: { nombre: string; tipo: string | null; raza: string | null } | null;
    padre_animal: { numero: number | null; nombre: string | null; numero_es_provisional: boolean } | null;
  };
  estado_reproductivo: (EstadoReproductivoDerivado & { fecha_referencia: string }) | null;
  ultimo_chequeo: (HatoChequeoVacaDetalleRow & { numero_partos: number | null }) | null;
  eventos_recientes: {
    tipo: string;
    fecha: string;
    fecha_confianza: string;
    tipo_servicio: string | null;
    cria_destino: string | null;
    toro: string | null;
  }[];
}

/**
 * Construye la ficha completa de un animal ya resuelto (match único). El
 * estado reproductivo se deriva con el MISMO motor que el resto del módulo
 * (`derivarEstadoReproductivo`) — nunca se re-implementa el cálculo aquí.
 */
export function buildAnimalFicha(params: {
  animal: HatoAnimalRow;
  madre: HatoAnimalRow | null;
  padreToro: HatoToroRow | null;
  padreAnimal: HatoAnimalRow | null;
  estadoActual: HatoEstadoActualRow | null;
  config: HatoConfig;
  fechaReferencia: string;
  eventosRecientes: HatoEventoRow[];
  ultimoChequeo: HatoChequeoVacaDetalleRow | null;
}): AnimalFicha {
  const { animal, madre, padreToro, padreAnimal, estadoActual, config, fechaReferencia, eventosRecientes, ultimoChequeo } = params;

  const estadoReproductivo = estadoActual
    ? { ...derivarEstadoReproductivo(estadoActual, config, fechaReferencia), fecha_referencia: fechaReferencia }
    : null;

  return {
    encontrado: true,
    id: animal.id,
    numero: animal.numero,
    numero_es_provisional: esNumeroProvisional(animal.numero),
    nombre: animal.nombre,
    sexo: animal.sexo,
    etapa: animal.etapa,
    raza: animal.raza,
    estado: animal.estado,
    fecha_estado: animal.fecha_estado,
    fecha_nacimiento: animal.fecha_nacimiento,
    fecha_nacimiento_confianza: animal.fecha_nacimiento_confianza,
    confianza_identidad: animal.confianza,
    origen: animal.origen,
    notas: animal.notas,
    genealogia: {
      madre: madre
        ? { numero: madre.numero, nombre: madre.nombre, numero_es_provisional: esNumeroProvisional(madre.numero) }
        : null,
      padre_toro: padreToro
        ? { nombre: padreToro.nombre, tipo: padreToro.tipo, raza: padreToro.raza }
        : null,
      padre_animal: padreAnimal
        ? { numero: padreAnimal.numero, nombre: padreAnimal.nombre, numero_es_provisional: esNumeroProvisional(padreAnimal.numero) }
        : null,
    },
    estado_reproductivo: estadoReproductivo,
    ultimo_chequeo: ultimoChequeo
      ? { ...ultimoChequeo, numero_partos: ultimoChequeo.num_partos }
      : null,
    eventos_recientes: eventosRecientes.map((ev) => ({
      tipo: ev.tipo,
      fecha: ev.fecha,
      fecha_confianza: ev.fecha_confianza,
      tipo_servicio: ev.tipo_servicio,
      cria_destino: ev.cria_destino,
      toro: ev.toro?.nombre ?? null,
    })),
  };
}

// ============================================================================
// get_hato_reproduccion — panorama reproductivo del hato
// ============================================================================

/** V-tres categorías del hato (owner, ronda de decisiones 2026-07-22, plan
 * "El S4 herd view must show three categories: terneras, hato (milking),
 * horro"): terneras/novillas (no productivas), hato en ordeño (vacas
 * activas que no están secas -- una 'proxima_a_secar' sigue en ordeño) y
 * horro (vacas activas YA secas, esperando el parto). Regla unificada con
 * `hatoCategorias.ts` del frontend: Esco y la UI dan el mismo conteo,
 * cambiar una copia exige cambiar la otra. Los toros (etapa
 * histórica de import, el catálogo vivo es `hato_toros`) quedan fuera de
 * las tres categorías — se reportan aparte si aparecen. */
export type CategoriaHato = 'terneras' | 'hato_ordeno' | 'horro';

function categorizarAnimal(fila: HatoEstadoActualRow, estado: EstadoReproductivo): CategoriaHato | 'toro' | null {
  if (fila.estado !== 'activa') return null;
  if (fila.etapa === 'toro') return 'toro';
  if (fila.etapa === 'ternera' || fila.etapa === 'novilla') return 'terneras';
  // etapa === 'vaca'
  if (estado === 'seca') return 'horro';
  return 'hato_ordeno';
}

export interface AnimalResumenReproductivo {
  numero: number | null;
  nombre: string | null;
  raza: string | null;
  estado_reproductivo: EstadoReproductivo;
  dias_restantes: number;
}

export interface ReproduccionSummary {
  fecha_referencia: string;
  total_animales: number;
  categorias: {
    terneras: number;
    hato_ordeno: number;
    horro: number;
    toros: number;
  };
  por_estado_reproductivo: Partial<Record<EstadoReproductivo, number>>;
  alertas_activas: {
    secado_due: number;
    rechequeo_due: number;
    servicio_sin_confirmacion: number;
    parto_proximo: number;
  };
  proximos_partos: AnimalResumenReproductivo[];
  proximas_a_secar: AnimalResumenReproductivo[];
  proximas_a_reemplazo: { numero: number | null; nombre: string | null; num_partos: number }[];
  vacias_problema: { numero: number | null; nombre: string | null; estado_reproductivo: EstadoReproductivo }[];
  inactivos: { vendidas: number; muertas: number; descartadas: number };
}

function diferenciaDiasIso(desde: string, hasta: string): number {
  const [ay, am, ad] = desde.split('-').map(Number);
  const [by, bm, bd] = hasta.split('-').map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

/**
 * Construye el panorama reproductivo del hato completo a partir de las
 * filas de `v_hato_estado_actual` + `HatoConfig`. Delega TODO el cálculo de
 * fecha/estado en `derivarEstadoReproductivo` — este módulo solo agrega y
 * filtra por las ventanas del tablero (`ventana_proximo_parir_dias`,
 * `ventana_proxima_secar_dias`), que son distintas de las ventanas de
 * alerta (§7.3).
 */
export function buildReproduccionSummary(
  filas: HatoEstadoActualRow[],
  config: HatoConfig,
  fechaReferencia: string,
): ReproduccionSummary {
  const categorias = { terneras: 0, hato_ordeno: 0, horro: 0, toros: 0 };
  const porEstado: Partial<Record<EstadoReproductivo, number>> = {};
  const alertas = { secado_due: 0, rechequeo_due: 0, servicio_sin_confirmacion: 0, parto_proximo: 0 };
  const proximosPartos: AnimalResumenReproductivo[] = [];
  const proximasASecar: AnimalResumenReproductivo[] = [];
  const proximasAReemplazo: ReproduccionSummary['proximas_a_reemplazo'] = [];
  const vaciasProblema: ReproduccionSummary['vacias_problema'] = [];
  const inactivos = { vendidas: 0, muertas: 0, descartadas: 0 };

  for (const fila of filas) {
    if (fila.estado === 'vendida') inactivos.vendidas += 1;
    else if (fila.estado === 'muerta') inactivos.muertas += 1;
    else if (fila.estado === 'descartada') inactivos.descartadas += 1;

    const derivado = derivarEstadoReproductivo(fila, config, fechaReferencia);
    porEstado[derivado.estado] = (porEstado[derivado.estado] || 0) + 1;

    const categoria = categorizarAnimal(fila, derivado.estado);
    if (categoria === 'terneras') categorias.terneras += 1;
    else if (categoria === 'hato_ordeno') categorias.hato_ordeno += 1;
    else if (categoria === 'horro') categorias.horro += 1;
    else if (categoria === 'toro') categorias.toros += 1;

    if (fila.estado !== 'activa') continue;

    if (derivado.alertas.secado_due) alertas.secado_due += 1;
    if (derivado.alertas.rechequeo_due) alertas.rechequeo_due += 1;
    if (derivado.alertas.servicio_sin_confirmacion) alertas.servicio_sin_confirmacion += 1;
    if (derivado.alertas.parto_proximo) alertas.parto_proximo += 1;

    if (derivado.proxima_a_reemplazo) {
      proximasAReemplazo.push({ numero: fila.numero, nombre: fila.nombre, num_partos: fila.num_partos });
    }

    if (derivado.vacia_es_problema === true) {
      vaciasProblema.push({ numero: fila.numero, nombre: fila.nombre, estado_reproductivo: derivado.estado });
    }

    if (derivado.fecha_probable_parto) {
      const diasRestantes = diferenciaDiasIso(fechaReferencia, derivado.fecha_probable_parto);
      if (diasRestantes <= config.ventana_proximo_parir_dias) {
        proximosPartos.push({
          numero: fila.numero,
          nombre: fila.nombre,
          raza: fila.raza,
          estado_reproductivo: derivado.estado,
          dias_restantes: diasRestantes,
        });
      }
    }

    if (derivado.fecha_secar) {
      const diasRestantes = diferenciaDiasIso(fechaReferencia, derivado.fecha_secar);
      if (diasRestantes <= config.ventana_proxima_secar_dias) {
        proximasASecar.push({
          numero: fila.numero,
          nombre: fila.nombre,
          raza: fila.raza,
          estado_reproductivo: derivado.estado,
          dias_restantes: diasRestantes,
        });
      }
    }
  }

  proximosPartos.sort((a, b) => a.dias_restantes - b.dias_restantes);
  proximasASecar.sort((a, b) => a.dias_restantes - b.dias_restantes);

  return {
    fecha_referencia: fechaReferencia,
    total_animales: filas.length,
    categorias,
    por_estado_reproductivo: porEstado,
    alertas_activas: alertas,
    proximos_partos: proximosPartos,
    proximas_a_secar: proximasASecar,
    proximas_a_reemplazo: proximasAReemplazo,
    vacias_problema: vaciasProblema,
    inactivos,
  };
}

// ============================================================================
// get_hato_produccion — pesaje semanal + producción quincenal
// ============================================================================

export interface HatoPesajeRow {
  fecha: string;
  litros_am: number | null;
  litros_pm: number | null;
  litros_total: number;
  /** Embed `animal:hato_animales(numero,nombre)`. */
  animal: { numero: number | null; nombre: string | null } | null;
}

export interface HatoProduccionQuincenalRow {
  anio: number;
  mes: number;
  quincena: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  litros_total: number;
  litros_pomar_confirmado: number | null;
  num_vacas_ordeno: number | null;
  notas: string | null;
}

export interface ProduccionQuincenalConProductividad extends HatoProduccionQuincenalRow {
  /** `litros_total / num_vacas_ordeno` (V4) — `null` cuando falta cualquiera
   * de los dos datos, NUNCA 0 (misma regla de "sin dato" del módulo). */
  litros_por_vaca: number | null;
  /** `true` cuando el Pomar todavía no confirmó (`litros_pomar_confirmado`
   * es `null`) — V5, conciliación quincenal. */
  pendiente_conciliacion: boolean;
  /** Diferencia `litros_pomar_confirmado - litros_total` cuando ambos
   * existen; `null` si falta la confirmación. */
  diferencia_pomar: number | null;
}

export interface PesajePorVaca {
  numero: number | null;
  nombre: string | null;
  registros: { fecha: string; litros_total: number }[];
  promedio_litros: number;
  num_pesajes: number;
}

export interface ProduccionSummary {
  periodo: { desde: string; hasta: string };
  pesajes_semanales: {
    total_registros: number;
    /** Solo vacas con AL MENOS un pesaje en el rango — una vaca sin pesaje
     * simplemente no aparece aquí; nunca se sintetiza con litros en 0. */
    por_vaca: PesajePorVaca[];
    promedio_litros_por_pesaje: number | null;
  };
  produccion_quincenal: ProduccionQuincenalConProductividad[];
  kpi_quincena_mas_reciente: {
    anio: number;
    mes: number;
    quincena: number;
    litros_total: number;
    litros_por_vaca: number | null;
  } | null;
}

/**
 * Da forma a los datos de producción. Nunca mezcla las dos series (V3):
 * `hato_pesajes_leche` es productividad INDIVIDUAL; `hato_produccion_quincenal`
 * es el volumen de venta al camión — se reportan lado a lado, nunca
 * reconciliadas entre sí (esa reconciliación es contra `litros_pomar_confirmado`,
 * dentro de la propia serie quincenal).
 */
export function buildProduccionSummary(params: {
  periodo: { desde: string; hasta: string };
  pesajes: HatoPesajeRow[];
  produccionQuincenal: HatoProduccionQuincenalRow[];
}): ProduccionSummary {
  const { periodo, pesajes, produccionQuincenal } = params;

  const porVacaMap = new Map<string, PesajePorVaca>();
  for (const p of pesajes) {
    const clave = `${p.animal?.numero ?? 'sin-numero'}:${p.animal?.nombre ?? 'sin-nombre'}`;
    let entry = porVacaMap.get(clave);
    if (!entry) {
      entry = { numero: p.animal?.numero ?? null, nombre: p.animal?.nombre ?? null, registros: [], promedio_litros: 0, num_pesajes: 0 };
      porVacaMap.set(clave, entry);
    }
    entry.registros.push({ fecha: p.fecha, litros_total: p.litros_total });
  }
  const porVaca = Array.from(porVacaMap.values()).map((entry) => {
    const suma = entry.registros.reduce((s, r) => s + r.litros_total, 0);
    return {
      ...entry,
      registros: entry.registros.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)),
      num_pesajes: entry.registros.length,
      promedio_litros: entry.registros.length > 0 ? Math.round((suma / entry.registros.length) * 10) / 10 : 0,
    };
  }).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));

  const sumaTotalPesajes = pesajes.reduce((s, p) => s + p.litros_total, 0);
  const promedioLitrosPorPesaje = pesajes.length > 0 ? Math.round((sumaTotalPesajes / pesajes.length) * 10) / 10 : null;

  const quincenas: ProduccionQuincenalConProductividad[] = produccionQuincenal
    .map((q) => ({
      ...q,
      litros_por_vaca: calcularProductividad(q.litros_total, q.num_vacas_ordeno),
      pendiente_conciliacion: q.litros_pomar_confirmado == null,
      diferencia_pomar: q.litros_pomar_confirmado != null ? q.litros_pomar_confirmado - q.litros_total : null,
    }))
    .sort((a, b) => (a.anio !== b.anio ? b.anio - a.anio : a.mes !== b.mes ? b.mes - a.mes : b.quincena - a.quincena));

  const masReciente = quincenas[0] ?? null;

  return {
    periodo,
    pesajes_semanales: {
      total_registros: pesajes.length,
      por_vaca: porVaca,
      promedio_litros_por_pesaje: promedioLitrosPorPesaje,
    },
    produccion_quincenal: quincenas,
    kpi_quincena_mas_reciente: masReciente
      ? {
          anio: masReciente.anio,
          mes: masReciente.mes,
          quincena: masReciente.quincena,
          litros_total: masReciente.litros_total,
          litros_por_vaca: masReciente.litros_por_vaca,
        }
      : null,
  };
}
