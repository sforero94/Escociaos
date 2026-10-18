// ARCHIVO: components/hato/hooks/useDetallePesajeSemana.ts
// DESCRIPCIÓN: I/O del detalle de pesaje semanal (issue #297). La aritmética
// vive en `detallePesajeSemanal.ts`. Este hook solo lee y escribe
// `hato_pesajes_leche` y firma las fotos ya subidas.
//
// No borra objetos de Storage. Una captura es la planilla del mes, no un
// pesaje. El camino de Telegram (`/pesaje`) no pasa por aquí.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {useMilkWeek} from './useMilkWeek';
import {milkWeekIntent,milkWeekSource,type MilkWeekIntent} from '@/utils/hato/hatoMilkWeekProtocol';
import type {MilkWeekClient} from '@/utils/hato/hatoMilkWeekProtocol';
import { getSupabase } from '@/utils/supabase/client';
import {
  mesesDelRango,
  rangoSemanaMedida,
  type CapturaPesajeCandidata,
  type FilaPesajeSemana,
  type PlanEscrituraPesaje,
} from '@/utils/hato/detallePesajeSemanal';

const SELECT_CAPTURA =
  'id, anio, mes, storage_bucket, storage_rutas, storage_ok, created_by, creado_en, origen, desenlace';
const SEGUNDOS_URL = 60 * 60;

interface FilaCruda {
  id: string;
  animal_id: string;
  fecha: string;
  litros_total: number | string;
  litros_am: number | string | null;
  litros_pm: number | string | null;
  fuente: string | null;
  created_at: string;
  created_by: string | null;
}

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

export interface ConsultaDetallePesaje {
  fechaReferencia: string;
  semana: number;
}

export interface DetallePesajeSemanaEstado {
  cargando: boolean;
  guardando: boolean;
  error: string | null;
  inicio: string | null;
  fin: string | null;
  filas: FilaPesajeSemana[];
  capturas: CapturaPesajeCandidata[];
  autores: Map<string, string>;
  urls: Record<string, string>;
  guardar: (plan: PlanEscrituraPesaje) => Promise<boolean>;
  week: ReturnType<typeof useMilkWeek>;
  recargar: () => Promise<void>;
}

function numero(valor: number | string | null): number | null {
  if (valor == null || valor === '') return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

function filaDesdeCruda(fila: FilaCruda): FilaPesajeSemana {
  return {
    id: fila.id,
    animal_id: fila.animal_id,
    fecha: fila.fecha,
    litros_total: numero(fila.litros_total) ?? 0,
    litros_am: numero(fila.litros_am),
    litros_pm: numero(fila.litros_pm),
    fuente: fila.fuente,
    created_at: fila.created_at,
    created_by: fila.created_by,
  };
}

function capturaDesdeCruda(fila: CapturaCruda): CapturaPesajeCandidata {
  return {
    id: fila.id,
    anio: fila.anio,
    mes: fila.mes,
    storageBucket: fila.storage_bucket,
    storageRutas: fila.storage_rutas ?? [],
    storageOk: fila.storage_ok,
    createdBy: fila.created_by,
    creadoEn: fila.creado_en,
    origen: fila.origen,
    desenlace: fila.desenlace,
  };
}

export function useDetallePesajeSemana(consulta: ConsultaDetallePesaje | null): DetallePesajeSemanaEstado {
  const {user,hasRole}=useAuth();
  const writer=hasRole(['Gerencia']);
  const week=useMilkWeek(consulta!==null,consulta?`${consulta.fechaReferencia}|${consulta.semana}`:'');
  const generation=useRef({number:0});
  useLayoutEffect(()=>{const guard=generation.current;guard.number++;setFilas([]);setCapturas([]);setUrls({});setInicio(null);setFin(null);setError(null);setCargando(false);setGuardando(false);return()=>{guard.number++;};},[user?.id,consulta?.fechaReferencia,consulta?.semana,writer]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [fin, setFin] = useState<string | null>(null);
  const [filas, setFilas] = useState<FilaPesajeSemana[]>([]);
  const [capturas, setCapturas] = useState<CapturaPesajeCandidata[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<Record<string, string>>({});

  const fechaReferencia = consulta?.fechaReferencia ?? null;
  const semana = consulta?.semana ?? null;

  const cargar = useCallback(async () => {
    if (fechaReferencia == null || semana == null) return;
    const owner=user?.id,epoch=generation.current.number;const current=()=>generation.current.number===epoch;if(!owner)return;
    setCargando(true);
    setError(null);
    try {
      const rango = rangoSemanaMedida(fechaReferencia, semana);
      const meses = mesesDelRango(rango.inicio, rango.fin);
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      let capturasQuery = supabase.from('hato_capturas_foto').select(SELECT_CAPTURA).eq('tipo', 'pesaje');
      if (meses.length === 1) {
        capturasQuery = capturasQuery.eq('anio', meses[0].anio).eq('mes', meses[0].mes);
      } else if (meses.length > 1) {
        capturasQuery = capturasQuery.or(
          meses.map((m) => `and(anio.eq.${m.anio},mes.eq.${m.mes})`).join(','),
        );
      }

      const [pesajesRes, capturasRes] = await Promise.all([
        writer?milkWeekSource(getSupabase() as unknown as MilkWeekClient,owner,rango.inicio,rango.fin):(async()=>{const q=await supabase.from('hato_pesajes_leche').select('id,animal_id,fecha,litros_total,litros_am,litros_pm,fuente,created_at,created_by').gte('fecha',rango.inicio).lte('fecha',rango.fin);if(q.error)throw Error(q.error.message);return {rows:q.data??[]};})(),
        capturasQuery,
      ]);
      if (capturasRes.error) throw new Error(capturasRes.error.message);

      const filasNuevas = (pesajesRes.rows as unknown as FilaCruda[]).map(filaDesdeCruda);
      const capturasNuevas = ((capturasRes.data ?? []) as CapturaCruda[]).map(capturaDesdeCruda);

      const ids = new Set<string>();
      for (const fila of filasNuevas) if (fila.created_by) ids.add(fila.created_by);
      for (const captura of capturasNuevas) if (captura.createdBy) ids.add(captura.createdBy);

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
      for (const captura of capturasNuevas) {
        if (!captura.storageOk) continue;
        for (const ruta of captura.storageRutas) {
          firmas.push(
            supabase.storage
              .from(captura.storageBucket)
              .createSignedUrl(ruta, SEGUNDOS_URL)
              .then((res: { data: { signedUrl?: string } | null }) => {
                const firmada = res.data?.signedUrl;
                if (firmada) urlsNuevas[`${captura.storageBucket}:${ruta}`] = firmada;
              })
              .catch(() => undefined),
          );
        }
      }
      await Promise.all(firmas);

      if(!current())return;
      setInicio(rango.inicio);
      setFin(rango.fin);
      setFilas(filasNuevas);
      setCapturas(capturasNuevas);
      setAutores(autoresNuevos);
      setUrls(urlsNuevas);
    } catch (err) {
      if(current())setError(err instanceof Error ? err.message : 'No se pudieron cargar los pesajes.');
    } finally {
      if(current())setCargando(false);
    }
  }, [fechaReferencia, semana,user?.id,writer]);

  useEffect(() => {
    if (fechaReferencia == null || semana == null) {
      setFilas([]);
      setCapturas([]);
      setUrls({});
      setInicio(null);
      setFin(null);
      setError(null);
      return;
    }
    void cargar();
  }, [fechaReferencia, semana, cargar]);

  const escribir = useCallback(
    async (plan: PlanEscrituraPesaje): Promise<boolean> => {
      const epoch=generation.current.number,current=()=>generation.current.number===epoch;
      setGuardando(true);
      setError(null);
      try {
        if(!inicio||!fin)throw Error('Recargue la semana antes de revisar.');
        const intent:MilkWeekIntent=milkWeekIntent({version:1,start:inicio,end:fin,observed:[...filas].sort((a,b)=>a.id.localeCompare(b.id)),changes:[...plan.actualizaciones.map(a=>({id:a.id,remove:false,am:a.litros_am,pm:a.litros_pm,total:a.litros_total})),...plan.borrarIds.map(id=>({id,remove:true,am:null,pm:null,total:null}))]});
        await week.prepare(intent);
        return current();
      } catch (err) {
        if(current())setError(err instanceof Error ? err.message : 'No se pudo guardar el pesaje.');
        return false;
      } finally {
        if(current())setGuardando(false);
      }
    },
    [inicio,fin,filas,week],
  );

  return {
    cargando,
    guardando,
    error,
    inicio,
    fin,
    filas,
    capturas,
    autores,
    urls,
    guardar: escribir,
    week,
    recargar:cargar,
  };
}
