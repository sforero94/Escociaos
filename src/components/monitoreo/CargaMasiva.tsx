import { Download, Upload, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { MonitoreoSubNav } from './MonitoreoSubNav';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { getSupabase } from '../../utils/supabase/client';

interface ResultadoCarga {
  exito: boolean;
  mensaje: string;
  registrosInsertados?: number;
  errores?: string[];
}

export function CargaMasiva() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);

  const handleDownloadTemplate = () => {
    // Crear datos de ejemplo para la plantilla
    const data = [
      {
        'Fecha (YYYY-MM-DD)': '2024-01-15',
        'Lote': 'Lote 1',
        'Sublote': 'Sublote A',
        'Plaga/Enfermedad': 'Mosca de la fruta',
        'Árboles Monitoreados': 35,
        'Árboles Afectados': 5,
        'Individuos Encontrados': 12,
        'Monitor': 'Clara, Daniela',
        'Observaciones': 'Presencia moderada en zona norte'
      },
      {
        'Fecha (YYYY-MM-DD)': '2024-01-15',
        'Lote': 'Lote 1',
        'Sublote': 'Sublote B',
        'Plaga/Enfermedad': 'Trips',
        'Árboles Monitoreados': 35,
        'Árboles Afectados': 3,
        'Individuos Encontrados': 8,
        'Monitor': 'Clara, Daniela',
        'Observaciones': ''
      }
    ];

    // Crear un libro de trabajo
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monitoreos');

    // Ajustar el ancho de las columnas
    const columnWidths = [
      { wch: 18 }, // Fecha
      { wch: 15 }, // Lote
      { wch: 15 }, // Sublote
      { wch: 25 }, // Plaga/Enfermedad
      { wch: 20 }, // Árboles Monitoreados
      { wch: 18 }, // Árboles Afectados
      { wch: 22 }, // Individuos Encontrados
      { wch: 20 }, // Monitor
      { wch: 35 }  // Observaciones
    ];
    worksheet['!cols'] = columnWidths;

    // Generar el archivo y descargarlo
    const fecha = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `plantilla_monitoreos_${fecha}.xlsx`);
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
    setResultado(null);

    try {
      // 1. Leer el archivo
      const datos = await leerArchivo(selectedFile);

      // 2. Procesar y validar los datos
      const supabase = getSupabase();
      const errores: string[] = [];
      const registrosParaInsertar: any[] = [];

      // Cargar catálogos necesarios
      const { data: lotes } = await supabase.from('lotes').select('id, nombre') as { data: Array<{id: string, nombre: string}> | null };
      const { data: plagas } = await supabase.from('plagas_enfermedades_catalogo').select('id, nombre') as { data: Array<{id: string, nombre: string}> | null };

      if (!lotes || !plagas) {
        throw new Error('No se pudieron cargar los catálogos de lotes y plagas');
      }

      // Procesar cada fila
      for (let i = 0; i < datos.length; i++) {
        const fila = datos[i];
        const numFila = i + 2; // +2 porque Excel empieza en 1 y hay header

        try {
          // Validar y normalizar fecha
          const fechaRaw = fila['Fecha (YYYY-MM-DD)'];
          const fecha = normalizarFecha(fechaRaw);

          if (!fecha) {
            errores.push(`Fila ${numFila}: Fecha inválida "${fechaRaw}"`);
            continue;
          }

          // Buscar lote y sublote
          const nombreLote = fila['Lote']?.trim();
          const lote = lotes.find(l => l.nombre.toLowerCase() === nombreLote?.toLowerCase());

          if (!lote) {
            errores.push(`Fila ${numFila}: Lote "${nombreLote}" no encontrado`);
            continue;
          }

          // Obtener sublotes del lote
          const { data: sublotes } = await supabase
            .from('sublotes')
            .select('id, nombre')
            .eq('lote_id', lote.id) as { data: Array<{id: string, nombre: string}> | null };

          const nombreSublote = fila['Sublote']?.trim();
          const sublote = sublotes?.find(s => s.nombre.toLowerCase() === nombreSublote?.toLowerCase());

          if (!sublote) {
            errores.push(`Fila ${numFila}: Sublote "${nombreSublote}" no encontrado en ${nombreLote}`);
            continue;
          }

          // Buscar plaga
          const nombrePlaga = fila['Plaga/Enfermedad']?.trim();
          const plaga = plagas.find(p => p.nombre.toLowerCase() === nombrePlaga?.toLowerCase());

          if (!plaga) {
            errores.push(`Fila ${numFila}: Plaga/Enfermedad "${nombrePlaga}" no encontrada`);
            continue;
          }

          // Validar números
          const arbolesMonitoreados = parseInt(fila['Árboles Monitoreados']);
          const arbolesAfectados = parseInt(fila['Árboles Afectados']);
          const individuosEncontrados = parseInt(fila['Individuos Encontrados']);

          if (isNaN(arbolesMonitoreados) || arbolesMonitoreados <= 0) {
            errores.push(`Fila ${numFila}: Árboles Monitoreados inválido`);
            continue;
          }

          if (isNaN(arbolesAfectados) || arbolesAfectados < 0) {
            errores.push(`Fila ${numFila}: Árboles Afectados inválido`);
            continue;
          }

          if (isNaN(individuosEncontrados) || individuosEncontrados < 0) {
            errores.push(`Fila ${numFila}: Individuos Encontrados inválido`);
            continue;
          }

          if (arbolesAfectados > arbolesMonitoreados) {
            errores.push(`Fila ${numFila}: Árboles Afectados no puede ser mayor que Monitoreados`);
            continue;
          }

          // Calcular incidencia para determinar gravedad
          const incidencia = (arbolesAfectados / arbolesMonitoreados) * 100;

          // Determinar gravedad basado en incidencia
          let gravedadTexto: 'Baja' | 'Media' | 'Alta' = 'Baja';
          let gravedadNumerica: 1 | 2 | 3 = 1;

          if (incidencia >= 30) {
            gravedadTexto = 'Alta';
            gravedadNumerica = 3;
          } else if (incidencia >= 15) {
            gravedadTexto = 'Media';
            gravedadNumerica = 2;
          }

          // Preparar registro para insertar
          // NOTA: incidencia y severidad son calculadas automáticamente por la BD
          registrosParaInsertar.push({
            fecha_monitoreo: fecha,
            lote_id: lote.id,
            sublote_id: sublote.id,
            plaga_enfermedad_id: plaga.id,
            arboles_monitoreados: arbolesMonitoreados,
            arboles_afectados: arbolesAfectados,
            individuos_encontrados: individuosEncontrados,
            gravedad_texto: gravedadTexto,
            gravedad_numerica: gravedadNumerica,
            monitor: fila['Monitor']?.trim() || null,
            observaciones: fila['Observaciones']?.trim() || null
          });

        } catch (error: any) {
          errores.push(`Fila ${numFila}: Error al procesar - ${error.message}`);
        }
      }

      // 3. Insertar registros válidos
      if (registrosParaInsertar.length > 0) {
        const { error: insertError } = await supabase
          .from('monitoreos')
          .insert(registrosParaInsertar as any);

        if (insertError) {
          throw new Error(`Error al insertar en BD: ${insertError.message}`);
        }
      }

      // 4. Mostrar resultado
      setResultado({
        exito: registrosParaInsertar.length > 0,
        mensaje: registrosParaInsertar.length > 0
          ? `Se insertaron exitosamente ${registrosParaInsertar.length} de ${datos.length} registros`
          : 'No se pudieron insertar registros',
        registrosInsertados: registrosParaInsertar.length,
        errores: errores.length > 0 ? errores : undefined
      });

      if (registrosParaInsertar.length > 0) {
        setSelectedFile(null);
      }

    } catch (error: any) {
      setResultado({
        exito: false,
        mensaje: `Error al procesar el archivo: ${error.message}`,
        errores: [error.message]
      });
    } finally {
      setUploading(false);
    }
  };

  const leerArchivo = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsBinaryString(file);
    });
  };

  const normalizarFecha = (fecha: any): string | null => {
    // Si es un número, es un serial date de Excel
    if (typeof fecha === 'number') {
      // Excel almacena fechas como días desde 1/1/1900
      // Convertir a fecha JavaScript (días desde 1/1/1970)
      const fechaJS = new Date((fecha - 25569) * 86400 * 1000);

      if (isNaN(fechaJS.getTime())) {
        return null;
      }

      // Formatear como YYYY-MM-DD
      const year = fechaJS.getFullYear();
      const month = String(fechaJS.getMonth() + 1).padStart(2, '0');
      const day = String(fechaJS.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Si es string, validar formato YYYY-MM-DD
    if (typeof fecha === 'string') {
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(fecha)) {
        return null;
      }

      const date = new Date(fecha);
      if (isNaN(date.getTime())) {
        return null;
      }

      return fecha;
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <MonitoreoSubNav />

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-foreground mb-2">Carga Masiva de Monitoreos</h1>
        <p className="text-brand-brown/70">
          Descarga la plantilla, complétala con tus datos y cárgala para importar múltiples monitoreos
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Descargar Plantilla */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-8 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_8px_32px_rgba(115,153,28,0.15)] transition-all duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
              <Download className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-xl text-foreground mb-3">Descargar Plantilla</h2>
            
            <p className="text-sm text-brand-brown/70 mb-6">
              Descarga la plantilla en formato Excel con la estructura correcta para importar tus monitoreos
            </p>

            <Button
              onClick={handleDownloadTemplate}
              className="w-full bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200"
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar Plantilla
            </Button>

            <div className="mt-6 pt-6 border-t border-primary/10 w-full">
              <p className="text-xs text-brand-brown/60">
                La plantilla incluye todos los campos necesarios con ejemplos y validaciones
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Cargar Monitoreos */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-8 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_8px_32px_rgba(115,153,28,0.15)] transition-all duration-300">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-secondary to-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 mb-6">
              <Upload className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-xl text-foreground mb-3">Cargar Monitoreos</h2>
            
            <p className="text-sm text-brand-brown/70 mb-6">
              Selecciona el archivo completado para importar los registros de monitoreo al sistema
            </p>

            {/* File Input */}
            <div className="w-full mb-4">
              <label className="block">
                <div className="cursor-pointer border-2 border-dashed border-primary/30 rounded-xl p-6 hover:border-primary hover:bg-primary/5 transition-all duration-200">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="text-center">
                    {selectedFile ? (
                      <>
                        <Upload className="w-8 h-8 text-primary mx-auto mb-2" />
                        <p className="text-sm text-foreground">{selectedFile.name}</p>
                        <p className="text-xs text-brand-brown/60 mt-1">
                          {(selectedFile.size / 1024).toFixed(2)} KB
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-brand-brown/40 mx-auto mb-2" />
                        <p className="text-sm text-brand-brown/70">
                          Haz clic para seleccionar un archivo
                        </p>
                        <p className="text-xs text-brand-brown/50 mt-1">
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
              className="w-full bg-primary hover:bg-primary-dark text-white rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

            <div className="mt-6 pt-6 border-t border-primary/10 w-full">
              <p className="text-xs text-brand-brown/60">
                El sistema validará los datos antes de importarlos
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Result Display */}
      {resultado && (
        <div className={`p-6 rounded-2xl border ${resultado.exito ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} shadow-[0_4px_24px_rgba(0,0,0,0.05)]`}>
          <div className="flex items-start gap-3">
            {resultado.exito ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3 className={`font-medium mb-2 ${resultado.exito ? 'text-green-800' : 'text-red-800'}`}>
                {resultado.mensaje}
              </h3>
              {resultado.errores && resultado.errores.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Errores encontrados:</p>
                  <ul className="space-y-1 text-sm text-gray-600 max-h-60 overflow-y-auto">
                    {resultado.errores.map((error: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Información Adicional */}
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl border border-primary/20 p-6">
        <h3 className="text-sm text-foreground mb-3">📋 Instrucciones</h3>
        <ol className="space-y-2 text-sm text-brand-brown/70">
          <li className="flex gap-2">
            <span className="text-primary font-medium">1.</span>
            Descarga la plantilla haciendo clic en el botón "Descargar Plantilla"
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-medium">2.</span>
            Completa todos los campos requeridos en la plantilla
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-medium">3.</span>
            Guarda el archivo en formato CSV o Excel
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-medium">4.</span>
            Selecciona el archivo y haz clic en "Cargar Archivo"
          </li>
          <li className="flex gap-2">
            <span className="text-primary font-medium">5.</span>
            El sistema validará los datos y te informará de cualquier error antes de importar
          </li>
        </ol>
      </div>
    </div>
  );
}
