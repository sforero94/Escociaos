// ARCHIVO: utils/hato/capturasFoto.ts
// DESCRIPCIÓN: lógica PURA del registro de cargas por foto del hato
// (`hato_capturas_foto`, migración 146 -- hallazgo ESCO-76).
//
// Traduce una fila del registro a la línea que lee Martha en la tarjeta de
// Pesaje. La regla dura del módulo aplica igual acá: **ausencia de dato se
// dice "sin dato", nunca 0**, y un 0 MEDIDO sí se muestra como 0 porque es
// un hecho ("el OCR no leyó ninguna celda" es información, no un hueco).
// Por eso los tres conteos son `number | null` y cada rama distingue las
// dos cosas.
//
// Sin I/O y sin `Intl`: la fecha entra ya formateada por el llamador
// (`formatShortDate`), para que esta función se pueda probar sin fijar una
// zona horaria ni un locale.

export type TipoCapturaFoto = 'pesaje' | 'chequeo';
export type DesenlaceCapturaFoto = 'pendiente' | 'ok' | 'ocr_fallo' | 'abandonado' | 'error';

export interface CapturaFotoResumen {
  id: string;
  tipo: TipoCapturaFoto;
  desenlace: DesenlaceCapturaFoto;
  creadoEn: string;
  /** Celdas (pesaje) o filas (chequeo) que el OCR alcanzó a leer. */
  celdasLeidasOcr: number | null;
  /** Lo que el humano aprobó en la ventana de revisión. */
  celdasConfirmadas: number | null;
  /** Lo que de verdad entró a la tabla de dominio. */
  filasEscritas: number | null;
  fotosRecibidas: number | null;
  storageOk: boolean | null;
  detalle: string | null;
}

export interface DescripcionCaptura {
  /** Línea lista para pintar. */
  texto: string;
  /** `alerta` cuando la carga NO terminó en datos guardados -- la tarjeta
   * la pinta en ámbar. Nunca se oculta un desenlace malo. */
  tono: 'neutro' | 'alerta';
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

/**
 * Describe la ÚLTIMA carga por foto para la línea de estado de la tarjeta.
 *
 * @param captura   fila más reciente de `hato_capturas_foto`, o `null` si no
 *                  hay ninguna (o si la consulta todavía no respondió).
 * @param fechaTexto fecha de la carga ya formateada por el llamador.
 */
export function describirUltimaCaptura(
  captura: CapturaFotoResumen | null,
  fechaTexto: string,
): DescripcionCaptura {
  if (!captura) {
    // Nunca "0 capturas": no saber y no haber son cosas distintas, y esta
    // rama cubre las dos.
    return { texto: 'Última captura: sin dato', tono: 'neutro' };
  }

  const prefijo = `Última captura: ${fechaTexto}`;
  const unidad = captura.tipo === 'pesaje' ? ['celda', 'celdas'] : ['fila', 'filas'];
  const guardadas = captura.tipo === 'pesaje' ? ['pesaje guardado', 'pesajes guardados'] : ['fila guardada', 'filas guardadas'];

  switch (captura.desenlace) {
    case 'ok': {
      if (captura.filasEscritas === null) {
        return { texto: `${prefijo}, guardada`, tono: 'neutro' };
      }
      if (captura.filasEscritas === 0) {
        // Cero MEDIDO: aprobó y no entró nada. Es un hecho, y es un problema.
        return { texto: `${prefijo}, no guardó ${unidad[1]}`, tono: 'alerta' };
      }
      return {
        texto: `${prefijo}, ${plural(captura.filasEscritas, guardadas[0], guardadas[1])}`,
        tono: 'neutro',
      };
    }
    case 'ocr_fallo':
      return { texto: `${prefijo}, el OCR no leyó ninguna ${unidad[0]}`, tono: 'alerta' };
    case 'pendiente': {
      if (captura.celdasLeidasOcr === 0) {
        return { texto: `${prefijo}, el OCR no leyó ninguna ${unidad[0]}`, tono: 'alerta' };
      }
      if (captura.celdasLeidasOcr === null) {
        return { texto: `${prefijo}, quedó sin terminar`, tono: 'alerta' };
      }
      return {
        texto: `${prefijo}, ${plural(captura.celdasLeidasOcr, unidad[0], unidad[1])} leídas sin aprobar`,
        tono: 'alerta',
      };
    }
    case 'abandonado':
      return { texto: `${prefijo}, se abandonó sin guardar`, tono: 'alerta' };
    case 'error':
      return { texto: `${prefijo}, falló al guardar`, tono: 'alerta' };
    default:
      return { texto: prefijo, tono: 'neutro' };
  }
}

/** Forma cruda de la fila tal como vuelve de PostgREST. */
export interface FilaCapturaFotoDb {
  id: string;
  tipo: string;
  desenlace: string;
  creado_en: string;
  celdas_leidas_ocr: number | null;
  celdas_confirmadas: number | null;
  filas_escritas: number | null;
  fotos_recibidas: number | null;
  storage_ok: boolean | null;
  detalle: string | null;
}

const TIPOS: TipoCapturaFoto[] = ['pesaje', 'chequeo'];
const DESENLACES: DesenlaceCapturaFoto[] = ['pendiente', 'ok', 'ocr_fallo', 'abandonado', 'error'];

/**
 * Normaliza una fila de la tabla. Devuelve `null` ante una fila que no
 * cumple el contrato (un `tipo`/`desenlace` fuera del CHECK, por ejemplo,
 * que solo puede venir de un esquema más nuevo que este código) -- mostrar
 * "sin dato" es correcto ahí; inventar una interpretación no.
 */
export function normalizarCapturaFoto(fila: FilaCapturaFotoDb | null | undefined): CapturaFotoResumen | null {
  if (!fila || typeof fila.id !== 'string' || typeof fila.creado_en !== 'string') return null;
  const tipo = TIPOS.find((t) => t === fila.tipo);
  const desenlace = DESENLACES.find((d) => d === fila.desenlace);
  if (!tipo || !desenlace) return null;
  return {
    id: fila.id,
    tipo,
    desenlace,
    creadoEn: fila.creado_en,
    celdasLeidasOcr: fila.celdas_leidas_ocr ?? null,
    celdasConfirmadas: fila.celdas_confirmadas ?? null,
    filasEscritas: fila.filas_escritas ?? null,
    fotosRecibidas: fila.fotos_recibidas ?? null,
    storageOk: fila.storage_ok ?? null,
    detalle: fila.detalle ?? null,
  };
}
