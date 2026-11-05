import { esResultadoAplicaciones, esResultadoCantidades, type ResultadoConsulta, type ResultadoParte } from '../utils/esco2/tipos';

/** Labor-only fixtures must still return labor results after the application union is added. */
export function resultadosLabores(turno: { resultados: ResultadoConsulta[] }): ResultadoParte[] {
  return turno.resultados.map(resultado => {
    if (esResultadoAplicaciones(resultado) || esResultadoCantidades(resultado)) throw new Error('La fixture laboral recibió un resultado de aplicaciones');
    return resultado;
  });
}
