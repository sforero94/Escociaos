import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorCargaGanadoProps {
  mensaje: string;
  onReintentar: () => void;
  titulo?: string;
}

/**
 * Estado de error explícito, separado del estado vacío. Una lectura fallida
 * NUNCA se renderiza como "no hay datos" (R-1: sin dato es "—" o un aviso,
 * jamás 0 disfrazado de hecho) — es sobre todo crítico en Inventario, donde
 * un falso vacío ofrece "Cargar inventario inicial" y duplicaría cabezas
 * reales si el usuario le hace caso a un error de lectura.
 */
export function ErrorCargaGanado({
  mensaje,
  onReintentar,
  titulo = 'No se pudo leer la información',
}: ErrorCargaGanadoProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 flex flex-col items-center text-center gap-3">
      <AlertCircle className="w-8 h-8 text-red-500" aria-hidden="true" />
      <div>
        <p className="font-semibold text-red-800">{titulo}</p>
        <p className="text-sm text-red-700/80 mt-1 max-w-md">{mensaje}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onReintentar}
        className="border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
      >
        Reintentar
      </Button>
    </div>
  );
}
