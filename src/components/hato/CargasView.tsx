// ARCHIVO: components/hato/CargasView.tsx
// DESCRIPCIÓN: `/hato-lechero/cargas` -- las TAREAS de carga del módulo
// (D4/D12, lienzo "Producción Hato v2"), separadas de la consulta de
// Producción. Diseñada para el celular primero (D16): Martha y Santiago
// cargan desde el teléfono. Tres tarjetas (venta de leche, pesaje, venta de
// animales) y el historial de subidas.
//
// Sin avisos arriba (dueño, 2026-10-16: «confunden»). Cada tarjeta dice lo
// suyo: Venta de leche marca las quincenas pendientes y las fotos que
// quedaron sin guardar; Pesaje marca los días sin pesaje y las planillas
// que no dejaron litros.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProduccionV2 } from './hooks/useProduccionV2';
import { useHistorialSubidas } from './hooks/useHistorialSubidas';
import { HatoPageHeader } from './components/HatoPageHeader';
import { DetallePesajeSemanalDialog } from './components/DetallePesajeSemanalDialog';
import { CargaLecheCard, type SolicitudLeche } from './components/cargas/CargaLecheCard';
import { CargaPesajeCard } from './components/cargas/CargaPesajeCard';
import { CargaVentaAnimalesCard } from './components/cargas/CargaVentaAnimalesCard';
import { HistorialSubidas } from './components/cargas/HistorialSubidas';
import { cargasAMedias, etiquetaDiaPesaje, inicioMesesAtras, type PendienteCarga } from '@/utils/hato/produccionV2';

const MESES_HISTORIAL_INICIAL = 2;

export function CargasView() {
  const d = useProduccionV2();
  const { hasRole } = useAuth();
  const esGerencia = hasRole(['Gerencia']);
  const [detalleFecha, setDetalleFecha] = useState<string | null>(null);
  const [meses, setMeses] = useState(MESES_HISTORIAL_INICIAL);
  const desde = inicioMesesAtras(d.hoy, meses);
  const fotos = useHistorialSubidas(desde);
  const [solicitudLeche, setSolicitudLeche] = useState<SolicitudLeche | null>(null);

  const { recargar } = d;
  const { recargar: recargarFotos } = fotos;
  const recargarTodo = useCallback(() => {
    recargar();
    void recargarFotos();
  }, [recargar, recargarFotos]);

  const aMedias = useMemo(
    () =>
      cargasAMedias({
        hoy: d.hoy,
        fotosLiquidacion: fotos.fotosLiquidacion,
        guardadosQuincena: d.historial.map((h) => h.updated_at),
        pesajesSinFilas: fotos.pesajesSinFilas,
      }),
    [d.hoy, d.historial, fotos.fotosLiquidacion, fotos.pesajesSinFilas],
  );

  const handleVerFoto = async (p: PendienteCarga) => {
    if (!p.foto) return;
    const error = await fotos.abrirFoto(p.foto);
    if (error) toast.error(error);
  };

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <HatoPageHeader section="Cargas" title="Cargas" subtitle="Lo que entra al módulo y lo que falta." />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <CargaLecheCard
            hoy={d.hoy}
            historial={d.historial}
            onSaved={recargarTodo}
            solicitud={solicitudLeche}
            aMedias={esGerencia ? aMedias.filter((p) => p.tipo === 'liquidacion_a_medias') : []}
            onVerFoto={(p) => void handleVerFoto(p)}
          />
          <CargaPesajeCard
            hoy={d.hoy}
            diaPesaje={d.diaPesaje}
            pesajes={d.pesajes}
            onAbrirFecha={setDetalleFecha}
            onGuardado={recargarTodo}
            aMedias={aMedias.filter((p) => p.tipo === 'pesaje_a_medias')}
            onVerFoto={(p) => void handleVerFoto(p)}
          />
          <CargaVentaAnimalesCard onGuardado={d.recargar} />
        </div>

        <HistorialSubidas
          historial={d.historial}
          pesajes={d.pesajes}
          fotos={fotos}
          desde={desde}
          meses={meses}
          onMasMeses={() => setMeses((m) => m + 2)}
          onAbrirPesaje={setDetalleFecha}
          onAbrirQuincena={(q) => setSolicitudLeche({ quincena: q, nonce: Date.now() })}
          onCambio={recargarTodo}
        />
      </div>

      <DetallePesajeSemanalDialog
        abierto={detalleFecha != null}
        semana={detalleFecha != null ? 0 : null}
        etiqueta={detalleFecha ? etiquetaDiaPesaje(detalleFecha) : null}
        fechaReferencia={detalleFecha}
        identidadPorAnimal={d.identidadPorAnimal}
        onCerrar={() => setDetalleFecha(null)}
        onCambio={recargarTodo}
      />
    </div>
  );
}
