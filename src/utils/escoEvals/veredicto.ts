// Combina las dos capas en el veredicto de una corrida.
//
//   falla      — un chequeo determinista duro falló, o el juez reprobó
//   inconcluso — error de infraestructura, o el juez falló sin que la capa 1 haya reprobado
//   pasa       — la capa 1 aprueba y el juez aprueba (o no se configuró juez)
//
// Una falla determinista es concluyente aunque el juez no responda.

import { criteriosDelCaso, razonesDelJuez } from './juez';
import type {
  CasoDorado,
  CorridaEjecutada,
  EstadoCaso,
  ResultadoCaso,
  ResultadoDeterminista,
  ResultadoJuez,
} from './tipos';

export interface EntradaVeredicto {
  caso: CasoDorado;
  corrida: CorridaEjecutada;
  repeticion: number;
  variante: string;
  determinista: ResultadoDeterminista | null;
  juez: ResultadoJuez | null;
  juezEstado: 'ok' | 'omitido' | 'error';
}

export function combinarVeredicto(e: EntradaVeredicto): ResultadoCaso {
  const razones: string[] = [];
  let estado: EstadoCaso;

  if (e.corrida.error) {
    estado = 'inconcluso';
    razones.push(`error de infraestructura: ${e.corrida.error}`);
  } else {
    const fallasDuras = (e.determinista?.chequeos ?? []).filter((c) => c.duro && c.ok === false);
    for (const c of fallasDuras) razones.push(`${c.id}: ${c.detalle}`);

    if (fallasDuras.length > 0) {
      estado = 'falla';
      // Si el juez corrió, también se anotan sus razones: ayudan a diagnosticar.
      if (e.juez) razones.push(...razonesDelJuez(e.juez, criteriosDelCaso(e.caso)));
    } else if (e.juezEstado === 'error') {
      estado = 'inconcluso';
      razones.push('el juez no devolvió un veredicto válido');
    } else if (e.juez) {
      const deJuez = razonesDelJuez(e.juez, criteriosDelCaso(e.caso));
      razones.push(...deJuez);
      estado = deJuez.length === 0 ? 'pasa' : 'falla';
    } else {
      estado = 'pasa';
    }
  }

  return {
    caso_id: e.caso.id,
    clave: e.caso.key,
    dominio: e.caso.domain,
    tipo: e.caso.kind,
    etiquetas: e.caso.tags,
    repeticion: e.repeticion,
    variante: e.variante,
    estado,
    razones,
    determinista: e.determinista,
    juez: e.juez,
    juez_estado: e.juezEstado,
    corrida: e.corrida,
    veredicto_humano_original: e.caso.human_review.verdict,
  };
}
