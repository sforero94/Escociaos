import { TEMAS_INFORME, type TemaInforme } from '@/utils/informesVisita/temas';
import { cn } from '@/components/ui/utils';

export function TemasChips({
  seleccionados,
  onChange,
  compacto = false,
  soloLectura = false,
}: {
  seleccionados: TemaInforme[];
  onChange?: (temas: TemaInforme[]) => void;
  compacto?: boolean;
  soloLectura?: boolean;
}) {
  function toggle(tema: TemaInforme) {
    if (soloLectura || !onChange) return;
    if (seleccionados.includes(tema)) {
      onChange(seleccionados.filter((t) => t !== tema));
    } else {
      onChange([...seleccionados, tema]);
    }
  }

  const visibles = soloLectura
    ? TEMAS_INFORME.filter((t) => seleccionados.includes(t))
    : TEMAS_INFORME;

  if (visibles.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label="Temas de la nota"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {visibles.map((tema) => {
        const on = seleccionados.includes(tema);
        const clase = cn(
          'rounded-full border font-medium transition-colors',
          compacto ? 'px-2 py-0.5 text-[11px] leading-tight' : 'px-3 py-1.5 text-sm',
          on
            ? 'border-primary-dark bg-primary-dark text-white'
            : 'border-brand-brown/35 bg-transparent text-brand-brown',
        );
        if (soloLectura) {
          return (
            <span key={tema} className={cn(clase, 'cursor-default')}>
              {tema}
            </span>
          );
        }
        return (
          <button
            key={tema}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(tema)}
            className={clase}
          >
            {tema}
          </button>
        );
      })}
    </div>
  );
}
