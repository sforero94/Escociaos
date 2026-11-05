import { esUuid, type AplicacionInventario } from './aplicacionesTipos.ts';
// Unlike numeric lot display prefixes, application codes retain digits/punctuation.
const normalizarIdentidad = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export function resolverIdentidadAplicaciones(selector: { aplicacion_ids: string[]; aplicaciones: string[] }, apps: AplicacionInventario[]): { estado: 'ok' | 'no_resuelto' | 'no_disponible'; aplicaciones: AplicacionInventario[] } {
  const fallo = (estado: 'no_resuelto' | 'no_disponible') => ({ estado, aplicaciones: [] });
  if (apps.some(a => !a || !esUuid(a.id)) || new Set(apps.map(a => a.id)).size !== apps.length) return fallo('no_disponible');
  const visibles = new Set(apps.map(a => a.id));
  if (selector.aplicacion_ids.some(id => !visibles.has(id))) return fallo('no_resuelto');
  const universo = apps.filter(a => !selector.aplicacion_ids.length || selector.aplicacion_ids.includes(a.id));
  const porTexto = new Set<string>();
  for (const texto of selector.aplicaciones) {
    const exacta = (a: AplicacionInventario) => [a.nombre_aplicacion, a.codigo_aplicacion].some(v => typeof v === 'string' && normalizarIdentidad(v) === normalizarIdentidad(texto));
    const coincide = universo.some(exacta) ? exacta : (a: AplicacionInventario) => [a.nombre_aplicacion, a.codigo_aplicacion].some(v => typeof v === 'string' && normalizarIdentidad(v).includes(normalizarIdentidad(texto)));
    if (universo.some(a => !coincide(a) && (a.nombre_aplicacion === undefined || a.codigo_aplicacion === undefined))) return fallo('no_disponible');
    const encontrados = universo.filter(coincide);
    if (encontrados.length !== 1) return fallo('no_resuelto');
    porTexto.add(encontrados[0].id);
  }
  const aplicaciones = universo.filter(a => !selector.aplicaciones.length || porTexto.has(a.id));
  return (selector.aplicacion_ids.length || selector.aplicaciones.length) && !aplicaciones.length ? fallo('no_resuelto') : { estado: 'ok', aplicaciones };
}
