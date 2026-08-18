/**
 * «Guarda esto» — la confirmación que faltaba en la web.
 *
 * Esco tiene memoria de largo plazo desde la migración 041 y el flujo está
 * escrito en `chat.tsx`: «el cliente renderiza botones de confirmación en línea
 * con el token». Telegram los renderiza. La web nunca los tuvo, así que pedirle
 * a Esco que recordara algo desde el navegador producía un «listo, lo guardé»
 * y cero filas insertadas.
 *
 * Adaptado del primitivo Approval Card de Beautiful UI (Turbo,
 * https://beautiful-ui-five.vercel.app/#approval-card): la pregunta
 * human-in-the-loop antes de que el agente actúe. Sobre los tokens de Escocia
 * OS, con anillo de foco y área táctil de 44 px, que el original no trae.
 */

import { useEffect, useState } from 'react';
import { BookmarkPlus, Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/components/ui/utils';
import { guardarMemoria, memoriaYaGuardada } from '@/utils/chatService';

interface EscoMemoriaAprobacionProps {
  /** Texto que Esco propuso recordar (viene de los `args` de `propose_memory_save`). */
  propuesta: string;
}

type Estado = 'comprobando' | 'pendiente' | 'editando' | 'guardando' | 'guardada' | 'descartada';

export function EscoMemoriaAprobacion({ propuesta }: EscoMemoriaAprobacionProps) {
  // Arranca comprobando: la tarjeta no debe parpadear con los botones puestos si
  // la memoria ya estaba guardada de una sesión anterior.
  const [estado, setEstado] = useState<Estado>('comprobando');
  const [texto, setTexto] = useState(propuesta);

  useEffect(() => {
    let vigente = true;
    memoriaYaGuardada(propuesta)
      .then((existe) => { if (vigente) setEstado(existe ? 'guardada' : 'pendiente'); })
      .catch(() => { if (vigente) setEstado('pendiente'); });
    return () => { vigente = false; };
  }, [propuesta]);

  const guardar = async () => {
    setEstado('guardando');
    try {
      await guardarMemoria(texto);
      setEstado('guardada');
    } catch (err) {
      setEstado('pendiente');
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la memoria');
    }
  };

  const descartar = () => setEstado('descartada');

  // Mientras comprueba no se pinta nada: un esqueleto por dos décimas de segundo
  // es más ruido que ausencia.
  if (estado === 'comprobando') return null;

  if (estado === 'guardada' || estado === 'descartada') {
    const guardada = estado === 'guardada';
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {guardada ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        ) : (
          <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 truncate">
          {guardada ? 'Guardado en la memoria de Esco' : 'No se guardó'}
          {guardada && `: ${texto}`}
        </span>
      </div>
    );
  }

  const botonBase =
    'touch-target inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
    'disabled:opacity-60';

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <BookmarkPlus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">Guardar en la memoria de Esco</span>
      </div>

      {estado === 'editando' ? (
        <textarea
          autoFocus
          value={texto}
          onChange={(ev) => setTexto(ev.target.value)}
          maxLength={1000}
          rows={3}
          className={cn(
            'mb-3 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
          )}
        />
      ) : (
        <p className="mb-3 text-sm text-foreground">«{texto}»</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={guardar}
          disabled={estado === 'guardando' || !texto.trim()}
          className={cn(botonBase, 'bg-primary text-primary-foreground hover:bg-primary-dark')}
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado === 'pendiente' && (
          <button
            type="button"
            onClick={() => setEstado('editando')}
            className={cn(botonBase, 'border border-border text-muted-foreground hover:bg-muted')}
          >
            <Pencil className="h-3 w-3" aria-hidden />
            Editar
          </button>
        )}
        <button
          type="button"
          onClick={descartar}
          disabled={estado === 'guardando'}
          className={cn(botonBase, 'border border-border text-muted-foreground hover:bg-muted')}
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
