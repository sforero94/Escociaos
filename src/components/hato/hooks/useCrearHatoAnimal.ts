// Retained stale registration signature. Actual dialog uses useAnimalRegistration.
import type { EtapaHato, OrigenAnimalHato } from '@/types/hato';

export interface HatoAnimalNuevo {
  numero: number | null;
  nombre: string | null;
  etapa: EtapaHato;
  raza: string | null;
  fecha_nacimiento: string | null;
  origen: OrigenAnimalHato;
}

export interface ResultadoCrearHatoAnimal {
  ok: boolean;
  id?: string;
  /** Mismo significado que en `useActualizarHatoAnimal.ts`: colisión sobre
   * el índice único parcial (066) -- el caller deja el diálogo abierto para
   * corregir el número en vez de cerrarlo como si fuera un error genérico. */
  esColisionCaravana?: boolean;
  error?: string;
}

/** Stale signature retained to refuse direct inserts; actual dialog uses reviewed registration. */
export function useCrearHatoAnimal(){
 const crear=async(datos:HatoAnimalNuevo):Promise<ResultadoCrearHatoAnimal>=>{void datos;return {ok:false,error:'Prepare y revise el registro desde el diálogo actual; conserve el intento original.'};};
 return {crear,guardando:false};
}
