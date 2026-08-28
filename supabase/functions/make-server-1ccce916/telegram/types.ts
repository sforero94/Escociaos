// telegram/types.ts — shared Grammy context/session types for the bot.
//
// This file was accidentally deleted from both edge-function trees by a
// prior "resync" commit (6f3a0d6) that treated it as stale drift — it was
// actually the only copy that ever existed (the frontend source tree
// never had it, only the deploy mirror did, since b991bc8). Restored here
// verbatim (plus `rol_bot` widened to include `monitor`, added by
// migration 031 after this file was first written) because every
// conversation file (`bot.ts`, `conversations/*.ts`) imports `BotContext`
// from here — without it the whole bot fails to typecheck/deploy.

import { Context, SessionFlavor } from "npm:grammy@1";
import { ConversationFlavor } from "npm:@grammyjs/conversations@2";

export interface TelegramUsuario {
  id: string;
  telegram_id: number;
  telegram_username: string | null;
  usuario_id: string | null;
  empleado_id: string | null;
  contratista_id: string | null;
  nombre_display: string;
  rol_bot: "campo" | "admin" | "gerencia" | "monitor";
  modulos_permitidos: string[];
  activo: boolean;
  codigo_vinculacion: string | null;
  codigo_expira_at: string | null;
}

export interface SessionData {
  // grammy conversations stores its state here automatically

  // Fase 4 de docs/brief_tecnico_verificacion_inventario.md (§7.2/§13,
  // David y Santiago): decidir/proponer un ajuste NO es una conversación de
  // Grammy (D-T9 la reserva para asistentes genuinos; Santiago es el usuario
  // más pesado de Esco y una conversación activa lo bloquearía -- ver
  // bot.ts). Pero la causa "otro" del catálogo exige nota (R-7), y una nota
  // es texto libre -- este campo es el único puente entre el callback que la
  // pide y el `bot.on("message:text")` que la recibe. Se limpia apenas se
  // usa (éxito, error o cancelación); si queda huérfano no rompe nada más
  // que ESE flujo puntual, y el próximo `/proponer`/`/aprobar` lo vuelve a
  // fijar antes de leerlo.
  pendienteNotaRonda?: {
    tipo: 'proponer' | 'decidir';
    excepcionId: string;
    causaClave: string;
    decision?: 'aprobado' | 'desestimado';
  } | null;
}

export interface BotContextFlavor {
  telegramUser: TelegramUsuario | null;
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor &
  BotContextFlavor;
