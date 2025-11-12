// types/aplicaciones.ts
// Tipos TypeScript para el módulo de Aplicaciones

export type TipoAplicacion = 'fumigacion' | 'fertilizacion' | 'drench';
export type TamanoCaneca = 20 | 200 | 500 | 1000;
export type TipoArbol = 'grandes' | 'medianos' | 'pequenos' | 'clonales';
export type EstadoAplicacion = 'Calculada' | 'En ejecución' | 'Cerrada';

// Configuración General (Paso 1)
export interface ConfiguracionAplicacion {
  nombre: string;
  tipo: TipoAplicacion;
  fecha_inicio: string;
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
  producto_unidad: 'litros' | 'kilos' | 'unidades';
  
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
  unidad: 'litros' | 'kilos' | 'unidades';
  
  inventario_actual: number;
  cantidad_necesaria: number;
  cantidad_faltante: number;
  
  presentacion_comercial: string; // ej: "Bulto de 25kg", "Tarro de 1L"
  unidades_a_comprar: number;
  
  ultimo_precio_unitario?: number;
  costo_estimado?: number;
  
  alerta?: 'sin_precio' | 'sin_stock' | 'normal';
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
export interface Aplicacion {
  id: string;
  nombre: string;
  tipo: TipoAplicacion;
  fecha_inicio: string;
  fecha_cierre?: string;
  estado: EstadoAplicacion;
  proposito?: string;
  agronomo_responsable?: string;
  
  // JSON de configuración
  configuracion: ConfiguracionAplicacion;
  mezclas: Mezcla[];
  calculos: CalculosPorLote[];
  lista_compras: ListaCompras;
  
  // Metadatos
  creado_en: string;
  creado_por: string;
  actualizado_en: string;
}

// Producto del catálogo (para selección)
export interface ProductoCatalogo {
  id: string;
  nombre: string;
  categoria: string;
  grupo: string;
  unidad_medida: 'litros' | 'kilos' | 'unidades';
  estado_fisico: 'liquido' | 'solido';
  presentacion_comercial: string;
  ultimo_precio_unitario?: number;
  cantidad_actual: number;
  
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
// MOVIMIENTOS DIARIOS (Durante Aplicación)
// ============================================================================

export interface MovimientoDiario {
  id?: string;
  aplicacion_id: string;
  fecha_movimiento: string; // ISO date string
  lote_id: string;
  lote_nombre: string;
  producto_id: string;
  producto_nombre: string;
  producto_unidad: 'litros' | 'kilos' | 'unidades';
  cantidad_utilizada: number;
  responsable: string;
  notas?: string;

  // Metadata
  creado_en?: string;
  creado_por?: string;
  actualizado_en?: string;
}

export interface ResumenMovimientosDiarios {
  producto_id: string;
  producto_nombre: string;
  total_utilizado: number;
  cantidad_planeada: number;
  diferencia: number;
  porcentaje_usado: number;
  excede_planeado: boolean;
}

export interface AlertaMovimientoDiario {
  tipo: 'warning' | 'error' | 'info';
  producto_nombre: string;
  mensaje: string;
  porcentaje_usado: number;
}