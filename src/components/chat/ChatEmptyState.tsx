import { Sprout } from 'lucide-react';

const SUGGESTED_PROMPTS = [
  'Jornales de esta semana',
  'Estado del monitoreo',
  'Gastos del mes',
  'Inventario bajo',
  'Produccion por lote',
  'Aplicaciones activas',
];

interface ChatEmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sprout className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">Hola, soy Esco</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu asistente de datos de Escocia Hass. Preguntame sobre labores, monitoreo, finanzas y mas.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
