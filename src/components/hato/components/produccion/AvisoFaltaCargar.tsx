// ARCHIVO: components/hato/components/produccion/AvisoFaltaCargar.tsx
// DESCRIPCIÓN: aviso "Falta cargar" de Producción v2 (D17: Martha se perdía
// al elegir qué cargar y dónde). En Producción lleva a Cargas; en Cargas
// cada línea salta a su tarjeta.

import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import type { PendienteCarga } from '@/utils/hato/produccionV2';

export function AvisoFaltaCargar({ pendientes, modo }: { pendientes: PendienteCarga[]; modo: 'produccion' | 'cargas' }) {
  if (pendientes.length === 0) return null;

  if (modo === 'produccion') {
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

  return (
    <section role="status" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-800">Falta ahora</p>
      {pendientes.map((p) => (
        <a
          key={`${p.tipo}-${p.clave}`}
          href={p.tipo === 'liquidacion' ? '#carga-leche' : '#carga-pesaje'}
          className="flex h-11 items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 text-sm text-amber-800"
        >
          <span>{p.texto}</span>
          <span className="font-semibold">{p.tipo === 'liquidacion' ? 'Subir ›' : 'Ver ›'}</span>
        </a>
      ))}
    </section>
  );
}
