// validation.ts - Funciones de validación para el sistema Escocia Hass

/**
 * Valida que un nombre de producto sea único en la base de datos
 */
export async function isProductNameUnique(
  supabase: any,
  nombre: string,
  excludeId?: number
): Promise<boolean> {
  try {
    let query = supabase
      .from('productos')
      .select('id')
      .eq('nombre', nombre.trim());
    
    // Si estamos editando, excluir el ID actual
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error verificando nombre único:', error);
      return false;
    }
    
    return data.length === 0;
  } catch (err) {
    console.error('Error en isProductNameUnique:', err);
    return false;
  }
}

/**
 * Valida que el stock no sea negativo
 */
export function isValidStock(cantidad: number | string): boolean {
  if (cantidad === '' || cantidad === null) return true;
  const num = typeof cantidad === 'string' ? parseFloat(cantidad) : cantidad;
  return !isNaN(num) && num >= 0;
}

/**
 * Valida que el precio no sea negativo
 */
export function isValidPrice(precio: number | string): boolean {
  if (precio === '' || precio === null) return true;
  const num = typeof precio === 'string' ? parseFloat(precio) : precio;
  return !isNaN(num) && num >= 0;
}

/**
 * Valida que haya suficiente stock para una salida
 */
export function hasEnoughStock(
  stockActual: number,
  cantidadSalida: number
): boolean {
  return stockActual >= cantidadSalida;
}

/**
 * Calcula el nuevo estado de un producto basado en stock
 */
export function calculateProductStatus(
  cantidadActual: number,
  stockMinimo: number
): string {
  if (cantidadActual === 0) return 'Sin Existencias';
  if (cantidadActual <= stockMinimo) return 'Stock Bajo';
  return 'Disponible';
}

/**
 * Valida formato de email
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida formato de URL
 */
export function isValidURL(url: string): boolean {
  if (!url || url.trim() === '') return true; // URLs opcionales
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formatea un número a moneda colombiana
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea un número con decimales
 */
export function formatNumber(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Valida que una concentración esté entre 0 y 100
 */
export function isValidConcentration(value: number | string): boolean {
  if (value === '' || value === null) return true;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return !isNaN(num) && num >= 0 && num <= 100;
}

/**
 * Genera un mensaje de alerta para stock bajo
 */
export function getStockAlert(
  nombreProducto: string,
  cantidadActual: number,
  stockMinimo: number,
  unidadMedida: string
): string {
  const diferencia = stockMinimo - cantidadActual;
  return `⚠️ ${nombreProducto}: ${cantidadActual} ${unidadMedida} (Faltan ${diferencia} ${unidadMedida} para alcanzar el mínimo)`;
}

/**
 * Valida campos requeridos de un formulario
 */
export function validateRequiredFields(
  data: Record<string, any>,
  requiredFields: string[]
): string | null {
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      return `El campo ${field} es obligatorio`;
    }
  }
  return null;
}

/**
 * Limpia y formatea datos antes de guardar en BD
 */
export function sanitizeProductData(data: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    
    // Convertir strings vacíos a null
    if (value === '') {
      cleaned[key] = null;
    }
    // Trim strings
    else if (typeof value === 'string') {
      cleaned[key] = value.trim();
    }
    // Mantener otros valores como están
    else {
      cleaned[key] = value;
    }
  });
  
  return cleaned;
}

/**
 * Valida si una salida de inventario es posible
 */
export async function canWithdrawStock(
  supabase: any,
  productId: number,
  requestedQuantity: number
): Promise<{ valid: boolean; message: string; currentStock: number }> {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('cantidad_actual, nombre, unidad_medida')
      .eq('id', productId)
      .single();

    if (error) throw error;
    
    const currentStock = data.cantidad_actual || 0;
    const valid = currentStock >= requestedQuantity;
    
    if (!valid) {
      return {
        valid: false,
        message: `No hay suficiente stock de ${data.nombre}. Disponible: ${currentStock} ${data.unidad_medida}, Solicitado: ${requestedQuantity} ${data.unidad_medida}`,
        currentStock
      };
    }
    
    return {
      valid: true,
      message: 'Stock suficiente',
      currentStock
    };
  } catch (err) {
    console.error('Error validando stock:', err);
    return {
      valid: false,
      message: 'Error al validar stock disponible',
      currentStock: 0
    };
  }
}

/**
 * Valida si un movimiento causaría stock negativo
 */
export function wouldCauseNegativeStock(
  currentStock: number,
  withdrawAmount: number
): boolean {
  return (currentStock - withdrawAmount) < 0;
}

/**
 * Calcula el costo promedio ponderado de un producto
 */
export async function getWeightedAverageCost(
  supabase: any,
  productId: number
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('detalles_compra')
      .select('cantidad, precio_unitario')
      .eq('producto_id', productId)
      .order('created_at', { ascending: false })
      .limit(10); // Últimas 10 compras

    if (error) throw error;
    if (!data || data.length === 0) return 0;

    let totalCost = 0;
    let totalQuantity = 0;

    data.forEach(purchase => {
      totalCost += purchase.cantidad * purchase.precio_unitario;
      totalQuantity += purchase.cantidad;
    });

    return totalQuantity > 0 ? totalCost / totalQuantity : 0;
  } catch (err) {
    console.error('Error calculando costo promedio:', err);
    return 0;
  }
}

/**
 * Genera una sugerencia de reorden basada en consumo histórico
 */
export async function getSuggestedReorderQuantity(
  supabase: any,
  productId: number,
  daysToAnalyze: number = 30
): Promise<{ suggested: number; reason: string }> {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - daysToAnalyze);

    // Obtener todas las salidas en el período
    const { data: movements, error } = await supabase
      .from('movimientos_inventario')
      .select('cantidad')
      .eq('producto_id', productId)
      .eq('tipo_movimiento', 'salida')
      .gte('created_at', daysAgo.toISOString());

    if (error) throw error;

    if (!movements || movements.length === 0) {
      return {
        suggested: 0,
        reason: 'No hay historial de consumo en los últimos días'
      };
    }

    // Calcular consumo total y promedio diario
    const totalConsumed = movements.reduce((sum, m) => sum + m.cantidad, 0);
    const avgDailyConsumption = totalConsumed / daysToAnalyze;

    // Sugerir stock para 60 días (2 meses)
    const suggested = Math.ceil(avgDailyConsumption * 60);

    return {
      suggested,
      reason: `Basado en consumo promedio de ${formatNumber(avgDailyConsumption, 2)}/día (últimos ${daysToAnalyze} días)`
    };
  } catch (err) {
    console.error('Error calculando sugerencia de reorden:', err);
    return {
      suggested: 0,
      reason: 'Error al calcular sugerencia'
    };
  }
}

/**
 * Valida que los porcentajes de composición nutricional no excedan 100%
 */
export function validateNutritionalComposition(data: {
  nitrogeno?: number | string;
  fosforo?: number | string;
  potasio?: number | string;
  [key: string]: any;
}): { valid: boolean; message: string } {
  const n = parseFloat(data.nitrogeno as string) || 0;
  const p = parseFloat(data.fosforo as string) || 0;
  const k = parseFloat(data.potasio as string) || 0;
  
  const total = n + p + k;
  
  if (total > 100) {
    return {
      valid: false,
      message: `La suma de N-P-K no puede exceder 100% (actual: ${total.toFixed(2)}%)`
    };
  }
  
  return { valid: true, message: 'Composición válida' };
}

/**
 * Formatea una fecha en formato legible en español
 */
export function formatDateES(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calcula el tiempo transcurrido desde una fecha (relativo)
 */
export function getTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Hace un momento';
  if (diffMins < 60) return `Hace ${diffMins} minuto${diffMins !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `Hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;
  if (diffDays < 7) return `Hace ${diffDays} día${diffDays !== 1 ? 's' : ''}`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `Hace ${weeks} semana${weeks !== 1 ? 's' : ''}`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `Hace ${months} mes${months !== 1 ? 'es' : ''}`;
  }
  
  const years = Math.floor(diffDays / 365);
  return `Hace ${years} año${years !== 1 ? 's' : ''}`;
}

/**
 * Valida un número de lote o factura
 */
export function isValidLotNumber(lotNumber: string): boolean {
  if (!lotNumber || lotNumber.trim() === '') return true; // Opcional
  // Permitir letras, números, guiones y guiones bajos
  const regex = /^[A-Za-z0-9_-]+$/;
  return regex.test(lotNumber.trim());
}

/**
 * Determina la criticidad de un nivel de stock
 */
export function getStockCriticality(
  currentStock: number,
  minStock: number
): 'critical' | 'low' | 'normal' | 'good' {
  if (currentStock === 0) return 'critical';
  if (currentStock < minStock * 0.5) return 'critical';
  if (currentStock <= minStock) return 'low';
  if (currentStock <= minStock * 1.5) return 'normal';
  return 'good';
}

/**
 * Genera un mensaje descriptivo para el nivel de stock
 */
export function getStockMessage(
  currentStock: number,
  minStock: number,
  productName: string,
  unit: string
): string {
  const criticality = getStockCriticality(currentStock, minStock);
  
  switch (criticality) {
    case 'critical':
      return `🚨 CRÍTICO: ${productName} sin stock o muy bajo (${currentStock} ${unit})`;
    case 'low':
      return `⚠️ BAJO: ${productName} por debajo del mínimo (${currentStock} ${unit}, mínimo: ${minStock} ${unit})`;
    case 'normal':
      return `✅ OK: ${productName} en nivel aceptable (${currentStock} ${unit})`;
    case 'good':
      return `✅ BUENO: ${productName} con stock saludable (${currentStock} ${unit})`;
  }
}

// ============================================================================
// VALIDACIONES PARA COMPRAS MULTI-PRODUCTO
// ============================================================================

/**
 * Interface para un item de compra
 */
export interface PurchaseItem {
  id: string;
  producto_id: string;
  cantidad: string;
  precio_unitario: string;
  lote_producto?: string;
  fecha_vencimiento?: string;
  permitido_gerencia: boolean;
}

/**
 * Valida los datos generales de una compra
 */
export function validatePurchaseData(data: {
  fecha: string;
  proveedor: string;
  numero_factura: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.fecha) {
    errors.push('La fecha es obligatoria');
  }

  if (!data.proveedor || data.proveedor.trim() === '') {
    errors.push('El proveedor es obligatorio');
  }

  if (!data.numero_factura || data.numero_factura.trim() === '') {
    errors.push('El número de factura es obligatorio');
  }

  // Validar formato de número de factura
  if (data.numero_factura && !isValidLotNumber(data.numero_factura)) {
    errors.push('El número de factura contiene caracteres no válidos');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Valida un item individual de compra
 */
export function validatePurchaseItem(
  item: PurchaseItem,
  index: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const itemLabel = `Producto ${index + 1}`;

  if (!item.producto_id || item.producto_id === '') {
    errors.push(`${itemLabel}: Debe seleccionar un producto`);
  }

  const cantidad = parseFloat(item.cantidad);
  if (isNaN(cantidad) || cantidad <= 0) {
    errors.push(`${itemLabel}: La cantidad debe ser mayor a 0`);
  }

  const precio = parseFloat(item.precio_unitario);
  if (isNaN(precio) || precio <= 0) {
    errors.push(`${itemLabel}: El precio unitario debe ser mayor a 0`);
  }

  // Validar lote si está presente
  if (item.lote_producto && !isValidLotNumber(item.lote_producto)) {
    errors.push(`${itemLabel}: El lote contiene caracteres no válidos`);
  }

  // Validar fecha de vencimiento si está presente
  if (item.fecha_vencimiento) {
    const vencimiento = new Date(item.fecha_vencimiento);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    if (vencimiento < hoy) {
      errors.push(`${itemLabel}: La fecha de vencimiento no puede ser anterior a hoy`);
    }
  }

  // Validar permitido por gerencia (obligatorio según requerimientos)
  if (!item.permitido_gerencia) {
    errors.push(`${itemLabel}: Debe marcar "Permitido por Gerencia"`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Valida todos los items de una compra
 */
export function validateAllPurchaseItems(
  items: PurchaseItem[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!items || items.length === 0) {
    errors.push('Debe agregar al menos un producto a la compra');
    return { valid: false, errors };
  }

  items.forEach((item, index) => {
    const itemValidation = validatePurchaseItem(item, index);
    if (!itemValidation.valid) {
      errors.push(...itemValidation.errors);
    }
  });

  // Validar que no haya productos duplicados
  const productIds = items.map(item => item.producto_id).filter(id => id !== '');
  const uniqueIds = new Set(productIds);
  
  if (productIds.length !== uniqueIds.size) {
    errors.push('No puede agregar el mismo producto más de una vez en la misma compra');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Calcula el subtotal de un item de compra
 */
export function calculateItemSubtotal(item: PurchaseItem): number {
  const cantidad = parseFloat(item.cantidad) || 0;
  const precio = parseFloat(item.precio_unitario) || 0;
  return cantidad * precio;
}

/**
 * Calcula el total de una compra multi-producto
 */
export function calculatePurchaseTotal(items: PurchaseItem[]): number {
  return items.reduce((total, item) => total + calculateItemSubtotal(item), 0);
}

/**
 * Valida una compra completa (datos generales + items)
 */
export function validateCompletePurchase(
  purchaseData: {
    fecha: string;
    proveedor: string;
    numero_factura: string;
  },
  items: PurchaseItem[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validar datos generales
  const dataValidation = validatePurchaseData(purchaseData);
  if (!dataValidation.valid) {
    errors.push(...dataValidation.errors);
  }

  // Validar items
  const itemsValidation = validateAllPurchaseItems(items);
  if (!itemsValidation.valid) {
    errors.push(...itemsValidation.errors);
  }

  // Validar total no sea cero
  const total = calculatePurchaseTotal(items);
  if (total === 0) {
    errors.push('El total de la compra no puede ser $0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Valida que un número de factura sea único para un proveedor
 */
export async function isPurchaseInvoiceUnique(
  supabase: any,
  numeroFactura: string,
  proveedor: string,
  excludeId?: number
): Promise<{ unique: boolean; message: string }> {
  try {
    let query = supabase
      .from('compras')
      .select('id, numero_factura, proveedor')
      .eq('numero_factura', numeroFactura.trim())
      .eq('proveedor', proveedor.trim());
    
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error verificando factura única:', error);
      return {
        unique: false,
        message: 'Error al verificar unicidad de factura'
      };
    }
    
    if (data && data.length > 0) {
      return {
        unique: false,
        message: `Ya existe una compra con la factura ${numeroFactura} del proveedor ${proveedor}`
      };
    }
    
    return {
      unique: true,
      message: 'Factura disponible'
    };
  } catch (err) {
    console.error('Error en isPurchaseInvoiceUnique:', err);
    return {
      unique: false,
      message: 'Error al verificar factura'
    };
  }
}

/**
 * Genera un resumen de una compra para confirmación
 */
export function generatePurchaseSummary(
  purchaseData: {
    fecha: string;
    proveedor: string;
    numero_factura: string;
  },
  items: PurchaseItem[],
  products: Array<{ id: number; nombre: string; unidad_medida: string }>
): string {
  const lines: string[] = [];
  
  lines.push(`📋 RESUMEN DE COMPRA`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Fecha: ${formatDateES(purchaseData.fecha)}`);
  lines.push(`Proveedor: ${purchaseData.proveedor}`);
  lines.push(`Factura: ${purchaseData.numero_factura}`);
  lines.push(``);
  lines.push(`PRODUCTOS:`);
  
  items.forEach((item, index) => {
    const product = products.find(p => p.id === parseInt(item.producto_id));
    if (product) {
      const subtotal = calculateItemSubtotal(item);
      lines.push(
        `${index + 1}. ${product.nombre} - ${item.cantidad} ${product.unidad_medida} × ${formatCurrency(parseFloat(item.precio_unitario))} = ${formatCurrency(subtotal)}`
      );
      if (item.permitido_gerencia) {
        lines.push(`   ✓ Permitido por Gerencia`);
      }
    }
  });
  
  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`TOTAL: ${formatCurrency(calculatePurchaseTotal(items))}`);
  
  return lines.join('\n');
}

/**
 * Valida que un producto exista y esté activo
 */
export async function isProductActiveAndValid(
  supabase: any,
  productId: number
): Promise<{ valid: boolean; message: string; product?: any }> {
  try {
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, activo, categoria')
      .eq('id', productId)
      .single();

    if (error || !data) {
      return {
        valid: false,
        message: 'Producto no encontrado'
      };
    }

    if (!data.activo) {
      return {
        valid: false,
        message: `El producto "${data.nombre}" está inactivo y no puede ser comprado`
      };
    }

    return {
      valid: true,
      message: 'Producto válido',
      product: data
    };
  } catch (err) {
    console.error('Error validando producto:', err);
    return {
      valid: false,
      message: 'Error al validar producto'
    };
  }
}

/**
 * Valida límites de cantidad razonables (para evitar errores de captura)
 */
export function isReasonableQuantity(
  cantidad: number,
  unidadMedida: string
): { valid: boolean; warning?: string } {
  // Límites sugeridos por unidad de medida
  const limits: Record<string, number> = {
    'kg': 10000,      // 10 toneladas
    'L': 10000,       // 10,000 litros
    'unidad': 100000, // 100k unidades
    'g': 1000000,     // 1 tonelada en gramos
    'mL': 1000000,    // 1000 litros en mL
  };

  const limit = limits[unidadMedida] || 100000;

  if (cantidad > limit) {
    return {
      valid: false,
      warning: `La cantidad (${cantidad} ${unidadMedida}) parece inusualmente alta. Por favor verifique.`
    };
  }

  return { valid: true };
}

/**
 * Valida límites de precio razonables (para evitar errores de captura)
 */
export function isReasonablePrice(precio: number): { valid: boolean; warning?: string } {
  const MIN_PRICE = 100;        // $100 COP
  const MAX_PRICE = 100000000;  // $100 millones COP

  if (precio < MIN_PRICE) {
    return {
      valid: false,
      warning: `El precio (${formatCurrency(precio)}) parece inusualmente bajo. Por favor verifique.`
    };
  }

  if (precio > MAX_PRICE) {
    return {
      valid: false,
      warning: `El precio (${formatCurrency(precio)}) parece inusualmente alto. Por favor verifique.`
    };
  }

  return { valid: true };
}
