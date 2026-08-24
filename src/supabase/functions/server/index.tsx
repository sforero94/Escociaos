import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { handleImportarProductos } from "./importar-productos.tsx";
import { crearUsuario, editarUsuario, eliminarUsuario } from "./usuarios.tsx";
import { toggleProductoActivo } from "./productos.tsx";
import { handleGenerarReporteSemanal } from "./generar-reporte-semanal-endpoint.ts";
import { handleChatMessage } from "./chat.tsx";
import { handleClimaSync, handleClimaBackfill, handleClimaForecast } from "./clima.tsx";
import { handleHatoChequeoPreview } from "./hato-chequeo-preview.ts";
import { handleHatoChequeoCommit } from "./hato-chequeo-commit.ts";
import { handleHatoChequeoFoto } from "./hato-chequeo-foto.ts";
import { handleHatoProduccionQuincenaFoto } from "./hato-produccion-quincena-foto.ts";
import { handleHatoPesajeFoto } from "./hato-pesaje-foto.ts";
import { handleHatoPesajeCommit } from "./hato-pesaje-commit.ts";
import { handleHatoAlertasTick } from "./hato-alertas-tick.ts";
import { handleAccionesTick } from "./acciones-tick.ts";
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

// Ruta para importar productos desde CSV -- Administrador/Gerencia (ver
// `verificarAcceso` en importar-productos.tsx). El handler recibe el Context
// completo (no sólo el body) porque el gate necesita leer el encabezado
// Authorization, igual que las rutas de usuarios.
app.post("/make-server-1ccce916/inventario/importar-productos", async (c) => {
  return await handleImportarProductos(c);
});

// Rutas para usuarios -- exclusivas de Gerencia (ver `verificarAccesoGerencia`
// en usuarios.tsx). Los handlers reciben el Context completo (no solo el
// body) porque el gate necesita leer el encabezado Authorization.
app.post("/make-server-1ccce916/usuarios/crear", async (c) => {
  return await crearUsuario(c);
});

app.post("/make-server-1ccce916/usuarios/editar", async (c) => {
  return await editarUsuario(c);
});

app.post("/make-server-1ccce916/usuarios/eliminar", async (c) => {
  return await eliminarUsuario(c);
});

// Rutas para productos -- Administrador/Gerencia (ver `verificarAcceso` en
// productos.tsx), mismo permiso de escritura que la RLS de `productos`.
app.post("/make-server-1ccce916/inventario/toggle-producto-activo", async (c) => {
  return await toggleProductoActivo(c);
});

// Ruta para generar reporte semanal -- Administrador/Gerencia (ver
// `verificarAcceso` en generar-reporte-semanal.tsx). Sin gate era un canal
// de LECTURA anónimo alrededor de toda la RLS: el prompt lleva 4 semanas de
// datos reales de finca y los resúmenes de llamadas del dueño.
app.post("/make-server-1ccce916/reportes/generar-semanal", async (c) => {
  return await handleGenerarReporteSemanal(c);
});

// Telegram bot webhook -- auth por secreto compartido dentro del handler
// (`handleWebhook` en telegram/bot.ts): el encabezado
// `X-Telegram-Bot-Api-Secret-Token` que envía el propio Telegram cuando el
// webhook se registró con `setWebhook(url, { secret_token })`. No hay JWT que
// verificar acá (la función corre con verify_jwt=false y el llamante es
// Telegram); sin secreto configurado el handler responde 503, nunca abierto.
app.post("/make-server-1ccce916/telegram/webhook", async (c) => {
  return await handleWebhook(c);
});

// Ruta para chat conversacional "Esco"
app.post("/make-server-1ccce916/chat/message", async (c) => {
  return await handleChatMessage(c);
});

// Ruta para sincronizar datos de clima desde Ecowitt API (pg_cron every 5 min).
// Auth de DOBLE PUERTA en clima.tsx (`verificarAccesoClima`): secreto
// compartido `x-clima-sync-secret` para el cron (migraciones 030 + 103), o
// JWT + Gerencia para un disparo manual. Sin secreto configurado y sin JWT
// responde 503 -- nunca corre "abierto".
app.post("/make-server-1ccce916/clima/sync", async (c) => {
  return await handleClimaSync(c);
});

// Backfill historical weather data from Ecowitt API. Mismo gate que
// /clima/sync; no tiene cron, el camino normal es el JWT de Gerencia. El
// rango está topado (MAX_DIAS_BACKFILL) para que no se pueda agotar la cuota
// de Ecowitt de una sola llamada.
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

// Hato Lechero: Fase 3b -- carga del chequeo POR FOTO (OCR con modelo de
// visión). Gemelo del preview: el OCR reemplaza SOLO la lectura de la grilla,
// el resto del pipeline (normalizar + diff) es el mismo. Nunca escribe en
// tablas de dominio; sí guarda las fotos en Storage (capa cruda).
app.post("/make-server-1ccce916/hato/chequeo/foto", async (c) => {
  return await handleHatoChequeoFoto(c);
});

// Hato Lechero: S4 (ronda agosto 2026, D-8) -- carga de la liquidación
// quincenal de El Pomar POR FOTO (OCR con modelo de visión). Nunca escribe
// en tablas de dominio; devuelve los campos interpretados para que el
// formulario de Producción los revise/corrija antes de guardar por
// fn_hato_guardar_quincena_venta (migración 085).
app.post("/make-server-1ccce916/hato/produccion/quincena/foto", async (c) => {
  return await handleHatoProduccionQuincenaFoto(c);
});

// Hato Lechero: S5 (ronda agosto 2026) -- carga de la planilla MENSUAL de
// pesaje POR FOTO (OCR con modelo de visión, ancla por NOMBRE -- D-1, esta
// planilla nunca llevó chapeta). Nunca escribe en tablas de dominio; devuelve
// un diff por (vaca, semana) para revisión. Guarda las fotos en Storage
// (capa cruda).
app.post("/make-server-1ccce916/hato/pesaje/foto", async (c) => {
  return await handleHatoPesajeFoto(c);
});

// Hato Lechero: S5 commit path -- "Aprobar" el diff de arriba. Revalida cada
// celda (vaca sigue activa, fecha sigue siendo una semana de pesaje real)
// contra el estado fresco y escribe en hato_pesajes_leche (UPDATE-por-id +
// INSERT). Cada celda es un hecho independiente: una inválida no bota a las
// demás.
app.post("/make-server-1ccce916/hato/pesaje/commit", async (c) => {
  return await handleHatoPesajeCommit(c);
});

// Hato Lechero: motor de alertas (S6, plan §7.3) -- tick diario disparado
// por pg_cron (migración 060). Auth por secreto compartido
// (x-hato-tick-secret), no JWT de usuario -- ver hato-alertas-tick.ts.
app.post("/make-server-1ccce916/hato/alertas/tick", async (c) => {
  return await handleHatoAlertasTick(c);
});

// Motor de acciones recomendadas (bloque 4 del Centro de Control, Fase 3 --
// docs/brief_tecnico_motor_acciones.md §2.2, §7, §10). Tick diario disparado
// por pg_cron (migración 098, 05:50 Bogotá) con secreto compartido
// (x-acciones-tick-secret), más disparo manual con JWT+Gerencia -- ver
// acciones-tick.ts. Ensambla el paquete, llama al modelo (OpenRouter,
// json_schema estricto, sin tools), valida y persiste -- degrada a cero
// acciones publicadas si el modelo falla o OPENROUTER_API_KEY no está
// configurada, nunca tumba el tick.
app.post("/make-server-1ccce916/acciones/tick", async (c) => {
  return await handleAccionesTick(c);
});

// Handle preflight OPTIONS at Deno.serve level to ensure CORS works
// even if Supabase's API gateway doesn't forward OPTIONS to Hono
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return app.fetch(req);
});