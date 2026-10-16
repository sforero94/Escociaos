// Retired direct sale/death helper. Dedicated prepared lifecycle flows own mutations.
import {useCallback} from 'react';
export interface ResultadoRegistrarSalidaHato {
  ok: boolean;
  error?: string;
}

export function useRegistrarSalidaHato() {
  // Preserve cached-caller shape while refusing before any client/auth/database access.
  const registrarVenta = useCallback(async (_animalId:string,_transaccion:{id:string;fecha:string}):Promise<ResultadoRegistrarSalidaHato> => ({ok:false,error:'Use la venta con revisión preparada y recuperación del intento original.'}),[]);
  const registrarMuerte = useCallback(async ():Promise<ResultadoRegistrarSalidaHato> => ({ok:false,error:'Use Registrar muerte con revisión preparada y recuperación del intento original.'}),[]);
  return {registrarVenta,registrarMuerte,guardando:false};
}
