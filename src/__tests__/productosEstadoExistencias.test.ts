import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guard estático de la migración 073 ("el estado del producto se deriva de las
 * existencias").
 *
 * Desde 073 un insumo con cantidad_actual = 0 queda en 'Sin existencias'. Eso
 * es lo que se busca para la verificación física — pero convierte cualquier
 * `.eq('estado', 'OK')` sobre `productos` en un filtro de stock encubierto:
 * quien lo escriba deja de ver 131 insumos del catálogo sin enterarse, porque
 * la consulta no falla, simplemente devuelve menos filas.
 *
 * El caso concreto que motivó el guard es PasoMezcla: ahí se planea una
 * aplicación ANTES de comprar los insumos (para eso existe el paso de Lista
 * de Compras), así que el saldo en cero no puede sacar un producto del
 * selector. Lo que se excluye debe ser el producto inservible
 * (Vencido/Perdido), y eso se expresa con `.in('estado', [...])`.
 */

const SRC = join(process.cwd(), 'src');

function archivosFuente(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada === '__tests__') continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) {
      salida.push(...archivosFuente(ruta));
    } else if (/\.(ts|tsx)$/.test(entrada)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe('productos.estado derivado de existencias (migración 073)', () => {
  it('ningún componente filtra productos con .eq("estado", "OK")', () => {
    const infractores: string[] = [];

    for (const ruta of archivosFuente(SRC)) {
      const contenido = readFileSync(ruta, 'utf8');
      // Sólo interesa si el archivo consulta la tabla productos.
      if (!contenido.includes("from('productos')")) continue;
      if (/\.eq\(\s*['"]estado['"]\s*,\s*['"]OK['"]\s*\)/.test(contenido)) {
        infractores.push(ruta.replace(process.cwd() + '/', ''));
      }
    }

    expect(
      infractores,
      `Filtrar productos por estado = 'OK' esconde silenciosamente los insumos ` +
        `sin existencias (migración 073). Si la intención es excluir producto ` +
        `inservible, usar .in('estado', ['OK', 'Sin existencias']).`
    ).toEqual([]);
  });

  it('la migración 073 instala el trigger sobre productos', () => {
    const sql = readFileSync(
      join(SRC, 'sql/migrations/073_productos_estado_por_existencias.sql'),
      'utf8'
    );

    expect(sql).toContain('fn_productos_sync_estado_stock');
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.productos/);
    // La regla misma: cero => Sin existencias.
    expect(sql).toMatch(/COALESCE\(NEW\.cantidad_actual, 0\) <= 0/);
  });
});
