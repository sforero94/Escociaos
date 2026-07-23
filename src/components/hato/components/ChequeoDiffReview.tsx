// ARCHIVO: components/hato/components/ChequeoDiffReview.tsx
// DESCRIPCIÓN: Muestra el diff que devuelve
// `POST /make-server-1ccce916/hato/chequeo/preview` (B0/V10) para que
// alguien lo revise ANTES de comprometer -- el endpoint nunca escribe
// (`src/supabase/functions/server/hato-chequeo-preview.ts`). Agrupa las
// filas por clasificación (`nuevo`/`cambio`/`sin_cambio`/`no_reconocido`,
// `utils/importHato/diffChequeo.ts`), muestra el resumen, las colisiones de
// chapeta dentro de la misma hoja y los issues de normalización de cada
// fila -- ninguno se oculta, "ambiguo -> revisión, nunca en silencio".
//
// ⚠️ El botón "Aprobar y guardar" está deshabilitado a propósito -- ver el
// comentario largo en `hooks/useSubirChequeoExcel.ts` y el reporte de la
// sesión S4: la respuesta actual del endpoint no trae la fila normalizada
// completa (`raw`/`sx`/fechas) que se necesita para escribir
// `hato_chequeo_vacas` sin perder la capa cruda ni para derivar
// `hato_eventos` con `descomponerSX`. Escribir con los datos parciales que
// SÍ llegan violaría esa regla en vez de dejarla pendiente -- así que se
// deja pendiente, explícitamente, en vez de fingir que funciona.

import { AlertTriangle, Info } from 'lucide-react';
import { EstadoChip } from './EstadoChip';
import { chipClasificacionDiff } from '@/utils/hatoUi';
import type { PreviewChequeoRespuesta } from '../hooks/useSubirChequeoExcel';
import type { FilaDiffChequeo, ClasificacionFilaDiff } from '@/utils/importHato/diffChequeo';

const ORDEN: ClasificacionFilaDiff[] = ['no_reconocido', 'cambio', 'nuevo', 'sin_cambio'];
const TITULO: Record<ClasificacionFilaDiff, string> = {
  no_reconocido: 'No reconocidas — requieren revisión manual',
  cambio: 'Con cambios',
  nuevo: 'Nuevas (chapeta sin ficha todavía)',
  sin_cambio: 'Sin cambios',
};

function FilaDiffRow({ fila }: { fila: FilaDiffChequeo }) {
  return (
    <div className="border-t border-gray-100 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm text-gray-900">
          {fila.numero != null ? `#${fila.numero}` : 'Sin número'} {fila.nombre ?? ''}
        </span>
        <EstadoChip chip={chipClasificacionDiff(fila.clasificacion)} />
        {fila.numeroEsProvisional && (
          <span className="text-xs text-amber-600">número provisional — no es chapeta física</span>
        )}
      </div>
      {fila.motivoNoReconocido && (
        <p className="text-xs text-red-600 mt-1">{fila.motivoNoReconocido}</p>
      )}
      {fila.diferencias.length > 0 && (
        <ul className="text-xs text-gray-600 mt-1 space-y-1">
          {fila.diferencias.map((d) => (
            <li key={d.campo}>
              <span className="font-medium">{d.campo}:</span>{' '}
              {String(d.anterior ?? '—')} → <span className="text-amber-700">{String(d.nuevo ?? '—')}</span>
            </li>
          ))}
        </ul>
      )}
      {fila.issues.length > 0 && (
        <ul className="text-xs text-gray-400 mt-1 space-y-1">
          {fila.issues.map((issue, i) => (
            <li key={i}>⚠ {issue.motivo}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChequeoDiffReview({ resultado }: { resultado: PreviewChequeoRespuesta }) {
  const { resumen, colisionesEnHoja, filas } = resultado.diffChequeos;
  const porClasificacion = ORDEN.map((clasificacion) => ({
    clasificacion,
    filas: filas.filter((f) => f.clasificacion === clasificacion),
  })).filter((grupo) => grupo.filas.length > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.nuevos}</p>
          <p className="text-xs text-gray-500">Nuevas</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.cambios}</p>
          <p className="text-xs text-gray-500">Con cambios</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-gray-900">{resumen.sinCambio}</p>
          <p className="text-xs text-gray-500">Sin cambios</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center">
          <p className="text-lg font-semibold text-red-700">{resumen.noReconocidos}</p>
          <p className="text-xs text-red-600">No reconocidas</p>
        </div>
      </div>

      {colisionesEnHoja.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Chapetas repetidas en esta hoja con nombres distintos</p>
            <ul className="mt-1 space-y-1">
              {colisionesEnHoja.map((c) => (
                <li key={c.numero}>#{c.numero}: {c.nombres.join(' / ')}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Ninguna de las filas involucradas se adjudica sola — revisar manualmente.</p>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Este es un diff de revisión — el archivo todavía NO se guardó en el sistema. La aprobación y escritura
          automática está pendiente de una decisión de arquitectura (ver el reporte de la sesión).
        </p>
      </div>

      <div className="space-y-4">
        {porClasificacion.map((grupo) => (
          <div key={grupo.clasificacion} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{TITULO[grupo.clasificacion]} ({grupo.filas.length})</h3>
            </div>
            <div>
              {grupo.filas.map((fila) => (
                <FilaDiffRow key={fila.fila} fila={fila} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {(resultado.terneras.length > 0 || resultado.subtablas.length > 0) && (
        <p className="text-xs text-gray-500">
          Además se leyeron {resultado.terneras.length} filas de TERNERAS y {resultado.subtablas.length} de sub-tablas
          embebidas — fuera del alcance de este diff (dominio distinto), se preservan para revisión aparte.
        </p>
      )}
    </div>
  );
}
