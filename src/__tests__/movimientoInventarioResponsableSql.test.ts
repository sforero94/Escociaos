// ARCHIVO: __tests__/movimientoInventarioResponsableSql.test.ts
// DESCRIPCIÓN: la mitad SQL del guard de `movimientos_inventario.responsable`.
//
// `movimientoInventarioResponsable.test.ts` vigila los tres escritores TypeScript y
// exige que estampen `user?.email`. No puede ver un RPC, y por eso el defecto #63 entró
// sin que nada se pusiera rojo: los dos RPC de ronda usaban el helper HUMANO
// `fn_ronda_actor_nombre` para llenar una columna de IDENTIDAD. Ese helper debe seguir
// siendo nombre-primero porque también alimenta mensajes visibles; los INSERT de
// inventario deben usar el helper separado `fn_ronda_actor_correo`.
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
// Este guard lee `src/sql/migrations/`, resuelve la definición MÁS RECIENTE de cada
// función (una migración nueva reemplaza el cuerpo, nunca se edita la aplicada), encuentra
// sus `INSERT INTO movimientos_inventario`, saca POSICIONALMENTE la expresión que cae en
// `responsable`, y exige el contrato correcto según el consumidor. Mirar todo el historial
// como si siguiera vivo da un falso rojo: la 126 debe conservar para siempre sus cuerpos
// obsoletos aunque una migración posterior reemplace ambos RPC.

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
  funcion?: string;
  columnas: string[];
  valores: string[];
}

function insertsDeMovimientos(
  archivo: string,
  sqlSinComentarios: string,
  funcion?: string,
): SitioInsert[] {
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
      sitios.push({ archivo, funcion, columnas: partirNivelCero(cols.cuerpo), valores: [] });
      continue;
    }
    const iVals = cols.fin + 1 + mVals[0].length - 1;
    const vals = cuerpoParentesis(sqlSinComentarios, iVals);
    if (!vals) continue;

    sitios.push({
      archivo,
      funcion,
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
      const aNumerado = Number.isFinite(na);
      const bNumerado = Number.isFinite(nb);
      if (aNumerado !== bNumerado) return aNumerado ? 1 : -1;
      if (aNumerado && bNumerado && na !== nb) return na - nb;
      return a.localeCompare(b);
    });
}

const FUENTES: { archivo: string; sql: string }[] = ficherosMigracion().map((f) => ({
  archivo: `${DIR_MIGRACIONES}/${f}`,
  sql: quitarComentarios(readFileSync(join(process.cwd(), DIR_MIGRACIONES, f), 'utf-8')),
}));

interface DefinicionFuncion {
  archivo: string;
  nombre: string;
  cuerpo: string;
}

/** El regex de DDL no debe confundir un mensaje de error SQL con DDL ejecutable. */
function estaEnCadenaSimple(texto: string, indice: number): boolean {
  let enCadena = false;
  for (let i = 0; i < indice; i++) {
    if (texto[i] !== "'") continue;
    if (enCadena && texto[i + 1] === "'") {
      i++;
      continue;
    }
    enCadena = !enCadena;
  }
  return enCadena;
}

/** Extrae cuerpos en el orden en que aparecen dentro de una migración. */
function definicionesDeFunciones(archivo: string, sql: string): DefinicionFuncion[] {
  const definiciones: DefinicionFuncion[] = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(sql)) !== null) {
    if (estaEnCadenaSimple(sql, m.index)) continue;
    const resto = sql.slice(m.index);
    const mTag = /AS\s*\$([A-Za-z_]*)\$/i.exec(resto);
    if (!mTag) continue;
    const inicio = mTag.index + mTag[0].length;
    const cierre = resto.indexOf(`$${mTag[1]}$`, inicio);
    if (cierre === -1) continue;
    definiciones.push({
      archivo,
      nombre: m[1].toLowerCase(),
      cuerpo: resto.slice(inicio, cierre),
    });
    // No busques `CREATE FUNCTION` dentro del cuerpo: puede ser SQL dinámico o texto.
    re.lastIndex = m.index + cierre + `$${mTag[1]}$`.length;
  }

  return definiciones;
}

const DEFINICIONES = FUENTES.flatMap(({ archivo, sql }) => definicionesDeFunciones(archivo, sql));

// Map conserva el orden de inserción y reemplaza el valor: exactamente la semántica de
// CREATE OR REPLACE a través de una serie de migraciones ordenada.
const ULTIMAS_DEFINICIONES = new Map<string, DefinicionFuncion>();
for (const definicion of DEFINICIONES) {
  ULTIMAS_DEFINICIONES.set(definicion.nombre, definicion);
}

function ultimoCuerpoDeFuncion(nombre: string): DefinicionFuncion | null {
  return ULTIMAS_DEFINICIONES.get(nombre.toLowerCase()) ?? null;
}

/**
 * Producción difiere de la copia de la 126 sólo en cuatro mensajes de error. Esos
 * literales no cambian control ni datos, pero los argumentos que siguen a la cadena sí
 * son ejecutables y deben conservarse. Este scanner sustituye exclusivamente la primera
 * cadena SQL de cada `RAISE EXCEPTION`, respetando apóstrofos escapados como `''`.
 */
function normalizarMensajesRaiseException(cuerpo: string): string {
  const re = /RAISE\s+EXCEPTION\s*/gi;
  let salida = '';
  let desde = 0;

  while (re.exec(cuerpo) !== null) {
    const inicioMensaje = re.lastIndex;
    if (cuerpo[inicioMensaje] !== "'") continue;

    let finMensaje = inicioMensaje + 1;
    while (finMensaje < cuerpo.length) {
      if (cuerpo[finMensaje] !== "'") {
        finMensaje++;
        continue;
      }
      if (cuerpo[finMensaje + 1] === "'") {
        finMensaje += 2;
        continue;
      }
      break;
    }
    if (finMensaje >= cuerpo.length) continue;

    salida += cuerpo.slice(desde, inicioMensaje) + "'<mensaje>'";
    desde = finMensaje + 1;
    re.lastIndex = desde;
  }

  return salida + cuerpo.slice(desde);
}

function normalizarCuerpoParaInvariancia(cuerpo: string): string {
  return normalizarMensajesRaiseException(cuerpo).replace(/\s+/g, ' ').trim();
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

const SITIOS_VIGENTES = [...ULTIMAS_DEFINICIONES.values()].flatMap((definicion) =>
  insertsDeMovimientos(definicion.archivo, definicion.cuerpo, definicion.nombre),
);

const ESCRITORES_RONDA = [
  'fn_ronda_resolver_con_captura',
  'fn_ronda_aplicar_ajuste',
];

describe('guard SQL: identidad de inventario separada del nombre humano', () => {
  it('ordena la serie numerada después de los SQL legado sin número', () => {
    const archivos = ficherosMigracion();
    const numeros = archivos
      .map((archivo) => Number.parseInt(archivo.slice(0, 3), 10))
      .filter(Number.isFinite);
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b));
    expect(archivos.at(-1)).toMatch(/^\d{3}/);
  });

  it('ignora CREATE FUNCTION citados en comentarios o mensajes SQL', () => {
    const muestra = quitarComentarios(`
      -- CREATE FUNCTION falsa_comentario() RETURNS text AS $$ SELECT 'mal' $$;
      DO $$ BEGIN
        RAISE NOTICE 'CREATE OR REPLACE FUNCTION falsa_mensaje()';
      END $$;
      CREATE FUNCTION real() RETURNS text AS $$ SELECT 'primera' $$ LANGUAGE sql;
      CREATE OR REPLACE FUNCTION real() RETURNS text AS $body$ SELECT 'vigente' $body$ LANGUAGE sql;
    `);
    const definiciones = definicionesDeFunciones('muestra.sql', muestra);
    expect(definiciones.map((definicion) => definicion.nombre)).toEqual(['real', 'real']);
    expect(definiciones.at(-1)?.cuerpo).toContain("'vigente'");
  });

  it('la invariancia ignora sólo el mensaje de RAISE EXCEPTION, no sus argumentos ni otros literales', () => {
    const base = `
      IF v_estado <> 'aprobado' THEN
        RAISE EXCEPTION 'mensaje viejo con ''comillas'' y %', v_estado;
      END IF;
      SELECT 'literal de negocio';
    `;
    const soloMensajeCambia = base.replace(
      "mensaje viejo con ''comillas'' y %",
      'mensaje vivo distinto %',
    );
    const argumentoCambia = soloMensajeCambia.replace(', v_estado;', ', otro_estado;');
    const literalNoErrorCambia = soloMensajeCambia.replace(
      "'literal de negocio'",
      "'otro literal'",
    );

    expect(normalizarCuerpoParaInvariancia(soloMensajeCambia))
      .toBe(normalizarCuerpoParaInvariancia(base));
    expect(normalizarCuerpoParaInvariancia(argumentoCambia))
      .not.toBe(normalizarCuerpoParaInvariancia(base));
    expect(normalizarCuerpoParaInvariancia(literalNoErrorCambia))
      .not.toBe(normalizarCuerpoParaInvariancia(base));
  });

  it('el guard encuentra los tres escritores vigentes que sabe que existen', () => {
    const funciones = new Set(SITIOS_VIGENTES.map((s) => s.funcion));
    expect(funciones).toContain('fn_cerrar_aplicacion');
    expect(funciones).toContain('fn_ronda_resolver_con_captura');
    expect(funciones).toContain('fn_ronda_aplicar_ajuste');
    expect(SITIOS_VIGENTES.length).toBeGreaterThanOrEqual(3);
  });

  it('cada INSERT nombra la columna `responsable` y alinea columnas con valores', () => {
    for (const sitio of SITIOS_VIGENTES) {
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

  it('cada expresión vigente que cae en `responsable` prefiere el correo', () => {
    for (const sitio of SITIOS_VIGENTES) {
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

  it('los dos INSERT de ronda vigentes usan fn_ronda_actor_correo, no el helper de presentación', () => {
    for (const nombre of ESCRITORES_RONDA) {
      const sitios = SITIOS_VIGENTES.filter((sitio) => sitio.funcion === nombre);
      expect(sitios, `el cuerpo vigente de ${nombre} ya no inserta el movimiento`).toHaveLength(1);

      const sitio = sitios[0];
      const idx = sitio.columnas.indexOf('responsable');
      expect(idx, `${nombre} no nombra la columna responsable`).toBeGreaterThanOrEqual(0);
      expect(
        sitio.valores[idx],
        `${nombre} debe separar identidad de presentación: responsable recibe ` +
          '`fn_ronda_actor_correo(…)`, nunca `fn_ronda_actor_nombre(…)`.',
      ).toMatch(/^fn_ronda_actor_correo\s*\(/i);
    }
  });

  it('interpreta como vigentes los RPC reemplazados, no sus INSERT obsoletos de la 126', () => {
    for (const nombre of ESCRITORES_RONDA) {
      const versiones = DEFINICIONES.filter((definicion) => definicion.nombre === nombre);
      expect(
        versiones.length,
        `${nombre} debe tener el cuerpo original y un CREATE OR REPLACE posterior`,
      ).toBeGreaterThanOrEqual(2);

      const original = versiones[0];
      const vigente = ultimoCuerpoDeFuncion(nombre);
      expect(original.archivo).toBe('src/sql/migrations/126_ronda_inventario_rpcs.sql');
      expect(insertsDeMovimientos(original.archivo, original.cuerpo)[0]?.valores.join(' '))
        .toMatch(/fn_ronda_actor_nombre\s*\(/i);
      expect(vigente?.archivo).toBe(versiones.at(-1)?.archivo);
      expect(vigente?.archivo).not.toBe(original.archivo);
      expect(insertsDeMovimientos(vigente!.archivo, vigente!.cuerpo)[0]?.valores.join(' '))
        .toMatch(/fn_ronda_actor_correo\s*\(/i);

      // Los RPC son largos y CREATE OR REPLACE sustituye el cuerpo entero. El arreglo
      // autorizado cambia una llamada, no ofrece permiso para alterar reglas de negocio.
      expect(
        normalizarCuerpoParaInvariancia(vigente!.cuerpo),
        `${nombre} cambió lógica, argumentos o un literal ajeno a los mensajes de ` +
          '`RAISE EXCEPTION`, además del helper de atribución autorizado',
      ).toBe(
        normalizarCuerpoParaInvariancia(original.cuerpo).replace(
          /fn_ronda_actor_nombre/g,
          'fn_ronda_actor_correo',
        ),
      );
    }
  });

  it('fn_ronda_actor_correo es email-first y conserva un respaldo no vacío', () => {
    const definicion = ultimoCuerpoDeFuncion('fn_ronda_actor_correo');
    expect(definicion, 'ninguna migración define fn_ronda_actor_correo').not.toBeNull();

    const cuerpo = definicion!.cuerpo;
    const veredicto = prefiereCorreo(cuerpo);
    expect(
      veredicto.ok,
      `fn_ronda_actor_correo (${definicion?.archivo}) no prefiere el correo: ${veredicto.motivo}.`,
    ).toBe(true);
    expect(cuerpo).toMatch(/nombre_display/i);
    expect(cuerpo).toContain('Ronda de inventario');
  });

  it('fn_ronda_actor_nombre sigue siendo nombre-first para las superficies humanas', () => {
    const definicion = ultimoCuerpoDeFuncion('fn_ronda_actor_nombre');
    expect(definicion, 'ninguna migración define fn_ronda_actor_nombre').not.toBeNull();

    const cuerpo = definicion!.cuerpo.toLowerCase();
    const iEmail = cuerpo.indexOf('email');
    expect(iEmail, 'fn_ronda_actor_nombre perdió el fallback de correo').toBeGreaterThanOrEqual(0);
    for (const nombre of ['nombre_display', 'nombre_completo']) {
      const iNombre = cuerpo.indexOf(nombre);
      expect(iNombre, `fn_ronda_actor_nombre perdió ${nombre}`).toBeGreaterThanOrEqual(0);
      expect(
        iNombre,
        `fn_ronda_actor_nombre (${definicion?.archivo}) debe resolver ${nombre} antes que email`,
      ).toBeLessThan(iEmail);
    }
  });
});
