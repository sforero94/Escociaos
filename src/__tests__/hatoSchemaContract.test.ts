import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Guard del contrato de esquema — Hato Lechero, sesión S1 ("Esquema y RLS").
 *
 * Test estático puro (sin conexión a DB, sin ejecutar SQL): lee los 8
 * archivos de migración 053-060 como texto y verifica, con regex tolerantes
 * a mayúsculas/minúsculas y estilo de comillas, que cumplen el contrato
 * fijado por `hato_s1_brief.md` (CTO, 2026-07-22) — filenames exactos,
 * tablas + RLS + policies, UNIQUEs/CHECKs de negocio, las dos vistas, el
 * guard del trigger de finanzas, los seeds y el cron.
 *
 * Escrito ANTES de que existan los archivos (TDD): el agente de backend
 * implementa las migraciones contra este contrato, no al revés. Es normal
 * y esperado que este archivo falle en rojo hasta que 053-060 existan.
 *
 * Sigue el estilo de `dialogScrollContract.test.ts`: helpers de
 * lectura/regex + mensajes de fallo que explican la consecuencia de
 * dominio, no solo "falta X".
 */

const MIGRATIONS_DIR = join(__dirname, '../sql/migrations');

// ---------------------------------------------------------------------------
// Lectura tolerante a ausencia: cada helper devuelve `null` en vez de lanzar,
// para que cada assertion produzca un mensaje de dominio claro en vez de un
// crash de Node cuando el archivo todavía no existe.
// ---------------------------------------------------------------------------

function readIfExists(filename: string): string | null {
  const full = join(MIGRATIONS_DIR, filename);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf-8');
}

const FILES = {
  '053': '053_create_hato_core.sql',
  '054': '054_create_hato_leche.sql',
  '055': '055_create_hato_tratamientos.sql',
  '056': '056_create_hato_alertas.sql',
  '057': '057_create_hato_pajillas.sql',
  '058': '058_create_hato_config.sql',
  '059': '059_fin_transacciones_ganado_hato_link.sql',
  '060': '060_hato_alertas_cron.sql',
} as const;

type Prefix = keyof typeof FILES;

const content: Record<Prefix, string | null> = Object.fromEntries(
  (Object.entries(FILES) as [Prefix, string][]).map(([prefix, filename]) => [
    prefix,
    readIfExists(filename),
  ]),
) as Record<Prefix, string | null>;

/** Qué migración crea cada una de las 15 tablas nuevas (Decisión 1/4). */
const TABLE_OWNER: Record<string, Prefix> = {
  hato_toros: '053',
  hato_animales: '053',
  hato_chequeos: '053',
  hato_chequeo_vacas: '053',
  hato_eventos: '053',
  hato_pesajes_leche: '054',
  hato_produccion_quincenal: '054',
  hato_protocolos: '055',
  hato_tratamientos: '055',
  hato_tratamiento_pasos: '055',
  hato_alertas: '056',
  hato_alertas_config: '056',
  hato_pajillas: '057',
  hato_pajillas_uso: '057',
  hato_config: '058',
};

// ---------------------------------------------------------------------------
// Helpers de regex — tolerantes a mayúsculas/minúsculas y a espacios en
// blanco variables, y conscientes de los DOS estilos de RLS que existen en
// el repo: policies directas (052/023) y el loop dinámico DO $$ ... FOREACH
// t IN ARRAY[...] EXECUTE format('...', t, t) (044, explícitamente pedido
// por la Decisión 5 del brief para el patrón "default").
// ---------------------------------------------------------------------------

function createTableRegex(table: string): RegExp {
  return new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?${table}"?\\s*\\(`, 'i');
}

/** Sub-string del archivo desde el CREATE TABLE de `table` hasta el próximo CREATE TABLE (o EOF). */
function extractTableRegion(sql: string, table: string): string {
  const startRe = createTableRegex(table);
  const m = startRe.exec(sql);
  if (!m) return '';
  const headerEnd = m.index + m[0].length;
  const rest = sql.slice(headerEnd);
  const nextTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?\w+"?\s*\(/i;
  const next = nextTableRe.exec(rest);
  return next ? sql.slice(m.index, headerEnd + next.index) : sql.slice(m.index);
}

/** Extrae cada bloque `CREATE POLICY ... ;` (cubre tanto la forma directa como el texto dentro de EXECUTE format(...);). */
function extractPolicyBlocks(sql: string): string[] {
  const blocks: string[] = [];
  const re = /CREATE\s+POLICY[\s\S]*?;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

function tableListedInArrayLoop(sql: string, table: string): boolean {
  return new RegExp(`ARRAY\\s*\\[[^\\]]*['"]${table}['"][^\\]]*\\]`, 'is').test(sql);
}

function hasRlsEnabled(sql: string, table: string): boolean {
  const direct = new RegExp(
    `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?"?${table}"?\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
    'i',
  );
  if (direct.test(sql)) return true;
  const dynamicEnable = /ALTER\s+TABLE\s+%I\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i;
  return tableListedInArrayLoop(sql, table) && dynamicEnable.test(sql);
}

function hasPolicyFor(sql: string, table: string): boolean {
  const direct = new RegExp(`CREATE\\s+POLICY[\\s\\S]*?\\bON\\s+"?${table}"?\\b`, 'i');
  if (direct.test(sql)) return true;
  const dynamicPolicy = /CREATE\s+POLICY\s+"?%s[^"]*"?\s+ON\s+%I/is;
  return tableListedInArrayLoop(sql, table) && dynamicPolicy.test(sql);
}

function hasAdminGerenciaWritePolicy(sql: string, table: string): boolean {
  const policies = extractPolicyBlocks(sql).filter(
    (p) => new RegExp(`\\b${table}\\b`, 'i').test(p) || /%I/.test(p),
  );
  const directHit = policies.some(
    (p) =>
      /Administrador/i.test(p) &&
      /Gerencia/i.test(p) &&
      (new RegExp(`\\b${table}\\b`, 'i').test(p) || tableListedInArrayLoop(sql, table)),
  );
  if (directHit) return true;
  const dynamicAdminGerencia = /Administrador/i.test(sql) && /Gerencia/i.test(sql) && /%I/.test(sql);
  return tableListedInArrayLoop(sql, table) && dynamicAdminGerencia;
}

// =============================================================================

describe('contrato de esquema — Hato Lechero S1 (053-060)', () => {
  it('encuentra el directorio de migraciones existente', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(sqlFiles.length).toBeGreaterThan(40);
  });

  // ---------------------------------------------------------------------
  // 1-2. Existencia de archivos + numeración sin colisión (Decisión 10 #1-2)
  // ---------------------------------------------------------------------

  describe('existencia de archivos y numeración', () => {
    for (const [prefix, filename] of Object.entries(FILES) as [Prefix, string][]) {
      it(`${filename} existe`, () => {
        expect(
          content[prefix],
          `Falta ${filename} — sin este archivo, ${
            {
              '053': 'no existen hato_toros/hato_animales/hato_chequeos/hato_chequeo_vacas/hato_eventos: el módulo entero queda sin esquema base',
              '054': 'no hay dónde registrar pesajes semanales ni la liquidación quincenal de leche',
              '055': 'no hay catálogo de protocolos ni pasos de tratamiento — la alerta tratamiento_paso no tiene qué leer',
              '056': 'no hay cola de alertas, no hay v_hato_estado_actual, y hato_eventos.alerta_id queda sin FK',
              '057': 'no hay inventario de pajillas ni su vista de stock',
              '058': 'calculosHato.ts (S2) no tiene ningún parámetro configurado — el motor de fechas no puede correr sin UI de Ajustes',
              '059': 'vender/dar de baja una vaca lechera sigue generando un gan_movimientos pendiente de ceba espurio',
              '060': 'no hay tick diario programado — el motor de alertas de S6 nunca se dispara',
            }[prefix]
          }.`,
        ).not.toBeNull();
      });
    }

    it('el rango de prefijos 053-060 contiene exactamente los 8 archivos esperados, ninguno extra', () => {
      const allSqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f));
      const inRange = allSqlFiles.filter((f) => {
        const p = f.slice(0, 3);
        return p >= '053' && p <= '060';
      });
      const expected = Object.values(FILES).slice().sort();
      expect(
        inRange.slice().sort(),
        `El rango 053-060 no contiene exactamente los 8 archivos del brief. Encontrado: [${inRange.join(
          ', ',
        )}]. Un archivo extra o mal nombrado en este rango es exactamente la clase de colisión de numeración que ya obligó a renumerar 050-057 -> 053-060 (Decisión 1 del brief) — un noveno archivo o un nombre distinto deja el orden de aplicación ambiguo.`,
      ).toEqual(expected);
    });

    it('ningún prefijo 053-060 está duplicado (guard global de colisión, acotado a >=053 per Decisión 10 nota #2)', () => {
      // Nota de diseño: un guard verdaderamente GLOBAL (todo el árbol 001-060)
      // falla hoy contra deuda histórica real y ya conocida del repo — no solo
      // el 019 mencionado en el brief, sino también 021/022/023/024/025/026/
      // 027/031/041, cada uno con 2 archivos. Esa deuda es pre-existente y
      // fuera del alcance de este PR. Seguimos la guía explícita del propio
      // brief (Decisión 10, nota bajo el ítem #2): "better, assert uniqueness
      // for prefixes >= 053" — el rango que SÍ introduce este PR.
      const allSqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f));
      const byPrefix = new Map<string, string[]>();
      for (const f of allSqlFiles) {
        const prefix = f.slice(0, 3);
        if (prefix < '053') continue;
        if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
        byPrefix.get(prefix)!.push(f);
      }
      const offenders = [...byPrefix.entries()].filter(([, files]) => files.length > 1);
      expect(
        offenders,
        `Prefijo de migración duplicado en 053-060: ${JSON.stringify(
          offenders,
        )} — dos migraciones con el mismo número dejan el orden de aplicación indefinido; el runner podría aplicar cualquiera de las dos primero, y si dependen una de la otra (como 053 y 056 dependen entre sí vía el back-patch de FK) una de las dos rompe.`,
      ).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // 3-4. Presencia de las 15 tablas + RLS + policy (Decisión 10 #3-4)
  // ---------------------------------------------------------------------

  describe('presencia de tablas + RLS por tabla (Decisión 4/5 del brief)', () => {
    for (const [table, owner] of Object.entries(TABLE_OWNER)) {
      const ownerFile = FILES[owner];

      it(`${table}: CREATE TABLE IF NOT EXISTS existe en ${ownerFile} y en ningún otro archivo del set`, () => {
        const ownerContent = content[owner];
        expect(ownerContent, `${ownerFile} no existe todavía.`).not.toBeNull();
        if (ownerContent === null) return;

        expect(
          createTableRegex(table).test(ownerContent),
          `No se encontró "CREATE TABLE IF NOT EXISTS ${table}" en ${ownerFile} — sin esta tabla (o sin el IF NOT EXISTS que la hace idempotente), re-aplicar las migraciones en un ambiente que ya la tiene falla, y todo lo que depende de ${table} (FKs, RLS, seeds, la vista v_hato_estado_actual si aplica) no tiene sobre qué pararse.`,
        ).toBe(true);

        const occurrences = (Object.entries(content) as [Prefix, string | null][]).filter(
          ([, c]) => c !== null && createTableRegex(table).test(c),
        );
        expect(
          occurrences.length,
          `${table} aparece declarada en más de un archivo (${occurrences
            .map(([p]) => FILES[p])
            .join(', ')}) — indica una migración duplicada/copiada que puede divergir en columnas entre los dos archivos, el mismo tipo de bug que forzó el rename de 019/023/024/etc. en el historial de este repo.`,
        ).toBe(1);
      });

      it(`${table}: tiene ENABLE ROW LEVEL SECURITY y al menos una CREATE POLICY`, () => {
        const ownerContent = content[owner];
        expect(ownerContent, `${ownerFile} no existe todavía.`).not.toBeNull();
        if (ownerContent === null) return;

        expect(
          hasRlsEnabled(ownerContent, table),
          `${table} no tiene "ENABLE ROW LEVEL SECURITY" (ni en forma directa ni vía el loop DO $$ ... FOREACH de 044) en ${ownerFile} — sin RLS habilitada, cualquier usuario autenticado con la anon key lee TODA la tabla directo, sin pasar por rol.`,
        ).toBe(true);

        expect(
          hasPolicyFor(ownerContent, table),
          `${table} no tiene ninguna CREATE POLICY asociada en ${ownerFile} — con RLS habilitada y cero policies la tabla queda ilegible para TODOS los roles (rompe la app en vez de exponer datos, pero sigue siendo un bloqueo de release).`,
        ).toBe(true);
      });
    }
  });

  describe('hato_config: lectura abierta, escritura Gerencia-only (Decisión 10 #5)', () => {
    const c = content['058'];

    it('SELECT es TO authenticated USING (TRUE), no Gerencia-only', () => {
      expect(c, '058_create_hato_config.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const policies = extractPolicyBlocks(c).filter((p) => /hato_config/i.test(p));
      const ok = policies.some(
        (p) => /FOR\s+SELECT/i.test(p) && /TO\s+authenticated/i.test(p) && /USING\s*\(\s*TRUE\s*\)/i.test(p),
      );
      expect(
        ok,
        'hato_config no tiene un SELECT abierto (TO authenticated USING (TRUE)) — si el SELECT quedara detrás de es_usuario_gerencia(), calculosHato.ts no podría leer meses_secado_por_raza/umbrales para un Administrador armando un preview de Secar/PP, y el motor de fechas fallaría (o mostraría vacío) para cualquier rol que no sea Gerencia.',
      ).toBe(true);
    });

    it('las policies de escritura (INSERT/UPDATE/DELETE) usan es_usuario_gerencia()', () => {
      expect(c, '058_create_hato_config.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const writePolicies = extractPolicyBlocks(c).filter(
        (p) => /hato_config/i.test(p) && /FOR\s+(INSERT|UPDATE|DELETE|ALL)/i.test(p),
      );
      expect(
        writePolicies.length,
        'No se encontró ninguna policy de escritura (INSERT/UPDATE/DELETE) sobre hato_config.',
      ).toBeGreaterThan(0);
      const allGerencia = writePolicies.every((p) => /es_usuario_gerencia\s*\(\s*\)/i.test(p));
      expect(
        allGerencia,
        'Al menos una policy de escritura sobre hato_config no usa es_usuario_gerencia() — sin ese gate, un Administrador (no solo Gerencia) podría editar meses_secado_por_raza o los umbrales de alerta, contradiciendo la Decisión 5 del brief ("hato_config Gerencia-only") y cambiando silenciosamente las fechas calculadas para todo el hato.',
      ).toBe(true);
    });
  });

  describe('hato_alertas / hato_alertas_config: escritura Administrador+Gerencia (Decisión 10 #6)', () => {
    for (const table of ['hato_alertas', 'hato_alertas_config']) {
      it(`${table}: tiene policy de escritura que combina Administrador y Gerencia`, () => {
        const c = content['056'];
        expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
        if (!c) return;
        expect(
          hasAdminGerenciaWritePolicy(c, table),
          `${table} no tiene una policy de escritura que combine los roles Administrador Y Gerencia — el tick/bot escriben con la service_role key (bypassa RLS por completo, sin policy dedicada — ver nota del brief sobre no agregar una policy "TO service_role" redundante), pero un humano (Martha, Administrador) necesita poder marcar una alerta respondida/descartada desde AlertasView; sin esta policy solo Gerencia podría operar la cola.`,
        ).toBe(true);
      });
    }
  });

  // ---------------------------------------------------------------------
  // 7-13. UNIQUEs / CHECKs de negocio (Decisión 10 #7-13)
  // ---------------------------------------------------------------------

  describe('constraints de negocio clave', () => {
    it('hato_animales: numero es UNIQUE', () => {
      const c = content['053'];
      expect(c, '053_create_hato_core.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_animales');
      const ok = /numero\s+integer\s+UNIQUE/i.test(region) || /UNIQUE\s*\(\s*numero\s*\)/i.test(region);
      expect(
        ok,
        'hato_animales.numero no tiene UNIQUE — sin esta restricción, dos vacas activas podrían compartir la misma chapeta física, violando D1 del plan ("dos activas jamás comparten numero") sin que la base de datos lo impida; el sistema no podría distinguir a cuál de las dos se refiere un chequeo o una alerta.',
      ).toBe(true);
    });

    it('hato_chequeo_vacas: UNIQUE (chequeo_id, animal_id)', () => {
      const c = content['053'];
      expect(c, '053_create_hato_core.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_chequeo_vacas');
      expect(
        /UNIQUE\s*\(\s*chequeo_id\s*,\s*animal_id\s*\)/i.test(region),
        'Falta UNIQUE (chequeo_id, animal_id) en hato_chequeo_vacas — sin esta restricción, la misma vaca podría insertarse dos veces en el mismo chequeo (por ejemplo si el diff de importación o la grilla de captura se aplica dos veces), duplicando su PL/fecha_secar normalizados y volviendo ambiguo cuál fila es la verdadera.',
      ).toBe(true);
    });

    it('hato_pesajes_leche: UNIQUE (animal_id, fecha)', () => {
      const c = content['054'];
      expect(c, '054_create_hato_leche.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_pesajes_leche');
      expect(
        /UNIQUE\s*\(\s*animal_id\s*,\s*fecha\s*\)/i.test(region),
        'Falta UNIQUE (animal_id, fecha) en hato_pesajes_leche — sin esta restricción, un mismo animal podría tener dos pesajes el mismo día; litros_total (la columna GENERATED que suma AM+PM) quedaría duplicado y la curva de PL de la hoja de vida se distorsiona.',
      ).toBe(true);
    });

    it('hato_produccion_quincenal: UNIQUE (anio, mes, quincena) — NO la versión rota del plan original UNIQUE(anio, quincena)', () => {
      const c = content['054'];
      expect(c, '054_create_hato_leche.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_produccion_quincenal');
      expect(
        /UNIQUE\s*\(\s*anio\s*,\s*mes\s*,\s*quincena\s*\)/i.test(region),
        'Falta UNIQUE (anio, mes, quincena) en hato_produccion_quincenal (con la columna mes incluida) — la versión original del plan, UNIQUE(anio, quincena) sin mes, permite solo 2 filas por año, pero el ciclo de liquidación es quincenal (24 filas/año): la segunda quincena de marzo y la segunda quincena de mayo colisionarían como si fueran el mismo registro (Deviation #4 del brief, corrección de esquema, no cambio de alcance).',
      ).toBe(true);
    });

    it('hato_produccion_quincenal: CHECK (quincena IN (1,2))', () => {
      const c = content['054'];
      expect(c, '054_create_hato_leche.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_produccion_quincenal');
      expect(
        /CHECK\s*\(\s*quincena\s+IN\s*\(\s*1\s*,\s*2\s*\)\s*\)/i.test(region),
        'Falta CHECK (quincena IN (1,2)) en hato_produccion_quincenal — sin este CHECK, un valor de quincena fuera de {1,2} (ej. un typo "3") se insertaría sin error y rompería silenciosamente cualquier cálculo que asuma exactamente dos quincenas por mes.',
      ).toBe(true);
    });

    it('hato_produccion_quincenal: CHECK (mes BETWEEN 1 AND 12)', () => {
      const c = content['054'];
      expect(c, '054_create_hato_leche.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_produccion_quincenal');
      expect(
        /CHECK\s*\(\s*mes\s+BETWEEN\s+1\s+AND\s+12\s*\)/i.test(region),
        'Falta CHECK (mes BETWEEN 1 AND 12) en hato_produccion_quincenal — sin este CHECK, un mes inválido (ej. 13, o 0) rompería el índice UNIQUE(anio, mes, quincena) como llave lógica y desalinearía cualquier reporte que agrupe por mes.',
      ).toBe(true);
    });

    it('hato_alertas: regla_clave es UNIQUE', () => {
      const c = content['056'];
      expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_alertas');
      const ok =
        /regla_clave\s+text\s+NOT\s+NULL\s+UNIQUE/i.test(region) ||
        /regla_clave[^,)]*\bUNIQUE\b/i.test(region) ||
        /UNIQUE\s*\(\s*regla_clave\s*\)/i.test(region);
      expect(
        ok,
        'Falta UNIQUE en hato_alertas.regla_clave — sin UNIQUE(regla_clave) el tick duplicaría alertas: el INSERT ... ON CONFLICT (regla_clave) DO NOTHING pierde su ancla de idempotencia (§7.3), y Fernando recibiría el mismo aviso de secado/tratamiento repetido cada día que corra el cron — el anti-spam del motor de alertas queda roto.',
      ).toBe(true);
    });

    it('hato_tratamiento_pasos: UNIQUE (tratamiento_id, paso_num)', () => {
      const c = content['055'];
      expect(c, '055_create_hato_tratamientos.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const region = extractTableRegion(c, 'hato_tratamiento_pasos');
      expect(
        /UNIQUE\s*\(\s*tratamiento_id\s*,\s*paso_num\s*\)/i.test(region),
        'Falta UNIQUE (tratamiento_id, paso_num) en hato_tratamiento_pasos — sin esta restricción, el mismo paso de un protocolo (ej. "día 7" de Estrumate) podría insertarse duplicado para el mismo tratamiento, y la alerta tratamiento_paso dispararía dos veces para el mismo evento real.',
      ).toBe(true);
    });

    it('hato_toros: índice único case-insensitive sobre lower(nombre)', () => {
      const c = content['053'];
      expect(c, '053_create_hato_core.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+hato_toros\s*\(\s*lower\s*\(\s*nombre\s*\)\s*\)/is.test(c),
        'Falta el índice único case-insensitive sobre hato_toros(lower(nombre)) — sin él, sembrar toros desde el histórico (con casing inconsistente, mismo problema que motivó gan_fincas_nombre_unique en 044) crea entradas duplicadas del "mismo" toro, y padre_toro_id/hato_pajillas.toro_id terminan apuntando a IDs distintos para lo que debería ser un único semental.',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 14. Vistas (Decisión 10 #14 / Decisión 3)
  // ---------------------------------------------------------------------

  describe('vistas', () => {
    it('056 crea v_hato_estado_actual', () => {
      const c = content['056'];
      expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+v_hato_estado_actual/i.test(c),
        'No se encontró CREATE VIEW v_hato_estado_actual en 056 — sin esta vista, el motor de alertas (S6) y las listas de acción del dashboard (S3) no tienen de dónde leer los hechos por vaca (fecha_secar, último servicio, etc.) y tendrían que re-implementar la agregación por su cuenta, divergiendo de la única fuente de verdad que exige la Decisión 3 del brief.',
      ).toBe(true);
    });

    it('v_hato_estado_actual no es SECURITY DEFINER (ni definer-equivalente sin security_invoker=true)', () => {
      const c = content['056'];
      expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const viewIdx = c.search(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+v_hato_estado_actual/i);
      expect(viewIdx, 'No se pudo ubicar CREATE VIEW v_hato_estado_actual en el archivo.').toBeGreaterThan(-1);
      if (viewIdx === -1) return;

      const viewBlockMatch = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+v_hato_estado_actual[\s\S]*?;/i.exec(c);
      const viewBlock = viewBlockMatch ? viewBlockMatch[0] : c.slice(viewIdx, viewIdx + 3000);

      expect(
        /SECURITY\s+DEFINER/i.test(viewBlock),
        'v_hato_estado_actual (o el bloque inmediatamente asociado) contiene SECURITY DEFINER — la migración 033 existe exactamente para eliminar este patrón: una vista SECURITY DEFINER corre con los privilegios de su dueño, no del usuario que consulta, dándole a CUALQUIER rol acceso a hato_chequeo_vacas/hato_eventos sin pasar por su RLS.',
      ).toBe(false);

      // Precedente 033 (ver su propio comentario: "PostgreSQL 15+ defaults to
      // security_invoker = false" — comportamiento definer-like por defecto).
      // Sin fijar security_invoker=true explícitamente, la vista puede correr
      // con los privilegios de su dueño aunque nunca diga literalmente
      // "SECURITY DEFINER" en ningún lado.
      const nearby = c.slice(viewIdx, viewIdx + 3000);
      expect(
        /security_invoker\s*=\s*true/i.test(nearby),
        'No se encontró "SET (security_invoker = true)" cerca de v_hato_estado_actual — sin fijarlo explícitamente (precedente: 033, que lo hace para sus 5 vistas), Postgres 15+ mantiene el comportamiento definer-like por defecto y la vista puede terminar exponiendo filas de hato_chequeo_vacas/hato_eventos a un rol que no debería verlas, sin que el archivo contenga la palabra "SECURITY DEFINER" en ningún lado.',
      ).toBe(true);
    });

    it('057 crea v_hato_pajillas_stock', () => {
      const c = content['057'];
      expect(c, '057_create_hato_pajillas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+v_hato_pajillas_stock/i.test(c),
        'No se encontró CREATE VIEW v_hato_pajillas_stock en 057 — sin ella, PajillasView (S9) no tiene de dónde leer cantidad_actual = cantidad_inicial - usos, y tendría que calcularlo en el cliente con riesgo de divergir de la fuente única de verdad.',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 15. 059 — es_hato, hato_animal_id, guard del trigger, policy Administrador
  // ---------------------------------------------------------------------

  describe('059 — fin_transacciones_ganado_hato_link (Decisión 7)', () => {
    const c = content['059'];

    it('agrega es_hato boolean NOT NULL DEFAULT false de forma idempotente', () => {
      expect(c, '059_fin_transacciones_ganado_hato_link.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+es_hato\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i.test(c),
        'Falta "ADD COLUMN IF NOT EXISTS es_hato boolean NOT NULL DEFAULT false" — sin esta columna el guard del trigger (IF NEW.es_hato) no tiene sobre qué evaluar, y CADA venta/muerte del hato lechero seguiría generando un gan_movimientos pendiente de ceba espurio en /ganado, exactamente el bug que 059 existe para resolver.',
      ).toBe(true);
    });

    it('agrega hato_animal_id uuid REFERENCES hato_animales(id)', () => {
      expect(c, '059_fin_transacciones_ganado_hato_link.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+hato_animal_id\s+uuid/i.test(c),
        'Falta la columna hato_animal_id — sin ella no hay forma de vincular una transacción de finanzas con el animal del hato que la originó; la hoja de vida de la vaca no podría mostrar su propia venta.',
      ).toBe(true);
    });

    it('CREATE OR REPLACE FUNCTION fn_crear_movimiento_pendiente_ganado con guard IF NEW.es_hato THEN RETURN NEW como primera sentencia', () => {
      expect(c, '059_fin_transacciones_ganado_hato_link.sql no existe todavía.').not.toBeNull();
      if (!c) return;

      const fnIdx = c.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+fn_crear_movimiento_pendiente_ganado/i);
      expect(
        fnIdx,
        'No hay CREATE OR REPLACE FUNCTION fn_crear_movimiento_pendiente_ganado en 059 — esta función solo vive en 044, y 044 NO se puede editar (regla dura del repo: nunca modificar una migración ya aplicada); sin re-declararla aquí vía CREATE OR REPLACE, el guard nunca se instala.',
      ).toBeGreaterThan(-1);
      if (fnIdx === -1) return;

      // IMPORTANTE: se busca el guard SOLO dentro del cuerpo de la función
      // (desde su CREATE OR REPLACE en adelante), nunca en todo el archivo.
      // El comentario de cabecera de 059 describe el guard en prosa ("agrega
      // la guarda `IF NEW.es_hato THEN RETURN NEW` como primera sentencia")
      // ANTES de la declaración real de la función — una búsqueda de archivo
      // completo matchea esa prosa y da un falso verde aunque el cuerpo de
      // la función nunca implemente el guard de verdad (comprobado con test
      // de mutación: remover el guard real sin tocar el comentario dejaba
      // pasar esta assertion hasta este fix).
      const body = c.slice(fnIdx);

      const guardIdx = body.search(/IF\s+NEW\.es_hato\s+THEN/i);
      expect(
        guardIdx,
        'Falta el guard "IF NEW.es_hato THEN ... RETURN NEW" DENTRO del cuerpo de fn_crear_movimiento_pendiente_ganado — sin él, vender o dar de baja una vaca lechera sigue creando un gan_movimientos pendiente de ceba en /ganado que nadie debería tener que confirmar o descartar (el inventario del hato vive en hato_animales, no en gan_inventario). Un comentario que solo DESCRIBE el guard no cuenta — tiene que ser código ejecutable.',
      ).toBeGreaterThan(-1);
      if (guardIdx === -1) return;

      const afterGuard = body.slice(guardIdx, guardIdx + 200);
      expect(
        /RETURN\s+NEW/i.test(afterGuard),
        'El guard "IF NEW.es_hato THEN" no va seguido de un RETURN NEW cercano dentro del cuerpo de la función — sin el early-return, el resto de la función (el INSERT INTO gan_movimientos) se ejecuta de todas formas y el guard queda como un no-op decorativo.',
      ).toBe(true);

      const insertIdx = body.search(/INSERT\s+INTO\s+gan_movimientos/i);
      if (insertIdx !== -1) {
        expect(
          guardIdx,
          'El guard "IF NEW.es_hato" aparece DESPUÉS del INSERT INTO gan_movimientos en el cuerpo de la función — para entonces el movimiento pendiente de ceba espurio ya se creó; el guard debe ser la PRIMERA sentencia (Decisión 7b del brief), no una comprobación tardía.',
        ).toBeLessThan(insertIdx);
      }
    });

    it('agrega una policy que extiende el acceso a Administrador sobre fin_transacciones_ganado', () => {
      expect(c, '059_fin_transacciones_ganado_hato_link.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      const policies = extractPolicyBlocks(c).filter(
        (p) => /fin_transacciones_ganado/i.test(p) || /_admin/i.test(p),
      );
      const hasAdminPolicy = policies.some((p) => /_admin/i.test(p) && /Administrador/i.test(p));
      expect(
        hasAdminPolicy,
        'No se encontró una policy "..._admin" que referencie el rol Administrador sobre fin_transacciones_ganado — sin ella, Martha (Administrador) no puede abrir TransaccionGanadoForm para marcar una vaca vendida/muerta; el brief (Decisión 7c) aprueba explícitamente extender el acceso desde Gerencia-only (023) a Administrador, de forma ADITIVA (sin tocar las 4 policies de 023).',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 16. Orden FK-safe: hato_toros antes que hato_animales (Decisión 10 #16)
  // ---------------------------------------------------------------------

  it('053: hato_toros se crea antes que hato_animales (orden FK-safe, Decisión 2 del brief)', () => {
    const c = content['053'];
    expect(c, '053_create_hato_core.sql no existe todavía.').not.toBeNull();
    if (!c) return;

    const torosMatch = createTableRegex('hato_toros').exec(c);
    const animalesMatch = createTableRegex('hato_animales').exec(c);
    expect(torosMatch, 'No se encontró CREATE TABLE hato_toros en 053.').not.toBeNull();
    expect(animalesMatch, 'No se encontró CREATE TABLE hato_animales en 053.').not.toBeNull();
    if (!torosMatch || !animalesMatch) return;

    expect(
      torosMatch.index,
      'hato_toros se crea DESPUÉS de hato_animales en el archivo — hato_animales.padre_toro_id REFERENCES hato_toros(id) fallaría al aplicar la migración en una base nueva ("relation \\"hato_toros\\" does not exist"), exactamente el bug de ordenamiento hacia-adelante que la Decisión 2 del brief resuelve moviendo hato_toros a core.',
    ).toBeLessThan(animalesMatch.index);
  });

  // ---------------------------------------------------------------------
  // 17. Back-patch de la FK hato_eventos.alerta_id -> hato_alertas (Decisión 10 #17)
  // ---------------------------------------------------------------------

  it('056: back-patchea la FK hato_eventos.alerta_id -> hato_alertas(id)', () => {
    const c = content['056'];
    expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
    if (!c) return;
    expect(
      /ALTER\s+TABLE\s+hato_eventos\s+ADD\s+CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(\s*alerta_id\s*\)\s+REFERENCES\s+hato_alertas\s*\(/is.test(
        c,
      ),
      'Falta "ALTER TABLE hato_eventos ADD CONSTRAINT ... FOREIGN KEY (alerta_id) REFERENCES hato_alertas(id)" en 056 — hato_eventos.alerta_id se declaró SIN constraint en 053 (hato_alertas no existía todavía en ese punto del orden de aplicación, Decisión 2 del brief); sin este back-patch, la columna queda como un uuid suelto sin integridad referencial y nada impide que apunte a un id de alerta inexistente.',
    ).toBe(true);
  });

  // ---------------------------------------------------------------------
  // 18-19. Seeds (Decisión 10 #18-19)
  // ---------------------------------------------------------------------

  describe('058 — seeds de hato_config (9 defaults, Decisión 6)', () => {
    const c = content['058'];
    const EXPECTED_KEYS = [
      'razas',
      'meses_secado_por_raza',
      'meses_gestacion_default',
      'umbral_partos_reemplazo',
      'ventana_proxima_secar_dias',
      'ventana_proximo_parir_dias',
      'dias_parto_proximo_alerta',
      'dias_servicio_sin_confirmacion',
      'dias_rechequeo_due',
    ];

    it.each(EXPECTED_KEYS)('siembra la clave "%s"', (key) => {
      expect(c, '058_create_hato_config.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        new RegExp(`'${key}'`).test(c),
        `Falta el seed de la clave "${key}" en hato_config — sin ella, calculosHato.ts (S2) no tiene ese parámetro y el motor de fechas/alertas no puede correr correctamente (o usa un valor hardcodeado, violando la regla "ninguna de estas constantes vive en código", §7.1) hasta que exista la UI de Ajustes (S10). El deliverable explícito de S1 es que el motor de fechas funcione SIN esa UI.`,
      ).toBe(true);
    });

    it('usa ON CONFLICT (clave) DO NOTHING para no pisar ediciones existentes de Gerencia', () => {
      expect(c, '058_create_hato_config.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /ON\s+CONFLICT\s*\(\s*clave\s*\)\s+DO\s+NOTHING/i.test(c),
        'El seed de hato_config no usa ON CONFLICT (clave) DO NOTHING — sin esta cláusula, re-correr la migración en un ambiente donde Gerencia ya editó un valor (ej. meses_secado_por_raza) lo pisaría de vuelta al default, perdiendo silenciosamente el ajuste.',
      ).toBe(true);
    });
  });

  describe('056 — seeds de hato_alertas_config (5 tipos, Decisión 4)', () => {
    const c = content['056'];
    const TIPOS = [
      'secado_due',
      'tratamiento_paso',
      'rechequeo_due',
      'servicio_sin_confirmacion',
      'parto_proximo',
    ];

    it.each(TIPOS)('siembra el tipo de alerta "%s"', (tipo) => {
      expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        new RegExp(`'${tipo}'`).test(c),
        `Falta el seed de hato_alertas_config para el tipo "${tipo}" — sin una fila de configuración, el motor de alertas (S6) no tiene destinatario_telegram_id/horas_escalamiento por defecto para ese tipo, y el tick fallaría o silenciosamente no escalaría el primer día que corra, antes de que exista la UI de Ajustes.`,
      ).toBe(true);
    });

    it('usa ON CONFLICT (tipo) DO NOTHING', () => {
      expect(c, '056_create_hato_alertas.sql no existe todavía.').not.toBeNull();
      if (!c) return;
      expect(
        /ON\s+CONFLICT\s*\(\s*tipo\s*\)\s+DO\s+NOTHING/i.test(c),
        'El seed de hato_alertas_config no usa ON CONFLICT (tipo) DO NOTHING — un re-run pisaría el horas_escalamiento/destinatario que Gerencia ya haya configurado por UI, volviendo a 48h por defecto.',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 20. Cron (Decisión 10 #20 / Decisión 8)
  // ---------------------------------------------------------------------

  describe('060 — hato_alertas_cron (Decisión 8)', () => {
    const c = content['060'];

    // IMPORTANTE — todas las assertions de este bloque se acotan al cuerpo
    // REAL de cron.schedule(...) / net.http_post(...), nunca a `c` completo.
    // El comentario de cabecera de 060 describe el mecanismo en prosa
    // (jobname, schedule '45 10 * * *', el header x-hato-tick-secret Y la
    // mención a vault.decrypted_secrets aparecen los cuatro en el comentario,
    // ANTES del código real). Una búsqueda de archivo completo matchea esa
    // prosa y da falso verde aunque el código real difiera — comprobado con
    // test de mutación: sustituir el valor real del header por un secreto
    // hardcodeado, sin tocar el comentario, dejaba pasar el guard de "sin
    // secreto literal" hasta este fix.

    it("cron.schedule('hato-alertas-tick', '45 10 * * *', ...) apunta a /hato/alertas/tick con header x-hato-tick-secret", () => {
      expect(c, '060_hato_alertas_cron.sql no existe todavía.').not.toBeNull();
      if (!c) return;

      const scheduleIdx = c.search(/cron\.schedule\s*\(/i);
      expect(
        scheduleIdx,
        'No se encontró la llamada cron.schedule(...) en 060 — sin ella no hay tick diario programado.',
      ).toBeGreaterThan(-1);
      if (scheduleIdx === -1) return;
      const scheduleCall = c.slice(scheduleIdx);

      expect(
        /cron\.schedule\s*\(\s*'hato-alertas-tick'/i.test(scheduleCall),
        "La llamada cron.schedule(...) no usa el jobname 'hato-alertas-tick' como primer argumento — cron.schedule hace upsert por jobname (idempotente); un nombre distinto o ausente deja el tick diario del motor de alertas sin programar (o programa un job duplicado con otro nombre).",
      ).toBe(true);

      expect(
        /'45\s+10\s+\*\s+\*\s+\*'/.test(scheduleCall),
        "La llamada cron.schedule(...) no usa el schedule '45 10 * * *' — esa es la traducción correcta de 05:45 America/Bogota (UTC-5, sin horario de verano; ver precedente 030) a UTC. Cualquier otra hora dispara el tick (y, una vez exista S6, los mensajes de Telegram) fuera de la ventana esperada por Fernando.",
      ).toBe(true);

      const httpPostIdx = scheduleCall.search(/net\.http_post\s*\(/i);
      expect(
        httpPostIdx,
        'No hay net.http_post dentro del cuerpo de cron.schedule(...) en 060 — sin pg_net el cron no tiene forma de llamar al edge function.',
      ).toBeGreaterThan(-1);
      if (httpPostIdx === -1) return;
      const httpPostCall = scheduleCall.slice(httpPostIdx, httpPostIdx + 1500);

      expect(
        /\/hato\/alertas\/tick/.test(httpPostCall),
        'La URL dentro de la llamada net.http_post no apunta a /hato/alertas/tick — el tick pegaría a una ruta que S6 nunca implementará, dejando el motor de alertas mudo para siempre en vez de recibir un 404 transitorio.',
      ).toBe(true);

      expect(
        /x-hato-tick-secret/i.test(httpPostCall),
        'Falta el header x-hato-tick-secret dentro de la llamada net.http_post — a diferencia del sync de clima de 030 (que es de solo lectura y no lleva auth), el tick del hato dispara mensajes salientes de Telegram; sin un secreto compartido, cualquiera que descubra la URL pública del edge function podría dispararlo arbitrariamente.',
      ).toBe(true);
    });

    it('el secreto se lee desde Supabase Vault en tiempo de disparo — nunca como literal comprometido en el archivo', () => {
      expect(c, '060_hato_alertas_cron.sql no existe todavía.').not.toBeNull();
      if (!c) return;

      const httpPostIdx = c.search(/net\.http_post\s*\(/i);
      expect(
        httpPostIdx,
        'No se encontró la llamada net.http_post en 060.',
      ).toBeGreaterThan(-1);
      if (httpPostIdx === -1) return;
      // Ventana acotada al cuerpo de la llamada real, no al archivo completo.
      const httpPostCall = c.slice(httpPostIdx, httpPostIdx + 1500);

      const idx = httpPostCall.indexOf('x-hato-tick-secret');
      expect(idx, 'x-hato-tick-secret no aparece dentro de la llamada net.http_post real.').toBeGreaterThan(-1);
      if (idx === -1) return;

      const nearby = httpPostCall.slice(idx, idx + 400);
      expect(
        /vault\.decrypted_secrets/i.test(nearby),
        'El valor REAL del header x-hato-tick-secret (dentro de la llamada net.http_post, no en un comentario) no referencia vault.decrypted_secrets — este archivo se commitea a git; si el secreto está escrito literalmente aquí, cualquiera con acceso al repositorio (incluyendo el historial completo) puede falsificar el tick y disparar alertas arbitrarias a Fernando por Telegram, y el secreto no se puede rotar sin reescribir el historial de git.',
      ).toBe(true);

      const bareLiteralNearby =
        /x-hato-tick-secret['"]?\s*,\s*'[A-Za-z0-9_-]{12,}'/i.test(nearby) && !/vault/i.test(nearby);
      expect(
        bareLiteralNearby,
        'El header x-hato-tick-secret dentro de la llamada net.http_post real parece tener un valor de texto plano hardcodeado en vez de una subconsulta a Vault — un secreto comprometido en un archivo SQL versionado no se puede rotar sin reescribir el historial de git, y ya quedó expuesto para siempre en cualquier fork/clon existente.',
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // 21. No-regresión: las 8 migraciones nuevas no alteran tablas ajenas
  // ---------------------------------------------------------------------

  it('las 8 migraciones nuevas no alteran ninguna tabla de migraciones <=052, salvo la excepción explícita de 059 (Decisión 10 #21)', () => {
    const offenders: string[] = [];
    for (const [, filename] of Object.entries(FILES) as [Prefix, string][]) {
      const c = readIfExists(filename);
      if (!c) continue;
      const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?/gi;
      let m: RegExpExecArray | null;
      while ((m = alterRe.exec(c)) !== null) {
        const table = m[1];
        const isOwnHatoTable = /^hato_/i.test(table);
        const isAllowedFinLink =
          filename === FILES['059'] && table.toLowerCase() === 'fin_transacciones_ganado';
        if (!isOwnHatoTable && !isAllowedFinLink) {
          offenders.push(`${filename}: ALTER TABLE ${table}`);
        }
      }
    }
    expect(
      offenders,
      `Se encontraron ALTER TABLE contra tablas ajenas al set hato_/fuera de la excepción de 059: ${offenders.join(
        '; ',
      )} — el brief autoriza explícitamente UNA sola excepción (fin_transacciones_ganado en 059, Decisión 7). Cualquier otro ALTER TABLE contra una tabla de una migración ya aplicada (<=052) viola la regla dura del repo ("never modify an already-applied migration file" — CLAUDE.md Caution Zones) y puede romper datos o RLS de un módulo que este PR no debería tocar.`,
    ).toEqual([]);
  });
});
