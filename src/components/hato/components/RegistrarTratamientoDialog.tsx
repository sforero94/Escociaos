// ARCHIVO: components/hato/components/RegistrarTratamientoDialog.tsx
// DESCRIPCIÓN: Diálogo "Registrar tratamiento" de la card Tratamientos
// (Hoja de Vida). Escribe por `fn_hato_registrar_tratamiento` (138).
//
// DECISIONES DEL DUEÑO (2026-09-09) QUE ESTE FORMULARIO EJECUTA
// ------------------------------------------------------------
// - Un tratamiento = una aplicación + una próxima fecha OPCIONAL. No es un
//   protocolo de N pasos.
// - El nombre es texto libre. `hato_protocolos` sigue vacío a propósito.
// - Dosis, quién aplicó y retiro de leche NO son campos: van en la nota,
//   texto libre, mientras se aprende qué se repite. Por eso la etiqueta de
//   la nota nombra esos tres ejemplos -- si nadie los sugiere, nadie los
//   escribe, y entonces nunca se sabría cuáles merecen ser columna.
// - El tratamiento NO entra a la línea de tiempo de eventos.
//
// La próxima fecha es lo único que enciende la alerta `tratamiento_paso`
// del motor (056/S6), que existe desde julio de 2026 y nunca disparó porque
// no había un solo paso que recordar. El texto de ayuda lo dice, para que
// dejarla vacía sea una decisión y no un descuido.

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { obtenerFechaHoy } from '@/utils/fechas';
import type {
  InputRegistrarTratamiento,
  ResultadoRegistrarTratamiento,
} from '../hooks/useRegistrarTratamientoHato';

export function RegistrarTratamientoDialog({
  open,
  onOpenChange,
  animalId,
  animalEtiqueta,
  registrar,
  guardando,
  onGuardado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  animalId: string;
  /** "MOCA (#177)" -- para que el título diga sobre cuál vaca se escribe. */
  animalEtiqueta: string;
  registrar: (input: InputRegistrarTratamiento) => Promise<ResultadoRegistrarTratamiento>;
  guardando: boolean;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState(obtenerFechaHoy());
  const [nota, setNota] = useState('');
  const [fechaProximoPaso, setFechaProximoPaso] = useState('');
  const [descripcionPaso, setDescripcionPaso] = useState('');

  useEffect(() => {
    if (open) {
      setNombre('');
      // `obtenerFechaHoy()` y nunca `toISOString().slice(0,10)`: de 19:00 en
      // adelante eso ya devuelve mañana en Bogotá.
      setFechaInicio(obtenerFechaHoy());
      setNota('');
      setFechaProximoPaso('');
      setDescripcionPaso('');
    }
  }, [open]);

  const proximaFechaInvalida = fechaProximoPaso !== '' && fechaProximoPaso < fechaInicio;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      toast.error('Escribe qué se aplicó');
      return;
    }
    if (!fechaInicio) {
      toast.error('La fecha es obligatoria');
      return;
    }
    if (proximaFechaInvalida) {
      toast.error('La próxima fecha no puede ser anterior a la fecha del tratamiento');
      return;
    }

    const resultado = await registrar({
      animalId,
      nombre: nombre.trim(),
      fechaInicio,
      nota: nota.trim() || null,
      fechaProximoPaso: fechaProximoPaso || null,
      descripcionPaso: descripcionPaso.trim() || null,
    });
    if (!resultado.ok) {
      toast.error(resultado.error ?? 'Error desconocido registrando el tratamiento');
      return;
    }
    toast.success(
      fechaProximoPaso
        ? 'Tratamiento registrado. Llegará un recordatorio por Telegram el día del próximo paso.'
        : 'Tratamiento registrado',
    );
    onGuardado();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Registrar tratamiento — {animalEtiqueta}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ttto-nombre">¿Qué se aplicó?</Label>
              <Input
                id="ttto-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Estrumate"
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ttto-fecha">Fecha</Label>
              <Input
                id="ttto-fecha"
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ttto-nota">Detalle (opcional)</Label>
              <Textarea
                id="ttto-nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Dosis, quién aplicó, días de retiro de la leche, lo que sea útil."
              />
            </div>

            <div className="rounded-lg border border-gray-200 p-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ttto-proximo">Próxima fecha (opcional)</Label>
                <Input
                  id="ttto-proximo"
                  type="date"
                  value={fechaProximoPaso}
                  min={fechaInicio || undefined}
                  onChange={(e) => setFechaProximoPaso(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Si la dejas vacía, el tratamiento queda como completado y nadie recibe aviso. Con
                  fecha, ese día llega un recordatorio por Telegram y se puede marcar como hecho
                  desde ahí.
                </p>
                {proximaFechaInvalida && (
                  <p className="text-xs text-red-600">
                    La próxima fecha es anterior a la fecha del tratamiento.
                  </p>
                )}
              </div>

              {fechaProximoPaso && (
                <div className="space-y-1.5">
                  <Label htmlFor="ttto-paso-desc">¿Qué toca hacer ese día? (opcional)</Label>
                  <Input
                    id="ttto-paso-desc"
                    value={descripcionPaso}
                    onChange={(e) => setDescripcionPaso(e.target.value)}
                    placeholder="Ej: segunda dosis"
                    maxLength={120}
                  />
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
