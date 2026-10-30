// Provider DTO for one domain. Aggregation uses all verified observations;
// only explicitly labelled projections/samples cross the model boundary.
import type { ClasificacionPesaje, ProduccionSummary } from './hato-aggregation.ts';

export const MAX_BYTES_EVIDENCIA_LECHE = 20_000;
const utf8 = new TextEncoder();
const bytes = (s: string) => utf8.encode(s).length;
function identidad(id: string): string {
  if (typeof id !== 'string' || !id.trim() || bytes(id) > 128) {
    throw new Error('Identidad de pesaje no representable; no se recorta ni sustituye.');
  }
  return id;
}
function numerico(n: number | null): number | null {
  if (n === null || (typeof n === 'number' && Number.isFinite(n))) return n;
  throw new Error('Valor numérico de leche no verificable.');
}
function fecha(d: string | null): string | null {
  if (d === null || (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) return d;
  throw new Error('Fecha de leche no representable; no se recorta.');
}
function texto(s: string | null, max: number) {
  if (s === null) return { valor: null, recortado: false };
  if (typeof s !== 'string') throw new Error('Etiqueta de leche no verificable.');
  if (bytes(s) <= max) return { valor: s, recortado: false };
  let prefix = '';
  for (const ch of s) {
    if (bytes(prefix + ch) > max - 3) break;
    prefix += ch;
  }
  return { valor: prefix + '…', recortado: true };
}

export function serializarEvidenciaLeche(summary: ProduccionSummary, options: {
  identidadesParaNumero: string[]; maximoQuincenas: number;
}): string {
  const periodo = { desde: fecha(summary.periodo.desde), hasta: fecha(summary.periodo.hasta) };
  if (!periodo.desde || !periodo.hasta) throw new Error('Período de pesajes no verificable.');
  const all = [...summary.pesajes_semanales.por_vaca].sort((a, b) =>
    b.promedio_litros - a.promedio_litros || a.animal_id.localeCompare(b.animal_id));
  all.forEach(v => identidad(v.animal_id));
  const total = all.reduce((n, v) => n + v.registros.length, 0);
  if (total > 20_000 || total !== summary.pesajes_semanales.total_registros
    || new Set(all.map(v => v.animal_id)).size !== all.length
    || all.some(v => v.registros.length === 0 || v.num_pesajes !== v.registros.length)) {
    throw new Error('Cobertura interna de pesajes inconsistente o superior al límite.');
  }
  options.identidadesParaNumero.forEach(identidad);
  const ranks = new Map<string, number>();
  let rank = 0;
  all.forEach((v, i) => {
    if (i === 0 || v.promedio_litros !== all[i - 1].promedio_litros) rank = i + 1;
    ranks.set(v.animal_id, rank);
  });
  // A profile's last20 suffice to find the global last20; no raw record is
  // duplicated in the profiles supplied to the provider.
  const recent = all.flatMap(v => v.registros.slice(-20).map(r => ({ animal_id: v.animal_id, ...r })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.animal_id.localeCompare(b.animal_id));
  let profileLimit = 50, rawLimit = 20, quincenaLimit = 6, identityLimit = 20;
  for (;;) {
    let labelsCut = false, notesCut = false;
    const label = (name: string | null) => {
      const result = texto(name, 64); labelsCut ||= result.recortado;
      return { nombre: result.valor, nombre_recortado: result.recortado };
    };
    const ranked = (v: ClasificacionPesaje) => ({
      animal_id: identidad(v.animal_id), numero: numerico(v.numero), ...label(v.nombre),
      promedio_litros: numerico(v.promedio_litros), num_pesajes: v.num_pesajes, puesto: v.puesto,
      primera_fecha: fecha(v.primera_fecha), ultima_fecha: fecha(v.ultima_fecha),
    });
    const chosen = all.length <= profileLimit ? all : [
      ...all.slice(0, Math.ceil(profileLimit / 2)),
      ...all.slice(all.length - Math.floor(profileLimit / 2)),
    ];
    const profiles = chosen.map(v => ({
      animal_id: identidad(v.animal_id), numero: numerico(v.numero), ...label(v.nombre),
      promedio_litros: numerico(v.promedio_litros), num_pesajes: v.num_pesajes,
      puesto_mayor_promedio: ranks.get(v.animal_id),
      primera_fecha: fecha(v.registros[0].fecha), ultima_fecha: fecha(v.registros[v.registros.length - 1].fecha),
    }));
    const samples = recent.slice(0, rawLimit).map(r => ({
      animal_id: identidad(r.animal_id), fecha: fecha(r.fecha),
      litros_am: numerico(r.litros_am), litros_pm: numerico(r.litros_pm), litros_total: numerico(r.litros_total),
    }));
    const quincenas = summary.produccion_quincenal.slice(0, quincenaLimit).map(q => {
      const note = texto(q.notas, 120); notesCut ||= note.recortado;
      return { anio: numerico(q.anio), mes: numerico(q.mes), quincena: numerico(q.quincena),
        fecha_inicio: fecha(q.fecha_inicio), fecha_fin: fecha(q.fecha_fin),
        litros_total: numerico(q.litros_total), litros_pomar_confirmado: numerico(q.litros_pomar_confirmado),
        num_vacas_ordeno: numerico(q.num_vacas_ordeno), litros_por_vaca: numerico(q.litros_por_vaca),
        pendiente_conciliacion: q.pendiente_conciliacion, diferencia_pomar: numerico(q.diferencia_pomar),
        notas: note.valor, notas_recortadas: note.recortado };
    });
    const mayor = summary.resumen.mayores_promedios.slice(0, 5).map(ranked);
    const menor = summary.resumen.menores_promedios.slice(0, 5).map(ranked);
    const k = summary.kpi_quincena_mas_reciente;
    const recortes = {
      perfiles_omitidos: all.length - profiles.length,
      pesajes_omitidos: summary.pesajes_semanales.total_registros - samples.length,
      quincenas_omitidas: summary.produccion_quincenal.length - quincenas.length,
      identidades_omitidas: options.identidadesParaNumero.length - Math.min(identityLimit, options.identidadesParaNumero.length),
      etiquetas_recortadas: labelsCut, notas_recortadas: notesCut,
    };
    const payload = {
      periodo,
      resumen: { periodo_pesajes: periodo, unidad_pesajes: 'L/pesaje observado',
        total_registros: summary.pesajes_semanales.total_registros, animales_con_pesaje: all.length,
        promedio_litros_por_pesaje: numerico(summary.pesajes_semanales.promedio_litros_por_pesaje),
        mayores_promedios: mayor, menores_promedios: menor,
        clasificacion_completa_en_resumen: all.length <= 5,
        limites: [
          'Agregados y extremos usan todos los pesajes consultados; no son producción acumulada ni volumen vendido.',
          'Las muestras recientes y los perfiles expuestos son detalle limitado, no todo el universo consultado.',
          'Sin pesaje, esta consulta no establece la producción individual; no imputes cero. UUID identifica; número/nombre pueden repetirse.',
          'Extremos: máximo5 por lado; pueden existir otros empatados. No infieras ausencia de filas omitidas.',
        ] },
      pesajes_semanales: { total_registros: summary.pesajes_semanales.total_registros,
        promedio_litros_por_pesaje: numerico(summary.pesajes_semanales.promedio_litros_por_pesaje),
        por_vaca: profiles, perfiles_completos: profiles.length === all.length,
        seleccion_perfiles: 'todos_o_extremos_por_promedio', muestras_recientes: samples,
        muestras_completas: samples.length === summary.pesajes_semanales.total_registros },
      produccion_quincenal: quincenas,
      kpi_quincena_mas_reciente: k ? { anio: numerico(k.anio), mes: numerico(k.mes),
        quincena: numerico(k.quincena), litros_total: numerico(k.litros_total), litros_por_vaca: numerico(k.litros_por_vaca) } : null,
      _evidencia: { herramienta: 'get_hato_produccion', consulta_completa: true, agregados_completos: true,
        alcance_agregados: 'conteos_y_media_globales_y_extremos; perfiles_solo_los_expuestos',
        detalle_completo: Object.values(recortes).every(v => v === 0 || v === false), rango: periodo,
        total_pesajes: summary.pesajes_semanales.total_registros,
        identidades_para_numero: options.identidadesParaNumero.slice(0, identityLimit),
        identidades_para_numero_total: options.identidadesParaNumero.length,
        numero_ambiguo: options.identidadesParaNumero.length > 1, recortes,
        quincenas_consultadas: summary.produccion_quincenal.length,
        alcance_quincenas: { seleccion: 'ultimas_quincenas', maximo_solicitado: numerico(options.maximoQuincenas), independiente_del_rango_pesajes: true },
        fuentes: ['hato_pesajes_leche', 'hato_animales', 'hato_produccion_quincenal', 'fin_ingresos'],
        limites: ['Resumen útil con agregados completos aunque el detalle esté acotado. Para observaciones omitidas consulta un rango/animal más preciso; no inventes su contenido.'],
        max_bytes: MAX_BYTES_EVIDENCIA_LECHE, unidad_limite: 'content_serializado_json_utf8' },
    };
    const json = JSON.stringify(payload);
    // Include JSON-string escaping used by the provider message, not only
    // the unescaped tool string. Other request fields/history are separate.
    if (bytes(JSON.stringify(json)) <= MAX_BYTES_EVIDENCIA_LECHE) return json;
    // Shed optional detail only; complete aggregates/extrema and their identities
    // never change. Rebuild omission flags after every reduction.
    if (rawLimit) rawLimit = Math.floor(rawLimit / 2);
    else if (profileLimit) profileLimit = Math.floor(profileLimit / 2);
    else if (quincenaLimit) quincenaLimit = Math.floor(quincenaLimit / 2);
    else if (identityLimit) identityLimit = Math.floor(identityLimit / 2);
    else throw new Error('Agregados de leche no representables dentro del límite de evidencia.');
  }
}
