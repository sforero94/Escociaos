import React, { useState, useRef } from 'react';
import { getSupabase } from '../../../utils/supabase/client';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Progress } from '../../ui/progress';
import { Badge } from '../../ui/badge';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Negocio, Region, CategoriaIngreso, Comprador, MedioPago } from '../../../types/finanzas';

interface CargaMasivaIngresosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (count: number) => void;
  onError: (message: string) => void;
}

interface IngresoRow {
  Fecha: string;
  Negocio: string;
  Región: string;
  Categoría: string;
  Comprador?: string;
  'Medio de Pago': string;
  'Nombre del Ingreso': string;
  Valor: number;
  Observaciones?: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function CargaMasivaIngresos({
  open,
  onOpenChange,
  onSuccess,
  onError
}: CargaMasivaIngresosProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [validatedIngresos, setValidatedIngresos] = useState<any[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Catalogs for mapping names to IDs
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaIngreso[]>([]);
  const [compradores, setCompradores] = useState<Comprador[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);

  // Load catalogs when dialog opens
  React.useEffect(() => {
    if (open) {
      loadCatalogs();
      setErrors([]);
      setSuccessCount(0);
      setProgress(0);
      setCurrentFile('');
      setValidatedIngresos([]);
      setShowConfirmation(false);
    }
  }, [open]);

  const loadCatalogs = async () => {
    try {
      const supabase = getSupabase();

      const [
        negociosResult,
        regionesResult,
        categoriasResult,
        compradoresResult,
        mediosPagoResult
      ] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_ingresos').select('*, fin_negocios(nombre)').eq('activo', true).order('nombre'),
        supabase.from('fin_compradores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre')
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (compradoresResult.data) setCompradores(compradoresResult.data);
      if (mediosPagoResult.data) setMediosPago(mediosPagoResult.data);

    } catch (error: any) {
      onError('Error al cargar los catálogos');
    }
  };

  const descargarPlantilla = async () => {
    try {
      // Ensure catalogs are loaded
      if (negocios.length === 0) {
        await loadCatalogs();
      }

      // Create worksheet data
      const templateData: any[] = [
        // Header row
        [
          'Fecha',
          'Negocio',
          'Región',
          'Categoría',
          'Comprador',
          'Medio de Pago',
          'Nombre del Ingreso',
          'Valor',
          'Observaciones'
        ],
        // Instruction row
        [
          'YYYY-MM-DD',
          'Nombre exacto del negocio',
          'Nombre exacto de la región',
          'Nombre exacto de la categoría',
          'Nombre del comprador (opcional)',
          'Nombre del medio de pago',
          'Descripción del ingreso',
          'Valor numérico sin formato',
          'Observaciones (opcional)'
        ],
        // Example row with actual catalog data
        [
          '2025-01-15',
          negocios[0]?.nombre || 'Ejemplo Negocio',
          regiones[0]?.nombre || 'Ejemplo Región',
          categorias[0]?.nombre || 'Ejemplo Categoría',
          compradores[0]?.nombre || '',
          mediosPago[0]?.nombre || 'Efectivo',
          'Venta de productos',
          150000,
          'Ingreso de ejemplo'
        ]
      ];

      // Add catalog reference section
      templateData.push([]);
      templateData.push(['CATÁLOGOS DISPONIBLES']);
      templateData.push([]);

      // Add Negocios
      templateData.push(['NEGOCIOS:']);
      negocios.forEach(n => templateData.push([n.nombre]));
      templateData.push([]);

      // Add Regiones
      templateData.push(['REGIONES:']);
      regiones.forEach(r => templateData.push([r.nombre]));
      templateData.push([]);

      // Add Categorías (agrupadas por negocio)
      templateData.push(['CATEGORÍAS (por negocio):']);
      negocios.forEach(neg => {
        const negCategorias = categorias.filter(c => c.negocio_id === neg.id);
        if (negCategorias.length > 0) {
          templateData.push([`${neg.nombre}:`]);
          negCategorias.forEach(cat => templateData.push([`  - ${cat.nombre}`]));
        }
      });
      templateData.push([]);

      // Add Compradores
      templateData.push(['COMPRADORES:']);
      compradores.forEach(c => templateData.push([c.nombre]));
      templateData.push([]);

      // Add Medios de Pago
      templateData.push(['MEDIOS DE PAGO:']);
      mediosPago.forEach(m => templateData.push([m.nombre]));

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(templateData);

      // Set column widths
      ws['!cols'] = [
        { wch: 12 },  // Fecha
        { wch: 20 },  // Negocio
        { wch: 20 },  // Región
        { wch: 25 },  // Categoría
        { wch: 25 },  // Comprador
        { wch: 20 },  // Medio de Pago
        { wch: 35 },  // Nombre
        { wch: 15 },  // Valor
        { wch: 30 }   // Observaciones
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Ingresos');

      // Generate file
      const fileName = `plantilla_ingresos_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);

    } catch (error: any) {
      onError('Error al generar la plantilla');
    }
  };

  // Helper function to convert Excel serial number to date
  const excelSerialToDate = (serial: number): string => {
    // Excel dates are stored as days since 1900-01-01 (with a known bug for 1900 being a leap year)
    const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
    const date = new Date(excelEpoch.getTime() + serial * 86400000);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  };

  // Helper function to parse date from Excel
  const parseExcelDate = (value: any): string | null => {
    if (!value) return null;

    // If it's already a string in YYYY-MM-DD format, return it
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // If it's a number (Excel serial date), convert it
    if (typeof value === 'number') {
      return excelSerialToDate(value);
    }

    // Try to parse as date object
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setCurrentFile(file.name);
    setLoading(true);
    setErrors([]);
    setSuccessCount(0);
    setProgress(0);

    try {
      // Read file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];


      // Convert to JSON - use first row as headers, start data from row 3
      const jsonData: IngresoRow[] = XLSX.utils.sheet_to_json(worksheet, {
        range: 2, // Start from row 3 (skip header and instructions)
        header: [
          'Fecha',
          'Negocio',
          'Región',
          'Categoría',
          'Comprador',
          'Medio de Pago',
          'Nombre del Ingreso',
          'Valor',
          'Observaciones'
        ],
        defval: ''
      });


      if (jsonData.length === 0) {
        onError('El archivo no contiene datos válidos');
        setLoading(false);
        return;
      }

      // Validate and process data
      const validationErrors: ValidationError[] = [];
      const validIngresos: any[] = [];
      const supabase = getSupabase();

      // Track newly created items
      const createdCategorias: CategoriaIngreso[] = [];
      const createdCompradores: Comprador[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 3; // Actual Excel row number (header=1, instructions=2, data starts at 3)

        // Skip empty rows
        if (!row.Fecha && !row.Negocio && !row['Nombre del Ingreso']) {
          continue;
        }

        // Parse and validate fecha
        const fechaParsed = parseExcelDate(row.Fecha);
        if (!fechaParsed) {
          validationErrors.push({ row: rowNumber, field: 'Fecha', message: 'Fecha es obligatoria o tiene formato inválido' });
          continue;
        }

        if (!row.Negocio) {
          validationErrors.push({ row: rowNumber, field: 'Negocio', message: 'Negocio es obligatorio' });
          continue;
        }

        if (!row.Región) {
          validationErrors.push({ row: rowNumber, field: 'Región', message: 'Región es obligatoria' });
          continue;
        }

        if (!row.Categoría) {
          validationErrors.push({ row: rowNumber, field: 'Categoría', message: 'Categoría es obligatoria' });
          continue;
        }

        if (!row['Medio de Pago']) {
          validationErrors.push({ row: rowNumber, field: 'Medio de Pago', message: 'Medio de Pago es obligatorio' });
          continue;
        }

        if (!row['Nombre del Ingreso']) {
          validationErrors.push({ row: rowNumber, field: 'Nombre del Ingreso', message: 'Nombre del Ingreso es obligatorio' });
          continue;
        }

        if (!row.Valor || isNaN(Number(row.Valor))) {
          validationErrors.push({ row: rowNumber, field: 'Valor', message: 'Valor debe ser numérico' });
          continue;
        }

        // Map names to IDs
        const negocio = negocios.find(n => n.nombre.toLowerCase() === String(row.Negocio).toLowerCase());
        if (!negocio) {
          validationErrors.push({ row: rowNumber, field: 'Negocio', message: `Negocio "${row.Negocio}" no encontrado en catálogo` });
          continue;
        }

        const region = regiones.find(r => r.nombre.toLowerCase() === String(row.Región).toLowerCase());
        if (!region) {
          validationErrors.push({ row: rowNumber, field: 'Región', message: `Región "${row.Región}" no encontrada en catálogo` });
          continue;
        }

        // Find or create categoria
        let categoria = categorias.find(c =>
          c.nombre.toLowerCase() === String(row.Categoría).toLowerCase() &&
          c.negocio_id === negocio.id
        );

        // Check if we already created it in this batch
        if (!categoria) {
          categoria = createdCategorias.find(c =>
            c.nombre.toLowerCase() === String(row.Categoría).toLowerCase() &&
            c.negocio_id === negocio.id
          );
        }

        // If still not found, create it
        if (!categoria) {
          try {
            const { data: newCategoria, error } = await supabase
              .from('fin_categorias_ingresos')
              .insert([{
                nombre: String(row.Categoría).trim(),
                negocio_id: negocio.id,
                activo: true
              }])
              .select()
              .single();

            if (error) throw error;

            categoria = newCategoria;
            createdCategorias.push(newCategoria);
            categorias.push(newCategoria); // Add to local cache
          } catch (error: any) {
            validationErrors.push({
              row: rowNumber,
              field: 'Categoría',
              message: `Error al crear categoría "${row.Categoría}": ${error.message}`
            });
            continue;
          }
        }

        const medioPago = mediosPago.find(m => m.nombre.toLowerCase() === String(row['Medio de Pago']).toLowerCase());
        if (!medioPago) {
          validationErrors.push({ row: rowNumber, field: 'Medio de Pago', message: `Medio de Pago "${row['Medio de Pago']}" no encontrado en catálogo` });
          continue;
        }

        // Find or create comprador (optional)
        let compradorId = null;
        if (row.Comprador && String(row.Comprador).trim()) {
          let comprador = compradores.find(c => c.nombre.toLowerCase() === String(row.Comprador).toLowerCase());

          // Check if we already created it in this batch
          if (!comprador) {
            comprador = createdCompradores.find(c =>
              c.nombre.toLowerCase() === String(row.Comprador).toLowerCase()
            );
          }

          // If still not found, create it
          if (!comprador) {
            try {
              const { data: newComprador, error } = await supabase
                .from('fin_compradores')
                .insert([{
                  nombre: String(row.Comprador).trim(),
                  activo: true
                }])
                .select()
                .single();

              if (error) throw error;

              comprador = newComprador;
              createdCompradores.push(newComprador);
              compradores.push(newComprador); // Add to local cache
            } catch (error: any) {
              validationErrors.push({
                row: rowNumber,
                field: 'Comprador',
                message: `Error al crear comprador "${row.Comprador}": ${error.message}`
              });
              continue;
            }
          }

          compradorId = comprador.id;
        }

        // Create ingreso object
        validIngresos.push({
          fecha: fechaParsed, // Use parsed date instead of raw value
          negocio_id: negocio.id,
          region_id: region.id,
          categoria_id: categoria.id,
          comprador_id: compradorId,
          medio_pago_id: medioPago.id,
          nombre: row['Nombre del Ingreso'],
          valor: Number(row.Valor),
          observaciones: row.Observaciones || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      setErrors(validationErrors);

      // If there are validation errors, stop
      if (validationErrors.length > 0) {
        setLoading(false);
        onError(`Se encontraron ${validationErrors.length} errores de validación`);
        return;
      }

      // Store validated ingresos and show confirmation
      if (validIngresos.length > 0) {

        // Store additional metadata
        setValidatedIngresos(validIngresos.map(i => ({
          ...i,
          _metadata: {
            createdCategoriasCount: createdCategorias.length,
            createdCompradoresCount: createdCompradores.length
          }
        })));
        setShowConfirmation(true);
        setLoading(false);
      }

    } catch (error: any) {
      onError(`Error al procesar el archivo: ${error.message}`);
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmInsert = async () => {
    if (validatedIngresos.length === 0) return;

    setLoading(true);
    setShowConfirmation(false);

    try {
      const supabase = getSupabase();
      const batchSize = 50;
      let insertedCount = 0;

      // Remove metadata before inserting
      const ingresosToInsert = validatedIngresos.map(({ _metadata, ...ingreso }) => ingreso);

      for (let i = 0; i < ingresosToInsert.length; i += batchSize) {
        const batch = ingresosToInsert.slice(i, i + batchSize);

        const { error } = await supabase
          .from('fin_ingresos')
          .insert(batch);

        if (error) {
          throw new Error(`Error al insertar ingresos: ${error.message}`);
        }

        insertedCount += batch.length;
        setProgress((insertedCount / ingresosToInsert.length) * 100);
      }

      setSuccessCount(insertedCount);
      onSuccess(insertedCount);

      // Close dialog after 2 seconds
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);

    } catch (error: any) {
      onError(`Error al insertar ingresos: ${error.message}`);
      setShowConfirmation(true); // Show confirmation again
    } finally {
      setLoading(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setValidatedIngresos([]);
    setCurrentFile('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#73991C]" />
            Carga Masiva de Ingresos
          </DialogTitle>
          <DialogDescription>
            Descargue la plantilla, complétela con sus datos y súbala para cargar múltiples ingresos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step 1: Download Template */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#73991C] text-white rounded-full flex items-center justify-center font-semibold">
                1
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-2">Descargar Plantilla</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Descargue la plantilla Excel que incluye todos los catálogos disponibles
                </p>
                <Button
                  onClick={descargarPlantilla}
                  className="bg-[#73991C] hover:bg-[#5a7716] text-white"
                  disabled={loading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Plantilla Excel
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2: Upload File */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-[#73991C] text-white rounded-full flex items-center justify-center font-semibold">
                2
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900 mb-2">Subir Archivo Completado</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Complete la plantilla y súbala para procesar los ingresos
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload-ingresos"
                      disabled={loading}
                    />
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      disabled={loading}
                      className="cursor-pointer"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Seleccionar Archivo
                    </Button>
                  </div>
                  {currentFile && (
                    <p className="text-sm text-gray-600">
                      Archivo: <span className="font-medium">{currentFile}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Progress */}
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Procesando...</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Success Message */}
          {successCount > 0 && !loading && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-green-800 font-medium">
                  ¡Éxito! Se cargaron {successCount} ingresos correctamente
                </p>
              </div>
            </div>
          )}

          {/* Confirmation Section */}
          {showConfirmation && validatedIngresos.length > 0 && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">
                    Validación Exitosa - Listo para Insertar
                  </h3>
                  <p className="text-sm text-green-800 mb-3">
                    Se validaron <span className="font-bold">{validatedIngresos.length}</span> ingresos correctamente.
                    {validatedIngresos[0]?._metadata && (
                      validatedIngresos[0]._metadata.createdCategoriasCount > 0 ||
                      validatedIngresos[0]._metadata.createdCompradoresCount > 0
                    ) && (
                      <span className="block mt-1 text-xs">
                        Se crearon automáticamente:{' '}
                        {validatedIngresos[0]._metadata.createdCategoriasCount > 0 && (
                          <span className="font-semibold">
                            {validatedIngresos[0]._metadata.createdCategoriasCount} categoría(s)
                          </span>
                        )}
                        {validatedIngresos[0]._metadata.createdCategoriasCount > 0 &&
                         validatedIngresos[0]._metadata.createdCompradoresCount > 0 && ', '}
                        {validatedIngresos[0]._metadata.createdCompradoresCount > 0 && (
                          <span className="font-semibold">
                            {validatedIngresos[0]._metadata.createdCompradoresCount} comprador(es)
                          </span>
                        )}
                      </span>
                    )}
                  </p>
                  <div className="bg-white rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Resumen:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Total de ingresos:</span>
                        <span className="ml-2 font-semibold">{validatedIngresos.length}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Valor total:</span>
                        <span className="ml-2 font-semibold">
                          ${new Intl.NumberFormat('es-CO').format(
                            validatedIngresos.reduce((sum, i) => sum + (i.valor || 0), 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleConfirmInsert}
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={loading}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirmar y Cargar {validatedIngresos.length} Ingresos
                    </Button>
                    <Button
                      onClick={handleCancelConfirmation}
                      variant="outline"
                      disabled={loading}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-800 font-medium mb-2">
                    Se encontraron {errors.length} errores de validación:
                  </p>
                  <div className="space-y-1">
                    {errors.slice(0, 20).map((error, idx) => (
                      <div key={idx} className="text-sm text-red-700">
                        <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 mr-2">
                          Fila {error.row}
                        </Badge>
                        <span className="font-medium">{error.field}:</span> {error.message}
                      </div>
                    ))}
                    {errors.length > 20 && (
                      <p className="text-sm text-red-600 mt-2">
                        ... y {errors.length - 20} errores más
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Instrucciones:</h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Los nombres de <strong>Negocio, Región y Medio de Pago</strong> deben coincidir exactamente con los del catálogo</li>
              <li><strong>Categorías y Compradores</strong> se crearán automáticamente si no existen</li>
              <li>Las fechas deben estar en formato YYYY-MM-DD (ej: 2025-01-15) o como fecha de Excel</li>
              <li>Los valores deben ser numéricos sin formato (ej: 150000, no $150.000)</li>
              <li>El campo Comprador es opcional, los demás son obligatorios</li>
              <li>La plantilla incluye la lista completa de catálogos disponibles al final</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <X className="w-4 h-4 mr-2" />
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
