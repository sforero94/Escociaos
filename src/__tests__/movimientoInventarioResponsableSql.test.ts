// ARCHIVO: __tests__/movimientoInventarioResponsableSql.test.ts
// DESCRIPCIÓN: la mitad SQL del guard de `movimientos_inventario.responsable`.
//
// `movimientoInventarioResponsable.test.ts` vigila los tres escritores TypeScript y
// exige que estampen `user?.email`. No puede ver un RPC, y por eso el defecto #63 entró
// sin que nada se pusiera rojo: `fn_ronda_actor_nombre` (migración 126) resolvía
// `COALESCE(telegram_usuarios.nombre_display, usuarios.nombre_completo, usuarios.email,
// 'Ronda de inventario')` -- un nombre PARA MOSTRAR le ganaba al correo -- y ese texto
// viaja tal cual a `movimientos_inventario.responsable` desde `fn_ronda_resolver_con_captura`
// y `fn_ronda_aplicar_ajuste`.
//
// Evidencia en producción (2026-09-11), con la 126 viva:
//   SELECT responsable, count(*) FROM movimientos_inventario GROUP BY 1;
//     aescociahass@gmail.com  142 · sforero94@gmail.com 18 · NULL 3
//     'Santiago Forero'         1   <- 2026-08-29, la única escrita por el RPC
//     santiago@thinksid.co      1
// 161 de 162 filas atribuidas son correo. Y un nombre para mostrar NO identifica una
// cuenta: hay DOS cuentas de Santiago en `usuarios` (`sforero94@gmail.com` Gerencia y
// `santiago@thinksid.co` Administrador), el mismo hecho que ya costó un backfill mal
// dirigido en la migración 063.
//
// Este guard lee `src/sql/migrations/`, encuentra cada `INSERT INTO movimientos_inventario`
// que exista en una migración, saca POSICIONALMENTE la expresión que cae en la columna
// `responsable`, y exige que esa expresión prefiera el correo. Mirar el fichero entero no
// sirve: la palabra "email" puede aparecer en un comentario y el guard quedaría verde con
// el INSERT igual de mudo.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR_MIGRACIONES = 'src/sql/migrations';

/**
 * Quita los comentarios `--` respetando las cadenas entre comillas simples. El orden
 * importa en las dos direcciones: hay literales que CONTIENEN `--` (la observación
 * `'Captura directa -- ronda de inventario, excepción …'` de la 126) y hay comentarios
 * que contienen apóstrofos y bloques ROLLBACK enteros comentados con SQL adentro (118,
 * 119, 130, 142). Un stripper ingenuo rompe los dos casos.
 */
function quitarComentarios(sql: string): string {
  let salida = '';
  let enCadena = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (!enCadena && c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      salida += '\n';
      continue;
    }
    if (c === "'") enCadena = !enCadena;
    salida += c;
  }

  return salida;
}

/** Divide por comas de nivel 0, ignorando paréntesis anidados y cadenas. */
function partirNivelCero(texto: string): string[] {
  const partes: string[] = [];
  let profundidad = 0;
  let enCadena = false;
  let actual = '';

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === "'") enCadena = !enCadena;
    if (!enCadena) {
      if (c === '(') profundidad++;
      else if (c === ')') profundidad--;
      else if (c === ',' && profundidad === 0) {
        partes.push(actual.trim());
        actual = '';
        continue;
      }
    }
    actual += c;
  }
  if (actual.trim() !== '') partes.push(actual.trim());
  return partes;
}

/** Contenido del paréntesis que abre en `desde`, por balanceo. `desde` apunta al `(`. */
function cuerpoParentesis(texto: string, desde: number): { cuerpo: string; fin: number } | null {
  if (texto[desde] !== '(') return null;
  let profundidad = 0;
  let enCadena = false;

  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (c === "'") enCadena = !enCadena;
    if (enCadena) continue;
    if (c === '(') profundidad++;
    else if (c === ')') {
      profundidad--;
      if (profundidad === 0) return { cuerpo: texto.slice(desde + 1, i), fin: i };
    }
  }
  return null;
}

interface SitioInsert {
  archivo: string;
  columnas: string[];
  valores: string[];
}

function insertsDeMovimientos(archivo: string, sqlSinComentarios: string): SitioInsert[] {
  const sitios: SitioInsert[] = [];
  const re = /INSERT\s+INTO\s+(?:public\s*\.\s*)?movimientos_inventario\s*\(/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sqlSinComentarios)) !== null) {
    const iCols = m.index + m[0].length - 1;
    const cols = cuerpoParentesis(sqlSinComentarios, iCols);
    if (!cols) continue;

    const resto = sqlSinComentarios.slice(cols.fin + 1);
    const mVals = /^\s*VALUES\s*\(/i.exec(resto);
    if (!mVals) {
      // INSERT … SELECT u otra forma que este guard no sabe leer. No se ignora en
      // silencio: se registra con las listas vacías y el caso de abajo lo denuncia.
      sitios.push({ archivo, columnas: partirNivelCero(cols.cuerpo), valores: [] });
      continue;
    }
    const iVals = cols.fin + 1 + mVals[0].length - 1;
    const vals = cuerpoParentesis(sqlSinComentarios, iVals);
    if (!vals) continue;

    sitios.push({
      archivo,
      columnas: partirNivelCero(cols.cuerpo).map((c) => c.toLowerCase()),
      valores: partirNivelCero(vals.cuerpo),
    });
  }

  return sitios;
}

/** Ficheros de migración ordenados por su prefijo numérico (140_a antes que 140_b). */
function ficherosMigracion(): string[] {
  return readdirSync(join(process.cwd(), DIR_MIGRACIONES))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => {
      const na = Number.parseInt(a.slice(0, 3), 10);
      const nb = Number.parseInt(b.slice(0, 3), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

const FUENTES: { archivo: string; sql: string }[] = ficherosMigracion().map((f) => ({
  archivo: `${DIR_MIGRACIONES}/${f}`,
  sql: quitarComentarios(readFileSync(join(process.cwd(), DIR_MIGRACIONES, f), 'utf-8')),
}));

/**
 * Último cuerpo de `nombre` en la serie de migraciones. "Último" es el que gana: una
 * función se corrige con `CREATE OR REPLACE` en una migración posterior y la 126 nunca
 * se edita (130/131/132 son precedente).
 */
function ultimoCuerpoDeFuncion(nombre: string): { archivo: string; cuerpo: string } | null {
  let encontrado: { archivo: string; cuerpo: string } | null = null;
  const re = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+(?:public\\s*\\.\\s*)?${nombre}\\s*\\(`, 'gi');

  for (const { archivo, sql } of FUENTES) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index);
      const mTag = /AS\s*\$([A-Za-z_]*)\$/i.exec(resto);
      if (!mTag) continue;
      const inicio = mTag.index + mTag[0].length;
      const cierre = resto.indexOf(`$${mTag[1]}$`, inicio);
      if (cierre === -1) continue;
      encontrado = { archivo, cuerpo: resto.slice(inicio, cierre) };
    }
  }

  return encontrado;
}

/** ¿El cuerpo prefiere el correo a cualquier nombre para mostrar? */
function prefiereCorreo(cuerpo: string): { ok: boolean; motivo: string } {
  // `/email/i` sin `\b`: en `v_email` el guion bajo es carácter de palabra, así que
  // `\bemail\b` NO casa -- y `v_email` es exactamente lo que escribe la 106.
  const iCorreo = cuerpo.search(/email/i);
  if (iCorreo === -1) {
    return { ok: false, motivo: 'el cuerpo no lee ninguna columna `email`' };
  }
  for (const nombre of ['nombre_display', 'nombre_completo']) {
    const iNombre = cuerpo.toLowerCase().indexOf(nombre);
    if (iNombre !== -1 && iNombre < iCorreo) {
      return { ok: false, motivo: `\`${nombre}\` aparece antes que \`email\` en el COALESCE` };
    }
  }
  return { ok: true, motivo: '' };
}

const TODOS_LOS_SITIOS = FUENTES.flatMap(({ archivo, sql }) => insertsDeMovimientos(archivo, sql));

describe('guard SQL: un RPC que escribe movimientos_inventario.responsable prefiere el correo', () => {
  it('el guard encuentra los INSERT que sabe que existen (si no, dejó de mirar)', () => {
    // 106 (fn_cerrar_aplicacion) + 126 (resolver_con_captura y aplicar_ajuste).
    const archivos = new Set(TODOS_LOS_SITIOS.map((s) => s.archivo));
    expect(archivos).toContain('src/sql/migrations/106_cierre_aplicacion_transaccional.sql');
    expect(archivos).toContain('src/sql/migrations/126_ronda_inventario_rpcs.sql');
    expect(TODOS_LOS_SITIOS.length).toBeGreaterThanOrEqual(3);
  });

  it('cada INSERT nombra la columna `responsable` y alinea columnas con valores', () => {
    for (const sitio of TODOS_LOS_SITIOS) {
      expect(
        sitio.valores.length,
        `${sitio.archivo}: INSERT INTO movimientos_inventario en una forma que este guard ` +
          'no sabe leer (¿INSERT … SELECT?). Extendé el guard en vez de dejarlo pasar.',
      ).toBeGreaterThan(0);

      expect(
        sitio.columnas.length,
        `${sitio.archivo}: la lista de columnas y la de valores no tienen el mismo largo; ` +
          'el guard no puede alinear `responsable` con su expresión.',
      ).toBe(sitio.valores.length);

      expect(
        sitio.columnas,
        `${sitio.archivo}: un INSERT en movimientos_inventario sin la columna \`responsable\`. ` +
          'La tabla no tiene trigger de atribución: la fila queda sin persona responsable ' +
          'para siempre y el libro que audita GlobalGAP no puede decir quién movió el stock.',
      ).toContain('responsable');
    }
  });

  it('la expresión que cae en `responsable` prefiere el correo, nunca un nombre para mostrar', () => {
    for (const sitio of TODOS_LOS_SITIOS) {
      const idx = sitio.columnas.indexOf('responsable');
      if (idx === -1) continue; // ya denunciado por el caso anterior
      const expr = sitio.valores[idx] ?? '';

      // (a) la expresión menciona el correo directamente -- p. ej. `v_email`, que la 106
      //     deriva de `auth.jwt() ->> 'email'`.
      if (/email/i.test(expr)) continue;

      // (b) delega en una función de la propia serie de migraciones: se resuelve su
      //     ÚLTIMO cuerpo y se le exige lo mismo.
      const mFn = /^([a-z_][a-z0-9_]*)\s*\(/i.exec(expr);
      const fn = mFn?.[1];
      expect(
        fn,
        `${sitio.archivo}: \`responsable\` recibe \`${expr}\`, que ni menciona el correo ni ` +
          'es una llamada a una función de las migraciones. `movimientos_inventario.responsable` ' +
          'es texto libre sin FK y el resto del sistema la escribe en formato correo; un ' +
          'segundo formato parte la columna en dos sin que nada falle, y un nombre para ' +
          'mostrar además no identifica una cuenta (hay dos cuentas de Santiago en `usuarios`).',
      ).toBeTruthy();

      const definicion = ultimoCuerpoDeFuncion(fn as string);
      expect(
        definicion,
        `${sitio.archivo}: \`responsable\` recibe \`${fn}(…)\` pero ninguna migración define ` +
          `\`${fn}\`; el guard no puede comprobar qué escribe.`,
      ).not.toBeNull();

      const veredicto = prefiereCorreo((definicion as { cuerpo: string }).cuerpo);
      expect(
        veredicto.ok,
        `${sitio.archivo}: \`responsable\` recibe \`${fn}(…)\`, y su último cuerpo ` +
          `(${definicion?.archivo}) no prefiere el correo: ${veredicto.motivo}. ` +
          'Corregilo con un `CREATE OR REPLACE` en una migración NUEVA -- nunca editando ' +
          'la que ya se aplicó.',
      ).toBe(true);
    }
  });

  it('fn_ronda_actor_nombre resuelve el correo antes que nombre_display/nombre_completo', () => {
    const definicion = ultimoCuerpoDeFuncion('fn_ronda_actor_nombre');
    expect(definicion, 'ninguna migración define fn_ronda_actor_nombre').not.toBeNull();

    const cuerpo = (definicion as { cuerpo: string }).cuerpo;
    // `toContain` ANTES de comparar índices: un test de orden con `indexOf(a) < indexOf(b)`
    // pasa en vacío cuando `a` no está (-1 < 0).
    expect(cuerpo.toLowerCase()).toContain('email');

    const veredicto = prefiereCorreo(cuerpo);
    expect(
      veredicto.ok,
      `fn_ronda_actor_nombre (${definicion?.archivo}) no prefiere el correo: ${veredicto.motivo}.`,
    ).toBe(true);
  });
});
