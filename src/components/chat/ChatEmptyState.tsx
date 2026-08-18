import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Sprout } from 'lucide-react';

/**
 * Atajos por módulo.
 *
 * La ruta actual es la señal de intención más barata que tiene el sistema: si
 * Santiago abre a Esco parado en Hato Lechero, casi nunca va a preguntar por los
 * gastos del mes. Antes la lista era fija en toda la app.
 *
 * El orden importa: se elige el PRIMER prefijo que coincida, así que las rutas
 * más específicas van antes que las más generales.
 */
const ATAJOS_POR_RUTA: Array<{ prefijo: string; prompts: string[] }> = [
  {
    prefijo: '/hato-lechero',
    prompts: [
      'Vacas próximas a parto',
      'Litros de la última quincena',
      'Vacas vacías hace más de 90 días',
      'Alertas del hato sin responder',
    ],
  },
  {
    prefijo: '/finanzas',
    prompts: [
      'Gastos del mes por categoría',
      'P&G de Aguacate Hass este año',
      'Gastos pendientes de confirmar',
      'Presupuesto vs ejecutado',
    ],
  },
  {
    prefijo: '/ganado',
    prompts: [
      'Cabezas por finca',
      'Movimientos pendientes de confirmar',
      'Variación de inventario en 30 días',
    ],
  },
  {
    prefijo: '/monitoreo',
    prompts: [
      'Plagas por encima del umbral',
      'Qué sublotes priorizar esta semana',
      'Tendencia de ácaro en las últimas rondas',
    ],
  },
  {
    prefijo: '/aplicaciones',
    prompts: [
      'Aplicaciones activas',
      'Costo por árbol de la última aplicación',
      'Productos más usados este trimestre',
    ],
  },
  {
    prefijo: '/inventario',
    prompts: ['Productos con inventario bajo', 'Últimas compras registradas', 'Movimientos de esta semana'],
  },
  {
    prefijo: '/labores',
    prompts: ['Jornales de esta semana', 'Actividad por empleado', 'Costo de mano de obra por lote'],
  },
  {
    prefijo: '/produccion',
    prompts: ['Kg por lote de la última cosecha', 'Costo por kilo', 'Rendimiento kg/árbol por lote'],
  },
  {
    prefijo: '/clima',
    prompts: ['Lluvia acumulada del mes', 'Pronóstico de los próximos días', 'Radiación de la semana'],
  },
];

/** Tablero general y cualquier ruta sin atajos propios. */
const ATAJOS_GENERALES = [
  'Jornales de esta semana',
  'Estado del monitoreo',
  'Gastos del mes',
  'Inventario bajo',
  'Producción por lote',
  'Aplicaciones activas',
];

function atajosParaRuta(pathname: string): string[] {
  return ATAJOS_POR_RUTA.find((a) => pathname.startsWith(a.prefijo))?.prompts ?? ATAJOS_GENERALES;
}

interface ChatEmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  const { pathname } = useLocation();
  const prompts = useMemo(() => atajosParaRuta(pathname), [pathname]);

  return (
    // `min-h-full`, no `flex-1`: el contenedor padre es un bloque con
    // `overflow-y-auto`, así que `flex-1` no aplicaba, la altura colapsaba al
    // contenido y el saludo quedaba pegado arriba en vez de centrado.
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sprout className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">Hola, soy Esco</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu asistente de datos de Escocia Hass. Pregúntame sobre labores, monitoreo, finanzas y más.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5 px-2">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            className="rounded-full border border-border bg-background px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
