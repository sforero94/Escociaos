// ARCHIVO: components/hato/components/VentaAnimalDialog.tsx
// DESCRIPCIÓN: Orquesta el flujo "Registrar venta" de un animal del hato
// (S9, plan §7.2/§8: "marcar vendida/muerta en la ficha abre el formulario
// existente pre-llenado"). Reusa `TransaccionGanadoForm` -- compartido con
// Ganado ceba -- vía sus props opcionales de prefill hato, NUNCA un
// formulario paralelo. Tras el guardado exitoso de la transacción
// financiera, registra el evento `venta` en `hato_eventos` y marca el
// animal `vendida` (`useRegistrarSalidaHato`). El caller (`HojaDeVida`)
// gatea la visibilidad del botón que abre este diálogo a
// Administrador/Gerencia + `estado === 'activa'`.

import { toast } from 'sonner';
import { TransaccionGanadoForm } from '@/components/finanzas/components/TransaccionGanadoForm';
import { useRegistrarSalidaHato } from '../hooks/useRegistrarSalidaHato';

/** Cantidad de cabezas prellenada: una venta del hato siempre corresponde a
 * UN animal puntual, nunca un lote. Sigue siendo editable en el formulario
 * por si un caso real difiere (ver reporte de S9, judgment call). */
const CABEZAS_HATO_DEFAULT = 1;

export function VentaAnimalDialog({
  open,
  onOpenChange,
  animalId,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  /** Se llama tras un guardado exitoso de la transacción financiera (con o
   * sin éxito del registro posterior en la ficha) -- el caller (HojaDeVida)
   * decide cómo refrescar (`reload()` de `useHatoAnimal`). */
  onGuardado: () => void;
}) {
  const { registrarVenta } = useRegistrarSalidaHato();

  return (
    <TransaccionGanadoForm
      open={open}
      onOpenChange={onOpenChange}
      defaultTipo="venta"
      hatoAnimalId={animalId}
      hatoCantidadCabezasDefault={CABEZAS_HATO_DEFAULT}
      onSuccess={onGuardado}
      onGuardadoTransaccion={async (transaccion) => {
        const resultado = await registrarVenta(animalId, { id: transaccion.id, fecha: transaccion.fecha });
        if (!resultado.ok) {
          // Nunca un fallo silencioso: la transacción financiera ya se
          // guardó (ver TransaccionGanadoForm), pero el evento/estado en la
          // ficha del hato quedó a medias -- el mensaje dice exactamente qué.
          toast.error(resultado.error ?? 'Error desconocido registrando la venta en la ficha del animal');
        }
      }}
    />
  );
}
