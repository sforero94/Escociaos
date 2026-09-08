// ARCHIVO: components/shared/RouteErrorBoundary.tsx
// DESCRIPCIÓN: la aplicación no tenía NINGUNA barrera de errores (2026-09-08:
// cero `componentDidCatch` y cero `getDerivedStateFromError` en todo `src/`).
// Las ~55 rutas entran por `React.lazy`, o sea que cada una es un chunk con
// hash aparte, y un chunk que ya no existe hace que el `import()` rechace
// DENTRO del render de `Suspense`. Sin barrera, React desmonta el árbol
// entero: pantalla en blanco, sin mensaje y sin forma de salir que no sea
// recargar a ciegas.
//
// Es el mismo fallo que rompió la exportación de la planilla el 2026-09-08
// —una pestaña abierta desde antes de un despliegue— pero en la ruta, donde
// el costo es toda la aplicación en vez de un botón. Ver
// `utils/errorCargaDiferida.ts` para por qué el navegador lo reporta como un
// problema de tipo MIME y no como un 404.
//
// LO QUE ESTA BARRERA NO HACE: tragarse los errores. Todo lo que atrapa va a
// `console.error` con el error completo, y un error que NO es de carga
// diferida muestra su mensaje real en pantalla. Una barrera que esconde
// defectos es peor que no tenerla -- cambia una pantalla en blanco ruidosa por
// una pantalla bonita que miente.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { esFalloDeCargaDiferida, MENSAJE_PAGINA_DESACTUALIZADA, textoDeError } from '@/utils/errorCargaDiferida';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class BarreraDeError extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // El error completo, siempre -- es lo único que queda para diagnosticar
    // después, y no hay servicio de reporte de errores en el proyecto.
    console.error('[RouteErrorBoundary] la ruta falló al renderizar', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const paginaVieja = esFalloDeCargaDiferida(error);

    return (
      <div className="min-h-[calc(100dvh-200px)] flex items-center justify-center p-4">
        <div className="max-w-lg w-full rounded-xl border border-gray-200 bg-white p-8 text-center">
          <div className="mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50">
            <AlertTriangle className="w-7 h-7 text-amber-600" />
          </div>

          <h1 className="text-xl text-foreground mb-3">
            {paginaVieja ? 'La aplicación se actualizó' : 'No se pudo abrir esta pantalla'}
          </h1>

          <p className="text-sm text-gray-600 mb-6">
            {paginaVieja
              ? MENSAJE_PAGINA_DESACTUALIZADA
              : 'Ocurrió un error al cargar esta pantalla. Si vuelve a pasar, avisa a soporte con el detalle de abajo.'}
          </p>

          {/* El detalle técnico solo cuando NO es una página vieja: ahí la
              causa ya está explicada en español y el texto del navegador
              (tipos MIME, URLs con hash) solo asusta sin agregar nada. */}
          {!paginaVieja && (
            <pre className="text-left text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-6 overflow-x-auto whitespace-pre-wrap">
              {textoDeError(error)}
            </pre>
          )}

          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Recargar la página
          </Button>
        </div>
      </div>
    );
  }
}

/**
 * Barrera para las rutas diferidas.
 *
 * El `key={location.pathname}` es carga útil, no decoración: un componente de
 * clase conserva su estado, así que una vez que la barrera entra en error se
 * queda ahí para SIEMPRE -- navegar a otra pantalla seguiría mostrando el
 * mismo cartel, y la aplicación quedaría igual de muerta que con la pantalla
 * en blanco. Cambiar la llave la vuelve a montar limpia en cada navegación, de
 * modo que el error queda acotado a la ruta que de verdad falló.
 */
export function RouteErrorBoundary({ children }: Props) {
  const location = useLocation();
  return <BarreraDeError key={location.pathname}>{children}</BarreraDeError>;
}
