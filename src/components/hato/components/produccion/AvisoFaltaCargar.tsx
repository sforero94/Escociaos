// ARCHIVO: components/hato/components/produccion/AvisoFaltaCargar.tsx
// DESCRIPCIÓN: aviso "Falta cargar" de Producción v2 (D17: Martha se perdía
// al elegir qué cargar y dónde). Una sola línea con lo mismo que marcan las
// tarjetas de Cargas, y un botón que lleva allá. En Cargas no hay aviso
// arriba: cada tarjeta dice lo suyo (dueño, 2026-10-16).

import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import type { PendienteCarga } from '@/utils/hato/produccionV2';

export function AvisoFaltaCargar({ pendientes }: { pendientes: PendienteCarga[] }) {
  if (pendientes.length === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" aria-hidden="true" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Falta cargar:</span> {pendientes.map((p) => p.texto).join(' · ')}
        </p>
      </div>
      <Link
        to="/hato-lechero/cargas"
        className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 sm:h-9"
      >
        Ir a Cargas
      </Link>
    </div>
  );
}
