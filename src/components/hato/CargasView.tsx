// ARCHIVO: components/hato/CargasView.tsx
// DESCRIPCIÓN: `/hato-lechero/cargas` -- las TAREAS de carga del módulo
// (D4/D12, lienzo "Producción Hato v2"), separadas de la consulta de
// Producción. Diseñada para el celular primero (D16): Martha y Santiago
// cargan desde el teléfono. Arriba "Falta ahora"; luego tres tarjetas
// (venta de leche, pesaje, venta de animales) y el historial de subidas.

import { useState } from 'react';
import { useProduccionV2 } from './hooks/useProduccionV2';
import { HatoPageHeader } from './components/HatoPageHeader';
import { DetallePesajeSemanalDialog } from './components/DetallePesajeSemanalDialog';
import { AvisoFaltaCargar } from './components/produccion/AvisoFaltaCargar';
import { CargaLecheCard } from './components/cargas/CargaLecheCard';
import { CargaPesajeCard } from './components/cargas/CargaPesajeCard';
import { CargaVentaAnimalesCard } from './components/cargas/CargaVentaAnimalesCard';
import { HistorialSubidas } from './components/cargas/HistorialSubidas';
import { etiquetaDiaPesaje } from '@/utils/hato/produccionV2';

export function CargasView() {
  const d = useProduccionV2();
  const [detalleFecha, setDetalleFecha] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <HatoPageHeader section="Cargas" title="Cargas" subtitle="Lo que entra al módulo y lo que falta." />

        <AvisoFaltaCargar pendientes={d.pendientes} modo="cargas" />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <CargaLecheCard hoy={d.hoy} historial={d.historial} onSaved={d.recargar} />
          <CargaPesajeCard
            hoy={d.hoy}
            diaPesaje={d.diaPesaje}
            pesajes={d.pesajes}
            onAbrirFecha={setDetalleFecha}
            onGuardado={d.recargar}
          />
          <CargaVentaAnimalesCard onGuardado={d.recargar} />
        </div>

        <HistorialSubidas
          hoy={d.hoy}
          historial={d.historial}
          pesajes={d.pesajes}
          onAbrirPesaje={setDetalleFecha}
          onCambio={d.recargar}
        />
      </div>

      <DetallePesajeSemanalDialog
        abierto={detalleFecha != null}
        semana={detalleFecha != null ? 0 : null}
        etiqueta={detalleFecha ? etiquetaDiaPesaje(detalleFecha) : null}
        fechaReferencia={detalleFecha}
        identidadPorAnimal={d.identidadPorAnimal}
        onCerrar={() => setDetalleFecha(null)}
        onCambio={d.recargar}
      />
    </div>
  );
}
