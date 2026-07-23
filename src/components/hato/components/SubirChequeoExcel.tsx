// ARCHIVO: components/hato/components/SubirChequeoExcel.tsx
// DESCRIPCIÓN: Diálogo B0/V10 -- sube el .xlsx del chequeo, lo envía a
// `POST /hato/chequeo/preview` y muestra el diff (`ChequeoDiffReview`) para
// revisión, y expone el botón "Aprobar" que llama a
// `POST /hato/chequeo/commit` (revalida el diff contra el estado fresco del
// hato y escribe en una sola transacción -- ver
// `src/supabase/functions/server/hato-chequeo-commit.ts`). Sigue el patrón
// `Dialog + DialogContent size + DialogBody` obligatorio (CLAUDE.md, Dialog
// Size System) y el patrón de subida de `ImportarProductosCSV.tsx` (drag &
// drop + selección manual).

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSubirChequeoExcel } from '../hooks/useSubirChequeoExcel';
import { ChequeoDiffReview } from './ChequeoDiffReview';

export function SubirChequeoExcel({
  open,
  onOpenChange,
  onCompletado,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompletado?: () => void;
}) {
  const {
    subir,
    comprometer,
    limpiar,
    loading,
    error,
    resultado,
    comprometiendo,
    errorCommit,
    filasRechazadas,
    commitResultado,
  } = useSubirChequeoExcel();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [veterinario, setVeterinario] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArchivo(null);
      setVeterinario('');
      limpiar();
      onCompletado?.();
    }
    onOpenChange(nextOpen);
  };

  const filasAprobables = resultado
    ? resultado.diffChequeos.filas.filter((f) => f.clasificacion === 'sin_cambio' || f.clasificacion === 'cambio').length
    : 0;

  const handleAprobar = async () => {
    try {
      await comprometer(veterinario.trim() || undefined);
    } catch {
      // El error/las filas rechazadas ya quedan en el hook (`errorCommit`/
      // `filasRechazadas`), se muestran abajo.
    }
  };

  const seleccionarArchivo = (file: File) => {
    if (!/\.xlsx?$/i.test(file.name)) return;
    setArchivo(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) seleccionarArchivo(file);
  };

  const handleSubir = async () => {
    if (!archivo) return;
    try {
      await subir(archivo);
    } catch {
      // El error ya queda en el hook (`error`), se muestra abajo.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size={resultado ? 'xl' : 'md'}>
        <DialogHeader>
          <DialogTitle>Subir chequeo veterinario</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!resultado && (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                dragActive ? 'border-primary bg-green-50' : 'border-gray-300'
              }`}
            >
              {!archivo ? (
                <>
                  <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-600 mb-3">Arrastra el .xlsx del chequeo aquí o selecciónalo</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) seleccionarArchivo(file);
                    }}
                  />
                  <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                    Seleccionar archivo
                  </Button>
                </>
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-900">{archivo.name}</p>
                    <p className="text-xs text-gray-500">{(archivo.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setArchivo(null)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Quitar archivo"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {commitResultado && (
            <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Chequeo guardado — {commitResultado.filasEscritas} fila(s), {commitResultado.eventosEscritos} evento(s)
                {commitResultado.torosCreados > 0 && ` (${commitResultado.torosCreados} toro(s) nuevo(s) en el catálogo)`}.
              </p>
            </div>
          )}

          {errorCommit && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>{errorCommit}</p>
              </div>
              {filasRechazadas && filasRechazadas.length > 0 && (
                <ul className="mt-2 ml-6 space-y-1 text-xs list-disc">
                  {filasRechazadas.map((f) => (
                    <li key={f.fila}>
                      {f.numero != null ? `#${f.numero}` : `fila ${f.fila}`}: {f.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {resultado && !commitResultado && filasAprobables > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="veterinario-chequeo">Veterinario (opcional)</Label>
              <Input
                id="veterinario-chequeo"
                value={veterinario}
                onChange={(e) => setVeterinario(e.target.value)}
                placeholder="Nombre del veterinario"
                disabled={comprometiendo}
              />
            </div>
          )}

          {resultado && <ChequeoDiffReview resultado={resultado} />}
        </DialogBody>
        <DialogFooter>
          {!resultado ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSubir} disabled={!archivo || loading}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Procesando...' : 'Subir y revisar'}
              </Button>
            </>
          ) : commitResultado ? (
            <Button type="button" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={comprometiendo}>
                Cerrar
              </Button>
              <Button type="button" onClick={handleAprobar} disabled={filasAprobables === 0 || comprometiendo}>
                {comprometiendo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {comprometiendo ? 'Aprobando...' : `Aprobar (${filasAprobables})`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
