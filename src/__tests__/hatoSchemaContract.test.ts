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
        'Falta UNIQUE (animal_id, fecha) en hato_pesajes_leche — sin esta restricción, un mismo animal podría tener dos pesajes el mismo día, se duplicaría litros_total y la curva de PL de la hoja de vida se distorsiona. (Nota: 054 declaró litros_total como columna GENERATED sobre AM+PM; la migración 061 la convirtió en columna normal NOT NULL — el pesaje en finca produce una sola cifra por vaca. Este archivo describe 054 tal como se aplicó y no se edita.)',
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

/**
 * Contrato de esquema — SOW 1 del rework de Producción (Hato Lechero),
 * migraciones 070/071 (`docs/plan_hato_produccion_rework.md` §2/§3/§6
 * "SOW 1"). Mismo estilo que el bloque 053-060 de arriba: test estático
 * puro sobre el TEXTO de los archivos, sin conexión a DB.
 *
 * Test surface exigido explícitamente por el brief (§6, SOW 1): el índice
 * único PARCIAL (no global) sobre `fin_ingreso_id`, `ON DELETE RESTRICT`
 * en `hato_produccion_quincenal.fin_ingreso_id` vs. `SET NULL` en
 * `hato_eventos.fin_ingreso_id`, la AUSENCIA de `SECURITY DEFINER` en los
 * 3 RPC, la PRESENCIA de `SECURITY DEFINER` en el trigger inverso, y que
 * 071 NO contenga ningún `UPDATE` a `valor`/`fecha`/`cantidad` de
 * `fin_ingresos`.
 */
describe('contrato de esquema — SOW 1 Producción Hato (070/071)', () => {
  const FILES_070_071 = {
    '070': '070_hato_produccion_venta_link.sql',
    '071': '071_fin_categoria_venta_descarte.sql',
  } as const;

  const c070 = readIfExists(FILES_070_071['070']);
  const c071 = readIfExists(FILES_070_071['071']);

  it('070_hato_produccion_venta_link.sql y 071_fin_categoria_venta_descarte.sql existen', () => {
    expect(c070, 'Falta 070_hato_produccion_venta_link.sql').not.toBeNull();
    expect(c071, 'Falta 071_fin_categoria_venta_descarte.sql').not.toBeNull();
  });

  it('070 y 071 son los únicos archivos con esos prefijos (sin colisión de numeración, R1 del brief)', () => {
    const allSqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f));
    for (const prefix of ['070', '071']) {
      const matches = allSqlFiles.filter((f) => f.startsWith(prefix));
      expect(
        matches,
        `El prefijo ${prefix} debe tener exactamente un archivo (colisión de numeración: ya ocurrió 4 veces en este repo, R1 del brief). Encontrado: [${matches.join(', ')}]`,
      ).toEqual([Object.values(FILES_070_071).find((f) => f.startsWith(prefix))]);
    }
  });

  // ---------------------------------------------------------------------
  // 070 — columnas nuevas + índices/CHECKs (plan §2.1)
  // ---------------------------------------------------------------------

  describe('070 — hato_produccion_quincenal: enlace + procedencia del dato', () => {
    it('agrega fin_ingreso_id UUID REFERENCES fin_ingresos(id) de forma idempotente', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+fin_ingreso_id\s+UUID\s*\n?\s*REFERENCES\s+fin_ingresos\s*\(\s*id\s*\)/i.test(
          c070,
        ),
        'Falta "ADD COLUMN IF NOT EXISTS fin_ingreso_id UUID REFERENCES fin_ingresos(id)" en hato_produccion_quincenal — sin esta columna no existe el vínculo duro que la decisión 3 del dueño exige ("un solo registro").',
      ).toBe(true);
    });

    it('fin_ingreso_id usa ON DELETE RESTRICT (no SET NULL ni CASCADE)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const idx = c070.search(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+fin_ingreso_id\s+UUID/i);
      expect(idx, 'No se ubicó la declaración de fin_ingreso_id en hato_produccion_quincenal.').toBeGreaterThan(-1);
      if (idx === -1) return;
      const nearby = c070.slice(idx, idx + 200);
      expect(
        /ON\s+DELETE\s+RESTRICT/i.test(nearby),
        'hato_produccion_quincenal.fin_ingreso_id no declara ON DELETE RESTRICT — sin él, borrar un ingreso enlazado desde /finanzas/ingresos dejaría una quincena "enlazada" a un ingreso inexistente (o, con SET NULL, una quincena medida sin su contraparte financiera), exactamente la divergencia silenciosa que el brief prohíbe (plan §2.1, tabla "Semántica de DELETE").',
      ).toBe(true);
      expect(
        /ON\s+DELETE\s+(SET\s+NULL|CASCADE)/i.test(nearby),
        'hato_produccion_quincenal.fin_ingreso_id declara SET NULL o CASCADE en vez de RESTRICT — el borrado debe tener UN SOLO camino (el RPC fn_hato_eliminar_quincena_venta), nunca dejar una fila huérfana o desaparecer en cascada.',
      ).toBe(false);
    });

    it('el índice único sobre fin_ingreso_id es PARCIAL (WHERE origen_dato = \'medido\'), nunca global', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const m = /CREATE\s+UNIQUE\s+INDEX[\s\S]*?hato_prod_quincenal_ingreso_medido_unico[\s\S]*?;/i.exec(c070);
      expect(
        m,
        'No se encontró el índice único hato_prod_quincenal_ingreso_medido_unico sobre hato_produccion_quincenal(fin_ingreso_id) — sin él, dos quincenas medidas podrían compartir el mismo ingreso, violando el vínculo 1:1 hacia adelante (Decisión 3 del dueño).',
      ).not.toBeNull();
      if (!m) return;
      expect(
        /WHERE\s+origen_dato\s*=\s*'medido'/i.test(m[0]),
        'El índice hato_prod_quincenal_ingreso_medido_unico no es PARCIAL (falta "WHERE origen_dato = \'medido\'") — un índice único GLOBAL sobre fin_ingreso_id rompería el vínculo muchos-a-uno de las quincenas derivadas del backfill (SOW 4), que deben poder compartir el mismo ingreso mensual histórico (mismo mecanismo que 066 usó para la chapeta).',
      ).toBe(true);

      // Ninguna OTRA declaración de UNIQUE llano (no parcial) sobre la
      // columna, que anularía la intención del índice parcial de arriba.
      const bareUnique =
        /fin_ingreso_id\s+UUID[^,]*\bUNIQUE\b(?!\s*\()/i.test(c070) ||
        /UNIQUE\s*\(\s*fin_ingreso_id\s*\)(?!\s*WHERE)/i.test(c070);
      expect(
        bareUnique,
        'Se encontró una declaración de UNIQUE llano (no parcial) sobre fin_ingreso_id en algún otro punto del archivo — eso bloquearía el enlace muchos-a-uno de las filas derivado_mensual.',
      ).toBe(false);
    });

    it('agrega un índice llano (no parcial) sobre fin_ingreso_id para la búsqueda inversa ingreso -> quincenas', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_hato_prod_quincenal_ingreso\s+ON\s+hato_produccion_quincenal\s*\(\s*fin_ingreso_id\s*\)/i.test(
          c070,
        ),
        'Falta el índice llano idx_hato_prod_quincenal_ingreso — sin él, la verificación del FK ON DELETE RESTRICT (que SÍ debe recorrer las filas derivadas, no solo las medidas) y cualquier búsqueda ingreso->quincenas hacen table scan.',
      ).toBe(true);
    });

    it('fin_ingreso_id termina como NOT NULL', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /ALTER\s+COLUMN\s+fin_ingreso_id\s+SET\s+NOT\s+NULL/i.test(c070),
        'Falta "ALTER COLUMN fin_ingreso_id SET NOT NULL" — sin este NOT NULL, una quincena podría guardarse sin su ingreso enlazado, exactamente la divergencia que la decisión 3 del dueño ("un solo registro") prohíbe.',
      ).toBe(true);
    });

    it('origen_dato es TEXT NOT NULL DEFAULT \'medido\' con CHECK IN (\'medido\', \'derivado_mensual\')', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /origen_dato\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'medido'\s*\n?\s*CHECK\s*\(\s*origen_dato\s+IN\s*\(\s*'medido'\s*,\s*'derivado_mensual'\s*\)\s*\)/i.test(
          c070,
        ),
        'Falta origen_dato TEXT NOT NULL DEFAULT \'medido\' CHECK (origen_dato IN (\'medido\', \'derivado_mensual\')) — sin este flag la UI no puede distinguir una quincena capturada en vivo de una derivada del backfill mensual (read-only), y el trigger inverso (sección 6) no tiene sobre qué filtrar.',
      ).toBe(true);
    });

    it('num_vacas_ordeno_origen es TEXT con CHECK IN (\'medido\', \'derivado_chequeos\')', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /num_vacas_ordeno_origen\s+TEXT\s*\n?\s*CHECK\s*\(\s*num_vacas_ordeno_origen\s+IN\s*\(\s*'medido'\s*,\s*'derivado_chequeos'\s*\)\s*\)/i.test(
          c070,
        ),
        'Falta num_vacas_ordeno_origen TEXT CHECK (num_vacas_ordeno_origen IN (\'medido\', \'derivado_chequeos\')) — sin esta columna la UI no puede cumplir la decisión 16 del dueño ("num_vacas_ordeno derivado del histórico de chequeos, marcado como derivado, no medido").',
      ).toBe(true);
    });

    it('CHECK hato_prod_quincenal_vacas_origen_coherente: num_vacas_ordeno_origen es obligatorio si num_vacas_ordeno no es NULL', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /ADD\s+CONSTRAINT\s+hato_prod_quincenal_vacas_origen_coherente\s+CHECK\s*\(\s*num_vacas_ordeno\s+IS\s+NULL\s+OR\s+num_vacas_ordeno_origen\s+IS\s+NOT\s+NULL\s*\)/i.test(
          c070,
        ),
        'Falta el CHECK hato_prod_quincenal_vacas_origen_coherente — sin él, num_vacas_ordeno podría tener un valor sin que num_vacas_ordeno_origen declare cómo se obtuvo, violando la regla del módulo "ningún número sin procedencia declarada".',
      ).toBe(true);
    });

    it('agrega updated_at TIMESTAMPTZ y updated_by UUID REFERENCES auth.users(id)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+updated_at\s+TIMESTAMPTZ/i.test(c070),
        'Falta ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ — la fila ahora es un registro financiero editable por dos caminos (Producción y Finanzas); sin autoría de la última edición, un descuadre contra el Pomar es inauditable.',
      ).toBe(true);
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+updated_by\s+UUID\s+REFERENCES\s+auth\.users\s*\(\s*id\s*\)/i.test(c070),
        'Falta ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id).',
      ).toBe(true);
    });

    it('NO agrega ninguna columna GENERATED (lección de la 061)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /GENERATED\s+ALWAYS\s+AS/i.test(c070),
        'Se encontró una columna GENERATED en 070 — la migración 061 tuvo que hacerle DROP EXPRESSION a hato_pesajes_leche.litros_total por exactamente este patrón (una suposición falsa sobre cómo se mide el dato); el brief prohíbe explícitamente repetir el error en este rework.',
      ).toBe(false);
    });

    it('NO agrega ninguna columna de dinero (valor/precio/monto) — los litros son del Hato, los pesos son de Finanzas (plan §2.0)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      // hato_produccion_quincenal no se CREATE aquí (ya existe desde 054),
      // así que se revisa el archivo completo por columnas de dinero
      // nuevas — cualquier ADD COLUMN con esos nombres sería la fuga de
      // RLS que el plan §2.0 prohíbe explícitamente (hato_produccion_
      // quincenal es SELECT abierto a todo authenticated; fin_ingresos es
      // Gerencia-only; Postgres no tiene RLS por columna).
      const dineroNuevo = /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(valor|precio_unitario|precio|monto)\b/i.test(c070);
      expect(
        dineroNuevo,
        'Se encontró un ADD COLUMN de una columna de dinero (valor/precio_unitario/precio/monto) en 070 — hato_produccion_quincenal tiene SELECT abierto a TODO usuario authenticated (patrón 054); copiar una cifra de dinero ahí filtraría los ingresos del Hato a Administrador y a cualquier rol con el módulo hato_lechero, violando la decisión 5 del dueño ("cero cambios de RLS en fin_ingresos") por la puerta de atrás.',
      ).toBe(false);
    });
  });

  describe('070 — hato_eventos.fin_ingreso_id', () => {
    it('agrega fin_ingreso_id UUID REFERENCES fin_ingresos(id) con ON DELETE SET NULL', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const idx = c070.search(/ALTER\s+TABLE\s+hato_eventos[\s\S]*?ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+fin_ingreso_id/i);
      expect(idx, 'No se encontró ALTER TABLE hato_eventos ... ADD COLUMN IF NOT EXISTS fin_ingreso_id.').toBeGreaterThan(-1);
      if (idx === -1) return;
      const nearby = c070.slice(idx, idx + 300);
      expect(
        /REFERENCES\s+fin_ingresos\s*\(\s*id\s*\)/i.test(nearby),
        'hato_eventos.fin_ingreso_id no referencia fin_ingresos(id).',
      ).toBe(true);
      expect(
        /ON\s+DELETE\s+SET\s+NULL/i.test(nearby),
        'hato_eventos.fin_ingreso_id no usa ON DELETE SET NULL — a diferencia de hato_produccion_quincenal.fin_ingreso_id (RESTRICT), aquí el animal ya salió del hato como hecho biológico; borrar el registro financiero no debe borrar ni bloquear ese hecho (mismo precedente que transaccion_ganado_id, 053).',
      ).toBe(true);
      expect(
        /ON\s+DELETE\s+RESTRICT/i.test(nearby),
        'hato_eventos.fin_ingreso_id usa ON DELETE RESTRICT — debería ser SET NULL (ver el test anterior): con RESTRICT, borrar un ingreso de venta de animales quedaría bloqueado para siempre por el evento histórico, algo que el brief no pide para esta tabla (solo para hato_produccion_quincenal).',
      ).toBe(false);
    });

    it('agrega el índice parcial idx_hato_eventos_fin_ingreso (WHERE fin_ingreso_id IS NOT NULL)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_hato_eventos_fin_ingreso\s+ON\s+hato_eventos\s*\(\s*fin_ingreso_id\s*\)\s+WHERE\s+fin_ingreso_id\s+IS\s+NOT\s+NULL/i.test(
          c070,
        ),
        'Falta el índice idx_hato_eventos_fin_ingreso — la mayoría de hato_eventos no tiene fin_ingreso_id (solo las ventas), así que el índice debe ser parcial.',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // 070 — los 3 RPC son SECURITY INVOKER (ausencia de SECURITY DEFINER),
  // el trigger inverso SÍ es SECURITY DEFINER (plan §3.2/§3.3)
  // ---------------------------------------------------------------------

  /** Extrae el bloque REAL de una función: desde su CREATE OR REPLACE
   * FUNCTION hasta el "$$;" que cierra su propio cuerpo dollar-quoted --
   * nunca "hasta la próxima función", que se comería cualquier comentario
   * de prosa entre dos funciones (este archivo describe el trigger de la
   * sección 6 en un comentario que literalmente dice "SECURITY DEFINER"
   * ANTES de su CREATE OR REPLACE FUNCTION -- comprobado con un test de
   * mutación: sin este límite exacto, ese comentario se filtraba dentro
   * del bloque de fn_hato_registrar_venta_animales, el mismo tipo de
   * falso-verde que 060 ya documenta más arriba para net.http_post). */
  function extractFunctionRegion(sql: string, fnName: string): string {
    const re = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${fnName}\\s*\\([^)]*\\)[\\s\\S]*?AS\\s*\\$\\$[\\s\\S]*?\\$\\$\\s*;`,
      'i',
    );
    const m = re.exec(sql);
    return m ? m[0] : '';
  }

  const RPC_NAMES = [
    'fn_hato_guardar_quincena_venta',
    'fn_hato_eliminar_quincena_venta',
    'fn_hato_registrar_venta_animales',
  ];

  describe('070 — los 3 RPC de escritura son SECURITY INVOKER, nunca SECURITY DEFINER', () => {
    for (const fnName of RPC_NAMES) {
      it(`${fnName}: existe y NO contiene SECURITY DEFINER en su propio bloque`, () => {
        expect(c070, '070 no existe todavía.').not.toBeNull();
        if (!c070) return;
        const region = extractFunctionRegion(c070, fnName);
        expect(region, `No se encontró CREATE OR REPLACE FUNCTION ${fnName} en 070.`).not.toBe('');
        expect(
          /SECURITY\s+DEFINER/i.test(region),
          `${fnName} contiene SECURITY DEFINER — el brief (plan §3.2) exige que los 3 RPC de escritura sean SECURITY INVOKER: el llamador es un navegador Gerencia ya autenticado con escritura RLS en las dos tablas, y un DEFINER bypasearía esa RLS, obligando a reimplementar "es Gerencia" adentro de la función (dos fuentes de verdad para una sola política).`,
        ).toBe(false);
      });

      it(`${fnName}: revoca EXECUTE de PUBLIC/anon y lo concede a authenticated (no a service_role)`, () => {
        expect(c070, '070 no existe todavía.').not.toBeNull();
        if (!c070) return;
        expect(
          new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fnName}\\s*\\([^)]*\\)\\s+FROM\\s+PUBLIC\\s*,\\s*anon`, 'i').test(
            c070,
          ),
          `Falta REVOKE EXECUTE ... FROM PUBLIC, anon para ${fnName}.`,
        ).toBe(true);
        expect(
          new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+${fnName}\\s*\\([^)]*\\)\\s+TO\\s+authenticated`, 'i').test(
            c070,
          ),
          `Falta GRANT EXECUTE ... TO authenticated para ${fnName} — a diferencia de fn_hato_commit_chequeo (065, service_role-only porque su endpoint YA verificó el rol), estos RPC los invoca DIRECTO el navegador de un usuario Gerencia vía supabase-js .rpc(), así que authenticated debe poder ejecutarlos (la RLS de las tablas hace el resto).`,
        ).toBe(true);
      });
    }
  });

  describe('DELETED — el trigger inverso fn_hato_sync_quincena_desde_ingreso YA NO EXISTE (decisión final del dueño)', () => {
    it('070 NO declara CREATE (OR REPLACE) FUNCTION fn_hato_sync_quincena_desde_ingreso', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+fn_hato_sync_quincena_desde_ingreso/i.test(c070),
        'Se encontró CREATE (OR REPLACE) FUNCTION fn_hato_sync_quincena_desde_ingreso en 070 — el dueño decidió eliminar por completo el trigger inverso (no solo su policía de fecha): (a) es AFTER UPDATE y nunca cubrió el requisito real ("agrego un ingreso en Finanzas y aparece en Producción", un CREATE); (b) la premisa de seguridad original ("filtraría a Martha, Administrador") era fácticamente incorrecta -- Martha es Gerencia; (c) decisión explícita "simple, clean is always best", sin mecanismo de sincronización. La garantía de "un solo registro" es ahora estructural (FK NOT NULL + litros_total NULL para filas medidas), no sincronizada.',
      ).toBe(false);
    });

    it('070 NO declara CREATE TRIGGER trg_hato_sync_quincena_desde_ingreso', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /CREATE\s+TRIGGER\s+trg_hato_sync_quincena_desde_ingreso/i.test(c070),
        'Se encontró CREATE TRIGGER trg_hato_sync_quincena_desde_ingreso en 070 — no debe existir ningún trigger sobre fin_ingresos (ver test anterior para la justificación).',
      ).toBe(false);
    });

    it('070 SÍ incluye DROP TRIGGER IF EXISTS + DROP FUNCTION IF EXISTS -- limpieza segura si una revisión anterior con el trigger ya se aplicó en algún ambiente', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /DROP\s+TRIGGER\s+IF\s+EXISTS\s+trg_hato_sync_quincena_desde_ingreso\s+ON\s+fin_ingresos/i.test(c070),
        'Falta "DROP TRIGGER IF EXISTS trg_hato_sync_quincena_desde_ingreso ON fin_ingresos" — sin este DROP, un ambiente donde una revisión anterior de 070 (con el trigger) ya se aplicó quedaría con un trigger huérfano que esta migración debería haber retirado; re-aplicar 070 no sería seguro en ese ambiente.',
      ).toBe(true);
      expect(
        /DROP\s+FUNCTION\s+IF\s+EXISTS\s+fn_hato_sync_quincena_desde_ingreso\s*\(\s*\)/i.test(c070),
        'Falta "DROP FUNCTION IF EXISTS fn_hato_sync_quincena_desde_ingreso()" — mismo argumento que el DROP TRIGGER: limpieza idempotente para cualquier ambiente donde la función ya exista.',
      ).toBe(true);
    });
  });

  it('070 no declara ninguna CREATE POLICY nueva (plan §2.1: "RLS — ninguna política nueva")', () => {
    expect(c070, '070 no existe todavía.').not.toBeNull();
    if (!c070) return;
    expect(
      /CREATE\s+POLICY/i.test(c070),
      '070 contiene una CREATE POLICY — el brief es explícito (plan §2.1): "ninguna política nueva". La restricción "solo Gerencia captura quincenales" debe EMERGER de la intersección de las policies ya existentes (054 en hato_produccion_quincenal, create_finanzas_tables.sql en fin_ingresos) dentro de los RPC SECURITY INVOKER, no de una policy inventada aquí.',
    ).toBe(false);
  });

  it('070: el ÚNICO ALTER TABLE contra fin_ingresos es la columna aditiva y nullable `cabezas` — relajación documentada, coordinada explícitamente, no una excepción libre', () => {
    expect(c070, '070 no existe todavía.').not.toBeNull();
    if (!c070) return;
    // La regla original del encargo ("070 no toca fin_ingresos en
    // absoluto") se relajó a propósito, en coordinación explícita, para
    // que fn_hato_registrar_venta_animales use un INSERT estático (que
    // Postgres valida al aplicar la migración) en vez de SQL dinámico
    // (que convierte un error de migración en un error de runtime a
    // mitad de un formulario). La intención original -- P&G, Flujo de
    // Caja y el port Deno byte-idénticos por construcción -- se preserva
    // porque ninguno de los tres selecciona `cabezas`; lo que este test
    // fuerza es que la relajación se quede EXACTAMENTE en eso, nunca se
    // ensanche a otra columna, a RLS, o a un tipo/CHECK distinto.
    const alterBlocks = c070.match(/ALTER\s+TABLE\s+fin_ingresos[\s\S]*?;/gi) ?? [];
    expect(
      alterBlocks.length,
      `Se esperaba EXACTAMENTE un ALTER TABLE fin_ingresos en 070 (la columna cabezas). Encontrados: ${alterBlocks.length}.`,
    ).toBe(1);
    const block = alterBlocks[0] ?? '';
    expect(
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+cabezas\s+INTEGER\s+CHECK\s*\(\s*cabezas\s*>\s*0\s*\)/i.test(block),
      `El único ALTER TABLE fin_ingresos permitido en 070 debe ser exactamente "ADD COLUMN IF NOT EXISTS cabezas INTEGER CHECK (cabezas > 0)" — cualquier otra forma (otra columna, otro tipo, DROP, RLS) excede la relajación acordada. Bloque encontrado: ${block}`,
    ).toBe(true);
    expect(
      /DROP|RENAME|ALTER\s+COLUMN|ENABLE\s+ROW|DISABLE\s+ROW|NOT\s+NULL(?!\s+DEFAULT)/i.test(block.replace('ADD COLUMN IF NOT EXISTS', '')),
      `El ALTER TABLE fin_ingresos en 070 contiene algo más que un ADD COLUMN aditivo (DROP/RENAME/ALTER COLUMN/RLS/NOT NULL sobre una columna preexistente) — la relajación acordada es estrictamente "una columna nueva, nullable, aditiva". Bloque: ${block}`,
    ).toBe(false);

    // Fuera de esa única columna, cero policies y cero DML de migración
    // (INSERT/UPDATE/DELETE a nivel de archivo, fuera del cuerpo de los
    // RPC) contra fin_ingresos: los RPC SÍ escriben fin_ingresos en
    // tiempo de EJECUCIÓN (esa es su función), pero eso es distinto de
    // que la MIGRACIÓN misma toque filas o políticas al aplicarse.
    expect(
      /CREATE\s+POLICY[\s\S]{0,120}fin_ingresos|fin_ingresos[\s\S]{0,40}ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(c070),
      '070 contiene una policy o un cambio de RLS que menciona fin_ingresos — fuera del alcance de la relajación acordada (solo la columna cabezas).',
    ).toBe(false);
  });

  // ---------------------------------------------------------------------
  // 071 — categoría + recategorización acotada por id (plan §2.2)
  // ---------------------------------------------------------------------

  describe('071 — categoría "Venta de Vacas de Descarte" + recategorización', () => {
    it('crea la categoría bajo el negocio "Hato Lechero", resuelto por NOMBRE (nunca UUID hardcodeado)', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      expect(
        /INSERT\s+INTO\s+fin_categorias_ingresos[\s\S]*?'Venta de Vacas de Descarte'/i.test(c071),
        'No se encontró el INSERT de la categoría "Venta de Vacas de Descarte" en fin_categorias_ingresos.',
      ).toBe(true);
      expect(
        /WHERE\s+n\.nombre\s*=\s*'Hato Lechero'/i.test(c071),
        'La resolución del negocio no filtra por n.nombre = \'Hato Lechero\' — el brief exige resolver por NOMBRE, nunca UUID hardcodeado (precedente NEGOCIO_GANADO, IngresosList.tsx).',
      ).toBe(true);
    });

    it('el INSERT de la categoría es idempotente (NOT EXISTS / ON CONFLICT)', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      expect(
        /NOT\s+EXISTS\s*\(/i.test(c071) || /ON\s+CONFLICT/i.test(c071),
        'El INSERT de la categoría no es idempotente (falta NOT EXISTS u ON CONFLICT) — re-aplicar 071 en un ambiente donde ya corrió crearía una segunda fila "Venta de Vacas de Descarte" duplicada para el mismo negocio.',
      ).toBe(true);
    });

    it('el nombre de la categoría NO contiene la subcadena "leche" (no debe capturar el denominador $/litro)', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      expect(
        /leche/i.test('Venta de Vacas de Descarte'),
        'Guard de fixture: si este assert falla, el nombre elegido en el propio test ya no es válido.',
      ).toBe(false);
    });

    it('NUNCA usa un WHERE genérico "categoria = \'Otro\'" para el UPDATE de recategorización', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      const updateBlocks = c071.match(/UPDATE\s+fin_ingresos[\s\S]*?;/gi) ?? [];
      const genericWhere = updateBlocks.some((b) => /WHERE[\s\S]*categoria[\s\S]*?=\s*'Otro'/i.test(b));
      expect(
        genericWhere,
        'Se encontró un UPDATE fin_ingresos con WHERE categoria = \'Otro\' (u órdenes de texto equivalentes) — el brief lo prohíbe explícitamente (plan §2.2): recategorizaría CUALQUIER fila "Otro" que alguien agregue después, no solo las 6 históricas confirmadas por el dueño.',
      ).toBe(false);
    });

    it('el UPDATE de recategorización solo modifica categoria_id — nunca valor/fecha/cantidad de fin_ingresos', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      const updateBlocks = c071.match(/UPDATE\s+fin_ingresos\b[\s\S]*?;/gi) ?? [];
      expect(
        updateBlocks.length,
        'No se encontró ningún UPDATE fin_ingresos en 071 (aunque sea guardado/pendiente detrás de un guard) — sin él, las 6 filas históricas nunca se recategorizan.',
      ).toBeGreaterThan(0);
      for (const block of updateBlocks) {
        // Aísla la cláusula SET (entre "SET" y el primer "WHERE" real de esa
        // sentencia) para no confundir un WHERE con un SET.
        const setMatch = /SET\s+([\s\S]*?)\s+WHERE/i.exec(block);
        const setClause = setMatch ? setMatch[1] : block;
        expect(
          /\bvalor\s*=/i.test(setClause),
          `Un UPDATE fin_ingresos en 071 asigna "valor" — el brief exige que 071 NO cambie ningún valor (plan §2.2: "NO cambia ningún valor, fecha ni cantidad"). Bloque: ${block.slice(0, 200)}`,
        ).toBe(false);
        expect(
          /\bfecha\s*=/i.test(setClause),
          `Un UPDATE fin_ingresos en 071 asigna "fecha" — mismo requisito: solo la ETIQUETA (categoria_id) puede cambiar. Bloque: ${block.slice(0, 200)}`,
        ).toBe(false);
        expect(
          /\bcantidad\s*=/i.test(setClause),
          `Un UPDATE fin_ingresos en 071 asigna "cantidad" — mismo requisito. Bloque: ${block.slice(0, 200)}`,
        ).toBe(false);
        expect(
          /\bcategoria_id\s*=/i.test(setClause),
          `El UPDATE fin_ingresos de 071 no asigna categoria_id — es la ÚNICA columna que esta migración debe tocar. Bloque: ${block.slice(0, 200)}`,
        ).toBe(true);
      }
    });

    it('los 6 ids de v_ids_descarte son los reales (verificados contra producción), no el UUID centinela de una revisión anterior', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      expect(
        /00000000-0000-0000-0000-000000000000/.test(c071),
        '071 todavía contiene el UUID centinela — se esperaba que estuviera reemplazado por los 6 id reales, verificados de forma independiente contra producción (proyecto ywhtjwawnkeqlwxbvgup) el 2026-07-28.',
      ).toBe(false);
      const idsReales = [
        'ce95f40c-c789-49c1-a6da-5312461571f5',
        '49a9a49d-71de-4db0-96db-3a60969cbdb1',
        '8034f4f8-d7f1-4719-8ba8-33a26350e028',
        '694968b0-1f64-4f10-9fb9-0531613e0105',
        '1784490c-b264-42d9-ba3f-32974bf3fdfa',
        '89401376-44b7-4439-b1d7-06415fe5d845',
      ];
      for (const id of idsReales) {
        expect(c071.includes(id), `Falta el id ${id} en v_ids_descarte.`).toBe(true);
      }
    });

    it('el guard de la sección 2 verifica que cada fila objetivo esté ACTUALMENTE bajo "Otro" antes del UPDATE (no solo cuenta filas) y aborta si la base divergió', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      // El guard debe resolver el id de la categoría "Otro" del negocio
      // Hato Lechero por nombre (nunca UUID hardcodeado, mismo patrón que
      // el resto del archivo) y contar cuántas de las 6 filas objetivo
      // siguen bajo esa categoría ANTES de tocar nada.
      expect(
        /lower\s*\(\s*nombre\s*\)\s*=\s*'otro'/i.test(c071),
        'No se encontró la resolución de la categoría "Otro" (lower(nombre) = \'otro\') bajo Hato Lechero — el guard debe comparar contra el id real de esa categoría, no contra el texto \'Otro\' inline en cada fila (mismo argumento del test "NUNCA usa un WHERE genérico").',
      ).toBe(true);

      const doIdx = c071.search(/DO\s*\$\$/i);
      expect(doIdx, 'No se encontró el bloque DO $$ de la sección 2.').toBeGreaterThan(-1);
      const doBlock = c071.slice(doIdx);

      // El guard debe ser un SELECT count(*) sobre fin_ingresos filtrado
      // por (id = ANY(...) AND categoria_id = <Otro>) que corre ANTES del
      // UPDATE, y un RAISE EXCEPTION si ese conteo no es 6 -- así una
      // fila ya movida/borrada/reasignada desde la verificación aborta
      // ruidosamente en vez de recategorizar silenciosamente lo que
      // encuentre.
      const countIdx = doBlock.search(/SELECT\s+count\s*\(\s*\*\s*\)\s+INTO\s+\w+[\s\S]*?FROM\s+fin_ingresos/i);
      const updateIdx = doBlock.search(/UPDATE\s+fin_ingresos/i);
      expect(countIdx, 'No se encontró un SELECT count(*) ... FROM fin_ingresos (el guard de categoría-previa) dentro del bloque DO.').toBeGreaterThan(-1);
      expect(updateIdx, 'No se encontró el UPDATE fin_ingresos dentro del bloque DO.').toBeGreaterThan(-1);
      expect(
        countIdx,
        'El SELECT count(*) del guard de categoría-previa aparece DESPUÉS del UPDATE — el guard debe correr ANTES para poder abortar sin haber escrito nada.',
      ).toBeLessThan(updateIdx);

      const guardWindow = doBlock.slice(countIdx, updateIdx);
      expect(
        /<>\s*6/.test(guardWindow) || /!=\s*6/.test(guardWindow),
        'El guard de categoría-previa no compara el conteo contra 6 antes del UPDATE — sin esta comparación, una base que ya divergió (menos de 6 filas siguen bajo "Otro") pasaría de largo hacia un UPDATE parcial en vez de abortar.',
      ).toBe(true);
      expect(
        /RAISE\s+EXCEPTION/i.test(guardWindow),
        'El guard de categoría-previa no aborta con RAISE EXCEPTION cuando el conteo no es 6.',
      ).toBe(true);

      // El propio UPDATE también debe llevar el filtro de categoría
      // (defensa en profundidad: el guard de arriba ya lo comprobó, pero
      // el UPDATE no debe confiar ciegamente en eso entre el SELECT y el
      // UPDATE dentro de la misma transacción).
      const updateBlock = /UPDATE\s+fin_ingresos[\s\S]*?;/i.exec(doBlock.slice(updateIdx))?.[0] ?? '';
      expect(
        /categoria_id\s*=\s*v_categoria_otro_id/i.test(updateBlock),
        'El UPDATE fin_ingresos de la sección 2 no filtra también por categoria_id = v_categoria_otro_id — sin ese filtro en el propio UPDATE (no solo en el guard previo), el UPDATE recategorizaría los 6 ids sin importar en qué categoría estén en ese instante.',
      ).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Correcciones sobre el esbozo del brief señaladas por QA (ver el
  // mensaje de QA en el hilo de esta sesión) -- las tres se verifican
  // aquí para que una futura regresión de alguna de ellas falle en rojo,
  // no solo se documente en un comentario.
  // ---------------------------------------------------------------------

  describe('Owner decision (final) — litros_total es NULL para filas medidas: "un solo registro" es estructural, no sincronizado', () => {
    it('litros_total pierde su NOT NULL (heredado de 054) -- debe poder ser NULL para origen_dato=\'medido\'', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      expect(
        /ALTER\s+COLUMN\s+litros_total\s+DROP\s+NOT\s+NULL/i.test(c070),
        'Falta "ALTER COLUMN litros_total DROP NOT NULL" — la columna nació NOT NULL en 054 (litros=medido siempre); ahora una fila medida no guarda litros ahí (viven en fin_ingresos.cantidad), así que debe poder quedar NULL o el propio INSERT del RPC de captura fallaría.',
      ).toBe(true);
    });

    it('CHECK hato_prod_quincenal_litros_origen_coherente impone la correspondencia exacta origen_dato <-> litros_total NULL/NOT NULL', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const m = /ADD\s+CONSTRAINT\s+hato_prod_quincenal_litros_origen_coherente\s+CHECK\s*\(([\s\S]*?)\)\s*;/i.exec(c070);
      expect(
        m,
        'No se encontró "ADD CONSTRAINT hato_prod_quincenal_litros_origen_coherente CHECK (...)" — sin este CHECK, nada impide que una fila medida guarde litros_total (una segunda copia que puede divergir de fin_ingresos.cantidad) o que una fila derivado_mensual se quede sin su reparto del backfill.',
      ).not.toBeNull();
      if (!m) return;
      const body = m[1];
      expect(
        /origen_dato\s*=\s*'medido'[\s\S]*?litros_total\s+IS\s+NULL/i.test(body),
        'El CHECK no exige litros_total IS NULL cuando origen_dato = \'medido\'.',
      ).toBe(true);
      expect(
        /origen_dato\s*=\s*'derivado_mensual'[\s\S]*?litros_total\s+IS\s+NOT\s+NULL/i.test(body),
        'El CHECK no exige litros_total IS NOT NULL cuando origen_dato = \'derivado_mensual\'.',
      ).toBe(true);
    });

    it('COMMENT ON COLUMN hato_produccion_quincenal.litros_total documenta el cambio de significado (no es "los litros de la quincena" para toda fila)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const m = /COMMENT\s+ON\s+COLUMN\s+hato_produccion_quincenal\.litros_total\s+IS([\s\S]*?);/i.exec(c070);
      expect(m, 'No se encontró COMMENT ON COLUMN hato_produccion_quincenal.litros_total.').not.toBeNull();
      if (!m) return;
      const texto = m[1];
      expect(
        /fin_ingresos\.cantidad/i.test(texto),
        'El comentario de columna no menciona fin_ingresos.cantidad como la fuente real de los litros para una fila medida — sin esa referencia, un futuro lector no sabría dónde leer el dato real.',
      ).toBe(true);
    });

    it('fn_hato_guardar_quincena_venta ya NO escribe litros_total en hato_produccion_quincenal (ni en el INSERT de alta ni en el UPDATE de edición)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_guardar_quincena_venta');
      expect(region, 'No se encontró fn_hato_guardar_quincena_venta en 070.').not.toBe('');

      const insertMatch = /INSERT\s+INTO\s+hato_produccion_quincenal\s*\(([^)]*)\)/i.exec(region);
      expect(insertMatch, 'No se encontró el INSERT INTO hato_produccion_quincenal de la rama de alta.').not.toBeNull();
      if (insertMatch) {
        expect(
          /\blitros_total\b/i.test(insertMatch[1]),
          `El INSERT INTO hato_produccion_quincenal incluye litros_total en su lista de columnas — toda fila que este RPC crea es origen_dato='medido', y el CHECK exige litros_total IS NULL para esas filas; escribirlo aquí violaría el CHECK. Columnas encontradas: ${insertMatch[1]}`,
        ).toBe(false);
      }

      const updateMatch = /UPDATE\s+hato_produccion_quincenal\s*\n?\s*SET\s+([\s\S]*?)\s+WHERE\s+id\s*=\s*v_quincena_id/i.exec(
        region,
      );
      expect(updateMatch, 'No se encontró el UPDATE hato_produccion_quincenal de la rama de edición.').not.toBeNull();
      if (updateMatch) {
        expect(
          /\blitros_total\s*=/i.test(updateMatch[1]),
          `El UPDATE hato_produccion_quincenal asigna litros_total — mismo argumento: una fila 'medido' no debe guardar litros ahí (viven en fin_ingresos.cantidad). SET encontrado: ${updateMatch[1]}`,
        ).toBe(false);
      }
    });

    it('fn_hato_guardar_quincena_venta SIGUE validando litros_total en el payload (lo necesita para cantidad/precio_unitario de fin_ingresos)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_guardar_quincena_venta');
      expect(
        /v_litros_total\s+IS\s+NULL\s+OR\s+v_litros_total\s*<\s*0/i.test(region),
        'fn_hato_guardar_quincena_venta ya no valida que payload.litros_total exista y sea >= 0 — aunque ya no se persista en hato_produccion_quincenal, sigue siendo obligatorio: es la fuente de fin_ingresos.cantidad y del cálculo de precio_unitario.',
      ).toBe(true);
      expect(
        /cantidad\s*=\s*v_litros_total/i.test(region),
        'fn_hato_guardar_quincena_venta no usa v_litros_total para fin_ingresos.cantidad — sin eso, los litros capturados no quedarían en ningún lado.',
      ).toBe(true);
    });
  });

  describe('Owner decision (post-QA #1) — fn_hato_guardar_quincena_venta permite mover el periodo de una quincena existente, con guard de colisión contra OTRA fila', () => {
    it('la rama de edición YA NO compara anio/mes/quincena del payload contra la fila existente para rechazar un cambio de periodo', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_guardar_quincena_venta');
      expect(region, 'No se encontró fn_hato_guardar_quincena_venta en 070.').not.toBe('');
      expect(
        /v_anio\s+IS\s+DISTINCT\s+FROM\s+v_existente\.anio/i.test(region) &&
          /v_mes\s+IS\s+DISTINCT\s+FROM\s+v_existente\.mes/i.test(region) &&
          /v_quincena\s+IS\s+DISTINCT\s+FROM\s+v_existente\.quincena/i.test(region),
        'fn_hato_guardar_quincena_venta todavía compara anio/mes/quincena del payload contra v_existente para bloquear un cambio de periodo — el dueño confirmó que el periodo de producción SÍ es editable (la fecha de pago no lo determina); esa comparación bloquearía correcciones legítimas de quincena.',
      ).toBe(false);
    });

    it('agrega un guard de colisión: rechaza mover a un periodo (anio, mes, quincena) que YA ocupa OTRA fila (id distinto)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_guardar_quincena_venta');
      const collisionCheck =
        /WHERE\s+anio\s*=\s*v_anio\s+AND\s+mes\s*=\s*v_mes\s+AND\s+quincena\s*=\s*v_quincena\s+AND\s+id\s*<>\s*v_quincena_id/i.test(
          region,
        );
      expect(
        collisionCheck,
        'No se encontró el guard "WHERE anio = v_anio AND mes = v_mes AND quincena = v_quincena AND id <> v_quincena_id" — sin él, mover una quincena al mismo periodo de OTRA fila existente fallaría solo con el 23505 crudo de UNIQUE(anio, mes, quincena) en vez de un mensaje legible que nombre el conflicto.',
      ).toBe(true);
      // El guard debe estar dentro de un EXISTS(...) seguido de un
      // RAISE EXCEPTION -- nunca un chequeo decorativo sin efecto.
      const existsIdx = region.search(/IF\s+EXISTS\s*\(/i);
      expect(existsIdx, 'El guard de colisión no está envuelto en IF EXISTS (...).').toBeGreaterThan(-1);
      const afterExists = region.slice(existsIdx, existsIdx + 500);
      expect(
        /RAISE\s+EXCEPTION/i.test(afterExists),
        'El IF EXISTS (...) del guard de colisión no va seguido de un RAISE EXCEPTION cercano — sin él, detectar la colisión no tiene ningún efecto.',
      ).toBe(true);
    });

    it('la rama de edición SÍ reescribe anio/mes/quincena en el UPDATE de hato_produccion_quincenal (el periodo se mueve de verdad)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_guardar_quincena_venta');
      // Aísla el UPDATE hacia hato_produccion_quincenal (el segundo UPDATE
      // de la rama de edición, después del UPDATE fin_ingresos) para no
      // confundirlo con el INSERT de la rama de alta.
      const updateMatch = /UPDATE\s+hato_produccion_quincenal\s*\n?\s*SET\s+([\s\S]*?)\s+WHERE\s+id\s*=\s*v_quincena_id/i.exec(
        region,
      );
      expect(updateMatch, 'No se encontró el UPDATE hato_produccion_quincenal de la rama de edición.').not.toBeNull();
      if (!updateMatch) return;
      const setClause = updateMatch[1];
      expect(/\banio\s*=\s*v_anio\b/i.test(setClause), 'El UPDATE de edición no reescribe anio — el periodo no se movería de verdad.').toBe(true);
      expect(/\bmes\s*=\s*v_mes\b/i.test(setClause), 'El UPDATE de edición no reescribe mes.').toBe(true);
      expect(/\bquincena\s*=\s*v_quincena\b/i.test(setClause), 'El UPDATE de edición no reescribe quincena.').toBe(true);
    });
  });

  describe('QA #3 — el conteo de cabezas de una venta de animales tiene columna propia, nunca sobrecarga `cantidad`', () => {
    it('070 agrega fin_ingresos.cabezas de forma idempotente y nullable, ANTES de las funciones que la usan (no en 071)', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const idx = c070.search(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+cabezas\s+INTEGER/i);
      expect(
        idx,
        'Falta "ADD COLUMN IF NOT EXISTS cabezas INTEGER" en 070 — sin esta columna, fn_hato_registrar_venta_animales no tiene dónde guardar el conteo de cabezas sin sobrecargar `cantidad` (que ya significa litros/kg según negocio), exactamente el bug señalado por QA #3.',
      ).toBeGreaterThan(-1);
      if (idx === -1) return;
      const nearby = c070.slice(idx, idx + 120);
      // NOT NULL explícito rompería toda fila existente (leche/aguacate/
      // ganado) que hoy no tiene cabezas -- debe quedar nullable.
      expect(
        /NOT\s+NULL/i.test(nearby),
        'fin_ingresos.cabezas se declaró NOT NULL — esa columna es NULL para toda fila que no sea una venta de animales del hato (leche, aguacate, ganado de ceba); un NOT NULL rompería el INSERT de cualquiera de esos caminos existentes.',
      ).toBe(false);

      // Debe preceder a fn_hato_registrar_venta_animales en el archivo --
      // si no, el INSERT estático de esa función fallaría al aplicar la
      // migración (columna todavía no existe en ese punto del archivo).
      const fnIdx = c070.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+fn_hato_registrar_venta_animales/i);
      expect(fnIdx, 'No se encontró fn_hato_registrar_venta_animales en 070.').toBeGreaterThan(-1);
      expect(
        idx,
        'ADD COLUMN IF NOT EXISTS cabezas aparece DESPUÉS de CREATE FUNCTION fn_hato_registrar_venta_animales en 070 — el INSERT estático de esa función referencia la columna "cabezas", así que la columna debe existir ANTES en el mismo archivo o el propio CREATE FUNCTION falla al aplicar la migración (Postgres valida las columnas referenciadas con check_function_bodies=on, el default).',
      ).toBeLessThan(fnIdx);
    });

    it('071 NO agrega fin_ingresos.cabezas (se movió a 070 tras la corrección de QA #3/coordinación) — evita una doble declaración', () => {
      expect(c071, '071 no existe todavía.').not.toBeNull();
      if (!c071) return;
      expect(
        /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+cabezas/i.test(c071),
        '071 todavía agrega la columna cabezas — se decidió moverla a 070 (junto a fn_hato_registrar_venta_animales, que la necesita con un INSERT estático) para evitar SQL dinámico. Declararla en los dos archivos no rompe nada por sí solo (ambos son IF NOT EXISTS), pero dispersa la fuente de verdad de un solo cambio de esquema en dos migraciones.',
      ).toBe(false);
    });

    it('fn_hato_registrar_venta_animales (070) usa un INSERT ESTÁTICO (no EXECUTE/SQL dinámico) e inserta en la columna cabezas, nunca en cantidad', () => {
      expect(c070, '070 no existe todavía.').not.toBeNull();
      if (!c070) return;
      const region = extractFunctionRegion(c070, 'fn_hato_registrar_venta_animales');
      expect(region, 'No se encontró fn_hato_registrar_venta_animales en 070.').not.toBe('');
      expect(
        /\bcabezas\b/i.test(region),
        'fn_hato_registrar_venta_animales no menciona la columna "cabezas" — el conteo de cabezas de la decisión 6 del dueño no tiene dónde aterrizar en fin_ingresos.',
      ).toBe(true);
      expect(
        /\bEXECUTE\b/i.test(region),
        'fn_hato_registrar_venta_animales todavía usa EXECUTE (SQL dinámico) — se corrigió específicamente para NO depender de eso: con `cabezas` ahora declarada en 070 antes de esta función, el INSERT hacia fin_ingresos debe ser estático (Postgres lo valida al aplicar la migración, no en el primer llamado real del RPC a mitad de un formulario).',
      ).toBe(false);
      // La lista de columnas del INSERT estático no debe incluir
      // "cantidad" -- v_cabezas nunca se escribe ahí (QA #3).
      const insertListMatch = /INSERT\s+INTO\s+fin_ingresos\s*\(([^)]*)\)/i.exec(region);
      expect(
        insertListMatch,
        'No se encontró la lista de columnas del INSERT estático hacia fin_ingresos dentro de fn_hato_registrar_venta_animales.',
      ).not.toBeNull();
      if (!insertListMatch) return;
      const columnas = insertListMatch[1];
      expect(
        /\bcantidad\b/i.test(columnas),
        `fn_hato_registrar_venta_animales inserta en la columna "cantidad" de fin_ingresos — esa columna ya significa litros (leche) o kg (aguacate) según el negocio; escribir cabezas ahí es una tercera unidad no declarada, la misma clase de bug que calculosCostoKg.ts:41 (QA #3). Lista de columnas encontrada: ${columnas}`,
      ).toBe(false);
      expect(
        /\bcabezas\b/i.test(columnas),
        `La lista de columnas del INSERT hacia fin_ingresos en fn_hato_registrar_venta_animales no incluye "cabezas". Lista encontrada: ${columnas}`,
      ).toBe(true);
    });
  });
});
