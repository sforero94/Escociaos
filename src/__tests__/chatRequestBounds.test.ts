import { describe, expect, it, vi } from 'vitest';
import { readChatRequest, MAX_CHAT_BODY_BYTES, MAX_CHAT_MESSAGE_BYTES } from '../../supabase/functions/make-server-1ccce916/chat-request';

const request = (body: string | Uint8Array<ArrayBuffer>) => new Request('https://edge.invalid/chat', { method: 'POST', body });
describe('bounded actual request streams', () => {
  it('accepts the inclusive UTF-8 message boundary and null conversation compatibility', async () => {
    const message = 'é'.repeat(MAX_CHAT_MESSAGE_BYTES / 2);
    expect(await readChatRequest(request(JSON.stringify({ message, conversation_id: null })))).toEqual({ message, conversation_id: null });
  });
  it('refuses over-boundary UTF-8 messages and invalid encodings', async () => {
    await expect(readChatRequest(request(JSON.stringify({ message: 'é'.repeat(MAX_CHAT_MESSAGE_BYTES / 2 + 1) })))).rejects.toMatchObject({ status: 413 });
    await expect(readChatRequest(request(new Uint8Array([0xff, 0xfe])))).rejects.toMatchObject({ status: 400 });
  });
  it('cancels an unadvertised oversized stream before reading its remainder', async () => {
    const cancelled = vi.fn(); let pulls = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) {
      pulls++; controller.enqueue(new Uint8Array(MAX_CHAT_BODY_BYTES + 1));
    }, cancel: cancelled }, { highWaterMark: 0 });
    const req = new Request('https://edge.invalid/chat', { method: 'POST', body, duplex: 'half' } as RequestInit);
    await expect(readChatRequest(req)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toHaveBeenCalledOnce(); expect(pulls).toBe(1);
  });
  it('rejects forged Content-Length and excess whitespace even with a small message', async () => {
    const req = request('{"message":"ok"}'); req.headers.set('content-length', '1');
    expect(await readChatRequest(req)).toEqual({ message: 'ok' });
    await expect(readChatRequest(request(' '.repeat(MAX_CHAT_BODY_BYTES) + '{"message":"ok"}'))).rejects.toMatchObject({ status: 413 });
    const oversized = request('{"message":"ok"}'); oversized.headers.set('content-length', String(MAX_CHAT_BODY_BYTES + 1));
    await expect(readChatRequest(oversized)).rejects.toMatchObject({ status: 413 });
  });
});
