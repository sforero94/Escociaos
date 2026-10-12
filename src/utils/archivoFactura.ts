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
  if (!Number.isFinite(file.size) || file.size <= 0) return 'El tamaño del archivo no es válido';
  if (file.size > MAX_FACTURA_BYTES) return 'El archivo es muy grande. El tamaño máximo es 5MB';
  return null;
}

export function prepararArchivoFactura(file: File, tipo: 'compra' | 'venta') {
  const error = validarArchivoFactura(file);
  if (error) throw new Error(error);
  const { extension, contentType } = formatos[file.type];
  return { path: `facturas_${tipo}/${crypto.randomUUID()}.${extension}`, contentType };
}

/** Normalize invoice reader aliases; this grants no Storage or row authority. */
export function normalizarRutaFactura(value:string):string {
  let v=value.trim();
  for(let depth=0;depth<8;depth++){
    const decoded=v.replace(/%([0-7][0-9a-f])/gi,(token,hex:string)=>hex==='00'?token:String.fromCharCode(parseInt(hex,16)));
    if(decoded===v)break;v=decoded;
    if(depth===7 && /%[0-7][0-9a-f]/i.test(v))throw new Error('Ruta de factura ambigua');
  }
  v=v.trim().replace(/\\/g,'/').replace(/[?#].*$/,'');
  const segments=(path:string)=>{const out:string[]=[];for(const part of path.split('/')){if(!part||part==='.')continue;if(part==='..')out.pop();else out.push(part);}return out.join('/');};
  const origin=v.match(/^https?:\/\/[^/]+/i)?.[0];
  if(origin){v=origin+'/'+segments(v.slice(origin.length));const storage=v.match(/^https?:\/\/[^/]+\/storage\/v1\/(?:object|render\/image)\/(?:public\/|sign\/|authenticated\/)?facturas\/(.*)$/i);if(!storage)return v;v=storage[1];}
  v=segments(v);return v.startsWith('facturas/')?v.slice(9):v;
}
