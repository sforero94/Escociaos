import { TEMAS_INFORME, type TemaInforme } from '@/utils/informesVisita/temas';
import { cn } from '@/components/ui/utils';

export function TemasChips({
  seleccionados,
  onChange,
}: {
  seleccionados: TemaInforme[];
  onChange: (temas: TemaInforme[]) => void;
}) {
  function toggle(tema: TemaInforme) {
    if (seleccionados.includes(tema)) {
      onChange(seleccionados.filter((t) => t !== tema));
    } else {
      onChange([...seleccionados, tema]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Temas de la visita">
      {TEMAS_INFORME.map((tema) => {
        const on = seleccionados.includes(tema);
        return (
          <button
            key={tema}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(tema)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground hover:bg-muted',
            )}
          >
            {tema}
          </button>
        );
      })}
    </div>
  );
}
