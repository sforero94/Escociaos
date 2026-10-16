// ARCHIVO: components/hato/components/cargas/CargaLecheCard.tsx
// DESCRIPCIÓN: tarjeta "Venta de leche" de Cargas v2 -- la liquidación
// quincenal de El Pomar. Muestra el estado de las 2 últimas quincenas
// cerradas y abre el mismo `ProduccionQuincenalDialog` de siempre (lectura
// del PDF/foto + confirmación). Gerencia-only: el guardado escribe
// `fin_ingresos` (migración 070).

import { useEffect, useState } from 'react';
import { Lock, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { etiquetaQuincena, ultimasQuincenasCerradas, type QuincenaClave } from '@/utils/hato/produccionV2';
import type { HatoProduccionQuincenalConIngreso } from '../../hooks/useProduccionHato';
import { CapturaArchivo } from '../CapturaArchivo';
import { ProduccionQuincenalDialog } from '../ProduccionQuincenalDialog';

function Encabezado() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-700">
        <Truck className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Venta de leche</h2>
        <p className="text-xs text-gray-500">Liquidación quincenal de El Pomar</p>
      </div>
    </div>
  );
}

/** Pedido de abrir el diálogo desde fuera de la tarjeta (Falta ahora,
 * cargas a medias, historial). `nonce` cambia en cada pedido, para que
 * pedir dos veces la misma quincena vuelva a abrir. */
export interface SolicitudLeche {
  quincena: QuincenaClave | null;
  nonce: number;
}

interface CargaLecheProps {
  hoy: string;
  historial: HatoProduccionQuincenalConIngreso[];
  onSaved: () => void;
  solicitud?: SolicitudLeche | null;
}

function CargaLecheInterna({ hoy, historial, onSaved, solicitud }: CargaLecheProps) {
  const [abierto, setAbierto] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [quincenaInicial, setQuincenaInicial] = useState<QuincenaClave | null>(null);
  const quincenas = ultimasQuincenasCerradas(hoy).reverse();

  const abrir = (archivos: File[], q: QuincenaClave | null = null) => {
    setFotos(archivos);
    setQuincenaInicial(q);
    setAbierto(true);
  };

  useEffect(() => {
    if (solicitud) abrir([], solicitud.quincena);
  }, [solicitud]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {quincenas.map((q) => {
          const fila = historial.find((h) => h.anio === q.anio && h.mes === q.mes && h.quincena === q.quincena);
          const faltaVacas = fila != null && fila.num_vacas_ordeno == null;
          const estilo = !fila || faltaVacas ? 'border-amber-200 bg-amber-50 hover:bg-amber-100' : 'border-gray-200 hover:bg-gray-50';
          return (
            <button
              key={`${q.anio}-${q.mes}-${q.quincena}`}
              type="button"
              onClick={() => abrir([], q)}
              className={`flex min-h-11 flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left ${estilo}`}
            >
              <span className={`text-xs ${fila && !faltaVacas ? 'text-gray-500' : 'text-amber-800'}`}>{etiquetaQuincena(q)}</span>
              <span className={`text-sm font-medium ${fila && !faltaVacas ? 'text-green-700' : 'text-amber-700'}`}>
                {!fila ? 'Pendiente' : faltaVacas ? 'Falta # de vacas ›' : '✓ Cargada'}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">
        Sube el PDF o la foto de la liquidación. El sistema lee litros y valor, y tú confirmas. Toca una quincena para verla o completarla.
      </p>
      <CapturaArchivo
        label="Subir liquidación"
        acceptArchivo="application/pdf,image/*"
        labelOpcionArchivo="Subir PDF o imagen"
        onFotos={(a) => abrir(a)}
        onArchivo={(a) => abrir(a)}
        className="w-full"
      />
      <Button variant="ghost" className="text-primary" onClick={() => abrir([])}>
        Escribir los datos a mano
      </Button>
      <ProduccionQuincenalDialog
        open={abierto}
        onOpenChange={(o) => {
          setAbierto(o);
          if (!o) {
            setFotos([]);
            setQuincenaInicial(null);
          }
        }}
        fotosIniciales={fotos}
        quincenaInicial={quincenaInicial}
        onSaved={onSaved}
      />
    </>
  );
}

export function CargaLecheCard(props: CargaLecheProps) {
  return (
    <section id="carga-leche" className="flex scroll-mt-4 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <Encabezado />
      <RoleGuard
        allowedRoles={['Gerencia']}
        fallback={
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Lock className="h-4 w-4 text-amber-600" /> La liquidación de leche requiere permisos de Gerencia.
          </p>
        }
      >
        <CargaLecheInterna {...props} />
      </RoleGuard>
    </section>
  );
}
