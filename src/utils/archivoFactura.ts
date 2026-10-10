/** Browser metadata contract only; this does not inspect or authenticate file bytes. */
export const MAX_FACTURA_BYTES = 5 * 1024 * 1024;
export const FACTURA_ACCEPT = 'image/jpeg,image/jpg,image/png,image/gif,application/pdf';

const formatos: Record<string, { extension: string; contentType: string }> = {
  'image/jpeg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/jpg': { extension: 'jpg', contentType: 'image/jpeg' },
  'image/png': { extension: 'png', contentType: 'image/png' },
  'image/gif': { extension: 'gif', contentType: 'image/gif' },
  'application/pdf': { extension: 'pdf', contentType: 'application/pdf' },
};

export function validarArchivoFactura(file: Pick<File, 'type' | 'size'>): string | null {
  if (!Object.prototype.hasOwnProperty.call(formatos, file.type)) return 'Solo se permiten archivos de imagen (JPG, PNG, GIF) o PDF';
  if (file.size > MAX_FACTURA_BYTES) return 'El archivo es muy grande. El tamaño máximo es 5MB';
  return null;
}

export function prepararArchivoFactura(file: File, tipo: 'compra' | 'venta') {
  const error = validarArchivoFactura(file);
  if (error) throw new Error(error);
  const { extension, contentType } = formatos[file.type];
  return { path: `facturas_${tipo}/${crypto.randomUUID()}.${extension}`, contentType };
}
