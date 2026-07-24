// ARCHIVO: utils/importHato/recomputarPartosCercanos.ts
// DESCRIPCIÓN: Lógica PURA (cero I/O, cero Supabase) del recompute batch de
// "colapso de partos cercanos" (decisión del dueño, 2026-07-23 -- ver
// `calculosHato.ts::agruparPartosPorProximidad`/`decidirEventoParto` y
// CLAUDE.md, sección Hato Lechero). Consumida por el runner de I/O
// `scripts/import-hato/recompute-partos-cercanos.ts`, que lee un JSON local
// y escribe el reporte que produce esta función -- NUNCA toca una base de
// datos.
//
// Por qué existe un recompute SEPARADO del commit path en vivo
// (`commitChequeo.ts`): un chequeo nuevo solo conoce "la lectura anterior"
// (single-row), y `fn_hato_commit_chequeo` (migración 065) nunca puede tocar
// un evento de OTRO chequeo -- así que, en vivo, un cluster de partos
// cercanos que ya generó un evento en un chequeo previo se puede SUPRIMIR
// (no duplicar), pero no se puede CORREGIR retroactivamente la fecha del
// evento ya insertado. Este módulo resuelve eso mirando el historial
// COMPLETO de `hato_chequeo_vacas` de cada animal (mismo motor de
// clustering, `agruparPartosPorProximidad`, aplicado con lookahead completo
// en vez de fila por fila) y calculando, para cada cluster con más de un
// miembro, qué `hato_eventos` sobrante hay que ELIMINAR y cuál hay que
// ACTUALIZAR -- nunca qué INSERTAR: si un cluster no tiene NINGÚN evento
// existente que se le pueda asociar, este módulo lo deja como advertencia
// para revisión humana en vez de inventar una fila nueva (fuera de su
// contrato -- ver `AdvertenciaRecompute`).
//
// Este módulo NUNCA decide aplicar nada: produce un `ReporteRecompute` que
// el operador humano (con acceso SQL directo y verificado) revisa y aplica
// él mismo. Ver el runner para el contrato de E/S completo.

import { agruparPartosPorProximidad, esTipoSxDeParto, parseSX, parseUltimaCria, DIAS_MINIMOS_ENTRE_PARTOS, type LecturaUltimaCria } from '@/utils/calculosHato';

// ============================================================================
// Forma de entrada -- espejo de las columnas reales de `hato_chequeo_vacas`
// (join a `hato_chequeos` para `chequeo_fecha`) y `hato_eventos` tipo='parto'.
// ============================================================================

export interface FilaChequeoVacaRecompute {
  id: string;
  animal_id: string;
  chequeo_fecha: string;
  sx_raw: string | null;
  ultima_cria_raw: string | null;
}

export interface EventoPartoRecompute {
  id: string;
  animal_id: string;
  chequeo_vaca_id: string;
  fecha: string;
  fecha_confianza: string;
}

export interface EntradaRecomputePartosCercanos {
  chequeoVacas: FilaChequeoVacaRecompute[];
  eventosParto: EventoPartoRecompute[];
}

// ============================================================================
// Forma de salida -- decisiones DELETE/UPDATE, nunca INSERT (ver cabecera).
// ============================================================================

export interface DecisionEliminarEvento {
  id: string; // hato_eventos.id a borrar
  animalId: string;
  fecha: string;
  motivo: string;
}

export interface DecisionActualizarEvento {
  id: string; // hato_eventos.id -- se conserva, solo cambia fecha/fecha_confianza
  animalId: string;
  fechaActual: string;
  fechaNueva: string;
  fechaConfianzaNueva: 'exacta';
  motivo: string;
}

export interface AdvertenciaRecompute {
  animalId: string;
  motivo: string;
  lecturasColapsadas: LecturaUltimaCria[];
  fechaEventoEsperada: string;
}

export interface ReporteRecomputePartosCercanos {
  umbralDias: number;
  clustersConColapso: number;
  actualizar: DecisionActualizarEvento[];
  eliminar: DecisionEliminarEvento[];
  advertencias: AdvertenciaRecompute[];
}

interface Candidata {
  chequeoVacaId: string;
  lectura: LecturaUltimaCria;
}

/**
 * Calcula, a partir del historial COMPLETO de `hato_chequeo_vacas` de cada
 * animal más el estado ACTUAL de `hato_eventos` tipo='parto', qué eventos
 * sobran (DELETE) y cuál debe quedar con qué fecha (UPDATE) para converger
 * al colapso de partos cercanos -- un evento por cluster, fechado a la
 * lectura del ÚLTIMO chequeo del cluster.
 *
 * Determinístico y puro: la misma entrada produce siempre la misma salida,
 * sin `Date.now()` ni orden dependiente de iteración de `Map` (se ordena
 * explícitamente por `chequeo_fecha` antes de agrupar).
 */
export function recomputarPartosCercanos(entrada: EntradaRecomputePartosCercanos): ReporteRecomputePartosCercanos {
  const actualizar: DecisionActualizarEvento[] = [];
  const eliminar: DecisionEliminarEvento[] = [];
  const advertencias: AdvertenciaRecompute[] = [];
  let clustersConColapso = 0;

  const filasPorAnimal = new Map<string, FilaChequeoVacaRecompute[]>();
  for (const fila of entrada.chequeoVacas) {
    if (!filasPorAnimal.has(fila.animal_id)) filasPorAnimal.set(fila.animal_id, []);
    filasPorAnimal.get(fila.animal_id)!.push(fila);
  }

  const eventosPorAnimal = new Map<string, EventoPartoRecompute[]>();
  for (const evento of entrada.eventosParto) {
    if (!eventosPorAnimal.has(evento.animal_id)) eventosPorAnimal.set(evento.animal_id, []);
    eventosPorAnimal.get(evento.animal_id)!.push(evento);
  }

  // Orden estable de animales (por id) -- el reporte no debe variar según el
  // orden de iteración de un `Map` de JS (que sigue el orden de inserción,
  // pero mejor no depender de eso implícitamente).
  const animalIds = [...filasPorAnimal.keys()].sort();

  for (const animalId of animalIds) {
    const filas = filasPorAnimal.get(animalId)!;
    const ordenadas = [...filas].sort((a, b) => a.chequeo_fecha.localeCompare(b.chequeo_fecha));

    const candidatas: Candidata[] = [];
    for (const fila of ordenadas) {
      if (fila.sx_raw === null || fila.ultima_cria_raw === null) continue;
      const sx = parseSX(fila.sx_raw);
      if (!esTipoSxDeParto(sx.tipo)) continue;
      const ultimaCria = parseUltimaCria(fila.ultima_cria_raw).fecha;
      if (ultimaCria === null) continue;
      candidatas.push({ chequeoVacaId: fila.id, lectura: { chequeoFecha: fila.chequeo_fecha, ultimaCria } });
    }
    if (candidatas.length === 0) continue;

    const clusters = agruparPartosPorProximidad(candidatas.map((c) => c.lectura));
    const eventosDelAnimal = eventosPorAnimal.get(animalId) ?? [];

    let cursor = 0;
    for (const cluster of clusters) {
      const miembros = candidatas.slice(cursor, cursor + cluster.lecturas.length);
      cursor += cluster.lecturas.length;
      if (miembros.length <= 1) continue; // sin colapso, nada que hacer

      clustersConColapso += 1;

      const chequeoVacaIdsDelCluster = new Set(miembros.map((m) => m.chequeoVacaId));
      const eventosEnCluster = eventosDelAnimal.filter((e) => chequeoVacaIdsDelCluster.has(e.chequeo_vaca_id));

      if (eventosEnCluster.length === 0) {
        advertencias.push({
          animalId,
          motivo:
            'Cluster de partos cercanos detectado, pero NINGÚN hato_eventos existente está asociado a ninguna de sus lecturas -- no se puede generar una decisión de UPDATE sin inventar un evento nuevo (fuera de alcance de este recompute). Revisar manualmente.',
          lecturasColapsadas: miembros.map((m) => m.lectura),
          fechaEventoEsperada: cluster.fechaEvento,
        });
        continue;
      }

      const chequeoVacaIdSobreviviente = miembros.at(-1)!.chequeoVacaId;
      let eventoSobreviviente = eventosEnCluster.find((e) => e.chequeo_vaca_id === chequeoVacaIdSobreviviente);

      if (!eventoSobreviviente) {
        // El último miembro del cluster (el que debería anclar el evento
        // sobreviviente) no tiene un hato_eventos propio -- caso raro. Se
        // promueve el evento existente con la fecha más reciente como
        // sobreviviente en su lugar, y se advierte SIEMPRE (nunca en
        // silencio): es exactamente la clase de decisión que requiere ojo
        // humano antes de aplicar nada.
        eventoSobreviviente = [...eventosEnCluster].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        advertencias.push({
          animalId,
          motivo:
            `El último miembro del cluster (chequeo_vaca_id=${chequeoVacaIdSobreviviente}) no tiene un hato_eventos propio -- se promovió el evento ${eventoSobreviviente.id} (chequeo_vaca_id=${eventoSobreviviente.chequeo_vaca_id}) como sobreviviente por tener la fecha más reciente entre los existentes del cluster. Verificar antes de aplicar.`,
          lecturasColapsadas: miembros.map((m) => m.lectura),
          fechaEventoEsperada: cluster.fechaEvento,
        });
      }

      for (const evento of eventosEnCluster) {
        if (evento.id === eventoSobreviviente.id) continue;
        eliminar.push({
          id: evento.id,
          animalId,
          fecha: evento.fecha,
          motivo:
            `Colapsado dentro del nacimiento representado por el evento sobreviviente ${eventoSobreviviente.id} (fecha final '${cluster.fechaEvento}') -- lecturas del cluster: ${miembros
              .map((m) => `${m.lectura.chequeoFecha}: ${m.lectura.ultimaCria}`)
              .join(' | ')}.`,
        });
      }

      if (eventoSobreviviente.fecha !== cluster.fechaEvento || eventoSobreviviente.fecha_confianza !== 'exacta') {
        actualizar.push({
          id: eventoSobreviviente.id,
          animalId,
          fechaActual: eventoSobreviviente.fecha,
          fechaNueva: cluster.fechaEvento,
          fechaConfianzaNueva: 'exacta',
          motivo:
            `Sobreviviente del cluster de partos cercanos (${miembros.length} lecturas a <= ${DIAS_MINIMOS_ENTRE_PARTOS} días entre sí) -- fecha corregida a la lectura del chequeo más reciente del cluster ('${cluster.fechaEvento}', chequeo ${miembros.at(-1)!.lectura.chequeoFecha}).`,
        });
      }
    }
  }

  return { umbralDias: DIAS_MINIMOS_ENTRE_PARTOS, clustersConColapso, actualizar, eliminar, advertencias };
}
