import { describe, expect, it } from 'vitest';
import { parseSX, descomponerSX } from '@/utils/calculosHato';
import { etiquetaSexoCria } from '@/utils/hato/exportarPlanillaChequeoPDF';
import { construirDiffChequeo, type UltimoChequeoVacaActual } from '@/utils/importHato/diffChequeo';
import type { FilaChequeoNormalizada } from '@/utils/importHato/tipos';

function fila(sxRaw: string, ultimaCria = '01/08/2026'): FilaChequeoNormalizada {
  return { archivo:'foto', hoja:'HATO', fila:4, generacionEncabezado:3, numero:1, nombre:'PRUEBA',
    chequeoFecha:'2026-09-08', chequeoFechaConfianza:'exacta',
    raw:{pl:null,np:null,ultimaCria,sx:sxRaw,fechaServicio:null,toro:null,estadoRegistrado:null,tp:null,estado:null,secar:null,pp:null,ttto:null},
    pl:null,numPartos:null,fechasServicio:[],sx:parseSX(sxRaw),estado:null,fechaSecar:null,fechaProbableParto:null,toroNombre:null,tipoServicio:null,estadoRegistrado:null,issues:parseSX(sxRaw).issues };
}
function diff(sxRaw: string, previo: string, ultimaCria = '01/08/2026') {
  const ultimo: UltimoChequeoVacaActual = {animalId:'animal',chequeoFecha:'2026-07-09',pl:null,numPartos:null,fechaServicio:null,toro:null,tipoServicio:null,fechaSecar:null,fechaProbableParto:null,estado:null,sxRaw:previo,ultimaCriaRaw:'01/08/2026'};
  return construirDiffChequeo([fila(sxRaw,ultimaCria)],[{id:'animal',numero:1,nombre:'PRUEBA',etapa:'vaca',estado:'activa'}],[ultimo]).filas[0];
}

describe('sexo cría impreso -> recaptura', () => {
  it.each([
    ['A206','hembra','retenida','Hembra'],
    ['AV','hembra','hembra_vendida','Hembra'],
    ['OV','macho','macho_vendido','Macho'],
    ['gem+',null,null,'Gemelar'],
  ] as const)('PDF %s se reconoce sin avisos al coincidir con la misma cría', (raw,sexo,destino,esperado) => {
    const impreso = etiquetaSexoCria({sexoCriaRaw:raw,sexoCria:sexo,criaDestino:destino});
    expect(impreso).toBe(esperado);
    expect(parseSX(impreso).issues).toEqual([]);
    expect(diff(impreso!,raw).issues).toEqual([]);
    expect(fila(impreso!).raw.sx).toBe(esperado);
  });
  it.each([['Macho','A206'],['Hembra','OV'],['Gemelar','AV'],['Hembra','gem+']])('advierte si %s contradice %s para la misma cría', (label,previo) => {
    expect(diff(label,previo).issues).toEqual([expect.objectContaining({motivo:expect.stringContaining('contradice')})]);
  });
  it('no compara los sexos de dos partos diferentes', () => {
    expect(diff('Macho','A206','01/09/2026').issues).toEqual([]);
  });
  it.each(['Hembra','Macho','Gemelar'])('la etiqueta %s no inventa un parto, destino o chapeta', label => {
    const result = descomponerSX({sx:parseSX(label),fechasServicio:['2026-09-01'],chequeoFecha:'2026-09-08'});
    expect(result.eventos.map(e=>e.tipo)).toEqual(['servicio']);
    expect(result.issues).toEqual([]);
  });
  it('lo desconocido continúa requiriendo revisión; el crudo se conserva', () => {
    expect(parseSX('hembrax').tipo).toBe('desconocido');
    expect(parseSX('hembrax').issues).not.toHaveLength(0);
    expect(parseSX('A206').crudo).toBe('A206');
    expect(parseSX('A206').numeroCria).toBe(206);
  });
});
