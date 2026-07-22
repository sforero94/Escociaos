import { describe, it, expect } from 'vitest';
import {
  verificarNumerosCriaTienenAnimal,
  verificarConteoPartos,
  contarPoblacionActiva,
  verificarNumeroUnicoEntreActivas,
  verificarFechasServicioNoFuturas,
  verificarCargaHato,
  type AnimalCargado,
  type EventoCargado,
  type ChequeoVacaCargada,
} from '@/utils/importHato/verificar';

function animal(datos: Partial<AnimalCargado> & { id: string }): AnimalCargado {
  return { numero: null, nombre: null, estado: 'activa', etapa: 'vaca', ...datos };
}

describe('verificar.ts -- invariantes post-carga (S3)', () => {
  describe('verificarNumerosCriaTienenAnimal', () => {
    it('reporta un A{n} cuyo numero nunca se cargó', () => {
      const faltantes = verificarNumerosCriaTienenAnimal(
        [{ numero: 166, origen: "sx_raw='A166' en r5" }],
        new Set([201]),
      );
      expect(faltantes).toEqual([{ numeroCria: 166, origen: "sx_raw='A166' en r5" }]);
    });

    it('no reporta nada cuando el numero sí se cargó', () => {
      const faltantes = verificarNumerosCriaTienenAnimal([{ numero: 166, origen: 'x' }], new Set([166]));
      expect(faltantes).toEqual([]);
    });
  });

  describe('verificarConteoPartos', () => {
    it('reporta una discrepancia mayor a la tolerancia', () => {
      const eventos: EventoCargado[] = [{ animal_id: 'a1', tipo: 'parto', fecha: '2020-01-01' }];
      const declarados = new Map([['a1', 5]]);
      const animales = new Map([['a1', animal({ id: 'a1', numero: 43 })]]);
      const discrepancias = verificarConteoPartos(eventos, declarados, animales, 1);
      expect(discrepancias).toHaveLength(1);
      expect(discrepancias[0]).toMatchObject({ animalId: 'a1', numero: 43, partosDeclaradosMaximo: 5, partosCargados: 1, diferencia: 4 });
    });

    it('NO reporta nada cuando la diferencia está dentro de la tolerancia', () => {
      const eventos: EventoCargado[] = [
        { animal_id: 'a1', tipo: 'parto', fecha: '2020-01-01' },
        { animal_id: 'a1', tipo: 'parto', fecha: '2021-01-01' },
      ];
      const declarados = new Map([['a1', 3]]);
      const animales = new Map([['a1', animal({ id: 'a1' })]]);
      expect(verificarConteoPartos(eventos, declarados, animales, 1)).toEqual([]);
    });

    it('ignora eventos que no son parto', () => {
      const eventos: EventoCargado[] = [{ animal_id: 'a1', tipo: 'aborto', fecha: '2020-01-01' }];
      const declarados = new Map([['a1', 1]]);
      const animales = new Map([['a1', animal({ id: 'a1' })]]);
      const discrepancias = verificarConteoPartos(eventos, declarados, animales, 0);
      expect(discrepancias[0].partosCargados).toBe(0);
    });
  });

  describe('contarPoblacionActiva -- NUNCA compara contra un umbral fijo', () => {
    it('reporta los dos cortes por separado (en el último chequeo vs. fuera de él)', () => {
      const animales: AnimalCargado[] = [
        animal({ id: 'a1', numero: 1, estado: 'activa' }),
        animal({ id: 'a2', numero: 2, estado: 'activa' }),
        animal({ id: 'a3', numero: 3, estado: 'activa', etapa: 'ternera' }),
        animal({ id: 'a4', numero: 4, estado: 'vendida' }), // no cuenta, no está activa
      ];
      const resultado = contarPoblacionActiva(animales, new Set([1, 2]));
      expect(resultado).toEqual({ activosTotal: 3, activosEnUltimoChequeo: 2, activosFueraDelUltimoChequeo: 1 });
    });

    it('no tiene ningún parámetro de "valor esperado" -- la firma solo acepta datos', () => {
      // Este test documenta el contrato: contarPoblacionActiva.length es la
      // cantidad de parámetros de la función. Si algún día se le agrega un
      // umbral mágico, este test lo hace explícito en el diff de revisión.
      expect(contarPoblacionActiva.length).toBe(2);
    });
  });

  describe('verificarNumeroUnicoEntreActivas', () => {
    it('detecta dos animales ACTIVOS compartiendo numero -- bug de Load, no una decisión pendiente', () => {
      const animales: AnimalCargado[] = [
        animal({ id: 'a1', numero: 162, estado: 'activa' }),
        animal({ id: 'a2', numero: 162, estado: 'activa' }),
      ];
      const colisiones = verificarNumeroUnicoEntreActivas(animales);
      expect(colisiones).toEqual([{ numero: 162, animalIds: ['a1', 'a2'] }]);
    });

    it('no marca colisión si uno de los dos está vendido/muerto (ya no está activo)', () => {
      const animales: AnimalCargado[] = [
        animal({ id: 'a1', numero: 162, estado: 'activa' }),
        animal({ id: 'a2', numero: 162, estado: 'vendida' }),
      ];
      expect(verificarNumeroUnicoEntreActivas(animales)).toEqual([]);
    });

    it('ignora animales sin numero (numero null)', () => {
      const animales: AnimalCargado[] = [animal({ id: 'a1', numero: null, estado: 'activa' })];
      expect(verificarNumeroUnicoEntreActivas(animales)).toEqual([]);
    });
  });

  describe('verificarFechasServicioNoFuturas', () => {
    it('detecta una fecha_servicio posterior al chequeo que la registra (generalización del caso COQUETA)', () => {
      const filas: ChequeoVacaCargada[] = [{ animal_id: 'a1', chequeo_fecha: '2020-06-09', fecha_servicio: '2021-05-03' }];
      const hallazgos = verificarFechasServicioNoFuturas(filas);
      expect(hallazgos).toEqual([{ animalId: 'a1', chequeoFecha: '2020-06-09', fechaServicio: '2021-05-03' }]);
    });

    it('no reporta nada cuando la fecha de servicio es anterior o igual al chequeo', () => {
      const filas: ChequeoVacaCargada[] = [
        { animal_id: 'a1', chequeo_fecha: '2020-06-09', fecha_servicio: '2020-05-30' },
        { animal_id: 'a2', chequeo_fecha: '2020-06-09', fecha_servicio: '2020-06-09' },
        { animal_id: 'a3', chequeo_fecha: '2020-06-09', fecha_servicio: null },
      ];
      expect(verificarFechasServicioNoFuturas(filas)).toEqual([]);
    });
  });

  describe('verificarCargaHato -- orquestador', () => {
    it('ok=false cuando hay una colisión post-carga (invariante duro)', () => {
      const resultado = verificarCargaHato({
        animales: [animal({ id: 'a1', numero: 162, estado: 'activa' }), animal({ id: 'a2', numero: 162, estado: 'activa' })],
        eventos: [],
        numerosCriaEsperados: [],
        partosDeclaradosPorAnimal: new Map(),
        numerosEnUltimoChequeo: new Set(),
        chequeoVacas: [],
      });
      expect(resultado.ok).toBe(false);
      expect(resultado.colisionesNumeroPostCarga).toHaveLength(1);
    });

    it('ok=true y discrepanciasPartos NO afecta ok (es informativo)', () => {
      const resultado = verificarCargaHato({
        animales: [animal({ id: 'a1', numero: 1, estado: 'activa' })],
        eventos: [],
        numerosCriaEsperados: [],
        partosDeclaradosPorAnimal: new Map([['a1', 9]]), // gran discrepancia declarada
        numerosEnUltimoChequeo: new Set([1]),
        chequeoVacas: [],
      });
      expect(resultado.ok).toBe(true);
      expect(resultado.discrepanciasPartos.length).toBeGreaterThan(0);
      expect(resultado.poblacion.activosTotal).toBe(1);
    });
  });
});
