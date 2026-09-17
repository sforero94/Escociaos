import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import { MODULOS, puedeAccederModulo, type ProfileParaModulos } from '@/utils/modulosAcceso';
import { CATALOGO_NOVEDADES, type EntradaCatalogo } from '@/utils/novedades/catalogo';
import { agruparNovedades } from '@/utils/novedades/agrupar';
import type { ErrorModulo, FuenteNovedad, GrupoDia, ModuloNovedad, NovedadCruda } from '@/utils/novedades/tipos';

/**
 * Hook de datos del bloque "Novedades" del Tablero General (issue #266,
 * F3 -- `docs/plan_novedades.md` / `docs/plan_novedades_implementacion.md`).
 * Sólo hace I/O y wirea el resultado a estado de React -- toda la lógica de
 * agrupamiento y redacción vive en `src/utils/novedades/` (pura, testeada
 * sin Supabase, sin React, sin `new Date()` propio).
 *
 * `Novedades.tsx` (y `NovedadLinea.tsx` para el disparo de M-5) son los
 * ÚNICOS componentes de pantalla que importan este hook -- ninguno toca
 * Supabase directamente (§6 del plan técnico).
 *
 * Tres gates, en este orden, EXACTAMENTE como §7 del plan técnico los
 * numera (nunca reimplementados, nunca invertidos):
 *   1. Módulo -- `puedeAccederModulo(profile, entrada.modulo)`.
 *   2. Rol, sólo para `finanzas` -- `entrada.requiereGerencia` exige
 *      `profile.rol === 'Gerencia'`. Se decide ANTES de consultar (§12.6
 *      del brief): para un Administrador con el módulo concedido, una
 *      consulta a `fin_gastos` volvería vacía por RLS, indistinguible de
 *      "no hubo gastos".
 *   3. RLS de la base, como red -- nunca se salta.
 *
 * Cada fuente admitida se agrupa por MÓDULO en hasta 3 cargadores
 * (hato_lechero / aguacate / finanzas) y cada grupo corre con su propio
 * `Promise.allSettled` -- así un fallo en una fuente de un módulo nunca
 * tumba las líneas de otro módulo (§2.2 del plan técnico, el diagrama de
 * `cargarHato()`/`cargarAguacate()`/`cargarFinanzas()`). Dentro de CADA
 * grupo se corre un SEGUNDO `Promise.allSettled` sobre sus propias fuentes,
 * para que una fuente mala no tumbe a sus hermanas del mismo módulo -- si
 * al menos una fuente del módulo falla, el módulo entero se marca con la
 * línea gris de §4.4 del brief ("No se pudo leer el hato."), pero las
 * crudas que SÍ llegaron de las fuentes hermanas se conservan (un fallo
 * nunca vacía el feed ni se calla).
 */

interface ProfileParaNovedades extends ProfileParaModulos {
  id?: string | null;
}

export interface UseNovedadesParams {
  profile: ProfileParaNovedades | null | undefined;
}

export interface UseNovedadesResultado {
  cargando: boolean;
  grupos: GrupoDia[];
  /** "y N más en los últimos 7 días" cuando el total superó el tope duro de
   *  20 (§4.4 del brief) -- `null` si no aplica. Ya viene formateado por
   *  `agrupar.ts`, nunca recalculado acá. */
  notaPie: string | null;
  errores: ErrorModulo[];
  /** Módulos cuyo `fetchAll` agotó `maxPaginas` -- sus cifras NO se
   *  publican como totales (§8.3 del plan técnico, K-3). */
  modulosTruncados: ModuloNovedad[];
  /** Etiquetas (`MODULOS[].label`) de los módulos que este lector puede
   *  ver -- para el mensaje del estado vacío (§4.4 del brief: "nombrando
   *  los módulos del lector", nunca "0 novedades"). Ya filtra el gate de
   *  Gerencia para `finanzas` (mismo criterio que `Dashboard.tsx`:
   *  `hasModulo('finanzas') && esGerencia`) -- listar un módulo que el
   *  lector nunca podrá ver por RLS sería una promesa falsa. */
  modulosLegibles: string[];
  /** M-4 -- "ver las N restantes". Dispara y olvida (§9 del plan técnico,
   *  mismo patrón que el `PATCH` de `caducada_at` en
   *  `useAccionesRecomendadas.ts`): nunca bloquea el render, nunca
   *  reintenta, nunca muestra un error. */
  registrarExpansion: () => void;
  /** M-5 -- navegación desde una línea. Mismo patrón de disparo y olvido. */
  registrarNavegacion: (fuente: FuenteNovedad) => void;
}

/** Etiqueta de estado vacío por módulo (§4.4 del brief: "No se pudo leer
 *  el hato."). Los cuatro módulos de `ModuloNovedad`, no sólo los tres del
 *  catálogo v1 -- `ganado` no tiene fuentes *Must* todavía, pero el tipo
 *  ya lo contempla (§2.3 del brief, fuentes *Should*). */
const ETIQUETA_MODULO_ERROR: Record<ModuloNovedad, string> = {
  hato_lechero: 'el hato',
  aguacate: 'aguacate',
  finanzas: 'finanzas',
  ganado: 'ganado',
};

function mensajeErrorModulo(modulo: ModuloNovedad): string {
  return `No se pudo leer ${ETIQUETA_MODULO_ERROR[modulo]}.`;
}

/**
 * Borde inferior ISO de la ventana de 7 días (D-2(a) del brief), sobre
 * medianoche Bogotá del día de hace 7 -- mismo patrón de aritmética en UTC
 * sobre un string `AAAA-MM-DD` que `diaAnteriorA()` ya usa en
 * `src/utils/novedades/agrupar.ts` (nunca `new Date(iso)` leído con
 * getters locales, que en UTC-5 corre el día). No nombra el huso
 * directamente: la medianoche UTC del día calendario es hasta 5 h ANTERIOR
 * a la medianoche Bogotá real, así que el borde queda, si acaso, un poco
 * más generoso -- nunca corta una fila legítima.
 */
function desdeIsoParaVentana(hoyBogota: string): string {
  const [anio, mes, dia] = hoyBogota.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  fecha.setUTCDate(fecha.getUTCDate() - 7);
  return fecha.toISOString();
}

interface ResultadoCargaModulo {
  modulo: ModuloNovedad;
  crudas: NovedadCruda[];
  truncado: boolean;
  huboFallo: boolean;
}

/** Corre TODAS las fuentes de un módulo en paralelo, cada una protegida
 *  por su propio `allSettled` -- nunca deja que una fuente mala tumbe a
 *  sus hermanas del mismo módulo (ver docstring de cabecera). */
async function cargarModulo(
  modulo: ModuloNovedad,
  entradas: readonly EntradaCatalogo[],
  supabase: unknown,
  desdeIso: string,
): Promise<ResultadoCargaModulo> {
  const resultados = await Promise.allSettled(entradas.map((entrada) => entrada.cargador(supabase, desdeIso)));

  const crudas: NovedadCruda[] = [];
  let truncado = false;
  let huboFallo = false;

  for (const resultado of resultados) {
    if (resultado.status === 'fulfilled') {
      crudas.push(...resultado.value.crudas);
      if (resultado.value.truncado) truncado = true;
    } else {
      huboFallo = true;
    }
  }

  return { modulo, crudas, truncado, huboFallo };
}

const RESULTADO_VACIO = {
  grupos: [] as GrupoDia[],
  notaPie: null as string | null,
  errores: [] as ErrorModulo[],
  modulosTruncados: [] as ModuloNovedad[],
};

export function useNovedades(params: UseNovedadesParams): UseNovedadesResultado {
  const { profile } = params;
  const rolKey = profile?.rol ?? '';
  const modulosKey = [...(profile?.modulos ?? [])].sort().join(',');

  const [cargando, setCargando] = useState(true);
  const [grupos, setGrupos] = useState<GrupoDia[]>([]);
  const [notaPie, setNotaPie] = useState<string | null>(null);
  const [errores, setErrores] = useState<ErrorModulo[]>([]);
  const [modulosTruncados, setModulosTruncados] = useState<ModuloNovedad[]>([]);

  // Las entradas del catálogo que este lector puede ver -- los tres gates
  // de la cabecera, EN ESTE ORDEN. `useMemo` (no I/O) porque `puedeAccederModulo`
  // es pura: recalcular no cuesta una consulta.
  const entradasPermitidas = useMemo(
    () =>
      CATALOGO_NOVEDADES.filter(
        (entrada) => puedeAccederModulo(profile, entrada.modulo) && (!entrada.requiereGerencia || profile?.rol === 'Gerencia'),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolKey, modulosKey],
  );

  const modulosLegibles = useMemo(() => {
    return MODULOS.filter(
      (m) => puedeAccederModulo(profile, m.key) && (m.key !== 'finanzas' || profile?.rol === 'Gerencia'),
    ).map((m) => m.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolKey, modulosKey]);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);

      if (entradasPermitidas.length === 0) {
        if (!cancelado) {
          setGrupos(RESULTADO_VACIO.grupos);
          setNotaPie(RESULTADO_VACIO.notaPie);
          setErrores(RESULTADO_VACIO.errores);
          setModulosTruncados(RESULTADO_VACIO.modulosTruncados);
          setCargando(false);
        }
        return;
      }

      try {
        const supabase = getSupabase();
        const hoy = obtenerFechaHoy();
        const desdeIso = desdeIsoParaVentana(hoy);

        const gruposPorModulo = new Map<ModuloNovedad, EntradaCatalogo[]>();
        for (const entrada of entradasPermitidas) {
          const lista = gruposPorModulo.get(entrada.modulo);
          if (lista) lista.push(entrada);
          else gruposPorModulo.set(entrada.modulo, [entrada]);
        }

        const paresModulo = [...gruposPorModulo.entries()];
        const resultadosModulos = await Promise.allSettled(
          paresModulo.map(([modulo, entradas]) => cargarModulo(modulo, entradas, supabase, desdeIso)),
        );

        const todasCrudas: NovedadCruda[] = [];
        const nuevosErrores: ErrorModulo[] = [];
        const nuevosTruncados: ModuloNovedad[] = [];

        resultadosModulos.forEach((resultado, indice) => {
          const [modulo] = paresModulo[indice];
          if (resultado.status === 'fulfilled') {
            todasCrudas.push(...resultado.value.crudas);
            if (resultado.value.truncado) nuevosTruncados.push(modulo);
            if (resultado.value.huboFallo) nuevosErrores.push({ modulo, mensaje: mensajeErrorModulo(modulo) });
          } else {
            nuevosErrores.push({ modulo, mensaje: mensajeErrorModulo(modulo) });
          }
        });

        // Resolución de autor -- UNA sola llamada, ids deduplicados (§3 del
        // plan técnico). Si el RPC falla, las líneas con autorId quedan sin
        // nombre resuelto -- `agrupar.ts` ya sabe leer eso como "sin autor
        // registrado" (nunca se inventa un nombre, §12.7 del brief). Un
        // fallo de ESTA llamada no debe vaciar el feed entero.
        const idsAutores = [...new Set(todasCrudas.map((c) => c.autorId).filter((id): id is string => id != null))];
        let autores = new Map<string, string>();
        if (idsAutores.length > 0) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fn_novedades_autores no está en database.ts todavía
            const { data, error } = await (supabase as any).rpc('fn_novedades_autores', { p_ids: idsAutores });
            if (!error && data) {
              autores = new Map((data as Array<{ id: string; nombre: string }>).map((f) => [f.id, f.nombre]));
            }
          } catch {
            // degradado silencioso -- ver comentario arriba.
          }
        }

        const { grupos: gruposResultado, notaPie: notaPieResultado } = agruparNovedades(todasCrudas, hoy, autores);

        if (!cancelado) {
          setGrupos(gruposResultado);
          setNotaPie(notaPieResultado);
          setErrores(nuevosErrores);
          setModulosTruncados(nuevosTruncados);
        }
      } catch {
        // Fallo fuera de los cargadores individuales (p. ej. sesión sin
        // token) -- se degrada al vacío honesto, nunca se cae el bloque
        // entero ni se muestra un error técnico.
        if (!cancelado) {
          setGrupos(RESULTADO_VACIO.grupos);
          setNotaPie(RESULTADO_VACIO.notaPie);
          setErrores(RESULTADO_VACIO.errores);
          setModulosTruncados(RESULTADO_VACIO.modulosTruncados);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();

    // Frescura (§12.1 del brief): sin temporizador, sin botón -- una
    // recarga al volver a primer plano (§8 del plan técnico) es lo único
    // que cubre la pestaña abierta toda la noche.
    const alVolverAPrimerPlano = () => {
      if (document.visibilityState === 'visible') cargar();
    };
    document.addEventListener('visibilitychange', alVolverAPrimerPlano);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', alVolverAPrimerPlano);
    };
  }, [entradasPermitidas]);

  const registrarExpansion = useCallback(() => {
    const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- novedades_uso no está en database.ts todavía
    void supabase.from('novedades_uso').insert({ tipo: 'expansion' }).then(
      () => {},
      () => {},
    );
  }, []);

  const registrarNavegacion = useCallback((fuente: FuenteNovedad) => {
    const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    void supabase.from('novedades_uso').insert({ tipo: 'navegacion', fuente_novedad: fuente }).then(
      () => {},
      () => {},
    );
  }, []);

  return { cargando, grupos, notaPie, errores, modulosTruncados, modulosLegibles, registrarExpansion, registrarNavegacion };
}
