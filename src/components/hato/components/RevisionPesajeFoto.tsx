// ARCHIVO: components/hato/components/RevisionPesajeFoto.tsx
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- la grilla de
// revisión del diff que devuelve `POST /hato/pesaje/foto`: una fila por
// vaca reconocida, una columna por semana con una fecha real ese mes, dos
// celdas editables por semana (AM/PM). Presentacional y puro (sin fetch,
// sin estado propio de red) -- el estado editable vive en
// `SubirPesajeFoto.tsx`, que es quien arma el payload del commit.
//
// Contratos que respeta, heredados de `ChequeoDiffReview.tsx` (gemelo del
// chequeo) y del módulo:
//   - Una celda `noConfiable` (el modelo dudó o no pudo leer) se marca
//     distinto de una celda genuinamente en blanco -- ambas muestran el
//     input vacío, pero solo la primera lleva el ícono de advertencia:
//     "sin dato, nunca 0" también aplica a NO CONFUNDIR los dos motivos.
//   - Filas que el modelo leyó pero no se pudieron anclar a ninguna vaca del
//     roster, y vacas del roster que no aparecieron en ninguna foto, se
//     muestran SIEMPRE que vengan -- ocultarlas es el fallo silencioso que
//     el módulo prohíbe.

import { Fragment } from 'react';
import { AlertTriangle } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { formatShortDate } from '@/utils/format';
import { ordenarPorValor } from '@/utils/ordenarAnimalesHato';
import { SEMANAS_PESAJE, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';
import type {
  FilaNoLeidaPesaje,
  PreviewPesajeRespuesta,
  VacaSinLeerPesaje,
} from '../hooks/useSubirPesajeFoto';

export interface CeldaEditablePesaje {
  litrosAm: number | undefined;
  litrosPm: number | undefined;
  noConfiable: boolean;
}

/** Clave estable de una celda (vaca, semana) -- misma forma que usa
 * `SubirPesajeFoto.tsx` para indexar su estado editable. */
export function claveCeldaPesaje(animalId: string, semana: SemanaPesaje): string {
  return `${animalId}|${semana}`;
}

interface FilaRevision {
  animalId: string;
  nombre: string;
}

export interface RevisionPesajeFotoProps {
  resultado: PreviewPesajeRespuesta;
  valores: Map<string, CeldaEditablePesaje>;
  onEditarCelda: (animalId: string, semana: SemanaPesaje, campo: 'am' | 'pm', valor: number | undefined) => void;
  editable: boolean;
}

export function RevisionPesajeFoto({ resultado, valores, onEditarCelda, editable }: RevisionPesajeFotoProps) {
  const semanasConFecha = SEMANAS_PESAJE.filter((s) => resultado.fechasPorSemana[s] !== null);

  const filasMap = new Map<string, FilaRevision>();
  for (const celda of resultado.diff) {
    if (!filasMap.has(celda.animalId)) filasMap.set(celda.animalId, { animalId: celda.animalId, nombre: celda.nombre });
  }
  const filas = ordenarPorValor([...filasMap.values()], (f) => f.nombre, 'asc');

  return (
    <div className="space-y-4">
      {filas.length > 0 && (
        <div className="rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">
                  Nombre
                </th>
                {semanasConFecha.map((s) => (
                  <th key={s} colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide border-l border-gray-200">
                    Sem {s} · {formatShortDate(resultado.fechasPorSemana[s] as string)}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 bg-gray-50" />
                {semanasConFecha.map((s) => (
                  <Fragment key={s}>
                    <th className="px-2 py-1 text-center text-xs font-medium text-gray-400 border-l border-gray-200">AM</th>
                    <th className="px-2 py-1 text-center text-xs font-medium text-gray-400">PM</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const bgFila = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                return (
                  <tr key={fila.animalId} className={`border-t border-gray-100 ${bgFila}`}>
                    {/* `bg-inherit` está muerto en el build de Tailwind congelado --
                        se repite explícitamente el mismo color de la fila para que
                        la columna sticky no se vea transparente al desplazar. */}
                    <td className={`px-3 py-1 whitespace-nowrap sticky left-0 ${bgFila}`}>{fila.nombre}</td>
                    {semanasConFecha.map((s) => {
                      const clave = claveCeldaPesaje(fila.animalId, s);
                      const valor = valores.get(clave);
                      return (
                        <Fragment key={clave}>
                          <td className="px-2 py-1 border-l border-gray-100">
                            <div className="flex items-center gap-1">
                              {valor?.noConfiable && (
                                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" aria-label="El modelo no leyó esta celda con seguridad -- revise el papel" />
                              )}
                              <NumberInput
                                value={valor?.litrosAm}
                                onChange={(v) => onEditarCelda(fila.animalId, s, 'am', v)}
                                decimals={1}
                                placeholder="—"
                                disabled={!editable}
                                className="w-16 text-right text-xs"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <NumberInput
                              value={valor?.litrosPm}
                              onChange={(v) => onEditarCelda(fila.animalId, s, 'pm', v)}
                              decimals={1}
                              placeholder="—"
                              disabled={!editable}
                              className="w-16 text-right text-xs"
                            />
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resultado.ocr.vacasSinLeer.length > 0 && (
        <ListaAvisoPesaje
          titulo={`No aparecieron en ninguna foto (${resultado.ocr.vacasSinLeer.length})`}
          items={resultado.ocr.vacasSinLeer}
          render={(v: VacaSinLeerPesaje) => v.nombre}
        />
      )}

      {resultado.ocr.filasNoLeidas.length > 0 && (
        <ListaAvisoPesaje
          titulo={`Filas que no se pudieron identificar (${resultado.ocr.filasNoLeidas.length})`}
          items={resultado.ocr.filasNoLeidas}
          render={(f: FilaNoLeidaPesaje) => `Página ${f.pagina}: leyó "${f.nombreImpreso || '—'}" (${f.detalle})`}
        />
      )}
    </div>
  );
}

function ListaAvisoPesaje<T>({ titulo, items, render }: { titulo: string; items: T[]; render: (item: T) => string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <p className="font-medium text-amber-700">{titulo}</p>
      <ul className="text-xs text-amber-700 space-y-1 mt-1 list-disc list-inside">
        {items.map((item, i) => (
          <li key={i}>{render(item)}</li>
        ))}
      </ul>
    </div>
  );
}
