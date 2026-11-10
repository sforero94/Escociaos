// Solo antes de aplicar la 194. Después de aplicarla el archivo queda inmutable.
import { readFileSync, writeFileSync } from 'node:fs';
const catalogo = JSON.parse(readFileSync(new URL('../../src/utils/escoSql/catalogoConsulta.json', import.meta.url), 'utf8'));
const ruta = new URL('../../src/sql/migrations/194_esco_sql_ejecutor_compartido.sql', import.meta.url);
const sql = readFileSync(ruta, 'utf8');
const literal = JSON.stringify(catalogo).replaceAll("'", "''");
const generado = sql.replace(/-- CATALOGO_GENERADO_INICIO[\s\S]*?-- CATALOGO_GENERADO_FIN/, `-- CATALOGO_GENERADO_INICIO\nSELECT '${literal}'::jsonb;\n-- CATALOGO_GENERADO_FIN`);
if (process.argv.includes('--check')) {
  if (generado !== sql) { console.error('El catálogo SQL 194 no coincide con catalogoConsulta.json'); process.exit(1); }
} else writeFileSync(ruta, generado);
