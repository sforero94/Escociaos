import { describe, expect, it } from 'vitest';
import { Api, InputFile } from 'grammy';
import { leerMultipartTelegramQa } from './helpers/escoSqlP5QaMultipart';

describe('QA P5: recepción multipart compatible con Node20 y Node24', () => {
  it('recupera los bytes exactos de InputFile incluso si contienen texto similar a una cabecera', async () => {
    const text = new TextEncoder().encode('\r\ncontent-disposition:form-data;name="literal";filename=data.csv\r\n');
    const bytes = new Uint8Array([...text, 0, 127, 128, 200, 255]);
    const requests: Request[] = [];
    const api = new Api('123:synthetic', { fetch: async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, { ...init, signal: undefined, duplex: 'half' } as RequestInit); requests.push(request);
      const parts = await leerMultipartTelegramQa(request);
      expect(parts.get('chat_id')).toBe('123');
      const reference = parts.get('document'); expect(typeof reference).toBe('string');
      expect(reference).toMatch(/^attach:\/\/[a-z0-9]+$/);
      const file = parts.get(String(reference).slice('attach://'.length)) as File;
      expect(file.name).toBe('fixture.csv'); expect(file.type).toBe('application/octet-stream');
      expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([...bytes]);
      return Response.json({ ok: true, result: { message_id: 1, date: 1, chat: { id: 123, type: 'private' } } });
    } });
    await api.sendDocument(123, new InputFile(bytes, 'fixture.csv')); expect(requests).toHaveLength(1);
  });
  it('también admite cabeceras MIME canónicas con nombre de archivo entre comillas', async () => {
    const bytes = new Uint8Array([200, 0, 255, 13, 10, 128]);
    const form = new FormData(); form.append('chat_id', '123'); form.append('document', 'attach://syntheticfile');
    form.append('syntheticfile', new Blob([bytes], { type: 'application/octet-stream' }), 'canonical.csv');
    const request = new Request('https://fixture.invalid', { method: 'POST', body: form });
    const parts = await leerMultipartTelegramQa(request);
    expect(parts.get('chat_id')).toBe('123'); expect(parts.get('document')).toBe('attach://syntheticfile');
    const file = parts.get('syntheticfile') as File; expect(file.name).toBe('canonical.csv');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([...bytes]);
  });
  it('rechaza un multipart incompleto sin inventar un archivo', async () => {
    const request = new Request('https://fixture.invalid', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=synthetic' }, body: '--synthetic\r\ncontent-disposition:form-data;name="file"\r\n\r\nmissing-end' });
    await expect(leerMultipartTelegramQa(request)).rejects.toThrow('QA_MULTIPART_END_INVALID');
  });
});
