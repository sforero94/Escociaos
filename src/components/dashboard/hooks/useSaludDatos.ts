// ARCHIVO: components/dashboard/hooks/useSaludDatos.ts
// DESCRIPCIÓN: I/O del bloque "Salud de los datos" del Tablero General
// (`docs/plan_dashboard_centro_control.md` §4 Bloque 6). Cinco `MAX(fecha)`
// pequeños, cada uno gateado por su propio módulo (plan §8) -- ninguno se
// consulta si el usuario no tiene el módulo correspondiente. Toda la
// clasificación (verde/ámbar/rojo, "13 d" vs. "nunca") vive en
// `@/utils/calculosSaludDatos`; este hook sólo trae fechas crudas y se las
// pasa a `construirSenalesSaludDatos`.
//
// El clima reusa la MISMA función pura que la franja de 10 días del bloque
// "Hoy en la finca" (`construirFranjaLluvia`, `calculosClima.ts`) -- nunca
// se relee `lluvia_total_mm` a mano aquí, esa es exactamente la trampa que
// `lluviaConfiableDeResumen()` existe para cerrar (CLAUDE.md, migración 068).

import { useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { obtenerFechaHoy } from '@/utils/fechas';
import { construirFranjaLluvia } from '@/utils/calculosClima';
import { construirSenalesSaludDatos, type SenalSaludDatos } from '@/utils/calculosSaludDatos';
import type { QuincenaResuelta } from '@/utils/calculosDinero';
import type { ResumenDiario } from '@/types/clima';

const DIAS_FRANJA_CLIMA = 10;
// Margen sobre DIAS_FRANJA_CLIMA: clima_resumen_diario puede tener huecos
// (un día sin fila en absoluto, p. ej. el cron no corrió) -- se piden más
// filas de las que hacen falta para que `construirFranjaLluvia` tenga de
// dónde completar los últimos 10 días CALENDARIO, no sólo las últimas 10
// FILAS de la tabla.
const LIMITE_FETCH_CLIMA = 20;

export type EstadoSaludDatos = 'cargando' | 'listo';

export interface UseSaludDatosParams {
  hasAguacate: boolean;
  hasHato: boolean;
}

export function useSaludDatos(params: UseSaludDatosParams): { estado: EstadoSaludDatos; senales: SenalSaludDatos[] } {
  const { hasAguacate, hasHato } = params;
  const [estado, setEstado] = useState<EstadoSaludDatos>('cargando');
  const [senales, setSenales] = useState<SenalSaludDatos[]>([]);

  useEffect(() => {
    // Sin ningún módulo, no hace falta el `if` de guarda: cada rama de
    // `Promise.all` de abajo ya resuelve `{ data: null, error: null }` sin
    // tocar Supabase, así que `cargar()` converge sola a `senales: []` --
    // el componente ni siquiera llega a mirar `estado`/`senales` en ese
    // caso (retorna `null` antes). Evita fijar estado de forma síncrona
    // dentro del cuerpo del efecto (regla de React Compiler).
    let cancelado = false;

    async function cargar() {
      setEstado('cargando');
      const hoy = obtenerFechaHoy();
      const supabase = getSupabase();
      // hato_chequeos/hato_pesajes_leche no están en el `Database` generado
      // (mismo caso que el resto del módulo hato -- ver useProduccionHato.ts).
      const supabaseSinTipos = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      try {
        const [monitoreoRes, climaRes, chequeoRes, pesajeRes, quincenaRes] = await Promise.all([
          hasAguacate
            ? supabase
                .from('monitoreos')
                .select('fecha_monitoreo')
                .order('fecha_monitoreo', { ascending: false })
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
          hasAguacate
            ? supabaseSinTipos
                .from('clima_resumen_diario')
                .select('fecha, lluvia_total_mm, lluvia_confianza')
                .order('fecha', { ascending: false })
                .limit(LIMITE_FETCH_CLIMA)
            : Promise.resolve({ data: null, error: null }),
          hasHato
            ? supabaseSinTipos.from('hato_chequeos').select('fecha').order('fecha', { ascending: false }).limit(1)
            : Promise.resolve({ data: null, error: null }),
          hasHato
            ? supabaseSinTipos.from('hato_pesajes_leche').select('fecha').order('fecha', { ascending: false }).limit(1)
            : Promise.resolve({ data: null, error: null }),
          hasHato
            ? supabaseSinTipos
                .from('hato_produccion_quincenal')
                .select('anio, mes, quincena')
                .order('anio', { ascending: false })
                .order('mes', { ascending: false })
                .order('quincena', { ascending: false })
                .limit(1)
            : Promise.resolve({ data: null, error: null }),
        ]);

        const fechaUltimoMonitoreo: string | null =
          (monitoreoRes.data?.[0] as { fecha_monitoreo: string } | undefined)?.fecha_monitoreo?.slice(0, 10) ?? null;

        const filasClima = (climaRes.data ?? []) as ResumenDiario[];
        let climaConfiables: number | null = null;
        let climaTotal: number | null = null;
        if (hasAguacate) {
          const franja = construirFranjaLluvia(filasClima, DIAS_FRANJA_CLIMA, hoy);
          climaTotal = franja.length;
          climaConfiables = franja.filter((d) => d.estado !== 'sin_dato').length;
        }

        const fechaUltimoChequeo: string | null =
          (chequeoRes.data?.[0] as { fecha: string } | undefined)?.fecha?.slice(0, 10) ?? null;
        const fechaUltimoPesaje: string | null =
          (pesajeRes.data?.[0] as { fecha: string } | undefined)?.fecha?.slice(0, 10) ?? null;

        const filaQuincena = quincenaRes.data?.[0] as
          | { anio: number; mes: number; quincena: 1 | 2 }
          | undefined;
        const ultimaQuincena: QuincenaResuelta | null = filaQuincena
          ? { anio: filaQuincena.anio, mes: filaQuincena.mes, quincena: filaQuincena.quincena }
          : null;

        if (cancelado) return;
        setSenales(
          construirSenalesSaludDatos({
            hoy,
            hasAguacate,
            hasHato,
            fechaUltimoMonitoreo,
            fechaUltimoChequeo,
            fechaUltimoPesaje,
            ultimaQuincena,
            climaConfiables,
            climaTotal,
          }),
        );
        setEstado('listo');
      } catch (err) {
        console.error('useSaludDatos: error consultando la frescura de los datos', err);
        if (!cancelado) {
          // Degradación graciosa: la fila que no se pudo leer simplemente no
          // aparece -- nunca "nunca" fabricado para una tabla que sí tiene
          // datos pero cuya consulta falló por otra razón (red, RLS, etc.).
          setSenales([]);
          setEstado('listo');
        }
      }
    }

    cargar();
    return () => {
      cancelado = true;
    };
  }, [hasAguacate, hasHato]);

  return { estado, senales };
}
