import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type SnippetPropuesto,
} from '@/types/informesVisita';
import { sanitizarTemas, type TemaInforme } from '@/utils/informesVisita/temas';
import { TemasChips } from './TemasChips';

export function EditarSnippetDialog({
  abierto,
  snippet,
  onCerrar,
  onGuardar,
}: {
  abierto: boolean;
  snippet: SnippetPropuesto | null;
  onCerrar: () => void;
  onGuardar: (edicion: Partial<Omit<SnippetPropuesto, 'clave' | 'origen'>>) => void;
}) {
  const [texto, setTexto] = useState('');
  const [temas, setTemas] = useState<TemaInforme[]>([]);

  useEffect(() => {
    if (!snippet) return;
    setTexto(snippet.texto);
    setTemas(sanitizarTemas(snippet.temas));
  }, [snippet]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    onGuardar({
      texto: t,
      temas,
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v) onCerrar(); }}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          <DialogHeader>
            <DialogTitle>Editar idea</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="snip-texto">Idea</Label>
              <Textarea
                id="snip-texto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={6}
              />
            </div>
            {snippet?.cita_word && (
              <p className="text-xs text-muted-foreground">
                Cita del Word: «{snippet.cita_word}»
              </p>
            )}
            <div>
              <Label>Temas</Label>
              <TemasChips compacto seleccionados={temas} onChange={setTemas} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" disabled={!texto.trim()}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function useFotoUrls(fotos: Array<{ bytes: Uint8Array; mime: string }>): string[] {
  const key = useMemo(
    () => fotos.map((f) => `${f.mime}:${f.bytes.byteLength}`).join('|'),
    [fotos],
  );
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = fotos.map((f) => URL.createObjectURL(new Blob([new Uint8Array(f.bytes)], { type: f.mime })));
    setUrls(next);
    return () => {
      next.forEach((u) => URL.revokeObjectURL(u));
    };
    // key captures identity; fotos is read inside
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
