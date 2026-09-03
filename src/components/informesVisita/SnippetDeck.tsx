import { useEffect, useState } from 'react';
import { Check, Pencil, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccionDecision, FotoExtraida, SnippetPropuesto } from '@/types/informesVisita';
import type { TemaInforme } from '@/utils/informesVisita/temas';
import { sanitizarTemas } from '@/utils/informesVisita/temas';
import { TemasChips } from './TemasChips';

const UMBRAL_SWIPE = 80;

export function SnippetDeck({
  snippets,
  fotos,
  fotoUrls,
  decisiones,
  bloqueado,
  onDecision,
  onUndo,
  onEditar,
  onConfirmarRestantes,
  onTemasChange,
}: {
  snippets: SnippetPropuesto[];
  fotos: FotoExtraida[];
  fotoUrls: string[];
  decisiones: Record<string, AccionDecision>;
  bloqueado?: boolean;
  onDecision: (clave: string, accion: AccionDecision) => void;
  onUndo: () => void;
  onEditar: (clave: string) => void;
  onConfirmarRestantes: () => void;
  onTemasChange: (clave: string, temas: TemaInforme[]) => void;
}) {
  const pendientes = snippets.filter((s) => !decisiones[s.clave]);
  const actual = pendientes[0] ?? null;
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const [origenX, setOrigenX] = useState(0);

  const confirmadas = snippets.filter((s) => decisiones[s.clave] === 'confirmar').length;
  const ignoradas = snippets.filter((s) => decisiones[s.clave] === 'descartar').length;
  const puedeUndo = Object.keys(decisiones).length > 0;

  useEffect(() => {
    if (bloqueado || !actual) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        onDecision(actual.clave, 'confirmar');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onDecision(actual.clave, 'descartar');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actual, bloqueado, onDecision]);

  useEffect(() => {
    setDx(0);
  }, [actual?.clave]);

  function pointerDown(clientX: number) {
    if (bloqueado || !actual) return;
    setArrastrando(true);
    setOrigenX(clientX);
  }

  function pointerMove(clientX: number) {
    if (!arrastrando) return;
    setDx(clientX - origenX);
  }

  function pointerUp() {
    if (!arrastrando || !actual) {
      setArrastrando(false);
      setDx(0);
      return;
    }
    if (dx > UMBRAL_SWIPE) onDecision(actual.clave, 'confirmar');
    else if (dx < -UMBRAL_SWIPE) onDecision(actual.clave, 'descartar');
    setArrastrando(false);
    setDx(0);
  }

  if (!actual) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
        <p className="font-medium">No quedan ideas por revisar.</p>
        <p className="text-sm text-gray-500">
          {confirmadas} confirmada(s) · {ignoradas} ignorada(s)
        </p>
        {puedeUndo && (
          <Button type="button" variant="outline" size="sm" onClick={onUndo}>
            <Undo2 className="w-4 h-4 mr-1" /> Deshacer última
          </Button>
        )}
      </div>
    );
  }

  const fotoUrl = actual.foto_indice !== null ? fotoUrls[actual.foto_indice] : undefined;
  const foto = actual.foto_indice !== null ? fotos[actual.foto_indice] : undefined;
  const rotacion = Math.max(-8, Math.min(8, dx / 20));
  const temas = sanitizarTemas(actual.temas);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-gray-500">
          {pendientes.length} por revisar · {confirmadas} confirmada(s) · {ignoradas} ignorada(s)
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onUndo} disabled={!puedeUndo}>
            <Undo2 className="w-4 h-4 mr-1" /> Deshacer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onConfirmarRestantes}>
            Confirmar restantes
          </Button>
        </div>
      </div>

      <div
        className="relative touch-pan-y select-none"
        onPointerDown={(e) => pointerDown(e.clientX)}
        onPointerMove={(e) => pointerMove(e.clientX)}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
        <article
          className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3"
          style={{
            transform: `translateX(${dx}px) rotate(${rotacion}deg)`,
            transition: arrastrando ? 'none' : 'transform 150ms ease-out',
          }}
        >
          {dx > 20 && (
            <span className="absolute top-3 right-3 text-xs font-semibold text-green-700">Confirmar</span>
          )}
          {dx < -20 && (
            <span className="absolute top-3 left-3 text-xs font-semibold text-red-700">Ignorar</span>
          )}
          {fotoUrl && (
            <img
              src={fotoUrl}
              alt={foto?.pieDeFoto || 'foto del informe'}
              className="w-full h-40 object-cover rounded-lg pointer-events-none"
              draggable={false}
            />
          )}
          <p className="text-base text-foreground leading-relaxed">{actual.texto}</p>
          {actual.cita_word && (
            <p className="text-xs text-muted-foreground italic">«{actual.cita_word}»</p>
          )}
          <TemasChips
            compacto
            seleccionados={temas}
            onChange={(next) => onTemasChange(actual.clave, next)}
          />
        </article>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-red-700"
          onClick={() => onDecision(actual.clave, 'descartar')}
        >
          <X className="w-4 h-4 mr-1" /> Ignorar
        </Button>
        <Button type="button" variant="outline" onClick={() => onEditar(actual.clave)}>
          <Pencil className="w-4 h-4 mr-1" /> Editar
        </Button>
        <Button type="button" onClick={() => onDecision(actual.clave, 'confirmar')}>
          <Check className="w-4 h-4 mr-1" /> Confirmar
        </Button>
      </div>
      <p className="text-xs text-center text-muted-foreground">
        En el teléfono: desliza a la derecha para confirmar, a la izquierda para ignorar.
        En el computador: flecha derecha / flecha izquierda.
      </p>
    </div>
  );
}
