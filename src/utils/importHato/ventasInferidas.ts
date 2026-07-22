// ARCHIVO: utils/importHato/ventasInferidas.ts
// DESCRIPCIÓN: Ventas de animales inferidas de una fila-comentario de una
// hoja de chequeo (D8, decisión de Santiago 2026-07-22, resolution-report.md
// §8) -- el pipeline NUNCA infiere una venta por su cuenta; esto es una
// decisión humana explícita, con la misma procedencia y el mismo régimen
// "nunca se descarta en silencio" que `overridesChapeta.ts`. Aplicado por
// `resolver.ts` (`aplicarVentasInferidas`), reportado en
// `resolution-report.md` §11 (resumen automático), nunca como pregunta
// abierta -- la decisión ya se tomó.
//
// Evidencia: `CHEO VETE 2026.xlsx :: CHEQUEO JULIO 2026, fila 46` -- una fila
// SIN número de chapeta cuyo `nombre` crudo es el comentario completo
// 'chispa. Dacota, indir  vendida' (capturado tal cual en `filasSinNumero`,
// nunca se pierde). Instrucción de Santiago: "Asignar un número cualquiera
// entre 800 y 900 y marcar como vendidas. Igual comentario para todas."
//
// DESVIACIÓN documentada respecto a la instrucción literal (asignar un
// número 800-899 a las TRES): DACOTA e INDIRA ya resuelven, en esta misma
// corrida, a un animal EXISTENTE del registro (#129 y el override 983 de la
// colisión #176 respectivamente -- ver `overridesChapeta.ts`). Mintear un
// número 800-899 nuevo para ellas crearía una SEGUNDA fila para la misma
// vaca -- exactamente lo que el contrato de este pipeline prohíbe ("nunca
// fusionar, nunca duplicar en silencio"). Se les marca `vendida` sobre su
// número YA EXISTENTE en vez de darles uno nuevo. Solo CHISPA -- genuinamente
// ambigua entre #38/#168 (histórico) y varias filas-solo-nombre sin chapeta
// propia (ver `filasSinNumero`) -- recibe un número de trabajo nuevo, para no
// fusionarla en silencio con ninguno de esos dos animales. Reportado
// explícitamente al dueño en el informe de la sesión que introdujo este
// archivo -- no es una decisión unilateral silenciosa del pipeline.
//
// Los otros comentarios de venta de la misma sección del reporte (Vitina/
// nodriza; champeta/fiesta/oma/victorina; juiciosa/tania; pirinola;
// CORNELIA/COQUETA) NO fueron resueltos por el dueño en esta sesión -- se
// dejan tal cual (la regla D5 de "más de un año sin aparecer" los alcanza
// automáticamente si en efecto se vendieron).

export interface VentaInferida {
  /** Nombre tal como se busca en el registro de animales, en mayúsculas. */
  nombre: string;
  /** Número de trabajo NUEVO a asignar (rango 800-899, ver
   * `overridesChapeta.ts`) -- `null` cuando el nombre ya resuelve a un
   * animal existente del registro (la venta se aplica sobre ESE número, no
   * sobre uno nuevo; ver la nota de "DESVIACIÓN" arriba). */
  numeroAsignado: number | null;
  /** Cita textual verbatim de la fila-comentario que originó la inferencia. */
  comentarioOrigen: string;
  archivo: string;
  hoja: string;
  fila: number;
  decididoPor: string;
  fecha: string;
}

const COMENTARIO_JULIO_2026 = 'chispa. Dacota, indir  vendida';
const ARCHIVO_2026 = 'CHEO VETE 2026.xlsx';
const HOJA_JULIO_2026 = 'CHEQUEO JULIO 2026';
const FILA_JULIO_2026 = 46;
const DECIDIDO_POR = 'Santiago';
const FECHA = '2026-07-22';

/**
 * Ventas inferidas vigentes. Un solo comentario resuelto hasta ahora (D8);
 * agregar más filas aquí cuando el dueño resuelva alguno de los otros
 * comentarios de venta de la sección §8 del reporte.
 */
export const VENTAS_INFERIDAS: VentaInferida[] = [
  {
    nombre: 'CHISPA',
    numeroAsignado: 899,
    comentarioOrigen: COMENTARIO_JULIO_2026,
    archivo: ARCHIVO_2026,
    hoja: HOJA_JULIO_2026,
    fila: FILA_JULIO_2026,
    decididoPor: DECIDIDO_POR,
    fecha: FECHA,
  },
  {
    nombre: 'DACOTA',
    numeroAsignado: null,
    comentarioOrigen: COMENTARIO_JULIO_2026,
    archivo: ARCHIVO_2026,
    hoja: HOJA_JULIO_2026,
    fila: FILA_JULIO_2026,
    decididoPor: DECIDIDO_POR,
    fecha: FECHA,
  },
  {
    nombre: 'INDIRA',
    numeroAsignado: null,
    comentarioOrigen: COMENTARIO_JULIO_2026,
    archivo: ARCHIVO_2026,
    hoja: HOJA_JULIO_2026,
    fila: FILA_JULIO_2026,
    decididoPor: DECIDIDO_POR,
    fecha: FECHA,
  },
];
