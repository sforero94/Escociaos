// Node20's FormData parser rejects grammY's compact Content-Disposition headers.
// Normalize only part headers for the test receiver; preserve each file byte verbatim.
import { Buffer } from 'node:buffer';
export async function leerMultipartTelegramQa(request: Request): Promise<FormData> {
  const type = request.headers.get('content-type') ?? '';
  const boundary = /^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9-]+)"|([A-Za-z0-9-]+))$/i.exec(type);
  if (!boundary) throw Error('QA_MULTIPART_BOUNDARY_INVALID');
  const marker = Buffer.from('--' + (boundary[1] ?? boundary[2]));
  const separator = Buffer.concat([Buffer.from('\r\n'), marker]);
  const raw = Buffer.from(await request.arrayBuffer());
  const chunks: Buffer[] = [];
  let position = 0, untouchedStart = 0, complete = false;
  while (position < raw.length) {
    if (!raw.subarray(position, position + marker.length).equals(marker)) throw Error('QA_MULTIPART_PART_INVALID');
    const afterMarker = position + marker.length;
    if (raw.subarray(afterMarker, afterMarker + 2).toString('ascii') === '--') { complete = true; break; }
    if (raw.subarray(afterMarker, afterMarker + 2).toString('ascii') !== '\r\n') throw Error('QA_MULTIPART_PART_INVALID');
    const start = afterMarker + 2, end = raw.indexOf('\r\n\r\n', start);
    if (end < start || end - start > 8192) throw Error('QA_MULTIPART_HEADERS_INVALID');
    const headers = raw.subarray(start, end).toString('ascii');
    const normalized = headers.split('\r\n').map(line => {
      if (!/^content-disposition:/i.test(line)) return line;
      return line.replace(/;\s*(name|filename)=("[^"\r\n]*"|[^;\r\n]*)/gi,
        (_match, key: string, value: string) => '; ' + key + '=' + (value.startsWith('"') ? value : JSON.stringify(value)));
    }).join('\r\n');
    chunks.push(raw.subarray(untouchedStart, start), Buffer.from(normalized, 'ascii'));
    untouchedStart = end;
    const next = raw.indexOf(separator, end + 4);
    if (next < 0) throw Error('QA_MULTIPART_END_INVALID');
    position = next + 2;
  }
  if (!complete) throw Error('QA_MULTIPART_END_INVALID');
  chunks.push(raw.subarray(untouchedStart));
  const headers = new Headers(request.headers); headers.delete('content-length');
  return new Request(request.url, { method: 'POST', headers, body: Buffer.concat(chunks) }).formData();
}
