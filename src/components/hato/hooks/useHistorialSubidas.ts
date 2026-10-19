// ARCHIVO: components/hato/hooks/useHistorialSubidas.ts
// DESCRIPCIÓN: fotos de "Historial de subidas" en Cargas (comentario del
// dueño en el lienzo v2: "una tabla desplegable con el histórico de
// subidas, tanto de quincenas al camión como de pesaje, para tener dónde ir
// a ver los datos crudos"). Solo I/O: lee `hato_capturas_foto` (pesaje y
// liquidación) y las filas de pesaje necesarias para ligar cada fecha con
// su foto. La liga del pesaje reutiliza `ligarFilasASubidas`; la de la
// liquidación, `fotoDeQuincena`. La URL firmada se pide al abrir la foto,
// no antes: con 3 meses de historial serían decenas de firmas inútiles.

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/utils/supabase/client';
import { fetchAll } from '@/utils/supabase/fetchAll';
import { ligarFilasASubidas, type CapturaSubida, type FilaSubida } from '@/utils/hato/subidasPesajeMes';
import type { FotoSubida } from '@/utils/hato/produccionV2';

interface CapturaCruda {
  id: string;
  tipo: 'pesaje' | 'liquidacion';
  anio: number | null;
  mes: number | null;
  storage_bucket: string;
  storage_rutas: string[] | null;
  storage_ok: boolean;
  created_by: string | null;
  creado_en: string;
  origen: string;
  desenlace: string;
}

const SEGUNDOS_URL = 60 * 10;

function primeraRuta(c: CapturaCruda): string | null {
  if (!c.storage_ok) return null;
  return (c.storage_rutas ?? []).map((r) => r.trim()).find((r) => r.length > 0) ?? null;
}

export function useHistorialSubidas(desde: string) {
  const [fotosLiquidacion, setFotosLiquidacion] = useState<FotoSubida[]>([]);
  const [fotoPesajePorFecha, setFotoPesajePorFecha] = useState<Map<string, FotoSubida>>(new Map());
  const [pesajesSinFilas, setPesajesSinFilas] = useState<Array<FotoSubida & { anio: number; mes: number }>>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const supabase = getSupabase() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      // Un margen de 3 días antes de `desde`: una liquidación del día 1 se
      // fotografía a veces el último día del mes anterior.
      const margen = new Date(Date.parse(`${desde}T00:00:00`) - 3 * 86400000).toISOString();
      const { data, error: errorCapturas } = await supabase
        .from('hato_capturas_foto')
        .select('id, tipo, anio, mes, storage_bucket, storage_rutas, storage_ok, created_by, creado_en, origen, desenlace')
        .in('tipo', ['pesaje', 'liquidacion'])
        .gte('creado_en', margen)
        .order('creado_en', { ascending: false });
      if (errorCapturas) throw new Error(errorCapturas.message);
      const capturas = (data ?? []) as CapturaCruda[];

      const liquidaciones: FotoSubida[] = [];
      for (const c of capturas) {
        if (c.tipo !== 'liquidacion') continue;
        const ruta = primeraRuta(c);
        if (ruta) liquidaciones.push({ capturaId: c.id, bucket: c.storage_bucket, ruta, creadoEn: c.creado_en });
      }

      const capturasPesaje: CapturaSubida[] = capturas
        .filter((c) => c.tipo === 'pesaje' && c.anio != null && c.mes != null)
        .map((c) => ({
          id: c.id,
          anio: c.anio as number,
          mes: c.mes as number,
          creadoEn: c.creado_en,
          createdBy: c.created_by,
          origen: c.origen,
          desenlace: c.desenlace,
          storageBucket: c.storage_bucket,
          storageRutas: c.storage_rutas ?? [],
          storageOk: c.storage_ok,
        }));

      const porFecha = new Map<string, FotoSubida>();
      const sinFilas: Array<FotoSubida & { anio: number; mes: number }> = [];
      if (capturasPesaje.length > 0) {
        const { filas } = await fetchAll<FilaSubida>((d, h) =>
          supabase
            .from('hato_pesajes_leche')
            .select('id, fecha, created_at, created_by, fuente')
            .gte('fecha', desde)
            .order('id', { ascending: true })
            .range(d, h),
        );
        const fechaPorFila = new Map(filas.map((f) => [f.id, f.fecha]));
        for (const subida of ligarFilasASubidas(capturasPesaje, filas)) {
          const cruda = capturas.find((c) => c.id === subida.captura.id);
          const ruta = cruda ? primeraRuta(cruda) : null;
          if (!ruta) continue;
          // Una foto que no dejó ni un litro es una carga a medias. Solo se
          // afirma para meses que la consulta de filas cubre (`fecha >=
          // desde`): fuera de esa ventana, "sin filas" sería no haber mirado.
          const inicioMes = `${subida.captura.anio}-${String(subida.captura.mes).padStart(2, '0')}-01`;
          if (subida.filaIds.length === 0 && subida.captura.desenlace !== 'ok' && inicioMes >= desde) {
            sinFilas.push({
              capturaId: subida.captura.id,
              bucket: subida.captura.storageBucket,
              ruta,
              creadoEn: subida.captura.creadoEn,
              anio: subida.captura.anio,
              mes: subida.captura.mes,
            });
          }
          for (const filaId of subida.filaIds) {
            const fecha = fechaPorFila.get(filaId);
            // La subida más reciente gana: `ligarFilasASubidas` ya las
            // devuelve de la más nueva a la más vieja.
            if (fecha && !porFecha.has(fecha)) {
              porFecha.set(fecha, { capturaId: subida.captura.id, bucket: subida.captura.storageBucket, ruta, creadoEn: subida.captura.creadoEn });
            }
          }
        }
      }

      setFotosLiquidacion(liquidaciones);
      setFotoPesajePorFecha(porFecha);
      setPesajesSinFilas(sinFilas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las fotos de las subidas.');
    } finally {
      setCargando(false);
    }
  }, [desde]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Firma la URL y abre la foto en otra pestaña. Devuelve un error legible
   * si Storage no la firma (bucket sin política de lectura, foto borrada). */
  const abrirFoto = useCallback(async (foto: FotoSubida): Promise<string | null> => {
    const supabase = getSupabase();
    // La pestaña se abre ANTES del await: abrirla después lo bloquea el
    // navegador como ventana emergente.
    const ventana = window.open('', '_blank');
    if (ventana) ventana.opener = null;
    const { data, error: errorFirma } = await supabase.storage.from(foto.bucket).createSignedUrl(foto.ruta, SEGUNDOS_URL);
    if (errorFirma || !data?.signedUrl) {
      ventana?.close();
      return 'No se pudo abrir la foto.';
    }
    if (ventana) ventana.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank', 'noopener');
    return null;
  }, []);

  return { fotosLiquidacion, fotoPesajePorFecha, pesajesSinFilas, cargando, error, recargar: cargar, abrirFoto };
}

export type HistorialSubidasEstado = ReturnType<typeof useHistorialSubidas>;
