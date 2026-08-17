/**
 * ARCHIVO: __tests__/accionesAntiInvento.test.ts
 * DESCRIPCIÓN: El test que convierte R-2 de promesa en aserción (§4.5 del
 * brief, bloques 1 y 2).
 *
 * BLOQUE 1 -- el test de PROPIEDAD. No enumera frases malas: enuncia una
 * propiedad que toda frase publicable tiene que cumplir, sea cual sea. Se
 * borran de la frase renderizada los tramos que `renderizarAccion` declaró
 * como sustituidos, y lo que queda -- que es, por construcción, exactamente
 * el texto que escribió el modelo -- no puede contener un dígito, ni un
 * numeral en letra, ni un mes o día en letra.
 *
 * Por qué esto es más fuerte que un corpus: un corpus prueba los casos que a
 * alguien se le ocurrieron. La propiedad se cumple o no para cualquier salida
 * futura del modelo, incluidas las que nadie imaginó. Es la diferencia entre
 * "no hemos visto que invente" y "no puede inventar sin que esto falle".
 *
 * BLOQUE 2 -- el corpus adversario. Salidas hostiles concretas que el
 * validador tiene que rechazar ANTES de llegar al renderizador, cada una con
 * el código de rechazo que le corresponde. Incluye los dos agujeros que el
 * brief documenta y que se olvidan si no se buscan: bloquear dígitos no
 * bloquea "las once vacas", y tampoco bloquea "la ejecución presupuestal de
 * julio".
 */

import { describe, it, expect } from 'vitest';
import {
  validarSalidaMotor,
  contieneNumeralEnLetra,
  contieneFechaEnLetra,
  type CodigoRechazo,
} from '@/utils/accionesValidador';
import { renderizarAccion } from '@/utils/accionesRender';
import {
  accionGenerada,
  hecho,
  paqueteConHechos,
  salidaMotor,
  valor,
} from './fixtures/acciones.fixture';

// ============================================================================
// Hechos tomados de producción el 2026-08-16/17 -- los mismos que sostienen el
// set de referencia del dueño. Usar datos reales importa: los casos feos de
// esta finca (denominadores parciales, faltantes de insumo, tareas de 200
// días) son justo donde un motor mal hecho inventa.
// ============================================================================

const hInsumo = hecho({
  id: 'agu.insumo_faltante',
  negocio: 'aguacate',
  destinos: ['agu.aplicacion_detalle'],
  texto: 'La aplicación necesita 12.694 kg y en inventario hay 8.000',
  fecha_limite: '2026-08-18',
  valores: {
    faltante: valor('4.694', 4694, 'kg'),
    necesario: valor('12.694', 12694, 'kg'),
    disponible: valor('8.000', 8000, 'kg'),
    producto: valor('Silicalmag'),
  },
});

const hVacias = hecho({
  id: 'hato.vacias_largas',
  negocio: 'hato_lechero',
  destinos: ['hato.lista_vacias'],
  texto: '11 vacas sin preñez confirmada · la más rezagada, 142 días',
  dias_esperando: 142,
  tamano_conjunto: 11,
  valores: { n: valor('11', 11), dias: valor('142', 142) },
});

const hTarea = hecho({
  id: 'agu.tarea_atascada',
  negocio: 'aguacate',
  destinos: ['agu.tarea_detalle'],
  texto: 'En Proceso desde el 5 de febrero · 200 días pasada de su fecha estimada de inicio',
  dias_esperando: 200,
  valores: { dias: valor('200', 200) },
});

const hPesaje = hecho({
  id: 'hato.pesaje_incompleto',
  negocio: 'hato_lechero',
  destinos: ['hato.pesaje'],
  categoria: 'captura',
  texto: '7 de 34 vacas en ordeño sin pesar · hace 4 días',
  tamano_conjunto: 7,
  valores: { faltan: valor('7', 7), total: valor('34', 34) },
});

const PAQUETE = paqueteConHechos([hInsumo, hVacias, hTarea, hPesaje]);

/** Borra de `frase` los rangos declarados como sustituidos. Lo que sobra es,
 *  literalmente, lo que el modelo escribió de su puño. */
function textoDelModelo(frase: string, tramos: Array<[number, number]>): string {
  let resto = '';
  let cursor = 0;
  for (const [inicio, fin] of [...tramos].sort((a, b) => a[0] - b[0])) {
    resto += frase.slice(cursor, inicio);
    cursor = fin;
  }
  return resto + frase.slice(cursor);
}

const TIENE_DIGITO = /\d/;

describe('R-2 · bloque 1 — el test de propiedad', () => {
  const casosLegitimos: Array<{ nombre: string; accion: ReturnType<typeof accionGenerada> }> = [
    {
      nombre: 'faltante de insumo con tres cifras en la frase',
      accion: accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'agu.aplicacion_detalle',
        plantilla: 'Conseguir los {faltante} kg de {producto} que faltan.',
        ranuras: {
          faltante: { hecho_id: 'agu.insumo_faltante', campo: 'faltante' },
          producto: { hecho_id: 'agu.insumo_faltante', campo: 'producto' },
        },
      }),
    },
    {
      nombre: 'vacías largas',
      accion: accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.vacias_largas'],
        destino_id: 'hato.lista_vacias',
        plantilla: 'Revisar las {n} vacas vacías largas.',
        ranuras: { n: { hecho_id: 'hato.vacias_largas', campo: 'n' } },
      }),
    },
    {
      nombre: 'pesaje incompleto, con denominador',
      accion: accionGenerada({
        negocio: 'hato_lechero',
        hecho_ids: ['hato.pesaje_incompleto'],
        destino_id: 'hato.pesaje',
        plantilla: 'Completar el pesaje: faltan {faltan} de {total} vacas.',
        ranuras: {
          faltan: { hecho_id: 'hato.pesaje_incompleto', campo: 'faltan' },
          total: { hecho_id: 'hato.pesaje_incompleto', campo: 'total' },
        },
      }),
    },
    {
      nombre: 'tarea atascada',
      accion: accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.tarea_atascada'],
        destino_id: 'agu.tarea_detalle',
        plantilla: 'Desbloquear la tarea de microbiología, parada hace {dias} días.',
        ranuras: { dias: { hecho_id: 'agu.tarea_atascada', campo: 'dias' } },
      }),
    },
  ];

  for (const { nombre, accion } of casosLegitimos) {
    it(`lo que escribe el modelo no lleva cifra — ${nombre}`, () => {
      const { aceptadas, rechazos } = validarSalidaMotor(salidaMotor([accion]), PAQUETE);
      expect(rechazos).toEqual([]);
      expect(aceptadas).toHaveLength(1);

      const render = renderizarAccion(aceptadas[0], PAQUETE);
      const delModelo = textoDelModelo(render.frase, render.tramos_sustituidos);

      expect(TIENE_DIGITO.test(delModelo)).toBe(false);
      expect(contieneNumeralEnLetra(delModelo)).toBe(false);
      expect(contieneFechaEnLetra(delModelo)).toBe(false);
    });
  }

  it('la propiedad detecta una ranura sin resolver en vez de esconderla', () => {
    // `renderizarAccion` deja el token `{crudo}` visible y NO lo marca como
    // sustituido. Si algún día una acción llegara con una ranura huérfana
    // pese al validador, el residuo del modelo la delata.
    const render = renderizarAccion(
      {
        negocio: 'aguacate',
        clave: 'aguacate.prueba',
        origen: 'O1_senal',
        visibilidad: 'todos',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'agu.aplicacion_detalle',
        plantilla: 'Conseguir los {inexistente} kg.',
        ranuras: {},
      },
      PAQUETE,
    );
    expect(render.tramos_sustituidos).toEqual([]);
    expect(render.frase).toContain('{inexistente}');
  });

  it('la evidencia sale del data layer, nunca del modelo', () => {
    const { aceptadas } = validarSalidaMotor(salidaMotor([casosLegitimos[0].accion]), PAQUETE);
    const render = renderizarAccion(aceptadas[0], PAQUETE);
    // Coincide EXACTAMENTE con hecho.texto: el modelo no la toca ni la reescribe.
    expect(render.evidencia).toEqual([hInsumo.texto]);
  });
});

describe('R-2 · bloque 2 — corpus adversario', () => {
  const hostiles: Array<{ nombre: string; plantilla: string; codigo: CodigoRechazo }> = [
    {
      nombre: 'cifra escrita a mano en vez de ranura',
      plantilla: 'Conseguir los 4.694 kg que faltan.',
      codigo: 'CIFRA_LIBRE',
    },
    {
      nombre: 'cifra inventada que ni siquiera está en el hecho',
      plantilla: 'Conseguir los 9.999 kg que faltan.',
      codigo: 'CIFRA_LIBRE',
    },
    {
      nombre: 'porcentaje libre',
      plantilla: 'El faltante es del 37 % del requerimiento.',
      codigo: 'CIFRA_LIBRE',
    },
    {
      nombre: 'valor en pesos libre',
      plantilla: 'Conseguir el insumo, son $121.500.',
      codigo: 'CIFRA_LIBRE',
    },
    {
      nombre: 'numeral en letra — el agujero que los dígitos no tapan',
      plantilla: 'Revisar las once vacas vacías largas.',
      codigo: 'NUMERAL_EN_LETRA',
    },
    {
      nombre: 'numeral compuesto en una sola palabra',
      plantilla: 'Revisar las veintidós vacas del lote.',
      codigo: 'NUMERAL_EN_LETRA',
    },
    {
      nombre: 'numeral de la decena 16-19',
      plantilla: 'Revisar las dieciséis vacas por revisar.',
      codigo: 'NUMERAL_EN_LETRA',
    },
    {
      nombre: 'cuantificador que finge cifra',
      plantilla: 'Revisar la mitad de las vacas del hato.',
      codigo: 'NUMERAL_EN_LETRA',
    },
    {
      nombre: 'mes en letra — el agujero que O-8 destapó',
      plantilla: 'Revisar la ejecución presupuestal de julio.',
      codigo: 'FECHA_EN_LETRA',
    },
    {
      nombre: 'día de la semana en letra',
      plantilla: 'Programar la fumigación para el jueves.',
      codigo: 'FECHA_EN_LETRA',
    },
  ];

  for (const { nombre, plantilla, codigo } of hostiles) {
    it(`rechaza con ${codigo} — ${nombre}`, () => {
      const accion = accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'agu.aplicacion_detalle',
        plantilla,
        ranuras: {},
      });
      const { aceptadas, rechazos } = validarSalidaMotor(salidaMotor([accion]), PAQUETE);
      expect(aceptadas).toEqual([]);
      expect(rechazos.map((r) => r.codigo)).toContain(codigo);
    });
  }

  it('ninguna salida hostil llega jamás al renderizador', () => {
    const todas = hostiles.map(({ plantilla }) =>
      accionGenerada({
        negocio: 'aguacate',
        hecho_ids: ['agu.insumo_faltante'],
        destino_id: 'agu.aplicacion_detalle',
        plantilla,
        ranuras: {},
      }),
    );
    const { aceptadas } = validarSalidaMotor(salidaMotor(todas), PAQUETE);
    expect(aceptadas).toEqual([]);
  });

  it('"un/una" se permiten a propósito: son artículo antes que numeral', () => {
    // Límite conocido y documentado en `NUMERALES_ES`, no un descuido.
    expect(contieneNumeralEnLetra('Registrar una quincena de leche')).toBe(false);
  });
});
