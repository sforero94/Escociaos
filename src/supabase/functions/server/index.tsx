import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import * as kv from "./kv_store.tsx";
import { procesarCSV } from "./importar-productos.tsx";

const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
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

Deno.serve(app.fetch);