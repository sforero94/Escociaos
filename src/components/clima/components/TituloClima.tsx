import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface TituloClimaProps {
  titulo: string;
  ayuda: string;
}

export function TituloClima({ titulo, ayuda }: TituloClimaProps) {
  return (
    <div className="flex items-start gap-1.5 mb-4">
      <h3 className="text-lg font-semibold text-gray-900 leading-snug">{titulo}</h3>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 mt-1 shrink-0"
            aria-label={ayuda}
          >
            <Info className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm leading-snug">{ayuda}</TooltipContent>
      </Tooltip>
    </div>
  );
}
