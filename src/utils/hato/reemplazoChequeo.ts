import { getSupabase } from '@/utils/supabase/client';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

/** Una vaca que ya tiene fila en el chequeo guardado de esa fecha. */
export interface AnimalChequeoExistente {
  animalId: string;
  numero: number | null;
  nombre: string | null;
}

export interface ReemplazoChequeo {
  id: string;
  fecha: string;
  filas: number;
  /** Las vacas que el chequeo guardado ya tiene. Sin esta lista, «Reemplazar
   * todo» borraría vacas que el usuario nunca vio nombradas (ESCO-190). */
  animales: AnimalChequeoExistente[];
}

export class ErrorConfirmacionReemplazoChequeo extends Error {
  constructor(public readonly chequeo: ReemplazoChequeo) {
    super(`Ya existe un chequeo del ${chequeo.fecha} con ${chequeo.filas} filas. Elige agregar o reemplazar antes de aprobar.`);
    this.name = 'ErrorConfirmacionReemplazoChequeo';
  }
}

function mismasVacas(a: AnimalChequeoExistente[], b: AnimalChequeoExistente[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((x) => x.animalId));
  return b.every((x) => ids.has(x.animalId));
}

/** Se consulta en cada intento, incluso después de confirmar. Un error de
 * lectura nunca significa que la fecha está libre. La confirmación vale solo
 * si el chequeo guardado sigue igual: mismo id, misma fecha y las mismas vacas.
 * Si otra página se guardó mientras tanto, se vuelve a preguntar. */
export async function verificarReemplazoChequeo(fecha: string, confirmado?: ReemplazoChequeo): Promise<void> {
  // Las tablas hato aún no están en el tipo generado de Database.
  const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from('hato_chequeos').select('id').eq('fecha', fecha).maybeSingle();
  if (error) throw new Error(`No se pudo verificar si ya existe el chequeo: ${error.message}`);
  if (!data) return;
  const { data: filas, error: errorFilas } = await supabase.from('hato_chequeo_vacas')
    .select('animal_id, hato_animales(numero, nombre)').eq('chequeo_id', data.id);
  if (errorFilas || !Array.isArray(filas)) {
    throw new Error(`No se pudo leer el chequeo existente: ${errorFilas?.message ?? 'sin filas'}`);
  }
  const animales: AnimalChequeoExistente[] = filas.map((f: {
    animal_id: string;
    hato_animales: { numero: number | null; nombre: string | null } | null;
  }) => ({
    animalId: f.animal_id,
    numero: f.hato_animales?.numero ?? null,
    nombre: f.hato_animales?.nombre ?? null,
  }));
  const actual: ReemplazoChequeo = { id: data.id, fecha, filas: animales.length, animales };
  if (
    confirmado?.fecha !== fecha
    || confirmado.id !== data.id
    || confirmado.filas !== actual.filas
    || !mismasVacas(confirmado.animales ?? [], animales)
  ) {
    throw new ErrorConfirmacionReemplazoChequeo(actual);
  }
}

export interface ClasificacionContraExistente {
  /** Vacas del chequeo guardado que esta subida no trae. «Agregar» las
   * conserva; «Reemplazar todo» las borra. */
  seConservan: AnimalChequeoExistente[];
  /** Vacas que están en los dos lados: la lectura nueva pisa a la guardada. */
  seActualizan: AnimalChequeoExistente[];
  /** Filas de esta subida que el chequeo guardado no tiene. */
  nuevas: FilaChequeoNormalizada[];
}

/** Compara la subida contra el chequeo guardado de la misma fecha. Empareja
 * por chapeta: una chapeta activa es única (índice parcial de la migración
 * 066), y el servidor resuelve la misma chapeta al mismo animal. Una fila sin
 * chapeta nunca empareja: cuenta como nueva. Función pura. */
export function clasificarContraChequeoExistente(
  existentes: AnimalChequeoExistente[],
  filasNuevas: FilaChequeoNormalizada[],
): ClasificacionContraExistente {
  const numerosNuevos = new Set(
    filasNuevas.map((f) => f.numero).filter((n): n is number => n != null),
  );
  const numerosExistentes = new Set(
    existentes.map((a) => a.numero).filter((n): n is number => n != null),
  );
  return {
    seConservan: existentes.filter((a) => a.numero == null || !numerosNuevos.has(a.numero)),
    seActualizan: existentes.filter((a) => a.numero != null && numerosNuevos.has(a.numero)),
    nuevas: filasNuevas.filter((f) => f.numero == null || !numerosExistentes.has(f.numero)),
  };
}
