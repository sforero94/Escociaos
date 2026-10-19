import {readUploadHistory,type HistoryClient,type UploadDisposition} from '@/utils/hato/hatoUploadHistory';
import {fetchAll} from '@/utils/supabase/fetchAll';
import {useAuth} from '@/contexts/AuthContext';
import {runDiscard,type DiscardResult,type DiscardClient} from '@/utils/hato/hatoUploadDiscard';
// Lists retained capture history; discard authority comes only from protected receipts.

import { useCallback, useEffect, useState,useLayoutEffect,useRef } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import {
  BUCKET_PESAJES,
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
  dispositions:Map<string,UploadDisposition>;
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
  const {user,hasRole}=useAuth();
  const readGeneration=useRef(0);const [dispositions,setDispositions]=useState<Map<string,UploadDisposition>>(new Map());
  useLayoutEffect(()=>{const version=readGeneration;version.current++;setSubidas([]);setUrls({});setAutores(new Map());setDispositions(new Map());return()=>{version.current++;};},[user?.id,anio,mes]);
  const [cargando, setCargando] = useState(true);
  const [descartando, setDescartando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<SubidaLigada[]>([]);
  const [autores, setAutores] = useState<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Historical display blocking is not discard authority; protected RPC decides eligibility.

  const [tick, setTick] = useState(0);

  const cargar = useCallback(async () => {
    const owner=user?.id,version=++readGeneration.current,current=()=>readGeneration.current===version;
    if (!owner || !Number.isInteger(anio) || anio < 2020 || anio>2100 || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      setCargando(false);
      setSubidas([]);
      setUrls({});
      return;
    }
    setCargando(true);
    setError(null);setSubidas([]);setUrls({});setAutores(new Map());setDispositions(new Map());
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      await readUploadHistory(supabase as HistoryClient,owner,anio,mes,current);if(!current())return;
      const page=await fetchAll<CapturaCruda>((desde,hasta)=>{if(!current())throw Error('La sesión cambió.');return supabase.from('hato_capturas_foto').select(SELECT_CAPTURA).eq('tipo','pesaje').eq('anio',anio).eq('mes',mes).order('id',{ascending:true}).range(desde,hasta);});
      if(page.truncado||new Set(page.filas.map(c=>c.id)).size!==page.filas.length)throw Error('No se pudo verificar la lista completa de subidas.');if(!current())return;
      const capturas=page.filas.map(capturaDesdeCruda);
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
      await Promise.all(firmas);if(!current())return;
      const history=await readUploadHistory(supabase as HistoryClient,owner,anio,mes,current);if(!current())return;
      if(history.entries.some(e=>!capturas.some(c=>c.id===e.captureId)))throw Error('El historial cambió. Actualiza para verificar las subidas.');

      const ligadas:SubidaLigada[]=capturas.map(captura=>({captura,filaIds:[],desde:null,hasta:null}));
      setSubidas(ligadas);setDispositions(new Map(history.entries.map(e=>[e.captureId,e])));

      setAutores(autoresNuevos);
      setUrls(urlsNuevas);
    } catch (err) {
      if(!current())return;setDispositions(new Map());setUrls({});setAutores(new Map());
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las subidas.');
      setSubidas([]);
    } finally {
      if(current())setCargando(false);
    }
  }, [anio, mes,user?.id]);

  useEffect(() => {
    void cargar();
  }, [cargar, tick]);

  const allowed=hasRole(['Gerencia']);const generation=useRef({value:0});const [discardAttempt,setDiscardAttempt]=useState<DiscardResult|null>(null);
  useLayoutEffect(()=>{const g=generation.current;g.value++;setDiscardAttempt(null);setDescartando(false);return()=>{g.value++;};},[user?.id,allowed]);
  const run=useCallback(async(mode:'prepare'|'post'|'status'|'resolve'|'new',capture?:string):Promise<ResultadoDescarte>=>{
   const owner=user?.id,n=generation.current.value;if(!owner||!allowed)return {ok:false,error:'Solo Gerencia puede descartar una subida.'};setDescartando(true);setError(null);
   try{const r=await runDiscard(getSupabase() as unknown as DiscardClient,owner,mode,()=>generation.current.value===n,capture,discardAttempt);if(generation.current.value!==n)throw Error('La sesión cambió.');setDiscardAttempt(r);if(r?.state==='committed')setTick(t=>t+1);return {ok:true,error:null};}
   catch(e){const message=e instanceof Error?e.message:'Conserve y consulte el descarte original.';if(generation.current.value===n)setError(message);return {ok:false,error:message};}
   finally{if(generation.current.value===n)setDescartando(false);}
  },[user?.id,allowed,discardAttempt]);
  const descartar=useCallback((capture:string)=>run('prepare',capture),[run]);
  const accionDescarte=useCallback((mode:'post'|'status'|'resolve'|'new')=>run(mode),[run]);

  return { cargando, descartando, error, subidas, autores, urls, descartar,discardAttempt,accionDescarte,dispositions };
}
