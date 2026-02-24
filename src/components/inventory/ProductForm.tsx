import React, { useState, useEffect } from 'react';
import { getSupabase } from '../../utils/supabase/client';
import { useAuth } from '../../contexts/AuthContext';

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  productId?: number | null; // Si viene productId, es modo EDITAR
  onSuccess: () => void;
}

interface ProductData {
  // Campos básicos (TODOS)
  nombre: string;
  categoria: string;
  grupo: string;
  unidad_medida: string;
  presentacion_kg_l: number | '';
  precio_por_presentacion: number | '';
  precio_unitario: number | '';
  
  // Inventario (TODOS)
  cantidad_actual: number | '';
  stock_minimo: number | '';
  estado: string;
  
  // Campos técnicos (INSUMOS excepto fertilizantes)
  registro_ica: string;
  blanco_biologico: string;
  ingrediente_activo_1: string;
  concentracion_ia_1: number | '';
  ingrediente_activo_2: string;
  concentracion_ia_2: number | '';
  ingrediente_activo_3: string;
  concentracion_ia_3: number | '';
  periodo_reingreso_horas: number | '';
  periodo_carencia_dias: number | '';
  tipo_aplicacion: string;
  estado_fisico: string;
  permitido_gerencia: boolean | null;
  
  // Composición nutricional (SOLO FERTILIZANTES)
  nitrogeno: number | '';
  fosforo: number | '';
  potasio: number | '';
  calcio: number | '';
  magnesio: number | '';
  azufre: number | '';
  hierro: number | '';
  manganeso: number | '';
  zinc: number | '';
  cobre: number | '';
  boro: number | '';
  molibdeno: number | '';
  carbono_organico: number | '';
  silicio: number | '';
  sodio: number | '';
  
  // Seguridad (TODOS LOS INSUMOS)
  epp_alto_nivel: boolean;
  riesgo_acuatico: boolean;
  riesgo_vida_silvestre: boolean;
  riesgo_polinizador: boolean;
  riesgo_transeunte: boolean;
  link_ficha_tecnica: string;
  link_hoja_seguridad: string;
}

const initialFormData: ProductData = {
  nombre: '',
  categoria: '',
  grupo: '',
  unidad_medida: '',
  presentacion_kg_l: '',
  precio_por_presentacion: '',
  precio_unitario: '',
  cantidad_actual: '',
  stock_minimo: '',
  estado: 'OK',
  registro_ica: '',
  blanco_biologico: '',
  ingrediente_activo_1: '',
  concentracion_ia_1: '',
  ingrediente_activo_2: '',
  concentracion_ia_2: '',
  ingrediente_activo_3: '',
  concentracion_ia_3: '',
  periodo_reingreso_horas: '',
  periodo_carencia_dias: '',
  tipo_aplicacion: '',
  estado_fisico: '',
  permitido_gerencia: null,
  nitrogeno: '',
  fosforo: '',
  potasio: '',
  calcio: '',
  magnesio: '',
  azufre: '',
  hierro: '',
  manganeso: '',
  zinc: '',
  cobre: '',
  boro: '',
  molibdeno: '',
  carbono_organico: '',
  silicio: '',
  sodio: '',
  epp_alto_nivel: false,
  riesgo_acuatico: false,
  riesgo_vida_silvestre: false,
  riesgo_polinizador: false,
  riesgo_transeunte: false,
  link_ficha_tecnica: '',
  link_hoja_seguridad: '',
};

export function ProductForm({ isOpen, onClose, productId, onSuccess }: ProductFormProps) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState<ProductData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(1);

  // Cargar datos del producto si es modo edición
  useEffect(() => {
    if (productId) {
      loadProductData();
    } else {
      setFormData(initialFormData);
    }
  }, [productId, isOpen]);

  // Calcular precio unitario automáticamente
  useEffect(() => {
    if (formData.precio_por_presentacion && formData.presentacion_kg_l && formData.presentacion_kg_l > 0) {
      const precioCalculado = Number(formData.precio_por_presentacion) / Number(formData.presentacion_kg_l);
      setFormData(prev => ({ ...prev, precio_unitario: Number(precioCalculado.toFixed(2)) }));
    } else {
      setFormData(prev => ({ ...prev, precio_unitario: '' }));
    }
  }, [formData.precio_por_presentacion, formData.presentacion_kg_l]);

  const loadProductData = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('id', productId)
        .single();

      if (error) throw error;
      if (data) {
        // Convertir nulls a strings vacíos o números vacíos
        const formattedData = { ...initialFormData };
        Object.keys(data).forEach(key => {
          if (data[key] !== null) {
            formattedData[key as keyof ProductData] = data[key];
          }
        });
        setFormData(formattedData);
      }
    } catch (err: any) {
      setError('Error al cargar el producto');
    }
  };

  // Determinar qué secciones mostrar según grupo/categoría
  const isInsumo = formData.grupo === 'Agroinsumos';
  const isFertilizante = formData.categoria === 'Fertilizante';
  const needsIngredientesActivos = isInsumo && !isFertilizante;
  const needsComposicionNutricional = isFertilizante;
  const needsSeguridad = isInsumo;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      // Convertir a número o dejar vacío
      setFormData(prev => ({ ...prev, [name]: value === '' ? '' : parseFloat(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const validateForm = (): string | null => {
    // Validaciones básicas
    if (!formData.nombre.trim()) return 'El nombre del producto es obligatorio';
    if (!formData.categoria) return 'Debe seleccionar una categoría';
    if (!formData.grupo) return 'Debe seleccionar un grupo';
    if (!formData.unidad_medida) return 'Debe seleccionar una unidad de medida';
    
    // Validación de "Permitido por Gerencia" para insumos no-fertilizantes
    const isInsumo = formData.grupo === 'Agroinsumos';
    const isFertilizante = formData.categoria === 'Fertilizante';
    if (isInsumo && !isFertilizante && formData.permitido_gerencia === null) {
      return 'Debe seleccionar Sí o No en "Permitido por Gerencia"';
    }
    
    // Validaciones de números no negativos
    if (formData.stock_minimo !== '' && formData.stock_minimo < 0) {
      return 'El stock mínimo no puede ser negativo';
    }
    if (formData.precio_unitario !== '' && formData.precio_unitario < 0) {
      return 'El precio no puede ser negativo';
    }
    if (formData.cantidad_actual !== '' && formData.cantidad_actual < 0) {
      return 'La cantidad actual no puede ser negativa';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();
      
      // Preparar datos para insertar/actualizar
      const dataToSave: any = { ...formData };
      
      // Convertir strings vacíos a null para campos numéricos
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === '') {
          dataToSave[key] = null;
        }
      });

      // Agregar campo activo si es creación
      if (!productId) {
        dataToSave.activo = true;
      }

      if (productId) {
        // MODO EDICIÓN
        const { error: updateError } = await supabase
          .from('productos')
          .update(dataToSave)
          .eq('id', productId);

        if (updateError) throw updateError;
      } else {
        // MODO CREACIÓN
        const { error: insertError } = await supabase
          .from('productos')
          .insert([dataToSave]);

        if (insertError) throw insertError;
      }

      // Éxito
      onSuccess();
      onClose();
      setFormData(initialFormData);
      setCurrentSection(1);
    } catch (err: any) {
      if (err.code === '23505') {
        setError('Ya existe un producto con ese nombre');
      } else {
        setError(err.message || 'Error al guardar el producto');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-secondary text-white px-6 py-4">
          <h2 className="text-2xl">
            {productId ? 'Editar Producto' : 'Crear Nuevo Producto'}
          </h2>
          <p className="text-sm text-white/90 mt-1">
            Complete todos los campos requeridos (*)
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="bg-gray-100 px-6 py-3">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <div className={`flex items-center ${currentSection >= 1 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentSection >= 1 ? 'bg-primary text-white' : 'bg-gray-300'}`}>
                1
              </div>
              <span className="ml-2 text-sm">Básico</span>
            </div>
            <div className="flex-1 h-1 bg-gray-300 mx-4">
              <div className={`h-full ${currentSection >= 2 ? 'bg-primary' : 'bg-gray-300'}`} style={{ width: currentSection >= 2 ? '100%' : '0%', transition: 'width 0.3s' }}></div>
            </div>
            <div className={`flex items-center ${currentSection >= 2 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentSection >= 2 ? 'bg-primary text-white' : 'bg-gray-300'}`}>
                2
              </div>
              <span className="ml-2 text-sm">Técnico</span>
            </div>
            <div className="flex-1 h-1 bg-gray-300 mx-4">
              <div className={`h-full ${currentSection >= 3 ? 'bg-primary' : 'bg-gray-300'}`} style={{ width: currentSection >= 3 ? '100%' : '0%', transition: 'width 0.3s' }}></div>
            </div>
            <div className={`flex items-center ${currentSection >= 3 ? 'text-primary' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentSection >= 3 ? 'bg-primary text-white' : 'bg-gray-300'}`}>
                3
              </div>
              <span className="ml-2 text-sm">Seguridad</span>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 220px)' }}>
          <div className="px-6 py-4">
            
            {/* SECCIÓN 1: INFORMACIÓN BÁSICA */}
            {currentSection === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg text-gray-800 mb-4">Información Básica</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-700 mb-1">
                      Nombre del Producto *
                    </label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    />
                  </div>

                  {/* Grupo */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Grupo *
                    </label>
                    <select
                      name="grupo"
                      value={formData.grupo}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Agroinsumos">Agroinsumos</option>
                      <option value="Maquinaria">Maquinaria</option>
                      <option value="Herramientas">Herramientas</option>
                      <option value="Equipos de Protección">Equipos de Protección</option>
                      <option value="Empaques">Empaques</option>
                      <option value="Otros">Otros</option>
                    </select>
                  </div>

                  {/* Categoría */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Categoría *
                    </label>
                    <select
                      name="categoria"
                      value={formData.categoria}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      {formData.grupo === 'Agroinsumos' && (
                        <>
                          <option value="Fertilizante">Fertilizante</option>
                          <option value="Fungicida">Fungicida</option>
                          <option value="Insecticida">Insecticida</option>
                          <option value="Herbicida">Herbicida</option>
                          <option value="Coadyuvante">Coadyuvante</option>
                          <option value="Bioestimulante">Bioestimulante</option>
                        </>
                      )}
                      {formData.grupo !== 'Agroinsumos' && (
                        <option value="General">General</option>
                      )}
                    </select>
                  </div>

                  {/* Unidad de Medida */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Unidad de Medida *
                    </label>
                    <select
                      name="unidad_medida"
                      value={formData.unidad_medida}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      required
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Litros">Litros</option>
                      <option value="Kilos">Kilos</option>
                      <option value="Unidades">Unidades</option>
                      <option value="cajas">Cajas</option>
                      <option value="gramos">Gramos</option>
                      <option value="mililitros">Mililitros</option>
                    </select>
                  </div>

                  {/* Estado */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Estado
                    </label>
                    <select
                      name="estado"
                      value={formData.estado}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    >
                      <option value="OK">OK</option>
                      <option value="Sin existencias">Sin existencias</option>
                      <option value="Vencido">Vencido</option>
                      <option value="Perdido">Perdido</option>
                    </select>
                  </div>
                </div>

                <h4 className="text-md text-gray-800 mt-6 mb-3">Presentación y Precios</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Presentación */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Presentación (Kg/L)
                    </label>
                    <input
                      type="number"
                      name="presentacion_kg_l"
                      value={formData.presentacion_kg_l}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Ej: 1, 5, 10"
                    />
                  </div>

                  {/* Precio por Presentación */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Precio por Presentación ($)
                    </label>
                    <input
                      type="number"
                      name="precio_por_presentacion"
                      value={formData.precio_por_presentacion}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Precio del bulto/tarro"
                    />
                  </div>

                  {/* Precio Unitario */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Precio Unitario ($/L o $/Kg) <span className="text-xs text-primary">✓ Calculado</span>
                    </label>
                    <input
                      type="number"
                      name="precio_unitario"
                      value={formData.precio_unitario}
                      readOnly
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
                      placeholder="Se calcula automáticamente"
                    />
                  </div>
                </div>

                <h4 className="text-md text-gray-800 mt-6 mb-3">Inventario</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Cantidad Actual */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Cantidad Actual
                    </label>
                    <input
                      type="number"
                      name="cantidad_actual"
                      value={formData.cantidad_actual}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Cantidad en inventario"
                    />
                  </div>

                  {/* Stock Mínimo */}
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Stock Mínimo (Alerta)
                    </label>
                    <input
                      type="number"
                      name="stock_minimo"
                      value={formData.stock_minimo}
                      onChange={handleChange}
                      step="0.01"
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="Nivel mínimo deseado"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SECCIÓN 2: INFORMACIÓN TÉCNICA */}
            {currentSection === 2 && (
              <div className="space-y-4">
                
                {/* INGREDIENTES ACTIVOS (Solo para insumos NO fertilizantes) */}
                {needsIngredientesActivos && (
                  <>
                    <h3 className="text-lg text-gray-800 mb-4">Información Técnica</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Registro ICA */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Registro ICA
                        </label>
                        <input
                          type="text"
                          name="registro_ica"
                          value={formData.registro_ica}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Número de registro"
                        />
                      </div>

                      {/* Blanco Biológico */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Blanco Biológico
                        </label>
                        <input
                          type="text"
                          name="blanco_biologico"
                          value={formData.blanco_biologico}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Plaga/enfermedad objetivo"
                        />
                      </div>
                    </div>

                    <h4 className="text-md text-gray-800 mt-6 mb-3">Ingredientes Activos</h4>
                    
                    {/* Ingrediente Activo 1 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Ingrediente Activo 1
                        </label>
                        <input
                          type="text"
                          name="ingrediente_activo_1"
                          value={formData.ingrediente_activo_1}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Nombre del ingrediente"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Concentración (g/L)
                        </label>
                        <input
                          type="number"
                          name="concentracion_ia_1"
                          value={formData.concentracion_ia_1}
                          onChange={handleChange}
                          step="0.01"
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Ej: 480"
                        />
                      </div>
                    </div>

                    {/* Ingrediente Activo 2 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Ingrediente Activo 2
                        </label>
                        <input
                          type="text"
                          name="ingrediente_activo_2"
                          value={formData.ingrediente_activo_2}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Concentración (g/L)
                        </label>
                        <input
                          type="number"
                          name="concentracion_ia_2"
                          value={formData.concentracion_ia_2}
                          onChange={handleChange}
                          step="0.01"
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>

                    {/* Ingrediente Activo 3 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Ingrediente Activo 3
                        </label>
                        <input
                          type="text"
                          name="ingrediente_activo_3"
                          value={formData.ingrediente_activo_3}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Opcional"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Concentración (g/L)
                        </label>
                        <input
                          type="number"
                          name="concentracion_ia_3"
                          value={formData.concentracion_ia_3}
                          onChange={handleChange}
                          step="0.01"
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Opcional"
                        />
                      </div>
                    </div>

                    <h4 className="text-md text-gray-800 mt-6 mb-3">Aplicación y Seguridad</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Tipo de Aplicación */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Tipo de Aplicación
                        </label>
                        <select
                          name="tipo_aplicacion"
                          value={formData.tipo_aplicacion}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Foliar">Foliar</option>
                          <option value="Edáfico">Edáfico</option>
                          <option value="Drench">Drench</option>
                        </select>
                      </div>

                      {/* Estado Físico */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Estado Físico
                        </label>
                        <select
                          name="estado_fisico"
                          value={formData.estado_fisico}
                          onChange={handleChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                        >
                          <option value="">Seleccionar...</option>
                          <option value="Líquido">Líquido</option>
                          <option value="Polvo">Polvo</option>
                          <option value="Granulado">Granulado</option>
                        </select>
                      </div>

                      {/* Periodo Reingreso */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Periodo Reingreso (horas)
                        </label>
                        <input
                          type="number"
                          name="periodo_reingreso_horas"
                          value={formData.periodo_reingreso_horas}
                          onChange={handleChange}
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Ej: 24"
                        />
                      </div>

                      {/* Periodo Carencia */}
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">
                          Periodo Carencia (días)
                        </label>
                        <input
                          type="number"
                          name="periodo_carencia_dias"
                          value={formData.periodo_carencia_dias}
                          onChange={handleChange}
                          min="0"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                          placeholder="Ej: 7"
                        />
                      </div>

                      {/* Permitido por Gerencia */}
                      <div className="md:col-span-2">
                        <label className="block text-sm text-gray-700 mb-1">
                          Permitido por Gerencia <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-6 mt-2">
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="permitido_gerencia"
                              value="si"
                              checked={formData.permitido_gerencia === true}
                              onChange={() => setFormData(prev => ({ ...prev, permitido_gerencia: true }))}
                              className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                            />
                            <span className="ml-2 text-sm text-gray-700">Sí</span>
                          </label>
                          <label className="flex items-center cursor-pointer">
                            <input
                              type="radio"
                              name="permitido_gerencia"
                              value="no"
                              checked={formData.permitido_gerencia === false}
                              onChange={() => setFormData(prev => ({ ...prev, permitido_gerencia: false }))}
                              className="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
                            />
                            <span className="ml-2 text-sm text-gray-700">No</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* COMPOSICIÓN NUTRICIONAL (Solo fertilizantes) */}
                {needsComposicionNutricional && (
                  <>
                    <h3 className="text-lg text-gray-800 mb-4">Composición Nutricional</h3>
                    
                    <h4 className="text-md text-gray-800 mb-3">Macronutrientes (%)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Nitrógeno (N)</label>
                        <input type="number" name="nitrogeno" value={formData.nitrogeno} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Fósforo (P)</label>
                        <input type="number" name="fosforo" value={formData.fosforo} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Potasio (K)</label>
                        <input type="number" name="potasio" value={formData.potasio} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Calcio (Ca)</label>
                        <input type="number" name="calcio" value={formData.calcio} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Magnesio (Mg)</label>
                        <input type="number" name="magnesio" value={formData.magnesio} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Azufre (S)</label>
                        <input type="number" name="azufre" value={formData.azufre} onChange={handleChange} step="0.01" min="0" max="100" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                    </div>

                    <h4 className="text-md text-gray-800 mt-6 mb-3">Micronutrientes (ppm o %)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Hierro (Fe)</label>
                        <input type="number" name="hierro" value={formData.hierro} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Manganeso (Mn)</label>
                        <input type="number" name="manganeso" value={formData.manganeso} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Zinc (Zn)</label>
                        <input type="number" name="zinc" value={formData.zinc} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Cobre (Cu)</label>
                        <input type="number" name="cobre" value={formData.cobre} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Boro (B)</label>
                        <input type="number" name="boro" value={formData.boro} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Molibdeno (Mo)</label>
                        <input type="number" name="molibdeno" value={formData.molibdeno} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="ppm" />
                      </div>
                    </div>

                    <h4 className="text-md text-gray-800 mt-6 mb-3">Otros Componentes</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Carbono Orgánico (%)</label>
                        <input type="number" name="carbono_organico" value={formData.carbono_organico} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Silicio (Si)</label>
                        <input type="number" name="silicio" value={formData.silicio} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 mb-1">Sodio (Na)</label>
                        <input type="number" name="sodio" value={formData.sodio} onChange={handleChange} step="0.01" min="0" className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary" placeholder="%" />
                      </div>
                    </div>
                  </>
                )}

                {/* Mensaje si no hay secciones técnicas */}
                {!needsIngredientesActivos && !needsComposicionNutricional && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800">
                      ℹ️ Este tipo de producto no requiere información técnica adicional.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* SECCIÓN 3: SEGURIDAD Y DOCUMENTACIÓN */}
            {currentSection === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg text-gray-800 mb-4">Seguridad y Documentación</h3>
                
                {needsSeguridad && (
                  <>
                    <h4 className="text-md text-gray-800 mb-3">Riesgos y Precauciones</h4>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="epp_alto_nivel"
                          checked={formData.epp_alto_nivel}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Requiere EPP de Alto Nivel
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="riesgo_acuatico"
                          checked={formData.riesgo_acuatico}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Riesgo para Ambientes Acuáticos
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="riesgo_vida_silvestre"
                          checked={formData.riesgo_vida_silvestre}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Riesgo para Vida Silvestre
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="riesgo_polinizador"
                          checked={formData.riesgo_polinizador}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Riesgo para Polinizadores
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          name="riesgo_transeunte"
                          checked={formData.riesgo_transeunte}
                          onChange={handleChange}
                          className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                        />
                        <label className="ml-2 text-sm text-gray-700">
                          Riesgo para Transeúntes
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <h4 className="text-md text-gray-800 mt-6 mb-3">Documentación</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Link Ficha Técnica
                    </label>
                    <input
                      type="url"
                      name="link_ficha_tecnica"
                      value={formData.link_ficha_tecnica}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">
                      Link Hoja de Seguridad (MSDS)
                    </label>
                    <input
                      type="url"
                      name="link_hoja_seguridad"
                      value={formData.link_hoja_seguridad}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                {!needsSeguridad && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <p className="text-blue-800">
                      ℹ️ Este producto no requiere información de seguridad específica.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t">
            <div>
              {currentSection > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentSection(prev => prev - 1)}
                  className="px-6 py-2 text-gray-700 hover:text-gray-900"
                >
                  ← Anterior
                </button>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setFormData(initialFormData);
                  setCurrentSection(1);
                  setError(null);
                }}
                className="px-6 py-2 text-gray-700 hover:text-gray-900"
                disabled={loading}
              >
                Cancelar
              </button>
              
              {currentSection < 3 ? (
                <button
                  type="button"
                  onClick={() => setCurrentSection(prev => prev + 1)}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark"
                >
                  Siguiente →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : (productId ? 'Actualizar Producto' : 'Crear Producto')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}