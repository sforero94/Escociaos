import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { procesarCSV } from "./importar-productos.tsx";
import { crearUsuario, editarUsuario, eliminarUsuario } from "./usuarios.tsx";
import { toggleProductoActivo } from "./productos.tsx";
import { generarReporteSemanal } from "./generar-reporte-semanal.tsx";

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

// Ruta para generar reporte semanal con Gemini
app.post("/make-server-1ccce916/reportes/generar-semanal", async (c) => {
  try {
    const body = await c.req.json();
    const resultado = await generarReporteSemanal(body);

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

// Handle preflight OPTIONS at Deno.serve level to ensure CORS works
// even if Supabase's API gateway doesn't forward OPTIONS to Hono
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return app.fetch(req);
});