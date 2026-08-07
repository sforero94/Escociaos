// ARCHIVO: components/hato/components/VentaQuincenalCard.tsx
// DESCRIPCIÓN: UI rework de Producción (2026-08-06) -- tarjeta pequeña
// "Venta quincenal al camión" de la pestaña Registrar. Antes
// `ProduccionQuincenalForm` era un formulario grande, siempre visible e
// inline; ahora es un diálogo (`ProduccionQuincenalDialog.tsx`) y esta
// tarjeta es su único disparador: título + línea de estado ("<Mes> · <N>ª
// quincena: pendiente/cargada") + el mismo desplegable `Registrar` de
// `CapturaArchivo` (foto/archivo/a mano) que usa `PesajeLecheCard`.
//
// El candado de rol (`CandadoGerencia`) vivía antes DENTRO del archivo del
// formulario -- se mueve acá porque ahora es la TARJETA, no el diálogo, la
// que decide si el usuario ve algo distinto de un candado (plan §4.3: "el
// gate es el ROL, nunca el resultado de la consulta" -- RLS de
// `fin_ingresos` devuelve `[]` sin error para un Administrador,
// indistinguible de "no hay ventas").
//
// El estado "pendiente/cargada" se resuelve contra `historialQuincenal`
// (prop, ya fetched por `ProduccionView` para el gráfico/KPIs de la pestaña
// Producción) -- evita una consulta nueva solo para esta línea de estado.

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CapturaArchivo } from './CapturaArchivo';
import { ProduccionQuincenalDialog } from './ProduccionQuincenalDialog';
import { resolverQuincena } from '@/utils/calculosHato';
import { obtenerFechaHoy } from '@/utils/fechas';
import type { HatoProduccionQuincenalConIngreso } from '../hooks/useProduccionHato';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Mismo criterio que el bloque de Ventas del tablero (SOW 5): un solo
 * candado pequeño reemplaza la tarjeta entera para un rol sin permisos de
 * Gerencia, en vez de mostrar el título/estado con las acciones apagadas. */
function CandadoGerencia() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
        <Lock className="w-4 h-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Venta quincenal al camión</p>
        <p className="text-xs text-gray-500">La captura de la venta quincenal requiere permisos de Gerencia.</p>
      </div>
    </div>
  );
}

function VentaQuincenalCardInner({
  historialQuincenal,
  onSaved,
}: {
  historialQuincenal: HatoProduccionQuincenalConIngreso[];
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [modoDialogo, setModoDialogo] = useState<File[]>([]);

  const inicial = resolverQuincena(obtenerFechaHoy());
  const registroActual = historialQuincenal.find(
    (h) => h.anio === inicial.anio && h.mes === inicial.mes && h.quincena === inicial.quincena,
  );
  const estado = registroActual ? 'cargada' : 'pendiente';

  const abrir = (fotos: File[]) => {
    setModoDialogo(fotos);
    setOpen(true);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">Venta quincenal al camión</h3>
      <p className="text-xs text-gray-500">Liquidación de El Pomar</p>
      <p className="text-xs text-gray-500 mb-3">
        {MESES[inicial.mes - 1]} · {inicial.quincena}ª quincena:{' '}
        <span className={estado === 'pendiente' ? 'font-medium text-amber-600' : 'font-medium text-gray-700'}>{estado}</span>
      </p>

      <CapturaArchivo
        label="Registrar"
        acceptArchivo="image/*"
        labelOpcionArchivo="Subir imagen"
        onFotos={abrir}
        onArchivo={abrir}
        onManual={() => abrir([])}
      />

      <ProduccionQuincenalDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setModoDialogo([]);
        }}
        fotosIniciales={modoDialogo}
        onSaved={onSaved}
      />
    </div>
  );
}

export function VentaQuincenalCard(props: { historialQuincenal: HatoProduccionQuincenalConIngreso[]; onSaved?: () => void }) {
  return (
    <RoleGuard allowedRoles={['Gerencia']} fallback={<CandadoGerencia />}>
      <VentaQuincenalCardInner {...props} />
    </RoleGuard>
  );
}
