// ARCHIVO: utils/hato/subidasPesajeMes.ts
// DESCRIPCIÓN: liga una subida de planilla (`hato_capturas_foto`, tipo
// pesaje) con los litros que esa subida creó. Puro, sin I/O. Issue #297.
//
// No hay llave foránea. El commit escribe `hato_pesajes_leche` con
// `created_at` cerca de `hato_capturas_foto.creado_en` y `fuente` `foto`
// (web) o `telegram`. Una fila se liga a UNA subida si esa distancia es
// de a lo más 36 h (la misma ventana que el detalle semanal). Si dos
// subidas caen en la ventana, gana la más cercana; empate: desenlace `ok`,
// luego el mismo autor, luego el id.
//
// Una fila `fuente = 'web'` (grilla a mano) no se liga: esa vía no abre
// captura. Un UPDATE posterior no mueve `created_at`, así que la fila se
// queda con la subida que la insertó. Descartar la subida posterior borra
// su foto y solo las filas que ella insertó.

import { VENTANA_CAPTURA_MS } from '@/utils/hato/detallePesajeSemanal';

export const FUENTES_DE_SUBIDA = new Set(['foto', 'telegram']);
export const BUCKET_PESAJES = 'hato-pesajes-fotos';

export interface CapturaSubida {
  id: string;
  anio: number;
  mes: number;
  creadoEn: string;
  createdBy: string | null;
  origen: string;
  desenlace: string;
  storageBucket: string;
  storageRutas: string[];
  storageOk: boolean;
}

export interface FilaSubida {
  id: string;
  fecha: string;
  created_at: string;
  created_by: string | null;
  fuente: string | null;
}

export interface SubidaLigada {
  captura: CapturaSubida;
  filaIds: string[];
  desde: string | null;
  hasta: string | null;
}

export function mesesAlrededor(anio: number, mes: number): Array<{ anio: number; mes: number }> {
  const base = new Date(Date.UTC(anio, mes - 1, 1));
  return [-1, 0, 1].map((delta) => {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + delta, 1));
    return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 };
  });
}

/** Ventana de `created_at` que puede ligar alguna de estas subidas. */
export function ventanaCreatedAt(instantes: readonly string[]): { desde: string; hasta: string } | null {
  const marcas = instantes.map((s) => Date.parse(s)).filter((n) => !Number.isNaN(n));
  if (marcas.length === 0) return null;
  return {
    desde: new Date(Math.min(...marcas) - VENTANA_CAPTURA_MS).toISOString(),
    hasta: new Date(Math.max(...marcas) + VENTANA_CAPTURA_MS).toISOString(),
  };
}

function distanciaMs(a: string, b: string): number | null {
  const ma = Date.parse(a);
  const mb = Date.parse(b);
  if (Number.isNaN(ma) || Number.isNaN(mb)) return null;
  return Math.abs(ma - mb);
}

function preferible(
  fila: FilaSubida,
  candidata: CapturaSubida,
  distCandidata: number,
  actual: CapturaSubida,
  distActual: number,
): boolean {
  if (distCandidata !== distActual) return distCandidata < distActual;
  const okC = candidata.desenlace === 'ok' ? 0 : 1;
  const okA = actual.desenlace === 'ok' ? 0 : 1;
  if (okC !== okA) return okC < okA;
  const autorC = fila.created_by != null && candidata.createdBy === fila.created_by ? 0 : 1;
  const autorA = fila.created_by != null && actual.createdBy === fila.created_by ? 0 : 1;
  if (autorC !== autorA) return autorC < autorA;
  return candidata.id.localeCompare(actual.id) < 0;
}

function capturaDeFila(fila: FilaSubida, capturas: readonly CapturaSubida[]): CapturaSubida | null {
  if (fila.fuente == null || !FUENTES_DE_SUBIDA.has(fila.fuente)) return null;
  let mejor: CapturaSubida | null = null;
  let distMejor = 0;
  for (const captura of capturas) {
    const dist = distanciaMs(fila.created_at, captura.creadoEn);
    if (dist == null || dist > VENTANA_CAPTURA_MS) continue;
    if (mejor == null || preferible(fila, captura, dist, mejor, distMejor)) {
      mejor = captura;
      distMejor = dist;
    }
  }
  return mejor;
}

/** Cada fila queda en una sola subida. Las subidas sin litros también
 * salen, para que un OCR fallido se pueda descartar. */
export function ligarFilasASubidas(
  capturas: readonly CapturaSubida[],
  filas: readonly FilaSubida[],
): SubidaLigada[] {
  const porCaptura = new Map<string, FilaSubida[]>();
  for (const captura of capturas) porCaptura.set(captura.id, []);
  for (const fila of filas) {
    const captura = capturaDeFila(fila, capturas);
    if (!captura) continue;
    porCaptura.get(captura.id)?.push(fila);
  }
  return [...capturas]
    .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : a.id.localeCompare(b.id)))
    .map((captura) => {
      const propias = (porCaptura.get(captura.id) ?? []).slice().sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
      return {
        captura,
        filaIds: propias.map((fila) => fila.id),
        desde: propias[0]?.fecha ?? null,
        hasta: propias[propias.length - 1]?.fecha ?? null,
      };
    });
}

export function subidasDelMes(
  ligadas: readonly SubidaLigada[],
  anio: number,
  mes: number,
): SubidaLigada[] {
  return ligadas.filter((subida) => subida.captura.anio === anio && subida.captura.mes === mes);
}

export function textoDescartarSubida(nFilas: number, desde: string | null, hasta: string | null): string {
  const cola = ' Las otras subidas del mes quedan. Fernando puede volver a cargar la planilla por Telegram. Esta acción no se puede deshacer.';
  if (nFilas <= 0) {
    return `Se borra la foto de esta subida. No hay litros ligados a ella.${cola}`;
  }
  const unidad = nFilas === 1 ? 'pesaje' : 'pesajes';
  const rango = desde && hasta && desde !== hasta ? ` (${desde} a ${hasta})` : desde ? ` (${desde})` : '';
  return `Se borra esta subida y ${nFilas} ${unidad}${rango}.${cola}`;
}
