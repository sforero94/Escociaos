// ARCHIVO: scripts/import-hato/verify.ts
// DESCRIPCIÓN: Runner de I/O de la etapa "Verify" (plan
// docs/plan_hato_lechero_module.md §7.4, paso 5) -- el script que
// `load.ts` ya menciona en su log final ("Corre scripts/import-hato/verify.ts
// a continuación") pero que nunca se escribió (CLAUDE.md, "Known follow-ups"
// #4; docs/hato/runbook-load-historico.md, "Seguimiento pendiente").
//
// Todo el motor de invariantes es PURO y ya existía: `src/utils/importHato/verificar.ts`
// (testeado en `src/__tests__/importHatoVerificar.test.ts`). Este archivo
// solo lee de vuelta lo que `load.ts` (o la captura en vivo) ya escribió en
// Supabase, arma las formas de entrada mínimas que pide `verificarCargaHato`,
// y imprime el resultado -- SOLO LECTURA, nunca escribe nada.
//
// >>> ESCRITO PERO NUNCA EJECUTADO EN ESTA SESIÓN (instrucción explícita). <<<
//
// USO:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node --import ./scripts/import-hato/register-alias.mjs scripts/import-hato/verify.ts
//
// Requiere SUPABASE_SERVICE_ROLE_KEY (nunca la anon key): es un script sin
// sesión de usuario, y la RLS de los `hato_*` (patrón 044) exige el rol
// `authenticated` para SELECT -- un cliente `anon` sin sesión no calza ahí.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseSX } from '../../src/utils/calculosHato';
import {
  verificarCargaHato,
  type AnimalCargado,
  type EventoCargado,
  type ChequeoVacaCargada,
  type NumeroCriaEsperado,
} from '../../src/utils/importHato/verificar';
import { fetchAll } from '../../src/utils/supabase/fetchAll';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolvePath(__dirname, 'out');

function crearClienteServiceRole() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno -- este script NUNCA debe correr con la anon key.');
  }
  return createClient(url, key);
}

interface FilaAnimal {
  id: string;
  numero: number | null;
  nombre: string | null;
  estado: AnimalCargado['estado'];
  etapa: AnimalCargado['etapa'];
}

interface FilaEvento {
  animal_id: string;
  tipo: string;
  fecha: string;
}

interface FilaChequeo {
  id: string;
  fecha: string;
}

interface FilaChequeoVaca {
  chequeo_id: string;
  animal_id: string;
  fecha_servicio: string | null;
  sx_raw: string | null;
  num_partos: number | null;
}

async function main(): Promise<void> {
  const supabase = crearClienteServiceRole();

  console.log('Leyendo hato_animales, hato_eventos, hato_chequeos, hato_chequeo_vacas...');

  const { filas: animales, truncado: animalesTrunc } = await fetchAll<FilaAnimal>((desde, hasta) =>
    supabase.from('hato_animales').select('id, numero, nombre, estado, etapa').range(desde, hasta),
  );
  const { filas: eventos, truncado: eventosTrunc } = await fetchAll<FilaEvento>((desde, hasta) =>
    supabase.from('hato_eventos').select('animal_id, tipo, fecha').range(desde, hasta),
  );
  const { filas: chequeos, truncado: chequeosTrunc } = await fetchAll<FilaChequeo>((desde, hasta) =>
    supabase.from('hato_chequeos').select('id, fecha').range(desde, hasta),
  );
  const { filas: chequeoVacas, truncado: chequeoVacasTrunc } = await fetchAll<FilaChequeoVaca>((desde, hasta) =>
    supabase.from('hato_chequeo_vacas').select('chequeo_id, animal_id, fecha_servicio, sx_raw, num_partos').range(desde, hasta),
  );

  if (animalesTrunc || eventosTrunc || chequeosTrunc || chequeoVacasTrunc) {
    console.warn('ADVERTENCIA: una o más consultas alcanzaron el techo de seguridad de fetchAll (20.000 filas) -- el resultado puede estar incompleto. Revisar antes de confiar en este reporte.');
  }

  const fechaPorChequeoId = new Map(chequeos.map((c) => [c.id, c.fecha]));
  const animalesPorId = new Map(animales.map((a) => [a.id, a]));

  // ------------------------------------------------------------------
  // 1. Animales cargados (forma mínima de AnimalCargado).
  // ------------------------------------------------------------------
  const animalesCargados: AnimalCargado[] = animales.map((a) => ({
    id: a.id,
    numero: a.numero,
    nombre: a.nombre,
    estado: a.estado,
    etapa: a.etapa,
  }));

  // ------------------------------------------------------------------
  // 2. Eventos cargados.
  // ------------------------------------------------------------------
  const eventosCargados: EventoCargado[] = eventos.map((e) => ({ animal_id: e.animal_id, tipo: e.tipo, fecha: e.fecha }));

  // ------------------------------------------------------------------
  // 3. hato_chequeo_vacas -> ChequeoVacaCargada (une contra la fecha del
  //    chequeo padre). Filas cuyo chequeo_id no resuelve a una fecha
  //    (no debería pasar, pero defensivo) se excluyen del invariante de
  //    fechas futuras -- no se puede evaluar sin la fecha del chequeo.
  // ------------------------------------------------------------------
  const chequeoVacasCargadas: ChequeoVacaCargada[] = [];
  for (const cv of chequeoVacas) {
    const fecha = fechaPorChequeoId.get(cv.chequeo_id);
    if (!fecha) continue;
    chequeoVacasCargadas.push({ animal_id: cv.animal_id, chequeo_fecha: fecha, fecha_servicio: cv.fecha_servicio });
  }

  // ------------------------------------------------------------------
  // 4. numerosCriaEsperados -- todo SX tipo 'a_n' (cría retenida con
  //    número) visto en `sx_raw`, re-derivado con el MISMO parser que usa
  //    el resto del pipeline (`parseSX`, calculosHato.ts) -- nunca un
  //    segundo decompositor.
  // ------------------------------------------------------------------
  const numerosCriaEsperados: NumeroCriaEsperado[] = [];
  for (const cv of chequeoVacas) {
    if (!cv.sx_raw) continue;
    const sx = parseSX(cv.sx_raw);
    if (sx.tipo !== 'a_n' || sx.numeroCria === undefined) continue;
    const fecha = fechaPorChequeoId.get(cv.chequeo_id) ?? 'fecha desconocida';
    const animal = animalesPorId.get(cv.animal_id);
    numerosCriaEsperados.push({
      numero: sx.numeroCria,
      origen: `sx_raw='${cv.sx_raw}' en chequeo ${fecha}, animal ${animal?.numero ?? cv.animal_id} (${animal?.nombre ?? 'sin nombre'})`,
    });
  }

  // ------------------------------------------------------------------
  // 5. partosDeclaradosPorAnimal -- #P (num_partos) MÁXIMO declarado por
  //    animal, a través de todos sus chequeos.
  // ------------------------------------------------------------------
  const partosDeclaradosPorAnimal = new Map<string, number>();
  for (const cv of chequeoVacas) {
    if (cv.num_partos === null) continue;
    const actual = partosDeclaradosPorAnimal.get(cv.animal_id) ?? 0;
    if (cv.num_partos > actual) partosDeclaradosPorAnimal.set(cv.animal_id, cv.num_partos);
  }

  // ------------------------------------------------------------------
  // 6. numerosEnUltimoChequeo -- chapetas presentes en el chequeo con la
  //    fecha MÁS RECIENTE (mismo criterio que el resto del módulo:
  //    "último chequeo", nunca "última fecha de calendario" en general).
  // ------------------------------------------------------------------
  const fechaMasReciente = chequeos.reduce<string | null>((max, c) => (max === null || c.fecha > max ? c.fecha : max), null);
  const numerosEnUltimoChequeo = new Set<number>();
  if (fechaMasReciente !== null) {
    const chequeoIdsDeEsaFecha = new Set(chequeos.filter((c) => c.fecha === fechaMasReciente).map((c) => c.id));
    for (const cv of chequeoVacas) {
      if (!chequeoIdsDeEsaFecha.has(cv.chequeo_id)) continue;
      const numero = animalesPorId.get(cv.animal_id)?.numero;
      if (numero !== null && numero !== undefined) numerosEnUltimoChequeo.add(numero);
    }
  }

  const resultado = verificarCargaHato({
    animales: animalesCargados,
    eventos: eventosCargados,
    numerosCriaEsperados,
    partosDeclaradosPorAnimal,
    numerosEnUltimoChequeo,
    chequeoVacas: chequeoVacasCargadas,
  });

  // ------------------------------------------------------------------
  // Reporte -- consola + archivo en out/ (gitignored, igual que el resto
  // de los artefactos de este pipeline).
  // ------------------------------------------------------------------
  const lineas: string[] = [];
  const log = (s: string) => {
    console.log(s);
    lineas.push(s);
  };

  log('--- Verify: invariantes post-carga del Hato Lechero ---');
  log(`Fecha del chequeo más reciente: ${fechaMasReciente ?? '(ninguno)'}`);
  log('');
  log(`1. Números de cría (A{n}) sin animal: ${resultado.numerosCriaSinAnimal.length}`);
  for (const h of resultado.numerosCriaSinAnimal) log(`   - #${h.numeroCria}: ${h.origen}`);
  log('');
  log(`2. Discrepancias de conteo de partos (> tolerancia): ${resultado.discrepanciasPartos.length}`);
  for (const d of resultado.discrepanciasPartos.slice(0, 20)) {
    log(`   - animal ${d.numero ?? d.animalId}: declarado(máx)=${d.partosDeclaradosMaximo}, cargado=${d.partosCargados}, diferencia=${d.diferencia}`);
  }
  if (resultado.discrepanciasPartos.length > 20) log(`   ... y ${resultado.discrepanciasPartos.length - 20} más`);
  log('');
  log('3. Tamaño del hato activo (informativo, nunca bloquea -- ver nota de cabecera de verificar.ts):');
  log(`   - Activos total: ${resultado.poblacion.activosTotal}`);
  log(`   - Activos en el último chequeo: ${resultado.poblacion.activosEnUltimoChequeo}`);
  log(`   - Activos fuera del último chequeo: ${resultado.poblacion.activosFueraDelUltimoChequeo}`);
  log('');
  log(`4. Colisiones de número entre animales ACTIVOS: ${resultado.colisionesNumeroPostCarga.length}`);
  for (const c of resultado.colisionesNumeroPostCarga) log(`   - numero ${c.numero}: ${c.animalIds.join(', ')}`);
  log('');
  log(`5. Fechas de servicio posteriores al chequeo que las reporta: ${resultado.fechasServicioFuturas.length}`);
  for (const f of resultado.fechasServicioFuturas.slice(0, 20)) {
    log(`   - animal ${f.animalId}: chequeo ${f.chequeoFecha}, fecha_servicio ${f.fechaServicio}`);
  }
  if (resultado.fechasServicioFuturas.length > 20) log(`   ... y ${resultado.fechasServicioFuturas.length - 20} más`);
  log('');
  log(resultado.ok ? 'OK: los invariantes DUROS pasaron (1, 4 y 5 en cero).' : 'FALLÓ: al menos uno de los invariantes duros (1, 4 o 5) encontró algo -- revisar arriba.');

  mkdirSync(OUT_DIR, { recursive: true });
  const rutaReporte = resolvePath(OUT_DIR, 'verify-reporte.txt');
  writeFileSync(rutaReporte, lineas.join('\n'), 'utf-8');
  console.log(`\nEscrito: ${rutaReporte}`);

  if (!resultado.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Verify abortado:', err instanceof Error ? err.message : err);
  process.exit(1);
});
