// ARCHIVO: scripts/import-hato/backfill-meses-prenez.ts
// DESCRIPCIÓN: Backfill de una sola vez de `hato_chequeo_vacas.meses_prenez`
// (F/U 2, CLAUDE.md "Known follow-ups" #2) para las filas que YA existen en
// producción -- cargadas por `Load` (histórico) o por el commit path ANTES
// de que `commitChequeo.ts::construirFilasVacas` empezara a poblar esta
// columna. Deriva con el MISMO motor (`calcularMesesPrenez`, calculosHato.ts)
// que ya usa el resto del módulo para SECAR/PP -- nunca una segunda fórmula.
//
// >>> ESCRITO PERO NUNCA EJECUTADO EN ESTA SESIÓN (instrucción explícita). <<<
//
// USO:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs \
//     scripts/import-hato/backfill-meses-prenez.ts [--dry-run]
//
// Alcance: SOLO filas con `meses_prenez IS NULL` -- nunca pisa un valor ya
// escrito (ej. por una corrida anterior de este mismo script, o por el
// commit path en vivo desde que F/U 2 se desplegó). Sin `fecha_servicio` en
// la fila, o sin poder resolver la fecha del `hato_chequeos` padre, la fila
// queda tal cual (null se queda null -- nunca se inventa un 0).
//
// UPDATE-por-id, nunca upsert de PostgREST (mismo criterio que el resto del
// módulo) -- este script solo hace UPDATE (nunca INSERT), así que la
// pregunta de upsert-vs-update-then-insert ni siquiera aplica, pero se deja
// la nota para quien lo use como plantilla de otro backfill.

import { createClient } from '@supabase/supabase-js';
import { calcularMesesPrenez } from '../../src/utils/calculosHato';
import { fetchAll } from '../../src/utils/supabase/fetchAll';

function crearClienteServiceRole() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno -- este script NUNCA debe correr con la anon key.');
  }
  return createClient(url, key);
}

interface FilaChequeoVacaSinPrenez {
  id: string;
  chequeo_id: string;
  fecha_servicio: string | null;
}

interface FilaChequeo {
  id: string;
  fecha: string;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = crearClienteServiceRole();

  console.log('Leyendo hato_chequeo_vacas con meses_prenez IS NULL...');
  const { filas: pendientes, truncado } = await fetchAll<FilaChequeoVacaSinPrenez>((desde, hasta) =>
    supabase.from('hato_chequeo_vacas').select('id, chequeo_id, fecha_servicio').is('meses_prenez', null).range(desde, hasta),
  );
  if (truncado) {
    console.warn('ADVERTENCIA: fetchAll alcanzó su techo de seguridad (20.000 filas) -- puede haber más filas pendientes de las leídas.');
  }
  console.log(`Filas pendientes: ${pendientes.length}`);

  const conFechaServicio = pendientes.filter((f) => f.fecha_servicio !== null);
  console.log(`  ...con fecha_servicio (candidatas a derivar meses_prenez): ${conFechaServicio.length}`);
  console.log(`  ...sin fecha_servicio (quedan en null, nunca se inventa 0): ${pendientes.length - conFechaServicio.length}`);

  if (conFechaServicio.length === 0) {
    console.log('Nada que actualizar.');
    return;
  }

  const chequeoIds = [...new Set(conFechaServicio.map((f) => f.chequeo_id))];
  const fechaPorChequeoId = new Map<string, string>();
  const CHUNK_SELECT = 200;
  for (let i = 0; i < chequeoIds.length; i += CHUNK_SELECT) {
    const lote = chequeoIds.slice(i, i + CHUNK_SELECT);
    const { data, error } = await supabase.from('hato_chequeos').select('id, fecha').in('id', lote);
    if (error) throw error;
    for (const c of (data ?? []) as FilaChequeo[]) fechaPorChequeoId.set(c.id, c.fecha);
  }

  let actualizadas = 0;
  let sinChequeoFecha = 0;

  for (const fila of conFechaServicio) {
    const chequeoFecha = fechaPorChequeoId.get(fila.chequeo_id);
    if (!chequeoFecha) {
      sinChequeoFecha++;
      console.warn(`hato_chequeo_vacas id=${fila.id}: su chequeo_id (${fila.chequeo_id}) no resolvió a una fecha -- se deja sin tocar.`);
      continue;
    }
    const mesesPrenez = calcularMesesPrenez(fila.fecha_servicio!, chequeoFecha);
    if (dryRun) {
      actualizadas++;
      continue;
    }
    const { error } = await supabase.from('hato_chequeo_vacas').update({ meses_prenez: mesesPrenez }).eq('id', fila.id);
    if (error) throw error;
    actualizadas++;
  }

  console.log(`${dryRun ? '[--dry-run] Se actualizarían' : 'Actualizadas'}: ${actualizadas} fila(s).`);
  if (sinChequeoFecha > 0) console.log(`Sin resolver (chequeo_id huérfano, no debería pasar): ${sinChequeoFecha}.`);
  console.log('--- Backfill de meses_prenez: completo ---');
}

main().catch((err) => {
  console.error('Backfill de meses_prenez abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
