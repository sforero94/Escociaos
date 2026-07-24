// ARCHIVO: utils/importHato/pesajesLeche.ts
// DESCRIPCIÓN: Extractor + resolutor de identidad del backfill de pesajes de
// leche (D7, docs/hato/sesiones-b5-d7-e3.md "Session B"). Formato de origen
// DISTINTO al de los chequeos reproductivos (`chequeos.ts`): una hoja física
// por MES (`MZO 2026`, `ABRIL 2026`, ...), sin chapeta -- solo NOMBRE -- y
// 4 SEMANAS × 2 columnas (AM/PM de un mismo día de pesaje) por hoja.
//
// Puro, cero I/O -- mismo régimen que el resto de `importHato/*.ts`: una
// celda no interpretable nunca descarta la fila, y la identidad nunca se
// adivina cuando es ambigua (nombre duplicado en la propia hoja, o que
// coincida con más de un animal activo) -- se emite como "sin resolver" para
// que un humano (Martha) adjudique, mismo criterio que `overridesChapeta.ts`.
//
// Reusa los parsers de celda EXISTENTES de `calculosHato.ts` (`parseValorNumerico`)
// y de `celdas.ts` (`valorCeldaATexto`) -- nunca un segundo parser de celda/número.

import { parseValorNumerico, type ParseIssue } from '@/utils/calculosHato';
import type { HojaCruda } from './tipos';
import { valorCeldaATexto } from './celdas';
import type { AnimalHatoActual } from './diffChequeo';
import { buscarOverrideNombreLeche, type OverrideNombreLeche } from './overridesNombreLeche';

// ============================================================================
// 1. Identidad de nombre -- normalización compartida (Extract y Resolve la
//    usan igual, así que vive acá y se re-exporta para `overridesNombreLeche.ts`).
// ============================================================================

/** Normaliza un nombre de animal para comparar identidad: recorta espacios
 * (incluye espacios dobles internos, ej. "MONZA  "), mayúsculas, y quita
 * diacríticos -- mismo mecanismo (`normalize('NFD')` + strip de marcas
 * combinantes) que usa `calculosHato.ts` (`normalizarTexto`, privado, para
 * nombres de mes) -- consistente con ese helper existente, no una segunda
 * heurística de texto inventada aquí. El resto del pipeline (`resolver.ts`,
 * `overridesChapeta.ts`) compara nombres con `.trim().toUpperCase()` a secas
 * porque ahí SIEMPRE hay una chapeta que desambigua; acá NO hay chapeta, así
 * que una variante con tilde vs. sin tilde (ej. planilla de leche vs.
 * `hato_animales.nombre`) no puede perderse un match real por eso. */
export function normalizarNombreLeche(nombre: string): string {
  return nombre
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

// ============================================================================
// 2. Mes/año de la hoja -- las hojas se llaman "MZO 2026", "ABRIL 2026", etc.
//    Nunca se adivina: si no se reconoce el mes o el año, la hoja completa
//    queda sin fecha derivable (issue explícito), pero SUS LECTURAS igual se
//    extraen -- el crudo nunca se pierde por esto.
// ============================================================================

/** Abreviaturas reales observadas en el corpus (`MZO` para marzo -- no es la
 * abreviatura de 3 letras que produciría `encontrarMes` de `calculosHato.ts`,
 * que da `mar`) más las formas completas/las de 3 letras estándar, por si
 * aparecen en meses futuros. Un nombre de hoja que no calce contra ninguna
 * clave nunca se le asigna un mes por defecto. */
const MAPA_MESES_LECHE: Readonly<Record<string, number>> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, mzo: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, septiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

function textoSinAcentosMinuscula(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface ResultadoMesAnioHoja {
  anio: number | null;
  mes: number | null;
  issues: ParseIssue[];
}

/** Deriva (año, mes) del NOMBRE de la hoja física (ej. "MZO 2026"). Nunca
 * inventa: si falta el año o el mes no se reconoce, ambos quedan `null` y se
 * documenta por qué -- el llamador decide qué hacer (las lecturas de esa
 * hoja se extraen igual, solo sin fecha derivable). */
export function derivarMesAnioDeHoja(nombreHoja: string): ResultadoMesAnioHoja {
  const texto = textoSinAcentosMinuscula(nombreHoja);
  const tokens = texto.split(/[^a-z0-9]+/).filter(Boolean);

  const issues: ParseIssue[] = [];

  const anioTok = tokens.find((t) => /^\d{4}$/.test(t));
  const anio = anioTok ? Number(anioTok) : null;
  if (anio === null) {
    issues.push({ crudo: nombreHoja, motivo: 'no se pudo derivar el año del nombre de la hoja (se esperaba un token de 4 dígitos)' });
  }

  let mes: number | null = null;
  for (const t of tokens) {
    if (t in MAPA_MESES_LECHE) {
      mes = MAPA_MESES_LECHE[t];
      break;
    }
  }
  if (mes === null) {
    issues.push({ crudo: nombreHoja, motivo: 'no se pudo derivar el mes del nombre de la hoja (ninguna abreviatura reconocida)' });
  }

  return { anio, mes, issues };
}

// ============================================================================
// 3. n-ésima ocurrencia de un día ISO de semana dentro de un mes -- la fecha
//    real de "SEMANA n" es la n-ésima vez que cae `hato_config.dia_pesaje_semanal`
//    ese mes (decisión del dueño, migración 064 -- nunca un miércoles
//    hardcodeado). Aritmética puramente UTC (mismo motivo que
//    `celdas.ts`/`calculosHato.ts`: nunca depender del huso horario del
//    proceso que corre esto).
// ============================================================================

function diasEnMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Día ISO de semana (1=lunes … 7=domingo) del día 1 de (anio, mes). */
function diaIsoSemanaPrimerDia(anio: number, mes: number): number {
  const dowJs = new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay(); // 0=domingo..6=sábado
  return dowJs === 0 ? 7 : dowJs;
}

/**
 * Fecha ISO (`AAAA-MM-DD`) de la n-ésima ocurrencia de `diaIsoObjetivo`
 * (1..7) dentro de (anio, mes). `null` si ese mes no tiene una n-ésima
 * ocurrencia (ej. SEMANA 5 en un mes corto) -- nunca se inventa una fecha
 * fuera de rango.
 */
export function nEsimaFechaDiaSemanaDelMes(
  anio: number,
  mes: number,
  diaIsoObjetivo: number,
  n: 1 | 2 | 3 | 4,
): string | null {
  const primerDia = diaIsoSemanaPrimerDia(anio, mes);
  const offset = ((diaIsoObjetivo - primerDia) + 7) % 7;
  const dia = 1 + offset + (n - 1) * 7;
  if (dia > diasEnMes(anio, mes)) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// ============================================================================
// 4. Parser de UNA hoja mensual de leche.
// ============================================================================

export interface LecturaSemanaLeche {
  semana: 1 | 2 | 3 | 4;
  /** `null` si el mes/año de la hoja no se pudo derivar, o si esa semana no
   * tiene n-ésima ocurrencia ese mes -- la lectura se conserva igual (nunca
   * se descarta), pero no se puede cargar sin fecha (`hato_pesajes_leche.fecha`
   * es NOT NULL). */
  fecha: string | null;
  litrosAm: number | null;
  litrosPm: number | null;
  /** `am + pm` cuando AL MENOS uno de los dos está presente (nunca se
   * inventa un 0 para el lado ausente en el sentido de "no hubo pesaje" --
   * la ausencia de AMBOS simplemente no genera una `LecturaSemanaLeche`, ver
   * `procesarHojaLeche`). Cuando solo uno de los dos está presente, el total
   * es ese único valor (el lado ausente se trata como "no se separó/no se
   * midió ese ordeño", no como "se ordeñó y dio 0") y se deja un issue para
   * que quede visible que el dato es parcial. */
  litrosTotal: number;
  issues: ParseIssue[];
}

export interface FilaLechePorMes {
  archivo: string;
  hoja: string;
  /** 1-indexed, como lo ve Excel. */
  fila: number;
  nombreCrudo: string;
  nombreNormalizado: string;
  /** `true` si este nombre aparece en MÁS de una fila física dentro de la
   * MISMA hoja (ej. "VALENCIANA"/"MONZA" en algunos meses) -- sin chapeta no
   * hay forma de saber a cuál de los dos animales pertenece cada lectura, así
   * que ninguna lectura de un nombre duplicado se resuelve automáticamente
   * (ver `resolverIdentidadLeche`). Se calcula sobre TODAS las filas de la
   * hoja (incluidas las sin ninguna lectura), no solo las que tienen dato. */
  duplicadaEnHoja: boolean;
  lecturas: LecturaSemanaLeche[];
  issues: ParseIssue[];
}

export interface ResultadoHojaLeche {
  archivo: string;
  hoja: string;
  anio: number | null;
  mes: number | null;
  filas: FilaLechePorMes[];
  issues: ParseIssue[];
}

/** Índice de columna (0-based) del componente AM de cada semana. PM es
 * siempre la columna inmediatamente siguiente. Columna A (0) = nombre;
 * columna J (9) es basura/celdas sueltas (fórmulas SUM huérfanas vistas en
 * el corpus real) y se ignora siempre, sin excepción. */
const COLUMNA_AM_POR_SEMANA: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 3, 3: 5, 4: 7 };

function conCampo(campo: string, issues: ParseIssue[]): ParseIssue[] {
  return issues.map((i) => ({ ...i, motivo: `[${campo}] ${i.motivo}` }));
}

/**
 * Procesa UNA hoja física de leche (ya se sabe que es de este tipo -- el
 * runner de I/O decide qué hojas del workbook pasar aquí). Busca la fila de
 * encabezado por la marca estructural real ("SEMANA 1" en alguna celda) en
 * vez de asumir un número de fila fijo -- si no aparece, la hoja completa
 * queda sin filas (issue explícito, nunca se adivina dónde empiezan los
 * datos).
 */
export function procesarHojaLeche(hoja: HojaCruda, diaPesajeIso: number): ResultadoHojaLeche {
  const { anio, mes, issues: issuesMes } = derivarMesAnioDeHoja(hoja.hoja);

  const filaSemanaIdx = hoja.filas.findIndex((fila) =>
    fila.some((celda) => /^semana\s*1\b/i.test(valorCeldaATexto(celda) ?? '')),
  );

  if (filaSemanaIdx === -1) {
    return {
      archivo: hoja.archivo,
      hoja: hoja.hoja,
      anio,
      mes,
      filas: [],
      issues: [
        ...issuesMes,
        { crudo: hoja.hoja, motivo: 'no se encontró la fila de encabezado "SEMANA 1" -- no se puede ubicar dónde empiezan los datos, ninguna fila se extrajo' },
      ],
    };
  }

  const filaInicioDatos = filaSemanaIdx + 1;
  const filasCrudo: FilaLechePorMes[] = [];

  for (let r = filaInicioDatos; r < hoja.filas.length; r++) {
    const filaFisica = hoja.filas[r];
    const numeroExcel = r + 1;
    const nombreCrudo = valorCeldaATexto(filaFisica[0]);

    const lecturas: LecturaSemanaLeche[] = [];
    const issuesFila: ParseIssue[] = [];

    for (const semana of [1, 2, 3, 4] as const) {
      const colAm = COLUMNA_AM_POR_SEMANA[semana];
      const colPm = colAm + 1;
      const amRes = parseValorNumerico(filaFisica[colAm]);
      const pmRes = parseValorNumerico(filaFisica[colPm]);
      issuesFila.push(...conCampo(`SEMANA ${semana} AM`, amRes.issues));
      issuesFila.push(...conCampo(`SEMANA ${semana} PM`, pmRes.issues));

      if (amRes.valor === null && pmRes.valor === null) continue; // sin dato esa semana -- no se emite lectura (nunca 0)

      const lecturaIssues: ParseIssue[] = [];
      if (amRes.valor === null || pmRes.valor === null) {
        lecturaIssues.push({
          crudo: `AM=${amRes.valor ?? '·'} PM=${pmRes.valor ?? '·'}`,
          motivo: `SEMANA ${semana}: solo uno de los dos ordeños (AM/PM) tiene valor -- litros_total es SOLO ese valor, revisar si falta digitar el otro ordeño`,
        });
      }

      const fecha = anio !== null && mes !== null ? nEsimaFechaDiaSemanaDelMes(anio, mes, diaPesajeIso, semana) : null;
      if (fecha === null) {
        lecturaIssues.push({
          crudo: `${hoja.hoja} SEMANA ${semana}`,
          motivo: anio === null || mes === null
            ? 'no se pudo derivar la fecha: el mes/año de la hoja no se reconoció'
            : `el mes ${mes}/${anio} no tiene una ${semana}ª ocurrencia del día de pesaje configurado`,
        });
      }

      lecturas.push({
        semana,
        fecha,
        litrosAm: amRes.valor,
        litrosPm: pmRes.valor,
        litrosTotal: (amRes.valor ?? 0) + (pmRes.valor ?? 0),
        issues: lecturaIssues,
      });
    }

    if (nombreCrudo === null) {
      // Fila sin nombre: si además no trae ninguna lectura, es una fila
      // fantasma de fin de rango (`!ref` de Excel suele incluir filas vacías
      // de sobra) -- se ignora en silencio, igual que `esFilaVacia` en
      // `grilla.ts`. Si SÍ trae lecturas, no hay a quién atribuirlas: se
      // documenta como hallazgo explícito, nunca se descartan los números.
      if (lecturas.length > 0) {
        issuesFila.push({ crudo: `fila ${numeroExcel}`, motivo: 'fila con datos de leche pero sin nombre en columna A -- no se puede atribuir a ningún animal' });
        filasCrudo.push({
          archivo: hoja.archivo,
          hoja: hoja.hoja,
          fila: numeroExcel,
          nombreCrudo: '',
          nombreNormalizado: '',
          duplicadaEnHoja: false,
          lecturas,
          issues: issuesFila,
        });
      }
      continue;
    }

    filasCrudo.push({
      archivo: hoja.archivo,
      hoja: hoja.hoja,
      fila: numeroExcel,
      nombreCrudo,
      nombreNormalizado: normalizarNombreLeche(nombreCrudo),
      duplicadaEnHoja: false, // se corrige abajo, necesita ver todas las filas de la hoja primero
      lecturas,
      issues: issuesFila,
    });
  }

  const conteoPorNombre = new Map<string, number>();
  for (const f of filasCrudo) {
    if (f.nombreNormalizado === '') continue;
    conteoPorNombre.set(f.nombreNormalizado, (conteoPorNombre.get(f.nombreNormalizado) ?? 0) + 1);
  }
  const filas = filasCrudo.map((f) => ({
    ...f,
    duplicadaEnHoja: f.nombreNormalizado !== '' && (conteoPorNombre.get(f.nombreNormalizado) ?? 0) > 1,
  }));

  return { archivo: hoja.archivo, hoja: hoja.hoja, anio, mes, filas, issues: issuesMes };
}

// ============================================================================
// 5. Resolución de identidad -- nombre (sin chapeta) -> `hato_animales.id`.
//    Nunca adivina: nombre duplicado en la hoja, sin match, o match múltiple
//    quedan "sin resolver" para revisión humana (mismo contrato que
//    `overridesChapeta.ts`/`resolver.ts`).
// ============================================================================

export interface AnimalLecheActivo {
  id: string;
  nombre: string;
}

export type MotivoSinResolverLeche =
  | 'nombre_duplicado_en_hoja'
  | 'sin_match_en_hato'
  | 'multiples_animales_coinciden'
  | 'fecha_no_derivable';

export interface LecturaLecheResuelta {
  archivo: string;
  hoja: string;
  fila: number;
  nombreCrudo: string;
  semana: 1 | 2 | 3 | 4;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
  litrosTotal: number;
  animalId: string;
  issues: ParseIssue[];
}

export interface LecturaLecheSinResolver {
  archivo: string;
  hoja: string;
  fila: number;
  nombreCrudo: string;
  semana: 1 | 2 | 3 | 4;
  fecha: string | null;
  litrosAm: number | null;
  litrosPm: number | null;
  litrosTotal: number;
  motivo: MotivoSinResolverLeche;
  detalle: string;
}

export interface ResumenNombreLeche {
  nombreNormalizado: string;
  totalLecturas: number;
  resueltas: number;
  sinResolver: number;
  motivos: MotivoSinResolverLeche[];
}

export interface ResultadoResolucionLeche {
  resueltas: LecturaLecheResuelta[];
  sinResolver: LecturaLecheSinResolver[];
  resumenPorNombre: ResumenNombreLeche[];
}

/**
 * Resuelve la identidad de cada lectura de leche (nombre -> `animal_id`)
 * contra el hato activo actual. Reglas, en orden:
 *   1. Nombre duplicado dentro de su propia hoja (`duplicadaEnHoja`) ->
 *      SIEMPRE sin resolver, sin importar cuántos animales activos calcen --
 *      no hay chapeta que diga cuál fila es cuál vaca.
 *   2. Override explícito (`overridesNombreLeche.ts`) -- decisión humana,
 *      siempre gana sobre el match automático.
 *   3. Exactamente un animal activo con ese nombre normalizado -> resuelto.
 *   4. Cero o más de uno -> sin resolver (`sin_match_en_hato` /
 *      `multiples_animales_coinciden`), nunca se adivina cuál.
 * `fecha === null` (mes/año no derivable, o semana sin n-ésima ocurrencia)
 * también deja la lectura fuera de `resueltas` aunque la identidad sí
 * calzara -- no hay `hato_pesajes_leche.fecha` (NOT NULL) sin fecha.
 */
export function resolverIdentidadLeche(
  hojas: ResultadoHojaLeche[],
  animalesActivos: AnimalHatoActual[] | AnimalLecheActivo[],
  overrides: OverrideNombreLeche[] = [],
): ResultadoResolucionLeche {
  const animalesPorNombre = new Map<string, AnimalLecheActivo[]>();
  for (const a of animalesActivos) {
    if (!a.nombre) continue;
    const clave = normalizarNombreLeche(a.nombre);
    if (!animalesPorNombre.has(clave)) animalesPorNombre.set(clave, []);
    animalesPorNombre.get(clave)!.push({ id: a.id, nombre: a.nombre });
  }

  const resueltas: LecturaLecheResuelta[] = [];
  const sinResolver: LecturaLecheSinResolver[] = [];
  const resumenMap = new Map<string, ResumenNombreLeche>();

  const sumarResumen = (nombreNormalizado: string, resuelta: boolean, motivo?: MotivoSinResolverLeche) => {
    if (!resumenMap.has(nombreNormalizado)) {
      resumenMap.set(nombreNormalizado, { nombreNormalizado, totalLecturas: 0, resueltas: 0, sinResolver: 0, motivos: [] });
    }
    const r = resumenMap.get(nombreNormalizado)!;
    r.totalLecturas++;
    if (resuelta) {
      r.resueltas++;
    } else {
      r.sinResolver++;
      if (motivo && !r.motivos.includes(motivo)) r.motivos.push(motivo);
    }
  };

  for (const h of hojas) {
    for (const fila of h.filas) {
      if (fila.nombreNormalizado === '') continue; // ya reportada como hallazgo estructural en procesarHojaLeche
      for (const lectura of fila.lecturas) {
        if (fila.duplicadaEnHoja) {
          sumarResumen(fila.nombreNormalizado, false, 'nombre_duplicado_en_hoja');
          sinResolver.push({
            archivo: fila.archivo,
            hoja: fila.hoja,
            fila: fila.fila,
            nombreCrudo: fila.nombreCrudo,
            semana: lectura.semana,
            fecha: lectura.fecha,
            litrosAm: lectura.litrosAm,
            litrosPm: lectura.litrosPm,
            litrosTotal: lectura.litrosTotal,
            motivo: 'nombre_duplicado_en_hoja',
            detalle: `"${fila.nombreCrudo}" aparece en más de una fila física dentro de ${fila.hoja} -- sin chapeta no se puede saber cuál fila es cuál animal.`,
          });
          continue;
        }

        const override = buscarOverrideNombreLeche(fila.nombreNormalizado, fila.hoja, overrides, normalizarNombreLeche);
        let animalId: string | null = override?.animalId ?? null;
        let motivoSinResolver: MotivoSinResolverLeche | null = null;
        let detalle = '';

        if (!animalId) {
          const candidatos = animalesPorNombre.get(fila.nombreNormalizado) ?? [];
          if (candidatos.length === 1) {
            animalId = candidatos[0].id;
          } else if (candidatos.length === 0) {
            motivoSinResolver = 'sin_match_en_hato';
            detalle = `Ningún animal activo tiene el nombre "${fila.nombreCrudo}" (normalizado: "${fila.nombreNormalizado}").`;
          } else {
            motivoSinResolver = 'multiples_animales_coinciden';
            detalle = `${candidatos.length} animales activos coinciden con "${fila.nombreCrudo}": ${candidatos.map((c) => c.id).join(', ')}.`;
          }
        }

        // Identidad resuelta pero sin fecha derivable: `hato_pesajes_leche.fecha`
        // es NOT NULL, así que esta lectura tampoco se puede cargar -- motivo
        // propio, nunca se reusa 'sin_match_en_hato' para una causa distinta.
        if (animalId && lectura.fecha === null) {
          animalId = null;
          motivoSinResolver = 'fecha_no_derivable';
          detalle = 'La identidad resolvió, pero la fecha de esta semana no se pudo derivar (ver issues de la lectura) -- no se puede cargar sin fecha.';
        }

        if (animalId && lectura.fecha !== null) {
          sumarResumen(fila.nombreNormalizado, true);
          resueltas.push({
            archivo: fila.archivo,
            hoja: fila.hoja,
            fila: fila.fila,
            nombreCrudo: fila.nombreCrudo,
            semana: lectura.semana,
            fecha: lectura.fecha,
            litrosAm: lectura.litrosAm,
            litrosPm: lectura.litrosPm,
            litrosTotal: lectura.litrosTotal,
            animalId,
            issues: lectura.issues,
          });
          continue;
        }

        sumarResumen(fila.nombreNormalizado, false, motivoSinResolver ?? 'sin_match_en_hato');
        sinResolver.push({
          archivo: fila.archivo,
          hoja: fila.hoja,
          fila: fila.fila,
          nombreCrudo: fila.nombreCrudo,
          semana: lectura.semana,
          fecha: lectura.fecha,
          litrosAm: lectura.litrosAm,
          litrosPm: lectura.litrosPm,
          litrosTotal: lectura.litrosTotal,
          motivo: motivoSinResolver ?? 'sin_match_en_hato',
          detalle,
        });
      }
    }
  }

  return { resueltas, sinResolver, resumenPorNombre: [...resumenMap.values()] };
}

// ============================================================================
// 6. Reporte de revisión -- markdown, para que un humano (Martha) adjudique
//    los nombres duplicados/sin match ANTES de correr la carga real. Puro
//    (recibe `generadoEn` inyectado, nunca `Date.now()`), mismo espíritu que
//    `reporte.ts` (resolution-report.md del histórico) pero sin reusar ese
//    archivo -- ahí el contrato de entrada es `ResultadoResolucion` del
//    pipeline de chequeos, un dominio distinto.
// ============================================================================

const ETIQUETA_MOTIVO: Record<MotivoSinResolverLeche, string> = {
  nombre_duplicado_en_hoja: 'Nombre duplicado dentro de la misma hoja (sin chapeta, no se puede saber cuál fila es cuál animal)',
  sin_match_en_hato: 'Ningún animal activo tiene este nombre',
  multiples_animales_coinciden: 'Más de un animal activo tiene este nombre',
  fecha_no_derivable: 'La identidad resolvió, pero no se pudo derivar la fecha de esa semana',
};

/**
 * Renderiza el reporte de revisión del backfill de leche: cuántas lecturas
 * se pudieron resolver automáticamente y cuáles quedan pendientes de
 * adjudicación humana, agrupadas por nombre y motivo. Nunca decide por su
 * cuenta -- solo documenta, con la evidencia (archivo/hoja/fila) de cada
 * lectura sin resolver.
 */
export function generarReporteResolucionLeche(resultado: ResultadoResolucionLeche, generadoEn: string): string {
  const lineas: string[] = [
    '# Reporte de resolución -- Backfill de pesajes de leche (D7)',
    '',
    `Generado: ${generadoEn}`,
    '',
    `Lecturas resueltas automáticamente: ${resultado.resueltas.length}`,
    `Lecturas SIN resolver (requieren adjudicación humana): ${resultado.sinResolver.length}`,
    '',
  ];

  const nombresSinResolver = resultado.resumenPorNombre.filter((r) => r.sinResolver > 0).sort((a, b) => a.nombreNormalizado.localeCompare(b.nombreNormalizado));

  if (nombresSinResolver.length === 0) {
    lineas.push('Ningún nombre quedó sin resolver -- todas las lecturas se cargaron o no aplicaban.');
  } else {
    lineas.push('## Nombres que requieren adjudicación');
    lineas.push('');
    lineas.push(
      'Agrega una entrada en `src/utils/importHato/overridesNombreLeche.ts` (con el `animal_id` real) ' +
        'para cada nombre de esta lista y vuelve a correr el backfill -- es idempotente.',
    );
    lineas.push('');
    for (const resumen of nombresSinResolver) {
      lineas.push(`### ${resumen.nombreNormalizado}`);
      lineas.push(`- Motivo(s): ${resumen.motivos.map((m) => ETIQUETA_MOTIVO[m]).join('; ')}`);
      lineas.push(`- Lecturas afectadas: ${resumen.sinResolver} de ${resumen.totalLecturas}`);
      const evidencia = resultado.sinResolver
        .filter((s) => normalizarNombreLeche(s.nombreCrudo) === resumen.nombreNormalizado)
        .slice(0, 8);
      for (const e of evidencia) {
        lineas.push(`  - ${e.archivo} :: ${e.hoja} :: fila ${e.fila} (SEMANA ${e.semana}) -- ${e.detalle}`);
      }
      const resto = resultado.sinResolver.filter((s) => normalizarNombreLeche(s.nombreCrudo) === resumen.nombreNormalizado).length - evidencia.length;
      if (resto > 0) lineas.push(`  - … y ${resto} lectura(s) más`);
      lineas.push('');
    }
  }

  return lineas.join('\n');
}
