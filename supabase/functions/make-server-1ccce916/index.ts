import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.ts";
import { procesarCSV } from "./importar-productos.ts";
import { crearUsuario, editarUsuario, eliminarUsuario } from "./usuarios.ts";
import { toggleProductoActivo } from "./productos.ts";
import { generarReporteSemanal } from "./generar-reporte-semanal.ts";
import { generarHTMLReporte } from "./generar-reporte-html.ts";
import { fetchDatosReporteSemanalServidor, calcularSemanaAnterior } from "./fetch-datos-reporte.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// CORS headers shared between Hono middleware and preflight handler
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Expose-Headers": "Content-Length",
  "Access-Control-Max-Age": "600",
};

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Health check endpoint
app.get("/make-server-1ccce916/health", (c) => {
  return c.json({ status: "ok" });
});

// Ruta para importar productos desde CSV
app.post("/make-server-1ccce916/inventario/importar-productos", async (c) => {
  try {
    const body = await c.req.json();
    const { csvData } = body;

    if (!csvData) {
      return c.json({ success: false, error: 'No se proporcionó datos CSV' }, 400);
    }

    const resultado = await procesarCSV(csvData);
    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de importación:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    }, 500);
  }
});

// Rutas para usuarios
app.post("/make-server-1ccce916/usuarios/crear", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await crearUsuario(body);
    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de creación de usuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    }, 500);
  }
});

app.post("/make-server-1ccce916/usuarios/editar", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await editarUsuario(body);
    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de edición de usuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    }, 500);
  }
});

app.post("/make-server-1ccce916/usuarios/eliminar", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await eliminarUsuario(body);
    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de eliminación de usuario:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    }, 500);
  }
});

// Rutas para productos
app.post("/make-server-1ccce916/inventario/toggle-producto-activo", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await toggleProductoActivo(body);
    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de toggle producto activo:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al procesar la solicitud'
    }, 500);
  }
});

// Ruta para generar reporte semanal con Gemini (flujo wizard del frontend)
app.post("/make-server-1ccce916/reportes/generar-semanal", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await generarReporteSemanal(body, generarHTMLReporte);

    if (!resultado.success) {
      return c.json(resultado, 400);
    }

    return c.json(resultado);
  } catch (error: any) {
    console.error('Error en endpoint de reporte semanal:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al generar el reporte semanal'
    }, 500);
  }
});

// Ruta de generación rápida: obtiene sus propios datos de la BD + genera HTML
// Llamada desde el botón "Generar Rápido" en el frontend (sin pasar por el wizard)
app.post("/make-server-1ccce916/reportes/generar-semanal-rapido", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));

    // Usar semana del body o calcular la semana anterior automáticamente
    const semana = body.semana || calcularSemanaAnterior();

    // Verificar si ya existe un reporte para esta semana (idempotente)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: existente } = await supabase
      .from('reportes_semanales')
      .select('id, html_storage, url_storage')
      .eq('ano', semana.ano)
      .eq('numero_semana', semana.numero)
      .maybeSingle();

    // Si ya existe y tiene HTML almacenado, devolver sin regenerar
    if (existente?.html_storage) {
      return c.json({
        success: true,
        ya_existia: true,
        semana,
        html_storage: existente.html_storage,
        reporte_id: existente.id,
      });
    }

    // Obtener datos desde la BD usando service role key
    const datos = await fetchDatosReporteSemanalServidor(semana);

    // Generar análisis (Gemini) + HTML (template)
    const resultado = await generarReporteSemanal({ datos }, generarHTMLReporte);

    if (!resultado.success || !resultado.html) {
      return c.json({ success: false, error: resultado.error || 'No se generó HTML' }, 500);
    }

    // Subir HTML a Storage
    const fileName = `auto-reporte-semana-${semana.ano}-S${String(semana.numero).padStart(2, '0')}.html`;
    const storagePath = `${semana.ano}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('reportes-semanales')
      .upload(storagePath, new Blob([resultado.html], { type: 'text/html; charset=utf-8' }), {
        upsert: true,
      });

    if (uploadError) {
      console.error('Error al subir HTML:', uploadError);
      return c.json({ success: false, error: `Error al guardar: ${uploadError.message}` }, 500);
    }

    // Guardar/actualizar metadatos en la tabla
    const { data: metadata, error: dbError } = await supabase
      .from('reportes_semanales')
      .upsert(
        {
          fecha_inicio: semana.inicio,
          fecha_fin: semana.fin,
          numero_semana: semana.numero,
          ano: semana.ano,
          generado_por: null, // Generación automática, sin usuario específico
          html_storage: storagePath,
          generado_automaticamente: true,
          datos_entrada: datos,
        },
        { onConflict: 'ano,numero_semana' }
      )
      .select('id')
      .single();

    if (dbError) {
      console.error('Error al guardar metadatos:', dbError);
      return c.json({ success: false, error: `Error en BD: ${dbError.message}` }, 500);
    }

    return c.json({
      success: true,
      ya_existia: false,
      semana,
      html_storage: storagePath,
      reporte_id: metadata?.id,
      tokens_usados: resultado.tokens_usados,
    });

  } catch (error: any) {
    console.error('Error en generación rápida de reporte:', error);
    return c.json({
      success: false,
      error: error.message || 'Error al generar el reporte rápido'
    }, 500);
  }
});

// Handle preflight OPTIONS at Deno.serve level to ensure CORS works
// even if Supabase's API gateway doesn't forward OPTIONS to Hono
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return app.fetch(req);
});