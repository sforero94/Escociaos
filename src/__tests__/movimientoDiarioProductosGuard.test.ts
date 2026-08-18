import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Guarda estructural del bloque "Productos" de `DailyMovementForm`.
 *
 * **El bug (reportado por David, 2026-08-18).** Al registrar un movimiento diario
 * de la fumigación y del drench en ejecución, los productos "no cargaban nunca":
 * el formulario mostraba "Cargando productos..." de forma indefinida.
 *
 * No había ninguna carga en curso. Ese texto era el *empty state* del bloque, y
 * el bloque está vacío hasta que la precarga corre — que sólo corría al elegir
 * lote (`if (loteId && …)`). Es decir: el formulario nacía diciendo "cargando",
 * lo decía para siempre si nadie tocaba el selector de lote, y no había nada en
 * pantalla que dijera que el lote era el que destrababa la lista.
 *
 * Los logs de PostgREST de esa mañana lo confirman: las tres veces que David
 * abrió el formulario, `aplicaciones_mezclas` y `aplicaciones_productos`
 * respondieron 200 con las 4 filas de cada mezcla. Los datos siempre estuvieron.
 *
 * **Por qué bloquea y no sólo confunde**: este formulario no tiene forma manual
 * de agregar un producto (`agregarProducto` existe pero no está renderizado), y
 * `validarFormulario` exige al menos uno. Sin precarga, el movimiento no se
 * puede guardar.
 *
 * Las tres reglas que esta prueba fija:
 *  1. La precarga no depende de que haya lote elegido.
 *  2. "Cargando productos..." sólo se muestra si de verdad hay una carga en
 *     curso — nunca como estado vacío por defecto.
 *  3. Cambiar de lote no borra las cantidades ya digitadas.
 */

const FORM = resolve(__dirname, '../components/aplicaciones/DailyMovementForm.tsx');
const fuente = readFileSync(FORM, 'utf-8');

describe('DailyMovementForm — bloque de productos', () => {
  it('precarga los productos sin exigir que haya un lote seleccionado', () => {
    // El guard viejo era `if (loteId && productosParaMostrar.length > 0)`.
    expect(fuente).toMatch(/if \(productosParaMostrar\.length > 0\) \{\s*\n\s*precargarProductos\(productosParaMostrar\);/);
    expect(fuente).not.toMatch(/if \(loteId && productosParaMostrar\.length > 0\)/);
  });

  it('"Cargando productos" está condicionado a un estado de carga real', () => {
    expect(fuente).toContain('const [cargandoProductos, setCargandoProductos] = useState(true)');
    // `cargarDatosAplicacion` tiene que cerrarlo pase lo que pase.
    expect(fuente).toMatch(/finally \{\s*\n\s*setCargandoProductos\(false\);/);
    // El texto sólo aparece dentro de la rama `cargandoProductos`.
    const indiceRama = fuente.indexOf(') : cargandoProductos ? (');
    const indiceTexto = fuente.indexOf('Cargando productos...');
    expect(indiceRama).toBeGreaterThan(-1);
    expect(indiceTexto).toBeGreaterThan(indiceRama);
  });

  it('sin productos y sin carga en curso explica el problema en vez de mentir', () => {
    expect(fuente).toContain('no tiene productos configurados');
    expect(fuente).toContain('errorProductos');
  });

  it('la precarga conserva las cantidades ya digitadas del mismo producto', () => {
    expect(fuente).toContain('const cantidadesPrevias = new Map(');
    expect(fuente).toContain("cantidadesPrevias.get(producto.producto_id) ?? ''");
    // Y descarta precargas que perdieron la carrera al cambiar de lote.
    expect(fuente).toContain('if (token !== precargaTokenRef.current) return;');
  });

  it('el perfil del responsable se busca por `usuarios.id`, que ES el uid de auth', () => {
    // `usuarios` no tiene columna `user_id`: filtrar por ella devolvía 400 y el
    // campo Responsable nunca se autocompletaba.
    expect(fuente).not.toContain(".eq('user_id', user.id)");
    expect(fuente).toContain(".eq('id', user.id)");
  });
});
