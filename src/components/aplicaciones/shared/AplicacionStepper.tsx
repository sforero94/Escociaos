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
      <ol className="hidden md:flex items-start justify-between">
        {pasos.map((paso, index) => {
          const numero = index + 1;
          const isActive = pasoActual === numero;
          const isCompleted = pasoActual > numero;
          const isLast = index === pasos.length - 1;
          const isNavegable = isCompleted && !!onIrAPaso;

          const Circulo = (
            <div
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-all duration-300',
                isActive
                  ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-lg scale-110'
                  : isCompleted
                    ? 'bg-primary text-white'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="w-8 h-8" /> : <span className="text-lg">{numero}</span>}
            </div>
          );

          return (
            <li key={paso.id} className="flex items-start flex-1" aria-current={isActive ? 'step' : undefined}>
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
                <div className="flex-1 h-1 mx-4 mt-8">
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
