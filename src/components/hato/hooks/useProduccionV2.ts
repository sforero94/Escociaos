// ARCHIVO: components/hato/hooks/useProduccionV2.ts
// DESCRIPCIÓN: I/O compartido de Producción v2 y Cargas: pesajes + partos
// (`useDatosProduccionPorVaca`), historial de quincenas al camión y el día
// de pesaje configurado. Sin aritmética: esa vive en `utils/hato/produccionV2.ts`.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDatosProduccionPorVaca } from './useDatosProduccionPorVaca';
import { useProduccionHato, type HatoProduccionQuincenalConIngreso } from './useProduccionHato';
import { fechasPesajeMensuales } from '@/utils/calculosHato';
import { obtenerFechaHoy } from '@/utils/fechas';
import { pendientesCarga } from '@/utils/hato/produccionV2';

/** 4 años de quincenas: alcanza para "Año" contra el año pasado y para el
 * historial de subidas. */
const LIMITE_QUINCENAS = 96;

export function useProduccionV2() {
  const datos = useDatosProduccionPorVaca();
  const hook = useProduccionHato();
  const [historial, setHistorial] = useState<HatoProduccionQuincenalConIngreso[]>([]);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [diaPesaje, setDiaPesaje] = useState<{ iso: number; nombre: string } | null>(null);

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    setErrorHistorial(null);
    try {
      setHistorial(await hook.fetchHistorialQuincenal(LIMITE_QUINCENAS));
    } catch (err) {
      setErrorHistorial(err instanceof Error ? err.message : 'No se pudo cargar el historial de quincenas.');
    } finally {
      setCargandoHistorial(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void cargarHistorial();
    hook
      .fetchDiaPesajeSemanal()
      .then(setDiaPesaje)
      .catch(() => setDiaPesaje(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarHistorial]);

  const fechasConPesaje = useMemo(() => new Set(datos.pesajes.map((p) => p.fecha)), [datos.pesajes]);

  const hoy = useMemo(() => obtenerFechaHoy(), []);

  // Mientras carga no se anuncia nada como pendiente: un aviso falso de
  // "falta cargar" manda a Martha a subir algo que ya está.
  const pendientes = useMemo(() => {
    if (datos.loading || cargandoHistorial || errorHistorial || datos.error || !diaPesaje) return [];
    const [anio, mes] = hoy.split('-').map(Number);
    const ant = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
    return pendientesCarga({
      hoy,
      quincenasCargadas: historial,
      fechasPesajeMesActual: fechasPesajeMensuales(anio, mes, diaPesaje.iso),
      fechasPesajeMesAnterior: fechasPesajeMensuales(ant.anio, ant.mes, diaPesaje.iso),
      fechasConPesaje,
    });
  }, [hoy, historial, diaPesaje, fechasConPesaje, datos.loading, datos.error, cargandoHistorial, errorHistorial]);

  const recargar = useCallback(() => {
    datos.reload();
    void cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargarHistorial]);

  return {
    pesajes: datos.pesajes,
    partosPorAnimal: datos.partosPorAnimal,
    identidadPorAnimal: datos.identidadPorAnimal,
    cargandoPesajes: datos.loading,
    errorPesajes: datos.error,
    historial,
    cargandoHistorial,
    errorHistorial,
    diaPesaje,
    fechasConPesaje,
    hoy,
    pendientes,
    recargar,
  };
}
