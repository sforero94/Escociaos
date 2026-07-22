// ARCHIVO: utils/importHato/verificar.ts
// DESCRIPCIÓN: Motor puro de invariantes POST-carga -- la etapa "Verify" del
// pipeline de importación histórica (plan docs/plan_hato_lechero_module.md
// §7.4, paso 5). Consume datos YA CARGADOS (lo que el runner
// `scripts/import-hato/verify.ts` lee de vuelta de Supabase después de que
// `load.ts` corrió) y devuelve hallazgos estructurados -- nunca lanza, nunca
// llama a la base de datos, mismo régimen de pureza que `resolver.ts`.
//
// Invariantes del plan §7.4 paso 5:
//   1. Cada A{n} (cría retenida con número, de la descomposición SX) tiene un
//      animal cargado o queda como hallazgo explícito.
//   2. Conteo de partos cargados ≈ el `#P` máximo declarado en las hojas.
//   3. Tamaño del hato activo -- ver la nota grande más abajo, NO es una
//      constante mágica.
//   4. Dos animales activos nunca comparten `numero`.
//
// Se agrega una quinta, generalización de un hallazgo real (ver comentario
// de `verificarFechasServicioNoFuturas`).
//
// ============================================================================
// NOTA IMPORTANTE sobre el invariante #3 ("hato activo ≈ 45")
// ============================================================================
// El plan §7.4 y CLAUDE.md dicen "hato activo ≈ ~45". La verificación
// independiente del coordinador de S3 (docs/hato/s3-verificacion-independiente.md
// §2.3 y §3.6, medida con código propio directo contra los .xlsx) muestra que
// ese número describía, sin decirlo, UNA TERCERA población que ninguna de las
// dos que esta función puede calcular con los datos de `SalidaNormalizado`:
//
//   - "en el chequeo más reciente" (`CHEQUEO JULIO 2026`): 37 chapetas distintas
//   - "vivos, unión con TERNERAS" (incluye crías nunca chequeadas): 72
//   - "en ordeño" (cruzado contra `PROMEDIO DE LECHE DESDE AÑO 2026.xlsx`,
//     que NO es parte del contrato `SalidaNormalizado` de este pipeline --
//     vive en la Épica D/S5, backfill de leche): 43 -- **este SÍ es el "≈45"
//     del plan**. El plan no estaba mal, confundió sin saberlo dos
//     poblaciones distintas (chequeo reproductivo vs. hato en ordeño).
//
// Por eso `contarPoblacionActiva` de este archivo NUNCA compara contra un
// umbral fijo -- solo puede reportar los conteos derivables del historial de
// CHEQUEOS/TERNERAS que sí vio Resolve. Un `≈45` hardcodeado aquí o falla
// para siempre (mide la población equivocada) o invita a "corregir" datos
// hasta que cuadre -- exactamente lo que este pipeline prohíbe. La pregunta
// de qué población es "el hato" para el KPI del tablero (S4) es del dueño --
// ver `resolution-report.md`.

// ============================================================================
// Tipos de entrada -- forma mínima que el runner extrae de las tablas cargadas
// ============================================================================

export interface AnimalCargado {
  id: string;
  numero: number | null;
  nombre: string | null;
  estado: 'activa' | 'vendida' | 'muerta' | 'descartada';
  etapa: 'ternera' | 'novilla' | 'vaca' | 'toro';
}

export interface EventoCargado {
  animal_id: string;
  tipo: string;
  fecha: string;
}

/** Una fila de `hato_chequeo_vacas` ya cargada, unida a la fecha de su
 * `hato_chequeos.fecha` -- lo mínimo que necesita `verificarFechasServicioNoFuturas`. */
export interface ChequeoVacaCargada {
  animal_id: string;
  chequeo_fecha: string;
  fecha_servicio: string | null;
}

// ============================================================================
// 1. Cada A{n} tiene animal o queda como hallazgo
// ============================================================================

export interface NumeroCriaEsperado {
  numero: number;
  /** De dónde salió el A{n} -- ej. "sx_raw='A166' en CHEQUEO JULIO 2026 r18" --
   * para que el hallazgo sea accionable, no solo "falta el 166". */
  origen: string;
}

export interface HallazgoNumeroCriaSinAnimal {
  numeroCria: number;
  origen: string;
}

/**
 * Todo código SX `A{n}` visto en el historial (descomposición de
 * `calculosHato.ts`, `descomponerSX`) declara una cría retenida con ese
 * número -- debe existir un `hato_animales.numero = n` después de `Load`.
 * Los que faltan no se descartan: quedan como hallazgo explícito para
 * revisión (puede ser una cría que nunca llegó a TERNERAS, o un número mal
 * leído).
 */
export function verificarNumerosCriaTienenAnimal(
  numerosCriaEsperados: NumeroCriaEsperado[],
  numerosCargados: Set<number>,
): HallazgoNumeroCriaSinAnimal[] {
  const faltantes: HallazgoNumeroCriaSinAnimal[] = [];
  for (const { numero, origen } of numerosCriaEsperados) {
    if (!numerosCargados.has(numero)) faltantes.push({ numeroCria: numero, origen });
  }
  return faltantes;
}

// ============================================================================
// 2. Conteo de partos cargados ≈ #P máximo declarado
// ============================================================================

export interface DiscrepanciaPartos {
  animalId: string;
  numero: number | null;
  partosDeclaradosMaximo: number;
  partosCargados: number;
  diferencia: number;
}

/**
 * Compara, por animal, los eventos `tipo='parto'` efectivamente cargados
 * contra el `#P` (número de partos) máximo que declaró alguna fila de
 * chequeo de ese animal. `tolerancia` (default 1) absorbe el ruido esperado
 * de una importación parcial del histórico (F2 es P1, no todo el rango
 * 2019-2026 necesariamente entra en la primera pasada) -- una discrepancia
 * MAYOR a la tolerancia es la que se reporta.
 */
export function verificarConteoPartos(
  eventos: EventoCargado[],
  partosDeclaradosPorAnimal: Map<string, number>,
  animalesPorId: Map<string, AnimalCargado>,
  tolerancia = 1,
): DiscrepanciaPartos[] {
  const partosCargadosPorAnimal = new Map<string, number>();
  for (const e of eventos) {
    if (e.tipo !== 'parto') continue;
    partosCargadosPorAnimal.set(e.animal_id, (partosCargadosPorAnimal.get(e.animal_id) ?? 0) + 1);
  }
  const discrepancias: DiscrepanciaPartos[] = [];
  for (const [animalId, declarado] of partosDeclaradosPorAnimal) {
    const cargado = partosCargadosPorAnimal.get(animalId) ?? 0;
    const diferencia = Math.abs(declarado - cargado);
    if (diferencia > tolerancia) {
      discrepancias.push({
        animalId,
        numero: animalesPorId.get(animalId)?.numero ?? null,
        partosDeclaradosMaximo: declarado,
        partosCargados: cargado,
        diferencia,
      });
    }
  }
  return discrepancias.sort((a, b) => b.diferencia - a.diferencia);
}

// ============================================================================
// 3. Tamaño del hato activo -- SOLO reporta, nunca asserta (ver nota de cabecera)
// ============================================================================

export interface ConteoPoblacion {
  activosTotal: number;
  activosEnUltimoChequeo: number;
  activosFueraDelUltimoChequeo: number;
}

/**
 * Reporta (NUNCA asserta contra un umbral) el tamaño del hato activo, en dos
 * cortes distintos que responden preguntas distintas -- ver la nota grande de
 * cabecera de este archivo antes de tocar esta función. Deliberadamente sin
 * parámetro de "valor esperado".
 */
export function contarPoblacionActiva(
  animales: AnimalCargado[],
  numerosEnUltimoChequeo: Set<number>,
): ConteoPoblacion {
  const activos = animales.filter((a) => a.estado === 'activa');
  const activosEnUltimoChequeo = activos.filter((a) => a.numero !== null && numerosEnUltimoChequeo.has(a.numero)).length;
  return {
    activosTotal: activos.length,
    activosEnUltimoChequeo,
    activosFueraDelUltimoChequeo: activos.length - activosEnUltimoChequeo,
  };
}

// ============================================================================
// 4. Dos animales activos nunca comparten `numero`
// ============================================================================

export interface ColisionNumeroPostCarga {
  numero: number;
  animalIds: string[];
}

/**
 * Invariante final y duro: si esto encuentra algo, `Load` insertó una fila
 * que nunca debió insertar (`bloqueadoPorColision` de `resolver.ts` debía
 * haberla detenido antes). A diferencia de las colisiones de `resolver.ts`
 * (que son evidencia PRE-carga para que Martha decida), esto es un chequeo
 * de integridad DESPUÉS de que se supone que ya se resolvieron -- si falla,
 * el bug está en `Load`, no es una decisión pendiente.
 */
export function verificarNumeroUnicoEntreActivas(animales: AnimalCargado[]): ColisionNumeroPostCarga[] {
  const porNumero = new Map<number, string[]>();
  for (const a of animales) {
    if (a.estado !== 'activa' || a.numero === null) continue;
    if (!porNumero.has(a.numero)) porNumero.set(a.numero, []);
    porNumero.get(a.numero)!.push(a.id);
  }
  const colisiones: ColisionNumeroPostCarga[] = [];
  for (const [numero, animalIds] of porNumero) {
    if (animalIds.length > 1) colisiones.push({ numero, animalIds });
  }
  return colisiones.sort((a, b) => a.numero - b.numero);
}

// ============================================================================
// 5. Fechas retrospectivas no pueden ser posteriores al chequeo que las reporta
// ============================================================================

export interface FechaServicioFutura {
  animalId: string;
  chequeoFecha: string;
  fechaServicio: string;
}

/**
 * Generalización de un hallazgo real del coordinador de S3
 * (docs/hato/s3-verificacion-independiente.md §2.1): dos copias de
 * `CHEQUEO JUNIO 9 2020` NO son byte-idénticas como se asumía -- una fue
 * editada después y quedó con una "última cría" de mayo 2021 en una hoja
 * fechada junio 2020 (fecha futura respecto a su propio chequeo). Esa
 * columna concreta (`ultima_cria_raw`) no tiene contraparte normalizada en
 * el esquema (053 solo declara `ultima_cria_raw text`), así que esta función
 * chequea la señal EQUIVALENTE que sí está tipada: ninguna
 * `fecha_servicio` puede ser posterior al `hato_chequeos.fecha` que la
 * registra. Si aparece, es la misma clase de problema (un dedupe que
 * conservó la copia editada en vez de la original) y el reporte debe
 * nombrar la fila, nunca corregirla en silencio.
 */
export function verificarFechasServicioNoFuturas(filas: ChequeoVacaCargada[]): FechaServicioFutura[] {
  const hallazgos: FechaServicioFutura[] = [];
  for (const fila of filas) {
    if (fila.fecha_servicio !== null && fila.fecha_servicio > fila.chequeo_fecha) {
      hallazgos.push({
        animalId: fila.animal_id,
        chequeoFecha: fila.chequeo_fecha,
        fechaServicio: fila.fecha_servicio,
      });
    }
  }
  return hallazgos;
}

// ============================================================================
// Orquestador
// ============================================================================

export interface VerificacionResultado {
  numerosCriaSinAnimal: HallazgoNumeroCriaSinAnimal[];
  discrepanciasPartos: DiscrepanciaPartos[];
  poblacion: ConteoPoblacion;
  colisionesNumeroPostCarga: ColisionNumeroPostCarga[];
  fechasServicioFuturas: FechaServicioFutura[];
  /** `false` si CUALQUIERA de los invariantes DUROS falló
   * (numerosCriaSinAnimal, colisionesNumeroPostCarga, fechasServicioFuturas).
   * `discrepanciasPartos` y `poblacion` son informativos -- nunca bloquean,
   * por diseño (ver nota de cabecera sobre `poblacion`). */
  ok: boolean;
}

export interface VerificarCargaHatoInput {
  animales: AnimalCargado[];
  eventos: EventoCargado[];
  numerosCriaEsperados: NumeroCriaEsperado[];
  partosDeclaradosPorAnimal: Map<string, number>;
  numerosEnUltimoChequeo: Set<number>;
  chequeoVacas: ChequeoVacaCargada[];
  toleranciaPartos?: number;
}

export function verificarCargaHato(input: VerificarCargaHatoInput): VerificacionResultado {
  const animalesPorId = new Map(input.animales.map((a) => [a.id, a]));
  const numerosCargados = new Set(input.animales.map((a) => a.numero).filter((n): n is number => n !== null));

  const numerosCriaSinAnimal = verificarNumerosCriaTienenAnimal(input.numerosCriaEsperados, numerosCargados);
  const discrepanciasPartos = verificarConteoPartos(
    input.eventos,
    input.partosDeclaradosPorAnimal,
    animalesPorId,
    input.toleranciaPartos ?? 1,
  );
  const poblacion = contarPoblacionActiva(input.animales, input.numerosEnUltimoChequeo);
  const colisionesNumeroPostCarga = verificarNumeroUnicoEntreActivas(input.animales);
  const fechasServicioFuturas = verificarFechasServicioNoFuturas(input.chequeoVacas);

  return {
    numerosCriaSinAnimal,
    discrepanciasPartos,
    poblacion,
    colisionesNumeroPostCarga,
    fechasServicioFuturas,
    ok:
      numerosCriaSinAnimal.length === 0 &&
      colisionesNumeroPostCarga.length === 0 &&
      fechasServicioFuturas.length === 0,
  };
}
