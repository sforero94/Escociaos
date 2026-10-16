// ARCHIVO: components/hato/CargasView.tsx
// DESCRIPCIÓN: `/hato-lechero/cargas` -- las TAREAS de carga del módulo
// (D4/D12, lienzo "Producción Hato v2"), separadas de la consulta de
// Producción. Diseñada para el celular primero (D16): Martha y Santiago
// cargan desde el teléfono. Arriba "Falta ahora" y "Quedaron a medias";
// luego tres tarjetas (venta de leche, pesaje, venta de animales) y el
// historial de subidas.
//
// "Quedaron a medias" (mensaje de Martha, 2026-10-16): una foto subida que
// no terminó en un guardado. Cada línea reabre el flujo donde quedó y deja
// volver a ver la foto, para tener los datos a mano.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProduccionV2 } from './hooks/useProduccionV2';
import { useHistorialSubidas } from './hooks/useHistorialSubidas';
import { HatoPageHeader } from './components/HatoPageHeader';
import { DetallePesajeSemanalDialog } from './components/DetallePesajeSemanalDialog';
import { AvisoFaltaCargar } from './components/produccion/AvisoFaltaCargar';
import { CargaLecheCard, type SolicitudLeche } from './components/cargas/CargaLecheCard';
import { CargaPesajeCard } from './components/cargas/CargaPesajeCard';
import { CargaVentaAnimalesCard } from './components/cargas/CargaVentaAnimalesCard';
import { HistorialSubidas } from './components/cargas/HistorialSubidas';
import {
  cargasAMedias,
  etiquetaDiaPesaje,
  inicioMesesAtras,
  type PendienteCarga,
  type QuincenaClave,
} from '@/utils/hato/produccionV2';

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
  const [solicitudPesaje, setSolicitudPesaje] = useState<{ anio: number; mes: number; nonce: number } | null>(null);

  const { recargar } = d;
  const { recargar: recargarFotos } = fotos;
  const recargarTodo = useCallback(() => {
    recargar();
    void recargarFotos();
  }, [recargar, recargarFotos]);

  const pendientes = useMemo(() => {
    const aMedias = cargasAMedias({
      hoy: d.hoy,
      fotosLiquidacion: fotos.fotosLiquidacion,
      guardadosQuincena: d.historial.map((h) => h.updated_at),
      pesajesSinFilas: fotos.pesajesSinFilas,
    });
    // La liquidación solo la puede terminar Gerencia (escribe fin_ingresos).
    const todos = [...d.pendientes, ...aMedias];
    return esGerencia ? todos : todos.filter((p) => p.tipo !== 'liquidacion' && p.tipo !== 'vacas' && p.tipo !== 'liquidacion_a_medias');
  }, [d.hoy, d.historial, d.pendientes, fotos.fotosLiquidacion, fotos.pesajesSinFilas, esGerencia]);

  const abrirQuincena = (quincena: QuincenaClave | null) => setSolicitudLeche({ quincena, nonce: Date.now() });

  const handleAbrir = (p: PendienteCarga) => {
    switch (p.tipo) {
      case 'liquidacion':
      case 'vacas':
        abrirQuincena(p.quincena ?? null);
        break;
      case 'liquidacion_a_medias':
        // Sin quincena: el diálogo ofrece recuperar el borrador, si quedó.
        abrirQuincena(null);
        break;
      case 'pesaje':
        document.getElementById('carga-pesaje')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'pesaje_a_medias':
        if (p.anio != null && p.mes != null) setSolicitudPesaje({ anio: p.anio, mes: p.mes, nonce: Date.now() });
        break;
    }
  };

  const handleVerFoto = async (p: PendienteCarga) => {
    if (!p.foto) return;
    const error = await fotos.abrirFoto(p.foto);
    if (error) toast.error(error);
  };

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <HatoPageHeader section="Cargas" title="Cargas" subtitle="Lo que entra al módulo y lo que falta." />

        <AvisoFaltaCargar pendientes={pendientes} modo="cargas" onAbrir={handleAbrir} onVerFoto={(p) => void handleVerFoto(p)} />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
          <CargaLecheCard hoy={d.hoy} historial={d.historial} onSaved={recargarTodo} solicitud={solicitudLeche} />
          <CargaPesajeCard
            hoy={d.hoy}
            diaPesaje={d.diaPesaje}
            pesajes={d.pesajes}
            onAbrirFecha={setDetalleFecha}
            onGuardado={recargarTodo}
            solicitud={solicitudPesaje}
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
          onAbrirQuincena={(q) => abrirQuincena(q)}
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
