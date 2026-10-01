// ARCHIVO: components/hato/hooks/useSubidasPesajeMes.ts
// DESCRIPCIÓN: lee las subidas de planilla de un mes y, si Gerencia
// descarta una, borra su foto, los litros ligados y la fila de
// `hato_capturas_foto`. La liga vive en `subidasPesajeMes.ts`.
//
// El DELETE de la captura exige la migración 171 (Gerencia). La foto
// ya era borrable por Gerencia (migración 086). Los litros ya eran
// borrables por la RLS de `hato_pesajes_leche` (054). No se toca Telegram.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { deleteDevolvioFilas } from '@/utils/supabase/deleteDevolvioFilas';
import { fetchAll } from '@/utils/supabase/fetchAll';
import {
  BUCKET_PESAJES,
  ligarFilasASubidas,
  mesesAlrededor,
  subidasDelMes,
  ventanaCreatedAt,
  type CapturaSubida,
  type FilaSubida,
  type SubidaLigada,
} from '@/utils/hato/subidasPesajeMes';

const SELECT_CAPTURA =
  'id, anio, mes, storage_bucket, storage_rutas, storage_ok, created_by, creado_en, origen, desenlace';
const SELECT_FILA = 'id, fecha, created_at, created_by, fuente';
const SEGUNDOS_URL = 60 * 60;

interface CapturaCruda {
  id: string;
  anio: number;
  mes: number;
  storage_bucket: string;
  storage_rutas: string[] | null;
  storage_ok: boolean;
  created_by: string | null;
  creado_en: string;
  origen: string;
  desenlace: string;
}

interface FilaCruda {
  id: string;
  fecha: string;
  created_at: string;
  created_by: string | null;
  fuente: string | null;
}

export interface SubidasPesajeMesEstado {
  cargando: boolean;
  descartando: boolean;
  error: string | null;
  subidas: SubidaLigada[];
  autores: Map<string, string>;
  urls: Record<string, string>;
  descartar: (capturaId: string) => Promise<boolean>;
}

function capturaDesdeCruda(fila: CapturaCruda): CapturaSubida {
  return {
    id: fila.id,
    anio: fila.anio,
    mes: fila.mes,
    creadoEn: fila.creado_en,
    createdBy: fila.created_by,
    origen: fila.origen,
    desenlace: fila.desenlace,
    storageBucket: fila.storage_bucket,
    storageRutas: fila.storage_rutas ?? [],
    storageOk: fila.storage_ok,
  };
}

export function useSubidasPesajeMes(anio: number, mes: number): SubidasPesajeMesEstado {
  const [cargando, setCargando] = useState(true);
  const [descartando, setDescartando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<SubidaLigada[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [tick, setTick] = useState(0);

  const cargar = useCallback(async () => {
    if (!Number.isInteger(anio) || anio < 2020 || mes < 1 || mes > 12) {
      setCargando(false);
      setSubidas([]);
      setUrls({});
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const meses = mesesAlrededor(anio, mes);
      const { data: capturasData, error: errorCapturas } = await supabase
        .from('hato_capturas_foto')
        .select(SELECT_CAPTURA)
        .eq('tipo', 'pesaje')
        .or(meses.map((m) => `and(anio.eq.${m.anio},mes.eq.${m.mes})`).join(','));
      if (errorCapturas) throw new Error(errorCapturas.message);

      const capturas = ((capturasData ?? []) as CapturaCruda[]).map(capturaDesdeCruda);
      const ventana = ventanaCreatedAt(capturas.map((c) => c.creadoEn));
      let filas: FilaSubida[] = [];
      if (ventana && capturas.length > 0) {
        const pagina = await fetchAll<FilaCruda>((desde, hasta) =>
          supabase
            .from('hato_pesajes_leche')
            .select(SELECT_FILA)
            .gte('created_at', ventana.desde)
            .lte('created_at', ventana.hasta)
            .order('id', { ascending: true })
            .range(desde, hasta),
        );
        if (pagina.truncado) throw new Error('Hay demasiados pesajes en esta ventana.');
        filas = pagina.filas;
      }

      const ids = new Set<string>();
      for (const captura of capturas) if (captura.createdBy) ids.add(captura.createdBy);
      const autoresNuevos = new Map<string, string>();
      if (ids.size > 0) {
        const { data, error: errorAutores } = await supabase.rpc('fn_novedades_autores', {
          p_ids: [...ids],
        });
        if (!errorAutores && data) {
          for (const fila of data as Array<{ id: string; nombre: string }>) {
            autoresNuevos.set(fila.id, fila.nombre);
          }
        }
      }

      const urlsNuevas: Record<string, string> = {};
      const firmas: Array<Promise<void>> = [];
      for (const captura of capturas) {
        if (captura.anio !== anio || captura.mes !== mes) continue;
        if (!captura.storageOk || captura.storageBucket !== BUCKET_PESAJES) continue;
        const ruta = captura.storageRutas[0];
        if (!ruta) continue;
        firmas.push(
          supabase.storage
            .from(BUCKET_PESAJES)
            .createSignedUrl(ruta, SEGUNDOS_URL)
            .then((res: { data: { signedUrl?: string } | null }) => {
              const firmada = res.data?.signedUrl;
              if (firmada) urlsNuevas[`${captura.id}:${ruta}`] = firmada;
            })
            .catch(() => undefined),
        );
      }
      await Promise.all(firmas);

      setSubidas(subidasDelMes(ligarFilasASubidas(capturas, filas), anio, mes));
      setAutores(autoresNuevos);
      setUrls(urlsNuevas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las subidas.');
      setSubidas([]);
    } finally {
      setCargando(false);
    }
  }, [anio, mes]);

  useEffect(() => {
    void cargar();
  }, [cargar, tick]);

  const descartar = useCallback(
    async (capturaId: string): Promise<boolean> => {
      const subida = subidas.find((item) => item.captura.id === capturaId);
      if (!subida) return false;
      setDescartando(true);
      setError(null);
      try {
        const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { captura, filaIds } = subida;
        if (captura.storageRutas.length > 0) {
          if (captura.storageBucket !== BUCKET_PESAJES) {
            throw new Error('Esta subida no está en el bucket de pesajes.');
          }
          const { error: errorFoto } = await supabase.storage.from(BUCKET_PESAJES).remove(captura.storageRutas);
          if (errorFoto) throw new Error(errorFoto.message);
        }
        if (filaIds.length > 0) {
          const { data, error: errorFilas } = await supabase
            .from('hato_pesajes_leche')
            .delete()
            .in('id', filaIds)
            .select('id');
          if (errorFilas) throw new Error(errorFilas.message);
          const borrados = new Set(((data ?? []) as Array<{ id: string }>).map((fila) => fila.id));
          // Un reintento llega con litros ya borrados. Solo falla si alguna fila sigue.
          const faltantes = filaIds.filter((id) => !borrados.has(id));
          if (faltantes.length > 0) {
            const { data: siguen, error: errorSiguen } = await supabase
              .from('hato_pesajes_leche')
              .select('id')
              .in('id', faltantes);
            if (errorSiguen) throw new Error(errorSiguen.message);
            if (Array.isArray(siguen) && siguen.length > 0) {
              throw new Error('No se pudieron borrar todos los litros de esta subida.');
            }
          }
        }
        const { data: dataCaptura, error: errorCaptura } = await supabase
          .from('hato_capturas_foto')
          .delete()
          .eq('id', capturaId)
          .select('id');
        if (errorCaptura) throw new Error(errorCaptura.message);
        if (!deleteDevolvioFilas(dataCaptura)) {
          throw new Error('No tienes permisos para descartar esta subida.');
        }
        setTick((n) => n + 1);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo descartar la subida.');
        return false;
      } finally {
        setDescartando(false);
      }
    },
    [subidas],
  );

  return { cargando, descartando, error, subidas, autores, urls, descartar };
}
