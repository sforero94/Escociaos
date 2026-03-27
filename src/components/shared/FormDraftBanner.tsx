import { Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FormDraftBannerProps {
  variant: 'restored' | 'available';
  onRestore?: () => void;
  onDiscard: () => void;
  show: boolean;
}

export function FormDraftBanner({ variant, onRestore, onDiscard, show }: FormDraftBannerProps) {
  if (!show) return null;

  if (variant === 'restored') {
    return (
      <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
          <Clock className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-blue-800 font-medium mb-1">
            Progreso restaurado automaticamente
          </p>
          <p className="text-xs text-blue-700">
            Puedes continuar donde lo dejaste. Tu progreso se guarda automaticamente.
          </p>
        </div>
        <button
          onClick={onDiscard}
          className="text-sm text-blue-600 hover:text-blue-800 underline whitespace-nowrap flex-shrink-0"
        >
          Empezar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
      <span className="text-sm text-amber-800 flex-1">
        Tienes datos sin guardar de una sesion anterior.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={onRestore}
        className="border-amber-300 text-amber-700 hover:bg-amber-100"
      >
        Restaurar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDiscard}
        className="text-amber-600 hover:text-amber-800"
      >
        Descartar
      </Button>
    </div>
  );
}
