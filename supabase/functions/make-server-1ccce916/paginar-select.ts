// paginar-select.ts — paginación determinista para los `select` de los
// endpoints de chequeo del hato.
//
// PostgREST/`supabase-js` corta toda respuesta en 1.000 filas por página y
// **no avisa**: la llamada devuelve `error: null` y un arreglo corto. El repo
// ya arrastra tres copias del mismo remedio para tres consumidores distintos
// (`fetchAll` en el navegador, `supabaseQueryAll` en `chat.tsx`, `paginar` en
// `acciones-paquete-io.ts`); esta es la que usan los tres endpoints de chequeo,
// que leen el histórico completo de `hato_chequeo_vacas`.
//
// Por qué importa acá y no es cosmético: ese histórico alimenta los tres mapas
// de deduplicación del commit (`seleccionarUltimoChequeoPorAnimal`,
// `seleccionarUltimaCriaAnteriorPorAnimal` y
// `seleccionarFechasServicioConocidasPorAnimal`). Si el corte se traga la fila
// que ya registraba un parto o un servicio, el commit emite un SEGUNDO evento
// para el mismo hecho — exactamente la clase de duplicado que costó las
// migraciones 075, 076 y 080. Y la consulta no lleva `order by`, así que qué
// 1.000 filas llegan lo decide el orden físico del heap: el defecto no deja
// hueco visible y ni siquiera es determinista.

const TAMANO_PAGINA = 1000;
const MAX_PAGINAS = 20; // 20.000 filas: techo de seguridad, no un límite esperado

/**
 * Ejecuta `ejecutar` página por página hasta recibir una página corta.
 *
 * `ejecutar` debe construir una consulta NUEVA en cada llamada: los query
 * builders de `supabase-js` no se pueden reutilizar entre ejecuciones.
 */
export async function paginarSelect<T>(
  ejecutar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ filas: T[]; error: { message: string } | null }> {
  const filas: T[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const desde = pagina * TAMANO_PAGINA;
    const { data, error } = await ejecutar(desde, desde + TAMANO_PAGINA - 1);

    if (error) return { filas, error };

    const lote = data ?? [];
    filas.push(...lote);

    // Página corta = última página.
    if (lote.length < TAMANO_PAGINA) return { filas, error: null };
  }

  // Techo alcanzado: se devuelve como error en vez de entregar filas
  // incompletas en silencio, que es justo el modo de falla que este módulo
  // existe para cerrar.
  return {
    filas,
    error: { message: `paginarSelect: tope de ${MAX_PAGINAS} páginas alcanzado; la lectura está incompleta` },
  };
}
