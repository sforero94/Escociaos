// ARCHIVO: components/hato/hooks/useCrearHatoAnimal.ts
// DESCRIPCIÓN: Alta de un `hato_animales` nuevo desde el botón "+ Registrar"
// de `AnimalesList.tsx` (Figma alignment spec §4). Espejo de
// `useActualizarHatoAnimal.ts` (mismo patrón de escritura, misma traducción
// de la colisión de caravana 23505 sobre `hato_animales_numero_activa_unique`,
// migración 066) pero vía `insert` en vez de `update` -- no crea animales a
// partir de un evento (`hato_eventos`), es un alta manual directa cuando el
// animal todavía no tiene ficha (compra o nacimiento no capturado por un
// chequeo).

import { useState, useCallback } from 'react';
import { getSupabase } from '@/utils/supabase/client';
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

export function useCrearHatoAnimal() {
  const [guardando, setGuardando] = useState(false);

  const crear = useCallback(async (datos: HatoAnimalNuevo): Promise<ResultadoCrearHatoAnimal> => {
    setGuardando(true);
    try {
      // `src/types/database.ts` (generado) no incluye las tablas hato_* --
      // mismo workaround que el resto de los hooks del módulo.
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('hato_animales')
        .insert({
          numero: datos.numero,
          nombre: datos.nombre,
          sexo: 'hembra',
          etapa: datos.etapa,
          estado: 'activa',
          raza: datos.raza,
          fecha_nacimiento: datos.fecha_nacimiento,
          origen: datos.origen,
          confianza: 'alta',
        })
        .select('id')
        .single();

      if (error) {
        if (error.code === '23505') {
          return {
            ok: false,
            esColisionCaravana: true,
            error: `La caravana ${datos.numero} ya la lleva otro animal activo.`,
          };
        }
        throw error;
      }

      return { ok: true, id: (data as { id: string }).id };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido creando el animal',
      };
    } finally {
      setGuardando(false);
    }
  }, []);

  return { crear, guardando };
}
