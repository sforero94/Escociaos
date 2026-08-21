import { Check } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export interface PasoStepper {
  id: string;
  titulo: string;
  descripcion?: string;
}

interface AplicacionStepperProps {
  pasos: PasoStepper[];
  /** 1-based */
  pasoActual: number;
  /** undefined = no navegable */
  onIrAPaso?: (n: number) => void;
  className?: string;
}

/**
 * Stepper único para el módulo de Aplicaciones — reemplaza los DOS steppers a mano que hoy
 * existen (uno en CalculadoraAplicaciones.tsx con círculos numerados + descripción, otro en
 * CierreAplicacion.tsx con círculos chicos + chevrons) y que hoy se ven distintos entre sí.
 *
 * Una sola implementación responsive: en escritorio muestra los pasos completos con
 * título/descripción y línea conectora; en móvil colapsa a una barra de progreso con el
 * título del paso actual (mismo patrón que ya usaba CalculadoraApliaciones.tsx en móvil).
 *
 * Solo los pasos completados son navegables cuando se provee `onIrAPaso` — no tiene sentido
 * saltar a un paso futuro que aún no fue validado.
 */
export function AplicacionStepper({ pasos, pasoActual, onIrAPaso, className }: AplicacionStepperProps) {
  const pasoActualInfo = pasos[pasoActual - 1];

  return (
    <nav aria-label="Progreso de la aplicación" className={cn('w-full', className)}>
      {/* Desktop */}
      {/* `justify-between` + `flex-1` empujaba los pasos a los extremos: con 3 se veía bien y con
          2 quedaba un conector enorme y todo descentrado. Ahora el <ol> se centra y se topa el
          ancho en función de cuántos pasos hay, así 2 y 3 se ven igual de deliberados. */}
      <ol
        className="mx-auto hidden md:flex items-start justify-center"
        style={{ maxWidth: `${pasos.length * 15}rem` }}
      >
        {pasos.map((paso, index) => {
          const numero = index + 1;
          const isActive = pasoActual === numero;
          const isCompleted = pasoActual > numero;
          const isLast = index === pasos.length - 1;
          const isNavegable = isCompleted && !!onIrAPaso;

          const Circulo = (
            <div
              className={cn(
                'size-12 rounded-xl flex items-center justify-center mb-3 transition-colors',
                isActive
                  // Un solo acento: el paso activo es olivo sólido, no un degradado
                  // primary→secondary. El `scale-110` además desalineaba el nodo activo
                  // respecto de los otros y del conector.
                  ? 'bg-primary text-primary-foreground ring-4 ring-primary/15'
                  : isCompleted
                    ? 'bg-primary/12 text-primary border border-primary'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="size-5" /> : <span className="text-base font-semibold">{numero}</span>}
            </div>
          );

          return (
            <li key={paso.id} className="flex items-start" aria-current={isActive ? 'step' : undefined}>
              <div className="flex flex-col items-center">
                {isNavegable ? (
                  <button
                    type="button"
                    onClick={() => onIrAPaso?.(numero)}
                    aria-label={`Ir al paso ${numero}: ${paso.titulo}`}
                    className="flex flex-col items-center cursor-pointer"
                  >
                    {Circulo}
                  </button>
                ) : (
                  Circulo
                )}

                <div className="text-center">
                  <p
                    className={cn(
                      'text-sm mb-1 transition-colors',
                      isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {paso.titulo}
                  </p>
                  {paso.descripcion && (
                    <p className="text-xs text-brand-brown/50 max-w-[140px]">{paso.descripcion}</p>
                  )}
                </div>
              </div>

              {!isLast && (
                <div className="w-16 lg:w-24 h-0.5 mx-3 mt-6 shrink-0">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      isCompleted ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Mobile */}
      <div className="md:hidden">
        <ol className="flex items-center justify-center gap-2 mb-4">
          {pasos.map((paso, index) => {
            const numero = index + 1;
            const isActive = pasoActual === numero;
            const isCompleted = pasoActual > numero;

            return (
              <li
                key={paso.id}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'h-2 flex-1 rounded-full transition-all duration-300',
                  isActive || isCompleted ? 'bg-primary' : 'bg-muted',
                )}
              />
            );
          })}
        </ol>

        {pasoActualInfo && (
          <div className="text-center">
            <p className="text-lg text-foreground mb-1">{pasoActualInfo.titulo}</p>
            <p className="text-sm text-brand-brown/70">
              Paso {pasoActual} de {pasos.length}
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}
