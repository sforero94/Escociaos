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
}

export interface BotContextFlavor {
  telegramUser: TelegramUsuario | null;
}

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor &
  BotContextFlavor;
