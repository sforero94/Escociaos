// ARCHIVO: utils/csvMonitoreo.ts
// DESCRIPCIÓN: Parser y validador de CSV, mapeo de datos y carga a Supabase
// Propósito: Procesar archivos CSV de monitoreo y cargarlos a la base de datos
// DEPENDENCIA: Requiere papaparse (npm install papaparse @types/papaparse)

import Papa from 'papaparse';
import { CSVRowRaw, ValidationResult, Monitoreo } from '../types/monitoreo';
import { calcularIncidencia, calcularSeveridad, clasificarGravedad } from './calculosMonitoreo';

// Mapeo de columnas del CSV - maneja múltiples variantes de nombres
function obtenerValorColumna(row: any, posiblesNombres: string[]): string {
  for (const nombre of posiblesNombres) {
    if (row[nombre] !== undefined) {
      return row[nombre];
    }
  }
  return '';
}

// Helper MEJORADO: búsqueda inteligente de columnas con normalización
function obtenerValorColumnaFlexible(row: any, buscar: string): string {
  const columnas = Object.keys(row);
  
  // Normalizar texto: minúsculas, sin tildes, sin espacios extras, sin letras finales A/B/C
  const normalizarTexto = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Quitar tildes
      .replace(/\n/g, ' ')               // Reemplazar saltos de línea por espacio
      .replace(/\s+/g, ' ')              // Normalizar espacios múltiples
      .replace(/\s+[abc]$/i, '')         // Quitar letras A, B, C al final
      .trim();
  };
  
  const buscarNorm = normalizarTexto(buscar);
  
  // Buscar la columna que contenga el texto buscado
  const columnaEncontrada = columnas.find(col => {
    const colNorm = normalizarTexto(col);
    return colNorm === buscarNorm || colNorm.includes(buscarNorm) || buscarNorm.includes(colNorm);
  });
  
  if (columnaEncontrada) {
    console.log(`✅ [obtenerValorColumnaFlexible] Match: "${buscar}" → "${columnaEncontrada}" = "${row[columnaEncontrada]}"`);
    return row[columnaEncontrada];
  }
  
  console.warn(`⚠️ [obtenerValorColumnaFlexible] No encontrado: "${buscar}". Columnas disponibles:`, columnas);
  return '';
}

export async function parseCSVFile(file: File): Promise<CSVRowRaw[]> {
  return new Promise((resolve, reject) => {
    console.log('🔵 [csvMonitoreo] Iniciando parse de:', file.name);
    
    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          console.log('✅ [csvMonitoreo] Papa.parse completado');
          console.log('🔍 [csvMonitoreo] Total de filas:', results.data.length);
          
          // Mostrar las columnas detectadas
          if (results.data.length > 0) {
            const primeraFila = results.data[0] as any;
            console.log('🔍 [csvMonitoreo] Columnas detectadas:', Object.keys(primeraFila));
            console.log('🔍 [csvMonitoreo] Primera fila:', primeraFila);
          }
          
          const data = results.data as CSVRowRaw[];
          console.log('✅ [csvMonitoreo] Filas procesadas:', data.length);
          
          resolve(data);
        },
        error: (error) => {
          console.error('❌ [csvMonitoreo] Error en Papa.parse:', error);
          reject(error);
        }
      });
    } catch (error) {
      console.error('❌ [csvMonitoreo] Excepción en parseCSVFile:', error);
      reject(error);
    }
  });
}

export function validarEstructuraCSV(data: CSVRowRaw[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!data || data.length === 0) {
    errors.push('El archivo CSV está vacío');
    return {
      isValid: false,
      errors,
      warnings,
      stats: {
        totalRows: 0,
        lotes: 0,
        sublotes: 0,
        plagas: 0,
        fechaInicio: null,
        fechaFin: null
      }
    };
  }
  
  const firstRow = data[0];
  console.log('🔍 [validarEstructuraCSV] Columnas en CSV:', Object.keys(firstRow));
  
  // Validar columnas EXACTAS requeridas
  const columnasRequeridas = [
    'Fecha de monitoreo',
    'Lote',
    'Sublote',
    'Plaga o enfermedad',
    'Arboles Monitoreados',
    'Arboles Afectados',
    'Individuos Encontrados'
  ];
  
  columnasRequeridas.forEach(col => {
    if (!(col in firstRow)) {
      errors.push(`Falta la columna requerida: "${col}". Descarga el template para ver el formato correcto.`);
    }
  });
  
  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings,
      stats: {
        totalRows: data.length,
        lotes: 0,
        sublotes: 0,
        plagas: 0,
        fechaInicio: null,
        fechaFin: null
      }
    };
  }
  
  const lotes = new Set(data.map(r => r.Lote).filter(Boolean));
  const sublotes = new Set(data.map(r => r.Sublote).filter(Boolean));
  const plagas = new Set(data.map(r => r['Plaga o enfermedad']).filter(Boolean));
  
  const fechas = data
    .map(r => parseFecha(r['Fecha de monitoreo']))
    .filter(f => f !== null) as Date[];
  
  const fechaInicio = fechas.length > 0 ? new Date(Math.min(...fechas.map(f => f.getTime()))) : null;
  const fechaFin = fechas.length > 0 ? new Date(Math.max(...fechas.map(f => f.getTime()))) : null;
  
  data.forEach((row, index) => {
    if (!row['Fecha de monitoreo']) {
      warnings.push(`Fila ${index + 1}: Sin fecha de monitoreo`);
    }
    if (!row.Monitor) {
      warnings.push(`Fila ${index + 1}: Sin monitor asignado`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRows: data.length,
      lotes: lotes.size,
      sublotes: sublotes.size,
      plagas: plagas.size,
      fechaInicio,
      fechaFin
    }
  };
}

function parseFecha(fechaStr: string): Date | null {
  if (!fechaStr) return null;
  
  const parts = fechaStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    return new Date(year, month, day);
  }
  
  return null;
}

function parseNumero(str: string): number {
  if (!str) return 0;
  const cleaned = str.toString().replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function parseEntero(str: string): number {
  if (!str) return 0;
  const cleaned = str.toString().replace(',', '.');
  const numero = parseFloat(cleaned) || 0;
  return Math.round(numero); // Redondear al entero más cercano
}

export async function procesarYGuardarCSV(
  file: File,
  supabase: any
): Promise<{ success: boolean; message: string; insertados: number }> {
  try {
    console.log('🔵 [procesarYGuardarCSV] Iniciando procesamiento...');
    
    const csvData = await parseCSVFile(file);
    console.log('✅ [procesarYGuardarCSV] CSV parseado:', csvData.length, 'filas');
    
    const validation = validarEstructuraCSV(csvData);
    console.log('🔍 [procesarYGuardarCSV] Validación:', validation.isValid ? 'OK' : 'FALLA');
    
    if (!validation.isValid) {
      console.log('❌ [procesarYGuardarCSV] Errores de validación:', validation.errors);
      return {
        success: false,
        message: `Errores en CSV: ${validation.errors.join(', ')}`,
        insertados: 0
      };
    }
    
    console.log('🔵 [procesarYGuardarCSV] Mapeando lotes y sublotes...');
    const { lotesMap, sublotesMap, sublotesFaltantes } = await mapearLotesYSublotes(csvData, supabase);
    console.log('✅ [procesarYGuardarCSV] Lotes mapeados:', lotesMap.size);
    console.log('✅ [procesarYGuardarCSV] Sublotes mapeados:', sublotesMap.size);
    
    // Si hay sublotes faltantes, informar al usuario
    if (sublotesFaltantes.length > 0) {
      const mensajeFaltantes = sublotesFaltantes
        .slice(0, 5) // Mostrar máximo 5
        .map(s => `"${s.sublote}" en lote "${s.lote}"`)
        .join(', ');
      
      const total = sublotesFaltantes.length;
      const mensaje = total > 5 
        ? `${mensajeFaltantes} y ${total - 5} más. Crea estos sublotes en Configuración → Sublotes.`
        : `${mensajeFaltantes}. Crea estos sublotes en Configuración → Sublotes.`;
      
      console.warn('⚠️ [procesarYGuardarCSV] Sublotes faltantes:', sublotesFaltantes);
      return {
        success: false,
        message: `Sublotes no encontrados en la base de datos: ${mensaje}`,
        insertados: 0
      };
    }
    
    console.log('🔵 [procesarYGuardarCSV] Mapeando plagas...');
    const plagasMap = await mapearPlagas(csvData, supabase);
    console.log('✅ [procesarYGuardarCSV] Plagas mapeadas:', plagasMap.size);
    
    console.log('🔵 [procesarYGuardarCSV] Transformando filas...');
    const monitoreos = csvData
      .map((row, index) => {
        const resultado = transformarFila(row, lotesMap, sublotesMap, plagasMap);
        if (!resultado && index < 5) {
          console.log('⚠️ [procesarYGuardarCSV] Fila', index, 'no transformada:', row);
        }
        return resultado;
      })
      .filter(m => m !== null) as Omit<Monitoreo, 'id'>[];
    
    console.log('✅ [procesarYGuardarCSV] Filas transformadas:', monitoreos.length, 'de', csvData.length);
    console.log('🔍 [procesarYGuardarCSV] Primera fila transformada:', monitoreos[0]);
    
    // 🔴 VALIDACIÓN CRÍTICA: Verificar que NO se estén enviando campos inexistentes
    console.log('🔴🔴🔴 [VALIDACIÓN CRÍTICA] Versión del código: 2024-11-18-v3 FINAL');
    console.log('🔴🔴🔴 [VALIDACIÓN CRÍTICA] Campos que se van a insertar:', Object.keys(monitoreos[0] || {}));
    console.log('🔴🔴🔴 [VALIDACIÓN CRÍTICA] Campos permitidos: fecha_monitoreo, lote_id, sublote_id, plaga_enfermedad_id, arboles_monitoreados, arboles_afectados, individuos_encontrados, gravedad_texto, gravedad_numerica, observaciones, monitor');
    console.log('🔴🔴🔴 [VALIDACIÓN CRÍTICA] Campos OMITIDOS (generados por PostgreSQL): incidencia, severidad');
    
    // Verificar que NO haya campos prohibidos
    const camposProhibidos = ['lote_nombre', 'sublote_nombre', 'plaga_nombre', 'incidencia', 'severidad'];
    const primeraFila = monitoreos[0] || {};
    const tieneProhibidos = camposProhibidos.some(campo => campo in primeraFila);
    if (tieneProhibidos) {
      console.error('🔴🔴🔴 [ERROR CRÍTICO] Se detectaron campos PROHIBIDOS en el objeto a insertar!');
      console.error('🔴🔴🔴 Esto significa que el navegador tiene CACHE del código ANTIGUO');
      console.error('🔴🔴🔴 SOLUCIÓN: Presiona Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac) para HARD RELOAD');
      throw new Error('CÓDIGO DESACTUALIZADO: Recarga la página con Ctrl+Shift+R');
    }
    
    console.log('🔵 [procesarYGuardarCSV] Insertando en Supabase...');
    const { data, error } = await supabase
      .from('monitoreos')
      .insert(monitoreos)
      .select();
    
    if (error) {
      console.error('❌ [procesarYGuardarCSV] Error en insert:', error);
      throw error;
    }
    
    console.log('✅ [procesarYGuardarCSV] Insertados:', data?.length || monitoreos.length, 'registros');
    
    return {
      success: true,
      message: `${monitoreos.length} registros cargados exitosamente`,
      insertados: monitoreos.length
    };
    
  } catch (error) {
    console.error('❌ [procesarYGuardarCSV] Excepción:', error);
    console.error('❌ [procesarYGuardarCSV] Stack:', error instanceof Error ? error.stack : 'No stack');
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Desconocido'}`,
      insertados: 0
    };
  }
}

async function mapearLotesYSublotes(csvData: CSVRowRaw[], supabase: any) {
  console.log('🔵 [mapearLotesYSublotes] Obteniendo lotes de BD...');
  const { data: lotes } = await supabase
    .from('lotes')
    .select('id, nombre');
  
  console.log('🔵 [mapearLotesYSublotes] Obteniendo sublotes de BD...');
  const { data: sublotes } = await supabase
    .from('sublotes')
    .select('id, nombre, lote_id');
  
  console.log('🔍 [mapearLotesYSublotes] Lotes en BD:', lotes?.map((l: any) => l.nombre));
  console.log('🔍 [mapearLotesYSublotes] Sublotes en BD:', sublotes?.map((s: any) => ({ nombre: s.nombre, lote_id: s.lote_id })));
  
  // Obtener nombres únicos del CSV usando nombres exactos de columnas
  const lotesEnCSV = [...new Set(
    csvData.map(r => r.Lote).filter(Boolean)
  )];
  const sublotesEnCSV = [...new Set(
    csvData.map(r => r.Sublote).filter(Boolean)
  )];
  
  console.log('🔍 [mapearLotesYSublotes] Lotes en CSV:', lotesEnCSV.slice(0, 10), `(${lotesEnCSV.length} únicos)`);
  console.log('🔍 [mapearLotesYSublotes] Sublotes en CSV:', sublotesEnCSV.slice(0, 10), `(${sublotesEnCSV.length} únicos)`);
  
  // Crear mapeo INTELIGENTE de lotes (exacto o parcial)
  const lotesMap = new Map<string, string>();
  lotesEnCSV.forEach(nombreCSV => {
    // Buscar match exacto primero
    const matchExacto = lotes?.find((l: any) => l.nombre === nombreCSV);
    if (matchExacto) {
      lotesMap.set(nombreCSV, matchExacto.id);
      console.log('✅ [mapearLotesYSublotes] Match exacto lote:', nombreCSV, '→', matchExacto.nombre);
      return;
    }
    
    // Si no hay match exacto, buscar por inclusión (ej: "1. Piedra Paula" contiene "Piedra Paula")
    const matchParcial = lotes?.find((l: any) => 
      nombreCSV.includes(l.nombre) || l.nombre.includes(nombreCSV)
    );
    if (matchParcial) {
      lotesMap.set(nombreCSV, matchParcial.id);
      console.log('⚠️ [mapearLotesYSublotes] Match parcial lote:', nombreCSV, '→', matchParcial.nombre);
      return;
    }
    
    console.log('❌ [mapearLotesYSublotes] Sin match para lote:', nombreCSV);
  });
  
  // Crear mapeo de sublotes por LOTE+SUBLOTE (key compuesta)
  // Formato de key: "lote_id|nombre_sublote"
  const sublotesMap = new Map<string, any>();
  sublotes?.forEach((s: any) => {
    const key = `${s.lote_id}|${s.nombre}`;
    sublotesMap.set(key, s);
  });
  
  console.log('✅ [mapearLotesYSublotes] Mapa de sublotes creado:', sublotesMap.size, 'entradas');
  
  // Identificar sublotes faltantes
  const sublotesFaltantes: { lote: string, sublote: string }[] = [];
  const sublotesFaltantesSet = new Set<string>();
  
  csvData.forEach(row => {
    const loteNombre = row.Lote;
    const subloteNombre = row.Sublote;
    
    const loteId = lotesMap.get(loteNombre);
    if (!loteId) return;
    
    const subloteKey = `${loteId}|${subloteNombre}`;
    const uniqueKey = `${loteNombre}|${subloteNombre}`; // Para evitar duplicados en el mensaje
    
    if (!sublotesMap.has(subloteKey) && !sublotesFaltantesSet.has(uniqueKey)) {
      sublotesFaltantes.push({ lote: loteNombre, sublote: subloteNombre });
      sublotesFaltantesSet.add(uniqueKey);
    }
  });
  
  return { lotesMap, sublotesMap, sublotesFaltantes };
}

async function mapearPlagas(csvData: CSVRowRaw[], supabase: any) {
  // Obtener plagas únicas del CSV usando nombre exacto de columna
  const plagasUnicas = [...new Set(
    csvData.map(r => r['Plaga o enfermedad']).filter(Boolean)
  )];
  
  const { data: plagasExistentes } = await supabase
    .from('plagas_enfermedades_catalogo')
    .select('id, nombre');
  
  const plagasMap = new Map(plagasExistentes?.map((p: any) => [p.nombre, p.id]) || []);
  
  const plagasFaltantes = plagasUnicas.filter(p => !plagasMap.has(p));
  
  if (plagasFaltantes.length > 0) {
    const { data: nuevasPlagas } = await supabase
      .from('plagas_enfermedades_catalogo')
      .insert(plagasFaltantes.map(nombre => ({ nombre, activo: true })))
      .select('id, nombre');
    
    nuevasPlagas?.forEach((p: any) => plagasMap.set(p.nombre, p.id));
  }
  
  return plagasMap;
}

function transformarFila(
  row: CSVRowRaw,
  lotesMap: Map<string, string>,
  sublotesMap: Map<string, any>,
  plagasMap: Map<string, string>
): Omit<Monitoreo, 'id'> | null {
  // Usar nombres EXACTOS de columnas del template
  const fechaStr = row['Fecha de monitoreo'];
  const fecha = parseFecha(fechaStr);
  if (!fecha) return null;
  
  const loteNombre = row.Lote;
  const subloteNombre = row.Sublote;
  const plagaNombre = row['Plaga o enfermedad'];
  const monitorNombre = row.Monitor || null;
  const observaciones = row.Observaciones || null;
  
  const loteId = lotesMap.get(loteNombre);
  if (!loteId) {
    console.log('❌ [transformarFila] Lote no encontrado:', loteNombre);
    return null;
  }
  
  // Buscar sublote usando key compuesta: lote_id|nombre_sublote
  const subloteKey = `${loteId}|${subloteNombre}`;
  const subloteData = sublotesMap.get(subloteKey);
  if (!subloteData) {
    console.log('❌ [transformarFila] Sublote no encontrado:', { lote: loteNombre, sublote: subloteNombre, key: subloteKey });
    return null;
  }
  
  const plagaId = plagasMap.get(plagaNombre);
  if (!plagaId) {
    console.log('❌ [transformarFila] Plaga no encontrada:', plagaNombre);
    return null;
  }
  
  // Usar nombres EXACTOS de columnas del template
  const arbolesMonitoreados = parseEntero(row['Arboles Monitoreados']);
  const arbolesAfectados = parseEntero(row['Arboles Afectados']);
  const individuos = parseEntero(row['Individuos Encontrados']);
  
  const incidencia = calcularIncidencia(arbolesAfectados, arbolesMonitoreados);
  const severidad = calcularSeveridad(individuos, arbolesAfectados);
  const gravedad = clasificarGravedad(incidencia);
  
  // SOLO campos que existen en la tabla monitoreos según supabase_tablas.md
  // ⚠️ IMPORTANTE: incidencia y severidad son GENERATED COLUMNS en PostgreSQL
  // NO se deben insertar, la BD las calcula automáticamente
  return {
    fecha_monitoreo: fecha,
    lote_id: loteId,
    sublote_id: subloteData.id,
    plaga_enfermedad_id: plagaId,
    arboles_monitoreados: arbolesMonitoreados,
    arboles_afectados: arbolesAfectados,
    individuos_encontrados: individuos,
    // incidencia: OMITIDO - columna generada por PostgreSQL
    // severidad: OMITIDO - columna generada por PostgreSQL
    gravedad_texto: gravedad.texto,
    gravedad_numerica: gravedad.numerica,
    observaciones: observaciones,
    monitor: monitorNombre,
  };
}