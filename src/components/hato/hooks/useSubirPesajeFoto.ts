// ARCHIVO: components/hato/hooks/useSubirPesajeFoto.ts
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- sube 1..6
// fotos de la planilla MENSUAL de pesaje a `POST
// /make-server-1ccce916/hato/pesaje/foto` (preview, NUNCA escribe) y
// prepara el diff revisado mediante el protocolo protegido. La confirmación
// separada conserva el intento original y publica filas/comprobante/captura
// en una sola transacción.
//
// Gemelo, simplificado, de `useSubirChequeoExcel.ts`: la planilla de pesaje
// no tiene ruta `.xlsx` (D-8, S4/S5 comparten el mismo patrón "foto primero,
// archivo=otra fuente de la misma foto" que ya usa
// `useOcrLiquidacionPomar.ts`), así que solo hay una función de subida, no
// dos. `anio`/`mes` son requeridos: la planilla ya imprime la fecha real de
// cada semana (`exportarPlanillaPesajePDF.ts`), quien sube la foto solo
// confirma qué mes está mirando.
//
// Mismo patrón de auth que `useSubirChequeoExcel.ts`/`ClimaCard.tsx`:
// `Authorization: Bearer <session.access_token>`.

import { useState, useCallback,useLayoutEffect,useRef } from 'react';
import {useAuth} from '@/contexts/AuthContext';
import {pendingBrowserPhoto,runBrowserPhoto,type BrowserPhotoAttempt,type BrowserPhotoClient} from '@/utils/hato/hatoPhotoBrowserAttempt';
import {useMilkWeighing} from './useMilkWeighing';
import { getSupabase } from '@/utils/supabase/client';
import { getSupabaseConfig } from '@/utils/supabase/config';
import type { CeldaDiffPesaje, SemanaPesaje } from '@/utils/importHato/ocrPesaje';
import { construirDiffPesajeManual, type AnimalPesajeManual } from '@/utils/hato/pesajeManual';

const edgeFunctionBase = () => `${getSupabaseConfig().url}/functions/v1`;

export interface FilaNoLeidaPesaje {
  pagina: number;
  orden: number;
  nombreImpreso: string;
  motivo: string;
  detalle: string;
}

export interface VacaSinLeerPesaje {
  id: string;
  nombre: string;
}

export interface ReporteOcrPesaje {
  modelo: string;
  fotos: { pagina: number; nombre: string; bytes: number }[];
  almacenamiento: { bucket: string; ok: boolean; errores: string[] };
  paginasNoLeidas: string[];
  filasNoLeidas: FilaNoLeidaPesaje[];
  vacasSinLeer: VacaSinLeerPesaje[];
  advertencias: string[];
  resumen: {
    vacasEnRoster: number;
    fotosRecibidas: number;
    fotosLeidas: number;
    filasConfirmadas: number;
    filasNoLeidas: number;
    vacasSinLeer: number;
    celdasNoConfiables: number;
  };
}

export interface PreviewPesajeRespuesta {
  success: true;
  generadoEn: string;
  anio: number;
  mes: number;
  /** Fila de `hato_capturas_foto` (migración 146) que registra ESTE intento
   * de carga. Viaja de vuelta en el commit, que la cierra con el desenlace
   * real. `null` en el modo "Ingresar a mano" (no hay foto que registrar) y
   * cuando el registro del intento falló -- en los dos casos el flujo sigue
   * igual, solo se pierde la traza. */
  capturaId: string | null;
  fechasPorSemana: Record<SemanaPesaje, string | null>;
  diff: CeldaDiffPesaje[];
  ocr: ReporteOcrPesaje;
}

export interface CeldaRechazadaPesaje {
  animalId: string;
  fecha: string;
  motivo: string;
}

export interface CommitPesajeRespuesta {
  success: true;
  guardados: number;
  actualizados: number;
  creados: number;
  celdasRechazadas: CeldaRechazadaPesaje[];
}

/** Payload mínimo que necesita el commit -- ver `hato-pesaje-commit.ts`. */
export interface CeldaParaCommit {
  animalId: string;
  fecha: string;
  litrosAm: number | null;
  litrosPm: number | null;
}

export function useSubirPesajeFoto(enabled=true) {
  const weighing=useMilkWeighing(enabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Finding #40 (2026-08-24): distingue el rechazo EXPLÍCITO del servidor
  // (HTTP 422 -- ninguna vaca del roster ancló en ninguna foto, ver
  // `detectarRechazoLecturaPesaje` en `ocrPesaje.ts`) de cualquier otro
  // error (red, 500, 502...). `SubirPesajeFoto.tsx` lo usa para mostrar un
  // panel accionable en vez del cajón de error genérico -- sin esta bandera
  // tendría que adivinar el motivo comparando el TEXTO del mensaje.
  const [documentoRechazado, setDocumentoRechazado] = useState(false);
  const [resultado, setResultado] = useState<PreviewPesajeRespuesta | null>(null);
  const comprometiendo=weighing.busy,errorCommit=weighing.error;
  const committed=weighing.attempt?.result?.state==='committed'?weighing.attempt.result:null;
  const commitResultado:CommitPesajeRespuesta|null=committed?{success:true,guardados:committed.plan!.accepted.length,actualizados:committed.plan!.accepted.filter(a=>a.before!==null).length,creados:committed.plan!.accepted.filter(a=>a.before===null).length,celdasRechazadas:committed.plan!.rejected.map(r=>({animalId:r.cell.animalId,fecha:r.cell.date,motivo:'Fuera del roster o día configurado en la revisión capturada.'}))}:null;

  const {user,hasRole}=useAuth();const allowed=enabled&&hasRole(['Administrador','Gerencia']);
  const generation=useRef({owner:user?.id,number:0,mounted:allowed});const [photoAttempt,setPhotoAttempt]=useState<BrowserPhotoAttempt|null>(null);
  useLayoutEffect(()=>{generation.current={owner:user?.id,number:generation.current.number+1,mounted:allowed};setPhotoAttempt(null);setResultado(null);setError(null);setLoading(false);return()=>{generation.current.mounted=false;generation.current.number++;};},[user?.id,allowed]);
  const runPhoto=useCallback(async(mode:'upload'|'resume'|'new'|'cancel',input?:{files:readonly File[];year:number;month:number})=>{
   const owner=user?.id,n=generation.current.number,current=()=>generation.current.mounted&&generation.current.owner===owner&&generation.current.number===n;
   if(!owner||!current())throw Error('La sesión cambió. Conserve el intento original.');setLoading(true);setError(null);setDocumentoRechazado(false);
   try{
    const attempt=await runBrowserPhoto(getSupabase() as unknown as BrowserPhotoClient,`${edgeFunctionBase()}/make-server-1ccce916/hato/pesaje/foto`,owner,mode,current,input,photoAttempt);
    if(!current())throw Error('La sesión cambió.');setPhotoAttempt(attempt);
    const outcome=attempt?.result?.preview?.outcome;
    if(outcome?.ok){setResultado(outcome.resultado as unknown as PreviewPesajeRespuesta);}
    else if(outcome){setResultado(null);setDocumentoRechazado(outcome.status===422);setError(String(outcome.error));}
    else if(mode==='new'||mode==='cancel')setResultado(null);
    return attempt;
   }catch(e){if(current()){try{const saved=pendingBrowserPhoto(owner);if(saved)setPhotoAttempt(old=>old?.key===saved.key?old:{...saved,result:null});}catch{/* Keep corrupt storage untouched; never allocate a replacement. */}setError(e instanceof Error?e.message:'Conserve y consulte la carga original.');}throw e;}
   finally{if(current())setLoading(false);}
  },[user?.id,photoAttempt]);
  const subirFotos=useCallback(async(fotos:File[],anio:number,mes:number)=>{
   const a=await runPhoto('upload',{files:fotos,year:anio,month:mes});const outcome=a?.result?.preview?.outcome;
   if(!outcome?.ok)throw Error(outcome?.error?String(outcome.error):'Resultado incierto. Consulte la carga original sin reenviar las fotos.');return outcome.resultado as unknown as PreviewPesajeRespuesta;
  },[runPhoto]);
  const recoverPhotos=useCallback(()=>runPhoto('resume'),[runPhoto]);
  const newPhoto=useCallback(()=>runPhoto('new'),[runPhoto]);
  const cancelPhoto=useCallback(()=>runPhoto('cancel'),[runPhoto]);

  /** Aprueba las celdas que el usuario confirmó (posiblemente corregidas a
   * mano, D-6) -- nunca reenvía la foto. `anio`/`mes` viajan de nuevo porque
   * el commit revalida `hato_config.dia_pesaje_semanal` en fresco (puede
   * haber cambiado desde la vista previa).
   *
   * `capturaId` sale del estado (`resultado`), no de un parámetro nuevo: es
   * el mismo intento que abrió esta vista previa y el llamador no tiene por
   * qué acarrearlo. En el modo manual es `null` y el servidor no cierra
   * ninguna fila. */
  const {prepareCells}=weighing;
  const comprometer=useCallback((celdas:CeldaParaCommit[],anio:number,mes:number)=>prepareCells(celdas.map(c=>({animalId:c.animalId,date:c.fecha,am:c.litrosAm,pm:c.litrosPm})),anio,mes,resultado?.capturaId??null),[prepareCells,resultado?.capturaId]);

  /** Modo "Ingresar a mano" (UI rework de Producción, 2026-08-06) -- arma la
   * MISMA forma de `resultado` que devuelve `subirFotos`, pero con el diff
   * en blanco (`construirDiffPesajeManual`) y SIN llamar al endpoint de OCR.
   * `ocr.resumen.fotosRecibidas` queda en 0 a propósito: es lo que usa
   * `SubirPesajeFoto.tsx` para no mostrar el resumen de "lectura de fotos"
   * cuando no hubo ninguna.
   *
   * DEVUELVE la respuesta además de guardarla en el estado, igual que
   * `subirFotos`: el llamador necesita el diff en el mismo tick para sembrar
   * las filas de la grilla, y leerlo del estado obligaría a un `useEffect`
   * que volvería a sembrarlas cada vez que el usuario las edite. */
  const iniciarManual = useCallback((anio: number, mes: number, animales: AnimalPesajeManual[], fechasPorSemana: Record<SemanaPesaje, string | null>): PreviewPesajeRespuesta => {
    setError(null);
    const diff = construirDiffPesajeManual(animales, fechasPorSemana);
    const respuesta: PreviewPesajeRespuesta = {
      success: true,
      generadoEn: new Date().toISOString(),
      anio,
      mes,
      // Sin foto no hay captura que registrar ni que cerrar.
      capturaId: null,
      fechasPorSemana,
      diff,
      ocr: {
        modelo: 'manual',
        fotos: [],
        almacenamiento: { bucket: '', ok: true, errores: [] },
        paginasNoLeidas: [],
        filasNoLeidas: [],
        vacasSinLeer: [],
        advertencias: [],
        resumen: {
          vacasEnRoster: animales.length,
          fotosRecibidas: 0,
          fotosLeidas: 0,
          filasConfirmadas: animales.length,
          filasNoLeidas: 0,
          vacasSinLeer: 0,
          celdasNoConfiables: 0,
        },
      },
    };
    setResultado(respuesta);
    return respuesta;
  }, []);

  const limpiar = useCallback(() => {
    setResultado(null);
    setError(null);
    setDocumentoRechazado(false);
  }, []);

  return {
    photoAttempt,recoverPhotos,newPhoto,cancelPhoto,
    subirFotos,
    iniciarManual,
    comprometer,
    weighing,
    limpiar,
    loading,
    error,
    documentoRechazado,
    resultado,
    comprometiendo,
    errorCommit,
    commitResultado,
  };
}
