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
import type { Negocio, Region, CategoriaGasto, ConceptoGasto, Proveedor, MedioPago } from '../../../types/finanzas';

interface CargaMasivaGastosProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (count: number) => void;
  onError: (message: string) => void;
}

interface GastoRow {
  Fecha: string;
  Negocio: string;
  Región: string;
  Categoría: string;
  Concepto: string;
  Proveedor?: string;
  'Medio de Pago': string;
  'Nombre del Gasto': string;
  Valor: number;
  Observaciones?: string;
  Estado: 'Pendiente' | 'Confirmado';
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function CargaMasivaGastos({
  open,
  onOpenChange,
  onSuccess,
  onError
}: CargaMasivaGastosProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [currentFile, setCurrentFile] = useState<string>('');
  const [validatedGastos, setValidatedGastos] = useState<any[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Catalogs for mapping names to IDs
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [regiones, setRegiones] = useState<Region[]>([]);
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoGasto[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mediosPago, setMediosPago] = useState<MedioPago[]>([]);

  // Load catalogs when dialog opens
  React.useEffect(() => {
    if (open) {
      loadCatalogs();
      setErrors([]);
      setSuccessCount(0);
      setProgress(0);
      setCurrentFile('');
      setValidatedGastos([]);
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
        conceptosResult,
        proveedoresResult,
        mediosPagoResult
      ] = await Promise.all([
        supabase.from('fin_negocios').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_regiones').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_categorias_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_conceptos_gastos').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_proveedores').select('*').eq('activo', true).order('nombre'),
        supabase.from('fin_medios_pago').select('*').eq('activo', true).order('nombre')
      ]);

      if (negociosResult.data) setNegocios(negociosResult.data);
      if (regionesResult.data) setRegiones(regionesResult.data);
      if (categoriasResult.data) setCategorias(categoriasResult.data);
      if (conceptosResult.data) setConceptos(conceptosResult.data);
      if (proveedoresResult.data) setProveedores(proveedoresResult.data);
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
          'Concepto',
          'Proveedor',
          'Medio de Pago',
          'Nombre del Gasto',
          'Valor',
          'Observaciones',
          'Estado'
        ],
        // Instruction row
        [
          'YYYY-MM-DD',
          'Nombre exacto del negocio',
          'Nombre exacto de la región',
          'Nombre exacto de la categoría',
          'Nombre exacto del concepto',
          'Nombre del proveedor (opcional)',
          'Nombre del medio de pago',
          'Descripción del gasto',
          'Valor numérico sin formato',
          'Observaciones (opcional)',
          'Pendiente o Confirmado'
        ],
        // Example row with actual catalog data
        [
          '2025-01-15',
          negocios[0]?.nombre || 'Ejemplo Negocio',
          regiones[0]?.nombre || 'Ejemplo Región',
          categorias[0]?.nombre || 'Ejemplo Categoría',
          conceptos[0]?.nombre || 'Ejemplo Concepto',
          proveedores[0]?.nombre || '',
          mediosPago[0]?.nombre || 'Efectivo',
          'Compra de materiales',
          50000,
          'Gasto de ejemplo',
          'Pendiente'
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

      // Add Categorías
      templateData.push(['CATEGORÍAS:']);
      categorias.forEach(c => templateData.push([c.nombre]));
      templateData.push([]);

      // Add Conceptos
      templateData.push(['CONCEPTOS (por categoría):']);
      categorias.forEach(cat => {
        const catConceptos = conceptos.filter(c => c.categoria_id === cat.id);
        if (catConceptos.length > 0) {
          templateData.push([`${cat.nombre}:`]);
          catConceptos.forEach(con => templateData.push([`  - ${con.nombre}`]));
        }
      });
      templateData.push([]);

      // Add Proveedores
      templateData.push(['PROVEEDORES:']);
      proveedores.forEach(p => templateData.push([p.nombre]));
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
        { wch: 20 },  // Categoría
        { wch: 25 },  // Concepto
        { wch: 25 },  // Proveedor
        { wch: 20 },  // Medio de Pago
        { wch: 35 },  // Nombre
        { wch: 15 },  // Valor
        { wch: 30 },  // Observaciones
        { wch: 12 }   // Estado
      ];

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Gastos');

      // Generate file
      const fileName = `plantilla_gastos_${new Date().toISOString().split('T')[0]}.xlsx`;
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
      const jsonData: GastoRow[] = XLSX.utils.sheet_to_json(worksheet, {
        range: 2, // Start from row 3 (skip header and instructions)
        header: [
          'Fecha',
          'Negocio',
          'Región',
          'Categoría',
          'Concepto',
          'Proveedor',
          'Medio de Pago',
          'Nombre del Gasto',
          'Valor',
          'Observaciones',
          'Estado'
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
      const validGastos: any[] = [];
      const supabase = getSupabase();

      // Track newly created items
      const createdConceptos: ConceptoGasto[] = [];
      const createdProveedores: Proveedor[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 3; // Actual Excel row number (header=1, instructions=2, data starts at 3)

        // Skip empty rows
        if (!row.Fecha && !row.Negocio && !row['Nombre del Gasto']) {
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

        if (!row.Concepto) {
          validationErrors.push({ row: rowNumber, field: 'Concepto', message: 'Concepto es obligatorio' });
          continue;
        }

        if (!row['Medio de Pago']) {
          validationErrors.push({ row: rowNumber, field: 'Medio de Pago', message: 'Medio de Pago es obligatorio' });
          continue;
        }

        if (!row['Nombre del Gasto']) {
          validationErrors.push({ row: rowNumber, field: 'Nombre del Gasto', message: 'Nombre del Gasto es obligatorio' });
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

        const categoria = categorias.find(c => c.nombre.toLowerCase() === String(row.Categoría).toLowerCase());
        if (!categoria) {
          validationErrors.push({ row: rowNumber, field: 'Categoría', message: `Categoría "${row.Categoría}" no encontrada en catálogo` });
          continue;
        }

        // Find or create concepto
        let concepto = conceptos.find(c =>
          c.nombre.toLowerCase() === String(row.Concepto).toLowerCase() &&
          c.categoria_id === categoria.id
        );

        // Check if we already created it in this batch
        if (!concepto) {
          concepto = createdConceptos.find(c =>
            c.nombre.toLowerCase() === String(row.Concepto).toLowerCase() &&
            c.categoria_id === categoria.id
          );
        }

        // If still not found, create it
        if (!concepto) {
          try {
            const { data: newConcepto, error } = await supabase
              .from('fin_conceptos_gastos')
              .insert([{
                nombre: String(row.Concepto).trim(),
                categoria_id: categoria.id,
                activo: true
              }])
              .select()
              .single();

            if (error) throw error;

            concepto = newConcepto;
            createdConceptos.push(newConcepto);
            conceptos.push(newConcepto); // Add to local cache
          } catch (error: any) {
            validationErrors.push({
              row: rowNumber,
              field: 'Concepto',
              message: `Error al crear concepto "${row.Concepto}": ${error.message}`
            });
            continue;
          }
        }

        const medioPago = mediosPago.find(m => m.nombre.toLowerCase() === String(row['Medio de Pago']).toLowerCase());
        if (!medioPago) {
          validationErrors.push({ row: rowNumber, field: 'Medio de Pago', message: `Medio de Pago "${row['Medio de Pago']}" no encontrado en catálogo` });
          continue;
        }

        // Find or create proveedor (optional)
        let proveedorId = null;
        if (row.Proveedor && String(row.Proveedor).trim()) {
          let proveedor = proveedores.find(p => p.nombre.toLowerCase() === String(row.Proveedor).toLowerCase());

          // Check if we already created it in this batch
          if (!proveedor) {
            proveedor = createdProveedores.find(p =>
              p.nombre.toLowerCase() === String(row.Proveedor).toLowerCase()
            );
          }

          // If still not found, create it
          if (!proveedor) {
            try {
              const { data: newProveedor, error } = await supabase
                .from('fin_proveedores')
                .insert([{
                  nombre: String(row.Proveedor).trim(),
                  activo: true
                }])
                .select()
                .single();

              if (error) throw error;

              proveedor = newProveedor;
              createdProveedores.push(newProveedor);
              proveedores.push(newProveedor); // Add to local cache
            } catch (error: any) {
              validationErrors.push({
                row: rowNumber,
                field: 'Proveedor',
                message: `Error al crear proveedor "${row.Proveedor}": ${error.message}`
              });
              continue;
            }
          }

          proveedorId = proveedor.id;
        }

        // Validate estado
        const estado = row.Estado === 'Confirmado' ? 'Confirmado' : 'Pendiente';

        // Create gasto object
        validGastos.push({
          fecha: fechaParsed, // Use parsed date instead of raw value
          negocio_id: negocio.id,
          region_id: region.id,
          categoria_id: categoria.id,
          concepto_id: concepto.id,
          proveedor_id: proveedorId,
          medio_pago_id: medioPago.id,
          nombre: row['Nombre del Gasto'],
          valor: Number(row.Valor),
          observaciones: row.Observaciones || null,
          estado: estado,
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

      // Store validated gastos and show confirmation
      if (validGastos.length > 0) {

        // Store additional metadata
        setValidatedGastos(validGastos.map(g => ({
          ...g,
          _metadata: {
            createdConceptosCount: createdConceptos.length,
            createdProveedoresCount: createdProveedores.length
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
    if (validatedGastos.length === 0) return;

    setLoading(true);
    setShowConfirmation(false);

    try {
      const supabase = getSupabase();
      const batchSize = 50;
      let insertedCount = 0;

      // Remove metadata before inserting
      const gastosToInsert = validatedGastos.map(({ _metadata, ...gasto }) => gasto);

      for (let i = 0; i < gastosToInsert.length; i += batchSize) {
        const batch = gastosToInsert.slice(i, i + batchSize);

        const { error } = await supabase
          .from('fin_gastos')
          .insert(batch);

        if (error) {
          throw new Error(`Error al insertar gastos: ${error.message}`);
        }

        insertedCount += batch.length;
        setProgress((insertedCount / gastosToInsert.length) * 100);
      }

      setSuccessCount(insertedCount);
      onSuccess(insertedCount);

      // Close dialog after 2 seconds
      setTimeout(() => {
        onOpenChange(false);
      }, 2000);

    } catch (error: any) {
      onError(`Error al insertar gastos: ${error.message}`);
      setShowConfirmation(true); // Show confirmation again
    } finally {
      setLoading(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setValidatedGastos([]);
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
            Carga Masiva de Gastos
          </DialogTitle>
          <DialogDescription>
            Descargue la plantilla, complétela con sus datos y súbala para cargar múltiples gastos
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
                  Complete la plantilla y súbala para procesar los gastos
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
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
                  ¡Éxito! Se cargaron {successCount} gastos correctamente
                </p>
              </div>
            </div>
          )}

          {/* Confirmation Section */}
          {showConfirmation && validatedGastos.length > 0 && (
            <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">
                    Validación Exitosa - Listo para Insertar
                  </h3>
                  <p className="text-sm text-green-800 mb-3">
                    Se validaron <span className="font-bold">{validatedGastos.length}</span> gastos correctamente.
                    {validatedGastos[0]?._metadata && (
                      validatedGastos[0]._metadata.createdConceptosCount > 0 ||
                      validatedGastos[0]._metadata.createdProveedoresCount > 0
                    ) && (
                      <span className="block mt-1 text-xs">
                        Se crearon automáticamente:{' '}
                        {validatedGastos[0]._metadata.createdConceptosCount > 0 && (
                          <span className="font-semibold">
                            {validatedGastos[0]._metadata.createdConceptosCount} concepto(s)
                          </span>
                        )}
                        {validatedGastos[0]._metadata.createdConceptosCount > 0 &&
                         validatedGastos[0]._metadata.createdProveedoresCount > 0 && ', '}
                        {validatedGastos[0]._metadata.createdProveedoresCount > 0 && (
                          <span className="font-semibold">
                            {validatedGastos[0]._metadata.createdProveedoresCount} proveedor(es)
                          </span>
                        )}
                      </span>
                    )}
                  </p>
                  <div className="bg-white rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Resumen:</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-600">Total de gastos:</span>
                        <span className="ml-2 font-semibold">{validatedGastos.length}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Valor total:</span>
                        <span className="ml-2 font-semibold">
                          ${new Intl.NumberFormat('es-CO').format(
                            validatedGastos.reduce((sum, g) => sum + (g.valor || 0), 0)
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
                      Confirmar y Cargar {validatedGastos.length} Gastos
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
              <li>Los nombres de <strong>Negocio, Región, Categoría y Medio de Pago</strong> deben coincidir exactamente con los del catálogo</li>
              <li><strong>Conceptos y Proveedores</strong> se crearán automáticamente si no existen</li>
              <li>Las fechas deben estar en formato YYYY-MM-DD (ej: 2025-01-15)</li>
              <li>Los valores deben ser numéricos sin formato (ej: 50000, no $50.000)</li>
              <li>El campo Proveedor es opcional, los demás son obligatorios</li>
              <li>El Estado puede ser "Pendiente" o "Confirmado"</li>
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
