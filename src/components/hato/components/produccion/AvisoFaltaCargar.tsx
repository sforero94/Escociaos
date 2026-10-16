// ARCHIVO: components/hato/components/produccion/AvisoFaltaCargar.tsx
// DESCRIPCIÓN: aviso "Falta cargar" de Producción v2 (D17: Martha se perdía
// al elegir qué cargar y dónde). En Producción lleva a Cargas; en Cargas
// cada línea abre directo lo que hay que terminar — incluidas las cargas
// que quedaron a medias (mensaje de Martha, 2026-10-16), que además dejan
// volver a ver la foto ya subida.

import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import type { PendienteCarga } from '@/utils/hato/produccionV2';

const ACCION: Record<PendienteCarga['tipo'], string> = {
  liquidacion: 'Subir ›',
  vacas: 'Completar ›',
  pesaje: 'Ver ›',
  liquidacion_a_medias: 'Continuar ›',
  pesaje_a_medias: 'Continuar ›',
};

export function AvisoFaltaCargar({
  pendientes,
  modo,
  onAbrir,
  onVerFoto,
}: {
  pendientes: PendienteCarga[];
  modo: 'produccion' | 'cargas';
  /** Solo en Cargas: abre lo que hay que terminar. */
  onAbrir?: (pendiente: PendienteCarga) => void;
  /** Solo en Cargas: abre la foto ya subida de una carga a medias. */
  onVerFoto?: (pendiente: PendienteCarga) => void;
}) {
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

  const aMedias = pendientes.filter((p) => p.tipo === 'liquidacion_a_medias' || p.tipo === 'pesaje_a_medias');
  const faltan = pendientes.filter((p) => !aMedias.includes(p));

  const fila = (p: PendienteCarga) => (
    <div key={`${p.tipo}-${p.clave}`} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-amber-200 bg-white px-3 py-1.5 text-sm text-amber-800">
      <span className="min-w-0">{p.texto}</span>
      <span className="flex flex-shrink-0 items-center gap-1">
        {p.foto && onVerFoto && (
          <button type="button" onClick={() => onVerFoto(p)} className="h-11 rounded-md px-2 font-medium text-amber-700 hover:bg-amber-50 sm:h-9">
            Ver foto
          </button>
        )}
        <button type="button" onClick={() => onAbrir?.(p)} className="h-11 rounded-md px-2 font-semibold hover:bg-amber-50 sm:h-9">
          {ACCION[p.tipo]}
        </button>
      </span>
    </div>
  );

  return (
    <section role="status" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      {faltan.length > 0 && (
        <>
          <p className="text-sm font-semibold text-amber-800">Falta ahora</p>
          {faltan.map(fila)}
        </>
      )}
      {aMedias.length > 0 && (
        <>
          <p className="text-sm font-semibold text-amber-800">Quedaron a medias</p>
          <p className="text-xs text-amber-800">
            Subiste la foto pero no se guardó. Ábrela para tener los datos a mano y toca «Continuar».
          </p>
          {aMedias.map(fila)}
        </>
      )}
    </section>
  );
}
