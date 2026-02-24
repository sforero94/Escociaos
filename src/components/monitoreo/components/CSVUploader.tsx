// ARCHIVO: components/monitoreo/components/CSVUploader.tsx
// DESCRIPCIÓN: Componente drag & drop para subir archivos CSV
// Propósito: Interfaz de usuario para cargar archivos CSV de monitoreo

import { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface CSVUploaderProps {
  onFileSelect: (file: File) => void;
  isProcessing?: boolean;
}

export function CSVUploader({ onFileSelect, isProcessing = false }: CSVUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        onFileSelect(file);
      } else {
        setError('Por favor selecciona un archivo CSV');
      }
    }
  }, [onFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        onFileSelect(file);
      } else {
        setError('Por favor selecciona un archivo CSV');
      }
    }
  };

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDrag}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center transition-all
          ${isDragOver ? 'border-primary bg-primary/5' : 'border-gray-300 bg-gray-50'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-primary hover:bg-primary/5'}
        `}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          disabled={isProcessing}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />

        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : (
            <Upload className="w-16 h-16 text-primary" />
          )}

          <div>
            <p className="text-foreground mb-2">
              {isProcessing ? 'Procesando archivo...' : 'Arrastra tu CSV aquí'}
            </p>
            <p className="text-brand-brown/70">
              o haz click para seleccionar
            </p>
          </div>

          <div className="flex items-center gap-2 text-brand-brown/60">
            <FileText className="w-4 h-4" />
            <span>Formato: Planilla_PLAGAS_Y_ENFERMEDADES.csv</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
