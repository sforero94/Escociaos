// ARCHIVO: utils/hato/pesajeManual.ts
// DESCRIPCIÓN: UI rework de Producción (2026-08-06, sesión "Registrar
// desordenado") — construye el `diff` EN BLANCO que necesita el modo
// "Ingresar a mano" de la tarjeta "Pesaje de leche". Decisión del dueño:
// "El ingreso manual NO se elimina ni se esconde: baja a ser la tercera
// opción del mismo desplegable. Razón: RevisionPesajeFoto ya tiene celdas
// editables, así que la revisión post-OCR es captura manual — pero si algún
// día no hay foto, sin esta opción no quedaría ninguna forma de meter los
// datos." Es decir: en vez de una segunda UI de captura, este archivo arma
// una `PreviewPesajeRespuesta` SINTÉTICA (una fila por vaca activa, TODAS
// las celdas en blanco) para que `SubirPesajeFoto`/`RevisionPesajeFoto`
// (S5, ronda agosto 2026) se reutilicen tal cual — el usuario digita
// directamente sobre la misma grilla que vería si el OCR hubiera corrido.
//
// NUNCA llama al endpoint de OCR (`/hato/pesaje/foto`) -- eso es justo lo
// que este modo se salta. `construirDiffPesaje` (`ocrPesaje.ts`) es la MISMA
// función pura que arma el diff real; se reutiliza sin modificarla, con
// `existentes` vacío (el commit revalida y resuelve UPDATE-vs-INSERT contra
// el estado fresco de la BD, `hato-pesaje-commit.ts` -- el cliente nunca
// necesita conocer el id existente para escribir correctamente).
//
// Puro, sin I/O -- el roster/fechas los trae el llamador (mismos hooks que
// ya usa `PesajeLecheCard`/`useProduccionHato`).

import {
  construirDiffPesaje,
  COLUMNAS_PESAJE_OCR,
  type CeldaDiffPesaje,
  type CeldaOcrPesaje,
  type ColumnaPesajeOcr,
  type FilaPesajeConfirmada,
  type SemanaPesaje,
} from '@/utils/importHato/ocrPesaje';

export interface AnimalPesajeManual {
  id: string;
  nombre: string;
}

/** Celda "en blanco": texto vacío + confianza `alta`. NO es lo mismo que
 * una celda `ilegible` -- esta última dispara el ícono de advertencia en
 * `RevisionPesajeFoto` ("el modelo dudó"), y acá no hubo ningún modelo. Una
 * celda genuinamente vacía con confianza alta es exactamente lo que
 * `leerLitrosSemana` interpreta como "nada escrito todavía", sin marcar
 * nada como no confiable. */
function celdaEnBlanco(): CeldaOcrPesaje {
  return { texto: '', confianza: 'alta' };
}

function celdasEnBlanco(): Record<ColumnaPesajeOcr, CeldaOcrPesaje> {
  const salida = {} as Record<ColumnaPesajeOcr, CeldaOcrPesaje>;
  for (const col of COLUMNAS_PESAJE_OCR) salida[col] = celdaEnBlanco();
  return salida;
}

/** Diff en blanco para el modo manual -- una fila "confirmada" por cada
 * vaca activa (sin haber leído ninguna foto), lista para que el usuario
 * digite AM/PM directamente sobre `RevisionPesajeFoto`. */
export function construirDiffPesajeManual(
  animales: readonly AnimalPesajeManual[],
  fechasPorSemana: Readonly<Record<SemanaPesaje, string | null>>,
): CeldaDiffPesaje[] {
  const filas: FilaPesajeConfirmada[] = animales.map((animal, i) => ({
    pagina: 0,
    orden: i + 1,
    animalId: animal.id,
    nombre: animal.nombre,
    nombreImpreso: animal.nombre,
    celdas: celdasEnBlanco(),
    celdasNoConfiables: [],
    avisos: [],
  }));
  return construirDiffPesaje(filas, fechasPorSemana, new Map());
}
