import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

// Función para normalizar texto (quitar acentos, convertir a minúsculas)
function normalizar(texto: string): string {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .trim();
}

// Función para encontrar valor correcto desde un array de valores válidos
function encontrarValorValido(valor: string, valoresValidos: string[]): string | null {
  if (!valor || valor.trim() === '') return null;
  
  const valorNormalizado = normalizar(valor);
  
  for (const valido of valoresValidos) {
    if (normalizar(valido) === valorNormalizado) {
      return valido; // Retornar el valor correcto con la capitalización apropiada
    }
  }
  
  return null;
}

// Valores válidos según el esquema de Supabase (tipos ENUM)
const CATEGORIAS_VALIDAS = [
  'Fertilizante', 'Fungicida', 'Insecticida', 'Acaricida',
  'Insecticida - Acaricida', 'Herbicida', 'Biocontrolador', 'Biológicos',
  'Coadyuvante', 'Regulador', 'Fitorregulador', 'Desinfectante',
  'Enmienda', 'Enmienda - regulador', 'Herramienta', 'Equipo',
  'Maquinaria', 'Otros'
];

const GRUPOS_VALIDOS = ['Agroinsumos', 'Herramientas', 'Maquinaria y equipo'];

const TIPOS_APLICACION_VALIDOS = ['Foliar', 'Edáfico', 'Drench'];
const ESTADOS_FISICOS_VALIDOS = ['Líquido', 'Sólido']; // CON tilde según Supabase
const UNIDADES_MEDIDA_VALIDAS = ['Litros', 'Kilos', 'Unidades']; // Con mayúscula inicial según el ENUM de BD

interface ProductoCSV {
  nombre: string;
  categoria: string;
  grupo: string;
  registro_ica?: string;
  blanco_biologico?: string;
  ingrediente_activo_1?: string;
  concentracion_ia_1?: number;
  ingrediente_activo_2?: string;
  concentracion_ia_2?: number;
  ingrediente_activo_3?: string;
  concentracion_ia_3?: number;
  periodo_reingreso_horas?: number;
  periodo_carencia_dias?: number;
  tipo_aplicacion?: string;
  estado_fisico?: string;
  permitido_gerencia?: boolean;
  nitrogeno?: number;
  fosforo?: number;
  potasio?: number;
  calcio?: number;
  magnesio?: number;
  azufre?: number;
  hierro?: number;
  manganeso?: number;
  zinc?: number;
  cobre?: number;
  boro?: number;
  molibdeno?: number;
  carbono_organico?: number;
  silicio?: number;
  sodio?: number;
  epp_alto_nivel?: boolean;
  riesgo_acuatico?: boolean;
  riesgo_vida_silvestre?: boolean;
  riesgo_polinizador?: boolean;
  riesgo_transeunte?: boolean;
  link_ficha_tecnica?: string;
  link_hoja_seguridad?: string;
  unidad_medida: string;
  presentacion_kg_l?: number;
  precio_por_presentacion?: number;
  precio_unitario?: number;
  cantidad_actual?: number;
  stock_minimo?: number;
  activo?: boolean;
}

// Parsear valor booleano
function parseBoolean(value: string): boolean {
  const v = value.toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'sí' || v === 'si' || v === 'yes';
}

// Parsear número
function parseNumber(value: string): number | null {
  if (!value || value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

// Validar fila
function validarFila(fila: any, numeroFila: number): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  // Campos obligatorios
  if (!fila.nombre || fila.nombre.trim() === '') {
    errores.push(`Fila ${numeroFila}: El nombre es obligatorio`);
  }

  const categoriaValida = encontrarValorValido(fila.categoria, CATEGORIAS_VALIDAS);
  if (!categoriaValida) {
    errores.push(
      `Fila ${numeroFila}: Categoría inválida. Debe ser una de: ${CATEGORIAS_VALIDAS.join(', ')}`
    );
  }

  const grupoValido = encontrarValorValido(fila.grupo, GRUPOS_VALIDOS);
  if (!grupoValido) {
    errores.push(
      `Fila ${numeroFila}: Grupo inválido. Debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}`
    );
  }

  const unidadMedidaValida = encontrarValorValido(fila.unidad_medida, UNIDADES_MEDIDA_VALIDAS);
  if (!unidadMedidaValida) {
    errores.push(
      `Fila ${numeroFila}: Unidad de medida inválida. Debe ser una de: ${UNIDADES_MEDIDA_VALIDAS.join(', ')}`
    );
  }

  // Validar tipo_aplicacion si está presente
  if (fila.tipo_aplicacion && fila.tipo_aplicacion.trim() !== '') {
    const tipoAplicacionValido = encontrarValorValido(fila.tipo_aplicacion, TIPOS_APLICACION_VALIDOS);
    if (!tipoAplicacionValido) {
      errores.push(
        `Fila ${numeroFila}: Tipo de aplicación inválido. Debe ser uno de: ${TIPOS_APLICACION_VALIDOS.join(', ')}`
      );
    }
  }

  // Validar estado_fisico si está presente
  if (fila.estado_fisico && fila.estado_fisico.trim() !== '') {
    const estadoFisicoValido = encontrarValorValido(fila.estado_fisico, ESTADOS_FISICOS_VALIDOS);
    if (!estadoFisicoValido) {
      errores.push(
        `Fila ${numeroFila}: Estado físico inválido. Debe ser uno de: ${ESTADOS_FISICOS_VALIDOS.join(', ')}`
      );
    }
  }

  return {
    valido: errores.length === 0,
    errores
  };
}

// Procesar CSV
export async function procesarCSV(csvData: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Remover BOM UTF-8 si existe
    let cleanData = csvData;
    if (cleanData.charCodeAt(0) === 0xFEFF) {
      cleanData = cleanData.substring(1);
    }
    
    // Parsear CSV - dividir por líneas y filtrar comentarios y vacías
    const lineas = cleanData.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
    
    if (lineas.length < 2) {
      return {
        success: false,
        message: 'El archivo CSV está vacío o no tiene datos válidos'
      };
    }

    // Función auxiliar para parsear línea CSV respetando comillas
    function parseCSVLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    }

    // Extraer headers y datos
    const headers = parseCSVLine(lineas[0]);
    const filas = lineas.slice(1);

    const productosParaInsertar: any[] = [];
    const erroresValidacion: string[] = [];

    // Procesar cada fila
    for (let i = 0; i < filas.length; i++) {
      const valores = parseCSVLine(filas[i]);
      
      // Crear objeto con los valores
      const fila: any = {};
      headers.forEach((header, idx) => {
        fila[header] = valores[idx] || '';
      });

      // Normalizar campos categóricos antes de validar
      const categoriaValida = encontrarValorValido(fila.categoria, CATEGORIAS_VALIDAS);
      const grupoValido = encontrarValorValido(fila.grupo, GRUPOS_VALIDOS);
      const unidadMedidaValida = encontrarValorValido(fila.unidad_medida, UNIDADES_MEDIDA_VALIDAS);
      const tipoAplicacionValido = fila.tipo_aplicacion ? encontrarValorValido(fila.tipo_aplicacion, TIPOS_APLICACION_VALIDOS) : null;
      const estadoFisicoValido = fila.estado_fisico ? encontrarValorValido(fila.estado_fisico, ESTADOS_FISICOS_VALIDOS) : null;

      // Validar campos obligatorios
      const erroresFila: string[] = [];
      
      if (!fila.nombre || fila.nombre.trim() === '') {
        erroresFila.push(`Fila ${i + 2}: El nombre es obligatorio`);
      }
      
      if (!categoriaValida) {
        erroresFila.push(`Fila ${i + 2}: Categoría inválida "${fila.categoria}". Debe ser una de: ${CATEGORIAS_VALIDAS.join(', ')}`);
      }
      
      if (!grupoValido) {
        erroresFila.push(`Fila ${i + 2}: Grupo inválido "${fila.grupo}". Debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}`);
      }
      
      if (!unidadMedidaValida) {
        erroresFila.push(`Fila ${i + 2}: Unidad de medida inválida "${fila.unidad_medida}". Debe ser una de: ${UNIDADES_MEDIDA_VALIDAS.join(', ')}`);
      }

      if (fila.tipo_aplicacion && fila.tipo_aplicacion.trim() !== '' && !tipoAplicacionValido) {
        erroresFila.push(`Fila ${i + 2}: Tipo de aplicación inválido "${fila.tipo_aplicacion}". Debe ser uno de: ${TIPOS_APLICACION_VALIDOS.join(', ')}`);
      }

      if (fila.estado_fisico && fila.estado_fisico.trim() !== '' && !estadoFisicoValido) {
        erroresFila.push(`Fila ${i + 2}: Estado físico inválido "${fila.estado_fisico}". Debe ser uno de: ${ESTADOS_FISICOS_VALIDOS.join(', ')}`);
      }
      
      if (erroresFila.length > 0) {
        erroresValidacion.push(...erroresFila);
        continue;
      }

      // Construir objeto de producto con valores normalizados
      const producto: any = {
        nombre: fila.nombre.trim(),
        categoria: categoriaValida!,
        grupo: grupoValido!,
        unidad_medida: unidadMedidaValida!,
        activo: fila.activo ? parseBoolean(fila.activo) : true
      };

      // Campos opcionales de texto
      if (fila.registro_ica && fila.registro_ica.trim()) producto.registro_ica = fila.registro_ica.trim();
      if (fila.blanco_biologico && fila.blanco_biologico.trim()) producto.blanco_biologico = fila.blanco_biologico.trim();
      if (fila.ingrediente_activo_1 && fila.ingrediente_activo_1.trim()) producto.ingrediente_activo_1 = fila.ingrediente_activo_1.trim();
      if (fila.ingrediente_activo_2 && fila.ingrediente_activo_2.trim()) producto.ingrediente_activo_2 = fila.ingrediente_activo_2.trim();
      if (fila.ingrediente_activo_3 && fila.ingrediente_activo_3.trim()) producto.ingrediente_activo_3 = fila.ingrediente_activo_3.trim();
      
      // Campos ENUM - solo agregar si se encontró un valor válido
      if (tipoAplicacionValido) {
        producto.tipo_aplicacion = tipoAplicacionValido;
      }
      if (estadoFisicoValido) {
        producto.estado_fisico = estadoFisicoValido;
      }
      
      if (fila.link_ficha_tecnica && fila.link_ficha_tecnica.trim()) producto.link_ficha_tecnica = fila.link_ficha_tecnica.trim();
      if (fila.link_hoja_seguridad && fila.link_hoja_seguridad.trim()) producto.link_hoja_seguridad = fila.link_hoja_seguridad.trim();

      // Números
      const concentracion_ia_1 = parseNumber(fila.concentracion_ia_1);
      if (concentracion_ia_1 !== null) producto.concentracion_ia_1 = concentracion_ia_1;

      const concentracion_ia_2 = parseNumber(fila.concentracion_ia_2);
      if (concentracion_ia_2 !== null) producto.concentracion_ia_2 = concentracion_ia_2;

      const concentracion_ia_3 = parseNumber(fila.concentracion_ia_3);
      if (concentracion_ia_3 !== null) producto.concentracion_ia_3 = concentracion_ia_3;

      const periodo_reingreso_horas = parseNumber(fila.periodo_reingreso_horas);
      if (periodo_reingreso_horas !== null) producto.periodo_reingreso_horas = Math.round(periodo_reingreso_horas);

      const periodo_carencia_dias = parseNumber(fila.periodo_carencia_dias);
      if (periodo_carencia_dias !== null) producto.periodo_carencia_dias = Math.round(periodo_carencia_dias);

      // Composición nutricional
      const nitrogeno = parseNumber(fila.nitrogeno);
      if (nitrogeno !== null) producto.nitrogeno = nitrogeno;

      const fosforo = parseNumber(fila.fosforo);
      if (fosforo !== null) producto.fosforo = fosforo;

      const potasio = parseNumber(fila.potasio);
      if (potasio !== null) producto.potasio = potasio;

      const calcio = parseNumber(fila.calcio);
      if (calcio !== null) producto.calcio = calcio;

      const magnesio = parseNumber(fila.magnesio);
      if (magnesio !== null) producto.magnesio = magnesio;

      const azufre = parseNumber(fila.azufre);
      if (azufre !== null) producto.azufre = azufre;

      const hierro = parseNumber(fila.hierro);
      if (hierro !== null) producto.hierro = hierro;

      const manganeso = parseNumber(fila.manganeso);
      if (manganeso !== null) producto.manganeso = manganeso;

      const zinc = parseNumber(fila.zinc);
      if (zinc !== null) producto.zinc = zinc;

      const cobre = parseNumber(fila.cobre);
      if (cobre !== null) producto.cobre = cobre;

      const boro = parseNumber(fila.boro);
      if (boro !== null) producto.boro = boro;

      const molibdeno = parseNumber(fila.molibdeno);
      if (molibdeno !== null) producto.molibdeno = molibdeno;

      const carbono_organico = parseNumber(fila.carbono_organico);
      if (carbono_organico !== null) producto.carbono_organico = carbono_organico;

      const silicio = parseNumber(fila.silicio);
      if (silicio !== null) producto.silicio = silicio;

      const sodio = parseNumber(fila.sodio);
      if (sodio !== null) producto.sodio = sodio;

      // Comercial
      const presentacion_kg_l = parseNumber(fila.presentacion_kg_l);
      if (presentacion_kg_l !== null) producto.presentacion_kg_l = presentacion_kg_l;

      const precio_por_presentacion = parseNumber(fila.precio_por_presentacion);
      if (precio_por_presentacion !== null) producto.precio_por_presentacion = precio_por_presentacion;

      const precio_unitario = parseNumber(fila.precio_unitario);
      if (precio_unitario !== null) producto.precio_unitario = precio_unitario;

      const cantidad_actual = parseNumber(fila.cantidad_actual);
      if (cantidad_actual !== null) producto.cantidad_actual = cantidad_actual;

      const stock_minimo = parseNumber(fila.stock_minimo);
      if (stock_minimo !== null) producto.stock_minimo = stock_minimo;

      // Booleanos
      if (fila.permitido_gerencia) producto.permitido_gerencia = parseBoolean(fila.permitido_gerencia);
      if (fila.epp_alto_nivel) producto.epp_alto_nivel = parseBoolean(fila.epp_alto_nivel);
      if (fila.riesgo_acuatico) producto.riesgo_acuatico = parseBoolean(fila.riesgo_acuatico);
      if (fila.riesgo_vida_silvestre) producto.riesgo_vida_silvestre = parseBoolean(fila.riesgo_vida_silvestre);
      if (fila.riesgo_polinizador) producto.riesgo_polinizador = parseBoolean(fila.riesgo_polinizador);
      if (fila.riesgo_transeunte) producto.riesgo_transeunte = parseBoolean(fila.riesgo_transeunte);

      productosParaInsertar.push(producto);
    }

    // Si hay errores de validación, retornar
    if (erroresValidacion.length > 0) {
      return {
        success: false,
        message: 'Se encontraron errores de validación',
        errores: erroresValidacion,
        total: filas.length,
        importados: 0
      };
    }

    // Insertar productos en la base de datos
    let productosInsertados = 0;
    const erroresInsercion: string[] = [];

    for (const producto of productosParaInsertar) {
      // Log del producto antes de insertar para debug
      console.log('Intentando insertar producto:', {
        nombre: producto.nombre,
        tipo_aplicacion: producto.tipo_aplicacion,
        estado_fisico: producto.estado_fisico,
        unidad_medida: producto.unidad_medida
      });
      
      const { error } = await supabase
        .from('productos')
        .insert(producto);

      if (error) {
        console.error('Error detallado al insertar:', error);
        if (error.code === '23505') { // Duplicate key
          erroresInsercion.push(`Producto "${producto.nombre}" ya existe en la base de datos`);
        } else {
          // Incluir el código del error para debugging
          erroresInsercion.push(`Error al insertar "${producto.nombre}": ${error.message} (código: ${error.code})`);
        }
      } else {
        productosInsertados++;
      }
    }

    return {
      success: productosInsertados > 0,
      message: productosInsertados === productosParaInsertar.length
        ? '¡Todos los productos fueron importados exitosamente!'
        : `${productosInsertados} productos importados con algunos errores`,
      importados: productosInsertados,
      total: productosParaInsertar.length,
      errores: erroresInsercion.length > 0 ? erroresInsercion : undefined
    };

  } catch (error: any) {
    console.error('Error al procesar CSV:', error);
    return {
      success: false,
      message: `Error al procesar CSV: ${error.message}`
    };
  }
}