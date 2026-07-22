// ARCHIVO: utils/importHato/reporte.ts
// DESCRIPCIÓN: Renderizador puro de `resolution-report.md` -- el documento
// que Martha revisa en el checkpoint del plan §7.4 ("Resolve" -> [CHECKPOINT
// MARTHA] -> "Load"). Escrito para una persona que NO lee código: en
// español, sin jerga de programación, con las decisiones que solo ella
// puede tomar primero, luego lo de menor confianza, y al final el resumen
// de lo que se resolvió automáticamente.
//
// Módulo PURO: recibe `ResultadoResolucion` (la salida de `resolver.ts`) y
// devuelve un `string` markdown -- cero I/O, cero `Date.now()`. El runner
// `scripts/import-hato/resolve.ts` es quien escribe el resultado a disco.
//
// Lo que este archivo NO intenta hacer: cruzar `SalidaNormalizado` con datos
// que no forman parte de su contrato (ej. las planillas de leche, que no
// traen chapeta y viven fuera de este pipeline -- Épica D/S5). Esa clase de
// evidencia cruzada, cuando existe, se documenta a mano en la copia real de
// `resolution-report.md` citando su fuente -- este renderizador se limita a
// lo que `resolver.ts` puede calcular de `SalidaNormalizado`.

import type { ResultadoResolucion, ColisionChapetaCorpus, RenombreResuelto } from './resolver';
import { OVERRIDES_CHAPETA, motivoOverride } from './overridesChapeta';

function tituloConEvidencia(c: ColisionChapetaCorpus): string {
  const vigencia = c.vigente ? '**VIGENTE en el chequeo más reciente**' : 'ya no vigente (histórica)';
  return `### Numero ${c.numero} -- ${c.nombres.join(' / ')} (${c.numeroHojas} hoja${c.numeroHojas === 1 ? '' : 's'}, ${vigencia})`;
}

function renderEvidenciaLecturas(c: ColisionChapetaCorpus, maxFilas = 8): string {
  const filas = c.evidencia.slice(0, maxFilas).map((e) => `  - ${e.archivo} :: ${e.hoja}${e.fecha ? ` (${e.fecha})` : ' (fecha sin resolver)'}`);
  const resto = c.evidencia.length - filas.length;
  if (resto > 0) filas.push(`  - … y ${resto} lectura(s) más`);
  return filas.join('\n');
}

function renderGruposOrtograficos(c: ColisionChapetaCorpus): string | null {
  const gruposConVariante = c.gruposOrtograficos.filter((g) => g.length > 1);
  if (gruposConVariante.length === 0) return null;
  const lista = gruposConVariante.map((g) => `'${g.join("' / '")}'`).join(', ');
  return `  Posible variante de escritura del mismo nombre (nunca resuelto automáticamente, solo agrupado para revisión): ${lista}.`;
}

function renderEncabezado(resultado: ResultadoResolucion): string {
  return [
    '# Reporte de resolución -- Importación histórica Hato Lechero',
    '',
    `Generado: ${resultado.generadoEn}`,
    '',
    'Este documento reúne todo lo que la importación del histórico del hato',
    '(2019-2026) encontró que **no se puede decidir por regla** -- son',
    'decisiones que solo tú puedes tomar. Va primero lo que bloquea la carga,',
    'después lo de menor certeza, y al final un resumen de lo que el sistema',
    'sí pudo resolver solo.',
    '',
    '**Nada de la planilla original se descarta.** Todo lo ambiguo queda',
    'documentado aquí con la evidencia de dónde salió (archivo, hoja, fecha)',
    'para que puedas revisarlo contra el Excel si hace falta.',
  ].join('\n');
}

function renderResumenEjecutivo(resultado: ResultadoResolucion): string {
  const { totales } = resultado;
  const colisionesVigentes = resultado.colisiones.filter((c) => c.vigente);
  const lineas = [
    '## Resumen',
    '',
    `- Lecturas de chequeo procesadas: ${totales.lecturasChequeo}`,
    `- Filas de animal en chequeos: ${totales.filasChequeo} (${totales.numerosDistintosChequeo} números distintos)`,
    `- Filas en TERNERAS: ${totales.filasTerneras} (${totales.numerosDistintosTerneras} números distintos)`,
    `- **Decisiones que TODAVÍA bloquean la carga: ${resultado.colisionesSinCubrir.length}**`,
    `- Desempates provisionales ya aplicados (pendientes de confirmar): ${resultado.numerosLiberadosPorOverride.length}`,
    `- Nombres que aparecen bajo más de un número: ${resultado.nombresEnVariosNumeros.length}`,
    `- Colisiones históricas ya resueltas solas (no bloquean): ${resultado.colisiones.length - colisionesVigentes.length}`,
    `- Cierres presuntos (+365 días sin aparecer, resueltos automáticamente -- D5): ${resultado.cierresPresuntos.length}`,
    `- Animales resueltos para el registro (\`animales.csv\`): ${resultado.animales.length}`,
  ];
  return lineas.join('\n');
}

function renderSeccionColisionesVigentes(resultado: ResultadoResolucion): string {
  const sinCubrir = resultado.colisionesSinCubrir;
  const partes = [
    '## 1. Decisiones que bloquean la carga (revisar primero)',
    '',
    'Cada uno de estos números de chapeta identifica hoy a DOS (o más)',
    'animales distintos -- no se pueden cargar todos con el mismo número (el',
    'sistema no lo permite). Para cada uno, indícanos **cuál de los animales',
    'conserva el número y qué número nuevo recibe el otro** (o si uno de los',
    'nombres es en realidad un error y no corresponde a un animal real).',
    '',
    'Ordenados por la cantidad de chequeos donde aparecen los nombres a la',
    'vez -- entre más chequeos, más probable que sean animales reales y no un',
    'error de digitación puntual.',
  ];
  if (sinCubrir.length === 0) {
    partes.push('', '_No queda ninguna colisión vigente sin resolver en esta corrida._');
    return partes.join('\n');
  }
  for (const c of sinCubrir) {
    partes.push('', tituloConEvidencia(c), '', renderEvidenciaLecturas(c));
    const variante = renderGruposOrtograficos(c);
    if (variante) partes.push('', variante);
  }
  return partes.join('\n');
}

function renderSeccionDesempatesProvisionales(resultado: ResultadoResolucion): string {
  if (OVERRIDES_CHAPETA.length === 0) return '';
  const partes = [
    '## 2. Desempates provisionales (pendientes de confirmar)',
    '',
    '**Ninguno de los números de esta sección es una chapeta física real.**',
    'Son números de trabajo que se usaron para poder cargar el histórico',
    'mientras se decide el número definitivo -- no salgas a buscar la',
    'caravana con ese número en el potrero, no existe.',
  ];
  const porObservado = new Map<number, typeof OVERRIDES_CHAPETA>();
  for (const o of OVERRIDES_CHAPETA) {
    if (!porObservado.has(o.numeroObservado)) porObservado.set(o.numeroObservado, []);
    porObservado.get(o.numeroObservado)!.push(o);
  }
  for (const [numeroObservado, overrides] of porObservado) {
    partes.push('', `### Chapeta ${numeroObservado} (según la planilla)`, '');
    for (const o of overrides) {
      partes.push(`- **${o.nombre}** -> número de trabajo **${o.numeroAsignado}**. Decidido por ${o.decididoPor} el ${o.fecha}. ${motivoOverride(o)}`);
    }
    partes.push('', `La chapeta física **${numeroObservado}** no la usa ningún animal en el sistema mientras tanto -- existe en el potrero pero no en la base de datos hasta que se confirmen los números definitivos.`);
  }

  // Un override que no le correspondió a ninguna colisión detectada NO puede
  // presentarse arriba como si se hubiera aplicado. Se declara aparte.
  if (resultado.overridesSinUsar.length > 0) {
    partes.push(
      '',
      '### Números de trabajo reservados que NO se usaron',
      '',
      'Estos desempates estaban escritos pero el sistema no encontró la',
      'colisión que iban a resolver -- así que **no se aplicaron a ningún',
      'animal**. No es un error de datos: suele pasar cuando el número de',
      'trabajo se reservó a partir de un conteo manual y el pipeline, al leer',
      'la planilla con más precisión, concluyó que ese nombre no era un animal',
      'aparte. Se listan para que se borren o se corrijan.',
      '',
    );
    for (const o of resultado.overridesSinUsar) {
      partes.push(`- **${o.nombre}** (chapeta ${o.numeroObservado}) tenía reservado el número **${o.numeroAsignado}** -- sin usar.`);
    }
  }
  return partes.join('\n');
}

function renderSeccionNombresEnVariosNumeros(resultado: ResultadoResolucion): string {
  if (resultado.nombresEnVariosNumeros.length === 0) return '';
  const partes = [
    '## 3. Un mismo nombre aparece bajo más de un número',
    '',
    'Esto es distinto al caso anterior: aquí un solo NOMBRE está asociado a',
    'DOS números de chapeta distintos. Puede ser la misma vaca mal numerada',
    'en algún chequeo, o dos vacas distintas que coinciden en el nombre.',
  ];
  for (const n of resultado.nombresEnVariosNumeros) {
    partes.push('', `- **${n.nombre}**: números ${n.numeros.join(', ')} (${n.evidencia.length} filas)`);
  }
  return partes.join('\n');
}

function renderSeccionColisionesHistoricas(resultado: ResultadoResolucion): string {
  const historicas = resultado.renombresResueltos.filter((r) => r.fueColisionHistorica);
  if (historicas.length === 0) return '';
  const partes = [
    '## 4. Colisiones que ya se resolvieron solas (no requieren tu decisión)',
    '',
    'Estos números también tuvieron dos nombres en algún momento del',
    'histórico, pero en la lectura más reciente que los menciona solo queda',
    'un nombre -- el sistema asumió que es el vigente. Se listan aquí solo',
    'para que quede constancia; no bloquean nada.',
  ];
  for (const r of historicas) {
    partes.push(
      '',
      `- Numero ${r.numero}: se usó **'${r.nombreVigente}'** (nombre(s) anterior(es): ${r.nombresObsoletos.join(', ')})`,
    );
  }
  return partes.join('\n');
}

function renderNombreIncierto(r: RenombreResuelto): string {
  return `- Numero ${r.numero}: no se pudo determinar con certeza el orden cronológico -- se usó '${r.nombreVigente}', confirmar si es correcto (alternativa(s): ${r.nombresObsoletos.join(', ')}).`;
}

// D5 (decisión del dueño, 2026-07-22, resolution-report.md §5): los cierres
// presuntos (+365 días sin aparecer) YA NO se presentan acá -- "no les des
// ningún tratamiento especial" significa que se resuelven solos, sin pasar
// por una sección de revisión. Se listan en el resumen automático (§11,
// `renderSeccionResumenAutomatico`). Esta sección queda solo para lo que SÍ
// sigue necesitando una mirada: renombres cuyo orden cronológico no se pudo
// determinar con certeza.
function renderSeccionMenorConfianza(resultado: ResultadoResolucion): string {
  const inciertos = resultado.renombresResueltos.filter((r) => r.confianza === 'baja');
  if (inciertos.length === 0) return '';
  const partes = ['## 5. Menor confianza -- revisar cuando puedas', '', 'Nombres donde no se pudo determinar con certeza cuál es el más reciente:'];
  for (const r of inciertos) partes.push(renderNombreIncierto(r));
  return partes.join('\n');
}

function renderSeccionCatalogoToros(resultado: ResultadoResolucion): string {
  if (resultado.catalogoToros.length === 0) return '';
  const confiables = resultado.catalogoToros.filter((t) => !t.sospechosoNoEsToro).slice(0, 20);
  const sospechosos = resultado.catalogoToros.filter((t) => t.sospechosoNoEsToro);
  const partes = [
    '## 6. Catálogo de toros (para el sistema de sementales)',
    '',
    'La columna "Toro" de las hojas de chequeo trae texto libre. Estos son',
    'los valores más frecuentes -- revísalos antes de que se conviertan en el',
    'catálogo de toros del sistema (un toro con nombre incorrecto es difícil',
    'de corregir después porque queda enlazado a servicios ya registrados).',
    '',
    `Total de valores distintos encontrados: ${resultado.catalogoToros.length}.`,
  ];
  if (confiables.length > 0) {
    partes.push('', '**Los más frecuentes:**');
    for (const t of confiables) partes.push(`- '${t.nombreVisible}' -- ${t.apariciones} vez(es)`);
  }
  if (sospechosos.length > 0) {
    partes.push(
      '',
      '**Estos NO parecen nombres de toro** (parecen una frase u observación',
      'que quedó en la columna equivocada) -- no se cargan como toro sin que lo confirmes:',
    );
    for (const t of sospechosos) partes.push(`- '${t.nombreVisible}' -- ${t.apariciones} vez(es)`);
  }
  return partes.join('\n');
}

function renderSeccionPadresTerneras(resultado: ResultadoResolucion): string {
  // D7 (decisión del dueño, 2026-07-22): 'yaguen'/'fabace' dejaron de ser
  // pregunta abierta -- se documentan acá como YA RESUELTOS (mismo patrón
  // que la sección 4 con las colisiones históricas), no como algo para
  // revisar.
  const confirmados = resultado.clasificacionPadresTerneras.filter((p) => p.clasificacion === 'toro_confirmado');
  const noConfirmados = resultado.clasificacionPadresTerneras.filter((p) => p.clasificacion === 'toro_no_confirmado');
  if (confirmados.length === 0 && noConfirmados.length === 0) return '';
  const partes = ['## 7. Columna "Padre" en TERNERAS -- valores que no son una raza conocida'];
  if (confirmados.length > 0) {
    partes.push('', 'Estos valores ya se resolvieron (decisión del dueño, 2026-07-22 -- ver también "Decisiones ya tomadas por el dueño" más abajo):');
    const vistos = new Set<string>();
    for (const p of confirmados) {
      const valor = (p.padreRaw ?? '').trim();
      if (vistos.has(valor.toLowerCase())) continue;
      vistos.add(valor.toLowerCase());
      partes.push(`- '${valor}' -> toro **${p.toroNombre}** (raza ${p.razaDetectada}, asumida por decisión del dueño, no confirmada en la planilla).`);
    }
  }
  if (noConfirmados.length > 0) {
    partes.push('', `Otros ${noConfirmados.length} valores no se reconocen como raza -- podrían ser nombre de toro real, revisar contra el catálogo de la sección 6.`);
  }
  return partes.join('\n');
}

function renderSeccionFilasSinIdentidad(resultado: ResultadoResolucion): string {
  if (resultado.filasSinNumero.length === 0 && resultado.filasSinNombre.length === 0) return '';
  const partes = ['## 8. Filas que no se pudieron identificar del todo'];
  if (resultado.filasSinNumero.length > 0) {
    partes.push(
      '',
      `**${resultado.filasSinNumero.length} fila(s) sin número de chapeta** -- pueden ser animales reales sin numerar, o anotaciones/comentarios que quedaron en la columna equivocada. No se cargan automáticamente; necesitan que alguien les asigne un número o las descarte a mano.`,
    );
    for (const f of resultado.filasSinNumero.slice(0, 15)) {
      partes.push(`- ${f.archivo} :: ${f.hoja}, fila ${f.fila}${f.nombre ? ` -- '${f.nombre}'` : ' -- sin nombre tampoco'}`);
    }
    if (resultado.filasSinNumero.length > 15) partes.push(`- … y ${resultado.filasSinNumero.length - 15} más`);
  }
  if (resultado.filasSinNombre.length > 0) {
    partes.push('', `**${resultado.filasSinNombre.length} fila(s) con número pero sin nombre:**`);
    for (const f of resultado.filasSinNombre.slice(0, 15)) {
      partes.push(`- ${f.archivo} :: ${f.hoja}, fila ${f.fila} -- numero ${f.numero}`);
    }
    if (resultado.filasSinNombre.length > 15) partes.push(`- … y ${resultado.filasSinNombre.length - 15} más`);
  }
  return partes.join('\n');
}

function renderSeccionSubtablas(resultado: ResultadoResolucion): string {
  if (resultado.subtablasResueltas.length === 0) return '';
  const partes = [
    '## 9. Notas de "novillas próximas a servicio" encontradas al final de alguna hoja',
    '',
    'Estas filas no son parte de la tabla principal del chequeo -- son una',
    'nota aparte que se encontró al final de una hoja.',
  ];
  for (const s of resultado.subtablasResueltas) {
    partes.push(
      `- ${s.archivo} :: ${s.hoja}, fila ${s.fila}${s.numero ? ` -- numero ${s.numero}` : ''}${s.nombre ? ` '${s.nombre}'` : ''}${s.coincideConAnimalConocido ? ' (coincide con un animal ya conocido)' : ' (no se encontró coincidencia -- revisar)'}`,
    );
  }
  return partes.join('\n');
}

// D10 (decisión del dueño, 2026-07-22, resolution-report.md §10): las 9
// preguntas que este reporte traía como abiertas ya se respondieron en la
// sesión de revisión. Se reemplaza la lista de preguntas por un resumen de
// las decisiones, para no perder la procedencia (quién decidió, qué se
// decidió) aunque ya no haga falta preguntar. Algunas de estas decisiones
// ya están implementadas en este mismo pipeline (D5-D9, ver las secciones
// correspondientes); otras (motor `calculosHato.ts`, migración de `hato_config`,
// diseño del tablero S4) son responsabilidad de otras sesiones -- se
// documentan igual acá porque la pregunta que las originó vivía en este
// reporte.
const DECISIONES_TOMADAS_2026_07_22 = [
  [
    "### 'Mv' en la columna ESTADO/OBS",
    '',
    'Marca vacas retiradas de la reproducción ("vacas de Martha") -- el motor',
    'de cálculo las ignora para fines reproductivos (cambio en `calculosHato.ts`,',
    'sesión aparte).',
  ].join('\n'),
  [
    "### 'gem+' en la columna ESTADO/OBS",
    '',
    'Confirmado: parto gemelar (cambio en `calculosHato.ts`, sesión aparte).',
  ].join('\n'),
  [
    '### La fecha en la columna ESTADO/OBS de las hojas de 2019',
    '',
    'Se ignora -- demasiado antigua para importar, no vale la pena resolver',
    'con certeza si era fecha de secado o de parto.',
  ].join('\n'),
  [
    '### Pesaje semanal: día exacto',
    '',
    'Miércoles.',
  ].join('\n'),
  [
    "### 'yaguen' y 'fabace' en la columna Padre de TERNERAS",
    '',
    'Son nombres de toro reales, no razas -- raza jersey asumida (no',
    "confirmada en la planilla). 'fabace' es el MISMO toro que 'FABA' en la",
    'columna Toro de los chequeos (ver sección 6 de este reporte). Ya',
    'implementado: `clasificarPadreTernera` (D7, resolver.ts).',
  ].join('\n'),
  [
    "### Raza 'Gyr'",
    '',
    'Sí se agrega al catálogo de razas del hato (`HatoConfig.razas`,',
    'migración pendiente en otra sesión). El motor de importación ya la',
    'reconoce como nombre de toro válido (D6, `parseToro.ts`).',
  ].join('\n'),
  [
    '### La nota "Deben entrar a servicio estas terneras"',
    '',
    'Práctica que sigue vigente -- en el sistema nuevo va a vivir en el',
    'campo de observaciones del chequeo, no hace falta reconocerla',
    'automáticamente con una regla aparte.',
  ].join('\n'),
  [
    '### "¿Cuál es el hato?" (número que va a mostrar el tablero)',
    '',
    'El hato tiene TRES categorías, y el tablero (S4, sesión aparte) debe',
    'mostrarlas por separado, nunca un solo número: **terneras**, **hato**',
    '(en ordeño) y **horro** (secas próximas a parir).',
  ].join('\n'),
  [
    '### Producción de leche: litros mensuales (camión) vs. pesaje quincenal (por vaca)',
    '',
    'Son dos datos que cuentan historias distintas -- el camión mide',
    'producción/venta del hato completo, el pesaje quincenal estima la',
    'productividad de cada vaca -- y no hay atribución por ordeño individual',
    '(no existe el dato para repartir el total mensual entre vacas). No se',
    'reparte uno para llenar el otro; se guardan aparte.',
  ].join('\n'),
];

function renderSeccionDecisionesTomadas(): string {
  return ['## 10. Decisiones ya tomadas por el dueño (2026-07-22)', '', ...DECISIONES_TOMADAS_2026_07_22].join('\n\n');
}

function renderSeccionResumenAutomatico(resultado: ResultadoResolucion): string {
  const renombresSimples = resultado.renombresResueltos.filter((r) => !r.fueColisionHistorica && r.confianza !== 'baja');
  const partes = ['## 11. Lo que el sistema resolvió solo (sin necesitar tu decisión)', ''];
  partes.push(`- ${resultado.animales.filter((a) => !a.bloqueadoPorColision).length} animales quedaron listos para cargar.`);
  partes.push(`- ${renombresSimples.length} animales cambiaron de nombre con el tiempo (ej. una cría que fue bautizada al crecer) -- se usó siempre el nombre más reciente, sin preguntarte, porque es ruido esperado, no un error.`);
  if (resultado.catalogoToros.length > 0) {
    partes.push(`- Se armó un catálogo candidato de ${resultado.catalogoToros.length} nombres de toro distintos a partir del histórico.`);
  }
  // D5: los cierres presuntos ya no son una pregunta abierta -- se resuelven
  // solos, "sin ningún tratamiento especial" (palabras del dueño).
  if (resultado.cierresPresuntos.length > 0) {
    partes.push(
      `- ${resultado.cierresPresuntos.length} animales llevan más de un año sin aparecer en ningún chequeo y se marcaron **vendida** automáticamente (fecha aproximada = la última vez que se les vio; decisión del dueño, 2026-07-22: "si duran más de un año sin aparecer, ya no están en el hato", sin ningún tratamiento especial adicional):`,
    );
    for (const c of resultado.cierresPresuntos) {
      partes.push(`  - Numero ${c.numero} (${c.nombre}): visto por última vez ${c.ultimaFechaVista}.`);
    }
  }
  // D8: ventas inferidas de una fila-comentario, ya aplicadas.
  if (resultado.ventasInferidasAplicadas.length > 0) {
    partes.push('- Ventas inferidas de una fila-comentario (D8, decisión del dueño, 2026-07-22) ya aplicadas:');
    for (const a of resultado.ventasInferidasAplicadas) {
      const como = a.huboNumeroNuevo
        ? `número de trabajo PROVISIONAL ${a.numeroFinal} (identidad ambigua, nunca fusionada con un animal existente)`
        : `su número ya existente, ${a.numeroFinal}`;
      partes.push(`  - ${a.venta.nombre}: marcada vendida sobre ${como}.`);
      // Si el MISMO nombre existe además en otros animales del registro, la
      // ambigüedad no puede quedar enterrada: la nota-comentario no dice CUÁL
      // de las homónimas se vendió. Eso lo decide Martha, no el pipeline.
      const homonimas = resultado.animales.filter(
        (an) =>
          an.numero !== a.numeroFinal &&
          (an.nombre ?? '').trim().toUpperCase() === a.venta.nombre.trim().toUpperCase(),
      );
      if (homonimas.length > 0) {
        const lista = homonimas
          .map((h) => `#${h.numero} (${h.estadoPresunto ?? 'activa'})`)
          .join(', ');
        partes.push(
          `    ⚠️ Ojo: existe(n) además ${lista} con el mismo nombre. La nota no dice cuál se vendió -- confirmar cuál es la vendida y fusionar/corregir la que corresponda.`,
        );
      }
    }
  }
  if (resultado.ventasInferidasSinAplicar.length > 0) {
    partes.push(
      `- **${resultado.ventasInferidasSinAplicar.length} venta(s) inferida(s) de D8 NO se pudieron aplicar** (el nombre no resolvió a exactamente un animal del registro) -- revisar: ${resultado.ventasInferidasSinAplicar.map((v) => v.nombre).join(', ')}.`,
    );
  }
  return partes.join('\n');
}

function renderSeccionEstadoLoad(resultado: ResultadoResolucion): string {
  const sinCubrir = resultado.colisionesSinCubrir;
  const partes = ['## 12. Estado de la carga a la base de datos', ''];
  if (sinCubrir.length > 0) {
    const nombres = sinCubrir.map((c) => `numero ${c.numero} (${c.nombres.join('/')})`).join(', ');
    partes.push(
      '**La carga está BLOQUEADA.** No se va a insertar ningún animal hasta',
      `que se resuelva: ${nombres}. Esa es hoy la ÚNICA cosa que bloquea la`,
      'carga -- el sistema no permite que dos animales activos compartan el',
      'mismo número, así que cargar ahora fallaría (o peor, forzaría una',
      'elección arbitraria).',
    );
    if (resultado.numerosLiberadosPorOverride.length > 0) {
      partes.push(
        '',
        `(Las demás colisiones vigentes de esta corrida -- ${resultado.numerosLiberadosPorOverride.join(', ')} -- ya tienen un desempate provisional, ver sección 2. Siguen pendientes de confirmar, pero NO bloquean la carga.)`,
      );
    }
  } else {
    partes.push('No hay colisiones vigentes sin resolver -- la carga puede proceder.');
  }
  return partes.join('\n');
}

function renderMetodologia(): string {
  return [
    '## Cómo se armó este reporte',
    '',
    'Este reporte se genera automáticamente a partir de las hojas de Excel',
    'del histórico del hato (2019-2026). Ningún valor se descarta: lo que no',
    'se pudo interpretar con certeza queda documentado arriba, con la',
    'referencia exacta de archivo, hoja y fila para que se pueda revisar',
    'contra el Excel original en cualquier momento.',
  ].join('\n');
}

/**
 * Renderiza `resolution-report.md` a partir del resultado de
 * `resolverIdentidadHato`. Función pura (string in -> string out); el
 * runner (`scripts/import-hato/resolve.ts`) es quien la invoca y escribe el
 * resultado a `scripts/import-hato/out/resolution-report.md`.
 */
export function generarResolutionReport(resultado: ResultadoResolucion): string {
  const secciones = [
    renderEncabezado(resultado),
    renderResumenEjecutivo(resultado),
    renderSeccionColisionesVigentes(resultado),
    renderSeccionDesempatesProvisionales(resultado),
    renderSeccionNombresEnVariosNumeros(resultado),
    renderSeccionColisionesHistoricas(resultado),
    renderSeccionMenorConfianza(resultado),
    renderSeccionCatalogoToros(resultado),
    renderSeccionPadresTerneras(resultado),
    renderSeccionFilasSinIdentidad(resultado),
    renderSeccionSubtablas(resultado),
    renderSeccionDecisionesTomadas(),
    renderSeccionResumenAutomatico(resultado),
    renderSeccionEstadoLoad(resultado),
    renderMetodologia(),
  ];
  return secciones.filter((s) => s.trim() !== '').join('\n\n---\n\n') + '\n';
}
