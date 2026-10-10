import { describe, expect, it } from 'vitest';
import { esConsultaGrupoEsco } from '../../supabase/functions/make-server-1ccce916/telegram/politicaGrupoEsco';
const bot = { id: 987, username: 'escociaos_bot' };
describe('explicit group queries', () => {
 it('ignores ordinary chatter even with group-wide bot visibility', () => {
  expect(esConsultaGrupoEsco({ text: 'farm finance secret' }, bot)).toBe(false);
  expect(esConsultaGrupoEsco({ text: 'literal @escociaos_bot without Telegram entity' }, bot)).toBe(false);
 });
 it('accepts exact bot mention using Telegram UTF16 entity offsets', () => {
  const text = '🌿 @EsCoCiAoS_BoT question';
  expect(esConsultaGrupoEsco({ text, entities: [{ type: 'mention', offset: 3, length: 14 }] }, bot)).toBe(true);
 });
 it('ignores mentions for other bots and substring names', () => {
  expect(esConsultaGrupoEsco({ text: '@other_bot question', entities: [{ type: 'mention', offset: 0, length: 10 }] }, bot)).toBe(false);
  expect(esConsultaGrupoEsco({ text: '@escociaos_bot_fake question', entities: [{ type: 'mention', offset: 0, length: 19 }] }, bot)).toBe(false);
 });
 it('accepts replies only to this bot, and keeps operational commands private', () => {
  expect(esConsultaGrupoEsco({ text: 'question', reply_to_message: { from: { id: bot.id } } }, bot)).toBe(true);
  expect(esConsultaGrupoEsco({ text: '/evento', reply_to_message: { from: { id: bot.id } } }, bot)).toBe(false);
  expect(esConsultaGrupoEsco({ text: 'question', reply_to_message: { from: { id: 123 } } }, bot)).toBe(false);
 });
});
