// ARCHIVO: components/monitoreo/CargaCSV.tsx
// DESCRIPCIÓN: Modal completo para cargar CSV con validación, preview y procesamiento
// Propósito: Interfaz completa para importar datos de monitoreo desde archivos CSV

import { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Upload, Download } from 'lucide-react';
import { CSVUploader } from './components/CSVUploader';
import { parseCSVFile, validarEstructuraCSV, procesarYGuardarCSV } from '../../utils/csvMonitoreo';
import { ValidationResult } from '../../types/monitoreo';
import { getSupabase } from '../../utils/supabase/client';

type Paso = 'seleccionar' | 'validando' | 'preview' | 'cargando' | 'completado';

export function CargaCSV() {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [paso, setPaso] = useState<Paso>('seleccionar');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [validacion, setValidacion] = useState<ValidationResult | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<{ success: boolean; message: string; insertados: number } | null>(null);

  const abrirModal = () => {
    setModalAbierto(true);
    setPaso('seleccionar');
    setArchivo(null);
    setValidacion(null);
    setProgreso(0);
    setResultado(null);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setPaso('seleccionar');
    setArchivo(null);
    setValidacion(null);
    setProgreso(0);
    setResultado(null);
  };

  const handleFileSelect = async (file: File) => {
    console.log('🔵 [CargaCSV] Archivo seleccionado:', file.name, file.size, 'bytes');
    setArchivo(file);
    setPaso('validando');

    try {
      console.log('🔵 [CargaCSV] Iniciando parseCSVFile...');
      const data = await parseCSVFile(file);
      console.log('✅ [CargaCSV] CSV parseado exitosamente. Filas:', data.length);
      console.log('🔍 [CargaCSV] Primera fila:', data[0]);
      
      console.log('🔵 [CargaCSV] Iniciando validación...');
      const validation = validarEstructuraCSV(data);
      console.log('✅ [CargaCSV] Validación completada:', validation);
      
      setValidacion(validation);
      setPaso('preview');
    } catch (error) {
      console.error('❌ [CargaCSV] Error validando CSV:', error);
      console.error('❌ [CargaCSV] Stack trace:', error instanceof Error ? error.stack : 'No stack');
      setValidacion({
        isValid: false,
        errors: [`Error al leer el archivo CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`],
        warnings: [],
        stats: {
          totalRows: 0,
          lotes: 0,
          sublotes: 0,
          plagas: 0,
          fechaInicio: null,
          fechaFin: null
        }
      });
      setPaso('preview');
    }
  };

  const handleCargar = async () => {
    if (!archivo || !validacion?.isValid) {
      console.log('⚠️ [CargaCSV] No se puede cargar. Archivo:', !!archivo, 'Validación válida:', validacion?.isValid);
      return;
    }

    console.log('🔵 [CargaCSV] Iniciando carga...');
    setPaso('cargando');
    setProgreso(0);

    const supabase = getSupabase();
    console.log('🔍 [CargaCSV] Cliente Supabase obtenido');
    
    // Simular progreso
    const interval = setInterval(() => {
      setProgreso(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      console.log('🔵 [CargaCSV] Llamando a procesarYGuardarCSV...');
      const result = await procesarYGuardarCSV(archivo, supabase);
      console.log('✅ [CargaCSV] Resultado de procesarYGuardarCSV:', result);
      
      clearInterval(interval);
      setProgreso(100);
      setResultado(result);
      setPaso('completado');
      
      if (result.success) {
        console.log('✅ [CargaCSV] Carga exitosa. Cerrando en 2 segundos...');
        setTimeout(() => {
          cerrarModal();
        }, 2000);
      }
    } catch (error) {
      clearInterval(interval);
      console.error('❌ [CargaCSV] Error cargando CSV:', error);
      console.error('❌ [CargaCSV] Stack:', error instanceof Error ? error.stack : 'No stack');
      setResultado({
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
        insertados: 0
      });
      setPaso('completado');
    }
  };

  const descargarTemplate = () => {
    // Template con las columnas EXACTAS que el sistema espera
    const headers = [
      'Fecha de monitoreo',
      'Lote',
      'Sublote',
      'Plaga o enfermedad',
      'Arboles Monitoreados',
      'Arboles Afectados',
      'Individuos Encontrados',
      'Monitor',
      'Observaciones'
    ];
    
    // Crear algunas filas de ejemplo
    const ejemplos = [
      ['01/11/2024', 'Piedra Paula', 'PP-01', 'Trips', '50', '5', '12', 'Juan Pérez', 'Afectación leve'],
      ['02/11/2024', 'La Ceiba', 'LC-02', 'Arañita roja', '45', '8', '25', 'María López', ''],
      ['03/11/2024', 'El Roble', 'ER-01', 'Perforador', '60', '3', '7', 'Carlos Ruiz', 'Revisar semanalmente'],
    ];
    
    // Construir el CSV
    const csvContent = [
      headers.join(','),
      ...ejemplos.map(row => row.join(','))
    ].join('\n');
    
    // Descargar
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_monitoreo_escosia.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <div className="flex gap-3">
        {/* BOTÓN DESCARGAR TEMPLATE */}
        <button
          onClick={() => descargarTemplate()}
          className="px-6 py-2 bg-white border-2 border-[#73991C] text-[#73991C] rounded-lg hover:bg-[#73991C]/10 transition-all flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Descargar Template CSV
        </button>
        
        {/* BOTÓN CARGAR CSV */}
        <button
          onClick={abrirModal}
          className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Cargar Monitoreos
        </button>
      </div>

      {modalAbierto && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* HEADER */}
            <div className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-white">Cargar Monitoreos desde CSV</h2>
                <p className="text-white/90 mt-1">
                  {paso === 'seleccionar' && 'Paso 1: Selecciona tu archivo'}
                  {paso === 'validando' && 'Paso 2: Validando estructura...'}
                  {paso === 'preview' && 'Paso 3: Revisa y confirma'}
                  {paso === 'cargando' && 'Paso 4: Cargando datos...'}
                  {paso === 'completado' && '¡Listo!'}
                </p>
              </div>
              <button
                onClick={cerrarModal}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                disabled={paso === 'cargando'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* CONTENIDO */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* PASO 1: SELECCIONAR ARCHIVO */}
              {paso === 'seleccionar' && (
                <CSVUploader onFileSelect={handleFileSelect} />
              )}

              {/* PASO 2: VALIDANDO */}
              {paso === 'validando' && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 border-4 border-[#73991C]/30 border-t-[#73991C] rounded-full animate-spin mb-4" />
                  <p className="text-[#172E08]">Validando estructura del CSV...</p>
                </div>
              )}

              {/* PASO 3: PREVIEW Y VALIDACIÓN */}
              {paso === 'preview' && validacion && (
                <div className="space-y-4">
                  {/* Archivo seleccionado */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-[#4D240F]/70 mb-1">Archivo seleccionado:</p>
                    <p className="text-[#172E08]">{archivo?.name}</p>
                    <p className="text-[#4D240F]/70">
                      {(archivo?.size || 0) / 1024 > 1024 
                        ? `${((archivo?.size || 0) / 1024 / 1024).toFixed(2)} MB`
                        : `${((archivo?.size || 0) / 1024).toFixed(2)} KB`}
                    </p>
                  </div>

                  {/* Resultados de validación */}
                  {validacion.isValid ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-green-900 mb-2">✅ Validación exitosa</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-green-800">✓ {validacion.stats.totalRows} registros encontrados</p>
                              <p className="text-green-800">✓ {validacion.stats.lotes} lotes detectados</p>
                              <p className="text-green-800">✓ {validacion.stats.sublotes} sublotes detectados</p>
                            </div>
                            <div>
                              <p className="text-green-800">✓ {validacion.stats.plagas} plagas únicas</p>
                              <p className="text-green-800">
                                ✓ Desde: {validacion.stats.fechaInicio?.toLocaleDateString('es-CO')}
                              </p>
                              <p className="text-green-800">
                                ✓ Hasta: {validacion.stats.fechaFin?.toLocaleDateString('es-CO')}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-red-900 mb-2">❌ Errores encontrados</h4>
                          <ul className="list-disc list-inside space-y-1 text-red-800">
                            {validacion.errors.map((error, i) => (
                              <li key={i}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Advertencias */}
                  {validacion.warnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-yellow-900 mb-2">⚠️ Advertencias</h4>
                          <ul className="list-disc list-inside space-y-1 text-yellow-800">
                            {validacion.warnings.slice(0, 5).map((warning, i) => (
                              <li key={i}>{warning}</li>
                            ))}
                            {validacion.warnings.length > 5 && (
                              <li className="text-yellow-700">
                                ... y {validacion.warnings.length - 5} más
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PASO 4: CARGANDO */}
              {paso === 'cargando' && (
                <div className="py-12">
                  <div className="max-w-md mx-auto">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[#172E08]">Cargando datos...</p>
                      <p className="text-[#4D240F]/70">{progreso}%</p>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#73991C] to-[#BFD97D] h-full transition-all duration-300"
                        style={{ width: `${progreso}%` }}
                      />
                    </div>
                    <p className="text-[#4D240F]/70 mt-4 text-center">
                      Por favor espera, esto puede tomar unos segundos...
                    </p>
                  </div>
                </div>
              )}

              {/* PASO 5: COMPLETADO */}
              {paso === 'completado' && resultado && (
                <div className="py-12">
                  {resultado.success ? (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                      </div>
                      <h3 className="text-[#172E08] mb-2">
                        ¡Carga completada!
                      </h3>
                      <p className="text-[#4D240F]/70 mb-4">
                        {resultado.insertados} registros cargados exitosamente
                      </p>
                      <p className="text-[#4D240F]/70">
                        Redirigiendo al dashboard...
                      </p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-10 h-10 text-red-600" />
                      </div>
                      <h3 className="text-[#172E08] mb-2">
                        Error en la carga
                      </h3>
                      <p className="text-[#4D240F]/70">
                        {resultado.message}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* FOOTER */}
            <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-between">
              <button
                onClick={cerrarModal}
                disabled={paso === 'cargando'}
                className="px-4 py-2 text-[#4D240F] hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>

              {paso === 'preview' && validacion?.isValid && (
                <button
                  onClick={handleCargar}
                  className="px-6 py-2 bg-gradient-to-r from-[#73991C] to-[#BFD97D] text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Cargar {validacion.stats.totalRows} registros
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}