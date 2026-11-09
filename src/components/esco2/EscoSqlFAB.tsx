import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const EscoSqlBeta = lazy(() => import('./EscoSqlBeta').then(m => ({ default: m.EscoSqlBeta })));

/**
 * Segundo botón flotante: abre Esco SQL (beta) sin reemplazar al Esco de siempre (`ChatFAB`).
 * Solo Gerencia. El panel se monta la primera vez que se abre y después se oculta sin
 * desmontarse, para que la conversación sobreviva a cerrar y abrir.
 */
export function EscoSqlFAB() {
  const { hasRole } = useAuth();
  const { pathname } = useLocation();
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  // Ya existe la página completa en /esco-sql: ahí el botón sobra.
  if (!hasRole(['Gerencia']) || pathname === '/esco-sql') return null;

  function abrir() { setMontado(true); setAbierto(true); }

  return (
    <>
      <button
        onClick={abrir}
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))', right: '5.75rem' }}
        aria-label="Abrir Esco SQL (beta)"
        title="Esco SQL (beta)"
      >
        <Sparkles className="h-6 w-6" />
      </button>
      {montado ? (
        <div
          role="dialog"
          aria-label="Esco SQL (beta)"
          aria-hidden={!abierto}
          className={`fixed inset-0 z-50 flex flex-col bg-background shadow-2xl sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(42rem,calc(100vh-8rem))] sm:w-[28rem] sm:rounded-2xl sm:border ${abierto ? '' : 'hidden'}`}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="font-semibold text-brand-brown">
              Esco SQL <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-medium text-primary">beta</span>
            </p>
            <button onClick={() => setAbierto(false)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted" aria-label="Cerrar Esco SQL">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Suspense fallback={<p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…</p>}>
              <EscoSqlBeta compacto />
            </Suspense>
          </div>
        </div>
      ) : null}
    </>
  );
}
