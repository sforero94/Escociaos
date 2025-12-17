import { useState, useRef, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Upload, X, FileText, Image as ImageIcon, Loader2, Eye } from 'lucide-react';

interface FacturaUploaderProps {
  /**
   * Tipo de factura: 'compra' para gastos o 'venta' para ingresos
   */
  tipo: 'compra' | 'venta';
  /**
   * Path actual de la factura en Storage (si existe)
   */
  currentUrl?: string;
  /**
   * Callback cuando se sube exitosamente un archivo
   */
  onUploadSuccess: (path: string) => void;
  /**
   * Callback cuando se elimina un archivo
   */
  onRemove: () => void;
  /**
   * Deshabilitar el componente
   */
  disabled?: boolean;
}

// Helper function to check if a path is an image
const isImage = (path: string) => {
  return path.match(/\.(jpeg|jpg|gif|png)$/i);
};

export function FacturaUploader({
  tipo,
  currentUrl,
  onUploadSuccess,
  onRemove,
  disabled = false,
}: FacturaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folder = tipo === 'compra' ? 'facturas_compra' : 'facturas_venta';

  // Load preview for existing files
  useEffect(() => {
    const loadPreview = async () => {
      if (currentUrl && isImage(currentUrl)) {
        try {
          const supabase = getSupabase();
          const { data } = await supabase.storage
            .from('facturas')
            .createSignedUrl(currentUrl, 60 * 60); // 1 hour

          if (data?.signedUrl) {
            setPreviewUrl(data.signedUrl);
          }
        } catch (error) {
        }
      }
    };

    loadPreview();
  }, [currentUrl]);

  const handleFileSelect = async (event: { target: { files: FileList | null; value: string } }) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Solo se permiten archivos de imagen (JPG, PNG, GIF) o PDF');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('El archivo es muy grande. El tamaño máximo es 5MB');
      return;
    }

    try {
      setUploading(true);

      // Create a unique filename with timestamp
      const timestamp = Date.now();
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${timestamp}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage (private bucket)
      const supabase = getSupabase();
      const { data, error } = await supabase.storage
        .from('facturas')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) throw error;

      // Store only the path (not a public URL)
      // We'll generate signed URLs on-demand when viewing
      const storagePath = data.path;

      // For preview, generate a temporary signed URL for images
      if (file.type.startsWith('image/')) {
        const { data: signedUrlData } = await supabase.storage
          .from('facturas')
          .createSignedUrl(storagePath, 60 * 60); // 1 hour expiry for preview

        if (signedUrlData) {
          setPreviewUrl(signedUrlData.signedUrl);
        }
      } else {
        setPreviewUrl(null);
      }

      // Call success callback with storage path (not URL)
      onUploadSuccess(storagePath);

      alert('Factura subida exitosamente');
    } catch (error: any) {
      alert('Error al subir la factura: ' + error.message);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    onRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleViewFile = async () => {
    if (!currentUrl) return;

    try {
      const supabase = getSupabase();

      // Generate a signed URL valid for 1 hour
      const { data, error } = await supabase.storage
        .from('facturas')
        .createSignedUrl(currentUrl, 60 * 60); // 1 hour

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error: any) {
      alert('Error al abrir la factura: ' + error.message);
    }
  };

  const hasFile = !!currentUrl;

  return (
    <div className="space-y-2">
      <Label>Factura {tipo === 'compra' ? 'de Compra' : 'de Venta'} (Opcional)</Label>

      {hasFile ? (
        <div className="border rounded-lg p-4 space-y-3">
          {/* Preview for images */}
          {currentUrl && isImage(currentUrl) && previewUrl && (
            <div className="flex justify-center">
              <img
                src={previewUrl}
                alt="Preview de factura"
                className="max-h-48 rounded border object-contain"
              />
            </div>
          )}

          {/* File info */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {currentUrl && isImage(currentUrl) ? (
                <ImageIcon className="w-4 h-4 text-blue-500" />
              ) : (
                <FileText className="w-4 h-4 text-red-500" />
              )}
              <span className="text-gray-600">
                {currentUrl && isImage(currentUrl) ? 'Imagen de factura' : 'PDF de factura'}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleViewFile}
                disabled={disabled}
              >
                <Eye className="w-4 h-4 mr-1" />
                Ver
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleRemove}
                disabled={disabled}
              >
                <X className="w-4 h-4 mr-1" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="hidden"
            id="factura-upload"
          />
          <label
            htmlFor="factura-upload"
            className={`cursor-pointer ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex flex-col items-center gap-2">
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  <p className="text-sm text-gray-500">Subiendo factura...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    Haz clic para subir una factura
                  </p>
                  <p className="text-xs text-gray-400">
                    Soporta: JPG, PNG, GIF, PDF (Máx. 5MB)
                  </p>
                </>
              )}
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
