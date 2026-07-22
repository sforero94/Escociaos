// Paginación determinista para PostgREST.
//
// Supabase corta las respuestas en 1.000 filas por defecto y NO avisa. Con
// 4.371 gastos en `fin_gastos` (~1.250 por año), cualquier consulta de un año
// completo puede truncarse en silencio y producir un reporte financiero
// incompleto que se ve perfectamente normal.
//
// Toda consulta de reportes pasa por aquí.

const TAMANO_PAGINA = 1000;
const MAX_PAGINAS = 20; // 20.000 filas: techo de seguridad, no un límite esperado

export interface ResultadoPaginado<T> {
  filas: T[];
  /** true si se alcanzó MAX_PAGINAS y pueden faltar filas. */
  truncado: boolean;
}

/**
 * Ejecuta `construirQuery` página por página hasta recibir una página corta.
 *
 * `construirQuery` debe devolver una consulta NUEVA en cada llamada (los query
 * builders de Supabase no se pueden reutilizar entre ejecuciones).
 */
export async function fetchAll<T>(
  construirQuery: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opciones?: { tamanoPagina?: number; maxPaginas?: number }
): Promise<ResultadoPaginado<T>> {
  const tamano = opciones?.tamanoPagina ?? TAMANO_PAGINA;
  const maxPaginas = opciones?.maxPaginas ?? MAX_PAGINAS;

  const filas: T[] = [];

  for (let pagina = 0; pagina < maxPaginas; pagina += 1) {
    const desde = pagina * tamano;
    const { data, error } = await construirQuery(desde, desde + tamano - 1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return { filas, truncado: false };

    filas.push(...data);

    // Página corta = última página.
    if (data.length < tamano) return { filas, truncado: false };
  }

  return { filas, truncado: true };
}
