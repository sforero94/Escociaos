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
  rol_bot: "campo" | "admin" | "gerencia";
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
