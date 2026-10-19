import {useAuth} from '@/contexts/AuthContext';
import {runDiscard,type DiscardResult,type DiscardClient} from '@/utils/hato/hatoUploadDiscard';
// Lists retained capture history; discard authority comes only from protected receipts.

import { useCallback, useEffect, useState,useLayoutEffect,useRef } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  BUCKET_PESAJES,
  mesesAlrededor,
  subidasDelMes,
  type CapturaSubida,
  type SubidaLigada,
} from '@/utils/hato/subidasPesajeMes';

const SELECT_CAPTURA =
  'id, anio, mes, storage_bucket, storage_rutas, storage_ok, created_by, creado_en, origen, desenlace, filas_escritas';
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
  filas_escritas: number | null;
}

export interface ResultadoDescarte {
  ok: boolean;
  error: string | null;
}

export interface SubidasPesajeMesEstado {
  cargando: boolean;
  descartando: boolean;
  error: string | null;
  subidas: SubidaLigada[];
  autores: Map<string, string>;
  urls: Record<string, string>;
  descartar: (capturaId: string) => Promise<ResultadoDescarte>;
  discardAttempt:DiscardResult|null;
  accionDescarte:(mode:'post'|'status'|'resolve'|'new')=>Promise<ResultadoDescarte>;
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
    filasEscritas: fila.filas_escritas,
  };
}

export function useSubidasPesajeMes(anio: number, mes: number): SubidasPesajeMesEstado {
  const [cargando, setCargando] = useState(true);
  const [descartando, setDescartando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<SubidaLigada[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Historical display blocking is not discard authority; protected RPC decides eligibility.

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

      const ligadas:SubidaLigada[]=capturas.map(captura=>({captura,filaIds:[],desde:null,hasta:null}));
      setSubidas(subidasDelMes(ligadas, anio, mes));

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

  const {user,hasRole}=useAuth();const allowed=hasRole(['Gerencia']);const generation=useRef({value:0});const [discardAttempt,setDiscardAttempt]=useState<DiscardResult|null>(null);
  useLayoutEffect(()=>{const g=generation.current;g.value++;setDiscardAttempt(null);setDescartando(false);return()=>{g.value++;};},[user?.id,allowed]);
  const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',capture?:string):Promise<ResultadoDescarte>=>{
   const owner=user?.id,n=generation.current.value;if(!owner||!allowed)return {ok:false,error:'Solo Gerencia puede descartar una subida.'};setDescartando(true);setError(null);
   try{const r=await runDiscard(getSupabase() as unknown as DiscardClient,owner,mode,()=>generation.current.value===n,capture,discardAttempt);if(generation.current.value!==n)throw Error('La sesión cambió.');setDiscardAttempt(r);if(r?.state==='committed')setTick(t=>t+1);return {ok:true,error:null};}
   catch(e){const message=e instanceof Error?e.message:'Conserve y consulte el descarte original.';if(generation.current.value===n)setError(message);return {ok:false,error:message};}
   finally{if(generation.current.value===n)setDescartando(false);}
  },[user?.id,allowed,discardAttempt]);
  const descartar=useCallback((capture:string)=>run('prepare',capture),[run]);
  const accionDescarte=useCallback((mode:'post'|'status'|'resolve'|'new')=>run(mode),[run]);

  return { cargando, descartando, error, subidas, autores, urls, descartar,discardAttempt,accionDescarte };
}
