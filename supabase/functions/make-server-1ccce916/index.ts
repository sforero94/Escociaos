import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { procesarCSV } from "./importar-productos.tsx";
import { crearUsuario, editarUsuario, eliminarUsuario } from "./usuarios.tsx";
import { toggleProductoActivo } from "./productos.tsx";
import { generarReporteSemanal } from "./generar-reporte-semanal.tsx";
import { handleChatMessage } from "./chat.tsx";
import { handleClimaSync, handleClimaBackfill, handleClimaForecast } from "./clima.tsx";
import { handleHatoChequeoPreview } from "./hato-chequeo-preview.ts";
import { handleHatoChequeoCommit } from "./hato-chequeo-commit.ts";
import { handleHatoAlertasTick } from "./hato-alertas-tick.ts";
import { handleWebhook } from "./telegram/bot.ts";

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

// Telegram bot webhook
app.post("/make-server-1ccce916/telegram/webhook", async (c) => {
  return await handleWebhook(c);
});

// Ruta para chat conversacional "Esco"
app.post("/make-server-1ccce916/chat/message", async (c) => {
  return await handleChatMessage(c);
});

// Ruta para sincronizar datos de clima desde Ecowitt API (pg_cron every 5 min)
app.post("/make-server-1ccce916/clima/sync", async (c) => {
  return await handleClimaSync(c);
});

// Backfill historical weather data from Ecowitt API
app.post("/make-server-1ccce916/clima/backfill", async (c) => {
  return await handleClimaBackfill(c);
});

// Short-range forecast (OpenWeatherMap proxy) for the main dashboard's weather card
app.get("/make-server-1ccce916/clima/forecast", async (c) => {
  return await handleClimaForecast(c);
});

// Hato Lechero: B0/V10 -- sube el .xlsx de un chequeo nuevo, devuelve un diff
// para aprobar. NUNCA comete un INSERT/UPDATE (plan §7.4).
app.post("/make-server-1ccce916/hato/chequeo/preview", async (c) => {
  return await handleHatoChequeoPreview(c);
});

// Hato Lechero: B0/V10 commit path -- "Aprobar" el diff de arriba. Revalida
// contra el estado fresco del hato y escribe en UNA transacción (RPC
// fn_hato_commit_chequeo, migración 065). Nunca re-parsea el .xlsx.
app.post("/make-server-1ccce916/hato/chequeo/commit", async (c) => {
  return await handleHatoChequeoCommit(c);
});

// Hato Lechero: motor de alertas (S6, plan §7.3) -- tick diario disparado
// por pg_cron (migración 060). Auth por secreto compartido
// (x-hato-tick-secret), no JWT de usuario -- ver hato-alertas-tick.ts.
app.post("/make-server-1ccce916/hato/alertas/tick", async (c) => {
  return await handleHatoAlertasTick(c);
});

// Handle preflight OPTIONS at Deno.serve level to ensure CORS works
// even if Supabase's API gateway doesn't forward OPTIONS to Hono
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return app.fetch(req);
});
