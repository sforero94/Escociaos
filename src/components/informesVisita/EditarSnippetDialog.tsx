import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ETIQUETAS_TIPO_SNIPPET,
  TIPOS_SNIPPET,
  type SnippetPropuesto,
} from '@/types/informesVisita';

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
  const [tipo, setTipo] = useState('');
  const [insumo, setInsumo] = useState('');
  const [plaga, setPlaga] = useState('');

  useEffect(() => {
    if (!snippet) return;
    setTexto(snippet.texto);
    setTipo(snippet.tipo ?? '');
    setInsumo(snippet.insumo ?? '');
    setPlaga(snippet.plaga ?? '');
  }, [snippet]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) return;
    onGuardar({
      texto: t,
      tipo: tipo || null,
      insumo: insumo.trim() || null,
      plaga: plaga.trim() || null,
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
              <Label htmlFor="snip-tipo">Tipo (opcional)</Label>
              <select
                id="snip-tipo"
                className="border-input bg-input-background h-11 w-full rounded-md border px-3 text-sm"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="">Sin tipo</option>
                {TIPOS_SNIPPET.map((t) => (
                  <option key={t} value={t}>{ETIQUETAS_TIPO_SNIPPET[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="snip-insumo">Insumo (opcional)</Label>
              <Input id="snip-insumo" value={insumo} onChange={(e) => setInsumo(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="snip-plaga">Plaga (opcional)</Label>
              <Input id="snip-plaga" value={plaga} onChange={(e) => setPlaga(e.target.value)} />
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

export function chipsDeSnippet(s: Pick<SnippetPropuesto, 'tipo' | 'insumo' | 'plaga'>): string[] {
  const chips: string[] = [];
  if (s.tipo && s.tipo in ETIQUETAS_TIPO_SNIPPET) {
    chips.push(ETIQUETAS_TIPO_SNIPPET[s.tipo as keyof typeof ETIQUETAS_TIPO_SNIPPET]);
  } else if (s.tipo) {
    chips.push(s.tipo);
  }
  if (s.insumo) chips.push(s.insumo);
  if (s.plaga) chips.push(s.plaga);
  return chips;
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
