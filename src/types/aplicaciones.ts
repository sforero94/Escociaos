// types/aplicaciones.ts
// Tipos TypeScript para el módulo de Aplicaciones

// 🚨 TIPOS CORREGIDOS SEGÚN /supabase_tablas.md
export type TipoAplicacion = 'Fumigación' | 'Fertilización' | 'Drench'; // ✅ Con mayúscula y tilde
export type TipoAplicacionLocal = 'fumigacion' | 'fertilizacion' | 'drench'; // Lowercase values used in calculator UI
export type TamanoCaneca = 20 | 200 | 500 | 1000;
export type TipoArbol = 'grandes' | 'medianos' | 'pequenos' | 'clonales';
export type EstadoAplicacion = 'Calculada' | 'En ejecución' | 'Cerrada';

// 🚨 NUEVO: Tipo ENUM para unidades de medida (normalizado en toda la BD)
export type UnidadMedida = 'Litros' | 'Kilos' | 'Unidades';

// Configuración General (Paso 1)
export interface ConfiguracionAplicacion {
  nombre: string;
  tipo?: TipoAplicacionLocal; // Lowercase value used in calculator UI
  tipo_aplicacion?: TipoAplicacion; // DB enum value (capitalized with accents)
  fecha_inicio?: string; // Convenience alias used in lista de compras / cierre views
  fecha_inicio_planeada: string;
  fecha_fin_planeada?: string;
  fecha_recomendacion?: string;
  proposito?: string;
  agronomo_responsable?: string;
  blanco_biologico: string[]; // Array de IDs de plagas/enfermedades
  lotes_seleccionados: LoteSeleccionado[];
}

export interface LoteSeleccionado {
  lote_id: string;
  nombre: string; // Cambio de lote_nombre a nombre para consistencia
  sublotes_ids?: string[]; // Cambio de sublotes a sublotes_ids para consistencia con BD
  area_hectareas: number;
  conteo_arboles: { // Cambio de arboles a conteo_arboles para consistencia
    grandes: number;
    medianos: number;
    pequenos: number;
    clonales: number;
    total: number;
  };
  // Específico de fumigación
  calibracion_litros_arbol?: number;
  tamano_caneca?: TamanoCaneca;
}

// Mezcla y Productos (Paso 2)
export interface Mezcla {
  id: string;
  nombre: string;
  numero_orden: number;
  productos: ProductoEnMezcla[];
  lotes_asignados?: string[]; // IDs de lotes asignados a esta mezcla
}

export interface ProductoEnMezcla {
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  producto_unidad: UnidadMedida; // 🚨 ACTUALIZADO: Usar tipo ENUM
  
  // Dosis según tipo de aplicación
  // Para fumigación: cc o gramos por caneca de 200L
  dosis_por_caneca?: number;
  unidad_dosis?: 'cc' | 'gramos';
  
  // Para fertilización: kilos por árbol según tamaño
  dosis_grandes?: number;
  dosis_medianos?: number;
  dosis_pequenos?: number;
  dosis_clonales?: number;
  
  // Cálculos
  cantidad_total_necesaria: number;
  inventario_disponible?: number;
  cantidad_faltante?: number;
}

// Cálculos de Aplicación
export interface CalculosPorLote {
  lote_id: string;
  lote_nombre: string;
  total_arboles: number;
  
  // Fumigación
  litros_mezcla?: number;
  numero_canecas?: number;
  
  // Fertilización
  kilos_totales?: number;
  numero_bultos?: number;
  kilos_grandes?: number;
  kilos_medianos?: number;
  kilos_pequenos?: number;
  kilos_clonales?: number;
  
  // Productos necesarios para este lote
  productos: {
    producto_id: string;
    cantidad_necesaria: number;
  }[];
}

// Lista de Compras (Paso 3)
export interface ItemListaCompras {
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  unidad: UnidadMedida; // 🚨 ACTUALIZADO: Usar tipo ENUM

  inventario_actual: number;
  cantidad_necesaria: number;
  cantidad_faltante: number;

  presentacion_comercial: string; // ej: "50 Kg", "5 L"
  unidades_a_comprar: number;

  ultimo_precio_unitario?: number;  // Precio por Kg/L (unidad base)
  precio_presentacion?: number;     // Precio por bulto/envase completo
  costo_estimado?: number;

  alerta?: 'sin_precio' | 'sin_stock' | 'normal';
  permitido_gerencia?: boolean;
}

export interface ListaCompras {
  items: ItemListaCompras[];
  costo_total_estimado: number;
  productos_sin_precio: number;
  productos_sin_stock: number;
}

// Estado completo de la calculadora
export interface EstadoCalculadora {
  paso_actual: 1 | 2 | 3;
  configuracion: ConfiguracionAplicacion | null;
  mezclas: Mezcla[];
  calculos: CalculosPorLote[];
  lista_compras: ListaCompras | null;
  guardando: boolean;
  error: string | null;
}

// Aplicación guardada en BD
// 🚨 CORREGIDO: Interfaz debe coincidir con tabla 'aplicaciones' en BD
export interface Aplicacion {
  id: string;
  codigo_aplicacion?: string | null;
  nombre_aplicacion?: string | null;
  tipo_aplicacion: TipoAplicacion;
  proposito?: string | null;
  blanco_biologico?: string | string[] | null;

  // Fechas
  fecha_inicio_planeada?: string | null;
  fecha_fin_planeada?: string | null;
  fecha_recomendacion?: string | null;
  fecha_inicio_ejecucion?: string | null;
  fecha_fin_ejecucion?: string | null;
  fecha_cierre?: string | null;

  // Estado y responsable
  estado: EstadoAplicacion | null;
  agronomo_responsable?: string | null;

  // Integración con labores
  tarea_id?: string | null;

  // Costos
  jornales_utilizados?: number | null;
  valor_jornal?: number | null;
  costo_total_insumos?: number | null;
  costo_total_mano_obra?: number | null;
  costo_total?: number | null;
  costo_por_arbol?: number | null;
  arboles_jornal?: number | null;
  observaciones_cierre?: string | null;

  // Auditoría
  created_at?: string | null;
  updated_at?: string | null;

  // Computed / hydrated fields (populated when loading from BD with joins)
  fecha_inicio?: string; // Convenience field: fecha_recomendacion || created_at
  configuracion?: ConfiguracionAplicacion; // Hydrated config with lotes_seleccionados
  mezclas?: Mezcla[]; // Hydrated mezclas from aplicaciones_mezclas + productos
  calculos?: CalculosPorLote[]; // Hydrated from aplicaciones_calculos
  lista_compras?: ListaCompras; // Hydrated from aplicaciones_compras

  // Legacy/convenience aliases
  creado_en?: string;
  creado_por?: string;
  actualizado_en?: string;
}

// Producto del catálogo (para selección)
export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  grupo: string;
  unidad_medida: UnidadMedida; // 🚨 ACTUALIZADO: Usar tipo ENUM
  estado_fisico: 'liquido' | 'solido';
  presentacion_comercial: string;
  ultimo_precio_unitario?: number;  // Precio por Kg/L (unidad base)
  precio_presentacion?: number;     // Precio por bulto/envase completo
  cantidad_actual: number;
  permitido_gerencia?: boolean;

  // Para mostrar en UI
  display_nombre?: string; // "Producto (Categoría) - Stock: X"
}

// Lote del catálogo (para selección)
export interface LoteCatalogo {
  id: string;
  nombre: string;
  area_hectareas: number;
  sublotes: {
    id: string;
    nombre: string;
  }[];
  conteo_arboles: {
    grandes: number;
    medianos: number;
    pequenos: number;
    clonales: number;
    total: number;
  };
}

// Plaga/Enfermedad del catálogo (para selección)
export interface BlancoBiologico {
  id: string;
  nombre: string;
  tipo: string;
  descripcion?: string;
  link_info?: string;
  activo?: boolean;
}

// ============================================================================
// MOVIMIENTOS DIARIOS (Durante ejecución de aplicación)
// ============================================================================

export interface MovimientoDiario {
  id?: string;
  aplicacion_id: string;
  fecha_movimiento: string; // ISO date string (YYYY-MM-DD)
  lote_id: string;
  lote_nombre: string;
  numero_canecas?: number; // Número total de canecas aplicadas (fumigación) - NULL para fertilización
  numero_bultos?: number; // Número total de bultos usados (fertilización/drench) - NULL para fumigación
  responsable: string;
  notas?: string;
  condiciones_meteorologicas?: string;

  // Denormalized product fields (used in flat MovimientoDiario lists for utils/CSV export)
  producto_id?: string;
  producto_nombre?: string;
  producto_categoria?: string;
  producto_unidad?: UnidadMedida;
  cantidad_utilizada?: number;
  numero_canecas_utilizadas?: number;
  numero_canecas_planeadas?: number;

  // Metadata
  created_at?: string;
  created_by?: string;
  creado_en?: string; // Legacy alias for created_at
}

export interface MovimientoDiarioProducto {
  id?: string;
  movimiento_diario_id: string;
  producto_id: string;
  producto_nombre: string;
  producto_categoria: string;
  cantidad_utilizada: number;
  unidad: UnidadMedida; // DB enum: 'Litros' | 'Kilos' | 'Unidades'
  created_at?: string | null;
}

export type FraccionJornal = '0.0' | '0.25' | '0.5' | '0.75' | '1.0';

export interface MovimientoDiarioTrabajador {
  id?: string;
  movimiento_diario_id: string;
  empleado_id?: string | null;      // NULL if contractor
  contratista_id?: string | null;   // NULL if employee
  lote_id: string;
  fraccion_jornal: FraccionJornal;  // ENUM type in PostgreSQL
  observaciones?: string;
  valor_jornal_trabajador?: number; // Worker daily wage (salary or tarifa_jornal)
  costo_jornal?: number;            // Calculated cost for this fraction
  created_at?: string;
}

export interface ResumenMovimientoDiario {
  producto_id: string;
  producto_nombre: string;
  producto_unidad: UnidadMedida; // 🚨 ACTUALIZADO: Usar tipo ENUM
  total_utilizado: number;
  cantidad_planeada: number;
  diferencia: number;
  porcentaje_usado: number;
  excede_planeado: boolean;
}

export interface AlertaMovimiento {
  tipo: 'warning' | 'error' | 'info';
  producto_nombre: string;
  mensaje: string;
  porcentaje_usado: number;
}

// ============================================================================
// CIERRE DE APLICACIÓN
// ============================================================================

export interface JornalesPorActividad {
  aplicacion: number; // Jornales para aplicar el producto
  mezcla: number; // Jornales para preparar mezclas
  transporte: number; // Jornales para transporte
  otros?: number; // Otros jornales
}

export interface DetalleCierreLote {
  lote_id: string;
  lote_nombre: string;
  
  // Datos planeados (de cálculos)
  canecas_planeadas?: number;
  litros_planeados?: number;
  kilos_planeados?: number;
  
  // Datos reales (de movimientos diarios)
  canecas_reales?: number;
  litros_reales?: number;
  kilos_reales?: number;
  
  // Jornales por lote
  jornales: JornalesPorActividad;
  
  // Costos calculados
  costo_insumos: number;
  costo_mano_obra: number;
  costo_total: number;
  costo_por_arbol: number;
  
  // Desviaciones (%)
  desviacion_canecas?: number;
  desviacion_litros?: number;
  desviacion_kilos?: number;
  
  // Eficiencias
  arboles_por_jornal?: number;
  litros_por_arbol?: number;
  kilos_por_arbol?: number;
}

export interface ComparacionProducto {
  producto_id: string;
  producto_nombre: string;
  producto_unidad: UnidadMedida; // 🚨 ACTUALIZADO: Usar tipo ENUM
  cantidad_planeada: number;
  cantidad_real: number;
  diferencia: number;
  porcentaje_desviacion: number;
  costo_unitario?: number;
  costo_total: number;
}

export interface CierreAplicacion {
  id?: string;
  aplicacion_id: string;
  
  // Datos generales
  fecha_inicio: string; // Referencia de la aplicación
  fecha_final: string;
  dias_aplicacion: number;
  valor_jornal: number;
  
  // Jornales totales
  jornales_totales: JornalesPorActividad;
  
  // Observaciones
  observaciones_generales?: string;
  condiciones_meteorologicas?: string;
  problemas_encontrados?: string;
  ajustes_realizados?: string;
  
  // Detalles por lote
  detalles_lotes: DetalleCierreLote[];
  
  // Comparación de productos
  comparacion_productos: ComparacionProducto[];
  
  // Totales calculados
  costo_insumos_total: number;
  costo_mano_obra_total: number;
  costo_total: number;
  costo_promedio_por_arbol: number;
  
  // Eficiencias globales
  total_arboles_tratados: number;
  total_jornales: number;
  arboles_por_jornal: number;
  
  // Alertas y validaciones
  requiere_aprobacion: boolean; // true si desviación > 20%
  desviacion_maxima: number; // Mayor desviación encontrada
  aprobado_por?: string; // UUID del usuario que aprobó
  fecha_aprobacion?: string;
  
  // Metadata
  created_at?: string;
  created_by?: string;
  updated_at?: string;
}

export interface ResumenCierre {
  total_movimientos: number;
  total_productos: number;
  total_lotes: number;
  dias_ejecucion: number;
  desviacion_promedio: number;
  productos_con_desviacion_alta: number; // > 20%
  alertas: string[];
}

// ============================================================================
// CIERRE UNIFICADO - Registros de trabajo para revisión en cierre
// ============================================================================

export interface RegistroTrabajoCierre {
  id?: string;
  tarea_id: string;
  empleado_id?: string;
  contratista_id?: string;
  trabajador_nombre: string;
  trabajador_tipo: 'empleado' | 'contratista';
  lote_id: string;
  lote_nombre: string;
  fecha_trabajo: string;
  fraccion_jornal: number;
  costo_jornal: number;
  observaciones?: string;
  // Datos del trabajador para recálculos
  salario?: number;
  prestaciones?: number;
  auxilios?: number;
  horas_semanales?: number;
  tarifa_jornal?: number;
  // Flags de edición durante cierre
  _isNew?: boolean;
  _deleted?: boolean;
  _modified?: boolean;
}

export interface ResumenLaboresCierre {
  tarea_id: string;
  registros: RegistroTrabajoCierre[];
  porLote: {
    lote_id: string;
    lote_nombre: string;
    total_jornales: number;
    total_costo: number;
  }[];
  totalJornales: number;
  totalCosto: number;
  diasTrabajados: number;
  trabajadoresUnicos: number;
}