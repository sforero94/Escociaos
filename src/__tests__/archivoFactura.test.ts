import { describe, expect, it } from 'vitest';
import { MAX_FACTURA_BYTES, prepararArchivoFactura, validarArchivoFactura } from '@/utils/archivoFactura';

describe('invoice metadata contract (not file byte validation)', () => {
  it.each([
    ['image/jpeg', 'jpg', 'image/jpeg'], ['image/jpg', 'jpg', 'image/jpeg'],
    ['image/png', 'png', 'image/png'], ['image/gif', 'gif', 'image/gif'],
    ['application/pdf', 'pdf', 'application/pdf'],
  ])('canonicalizes %s independently of the supplied name', (type, extension, contentType) => {
    const file = new File(['x'], '../../unsafe.svg', { type });
    const result = prepararArchivoFactura(file, 'compra');
    expect(result.path).toMatch(new RegExp(`^facturas_compra/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.${extension}$`));
    expect(result.contentType).toBe(contentType);
    expect(prepararArchivoFactura(file, 'venta').path).not.toBe(result.path);
  });
  it('accepts exactly 5 MiB and rejects one byte more', () => {
    expect(validarArchivoFactura({ type: 'image/png', size: MAX_FACTURA_BYTES })).toBeNull();
    expect(validarArchivoFactura({ type: 'image/png', size: MAX_FACTURA_BYTES + 1 })).toContain('5MB');
  });
  it.each(['image/svg+xml', 'image/webp', 'text/html', '', 'toString', '__proto__'])('rejects %s', type => {
    expect(validarArchivoFactura({ type, size: 1 })).toBeTruthy();
  });
});
