// ARCHIVO: __tests__/hatoGenealogia.test.ts
// DESCRIPCIÓN: Filtro de candidatas a madre del diálogo "Editar" de la ficha
// (`utils/hato/genealogiaHato.ts`), pedido del dueño 2026-08-11.
//
// El caso real que lo motiva está fijado abajo: al asignarle madre a #183
// (nacida 2024-04-17) había DOS animales llamados MOTA -- la vaca #62 y una
// ternera #211 nacida en 2026. Con la lista cruda, elegir la imposible es un
// clic; el filtro tiene que dejar solo la posible.

import { describe, it, expect } from 'vitest';
import {
  candidatasAMadre,
  etiquetaCandidatoGenealogia,
  type CandidatoGenealogia,
} from '@/utils/hato/genealogiaHato';

function animal(
  id: string,
  nombre: string | null,
  fecha_nacimiento: string | null,
  extra: Partial<CandidatoGenealogia> = {},
): CandidatoGenealogia {
  return { id, numero: null, nombre, etapa: 'vaca', fecha_nacimiento, ...extra };
}

const MOTA_VACA = animal('mota-62', 'MOTA', null, { numero: 62 });
const MOTA_TERNERA = animal('mota-211', 'MOTA', '2026-05-02', { numero: 211, etapa: 'ternera' });
const HIJA = { id: 'mora-183', fecha_nacimiento: '2024-04-17' };

describe('candidatasAMadre', () => {
  it('el caso real: descarta a la MOTA nacida después, deja la posible', () => {
    const candidatas = candidatasAMadre([MOTA_VACA, MOTA_TERNERA], HIJA);
    expect(candidatas.map((c) => c.id)).toEqual(['mota-62']);
  });

  it('nadie es su propia madre', () => {
    const yo = animal('mora-183', 'MORA', '2024-04-17');
    expect(candidatasAMadre([yo, MOTA_VACA], HIJA).map((c) => c.id)).toEqual(['mota-62']);
  });

  it('un toro nunca es candidato a madre', () => {
    const toro = animal('toro-1', 'NITRO', '2015-01-01', { etapa: 'toro' });
    expect(candidatasAMadre([toro, MOTA_VACA], HIJA).map((c) => c.id)).toEqual(['mota-62']);
  });

  it('nacida el MISMO día tampoco puede ser la madre', () => {
    const misma = animal('x', 'X', '2024-04-17');
    expect(candidatasAMadre([misma], HIJA)).toEqual([]);
  });

  it('sin fecha en cualquiera de los dos, la candidata SE MUESTRA -- "sin dato" no es "no cumple"', () => {
    const sinFecha = animal('sf', 'SIN FECHA', null);
    expect(candidatasAMadre([sinFecha], HIJA).map((c) => c.id)).toEqual(['sf']);
    // Y al revés: el animal editado sin fecha no puede descartar a nadie.
    const conFechaPosterior = animal('cf', 'POSTERIOR', '2030-01-01');
    const candidatas = candidatasAMadre([conFechaPosterior], { id: 'z', fecha_nacimiento: null });
    expect(candidatas.map((c) => c.id)).toEqual(['cf']);
  });

  it('NO filtra por estado -- la madre puede llevar años vendida', () => {
    // MOTA #62 está `vendida` en producción y es la madre correcta de #183.
    // El tipo ni siquiera expone `estado`: esconderla haría imposible
    // completar justo la genealogía vieja que falta.
    expect(candidatasAMadre([MOTA_VACA], HIJA)).toHaveLength(1);
  });

  it('ordena por nombre, con las que no tienen nombre al final', () => {
    const candidatas = candidatasAMadre(
      [animal('c', 'ZULEMA', '2020-01-01'), animal('a', 'ÁGUEDA', '2020-01-01'), animal('b', null, '2020-01-01')],
      HIJA,
    );
    expect(candidatas.map((c) => c.nombre)).toEqual(['ÁGUEDA', 'ZULEMA', null]);
  });
});

describe('etiquetaCandidatoGenealogia', () => {
  it('nombre primero y caravana como desempate entre homónimas', () => {
    expect(etiquetaCandidatoGenealogia(MOTA_VACA)).toBe('MOTA · #62');
    expect(etiquetaCandidatoGenealogia(MOTA_TERNERA)).toBe('MOTA · #211');
  });

  it('sin caravana lo dice, nunca imprime un 0 ni queda en blanco', () => {
    expect(etiquetaCandidatoGenealogia(animal('x', 'PACHA', null))).toBe('PACHA · sin caravana');
  });

  it('sin nombre no deja la etiqueta vacía', () => {
    expect(etiquetaCandidatoGenealogia(animal('x', null, null, { numero: 9 }))).toBe('Sin nombre · #9');
  });
});
