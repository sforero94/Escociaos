import { useAuth } from '@/contexts/AuthContext';
import { uploadInvoice,resolveInvoice,pendingInvoice,invalidateInvoiceTarget,type InvoiceClient } from '@/utils/invoiceUpload';
import { FACTURA_ACCEPT, validarArchivoFactura,normalizarRutaFactura } from '@/utils/archivoFactura';
import { useState, useRef, useLayoutEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Upload, X, FileText, Image as ImageIcon, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';

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
  targetIdentity?: string;
  open?: boolean;
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
  targetIdentity = 'invoice-draft',
  open = true,
}: FacturaUploaderProps) {
  const {user}=useAuth();const owner=user?.id??'';
  const scope=`${tipo}:${targetIdentity}`;
  const target=useRef('');
  const [pending,setPending]=useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const generation = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invalidate every request on path changes, including A → B → A and unmount.
  useLayoutEffect(() => {
    const operationGeneration=generation;
    const request = ++operationGeneration.current;
    const targetKey=crypto.randomUUID();target.current=targetKey;
    try{setPending(Boolean(owner&&pendingInvoice(owner,scope)));}catch{setPending(true);}
    setPreview(null);
    setUploading(false);
    if (open && owner && currentUrl && isImage(currentUrl)) {
      const path = currentUrl;
      void (async () => {
        try {
          const { data, error } = await getSupabase().storage
            .from('facturas').createSignedUrl(normalizarRutaFactura(path), 60 * 60);
          if (request === generation.current && !error && data?.signedUrl) {
            setPreview({ path, url: data.signedUrl });
          }
        } catch {
          // A failed preview must never restore an older object's URL.
        }
      })();
    }
    return () => {
      ++operationGeneration.current;
      if(owner)void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,targetKey).catch(()=>undefined);
    };
  }, [currentUrl,owner,scope,open]);

  const handleFileSelect = async (event: { target: { files: FileList | null; value: string } }) => {
    const file = event.target.files?.[0];
    if (!file || disabled || uploading || !open || !owner) return;

    const validationError = validarArchivoFactura(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const request = generation.current;

    try {
      setUploading(true);

      const receipt=await uploadInvoice(getSupabase() as unknown as InvoiceClient,owner,scope,target.current,tipo,file,()=>request===generation.current);
      const storagePath=receipt.path;
      if (request !== generation.current) return;

      // Call success callback with storage path (not URL)
      setPending(false);
      event.target.value='';
      if(fileInputRef.current)fileInputRef.current.value='';
      onUploadSuccess(storagePath);

      toast.success('Factura subida exitosamente');
    } catch (error: unknown) {
      if (request === generation.current) {
        try{setPending(Boolean(pendingInvoice(owner,scope)));}catch{setPending(true);}
        toast.error('Error al subir la factura: ' + (error instanceof Error ? error.message : 'Error desconocido'));
      }
    } finally {
      if (request === generation.current) setUploading(false);
      // Preserve the selected file after refusal or uncertain transport.
    }
  };

  const handleRemove = () => {
    ++generation.current;
    setPreview(null);
    if(owner)void invalidateInvoiceTarget(getSupabase() as unknown as InvoiceClient,owner,target.current).catch(()=>undefined);
    onRemove();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleViewFile = async () => {
    if (!currentUrl || !open || !owner) return;
    const request = generation.current;
    const path = currentUrl;

    try {
      const supabase = getSupabase();

      // Generate a signed URL valid for 1 hour
      const { data, error } = await supabase.storage
        .from('facturas')
        .createSignedUrl(normalizarRutaFactura(path), 60 * 60, isImage(path)?undefined:{download:'factura.pdf'}); // Hosted disposition/header enforcement remains a release gate.

      if (error) throw error;
      if (request === generation.current && data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error: unknown) {
      if (request === generation.current) toast.error('Error al abrir la factura: ' + (error instanceof Error ? error.message : 'Error desconocido'));
    }
  };

  const hasFile = !!currentUrl;

  return (
    <div className="space-y-2">
      {pending && <Button type="button" disabled={uploading||disabled||!open} onClick={async()=>{
        const request=generation.current;
        try{const r=await resolveInvoice(getSupabase() as unknown as InvoiceClient,owner,scope,()=>request===generation.current);
          if(request!==generation.current)return;
          if(r){setPending(false);toast.success('Subida anterior verificada; seleccione la factura para el destino actual');}
          else if(!pendingInvoice(owner,scope)){setPending(false);toast.success('Factura anterior en cuarentena; puede seleccionar otra factura.');}
          else toast.error('Factura pendiente. Conserve el intento.');
        }catch(error:unknown){if(request===generation.current)toast.error(error instanceof Error?error.message:'Factura no verificable');}
      }}>Verificar factura pendiente</Button>}
      <Label>Factura {tipo === 'compra' ? 'de Compra' : 'de Venta'} (Opcional)</Label>

      {hasFile ? (
        <div className="border rounded-lg p-4 space-y-3">
          {/* Preview for images */}
          {currentUrl && isImage(currentUrl) && preview?.path === currentUrl && (
            <div className="flex justify-center">
              <img
                src={preview.url}
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
            accept={FACTURA_ACCEPT}
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
