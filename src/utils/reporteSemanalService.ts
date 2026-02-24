// utils/reporteSemanalService.ts
// Servicio para generar y almacenar reportes semanales
// Flujo: Frontend → Edge Function (Gemini) → HTML → PDF → Supabase Storage

import { getSupabase, getCurrentUser } from './supabase/client';
import { projectId, publicAnonKey } from './supabase/info.tsx';
import type {
  DatosReporteSemanal,
  GenerateReportResponse,
  ReporteSemanalMetadata,
} from '../types/reporteSemanal';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

// URL base del Edge Function (matches pattern used by all other working endpoints)
const EDGE_FUNCTION_BASE = `https://${projectId}.supabase.co/functions/v1`;

// ============================================================================
// LLAMADA AL EDGE FUNCTION
// ============================================================================

/**
 * Llama al Edge Function para generar el HTML del reporte via Gemini
 */
export async function generarHTMLReporte(
  datos: DatosReporteSemanal,
  instrucciones?: string
): Promise<GenerateReportResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  console.log('[ReporteSemanal] Iniciando generación HTML via Edge Function...');

  try {
    const response = await fetch(
      `${EDGE_FUNCTION_BASE}/make-server-1ccce916/reportes/generar-semanal`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({ datos, instrucciones }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);
    console.log('[ReporteSemanal] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error || `Error del servidor: ${response.status}`;
      console.error('[ReporteSemanal] Error response:', message);

      if (response.status === 504 || response.status === 502) {
        throw new Error(
          'El servidor tardó demasiado en responder. La generación del reporte excedió el tiempo límite. Intenta de nuevo.'
        );
      }
      throw new Error(message);
    }

    const result = await response.json();
    console.log('[ReporteSemanal] Result success:', result.success, 'HTML length:', result.html?.length || 0);

    if (!result.success) {
      throw new Error(result.error || 'Error al generar el reporte');
    }

    if (!result.html || result.html.trim().length === 0) {
      throw new Error('El servidor devolvió un reporte vacío. Intenta generar de nuevo.');
    }

    return {
      html: result.html,
      tokens_usados: result.tokens_usados,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error('[ReporteSemanal] Request timed out after 90s');
      throw new Error(
        'La generación del reporte tardó demasiado (más de 90 segundos). Intenta de nuevo.'
      );
    }
    throw error;
  }
}

// ============================================================================
// CONVERSIÓN HTML → PDF
// ============================================================================

/**
 * Convierte HTML a PDF usando html2pdf.js (cargado dinámicamente)
 * Retorna un Blob con el PDF generado
 */
export async function convertirHTMLaPDF(html: string): Promise<Blob> {
  // Importar html2pdf.js dinámicamente
  const html2pdf = (await import('html2pdf.js')).default;

  // Crear un contenedor temporal para renderizar el HTML
  // Formato Slides 16:9: 1280px width
  // Nota: opacity debe ser 1 (no 0) para que html2canvas pueda capturar el contenido
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1280px';
  container.style.zIndex = '-9999';
  container.style.opacity = '1';
  container.style.pointerEvents = 'none';
  container.style.overflow = 'visible';
  document.body.appendChild(container);

  try {
    // Dar tiempo al browser para renderizar el contenido
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Verificar que el contenedor tiene dimensiones válidas
    const rect = container.getBoundingClientRect();
    if (rect.height < 10) {
      console.warn('[ReporteSemanal] Container height near zero, waiting more...');
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const worker = html2pdf()
      .set({
        margin: 0, // No margins for strict 16:9 slides
        filename: 'reporte-semanal-slides.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          width: 1280,
          windowWidth: 1280,
        },
        jsPDF: {
          unit: 'px',
          format: [1280, 720],
          orientation: 'landscape',
        },
        pagebreak: {
          mode: ['css'],
          before: ['.page-break'],
        },
      } as any)
      .from(container);

    // Usar toPdf().output('blob') que retorna un Blob real
    const pdfBlob: Blob = await worker.toPdf().output('blob');

    console.log('[ReporteSemanal] PDF generado:', pdfBlob.size, 'bytes, type:', pdfBlob.type);
    return pdfBlob;
  } finally {
    document.body.removeChild(container);
  }
}

// ============================================================================
// ALMACENAMIENTO EN SUPABASE STORAGE
// ============================================================================

/**
 * Sube el PDF a Supabase Storage y guarda los metadatos en la tabla
 */
export async function guardarReportePDF(
  pdfBlob: Blob,
  datos: DatosReporteSemanal
): Promise<ReporteSemanalMetadata> {
  const supabase = getSupabase();
  const user = await getCurrentUser();

  console.log('[guardarReportePDF] Starting save process...');
  console.log('[guardarReportePDF] User:', user?.id || 'NOT AUTHENTICATED');

  if (!user) {
    throw new Error('No hay usuario autenticado - Cannot save report without user session');
  }

  if (!user.id) {
    throw new Error('Usuario autenticado pero sin ID válido');
  }

  const { semana } = datos;
  const fileName = `reporte-slides-semana-${semana.ano}-S${String(semana.numero).padStart(2, '0')}.pdf`;
  const storagePath = `${semana.ano}/${fileName}`;

  console.log('[guardarReportePDF] Storage path:', storagePath);
  console.log('[guardarReportePDF] Semana:', semana);

  // Subir PDF a Storage
  console.log('[guardarReportePDF] Uploading PDF to Storage...');
  const { error: uploadError } = await supabase.storage
    .from('reportes-semanales')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true, // Sobrescribir si ya existe (regeneración)
    });

  if (uploadError) {
    console.error('[guardarReportePDF] Storage upload error:', uploadError);
    throw new Error(`Error al subir PDF: ${uploadError.message}`);
  }
  console.log('[guardarReportePDF] PDF uploaded successfully');

  // Guardar metadatos en la tabla
  console.log('[guardarReportePDF] Saving metadata to reportes_semanales...');
  console.log('[guardarReportePDF] User ID for generado_por:', user.id);

  const insertData = {
    fecha_inicio: semana.inicio,
    fecha_fin: semana.fin,
    numero_semana: semana.numero,
    ano: semana.ano,
    generado_por: user.id,
    url_storage: storagePath,
    datos_entrada: datos,
  };

  console.log('[guardarReportePDF] Insert data:', JSON.stringify(insertData, null, 2));

  // Try upsert first (insert or update on conflict)
  let result = await supabase
    .from('reportes_semanales')
    .upsert(insertData, { onConflict: 'ano,numero_semana' })
    .select()
    .single();

  // If upsert fails due to RLS, try insert-only as fallback
  if (result.error?.message?.includes('row-level security')) {
    console.log('[guardarReportePDF] Upsert failed due to RLS, trying insert-only...');

    // Check if a record already exists
    const { data: existing } = await supabase
      .from('reportes_semanales')
      .select('id')
      .eq('ano', semana.ano)
      .eq('numero_semana', semana.numero)
      .maybeSingle();

    if (existing) {
      console.log('[guardarReportePDF] Record already exists, cannot update due to RLS. Using existing record.');
      // Return existing record metadata
      const { data: existingMetadata } = await supabase
        .from('reportes_semanales')
        .select('*')
        .eq('ano', semana.ano)
        .eq('numero_semana', semana.numero)
        .single();

      if (existingMetadata) {
        console.log('[guardarReportePDF] Using existing metadata:', existingMetadata.id);
        return existingMetadata;
      }
    }

    // Try insert-only (this should work with the INSERT policy)
    console.log('[guardarReportePDF] Trying insert-only...');
    result = await supabase
      .from('reportes_semanales')
      .insert(insertData)
      .select()
      .single();
  }

  if (result.error) {
    console.error('[guardarReportePDF] Database error:', result.error);
    console.error('[guardarReportePDF] Error code:', result.error.code);
    console.error('[guardarReportePDF] Error details:', result.error.details);

    throw new Error(`Error al guardar metadatos: ${result.error.message}. ` +
      `Código: ${result.error.code}. ` +
      `Verifica que las políticas RLS estén configuradas correctamente.`);
  }

  console.log('[guardarReportePDF] Metadata saved successfully:', result.data?.id);
  return result.data;
}

/**
 * Descarga un PDF desde Supabase Storage
 */
export async function descargarReportePDF(storagePath: string): Promise<Blob> {
  const supabase = getSupabase();

  const { data, error } = await supabase.storage
    .from('reportes-semanales')
    .download(storagePath);

  if (error) {
    throw new Error(`Error al descargar PDF: ${error.message}`);
  }

  return data;
}

/**
 * Obtiene la lista de reportes generados previamente
 */
export async function fetchHistorialReportes(): Promise<ReporteSemanalMetadata[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('reportes_semanales')
    .select(`
      id,
      fecha_inicio,
      fecha_fin,
      numero_semana,
      ano,
      generado_por,
      url_storage,
      html_storage,
      generado_automaticamente,
      created_at,
      usuarios(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Error al cargar historial: ${error.message}`);
  }

  return (data || []).map((r: any) => ({
    ...r,
    generado_por_nombre: r.usuarios?.nombre || 'Sistema',
  }));
}

// ============================================================================
// GENERACIÓN RÁPIDA (sin wizard)
// ============================================================================

export interface GenerarRapidoResult {
  html_storage: string;
  reporte_id: string;
  ya_existia: boolean;
  semana: { numero: number; ano: number; inicio: string; fin: string };
  tokens_usados?: number;
}

/**
 * Llama al endpoint de generación rápida.
 * El edge function obtiene sus propios datos de la BD + genera el HTML.
 * Retorna la ruta del HTML almacenado en Storage.
 */
export async function generarReporteRapido(
  semana?: { numero: number; ano: number; inicio: string; fin: string },
  onProgress?: (step: string) => void
): Promise<GenerarRapidoResult> {
  onProgress?.('Generando reporte con IA...');

  const response = await fetch(
    `${EDGE_FUNCTION_BASE}/make-server-1ccce916/reportes/generar-semanal-rapido`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
      body: JSON.stringify(semana ? { semana } : {}),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Error del servidor: ${response.status}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Error al generar el reporte rápido');
  }

  return {
    html_storage: result.html_storage,
    reporte_id: result.reporte_id,
    ya_existia: result.ya_existia || false,
    semana: result.semana,
    tokens_usados: result.tokens_usados,
  };
}

/**
 * Descarga el HTML de un reporte rápido, lo convierte a PDF y lanza la descarga.
 * Usa el mismo html2pdf.js que el wizard.
 */
export async function descargarReporteDesdeHTML(
  htmlStoragePath: string,
  filename: string
): Promise<void> {
  const supabase = getSupabase();

  const { data: htmlBlob, error } = await supabase.storage
    .from('reportes-semanales')
    .download(htmlStoragePath);

  if (error) {
    throw new Error(`Error al descargar HTML: ${error.message}`);
  }

  const html = await htmlBlob.text();
  const pdfBlob = await convertirHTMLaPDF(html);
  descargarBlob(pdfBlob, filename);
}

// ============================================================================
// FLUJO COMPLETO
// ============================================================================

export interface GenerarReporteCompletoResult {
  html: string;
  pdfBlob: Blob;
  metadata: ReporteSemanalMetadata | null;
  tokensUsados: number;
  storageWarning?: string;
}

/**
 * Flujo completo: datos → Gemini HTML → PDF → Storage → metadata
 */
export async function generarReporteCompleto(
  datos: DatosReporteSemanal,
  instrucciones?: string,
  onProgress?: (step: string) => void
): Promise<GenerarReporteCompletoResult> {
  console.log('[ReporteSemanal] === Inicio flujo completo ===');

  // Paso 1: Generar HTML con Gemini
  onProgress?.('Generando diseño del reporte con IA...');
  console.log('[ReporteSemanal] Paso 1: Llamando a Gemini...');
  const { html, tokens_usados } = await generarHTMLReporte(datos, instrucciones);
  console.log('[ReporteSemanal] Paso 1 completado. HTML:', html.length, 'chars, Tokens:', tokens_usados);

  // Paso 2: Convertir HTML a PDF
  onProgress?.('Convirtiendo a PDF...');
  console.log('[ReporteSemanal] Paso 2: Convirtiendo HTML a PDF...');
  const pdfBlob = await convertirHTMLaPDF(html);
  console.log('[ReporteSemanal] Paso 2 completado. PDF:', pdfBlob.size, 'bytes');

  // Paso 3: Guardar en Storage y BD (no bloquea si falla)
  let metadata: ReporteSemanalMetadata | null = null;
  let storageWarning: string | undefined;
  try {
    onProgress?.('Guardando reporte...');
    console.log('[ReporteSemanal] Paso 3: Guardando en Supabase...');
    metadata = await guardarReportePDF(pdfBlob, datos);
    console.log('[ReporteSemanal] Paso 3 completado. ID:', metadata.id);
  } catch (storageError: any) {
    console.warn('[ReporteSemanal] Paso 3 falló:', storageError.message);
    storageWarning = `No se pudo guardar en almacenamiento: ${storageError.message}`;
  }

  console.log('[ReporteSemanal] === Flujo completo exitoso ===');
  return {
    html,
    pdfBlob,
    metadata,
    tokensUsados: tokens_usados || 0,
    storageWarning,
  };
}

/**
 * Trigger de descarga de un Blob como archivo
 */
export function descargarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
