// Measurement v1 complements legacy verdicts without relabeling historical data.
import type { ResultadoCaso } from './tipos';

export function medir(resultados: ResultadoCaso[], esperados: string[]) {
  const ids = [...new Set(esperados)];
  const observados = new Set(resultados.map((r) => r.caso_id));
  const contadores = {
    total: resultados.length, ejecucion_fallida: 0, juez_no_disponible: 0,
    traza_ausente: 0, exito_verificado: 0, sin_revision: 0,
    respuesta_completa: 0, respuesta_parcial: 0, aclaracion_apropiada: 0, abstencion_apropiada: 0,
    afirmaciones: 0, afirmaciones_soportadas: 0,
    fallos: { afirmacion_sin_soporte: 0, recuperacion_incorrecta: 0, calculo_incorrecto: 0, contradiccion_conversacion: 0 },
    severidad: { menor: 0, mayor: 0, critica: 0 },
  };
  for (const r of resultados) {
    const ejecucionFallida = Boolean(r.corrida.error) || r.corrida.escriturasBloqueadas.length > 0;
    const juezDisponible = r.juez_estado === 'ok' && r.juez !== null;
    // No tool calls can be legitimate; a missing turn/answer cannot.
    const trazaAusente = r.corrida.turnos.length === 0 || r.corrida.turnos.some((t) => !t.respuesta.trim());
    contadores.ejecucion_fallida += Number(ejecucionFallida);
    contadores.juez_no_disponible += Number(!juezDisponible);
    contadores.traza_ausente += Number(trazaAusente);
    const rev = r.revision_medicion;
    if (!rev) { contadores.sin_revision++; continue; }
    for (const f of rev.fallos) { contadores.fallos[f.categoria]++; contadores.severidad[f.severidad]++; }
    contadores.afirmaciones += rev.afirmaciones.length;
    contadores.afirmaciones_soportadas += rev.afirmaciones.filter((a) => a.soporte === 'completo').length;
    const aprobado = rev.apropiado && rev.fallos.length === 0 && r.estado === 'pasa' && juezDisponible && !ejecucionFallida && !trazaAusente;
    if (rev.resultado === 'respuesta_completa' || rev.resultado === 'respuesta_parcial') contadores[rev.resultado]++;
    if (aprobado) {
      contadores.exito_verificado++;
      if (rev.resultado === 'aclaracion') contadores.aclaracion_apropiada++;
      if (rev.resultado === 'abstencion') contadores.abstencion_apropiada++;
    }
  }
  return {
    version: '1' as const, ...contadores,
    tasa_exito_verificado: resultados.length ? contadores.exito_verificado / resultados.length : null,
    tasa_soporte: contadores.afirmaciones ? contadores.afirmaciones_soportadas / contadores.afirmaciones : null,
    casos_esperados: ids.length,
    casos_presentes: ids.filter((id) => observados.has(id)),
    casos_faltantes: ids.filter((id) => !observados.has(id)),
    casos_no_esperados: [...observados].filter((id) => !ids.includes(id)),
  };
}
