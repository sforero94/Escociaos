// ARCHIVO: components/hato/components/cargas/CargaVentaAnimalesCard.tsx
// DESCRIPCIÓN: tarjeta "Venta de animales" de Cargas v2 (D15: un solo flujo
// de venta con tres puertas -- Cargas, Hoja de vida y Finanzas). Abre el
// mismo `VentaAnimalesHatoDialog` que la Hoja de vida.

import { useState } from 'react';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { VentaAnimalesHatoDialog } from '../VentaAnimalesHatoDialog';

export function CargaVentaAnimalesCard({ onGuardado }: { onGuardado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const { hasRole } = useAuth();
  const puede = hasRole(['Gerencia']);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
          <DollarSign className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Venta de animales</h2>
          <p className="text-xs text-gray-500">Terneros o vacas de descarte</p>
        </div>
      </div>
      <p className="text-xs text-gray-500">El mismo formulario que en la Hoja de vida y en Finanzas.</p>
      <Button variant="outline" onClick={() => setAbierto(true)} disabled={!puede}>
        Registrar venta
      </Button>
      {!puede && <p className="text-xs text-gray-500">Registrar una venta requiere permisos de Gerencia.</p>}
      <VentaAnimalesHatoDialog open={abierto} onOpenChange={setAbierto} onGuardado={onGuardado} />
    </section>
  );
}
