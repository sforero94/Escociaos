// ARCHIVO: components/hato/components/SubirChequeoExcel.tsx
// DESCRIPCIÓN: Diálogo B0/V10 -- sube el .xlsx del chequeo, lo envía a
// `POST /hato/chequeo/preview` y muestra el diff (`ChequeoDiffReview`) para
// revisión. El endpoint NUNCA comete -- ver esa nota en el componente hijo.
// Sigue el patrón `Dialog + DialogContent size + DialogBody` obligatorio
// (CLAUDE.md, Dialog Size System) y el patrón de subida de
// `ImportarProductosCSV.tsx` (drag & drop + selección manual).

import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const { subir, limpiar, loading, error, resultado } = useSubirChequeoExcel();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setArchivo(null);
      limpiar();
      onCompletado?.();
    }
    onOpenChange(nextOpen);
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
          ) : (
            <Button type="button" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
