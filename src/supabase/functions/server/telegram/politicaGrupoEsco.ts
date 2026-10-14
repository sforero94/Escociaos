// Only explicitly addressed group messages are queries; privacy-mode changes
// must not turn ordinary farm chatter into private LLM history or spend.
interface MensajeGrupo {
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
  reply_to_message?: { from?: { id: number } };
}
export function esConsultaGrupoEsco(message: MensajeGrupo | undefined, bot: { id: number; username?: string }) {
  const text = message?.text;
  if (!text?.trim()) return false;
  if (message?.reply_to_message?.from?.id === bot.id) return !text.startsWith('/');
  if (!bot.username) return false;
  const mention = `@${bot.username}`.toLowerCase();
  return message?.entities?.some(entity => entity.type === 'mention' &&
    text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === mention) ?? false;
}
