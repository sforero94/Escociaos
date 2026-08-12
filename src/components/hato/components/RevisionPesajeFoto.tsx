// ARCHIVO: components/hato/components/RevisionPesajeFoto.tsx
// DESCRIPCIÓN: S5 de `docs/plan_hato_ronda_agosto_2026.md` -- la grilla de
// revisión del diff que devuelve `POST /hato/pesaje/foto`: una fila por
// vaca, una columna por semana con una fecha real ese mes, dos celdas
// editables por semana (AM/PM). Presentacional y puro (sin fetch, sin estado
// propio de red) -- el estado editable vive en `SubirPesajeFoto.tsx`, que es
// quien arma el payload del commit.
//
// Desde el ajuste del dueño de 2026-08-11 la grilla también deja AGREGAR y
// QUITAR filas, no solo editar celdas: el OCR "funciona de maravilla, pero
// puede fallar", y sin escape manual la única salida era volver a cargar
// todo. Las filas ya no se derivan del diff -- llegan por prop desde el
// contenedor, que es quien las muta (`utils/hato/revisionPesaje.ts`).
//
// Contratos que respeta, heredados de `ChequeoDiffReview.tsx` (gemelo del
// chequeo) y del módulo:
//   - Una celda `noConfiable` (el modelo dudó o no pudo leer) se marca
//     distinto de una celda genuinamente en blanco -- ambas muestran el
//     input vacío, pero solo la primera lleva el ícono de advertencia:
//     "sin dato, nunca 0" también aplica a NO CONFUNDIR los dos motivos.
//   - Filas que el modelo leyó pero no se pudieron anclar a ninguna vaca del
//     roster se muestran SIEMPRE que vengan -- ocultarlas es el fallo
//     silencioso que el módulo prohíbe.
//   - Las vacas del roster que no llegaron a la grilla NO se listan aparte:
//     son exactamente las que ofrece el selector "Agregar vaca", que además
//     de avisar deja hacer algo al respecto. Antes eran un aviso ámbar de
//     solo lectura, y ese fue el caso MONZA.

import { Fragment } from 'react';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { NumberInput } from '@/components/ui/number-input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatShortDate } from '@/utils/format';
import { SEMANAS_PESAJE, type SemanaPesaje } from '@/utils/importHato/ocrPesaje';
import { claveCeldaPesaje, type CeldaEditablePesaje, type FilaRevisionPesaje } from '@/utils/hato/revisionPesaje';
import type { FilaNoLeidaPesaje, PreviewPesajeRespuesta } from '../hooks/useSubirPesajeFoto';

// Reexportados para no obligar a los consumidores a conocer el módulo puro.
export { claveCeldaPesaje };
export type { CeldaEditablePesaje };

export interface RevisionPesajeFotoProps {
  resultado: PreviewPesajeRespuesta;
  filas: FilaRevisionPesaje[];
  /** Vacas del roster que NO están en la grilla -- el menú "Agregar vaca". */
  vacasDisponibles: FilaRevisionPesaje[];
  valores: Map<string, CeldaEditablePesaje>;
  onEditarCelda: (animalId: string, semana: SemanaPesaje, campo: 'am' | 'pm', valor: number | undefined) => void;
  onAgregarVaca: (vaca: FilaRevisionPesaje) => void;
  onQuitarVaca: (animalId: string) => void;
  editable: boolean;
}

export function RevisionPesajeFoto({
  resultado,
  filas,
  vacasDisponibles,
  valores,
  onEditarCelda,
  onAgregarVaca,
  onQuitarVaca,
  editable,
}: RevisionPesajeFotoProps) {
  const semanasConFecha = SEMANAS_PESAJE.filter((s) => resultado.fechasPorSemana[s] !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {filas.length} vaca{filas.length === 1 ? '' : 's'} en la planilla
        </p>

        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={vacasDisponibles.length === 0}>
                <Plus className="w-4 h-4 mr-1.5" />
                Agregar vaca
                {vacasDisponibles.length > 0 && (
                  <span className="ml-1.5 text-xs text-gray-500">({vacasDisponibles.length})</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              {vacasDisponibles.map((vaca) => (
                <DropdownMenuItem key={vaca.animalId} onClick={() => onAgregarVaca(vaca)}>
                  {vaca.nombre}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* El menú vacío ya se deshabilita solo; este texto explica POR QUÉ no
          hay nada que agregar, que es lo que responde la duda real ("¿están
          todas?"). */}
      {editable && vacasDisponibles.length === 0 && filas.length > 0 && (
        <p className="text-xs text-gray-500">Están todas las vacas de la planilla.</p>
      )}

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
                <th className="px-2 py-2 border-l border-gray-200" />
              </tr>
              <tr>
                <th className="sticky left-0 bg-gray-50" />
                {semanasConFecha.map((s) => (
                  <Fragment key={s}>
                    <th className="px-2 py-1 text-center text-xs font-medium text-gray-400 border-l border-gray-200">AM</th>
                    <th className="px-2 py-1 text-center text-xs font-medium text-gray-400">PM</th>
                  </Fragment>
                ))}
                <th className="border-l border-gray-200" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const bgFila = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
                return (
                  <tr key={fila.animalId} className={`border-t border-gray-100 ${bgFila}`}>
                    {/* Se repite explícitamente el mismo color de la fila para que
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
                    <td className="px-2 py-1 border-l border-gray-100 text-center">
                      {editable && (
                        <button
                          type="button"
                          onClick={() => onQuitarVaca(fila.animalId)}
                          className="text-gray-400 hover:text-gray-900"
                          aria-label={`Quitar a ${fila.nombre} de la planilla`}
                          title={`Quitar a ${fila.nombre} -- se borran los litros que tenga escritos`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filas.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center">
          <p className="text-sm text-gray-600">No hay vacas en la planilla.</p>
          {vacasDisponibles.length > 0 && (
            <p className="mt-1 text-xs text-gray-500">Usa &quot;Agregar vaca&quot; para armarla a mano.</p>
          )}
        </div>
      )}

      {resultado.ocr.filasNoLeidas.length > 0 && (
        <ListaAvisoPesaje
          titulo={`Filas que no se pudieron identificar (${resultado.ocr.filasNoLeidas.length})`}
          items={resultado.ocr.filasNoLeidas}
          render={(f: FilaNoLeidaPesaje) => `Foto ${f.pagina}: leyó "${f.nombreImpreso || '—'}" (${f.detalle})`}
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
