import { Download, Upload } from 'lucide-react';
import { Button } from '../ui/button';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { useState } from 'react';

export function CargaMasiva() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleDownloadTemplate = () => {
    // TODO: Implementar descarga de plantilla
    console.log('Descargando plantilla...');
    // Aquí se implementará la lógica para descargar un archivo CSV/Excel con la estructura correcta
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      // TODO: Implementar carga de archivo
      console.log('Cargando archivo:', selectedFile.name);
      // Aquí se implementará la lógica para procesar el archivo CSV/Excel
      
      // Simulación de carga
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      alert('Archivo cargado exitosamente');
      setSelectedFile(null);
    } catch (error) {
      console.error('Error cargando archivo:', error);
      alert('Error al cargar el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <MonitoreoSubNav />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[#172E08] mb-2">Carga Masiva de Monitoreos</h1>
        <p className="text-[#4D240F]/70">
          Descarga la plantilla, complétala con tus datos y cárgala para importar múltiples monitoreos
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Descargar Plantilla */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-8 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_8px_32px_rgba(115,153,28,0.15)] transition-all duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-[#73991C] to-[#BFD97D] rounded-2xl flex items-center justify-center shadow-lg shadow-[#73991C]/20 mb-6">
              <Download className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-xl text-[#172E08] mb-3">Descargar Plantilla</h2>
            
            <p className="text-sm text-[#4D240F]/70 mb-6">
              Descarga la plantilla en formato Excel con la estructura correcta para importar tus monitoreos
            </p>

            <Button
              onClick={handleDownloadTemplate}
              className="w-full bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar Plantilla
            </Button>

            <div className="mt-6 pt-6 border-t border-[#73991C]/10 w-full">
              <p className="text-xs text-[#4D240F]/60">
                La plantilla incluye todos los campos necesarios con ejemplos y validaciones
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Cargar Monitoreos */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#73991C]/10 p-8 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_8px_32px_rgba(115,153,28,0.15)] transition-all duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-[#BFD97D] to-[#73991C] rounded-2xl flex items-center justify-center shadow-lg shadow-[#73991C]/20 mb-6">
              <Upload className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-xl text-[#172E08] mb-3">Cargar Monitoreos</h2>
            
            <p className="text-sm text-[#4D240F]/70 mb-6">
              Selecciona el archivo completado para importar los registros de monitoreo al sistema
            </p>

            {/* File Input */}
            <div className="w-full mb-4">
              <label className="block">
                <div className="cursor-pointer border-2 border-dashed border-[#73991C]/30 rounded-xl p-6 hover:border-[#73991C] hover:bg-[#73991C]/5 transition-all duration-200">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="text-center">
                    {selectedFile ? (
                      <>
                        <Upload className="w-8 h-8 text-[#73991C] mx-auto mb-2" />
                        <p className="text-sm text-[#172E08]">{selectedFile.name}</p>
                        <p className="text-xs text-[#4D240F]/60 mt-1">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-[#4D240F]/40 mx-auto mb-2" />
                        <p className="text-sm text-[#4D240F]/70">
                          Haz clic para seleccionar un archivo
                        </p>
                        <p className="text-xs text-[#4D240F]/50 mt-1">
                          CSV, XLSX o XLS
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="w-full bg-[#73991C] hover:bg-[#5f7d17] text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Cargando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Cargar Archivo
                </>
              )}
            </Button>

            <div className="mt-6 pt-6 border-t border-[#73991C]/10 w-full">
              <p className="text-xs text-[#4D240F]/60">
                El sistema validará los datos antes de importarlos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Información Adicional */}
      <div className="bg-gradient-to-r from-[#73991C]/10 to-[#BFD97D]/10 rounded-2xl border border-[#73991C]/20 p-6">
        <h3 className="text-sm text-[#172E08] mb-3">📋 Instrucciones</h3>
        <ol className="space-y-2 text-sm text-[#4D240F]/70">
          <li className="flex gap-2">
            <span className="text-[#73991C] font-medium">1.</span>
            Descarga la plantilla haciendo clic en el botón "Descargar Plantilla"
          </li>
          <li className="flex gap-2">
            <span className="text-[#73991C] font-medium">2.</span>
            Completa todos los campos requeridos en la plantilla
          </li>
          <li className="flex gap-2">
            <span className="text-[#73991C] font-medium">3.</span>
            Guarda el archivo en formato CSV o Excel
          </li>
          <li className="flex gap-2">
            <span className="text-[#73991C] font-medium">4.</span>
            Selecciona el archivo y haz clic en "Cargar Archivo"
          </li>
          <li className="flex gap-2">
            <span className="text-[#73991C] font-medium">5.</span>
            El sistema validará los datos y te informará de cualquier error antes de importar
          </li>
        </ol>
      </div>
    </div>
  );
}
