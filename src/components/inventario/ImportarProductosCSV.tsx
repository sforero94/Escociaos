import { useState } from 'react';
import { Upload, Download, AlertCircle, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { projectId, publicAnonKey } from '../../utils/supabase/info';

interface ImportResult {
  success: boolean;
  message: string;
  errores?: string[];
  importados?: number;
  total?: number;
}

export function ImportarProductosCSV() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Descargar plantilla CSV
  const descargarPlantilla = () => {
    const headers = [
      'nombre',
      'categoria',
      'grupo',
      'registro_ica',
      'blanco_biologico',
      'ingrediente_activo_1',
      'concentracion_ia_1',
      'ingrediente_activo_2',
      'concentracion_ia_2',
      'ingrediente_activo_3',
      'concentracion_ia_3',
      'periodo_reingreso_horas',
      'periodo_carencia_dias',
      'tipo_aplicacion',
      'estado_fisico',
      'permitido_gerencia',
      'nitrogeno',
      'fosforo',
      'potasio',
      'calcio',
      'magnesio',
      'azufre',
      'hierro',
      'manganeso',
      'zinc',
      'cobre',
      'boro',
      'molibdeno',
      'carbono_organico',
      'silicio',
      'sodio',
      'epp_alto_nivel',
      'riesgo_acuatico',
      'riesgo_vida_silvestre',
      'riesgo_polinizador',
      'riesgo_transeunte',
      'link_ficha_tecnica',
      'link_hoja_seguridad',
      'unidad_medida',
      'presentacion_kg_l',
      'precio_por_presentacion',
      'precio_unitario',
      'cantidad_actual',
      'stock_minimo',
      'activo'
    ];

    const ejemplos = [
      'Producto Ejemplo',
      'Fertilizante',
      'Agroinsumos',
      'ICA-12345',
      'Deficiencia nutricional',
      'Nitrógeno',
      '20',
      'Fósforo',
      '10',
      '',
      '',
      '12',
      '0',
      'Foliar',
      'Líquido',
      'false',
      '20',
      '10',
      '5',
      '2',
      '1',
      '0.5',
      '0.1',
      '0.05',
      '0.02',
      '0.01',
      '0.005',
      '0.001',
      '5',
      '0.1',
      '0.05',
      'false',
      'false',
      'false',
      'false',
      'false',
      'https://ejemplo.com/ficha.pdf',
      'https://ejemplo.com/seguridad.pdf',
      'litros',
      '20',
      '150000',
      '7500',
      '100',
      '20',
      'true'
    ];

    const notas = [
      '# NOTAS IMPORTANTES:',
      '# 1. categoria debe ser uno de: Fertilizante, Fungicida, Insecticida, Acaricida, Insecticida - Acaricida, Herbicida, Biocontrolador, Biológicos, Coadyuvante, Regulador, Fitorregulador, Desinfectante, Enmienda, Enmienda - regulador, Herramienta, Equipo, Maquinaria, Otros',
      '# 2. grupo debe ser uno de: Agroinsumos, Herramientas, Maquinaria y equipo',
      '# 3. tipo_aplicacion debe ser uno de: Foliar, Edáfico, Drench (o dejar vacío)',
      '# 4. estado_fisico debe ser uno de: Líquido, Sólido (o dejar vacío)',
      '# 5. unidad_medida debe ser uno de: litros, kilos, unidades',
      '# 6. Los campos booleanos deben ser: true o false (minúsculas)',
      '# 7. Los números decimales deben usar punto (.) no coma (,)',
      '# 8. Los campos vacíos se dejan sin contenido (no escribir "null" o "vacío")',
      '# 9. El sistema es flexible con mayúsculas/minúsculas y acentos (ej: "edafico" = "Edáfico", "liquido" = "Líquido")',
      '# 10. IMPORTANTE: Ejecuta primero el script SQL /sql/agregar_categorias_productos.sql en Supabase para agregar las categorías faltantes',
      ''
    ];

    const csvContent = [
      ...notas,
      headers.join(','),
      ejemplos.join(',')
    ].join('\n');

    // Agregar BOM UTF-8 para que Excel reconozca correctamente los acentos
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'plantilla_productos_inventario.csv';
    link.click();
  };

  // Manejar drag & drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        setArchivo(file);
        setResultado(null);
      } else {
        setResultado({
          success: false,
          message: 'Por favor selecciona un archivo CSV válido'
        });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.csv')) {
        setArchivo(file);
        setResultado(null);
      } else {
        setResultado({
          success: false,
          message: 'Por favor selecciona un archivo CSV válido'
        });
      }
    }
  };

  const procesarCSV = async () => {
    if (!archivo) return;

    setCargando(true);
    setResultado(null);

    try {
      // ✅ SOLUCIÓN: Usar FileReader con codificación UTF-8 explícita
      const texto = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(archivo, 'UTF-8');
      });

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-1ccce916/inventario/importar-productos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({ csvData: texto })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al importar productos');
      }

      setResultado(data);
      
      // Si fue exitoso, limpiar archivo después de 3 segundos
      if (data.success) {
        setTimeout(() => {
          setArchivo(null);
        }, 3000);
      }
    } catch (error: any) {
      console.error('Error al procesar CSV:', error);
      setResultado({
        success: false,
        message: error.message || 'Error al procesar el archivo'
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#172E08]">Importar Productos en Masa</h2>
          <p className="text-[#4D240F]/60 mt-1">
            Carga múltiples productos desde un archivo CSV
          </p>
        </div>
        <Button
          onClick={descargarPlantilla}
          variant="outline"
          className="gap-2 border-[#73991C] text-[#73991C] hover:bg-[#73991C]/10"
        >
          <Download className="w-4 h-4" />
          Descargar Plantilla
        </Button>
      </div>

      {/* Área de carga */}
      <Card className="p-8 bg-white/60 backdrop-blur-sm border-[#BFD97D]/30">
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center transition-all
            ${dragActive 
              ? 'border-[#73991C] bg-[#73991C]/5' 
              : 'border-[#BFD97D] hover:border-[#73991C] hover:bg-[#F8FAF5]'
            }
          `}
        >
          {!archivo ? (
            <>
              <Upload className="w-16 h-16 mx-auto mb-4 text-[#73991C]/40" />
              <h3 className="text-[#172E08] mb-2">
                Arrastra tu archivo CSV aquí
              </h3>
              <p className="text-[#4D240F]/60 mb-4">
                o haz clic para seleccionar
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload">
                <Button asChild variant="outline" className="border-[#73991C] text-[#73991C]">
                  <span className="cursor-pointer">
                    Seleccionar archivo
                  </span>
                </Button>
              </label>
            </>
          ) : (
            <>
              <FileText className="w-16 h-16 mx-auto mb-4 text-[#73991C]" />
              <h3 className="text-[#172E08] mb-2">{archivo.name}</h3>
              <p className="text-[#4D240F]/60 mb-4">
                {(archivo.size / 1024).toFixed(2)} KB
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={procesarCSV}
                  disabled={cargando}
                  className="bg-[#73991C] hover:bg-[#73991C]/90 text-white"
                >
                  {cargando ? 'Procesando...' : 'Importar Productos'}
                </Button>
                <Button
                  onClick={() => {
                    setArchivo(null);
                    setResultado(null);
                  }}
                  variant="outline"
                  disabled={cargando}
                >
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Alert
          className={`
            ${resultado.success 
              ? 'bg-[#73991C]/10 border-[#73991C] text-[#172E08]' 
              : 'bg-red-50 border-red-500 text-red-900'
            }
          `}
        >
          <div className="flex items-start gap-3">
            {resultado.success ? (
              <CheckCircle2 className="w-5 h-5 text-[#73991C] mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500 mt-0.5" />
            )}
            <div className="flex-1">
              <AlertDescription>
                <p className="font-medium mb-1">{resultado.message}</p>
                {resultado.importados !== undefined && resultado.total !== undefined && (
                  <p className="text-sm opacity-80">
                    {resultado.importados} de {resultado.total} productos importados correctamente
                  </p>
                )}
                {resultado.errores && resultado.errores.length > 0 && (
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-medium">Errores encontrados:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      {resultado.errores.slice(0, 10).map((error, idx) => (
                        <li key={idx} className="list-disc">{error}</li>
                      ))}
                      {resultado.errores.length > 10 && (
                        <li className="list-none italic">
                          ... y {resultado.errores.length - 10} errores más
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* Instrucciones */}
      <Card className="p-6 bg-gradient-to-br from-[#F8FAF5] to-white/80 backdrop-blur-sm border-[#BFD97D]/30">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-[#73991C] mt-0.5 flex-shrink-0" />
          <div className="space-y-3">
            <h4 className="text-[#172E08] font-medium">Instrucciones de uso:</h4>
            <ol className="text-sm text-[#4D240F]/80 space-y-2 list-decimal ml-4">
              <li>Descarga la plantilla CSV haciendo clic en el botón "Descargar Plantilla"</li>
              <li>Abre el archivo con Excel, Google Sheets o cualquier editor de hojas de cálculo</li>
              <li>Lee atentamente las notas al inicio del archivo (líneas que empiezan con #)</li>
              <li>Rellena los datos de tus productos siguiendo el formato del ejemplo</li>
              <li>Guarda el archivo en formato CSV (separado por comas)</li>
              <li>Arrastra el archivo aquí o haz clic para seleccionarlo</li>
              <li>Haz clic en "Importar Productos" y espera la confirmación</li>
            </ol>
            <div className="pt-2 border-t border-[#BFD97D]/30">
              <p className="text-sm text-[#4D240F]/60">
                <strong>Nota:</strong> Los productos con nombres duplicados no serán importados. 
                El sistema validará todos los campos antes de guardar.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}