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

  // Crear un contenedor temporal invisible para renderizar el HTML
  const container = document.createElement('div');
  container.innerHTML = html;
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    const pdfBlob = await html2pdf()
      .set({
        margin: [10, 10, 10, 10], // mm
        filename: 'reporte-semanal.pdf',
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
        },
        pagebreak: {
          mode: ['avoid-all', 'css', 'legacy'],
        },
      })
      .from(container)
      .outputPdf('blob');

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

  if (!user) {
    throw new Error('No hay usuario autenticado');
  }

  const { semana } = datos;
  const fileName = `reporte-semana-${semana.ano}-S${String(semana.numero).padStart(2, '0')}.pdf`;
  const storagePath = `${semana.ano}/${fileName}`;

  // Subir PDF a Storage
  const { error: uploadError } = await supabase.storage
    .from('reportes-semanales')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true, // Sobrescribir si ya existe (regeneración)
    });

  if (uploadError) {
    throw new Error(`Error al subir PDF: ${uploadError.message}`);
  }

  // Guardar metadatos en la tabla
  const { data: metadata, error: dbError } = await supabase
    .from('reportes_semanales')
    .upsert(
      {
        fecha_inicio: semana.inicio,
        fecha_fin: semana.fin,
        numero_semana: semana.numero,
        ano: semana.ano,
        generado_por: user.id,
        url_storage: storagePath,
        datos_entrada: datos,
      },
      { onConflict: 'ano,numero_semana' }
    )
    .select()
    .single();

  if (dbError) {
    throw new Error(`Error al guardar metadatos: ${dbError.message}`);
  }

  return metadata;
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
    generado_por_nombre: r.usuarios?.nombre || 'Desconocido',
  }));
}

// ============================================================================
// FLUJO COMPLETO
// ============================================================================

export interface GenerarReporteCompletoResult {
  html: string;
  pdfBlob: Blob;
  metadata: ReporteSemanalMetadata | null;
  tokensUsados: number;
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
  try {
    onProgress?.('Guardando reporte...');
    console.log('[ReporteSemanal] Paso 3: Guardando en Supabase...');
    metadata = await guardarReportePDF(pdfBlob, datos);
    console.log('[ReporteSemanal] Paso 3 completado. ID:', metadata.id);
  } catch (storageError: any) {
    console.warn('[ReporteSemanal] Paso 3 falló (no crítico):', storageError.message);
    // El reporte se generó correctamente, solo falló el almacenamiento
  }

  console.log('[ReporteSemanal] === Flujo completo exitoso ===');
  return {
    html,
    pdfBlob,
    metadata,
    tokensUsados: tokens_usados || 0,
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
